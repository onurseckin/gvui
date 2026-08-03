use crate::config::CustomLayoutConfig;
use crate::edge_routing::edge_router_facade::route_all_edges;
use crate::types::{NormalizedEdge, PositionedNode};
use serde_json;

#[test]
fn test_edge_router_basic_dag() {
    let config = CustomLayoutConfig::default();

    let nodes = vec![
        PositionedNode {
            id: "A".to_string(),
            label: Some("Node A".to_string()),
            x: 100.0,
            y: 50.0,
            width: 120.0,
            height: 60.0,
            rank: 0,
            order: 0,
        },
        PositionedNode {
            id: "B".to_string(),
            label: Some("Node B".to_string()),
            x: 100.0,
            y: 250.0,
            width: 120.0,
            height: 60.0,
            rank: 1,
            order: 0,
        },
    ];

    let edges = vec![NormalizedEdge {
        id: "e1".to_string(),
        source: "A".to_string(),
        target: "B".to_string(),
        label: Some("connects".to_string()),
        is_cycle: Some(false),
        layout_role: None,
    }];

    let result = route_all_edges(&nodes, &edges, None, &config, None);
    assert_eq!(result.routes.len(), 1);
    assert_eq!(result.routes[0].edge_id, "e1");
    assert!(result.routes[0].points.len() >= 2);
}

#[test]
fn test_kubernetes_cluster_topology_ke5() {
    let norm_nodes = vec![
        crate::types::NormalizedNode {
            id: "n1".to_string(),
            label: Some("Node 1".to_string()),
            width: 140.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n2".to_string(),
            label: Some("Node 2".to_string()),
            width: 140.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n3".to_string(),
            label: Some("Node 3".to_string()),
            width: 140.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n4".to_string(),
            label: Some("Node 4".to_string()),
            width: 140.0,
            height: 60.0,
        },
    ];

    let norm_edges = vec![
        NormalizedEdge {
            id: "ke1".to_string(),
            source: "n1".to_string(),
            target: "n2".to_string(),
            label: Some("edge 1".to_string()),
            is_cycle: Some(false),
            layout_role: None,
        },
        NormalizedEdge {
            id: "ke2".to_string(),
            source: "n1".to_string(),
            target: "n3".to_string(),
            label: Some("edge 2".to_string()),
            is_cycle: Some(false),
            layout_role: None,
        },
        NormalizedEdge {
            id: "ke3".to_string(),
            source: "n2".to_string(),
            target: "n4".to_string(),
            label: Some("edge 3".to_string()),
            is_cycle: Some(false),
            layout_role: None,
        },
        NormalizedEdge {
            id: "ke4".to_string(),
            source: "n3".to_string(),
            target: "n4".to_string(),
            label: Some("edge 4".to_string()),
            is_cycle: Some(false),
            layout_role: None,
        },
        NormalizedEdge {
            id: "ke5".to_string(),
            source: "n4".to_string(),
            target: "n2".to_string(),
            label: Some("cycle edge".to_string()),
            is_cycle: Some(true),
            layout_role: None,
        },
    ];

    let mut config = CustomLayoutConfig::default();
    config.max_rip_up_passes = 2;
    config.max_route_order_variants = 2;

    let classified = crate::cycle_breaking::break_cycles(&norm_nodes, &norm_edges);
    let active_edges: Vec<NormalizedEdge> = classified.iter().map(|c| c.edge.clone()).collect();
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

    let mut ranks_vec: Vec<Vec<String>> = Vec::new();
    let mut max_rank = 0;
    for &r in layered.rank_nodes_map.keys() {
        if r > max_rank {
            max_rank = r;
        }
    }
    for rank_idx in 0..=max_rank {
        if let Some(nodes) = layered.rank_nodes_map.get(&rank_idx) {
            ranks_vec.push(nodes.clone());
        } else if !layered.rank_nodes_map.is_empty() {
            ranks_vec.push(Vec::new());
        }
    }

    let (optimized_ranks, _) = crate::crossing_minimization::optimize_layer_orders_parallel(
        ranks_vec,
        &active_edges,
        config.max_global_passes,
    );

    let mut ordered_layers: Vec<Vec<crate::LayerNode>> = Vec::new();
    for rank_nodes in &optimized_ranks {
        let mut layer_nodes = Vec::new();
        for node_id in rank_nodes {
            if let Some(ln) = layer_graph.item_map.get(node_id) {
                layer_nodes.push(ln.clone());
            }
        }
        ordered_layers.push(layer_nodes);
    }

    let norm_graph = crate::cycle_breaking::graph_normalization::normalize_graph(&norm_nodes, &norm_edges)
        .map(|r| r.graph)
        .unwrap_or_default();

    let coord_result = crate::coordinate_assignment::coordinate_assignment_facade::assign_coordinates(
        &norm_graph,
        &layer_graph,
        &ordered_layers,
        &config,
        None,
        None,
    );

    let mut positioned_nodes = Vec::new();
    for (rank_idx, rank_node_ids) in optimized_ranks.iter().enumerate() {
        for (order_idx, node_id) in rank_node_ids.iter().enumerate() {
            if let Some(input_node) = norm_nodes.iter().find(|n| n.id == *node_id) {
                let pos = coord_result
                    .node_positions
                    .get(node_id)
                    .cloned()
                    .unwrap_or(crate::types::Point { x: 50.0, y: 50.0 });
                positioned_nodes.push(crate::types::PositionedNode {
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

    let router_result = crate::step5_edge_routing::edge_router_facade::route_all_edges(
        &positioned_nodes,
        &norm_edges,
        Some(&active_edges),
        &config,
        None,
    );

    let validation = crate::validation::layout_validator::validate_custom_layout(
        &positioned_nodes,
        &router_result.routes,
        &[],
        Some(&norm_edges),
        Some(&edge_role_map),
        &config,
    );

    let ke5_route = router_result.routes.iter().find(|r| r.edge_id == "ke5");
    assert!(ke5_route.is_some(), "KE5 route must exist");
    assert!(validation.is_valid, "Validation failed with {} errors", validation.diagnostics.len());
}

#[test]
fn test_kubernetes_cluster_topology_direction_penalty_impact() {
    let norm_nodes = vec![
        crate::types::NormalizedNode {
            id: "n1".to_string(),
            label: Some("Node 1".to_string()),
            width: 150.0,
            height: 80.0,
        },
        crate::types::NormalizedNode {
            id: "n2".to_string(),
            label: Some("Node 2".to_string()),
            width: 150.0,
            height: 80.0,
        },
        crate::types::NormalizedNode {
            id: "n3".to_string(),
            label: Some("Node 3".to_string()),
            width: 150.0,
            height: 80.0,
        },
        crate::types::NormalizedNode {
            id: "n4".to_string(),
            label: Some("Node 4".to_string()),
            width: 150.0,
            height: 80.0,
        },
    ];

    let norm_edges = vec![
        NormalizedEdge {
            id: "e1".to_string(),
            source: "n1".to_string(),
            target: "n3".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e2".to_string(),
            source: "n2".to_string(),
            target: "n4".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e3".to_string(),
            source: "n1".to_string(),
            target: "n4".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e4".to_string(),
            source: "n2".to_string(),
            target: "n3".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
    ];

    let mut config_low = CustomLayoutConfig::default();
    config_low.direction_penalty = 0.0;
    config_low.max_rip_up_passes = 2;
    config_low.max_route_order_variants = 2;

    let mut config_high = CustomLayoutConfig::default();
    config_high.direction_penalty = 2000.0;
    config_high.max_rip_up_passes = 2;
    config_high.max_route_order_variants = 2;

    let res_low = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &config_low,
    );

    let res_high = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &config_high,
    );

    assert!(!res_low.best_evaluation.routes.is_empty());
    assert!(!res_high.best_evaluation.routes.is_empty());
    assert!(
        res_high.best_evaluation.validation.metrics.direction_deviation_penalty
            >= res_low.best_evaluation.validation.metrics.direction_deviation_penalty
    );
}



#[test]
fn test_dense_kubernetes_mesh_routing() {
    let mut config = crate::config::CustomLayoutConfig::default();
    config.max_rip_up_passes = 2;
    config.max_route_order_variants = 2;

    let nodes = vec![
        crate::types::NormalizedNode {
            id: "n1".to_string(),
            label: Some("Node 1".to_string()),
            width: 120.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n2".to_string(),
            label: Some("Node 2".to_string()),
            width: 120.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n3".to_string(),
            label: Some("Node 3".to_string()),
            width: 120.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n4".to_string(),
            label: Some("Node 4".to_string()),
            width: 120.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n5".to_string(),
            label: Some("Node 5".to_string()),
            width: 120.0,
            height: 60.0,
        },
    ];

    let edges = vec![
        crate::types::NormalizedEdge {
            id: "e1".to_string(),
            source: "n1".to_string(),
            target: "n2".to_string(),
            label: None,
            is_cycle: Some(false),
            layout_role: None,
        },
        crate::types::NormalizedEdge {
            id: "e2".to_string(),
            source: "n1".to_string(),
            target: "n3".to_string(),
            label: None,
            is_cycle: Some(false),
            layout_role: None,
        },
        crate::types::NormalizedEdge {
            id: "e3".to_string(),
            source: "n2".to_string(),
            target: "n4".to_string(),
            label: None,
            is_cycle: Some(false),
            layout_role: None,
        },
        crate::types::NormalizedEdge {
            id: "e4".to_string(),
            source: "n3".to_string(),
            target: "n4".to_string(),
            label: None,
            is_cycle: Some(false),
            layout_role: None,
        },
        crate::types::NormalizedEdge {
            id: "e5".to_string(),
            source: "n4".to_string(),
            target: "n5".to_string(),
            label: None,
            is_cycle: Some(false),
            layout_role: None,
        },
        crate::types::NormalizedEdge {
            id: "e6".to_string(),
            source: "n5".to_string(),
            target: "n1".to_string(),
            label: None,
            is_cycle: Some(true),
            layout_role: None,
        },
        crate::types::NormalizedEdge {
            id: "e7".to_string(),
            source: "n2".to_string(),
            target: "n5".to_string(),
            label: None,
            is_cycle: Some(false),
            layout_role: None,
        },
        crate::types::NormalizedEdge {
            id: "e8".to_string(),
            source: "n3".to_string(),
            target: "n5".to_string(),
            label: None,
            is_cycle: Some(false),
            layout_role: None,
        },
    ];

    // Run pipeline steps 1-5
    let classified = crate::cycle_breaking::break_cycles(&nodes, &edges);
    let active_edges: Vec<crate::types::NormalizedEdge> =
        classified.iter().map(|c| c.edge.clone()).collect();
    let edge_role_map: std::collections::HashMap<String, crate::types::EdgeRole> =
        classified.iter().map(|c| (c.edge.id.clone(), c.role)).collect();

    let layered = crate::rank_assignment::assign_ranks(&nodes, &active_edges, None);
    let layer_graph = crate::step2_rank_assignment::layer_graph_builder::build_layer_graph(
        &nodes,
        &edges,
        Some(&edge_role_map),
        &layered,
    );

    let mut max_rank = 0;
    for &r in layered.rank_nodes_map.keys() {
        if r > max_rank {
            max_rank = r;
        }
    }
    let mut ranks_vec: Vec<Vec<String>> = Vec::new();
    for rank_idx in 0..=max_rank {
        if let Some(nodes_at_r) = layered.rank_nodes_map.get(&rank_idx) {
            ranks_vec.push(nodes_at_r.clone());
        } else {
            ranks_vec.push(Vec::new());
        }
    }

    let (optimized_ranks, _) = crate::crossing_minimization::optimize_layer_orders_parallel(
        ranks_vec,
        &active_edges,
        config.max_global_passes,
    );

    let mut ordered_layers: Vec<Vec<crate::types::LayerNode>> = Vec::new();
    for rank_nodes in &optimized_ranks {
        let mut layer_nodes = Vec::new();
        for node_id in rank_nodes {
            if let Some(ln) = layer_graph.item_map.get(node_id) {
                layer_nodes.push(ln.clone());
            }
        }
        ordered_layers.push(layer_nodes);
    }

    let norm_graph = crate::step1_cycle_breaking::graph_normalization::normalize_graph(&nodes, &edges)
        .unwrap()
        .graph;
    let coord_result = crate::coordinate_assignment::assign_coordinates(
        &norm_graph,
        &layer_graph,
        &ordered_layers,
        &config,
        None,
        None,
    );

    let mut positioned_nodes = Vec::new();
    for (rank_idx, rank_node_ids) in optimized_ranks.iter().enumerate() {
        for (order_idx, node_id) in rank_node_ids.iter().enumerate() {
            if let Some(input_node) = nodes.iter().find(|n| n.id == *node_id) {
                let pos = coord_result
                    .node_positions
                    .get(node_id)
                    .cloned()
                    .unwrap_or(crate::types::Point { x: 50.0, y: 50.0 });
                positioned_nodes.push(crate::types::PositionedNode {
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

    let router_result = crate::edge_routing::route_all_edges(
        &positioned_nodes,
        &edges,
        Some(&active_edges),
        &config,
        None,
    );

    let badge_result = crate::edge_routing::place_edge_badges(
        &router_result.routes,
        &positioned_nodes,
        &edges,
        &layered.node_rank_map,
        &config,
    );

    let validation = crate::step6_validation::layout_validator::validate_custom_layout(
        &positioned_nodes,
        &router_result.routes,
        &badge_result.placements,
        Some(&edges),
        Some(&edge_role_map),
        &config,
    );

    let missing_routes: Vec<_> = validation
        .diagnostics
        .iter()
        .filter(|d| d.code == "MISSING_ROUTE")
        .collect();

    assert_eq!(
        missing_routes.len(),
        0,
        "Expected 0 MISSING_ROUTE errors, got {}",
        missing_routes.len()
    );
}

#[test]
fn test_decision_tree_e2_4() {
    let json_str = std::fs::read_to_string("../../public/data/graphs/decision_tree.json")
        .expect("Failed to read decision_tree.json");
    
    #[derive(serde::Deserialize)]
    struct RawBadge {
        label: String,
        variant: String,
    }
    #[derive(serde::Deserialize)]
    struct RawNode {
        id: String,
        name: String,
        description: Option<String>,
        #[serde(default)]
        badges: Vec<RawBadge>,
    }
    #[derive(serde::Deserialize)]
    struct RawEdge {
        id: Option<String>,
        source: String,
        target: String,
        label: Option<String>,
        #[serde(rename = "isCycle")]
        is_cycle: Option<bool>,
    }
    #[derive(serde::Deserialize)]
    struct RawGraph {
        nodes: Vec<RawNode>,
        edges: Vec<RawEdge>,
    }

    let graph: RawGraph = serde_json::from_str(&json_str).unwrap();
    let config = crate::config::CustomLayoutConfig::default();

    let norm_nodes: Vec<crate::types::NormalizedNode> = graph
        .nodes
        .iter()
        .map(|n| crate::types::NormalizedNode {
            id: n.id.clone(),
            label: Some(n.name.clone()),
            width: 180.0,
            height: 70.0,
        })
        .collect();

    let norm_edges: Vec<crate::types::NormalizedEdge> = graph
        .edges
        .iter()
        .enumerate()
        .map(|(idx, e)| crate::types::NormalizedEdge {
            id: e.id.clone().unwrap_or_else(|| format!("e-{}", idx)),
            source: e.source.clone(),
            target: e.target.clone(),
            label: e.label.clone(),
            is_cycle: e.is_cycle,
            layout_role: None,
        })
        .collect();

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

    let mut ranks_vec: Vec<Vec<String>> = Vec::new();
    let mut max_rank = 0;
    for &r in layered.rank_nodes_map.keys() {
        if r > max_rank {
            max_rank = r;
        }
    }
    for rank_idx in 0..=max_rank {
        if let Some(nodes) = layered.rank_nodes_map.get(&rank_idx) {
            ranks_vec.push(nodes.clone());
        } else {
            ranks_vec.push(Vec::new());
        }
    }

    let (optimized_ranks, _) = crate::crossing_minimization::optimize_layer_orders_parallel(
        ranks_vec,
        &active_edges,
        config.max_global_passes,
    );

    let mut ordered_layers: Vec<Vec<crate::LayerNode>> = Vec::new();
    for rank_nodes in &optimized_ranks {
        let mut layer_nodes = Vec::new();
        for node_id in rank_nodes {
            if let Some(ln) = layer_graph.item_map.get(node_id) {
                layer_nodes.push(ln.clone());
            }
        }
        ordered_layers.push(layer_nodes);
    }

    let norm_graph = crate::cycle_breaking::graph_normalization::normalize_graph(&norm_nodes, &norm_edges)
        .unwrap()
        .graph;

    let coord_result = crate::coordinate_assignment::coordinate_assignment_facade::assign_coordinates(
        &norm_graph,
        &layer_graph,
        &ordered_layers,
        &config,
        None,
        None,
    );

    let mut positioned_nodes = Vec::new();
    for (rank_idx, rank_node_ids) in optimized_ranks.iter().enumerate() {
        for (order_idx, node_id) in rank_node_ids.iter().enumerate() {
            if let Some(input_node) = norm_nodes.iter().find(|n| n.id == *node_id) {
                let pos = coord_result
                    .node_positions
                    .get(node_id)
                    .cloned()
                    .unwrap_or(crate::types::Point { x: 50.0, y: 50.0 });
                positioned_nodes.push(crate::types::PositionedNode {
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

    let router_result = crate::edge_routing::route_all_edges(
        &positioned_nodes,
        &norm_edges,
        Some(&active_edges),
        &config,
        None,
    );

    let validation = crate::validation::layout_validator::validate_custom_layout(
        &positioned_nodes,
        &router_result.routes,
        &[],
        Some(&norm_edges),
        Some(&edge_role_map),
        &config,
    );

    let e2_4_route = router_result.routes.iter().find(|r| r.edge_id == "e2-4");
    println!("=== E2-4 ROUTE ===");
    if let Some(r) = e2_4_route {
        println!("Points: {:?}", r.points);
        println!("Source port: {:?}", r.source_port);
        println!("Target port: {:?}", r.target_port);
    }

    println!("=== VALIDATION DIAGNOSTICS FOR DECISION TREE ===");
    for diag in &validation.diagnostics {
        println!("Diag: {} - {} - {:?} - {}", diag.code, diag.severity, diag.ids, diag.message);
    }

    assert!(validation.is_valid, "Validation failed with {} errors", validation.diagnostics.len());
}

#[test]
fn test_scenario_17_routing() {
    let config = crate::config::CustomLayoutConfig::default();
    let positioned_nodes = vec![
        crate::types::PositionedNode {
            id: "TINY".to_string(),
            label: Some("Micro".to_string()),
            x: 50.0,
            y: 100.0,
            width: 90.0,
            height: 45.0,
            rank: 0,
            order: 0,
        },
        crate::types::PositionedNode {
            id: "MEDIUM".to_string(),
            label: Some("Standard Worker".to_string()),
            x: 200.0,
            y: 100.0,
            width: 180.0,
            height: 70.0,
            rank: 0,
            order: 1,
        },
        crate::types::PositionedNode {
            id: "HUGE".to_string(),
            label: Some("Enterprise Database Cluster".to_string()),
            x: 450.0,
            y: 80.0,
            width: 280.0,
            height: 130.0,
            rank: 0,
            order: 2,
        },
    ];

    let edges = vec![
        crate::types::NormalizedEdge {
            id: "e-TINY-MEDIUM-0".to_string(),
            source: "TINY".to_string(),
            target: "MEDIUM".to_string(),
            label: Some("ingest".to_string()),
            is_cycle: Some(false),
            layout_role: None,
        },
        crate::types::NormalizedEdge {
            id: "e-MEDIUM-HUGE-1".to_string(),
            source: "MEDIUM".to_string(),
            target: "HUGE".to_string(),
            label: Some("batch write".to_string()),
            is_cycle: Some(false),
            layout_role: None,
        },
    ];

    let router_result = crate::edge_routing::route_all_edges(
        &positioned_nodes,
        &edges,
        Some(&edges),
        &config,
        None,
    );

    let validation = crate::validation::layout_validator::validate_custom_layout(
        &positioned_nodes,
        &router_result.routes,
        &[],
        Some(&edges),
        None,
        &config,
    );

    println!("=== SCENARIO 17 ROUTES ===");
    for r in &router_result.routes {
        println!("Route {}: points={:?}, src_side={:?}, tgt_side={:?}", r.edge_id, r.points, r.source_port.side, r.target_port.side);
    }
    println!("=== SCENARIO 17 DIAGNOSTICS ===");
    for diag in &validation.diagnostics {
        println!("Diag: {} - {} - {:?} - {}", diag.code, diag.severity, diag.ids, diag.message);
    }

    assert!(validation.is_valid, "Validation failed with {} errors", validation.diagnostics.len());
}

#[test]
fn test_scenario_17_full_pipeline() {
    let config = crate::config::CustomLayoutConfig::default();
    let norm_nodes = vec![
        crate::types::NormalizedNode {
            id: "TINY".to_string(),
            label: Some("Micro".to_string()),
            width: 90.0,
            height: 45.0,
        },
        crate::types::NormalizedNode {
            id: "MEDIUM".to_string(),
            label: Some("Standard Worker".to_string()),
            width: 180.0,
            height: 70.0,
        },
        crate::types::NormalizedNode {
            id: "HUGE".to_string(),
            label: Some("Enterprise Database Cluster".to_string()),
            width: 280.0,
            height: 130.0,
        },
    ];

    let norm_edges = vec![
        crate::types::NormalizedEdge {
            id: "e-TINY-MEDIUM-0".to_string(),
            source: "TINY".to_string(),
            target: "MEDIUM".to_string(),
            label: Some("ingest".to_string()),
            is_cycle: Some(false),
            layout_role: None,
        },
        crate::types::NormalizedEdge {
            id: "e-MEDIUM-HUGE-1".to_string(),
            source: "MEDIUM".to_string(),
            target: "HUGE".to_string(),
            label: Some("batch write".to_string()),
            is_cycle: Some(false),
            layout_role: None,
        },
    ];

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

    let mut ranks_vec: Vec<Vec<String>> = Vec::new();
    let mut max_rank = 0;
    for &r in layered.rank_nodes_map.keys() {
        if r > max_rank {
            max_rank = r;
        }
    }
    for rank_idx in 0..=max_rank {
        if let Some(nodes) = layered.rank_nodes_map.get(&rank_idx) {
            ranks_vec.push(nodes.clone());
        } else {
            ranks_vec.push(Vec::new());
        }
    }

    let (optimized_ranks, _) = crate::crossing_minimization::optimize_layer_orders_parallel(
        ranks_vec,
        &active_edges,
        config.max_global_passes,
    );

    let mut ordered_layers: Vec<Vec<crate::LayerNode>> = Vec::new();
    for rank_nodes in &optimized_ranks {
        let mut layer_nodes = Vec::new();
        for node_id in rank_nodes {
            if let Some(ln) = layer_graph.item_map.get(node_id) {
                layer_nodes.push(ln.clone());
            }
        }
        ordered_layers.push(layer_nodes);
    }

    let norm_graph = crate::cycle_breaking::graph_normalization::normalize_graph(&norm_nodes, &norm_edges)
        .unwrap()
        .graph;

    let coord_result = crate::coordinate_assignment::coordinate_assignment_facade::assign_coordinates(
        &norm_graph,
        &layer_graph,
        &ordered_layers,
        &config,
        None,
        None,
    );

    let mut positioned_nodes = Vec::new();
    for (rank_idx, rank_node_ids) in optimized_ranks.iter().enumerate() {
        for (order_idx, node_id) in rank_node_ids.iter().enumerate() {
            if let Some(input_node) = norm_nodes.iter().find(|n| n.id == *node_id) {
                let pos = coord_result
                    .node_positions
                    .get(node_id)
                    .cloned()
                    .unwrap_or(crate::types::Point { x: 50.0, y: 50.0 });
                positioned_nodes.push(crate::types::PositionedNode {
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

    let router_result = crate::edge_routing::route_all_edges(
        &positioned_nodes,
        &norm_edges,
        Some(&active_edges),
        &config,
        None,
    );

    let validation = crate::validation::layout_validator::validate_custom_layout(
        &positioned_nodes,
        &router_result.routes,
        &[],
        Some(&norm_edges),
        Some(&edge_role_map),
        &config,
    );

    println!("=== SCENARIO 17 FULL PIPELINE ROUTES ===");
    for r in &router_result.routes {
        println!("Route {}: points={:?}, src_side={:?}, tgt_side={:?}", r.edge_id, r.points, r.source_port.side, r.target_port.side);
    }

    println!("=== SCENARIO 17 FULL PIPELINE DIAGNOSTICS ===");
    for diag in &validation.diagnostics {
        println!("Diag: {} - {} - {:?} - {}", diag.code, diag.severity, diag.ids, diag.message);
    }

    assert!(validation.is_valid, "Validation failed with {} errors", validation.diagnostics.len());
}

#[test]
fn test_max_route_order_variants_evaluation() {
    let norm_nodes = vec![
        crate::types::NormalizedNode {
            id: "n1".to_string(),
            label: Some("Node 1".to_string()),
            width: 140.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n2".to_string(),
            label: Some("Node 2".to_string()),
            width: 140.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n3".to_string(),
            label: Some("Node 3".to_string()),
            width: 140.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n4".to_string(),
            label: Some("Node 4".to_string()),
            width: 140.0,
            height: 60.0,
        },
    ];

    let norm_edges = vec![
        NormalizedEdge {
            id: "e1".to_string(),
            source: "n1".to_string(),
            target: "n4".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e2".to_string(),
            source: "n2".to_string(),
            target: "n3".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e3".to_string(),
            source: "n1".to_string(),
            target: "n3".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e4".to_string(),
            source: "n2".to_string(),
            target: "n4".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
    ];

    let mut cfg_1 = CustomLayoutConfig::default();
    cfg_1.max_route_order_variants = 1;
    cfg_1.max_rip_up_passes = 2;

    let mut cfg_6 = CustomLayoutConfig::default();
    cfg_6.max_route_order_variants = 2;
    cfg_6.max_rip_up_passes = 2;

    let classified = crate::cycle_breaking::break_cycles(&norm_nodes, &norm_edges);
    let active_edges: Vec<NormalizedEdge> = classified.iter().map(|c| c.edge.clone()).collect();
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

    let mut ranks_vec: Vec<Vec<String>> = Vec::new();
    let mut max_rank = 0;
    for &r in layered.rank_nodes_map.keys() {
        if r > max_rank {
            max_rank = r;
        }
    }
    for rank_idx in 0..=max_rank {
        if let Some(nodes) = layered.rank_nodes_map.get(&rank_idx) {
            ranks_vec.push(nodes.clone());
        } else {
            ranks_vec.push(Vec::new());
        }
    }

    let (optimized_ranks, _) = crate::crossing_minimization::optimize_layer_orders_parallel(
        ranks_vec,
        &active_edges,
        cfg_1.max_global_passes,
    );

    let mut ordered_layers: Vec<Vec<crate::LayerNode>> = Vec::new();
    for rank_nodes in &optimized_ranks {
        let mut layer_nodes = Vec::new();
        for node_id in rank_nodes {
            if let Some(ln) = layer_graph.item_map.get(node_id) {
                layer_nodes.push(ln.clone());
            }
        }
        ordered_layers.push(layer_nodes);
    }

    let norm_graph = crate::cycle_breaking::graph_normalization::normalize_graph(&norm_nodes, &norm_edges)
        .unwrap()
        .graph;

    let coord_result = crate::coordinate_assignment::coordinate_assignment_facade::assign_coordinates(
        &norm_graph,
        &layer_graph,
        &ordered_layers,
        &cfg_1,
        None,
        None,
    );

    let mut positioned_nodes = Vec::new();
    for (rank_idx, rank_node_ids) in optimized_ranks.iter().enumerate() {
        for (order_idx, node_id) in rank_node_ids.iter().enumerate() {
            if let Some(input_node) = norm_nodes.iter().find(|n| n.id == *node_id) {
                let pos = coord_result
                    .node_positions
                    .get(node_id)
                    .cloned()
                    .unwrap_or(crate::types::Point { x: 50.0, y: 50.0 });
                positioned_nodes.push(crate::types::PositionedNode {
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

    let res_1 = crate::step5_edge_routing::edge_router_facade::route_all_edges(
        &positioned_nodes,
        &norm_edges,
        Some(&active_edges),
        &cfg_1,
        None,
    );

    let res_6 = crate::step5_edge_routing::edge_router_facade::route_all_edges(
        &positioned_nodes,
        &norm_edges,
        Some(&active_edges),
        &cfg_6,
        None,
    );

    let val_1 = crate::validation::layout_validator::validate_custom_layout(
        &positioned_nodes,
        &res_1.routes,
        &[],
        Some(&norm_edges),
        Some(&edge_role_map),
        &cfg_1,
    );

    let val_6 = crate::validation::layout_validator::validate_custom_layout(
        &positioned_nodes,
        &res_6.routes,
        &[],
        Some(&norm_edges),
        Some(&edge_role_map),
        &cfg_6,
    );

    let cand_1 = crate::validation::layout_validator::LayoutEvaluationCandidate {
        result: &val_1,
        edges: &res_1.routes,
        badges: &[],
    };

    let cand_6 = crate::validation::layout_validator::LayoutEvaluationCandidate {
        result: &val_6,
        edges: &res_6.routes,
        badges: &[],
    };

    let score_cmp = crate::validation::layout_validator::compare_layout_scores_with_config(
        &cand_6,
        &cand_1,
        &positioned_nodes,
        None,
        &cfg_6,
    );

    assert!(
        score_cmp != std::cmp::Ordering::Greater,
        "max_route_order_variants=2 score must be <= max_route_order_variants=1 score"
    );
}

#[test]
fn test_max_rip_up_passes_evaluation() {
    let norm_nodes = vec![
        crate::types::NormalizedNode {
            id: "n1".to_string(),
            label: Some("Node 1".to_string()),
            width: 140.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n2".to_string(),
            label: Some("Node 2".to_string()),
            width: 140.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n3".to_string(),
            label: Some("Node 3".to_string()),
            width: 140.0,
            height: 60.0,
        },
        crate::types::NormalizedNode {
            id: "n4".to_string(),
            label: Some("Node 4".to_string()),
            width: 140.0,
            height: 60.0,
        },
    ];

    let norm_edges = vec![
        NormalizedEdge {
            id: "e1".to_string(),
            source: "n1".to_string(),
            target: "n4".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e2".to_string(),
            source: "n2".to_string(),
            target: "n3".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e3".to_string(),
            source: "n1".to_string(),
            target: "n3".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e4".to_string(),
            source: "n2".to_string(),
            target: "n4".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
    ];

    let classified = crate::cycle_breaking::break_cycles(&norm_nodes, &norm_edges);
    let active_edges: Vec<NormalizedEdge> = classified.iter().map(|c| c.edge.clone()).collect();
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

    let mut ranks_vec: Vec<Vec<String>> = Vec::new();
    let mut max_rank = 0;
    for &r in layered.rank_nodes_map.keys() {
        if r > max_rank {
            max_rank = r;
        }
    }
    for rank_idx in 0..=max_rank {
        if let Some(nodes) = layered.rank_nodes_map.get(&rank_idx) {
            ranks_vec.push(nodes.clone());
        } else {
            ranks_vec.push(Vec::new());
        }
    }

    let mut ordered_layers: Vec<Vec<crate::LayerNode>> = Vec::new();
    for rank_nodes in &ranks_vec {
        let mut layer_nodes = Vec::new();
        for node_id in rank_nodes {
            if let Some(ln) = layer_graph.item_map.get(node_id) {
                layer_nodes.push(ln.clone());
            }
        }
        ordered_layers.push(layer_nodes);
    }

    let norm_graph = crate::cycle_breaking::graph_normalization::normalize_graph(&norm_nodes, &norm_edges)
        .unwrap()
        .graph;

    let mut cfg_1 = CustomLayoutConfig::default();
    cfg_1.max_rip_up_passes = 1;
    cfg_1.max_route_order_variants = 2;

    let mut cfg_2 = CustomLayoutConfig::default();
    cfg_2.max_rip_up_passes = 2;
    cfg_2.max_route_order_variants = 2;

    let coord_result = crate::coordinate_assignment::coordinate_assignment_facade::assign_coordinates(
        &norm_graph,
        &layer_graph,
        &ordered_layers,
        &cfg_2,
        None,
        None,
    );

    let mut positioned_nodes = Vec::new();
    for (rank_idx, rank_node_ids) in ranks_vec.iter().enumerate() {
        for (order_idx, node_id) in rank_node_ids.iter().enumerate() {
            if let Some(input_node) = norm_nodes.iter().find(|n| n.id == *node_id) {
                let pos = coord_result
                    .node_positions
                    .get(node_id)
                    .cloned()
                    .unwrap_or(crate::types::Point { x: 50.0, y: 50.0 });
                positioned_nodes.push(crate::types::PositionedNode {
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

    let res_1 = crate::edge_routing::route_all_edges(
        &positioned_nodes,
        &norm_edges,
        Some(&active_edges),
        &cfg_1,
        None,
    );

    let res_2 = crate::edge_routing::route_all_edges(
        &positioned_nodes,
        &norm_edges,
        Some(&active_edges),
        &cfg_2,
        None,
    );

    assert!(
        res_2.routes.len() >= res_1.routes.len(),
        "max_rip_up_passes=2 routes count ({}) must be >= max_rip_up_passes=1 routes count ({})",
        res_2.routes.len(),
        res_1.routes.len()
    );
}

#[test]
fn test_max_rip_up_passes_conflicting_graph_pass_limits() {
    // Construct a tight 2-rank graph with overlapping edge trajectories forcing rip-up passes
    let nodes = vec![
        crate::types::PositionedNode {
            id: "N1".to_string(),
            label: Some("Node 1".to_string()),
            x: 100.0,
            y: 100.0,
            width: 120.0,
            height: 60.0,
            rank: 0,
            order: 0,
        },
        crate::types::PositionedNode {
            id: "N2".to_string(),
            label: Some("Node 2".to_string()),
            x: 300.0,
            y: 100.0,
            width: 120.0,
            height: 60.0,
            rank: 0,
            order: 1,
        },
        crate::types::PositionedNode {
            id: "N3".to_string(),
            label: Some("Node 3".to_string()),
            x: 100.0,
            y: 300.0,
            width: 120.0,
            height: 60.0,
            rank: 1,
            order: 0,
        },
        crate::types::PositionedNode {
            id: "N4".to_string(),
            label: Some("Node 4".to_string()),
            x: 300.0,
            y: 300.0,
            width: 120.0,
            height: 60.0,
            rank: 1,
            order: 1,
        },
    ];

    let edges = vec![
        NormalizedEdge {
            id: "e1".to_string(),
            source: "N1".to_string(),
            target: "N4".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e2".to_string(),
            source: "N2".to_string(),
            target: "N3".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e3".to_string(),
            source: "N1".to_string(),
            target: "N3".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e4".to_string(),
            source: "N2".to_string(),
            target: "N4".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
    ];

    let mut cfg_1 = CustomLayoutConfig::default();
    cfg_1.max_rip_up_passes = 1;

    let mut cfg_12 = CustomLayoutConfig::default();
    cfg_12.max_rip_up_passes = 12;

    let res_1 = crate::edge_routing::route_all_edges(&nodes, &edges, None, &cfg_1, None);
    let res_12 = crate::edge_routing::route_all_edges(&nodes, &edges, None, &cfg_12, None);

    assert_eq!(res_1.routes.len(), 4);
    assert_eq!(res_12.routes.len(), 4);
    assert_eq!(res_1.status, "success");
    assert_eq!(res_12.status, "success");
}








