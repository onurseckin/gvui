use std::collections::HashMap;
use crate::config::CustomLayoutConfig;
use crate::edge_routing::badge_placement::place_edge_badges;
use crate::types::{NormalizedEdge, Point, PortRef, PositionedNode, RoutedPath, Side};

#[test]
fn test_badge_placement_single_edge() {
    let config = CustomLayoutConfig::default();

    let nodes = vec![
        PositionedNode {
            id: "N1".to_string(),
            label: Some("Node 1".to_string()),
            x: 50.0,
            y: 50.0,
            width: 100.0,
            height: 50.0,
            rank: 0,
            order: 0,
        },
        PositionedNode {
            id: "N2".to_string(),
            label: Some("Node 2".to_string()),
            x: 50.0,
            y: 250.0,
            width: 100.0,
            height: 50.0,
            rank: 1,
            order: 0,
        },
    ];

    let edges = vec![NormalizedEdge {
        id: "e1".to_string(),
        source: "N1".to_string(),
        target: "N2".to_string(),
        label: Some("http".to_string()),
        is_cycle: Some(false),
        layout_role: None,
    }];

    let route = RoutedPath {
        edge_id: "e1".to_string(),
        points: vec![
            Point { x: 100.0, y: 100.0 },
            Point { x: 100.0, y: 250.0 },
        ],
        source_port: PortRef {
            node_id: "N1".to_string(),
            side: Side::Bottom,
            index: 0,
            point: Point { x: 100.0, y: 100.0 },
            stub: Point { x: 100.0, y: 120.0 },
        },
        target_port: PortRef {
            node_id: "N2".to_string(),
            side: Side::Top,
            index: 0,
            point: Point { x: 100.0, y: 250.0 },
            stub: Point { x: 100.0, y: 230.0 },
        },
    };

    let mut rank_map = HashMap::new();
    rank_map.insert("N1".to_string(), 0);
    rank_map.insert("N2".to_string(), 1);

    let res = place_edge_badges(&[route], &nodes, &edges, &rank_map, &config);
    assert_eq!(res.placements.len(), 1);
    assert_eq!(res.placements[0].edge_id, "e1");
    assert_eq!(res.placements[0].label, "http");
}
