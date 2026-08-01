use std::collections::HashMap;
use crate::config::CustomLayoutConfig;
use crate::edge_routing::bounded_astar::{
    encode_state_key_num, search_orthogonal_route, RouteSearchOptions,
};
use crate::edge_routing::routing_grid::build_routing_grid;
use crate::types::{Point, PortRef, Rect, Side};

#[test]
fn test_state_key_encoding_uniqueness() {
    let key1 = encode_state_key_num(10, 1, 2, false);
    let key2 = encode_state_key_num(10, 1, 2, true);
    let key3 = encode_state_key_num(10, 2, 2, false);
    assert_ne!(key1, key2);
    assert_ne!(key1, key3);
}

#[test]
fn test_bounded_astar_straight_line() {
    let config = CustomLayoutConfig::default();
    let src_port = PortRef {
        node_id: "N1".to_string(),
        side: Side::Bottom,
        index: 0,
        point: Point { x: 100.0, y: 100.0 },
        stub: Point { x: 100.0, y: 120.0 },
    };
    let tgt_port = PortRef {
        node_id: "N2".to_string(),
        side: Side::Top,
        index: 0,
        point: Point { x: 100.0, y: 300.0 },
        stub: Point { x: 100.0, y: 280.0 },
    };

    let bounding_box = Rect {
        x: 0.0,
        y: 0.0,
        width: 400.0,
        height: 400.0,
    };
    let grid = build_routing_grid(
        &[],
        &HashMap::new(),
        &[src_port.clone(), tgt_port.clone()],
        &bounding_box,
        &config,
        1,
    );

    let route = search_orthogonal_route(
        "e_test",
        &src_port,
        &tgt_port,
        &grid,
        &[],
        &config,
        &RouteSearchOptions::default(),
    );

    assert!(route.is_some());
    let r = route.unwrap();
    assert_eq!(r.points.first().unwrap().x, 100.0);
    assert_eq!(r.points.last().unwrap().x, 100.0);
}
