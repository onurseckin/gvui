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
