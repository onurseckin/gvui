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

#[test]
fn test_obstacle_clearance_alters_routing_grid_and_edge_routes() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let json_path = std::path::Path::new(&manifest_dir).join("../../public/data/graphs/kubernetes_cluster_topology.json");
    let json_str = std::fs::read_to_string(&json_path).expect("Failed to read kubernetes_cluster_topology.json");

    #[derive(serde::Deserialize)]
    struct RawBadge {
        #[allow(dead_code)]
        label: String,
        #[allow(dead_code)]
        variant: String,
    }
    #[derive(serde::Deserialize)]
    struct RawNode {
        id: String,
        name: String,
        #[allow(dead_code)]
        description: Option<String>,
        #[serde(default)]
        badges: Vec<RawBadge>,
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

    let graph: RawGraph = serde_json::from_str(&json_str).expect("Failed to parse JSON");

    let norm_nodes: Vec<NormalizedNode> = graph
        .nodes
        .iter()
        .map(|n| NormalizedNode {
            id: n.id.clone(),
            label: Some(n.name.clone()),
            width: 150.0,
            height: 60.0,
        })
        .collect();

    let norm_edges: Vec<crate::types::NormalizedEdge> = graph
        .edges
        .iter()
        .enumerate()
        .map(|(idx, e)| crate::types::NormalizedEdge {
            id: e.id.clone().unwrap_or_else(|| format!("e-{}-{}-{}", e.source, e.target, idx)),
            source: e.source.clone(),
            target: e.target.clone(),
            label: e.label.clone(),
            is_cycle: e.is_cycle,
            layout_role: None,
        })
        .collect();

    let mut config_default = CustomLayoutConfig::default();
    config_default.obstacle_clearance = 16.0;

    let mut config_modified = CustomLayoutConfig::default();
    config_modified.obstacle_clearance = 40.0;

    let mut node_positions = HashMap::new();
    for (i, node) in norm_nodes.iter().enumerate() {
        node_positions.insert(node.id.clone(), Point { x: (i as f64) * 200.0, y: (i as f64) * 150.0 });
    }

    let bounding_box = Rect { x: 0.0, y: 0.0, width: 2000.0, height: 2000.0 };
    let ports: Vec<PortRef> = Vec::new();

    let grid_default = build_routing_grid(&norm_nodes, &node_positions, &ports, &bounding_box, &config_default, 1);
    let grid_modified = build_routing_grid(&norm_nodes, &node_positions, &ports, &bounding_box, &config_modified, 1);

    assert_ne!(grid_default.obstacles, grid_modified.obstacles);
    for (obs_def, obs_mod) in grid_default.obstacles.iter().zip(grid_modified.obstacles.iter()) {
        assert!((obs_mod.width - obs_def.width - (40.0 - 16.0) * 2.0).abs() < 1e-5);
        assert!((obs_mod.height - obs_def.height - (40.0 - 16.0) * 2.0).abs() < 1e-5);
        assert!((obs_def.x - obs_mod.x - (40.0 - 16.0)).abs() < 1e-5);
        assert!((obs_def.y - obs_mod.y - (40.0 - 16.0)).abs() < 1e-5);
    }

    let positioned_nodes: Vec<crate::types::PositionedNode> = norm_nodes
        .iter()
        .map(|n| {
            let pos = node_positions.get(&n.id).unwrap();
            crate::types::PositionedNode {
                id: n.id.clone(),
                label: n.label.clone(),
                x: pos.x,
                y: pos.y,
                width: n.width,
                height: n.height,
                rank: 0,
                order: 0,
            }
        })
        .collect();

    let result_default = crate::step5_edge_routing::edge_router_facade::route_all_edges(
        &positioned_nodes,
        &norm_edges,
        None,
        &config_default,
        None,
    );

    let result_modified = crate::step5_edge_routing::edge_router_facade::route_all_edges(
        &positioned_nodes,
        &norm_edges,
        None,
        &config_modified,
        None,
    );

    assert!(!result_default.routes.is_empty());
    assert!(!result_modified.routes.is_empty());

    let points_differ = result_default.routes.iter().zip(result_modified.routes.iter()).any(|(r1, r2)| {
        r1.points != r2.points
    });
    assert!(points_differ, "Changing obstacleClearance from 16.0 to 40.0 must change edge routing polyline points");
}


#[test]
fn test_routing_grid_lane_spacing_coordinate_steps() {
    let nodes = vec![NormalizedNode {
        id: "A".to_string(),
        label: Some("A".to_string()),
        width: 100.0,
        height: 50.0,
    }];
    let mut node_positions = HashMap::new();
    node_positions.insert("A".to_string(), Point { x: 100.0, y: 100.0 });
    let ports = vec![];
    let bounding_box = Rect {
        x: 0.0,
        y: 0.0,
        width: 300.0,
        height: 300.0,
    };

    let mut config12 = CustomLayoutConfig::default();
    config12.lane_spacing = 12.0;
    let grid12 = build_routing_grid(&nodes, &node_positions, &ports, &bounding_box, &config12, 2);

    let mut config24 = CustomLayoutConfig::default();
    config24.lane_spacing = 24.0;
    let grid24 = build_routing_grid(&nodes, &node_positions, &ports, &bounding_box, &config24, 2);

    // Node A with clearance 16.0 occupies Rect { x: 84.0, y: 84.0, width: 132.0, height: 82.0 }.
    // obs.x = 84.0.
    // For lane_spacing 12.0, ring 1 x = 84.0 - 12.0 = 72.0. Ring 2 x = 84.0 - 24.0 = 60.0.
    // For lane_spacing 24.0, ring 1 x = 84.0 - 24.0 = 60.0. Ring 2 x = 84.0 - 48.0 = 36.0.
    let x_coords12: Vec<f64> = grid12.vertices.values().map(|p| p.x).collect();
    let x_coords24: Vec<f64> = grid24.vertices.values().map(|p| p.x).collect();

    assert!(x_coords12.iter().any(|&x| (x - 72.0).abs() < 1e-3));
    assert!(!x_coords12.iter().any(|&x| (x - 36.0).abs() < 1e-3));

    assert!(x_coords24.iter().any(|&x| (x - 36.0).abs() < 1e-3));
    assert!(!x_coords24.iter().any(|&x| (x - 72.0).abs() < 1e-3));
}

#[test]
fn test_kubernetes_cluster_topology_lane_spacing_impact() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let json_path = std::path::Path::new(&manifest_dir).join("../../public/data/graphs/kubernetes_cluster_topology.json");
    let json_str = std::fs::read_to_string(&json_path).expect("Failed to read json file");

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

    let graph: RawGraph = serde_json::from_str(&json_str).expect("Failed to parse JSON");

    let norm_nodes: Vec<crate::types::NormalizedNode> = graph
        .nodes
        .iter()
        .map(|n| crate::types::NormalizedNode {
            id: n.id.clone(),
            label: Some(n.name.clone()),
            width: 150.0,
            height: 60.0,
        })
        .collect();

    let norm_edges: Vec<crate::types::NormalizedEdge> = graph
        .edges
        .iter()
        .enumerate()
        .map(|(idx, e)| crate::types::NormalizedEdge {
            id: e.id.clone().unwrap_or_else(|| format!("e-{}-{}-{}", e.source, e.target, idx)),
            source: e.source.clone(),
            target: e.target.clone(),
            label: e.label.clone(),
            is_cycle: e.is_cycle,
            layout_role: None,
        })
        .collect();

    let mut node_positions = HashMap::new();
    for (i, node) in norm_nodes.iter().enumerate() {
        let col = (i % 4) as f64;
        let row = (i / 4) as f64;
        node_positions.insert(node.id.clone(), Point { x: col * 250.0, y: row * 150.0 });
    }

    let positioned_nodes: Vec<crate::types::PositionedNode> = norm_nodes
        .iter()
        .map(|n| {
            let pos = node_positions.get(&n.id).unwrap();
            crate::types::PositionedNode {
                id: n.id.clone(),
                label: n.label.clone(),
                x: pos.x,
                y: pos.y,
                width: n.width,
                height: n.height,
                rank: 0,
                order: 0,
            }
        })
        .collect();

    let mut config12 = CustomLayoutConfig::default();
    config12.lane_spacing = 12.0;
    let res12 = crate::step5_edge_routing::edge_router_facade::route_all_edges(
        &positioned_nodes,
        &norm_edges,
        None,
        &config12,
        None,
    );

    let mut config24 = CustomLayoutConfig::default();
    config24.lane_spacing = 24.0;
    let res24 = crate::step5_edge_routing::edge_router_facade::route_all_edges(
        &positioned_nodes,
        &norm_edges,
        None,
        &config24,
        None,
    );

    let routes12 = res12.routes;
    let routes24 = res24.routes;

    assert_eq!(routes12.len(), routes24.len());

    let mut point_differences = 0;
    for r12 in &routes12 {
        if let Some(r24) = routes24.iter().find(|r| r.edge_id == r12.edge_id) {
            if r12.points != r24.points {
                point_differences += 1;
            }
        }
    }

    assert!(
        point_differences > 0,
        "Expected at least one edge route to change when lane_spacing increases from 12.0 to 24.0, but 0 changed!"
    );
}

