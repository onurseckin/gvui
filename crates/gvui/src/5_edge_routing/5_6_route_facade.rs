//! # Step 5.6 (Phase 8): Routing facade
//!
//! Assembles the phase: assign ports once, then evaluate every chain, every flat edge and every
//! self-loop, then place badges over the finished routes.
//!
//! Two properties this module is responsible for:
//!
//! - **Determinism.** Chains, flat edges and self-loops are visited by ascending index, so the
//!   `routes` vector has the same order for the same input on every run and in every process.
//! - **Totality.** Every non-dropped input edge produces exactly one [`RoutedPath`]. Routing cannot
//!   fail in v2 — there is no rip-up, no reroute and no `unresolved_soft_conflicts` state — so a
//!   route missing from the output means an earlier phase emitted a malformed structure, and that
//!   is what Phase 9's `unresolved_route_count` metric is for.

use super::badges::place_badges;
use super::edge_style::{chamfer_corners, octilinear_corner_cut, NodeRectIndex};
use super::lane_order::refine_channel_lanes;
use super::lane_router::{rank_band_bottoms, route_chain_with_bands};
use super::ports::assign_ports;
use super::special_routes::{route_flat_edge, route_self_loop};
use crate::config::{CustomLayoutConfig, EdgeStyle};
use crate::types::{BadgePlacement, GraphIr, Item, ItemKind, Layered, RoutedPath, RoutingDemand};

/// Phase 8 output.
pub struct RouteResult {
    pub routes: Vec<RoutedPath>,
    pub badges: Vec<BadgePlacement>,
    /// Badges that needed a leader line. Should be zero; a nonzero value means a Phase 4
    /// reservation was missing, not that the drawing is crowded.
    pub leader_count: usize,
}

/// Routes every edge and places every badge.
///
/// `rank_tops` is Phase 7's per-rank band origin, indexed by rank; combined with each rank's
/// tallest item it gives the band bottom that channel y values are measured from. Passing a table
/// that is out of step with `layered` shifts every channel uniformly, which is silent rather than
/// loud — the integrator must pass the same table Phase 7 produced.
///
/// Coordinates are in the engine's internal top-down frame. Direction transposition and the
/// un-reversal of feedback edges both happen in Phase 9, over this output.
pub fn route_edges(
    layered: &Layered,
    ir: &GraphIr,
    demand: &RoutingDemand,
    rank_tops: &[f64],
    config: &CustomLayoutConfig,
) -> RouteResult {
    let ports = assign_ports(layered, ir, config);
    let band_bottoms = rank_band_bottoms(layered, rank_tops);

    // Phase 6 sized the channels before any coordinate existed; now that they do, Step 5.7 decides
    // which lane inside those channels each segment takes. It only ever permutes and packs within
    // the space Phase 6 reserved, so the routes it produces still cannot leave their channel.
    let refined;
    let lanes = if config.crossing_aware_lanes {
        refined = refine_channel_lanes(layered, demand, &ports, &band_bottoms, rank_tops, config);
        &refined
    } else {
        &demand.lane_of_link
    };

    let mut routes: Vec<RoutedPath> = Vec::with_capacity(
        layered.chains.len() + layered.flat_edges.len() + layered.self_loops.len(),
    );

    for chain_index in 0..layered.chains.len() {
        if let Some(path) = route_chain_with_bands(
            chain_index,
            layered,
            ir,
            lanes,
            &ports,
            &band_bottoms,
            config,
        ) {
            routes.push(path);
        }
    }

    for flat_index in 0..layered.flat_edges.len() {
        if let Some(path) = route_flat_edge(flat_index, layered, ir, demand, &ports, config) {
            routes.push(path);
        }
    }

    // Self-loops stack per node. The counter is a dense Vec so the stacking index depends only on
    // the order of `layered.self_loops`, never on hashing.
    let mut loops_on_node = vec![0usize; ir.node_count()];
    for &edge in &layered.self_loops {
        let Some(node) = ir.edges.get(edge as usize).map(|e| e.source) else {
            continue;
        };
        let Some(item) = layered
            .item_of_node
            .get(node as usize)
            .and_then(|&ix| layered.items.get(ix as usize))
        else {
            continue;
        };
        let (Some(edge_id), Some(node_id)) = (
            ir.edge_names.get(edge as usize),
            ir.node_names.get(node as usize),
        ) else {
            continue;
        };
        let stack_index = loops_on_node.get(node as usize).copied().unwrap_or(0);
        if let Some(slot) = loops_on_node.get_mut(node as usize) {
            *slot += 1;
        }
        routes.push(route_self_loop(
            edge_id,
            node_id,
            &item.rect(),
            stack_index,
            config,
        ));
    }

    let badges = place_badges(layered, ir, &routes, config);

    // `Octilinear` is the last thing that happens, deliberately after badge placement. Badges are
    // positioned against the orthogonal geometry that Phase 4 reserved item space for, and a
    // chamfer only ever removes area from inside the corner triangle it replaces, so no badge
    // anchor it was measured against moves. Running it here also keeps badge output byte-identical
    // between the orthogonal styles and this one.
    if config.edge_style == EdgeStyle::Octilinear {
        let index = NodeRectIndex::new(
            layered
                .items
                .iter()
                .filter(|item| matches!(item.kind, ItemKind::Real(_)))
                .map(Item::rect),
        );
        let cut = octilinear_corner_cut(config);
        for route in &mut routes {
            route.points = chamfer_corners(&route.points, cut, &index, config.epsilon);
        }
    }

    RouteResult {
        routes,
        badges: badges.badges,
        leader_count: badges.leader_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{EdgeChain, EdgeRole, FlatEdge, IrEdge, IrNode, Item, ItemKind, LabelBox};
    use std::collections::HashSet;

    fn cfg() -> CustomLayoutConfig {
        CustomLayoutConfig::default()
    }

    /// Rank ranges for a rank-major item list, given the number of items in each rank.
    fn ranks(widths: &[u32]) -> Vec<std::ops::Range<u32>> {
        let mut out = Vec::with_capacity(widths.len());
        let mut start = 0u32;
        for &w in widths {
            out.push(start..start + w);
            start += w;
        }
        out
    }

    fn mk_item(kind: ItemKind, rank: u16, order: u16, x: f64, y: f64, w: f64, h: f64) -> Item {
        Item {
            kind,
            rank,
            order,
            width: w,
            height: h,
            x,
            y,
        }
    }

    fn mk_ir(node_count: usize, edges: &[(u32, u32, Option<LabelBox>)]) -> GraphIr {
        let mut ir = GraphIr::default();
        for i in 0..node_count {
            ir.node_names.push(format!("n{}", i));
            ir.node_labels.push(None);
            ir.nodes.push(IrNode {
                name: i as u32,
                width: 100.0,
                height: 40.0,
                pinned_rank: None,
                degree: 0,
            });
        }
        for (i, &(s, t, label)) in edges.iter().enumerate() {
            ir.edge_names.push(format!("e{}", i));
            ir.edges.push(IrEdge {
                name: i as u32,
                source: s,
                target: t,
                label,
                weight: 1.0,
                min_len: 1,
                hint: None,
                bundle: None,
            });
        }
        ir
    }

    fn chain(edge: u32, items: Vec<u32>, label_at: Option<usize>) -> EdgeChain {
        EdgeChain {
            edge,
            reversed: false,
            role: EdgeRole::Forward,
            items,
            label_at,
        }
    }

    /// Nodes A, D, E on rank 0; B on rank 1; C on rank 2.
    /// Edges: e0 = A->B (chain), e1 = B->C (chain), e2 = A->A (self loop), e3 = D->E (flat).
    fn mixed_graph() -> (Layered, GraphIr, Vec<f64>) {
        let ir = mk_ir(5, &[(0, 1, None), (1, 2, None), (0, 0, None), (3, 4, None)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0),
                mk_item(ItemKind::Real(3), 0, 1, 200.0, 0.0, 100.0, 40.0),
                mk_item(ItemKind::Real(4), 0, 2, 400.0, 0.0, 100.0, 60.0),
                mk_item(ItemKind::Real(1), 1, 0, 0.0, 200.0, 100.0, 40.0),
                mk_item(ItemKind::Real(2), 2, 0, 0.0, 400.0, 100.0, 40.0),
            ],
            rank_ranges: ranks(&[3, 1, 1]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![chain(0, vec![0, 3], None), chain(1, vec![3, 4], None)],
            flat_edges: vec![FlatEdge {
                edge: 3,
                rank: 0,
                from_item: 1,
                to_item: 2,
                label: None,
            }],
            self_loops: vec![2],
            item_of_node: vec![0, 3, 4, 1, 2],
        };
        (layered, ir, vec![0.0, 200.0, 400.0])
    }

    #[test]
    fn every_edge_produces_exactly_one_route() {
        let (layered, ir, rank_tops) = mixed_graph();
        let demand = RoutingDemand::default();
        let result = route_edges(&layered, &ir, &demand, &rank_tops, &cfg());

        assert_eq!(result.routes.len(), 4);
        let ids: HashSet<&str> = result.routes.iter().map(|r| r.edge_id.as_str()).collect();
        assert_eq!(ids.len(), 4);
        for expected in ["e0", "e1", "e2", "e3"] {
            assert!(ids.contains(expected), "missing {}", expected);
        }
        assert_eq!(result.leader_count, 0);
        assert!(result.badges.is_empty());
    }

    #[test]
    fn output_order_is_chains_then_flats_then_self_loops() {
        let (layered, ir, rank_tops) = mixed_graph();
        let demand = RoutingDemand::default();
        let result = route_edges(&layered, &ir, &demand, &rank_tops, &cfg());
        let order: Vec<&str> = result.routes.iter().map(|r| r.edge_id.as_str()).collect();
        assert_eq!(order, vec!["e0", "e1", "e3", "e2"]);
    }

    #[test]
    fn every_route_is_orthogonal_and_terminates_on_its_ports() {
        let (layered, ir, rank_tops) = mixed_graph();
        let demand = RoutingDemand::default();
        let result = route_edges(&layered, &ir, &demand, &rank_tops, &cfg());

        for route in &result.routes {
            assert!(route.points.len() >= 2, "{} degenerate", route.edge_id);
            for w in route.points.windows(2) {
                assert!(
                    (w[0].x - w[1].x).abs() < 1e-9 || (w[0].y - w[1].y).abs() < 1e-9,
                    "{} has a diagonal segment: {:?}",
                    route.edge_id,
                    route.points
                );
            }
            assert_eq!(route.points[0], route.source_port.point);
            assert_eq!(
                route.points[route.points.len() - 1],
                route.target_port.point
            );
        }
    }

    #[test]
    fn result_is_byte_identical_across_runs() {
        let (layered, ir, rank_tops) = mixed_graph();
        let demand = RoutingDemand::default();
        let a = route_edges(&layered, &ir, &demand, &rank_tops, &cfg());
        let b = route_edges(&layered, &ir, &demand, &rank_tops, &cfg());
        assert_eq!(a.routes, b.routes);
        assert_eq!(a.leader_count, b.leader_count);
    }

    #[test]
    fn multiple_self_loops_on_one_node_stack() {
        let ir = mk_ir(1, &[(0, 0, None), (0, 0, None)]);
        let layered = Layered {
            items: vec![mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 60.0)],
            rank_ranges: ranks(&[1]),
            up: Default::default(),
            down: Default::default(),
            chains: Vec::new(),
            flat_edges: Vec::new(),
            self_loops: vec![0, 1],
            item_of_node: vec![0],
        };
        let demand = RoutingDemand::default();
        let result = route_edges(&layered, &ir, &demand, &[0.0], &cfg());

        assert_eq!(result.routes.len(), 2);
        let reach = |r: &RoutedPath| r.points.iter().fold(f64::MIN, |m, p| m.max(p.x));
        assert!(reach(&result.routes[1]) > reach(&result.routes[0]));
        assert_eq!(result.routes[0].source_port.index, 0);
        assert_eq!(result.routes[1].source_port.index, 2);
    }

    #[test]
    fn a_labelled_chain_yields_one_badge_and_no_leader() {
        // Pinned to BesideEdge: the assertion below checks the badge sits in the right half of the
        // double-width reservation, which is that variant's geometry. The default is now OnEdge.
        let mut config = cfg();
        config.label_placement = crate::config::LabelPlacement::BesideEdge;
        let label = LabelBox {
            width: 80.0,
            height: 28.0,
        };
        let ir = mk_ir(2, &[(0, 1, Some(label))]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0),
                mk_item(ItemKind::Label(0), 1, 0, 0.0, 200.0, 160.0, 28.0),
                mk_item(ItemKind::Real(1), 2, 0, 0.0, 400.0, 100.0, 40.0),
            ],
            rank_ranges: ranks(&[1, 1, 1]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![chain(0, vec![0, 1, 2], Some(1))],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 2],
        };
        let demand = RoutingDemand::default();
        let result = route_edges(&layered, &ir, &demand, &[0.0, 200.0, 400.0], &config);

        assert_eq!(result.routes.len(), 1);
        assert_eq!(result.badges.len(), 1);
        assert_eq!(result.leader_count, 0);
        assert!(result.badges[0].leader_points.is_none());
        // The badge is inside the reservation the layered graph already made for it.
        assert!(result.badges[0].rect.x >= 80.0 - 1e-9);
        assert!(result.badges[0].rect.right() <= 160.0 + 1e-9);
    }

    #[test]
    fn empty_graph_routes_nothing() {
        let result = route_edges(
            &Layered::default(),
            &GraphIr::default(),
            &RoutingDemand::default(),
            &[],
            &cfg(),
        );
        assert!(result.routes.is_empty());
        assert!(result.badges.is_empty());
        assert_eq!(result.leader_count, 0);
    }
}
