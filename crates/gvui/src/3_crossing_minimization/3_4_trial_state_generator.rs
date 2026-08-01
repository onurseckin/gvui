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
    PortSideAssignment, PositionedNode, RoutedPath, Side,
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

/// Formats a port side assignment as a string key `src_side/tgt_side`.
pub fn assignment_key(assignment: &PortSideAssignment) -> String {
    format!("{:?}/{:?}", assignment.src_side, assignment.tgt_side)
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
    _config: &CustomLayoutConfig,
) -> Vec<CandidateAssignment> {
    let source = nodes.iter().find(|n| n.id == edge.edge.source);
    let target = nodes.iter().find(|n| n.id == edge.edge.target);

    if source.is_none() || target.is_none() {
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
    }

    let src = source.unwrap();
    let tgt = target.unwrap();

    let all_sides = [Side::Top, Side::Right, Side::Bottom, Side::Left];
    let mut candidates = Vec::new();

    for &src_side in &all_sides {
        for &tgt_side in &all_sides {
            let dx = (tgt.x + tgt.width / 2.0) - (src.x + src.width / 2.0);
            let dy = (tgt.y + tgt.height / 2.0) - (src.y + src.height / 2.0);
            let dist = dx.hypot(dy);

            let bend_est = if src_side == tgt_side { 2.0 } else { 1.0 };
            let base_cost = dist + bend_est * 10.0;

            candidates.push(CandidateAssignment {
                assignment: PortSideAssignment {
                    src_side,
                    tgt_side,
                },
                base_cost,
                estimated_length: dist,
                bend_estimate: bend_est,
            });
        }
    }

    candidates
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
        let src_key = format!("{}:{:?}", route.source_port.node_id, route.source_port.side);
        let tgt_key = format!("{}:{:?}", route.target_port.node_id, route.target_port.side);
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
            let src_key = format!("{}:{:?}", edge.edge.source, assignment.src_side);
            let tgt_key = format!("{}:{:?}", edge.edge.target, assignment.tgt_side);
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
    _edge: &ClassifiedEdge,
    _nodes: &[PositionedNode],
) -> Vec<PortSideAssignment> {
    FEEDBACK_SIDE_PAIRS
        .iter()
        .map(|&(src_side, tgt_side)| PortSideAssignment { src_side, tgt_side })
        .filter(|assign| assignment_key(assign) != assignment_key(&current))
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
    let mut parts = Vec::new();

    let mut side_keys: Vec<&String> = state.side_assignments.keys().collect();
    side_keys.sort();
    for k in side_keys {
        let assign = &state.side_assignments[k];
        parts.push(format!("S:{}:{:?}/{:?}", k, assign.src_side, assign.tgt_side));
    }

    let mut port_keys: Vec<&String> = state.port_orders.keys().collect();
    port_keys.sort();
    for k in port_keys {
        parts.push(format!("P:{}:{}", k, state.port_orders[k].join(",")));
    }

    let mut layer_keys: Vec<&usize> = state.layer_orders.keys().collect();
    layer_keys.sort();
    for k in layer_keys {
        parts.push(format!("L:{}:{}", k, state.layer_orders[k].join(",")));
    }

    let mut demand_strings: Vec<String> = state
        .exact_demands
        .iter()
        .map(|d| format!("{:?}:{}:{:?}", d.kind, d.minimum, d.rank))
        .collect();
    demand_strings.sort();
    parts.push(format!("D:{}", demand_strings.join(";")));

    parts.join("|")
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
            for edge_id in component {
                if let Some(edge) = classified_by_id.get(edge_id.as_str()) {
                    let current = current_assignment(state, edge_id, routes);
                    let alternatives =
                        one_endpoint_aesthetic_alternatives(edge, current, nodes, routes, config);
                    if alternatives.is_empty() {
                        continue;
                    }
                    let alt_idx = (variant + partner_index) % alternatives.len();
                    partner_index += 1;
                    let alt = alternatives[alt_idx];
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

/// Master generator producing deduplicated candidate search states for neighborhood search.
pub fn generate_neighborhood_states(
    state: &LayoutSearchState,
    nodes: &[PositionedNode],
    routes: &[RoutedPath],
    classified_edges: &[ClassifiedEdge],
    crossings: &[EdgeCrossing],
    diagnostics: &[LayoutDiagnostic],
    config: &CustomLayoutConfig,
) -> Vec<LayoutSearchState> {
    let mut neighbors = Vec::new();
    let max_neighbors = config.max_neighbors_per_state;

    let classified_by_id: HashMap<&str, &ClassifiedEdge> =
        classified_edges.iter().map(|e| (e.edge.id.as_str(), e)).collect();

    let mut priority_problem_edge_ids: HashSet<String> = HashSet::new();
    let mut feedback_filler_edge_ids: HashSet<String> = HashSet::new();

    for crossing in crossings {
        priority_problem_edge_ids.insert(crossing.edge_id_a.clone());
        priority_problem_edge_ids.insert(crossing.edge_id_b.clone());
    }

    for diag in diagnostics {
        if let Some(ids) = &diag.ids {
            for id in ids {
                if classified_by_id.contains_key(id.as_str()) {
                    priority_problem_edge_ids.insert(id.clone());
                }
            }
        }
    }

    for edge in classified_edges {
        if edge.role == crate::types::EdgeRole::Feedback || edge.edge.is_cycle.unwrap_or(false) {
            feedback_filler_edge_ids.insert(edge.edge.id.clone());
        }
        if let Some(route) = routes.iter().find(|r| r.edge_id == edge.edge.id) {
            let hairpins = count_path_hairpins(&route.points, config.epsilon);
            let is_struct = edge.role == crate::types::EdgeRole::Feedback
                || edge.role == crate::types::EdgeRole::SelfRole
                || edge.edge.is_cycle.unwrap_or(false);
            let excess_bends = calculate_excess_bends(std::slice::from_ref(route), classified_edges);
            if hairpins > (if is_struct { 1 } else { 0 }) || excess_bends > 0 {
                priority_problem_edge_ids.insert(edge.edge.id.clone());
            }
        }
    }

    // Generate individual edge port moves
    let mut problem_edge_vec: Vec<String> = priority_problem_edge_ids.into_iter().collect();
    problem_edge_vec.sort();

    for edge_id in &problem_edge_vec {
        if neighbors.len() >= max_neighbors {
            break;
        }
        if let Some(edge) = classified_by_id.get(edge_id.as_str()) {
            let current = current_assignment(state, edge_id, routes);
            let alts = if edge.role == crate::types::EdgeRole::Feedback
                || edge.edge.is_cycle.unwrap_or(false)
            {
                semantic_feedback_alternatives(current, edge, nodes)
            } else {
                one_endpoint_alternatives(edge, current, nodes, config)
            };

            for alt in alts {
                let mut next_state = state.clone();
                next_state.side_assignments.insert(edge_id.clone(), alt);
                neighbors.push(next_state);
                if neighbors.len() >= max_neighbors {
                    break;
                }
            }
        }
    }

    // Generate rank layer swap moves
    if !crossings.is_empty() && neighbors.len() < max_neighbors {
        let mut rank_map: HashMap<usize, Vec<String>> = HashMap::new();
        for node in nodes {
            rank_map.entry(node.rank).or_default().push(node.id.clone());
        }

        for (rank, mut rank_nodes) in rank_map {
            if rank_nodes.len() < 2 || neighbors.len() >= max_neighbors {
                continue;
            }
            rank_nodes.sort();
            for i in 0..(rank_nodes.len() - 1) {
                let mut next_state = state.clone();
                let current_rank_order = next_state
                    .layer_orders
                    .entry(rank)
                    .or_insert_with(|| rank_nodes.clone());
                current_rank_order.swap(i, i + 1);
                neighbors.push(next_state);
                if neighbors.len() >= max_neighbors {
                    break;
                }
            }
        }
    }

    // Aesthetic trial states
    if neighbors.len() < max_neighbors {
        let aesthetic_states =
            generate_aesthetic_trial_states(state, routes, classified_edges, nodes, config);
        for s in aesthetic_states {
            neighbors.push(s);
            if neighbors.len() >= max_neighbors {
                break;
            }
        }
    }

    // Deduplicate neighbors by state hash
    let mut seen = HashSet::new();
    seen.insert(compute_state_hash(state));
    let mut unique_neighbors = Vec::new();

    for n in neighbors {
        let hash = compute_state_hash(&n);
        if !seen.contains(&hash) {
            seen.insert(hash);
            unique_neighbors.push(n);
        }
    }

    unique_neighbors
}
