//! Specification tests for Step 5.5 Port Candidates.

use crate::config::CustomLayoutConfig;
use crate::edge_routing::port_candidates::{
    enumerate_port_alternatives, generate_port_candidates, get_side_center_and_stub,
    get_side_normal, project_remote_to_side_offset, NodeContext, PortSideAssignment,
};
use crate::types::{EdgeRole, NormalizedEdge, NormalizedNode, Point, Side};

#[test]
fn test_generate_16_port_candidates() {
    let config = CustomLayoutConfig::default();
    let src_node = NormalizedNode {
        id: "src".to_string(),
        label: None,
        width: 100.0,
        height: 50.0,
    };
    let tgt_node = NormalizedNode {
        id: "tgt".to_string(),
        label: None,
        width: 100.0,
        height: 50.0,
    };
    let src_pos = Point { x: 0.0, y: 0.0 };
    let tgt_pos = Point { x: 200.0, y: 0.0 };

    let edge = NormalizedEdge {
        id: "e1".to_string(),
        source: "src".to_string(),
        target: "tgt".to_string(),
        label: None,
        is_cycle: None,
        layout_role: None,
    };

    let src_ctx = NodeContext {
        node: &src_node,
        pos: &src_pos,
    };
    let tgt_ctx = NodeContext {
        node: &tgt_node,
        pos: &tgt_pos,
    };

    let candidates = generate_port_candidates(
        &edge,
        &src_ctx,
        &tgt_ctx,
        EdgeRole::Forward,
        &config,
        None,
        None,
    );

    // Expect 16 side pairs (4 src sides x 4 tgt sides)
    assert_eq!(candidates.len(), 16);

    // Verify all candidates have edge_id set correctly
    for cand in &candidates {
        assert_eq!(cand.edge_id, "e1");
        assert!(cand.base_cost > 0.0);
    }
}

#[test]
fn test_get_side_center_and_stub_directions() {
    let node_pos = Point { x: 100.0, y: 100.0 };
    let width = 80.0;
    let height = 40.0;
    let stub_len = 20.0;

    // Top
    let (pt_top, stub_top) = get_side_center_and_stub(&node_pos, width, height, Side::Top, stub_len);
    assert_eq!(pt_top, Point { x: 140.0, y: 100.0 });
    assert_eq!(stub_top, Point { x: 140.0, y: 80.0 });

    // Right
    let (pt_right, stub_right) = get_side_center_and_stub(&node_pos, width, height, Side::Right, stub_len);
    assert_eq!(pt_right, Point { x: 180.0, y: 120.0 });
    assert_eq!(stub_right, Point { x: 200.0, y: 120.0 });

    // Bottom
    let (pt_bot, stub_bot) = get_side_center_and_stub(&node_pos, width, height, Side::Bottom, stub_len);
    assert_eq!(pt_bot, Point { x: 140.0, y: 140.0 });
    assert_eq!(stub_bot, Point { x: 140.0, y: 160.0 });

    // Left
    let (pt_left, stub_left) = get_side_center_and_stub(&node_pos, width, height, Side::Left, stub_len);
    assert_eq!(pt_left, Point { x: 100.0, y: 120.0 });
    assert_eq!(stub_left, Point { x: 80.0, y: 120.0 });
}

#[test]
fn test_side_normals() {
    assert_eq!(get_side_normal(Side::Top), Point { x: 0.0, y: -1.0 });
    assert_eq!(get_side_normal(Side::Right), Point { x: 1.0, y: 0.0 });
    assert_eq!(get_side_normal(Side::Bottom), Point { x: 0.0, y: 1.0 });
    assert_eq!(get_side_normal(Side::Left), Point { x: -1.0, y: 0.0 });
}

#[test]
fn test_project_remote_to_side_offset() {
    let node = NormalizedNode {
        id: "n1".to_string(),
        label: None,
        width: 100.0,
        height: 60.0,
    };
    let node_pos = Point { x: 50.0, y: 50.0 };
    let remote_top_right = Point { x: 200.0, y: 0.0 };

    let offset_top = project_remote_to_side_offset(
        &node,
        &node_pos,
        Side::Top,
        &remote_top_right,
        1e-6,
    );
    assert!(offset_top > 0.0 && offset_top <= node.width);
}

#[test]
fn test_enumerate_port_alternatives() {
    let config = CustomLayoutConfig::default();
    let src_node = NormalizedNode { id: "s".into(), label: None, width: 50.0, height: 50.0 };
    let tgt_node = NormalizedNode { id: "t".into(), label: None, width: 50.0, height: 50.0 };
    let src_pos = Point { x: 0.0, y: 0.0 };
    let tgt_pos = Point { x: 100.0, y: 0.0 };
    let edge = NormalizedEdge { id: "e".into(), source: "s".into(), target: "t".into(), label: None, is_cycle: None, layout_role: None };

    let cands = generate_port_candidates(
        &edge,
        &NodeContext { node: &src_node, pos: &src_pos },
        &NodeContext { node: &tgt_node, pos: &tgt_pos },
        EdgeRole::Forward,
        &config,
        None,
        None,
    );

    let current = PortSideAssignment {
        src_side: Side::Right,
        tgt_side: Side::Left,
    };

    let alts = enumerate_port_alternatives("e", &current, &cands, 3);
    assert!(alts.len() <= 3);
    for alt in &alts {
        assert!(alt.src_side != Side::Right || alt.tgt_side != Side::Left);
    }
}

#[test]
fn test_unpositioned_node_skips_phantom_obstacle() {
    let config = CustomLayoutConfig::default();
    let src_node = NormalizedNode { id: "s".into(), label: None, width: 50.0, height: 50.0 };
    let tgt_node = NormalizedNode { id: "t".into(), label: None, width: 50.0, height: 50.0 };
    let unpos_node = NormalizedNode { id: "unpos".into(), label: None, width: 100.0, height: 100.0 };

    let src_pos = Point { x: 0.0, y: 0.0 };
    let tgt_pos = Point { x: 200.0, y: 0.0 };

    let edge = NormalizedEdge { id: "e".into(), source: "s".into(), target: "t".into(), label: None, is_cycle: None, layout_role: None };

    // Positions map does NOT contain "unpos"
    let mut positions = std::collections::HashMap::new();
    positions.insert("s".to_string(), src_pos);
    positions.insert("t".to_string(), tgt_pos);

    let all_nodes = vec![src_node.clone(), tgt_node.clone(), unpos_node];

    let cands = generate_port_candidates(
        &edge,
        &NodeContext { node: &src_node, pos: &src_pos },
        &NodeContext { node: &tgt_node, pos: &tgt_pos },
        EdgeRole::Forward,
        &config,
        Some(&all_nodes),
        Some(&positions),
    );

    // Should generate all 16 valid candidates without phantom leg conflicts at (0,0)
    assert_eq!(cands.len(), 16);
}

#[test]
fn test_direction_penalty_alters_port_candidate_costs() {
    let mut config_low = CustomLayoutConfig::default();
    config_low.direction_penalty = 0.0;

    let mut config_high = CustomLayoutConfig::default();
    config_high.direction_penalty = 2000.0;

    let src_node = NormalizedNode { id: "s".into(), label: None, width: 50.0, height: 50.0 };
    let tgt_node = NormalizedNode { id: "t".into(), label: None, width: 50.0, height: 50.0 };
    let src_pos = Point { x: 0.0, y: 0.0 };
    let tgt_pos = Point { x: 200.0, y: 0.0 };
    let edge = NormalizedEdge { id: "e".into(), source: "s".into(), target: "t".into(), label: None, is_cycle: None, layout_role: None };

    let cands_low = generate_port_candidates(
        &edge,
        &NodeContext { node: &src_node, pos: &src_pos },
        &NodeContext { node: &tgt_node, pos: &tgt_pos },
        EdgeRole::Forward,
        &config_low,
        None,
        None,
    );

    let cands_high = generate_port_candidates(
        &edge,
        &NodeContext { node: &src_node, pos: &src_pos },
        &NodeContext { node: &tgt_node, pos: &tgt_pos },
        EdgeRole::Forward,
        &config_high,
        None,
        None,
    );

    assert_eq!(cands_low.len(), cands_high.len());

    let misaligned_low = cands_low.iter().find(|c| c.src_side == Side::Top && c.tgt_side == Side::Top).unwrap();
    let misaligned_high = cands_high.iter().find(|c| c.src_side == Side::Top && c.tgt_side == Side::Top).unwrap();

    assert!(misaligned_high.base_cost > misaligned_low.base_cost + 1000.0);

    let aligned_low = cands_low.iter().find(|c| c.src_side == Side::Right && c.tgt_side == Side::Left).unwrap();
    let aligned_high = cands_high.iter().find(|c| c.src_side == Side::Right && c.tgt_side == Side::Left).unwrap();

    assert!((aligned_high.base_cost - aligned_low.base_cost).abs() < 1e-6);
}

