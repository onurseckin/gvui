//! Step 5.10: High-Level Edge Routing Orchestrator & Rip-Up Reroute Loop.
//!
//! This module serves as the primary entry point and orchestrator for Step 5 (Edge Routing).
//!
//! ## Workflow Architecture
//! 1. **Edge Separation**: Classifies edges into self-loops vs non-self edges.
//! 2. **Port Candidate & Assignment**: Generates side candidates, executes global regret-ordered
//!    port side assignment with local improvement passes, and projects port positions along node boundaries.
//! 3. **Routing Order Variants**: Generates up to `max_route_order_variants` deterministic edge sorting
//!    permutations (Hardest First, Reverse Hardest, Badge Area Descending, Source Port Index, Rank Span Ascending, Edge ID).
//! 4. **Incremental Pathfinding & Ledger Commit**: Routes edges sequentially on the discretized grid,
//!    committing segment reservations to the `RouteOccupancyLedger`.
//! 5. **Rip-Up & Reroute Loop**: When soft or hard conflicts arise (unrouted edges, segment overlaps,
//!    or crossings), the orchestrator identifies colliding edge sets, releases their ledger reservations,
//!    and attempts permutation-based rerouting or local rip-up passes (up to `max_rip_up_passes`).
//! 6. **Layout Score Selection**: Evaluates completed route sets using `validate_custom_layout` and
//!    `compare_layout_scores`, returning the highest-quality non-overlapping route set.

use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};
use crate::badge_measurement::measure_badge_rect;
use crate::config::CustomLayoutConfig;
use crate::edge_routing::bounded_astar::{search_orthogonal_route_cached, RouteSearchOptions};
use crate::edge_routing::port_assignment::{
    assign_port_sides_globally, distribute_ports, EdgeMetaForAssignment,
};
use crate::edge_routing::port_candidates::{
    generate_port_candidates, EdgePorts, PortCandidate, PortSideAssignment,
};
use crate::edge_routing::route_occupancy::{OccupancyRecord, RouteOccupancyLedger};
use crate::edge_routing::routing_grid::build_routing_grid;
use crate::edge_routing::special_routes::route_self_loop;
use crate::validation::layout_validator::{
    compare_layout_scores, validate_custom_layout, ExtendedLayoutValidationResult, LayoutEvaluationCandidate,
};
use crate::types::{
    EdgeRole, NormalizedEdge, NormalizedNode, Point, PortRef, PositionedNode, Rect, RoutedPath,
};

/// High-level output of the edge router orchestrator.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeRouterResult {
    pub routes: Vec<RoutedPath>,
    pub status: String,
    pub occupancy: Vec<OccupancyRecord>,
}

/// Optional input configuration overrides for edge routing.
#[derive(Debug, Clone, Default)]
pub struct EdgeRouterOptions {
    pub side_assignments: Option<HashMap<String, PortSideAssignment>>,
    pub port_orders: Option<HashMap<String, Vec<String>>>,
}

#[derive(Debug, Clone)]
struct EdgeSortMeta<'a> {
    edge: &'a NormalizedEdge,
    is_feedback: bool,
    rank_span: usize,
    regret: f64,
    badge_area: f64,
}

fn compare_edge_metas(a: &EdgeSortMeta, b: &EdgeSortMeta, epsilon: f64) -> std::cmp::Ordering {
    if a.is_feedback != b.is_feedback {
        return if a.is_feedback {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        };
    }
    if a.rank_span != b.rank_span {
        return b.rank_span.cmp(&a.rank_span);
    }
    if (b.regret - a.regret).abs() > epsilon {
        return b.regret.partial_cmp(&a.regret).unwrap();
    }
    if (b.badge_area - a.badge_area).abs() > epsilon {
        return b.badge_area.partial_cmp(&a.badge_area).unwrap();
    }
    a.edge.id.cmp(&b.edge.id)
}

/// Generates up to `max_permutations` orderings of input items.
pub fn generate_permutations<T: Clone>(items: &[T], max_permutations: usize) -> Vec<Vec<T>> {
    let mut results = Vec::new();

    fn permute<T: Clone>(arr: Vec<T>, memo: Vec<T>, results: &mut Vec<Vec<T>>, max_perms: usize) {
        if results.len() >= max_perms {
            return;
        }
        if arr.is_empty() {
            results.push(memo);
            return;
        }
        for i in 0..arr.len() {
            let mut curr = arr.clone();
            let next_elem = curr.remove(i);
            let mut next_memo = memo.clone();
            next_memo.push(next_elem);
            permute(curr, next_memo, results, max_perms);
        }
    }

    permute(items.to_vec(), Vec::new(), &mut results, max_permutations);
    results
}

/// Releases reservations for conflicting edge IDs and re-commits updated routes.
pub fn replace_conflict_reservations(
    ledger: &mut RouteOccupancyLedger,
    conflict_edge_ids: &[String],
    routes: &HashMap<String, RoutedPath>,
    ports_by_edge: &HashMap<String, EdgePorts>,
) {
    let mut unique_ids: Vec<String> = conflict_edge_ids.to_vec();
    unique_ids.sort();
    unique_ids.dedup();

    for edge_id in &unique_ids {
        ledger.release(edge_id);
    }
    for edge_id in &unique_ids {
        if let Some(route) = routes.get(edge_id) {
            let ports = ports_by_edge.get(edge_id);
            ledger.commit_route(
                edge_id,
                &route.points,
                ports.map(|p| &p.source_port),
                ports.map(|p| &p.target_port),
            );
        }
    }
}

/// Main entry point for Step 5 Orthogonal Edge Routing.
pub fn route_all_edges(
    nodes: &[PositionedNode],
    edges: &[NormalizedEdge],
    classified_edges: Option<&[NormalizedEdge]>,
    config: &CustomLayoutConfig,
    options: Option<&EdgeRouterOptions>,
) -> EdgeRouterResult {
    crate::edge_routing::bounded_astar::clear_route_cache();
    let mut self_edges: Vec<&NormalizedEdge> = Vec::new();
    let mut non_self_edges: Vec<&NormalizedEdge> = Vec::new();

    for edge in edges {
        let is_self = edge.source == edge.target;
        if is_self {
            self_edges.push(edge);
        } else {
            non_self_edges.push(edge);
        }
    }

    let node_map: HashMap<String, NormalizedNode> = nodes
        .iter()
        .map(|n| {
            (
                n.id.clone(),
                NormalizedNode {
                    id: n.id.clone(),
                    label: n.label.clone(),
                    width: n.width,
                    height: n.height,
                },
            )
        })
        .collect();

    let node_positions: HashMap<String, Point> = nodes
        .iter()
        .map(|n| (n.id.clone(), Point { x: n.x, y: n.y }))
        .collect();

    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for n in nodes {
        min_x = min_x.min(n.x);
        min_y = min_y.min(n.y);
        max_x = max_x.max(n.x + n.width);
        max_y = max_y.max(n.y + n.height);
    }
    if !min_x.is_finite() {
        min_x = 0.0;
        min_y = 0.0;
        max_x = 800.0;
        max_y = 600.0;
    }

    let bounding_box = Rect {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
    };

    let forbidden_node_rects: Vec<Rect> = nodes
        .iter()
        .map(|n| Rect {
            x: n.x,
            y: n.y,
            width: n.width,
            height: n.height,
        })
        .collect();

    let mut candidates_map: HashMap<String, Vec<PortCandidate>> = HashMap::new();
    let mut edge_meta_map: HashMap<String, EdgeSortMeta> = HashMap::new();
    let mut meta_map_for_assignment: HashMap<String, EdgeMetaForAssignment> = HashMap::new();

    let normalized_nodes_list: Vec<NormalizedNode> = node_map.values().cloned().collect();

    if !non_self_edges.is_empty() {
        for &edge in &non_self_edges {
            let Some(src_node) = node_map.get(&edge.source) else {
                continue;
            };
            let Some(tgt_node) = node_map.get(&edge.target) else {
                continue;
            };
            let src_pos = node_positions.get(&edge.source).cloned().unwrap_or(Point { x: 0.0, y: 0.0 });
            let tgt_pos = node_positions.get(&edge.target).cloned().unwrap_or(Point { x: 0.0, y: 0.0 });

            let classified = classified_edges.and_then(|ce| ce.iter().find(|c| c.id == edge.id));
            let is_feedback = edge.is_cycle.unwrap_or(false)
                || edge.layout_role == Some(crate::types::EdgeLayoutHint::Feedback)
                || classified.is_some_and(|c| c.is_cycle.unwrap_or(false) || c.layout_role == Some(crate::types::EdgeLayoutHint::Feedback));
            let role = if is_feedback {
                EdgeRole::Feedback
            } else {
                EdgeRole::Forward
            };

            let src_ctx = crate::step5_edge_routing::port_candidates::NodeContext { node: src_node, pos: &src_pos };
            let tgt_ctx = crate::step5_edge_routing::port_candidates::NodeContext { node: tgt_node, pos: &tgt_pos };
            let cands = generate_port_candidates(
                edge,
                &src_ctx,
                &tgt_ctx,
                role,
                config,
                Some(&normalized_nodes_list),
                Some(&node_positions),
            );
            candidates_map.insert(edge.id.clone(), cands.clone());

            let mut sorted_cands = cands;
            sorted_cands.sort_by(|a, b| a.base_cost.partial_cmp(&b.base_cost).unwrap());
            let best_cost = sorted_cands.first().map_or(0.0, |c| c.base_cost);
            let second_cost = sorted_cands.get(1).map_or(best_cost, |c| c.base_cost);
            let regret = second_cost - best_cost;

            let src_rank = nodes.iter().find(|n| n.id == edge.source).map_or(0, |n| n.rank);
            let tgt_rank = nodes.iter().find(|n| n.id == edge.target).map_or(0, |n| n.rank);
            let rank_span = (tgt_rank as isize - src_rank as isize).unsigned_abs();

            let badge_rect = measure_badge_rect(
                edge.label.as_deref().unwrap_or(""),
                config,
                edge.is_cycle.unwrap_or(false),
            );
            let badge_area = badge_rect.width * badge_rect.height;

            edge_meta_map.insert(
                edge.id.clone(),
                EdgeSortMeta {
                    edge,
                    is_feedback,
                    rank_span,
                    regret,
                    badge_area,
                },
            );

            meta_map_for_assignment.insert(
                edge.id.clone(),
                EdgeMetaForAssignment {
                    is_feedback,
                    rank_span,
                    badge_area,
                },
            );
        }
    }

    let mut side_assignments_map: HashMap<String, PortSideAssignment> = HashMap::new();

    if let Some(opts) = options {
        if let Some(ref sa) = opts.side_assignments {
            for (e_id, assignment) in sa {
                side_assignments_map.insert(e_id.clone(), assignment.clone());
            }
        }
    }

    let unassigned_edges: Vec<&NormalizedEdge> = non_self_edges
        .iter()
        .copied()
        .filter(|e| !side_assignments_map.contains_key(&e.id))
        .collect();

    if !unassigned_edges.is_empty() {
        let side_assignment_result = assign_port_sides_globally(
            &unassigned_edges.iter().map(|&e| e.clone()).collect::<Vec<_>>(),
            &candidates_map,
            config,
            Some(&meta_map_for_assignment),
        );

        for (e_id, cand) in side_assignment_result.assignments {
            if let std::collections::hash_map::Entry::Vacant(e) = side_assignments_map.entry(e_id) {
                e.insert(PortSideAssignment {
                        src_side: cand.src_side,
                        tgt_side: cand.tgt_side,
                    });
            }
        }
    }

    let non_self_edges_owned: Vec<NormalizedEdge> = non_self_edges.iter().map(|&e| e.clone()).collect();
    let port_distribution_result = distribute_ports(
        &non_self_edges_owned,
        &side_assignments_map,
        &node_map,
        &node_positions,
        config,
        options.and_then(|o| o.port_orders.as_ref()),
    );

    let mut all_port_refs: Vec<PortRef> = Vec::new();
    for ports in port_distribution_result.ports_by_edge.values() {
        all_port_refs.push(ports.source_port.clone());
        all_port_refs.push(ports.target_port.clone());
    }

    // Order Variants
    let mut hardest_first = non_self_edges_owned.clone();
    hardest_first.sort_by(|a, b| {
        let meta_a = edge_meta_map.get(&a.id);
        let meta_b = edge_meta_map.get(&b.id);
        if let (Some(ma), Some(mb)) = (meta_a, meta_b) {
            return compare_edge_metas(ma, mb, config.epsilon);
        }
        a.id.cmp(&b.id)
    });

    let mut reverse_hardest_first = hardest_first.clone();
    reverse_hardest_first.reverse();

    let mut badge_area_desc = non_self_edges_owned.clone();
    badge_area_desc.sort_by(|a, b| {
        let meta_a = edge_meta_map.get(&a.id);
        let meta_b = edge_meta_map.get(&b.id);
        if let (Some(ma), Some(mb)) = (meta_a, meta_b) {
            if (mb.badge_area - ma.badge_area).abs() > config.epsilon {
                return mb.badge_area.partial_cmp(&ma.badge_area).unwrap();
            }
            if ma.rank_span != mb.rank_span {
                return mb.rank_span.cmp(&ma.rank_span);
            }
        }
        a.id.cmp(&b.id)
    });

    let mut source_node_id_and_port_index = non_self_edges_owned.clone();
    source_node_id_and_port_index.sort_by(|a, b| {
        let ports_a = port_distribution_result.ports_by_edge.get(&a.id);
        let ports_b = port_distribution_result.ports_by_edge.get(&b.id);
        if a.source != b.source {
            return a.source.cmp(&b.source);
        }
        let idx_a = ports_a.map_or(0, |p| p.source_port.index);
        let idx_b = ports_b.map_or(0, |p| p.source_port.index);
        if idx_a != idx_b {
            return idx_a.cmp(&idx_b);
        }
        if a.target != b.target {
            return a.target.cmp(&b.target);
        }
        a.id.cmp(&b.id)
    });

    let mut rank_span_ascending = non_self_edges_owned.clone();
    rank_span_ascending.sort_by(|a, b| {
        let meta_a = edge_meta_map.get(&a.id);
        let meta_b = edge_meta_map.get(&b.id);
        if let (Some(ma), Some(mb)) = (meta_a, meta_b) {
            if ma.rank_span != mb.rank_span {
                return ma.rank_span.cmp(&mb.rank_span);
            }
        }
        a.id.cmp(&b.id)
    });

    let mut edge_id_ascending = non_self_edges_owned.clone();
    edge_id_ascending.sort_by(|a, b| a.id.cmp(&b.id));

    let order_candidates = vec![
        hardest_first,
        reverse_hardest_first,
        badge_area_desc,
        source_node_id_and_port_index,
        rank_span_ascending,
        edge_id_ascending,
    ];

    let mut order_variants: Vec<Vec<NormalizedEdge>> = Vec::new();
    let mut seen_signatures = HashSet::new();
    let max_variants = if options
        .and_then(|o| o.side_assignments.as_ref())
        .is_some_and(|sa| !sa.is_empty())
    {
        1
    } else {
        config.max_route_order_variants
    };

    for cand in order_candidates {
        let sig = cand.iter().map(|e| e.id.as_str()).collect::<Vec<_>>().join(",");
        if !seen_signatures.contains(&sig) {
            seen_signatures.insert(sig);
            order_variants.push(cand);
            if order_variants.len() >= max_variants {
                break;
            }
        }
    }

    let mut global_best_routes_map: HashMap<String, RoutedPath> = HashMap::new();
    let mut global_best_validation: Option<ExtendedLayoutValidationResult> = None;
    let mut global_best_occupancy: Vec<OccupancyRecord> = Vec::new();

    for variant_edges in order_variants {
        let mut ledger = RouteOccupancyLedger::new(config.epsilon);
        let mut routes_map: HashMap<String, RoutedPath> = HashMap::new();

        let mut self_loop_counts: HashMap<String, usize> = HashMap::new();
        for &edge in &self_edges {
            let Some(node) = node_map.get(&edge.source) else {
                continue;
            };
            let node_pos = node_positions.get(&node.id).cloned().unwrap_or(Point { x: 0.0, y: 0.0 });
            let idx = *self_loop_counts.get(&node.id).unwrap_or(&0);
            self_loop_counts.insert(node.id.clone(), idx + 1);

            let r = route_self_loop(edge, node, &node_pos, config, idx);
            routes_map.insert(edge.id.clone(), r.clone());
            ledger.commit_route(&r.edge_id, &r.points, None, None);
        }

        let grid = build_routing_grid(
            &normalized_nodes_list,
            &node_positions,
            &all_port_refs,
            &bounding_box,
            config,
            config.initial_lane_rings,
        );

        let sync_ledger_grid = |g: &crate::edge_routing::routing_grid::RoutingGrid, leg: &mut RouteOccupancyLedger| {
            let mut x_coords: Vec<f64> = g.vertices.values().map(|p| p.x).collect();
            let mut y_coords: Vec<f64> = g.vertices.values().map(|p| p.y).collect();
            x_coords.sort_by(|a, b| a.partial_cmp(b).unwrap());
            x_coords.dedup();
            y_coords.sort_by(|a, b| a.partial_cmp(b).unwrap());
            y_coords.dedup();
            leg.set_grid_coordinates(&x_coords, &y_coords);
        };

        sync_ledger_grid(&grid, &mut ledger);

        let mut unrouted_edges: HashSet<String> = HashSet::new();

        for edge in &variant_edges {
            let ports = port_distribution_result.ports_by_edge.get(&edge.id);
            let Some(p) = ports else {
                continue;
            };

            let meta = edge_meta_map.get(&edge.id);
            let is_feedback = meta.map_or_else(|| edge.is_cycle.unwrap_or(false), |m| m.is_feedback);

            let route = search_orthogonal_route_cached(
                &edge.id,
                &p.source_port,
                &p.target_port,
                &grid,
                &ledger.to_occupancy_records(),
                config,
                &RouteSearchOptions {
                    role: Some(if is_feedback {
                        EdgeRole::Feedback
                    } else {
                        EdgeRole::Forward
                    }),
                    forbidden_rects: forbidden_node_rects.clone(),
                    allow_dogleg_fallback: true,
                    ..Default::default()
                },
            );

            if let Some(r) = route {
                routes_map.insert(edge.id.clone(), r.clone());
                ledger.commit_route(&edge.id, &r.points, Some(&p.source_port), Some(&p.target_port));
            } else {
                unrouted_edges.insert(edge.id.clone());
            }
        }

        let evaluate_current_validation = |r_map: &HashMap<String, RoutedPath>| -> ExtendedLayoutValidationResult {
            let route_list: Vec<RoutedPath> = r_map.values().cloned().collect();
            validate_custom_layout(nodes, &route_list, &[], Some(edges), None, config)
        };

        let mut curr_validation = evaluate_current_validation(&routes_map);
        let mut variant_best_validation = curr_validation.clone();
        let mut variant_best_routes_map = routes_map.clone();
        let mut variant_best_occupancy = ledger.to_occupancy_records();

        let mut seen_state_signatures = HashSet::new();
        let mut seen_conflict_signatures = HashSet::new();

        let get_routes_signature = |r_map: &HashMap<String, RoutedPath>| -> String {
            let mut entries: Vec<(&String, &RoutedPath)> = r_map.iter().collect();
            entries.sort_by(|a, b| a.0.cmp(b.0));
            entries
                .into_iter()
                .map(|(id, r)| {
                    format!(
                        "{}:{}",
                        id,
                        r.points
                            .iter()
                            .map(|p| format!("{},{}", p.x, p.y))
                            .collect::<Vec<_>>()
                            .join("->")
                    )
                })
                .collect::<Vec<_>>()
                .join(";")
        };

        let mut no_improvement_count = 0;
        let max_passes = config.max_rip_up_passes;

        for pass in 0..max_passes {
            let state_sig = get_routes_signature(&routes_map);
            if seen_state_signatures.contains(&state_sig) {
                break;
            }
            seen_state_signatures.insert(state_sig);

            let reservations = ledger.get_reservations();
            let conflicts = ledger.query_conflicts(&reservations);
            let crossings = &curr_validation.crossings;

            if unrouted_edges.is_empty()
                && conflicts.is_empty()
                && crossings.is_empty()
                && curr_validation.is_valid
            {
                break;
            }

            let mut conflict_set: HashSet<String> = unrouted_edges.clone();
            for c in &conflicts {
                conflict_set.insert(c.edge_id_a.clone());
                conflict_set.insert(c.edge_id_b.clone());
            }
            for cross in crossings {
                conflict_set.insert(cross.edge_id_a.clone());
                conflict_set.insert(cross.edge_id_b.clone());
            }

            if conflict_set.is_empty() {
                break;
            }

            let mut conflict_list: Vec<String> = conflict_set.iter().cloned().collect();
            conflict_list.sort();
            let conflict_sig = conflict_list.join(",");
            if seen_conflict_signatures.contains(&conflict_sig) {
                break;
            }
            seen_conflict_signatures.insert(conflict_sig);

            let conflict_edge_list: Vec<NormalizedEdge> = non_self_edges_owned
                .iter()
                .filter(|e| conflict_set.contains(&e.id))
                .cloned()
                .collect();

            if conflict_edge_list.len() > 1
                && conflict_edge_list.len() <= config.max_conflict_permutation_size
            {
                let perms = generate_permutations(&conflict_edge_list, config.max_conflict_permutations);
                let mut best_perm_routes: Option<HashMap<String, RoutedPath>> = None;
                let mut best_perm_validation: Option<ExtendedLayoutValidationResult> = None;
                let mut best_perm_ledger_occ: Option<Vec<OccupancyRecord>> = None;

                for perm in perms {
                    let mut trial_ledger = RouteOccupancyLedger::new(config.epsilon);
                    let mut trial_routes_map = routes_map.clone();

                    for e_id in &conflict_set {
                        trial_routes_map.remove(e_id);
                    }

                    for (e_id, r) in &trial_routes_map {
                        let ports = port_distribution_result.ports_by_edge.get(e_id);
                        trial_ledger.commit_route(
                            e_id,
                            &r.points,
                            ports.map(|p| &p.source_port),
                            ports.map(|p| &p.target_port),
                        );
                    }

                    for edge in &perm {
                        let ports = port_distribution_result.ports_by_edge.get(&edge.id);
                        let Some(p) = ports else {
                            continue;
                        };
                        let meta = edge_meta_map.get(&edge.id);
                        let is_feedback =
                            meta.map_or_else(|| edge.is_cycle.unwrap_or(false), |m| m.is_feedback);

                        let route = search_orthogonal_route_cached(
                            &edge.id,
                            &p.source_port,
                            &p.target_port,
                            &grid,
                            &trial_ledger.to_occupancy_records(),
                            config,
                            &RouteSearchOptions {
                                role: Some(if is_feedback {
                                    EdgeRole::Feedback
                                } else {
                                    EdgeRole::Forward
                                }),
                                forbidden_rects: forbidden_node_rects.clone(),
                                allow_dogleg_fallback: true,
                                ..Default::default()
                            },
                        );

                        if let Some(r) = route {
                            trial_routes_map.insert(edge.id.clone(), r.clone());
                            trial_ledger.commit_route(
                                &edge.id,
                                &r.points,
                                Some(&p.source_port),
                                Some(&p.target_port),
                            );
                        }
                    }

                    let trial_val = evaluate_current_validation(&trial_routes_map);
                    let update_best = best_perm_validation.as_ref().is_none_or(|best_val| {
                        let trial_routes = trial_routes_map.values().cloned().collect::<Vec<_>>();
                        let best_routes = best_perm_routes.as_ref().unwrap().values().cloned().collect::<Vec<_>>();
                        let cand_a = LayoutEvaluationCandidate { result: &trial_val, edges: &trial_routes, badges: &[] };
                        let cand_b = LayoutEvaluationCandidate { result: best_val, edges: &best_routes, badges: &[] };
                        compare_layout_scores(&cand_a, &cand_b, nodes, None) == std::cmp::Ordering::Less
                    });

                    if update_best {
                        best_perm_validation = Some(trial_val.clone());
                        best_perm_routes = Some(trial_routes_map);
                        best_perm_ledger_occ = Some(trial_ledger.to_occupancy_records());
                    }

                    if trial_val.is_valid && trial_val.crossings.is_empty() {
                        break;
                    }
                }

                if let (Some(bp_routes), Some(bp_val), Some(_bp_occ)) =
                    (best_perm_routes, best_perm_validation, best_perm_ledger_occ)
                {
                    routes_map = bp_routes;
                    replace_conflict_reservations(
                        &mut ledger,
                        &conflict_list,
                        &routes_map,
                        &port_distribution_result.ports_by_edge,
                    );
                    curr_validation = bp_val;
                }
            } else {
                for e_id in &conflict_set {
                    ledger.release(e_id);
                    routes_map.remove(e_id);
                }

                let mut edges_to_reroute: Vec<NormalizedEdge> = non_self_edges_owned
                    .iter()
                    .filter(|e| conflict_set.contains(&e.id))
                    .cloned()
                    .collect();
                edges_to_reroute.sort_by(|a, b| {
                    let meta_a = edge_meta_map.get(&a.id);
                    let meta_b = edge_meta_map.get(&b.id);
                    if let (Some(ma), Some(mb)) = (meta_a, meta_b) {
                        return compare_edge_metas(ma, mb, config.epsilon);
                    }
                    a.id.cmp(&b.id)
                });

                unrouted_edges.clear();

                for edge in &edges_to_reroute {
                    let ports = port_distribution_result.ports_by_edge.get(&edge.id);
                    let Some(p) = ports else {
                        continue;
                    };
                    let meta = edge_meta_map.get(&edge.id);
                    let is_feedback =
                        meta.map_or_else(|| edge.is_cycle.unwrap_or(false), |m| m.is_feedback);

                    let route = search_orthogonal_route_cached(
                        &edge.id,
                        &p.source_port,
                        &p.target_port,
                        &grid,
                        &ledger.to_occupancy_records(),
                        config,
                        &RouteSearchOptions {
                            role: Some(if is_feedback {
                                EdgeRole::Feedback
                            } else {
                                EdgeRole::Forward
                            }),
                            forbidden_rects: forbidden_node_rects.clone(),
                            allow_dogleg_fallback: true,
                            ..Default::default()
                        },
                    );

                    if let Some(r) = route {
                        routes_map.insert(edge.id.clone(), r.clone());
                        ledger.commit_route(&edge.id, &r.points, Some(&p.source_port), Some(&p.target_port));
                    } else {
                        unrouted_edges.insert(edge.id.clone());
                    }
                }
                curr_validation = evaluate_current_validation(&routes_map);
            }
            let curr_routes = routes_map.values().cloned().collect::<Vec<_>>();
            let variant_routes = variant_best_routes_map.values().cloned().collect::<Vec<_>>();
            let cand_curr = LayoutEvaluationCandidate { result: &curr_validation, edges: &curr_routes, badges: &[] };
            let cand_var = LayoutEvaluationCandidate { result: &variant_best_validation, edges: &variant_routes, badges: &[] };
            let score_cmp = compare_layout_scores(&cand_curr, &cand_var, nodes, None);

            if score_cmp == std::cmp::Ordering::Less {
                variant_best_validation = curr_validation.clone();
                variant_best_routes_map = routes_map.clone();
                variant_best_occupancy = ledger.to_occupancy_records();
                no_improvement_count = 0;
            } else {
                no_improvement_count += 1;
                if no_improvement_count >= 2 && pass > 0 {
                    break;
                }
            }
        }

        let global_update = global_best_validation.as_ref().is_none_or(|gb_val| {
            let variant_routes = variant_best_routes_map.values().cloned().collect::<Vec<_>>();
            let global_routes = global_best_routes_map.values().cloned().collect::<Vec<_>>();
            let cand_v = LayoutEvaluationCandidate { result: &variant_best_validation, edges: &variant_routes, badges: &[] };
            let cand_g = LayoutEvaluationCandidate { result: gb_val, edges: &global_routes, badges: &[] };
            compare_layout_scores(&cand_v, &cand_g, nodes, None) == std::cmp::Ordering::Less
        });

        if global_update {
            global_best_validation = Some(variant_best_validation.clone());
            global_best_routes_map = variant_best_routes_map;
            global_best_occupancy = variant_best_occupancy;
        }

        if let Some(ref gb_val) = global_best_validation {
            if gb_val.is_valid
                && gb_val.metrics.edge_node_penetrations == 0
                && gb_val.metrics.shared_edge_segment_length == 0.0
                && gb_val.metrics.crossing_count == 0
            {
                break;
            }
        }
    }

    let final_routes: Vec<RoutedPath> = global_best_routes_map.into_values().collect();
    let status = if global_best_validation.is_some_and(|v| v.is_valid) {
        "success".to_string()
    } else {
        "unresolved_soft_conflicts".to_string()
    };

    EdgeRouterResult {
        routes: final_routes,
        status,
        occupancy: global_best_occupancy,
    }
}

pub fn route_edges(nodes: &[PositionedNode], edges: &[NormalizedEdge]) -> Vec<RoutedPath> {
    let config = CustomLayoutConfig::default();
    let res = route_all_edges(nodes, edges, None, &config, None);
    res.routes
}
