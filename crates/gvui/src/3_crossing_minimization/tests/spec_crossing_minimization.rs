//! Specification tests for Step 3.1 & Step 3.2: Crossing Minimization & Crossing Counting

use super::super::barycenter_median_ordering::{
    minimize_crossings, minimize_crossings_median, ExpandedLayerGraph,
};
use super::super::crossing_counting::{
    count_layer_crossings, get_bridge_owner_edge_id, segments_cross,
};
use crate::types::{EdgeRole, LayerNode, Point, Segment};
use std::collections::HashMap;

#[test]
fn test_count_layer_crossings() {
    let upper = vec!["A".to_string(), "B".to_string()];
    let lower = vec!["C".to_string(), "D".to_string()];

    // Straight edges: A->C, B->D (0 crossings)
    let straight_edges = vec![
        ("A".to_string(), "C".to_string()),
        ("B".to_string(), "D".to_string()),
    ];
    assert_eq!(count_layer_crossings(&upper, &lower, &straight_edges), 0);

    // Crossed edges: A->D, B->C (1 crossing)
    let crossing_edges = vec![
        ("A".to_string(), "D".to_string()),
        ("B".to_string(), "C".to_string()),
    ];
    assert_eq!(count_layer_crossings(&upper, &lower, &crossing_edges), 1);
}

#[test]
fn test_minimize_crossings_barycenter_and_median() {
    let node_a = LayerNode {
        id: "A".to_string(),
        rank: 0,
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        width: 100.0,
        height: 40.0,
        x: Some(0.0),
        y: Some(0.0),
    };
    let node_b = LayerNode {
        id: "B".to_string(),
        rank: 0,
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        width: 100.0,
        height: 40.0,
        x: Some(120.0),
        y: Some(0.0),
    };
    let node_c = LayerNode {
        id: "C".to_string(),
        rank: 1,
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        width: 100.0,
        height: 40.0,
        x: Some(0.0),
        y: Some(100.0),
    };
    let node_d = LayerNode {
        id: "D".to_string(),
        rank: 1,
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        width: 100.0,
        height: 40.0,
        x: Some(120.0),
        y: Some(100.0),
    };

    let mut item_map = HashMap::new();
    item_map.insert("A".to_string(), node_a.clone());
    item_map.insert("B".to_string(), node_b.clone());
    item_map.insert("C".to_string(), node_c.clone());
    item_map.insert("D".to_string(), node_d.clone());

    let mut preds = HashMap::new();
    preds.insert("C".to_string(), vec!["B".to_string()]);
    preds.insert("D".to_string(), vec!["A".to_string()]);

    let mut succs = HashMap::new();
    succs.insert("A".to_string(), vec!["D".to_string()]);
    succs.insert("B".to_string(), vec!["C".to_string()]);

    let graph = ExpandedLayerGraph {
        layers: vec![vec![node_a, node_b], vec![node_c, node_d]],
        real_nodes: vec![],
        virtual_nodes: vec![],
        item_map,
        predecessors_map: preds,
        successors_map: succs,
    };

    let result_bary = minimize_crossings(&graph, 5, None);
    assert_eq!(result_bary.crossing_count, 0);

    let result_med = minimize_crossings_median(&graph, 5, None);
    assert_eq!(result_med.crossing_count, 0);
}

#[test]
fn test_segments_cross_2d() {
    let seg1 = Segment {
        a: Point { x: 0.0, y: 0.0 },
        b: Point { x: 10.0, y: 10.0 },
    };
    let seg2 = Segment {
        a: Point { x: 0.0, y: 10.0 },
        b: Point { x: 10.0, y: 0.0 },
    };
    assert!(segments_cross(&seg1, &seg2, 1e-5));

    let seg3 = Segment {
        a: Point { x: 0.0, y: 0.0 },
        b: Point { x: 5.0, y: 5.0 },
    };
    let seg4 = Segment {
        a: Point { x: 6.0, y: 6.0 },
        b: Point { x: 10.0, y: 10.0 },
    };
    assert!(!segments_cross(&seg3, &seg4, 1e-5));
}

#[test]
fn test_bridge_owner_priority() {
    let owner = get_bridge_owner_edge_id(
        ("edge_fwd", Some(EdgeRole::Forward)),
        ("edge_fb", Some(EdgeRole::Feedback)),
    );
    assert_eq!(owner, "edge_fb");
}
