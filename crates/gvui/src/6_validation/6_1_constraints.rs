//! # Step 6.1 (Phase 9): Constraint verification
//!
//! Every invariant checked here is *guaranteed by construction* by an earlier phase:
//! Brandes-Koepf separations forbid node overlap, lane demand reserves the space every routed
//! segment needs, and label items reserve badge area inside the layered graph itself. So a
//! diagnostic produced by this module is a **bug report about the engine**, never an input to a
//! score. v2 has no objective function to feed and no retry loop to trigger, which is exactly why
//! these checks may be exhaustive and strict.
//!
//! The one thing that must not regress is cost. v1's validator was O(N^2) over nodes and O(E^2)
//! over routes with no spatial index at all, which is why it could not be run outside a debug
//! build. [`SpatialHash`] reduces every pairwise question to its local neighbourhood, so the whole
//! pass is linear in practice and can stay on by default.

use std::collections::{HashMap, HashSet};

use crate::config::CustomLayoutConfig;
use crate::geometry::{
    is_finite_point, is_orthogonal_segment, point_on_rect_boundary, rects_overlap_area,
    segment_intersects_rect_interior,
};
use crate::types::{
    BadgePlacement, EdgeStyle, LayoutDiagnostic, PortRef, PositionedNode, Rect, RoutedPath, Segment,
};

/// Upper bound on formatted diagnostics per violation code.
///
/// A structurally broken layout can violate one invariant thousands of times; formatting all of
/// them would make the failure path cost more than the layout. The cap keeps the report readable
/// and bounds `format!` calls. Counts are unaffected — [`crate::types::LayoutMetrics`] carries the
/// full totals.
const MAX_REPORTS_PER_CODE: usize = 32;

/// Largest number of grid cells one rectangle may occupy along a single axis before the hash gives
/// up on indexing it and files it as "always a candidate".
const MAX_AXIS_CELLS: i64 = 512;

/// Clamp applied to a cell coordinate before it is narrowed to `i64`, so that a pathological but
/// finite coordinate cannot produce an out-of-range cast.
const CELL_INDEX_LIMIT: f64 = 1.0e7;

// =============================================================================================
// Spatial index
// =============================================================================================

/// A uniform spatial hash over axis-aligned rectangles.
///
/// Two properties matter to callers:
///
/// - [`query`](SpatialHash::query) **may over-report and must never under-report**. Everything the
///   index cannot bucket (a non-finite rectangle, or one spanning more than [`MAX_AXIS_CELLS`]
///   cells) is returned by every query rather than being dropped. Callers therefore still have to
///   run the exact predicate on each candidate — the hash only shrinks the candidate set.
/// - Results are returned **sorted and deduplicated**, so iteration order never depends on the
///   backing `HashMap`. Determinism is a hard requirement of this engine and the index is on the
///   decision path of every constraint check.
pub struct SpatialHash {
    /// Edge length of one square cell. Always finite and > 0.
    cell: f64,
    buckets: HashMap<(i64, i64), Vec<u32>>,
    /// Ids that could not be bucketed; candidates for every query.
    oversized: Vec<u32>,
    /// Every inserted id, in insertion order. Used as the answer to an unbucketable query.
    all: Vec<u32>,
}

impl SpatialHash {
    /// Creates an empty index with square cells of side `cell`.
    ///
    /// A non-finite or non-positive `cell` is replaced by `1.0` rather than rejected: the index is
    /// a performance structure, and degrading to "many tiny cells" is always safe, whereas
    /// returning an error would force every caller to handle an impossible branch.
    pub fn new(cell: f64) -> Self {
        let cell = if cell.is_finite() && cell > 0.0 {
            cell
        } else {
            1.0
        };
        SpatialHash {
            cell,
            buckets: HashMap::new(),
            oversized: Vec::new(),
            all: Vec::new(),
        }
    }

    /// Indexes `rect` under `id`. Ids are opaque; duplicates are permitted and are reported once.
    pub fn insert(&mut self, id: u32, rect: &Rect) {
        self.all.push(id);
        match cell_span(rect, self.cell) {
            Some((x0, x1, y0, y1)) => {
                for cx in x0..=x1 {
                    for cy in y0..=y1 {
                        self.buckets.entry((cx, cy)).or_default().push(id);
                    }
                }
            }
            None => self.oversized.push(id),
        }
    }

    /// Candidate ids whose cells intersect `rect`. May over-report; never under-reports.
    ///
    /// The returned vector is sorted ascending and deduplicated.
    pub fn query(&self, rect: &Rect) -> Vec<u32> {
        let mut out: Vec<u32> = match cell_span(rect, self.cell) {
            Some((x0, x1, y0, y1)) => {
                let mut v: Vec<u32> = Vec::new();
                for cx in x0..=x1 {
                    for cy in y0..=y1 {
                        if let Some(bucket) = self.buckets.get(&(cx, cy)) {
                            v.extend_from_slice(bucket);
                        }
                    }
                }
                v.extend_from_slice(&self.oversized);
                v
            }
            // An unbucketable query rectangle degrades to a full scan, which over-reports (allowed)
            // instead of missing overlaps (not allowed).
            None => self.all.clone(),
        };
        out.sort_unstable();
        out.dedup();
        out
    }

    /// Number of ids inserted so far, counting duplicates.
    pub fn len(&self) -> usize {
        self.all.len()
    }

    /// True when nothing has been inserted.
    pub fn is_empty(&self) -> bool {
        self.all.is_empty()
    }
}

/// Inclusive cell range covered by `rect`, or `None` when the rectangle is non-finite or spans more
/// than [`MAX_AXIS_CELLS`] cells on either axis.
fn cell_span(rect: &Rect, cell: f64) -> Option<(i64, i64, i64, i64)> {
    let (x0, x1) = axis_cells(rect.x, rect.x + rect.width, cell)?;
    let (y0, y1) = axis_cells(rect.y, rect.y + rect.height, cell)?;
    Some((x0, x1, y0, y1))
}

/// Inclusive cell index range covering `[min(a, b), max(a, b)]`. Negative extents are normalized so
/// a caller-supplied rectangle with negative width still indexes correctly.
fn axis_cells(a: f64, b: f64, cell: f64) -> Option<(i64, i64)> {
    if !a.is_finite() || !b.is_finite() {
        return None;
    }
    let lo = a.min(b);
    let hi = a.max(b);
    let c0 = (lo / cell)
        .floor()
        .clamp(-CELL_INDEX_LIMIT, CELL_INDEX_LIMIT) as i64;
    let c1 = (hi / cell)
        .floor()
        .clamp(-CELL_INDEX_LIMIT, CELL_INDEX_LIMIT) as i64;
    if c1 - c0 + 1 > MAX_AXIS_CELLS {
        return None;
    }
    Some((c0, c1))
}

/// Picks a cell size from the mean extent of a population of boxes.
///
/// Cells sized like the objects being indexed keep the expected candidate count per query O(1);
/// much smaller cells cost iteration, much larger ones cost false candidates.
fn cell_for(dims: impl Iterator<Item = (f64, f64)>) -> f64 {
    let mut sum_w = 0.0;
    let mut sum_h = 0.0;
    let mut n = 0usize;
    for (w, h) in dims {
        if w.is_finite() && h.is_finite() {
            sum_w += w.abs();
            sum_h += h.abs();
            n += 1;
        }
    }
    if n == 0 {
        return 128.0;
    }
    let mean = (sum_w / n as f64).max(sum_h / n as f64);
    if !mean.is_finite() || mean <= 1.0 {
        1.0
    } else {
        mean.min(1.0e6)
    }
}

/// The box of a positioned node.
pub fn node_rect(n: &PositionedNode) -> Rect {
    Rect {
        x: n.x,
        y: n.y,
        width: n.width,
        height: n.height,
    }
}

/// True when every field of `r` is finite.
pub fn rect_is_finite(r: &Rect) -> bool {
    r.x.is_finite() && r.y.is_finite() && r.width.is_finite() && r.height.is_finite()
}

/// Builds a spatial index over node boxes, keyed by index into `nodes`.
pub fn build_node_index(nodes: &[PositionedNode]) -> SpatialHash {
    let mut hash = SpatialHash::new(cell_for(nodes.iter().map(|n| (n.width, n.height))));
    for (i, n) in nodes.iter().enumerate() {
        hash.insert(i as u32, &node_rect(n));
    }
    hash
}

/// Builds a spatial index over badge boxes, keyed by index into `badges`.
pub fn build_badge_index(badges: &[BadgePlacement]) -> SpatialHash {
    let mut hash = SpatialHash::new(cell_for(
        badges.iter().map(|b| (b.rect.width, b.rect.height)),
    ));
    for (i, b) in badges.iter().enumerate() {
        hash.insert(i as u32, &b.rect);
    }
    hash
}

// =============================================================================================
// Scanners
//
// These exist as callback-driven scans rather than as `-> Vec<Violation>` so that
// `check_constraints` (which needs ids and messages) and `compute_metrics` (which needs only
// counts) can share one implementation without either allocating for the other's needs.
// =============================================================================================

/// Reports every unordered pair of overlapping nodes exactly once, as `(i, j)` with `i < j`,
/// ordered by `i` then `j`. Overlap is strict: sharing a boundary is not an overlap.
pub fn scan_node_node_overlaps(
    nodes: &[PositionedNode],
    epsilon: f64,
    mut on_hit: impl FnMut(usize, usize),
) {
    let hash = build_node_index(nodes);
    for (i, ni) in nodes.iter().enumerate() {
        let ri = node_rect(ni);
        if !rect_is_finite(&ri) {
            continue;
        }
        for cand in hash.query(&ri) {
            let j = cand as usize;
            if j <= i {
                continue;
            }
            let Some(nj) = nodes.get(j) else { continue };
            let rj = node_rect(nj);
            if !rect_is_finite(&rj) {
                continue;
            }
            if rects_overlap_area(&ri, &rj, epsilon) {
                on_hit(i, j);
            }
        }
    }
}

/// Reports every `(route index, segment index, node index)` where a routed segment passes through
/// a node's interior.
///
/// Only axis-aligned segments can be detected — [`segment_intersects_rect_interior`] is an
/// orthogonal predicate. That is not a gap in coverage: the orthogonal edge styles are the ones
/// this invariant is claimed for, and diagonal styles (`Spline`, `Straight`) deliberately trade
/// node clearance for directness.
///
/// A route's own endpoint nodes are *not* excluded. A correctly built polyline leaves its port
/// outward along the boundary normal, so it touches the boundary without entering the interior;
/// excluding those nodes would blind the check to exactly the failure it should catch.
pub fn scan_edge_node_penetrations(
    nodes: &[PositionedNode],
    routes: &[RoutedPath],
    epsilon: f64,
    mut on_hit: impl FnMut(usize, usize, usize),
) {
    if nodes.is_empty() {
        return;
    }
    let hash = build_node_index(nodes);
    for (ri, route) in routes.iter().enumerate() {
        if route.points.len() < 2 {
            continue;
        }
        for k in 0..route.points.len() - 1 {
            let seg = Segment {
                a: route.points[k],
                b: route.points[k + 1],
            };
            if !is_finite_point(&seg.a) || !is_finite_point(&seg.b) {
                continue;
            }
            let bb = segment_bbox(&seg, epsilon);
            for cand in hash.query(&bb) {
                let ni = cand as usize;
                let Some(node) = nodes.get(ni) else { continue };
                let nr = node_rect(node);
                if !rect_is_finite(&nr) {
                    continue;
                }
                if segment_intersects_rect_interior(&seg, &nr, epsilon) {
                    on_hit(ri, k, ni);
                }
            }
        }
    }
}

/// Reports every `(badge index, node index)` where a badge box overlaps a node box.
pub fn scan_badge_node_overlaps(
    badges: &[BadgePlacement],
    nodes: &[PositionedNode],
    epsilon: f64,
    mut on_hit: impl FnMut(usize, usize),
) {
    if nodes.is_empty() || badges.is_empty() {
        return;
    }
    let hash = build_node_index(nodes);
    for (bi, badge) in badges.iter().enumerate() {
        if !rect_is_finite(&badge.rect) {
            continue;
        }
        for cand in hash.query(&badge.rect) {
            let ni = cand as usize;
            let Some(node) = nodes.get(ni) else { continue };
            let nr = node_rect(node);
            if !rect_is_finite(&nr) {
                continue;
            }
            if rects_overlap_area(&badge.rect, &nr, epsilon) {
                on_hit(bi, ni);
            }
        }
    }
}

/// Reports every unordered pair of overlapping badges exactly once, as `(i, j)` with `i < j`.
pub fn scan_badge_badge_overlaps(
    badges: &[BadgePlacement],
    epsilon: f64,
    mut on_hit: impl FnMut(usize, usize),
) {
    let hash = build_badge_index(badges);
    for (i, bi) in badges.iter().enumerate() {
        if !rect_is_finite(&bi.rect) {
            continue;
        }
        for cand in hash.query(&bi.rect) {
            let j = cand as usize;
            if j <= i {
                continue;
            }
            let Some(bj) = badges.get(j) else { continue };
            if !rect_is_finite(&bj.rect) {
                continue;
            }
            if rects_overlap_area(&bi.rect, &bj.rect, epsilon) {
                on_hit(i, j);
            }
        }
    }
}

/// Reports every unordered pair of *different* routes that draw an axis-aligned run along the same
/// line with overlapping extent, as `(route i, route j)` with `i < j`.
///
/// This is the failure the geometric crossing count cannot see. Two edges sharing a line do not
/// *intersect* — [`super::super::step3_crossing_minimization::crossing_counting`] reports proper
/// intersections only, and rightly so — they **merge**, and the reader loses one of them entirely.
/// It is also strictly worse than a crossing, which at least stays legible.
///
/// Runs are compared in a single line-keyed pass rather than all-pairs: two runs can only conflict
/// when they share an orientation and a coordinate, so bucketing on the rounded coordinate reduces
/// the scan to the runs actually in contention. The bucket key is quantised to `epsilon`, and each
/// run is probed against its own bucket and the two neighbouring ones so a pair straddling a bucket
/// boundary is not missed.
///
/// A route is never compared with itself: a polyline that doubles back along its own run is a
/// corner-reduction artefact, not two edges merging.
pub fn scan_collinear_edge_overlaps(
    routes: &[RoutedPath],
    epsilon: f64,
    mut on_hit: impl FnMut(usize, usize),
) {
    let eps = if epsilon.is_finite() && epsilon > 0.0 {
        epsilon
    } else {
        1e-9
    };
    // Bucket width is deliberately coarser than `eps`: it only has to be fine enough that two runs
    // in the same bucket are worth comparing, and the +/-1 probe covers the rest.
    let quantum = (eps * 100.0).max(0.5);

    /// `(orientation, line coordinate, run start, run end, route)`.
    struct Run {
        vertical: bool,
        line: f64,
        lo: f64,
        hi: f64,
        route: usize,
    }

    let mut runs: Vec<Run> = Vec::new();
    for (ri, route) in routes.iter().enumerate() {
        for w in route.points.windows(2) {
            let (a, b) = (w[0], w[1]);
            if !is_finite_point(&a) || !is_finite_point(&b) {
                continue;
            }
            let horizontal = (a.y - b.y).abs() <= eps;
            let vertical = (a.x - b.x).abs() <= eps;
            // A degenerate point is neither; a diagonal is both false and skipped, which matches
            // the orthogonal-only scope of every other constraint scan here.
            let (line, lo, hi) = match (horizontal, vertical) {
                (true, false) => (a.y, a.x.min(b.x), a.x.max(b.x)),
                (false, true) => (a.x, a.y.min(b.y), a.y.max(b.y)),
                _ => continue,
            };
            if hi - lo <= eps {
                continue;
            }
            runs.push(Run {
                vertical,
                line,
                lo,
                hi,
                route: ri,
            });
        }
    }

    let mut buckets: HashMap<(bool, i64), Vec<usize>> = HashMap::new();
    for (i, run) in runs.iter().enumerate() {
        let key = (run.vertical, (run.line / quantum).round() as i64);
        buckets.entry(key).or_default().push(i);
    }

    let mut seen: HashSet<(usize, usize)> = HashSet::new();
    for (i, run) in runs.iter().enumerate() {
        let centre = (run.line / quantum).round() as i64;
        for delta in -1..=1 {
            let Some(bucket) = buckets.get(&(run.vertical, centre + delta)) else {
                continue;
            };
            for &j in bucket {
                if j <= i {
                    continue;
                }
                let other = &runs[j];
                if other.route == run.route {
                    continue;
                }
                if (other.line - run.line).abs() > eps {
                    continue;
                }
                if run.lo >= other.hi - eps || other.lo >= run.hi - eps {
                    continue;
                }
                let pair = if run.route < other.route {
                    (run.route, other.route)
                } else {
                    (other.route, run.route)
                };
                if seen.insert(pair) {
                    on_hit(pair.0, pair.1);
                }
            }
        }
    }
}

/// Bounding box of a segment, grown by `epsilon` so that a candidate whose interior the segment
/// only just enters is still retrieved.
fn segment_bbox(s: &Segment, epsilon: f64) -> Rect {
    let min_x = s.a.x.min(s.b.x) - epsilon;
    let max_x = s.a.x.max(s.b.x) + epsilon;
    let min_y = s.a.y.min(s.b.y) - epsilon;
    let max_y = s.a.y.max(s.b.y) + epsilon;
    Rect {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
    }
}

// =============================================================================================
// The check
// =============================================================================================

/// Verifies the invariants v2 guarantees by construction. Any violation is a BUG REPORT, not a
/// score — v2 has no objective function to feed.
///
/// `expected_edge_ids` is the full set of edge ids the caller believes were routed, in the order it
/// wants them reported; every id missing from `routes` yields a `MISSING_ROUTE`.
///
/// Every diagnostic has severity `"error"`: there is no such thing as a tolerable violation here.
/// At most [`MAX_REPORTS_PER_CODE`] diagnostics are produced per code, and `format!` runs only when
/// a violation actually fires — never once per candidate pair.
///
/// Diagnostics are emitted check-by-check in a fixed order, and within a check in slice order, so
/// the output is byte-identical across processes for identical input.
pub fn check_constraints(
    nodes: &[PositionedNode],
    routes: &[RoutedPath],
    badges: &[BadgePlacement],
    expected_edge_ids: &[String],
    config: &CustomLayoutConfig,
) -> Vec<LayoutDiagnostic> {
    let eps = config.epsilon;
    let mut out: Vec<LayoutDiagnostic> = Vec::new();

    // ---- NON_FINITE_COORDINATE ----------------------------------------------------------------
    // Runs first: a NaN poisons every comparison below, so knowing it is present makes the rest of
    // the report interpretable.
    let mut non_finite = 0usize;
    for n in nodes {
        if !(n.x.is_finite() && n.y.is_finite() && n.width.is_finite() && n.height.is_finite()) {
            if non_finite < MAX_REPORTS_PER_CODE {
                out.push(LayoutDiagnostic::error(
                    "NON_FINITE_COORDINATE",
                    format!("Node '{}' has a non-finite box", n.id),
                    vec![n.id.clone()],
                ));
            }
            non_finite += 1;
        }
    }
    for r in routes {
        let bad_point = r.points.iter().any(|p| !is_finite_point(p));
        let bad_port = !port_is_finite(&r.source_port) || !port_is_finite(&r.target_port);
        if bad_point || bad_port {
            if non_finite < MAX_REPORTS_PER_CODE {
                out.push(LayoutDiagnostic::error(
                    "NON_FINITE_COORDINATE",
                    format!("Edge '{}' has a non-finite coordinate", r.edge_id),
                    vec![r.edge_id.clone()],
                ));
            }
            non_finite += 1;
        }
    }
    for b in badges {
        let bad = !rect_is_finite(&b.rect)
            || !is_finite_point(&b.anchor_point)
            || b.leader_points
                .as_ref()
                .is_some_and(|pts| pts.iter().any(|p| !is_finite_point(p)));
        if bad {
            if non_finite < MAX_REPORTS_PER_CODE {
                out.push(LayoutDiagnostic::error(
                    "NON_FINITE_COORDINATE",
                    format!("Badge for edge '{}' has a non-finite coordinate", b.edge_id),
                    vec![b.edge_id.clone()],
                ));
            }
            non_finite += 1;
        }
    }

    // ---- NODE_NODE_OVERLAP --------------------------------------------------------------------
    let mut reported = 0usize;
    scan_node_node_overlaps(nodes, eps, |i, j| {
        if reported < MAX_REPORTS_PER_CODE {
            if let (Some(a), Some(b)) = (nodes.get(i), nodes.get(j)) {
                out.push(LayoutDiagnostic::error(
                    "NODE_NODE_OVERLAP",
                    format!("Nodes '{}' and '{}' overlap", a.id, b.id),
                    vec![a.id.clone(), b.id.clone()],
                ));
            }
        }
        reported += 1;
    });

    // ---- EDGE_NODE_PENETRATION ----------------------------------------------------------------
    reported = 0;
    scan_edge_node_penetrations(nodes, routes, eps, |ri, seg, ni| {
        if reported < MAX_REPORTS_PER_CODE {
            if let (Some(r), Some(n)) = (routes.get(ri), nodes.get(ni)) {
                out.push(LayoutDiagnostic::error(
                    "EDGE_NODE_PENETRATION",
                    format!(
                        "Edge '{}' segment {} passes through the interior of node '{}'",
                        r.edge_id, seg, n.id
                    ),
                    vec![r.edge_id.clone(), n.id.clone()],
                ));
            }
        }
        reported += 1;
    });

    // ---- BADGE_NODE_OVERLAP -------------------------------------------------------------------
    reported = 0;
    scan_badge_node_overlaps(badges, nodes, eps, |bi, ni| {
        if reported < MAX_REPORTS_PER_CODE {
            if let (Some(b), Some(n)) = (badges.get(bi), nodes.get(ni)) {
                out.push(LayoutDiagnostic::error(
                    "BADGE_NODE_OVERLAP",
                    format!("Badge for edge '{}' overlaps node '{}'", b.edge_id, n.id),
                    vec![b.edge_id.clone(), n.id.clone()],
                ));
            }
        }
        reported += 1;
    });

    // ---- BADGE_BADGE_OVERLAP ------------------------------------------------------------------
    reported = 0;
    scan_badge_badge_overlaps(badges, eps, |i, j| {
        if reported < MAX_REPORTS_PER_CODE {
            if let (Some(a), Some(b)) = (badges.get(i), badges.get(j)) {
                out.push(LayoutDiagnostic::error(
                    "BADGE_BADGE_OVERLAP",
                    format!(
                        "Badges for edges '{}' and '{}' overlap",
                        a.edge_id, b.edge_id
                    ),
                    vec![a.edge_id.clone(), b.edge_id.clone()],
                ));
            }
        }
        reported += 1;
    });

    // ---- NON_ORTHOGONAL_SEGMENT ---------------------------------------------------------------
    // Only meaningful for the axis-aligned styles. `Spline` and `Straight` are diagonal by design;
    // `Octilinear` emits a 45-degree chamfer in place of each corner it was able to cut, which is
    // the whole point of that style and not a defect.
    if !matches!(
        config.edge_style,
        EdgeStyle::Spline | EdgeStyle::Straight | EdgeStyle::Octilinear
    ) {
        reported = 0;
        for r in routes {
            if r.points.len() < 2 {
                continue;
            }
            for k in 0..r.points.len() - 1 {
                let seg = Segment {
                    a: r.points[k],
                    b: r.points[k + 1],
                };
                if !is_finite_point(&seg.a) || !is_finite_point(&seg.b) {
                    continue;
                }
                if !is_orthogonal_segment(&seg, eps) {
                    if reported < MAX_REPORTS_PER_CODE {
                        out.push(LayoutDiagnostic::error(
                            "NON_ORTHOGONAL_SEGMENT",
                            format!(
                                "Edge '{}' segment {} is not axis-aligned (dx={:.4}, dy={:.4})",
                                r.edge_id,
                                k,
                                seg.b.x - seg.a.x,
                                seg.b.y - seg.a.y
                            ),
                            vec![r.edge_id.clone()],
                        ));
                    }
                    reported += 1;
                }
            }
        }
    }

    // ---- ENDPOINT_OFF_BOUNDARY ----------------------------------------------------------------
    let mut rect_of_node: HashMap<&str, Rect> = HashMap::with_capacity(nodes.len());
    for n in nodes {
        rect_of_node.insert(n.id.as_str(), node_rect(n));
    }
    reported = 0;
    for r in routes {
        for (which, port) in [("source", &r.source_port), ("target", &r.target_port)] {
            let on_boundary = match rect_of_node.get(port.node_id.as_str()) {
                Some(rect) => {
                    rect_is_finite(rect)
                        && is_finite_point(&port.point)
                        && point_on_rect_boundary(&port.point, rect, eps)
                }
                None => false,
            };
            if !on_boundary {
                if reported < MAX_REPORTS_PER_CODE {
                    out.push(LayoutDiagnostic::error(
                        "ENDPOINT_OFF_BOUNDARY",
                        format!(
                            "Edge '{}' {} port ({:.3}, {:.3}) is not on the boundary of node '{}'",
                            r.edge_id, which, port.point.x, port.point.y, port.node_id
                        ),
                        vec![r.edge_id.clone(), port.node_id.clone()],
                    ));
                }
                reported += 1;
            }
        }
    }

    // ---- MISSING_ROUTE ------------------------------------------------------------------------
    let routed: HashSet<&str> = routes.iter().map(|r| r.edge_id.as_str()).collect();
    reported = 0;
    for id in expected_edge_ids {
        if !routed.contains(id.as_str()) {
            if reported < MAX_REPORTS_PER_CODE {
                out.push(LayoutDiagnostic::error(
                    "MISSING_ROUTE",
                    format!("Edge '{}' has no route", id),
                    vec![id.clone()],
                ));
            }
            reported += 1;
        }
    }

    out
}

/// True when both the boundary point and the outward stub of a port are finite.
fn port_is_finite(p: &PortRef) -> bool {
    is_finite_point(&p.point) && is_finite_point(&p.stub)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Point, Side};

    /// Deterministic pseudo-random source. `rand` is not a dependency and determinism is a hard
    /// requirement, so the tests carry their own generator.
    struct Lcg(u64);

    impl Lcg {
        fn next_unit(&mut self) -> f64 {
            self.0 = self
                .0
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            ((self.0 >> 11) as f64) / ((1u64 << 53) as f64)
        }
        fn range(&mut self, lo: f64, hi: f64) -> f64 {
            lo + self.next_unit() * (hi - lo)
        }
    }

    fn cfg() -> CustomLayoutConfig {
        CustomLayoutConfig::default()
    }

    fn node(id: &str, x: f64, y: f64, w: f64, h: f64) -> PositionedNode {
        PositionedNode {
            id: id.to_string(),
            label: None,
            x,
            y,
            width: w,
            height: h,
            rank: 0,
            order: 0,
        }
    }

    fn port(node_id: &str, side: Side, p: Point) -> PortRef {
        let n = side.normal();
        PortRef {
            node_id: node_id.to_string(),
            side,
            index: 0,
            point: p,
            stub: Point {
                x: p.x + n.x * 20.0,
                y: p.y + n.y * 20.0,
            },
        }
    }

    fn badge(edge_id: &str, x: f64, y: f64, w: f64, h: f64) -> BadgePlacement {
        BadgePlacement {
            edge_id: edge_id.to_string(),
            label: "L".to_string(),
            rect: Rect {
                x,
                y,
                width: w,
                height: h,
            },
            anchor_point: Point { x, y },
            leader_points: None,
        }
    }

    /// Two stacked nodes with a straight orthogonal route between their facing ports.
    fn clean_layout() -> (Vec<PositionedNode>, Vec<RoutedPath>) {
        let nodes = vec![
            node("a", 0.0, 0.0, 100.0, 50.0),
            node("b", 0.0, 200.0, 100.0, 50.0),
        ];
        let src = Point { x: 50.0, y: 50.0 };
        let tgt = Point { x: 50.0, y: 200.0 };
        let routes = vec![RoutedPath {
            edge_id: "e0".to_string(),
            points: vec![src, tgt],
            source_port: port("a", Side::Bottom, src),
            target_port: port("b", Side::Top, tgt),
        }];
        (nodes, routes)
    }

    #[test]
    fn spatial_hash_never_under_reports() {
        let mut rng = Lcg(0x5eed_1234);
        let rects: Vec<Rect> = (0..300)
            .map(|_| Rect {
                x: rng.range(-500.0, 500.0),
                y: rng.range(-500.0, 500.0),
                width: rng.range(1.0, 90.0),
                height: rng.range(1.0, 90.0),
            })
            .collect();

        let mut hash = SpatialHash::new(cell_for(rects.iter().map(|r| (r.width, r.height))));
        for (i, r) in rects.iter().enumerate() {
            hash.insert(i as u32, r);
        }

        for (i, qr) in rects.iter().enumerate() {
            let candidates = hash.query(qr);
            // Sorted and deduped: determinism guarantee.
            assert!(candidates.windows(2).all(|w| w[0] < w[1]));
            for (j, other) in rects.iter().enumerate() {
                let intersects = qr.x <= other.right()
                    && other.x <= qr.right()
                    && qr.y <= other.bottom()
                    && other.y <= qr.bottom();
                if intersects {
                    assert!(
                        candidates.contains(&(j as u32)),
                        "query {} under-reported overlapping rect {}",
                        i,
                        j
                    );
                }
            }
        }
    }

    #[test]
    fn spatial_hash_returns_unbucketable_entries_for_every_query() {
        let mut hash = SpatialHash::new(1.0);
        // Spans far more than MAX_AXIS_CELLS cells, so it cannot be bucketed.
        hash.insert(
            7,
            &Rect {
                x: 0.0,
                y: 0.0,
                width: 100_000.0,
                height: 1.0,
            },
        );
        hash.insert(
            9,
            &Rect {
                x: f64::NAN,
                y: 0.0,
                width: 1.0,
                height: 1.0,
            },
        );
        hash.insert(
            1,
            &Rect {
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
            },
        );

        let far_away = hash.query(&Rect {
            x: 9_000.0,
            y: 9_000.0,
            width: 1.0,
            height: 1.0,
        });
        assert!(far_away.contains(&7));
        assert!(far_away.contains(&9));
        assert!(!far_away.contains(&1));
    }

    #[test]
    fn empty_index_answers_empty() {
        let hash = SpatialHash::new(10.0);
        assert!(hash.is_empty());
        assert_eq!(hash.len(), 0);
        assert!(hash
            .query(&Rect {
                x: 0.0,
                y: 0.0,
                width: 10.0,
                height: 10.0
            })
            .is_empty());
    }

    #[test]
    fn clean_layout_reports_nothing() {
        let (nodes, routes) = clean_layout();
        let ids = vec!["e0".to_string()];
        let d = check_constraints(&nodes, &routes, &[], &ids, &cfg());
        assert!(d.is_empty(), "unexpected diagnostics: {:?}", d);
    }

    #[test]
    fn empty_input_reports_nothing() {
        let d = check_constraints(&[], &[], &[], &[], &cfg());
        assert!(d.is_empty());
    }

    #[test]
    fn finds_overlapping_node_pair() {
        let nodes = vec![
            node("a", 0.0, 0.0, 100.0, 50.0),
            node("b", 40.0, 10.0, 100.0, 50.0),
            node("c", 500.0, 500.0, 100.0, 50.0),
        ];
        let d = check_constraints(&nodes, &[], &[], &[], &cfg());
        let overlaps: Vec<&LayoutDiagnostic> =
            d.iter().filter(|x| x.code == "NODE_NODE_OVERLAP").collect();
        assert_eq!(overlaps.len(), 1);
        assert_eq!(
            overlaps[0].ids.as_deref(),
            Some(&["a".to_string(), "b".to_string()][..])
        );
        assert_eq!(overlaps[0].severity, "error");
    }

    #[test]
    fn touching_nodes_do_not_overlap() {
        let nodes = vec![
            node("a", 0.0, 0.0, 100.0, 50.0),
            node("b", 100.0, 0.0, 100.0, 50.0),
        ];
        let d = check_constraints(&nodes, &[], &[], &[], &cfg());
        assert!(d.is_empty());
    }

    #[test]
    fn finds_edge_node_penetration() {
        let (mut nodes, routes) = clean_layout();
        // Drop an unrelated node straight onto the vertical run of e0.
        nodes.push(node("mid", 20.0, 100.0, 60.0, 40.0));
        let d = check_constraints(&nodes, &routes, &[], &[], &cfg());
        assert!(d.iter().any(|x| x.code == "EDGE_NODE_PENETRATION"));
    }

    #[test]
    fn finds_badge_overlaps() {
        let (nodes, routes) = clean_layout();
        let badges = vec![
            badge("e0", 10.0, 10.0, 40.0, 20.0), // on top of node "a"
            badge("e1", 20.0, 15.0, 40.0, 20.0), // and on top of the first badge
        ];
        let d = check_constraints(&nodes, &routes, &badges, &[], &cfg());
        assert!(d.iter().any(|x| x.code == "BADGE_NODE_OVERLAP"));
        assert!(d.iter().any(|x| x.code == "BADGE_BADGE_OVERLAP"));
    }

    #[test]
    fn finds_non_orthogonal_segment_and_skips_it_for_curved_styles() {
        let (nodes, mut routes) = clean_layout();
        routes[0].points = vec![
            Point { x: 50.0, y: 50.0 },
            Point { x: 70.0, y: 120.0 },
            Point { x: 50.0, y: 200.0 },
        ];
        let d = check_constraints(&nodes, &routes, &[], &[], &cfg());
        assert_eq!(
            d.iter()
                .filter(|x| x.code == "NON_ORTHOGONAL_SEGMENT")
                .count(),
            2
        );

        let mut spline = cfg();
        spline.edge_style = EdgeStyle::Spline;
        let d2 = check_constraints(&nodes, &routes, &[], &[], &spline);
        assert!(!d2.iter().any(|x| x.code == "NON_ORTHOGONAL_SEGMENT"));
    }

    #[test]
    fn finds_endpoint_off_boundary() {
        let (nodes, mut routes) = clean_layout();
        routes[0].source_port.point = Point { x: 50.0, y: 25.0 }; // node centre, not boundary
        let d = check_constraints(&nodes, &routes, &[], &[], &cfg());
        assert!(d.iter().any(|x| x.code == "ENDPOINT_OFF_BOUNDARY"));
    }

    #[test]
    fn unknown_port_node_is_an_endpoint_violation() {
        let (nodes, mut routes) = clean_layout();
        routes[0].target_port.node_id = "ghost".to_string();
        let d = check_constraints(&nodes, &routes, &[], &[], &cfg());
        assert!(d.iter().any(|x| x.code == "ENDPOINT_OFF_BOUNDARY"));
    }

    #[test]
    fn finds_missing_route() {
        let (nodes, routes) = clean_layout();
        let ids = vec!["e0".to_string(), "e1".to_string()];
        let d = check_constraints(&nodes, &routes, &[], &ids, &cfg());
        let missing: Vec<&LayoutDiagnostic> =
            d.iter().filter(|x| x.code == "MISSING_ROUTE").collect();
        assert_eq!(missing.len(), 1);
        assert_eq!(missing[0].ids.as_deref(), Some(&["e1".to_string()][..]));
    }

    #[test]
    fn finds_non_finite_coordinates_everywhere() {
        let mut nodes = vec![node("a", f64::NAN, 0.0, 10.0, 10.0)];
        nodes.push(node("b", 400.0, 400.0, 10.0, 10.0));
        let p = Point {
            x: f64::INFINITY,
            y: 0.0,
        };
        let routes = vec![RoutedPath {
            edge_id: "e0".to_string(),
            points: vec![p, Point { x: 1.0, y: 1.0 }],
            source_port: port("b", Side::Bottom, p),
            target_port: port("b", Side::Top, Point { x: 400.0, y: 400.0 }),
        }];
        let badges = vec![badge("e0", f64::NAN, 0.0, 10.0, 10.0)];
        let d = check_constraints(&nodes, &routes, &badges, &[], &cfg());
        assert_eq!(
            d.iter()
                .filter(|x| x.code == "NON_FINITE_COORDINATE")
                .count(),
            3
        );
    }

    #[test]
    fn diagnostics_are_capped_but_scanning_continues() {
        // 80 mutually overlapping nodes: 3160 violating pairs, far past the cap.
        let nodes: Vec<PositionedNode> = (0..80)
            .map(|i| node(&format!("n{}", i), i as f64 * 0.5, 0.0, 100.0, 50.0))
            .collect();
        let d = check_constraints(&nodes, &[], &[], &[], &cfg());
        assert_eq!(d.len(), MAX_REPORTS_PER_CODE);
    }

    #[test]
    fn output_is_deterministic_across_runs() {
        let nodes = vec![
            node("a", 0.0, 0.0, 100.0, 50.0),
            node("b", 40.0, 10.0, 100.0, 50.0),
            node("c", 60.0, 20.0, 100.0, 50.0),
        ];
        let first = check_constraints(&nodes, &[], &[], &[], &cfg());
        for _ in 0..8 {
            let again = check_constraints(&nodes, &[], &[], &[], &cfg());
            let a: Vec<&String> = first.iter().map(|d| &d.message).collect();
            let b: Vec<&String> = again.iter().map(|d| &d.message).collect();
            assert_eq!(a, b);
        }
    }
}
