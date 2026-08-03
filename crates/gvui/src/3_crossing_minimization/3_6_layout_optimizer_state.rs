//! # Step 3.6: Layout Optimizer State Search & Bounded Aesthetic Search
//!
//! This module coordinates multi-state neighborhood search, evaluating search states,
//! candidate port side assignments, layer order transpositions, and aesthetic defect repairs.

use crate::config::CustomLayoutConfig;
use crate::cycle_breaking::cycle_breaking_facade::break_cycles;
use crate::cycle_breaking::graph_normalization::normalize_graph;
use crate::edge_routing::badge_placement::place_edge_badges;
use crate::edge_routing::edge_router_facade::{route_all_edges, EdgeRouterOptions};
use crate::rank_assignment::assign_ranks;
use crate::rank_assignment::layer_graph_builder::build_layer_graph;
use crate::step4_coordinate_assignment::coordinate_assignment_facade::assign_coordinates;
use crate::step4_coordinate_assignment::spacing_demand_resolver::{
    canonicalize_exact_spacing_demands, resolve_exact_spacing_demands,
};
use crate::types::{
    BadgePlacement, ClassifiedEdge, EdgeRole, ExactSpacingDemand, LayerNode, LayoutDiagnostic,
    LayoutScore, LayoutSearchState, LayoutValidationResult, NormalizedEdge, NormalizedNode,
    OptimizationStats, Point, PositionedNode, RoutedPath,
};
use crate::validation::layout_validator::{
    validate_custom_layout, ExtendedLayoutValidationResult,
};

use super::barycenter_median_ordering::minimize_crossings;
use super::objective_evaluator::build_layout_score;
use super::objective_evaluator::{compare_layout_score, compare_layout_score_with_config};
use super::rayon_parallel_search::optimize_layer_orders_parallel;
use super::trial_state_generator::{
    compute_state_hash, generate_aesthetic_trial_states, generate_crossing_completion_states,
    generate_neighborhood_states,
};

use std::collections::{HashMap, HashSet};

/// Evaluation result for a layout search state.
#[derive(Debug, Clone)]
pub struct StateEvaluationResult {
    pub score: LayoutScore,
    pub validation: ExtendedLayoutValidationResult,
    pub diagnostics: Vec<LayoutDiagnostic>,
    pub ordered_layers: Vec<Vec<LayerNode>>,
    pub nodes: Vec<PositionedNode>,
    pub routes: Vec<RoutedPath>,
    pub badges: Vec<BadgePlacement>,
    pub exact_demands: Vec<ExactSpacingDemand>,
    pub classified_edges: Vec<ClassifiedEdge>,
    pub reset_side_assignments: bool,
    pub executed_passes: usize,
}

/// Result of full layout search optimization.
#[derive(Debug, Clone)]
pub struct SearchOptimizationResult {
    pub best_state: LayoutSearchState,
    pub best_evaluation: StateEvaluationResult,
    pub stats: OptimizationStats,
}

/// Budgets derived from graph topology.
#[derive(Debug, Clone)]
pub struct SearchStateBudgets {
    pub max_layout_states: usize,
    pub max_aesthetic_evaluations: usize,
}

/// Derives layout search state budgets based on graph size and complexity.
pub fn derive_search_state_budgets(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    config: &CustomLayoutConfig,
) -> SearchStateBudgets {
    let node_count = nodes.len();
    let edge_count = edges.len();

    let max_layout_states = if node_count >= 20 || edge_count >= 25 {
        4
    } else if node_count >= 10 || edge_count >= 12 {
        6
    } else {
        config.max_layout_states.min(8)
    };

    SearchStateBudgets {
        max_layout_states,
        max_aesthetic_evaluations: config.max_aesthetic_passes.min(max_layout_states),
    }
}

/// Evaluates a single `LayoutSearchState` across the full layout pipeline.
pub fn evaluate_search_state(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    state: &LayoutSearchState,
    config: &CustomLayoutConfig,
) -> StateEvaluationResult {
    let current_demands = canonicalize_exact_spacing_demands(&state.exact_demands);
    let spacing_overrides =
        resolve_exact_spacing_demands(&current_demands, config.node_gap, config.rank_gap);

    // 1. Cycle Breaking
    let classified = break_cycles(nodes, edges);
    let active_edges: Vec<NormalizedEdge> = classified.iter().map(|c| c.edge.clone()).collect();
    let edge_role_map: HashMap<String, EdgeRole> =
        classified.iter().map(|c| (c.edge.id.clone(), c.role)).collect();

    // 2. Rank Assignment & Layer Graph Construction
    let layered = assign_ranks(nodes, &active_edges, None);
    let layer_graph = build_layer_graph(nodes, edges, Some(&edge_role_map), &layered);

    // 3. Crossing Minimization (Barycenter layer ordering with state overrides)
    let minimized = minimize_crossings(
        &layer_graph,
        config.max_crossing_sweeps,
        Some(&state.layer_orders),
    );

    let initial_ranks: Vec<Vec<String>> = minimized
        .ordered_layers
        .iter()
        .map(|layer| layer.iter().map(|n| n.id.clone()).collect())
        .collect();

    let (optimized_ranks, executed_passes) =
        optimize_layer_orders_parallel(initial_ranks, edges, config.max_global_passes);

    let mut ordered_layers: Vec<Vec<LayerNode>> = Vec::new();
    for (rank_idx, rank_nodes) in optimized_ranks.iter().enumerate() {
        let mut layer_nodes = Vec::new();
        for node_id in rank_nodes {
            if let Some(ln) = minimized.ordered_layers.get(rank_idx).and_then(|l| l.iter().find(|n| n.id == *node_id)) {
                layer_nodes.push(ln.clone());
            } else if let Some(ln) = layer_graph.item_map.get(node_id) {
                layer_nodes.push(ln.clone());
            }
        }
        ordered_layers.push(layer_nodes);
    }

    let norm_graph = normalize_graph(nodes, edges)
        .map(|r| r.graph)
        .unwrap_or_default();

    // 4. Coordinate Assignment
    let coord_result = assign_coordinates(
        &norm_graph,
        &layer_graph,
        &ordered_layers,
        config,
        Some(&spacing_overrides),
        None,
    );

    let mut positioned_nodes = Vec::new();
    for (rank_idx, layer_nodes) in ordered_layers.iter().enumerate() {
        for (order_idx, node) in layer_nodes.iter().enumerate() {
            if let Some(input_node) = nodes.iter().find(|n| n.id == node.id) {
                let pos = coord_result
                    .node_positions
                    .get(&node.id)
                    .cloned()
                    .unwrap_or(Point { x: 50.0, y: 50.0 });
                positioned_nodes.push(PositionedNode {
                    id: input_node.id.clone(),
                    label: input_node.label.clone(),
                    x: pos.x,
                    y: pos.y,
                    width: input_node.width,
                    height: input_node.height,
                    rank: rank_idx,
                    order: order_idx,
                });
            }
        }
    }

    // 5. Edge Routing with Search State Port Overrides
    let router_side_assignments: HashMap<
        String,
        crate::step5_edge_routing::port_candidates::PortSideAssignment,
    > = state
        .side_assignments
        .iter()
        .map(|(k, v)| {
            (
                k.clone(),
                crate::step5_edge_routing::port_candidates::PortSideAssignment {
                    src_side: v.src_side,
                    tgt_side: v.tgt_side,
                },
            )
        })
        .collect();

    let router_options = EdgeRouterOptions {
        side_assignments: Some(router_side_assignments),
        port_orders: Some(state.port_orders.clone()),
    };

    let router_result = route_all_edges(
        &positioned_nodes,
        edges,
        Some(&active_edges),
        config,
        Some(&router_options),
    );

    // 6. Badge Placement
    let badge_result = place_edge_badges(
        &router_result.routes,
        &positioned_nodes,
        edges,
        &layered.node_rank_map,
        config,
    );

    // 7. Extended Validation & Objective Score Calculation
    let validation = validate_custom_layout(
        &positioned_nodes,
        &router_result.routes,
        &badge_result.placements,
        Some(edges),
        Some(&edge_role_map),
        config,
    );

    let simple_diagnostics: Vec<LayoutDiagnostic> = validation
        .diagnostics
        .iter()
        .map(|d| LayoutDiagnostic {
            code: d.code.clone(),
            severity: d.severity.clone(),
            message: d.message.clone(),
            ids: Some(d.ids.clone()),
        })
        .collect();

    let simple_validation = LayoutValidationResult {
        is_valid: validation.is_valid,
        metrics: validation.metrics.clone(),
        crossings: validation.crossings.clone(),
        diagnostics: simple_diagnostics.clone(),
    };

    let state_hash = compute_state_hash(state);
    let score = build_layout_score(
        &positioned_nodes,
        &router_result.routes,
        &badge_result.placements,
        &simple_validation,
        &classified,
        state_hash,
    );

    StateEvaluationResult {
        score,
        validation,
        diagnostics: simple_diagnostics,
        ordered_layers,
        nodes: positioned_nodes,
        routes: router_result.routes,
        badges: badge_result.placements,
        exact_demands: current_demands,
        classified_edges: classified,
        reset_side_assignments: false,
        executed_passes,
    }
}

/// Evaluates if a layout evaluation meets primary clean criteria (0 hard errors, 0 overlaps, 0 crossings).
pub fn is_primary_clean_evaluation(eval_result: &StateEvaluationResult) -> bool {
    let m = &eval_result.validation.metrics;
    eval_result.validation.is_valid
        && m.unresolved_route_count == 0
        && m.unresolved_badge_count == 0
        && m.node_node_overlaps == 0
        && m.edge_node_penetrations == 0
        && m.shared_edge_segment_length == 0.0
        && m.badge_node_overlaps == 0
        && m.badge_badge_overlaps == 0
        && m.crossing_count == 0
        && m.ordinary_leader_count == 0
        && m.badge_unrelated_edge_overlaps == 0
}

/// Evaluates if a layout has remaining aesthetic defects (avoidable hairpins or excess bends).
pub fn has_remaining_aesthetic_defect(eval_result: &StateEvaluationResult) -> bool {
    eval_result.validation.metrics.avoidable_hairpin_count > 0
        || eval_result.validation.metrics.excess_bend_count > 0
}

/// Runs bounded aesthetic search to eliminate hairpins and excess bends on clean layouts.
pub fn run_bounded_aesthetic_search(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    initial_best_state: &LayoutSearchState,
    initial_best_eval: &StateEvaluationResult,
    config: &CustomLayoutConfig,
) -> (LayoutSearchState, StateEvaluationResult) {
    let mut best_state = initial_best_state.clone();
    let mut best_eval = initial_best_eval.clone();

    let trial_states = generate_aesthetic_trial_states(
        &best_state,
        &best_eval.routes,
        &best_eval.classified_edges,
        &best_eval.nodes,
        config,
    );

    for trial in trial_states {
        let trial_eval = evaluate_search_state(nodes, edges, &trial, config);
        if is_primary_clean_evaluation(&trial_eval)
            && compare_layout_score(&trial_eval.score, &best_eval.score) == std::cmp::Ordering::Less
        {
            best_state = trial.clone();
            best_eval = trial_eval.clone();
        }

        if trial_eval.validation.metrics.crossing_count > 0 {
            let completions = generate_crossing_completion_states(
                &trial,
                &trial_eval.validation.crossings,
                &trial_eval.classified_edges,
                &trial_eval.routes,
                &trial_eval.nodes,
                config,
                2,
            );
            for completion in completions {
                let comp_eval = evaluate_search_state(nodes, edges, &completion, config);
                if is_primary_clean_evaluation(&comp_eval)
                    && compare_layout_score(&comp_eval.score, &best_eval.score)
                        == std::cmp::Ordering::Less
                {
                    best_state = completion;
                    best_eval = comp_eval;
                }
            }
        }
    }

    (best_state, best_eval)
}

/// Orchestrates multi-state layout search optimization across neighborhood candidate states.
pub fn search_best_layout_state(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    config: &CustomLayoutConfig,
) -> SearchOptimizationResult {
    let budgets = derive_search_state_budgets(nodes, edges, config);
    let max_states = budgets.max_layout_states;
    let max_frontier = config.max_frontier_size;

    let start_state = LayoutSearchState::default();
    let start_eval = evaluate_search_state(nodes, edges, &start_state, config);

    let mut best_state = start_state.clone();
    let mut best_eval = start_eval.clone();
    let mut evaluated_states = 1;
    let mut max_executed_passes = start_eval.executed_passes;

    let mut frontier = vec![(start_state.clone(), start_eval)];
    let mut visited_hashes = HashSet::new();
    visited_hashes.insert(compute_state_hash(&start_state));

    while !frontier.is_empty() && evaluated_states < max_states {
        if is_primary_clean_evaluation(&best_eval) && !has_remaining_aesthetic_defect(&best_eval) {
            break;
        }

        if is_primary_clean_evaluation(&best_eval) && has_remaining_aesthetic_defect(&best_eval) {
            let (aesthetic_state, aesthetic_eval) =
                run_bounded_aesthetic_search(nodes, edges, &best_state, &best_eval, config);
            max_executed_passes = max_executed_passes.max(aesthetic_eval.executed_passes);
            best_state = aesthetic_state;
            best_eval = aesthetic_eval;
            break;
        }

        frontier.sort_by(|a, b| compare_layout_score_with_config(&a.1.score, &b.1.score, config));
        let (curr_state, curr_eval) = frontier.remove(0);

        if compare_layout_score_with_config(&curr_eval.score, &best_eval.score, config) == std::cmp::Ordering::Less {
            best_state = curr_state.clone();
            best_eval = curr_eval.clone();
        }

        let ordered_layers_strings: Vec<Vec<String>> = curr_eval
            .ordered_layers
            .iter()
            .map(|layer| layer.iter().map(|n| n.id.clone()).collect())
            .collect();

        let neighbor_states = generate_neighborhood_states(
            &curr_state,
            &curr_eval.nodes,
            &curr_eval.routes,
            &curr_eval.classified_edges,
            &curr_eval.validation.crossings,
            &curr_eval.diagnostics,
            &ordered_layers_strings,
            curr_eval.reset_side_assignments,
            config,
        );

        for next_state in neighbor_states {
            if evaluated_states >= max_states {
                break;
            }

            let hash = compute_state_hash(&next_state);
            if visited_hashes.contains(&hash) {
                continue;
            }
            visited_hashes.insert(hash);

            evaluated_states += 1;
            let next_eval = evaluate_search_state(nodes, edges, &next_state, config);
            max_executed_passes = max_executed_passes.max(next_eval.executed_passes);

            if compare_layout_score_with_config(&next_eval.score, &best_eval.score, config) == std::cmp::Ordering::Less {
                best_state = next_state.clone();
                best_eval = next_eval.clone();
            }

            frontier.push((next_state, next_eval));

            if frontier.len() > max_frontier {
                frontier.sort_by(|a, b| compare_layout_score_with_config(&a.1.score, &b.1.score, config));
                frontier.truncate(max_frontier);
            }
        }
    }

    SearchOptimizationResult {
        best_state,
        best_evaluation: best_eval,
        stats: OptimizationStats {
            global_passes: max_executed_passes,
            evaluated_port_states: evaluated_states,
            spacing_expansions: 0,
            duration_ms: 0.0,
            stop_reason: "bounded-local-optimum".to_string(),
        },
    }
}
