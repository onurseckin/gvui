//! # Step 5.5 (Phase 8d/8e): Polyline post-processing
//!
//! Pure functions applied after a route has been materialised. None of them makes a layout
//! decision; they exist so the routers can emit the naive point sequence (port, stub, channel
//! corner, channel corner, band entry, band exit, ...) without worrying about redundancy.
//!
//! Corner *rounding* deliberately does **not** live here. Rounding is a path-string transformation
//! with zero layout consequence, so it is applied on the TypeScript side where `corner_radius` can
//! change without triggering a re-layout. [`points_to_svg_path`] exists only so the native audit
//! harness can render the same geometry the browser does.
//!
//! ## Why octilinear is a post-pass and not a router
//!
//! [`chamfer_corners`] implements `EdgeStyle::Octilinear` by shaving finished right-angle corners
//! into 45-degree diagonals. It is deliberately **not** an eight-direction router.
//!
//! The lane model is what makes routing exact. Channels between rank bands are axis-aligned
//! intervals, the set of edges wanting to share a channel is an interval graph, and interval graphs
//! are optimally colourable in one sweep. That is the whole reason Phase 6 can reserve the exact
//! space every segment will need *before any geometry exists*, and therefore the reason routing in
//! this engine cannot fail: there is no rip-up, no reroute, no budget to exhaust.
//!
//! Octilinear channels have no equivalent exact colouring — a diagonal corridor is not an interval
//! on either axis, and the conflict graph of a set of diagonals is not perfect. A true
//! eight-direction router would mean replacing an exact reservation with a search, and giving up
//! the guarantee that every edge routes. A chamfer post-pass buys most of the visual benefit —
//! softer turns, shorter paths — while keeping it, because a chamfer only ever removes area from
//! inside the corner it replaces and is skipped outright whenever it would touch a node. Octilinear
//! therefore **cannot fail**: it degrades to plain orthogonal one corner at a time.

use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
use crate::types::{Point, Rect};

/// Drops collinear interior points and zero-length steps. Endpoints are preserved exactly.
///
/// "Exactly" is load-bearing: the first and last elements of the result are bit-identical copies of
/// the input's first and last elements, never a deduplicated near-neighbour. Downstream validation
/// checks that a route starts and ends on a node boundary by exact comparison against the port
/// point, so a sub-epsilon drift introduced here would read as a hard constraint violation.
///
/// Collinearity is measured as perpendicular distance from the segment `prev -> next`, so the
/// function is correct for diagonal (spline/straight style) polylines as well as orthogonal ones.
/// A point is only dropped when the path continues *forward* through it; a spike that doubles back
/// on itself is preserved, because removing it would change the drawn shape rather than simplify
/// it.
pub fn simplify_polyline(points: &[Point], epsilon: f64) -> Vec<Point> {
    let eps = if epsilon.is_finite() && epsilon > 0.0 {
        epsilon
    } else {
        0.0
    };
    if points.len() <= 2 {
        return points.to_vec();
    }
    let terminal = points[points.len() - 1];

    // Pass 1: drop zero-length steps.
    let mut deduped: Vec<Point> = Vec::with_capacity(points.len());
    deduped.push(points[0]);
    for p in &points[1..] {
        let last = deduped[deduped.len() - 1];
        if (p.x - last.x).abs() > eps || (p.y - last.y).abs() > eps {
            deduped.push(*p);
        }
    }
    if deduped.len() < 2 {
        // Every point collapsed onto the first. Keep both original endpoints so the result is
        // still a segment and the exactness contract holds.
        return vec![points[0], terminal];
    }
    if deduped.len() == 2 {
        deduped[1] = terminal;
        return deduped;
    }

    // Pass 2: drop interior points that lie on the straight run through their neighbours.
    let mut out: Vec<Point> = Vec::with_capacity(deduped.len());
    out.push(deduped[0]);
    for i in 1..deduped.len() - 1 {
        let prev = out[out.len() - 1];
        let cur = deduped[i];
        let next = deduped[i + 1];

        let vx = next.x - prev.x;
        let vy = next.y - prev.y;
        let run = (vx * vx + vy * vy).sqrt();
        let keep = if run > 0.0 {
            let perpendicular = ((vx * (cur.y - prev.y)) - (vy * (cur.x - prev.x))).abs() / run;
            let forward = (cur.x - prev.x) * (next.x - cur.x) + (cur.y - prev.y) * (next.y - cur.y);
            !(perpendicular <= eps && forward > 0.0)
        } else {
            // `prev == next`: this is a spike, and dropping `cur` would erase it.
            true
        };
        if keep {
            out.push(cur);
        }
    }
    out.push(terminal);
    out
}

/// SVG path string. Corner rounding is applied on the TS side so it can change without a
/// re-layout; this helper exists for the native audit harness.
///
/// Coordinates are emitted at fixed three-decimal precision rather than via `f64`'s shortest
/// round-trip formatting, so two runs that agree to within a rendering pixel produce the same
/// string and audit snapshots stay stable.
pub fn points_to_svg_path(points: &[Point]) -> String {
    use std::fmt::Write;

    let mut out = String::with_capacity(points.len() * 20);
    for (i, p) in points.iter().enumerate() {
        // `write!` into a String is infallible; the result is discarded rather than unwrapped.
        let _ = if i == 0 {
            write!(out, "M {:.3} {:.3}", p.x, p.y)
        } else {
            write!(out, " L {:.3} {:.3}", p.x, p.y)
        };
    }
    out
}

// =============================================================================================
// Octilinear chamfering
// =============================================================================================

/// Smallest chamfer the octilinear style will cut.
///
/// `corner_radius` defaults to 8, and an 8px chamfer on a 120px-wide node reads as a rendering
/// artefact rather than a diagonal. Clamping up means one knob (`corner_radius`) drives both the
/// rounded and the octilinear look without needing a second config field that would almost always
/// be left at its default.
const MIN_CORNER_CUT: f64 = 12.0;

/// Extra clearance added to every node box before a chamfer is tested against it.
///
/// A diagonal that runs exactly along a node's corner is geometrically outside the node but reads
/// as a collision. Two pixels is well under `lane_spacing`, so growing the boxes by this much can
/// never make a legally reserved lane look blocked — it only rejects chamfers that were visually
/// touching anyway.
const CHAMFER_NODE_CLEARANCE: f64 = 2.0;

/// Largest number of grid cells one rectangle may occupy along a single axis before the index gives
/// up on bucketing it and files it as "always a candidate".
const MAX_AXIS_CELLS: i64 = 512;

/// Clamp applied to a cell coordinate before it is narrowed to `i64`, so a pathological but finite
/// coordinate cannot produce an out-of-range cast.
const CELL_INDEX_LIMIT: f64 = 1.0e7;

/// The chamfer size for `EdgeStyle::Octilinear`, derived from `corner_radius`.
///
/// A non-finite `corner_radius` cannot reach here (`CustomLayoutConfig::validate` rejects it), and
/// `f64::max` would return [`MIN_CORNER_CUT`] anyway, so no separate guard is needed.
pub fn octilinear_corner_cut(config: &CustomLayoutConfig) -> f64 {
    config.corner_radius.max(MIN_CORNER_CUT)
}

/// Uniform spatial hash over node boxes, answering "would this chamfer clip a node?".
///
/// Local to Phase 8 on purpose. Phase 9 has its own `SpatialHash`, but routing must not depend on
/// validation — validation is allowed to be deleted from a release build, routing is not.
///
/// Every stored rectangle is pre-grown by [`CHAMFER_NODE_CLEARANCE`], so callers pass raw node
/// boxes and the "expanded rect" the chamfer is tested against is a property of the index rather
/// than something each caller has to remember to apply.
///
/// Determinism: the `HashMap` is only ever read through explicitly computed cell keys, never
/// iterated, and the answer is a boolean, so no decision depends on hash order.
pub struct NodeRectIndex {
    /// Edge length of one square cell. Always finite and > 0.
    cell: f64,
    /// Expanded node boxes, indexed by the ids stored in the buckets.
    rects: Vec<Rect>,
    buckets: HashMap<(i64, i64), Vec<u32>>,
    /// Ids that could not be bucketed; tested by every query.
    unbucketed: Vec<u32>,
    /// Set when an input rectangle was not finite. A poisoned index blocks every chamfer, which
    /// degrades octilinear to plain orthogonal rather than emitting a diagonal whose safety could
    /// not be established.
    poisoned: bool,
}

impl NodeRectIndex {
    /// Builds an index over node boxes, each grown by [`CHAMFER_NODE_CLEARANCE`].
    pub fn new(rects: impl IntoIterator<Item = Rect>) -> Self {
        let mut poisoned = false;
        let expanded: Vec<Rect> = rects
            .into_iter()
            .map(|r| {
                if !(r.x.is_finite()
                    && r.y.is_finite()
                    && r.width.is_finite()
                    && r.height.is_finite())
                {
                    poisoned = true;
                }
                Rect {
                    x: r.x - CHAMFER_NODE_CLEARANCE,
                    y: r.y - CHAMFER_NODE_CLEARANCE,
                    width: r.width + CHAMFER_NODE_CLEARANCE * 2.0,
                    height: r.height + CHAMFER_NODE_CLEARANCE * 2.0,
                }
            })
            .collect();

        let cell = mean_extent(&expanded);
        let mut buckets: HashMap<(i64, i64), Vec<u32>> = HashMap::new();
        let mut unbucketed: Vec<u32> = Vec::new();
        for (i, r) in expanded.iter().enumerate() {
            match cell_span(r, cell) {
                Some((x0, x1, y0, y1)) => {
                    for cx in x0..=x1 {
                        for cy in y0..=y1 {
                            buckets.entry((cx, cy)).or_default().push(i as u32);
                        }
                    }
                }
                None => unbucketed.push(i as u32),
            }
        }

        NodeRectIndex {
            cell,
            rects: expanded,
            buckets,
            unbucketed,
            poisoned,
        }
    }

    /// True when the segment `a -> b` touches any indexed (already expanded) node box.
    ///
    /// Over-reporting is safe — it leaves a corner square — so every uncertain case answers `true`:
    /// a non-finite endpoint, a poisoned index, or a query box too large to bucket.
    pub fn blocks(&self, a: Point, b: Point) -> bool {
        if self.poisoned {
            return true;
        }
        if self.rects.is_empty() {
            return false;
        }
        if !(a.x.is_finite() && a.y.is_finite() && b.x.is_finite() && b.y.is_finite()) {
            return true;
        }
        for &id in &self.unbucketed {
            if self
                .rects
                .get(id as usize)
                .is_some_and(|r| segment_hits_rect(a, b, r))
            {
                return true;
            }
        }
        let bbox = Rect {
            x: a.x.min(b.x),
            y: a.y.min(b.y),
            width: (b.x - a.x).abs(),
            height: (b.y - a.y).abs(),
        };
        let Some((x0, x1, y0, y1)) = cell_span(&bbox, self.cell) else {
            return self.rects.iter().any(|r| segment_hits_rect(a, b, r));
        };
        for cx in x0..=x1 {
            for cy in y0..=y1 {
                let Some(bucket) = self.buckets.get(&(cx, cy)) else {
                    continue;
                };
                for &id in bucket {
                    if self
                        .rects
                        .get(id as usize)
                        .is_some_and(|r| segment_hits_rect(a, b, r))
                    {
                        return true;
                    }
                }
            }
        }
        false
    }

    /// Number of node boxes indexed.
    pub fn len(&self) -> usize {
        self.rects.len()
    }

    /// True when no node box was indexed.
    pub fn is_empty(&self) -> bool {
        self.rects.is_empty()
    }
}

/// Replaces each eligible interior right-angle corner with a 45-degree chamfer.
///
/// For a corner `prev -> cur -> next` the vertex `cur` becomes two vertices, each offset from it
/// along its own leg by `c = min(corner_cut, half the shorter leg)`. The "half the shorter leg"
/// clamp is what lets every corner be decided in isolation: two neighbouring corners each claim at
/// most half of the leg they share, so their chamfers can meet but never overlap, and the pass
/// needs no lookahead.
///
/// A corner is left square when
/// - it is not a right angle (either leg is diagonal, or the two legs are collinear),
/// - the chamfer would be sub-epsilon, or
/// - the resulting diagonal would touch a node's expanded box.
///
/// **This is why octilinear cannot fail.** Every rejection is local and independent, so the worst
/// case is the unmodified orthogonal polyline. There is no state to roll back and no way for the
/// pass to report failure.
///
/// The first and last points are copied through bit-exactly: `c` never exceeds half a leg, so the
/// chamfer of the corner at index 1 stops at the midpoint of the stub and can never reach the port
/// point. Downstream validation compares route endpoints to port points exactly.
///
/// Total Euclidean length never increases: each applied chamfer trades `2c` of axis-aligned travel
/// for `c * sqrt(2)`, a saving of `c * (2 - sqrt(2))`.
pub fn chamfer_corners(
    points: &[Point],
    corner_cut: f64,
    nodes: &NodeRectIndex,
    epsilon: f64,
) -> Vec<Point> {
    if points.len() < 3 || !corner_cut.is_finite() || corner_cut <= 0.0 {
        return points.to_vec();
    }
    let eps = if epsilon.is_finite() && epsilon > 0.0 {
        epsilon
    } else {
        0.0
    };

    let mut out: Vec<Point> = Vec::with_capacity(points.len() * 2);
    out.push(points[0]);
    for i in 1..points.len() - 1 {
        // `prev` is read from the *input*, not from `out`. Using the already-chamfered predecessor
        // would shrink the measured leg and break the "at most half of each leg" bound that makes
        // neighbouring corners independent.
        match chamfer_at(
            points[i - 1],
            points[i],
            points[i + 1],
            corner_cut,
            nodes,
            eps,
        ) {
            Some((entry, exit)) => {
                out.push(entry);
                out.push(exit);
            }
            None => out.push(points[i]),
        }
    }
    out.push(points[points.len() - 1]);
    out
}

/// The two chamfer vertices for one corner, or `None` to leave it square.
fn chamfer_at(
    prev: Point,
    cur: Point,
    next: Point,
    corner_cut: f64,
    nodes: &NodeRectIndex,
    eps: f64,
) -> Option<(Point, Point)> {
    let in_dx = cur.x - prev.x;
    let in_dy = cur.y - prev.y;
    let out_dx = next.x - cur.x;
    let out_dy = next.y - cur.y;
    if !(in_dx.is_finite() && in_dy.is_finite() && out_dx.is_finite() && out_dy.is_finite()) {
        return None;
    }

    // A right angle means exactly one leg runs on each axis. `simplify_polyline` can leave a run
    // with a sub-epsilon drift on its minor axis, so "horizontal" is `|dy| <= eps`, not `dy == 0`.
    let in_h = in_dy.abs() <= eps && in_dx.abs() > eps;
    let in_v = in_dx.abs() <= eps && in_dy.abs() > eps;
    let out_h = out_dy.abs() <= eps && out_dx.abs() > eps;
    let out_v = out_dx.abs() <= eps && out_dy.abs() > eps;
    if !((in_h && out_v) || (in_v && out_h)) {
        return None;
    }

    let len_in = in_dx.hypot(in_dy);
    let len_out = out_dx.hypot(out_dy);
    let cut = corner_cut.min(0.5 * len_in.min(len_out));
    if !cut.is_finite() || cut <= eps {
        return None;
    }

    let entry = Point {
        x: cur.x - in_dx / len_in * cut,
        y: cur.y - in_dy / len_in * cut,
    };
    let exit = Point {
        x: cur.x + out_dx / len_out * cut,
        y: cur.y + out_dy / len_out * cut,
    };
    if nodes.blocks(entry, exit) {
        return None;
    }
    Some((entry, exit))
}

/// True when the segment `a -> b` intersects the closed rectangle `r`.
///
/// The separating-axis form is used rather than the orthogonal predicate in
/// [`crate::geometry`]: that one only handles axis-aligned segments by design, and a chamfer
/// diagonal is precisely the case it declines to answer. Division-free, so a degenerate rectangle
/// or a zero-length segment needs no special case.
///
/// Non-finite input falls through to `true`, which is the safe answer here — it leaves the corner
/// square.
fn segment_hits_rect(a: Point, b: Point, r: &Rect) -> bool {
    let (rx0, rx1) = (r.x.min(r.right()), r.x.max(r.right()));
    let (ry0, ry1) = (r.y.min(r.bottom()), r.y.max(r.bottom()));
    // Axis separation.
    if a.x.max(b.x) < rx0 || a.x.min(b.x) > rx1 {
        return false;
    }
    if a.y.max(b.y) < ry0 || a.y.min(b.y) > ry1 {
        return false;
    }
    // Separation along the segment's own normal: the rectangle misses only when all four corners
    // lie strictly on one side of the segment's supporting line.
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let side = |px: f64, py: f64| dx * (py - a.y) - dy * (px - a.x);
    let s = [
        side(rx0, ry0),
        side(rx1, ry0),
        side(rx0, ry1),
        side(rx1, ry1),
    ];
    !(s.iter().all(|&v| v > 0.0) || s.iter().all(|&v| v < 0.0))
}

/// Cell size for the node index, taken from the mean box extent so the expected candidate count per
/// query stays O(1).
fn mean_extent(rects: &[Rect]) -> f64 {
    let mut sum_w = 0.0;
    let mut sum_h = 0.0;
    let mut n = 0usize;
    for r in rects {
        if r.width.is_finite() && r.height.is_finite() {
            sum_w += r.width.abs();
            sum_h += r.height.abs();
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

/// Inclusive cell range covered by `rect`, or `None` when it is non-finite or spans more than
/// [`MAX_AXIS_CELLS`] cells on either axis.
fn cell_span(rect: &Rect, cell: f64) -> Option<(i64, i64, i64, i64)> {
    let (x0, x1) = axis_cells(rect.x, rect.right(), cell)?;
    let (y0, y1) = axis_cells(rect.y, rect.bottom(), cell)?;
    Some((x0, x1, y0, y1))
}

/// Inclusive cell index range covering `[min(a, b), max(a, b)]`.
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

#[cfg(test)]
mod tests {
    use super::*;

    fn p(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    #[test]
    fn collinear_midpoints_are_dropped_and_endpoints_survive() {
        let pts = [p(0.0, 0.0), p(0.0, 10.0), p(0.0, 20.0), p(0.0, 30.0)];
        let out = simplify_polyline(&pts, 0.001);
        assert_eq!(out, vec![p(0.0, 0.0), p(0.0, 30.0)]);
    }

    #[test]
    fn endpoints_are_preserved_bit_exactly() {
        // The final two points are within epsilon, so the dedupe pass would otherwise keep the
        // *earlier* one. The exact terminal must win.
        let pts = [p(0.0, 0.0), p(0.0, 10.0), p(0.0, 10.0000001)];
        let out = simplify_polyline(&pts, 0.001);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0], pts[0]);
        assert_eq!(out[out.len() - 1], pts[pts.len() - 1]);
    }

    #[test]
    fn corners_are_kept() {
        let pts = [p(0.0, 0.0), p(0.0, 10.0), p(50.0, 10.0), p(50.0, 40.0)];
        let out = simplify_polyline(&pts, 0.001);
        assert_eq!(out, pts.to_vec());
    }

    #[test]
    fn zero_length_steps_are_dropped() {
        let pts = [
            p(0.0, 0.0),
            p(0.0, 10.0),
            p(0.0, 10.0),
            p(30.0, 10.0),
            p(30.0, 10.0),
        ];
        let out = simplify_polyline(&pts, 0.001);
        assert_eq!(out, vec![p(0.0, 0.0), p(0.0, 10.0), p(30.0, 10.0)]);
    }

    #[test]
    fn a_backtracking_spike_is_not_silently_erased() {
        let pts = [p(0.0, 0.0), p(0.0, 10.0), p(0.0, 5.0), p(30.0, 5.0)];
        let out = simplify_polyline(&pts, 0.001);
        assert_eq!(out, pts.to_vec());
    }

    #[test]
    fn diagonal_collinearity_is_handled() {
        let pts = [p(0.0, 0.0), p(5.0, 5.0), p(10.0, 10.0), p(10.0, 20.0)];
        let out = simplify_polyline(&pts, 0.001);
        assert_eq!(out, vec![p(0.0, 0.0), p(10.0, 10.0), p(10.0, 20.0)]);
    }

    #[test]
    fn degenerate_inputs_are_safe() {
        assert!(simplify_polyline(&[], 0.001).is_empty());
        assert_eq!(simplify_polyline(&[p(1.0, 2.0)], 0.001), vec![p(1.0, 2.0)]);
        // Everything collapses onto one location: still a two-point segment, both exact.
        let same = [p(1.0, 2.0), p(1.0, 2.0), p(1.0, 2.0)];
        let out = simplify_polyline(&same, 0.001);
        assert_eq!(out, vec![p(1.0, 2.0), p(1.0, 2.0)]);
    }

    #[test]
    fn non_positive_epsilon_falls_back_to_exact_comparison() {
        let pts = [p(0.0, 0.0), p(0.0, 10.0), p(0.0, 20.0)];
        assert_eq!(
            simplify_polyline(&pts, 0.0),
            vec![p(0.0, 0.0), p(0.0, 20.0)]
        );
        assert_eq!(
            simplify_polyline(&pts, f64::NAN),
            vec![p(0.0, 0.0), p(0.0, 20.0)]
        );
    }

    #[test]
    fn svg_path_is_a_stable_move_then_lines() {
        assert_eq!(points_to_svg_path(&[]), "");
        assert_eq!(points_to_svg_path(&[p(1.5, 2.0)]), "M 1.500 2.000");
        assert_eq!(
            points_to_svg_path(&[p(0.0, 0.0), p(10.0, 0.0), p(10.0, 5.25)]),
            "M 0.000 0.000 L 10.000 0.000 L 10.000 5.250"
        );
    }

    // -----------------------------------------------------------------------------------------
    // Octilinear
    // -----------------------------------------------------------------------------------------

    const EPS: f64 = 0.001;

    fn no_nodes() -> NodeRectIndex {
        NodeRectIndex::new(std::iter::empty())
    }

    fn rect(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect {
            x,
            y,
            width: w,
            height: h,
        }
    }

    fn euclidean_length(points: &[Point]) -> f64 {
        points
            .windows(2)
            .map(|w| (w[1].x - w[0].x).hypot(w[1].y - w[0].y))
            .sum()
    }

    /// Every segment is horizontal, vertical, or exactly 45 degrees.
    fn is_octilinear(points: &[Point]) -> bool {
        points.windows(2).all(|w| {
            let dx = (w[1].x - w[0].x).abs();
            let dy = (w[1].y - w[0].y).abs();
            dx <= EPS || dy <= EPS || (dx - dy).abs() <= EPS
        })
    }

    #[test]
    fn corner_cut_is_driven_by_corner_radius_but_never_below_the_floor() {
        let mut config = CustomLayoutConfig {
            corner_radius: 0.0,
            ..Default::default()
        };
        assert_eq!(octilinear_corner_cut(&config), MIN_CORNER_CUT);
        config.corner_radius = 8.0;
        assert_eq!(octilinear_corner_cut(&config), MIN_CORNER_CUT);
        config.corner_radius = 30.0;
        assert_eq!(octilinear_corner_cut(&config), 30.0);
    }

    #[test]
    fn a_right_angle_becomes_two_points_at_45_degrees() {
        // Legs of 100, so the cut is the full 12 rather than the half-leg clamp.
        let pts = [p(0.0, 0.0), p(0.0, 100.0), p(100.0, 100.0)];
        let out = chamfer_corners(&pts, 12.0, &no_nodes(), EPS);

        assert_eq!(out.len(), 4);
        assert_eq!(out[0], pts[0]);
        assert_eq!(out[3], pts[2]);
        assert_eq!(out[1], p(0.0, 88.0));
        assert_eq!(out[2], p(12.0, 100.0));

        // The replacement segment is a true 45-degree diagonal.
        let dx = out[2].x - out[1].x;
        let dy = out[2].y - out[1].y;
        assert!((dx.abs() - dy.abs()).abs() < 1e-9);
        assert!(is_octilinear(&out));
    }

    #[test]
    fn the_cut_is_clamped_to_half_the_shorter_leg() {
        // Outgoing leg is only 10 long, so every corner cut is capped at 5.
        let pts = [p(0.0, 0.0), p(0.0, 100.0), p(10.0, 100.0)];
        let out = chamfer_corners(&pts, 40.0, &no_nodes(), EPS);
        assert_eq!(out[1], p(0.0, 95.0));
        assert_eq!(out[2], p(5.0, 100.0));
    }

    #[test]
    fn neighbouring_chamfers_never_overlap_on_the_leg_they_share() {
        // The middle leg is 20 long and both corners want a 12 cut; the half-leg clamp holds them
        // to 10 each, so they meet at its midpoint and never cross.
        let pts = [p(0.0, 0.0), p(0.0, 100.0), p(20.0, 100.0), p(20.0, 200.0)];
        let out = chamfer_corners(&pts, 12.0, &no_nodes(), EPS);
        assert_eq!(
            out,
            vec![
                p(0.0, 0.0),
                p(0.0, 90.0),
                p(10.0, 100.0),
                p(10.0, 100.0),
                p(20.0, 110.0),
                p(20.0, 200.0),
            ]
        );
        // Monotone in x along the shared leg: no backtracking was introduced.
        assert!(out.windows(2).all(|w| w[1].x >= w[0].x - 1e-9));
    }

    #[test]
    fn a_corner_next_to_a_node_stays_square() {
        // The corner at (0, 100) turns toward a node that sits immediately along the outgoing leg,
        // so the diagonal would clip it.
        let pts = [p(0.0, 0.0), p(0.0, 100.0), p(100.0, 100.0)];
        let blocked = NodeRectIndex::new([rect(4.0, 86.0, 30.0, 20.0)]);
        assert_eq!(chamfer_corners(&pts, 12.0, &blocked, EPS), pts.to_vec());

        // Moving the same node clear of the chamfer triangle lets the corner cut again.
        let clear = NodeRectIndex::new([rect(400.0, 400.0, 30.0, 20.0)]);
        assert_eq!(chamfer_corners(&pts, 12.0, &clear, EPS).len(), 4);
    }

    #[test]
    fn one_blocked_corner_does_not_stop_the_others() {
        let pts = [p(0.0, 0.0), p(0.0, 100.0), p(200.0, 100.0), p(200.0, 300.0)];
        // Sits on the second corner's chamfer only.
        let nodes = NodeRectIndex::new([rect(186.0, 104.0, 20.0, 20.0)]);
        let out = chamfer_corners(&pts, 12.0, &nodes, EPS);
        // First corner chamfered (2 points), second left square (1 point), plus both endpoints.
        assert_eq!(out.len(), 5);
        assert!(out.contains(&p(200.0, 100.0)));
        assert!(is_octilinear(&out));
    }

    #[test]
    fn total_length_never_exceeds_the_orthogonal_length() {
        let pts = [
            p(0.0, 0.0),
            p(0.0, 120.0),
            p(180.0, 120.0),
            p(180.0, 260.0),
            p(60.0, 260.0),
            p(60.0, 400.0),
        ];
        let out = chamfer_corners(&pts, 12.0, &no_nodes(), EPS);
        assert!(out.len() > pts.len());
        assert!(euclidean_length(&out) <= euclidean_length(&pts) + 1e-9);
        // Four corners, each saving c * (2 - sqrt(2)).
        let expected_saving = 4.0 * 12.0 * (2.0 - 2f64.sqrt());
        assert!(
            (euclidean_length(&pts) - euclidean_length(&out) - expected_saving).abs() < 1e-9,
            "{} vs {}",
            euclidean_length(&pts),
            euclidean_length(&out)
        );
    }

    #[test]
    fn endpoints_survive_bit_exactly_even_when_the_first_corner_is_chamfered() {
        let pts = [p(1.25, 2.5), p(1.25, 40.0), p(90.0, 40.0), p(90.0, 77.75)];
        let out = chamfer_corners(&pts, 12.0, &no_nodes(), EPS);
        assert_eq!(out[0], pts[0]);
        assert_eq!(out[out.len() - 1], pts[pts.len() - 1]);
    }

    #[test]
    fn collinear_and_diagonal_vertices_are_left_alone() {
        // Already-collinear: no corner to cut.
        let straight = [p(0.0, 0.0), p(0.0, 50.0), p(0.0, 100.0)];
        assert_eq!(
            chamfer_corners(&straight, 12.0, &no_nodes(), EPS),
            straight.to_vec()
        );
        // Already diagonal: neither leg is axis-aligned, so this is not a right angle.
        let diagonal = [p(0.0, 0.0), p(50.0, 50.0), p(100.0, 0.0)];
        assert_eq!(
            chamfer_corners(&diagonal, 12.0, &no_nodes(), EPS),
            diagonal.to_vec()
        );
    }

    #[test]
    fn degenerate_inputs_return_the_input_unchanged() {
        assert!(chamfer_corners(&[], 12.0, &no_nodes(), EPS).is_empty());
        let two = [p(0.0, 0.0), p(10.0, 0.0)];
        assert_eq!(chamfer_corners(&two, 12.0, &no_nodes(), EPS), two.to_vec());

        let corner = [p(0.0, 0.0), p(0.0, 100.0), p(100.0, 100.0)];
        // A non-positive or non-finite cut is a no-op rather than a panic.
        assert_eq!(
            chamfer_corners(&corner, 0.0, &no_nodes(), EPS),
            corner.to_vec()
        );
        assert_eq!(
            chamfer_corners(&corner, f64::NAN, &no_nodes(), EPS),
            corner.to_vec()
        );
        // Legs shorter than epsilon leave nothing worth cutting.
        let tiny = [p(0.0, 0.0), p(0.0, 0.0005), p(0.0005, 0.0005)];
        assert_eq!(
            chamfer_corners(&tiny, 12.0, &no_nodes(), EPS),
            tiny.to_vec()
        );
    }

    #[test]
    fn a_non_finite_point_leaves_its_corners_square() {
        let pts = [
            p(0.0, 0.0),
            p(0.0, 100.0),
            p(f64::NAN, 100.0),
            p(200.0, 300.0),
        ];
        let out = chamfer_corners(&pts, 12.0, &no_nodes(), EPS);
        assert_eq!(out[0], pts[0]);
        assert_eq!(out[out.len() - 1], pts[pts.len() - 1]);
        assert!(out.iter().any(|q| q.x.is_nan()));
    }

    #[test]
    fn chamfering_is_deterministic_across_repeated_runs() {
        let pts = [
            p(0.0, 0.0),
            p(0.0, 120.0),
            p(180.0, 120.0),
            p(180.0, 260.0),
            p(60.0, 260.0),
        ];
        let nodes = NodeRectIndex::new((0..64).map(|i| {
            let f = i as f64;
            rect(f * 37.0 - 300.0, f * 19.0 - 200.0, 40.0, 24.0)
        }));
        let first = chamfer_corners(&pts, 12.0, &nodes, EPS);
        for _ in 0..8 {
            assert_eq!(chamfer_corners(&pts, 12.0, &nodes, EPS), first);
        }
    }

    #[test]
    fn node_index_reports_hits_and_misses_including_unbucketable_boxes() {
        let index = NodeRectIndex::new([rect(0.0, 0.0, 100.0, 50.0)]);
        assert_eq!(index.len(), 1);
        assert!(!index.is_empty());
        // Straight through the middle.
        assert!(index.blocks(p(-50.0, 25.0), p(150.0, 25.0)));
        // Diagonal clipping the bottom-right corner.
        assert!(index.blocks(p(90.0, 60.0), p(110.0, 40.0)));
        // Clear of the box even after the clearance margin.
        assert!(!index.blocks(p(-50.0, -50.0), p(-10.0, -10.0)));
        // Just outside the raw box but inside the clearance margin: rejected on purpose.
        assert!(index.blocks(p(101.0, 25.0), p(101.5, 26.0)));

        // A box too large to bucket is tested by every query.
        let huge = NodeRectIndex::new([rect(-5.0e6, 0.0, 1.0e7, 10.0)]);
        assert!(huge.blocks(p(0.0, 0.0), p(1.0, 1.0)));
        assert!(!huge.blocks(p(0.0, 900.0), p(1.0, 901.0)));

        assert!(no_nodes().is_empty());
        assert!(!no_nodes().blocks(p(0.0, 0.0), p(10.0, 10.0)));
    }

    #[test]
    fn a_non_finite_node_box_poisons_the_index_and_blocks_every_chamfer() {
        let index = NodeRectIndex::new([rect(f64::NAN, 0.0, 10.0, 10.0)]);
        assert!(index.blocks(p(0.0, 0.0), p(1.0, 1.0)));
        let pts = [p(0.0, 0.0), p(0.0, 100.0), p(100.0, 100.0)];
        assert_eq!(chamfer_corners(&pts, 12.0, &index, EPS), pts.to_vec());
    }

    /// End-to-end: the whole pipeline under `EdgeStyle::Octilinear` must keep every guarantee the
    /// audit gates on. This is the pass that would notice a chamfer cutting through a node.
    #[test]
    fn the_full_pipeline_stays_clean_and_deterministic_under_octilinear() {
        use crate::config::{EdgeStyle, EngineMode};
        use crate::types::{NormalizedEdge, NormalizedNode};

        let node = |id: &str| NormalizedNode {
            id: id.to_string(),
            label: Some(id.to_string()),
            width: 140.0,
            height: 76.0,
            rank: None,
            group: None,
        };
        let edge = |i: usize, s: &str, t: &str, label: Option<&str>| NormalizedEdge {
            id: format!("e{}", i),
            source: s.to_string(),
            target: t.to_string(),
            label: label.map(str::to_string),
            is_cycle: None,
            layout_role: None,
            weight: None,
            min_len: None,
            label_width: label.map(|_| 90.0),
            label_height: label.map(|_| 28.0),
        };

        // Fan-out, a long span, a reconvergence and a labelled edge: enough shape to produce
        // corners in several channels at once.
        let ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
        let nodes: Vec<NormalizedNode> = ids.iter().map(|i| node(i)).collect();
        let wiring = [
            ("a", "b", None),
            ("a", "c", Some("retry")),
            ("a", "d", None),
            ("b", "e", None),
            ("c", "e", None),
            ("d", "f", None),
            ("e", "g", None),
            ("f", "g", Some("merge")),
            ("a", "h", None),
            ("g", "h", None),
        ];
        let edges: Vec<NormalizedEdge> = wiring
            .iter()
            .enumerate()
            .map(|(i, &(s, t, l))| edge(i, s, t, l))
            .collect();

        let config = CustomLayoutConfig {
            edge_style: EdgeStyle::Octilinear,
            ..Default::default()
        };

        let result = crate::compute_layout(&nodes, &edges, &config, EngineMode::Layered);
        let m = &result.validation.metrics;
        assert_eq!(m.node_node_overlaps, 0);
        assert_eq!(m.edge_node_penetrations, 0);
        assert_eq!(m.badge_node_overlaps, 0);
        assert_eq!(m.badge_badge_overlaps, 0);
        assert_eq!(m.unresolved_route_count, 0);
        assert_eq!(m.unresolved_badge_count, 0);
        assert!(
            result.validation.is_valid,
            "diagnostics: {:?}",
            result.validation.diagnostics
        );
        assert_eq!(result.edges.len(), edges.len());

        // At least one corner was actually chamfered, or this test proves nothing.
        let diagonals = result
            .edges
            .iter()
            .flat_map(|r| r.points.windows(2))
            .filter(|w| (w[1].x - w[0].x).abs() > 1.0 && (w[1].y - w[0].y).abs() > 1.0)
            .count();
        assert!(diagonals > 0, "octilinear produced no diagonal segments");

        let again = crate::compute_layout(&nodes, &edges, &config, EngineMode::Layered);
        for (a, b) in result.edges.iter().zip(again.edges.iter()) {
            assert_eq!(a.edge_id, b.edge_id);
            assert_eq!(a.points, b.points);
        }
    }
}
