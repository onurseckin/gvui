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
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let json_path = std::path::Path::new(&manifest_dir).join("../../public/data/graphs/kubernetes_cluster_topology.json");
    let json_str = std::fs::read_to_string(json_path).expect("Failed to read json file");

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

    let norm_nodes: Vec<crate::types::NormalizedNode> = graph
        .nodes
        .iter()
        .map(|n| {
            let title_width = (n.name.len() as f64) * 11.0 + 90.0;
            let mut badge_width = 0.0;
            let mut badge_rows = 0;
            if !n.badges.is_empty() {
                let total_badge_chars: usize = n.badges.iter().map(|b| b.label.len() + 2).sum();
                badge_width = (total_badge_chars as f64) * 8.0 + 32.0;
                badge_rows = (n.badges.len() + 1) / 2;
            }
            let desc_width = n.description.as_ref().map_or(0.0, |d| (d.len() as f64) * 8.0 + 32.0);
            let width = 120.0f64.max(title_width).max(badge_width).max(desc_width).ceil();

            let base_header = 36.0;
            let mut body_sections_height = 0.0;

            if let Some(ref desc) = n.description {
                let approx_chars_per_line = 20.0f64.max(((width - 32.0) / 8.0).floor());
                let desc_lines = ((desc.len() as f64) / approx_chars_per_line).ceil();
                body_sections_height += desc_lines * 15.0 + 2.0;
            }

            if badge_rows > 0 {
                body_sections_height += (badge_rows as f64) * 20.0 + 2.0;
            }

            let height = (base_header + body_sections_height + 12.0).ceil();

            crate::types::NormalizedNode {
                id: n.id.clone(),
                label: Some(n.name.clone()),
                width,
                height,
            }
        })
        .collect();

    let norm_edges: Vec<NormalizedEdge> = graph
        .edges
        .iter()
        .enumerate()
        .map(|(idx, e)| NormalizedEdge {
            id: e.id.clone().unwrap_or_else(|| format!("e-{}-{}-{}", e.source, e.target, idx)),
            source: e.source.clone(),
            target: e.target.clone(),
            label: e.label.clone(),
            is_cycle: e.is_cycle,
            layout_role: None,
        })
        .collect();

    let config = CustomLayoutConfig::default();

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
    println!("=== KE5 ROUTE ===");
    if let Some(r) = ke5_route {
        println!("Points: {:?}", r.points);
        println!("Source port: {:?}", r.source_port);
        println!("Target port: {:?}", r.target_port);
    } else {
        println!("KE5 NOT FOUND!");
    }

    println!("=== VALIDATION DIAGNOSTICS FOR ALL EDGES ===");
    for diag in &validation.diagnostics {
        println!("Diag: {} - {} - {:?} - {}", diag.code, diag.severity, diag.ids, diag.message);
    }

    assert!(validation.is_valid, "Validation failed with {} errors", validation.diagnostics.len());
}


#[test]
fn test_dense_kubernetes_mesh_routing() {
    #[derive(serde::Deserialize)]
    struct RawGraphNode {
        id: String,
        name: Option<String>,
    }
    #[derive(serde::Deserialize)]
    struct RawGraphEdge {
        id: Option<String>,
        source: String,
        target: String,
        label: Option<String>,
        #[serde(rename = "isCycle")]
        is_cycle: Option<bool>,
    }
    #[derive(serde::Deserialize)]
    struct RawGraph {
        nodes: Vec<RawGraphNode>,
        edges: Vec<RawGraphEdge>,
    }

    let json_str = std::fs::read_to_string("../../public/data/graphs/dense_kubernetes_mesh.json")
        .expect("Failed to read dense_kubernetes_mesh.json");
    let raw: RawGraph = serde_json::from_str(&json_str).unwrap();

    let config = crate::config::CustomLayoutConfig::default();

    let nodes: Vec<crate::types::NormalizedNode> = raw
        .nodes
        .iter()
        .map(|n| {
            let label = n.name.clone().unwrap_or_else(|| n.id.clone());
            let dims = crate::badge_measurement::measure_badge_rect(&label, &config, false);
            crate::types::NormalizedNode {
                id: n.id.clone(),
                label: Some(label),
                width: (dims.width + 40.0).max(120.0),
                height: 60.0,
            }
        })
        .collect();

    let edges: Vec<crate::types::NormalizedEdge> = raw
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
    println!("Total edges: {}", edges.len());
    println!("Routed edges: {}", router_result.routes.len());
    println!("MISSING_ROUTE count: {}", missing_routes.len());
    for mr in &missing_routes {
        println!("  MISSING: {:?}", mr);
    }
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





