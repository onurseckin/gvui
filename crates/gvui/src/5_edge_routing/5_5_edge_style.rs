//! # Step 5.5 (Phase 8d/8e): Polyline post-processing
//!
//! Two pure functions applied after a route has been materialised. Neither makes a layout decision;
//! they exist so the routers can emit the naive point sequence (port, stub, channel corner, channel
//! corner, band entry, band exit, ...) without worrying about redundancy.
//!
//! Corner rounding deliberately does **not** live here. Rounding is a path-string transformation
//! with zero layout consequence, so it is applied on the TypeScript side where `corner_radius` can
//! change without triggering a re-layout. [`points_to_svg_path`] exists only so the native audit
//! harness can render the same geometry the browser does.

use crate::types::Point;

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
}
