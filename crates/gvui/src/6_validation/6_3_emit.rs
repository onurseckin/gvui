//! # Step 6.3 (Phase 9): Component packing and emit
//!
//! The last phase, and the only one that undoes something an earlier phase did. Phase 2 reversed
//! every feedback edge so that Phases 3-8 could work on a DAG; here that illusion is dropped and
//! the arrowhead is put back on the original target. Nothing else in the pipeline is allowed to
//! know that a `reversed` chain is anything other than an ordinary forward edge.
//!
//! Packing is likewise a single deterministic pass: each weakly connected component was laid out
//! independently, so their boxes may sit on top of each other, and [`pack_components`] arranges
//! them into shelves at `target_aspect_ratio`. There is no search and no retry — a shelf pack of
//! fixed boxes has nothing to converge to.
//!
//! Emit then *verifies* rather than *scores*: [`super::constraints::check_constraints`] produces
//! bug reports, [`super::metrics::compute_metrics`] produces observations, and `status` reads them
//! off. No number produced here can change the drawing.

use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
use crate::geometry::{pack_boxes, translate_points};
use crate::step3_crossing_minimization::crossing_counting::detect_geometric_crossings;
use crate::step5_edge_routing::RouteResult;
use crate::types::{
    BadgePlacement, CustomLayoutResult, EdgeRole, GraphIr, Layered, LayoutDiagnostic,
    LayoutMetrics, LayoutValidationResult, OptimizationStats, PositionedNode, Rect, RoutedPath,
    RoutingDemand,
};

use super::constraints::check_constraints;
use super::metrics::compute_metrics;

/// Sentinel for "this route/badge/node could not be attributed to a component".
const UNASSIGNED: usize = usize::MAX;

// =============================================================================================
// Component packing
// =============================================================================================

/// Translates every component's bounding box into a packed arrangement at
/// `config.target_aspect_ratio`, in place. Components are laid out independently upstream.
///
/// `component_of_node` is **parallel to `nodes`**, not indexed by IR node index; entry `i` is the
/// component of `nodes[i]`. Routes are attributed to the component of their source port's node
/// (falling back to the target's), and badges to the component of their edge's route, because a
/// badge carries no node reference of its own. Anything that cannot be attributed is left where it
/// is rather than being moved to an arbitrary component.
///
/// The arrangement is a shelf pack: components are ordered by descending height (ties broken by
/// width, then by component index, so the order never depends on a hash) and filled into rows whose
/// width target is `sqrt(total_area * target_aspect_ratio)`. The union box's top-left lands at
/// `config.graph_padding`.
///
/// **Idempotent.** Placement depends only on per-component box *sizes* and component indices, both
/// translation-invariant, so packing an already-packed arrangement reproduces it exactly. A caller
/// that cannot tell whether packing already ran may simply run it.
pub fn pack_components(
    nodes: &mut [PositionedNode],
    routes: &mut [RoutedPath],
    badges: &mut [BadgePlacement],
    component_of_node: &[usize],
    component_count: usize,
    config: &CustomLayoutConfig,
) {
    if nodes.is_empty() {
        return;
    }
    let comp_count = component_count.max(1);
    let last = comp_count - 1;

    // Attribution and measurement need shared borrows of all three slices; the mutation pass below
    // needs exclusive ones. The scope keeps the two apart.
    let (comp_of_route, comp_of_badge, offsets) = {
        let mut comp_of_id: HashMap<&str, usize> = HashMap::with_capacity(nodes.len());
        for (i, n) in nodes.iter().enumerate() {
            comp_of_id.insert(
                n.id.as_str(),
                component_of_node.get(i).copied().unwrap_or(0).min(last),
            );
        }

        let comp_of_route: Vec<usize> = routes
            .iter()
            .map(|r| {
                comp_of_id
                    .get(r.source_port.node_id.as_str())
                    .or_else(|| comp_of_id.get(r.target_port.node_id.as_str()))
                    .copied()
                    .unwrap_or(UNASSIGNED)
            })
            .collect();

        let mut comp_of_edge: HashMap<&str, usize> = HashMap::with_capacity(routes.len());
        for (i, r) in routes.iter().enumerate() {
            comp_of_edge.insert(r.edge_id.as_str(), comp_of_route[i]);
        }
        let comp_of_badge: Vec<usize> = badges
            .iter()
            .map(|b| {
                comp_of_edge
                    .get(b.edge_id.as_str())
                    .copied()
                    .unwrap_or(UNASSIGNED)
            })
            .collect();

        // ---- per-component bounding boxes -----------------------------------------------------
        let mut boxes: Vec<Option<[f64; 4]>> = vec![None; comp_count];
        for (i, n) in nodes.iter().enumerate() {
            let c = component_of_node.get(i).copied().unwrap_or(0).min(last);
            if let Some(slot) = boxes.get_mut(c) {
                extend_box(slot, n.x, n.y, n.x + n.width, n.y + n.height);
            }
        }
        for (i, r) in routes.iter().enumerate() {
            let c = comp_of_route[i];
            if c == UNASSIGNED {
                continue;
            }
            if let Some(slot) = boxes.get_mut(c) {
                for p in &r.points {
                    extend_box(slot, p.x, p.y, p.x, p.y);
                }
                for port in [&r.source_port, &r.target_port] {
                    extend_box(slot, port.point.x, port.point.y, port.stub.x, port.stub.y);
                }
            }
        }
        for (i, b) in badges.iter().enumerate() {
            let c = comp_of_badge[i];
            if c == UNASSIGNED {
                continue;
            }
            if let Some(slot) = boxes.get_mut(c) {
                extend_box(
                    slot,
                    b.rect.x,
                    b.rect.y,
                    b.rect.x + b.rect.width,
                    b.rect.y + b.rect.height,
                );
                extend_box(
                    slot,
                    b.anchor_point.x,
                    b.anchor_point.y,
                    b.anchor_point.x,
                    b.anchor_point.y,
                );
                if let Some(pts) = &b.leader_points {
                    for p in pts {
                        extend_box(slot, p.x, p.y, p.x, p.y);
                    }
                }
            }
        }

        (comp_of_route, comp_of_badge, shelf_offsets(&boxes, config))
    };
    debug_assert_eq!(offsets.len(), comp_count);

    for (i, n) in nodes.iter_mut().enumerate() {
        let c = component_of_node.get(i).copied().unwrap_or(0).min(last);
        let (dx, dy) = offsets[c];
        n.x += dx;
        n.y += dy;
    }
    for (i, r) in routes.iter_mut().enumerate() {
        let c = comp_of_route[i];
        if c == UNASSIGNED {
            continue;
        }
        let (dx, dy) = offsets[c];
        translate_points(&mut r.points, dx, dy);
        for port in [&mut r.source_port, &mut r.target_port] {
            port.point.x += dx;
            port.point.y += dy;
            port.stub.x += dx;
            port.stub.y += dy;
        }
    }
    for (i, b) in badges.iter_mut().enumerate() {
        let c = comp_of_badge[i];
        if c == UNASSIGNED {
            continue;
        }
        let (dx, dy) = offsets[c];
        b.rect.x += dx;
        b.rect.y += dy;
        b.anchor_point.x += dx;
        b.anchor_point.y += dy;
        if let Some(pts) = b.leader_points.as_mut() {
            translate_points(pts, dx, dy);
        }
    }
}

/// Grows `slot` to contain the box `(x0, y0)-(x1, y1)`. Non-finite input is ignored so one bad
/// coordinate cannot swallow the whole drawing's bounding box.
fn extend_box(slot: &mut Option<[f64; 4]>, x0: f64, y0: f64, x1: f64, y1: f64) {
    if !(x0.is_finite() && y0.is_finite() && x1.is_finite() && y1.is_finite()) {
        return;
    }
    let (lo_x, hi_x) = (x0.min(x1), x0.max(x1));
    let (lo_y, hi_y) = (y0.min(y1), y0.max(y1));
    match slot {
        None => *slot = Some([lo_x, lo_y, hi_x, hi_y]),
        Some(b) => {
            b[0] = b[0].min(lo_x);
            b[1] = b[1].min(lo_y);
            b[2] = b[2].max(hi_x);
            b[3] = b[3].max(hi_y);
        }
    }
}

/// Shelf-packs the component boxes and returns the translation for each component, including the
/// `graph_padding` that puts the union box's top-left at the drawing's margin.
///
/// Components with no box (empty, or entirely non-finite) get a zero offset and are kept out of the
/// pack entirely — a phantom zero-size box would still consume a `component_gap` and skew the
/// arrangement of the real ones.
fn shelf_offsets(boxes: &[Option<[f64; 4]>], config: &CustomLayoutConfig) -> Vec<(f64, f64)> {
    let mut offsets: Vec<(f64, f64)> = vec![(0.0, 0.0); boxes.len()];

    let present: Vec<usize> = (0..boxes.len()).filter(|&c| boxes[c].is_some()).collect();
    let rects: Vec<Rect> = present
        .iter()
        .filter_map(|&c| boxes[c])
        .map(|b| Rect {
            x: b[0],
            y: b[1],
            width: b[2] - b[0],
            height: b[3] - b[1],
        })
        .collect();

    let translations = pack_boxes(&rects, config.component_gap, config.target_aspect_ratio);
    let pad = config.graph_padding;
    for (k, &c) in present.iter().enumerate() {
        if let Some(&(dx, dy)) = translations.get(k) {
            offsets[c] = (dx + pad, dy + pad);
        }
    }

    offsets
}

// =============================================================================================
// Emit
// =============================================================================================

/// Builds the final wire payload. Un-reverses feedback edges so the arrowhead renders at the
/// ORIGINAL target, runs constraints and metrics, and resolves `status`.
///
/// `combinatorial_crossings` is Phase 5's exact count; it is reported alongside the geometric count
/// measured here so a divergence between them is visible as the bug it is.
pub fn emit_result(
    ir: &GraphIr,
    layered: &Layered,
    routed: RouteResult,
    demand: &RoutingDemand,
    combinatorial_crossings: usize,
    stats: OptimizationStats,
    config: &CustomLayoutConfig,
) -> CustomLayoutResult {
    let RouteResult { routes, badges, .. } = routed;
    emit_from_parts(
        ir,
        layered,
        routes,
        badges,
        demand,
        combinatorial_crossings,
        stats,
        config,
    )
}

/// The whole of Phase 9, taking the routes and badges directly instead of the Phase 8 result
/// wrapper.
///
/// Exists so the emit contract can be exercised — and so alternative engines that produce routes
/// without a full [`RouteResult`] can reuse it — without either coupling to the exact shape of
/// Phase 8's output struct.
#[allow(clippy::too_many_arguments)]
pub fn emit_from_parts(
    ir: &GraphIr,
    layered: &Layered,
    mut routes: Vec<RoutedPath>,
    mut badges: Vec<BadgePlacement>,
    demand: &RoutingDemand,
    combinatorial_crossings: usize,
    stats: OptimizationStats,
    config: &CustomLayoutConfig,
) -> CustomLayoutResult {
    let mut emit_diagnostics: Vec<LayoutDiagnostic> = Vec::new();

    // ---- 1. Positioned nodes, in IR node-index order -------------------------------------------
    let mut nodes: Vec<PositionedNode> = Vec::with_capacity(ir.node_count());
    // Position of node `n` within `nodes`, or UNASSIGNED when it could not be emitted.
    let mut pos_of_node: Vec<usize> = vec![UNASSIGNED; ir.node_count()];
    // `n` indexes four parallel collections here (item_of_node, node_names, node_labels and
    // pos_of_node); iterating over any one of them still leaves the other three indexed.
    #[allow(clippy::needless_range_loop)]
    for n in 0..ir.node_count() {
        let item = layered
            .item_of_node
            .get(n)
            .and_then(|&idx| layered.items.get(idx as usize));
        let (Some(item), Some(name)) = (item, ir.node_names.get(n)) else {
            // Cannot happen: Phase 4 creates a Real item for every node. Reported rather than
            // silently dropped, because a vanished node is exactly the kind of bug this phase
            // exists to surface.
            if let Some(name) = ir.node_names.get(n) {
                emit_diagnostics.push(LayoutDiagnostic::error(
                    "MISSING_NODE_ITEM",
                    format!("Node '{}' has no layered item and was dropped", name),
                    vec![name.clone()],
                ));
            }
            continue;
        };
        pos_of_node[n] = nodes.len();
        nodes.push(PositionedNode {
            id: name.clone(),
            label: ir.node_labels.get(n).cloned().flatten(),
            x: item.x,
            y: item.y,
            width: item.width,
            height: item.height,
            rank: item.rank as usize,
            order: item.order as usize,
        });
    }

    // ---- 2. Deterministic ordering of routes and badges ----------------------------------------
    let mut index_of_edge: HashMap<&str, usize> = HashMap::with_capacity(ir.edge_names.len());
    for (i, name) in ir.edge_names.iter().enumerate() {
        index_of_edge.insert(name.as_str(), i);
    }
    let edge_rank = |id: &str| index_of_edge.get(id).copied().unwrap_or(usize::MAX);
    routes.sort_by(|a, b| {
        edge_rank(a.edge_id.as_str())
            .cmp(&edge_rank(b.edge_id.as_str()))
            .then_with(|| a.edge_id.cmp(&b.edge_id))
    });
    badges.sort_by(|a, b| {
        edge_rank(a.edge_id.as_str())
            .cmp(&edge_rank(b.edge_id.as_str()))
            .then_with(|| a.edge_id.cmp(&b.edge_id))
    });

    // ---- 3. Un-reverse feedback edges ----------------------------------------------------------
    // The single place the pipeline's DAG illusion is undone. Everything upstream saw a forward
    // edge; the renderer must see the original direction so the arrowhead lands on the real target.
    let mut route_pos_of_edge: Vec<usize> = vec![UNASSIGNED; ir.edge_count()];
    for (pos, r) in routes.iter().enumerate() {
        if let Some(&e) = index_of_edge.get(r.edge_id.as_str()) {
            if let Some(slot) = route_pos_of_edge.get_mut(e) {
                *slot = pos;
            }
        }
    }
    for chain in &layered.chains {
        if !chain.reversed {
            continue;
        }
        let Some(&pos) = route_pos_of_edge.get(chain.edge as usize) else {
            continue;
        };
        if pos == UNASSIGNED {
            continue;
        }
        let Some(route) = routes.get_mut(pos) else {
            continue;
        };
        route.points.reverse();
        std::mem::swap(&mut route.source_port, &mut route.target_port);
    }

    // ---- 4. Pack the independently laid out components -----------------------------------------
    let mut component_of_node: Vec<usize> = vec![0; nodes.len()];
    for (ci, members) in ir.components.iter().enumerate() {
        for &n in members {
            if let Some(&p) = pos_of_node.get(n as usize) {
                if p != UNASSIGNED {
                    if let Some(slot) = component_of_node.get_mut(p) {
                        *slot = ci;
                    }
                }
            }
        }
    }
    pack_components(
        &mut nodes,
        &mut routes,
        &mut badges,
        &component_of_node,
        ir.components.len().max(1),
        config,
    );

    // ---- 5. Geometric crossings ----------------------------------------------------------------
    let mut roles: HashMap<String, EdgeRole> = HashMap::with_capacity(layered.chains.len());
    for chain in &layered.chains {
        if let Some(name) = ir.edge_names.get(chain.edge as usize) {
            roles.insert(name.clone(), chain.role);
        }
    }
    let crossings = detect_geometric_crossings(&routes, &roles, config.epsilon);

    // ---- 6. Constraints ------------------------------------------------------------------------
    let mut diagnostics: Vec<LayoutDiagnostic> = Vec::with_capacity(ir.diagnostics.len());
    // Ingest warnings first: they explain any downstream surprise (a dropped edge, an unknown
    // endpoint) and are older than anything produced here.
    diagnostics.extend(ir.diagnostics.iter().cloned());
    diagnostics.append(&mut emit_diagnostics);
    diagnostics.extend(check_constraints(
        &nodes,
        &routes,
        &badges,
        &ir.edge_names,
        config,
    ));
    let is_valid = !diagnostics.iter().any(|d| d.severity == "error");

    // ---- 7. Metrics ----------------------------------------------------------------------------
    let lane_depth_max = demand
        .channel_lanes
        .iter()
        .copied()
        .max()
        .unwrap_or(0)
        // Taking a max over HashMap values is order-independent, so this stays deterministic.
        .max(demand.corridor_lanes.values().copied().max().unwrap_or(0))
        as usize;
    let leader_count = badges
        .iter()
        .filter(|b| b.leader_points.as_ref().is_some_and(|p| !p.is_empty()))
        .count();
    let metrics = compute_metrics(
        &nodes,
        &routes,
        &badges,
        &crossings,
        Some(layered),
        combinatorial_crossings,
        leader_count,
        lane_depth_max,
        config,
    );

    // ---- 8. Assemble ---------------------------------------------------------------------------
    let status = resolve_status(is_valid, &metrics).to_string();

    CustomLayoutResult {
        nodes,
        edges: routes,
        badges,
        crossings: crossings.clone(),
        validation: LayoutValidationResult {
            is_valid,
            metrics,
            crossings,
            diagnostics,
        },
        status,
        optimization_stats: stats,
    }
}

/// Resolves the three-state result status.
///
/// A hard failure means an invariant the engine guarantees was violated — the drawing should not be
/// trusted. `unresolved_soft_conflicts` means the drawing is structurally sound but something was
/// resolved by a fallback the design intends to be rare: a badge that needed a leader line, or a
/// label the measurer had to ellipsize. Both are quality signals, never failures.
pub fn resolve_status(is_valid: bool, metrics: &LayoutMetrics) -> &'static str {
    if !is_valid {
        "invalid_hard_failure"
    } else if metrics.leader_count > 0 || metrics.labels_truncated > 0 {
        "unresolved_soft_conflicts"
    } else {
        "success"
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{EdgeChain, IrEdge, IrNode, Item, ItemKind, Point, PortRef, Rect, Side};

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

    fn real_item(node: u32, rank: u16, x: f64, y: f64) -> Item {
        Item {
            kind: ItemKind::Real(node),
            rank,
            order: 0,
            width: 100.0,
            height: 50.0,
            x,
            y,
        }
    }

    /// Two nodes `a -> b`, one edge `e0`, one component.
    fn ir_pair() -> GraphIr {
        GraphIr {
            node_names: vec!["a".to_string(), "b".to_string()],
            edge_names: vec!["e0".to_string()],
            node_labels: vec![Some("A".to_string()), None],
            nodes: vec![
                IrNode {
                    name: 0,
                    width: 100.0,
                    height: 50.0,
                    pinned_rank: None,
                    degree: 1,
                },
                IrNode {
                    name: 1,
                    width: 100.0,
                    height: 50.0,
                    pinned_rank: None,
                    degree: 1,
                },
            ],
            edges: vec![IrEdge {
                name: 0,
                source: 0,
                target: 1,
                label: None,
                weight: 1.0,
                min_len: 1,
                hint: None,
                bundle: None,
            }],
            components: vec![vec![0, 1]],
            ..Default::default()
        }
    }

    /// `a` at rank 0, `b` at rank 1, joined by chain `e0`.
    fn layered_pair(reversed: bool) -> Layered {
        Layered {
            items: vec![real_item(0, 0, 0.0, 0.0), real_item(1, 1, 0.0, 200.0)],
            rank_ranges: vec![0..1, 1..2],
            chains: vec![EdgeChain {
                edge: 0,
                reversed,
                role: if reversed {
                    EdgeRole::Feedback
                } else {
                    EdgeRole::Forward
                },
                items: vec![0, 1],
                label_at: None,
            }],
            item_of_node: vec![0, 1],
            ..Default::default()
        }
    }

    /// Straight vertical route from `a`'s bottom to `b`'s top.
    fn route_pair() -> RoutedPath {
        let src = Point { x: 50.0, y: 50.0 };
        let tgt = Point { x: 50.0, y: 200.0 };
        RoutedPath {
            edge_id: "e0".to_string(),
            points: vec![src, tgt],
            source_port: port("a", Side::Bottom, src),
            target_port: port("b", Side::Top, tgt),
        }
    }

    fn emit(
        ir: &GraphIr,
        layered: &Layered,
        routes: Vec<RoutedPath>,
        badges: Vec<BadgePlacement>,
    ) -> CustomLayoutResult {
        emit_from_parts(
            ir,
            layered,
            routes,
            badges,
            &RoutingDemand::default(),
            0,
            OptimizationStats::default(),
            &cfg(),
        )
    }

    // ---- packing -------------------------------------------------------------------------------

    #[test]
    fn pack_components_separates_components_laid_out_on_top_of_each_other() {
        let c = cfg();
        let mut nodes = vec![
            node("a", 0.0, 0.0, 100.0, 50.0),
            node("b", 0.0, 100.0, 100.0, 50.0),
            // Component 1 was laid out independently, so it starts at the same origin.
            node("c", 0.0, 0.0, 100.0, 50.0),
            node("d", 0.0, 100.0, 100.0, 50.0),
        ];
        let mut routes: Vec<RoutedPath> = Vec::new();
        let mut badges: Vec<BadgePlacement> = Vec::new();
        pack_components(&mut nodes, &mut routes, &mut badges, &[0, 0, 1, 1], 2, &c);

        let d = check_constraints(&nodes, &[], &[], &[], &c);
        assert!(d.is_empty(), "packing left overlaps: {:?}", d);

        let min_x = nodes.iter().map(|n| n.x).fold(f64::INFINITY, f64::min);
        let min_y = nodes.iter().map(|n| n.y).fold(f64::INFINITY, f64::min);
        assert_eq!(min_x, c.graph_padding);
        assert_eq!(min_y, c.graph_padding);
    }

    #[test]
    fn pack_components_preserves_intra_component_geometry() {
        let c = cfg();
        let mut nodes = vec![
            node("a", 0.0, 0.0, 100.0, 50.0),
            node("b", 0.0, 100.0, 100.0, 50.0),
        ];
        let mut routes = vec![route_pair()];
        let mut badges: Vec<BadgePlacement> = Vec::new();
        pack_components(&mut nodes, &mut routes, &mut badges, &[0, 0], 1, &c);

        // Relative offsets are untouched; only the whole component moved.
        assert_eq!(nodes[1].y - nodes[0].y, 100.0);
        let dx = nodes[0].x - 0.0;
        let dy = nodes[0].y - 0.0;
        assert_eq!(
            routes[0].points[0],
            Point {
                x: 50.0 + dx,
                y: 50.0 + dy
            }
        );
        assert_eq!(routes[0].source_port.point.x, 50.0 + dx);
        assert_eq!(routes[0].source_port.stub.y, 70.0 + dy);
    }

    #[test]
    fn pack_components_is_idempotent() {
        let c = cfg();
        let mk = || {
            vec![
                node("a", 0.0, 0.0, 100.0, 50.0),
                node("b", 0.0, 100.0, 100.0, 50.0),
                node("c", 0.0, 0.0, 140.0, 50.0),
            ]
        };
        let mut once = mk();
        pack_components(&mut once, &mut [], &mut [], &[0, 0, 1], 2, &c);
        let mut twice = once.clone();
        pack_components(&mut twice, &mut [], &mut [], &[0, 0, 1], 2, &c);
        for (a, b) in once.iter().zip(twice.iter()) {
            assert_eq!((a.x, a.y), (b.x, b.y));
        }
    }

    #[test]
    fn pack_components_handles_empty_input() {
        let c = cfg();
        pack_components(&mut [], &mut [], &mut [], &[], 0, &c);
    }

    // ---- feedback un-reversal -------------------------------------------------------------------

    #[test]
    fn emit_reverses_a_feedback_edges_points_and_swaps_its_ports() {
        let ir = ir_pair();
        let forward = emit(&ir, &layered_pair(false), vec![route_pair()], vec![]);
        let feedback = emit(&ir, &layered_pair(true), vec![route_pair()], vec![]);

        let f = &forward.edges[0];
        let b = &feedback.edges[0];

        assert_eq!(f.source_port.node_id, "a");
        assert_eq!(f.target_port.node_id, "b");
        // The reversed chain's arrowhead must land on the ORIGINAL target.
        assert_eq!(b.source_port.node_id, "b");
        assert_eq!(b.target_port.node_id, "a");
        assert_eq!(b.source_port.side, Side::Top);
        assert_eq!(b.target_port.side, Side::Bottom);

        // Points are the same polyline walked backwards.
        let mut reversed_forward = f.points.clone();
        reversed_forward.reverse();
        assert_eq!(b.points, reversed_forward);
    }

    #[test]
    fn emit_leaves_forward_edges_alone() {
        let ir = ir_pair();
        let r = emit(&ir, &layered_pair(false), vec![route_pair()], vec![]);
        assert!(r.edges[0].points[0].y < r.edges[0].points[1].y);
        assert_eq!(r.edges[0].source_port.side, Side::Bottom);
    }

    // ---- assembly ------------------------------------------------------------------------------

    #[test]
    fn emit_carries_ids_labels_rank_and_order() {
        let ir = ir_pair();
        let r = emit(&ir, &layered_pair(false), vec![route_pair()], vec![]);
        assert_eq!(r.nodes.len(), 2);
        assert_eq!(r.nodes[0].id, "a");
        assert_eq!(r.nodes[0].label.as_deref(), Some("A"));
        assert_eq!(r.nodes[1].id, "b");
        assert_eq!(r.nodes[1].label, None);
        assert_eq!(r.nodes[0].rank, 0);
        assert_eq!(r.nodes[1].rank, 1);
    }

    #[test]
    fn emit_sorts_routes_by_edge_index_not_by_arrival_order() {
        let mut ir = ir_pair();
        ir.edge_names = vec!["e0".to_string(), "e1".to_string(), "e2".to_string()];
        let mut layered = layered_pair(false);
        layered.chains.clear();

        let mk = |id: &str| {
            let mut r = route_pair();
            r.edge_id = id.to_string();
            r
        };
        // Arrive out of order; emit must restore IR edge order.
        let r = emit(&ir, &layered, vec![mk("e2"), mk("e0"), mk("e1")], vec![]);
        let ids: Vec<&str> = r.edges.iter().map(|e| e.edge_id.as_str()).collect();
        assert_eq!(ids, vec!["e0", "e1", "e2"]);
    }

    #[test]
    fn emit_carries_ingest_diagnostics() {
        let mut ir = ir_pair();
        ir.diagnostics.push(LayoutDiagnostic::warning(
            "UNKNOWN_ENDPOINT",
            "dropped".to_string(),
            vec!["e9".to_string()],
        ));
        let r = emit(&ir, &layered_pair(false), vec![route_pair()], vec![]);
        assert!(r
            .validation
            .diagnostics
            .iter()
            .any(|d| d.code == "UNKNOWN_ENDPOINT"));
        // A warning must not invalidate the layout.
        assert!(r.validation.is_valid);
    }

    // ---- status --------------------------------------------------------------------------------

    #[test]
    fn resolve_status_covers_all_three_outcomes() {
        let clean = LayoutMetrics::default();
        assert_eq!(resolve_status(true, &clean), "success");

        let leaders = LayoutMetrics {
            leader_count: 1,
            ..Default::default()
        };
        assert_eq!(resolve_status(true, &leaders), "unresolved_soft_conflicts");

        let truncated = LayoutMetrics {
            labels_truncated: 2,
            ..Default::default()
        };
        assert_eq!(
            resolve_status(true, &truncated),
            "unresolved_soft_conflicts"
        );

        // Invalidity outranks any soft signal.
        assert_eq!(resolve_status(false, &leaders), "invalid_hard_failure");
    }

    #[test]
    fn status_is_success_for_a_clean_layout() {
        let ir = ir_pair();
        let r = emit(&ir, &layered_pair(false), vec![route_pair()], vec![]);
        assert!(r.validation.is_valid, "{:?}", r.validation.diagnostics);
        assert_eq!(r.status, "success");
    }

    #[test]
    fn status_is_soft_conflict_when_a_badge_needed_a_leader() {
        let ir = ir_pair();
        let badge = BadgePlacement {
            edge_id: "e0".to_string(),
            label: "x".to_string(),
            // Well clear of both nodes and of the route.
            rect: Rect {
                x: 400.0,
                y: 400.0,
                width: 40.0,
                height: 20.0,
            },
            anchor_point: Point { x: 50.0, y: 120.0 },
            leader_points: Some(vec![
                Point { x: 50.0, y: 120.0 },
                Point { x: 400.0, y: 410.0 },
            ]),
        };
        let r = emit(&ir, &layered_pair(false), vec![route_pair()], vec![badge]);
        assert!(r.validation.is_valid, "{:?}", r.validation.diagnostics);
        assert_eq!(r.validation.metrics.leader_count, 1);
        assert_eq!(r.status, "unresolved_soft_conflicts");
    }

    #[test]
    fn status_is_hard_failure_when_a_constraint_is_violated() {
        let ir = ir_pair();
        let mut layered = layered_pair(false);
        // Drop `b` on top of `a`: a node-node overlap, which Phase 7 guarantees cannot happen.
        layered.items[1] = real_item(1, 1, 10.0, 10.0);
        let r = emit(&ir, &layered, vec![route_pair()], vec![]);
        assert!(!r.validation.is_valid);
        assert_eq!(r.status, "invalid_hard_failure");
        assert!(r
            .validation
            .diagnostics
            .iter()
            .any(|d| d.code == "NODE_NODE_OVERLAP"));
        assert_eq!(r.validation.metrics.node_node_overlaps, 1);
    }

    #[test]
    fn missing_route_is_a_hard_failure() {
        let ir = ir_pair();
        let r = emit(&ir, &layered_pair(false), vec![], vec![]);
        assert!(!r.validation.is_valid);
        assert!(r
            .validation
            .diagnostics
            .iter()
            .any(|d| d.code == "MISSING_ROUTE"));
    }

    #[test]
    fn emit_is_deterministic() {
        let ir = ir_pair();
        let a = emit(&ir, &layered_pair(true), vec![route_pair()], vec![]);
        for _ in 0..8 {
            let b = emit(&ir, &layered_pair(true), vec![route_pair()], vec![]);
            assert_eq!(a.status, b.status);
            assert_eq!(a.validation.metrics, b.validation.metrics);
            assert_eq!(a.edges, b.edges);
            let an: Vec<&str> = a.nodes.iter().map(|n| n.id.as_str()).collect();
            let bn: Vec<&str> = b.nodes.iter().map(|n| n.id.as_str()).collect();
            assert_eq!(an, bn);
        }
    }

    #[test]
    fn empty_graph_emits_a_valid_empty_result() {
        let ir = GraphIr::default();
        let layered = Layered::default();
        let r = emit(&ir, &layered, vec![], vec![]);
        assert!(r.nodes.is_empty());
        assert!(r.edges.is_empty());
        assert!(r.validation.is_valid);
        assert_eq!(r.status, "success");
    }
}
