//! # Step 7.1: The layered engine
//!
//! Runs Phases 0 -> 9 in order and returns the wire payload. This is the only engine that uses the
//! layered pipeline; the other three are geometric and share [`super::organic`]'s emit path.
//!
//! ## Direction is a coordinate frame, not an engine
//!
//! v1 shipped a second, hand-written implementation for left-to-right flow plus a result
//! transposer, and the two drifted. v2 has exactly one pipeline, which works **only** in a
//! top-down frame: ranks increase with `y`, an item's along-rank extent is its `width`.
//!
//! Every other direction is that one pipeline plus an affine change of frame:
//!
//! | direction | in | out |
//! | --- | --- | --- |
//! | `TopDown` | — | — |
//! | `BottomUp` | — | [`mirror_result`] on the vertical axis |
//! | `LeftRight` | swap every box's `(w, h)` | [`transpose_result`] |
//! | `RightLeft` | swap every box's `(w, h)` | [`transpose_result`] then [`mirror_result`] on the horizontal axis |
//!
//! Because the boxes are swapped *before* ingest, every clamp, separation and lane count that the
//! pipeline computes is already expressed in the frame it is drawn in. Nothing downstream needs to
//! know the direction. The one contract subtlety this creates is called out on
//! [`transpose_nodes`].
//!
//! ## Edge style
//!
//! [`crate::config::EdgeStyle::Spline`] is not a different layout — the waypoints are identical and
//! only the renderer's path command differs. `EngineMode::LayeredSpline` therefore resolves to this
//! same function.

use crate::config::{CustomLayoutConfig, Direction};
use crate::step0_common::ingest::build_graph_ir;
use crate::step1_cycle_breaking::analyze_structure;
use crate::step2_rank_assignment::assign_ranks;
use crate::step3_crossing_minimization::{build_layered, order_layers};
use crate::step4_coordinate_assignment::{assign_coordinates, compute_routing_demand};
use crate::step5_edge_routing::route_edges;
use crate::step6_validation::emit::emit_result;
use crate::types::{
    get_now_ms, CustomLayoutResult, NormalizedEdge, NormalizedNode, OptimizationStats,
    PhaseTimings, Point, PortRef, Rect, Side,
};

/// Which axis a [`mirror_result`] reflection runs across.
///
/// The rank axis is `y` in the top-down frame and `x` after transposition, so `BottomUp` uses
/// [`MirrorAxis::Vertical`] and `RightLeft` uses [`MirrorAxis::Horizontal`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MirrorAxis {
    /// Reflect `y`; ports on `Top`/`Bottom` swap, `Left`/`Right` are unaffected.
    Vertical,
    /// Reflect `x`; ports on `Left`/`Right` swap, `Top`/`Bottom` are unaffected.
    Horizontal,
}

/// Lays a graph out with the full layered pipeline.
///
/// Never fails and never retries: every phase is correct by construction with respect to the
/// constraints its successors cannot repair, so there is no outer loop to re-enter. A malformed
/// edge is dropped during ingest and reported through `validation.diagnostics` rather than
/// aborting the drawing.
///
/// Returns [`CustomLayoutResult::empty`] with `stop_reason = "empty_graph"` when there is nothing
/// to draw — including the case where every supplied node was dropped as a duplicate.
pub fn layout_layered(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    config: &CustomLayoutConfig,
) -> CustomLayoutResult {
    if nodes.is_empty() {
        return CustomLayoutResult::empty("empty_graph");
    }

    let t_start = get_now_ms();
    let mut timings = PhaseTimings::default();
    let direction = config.direction;

    // Owned only when the frame actually changes; `TopDown`/`BottomUp` borrow the caller's slices.
    let transposed_input = if direction.is_horizontal() {
        Some((transpose_nodes(nodes), transpose_edges(edges)))
    } else {
        None
    };
    let (nodes_in, edges_in): (&[NormalizedNode], &[NormalizedEdge]) = match &transposed_input {
        Some((n, e)) => (n.as_slice(), e.as_slice()),
        None => (nodes, edges),
    };

    // ---- Phase 0: ingest ----------------------------------------------------------------------
    let t = get_now_ms();
    let ir = build_graph_ir(nodes_in, edges_in, config);
    timings.ingest = get_now_ms() - t;

    if ir.node_count() == 0 {
        return CustomLayoutResult::empty("empty_graph");
    }

    // ---- Phase 2: structure -------------------------------------------------------------------
    let t = get_now_ms();
    let structure = analyze_structure(&ir);
    timings.structure = get_now_ms() - t;

    // ---- Phase 3: rank ------------------------------------------------------------------------
    let t = get_now_ms();
    let ranks = assign_ranks(&ir, &structure, config);
    timings.rank = get_now_ms() - t;

    // ---- Phase 4: layer -----------------------------------------------------------------------
    let t = get_now_ms();
    let mut layered = build_layered(&ir, &structure, &ranks, config);
    timings.layer = get_now_ms() - t;

    // ---- Phase 5: order -----------------------------------------------------------------------
    let t = get_now_ms();
    let outcome = order_layers(&mut layered, config);
    timings.order = get_now_ms() - t;

    // ---- Phase 6: routing demand --------------------------------------------------------------
    let t = get_now_ms();
    let demand = compute_routing_demand(&layered, &ir, config);
    timings.demand = get_now_ms() - t;

    // ---- Phase 7: coordinates -----------------------------------------------------------------
    // The band tops come back from `assign_coordinates` because only it knows the final coordinate
    // space: it translates the whole drawing to `graph_padding` after the bands are computed.
    // Recomputing them separately beforehand looks idempotent but is not — the tops would be in
    // pre-translation space, putting every routing channel inside the nodes.
    let t = get_now_ms();
    let rank_tops = assign_coordinates(&mut layered, &demand, config);
    timings.coordinates = get_now_ms() - t;

    // ---- Phase 8: route -----------------------------------------------------------------------
    let t = get_now_ms();
    let routes = route_edges(&layered, &ir, &demand, &rank_tops, config);
    timings.route = get_now_ms() - t;

    // The budget is measured against the whole pipeline rather than asked of the ordering phase:
    // "we ran out of time" is a property of the run, and this keeps the reason honest even when a
    // later phase is the slow one.
    let elapsed_before_emit = get_now_ms() - t_start;
    let stop_reason = if outcome.crossings == 0 {
        "ordering-converged"
    } else if elapsed_before_emit >= config.time_budget_ms {
        "time-budget"
    } else {
        "local-optimum"
    };

    let stats = OptimizationStats {
        global_passes: outcome.sweeps_executed,
        evaluated_port_states: outcome.seeds_evaluated,
        // Spacing is exact in v2 — Phase 6 reserves it before any geometry exists — so nothing is
        // ever widened after the fact. The counter survives only for renderer compatibility.
        spacing_expansions: 0,
        duration_ms: elapsed_before_emit,
        stop_reason: stop_reason.to_string(),
        timings,
    };

    // ---- Phase 9: emit ------------------------------------------------------------------------
    let t = get_now_ms();
    let mut result = emit_result(
        &ir,
        &layered,
        routes,
        &demand,
        outcome.crossings,
        stats,
        config,
    );
    let emit_ms = get_now_ms() - t;

    // ---- change of frame ----------------------------------------------------------------------
    if direction.is_horizontal() {
        transpose_result(&mut result);
    }
    if direction.is_reversed() {
        mirror_result(
            &mut result,
            if direction.is_horizontal() {
                MirrorAxis::Horizontal
            } else {
                MirrorAxis::Vertical
            },
        );
    }

    result.optimization_stats.timings.emit = emit_ms;
    let total = get_now_ms() - t_start;
    result.optimization_stats.timings.total = total;
    result.optimization_stats.duration_ms = total;
    result
}

// =============================================================================================
// Frame changes
// =============================================================================================

/// Swaps every node's `width` and `height` so the pipeline can treat a left-right flow as a
/// top-down one.
///
/// **Contract subtlety.** The clamps `min_node_width`/`max_node_width` and the port-pitch driven
/// width growth all run inside ingest, i.e. *after* this swap, so in `LeftRight`/`RightLeft` they
/// constrain what the viewer perceives as node **height**. That is deliberate: those knobs bound
/// the along-rank extent, which is the axis ports are distributed along, and it is the axis that
/// has to grow when a node is busy. A caller who wants a hard bound on the drawn horizontal size
/// in LR mode must clamp the input boxes themselves.
pub fn transpose_nodes(nodes: &[NormalizedNode]) -> Vec<NormalizedNode> {
    nodes
        .iter()
        .map(|n| {
            let mut out = n.clone();
            out.width = n.height;
            out.height = n.width;
            out
        })
        .collect()
}

/// Swaps every edge's measured badge box for the same reason as [`transpose_nodes`].
///
/// A badge that is only partially measured (one of the two dimensions absent) is carried through
/// untouched, because swapping half a box would silently invent the other half; ingest's character
/// estimate then applies in the layered frame, which is the same fallback a top-down run gets.
pub fn transpose_edges(edges: &[NormalizedEdge]) -> Vec<NormalizedEdge> {
    edges
        .iter()
        .map(|e| {
            let mut out = e.clone();
            if let (Some(w), Some(h)) = (e.label_width, e.label_height) {
                out.label_width = Some(h);
                out.label_height = Some(w);
            }
            out
        })
        .collect()
}

/// Reflects the drawing through the line `x = y`, turning a top-down layout into a left-right one.
///
/// Every emitted coordinate is affected — node boxes, route points, ports, badge rects, badge
/// anchors, leader polylines and recorded crossings — and every port side is rotated with
/// [`Side::transposed`]. `rank`/`order` are left alone: they are layered-space integers, not
/// geometry, and the renderer uses them for grouping rather than for placement.
///
/// The drawing's top-left corner is invariant under this map because ingest places it at
/// `(graph_padding, graph_padding)`, so the outer margin survives unchanged.
pub fn transpose_result(result: &mut CustomLayoutResult) {
    for n in &mut result.nodes {
        std::mem::swap(&mut n.x, &mut n.y);
        std::mem::swap(&mut n.width, &mut n.height);
    }
    for e in &mut result.edges {
        for p in &mut e.points {
            swap_point(p);
        }
        transpose_port(&mut e.source_port);
        transpose_port(&mut e.target_port);
    }
    for b in &mut result.badges {
        swap_rect(&mut b.rect);
        swap_point(&mut b.anchor_point);
        if let Some(pts) = b.leader_points.as_mut() {
            for p in pts {
                swap_point(p);
            }
        }
    }
    for c in &mut result.crossings {
        swap_point(&mut c.point);
    }
    for c in &mut result.validation.crossings {
        swap_point(&mut c.point);
    }
    // Area is invariant under transposition; the aspect ratio is its own reciprocal.
    let ratio = result.validation.metrics.aspect_ratio;
    if ratio.is_finite() && ratio > 0.0 {
        result.validation.metrics.aspect_ratio = 1.0 / ratio;
    }
}

/// Reflects the drawing across the midline of its own bounding box on `axis`.
///
/// Reflecting about the box midline rather than about the origin is what keeps the result inside
/// the same rectangle, so `graph_padding` is preserved on all four sides and no renormalization
/// pass is needed.
///
/// Only the port sides *perpendicular* to `axis` are swapped. A vertical mirror moves a bottom port
/// to the top but leaves a left port on the left; blanket-applying [`Side::opposite`] would flip
/// sides the reflection never touched and put flat-edge ports on the wrong faces.
///
/// Polyline point order is **not** reversed: the source-to-target direction is a property of the
/// edge, not of the coordinate frame.
pub fn mirror_result(result: &mut CustomLayoutResult, axis: MirrorAxis) {
    let Some((min_v, max_v)) = drawing_extent(result, axis) else {
        return;
    };
    let sum = min_v + max_v;

    for n in &mut result.nodes {
        match axis {
            MirrorAxis::Vertical => n.y = sum - (n.y + n.height),
            MirrorAxis::Horizontal => n.x = sum - (n.x + n.width),
        }
    }
    for e in &mut result.edges {
        for p in &mut e.points {
            mirror_point(p, axis, sum);
        }
        mirror_port(&mut e.source_port, axis, sum);
        mirror_port(&mut e.target_port, axis, sum);
    }
    for b in &mut result.badges {
        match axis {
            MirrorAxis::Vertical => b.rect.y = sum - (b.rect.y + b.rect.height),
            MirrorAxis::Horizontal => b.rect.x = sum - (b.rect.x + b.rect.width),
        }
        mirror_point(&mut b.anchor_point, axis, sum);
        if let Some(pts) = b.leader_points.as_mut() {
            for p in pts {
                mirror_point(p, axis, sum);
            }
        }
    }
    for c in &mut result.crossings {
        mirror_point(&mut c.point, axis, sum);
    }
    for c in &mut result.validation.crossings {
        mirror_point(&mut c.point, axis, sum);
    }
}

/// `(min, max)` of the drawing along `axis`, or `None` when there is no finite geometry to mirror.
fn drawing_extent(result: &CustomLayoutResult, axis: MirrorAxis) -> Option<(f64, f64)> {
    let mut min_v = f64::INFINITY;
    let mut max_v = f64::NEG_INFINITY;
    let mut span = |lo: f64, hi: f64| {
        if lo.is_finite() && hi.is_finite() {
            min_v = min_v.min(lo);
            max_v = max_v.max(hi);
        }
    };

    for n in &result.nodes {
        match axis {
            MirrorAxis::Vertical => span(n.y, n.y + n.height),
            MirrorAxis::Horizontal => span(n.x, n.x + n.width),
        }
    }
    for e in &result.edges {
        for p in &e.points {
            match axis {
                MirrorAxis::Vertical => span(p.y, p.y),
                MirrorAxis::Horizontal => span(p.x, p.x),
            }
        }
    }
    for b in &result.badges {
        match axis {
            MirrorAxis::Vertical => span(b.rect.y, b.rect.y + b.rect.height),
            MirrorAxis::Horizontal => span(b.rect.x, b.rect.x + b.rect.width),
        }
    }

    if min_v <= max_v {
        Some((min_v, max_v))
    } else {
        None
    }
}

fn swap_point(p: &mut Point) {
    std::mem::swap(&mut p.x, &mut p.y);
}

fn swap_rect(r: &mut Rect) {
    std::mem::swap(&mut r.x, &mut r.y);
    std::mem::swap(&mut r.width, &mut r.height);
}

fn transpose_port(p: &mut PortRef) {
    swap_point(&mut p.point);
    swap_point(&mut p.stub);
    p.side = p.side.transposed();
}

fn mirror_point(p: &mut Point, axis: MirrorAxis, sum: f64) {
    match axis {
        MirrorAxis::Vertical => p.y = sum - p.y,
        MirrorAxis::Horizontal => p.x = sum - p.x,
    }
}

fn mirror_port(p: &mut PortRef, axis: MirrorAxis, sum: f64) {
    mirror_point(&mut p.point, axis, sum);
    mirror_point(&mut p.stub, axis, sum);
    p.side = mirrored_side(p.side, axis);
}

/// The side a port lands on after reflecting across `axis`. Sides parallel to the mirror are fixed
/// points of the map.
fn mirrored_side(side: Side, axis: MirrorAxis) -> Side {
    match (axis, side) {
        (MirrorAxis::Vertical, Side::Top) => Side::Bottom,
        (MirrorAxis::Vertical, Side::Bottom) => Side::Top,
        (MirrorAxis::Horizontal, Side::Left) => Side::Right,
        (MirrorAxis::Horizontal, Side::Right) => Side::Left,
        (_, other) => other,
    }
}

/// True when `direction` needs the input boxes transposed. Exposed so the facade can document the
/// frame without duplicating the rule.
pub fn needs_transposed_input(direction: Direction) -> bool {
    direction.is_horizontal()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Direction, DEFAULT_CUSTOM_LAYOUT_CONFIG};
    use crate::types::{
        BadgePlacement, EdgeCrossing, LayoutMetrics, LayoutValidationResult, PositionedNode,
        RoutedPath,
    };

    fn node(id: &str, w: f64, h: f64) -> NormalizedNode {
        NormalizedNode {
            id: id.to_string(),
            label: Some(id.to_string()),
            width: w,
            height: h,
            rank: None,
            group: None,
        }
    }

    fn edge(id: &str, s: &str, t: &str) -> NormalizedEdge {
        NormalizedEdge {
            id: id.to_string(),
            source: s.to_string(),
            target: t.to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
            weight: None,
            min_len: None,
            label_width: None,
            label_height: None,
        }
    }

    /// `(width, height)` of the union of every node box.
    fn node_bbox(r: &CustomLayoutResult) -> (f64, f64) {
        let mut min_x = f64::INFINITY;
        let mut min_y = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        let mut max_y = f64::NEG_INFINITY;
        for n in &r.nodes {
            min_x = min_x.min(n.x);
            min_y = min_y.min(n.y);
            max_x = max_x.max(n.x + n.width);
            max_y = max_y.max(n.y + n.height);
        }
        if min_x > max_x {
            return (0.0, 0.0);
        }
        (max_x - min_x, max_y - min_y)
    }

    fn chain(len: usize) -> (Vec<NormalizedNode>, Vec<NormalizedEdge>) {
        let nodes: Vec<NormalizedNode> = (0..len)
            .map(|i| node(&format!("n{}", i), 160.0, 60.0))
            .collect();
        let edges: Vec<NormalizedEdge> = (0..len.saturating_sub(1))
            .map(|i| {
                edge(
                    &format!("e{}", i),
                    &format!("n{}", i),
                    &format!("n{}", i + 1),
                )
            })
            .collect();
        (nodes, edges)
    }

    fn port(side: Side, x: f64, y: f64) -> PortRef {
        PortRef {
            node_id: "n".to_string(),
            side,
            index: 0,
            point: Point { x, y },
            stub: Point {
                x: x + 1.0,
                y: y + 2.0,
            },
        }
    }

    fn sample_result() -> CustomLayoutResult {
        CustomLayoutResult {
            nodes: vec![
                PositionedNode {
                    id: "a".to_string(),
                    label: None,
                    x: 10.0,
                    y: 20.0,
                    width: 100.0,
                    height: 40.0,
                    rank: 0,
                    order: 0,
                },
                PositionedNode {
                    id: "b".to_string(),
                    label: None,
                    x: 10.0,
                    y: 120.0,
                    width: 60.0,
                    height: 30.0,
                    rank: 1,
                    order: 0,
                },
            ],
            edges: vec![RoutedPath {
                edge_id: "e".to_string(),
                points: vec![Point { x: 60.0, y: 60.0 }, Point { x: 40.0, y: 120.0 }],
                source_port: port(Side::Bottom, 60.0, 60.0),
                target_port: port(Side::Top, 40.0, 120.0),
            }],
            badges: vec![BadgePlacement {
                edge_id: "e".to_string(),
                label: "x".to_string(),
                rect: Rect {
                    x: 70.0,
                    y: 80.0,
                    width: 40.0,
                    height: 20.0,
                },
                anchor_point: Point { x: 50.0, y: 90.0 },
                leader_points: Some(vec![Point { x: 50.0, y: 90.0 }, Point { x: 90.0, y: 90.0 }]),
            }],
            crossings: vec![EdgeCrossing {
                edge_id_a: "e".to_string(),
                edge_id_b: "f".to_string(),
                point: Point { x: 55.0, y: 90.0 },
                bridge_owner_edge_id: None,
            }],
            validation: LayoutValidationResult {
                is_valid: true,
                metrics: LayoutMetrics {
                    aspect_ratio: 2.0,
                    ..LayoutMetrics::default()
                },
                crossings: Vec::new(),
                diagnostics: Vec::new(),
            },
            status: "success".to_string(),
            optimization_stats: OptimizationStats::default(),
        }
    }

    #[test]
    fn empty_input_is_an_empty_graph() {
        let out = layout_layered(&[], &[], &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        assert!(out.nodes.is_empty());
        assert!(out.edges.is_empty());
        assert_eq!(out.optimization_stats.stop_reason, "empty_graph");
        assert!(out.validation.is_valid);
    }

    #[test]
    fn transpose_nodes_swaps_boxes_and_keeps_identity() {
        let src = vec![node("a", 200.0, 50.0)];
        let out = transpose_nodes(&src);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].id, "a");
        assert_eq!(out[0].width, 50.0);
        assert_eq!(out[0].height, 200.0);
    }

    #[test]
    fn transpose_edges_swaps_only_fully_measured_badges() {
        let mut full = edge("e0", "a", "b");
        full.label_width = Some(84.0);
        full.label_height = Some(28.0);
        let mut half = edge("e1", "a", "b");
        half.label_width = Some(84.0);

        let out = transpose_edges(&[full, half]);
        assert_eq!(out[0].label_width, Some(28.0));
        assert_eq!(out[0].label_height, Some(84.0));
        // A half-measured badge must not be "completed" by the swap.
        assert_eq!(out[1].label_width, Some(84.0));
        assert_eq!(out[1].label_height, None);
    }

    #[test]
    fn transpose_result_reflects_every_coordinate_family() {
        let mut r = sample_result();
        transpose_result(&mut r);

        assert_eq!((r.nodes[0].x, r.nodes[0].y), (20.0, 10.0));
        assert_eq!((r.nodes[0].width, r.nodes[0].height), (40.0, 100.0));
        assert_eq!(r.edges[0].points[0], Point { x: 60.0, y: 60.0 });
        assert_eq!(r.edges[0].points[1], Point { x: 120.0, y: 40.0 });
        assert_eq!(r.edges[0].source_port.side, Side::Right);
        assert_eq!(r.edges[0].target_port.side, Side::Left);
        assert_eq!(r.badges[0].rect.x, 80.0);
        assert_eq!(r.badges[0].rect.y, 70.0);
        assert_eq!(r.badges[0].rect.width, 20.0);
        assert_eq!(r.badges[0].rect.height, 40.0);
        assert_eq!(r.badges[0].anchor_point, Point { x: 90.0, y: 50.0 });
        assert_eq!(
            r.badges[0].leader_points.as_ref().map(|p| p[1]),
            Some(Point { x: 90.0, y: 90.0 })
        );
        assert_eq!(r.crossings[0].point, Point { x: 90.0, y: 55.0 });
        assert_eq!(r.validation.metrics.aspect_ratio, 0.5);
    }

    #[test]
    fn transpose_result_is_an_involution() {
        let original = sample_result();
        let mut twice = sample_result();
        transpose_result(&mut twice);
        transpose_result(&mut twice);

        assert_eq!(twice.nodes[0].x, original.nodes[0].x);
        assert_eq!(twice.nodes[0].y, original.nodes[0].y);
        assert_eq!(twice.nodes[0].width, original.nodes[0].width);
        assert_eq!(twice.edges[0].points, original.edges[0].points);
        assert_eq!(
            twice.edges[0].source_port.side,
            original.edges[0].source_port.side
        );
        assert_eq!(
            twice.validation.metrics.aspect_ratio,
            original.validation.metrics.aspect_ratio
        );
    }

    #[test]
    fn vertical_mirror_preserves_the_bounding_box() {
        let mut r = sample_result();
        let before = node_bbox(&r);
        mirror_result(&mut r, MirrorAxis::Vertical);
        let after = node_bbox(&r);
        assert!((before.0 - after.0).abs() < 1e-9);
        assert!((before.1 - after.1).abs() < 1e-9);
    }

    #[test]
    fn vertical_mirror_flips_rank_order_and_only_rank_axis_sides() {
        let mut r = sample_result();
        // `a` is above `b` before mirroring; it must be below afterwards.
        assert!(r.nodes[0].y < r.nodes[1].y);
        r.edges[0].source_port.side = Side::Left;
        mirror_result(&mut r, MirrorAxis::Vertical);
        assert!(r.nodes[0].y > r.nodes[1].y);
        // A left port is parallel to the mirror axis and must not move.
        assert_eq!(r.edges[0].source_port.side, Side::Left);
        assert_eq!(r.edges[0].target_port.side, Side::Bottom);
    }

    #[test]
    fn horizontal_mirror_swaps_only_left_and_right() {
        let mut r = sample_result();
        r.edges[0].source_port.side = Side::Right;
        r.edges[0].target_port.side = Side::Top;
        mirror_result(&mut r, MirrorAxis::Horizontal);
        assert_eq!(r.edges[0].source_port.side, Side::Left);
        assert_eq!(r.edges[0].target_port.side, Side::Top);
    }

    #[test]
    fn mirror_of_an_empty_drawing_is_a_no_op() {
        let mut r = CustomLayoutResult::empty("empty_graph");
        mirror_result(&mut r, MirrorAxis::Vertical);
        assert!(r.nodes.is_empty());
    }

    #[test]
    fn every_node_and_edge_is_positioned() {
        let (nodes, edges) = chain(5);
        let out = layout_layered(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        assert_eq!(out.nodes.len(), nodes.len());
        assert_eq!(out.edges.len(), edges.len());
        assert!(out.nodes.iter().all(|n| n.x.is_finite() && n.y.is_finite()));
    }

    #[test]
    fn layout_is_deterministic_across_runs() {
        let (nodes, edges) = chain(6);
        let a = layout_layered(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        let b = layout_layered(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        let ja = serde_json::to_string(&a.nodes).unwrap_or_default();
        let jb = serde_json::to_string(&b.nodes).unwrap_or_default();
        assert_eq!(ja, jb);
        let ea = serde_json::to_string(&a.edges).unwrap_or_default();
        let eb = serde_json::to_string(&b.edges).unwrap_or_default();
        assert_eq!(ea, eb);
    }

    #[test]
    fn top_down_is_tall_and_left_right_is_wide() {
        let (nodes, edges) = chain(6);

        let mut td = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        td.direction = Direction::TopDown;
        let (w_td, h_td) = node_bbox(&layout_layered(&nodes, &edges, &td));
        assert!(
            h_td > w_td,
            "top-down chain must be taller than wide: {w_td}x{h_td}"
        );

        let mut lr = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        lr.direction = Direction::LeftRight;
        let (w_lr, h_lr) = node_bbox(&layout_layered(&nodes, &edges, &lr));
        assert!(
            w_lr > h_lr,
            "left-right chain must be wider than tall: {w_lr}x{h_lr}"
        );
    }

    #[test]
    fn bottom_up_reverses_the_rank_axis() {
        let (nodes, edges) = chain(4);
        let mut td = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        td.direction = Direction::TopDown;
        let a = layout_layered(&nodes, &edges, &td);

        let mut bu = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        bu.direction = Direction::BottomUp;
        let b = layout_layered(&nodes, &edges, &bu);

        let first_a = a.nodes.iter().find(|n| n.id == "n0").map(|n| n.y);
        let last_a = a.nodes.iter().find(|n| n.id == "n3").map(|n| n.y);
        let first_b = b.nodes.iter().find(|n| n.id == "n0").map(|n| n.y);
        let last_b = b.nodes.iter().find(|n| n.id == "n3").map(|n| n.y);

        if let (Some(fa), Some(la), Some(fb), Some(lb)) = (first_a, last_a, first_b, last_b) {
            assert!(fa < la, "top-down puts n0 above n3");
            assert!(fb > lb, "bottom-up puts n0 below n3");
        } else {
            panic!("chain nodes missing from the result");
        }
    }

    #[test]
    fn doubling_node_gap_widens_the_drawing() {
        // A single rank of four siblings: the gap is the only thing separating them.
        let mut nodes = vec![node("root", 160.0, 60.0)];
        let mut edges = Vec::new();
        for i in 0..4 {
            nodes.push(node(&format!("c{}", i), 160.0, 60.0));
            edges.push(edge(&format!("e{}", i), "root", &format!("c{}", i)));
        }

        let base = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        let mut wide = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        wide.node_gap = base.node_gap * 2.0;

        let (w_base, _) = node_bbox(&layout_layered(&nodes, &edges, &base));
        let (w_wide, _) = node_bbox(&layout_layered(&nodes, &edges, &wide));
        assert!(
            w_wide > w_base,
            "doubling node_gap must widen the drawing: {w_base} -> {w_wide}"
        );
    }

    #[test]
    fn scenario_17_left_right_has_zero_badge_edge_penetrations() {
        let nodes = vec![
            node("PLAN", 170.0, 65.0),
            node("EXEC1", 160.0, 65.0),
            node("EXEC2", 160.0, 65.0),
            node("AUDIT", 170.0, 65.0),
        ];
        let mut e0 = edge("e0", "PLAN", "EXEC1");
        e0.label = Some("assign task 1".into());
        e0.label_width = Some(120.0);
        e0.label_height = Some(26.0);
        let mut e1 = edge("e1", "PLAN", "EXEC2");
        e1.label = Some("assign task 2".into());
        e1.label_width = Some(120.0);
        e1.label_height = Some(26.0);
        let mut e2 = edge("e2", "EXEC1", "AUDIT");
        e2.label = Some("submit code".into());
        e2.label_width = Some(120.0);
        e2.label_height = Some(26.0);
        let mut e3 = edge("e3", "EXEC2", "AUDIT");
        e3.label = Some("submit tests".into());
        e3.label_width = Some(120.0);
        e3.label_height = Some(26.0);
        let mut e4 = edge("e4", "AUDIT", "PLAN");
        e4.label = Some("↺ request revision".into());
        e4.is_cycle = Some(true);
        e4.label_width = Some(140.0);
        e4.label_height = Some(26.0);

        let edges = vec![e0, e1, e2, e3, e4];

        let mut cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        cfg.direction = Direction::LeftRight;
        let res = layout_layered(&nodes, &edges, &cfg);

        assert_eq!(
            res.validation.metrics.badge_edge_penetrations, 0,
            "badge_edge_penetrations should be 0, diagnostics: {:?}",
            res.validation.diagnostics
        );
        assert!(res.validation.is_valid);
    }
}
