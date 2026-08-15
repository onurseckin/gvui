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
        if !rect_is_finite(&ri) || ri.width <= 0.0 || ri.height <= 0.0 {
            continue;
        }
        for cand in hash.query(&ri) {
            let j = cand as usize;
            if j <= i {
                continue;
            }
            let Some(nj) = nodes.get(j) else { continue };
            let rj = node_rect(nj);
            if !rect_is_finite(&rj) || rj.width <= 0.0 || rj.height <= 0.0 {
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
                if !rect_is_finite(&nr) || nr.width <= 0.0 || nr.height <= 0.0 {
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
        if !rect_is_finite(&badge.rect) || badge.rect.width <= 0.0 || badge.rect.height <= 0.0 {
            continue;
        }
        for cand in hash.query(&badge.rect) {
            let ni = cand as usize;
            let Some(node) = nodes.get(ni) else { continue };
            let nr = node_rect(node);
            if !rect_is_finite(&nr) || nr.width <= 0.0 || nr.height <= 0.0 {
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
        if !rect_is_finite(&bi.rect) || bi.rect.width <= 0.0 || bi.rect.height <= 0.0 {
            continue;
        }
        for cand in hash.query(&bi.rect) {
            let j = cand as usize;
            if j <= i {
                continue;
            }
            let Some(bj) = badges.get(j) else { continue };
            if !rect_is_finite(&bj.rect) || bj.rect.width <= 0.0 || bj.rect.height <= 0.0 {
                continue;
            }
            if rects_overlap_area(&bi.rect, &bj.rect, epsilon) {
                on_hit(i, j);
            }
        }
    }
}

/// Reports every `(badge index, route index, segment index)` where a segment of a different edge
/// passes through a badge's interior.
pub fn scan_badge_edge_penetrations(
    badges: &[BadgePlacement],
    routes: &[RoutedPath],
    epsilon: f64,
    mut on_hit: impl FnMut(usize, usize, usize),
) {
    if badges.is_empty() || routes.is_empty() {
        return;
    }
    let hash = build_badge_index(badges);
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
                let bi = cand as usize;
                let Some(badge) = badges.get(bi) else {
                    continue;
                };
                if !rect_is_finite(&badge.rect)
                    || badge.rect.width <= 0.0
                    || badge.rect.height <= 0.0
                {
                    continue;
                }
                // An edge is allowed to carry its own badge (e.g. OnEdge label placement);
                // only different/unrelated edges penetrating the badge are violations.
                if route.edge_id == badge.edge_id {
                    continue;
                }
                if segment_intersects_rect_interior(&seg, &badge.rect, epsilon) {
                    on_hit(bi, ri, k);
                }
            }
        }
    }
}

/// True when two finite segments of length > epsilon lie along the same line and overlap by > epsilon.
pub fn segments_collinear_overlap(s1: &Segment, s2: &Segment, eps: f64) -> bool {
    let dx1 = s1.b.x - s1.a.x;
    let dy1 = s1.b.y - s1.a.y;
    let len1_sq = dx1 * dx1 + dy1 * dy1;
    if len1_sq <= eps * eps {
        return false;
    }
    let dx2 = s2.b.x - s2.a.x;
    let dy2 = s2.b.y - s2.a.y;
    let len2_sq = dx2 * dx2 + dy2 * dy2;
    if len2_sq <= eps * eps {
        return false;
    }

    let len1 = len1_sq.sqrt();
    let ux1 = dx1 / len1;
    let uy1 = dy1 / len1;

    // Normal to s1
    let nx1 = -uy1;
    let ny1 = ux1;

    // Distance of s2 endpoints to the infinite line containing s1
    let dist_a2 = ((s2.a.x - s1.a.x) * nx1 + (s2.a.y - s1.a.y) * ny1).abs();
    let dist_b2 = ((s2.b.x - s1.a.x) * nx1 + (s2.b.y - s1.a.y) * ny1).abs();

    if dist_a2 > eps || dist_b2 > eps {
        return false;
    }

    // Project s2 endpoints along s1 direction (origin at s1.a)
    let t_a2 = (s2.a.x - s1.a.x) * ux1 + (s2.a.y - s1.a.y) * uy1;
    let t_b2 = (s2.b.x - s1.a.x) * ux1 + (s2.b.y - s1.a.y) * uy1;

    let lo2 = t_a2.min(t_b2);
    let hi2 = t_a2.max(t_b2);

    let overlap = len1.min(hi2) - 0.0f64.max(lo2);
    overlap > eps
}

/// Reports every unordered pair of *different* routes that draw a segment along the same line
/// with overlapping extent (orthogonal or diagonal), as `(route i, route j)` with `i < j`.
///
/// This is the failure the geometric crossing count cannot see. Two edges sharing a line do not
/// *intersect* — they **merge**, and the reader loses one of them entirely. It is also strictly
/// worse than a crossing, which at least stays legible.
///
/// Uses spatial hashing on segment bounding boxes so candidate pairs are reduced to local
/// neighbourhoods in O(E) time. Collinear overlap is strict: sharing a single endpoint is not
/// an overlap.
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

    struct SegEntry {
        route: usize,
        seg: Segment,
    }

    let mut entries: Vec<SegEntry> = Vec::new();
    let mut bboxes: Vec<Rect> = Vec::new();

    for (ri, route) in routes.iter().enumerate() {
        if route.points.len() < 2 {
            continue;
        }
        for w in route.points.windows(2) {
            let seg = Segment { a: w[0], b: w[1] };
            if !is_finite_point(&seg.a) || !is_finite_point(&seg.b) {
                continue;
            }
            let dx = seg.b.x - seg.a.x;
            let dy = seg.b.y - seg.a.y;
            if dx * dx + dy * dy <= eps * eps {
                continue;
            }
            let bb = segment_bbox(&seg, eps);
            bboxes.push(bb);
            entries.push(SegEntry { route: ri, seg });
        }
    }

    if entries.is_empty() {
        return;
    }

    let mut hash = SpatialHash::new(cell_for(bboxes.iter().map(|b| (b.width, b.height))));
    for (i, bb) in bboxes.iter().enumerate() {
        hash.insert(i as u32, bb);
    }

    let mut seen: HashSet<(usize, usize)> = HashSet::new();
    for (i, entry_i) in entries.iter().enumerate() {
        let bb_i = &bboxes[i];
        for cand in hash.query(bb_i) {
            let j = cand as usize;
            if j <= i {
                continue;
            }
            let entry_j = &entries[j];
            if entry_i.route == entry_j.route {
                continue;
            }
            if segments_collinear_overlap(&entry_i.seg, &entry_j.seg, eps) {
                let pair = if entry_i.route < entry_j.route {
                    (entry_i.route, entry_j.route)
                } else {
                    (entry_j.route, entry_i.route)
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
        if !(n.x.is_finite() && n.y.is_finite() && n.width.is_finite() && n.height.is_finite())
            || n.width <= 0.0
            || n.height <= 0.0
        {
            if non_finite < MAX_REPORTS_PER_CODE {
                out.push(LayoutDiagnostic::error(
                    "NON_FINITE_COORDINATE",
                    format!("Node '{}' has a non-finite or non-positive box", n.id),
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
            || b.rect.width <= 0.0
            || b.rect.height <= 0.0
            || !is_finite_point(&b.anchor_point)
            || b.leader_points
                .as_ref()
                .is_some_and(|pts| pts.iter().any(|p| !is_finite_point(p)));
        if bad {
            if non_finite < MAX_REPORTS_PER_CODE {
                out.push(LayoutDiagnostic::error(
                    "NON_FINITE_COORDINATE",
                    format!(
                        "Badge for edge '{}' has a non-finite coordinate or non-positive box",
                        b.edge_id
                    ),
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

    // ---- BADGE_EDGE_PENETRATION ---------------------------------------------------------------
    reported = 0;
    scan_badge_edge_penetrations(badges, routes, eps, |bi, ri, seg| {
        if reported < MAX_REPORTS_PER_CODE {
            if let (Some(b), Some(r)) = (badges.get(bi), routes.get(ri)) {
                out.push(LayoutDiagnostic::error(
                    "BADGE_EDGE_PENETRATION",
                    format!(
                        "Badge for edge '{}' is penetrated by segment {} of edge '{}'",
                        b.edge_id, seg, r.edge_id
                    ),
                    vec![b.edge_id.clone(), r.edge_id.clone()],
                ));
            }
        }
        reported += 1;
    });

    // ---- COLLINEAR_EDGE_OVERLAP ---------------------------------------------------------------
    reported = 0;
    scan_collinear_edge_overlaps(routes, eps, |i, j| {
        if reported < MAX_REPORTS_PER_CODE {
            if let (Some(a), Some(b)) = (routes.get(i), routes.get(j)) {
                out.push(LayoutDiagnostic::error(
                    "COLLINEAR_EDGE_OVERLAP",
                    format!(
                        "Edges '{}' and '{}' share a collinear overlapping segment",
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
    fn finds_badge_edge_penetrations() {
        let (nodes, mut routes) = clean_layout();
        // routes has e0: (50, 50) -> (50, 200).
        // Add unrelated route e1: (0, 100) -> (100, 100) crossing perpendicularly.
        routes.push(RoutedPath {
            edge_id: "e1".to_string(),
            points: vec![Point { x: 0.0, y: 100.0 }, Point { x: 100.0, y: 100.0 }],
            source_port: port("a", Side::Left, Point { x: 0.0, y: 100.0 }),
            target_port: port("b", Side::Right, Point { x: 100.0, y: 100.0 }),
        });
        // Place badge for e0 at (30, 80, 40, 40) which covers x in [30, 70], y in [80, 120].
        // e0 passes through the badge (allowed, since it is e0's own badge).
        // e1 passes horizontally through the badge (y = 100, x in [0, 100]) -> violation!
        let badges = vec![badge("e0", 30.0, 80.0, 40.0, 40.0)];
        let d = check_constraints(&nodes, &routes, &badges, &[], &cfg());
        let pen: Vec<&LayoutDiagnostic> = d
            .iter()
            .filter(|x| x.code == "BADGE_EDGE_PENETRATION")
            .collect();
        assert_eq!(
            pen[0].ids.as_deref(),
            Some(&["e0".to_string(), "e1".to_string()][..])
        );
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

    #[test]
    fn badge_edge_penetration_boundary_and_negative_cases() {
        let (nodes, _) = clean_layout();
        let b = badge("e_owner", 100.0, 100.0, 60.0, 30.0);
        let badges = vec![b];

        // 1. Collinear edge touching badge boundary (tangent) -> NO violation
        let routes_tangent = vec![RoutedPath {
            edge_id: "e_other1".to_string(),
            points: vec![Point { x: 50.0, y: 100.0 }, Point { x: 200.0, y: 100.0 }],
            source_port: port("a", Side::Left, Point { x: 50.0, y: 100.0 }),
            target_port: port("b", Side::Right, Point { x: 200.0, y: 100.0 }),
        }];
        let d1 = check_constraints(&nodes, &routes_tangent, &badges, &[], &cfg());
        assert!(!d1.iter().any(|x| x.code == "BADGE_EDGE_PENETRATION"));

        // 2. Zero-length segment outside or on boundary -> NO violation
        let routes_zero = vec![RoutedPath {
            edge_id: "e_other2".to_string(),
            points: vec![Point { x: 100.0, y: 100.0 }, Point { x: 100.0, y: 100.0 }],
            source_port: port("a", Side::Left, Point { x: 100.0, y: 100.0 }),
            target_port: port("b", Side::Right, Point { x: 100.0, y: 100.0 }),
        }];
        let d2 = check_constraints(&nodes, &routes_zero, &badges, &[], &cfg());
        assert!(!d2.iter().any(|x| x.code == "BADGE_EDGE_PENETRATION"));

        // 3. Diagonal spline segment piercing interior -> VIOLATION
        let routes_diag = vec![RoutedPath {
            edge_id: "e_other3".to_string(),
            points: vec![Point { x: 80.0, y: 90.0 }, Point { x: 180.0, y: 150.0 }],
            source_port: port("a", Side::Left, Point { x: 80.0, y: 90.0 }),
            target_port: port("b", Side::Right, Point { x: 180.0, y: 150.0 }),
        }];
        let d3 = check_constraints(&nodes, &routes_diag, &badges, &[], &cfg());
        let pen3: Vec<&LayoutDiagnostic> = d3
            .iter()
            .filter(|x| x.code == "BADGE_EDGE_PENETRATION")
            .collect();
        assert_eq!(pen3.len(), 1);

        // 4. Owner's own edge passing through -> NO violation
        let routes_own = vec![RoutedPath {
            edge_id: "e_owner".to_string(),
            points: vec![Point { x: 80.0, y: 115.0 }, Point { x: 180.0, y: 115.0 }],
            source_port: port("a", Side::Left, Point { x: 80.0, y: 115.0 }),
            target_port: port("b", Side::Right, Point { x: 180.0, y: 115.0 }),
        }];
        let d4 = check_constraints(&nodes, &routes_own, &badges, &[], &cfg());
        assert!(!d4.iter().any(|x| x.code == "BADGE_EDGE_PENETRATION"));
    }

    #[test]
    fn collinear_edge_overlaps_detects_orthogonal_and_diagonal_overlaps() {
        let (nodes, _) = clean_layout();

        // 1. Horizontal overlapping pair
        let routes_horiz = vec![
            RoutedPath {
                edge_id: "e0".to_string(),
                points: vec![Point { x: 0.0, y: 100.0 }, Point { x: 100.0, y: 100.0 }],
                source_port: port("a", Side::Bottom, Point { x: 0.0, y: 100.0 }),
                target_port: port("b", Side::Top, Point { x: 100.0, y: 100.0 }),
            },
            RoutedPath {
                edge_id: "e1".to_string(),
                points: vec![Point { x: 40.0, y: 100.0 }, Point { x: 140.0, y: 100.0 }],
                source_port: port("a", Side::Bottom, Point { x: 40.0, y: 100.0 }),
                target_port: port("b", Side::Top, Point { x: 140.0, y: 100.0 }),
            },
        ];
        let d_horiz = check_constraints(&nodes, &routes_horiz, &[], &[], &cfg());
        assert!(d_horiz.iter().any(|d| d.code == "COLLINEAR_EDGE_OVERLAP"));

        // 2. Vertical overlapping pair
        let routes_vert = vec![
            RoutedPath {
                edge_id: "e0".to_string(),
                points: vec![Point { x: 50.0, y: 0.0 }, Point { x: 50.0, y: 100.0 }],
                source_port: port("a", Side::Bottom, Point { x: 50.0, y: 0.0 }),
                target_port: port("b", Side::Top, Point { x: 50.0, y: 100.0 }),
            },
            RoutedPath {
                edge_id: "e1".to_string(),
                points: vec![Point { x: 50.0, y: 30.0 }, Point { x: 50.0, y: 120.0 }],
                source_port: port("a", Side::Bottom, Point { x: 50.0, y: 30.0 }),
                target_port: port("b", Side::Top, Point { x: 50.0, y: 120.0 }),
            },
        ];
        let d_vert = check_constraints(&nodes, &routes_vert, &[], &[], &cfg());
        assert!(d_vert.iter().any(|d| d.code == "COLLINEAR_EDGE_OVERLAP"));

        // 3. Diagonal overlapping pair (such as radial rays / chords)
        let routes_diag = vec![
            RoutedPath {
                edge_id: "e0".to_string(),
                points: vec![Point { x: 0.0, y: 0.0 }, Point { x: 100.0, y: 100.0 }],
                source_port: port("a", Side::Bottom, Point { x: 0.0, y: 0.0 }),
                target_port: port("b", Side::Top, Point { x: 100.0, y: 100.0 }),
            },
            RoutedPath {
                edge_id: "e1".to_string(),
                points: vec![Point { x: 25.0, y: 25.0 }, Point { x: 75.0, y: 75.0 }],
                source_port: port("a", Side::Bottom, Point { x: 25.0, y: 25.0 }),
                target_port: port("b", Side::Top, Point { x: 75.0, y: 75.0 }),
            },
        ];
        let mut diag_cfg = cfg();
        diag_cfg.edge_style = EdgeStyle::Straight;
        let d_diag = check_constraints(&nodes, &routes_diag, &[], &[], &diag_cfg);
        let col_diag: Vec<&LayoutDiagnostic> = d_diag
            .iter()
            .filter(|d| d.code == "COLLINEAR_EDGE_OVERLAP")
            .collect();
        assert_eq!(col_diag.len(), 1);
        assert_eq!(
            col_diag[0].ids.as_deref(),
            Some(&["e0".to_string(), "e1".to_string()][..])
        );
    }

    #[test]
    fn collinear_edge_overlaps_negative_cases() {
        let (nodes, _) = clean_layout();

        // 1. Touching at endpoint only (sharing endpoint is NOT overlap)
        let routes_touch = vec![
            RoutedPath {
                edge_id: "e0".to_string(),
                points: vec![Point { x: 0.0, y: 100.0 }, Point { x: 50.0, y: 100.0 }],
                source_port: port("a", Side::Bottom, Point { x: 0.0, y: 100.0 }),
                target_port: port("b", Side::Top, Point { x: 50.0, y: 100.0 }),
            },
            RoutedPath {
                edge_id: "e1".to_string(),
                points: vec![Point { x: 50.0, y: 100.0 }, Point { x: 100.0, y: 100.0 }],
                source_port: port("a", Side::Bottom, Point { x: 50.0, y: 100.0 }),
                target_port: port("b", Side::Top, Point { x: 100.0, y: 100.0 }),
            },
        ];
        let d_touch = check_constraints(&nodes, &routes_touch, &[], &[], &cfg());
        assert!(!d_touch.iter().any(|d| d.code == "COLLINEAR_EDGE_OVERLAP"));

        // 2. Disjoint segments on same line
        let routes_disjoint = vec![
            RoutedPath {
                edge_id: "e0".to_string(),
                points: vec![Point { x: 0.0, y: 100.0 }, Point { x: 40.0, y: 100.0 }],
                source_port: port("a", Side::Bottom, Point { x: 0.0, y: 100.0 }),
                target_port: port("b", Side::Top, Point { x: 40.0, y: 100.0 }),
            },
            RoutedPath {
                edge_id: "e1".to_string(),
                points: vec![Point { x: 60.0, y: 100.0 }, Point { x: 100.0, y: 100.0 }],
                source_port: port("a", Side::Bottom, Point { x: 60.0, y: 100.0 }),
                target_port: port("b", Side::Top, Point { x: 100.0, y: 100.0 }),
            },
        ];
        let d_disjoint = check_constraints(&nodes, &routes_disjoint, &[], &[], &cfg());
        assert!(!d_disjoint
            .iter()
            .any(|d| d.code == "COLLINEAR_EDGE_OVERLAP"));

        // 3. Crossing segments (perpendicular crossing is geometric crossing, not collinear overlap)
        let routes_cross = vec![
            RoutedPath {
                edge_id: "e0".to_string(),
                points: vec![Point { x: 0.0, y: 50.0 }, Point { x: 100.0, y: 50.0 }],
                source_port: port("a", Side::Bottom, Point { x: 0.0, y: 50.0 }),
                target_port: port("b", Side::Top, Point { x: 100.0, y: 50.0 }),
            },
            RoutedPath {
                edge_id: "e1".to_string(),
                points: vec![Point { x: 50.0, y: 0.0 }, Point { x: 50.0, y: 100.0 }],
                source_port: port("a", Side::Bottom, Point { x: 50.0, y: 0.0 }),
                target_port: port("b", Side::Top, Point { x: 50.0, y: 100.0 }),
            },
        ];
        let d_cross = check_constraints(&nodes, &routes_cross, &[], &[], &cfg());
        assert!(!d_cross.iter().any(|d| d.code == "COLLINEAR_EDGE_OVERLAP"));
    }

    #[test]
    fn parallel_multi_edge_bundles_and_multi_badge_clearance() {
        let nodes = vec![
            node("src", 0.0, 0.0, 120.0, 60.0),
            node("tgt", 400.0, 0.0, 120.0, 60.0),
        ];

        // 3 parallel routes between src and tgt, spaced out by 15px along Y
        let routes_spaced = vec![
            RoutedPath {
                edge_id: "e_bundle_0".to_string(),
                points: vec![Point { x: 120.0, y: 15.0 }, Point { x: 400.0, y: 15.0 }],
                source_port: port("src", Side::Right, Point { x: 120.0, y: 15.0 }),
                target_port: port("tgt", Side::Left, Point { x: 400.0, y: 15.0 }),
            },
            RoutedPath {
                edge_id: "e_bundle_1".to_string(),
                points: vec![Point { x: 120.0, y: 30.0 }, Point { x: 400.0, y: 30.0 }],
                source_port: port("src", Side::Right, Point { x: 120.0, y: 30.0 }),
                target_port: port("tgt", Side::Left, Point { x: 400.0, y: 30.0 }),
            },
            RoutedPath {
                edge_id: "e_bundle_2".to_string(),
                points: vec![Point { x: 120.0, y: 45.0 }, Point { x: 400.0, y: 45.0 }],
                source_port: port("src", Side::Right, Point { x: 120.0, y: 45.0 }),
                target_port: port("tgt", Side::Left, Point { x: 400.0, y: 45.0 }),
            },
        ];

        // Badges placed on their respective edges with adequate clearance
        let badges_clear = vec![
            badge("e_bundle_0", 200.0, 5.0, 50.0, 8.0),
            badge("e_bundle_1", 200.0, 26.0, 50.0, 8.0),
            badge("e_bundle_2", 200.0, 41.0, 50.0, 8.0),
        ];

        let d_clean = check_constraints(&nodes, &routes_spaced, &badges_clear, &[], &cfg());
        assert!(
            d_clean.is_empty(),
            "clean bundle had unexpected violations: {:?}",
            d_clean
        );

        // Now test conflicting badges: badge 0 and badge 1 overlap
        let badges_overlap = vec![
            badge("e_bundle_0", 200.0, 10.0, 50.0, 20.0),
            badge("e_bundle_1", 200.0, 20.0, 50.0, 20.0), // overlaps badge 0!
        ];
        let d_badge_overlap =
            check_constraints(&nodes, &routes_spaced, &badges_overlap, &[], &cfg());
        assert!(d_badge_overlap
            .iter()
            .any(|d| d.code == "BADGE_BADGE_OVERLAP"));
    }

    #[test]
    fn cyclic_graphs_and_feedback_chord_obstacle_penetrations() {
        let nodes = vec![
            node("n0", 0.0, 0.0, 80.0, 40.0),
            node("n1", 200.0, 0.0, 80.0, 40.0),
            node("n2", 100.0, 150.0, 80.0, 40.0),
            // Central obstacle node placed right in the path of the feedback chord
            node("obstacle", 60.0, 70.0, 60.0, 40.0),
        ];

        // Feedback chord from n2 back to n0 piercing the obstacle
        let routes_piercing = vec![
            RoutedPath {
                edge_id: "e_0_1".to_string(),
                points: vec![Point { x: 80.0, y: 20.0 }, Point { x: 200.0, y: 20.0 }],
                source_port: port("n0", Side::Right, Point { x: 80.0, y: 20.0 }),
                target_port: port("n1", Side::Left, Point { x: 200.0, y: 20.0 }),
            },
            RoutedPath {
                edge_id: "e_1_2".to_string(),
                points: vec![Point { x: 240.0, y: 40.0 }, Point { x: 140.0, y: 150.0 }],
                source_port: port("n1", Side::Bottom, Point { x: 240.0, y: 40.0 }),
                target_port: port("n2", Side::Top, Point { x: 140.0, y: 150.0 }),
            },
            // Straight chord n2 -> n0 directly passes through obstacle at (60..120, 70..110)
            RoutedPath {
                edge_id: "e_2_0_pierce".to_string(),
                points: vec![Point { x: 140.0, y: 150.0 }, Point { x: 40.0, y: 40.0 }],
                source_port: port("n2", Side::Top, Point { x: 140.0, y: 150.0 }),
                target_port: port("n0", Side::Bottom, Point { x: 40.0, y: 40.0 }),
            },
        ];

        let mut straight_cfg = cfg();
        straight_cfg.edge_style = EdgeStyle::Straight;
        let d_pierce = check_constraints(&nodes, &routes_piercing, &[], &[], &straight_cfg);
        let pen: Vec<&LayoutDiagnostic> = d_pierce
            .iter()
            .filter(|d| d.code == "EDGE_NODE_PENETRATION")
            .collect();
        assert_eq!(pen.len(), 1);
        assert_eq!(
            pen[0].ids.as_deref(),
            Some(&["e_2_0_pierce".to_string(), "obstacle".to_string()][..])
        );

        // Detour routing: chord routes around the obstacle through waypoints outside obstacle box
        let routes_detour = vec![
            routes_piercing[0].clone(),
            routes_piercing[1].clone(),
            RoutedPath {
                edge_id: "e_2_0_detour".to_string(),
                points: vec![
                    Point { x: 100.0, y: 170.0 },
                    Point { x: 0.0, y: 170.0 },
                    Point { x: 0.0, y: 40.0 },
                ],
                source_port: port("n2", Side::Left, Point { x: 100.0, y: 170.0 }),
                target_port: port("n0", Side::Bottom, Point { x: 0.0, y: 40.0 }),
            },
        ];
        let d_detour = check_constraints(&nodes, &routes_detour, &[], &[], &cfg());
        assert!(!d_detour.iter().any(|d| d.code == "EDGE_NODE_PENETRATION"));
    }

    #[test]
    fn radial_polar_sector_clearance_and_multi_badge_chords() {
        // Radial star layout: central root at (200, 200), leaves on ring
        let root = node("root", 160.0, 160.0, 80.0, 80.0);
        let leaf_0 = node("leaf_0", 350.0, 200.0, 60.0, 40.0); // right
        let leaf_1 = node("leaf_1", 200.0, 350.0, 60.0, 40.0); // bottom
        let leaf_2 = node("leaf_2", 50.0, 200.0, 60.0, 40.0); // left
        let leaf_3 = node("leaf_3", 200.0, 50.0, 60.0, 40.0); // top

        let nodes = vec![root, leaf_0, leaf_1, leaf_2, leaf_3];

        // Chords between opposite leaves (e.g. leaf_0 <-> leaf_2)
        // A direct straight chord leaf_0 -> leaf_2 pierces root in the center
        let routes = vec![RoutedPath {
            edge_id: "chord_piercing".to_string(),
            points: vec![Point { x: 350.0, y: 200.0 }, Point { x: 110.0, y: 200.0 }],
            source_port: port("leaf_0", Side::Left, Point { x: 350.0, y: 200.0 }),
            target_port: port("leaf_2", Side::Right, Point { x: 110.0, y: 200.0 }),
        }];

        let mut straight_cfg = cfg();
        straight_cfg.edge_style = EdgeStyle::Straight;
        let d = check_constraints(&nodes, &routes, &[], &[], &straight_cfg);
        let pens: Vec<&LayoutDiagnostic> = d
            .iter()
            .filter(|x| x.code == "EDGE_NODE_PENETRATION")
            .collect();
        assert_eq!(pens.len(), 1);
        assert_eq!(
            pens[0].ids.as_deref(),
            Some(&["chord_piercing".to_string(), "root".to_string()][..])
        );

        // Badge sector clearance: badge placed in clear polar sector vs on root
        let badge_on_root = vec![badge("chord_piercing", 180.0, 180.0, 40.0, 20.0)];
        let d_badge = check_constraints(&nodes, &routes, &badge_on_root, &[], &straight_cfg);
        assert!(d_badge.iter().any(|x| x.code == "BADGE_NODE_OVERLAP"));

        let badge_clear = vec![badge("chord_piercing", 280.0, 240.0, 40.0, 20.0)];
        let d_clear_badge = check_constraints(&nodes, &routes, &badge_clear, &[], &straight_cfg);
        assert!(!d_clear_badge.iter().any(|x| x.code == "BADGE_NODE_OVERLAP"));
    }

    #[test]
    fn zero_sized_nodes_and_boundary_epsilon_precision() {
        // 1. Zero-width and zero-height nodes are identified under NON_FINITE_COORDINATE
        let zero_nodes = vec![
            node("n_zero_w", 10.0, 10.0, 0.0, 50.0),
            node("n_zero_h", 100.0, 10.0, 50.0, 0.0),
            node("n_normal", 200.0, 10.0, 50.0, 50.0),
        ];
        let d_zero = check_constraints(&zero_nodes, &[], &[], &[], &cfg());
        let non_finite_diags: Vec<&LayoutDiagnostic> = d_zero
            .iter()
            .filter(|x| x.code == "NON_FINITE_COORDINATE")
            .collect();
        assert_eq!(non_finite_diags.len(), 2);

        // 2. Exact boundary touch between nodes (x = 100) -> NO NODE_NODE_OVERLAP
        let touch_nodes = vec![
            node("n_left", 0.0, 0.0, 100.0, 50.0),
            node("n_right", 100.0, 0.0, 100.0, 50.0),
        ];
        let mut overlap_count = 0usize;
        scan_node_node_overlaps(&touch_nodes, 1e-4, |_, _| overlap_count += 1);
        assert_eq!(overlap_count, 0);

        // 3. Edge running along the exterior boundary of a node -> NO EDGE_NODE_PENETRATION
        // Node sits at (0..100, 0..50). Edge runs from (0, 0) to (100, 0) right along the top boundary.
        let boundary_route = vec![RoutedPath {
            edge_id: "e_boundary".to_string(),
            points: vec![Point { x: 0.0, y: 0.0 }, Point { x: 100.0, y: 0.0 }],
            source_port: port("n_left", Side::Top, Point { x: 0.0, y: 0.0 }),
            target_port: port("n_right", Side::Top, Point { x: 100.0, y: 0.0 }),
        }];
        let mut pen_count = 0usize;
        scan_edge_node_penetrations(&touch_nodes, &boundary_route, 1e-4, |_, _, _| {
            pen_count += 1
        });
        assert_eq!(pen_count, 0);

        // 4. Badges touching exact boundary (x = 100) -> NO BADGE_BADGE_OVERLAP
        let touch_badges = vec![
            badge("e0", 0.0, 0.0, 100.0, 20.0),
            badge("e1", 100.0, 0.0, 100.0, 20.0),
        ];
        let mut badge_overlap_count = 0usize;
        scan_badge_badge_overlaps(&touch_badges, 1e-4, |_, _| badge_overlap_count += 1);
        assert_eq!(badge_overlap_count, 0);
    }

    #[test]
    fn stress_test_dense_parallel_bundle_badge_penetrations_and_overlaps() {
        let nodes = vec![
            node("src", 0.0, 0.0, 100.0, 500.0),
            node("tgt", 600.0, 0.0, 100.0, 500.0),
        ];

        // 16 dense parallel routes running from src (x=100) to tgt (x=600) at y = 20, 40, 60, ..., 320
        let n_routes = 16;
        let mut routes = Vec::new();
        for i in 0..n_routes {
            let y = 20.0 + (i as f64) * 20.0;
            routes.push(RoutedPath {
                edge_id: format!("e_{}", i),
                points: vec![Point { x: 100.0, y }, Point { x: 600.0, y }],
                source_port: port("src", Side::Right, Point { x: 100.0, y }),
                target_port: port("tgt", Side::Left, Point { x: 600.0, y }),
            });
        }

        // Clean badges: placed with staggered X and height=10 so they don't overlap or get penetrated
        let mut clean_badges = Vec::new();
        for i in 0..n_routes {
            let y = 20.0 + (i as f64) * 20.0;
            let x = 150.0 + (i as f64) * 25.0;
            clean_badges.push(badge(&format!("e_{}", i), x, y - 5.0, 40.0, 10.0));
        }

        let d_clean = check_constraints(&nodes, &routes, &clean_badges, &[], &cfg());
        assert!(
            d_clean.is_empty(),
            "clean bundle should have 0 violations: {:?}",
            d_clean
        );

        // Adversarial badges:
        // 1. Badge on e_2 (y=60) placed at x=400..450, y=45..85 (height 40) penetrates e_3 (y=80)
        // 2. Badge on e_6 (x in 200..240, y in 130..150) and Badge on e_7 (x in 210..250, y in 145..165) overlap
        // 3. Badge on e_10 placed at x=500..550, y=205..245 (height 40) penetrates e_11 (y=240)
        let mut adversarial_badges = clean_badges.clone();
        adversarial_badges[2] = badge("e_2", 400.0, 45.0, 50.0, 40.0);
        adversarial_badges[6] = badge("e_6", 200.0, 130.0, 40.0, 20.0);
        adversarial_badges[7] = badge("e_7", 210.0, 145.0, 40.0, 20.0);
        adversarial_badges[10] = badge("e_10", 500.0, 205.0, 50.0, 40.0);

        let d_adv = check_constraints(&nodes, &routes, &adversarial_badges, &[], &cfg());
        let pens: Vec<&LayoutDiagnostic> = d_adv
            .iter()
            .filter(|x| x.code == "BADGE_EDGE_PENETRATION")
            .collect();
        let badge_overlaps: Vec<&LayoutDiagnostic> = d_adv
            .iter()
            .filter(|x| x.code == "BADGE_BADGE_OVERLAP")
            .collect();

        assert_eq!(
            pens.len(),
            2,
            "Expected exactly 2 badge-edge penetrations, got: {:?}",
            pens
        );
        assert_eq!(
            badge_overlaps.len(),
            1,
            "Expected exactly 1 badge-badge overlap, got: {:?}",
            badge_overlaps
        );
    }

    #[test]
    fn all_ten_diagnostic_codes_negative_assertion_paths_and_descriptions() {
        // Base clean layout: 2 nodes, 1 valid route e0, no badges
        let (clean_nodes, clean_routes) = clean_layout();
        let clean_ids = vec!["e0".to_string()];

        // 1. Invariant: Clean layout produces ZERO diagnostics of ANY code
        let d_clean = check_constraints(&clean_nodes, &clean_routes, &[], &clean_ids, &cfg());
        assert!(
            d_clean.is_empty(),
            "clean layout had diagnostics: {:?}",
            d_clean
        );

        // 2. Test each of the 10 diagnostic codes individually:

        // CODE 1: NON_FINITE_COORDINATE
        let bad_node = vec![node("n_nan", f64::NAN, 0.0, 100.0, 50.0)];
        let d1 = check_constraints(&bad_node, &[], &[], &[], &cfg());
        let diag1 = d1
            .iter()
            .find(|d| d.code == "NON_FINITE_COORDINATE")
            .unwrap();
        assert_eq!(diag1.severity, "error");
        assert!(diag1
            .message
            .contains("Node 'n_nan' has a non-finite or non-positive box"));
        assert_eq!(diag1.ids.as_deref(), Some(&["n_nan".to_string()][..]));

        // CODE 2: NODE_NODE_OVERLAP
        let overlap_nodes = vec![
            node("n1", 0.0, 0.0, 100.0, 50.0),
            node("n2", 50.0, 20.0, 100.0, 50.0),
        ];
        let d2 = check_constraints(&overlap_nodes, &[], &[], &[], &cfg());
        let diag2 = d2.iter().find(|d| d.code == "NODE_NODE_OVERLAP").unwrap();
        assert_eq!(diag2.severity, "error");
        assert!(diag2.message.contains("Nodes 'n1' and 'n2' overlap"));
        assert_eq!(
            diag2.ids.as_deref(),
            Some(&["n1".to_string(), "n2".to_string()][..])
        );

        // CODE 3: EDGE_NODE_PENETRATION
        let mut nodes3 = clean_nodes.clone();
        nodes3.push(node("obstacle", 20.0, 100.0, 60.0, 40.0));
        let d3 = check_constraints(&nodes3, &clean_routes, &[], &clean_ids, &cfg());
        let diag3 = d3
            .iter()
            .find(|d| d.code == "EDGE_NODE_PENETRATION")
            .unwrap();
        assert_eq!(diag3.severity, "error");
        assert!(diag3
            .message
            .contains("passes through the interior of node 'obstacle'"));
        assert_eq!(
            diag3.ids.as_deref(),
            Some(&["e0".to_string(), "obstacle".to_string()][..])
        );

        // CODE 4: BADGE_NODE_OVERLAP
        let badge_on_node = vec![badge("e0", 10.0, 10.0, 40.0, 20.0)];
        let d4 = check_constraints(
            &clean_nodes,
            &clean_routes,
            &badge_on_node,
            &clean_ids,
            &cfg(),
        );
        let diag4 = d4.iter().find(|d| d.code == "BADGE_NODE_OVERLAP").unwrap();
        assert_eq!(diag4.severity, "error");
        assert!(diag4
            .message
            .contains("Badge for edge 'e0' overlaps node 'a'"));
        assert_eq!(
            diag4.ids.as_deref(),
            Some(&["e0".to_string(), "a".to_string()][..])
        );

        // CODE 5: BADGE_BADGE_OVERLAP
        let badges_overlap = vec![
            badge("e0", 200.0, 200.0, 50.0, 30.0),
            badge("e1", 220.0, 210.0, 50.0, 30.0),
        ];
        let d5 = check_constraints(
            &clean_nodes,
            &clean_routes,
            &badges_overlap,
            &clean_ids,
            &cfg(),
        );
        let diag5 = d5.iter().find(|d| d.code == "BADGE_BADGE_OVERLAP").unwrap();
        assert_eq!(diag5.severity, "error");
        assert!(diag5
            .message
            .contains("Badges for edges 'e0' and 'e1' overlap"));
        assert_eq!(
            diag5.ids.as_deref(),
            Some(&["e0".to_string(), "e1".to_string()][..])
        );

        // CODE 6: BADGE_EDGE_PENETRATION
        let mut routes6 = clean_routes.clone();
        routes6.push(RoutedPath {
            edge_id: "e1".to_string(),
            points: vec![Point { x: 0.0, y: 120.0 }, Point { x: 200.0, y: 120.0 }],
            source_port: port("a", Side::Left, Point { x: 0.0, y: 120.0 }),
            target_port: port("b", Side::Right, Point { x: 200.0, y: 120.0 }),
        });
        let badges6 = vec![badge("e0", 40.0, 100.0, 40.0, 40.0)]; // covers y=100..140, penetrated by e1 at y=120
        let d6 = check_constraints(&clean_nodes, &routes6, &badges6, &[], &cfg());
        let diag6 = d6
            .iter()
            .find(|d| d.code == "BADGE_EDGE_PENETRATION")
            .unwrap();
        assert_eq!(diag6.severity, "error");
        assert!(diag6
            .message
            .contains("Badge for edge 'e0' is penetrated by segment 0 of edge 'e1'"));
        assert_eq!(
            diag6.ids.as_deref(),
            Some(&["e0".to_string(), "e1".to_string()][..])
        );

        // CODE 7: COLLINEAR_EDGE_OVERLAP
        let routes7 = vec![
            clean_routes[0].clone(),
            RoutedPath {
                edge_id: "e_collinear".to_string(),
                points: vec![Point { x: 50.0, y: 80.0 }, Point { x: 50.0, y: 180.0 }],
                source_port: port("a", Side::Bottom, Point { x: 50.0, y: 80.0 }),
                target_port: port("b", Side::Top, Point { x: 50.0, y: 180.0 }),
            },
        ];
        let d7 = check_constraints(&clean_nodes, &routes7, &[], &[], &cfg());
        let diag7 = d7
            .iter()
            .find(|d| d.code == "COLLINEAR_EDGE_OVERLAP")
            .unwrap();
        assert_eq!(diag7.severity, "error");
        assert!(diag7
            .message
            .contains("share a collinear overlapping segment"));
        assert_eq!(
            diag7.ids.as_deref(),
            Some(&["e0".to_string(), "e_collinear".to_string()][..])
        );

        // CODE 8: NON_ORTHOGONAL_SEGMENT
        let mut routes8 = clean_routes.clone();
        routes8[0].points = vec![
            Point { x: 50.0, y: 50.0 },
            Point { x: 75.0, y: 120.0 }, // diagonal slant
            Point { x: 50.0, y: 200.0 },
        ];
        let d8 = check_constraints(&clean_nodes, &routes8, &[], &clean_ids, &cfg());
        let diag8 = d8
            .iter()
            .find(|d| d.code == "NON_ORTHOGONAL_SEGMENT")
            .unwrap();
        assert_eq!(diag8.severity, "error");
        assert!(diag8.message.contains("is not axis-aligned"));
        assert_eq!(diag8.ids.as_deref(), Some(&["e0".to_string()][..]));

        // CODE 9: ENDPOINT_OFF_BOUNDARY
        let mut routes9 = clean_routes.clone();
        routes9[0].source_port.point = Point { x: 50.0, y: 25.0 }; // inside node "a", not on boundary
        let d9 = check_constraints(&clean_nodes, &routes9, &[], &clean_ids, &cfg());
        let diag9 = d9
            .iter()
            .find(|d| d.code == "ENDPOINT_OFF_BOUNDARY")
            .unwrap();
        assert_eq!(diag9.severity, "error");
        assert!(diag9.message.contains("is not on the boundary of node 'a'"));
        assert_eq!(
            diag9.ids.as_deref(),
            Some(&["e0".to_string(), "a".to_string()][..])
        );

        // CODE 10: MISSING_ROUTE
        let expected_ids = vec!["e0".to_string(), "e_unrouted".to_string()];
        let d10 = check_constraints(&clean_nodes, &clean_routes, &[], &expected_ids, &cfg());
        let diag10 = d10.iter().find(|d| d.code == "MISSING_ROUTE").unwrap();
        assert_eq!(diag10.severity, "error");
        assert!(diag10.message.contains("Edge 'e_unrouted' has no route"));
        assert_eq!(diag10.ids.as_deref(), Some(&["e_unrouted".to_string()][..]));
    }
}
