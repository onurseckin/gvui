//! Specification tests for Step 5.6 Port Side Assignment & Distribution.

use std::collections::HashMap;
use crate::config::CustomLayoutConfig;
use crate::edge_routing::port_assignment::{
    assign_port_sides_globally, distribute_ports,
};
use crate::edge_routing::port_candidates::{
    generate_port_candidates, NodeContext, PortCandidate,
};
use crate::types::{EdgeRole, NormalizedEdge, NormalizedNode, Point, Side};

#[test]
fn test_port_side_assignment_and_distribution() {
    let config = CustomLayoutConfig::default();

    let n1 = NormalizedNode { id: "n1".into(), label: None, width: 100.0, height: 60.0 };
    let n2 = NormalizedNode { id: "n2".into(), label: None, width: 100.0, height: 60.0 };
    let n3 = NormalizedNode { id: "n3".into(), label: None, width: 100.0, height: 60.0 };

    let p1 = Point { x: 0.0, y: 0.0 };
    let p2 = Point { x: 200.0, y: 0.0 };
    let p3 = Point { x: 200.0, y: 150.0 };

    let e1 = NormalizedEdge { id: "e1".into(), source: "n1".into(), target: "n2".into(), label: None, is_cycle: None, layout_role: None };
    let e2 = NormalizedEdge { id: "e2".into(), source: "n1".into(), target: "n3".into(), label: None, is_cycle: None, layout_role: None };

    let edges = vec![e1.clone(), e2.clone()];
    let node_map: HashMap<String, NormalizedNode> = vec![
        ("n1".to_string(), n1.clone()),
        ("n2".to_string(), n2.clone()),
        ("n3".to_string(), n3.clone()),
    ].into_iter().collect();

    let node_positions: HashMap<String, Point> = vec![
        ("n1".to_string(), p1),
        ("n2".to_string(), p2),
        ("n3".to_string(), p3),
    ].into_iter().collect();

    let mut candidates_map: HashMap<String, Vec<PortCandidate>> = HashMap::new();

    let cands_e1 = generate_port_candidates(
        &e1,
        &NodeContext { node: &n1, pos: &p1 },
        &NodeContext { node: &n2, pos: &p2 },
        EdgeRole::Forward,
        &config,
        None,
        None,
    );
    candidates_map.insert("e1".to_string(), cands_e1);

    let cands_e2 = generate_port_candidates(
        &e2,
        &NodeContext { node: &n1, pos: &p1 },
        &NodeContext { node: &n3, pos: &p3 },
        EdgeRole::Forward,
        &config,
        None,
        None,
    );
    candidates_map.insert("e2".to_string(), cands_e2);

    let assignment_res = assign_port_sides_globally(&edges, &candidates_map, &config, None);
    assert_eq!(assignment_res.assignments.len(), 2);

    let dist_res = distribute_ports(
        &edges,
        &assignment_res.assignments_by_edge,
        &node_map,
        &node_positions,
        &config,
        None,
    );

    assert_eq!(dist_res.ports_by_edge.len(), 2);

    // Verify stub direction alignment for both edges
    for (_edge_id, edge_ports) in &dist_res.ports_by_edge {
        let sp = &edge_ports.source_port;
        let tp = &edge_ports.target_port;

        // Verify source stub direction matches source side
        match sp.side {
            Side::Top => {
                assert!((sp.stub.x - sp.point.x).abs() < config.epsilon);
                assert!((sp.stub.y - (sp.point.y - config.port_stub_length)).abs() < config.epsilon);
            }
            Side::Bottom => {
                assert!((sp.stub.x - sp.point.x).abs() < config.epsilon);
                assert!((sp.stub.y - (sp.point.y + config.port_stub_length)).abs() < config.epsilon);
            }
            Side::Left => {
                assert!((sp.stub.y - sp.point.y).abs() < config.epsilon);
                assert!((sp.stub.x - (sp.point.x - config.port_stub_length)).abs() < config.epsilon);
            }
            Side::Right => {
                assert!((sp.stub.y - sp.point.y).abs() < config.epsilon);
                assert!((sp.stub.x - (sp.point.x + config.port_stub_length)).abs() < config.epsilon);
            }
        }

        // Verify target stub direction matches target side
        match tp.side {
            Side::Top => {
                assert!((tp.stub.x - tp.point.x).abs() < config.epsilon);
                assert!((tp.stub.y - (tp.point.y - config.port_stub_length)).abs() < config.epsilon);
            }
            Side::Bottom => {
                assert!((tp.stub.x - tp.point.x).abs() < config.epsilon);
                assert!((tp.stub.y - (tp.point.y + config.port_stub_length)).abs() < config.epsilon);
            }
            Side::Left => {
                assert!((tp.stub.y - tp.point.y).abs() < config.epsilon);
                assert!((tp.stub.x - (tp.point.x - config.port_stub_length)).abs() < config.epsilon);
            }
            Side::Right => {
                assert!((tp.stub.y - tp.point.y).abs() < config.epsilon);
                assert!((tp.stub.x - (tp.point.x + config.port_stub_length)).abs() < config.epsilon);
            }
        }
    }
}

#[test]
fn test_side_reuse_penalty_port_distribution() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let json_path = std::path::Path::new(&manifest_dir).join("../../public/data/graphs/kubernetes_cluster_topology.json");
    let json_str = std::fs::read_to_string(json_path).expect("Failed to read json file");

    #[allow(dead_code)]
    #[derive(serde::Deserialize)]
    struct RawBadge {
        label: String,
    }
    #[allow(dead_code)]
    #[derive(serde::Deserialize)]
    struct RawNode {
        id: String,
        name: String,
        description: Option<String>,
        #[serde(default)]
        badges: Vec<RawBadge>,
    }
    #[allow(dead_code)]
    #[derive(serde::Deserialize)]
    struct RawEdge {
        id: Option<String>,
        source: String,
        target: String,
        label: Option<String>,
        #[serde(rename = "isCycle")]
        is_cycle: Option<bool>,
    }
    #[allow(dead_code)]
    #[derive(serde::Deserialize)]
    struct RawGraph {
        nodes: Vec<RawNode>,
        edges: Vec<RawEdge>,
    }

    let graph: RawGraph = serde_json::from_str(&json_str).unwrap();

    let norm_nodes: Vec<NormalizedNode> = graph
        .nodes
        .iter()
        .map(|n| {
            let title_width = (n.name.len() as f64) * 11.0 + 90.0;
            let width = 120.0f64.max(title_width).ceil();
            let height = 60.0;
            NormalizedNode {
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

    let node_map: HashMap<String, NormalizedNode> = norm_nodes
        .iter()
        .map(|n| (n.id.clone(), n.clone()))
        .collect();

    // Assign dummy positions for nodes to evaluate port candidate generation
    let mut node_positions: HashMap<String, Point> = HashMap::new();
    for (idx, node) in norm_nodes.iter().enumerate() {
        let col = (idx % 5) as f64;
        let row = (idx / 5) as f64;
        node_positions.insert(
            node.id.clone(),
            Point {
                x: col * 300.0,
                y: row * 200.0,
            },
        );
    }

    // Evaluate low penalty (0.0) vs high penalty (500.0)
    let mut config_low = CustomLayoutConfig::default();
    config_low.side_reuse_penalty = 0.0;

    let mut config_high = CustomLayoutConfig::default();
    config_high.side_reuse_penalty = 500.0;

    // Build candidates for all edges
    let mut candidates_map_low: HashMap<String, Vec<PortCandidate>> = HashMap::new();
    let mut candidates_map_high: HashMap<String, Vec<PortCandidate>> = HashMap::new();

    for edge in &norm_edges {
        let Some(src_node) = node_map.get(&edge.source) else { continue; };
        let Some(tgt_node) = node_map.get(&edge.target) else { continue; };
        let Some(src_pos) = node_positions.get(&edge.source) else { continue; };
        let Some(tgt_pos) = node_positions.get(&edge.target) else { continue; };

        let cands_low = generate_port_candidates(
            edge,
            &NodeContext { node: src_node, pos: src_pos },
            &NodeContext { node: tgt_node, pos: tgt_pos },
            EdgeRole::Forward,
            &config_low,
            None,
            None,
        );
        candidates_map_low.insert(edge.id.clone(), cands_low);

        let cands_high = generate_port_candidates(
            edge,
            &NodeContext { node: src_node, pos: src_pos },
            &NodeContext { node: tgt_node, pos: tgt_pos },
            EdgeRole::Forward,
            &config_high,
            None,
            None,
        );
        candidates_map_high.insert(edge.id.clone(), cands_high);
    }

    let res_low = assign_port_sides_globally(&norm_edges, &candidates_map_low, &config_low, None);
    let res_high = assign_port_sides_globally(&norm_edges, &candidates_map_high, &config_high, None);

    // Count how many node side keys are active (have >= 1 port assigned) in low vs high
    let active_sides_low = res_low.side_use_map.values().filter(|&&v| v > 0).count();
    let active_sides_high = res_high.side_use_map.values().filter(|&&v| v > 0).count();

    // Calculate maximum reuse count on any single side
    let max_reuse_low = res_low.side_use_map.values().copied().max().unwrap_or(0);
    let max_reuse_high = res_high.side_use_map.values().copied().max().unwrap_or(0);

    println!(
        "sideReusePenalty: 0.0 -> Active Sides: {}, Max Reuse on Single Side: {}",
        active_sides_low, max_reuse_low
    );
    println!(
        "sideReusePenalty: 500.0 -> Active Sides: {}, Max Reuse on Single Side: {}",
        active_sides_high, max_reuse_high
    );

    // High sideReusePenalty must spread ports across more distinct node sides
    // and lower the max concentration of ports on a single side.
    assert!(
        active_sides_high > active_sides_low,
        "High sideReusePenalty (500.0) should activate more sides ({}) than low (0.0) ({})",
        active_sides_high, active_sides_low
    );
    assert!(
        max_reuse_high < max_reuse_low,
        "High sideReusePenalty (500.0) should lower max side reuse ({}) compared to low (0.0) ({})",
        max_reuse_high, max_reuse_low
    );
}

