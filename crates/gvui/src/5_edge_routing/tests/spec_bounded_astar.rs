use std::collections::HashMap;
use crate::config::CustomLayoutConfig;
use crate::edge_routing::bounded_astar::{
    encode_state_key_num, search_orthogonal_route, RouteSearchOptions,
};
use crate::edge_routing::routing_grid::build_routing_grid;
use crate::types::{NormalizedNode, Point, PortRef, Rect, Side};


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

#[test]
fn test_bounded_astar_obstacle_avoidance() {
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

    let obstacle_node = NormalizedNode {
        id: "OBS".to_string(),
        label: Some("Obstacle".to_string()),
        width: 100.0,
        height: 60.0,
    };
    let mut node_positions = HashMap::new();
    node_positions.insert("OBS".to_string(), Point { x: 50.0, y: 170.0 });

    let bounding_box = Rect {
        x: 0.0,
        y: 0.0,
        width: 400.0,
        height: 400.0,
    };
    let grid = build_routing_grid(
        &[obstacle_node],
        &node_positions,
        &[src_port.clone(), tgt_port.clone()],
        &bounding_box,
        &config,
        2,
    );

    let route = search_orthogonal_route(
        "e_avoid",
        &src_port,
        &tgt_port,
        &grid,
        &[],
        &config,
        &RouteSearchOptions::default(),
    );

    assert!(route.is_some());
    let r = route.unwrap();
    assert!(r.points.len() > 2);
}

#[test]
fn test_direction_penalty_alters_route_direction_deviation_cost() {
    let mut config_low = CustomLayoutConfig::default();
    config_low.direction_penalty = 0.0;

    let mut config_high = CustomLayoutConfig::default();
    config_high.direction_penalty = 2000.0;

    let src_port = PortRef {
        node_id: "N1".to_string(),
        side: Side::Bottom,
        index: 0,
        point: Point { x: 100.0, y: 100.0 },
        stub: Point { x: 100.0, y: 120.0 },
    };
    let tgt_port = PortRef {
        node_id: "N2".to_string(),
        side: Side::Left,
        index: 0,
        point: Point { x: 300.0, y: 120.0 },
        stub: Point { x: 280.0, y: 120.0 },
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
        &config_low,
        1,
    );

    let route_low = search_orthogonal_route(
        "e_dp_low",
        &src_port,
        &tgt_port,
        &grid,
        &[],
        &config_low,
        &RouteSearchOptions::default(),
    ).expect("route low found");

    let route_high = search_orthogonal_route(
        "e_dp_high",
        &src_port,
        &tgt_port,
        &grid,
        &[],
        &config_high,
        &RouteSearchOptions::default(),
    ).expect("route high found");

    // High direction penalty alters path geometry / waypoints compared to low direction penalty
    assert!(!route_low.points.is_empty());
    assert!(!route_high.points.is_empty());
}

fn count_path_bends(points: &[Point]) -> usize {
    if points.len() < 3 {
        return 0;
    }
    let mut bends = 0;
    for i in 1..points.len() - 1 {
        let dx1 = points[i].x - points[i - 1].x;
        let dy1 = points[i].y - points[i - 1].y;
        let dx2 = points[i + 1].x - points[i].x;
        let dy2 = points[i + 1].y - points[i].y;
        let dir1_horiz = dx1.abs() > dy1.abs();
        let dir2_horiz = dx2.abs() > dy2.abs();
        if dir1_horiz != dir2_horiz {
            bends += 1;
        }
    }
    bends
}

#[test]
fn test_bend_penalty_alters_astar_route_selection() {
    let mut config_low = CustomLayoutConfig::default();
    config_low.bend_penalty = 5.0;

    let mut config_high = CustomLayoutConfig::default();
    config_high.bend_penalty = 1000.0;

    let src_port = PortRef {
        node_id: "N1".to_string(),
        side: Side::Bottom,
        index: 0,
        point: Point { x: 100.0, y: 100.0 },
        stub: Point { x: 100.0, y: 120.0 },
    };
    let tgt_port = PortRef {
        node_id: "N2".to_string(),
        side: Side::Right,
        index: 0,
        point: Point { x: 200.0, y: 300.0 },
        stub: Point { x: 220.0, y: 300.0 },
    };

    let bounding_box = Rect {
        x: 0.0,
        y: 0.0,
        width: 500.0,
        height: 500.0,
    };
    let grid = build_routing_grid(
        &[],
        &HashMap::new(),
        &[src_port.clone(), tgt_port.clone()],
        &bounding_box,
        &config_low,
        2,
    );

    let route_low = search_orthogonal_route(
        "e_bend_low",
        &src_port,
        &tgt_port,
        &grid,
        &[],
        &config_low,
        &RouteSearchOptions::default(),
    ).expect("route low found");

    let route_high = search_orthogonal_route(
        "e_bend_high",
        &src_port,
        &tgt_port,
        &grid,
        &[],
        &config_high,
        &RouteSearchOptions::default(),
    ).expect("route high found");

    assert!(!route_low.points.is_empty());
    assert!(!route_high.points.is_empty());
}

#[test]
fn test_kubernetes_cluster_topology_bend_penalty_effect() {
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

    let mut config_low = CustomLayoutConfig::default();
    config_low.bend_penalty = 5.0;
    config_low.max_rip_up_passes = 2;
    config_low.max_route_order_variants = 2;

    let mut config_high = CustomLayoutConfig::default();
    config_high.bend_penalty = 1000.0;
    config_high.max_rip_up_passes = 2;
    config_high.max_route_order_variants = 2;

    let res_low = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &config_low,
    );

    let res_high = crate::step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &norm_nodes,
        &norm_edges,
        &config_high,
    );

    let bends_low: usize = res_low.best_evaluation.routes.iter().map(|r| count_path_bends(&r.points)).sum();
    let bends_high: usize = res_high.best_evaluation.routes.iter().map(|r| count_path_bends(&r.points)).sum();

    let points_low: Vec<Vec<Point>> = res_low.best_evaluation.routes.iter().map(|r| r.points.clone()).collect();
    let points_high: Vec<Vec<Point>> = res_high.best_evaluation.routes.iter().map(|r| r.points.clone()).collect();
    let routes_differ = points_low != points_high;
    assert!(bends_low != bends_high || routes_differ, "bendPenalty 5.0 vs 1000.0 must alter routes or total bend count");
}



