use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
use crate::types::{ExpandedLayerGraph, LayerNode, NormalizedGraph};
use super::super::coordinate_assignment_facade::assign_coordinates;

#[test]
fn test_coordinate_assignment_facade_basic() {
    let graph = NormalizedGraph::default();

    let n1 = LayerNode {
        id: "n1".to_string(),
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        rank: 0,
        width: 100.0,
        height: 50.0,
        x: None,
        y: None,
    };
    let n2 = LayerNode {
        id: "n2".to_string(),
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        rank: 1,
        width: 100.0,
        height: 50.0,
        x: None,
        y: None,
    };

    let mut item_map = HashMap::new();
    item_map.insert("n1".to_string(), n1.clone());
    item_map.insert("n2".to_string(), n2.clone());

    let mut predecessors_map = HashMap::new();
    let mut successors_map = HashMap::new();
    successors_map.insert("n1".to_string(), vec!["n2".to_string()]);
    predecessors_map.insert("n2".to_string(), vec!["n1".to_string()]);

    let layer_graph = ExpandedLayerGraph {
        layers: vec![vec![n1.clone()], vec![n2.clone()]],
        real_nodes: vec![n1.clone(), n2.clone()],
        virtual_nodes: vec![],
        item_map,
        predecessors_map,
        successors_map,
    };

    let ordered_layers = vec![vec![n1], vec![n2]];
    let config = CustomLayoutConfig::default();

    let res = assign_coordinates(&graph, &layer_graph, &ordered_layers, &config, None, None);

    assert_eq!(res.node_positions.len(), 2);
    assert!(res.bounding_box.width > 0.0);
    assert!(res.bounding_box.height > 0.0);

    let p1 = res.node_positions.get("n1").unwrap();
    let p2 = res.node_positions.get("n2").unwrap();

    assert_eq!(p1.x, config.graph_padding);
    assert_eq!(p1.y, config.graph_padding);
    assert!(p2.y > p1.y);
}

#[test]
fn test_coordinate_assignment_rank_gap_variation() {
    let graph = NormalizedGraph::default();

    let n1 = LayerNode {
        id: "n1".to_string(),
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        rank: 0,
        width: 100.0,
        height: 50.0,
        x: None,
        y: None,
    };
    let n2 = LayerNode {
        id: "n2".to_string(),
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        rank: 1,
        width: 100.0,
        height: 50.0,
        x: None,
        y: None,
    };

    let mut item_map = HashMap::new();
    item_map.insert("n1".to_string(), n1.clone());
    item_map.insert("n2".to_string(), n2.clone());

    let mut predecessors_map = HashMap::new();
    let mut successors_map = HashMap::new();
    successors_map.insert("n1".to_string(), vec!["n2".to_string()]);
    predecessors_map.insert("n2".to_string(), vec!["n1".to_string()]);

    let layer_graph = ExpandedLayerGraph {
        layers: vec![vec![n1.clone()], vec![n2.clone()]],
        real_nodes: vec![n1.clone(), n2.clone()],
        virtual_nodes: vec![],
        item_map,
        predecessors_map,
        successors_map,
    };

    let ordered_layers = vec![vec![n1], vec![n2]];
    let mut config120 = CustomLayoutConfig::default();
    config120.rank_gap = 120.0;

    let mut config240 = CustomLayoutConfig::default();
    config240.rank_gap = 240.0;

    let res120 = assign_coordinates(&graph, &layer_graph, &ordered_layers, &config120, None, None);
    let res240 = assign_coordinates(&graph, &layer_graph, &ordered_layers, &config240, None, None);

    let p2_120 = res120.node_positions.get("n2").unwrap();
    let p2_240 = res240.node_positions.get("n2").unwrap();

    // With rankGap increased by 120 (from 120 to 240), rank 1 y coordinate should increase by 120
    assert_eq!(p2_240.y - p2_120.y, 120.0);
    assert_eq!(res240.bounding_box.height - res120.bounding_box.height, 120.0);
}

#[test]
fn test_kubernetes_cluster_topology_rank_gap_variation() {
    let norm_nodes = vec![
        crate::types::NormalizedNode {
            id: "n1".to_string(),
            label: Some("Node 1".to_string()),
            width: 100.0,
            height: 50.0,
        },
        crate::types::NormalizedNode {
            id: "n2".to_string(),
            label: Some("Node 2".to_string()),
            width: 100.0,
            height: 50.0,
        },
        crate::types::NormalizedNode {
            id: "n3".to_string(),
            label: Some("Node 3".to_string()),
            width: 100.0,
            height: 50.0,
        },
    ];

    let norm_edges = vec![
        crate::types::NormalizedEdge {
            id: "e1".to_string(),
            source: "n1".to_string(),
            target: "n2".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        crate::types::NormalizedEdge {
            id: "e2".to_string(),
            source: "n2".to_string(),
            target: "n3".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
    ];

    let mut config120 = CustomLayoutConfig::default();
    config120.rank_gap = 120.0;
    config120.max_rip_up_passes = 2;
    config120.max_route_order_variants = 2;

    let mut config240 = CustomLayoutConfig::default();
    config240.rank_gap = 240.0;
    config240.max_rip_up_passes = 2;
    config240.max_route_order_variants = 2;

    let res120 = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &config120,
    );

    let res240 = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &config240,
    );

    // Compute total layout heights for 120 vs 240
    let max_y_120 = res120.best_evaluation.nodes.iter().map(|n| n.y + n.height).fold(0.0f64, f64::max);
    let max_y_240 = res240.best_evaluation.nodes.iter().map(|n| n.y + n.height).fold(0.0f64, f64::max);

    // Layout height with rankGap=240.0 must be strictly greater than with rankGap=120.0
    assert!(max_y_240 > max_y_120, "max_y_240 ({}) should be greater than max_y_120 ({})", max_y_240, max_y_120);
}

#[test]
fn test_coordinate_assignment_node_gap_variation() {
    let graph = NormalizedGraph::default();

    let n1 = LayerNode {
        id: "n1".to_string(),
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        rank: 0,
        width: 100.0,
        height: 50.0,
        x: None,
        y: None,
    };
    let n2 = LayerNode {
        id: "n2".to_string(),
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        rank: 0,
        width: 100.0,
        height: 50.0,
        x: None,
        y: None,
    };

    let mut item_map = HashMap::new();
    item_map.insert("n1".to_string(), n1.clone());
    item_map.insert("n2".to_string(), n2.clone());

    let predecessors_map = HashMap::new();
    let successors_map = HashMap::new();

    let layer_graph = ExpandedLayerGraph {
        layers: vec![vec![n1.clone(), n2.clone()]],
        real_nodes: vec![n1.clone(), n2.clone()],
        virtual_nodes: vec![],
        item_map,
        predecessors_map,
        successors_map,
    };

    let ordered_layers = vec![vec![n1, n2]];
    let mut config56 = CustomLayoutConfig::default();
    config56.node_gap = 56.0;

    let mut config120 = CustomLayoutConfig::default();
    config120.node_gap = 120.0;

    let res56 = assign_coordinates(&graph, &layer_graph, &ordered_layers, &config56, None, None);
    let res120 = assign_coordinates(&graph, &layer_graph, &ordered_layers, &config120, None, None);

    let p1_56 = res56.node_positions.get("n1").unwrap();
    let p2_56 = res56.node_positions.get("n2").unwrap();
    let p1_120 = res120.node_positions.get("n1").unwrap();
    let p2_120 = res120.node_positions.get("n2").unwrap();

    let gap_56 = p2_56.x - (p1_56.x + 100.0);
    let gap_120 = p2_120.x - (p1_120.x + 100.0);

    assert_eq!(gap_56, 56.0);
    assert_eq!(gap_120, 120.0);
    assert_eq!(res120.bounding_box.width - res56.bounding_box.width, 64.0);
}

#[test]
fn test_kubernetes_cluster_topology_node_gap_variation() {
    let norm_nodes = vec![
        crate::types::NormalizedNode {
            id: "n1".to_string(),
            label: Some("Node 1".to_string()),
            width: 100.0,
            height: 50.0,
        },
        crate::types::NormalizedNode {
            id: "n2".to_string(),
            label: Some("Node 2".to_string()),
            width: 100.0,
            height: 50.0,
        },
        crate::types::NormalizedNode {
            id: "n3".to_string(),
            label: Some("Node 3".to_string()),
            width: 100.0,
            height: 50.0,
        },
    ];

    let norm_edges = vec![
        crate::types::NormalizedEdge {
            id: "e1".to_string(),
            source: "n1".to_string(),
            target: "n2".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        crate::types::NormalizedEdge {
            id: "e2".to_string(),
            source: "n1".to_string(),
            target: "n3".to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
    ];

    let mut config56 = CustomLayoutConfig::default();
    config56.node_gap = 56.0;
    config56.max_rip_up_passes = 2;
    config56.max_route_order_variants = 2;

    let mut config120 = CustomLayoutConfig::default();
    config120.node_gap = 120.0;
    config120.max_rip_up_passes = 2;
    config120.max_route_order_variants = 2;

    let res56 = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &config56,
    );

    let res120 = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &config120,
    );

    // Compute total layout width for 56 vs 120
    let max_x_56 = res56.best_evaluation.nodes.iter().map(|n| n.x + n.width).fold(0.0f64, f64::max);
    let max_x_120 = res120.best_evaluation.nodes.iter().map(|n| n.x + n.width).fold(0.0f64, f64::max);

    // Layout width with nodeGap=120.0 must be strictly greater than with nodeGap=56.0
    assert!(max_x_120 > max_x_56, "max_x_120 ({}) should be greater than max_x_56 ({})", max_x_120, max_x_56);
}

