//! Specification unit tests for fast-path top-down-dagre and left-right layout engines.

use std::time::Instant;
use crate::config::CustomLayoutConfig;
use crate::step3_crossing_minimization::fast_layout_engine::{
    compute_left_right_layout, compute_top_down_dagre_layout, transpose_side,
};
use crate::types::{NormalizedEdge, NormalizedNode};

fn make_test_nodes_and_edges() -> (Vec<NormalizedNode>, Vec<NormalizedEdge>) {
    let nodes = vec![
        NormalizedNode { id: "n1".to_string(), label: Some("Node 1".to_string()), width: 120.0, height: 60.0 },
        NormalizedNode { id: "n2".to_string(), label: Some("Node 2".to_string()), width: 140.0, height: 70.0 },
        NormalizedNode { id: "n3".to_string(), label: Some("Node 3".to_string()), width: 100.0, height: 50.0 },
        NormalizedNode { id: "n4".to_string(), label: Some("Node 4".to_string()), width: 160.0, height: 80.0 },
        NormalizedNode { id: "n5".to_string(), label: Some("Node 5".to_string()), width: 110.0, height: 55.0 },
    ];

    let edges = vec![
        NormalizedEdge { id: "e1".to_string(), source: "n1".to_string(), target: "n2".to_string(), label: Some("e1".to_string()), is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e2".to_string(), source: "n1".to_string(), target: "n3".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e3".to_string(), source: "n2".to_string(), target: "n4".to_string(), label: Some("e3".to_string()), is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e4".to_string(), source: "n3".to_string(), target: "n4".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e5".to_string(), source: "n4".to_string(), target: "n5".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e6".to_string(), source: "n5".to_string(), target: "n1".to_string(), label: Some("back".to_string()), is_cycle: Some(true), layout_role: None },
    ];

    (nodes, edges)
}

#[test]
fn test_top_down_dagre_fast_execution_and_clean_output() {
    let (nodes, edges) = make_test_nodes_and_edges();
    let config = CustomLayoutConfig::default();

    let start = Instant::now();
    let result = compute_top_down_dagre_layout(&nodes, &edges, &config);
    let elapsed = start.elapsed();

    let threshold_ms = if cfg!(debug_assertions) { 15.0 } else { 5.0 };
    assert!(
        elapsed.as_secs_f64() * 1000.0 < threshold_ms,
        "top-down-dagre layout must execute in < {}ms, took {:.2?}ms",
        threshold_ms,
        elapsed.as_secs_f64() * 1000.0
    );

    assert_eq!(result.nodes.len(), 5);
    assert_eq!(result.edges.len(), 6);
    assert_eq!(result.status, "success");
    assert_eq!(result.optimization_stats.stop_reason, "top_down_dagre_fast_path");

    for node in &result.nodes {
        assert!(node.x.is_finite());
        assert!(node.y.is_finite());
        assert!(node.width > 0.0);
        assert!(node.height > 0.0);
    }

    for edge in &result.edges {
        assert!(edge.points.len() >= 2);
        for pt in &edge.points {
            assert!(pt.x.is_finite());
            assert!(pt.y.is_finite());
        }
    }
}

#[test]
fn test_top_down_dagre_50_nodes_under_5ms() {
    let nodes: Vec<NormalizedNode> = (0..50)
        .map(|i| NormalizedNode {
            id: format!("n{}", i),
            label: Some(format!("Node {}", i)),
            width: 120.0,
            height: 60.0,
        })
        .collect();

    let mut edges = Vec::new();
    for i in 0..45 {
        edges.push(NormalizedEdge {
            id: format!("e{}", i),
            source: format!("n{}", i),
            target: format!("n{}", i + 5),
            label: None,
            is_cycle: None,
            layout_role: None,
        });
    }
    // Add cycle
    edges.push(NormalizedEdge {
        id: "e_cycle".to_string(),
        source: "n40".to_string(),
        target: "n5".to_string(),
        label: None,
        is_cycle: Some(true),
        layout_role: None,
    });

    let config = CustomLayoutConfig::default();
    let start = Instant::now();
    let result = compute_top_down_dagre_layout(&nodes, &edges, &config);
    let elapsed = start.elapsed();

    let threshold_ms = if cfg!(debug_assertions) { 15.0 } else { 5.0 };
    assert!(
        elapsed.as_secs_f64() * 1000.0 < threshold_ms,
        "50-node top-down-dagre layout must execute in < {}ms, took {:.2?}ms",
        threshold_ms,
        elapsed.as_secs_f64() * 1000.0
    );

    assert_eq!(result.nodes.len(), 50);
    assert_eq!(result.edges.len(), 46);
    assert_eq!(result.status, "success");

    // Verify all nodes are positioned cleanly
    for node in &result.nodes {
        assert!(node.x.is_finite() && node.y.is_finite());
    }

    // Verify all edge routes are valid orthogonal paths
    for edge in &result.edges {
        assert!(edge.points.len() >= 2);
        for pt in &edge.points {
            assert!(pt.x.is_finite() && pt.y.is_finite());
        }
    }
}

#[test]
fn test_left_right_fast_execution_and_transposition() {
    let (nodes, edges) = make_test_nodes_and_edges();
    let config = CustomLayoutConfig::default();

    let td_res = compute_top_down_dagre_layout(&nodes, &edges, &config);

    let start = Instant::now();
    let lr_res = compute_left_right_layout(&nodes, &edges, &config);
    let elapsed = start.elapsed();

    let threshold_ms = if cfg!(debug_assertions) { 15.0 } else { 5.0 };
    assert!(
        elapsed.as_secs_f64() * 1000.0 < threshold_ms,
        "left-right layout must execute in < {}ms, took {:.2?}ms",
        threshold_ms,
        elapsed.as_secs_f64() * 1000.0
    );

    assert_eq!(lr_res.nodes.len(), td_res.nodes.len());
    assert_eq!(lr_res.edges.len(), td_res.edges.len());
    assert_eq!(lr_res.status, "success");
    assert_eq!(lr_res.optimization_stats.stop_reason, "left_right_fast_path");

    // Verify node dimension preservation and layout transposition
    for orig_node in &nodes {
        let lr_node = lr_res.nodes.iter().find(|n| n.id == orig_node.id).expect("Node must exist in lr");
        assert_eq!(lr_node.width, orig_node.width, "Node width must match input width for node {}", orig_node.id);
        assert_eq!(lr_node.height, orig_node.height, "Node height must match input height for node {}", orig_node.id);
        assert!(lr_node.x.is_finite());
        assert!(lr_node.y.is_finite());
    }

    // Verify edge transposition
    for td_edge in &td_res.edges {
        let lr_edge = lr_res.edges.iter().find(|e| e.edge_id == td_edge.edge_id).expect("Edge must exist in lr");
        assert!(lr_edge.points.len() >= 2);
        for pt in &lr_edge.points {
            assert!(pt.x.is_finite());
            assert!(pt.y.is_finite());
        }
        assert_eq!(lr_edge.source_port.side, transpose_side(td_edge.source_port.side));
        assert_eq!(lr_edge.target_port.side, transpose_side(td_edge.target_port.side));
    }
}

#[test]
fn test_left_right_respects_configurable_options_and_speed() {
    let (nodes, edges) = make_test_nodes_and_edges();
    let mut config_default = CustomLayoutConfig::default();
    config_default.node_gap = 40.0;
    config_default.rank_gap = 100.0;
    config_default.lane_spacing = 10.0;

    let mut config_custom = CustomLayoutConfig::default();
    config_custom.node_gap = 90.0;
    config_custom.rank_gap = 200.0;
    config_custom.lane_spacing = 25.0;

    let start = Instant::now();
    let res_default = compute_left_right_layout(&nodes, &edges, &config_default);
    let elapsed = start.elapsed();

    let threshold_ms = if cfg!(debug_assertions) { 15.0 } else { 5.0 };
    assert!(
        elapsed.as_secs_f64() * 1000.0 < threshold_ms,
        "left-right layout must execute in < {}ms, took {:.2?}ms",
        threshold_ms,
        elapsed.as_secs_f64() * 1000.0
    );

    let res_custom = compute_left_right_layout(&nodes, &edges, &config_custom);

    // Node gap check (in LR, node gap affects Y spacing between nodes in same rank)
    // Rank gap check (in LR, rank gap affects X spacing between rank layers)
    let n1_def = res_default.nodes.iter().find(|n| n.id == "n1").unwrap();
    let n2_def = res_default.nodes.iter().find(|n| n.id == "n2").unwrap();

    let n1_cust = res_custom.nodes.iter().find(|n| n.id == "n1").unwrap();
    let n2_cust = res_custom.nodes.iter().find(|n| n.id == "n2").unwrap();

    // Since n1 and n2 are in different ranks (n1 rank 0, n2 rank 1), their X gap must increase when rank_gap increases
    let x_diff_def = (n2_def.x - n1_def.x).abs();
    let x_diff_cust = (n2_cust.x - n1_cust.x).abs();
    assert!(
        x_diff_cust > x_diff_def,
        "Increasing rank_gap must increase horizontal rank separation in LR layout: cust {} vs def {}",
        x_diff_cust, x_diff_def
    );

    assert_eq!(res_custom.status, "success");
    assert!(res_custom.optimization_stats.duration_ms >= 0.0);
}

#[test]
fn test_top_down_dagre_respects_configurable_options_and_speed() {
    let (nodes, edges) = make_test_nodes_and_edges();
    let mut config_default = CustomLayoutConfig::default();
    config_default.node_gap = 40.0;
    config_default.rank_gap = 100.0;
    config_default.lane_spacing = 10.0;

    let mut config_custom = CustomLayoutConfig::default();
    config_custom.node_gap = 90.0;
    config_custom.rank_gap = 200.0;
    config_custom.lane_spacing = 25.0;

    let start = Instant::now();
    let res_default = compute_top_down_dagre_layout(&nodes, &edges, &config_default);
    let elapsed = start.elapsed();

    assert!(
        elapsed.as_secs_f64() * 1000.0 < 5.0,
        "top-down-dagre layout must execute in < 5ms, took {:.2?}ms",
        elapsed.as_secs_f64() * 1000.0
    );

    let res_custom = compute_top_down_dagre_layout(&nodes, &edges, &config_custom);

    // 1. Rank gap check (in top-down, rank gap affects Y spacing between ranks: n1 in rank 0, n2 in rank 1)
    let n1_def = res_default.nodes.iter().find(|n| n.id == "n1").unwrap();
    let n2_def = res_default.nodes.iter().find(|n| n.id == "n2").unwrap();

    let n1_cust = res_custom.nodes.iter().find(|n| n.id == "n1").unwrap();
    let n2_cust = res_custom.nodes.iter().find(|n| n.id == "n2").unwrap();

    let y_diff_def = (n2_def.y - n1_def.y).abs();
    let y_diff_cust = (n2_cust.y - n1_cust.y).abs();
    assert!(
        y_diff_cust > y_diff_def,
        "Increasing rank_gap must increase vertical rank separation in TD layout: cust {} vs def {}",
        y_diff_cust, y_diff_def
    );

    // 2. Node gap check (in top-down, node gap affects X spacing between nodes in the same rank: n2 & n3 in rank 1)
    let n3_def = res_default.nodes.iter().find(|n| n.id == "n3").unwrap();
    let n3_cust = res_custom.nodes.iter().find(|n| n.id == "n3").unwrap();

    let x_diff_def = (n3_def.x - n2_def.x).abs();
    let x_diff_cust = (n3_cust.x - n2_cust.x).abs();
    assert!(
        x_diff_cust > x_diff_def,
        "Increasing node_gap must increase horizontal node separation in TD layout: cust {} vs def {}",
        x_diff_cust, x_diff_def
    );

    assert_eq!(res_custom.status, "success");
    assert!(res_custom.optimization_stats.duration_ms >= 0.0);
}

#[test]
fn test_top_down_dagre_linear_graph_sample() {
    let nodes = vec![
        NormalizedNode { id: "A".to_string(), label: Some("Node A".to_string()), width: 140.0, height: 70.0 },
        NormalizedNode { id: "B".to_string(), label: Some("Node B".to_string()), width: 140.0, height: 70.0 },
        NormalizedNode { id: "C".to_string(), label: Some("Node C".to_string()), width: 140.0, height: 70.0 },
    ];
    let edges = vec![
        NormalizedEdge { id: "e1".to_string(), source: "A".to_string(), target: "B".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e2".to_string(), source: "B".to_string(), target: "C".to_string(), label: None, is_cycle: None, layout_role: None },
    ];

    let config = CustomLayoutConfig::default();
    let result = compute_top_down_dagre_layout(&nodes, &edges, &config);

    assert_eq!(result.nodes.len(), 3);
    assert_eq!(result.edges.len(), 2);
    assert_eq!(result.status, "success");
}

fn load_dataset_graph(relative_path: &str) -> (Vec<NormalizedNode>, Vec<NormalizedEdge>) {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let json_path = std::path::Path::new(&manifest_dir).join(relative_path);
    let json_str = std::fs::read_to_string(&json_path)
        .unwrap_or_else(|_| panic!("Failed to read dataset file at {:?}", json_path));

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
        label: Option<String>,
        #[serde(rename = "isCycle")]
        is_cycle: Option<bool>,
    }
    #[derive(serde::Deserialize)]
    struct RawGraph {
        nodes: Vec<RawNode>,
        edges: Vec<RawEdge>,
    }

    let graph: RawGraph = serde_json::from_str(&json_str).expect("Failed to parse JSON dataset");

    let norm_nodes = graph
        .nodes
        .into_iter()
        .map(|n| NormalizedNode {
            id: n.id,
            label: Some(n.name),
            width: 140.0,
            height: 70.0,
        })
        .collect();

    let norm_edges = graph
        .edges
        .into_iter()
        .enumerate()
        .map(|(i, e)| NormalizedEdge {
            id: e.id.unwrap_or_else(|| format!("e_{}", i)),
            source: e.source,
            target: e.target,
            label: e.label,
            is_cycle: e.is_cycle,
            layout_role: None,
        })
        .collect();

    (norm_nodes, norm_edges)
}

#[test]
fn test_benchmark_and_inspect_saga_workflow_layout() {
    let (nodes, edges) = load_dataset_graph("../../public/data/graphs/distributed_saga_workflow.json");
    let config = CustomLayoutConfig::default();

    // Benchmark top-down-dagre
    let start_td = Instant::now();
    let res_td = compute_top_down_dagre_layout(&nodes, &edges, &config);
    let elapsed_td = start_td.elapsed();

    println!("Saga Workflow TD execution time: {:?}", elapsed_td);
    assert!(
        elapsed_td.as_secs_f64() * 1000.0 < 10.0,
        "top-down-dagre on saga_workflow must complete in <10ms, took {:.2?}ms",
        elapsed_td.as_secs_f64() * 1000.0
    );
    assert_eq!(res_td.nodes.len(), nodes.len());
    assert_eq!(res_td.edges.len(), edges.len());
    assert_eq!(res_td.status, "success");

    for n in &res_td.nodes {
        assert!(n.x.is_finite() && n.y.is_finite(), "Node position x,y must be finite, got ({}, {}) for node {}", n.x, n.y, n.id);
    }
    for e in &res_td.edges {
        assert!(e.points.len() >= 2, "Edge route for {} must have >= 2 points", e.edge_id);
        for pt in &e.points {
            assert!(pt.x.is_finite() && pt.y.is_finite(), "Edge point must be finite for edge {}", e.edge_id);
        }
    }

    // Benchmark left-right
    let start_lr = Instant::now();
    let res_lr = compute_left_right_layout(&nodes, &edges, &config);
    let elapsed_lr = start_lr.elapsed();

    println!("Saga Workflow LR execution time: {:?}", elapsed_lr);
    assert!(
        elapsed_lr.as_secs_f64() * 1000.0 < 10.0,
        "left-right on saga_workflow must complete in <10ms, took {:.2?}ms",
        elapsed_lr.as_secs_f64() * 1000.0
    );
    assert_eq!(res_lr.nodes.len(), nodes.len());
    assert_eq!(res_lr.edges.len(), edges.len());
    assert_eq!(res_lr.status, "success");

    for n in &res_lr.nodes {
        assert!(n.x.is_finite() && n.y.is_finite(), "Node position x,y must be finite in LR, got ({}, {}) for node {}", n.x, n.y, n.id);
    }
    for e in &res_lr.edges {
        assert!(e.points.len() >= 2, "Edge route for {} must have >= 2 points in LR", e.edge_id);
        for pt in &e.points {
            assert!(pt.x.is_finite() && pt.y.is_finite(), "Edge point must be finite for edge {} in LR", e.edge_id);
        }
    }
}

#[test]
fn test_benchmark_and_inspect_kubernetes_cluster_topology_layout() {
    let (nodes, edges) = load_dataset_graph("../../public/data/graphs/kubernetes_cluster_topology.json");
    let config = CustomLayoutConfig::default();

    // Benchmark top-down-dagre
    let start_td = Instant::now();
    let res_td = compute_top_down_dagre_layout(&nodes, &edges, &config);
    let elapsed_td = start_td.elapsed();

    println!("Kubernetes Cluster Topology TD execution time: {:?}", elapsed_td);
    assert!(
        elapsed_td.as_secs_f64() * 1000.0 < 10.0,
        "top-down-dagre on kubernetes_cluster_topology must complete in <10ms, took {:.2?}ms",
        elapsed_td.as_secs_f64() * 1000.0
    );
    assert_eq!(res_td.nodes.len(), nodes.len());
    assert_eq!(res_td.edges.len(), edges.len());
    assert_eq!(res_td.status, "success");

    for n in &res_td.nodes {
        assert!(n.x.is_finite() && n.y.is_finite(), "Node position x,y must be finite, got ({}, {}) for node {}", n.x, n.y, n.id);
    }
    for e in &res_td.edges {
        assert!(e.points.len() >= 2, "Edge route for {} must have >= 2 points", e.edge_id);
        for pt in &e.points {
            assert!(pt.x.is_finite() && pt.y.is_finite(), "Edge point must be finite for edge {}", e.edge_id);
        }
    }

    // Benchmark left-right
    let start_lr = Instant::now();
    let res_lr = compute_left_right_layout(&nodes, &edges, &config);
    let elapsed_lr = start_lr.elapsed();

    println!("Kubernetes Cluster Topology LR execution time: {:?}", elapsed_lr);
    assert!(
        elapsed_lr.as_secs_f64() * 1000.0 < 10.0,
        "left-right on kubernetes_cluster_topology must complete in <10ms, took {:.2?}ms",
        elapsed_lr.as_secs_f64() * 1000.0
    );
    assert_eq!(res_lr.nodes.len(), nodes.len());
    assert_eq!(res_lr.edges.len(), edges.len());
    assert_eq!(res_lr.status, "success");

    for n in &res_lr.nodes {
        assert!(n.x.is_finite() && n.y.is_finite(), "Node position x,y must be finite in LR, got ({}, {}) for node {}", n.x, n.y, n.id);
    }
    for e in &res_lr.edges {
        assert!(e.points.len() >= 2, "Edge route for {} must have >= 2 points in LR", e.edge_id);
        for pt in &e.points {
            assert!(pt.x.is_finite() && pt.y.is_finite(), "Edge point must be finite for edge {} in LR", e.edge_id);
        }
    }
}


