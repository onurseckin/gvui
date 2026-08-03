use crate::step_0_common::types::{LayoutScore, Point, Side};
use crate::step3_crossing_minimization::objective_evaluator::{
    compare_layout_score, count_path_hairpins,
};
use crate::step_3_crossing_minimization::trial_state_generator::adjacent_sides;

fn create_test_score() -> LayoutScore {
    LayoutScore {
        hard_error_count: 0,
        unresolved_route_count: 0,
        node_node_overlaps: 0,
        edge_node_penetrations: 0,
        shared_edge_segment_length: 0.0,
        unresolved_badge_count: 0,
        badge_node_overlaps: 0,
        badge_badge_overlaps: 0,
        badge_unrelated_edge_overlaps: 0,
        crossing_count: 0,
        ordinary_leader_count: 0,
        avoidable_hairpin_count: 0,
        excess_bend_count: 0,
        hairpin_count: 0,
        bend_count: 0,
        direction_deviation_penalty: 0.0,
        total_length: 0.0,
        port_side_imbalance: 0.0,
        feedback_leader_count: 0,
        total_leader_length: 0.0,
        total_area: 0.0,
        state_hash: "hash_0".to_string(),
    }
}

#[test]
fn test_state_hash_deduplication() {
    let mut score_a = create_test_score();
    let mut score_b = create_test_score();

    score_a.state_hash = "hash_a".to_string();
    score_b.state_hash = "hash_b".to_string();

    assert_eq!(compare_layout_score(&score_a, &score_b), std::cmp::Ordering::Less);
}

#[test]
fn test_adjacent_sides() {
    let top_adj = adjacent_sides(Side::Top);
    assert_eq!(top_adj, vec![Side::Left, Side::Right]);
}

#[test]
fn test_orthogonal_path_simplification_and_hairpins() {
    let points = vec![
        Point { x: 0.0, y: 0.0 },
        Point { x: 10.0, y: 0.0 },
        Point { x: 10.0, y: 10.0 },
        Point { x: 0.0, y: 10.0 }, // U-turn hairpin (Right -> Down -> Left)
    ];

    let hairpins = count_path_hairpins(&points, 1e-3);
    assert!(hairpins >= 1);
}

#[test]
fn test_21_component_score_comparison() {
    let mut score_a = create_test_score();
    let mut score_b = create_test_score();

    score_a.crossing_count = 5;
    score_b.crossing_count = 2;

    assert_eq!(compare_layout_score(&score_a, &score_b), std::cmp::Ordering::Greater);

    // Hard error count takes precedence over crossing count
    score_a.hard_error_count = 1;
    score_b.hard_error_count = 2;
    assert_eq!(compare_layout_score(&score_a, &score_b), std::cmp::Ordering::Less);
}

fn create_synthetic_test_graph() -> (Vec<crate::types::NormalizedNode>, Vec<crate::types::NormalizedEdge>) {
    let nodes = vec![
        crate::types::NormalizedNode { id: "n1".to_string(), label: Some("N1".to_string()), width: 100.0, height: 50.0 },
        crate::types::NormalizedNode { id: "n2".to_string(), label: Some("N2".to_string()), width: 100.0, height: 50.0 },
        crate::types::NormalizedNode { id: "n3".to_string(), label: Some("N3".to_string()), width: 100.0, height: 50.0 },
        crate::types::NormalizedNode { id: "n4".to_string(), label: Some("N4".to_string()), width: 100.0, height: 50.0 },
    ];
    let edges = vec![
        crate::types::NormalizedEdge { id: "e1".to_string(), source: "n1".to_string(), target: "n3".to_string(), label: None, is_cycle: None, layout_role: None },
        crate::types::NormalizedEdge { id: "e2".to_string(), source: "n2".to_string(), target: "n4".to_string(), label: None, is_cycle: None, layout_role: None },
        crate::types::NormalizedEdge { id: "e3".to_string(), source: "n1".to_string(), target: "n4".to_string(), label: None, is_cycle: None, layout_role: None },
    ];
    (nodes, edges)
}

#[test]
fn test_max_global_passes_k8s_topology_verification() {
    let (norm_nodes, norm_edges) = create_synthetic_test_graph();

    let mut config1 = crate::config::CustomLayoutConfig::default();
    config1.max_global_passes = 1;
    config1.max_crossing_sweeps = 2;

    let mut config2 = crate::config::CustomLayoutConfig::default();
    config2.max_global_passes = 2;
    config2.max_crossing_sweeps = 2;

    let res1 = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &config1,
    );

    let res2 = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &config2,
    );

    // Verify maxGlobalPasses limits global_passes in stats
    assert_eq!(res1.stats.global_passes, 1);
    assert!(res2.stats.global_passes >= 1 && res2.stats.global_passes <= 2);

    // Directly verify optimize_layer_orders_parallel bounds
    let classified = crate::cycle_breaking::break_cycles(&norm_nodes, &norm_edges);
    let active_edges: Vec<crate::types::NormalizedEdge> = classified.iter().map(|c| c.edge.clone()).collect();
    let edge_role_map: std::collections::HashMap<String, crate::types::EdgeRole> = classified
        .iter()
        .map(|c| (c.edge.id.clone(), c.role))
        .collect();

    let layered = crate::rank_assignment::assign_ranks(&norm_nodes, &active_edges, None);
    let layer_graph = crate::rank_assignment::layer_graph_builder::build_layer_graph(
        &norm_nodes,
        &norm_edges,
        Some(&edge_role_map),
        &layered,
    );
    let minimized = crate::step3_crossing_minimization::barycenter_median_ordering::minimize_crossings(
        &layer_graph,
        config1.max_crossing_sweeps,
        None,
    );
    let initial_ranks: Vec<Vec<String>> = minimized
        .ordered_layers
        .iter()
        .map(|layer| layer.iter().map(|n| n.id.clone()).collect())
        .collect();

    let (_ranks1, passes1) = crate::step3_crossing_minimization::rayon_parallel_search::optimize_layer_orders_parallel(
        initial_ranks.clone(),
        &norm_edges,
        1,
    );

    let (_ranks2, passes2) = crate::step3_crossing_minimization::rayon_parallel_search::optimize_layer_orders_parallel(
        initial_ranks.clone(),
        &norm_edges,
        2,
    );

    assert_eq!(passes1, 1);
    assert!(passes2 >= passes1 && passes2 <= 2);
}

#[test]
fn test_crossing_penalty_low_vs_high_k8s_topology() {
    let (norm_nodes, norm_edges) = create_synthetic_test_graph();

    let mut cfg_low = crate::config::CustomLayoutConfig::default();
    cfg_low.crossing_penalty = 10.0;
    cfg_low.max_crossing_sweeps = 2;
    cfg_low.max_global_passes = 2;

    let mut cfg_high = crate::config::CustomLayoutConfig::default();
    cfg_high.crossing_penalty = 50000.0;
    cfg_high.max_crossing_sweeps = 2;
    cfg_high.max_global_passes = 2;

    let res_low = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &cfg_low,
    );

    let res_high = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &cfg_high,
    );

    // Verify compare_layout_score_with_config differentiates candidate ordering based on crossing_penalty
    let mut score_crossings = create_test_score();
    score_crossings.crossing_count = 1;
    score_crossings.bend_count = 0;

    let mut score_bends = create_test_score();
    score_bends.crossing_count = 0;
    score_bends.bend_count = 5;

    // Under low crossing penalty (10.0), 1 crossing (10.0) < 5 bends (250.0)
    assert_eq!(
        crate::step3_crossing_minimization::objective_evaluator::compare_layout_score_with_config(
            &score_crossings,
            &score_bends,
            &cfg_low,
        ),
        std::cmp::Ordering::Less
    );

    // Under high crossing penalty (50000.0), 1 crossing (50000.0) > 5 bends (250.0)
    assert_eq!(
        crate::step3_crossing_minimization::objective_evaluator::compare_layout_score_with_config(
            &score_crossings,
            &score_bends,
            &cfg_high,
        ),
        std::cmp::Ordering::Greater
    );

    // Ensure layout evaluation candidates are produced for both runs
    assert!(!res_low.best_evaluation.nodes.is_empty());
    assert!(!res_high.best_evaluation.nodes.is_empty());
}

#[test]
fn test_top_down_state_space_search_performance_under_2s() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let json_path = std::path::Path::new(&manifest_dir).join("../../public/data/graphs/kubernetes_cluster_topology.json");
    let json_str = std::fs::read_to_string(json_path).expect("Failed to read json file");

    #[derive(serde::Deserialize)]
    struct RawNode {
        id: String,
        name: String,
    }
    #[derive(serde::Deserialize)]
    struct RawEdge {
        id: Option<String>,
        source: String,
        target: String,
    }
    #[derive(serde::Deserialize)]
    struct RawGraph {
        nodes: Vec<RawNode>,
        edges: Vec<RawEdge>,
    }

    let raw_graph: RawGraph = serde_json::from_str(&json_str).unwrap();

    let norm_nodes: Vec<crate::types::NormalizedNode> = raw_graph
        .nodes
        .iter()
        .map(|n| crate::types::NormalizedNode {
            id: n.id.clone(),
            label: Some(n.name.clone()),
            width: 120.0,
            height: 60.0,
        })
        .collect();

    let norm_edges: Vec<crate::types::NormalizedEdge> = raw_graph
        .edges
        .iter()
        .enumerate()
        .map(|(idx, e)| crate::types::NormalizedEdge {
            id: e.id.clone().unwrap_or_else(|| format!("e{}", idx)),
            source: e.source.clone(),
            target: e.target.clone(),
            label: None,
            is_cycle: None,
            layout_role: None,
        })
        .collect();

    let config = crate::config::CustomLayoutConfig::default();

    let start = std::time::Instant::now();
    let search_res = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &config,
    );
    let elapsed = start.elapsed();

    let max_allowed_ms = if cfg!(debug_assertions) { 5000 } else { 2000 };

    assert!(
        elapsed.as_millis() < max_allowed_ms,
        "State-space top-down engine search must complete in < {:?}ms, took {:?}ms",
        max_allowed_ms,
        elapsed.as_millis()
    );

    assert_eq!(search_res.best_evaluation.validation.is_valid, true);
    assert!(!search_res.best_evaluation.nodes.is_empty());
}

