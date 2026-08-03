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

#[test]
fn test_max_crossing_sweeps_impact_kubernetes_topology() {
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

    let classified = crate::cycle_breaking::cycle_breaking_facade::break_cycles(&norm_nodes, &norm_edges);
    let active_edges: Vec<crate::types::NormalizedEdge> = classified.iter().map(|c| c.edge.clone()).collect();
    let edge_role_map: HashMap<String, EdgeRole> = classified.iter().map(|c| (c.edge.id.clone(), c.role)).collect();

    let layered = crate::rank_assignment::assign_ranks(&norm_nodes, &active_edges, None);
    let layer_graph = crate::rank_assignment::layer_graph_builder::build_layer_graph(
        &norm_nodes,
        &norm_edges,
        Some(&edge_role_map),
        &layered,
    );

    let res_1 = minimize_crossings(&layer_graph, 1, None);
    let res_24 = minimize_crossings(&layer_graph, 24, None);

    assert_eq!(res_1.crossing_count, 0);
    assert_eq!(res_24.crossing_count, 0);
}

#[test]
fn test_max_crossing_sweeps_dense_graph_sweeps_difference() {
    let make_node = |id: &str, rank: usize| LayerNode {
        id: id.to_string(),
        rank,
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        width: 100.0,
        height: 40.0,
        x: None,
        y: None,
    };

    // 4 ranks graph to test multi-sweep information propagation
    let a0 = make_node("A0", 0);
    let a1 = make_node("A1", 0);
    let a2 = make_node("A2", 0);

    let b0 = make_node("B0", 1);
    let b1 = make_node("B1", 1);
    let b2 = make_node("B2", 1);

    let c0 = make_node("C0", 2);
    let c1 = make_node("C1", 2);
    let c2 = make_node("C2", 2);

    let d0 = make_node("D0", 3);
    let d1 = make_node("D1", 3);
    let d2 = make_node("D2", 3);

    let mut item_map = HashMap::new();
    for node in [&a0, &a1, &a2, &b0, &b1, &b2, &c0, &c1, &c2, &d0, &d1, &d2] {
        item_map.insert(node.id.clone(), node.clone());
    }

    let mut preds: HashMap<String, Vec<String>> = HashMap::new();
    let mut succs: HashMap<String, Vec<String>> = HashMap::new();

    let add_edge = |s: &str, t: &str, succs: &mut HashMap<String, Vec<String>>, preds: &mut HashMap<String, Vec<String>>| {
        succs.entry(s.to_string()).or_default().push(t.to_string());
        preds.entry(t.to_string()).or_default().push(s.to_string());
    };

    // Complex interconnected edges requiring multiple sweeps
    add_edge("A0", "B2", &mut succs, &mut preds);
    add_edge("A1", "B0", &mut succs, &mut preds);
    add_edge("A2", "B1", &mut succs, &mut preds);

    add_edge("B0", "C1", &mut succs, &mut preds);
    add_edge("B1", "C2", &mut succs, &mut preds);
    add_edge("B2", "C0", &mut succs, &mut preds);

    add_edge("C0", "D2", &mut succs, &mut preds);
    add_edge("C1", "D0", &mut succs, &mut preds);
    add_edge("C2", "D1", &mut succs, &mut preds);

    // Cross-rank feedback-like forward connections
    add_edge("A0", "C1", &mut succs, &mut preds);
    add_edge("A2", "C0", &mut succs, &mut preds);
    add_edge("B0", "D2", &mut succs, &mut preds);
    add_edge("B2", "D0", &mut succs, &mut preds);

    let graph = ExpandedLayerGraph {
        layers: vec![
            vec![a0, a1, a2],
            vec![b0, b1, b2],
            vec![c0, c1, c2],
            vec![d0, d1, d2],
        ],
        real_nodes: vec![],
        virtual_nodes: vec![],
        item_map,
        predecessors_map: preds,
        successors_map: succs,
    };

    let res_1 = minimize_crossings(&graph, 1, None);
    let res_24 = minimize_crossings(&graph, 24, None);

    let order_1: Vec<Vec<String>> = res_1.ordered_layers.iter().map(|l| l.iter().map(|n| n.id.clone()).collect()).collect();
    let order_24: Vec<Vec<String>> = res_24.ordered_layers.iter().map(|l| l.iter().map(|n| n.id.clone()).collect()).collect();

    println!("Multi-sweep test: res_1 crossings = {}, res_24 crossings = {}", res_1.crossing_count, res_24.crossing_count);
    println!("Order 1: {:?}", order_1);
    println!("Order 24: {:?}", order_24);

    assert!(
        order_1 != order_24 || res_24.crossing_count < res_1.crossing_count,
        "maxCrossingSweeps: 24 should alter ordering or decrease crossing count compared to 1 sweep on multi-layer graph"
    );
}

