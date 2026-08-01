use crate::config::CustomLayoutConfig;
use crate::validation::layout_validator::validate_custom_layout;
use crate::types::{PositionedNode, Point, PortRef, RoutedPath, Side};

#[test]
fn test_layout_validator_valid_layout() {
    let config = CustomLayoutConfig::default();

    let nodes = vec![
        PositionedNode {
            id: "N1".to_string(),
            label: Some("Node 1".to_string()),
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 50.0,
            rank: 0,
            order: 0,
        },
        PositionedNode {
            id: "N2".to_string(),
            label: Some("Node 2".to_string()),
            x: 0.0,
            y: 200.0,
            width: 100.0,
            height: 50.0,
            rank: 1,
            order: 0,
        },
    ];

    let edges = vec![RoutedPath {
        edge_id: "e1".to_string(),
        points: vec![
            Point { x: 50.0, y: 50.0 },
            Point { x: 50.0, y: 200.0 },
        ],
        source_port: PortRef {
            node_id: "N1".to_string(),
            side: Side::Bottom,
            index: 0,
            point: Point { x: 50.0, y: 50.0 },
            stub: Point { x: 50.0, y: 70.0 },
        },
        target_port: PortRef {
            node_id: "N2".to_string(),
            side: Side::Top,
            index: 0,
            point: Point { x: 50.0, y: 200.0 },
            stub: Point { x: 50.0, y: 180.0 },
        },
    }];

    let val_res = validate_custom_layout(&nodes, &edges, &[], None, None, &config);
    assert!(val_res.is_valid);
    assert_eq!(val_res.metrics.node_node_overlaps, 0);
    assert_eq!(val_res.metrics.edge_node_penetrations, 0);
}

#[test]
fn test_layout_validator_detects_node_overlap() {
    let config = CustomLayoutConfig::default();

    let nodes = vec![
        PositionedNode {
            id: "N1".to_string(),
            label: Some("Node 1".to_string()),
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 50.0,
            rank: 0,
            order: 0,
        },
        PositionedNode {
            id: "N2".to_string(),
            label: Some("Node 2".to_string()),
            x: 20.0,
            y: 20.0,
            width: 100.0,
            height: 50.0,
            rank: 1,
            order: 0,
        },
    ];

    let val_res = validate_custom_layout(&nodes, &[], &[], None, None, &config);
    assert!(!val_res.is_valid);
    assert_eq!(val_res.metrics.node_node_overlaps, 1);
}
