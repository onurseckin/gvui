use crate::config::CustomLayoutConfig;
use crate::edge_routing::edge_router_facade::route_all_edges;
use crate::types::{NormalizedEdge, PositionedNode};

#[test]
fn test_edge_router_basic_dag() {
    let config = CustomLayoutConfig::default();

    let nodes = vec![
        PositionedNode {
            id: "A".to_string(),
            label: Some("Node A".to_string()),
            x: 100.0,
            y: 50.0,
            width: 120.0,
            height: 60.0,
            rank: 0,
            order: 0,
        },
        PositionedNode {
            id: "B".to_string(),
            label: Some("Node B".to_string()),
            x: 100.0,
            y: 250.0,
            width: 120.0,
            height: 60.0,
            rank: 1,
            order: 0,
        },
    ];

    let edges = vec![NormalizedEdge {
        id: "e1".to_string(),
        source: "A".to_string(),
        target: "B".to_string(),
        label: Some("connects".to_string()),
        is_cycle: Some(false),
        layout_role: None,
    }];

    let result = route_all_edges(&nodes, &edges, None, &config, None);
    assert_eq!(result.routes.len(), 1);
    assert_eq!(result.routes[0].edge_id, "e1");
    assert!(result.routes[0].points.len() >= 2);
}
