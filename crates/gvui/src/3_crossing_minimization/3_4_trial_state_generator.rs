//! # Step 3.4: Trial State Generators & State Hash Deduplication
//!
//! This module provides trial state generators for local neighborhood search optimization, including
//! port side assignments, layer order swaps, aesthetic defect edge targeting, and state hashing.
//!
//! ## Trial State Categories
//!
//! 1. **Candidate Port Side Assignments**:
//!    Evaluates up to 16 combinations $(src\_side, tgt\_side) \in \{\text{Top, Right, Bottom, Left}\}^2$,
//!    scoring each candidate by Euclidean distance and turn penalties.
//!
//! 2. **One-Endpoint Single-Step Alternatives**:
//!    Generates trial moves modifying either the source or target port side to an adjacent side on the node perimeter ring.
//!
//! 3. **Aesthetic Defect Edge Targetting**:
//!    Identifies "defect edges" suffering from U-turn hairpins or excess bends and generates outward-directed
//!    port alternatives aligned with graph center geometry and node side congestion metrics.
//!
//! 4. **Crossing Component Search States**:
//!    Finds connected components of crossing edge pairs in 2D space using graph traversal and generates
//!    composite trial states modifying port assignments across full crossing components.
//!
//! 5. **State Hash Deduplication**:
//!    `compute_state_hash` serializes side assignments, port orders, layer orders, and exact spacing demands
//!    into a deterministic string key `S:...|P:...|L:...|D:...` to prevent search cycles and duplicate evaluations.

use super::objective_evaluator::{calculate_excess_bends, count_path_hairpins};
use crate::types::{
    ClassifiedEdge, CustomLayoutConfig, EdgeCrossing, LayoutDiagnostic, LayoutSearchState, Point,
    PortSideAssignment, PositionedNode, RoutedPath, Side, NormalizedNode,
};
use std::collections::{HashMap, HashSet};

/// Pairs of sides commonly used for feedback edge routing.
pub const FEEDBACK_SIDE_PAIRS: &[(Side, Side)] = &[
    (Side::Left, Side::Left),
    (Side::Right, Side::Right),
    (Side::Left, Side::Top),
    (Side::Right, Side::Top),
];

/// Perimeter side ring ordering (clockwise).
pub const SIDE_RING: &[Side] = &[Side::Top, Side::Right, Side::Bottom, Side::Left];

/// Returns string representation of Side matching TS lowercase side names.
pub fn side_to_str(side: Side) -> &'static str {
    match side {
        Side::Top => "top",
        Side::Right => "right",
        Side::Bottom => "bottom",
        Side::Left => "left",
    }
}

/// Formats a port side assignment as a string key `src_side/tgt_side`.
pub fn assignment_key(assignment: &PortSideAssignment) -> String {
    format!("{}/{}", side_to_str(assignment.src_side), side_to_str(assignment.tgt_side))
}

/// Reverses a port side assignment (swaps source and target sides).
pub fn reverse_assignment(assignment: &PortSideAssignment) -> PortSideAssignment {
    PortSideAssignment {
        src_side: assignment.tgt_side,
        tgt_side: assignment.src_side,
    }
}

/// Returns the adjacent sides on the 4-side perimeter ring.
pub fn adjacent_sides(side: Side) -> Vec<Side> {
    let idx = match side {
        Side::Top => 0,
        Side::Right => 1,
        Side::Bottom => 2,
        Side::Left => 3,
    };
    let prev = SIDE_RING[(idx + SIDE_RING.len() - 1) % SIDE_RING.len()];
    let next = SIDE_RING[(idx + 1) % SIDE_RING.len()];
    vec![prev, next]
}

/// Queries current port side assignment for an edge, falling back to routed paths or defaults.
pub fn current_assignment(
    state: &LayoutSearchState,
    edge_id: &str,
    routes: &[RoutedPath],
) -> PortSideAssignment {
    if let Some(&assign) = state.side_assignments.get(edge_id) {
        return assign;
    }
    if let Some(routed) = routes.iter().find(|r| r.edge_id == edge_id) {
        return PortSideAssignment {
            src_side: routed.source_port.side,
            tgt_side: routed.target_port.side,
        };
    }
    PortSideAssignment {
        src_side: Side::Bottom,
        tgt_side: Side::Top,
    }
}

/// Candidate port side assignment with distance and bend estimates.
#[derive(Debug, Clone)]
pub struct CandidateAssignment {
    pub assignment: PortSideAssignment,
    pub base_cost: f64,
    pub estimated_length: f64,
    pub bend_estimate: f64,
}

/// Generates up to 16 candidate port side assignments scored by geometric metrics.
pub fn candidate_assignments(
    edge: &ClassifiedEdge,
    current: PortSideAssignment,
    nodes: &[PositionedNode],
    config: &CustomLayoutConfig,
) -> Vec<CandidateAssignment> {
    let source = nodes.iter().find(|n| n.id == edge.edge.source);
    let target = nodes.iter().find(|n| n.id == edge.edge.target);

    let (Some(src_node), Some(tgt_node)) = (source, target) else {
        let mut candidates = Vec::new();
        for tgt in adjacent_sides(current.tgt_side) {
            candidates.push(CandidateAssignment {
                assignment: PortSideAssignment {
                    src_side: current.src_side,
                    tgt_side: tgt,
                },
                base_cost: 0.0,
                estimated_length: 0.0,
                bend_estimate: 0.0,
            });
        }
        for src in adjacent_sides(current.src_side) {
            candidates.push(CandidateAssignment {
                assignment: PortSideAssignment {
                    src_side: src,
                    tgt_side: current.tgt_side,
                },
                base_cost: 0.0,
                estimated_length: 0.0,
                bend_estimate: 0.0,
            });
        }
        return candidates;
    };

    let src_norm = NormalizedNode {
        id: src_node.id.clone(),
        label: src_node.label.clone(),
        width: src_node.width,
        height: src_node.height,
    };
    let src_pos = Point { x: src_node.x, y: src_node.y };
    let src_ctx = crate::edge_routing::NodeContext {
        node: &src_norm,
        pos: &src_pos,
    };

    let tgt_norm = NormalizedNode {
        id: tgt_node.id.clone(),
        label: tgt_node.label.clone(),
        width: tgt_node.width,
        height: tgt_node.height,
    };
    let tgt_pos = Point { x: tgt_node.x, y: tgt_node.y };
    let tgt_ctx = crate::edge_routing::NodeContext {
        node: &tgt_norm,
        pos: &tgt_pos,
    };

    let norm_nodes: Vec<NormalizedNode> = nodes
        .iter()
        .map(|n| NormalizedNode {
            id: n.id.clone(),
            label: n.label.clone(),
            width: n.width,
            height: n.height,
        })
        .collect();
    let node_positions: HashMap<String, Point> = nodes
        .iter()
        .map(|n| (n.id.clone(), Point { x: n.x, y: n.y }))
        .collect();

    let candidates = crate::edge_routing::generate_port_candidates(
        &edge.edge,
        &src_ctx,
        &tgt_ctx,
        edge.role,
        config,
        Some(&norm_nodes),
        Some(&node_positions),
    );

    candidates
        .into_iter()
        .map(|c| CandidateAssignment {
            assignment: PortSideAssignment {
                src_side: c.src_side,
                tgt_side: c.tgt_side,
            },
            base_cost: c.base_cost,
            estimated_length: c.estimated_length,
            bend_estimate: c.bend_estimate as f64,
        })
        .collect()
}

/// Generates single-endpoint alternative assignments modifying source or target side to adjacent sides.
pub fn one_endpoint_alternatives(
    edge: &ClassifiedEdge,
    current: PortSideAssignment,
    nodes: &[PositionedNode],
    config: &CustomLayoutConfig,
) -> Vec<PortSideAssignment> {
    let candidates = candidate_assignments(edge, current, nodes, config);

    let select_best = |kind: &str| -> Option<PortSideAssignment> {
        let mut filtered: Vec<&CandidateAssignment> = candidates
            .iter()
            .filter(|c| {
                if kind == "target" {
                    c.assignment.src_side == current.src_side
                        && adjacent_sides(current.tgt_side).contains(&c.assignment.tgt_side)
                } else {
                    c.assignment.tgt_side == current.tgt_side
                        && adjacent_sides(current.src_side).contains(&c.assignment.src_side)
                }
            })
            .collect();

        filtered.sort_by(|a, b| {
            a.base_cost
                .partial_cmp(&b.base_cost)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| assignment_key(&a.assignment).cmp(&assignment_key(&b.assignment)))
        });

        filtered.first().map(|c| c.assignment)
    };

    let best_target = select_best("target");
    let best_source = select_best("source");

    let mut res = Vec::new();
    if let Some(t) = best_target {
        res.push(t);
    }
    if let Some(s) = best_source {
        res.push(s);
    }
    res
}

/// Returns normal unit vector for a given side.
pub fn get_side_normal(side: Side) -> Point {
    match side {
        Side::Top => Point { x: 0.0, y: -1.0 },
        Side::Right => Point { x: 1.0, y: 0.0 },
        Side::Bottom => Point { x: 0.0, y: 1.0 },
        Side::Left => Point { x: -1.0, y: 0.0 },
    }
}

/// Generates single-endpoint aesthetic alternatives for defect edges based on graph alignment and congestion.
pub fn one_endpoint_aesthetic_alternatives(
    edge: &ClassifiedEdge,
    current: PortSideAssignment,
    nodes: &[PositionedNode],
    routes: &[RoutedPath],
    config: &CustomLayoutConfig,
) -> Vec<PortSideAssignment> {
    let candidates = candidate_assignments(edge, current, nodes, config);
    if nodes.is_empty() {
        return Vec::new();
    }

    let min_x = nodes.iter().map(|n| n.x).fold(f64::INFINITY, f64::min);
    let max_x = nodes.iter().map(|n| n.x + n.width).fold(f64::NEG_INFINITY, f64::max);
    let min_y = nodes.iter().map(|n| n.y).fold(f64::INFINITY, f64::min);
    let max_y = nodes.iter().map(|n| n.y + n.height).fold(f64::NEG_INFINITY, f64::max);
    let graph_center = Point {
        x: (min_x + max_x) / 2.0,
        y: (min_y + max_y) / 2.0,
    };
    let node_by_id: HashMap<&str, &PositionedNode> = nodes.iter().map(|n| (n.id.as_str(), n)).collect();

    let outward_score = |node_id: &str, side: Side| -> f64 {
        if let Some(node) = node_by_id.get(node_id) {
            let dx = node.x + node.width / 2.0 - graph_center.x;
            let dy = node.y + node.height / 2.0 - graph_center.y;
            match side {
                Side::Left => -dx,
                Side::Right => dx,
                Side::Top => -dy,
                Side::Bottom => dy,
            }
        } else {
            0.0
        }
    };

    let mut source_candidates: Vec<&CandidateAssignment> = candidates
        .iter()
        .filter(|c| {
            c.assignment.tgt_side == current.tgt_side
                && adjacent_sides(current.src_side).contains(&c.assignment.src_side)
        })
        .collect();

    source_candidates.sort_by(|left, right| {
        let score_left = outward_score(&edge.edge.source, left.assignment.src_side);
        let score_right = outward_score(&edge.edge.source, right.assignment.src_side);
        score_right
            .partial_cmp(&score_left)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| {
                left.base_cost
                    .partial_cmp(&right.base_cost)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .then_with(|| assignment_key(&left.assignment).cmp(&assignment_key(&right.assignment)))
    });

    let select_best_source_move = source_candidates.first().map(|c| c.assignment);

    let source = node_by_id.get(edge.edge.source.as_str());
    let target = node_by_id.get(edge.edge.target.as_str());
    let mut side_loads: HashMap<String, usize> = HashMap::new();

    for route in routes {
        if route.edge_id == edge.edge.id {
            continue;
        }
        let src_key = format!("{}:{}", route.source_port.node_id, side_to_str(route.source_port.side));
        let tgt_key = format!("{}:{}", route.target_port.node_id, side_to_str(route.target_port.side));
        *side_loads.entry(src_key).or_insert(0) += 1;
        *side_loads.entry(tgt_key).or_insert(0) += 1;
    }

    let target_toward_source = if let (Some(src), Some(tgt)) = (source, target) {
        let dx = src.x + src.width / 2.0 - (tgt.x + tgt.width / 2.0);
        let dy = src.y + src.height / 2.0 - (tgt.y + tgt.height / 2.0);
        let distance = dx.hypot(dy);
        let toward_source = if distance > config.epsilon {
            Point {
                x: dx / distance,
                y: dy / distance,
            }
        } else {
            Point { x: 0.0, y: 0.0 }
        };

        let alignment = |side: Side| -> f64 {
            let normal = get_side_normal(side);
            normal.x * toward_source.x + normal.y * toward_source.y
        };

        let congestion = |assignment: &PortSideAssignment| -> usize {
            let src_key = format!("{}:{}", edge.edge.source, side_to_str(assignment.src_side));
            let tgt_key = format!("{}:{}", edge.edge.target, side_to_str(assignment.tgt_side));
            side_loads.get(&src_key).copied().unwrap_or(0)
                + side_loads.get(&tgt_key).copied().unwrap_or(0)
        };

        let mut tgt_candidates: Vec<&CandidateAssignment> = candidates
            .iter()
            .filter(|c| {
                c.assignment.src_side == current.src_side
                    && adjacent_sides(current.tgt_side).contains(&c.assignment.tgt_side)
            })
            .collect();

        tgt_candidates.sort_by(|left, right| {
            let align_left = alignment(left.assignment.tgt_side);
            let align_right = alignment(right.assignment.tgt_side);
            align_right
                .partial_cmp(&align_left)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| congestion(&left.assignment).cmp(&congestion(&right.assignment)))
                .then_with(|| {
                    left.bend_estimate
                        .partial_cmp(&right.bend_estimate)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .then_with(|| {
                    left.estimated_length
                        .partial_cmp(&right.estimated_length)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .then_with(|| {
                    left.base_cost
                        .partial_cmp(&right.base_cost)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .then_with(|| assignment_key(&left.assignment).cmp(&assignment_key(&right.assignment)))
        });

        tgt_candidates.first().map(|c| c.assignment)
    } else {
        None
    };

    let mut res = Vec::new();
    if let Some(s) = select_best_source_move {
        res.push(s);
    }
    if let Some(t) = target_toward_source {
        res.push(t);
    }
    res
}

/// Generates semantic feedback port side alternatives.
pub fn semantic_feedback_alternatives(
    current: PortSideAssignment,
    edge: &ClassifiedEdge,
    nodes: &[PositionedNode],
    config: &CustomLayoutConfig,
) -> Vec<PortSideAssignment> {
    let has_positioned_endpoints = nodes.iter().any(|n| n.id == edge.edge.source)
        && nodes.iter().any(|n| n.id == edge.target());
    if !has_positioned_endpoints {
        return FEEDBACK_SIDE_PAIRS
            .iter()
            .map(|&(src_side, tgt_side)| PortSideAssignment { src_side, tgt_side })
            .filter(|assign| assignment_key(assign) != assignment_key(&current))
            .collect();
    }
    let valid: HashSet<String> = candidate_assignments(edge, current, nodes, config)
        .into_iter()
        .map(|c| assignment_key(&c.assignment))
        .collect();
    FEEDBACK_SIDE_PAIRS
        .iter()
        .map(|&(src_side, tgt_side)| PortSideAssignment { src_side, tgt_side })
        .filter(|assign| {
            assignment_key(assign) != assignment_key(&current)
                && (valid.is_empty() || valid.contains(&assignment_key(assign)))
        })
        .collect()
}

/// Computes connected components of crossing edges.
pub fn crossing_components(crossings: &[EdgeCrossing]) -> Vec<Vec<String>> {
    let mut adjacency: HashMap<String, HashSet<String>> = HashMap::new();
    for crossing in crossings {
        adjacency
            .entry(crossing.edge_id_a.clone())
            .or_default()
            .insert(crossing.edge_id_b.clone());
        adjacency
            .entry(crossing.edge_id_b.clone())
            .or_default()
            .insert(crossing.edge_id_a.clone());
    }

    let mut components: Vec<Vec<String>> = Vec::new();
    let mut remaining: HashSet<String> = adjacency.keys().cloned().collect();

    while !remaining.is_empty() {
        let mut first_vec: Vec<String> = remaining.iter().cloned().collect();
        first_vec.sort();
        let first = first_vec[0].clone();

        let mut queue = vec![first.clone()];
        let mut component = Vec::new();
        remaining.remove(&first);

        while !queue.is_empty() {
            let edge_id = queue.remove(0);
            component.push(edge_id.clone());

            if let Some(adj_set) = adjacency.get(&edge_id) {
                let mut sorted_adj: Vec<String> = adj_set.iter().cloned().collect();
                sorted_adj.sort();
                for adjacent in sorted_adj {
                    if remaining.remove(&adjacent) {
                        queue.push(adjacent);
                    }
                }
            }
        }
        component.sort();
        components.push(component);
    }

    components.sort_by_key(|left| left.join("\u{0000}"));
    components
}

/// Computes a unique deterministic state hash key for search deduplication.
pub fn compute_state_hash(state: &LayoutSearchState) -> String {
    let mut side_entries: Vec<(&String, &PortSideAssignment)> = state.side_assignments.iter().collect();
    side_entries.sort_by(|a, b| a.0.cmp(b.0));
    let sides_str = side_entries
        .iter()
        .map(|(id, s)| format!("{}:{}->{}", id, side_to_str(s.src_side), side_to_str(s.tgt_side)))
        .collect::<Vec<_>>()
        .join(";");

    let mut port_entries: Vec<(&String, &Vec<String>)> = state.port_orders.iter().collect();
    port_entries.sort_by(|a, b| a.0.cmp(b.0));
    let orders_str = port_entries
        .iter()
        .map(|(k, v)| format!("{}=[{}", k, v.join(",")) + "]")
        .collect::<Vec<_>>()
        .join(";");

    let demands_str = crate::coordinate_assignment::exact_spacing_demand_signature(&state.exact_demands);

    let mut layer_entries: Vec<(&usize, &Vec<String>)> = state.layer_orders.iter().collect();
    layer_entries.sort_by(|a, b| a.0.cmp(b.0));
    let layers_str = layer_entries
        .iter()
        .map(|(r, o)| format!("r{}:[{}", r, o.join(",")) + "]")
        .collect::<Vec<_>>()
        .join(";");

    let mut shift_entries: Vec<(&usize, &f64)> = state.layer_shifts.iter().collect();
    shift_entries.sort_by(|a, b| a.0.cmp(b.0));
    let shifts_str = shift_entries
        .iter()
        .map(|(k, v)| format!("{}:{}", k, v))
        .collect::<Vec<_>>()
        .join(";");

    format!("{}|{}|{}|{}|{}", sides_str, orders_str, demands_str, layers_str, shifts_str)
}

/// Generates aesthetic trial search states for defect edges.
pub fn generate_aesthetic_trial_states(
    state: &LayoutSearchState,
    routes: &[RoutedPath],
    classified_edges: &[ClassifiedEdge],
    nodes: &[PositionedNode],
    config: &CustomLayoutConfig,
) -> Vec<LayoutSearchState> {
    let routes_by_edge_id: HashMap<&str, &RoutedPath> =
        routes.iter().map(|r| (r.edge_id.as_str(), r)).collect();

    let mut defect_edges: Vec<&ClassifiedEdge> = classified_edges
        .iter()
        .filter(|edge| {
            if let Some(route) = routes_by_edge_id.get(edge.edge.id.as_str()) {
                let hairpins = count_path_hairpins(&route.points, config.epsilon);
                let is_struct = edge.role == crate::types::EdgeRole::Feedback
                    || edge.role == crate::types::EdgeRole::SelfRole
                    || edge.edge.is_cycle.unwrap_or(false);
                let avoidable = if is_struct { hairpins.saturating_sub(1) } else { hairpins };
                let excess_bends = calculate_excess_bends(&[(*route).clone()], classified_edges);
                avoidable > 0 || excess_bends > 0
            } else {
                false
            }
        })
        .collect();

    defect_edges.sort_by(|left, right| {
        let left_route = routes_by_edge_id.get(left.edge.id.as_str()).unwrap();
        let right_route = routes_by_edge_id.get(right.edge.id.as_str()).unwrap();
        let left_bends = calculate_excess_bends(&[(*left_route).clone()], classified_edges);
        let right_bends = calculate_excess_bends(&[(*right_route).clone()], classified_edges);
        right_bends.cmp(&left_bends).then_with(|| left.edge.id.cmp(&right.edge.id))
    });

    let mut by_hash: HashMap<String, LayoutSearchState> = HashMap::new();
    let current_hash = compute_state_hash(state);

    for edge in defect_edges {
        let current = current_assignment(state, &edge.edge.id, routes);
        let alts = one_endpoint_aesthetic_alternatives(edge, current, nodes, routes, config);
        for alternative in alts.into_iter().take(2) {
            let mut trial = state.clone();
            trial.side_assignments.insert(edge.edge.id.clone(), alternative);
            let hash = compute_state_hash(&trial);
            if hash != current_hash {
                by_hash.insert(hash, trial);
            }
        }
    }

    by_hash.into_values().collect()
}

/// Generates composite completion search states for crossing components.
pub fn generate_crossing_completion_states(
    state: &LayoutSearchState,
    crossings: &[EdgeCrossing],
    classified_edges: &[ClassifiedEdge],
    routes: &[RoutedPath],
    nodes: &[PositionedNode],
    config: &CustomLayoutConfig,
    limit: usize,
) -> Vec<LayoutSearchState> {
    if crossings.is_empty() || limit == 0 {
        return Vec::new();
    }

    let components = crossing_components(crossings);
    let classified_by_id: HashMap<&str, &ClassifiedEdge> =
        classified_edges.iter().map(|e| (e.edge.id.as_str(), e)).collect();
    let completion_seed = state.clone();
    let mut completion_candidates = Vec::new();

    for variant in 0..2 {
        let mut composite = completion_seed.clone();
        let mut changed = false;

        for component in &components {
            let mut partner_index = 0;
            let bridge_owners: HashSet<String> = crossings
                .iter()
                .filter(|c| component.contains(&c.edge_id_a) || component.contains(&c.edge_id_b))
                .filter_map(|c| c.bridge_owner_edge_id.clone())
                .collect();

            let mut sorted_comp = component.clone();
            sorted_comp.sort();

            for edge_id in &sorted_comp {
                let Some(edge) = classified_by_id.get(edge_id.as_str()) else {
                    continue;
                };
                let current = current_assignment(state, edge_id, routes);
                let alternatives =
                    one_endpoint_aesthetic_alternatives(edge, current, nodes, routes, config);
                let candidate_costs: HashMap<String, f64> = candidate_assignments(edge, current, nodes, config)
                    .into_iter()
                    .map(|c| (assignment_key(&c.assignment), c.base_cost))
                    .collect();

                let alternative = if bridge_owners.contains(edge_id) {
                    let mut sorted_alts = alternatives.clone();
                    sorted_alts.sort_by(|left, right| {
                        let cost_left = candidate_costs.get(&assignment_key(left)).copied().unwrap_or(f64::INFINITY);
                        let cost_right = candidate_costs.get(&assignment_key(right)).copied().unwrap_or(f64::INFINITY);
                        cost_left
                            .partial_cmp(&cost_right)
                            .unwrap_or(std::cmp::Ordering::Equal)
                            .then_with(|| assignment_key(left).cmp(&assignment_key(right)))
                    });
                    sorted_alts.first().copied()
                } else {
                    let alt_idx = (variant + partner_index) % alternatives.len().max(1);
                    partner_index += 1;
                    alternatives.get(alt_idx).copied().or_else(|| alternatives.first().copied())
                };

                if let Some(alt) = alternative {
                    if assignment_key(&alt) != assignment_key(&current) {
                        composite.side_assignments.insert(edge_id.clone(), alt);
                        changed = true;
                    }
                }
            }
        }
        if changed {
            completion_candidates.push(composite);
        }
    }

    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for candidate in completion_candidates {
        let hash = compute_state_hash(&candidate);
        if !seen.contains(&hash) {
            seen.insert(hash);
            result.push(candidate);
            if result.len() >= limit {
                break;
            }
        }
    }

    result
}

struct CrossingComponentRepair {
    _edge_ids: Vec<String>,
    assignments: Vec<(String, PortSideAssignment)>,
}

/// Master generator producing deduplicated candidate search states for neighborhood search.
pub fn generate_neighborhood_states(
    state: &LayoutSearchState,
    nodes: &[PositionedNode],
    routes: &[RoutedPath],
    classified_edges: &[ClassifiedEdge],
    crossings: &[EdgeCrossing],
    diagnostics: &[LayoutDiagnostic],
    ordered_layers: &[Vec<String>],
    reset_side_assignments: bool,
    config: &CustomLayoutConfig,
) -> Vec<LayoutSearchState> {
    let mut neighbors: Vec<LayoutSearchState> = Vec::new();
    let max_neighbors = config.max_neighbors_per_state;

    let mut priority_problem_edge_set: HashSet<String> = HashSet::new();
    let mut feedback_filler_edge_ids: HashSet<String> = HashSet::new();
    let mut pressured_edge_ids: HashSet<String> = HashSet::new();

    let classified_by_id: HashMap<&str, &ClassifiedEdge> =
        classified_edges.iter().map(|e| (e.edge.id.as_str(), e)).collect();
    let routes_by_edge_id: HashMap<&str, &RoutedPath> =
        routes.iter().map(|r| (r.edge_id.as_str(), r)).collect();

    // 1. Build nodeSideMap
    let mut node_side_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut sorted_routes = routes.to_vec();
    sorted_routes.sort_by(|a, b| a.edge_id.cmp(&b.edge_id));
    for route in &sorted_routes {
        let src_key = format!("{}:{}", route.source_port.node_id, side_to_str(route.source_port.side));
        let tgt_key = format!("{}:{}", route.target_port.node_id, side_to_str(route.target_port.side));
        node_side_map.entry(src_key).or_default().push(format!("{}:src", route.edge_id));
        node_side_map.entry(tgt_key).or_default().push(format!("{}:tgt", route.edge_id));
    }

    let mut canonical_port_orders: HashMap<String, Vec<String>> = HashMap::new();
    let mut sorted_node_side_entries: Vec<(String, Vec<String>)> = node_side_map.into_iter().collect();
    sorted_node_side_entries.sort_by(|a, b| a.0.cmp(&b.0));

    for (side_key, endpoints) in &sorted_node_side_entries {
        if !state.port_orders.contains_key(side_key) {
            continue;
        }
        let mut live_endpoints = endpoints.clone();
        live_endpoints.sort();
        live_endpoints.dedup();

        let live_set: HashSet<&str> = live_endpoints.iter().map(|s| s.as_str()).collect();
        let mut seen = HashSet::new();

        let mut retained = Vec::new();
        if let Some(existing_order) = state.port_orders.get(side_key) {
            for endpoint in existing_order {
                if live_set.contains(endpoint.as_str()) && !seen.contains(endpoint.as_str()) {
                    seen.insert(endpoint.clone());
                    retained.push(endpoint.clone());
                }
            }
        }

        let mut final_order = retained;
        for ep in live_endpoints {
            if !seen.contains(&ep) {
                final_order.push(ep);
            }
        }
        canonical_port_orders.insert(side_key.clone(), final_order);
    }

    let clone_canonical_state = || -> LayoutSearchState {
        let mut next_state = state.clone();
        next_state.port_orders = canonical_port_orders.clone();
        next_state
    };

    if reset_side_assignments && !state.side_assignments.is_empty() {
        let mut reset_state = clone_canonical_state();
        reset_state.side_assignments.clear();
        reset_state.exact_demands = state.exact_demands.clone();
        neighbors.push(reset_state);
    }

    // Crossing edges
    for crossing in crossings {
        if classified_by_id.contains_key(crossing.edge_id_a.as_str()) {
            priority_problem_edge_set.insert(crossing.edge_id_a.clone());
        }
        if classified_by_id.contains_key(crossing.edge_id_b.as_str()) {
            priority_problem_edge_set.insert(crossing.edge_id_b.clone());
        }
    }

    for diag in diagnostics {
        if let Some(ids) = &diag.ids {
            for edge_id in ids {
                if classified_by_id.contains_key(edge_id.as_str()) {
                    priority_problem_edge_set.insert(edge_id.clone());
                    pressured_edge_ids.insert(edge_id.clone());
                }
            }
        }
    }

    for demand in &state.exact_demands {
        for edge_id in &demand.affected_edge_ids {
            if classified_by_id.contains_key(edge_id.as_str()) {
                priority_problem_edge_set.insert(edge_id.clone());
                pressured_edge_ids.insert(edge_id.clone());
            }
        }
    }

    for edge in classified_edges {
        if edge.role == crate::types::EdgeRole::Feedback || edge.edge.is_cycle.unwrap_or(false) {
            feedback_filler_edge_ids.insert(edge.edge.id.clone());
        }
    }

    for edge in classified_edges {
        if let Some(route) = routes_by_edge_id.get(edge.edge.id.as_str()) {
            let hairpins = count_path_hairpins(&route.points, config.epsilon);
            let is_struct = edge.role == crate::types::EdgeRole::Feedback
                || edge.role == crate::types::EdgeRole::SelfRole
                || edge.role == crate::types::EdgeRole::SelfLoop
                || edge.edge.is_cycle.unwrap_or(false);
            let has_excess = calculate_excess_bends(std::slice::from_ref(*route), classified_edges) > 0;
            if hairpins > (if is_struct { 1 } else { 0 }) || has_excess {
                priority_problem_edge_set.insert(edge.edge.id.clone());
            }
        }
    }

    let compare_by_assignment_then_id = |left: &str, right: &str| -> std::cmp::Ordering {
        let left_assigned = state.side_assignments.contains_key(left);
        let right_assigned = state.side_assignments.contains_key(right);
        left_assigned.cmp(&right_assigned).then_with(|| left.cmp(right))
    };

    let mandatory_moves: Vec<LayoutSearchState> = Vec::new();
    let mut component_moves: Vec<LayoutSearchState> = Vec::new();
    let mut individual_moves: Vec<LayoutSearchState> = Vec::new();
    let mut clean_feedback_moves: Vec<LayoutSearchState> = Vec::new();
    let mut port_order_moves: Vec<LayoutSearchState> = Vec::new();
    let mut layer_order_moves: Vec<LayoutSearchState> = Vec::new();

    let build_crossing_repair = |edge_ids: &[String]| -> Option<CrossingComponentRepair> {
        let mut ranked_ids = edge_ids.to_vec();
        ranked_ids.sort_by(|a, b| compare_by_assignment_then_id(a, b));

        let feedback_edge_id = ranked_ids.iter().find(|id| {
            let edge = classified_by_id.get(id.as_str());
            edge.is_some_and(|e| e.role == crate::types::EdgeRole::Feedback || e.edge.is_cycle.unwrap_or(false))
        });

        if let Some(fb_id) = feedback_edge_id {
            let edge = classified_by_id.get(fb_id.as_str())?;
            let current = current_assignment(state, fb_id, routes);
            let alts = semantic_feedback_alternatives(current, edge, nodes, config);
            return alts.first().map(|assign| CrossingComponentRepair {
            _edge_ids: edge_ids.to_vec(),
                assignments: vec![(fb_id.clone(), *assign)],
            });
        }

        let primary_edge_id = ranked_ids.iter().find(|id| pressured_edge_ids.contains(*id)).unwrap_or(&ranked_ids[0]);
        let primary_edge = classified_by_id.get(primary_edge_id.as_str())?;
        let primary_current = current_assignment(state, primary_edge_id, routes);
        let primary_alts = one_endpoint_alternatives(primary_edge, primary_current, nodes, config);
        let primary_assignment = *primary_alts.first()?;

        let partner_edge_id = crossings
            .iter()
            .filter(|c| c.edge_id_a == *primary_edge_id || c.edge_id_b == *primary_edge_id)
            .map(|c| if c.edge_id_a == *primary_edge_id { &c.edge_id_b } else { &c.edge_id_a })
            .find(|id| edge_ids.contains(id))?;

        let partner_edge = classified_by_id.get(partner_edge_id.as_str())?;
        let partner_current = current_assignment(state, partner_edge_id, routes);
        let partner_candidates = candidate_assignments(partner_edge, partner_current, nodes, config);
        let partner_cand_keys: HashSet<String> = partner_candidates.into_iter().map(|c| assignment_key(&c.assignment)).collect();

        let mirrored = reverse_assignment(&primary_assignment);
        let partner_assignment = if partner_cand_keys.contains(&assignment_key(&mirrored)) {
            mirrored
        } else {
            *one_endpoint_alternatives(partner_edge, partner_current, nodes, config)
                .iter()
                .find(|a| partner_cand_keys.contains(&assignment_key(a)))?
        };

        Some(CrossingComponentRepair {
            _edge_ids: edge_ids.to_vec(),
            assignments: vec![
                (primary_edge_id.clone(), primary_assignment),
                (partner_edge_id.clone(), partner_assignment),
            ],
        })
    };

    let comp_list = crossing_components(crossings);
    let mut sorted_comp_list = comp_list.clone();
    sorted_comp_list.sort_by(|left, right| {
        let left_assigned: usize = left.iter().map(|id| state.side_assignments.contains_key(id) as usize).sum();
        let right_assigned: usize = right.iter().map(|id| state.side_assignments.contains_key(id) as usize).sum();
        left_assigned.cmp(&right_assigned).then_with(|| left.join("\u{0000}").cmp(&right.join("\u{0000}")))
    });

    let component_repairs: Vec<CrossingComponentRepair> = sorted_comp_list
        .iter()
        .filter_map(|comp| build_crossing_repair(comp))
        .collect();

    for repair in &component_repairs {
        let mut next_state = clone_canonical_state();
        for (edge_id, assignment) in &repair.assignments {
            next_state.side_assignments.insert(edge_id.clone(), *assignment);
        }
        component_moves.push(next_state);
    }

    let mut batch_move: Option<LayoutSearchState> = None;
    if component_repairs.len() >= 2 {
        let mut batch = clone_canonical_state();
        for repair in &component_repairs {
            for (edge_id, assignment) in &repair.assignments {
                batch.side_assignments.insert(edge_id.clone(), *assignment);
            }
        }

        let crossing_edge_ids: HashSet<String> = crossings.iter().flat_map(|c| vec![c.edge_id_a.clone(), c.edge_id_b.clone()]).collect();
        let mut batch_pressure_ids: Vec<&String> = pressured_edge_ids.iter().filter(|id| !crossing_edge_ids.contains(*id)).collect();
        batch_pressure_ids.sort_by(|a, b| compare_by_assignment_then_id(a, b));

        if let Some(batch_pressure_edge_id) = batch_pressure_ids.first() {
            if let Some(edge) = classified_by_id.get(batch_pressure_edge_id.as_str()) {
                let current = current_assignment(state, batch_pressure_edge_id, routes);
                let alts = one_endpoint_alternatives(edge, current, nodes, config);
                let complementary = alts.get(1).or_else(|| alts.first());
                if let Some(comp) = complementary {
                    batch.side_assignments.insert((*batch_pressure_edge_id).clone(), *comp);
                }
            }
        }
        batch_move = Some(batch);
    }

    struct CandidateQueue {
        edge_id: String,
        alternatives: Vec<PortSideAssignment>,
    }

    let build_candidate_queues = |edge_ids: &[String]| -> Vec<CandidateQueue> {
        edge_ids
            .iter()
            .filter_map(|edge_id| {
                let edge = classified_by_id.get(edge_id.as_str())?;
                let current = current_assignment(state, edge_id, routes);
                let is_fb = edge.role == crate::types::EdgeRole::Feedback || edge.edge.is_cycle.unwrap_or(false);
                let alternatives = if is_fb {
                    semantic_feedback_alternatives(current, edge, nodes, config)
                } else {
                    one_endpoint_alternatives(edge, current, nodes, config)
                };
                Some(CandidateQueue {
                    edge_id: edge_id.clone(),
                    alternatives,
                })
            })
            .collect()
    };

    let mut problem_edge_vec: Vec<String> = priority_problem_edge_set.into_iter().collect();
    problem_edge_vec.sort_by(|a, b| compare_by_assignment_then_id(a, b));
    let problem_queues = build_candidate_queues(&problem_edge_vec);

    let mut clean_fb_vec: Vec<String> = feedback_filler_edge_ids
        .into_iter()
        .filter(|id| !problem_edge_vec.contains(id))
        .collect();
    clean_fb_vec.sort_by(|a, b| compare_by_assignment_then_id(a, b));
    let clean_feedback_queues = build_candidate_queues(&clean_fb_vec);

    let append_round_robin_moves = |queues: &[CandidateQueue], dest: &mut Vec<LayoutSearchState>| {
        let mut alt_idx = 0;
        loop {
            let mut added_in_round = false;
            for q in queues {
                if let Some(alt) = q.alternatives.get(alt_idx) {
                    let mut next_state = clone_canonical_state();
                    next_state.side_assignments.insert(q.edge_id.clone(), *alt);
                    dest.push(next_state);
                    added_in_round = true;
                }
            }
            if !added_in_round {
                break;
            }
            alt_idx += 1;
        }
    };

    append_round_robin_moves(&problem_queues, &mut individual_moves);
    append_round_robin_moves(&clean_feedback_queues, &mut clean_feedback_moves);

    // Port order moves
    for (s_key, endpoints) in &sorted_node_side_entries {
        if endpoints.len() >= 2 {
            let current_order = canonical_port_orders.get(s_key).cloned().unwrap_or_else(|| {
                let mut ep = endpoints.clone();
                ep.sort();
                ep
            });
            for i in 0..(current_order.len() - 1) {
                let mut next_state = clone_canonical_state();
                let mut order_copy = current_order.clone();
                order_copy.swap(i, i + 1);
                next_state.port_orders.insert(s_key.clone(), order_copy);
                port_order_moves.push(next_state);
            }
        }
    }

    // Layer order moves for adjacent nodes in same rank when edges cross
    if !crossings.is_empty() {
        for (r, layer_nodes) in ordered_layers.iter().enumerate() {
            if layer_nodes.len() >= 2 {
                for i in 0..(layer_nodes.len() - 1) {
                    let mut next_state = clone_canonical_state();
                    let current_rank_order = next_state
                        .layer_orders
                        .entry(r)
                        .or_insert_with(|| layer_nodes.clone());
                    current_rank_order.swap(i, i + 1);
                    layer_order_moves.push(next_state);
                }
            }
        }
    }

    let mut seen_hashes = HashSet::new();
    seen_hashes.insert(compute_state_hash(state));

    let mut append_unique_fn = |candidate: LayoutSearchState, dest: &mut Vec<LayoutSearchState>| -> bool {
        if dest.len() >= max_neighbors {
            return false;
        }
        let hash = compute_state_hash(&candidate);
        if seen_hashes.contains(&hash) {
            return true;
        }
        seen_hashes.insert(hash);
        dest.push(candidate);
        true
    };

    for move_item in mandatory_moves {
        if !append_unique_fn(move_item, &mut neighbors) {
            return neighbors;
        }
    }

    let depth = state.side_assignments.len()
        + state.port_orders.len()
        + state.layer_orders.len()
        + state.exact_demands.len();

    let rotate = |items: Vec<LayoutSearchState>| -> Vec<LayoutSearchState> {
        if items.len() < 2 {
            return items;
        }
        let offset = depth % items.len();
        let mut rot = items[offset..].to_vec();
        rot.extend_from_slice(&items[..offset]);
        rot
    };

    let mut primary_moves = Vec::new();
    if let Some(b) = batch_move {
        primary_moves.push(b);
    }
    primary_moves.extend(component_moves);
    primary_moves.extend(individual_moves);

    let mut pools: Vec<Vec<LayoutSearchState>> = Vec::new();
    if !primary_moves.is_empty() {
        pools.push(primary_moves);
    }
    let rot_clean_fb = rotate(clean_feedback_moves);
    if !rot_clean_fb.is_empty() {
        pools.push(rot_clean_fb);
    }
    let rot_port_order = rotate(port_order_moves);
    if !rot_port_order.is_empty() {
        pools.push(rot_port_order);
    }
    let rot_layer_order = rotate(layer_order_moves);
    if !rot_layer_order.is_empty() {
        pools.push(rot_layer_order);
    }

    let mut indices = vec![0usize; pools.len()];
    let class_offset = if !pools.is_empty() { depth % pools.len() } else { 0 };

    while neighbors.len() < max_neighbors && !pools.is_empty() {
        let mut added_in_round = false;
        for step in 0..pools.len() {
            if neighbors.len() >= max_neighbors {
                break;
            }
            let pool_idx = (class_offset + step) % pools.len();
            if indices[pool_idx] < pools[pool_idx].len() {
                let candidate = pools[pool_idx][indices[pool_idx]].clone();
                indices[pool_idx] += 1;
                let before = neighbors.len();
                append_unique_fn(candidate, &mut neighbors);
                if neighbors.len() > before {
                    added_in_round = true;
                }
            }
        }
        if !added_in_round && indices.iter().zip(pools.iter()).all(|(idx, pool)| *idx >= pool.len()) {
            break;
        }
    }

    neighbors
}
