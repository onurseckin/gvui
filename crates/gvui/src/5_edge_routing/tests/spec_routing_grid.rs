use std::collections::HashMap;
use crate::config::CustomLayoutConfig;
use crate::edge_routing::routing_grid::{build_routing_grid, vertex_key};
use crate::types::{NormalizedNode, Point, PortRef, Rect, Side};

#[test]
fn test_routing_grid_construction() {
    let nodes = vec![
        NormalizedNode {
            id: "A".to_string(),
            label: Some("A".to_string()),
            width: 100.0,
            height: 50.0,
        },
        NormalizedNode {
            id: "B".to_string(),
            label: Some("B".to_string()),
            width: 100.0,
            height: 50.0,
        },
    ];

    let mut node_positions = HashMap::new();
    node_positions.insert("A".to_string(), Point { x: 100.0, y: 0.0 });
    node_positions.insert("B".to_string(), Point { x: 100.0, y: 200.0 });

    let ports = vec![
        PortRef {
            node_id: "A".to_string(),
            side: Side::Bottom,
            index: 0,
            point: Point { x: 150.0, y: 50.0 },
            stub: Point { x: 150.0, y: 70.0 },
        },
        PortRef {
            node_id: "B".to_string(),
            side: Side::Top,
            index: 0,
            point: Point { x: 150.0, y: 200.0 },
            stub: Point { x: 150.0, y: 180.0 },
        },
    ];

    let bounding_box = Rect {
        x: 0.0,
        y: 0.0,
        width: 300.0,
        height: 300.0,
    };
    let config = CustomLayoutConfig::default();

    let grid = build_routing_grid(&nodes, &node_positions, &ports, &bounding_box, &config, 1);

    assert!(!grid.vertices.is_empty());
    assert!(!grid.edges.is_empty());

    let stub1_key = vertex_key(&Point { x: 150.0, y: 70.0 });
    let stub2_key = vertex_key(&Point { x: 150.0, y: 180.0 });
    assert!(grid.vertices.contains_key(&stub1_key));
    assert!(grid.vertices.contains_key(&stub2_key));
}

#[test]
fn test_routing_grid_obstacle_exclusion() {
    let config = CustomLayoutConfig::default();

    let nodes = vec![
        NormalizedNode {
            id: "A".to_string(),
            label: Some("A".to_string()),
            width: 100.0,
            height: 30.0,
        },
        NormalizedNode {
            id: "B".to_string(),
            label: Some("B".to_string()),
            width: 100.0,
            height: 50.0,
        },
    ];

    let mut node_positions = HashMap::new();
    node_positions.insert("A".to_string(), Point { x: 100.0, y: 0.0 });
    node_positions.insert("B".to_string(), Point { x: 100.0, y: 60.0 });

    let ports = vec![PortRef {
        node_id: "A".to_string(),
        side: Side::Bottom,
        index: 0,
        point: Point { x: 150.0, y: 30.0 },
        stub: Point { x: 150.0, y: 70.0 },
    }];

    let bounding_box = Rect {
        x: 0.0,
        y: 0.0,
        width: 300.0,
        height: 300.0,
    };
    let grid = build_routing_grid(&nodes, &node_positions, &ports, &bounding_box, &config, 1);

    let stub_key = vertex_key(&Point { x: 150.0, y: 70.0 });
    assert!(!grid.vertices.contains_key(&stub_key));
}
