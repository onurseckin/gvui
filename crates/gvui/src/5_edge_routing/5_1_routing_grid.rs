//! Step 5.1: Discretization of Coordinate Space & Routing Grid Construction.
//!
//! This module discretizes the continuous 2D layout plane into an orthogonal routing grid.
//! Coordinate values are quantized using 1/1000th unit precision to avoid floating-point drift
//! when comparing grid node keys. Obstacles (node bounding boxes) are expanded by clearance gaps,
//! and lane rings are synthesized around obstacles and graph envelopes to provide candidate
//! channels for orthogonal pathfinding.

use std::collections::{HashMap, HashSet};
use crate::config::CustomLayoutConfig;
use crate::geometry::{expand_rect, point_in_rect_interior, point_on_rect_boundary, segment_intersects_rect_interior};
use crate::types::{NormalizedNode, Point, PortRef, Rect, Segment};

/// Represents an edge segment within the orthogonal routing grid graph.
#[derive(Debug, Clone)]
pub struct GridEdge {
    /// Unique identifier for the grid edge (e.g. `ge__x1,y1__x2,y2`).
    pub id: String,
    /// Source vertex string key.
    pub u: String,
    /// Destination vertex string key.
    pub v: String,
    /// Geometric line segment representing this edge.
    pub segment: Segment,
    /// Manhattan length weight of the edge.
    pub weight: f64,
    /// Flag indicating if the segment lies adjacent to an obstacle boundary (penalized during A*).
    pub near_obstacle: bool,
}

/// Represents an expanded node rectangle serving as a routing obstacle.
#[derive(Debug, Clone)]
pub struct NodeObstacle {
    pub node_id: String,
    pub rect: Rect,
}

/// Represents an entry in the routing grid's adjacency list.
#[derive(Debug, Clone)]
pub struct AdjEdge {
    pub target_id: String,
    pub edge: GridEdge,
}

/// Structure representing the discretized routing grid graph.
#[derive(Debug, Clone)]
pub struct RoutingGrid {
    /// Lookup table mapping vertex string keys to 2D coordinates.
    pub vertices: HashMap<String, Point>,
    /// Pre-indexed vertex positions mapping string key to numeric index.
    pub vertex_index_map: HashMap<String, usize>,
    /// Flattened list of all grid edges.
    pub edges: Vec<GridEdge>,
    /// Adjacency mapping from vertex key to connected edges.
    pub adj: HashMap<String, Vec<AdjEdge>>,
    /// List of expanded obstacle rectangles.
    pub obstacles: Vec<Rect>,
    /// Detailed node obstacles with node ID mapping.
    pub node_obstacles: Vec<NodeObstacle>,
}

/// Computes a canonical, quantized string key for a 2D point.
/// Coordinates are rounded to 3 decimal places (1/1000th unit precision)
/// to ensure robust hashmap key matching despite minor floating point rounding differences.
pub fn vertex_key(p: &Point) -> String {
    format!("{:.3},{:.3}", (p.x * 1000.0).round() / 1000.0, (p.y * 1000.0).round() / 1000.0)
}

/// Constructs the orthogonal routing grid over the layout domain.
///
/// Steps:
/// 1. Expands node bounding boxes by `obstacle_clearance` to create obstacle corridors.
/// 2. Collects X and Y coordinates from port endpoints, port stubs, obstacle bounds,
///    lane rings (concentric channels surrounding nodes), and graph bounding box corridors.
/// 3. Quantizes coordinates into 64-bit integer sets to deduplicate near-identical grid lines.
/// 4. Generates grid vertices at the intersection of X and Y grid lines, filtering out
///    points located strictly inside node obstacle interiors (unless associated with a port endpoint).
/// 5. Connects adjacent horizontal and vertical grid vertices, discarding edges that cross
///    unrelated node obstacle interiors.
pub fn build_routing_grid(
    nodes: &[NormalizedNode],
    node_positions: &HashMap<String, Point>,
    ports: &[PortRef],
    bounding_box: &Rect,
    config: &CustomLayoutConfig,
    lane_rings: usize,
) -> RoutingGrid {
    let node_obstacles: Vec<NodeObstacle> = nodes
        .iter()
        .map(|n| {
            let pos = node_positions.get(&n.id).cloned().unwrap_or(Point { x: 0.0, y: 0.0 });
            NodeObstacle {
                node_id: n.id.clone(),
                rect: expand_rect(
                    &Rect {
                        x: pos.x,
                        y: pos.y,
                        width: n.width,
                        height: n.height,
                    },
                    config.obstacle_clearance,
                ),
            }
        })
        .collect();

    let obstacles: Vec<Rect> = node_obstacles.iter().map(|no| no.rect).collect();

    let mut x_set: HashSet<i64> = HashSet::new();
    let mut y_set: HashSet<i64> = HashSet::new();

    let mut add_x = |x: f64| {
        x_set.insert((x * 1000.0).round() as i64);
    };
    let mut add_y = |y: f64| {
        y_set.insert((y * 1000.0).round() as i64);
    };

    // 1. Add port and stub coordinates
    for p in ports {
        add_x(p.point.x);
        add_y(p.point.y);
        add_x(p.stub.x);
        add_y(p.stub.y);
    }

    // 2. Add obstacle bounds & lane rings
    for obs in &obstacles {
        add_x(obs.x);
        add_x(obs.x + obs.width);
        add_y(obs.y);
        add_y(obs.y + obs.height);

        for r in 1..=lane_rings {
            let offset = config.lane_spacing * (r as f64);
            add_x(obs.x - offset);
            add_x(obs.x + obs.width + offset);
            add_y(obs.y - offset);
            add_y(obs.y + obs.height + offset);
        }
    }

    // 3. Add graph bounding box corridors
    let graph_obs = expand_rect(bounding_box, config.graph_padding);
    add_x(graph_obs.x);
    add_x(graph_obs.x + graph_obs.width);
    add_y(graph_obs.y);
    add_y(graph_obs.y + graph_obs.height);

    let mut x_coords: Vec<f64> = x_set.into_iter().map(|v| (v as f64) / 1000.0).collect();
    let mut y_coords: Vec<f64> = y_set.into_iter().map(|v| (v as f64) / 1000.0).collect();
    x_coords.sort_by(|a, b| a.partial_cmp(b).unwrap());
    y_coords.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let mut vertices: HashMap<String, Point> = HashMap::new();
    let mut port_stub_node_map: HashMap<String, HashSet<String>> = HashMap::new();

    for p in ports {
        let pt_key = vertex_key(&p.point);
        let st_key = vertex_key(&p.stub);

        port_stub_node_map.entry(pt_key).or_default().insert(p.node_id.clone());
        port_stub_node_map.entry(st_key).or_default().insert(p.node_id.clone());
    }

    // 4. Filter vertices not inside obstacle interiors
    for &x in &x_coords {
        for &y in &y_coords {
            let pt = Point { x, y };
            let key = vertex_key(&pt);
            let associated_node_ids = port_stub_node_map.get(&key);

            let mut is_blocked = false;
            for no in &node_obstacles {
                if let Some(ids) = associated_node_ids {
                    // Port points and stubs are only blocked if strictly inside an unexpanded node body
                    let raw_rect = Rect {
                        x: no.rect.x + config.obstacle_clearance,
                        y: no.rect.y + config.obstacle_clearance,
                        width: (no.rect.width - config.obstacle_clearance * 2.0).max(0.0),
                        height: (no.rect.height - config.obstacle_clearance * 2.0).max(0.0),
                    };
                    if point_in_rect_interior(&pt, &raw_rect, config.epsilon) && !ids.contains(&no.node_id) {
                        is_blocked = true;
                        break;
                    }
                } else if point_in_rect_interior(&pt, &no.rect, config.epsilon) {
                    is_blocked = true;
                    break;
                }
            }

            if !is_blocked {
                vertices.insert(key, pt);
            }
        }
    }

    let mut edges: Vec<GridEdge> = Vec::new();
    let mut adj: HashMap<String, Vec<AdjEdge>> = HashMap::new();

    for v_id in vertices.keys() {
        adj.insert(v_id.clone(), Vec::new());
    }

    let segment_intersects_unrelated_obstacle = |p1: &Point, p2: &Point, segment: &Segment| -> bool {
        let p1_node_ids = port_stub_node_map.get(&vertex_key(p1));
        let p2_node_ids = port_stub_node_map.get(&vertex_key(p2));

        for no in &node_obstacles {
            let raw_rect = Rect {
                x: no.rect.x + config.obstacle_clearance,
                y: no.rect.y + config.obstacle_clearance,
                width: (no.rect.width - config.obstacle_clearance * 2.0).max(0.0),
                height: (no.rect.height - config.obstacle_clearance * 2.0).max(0.0),
            };

            let p1_belongs = p1_node_ids.is_some_and(|ids| ids.contains(&no.node_id));
            let p2_belongs = p2_node_ids.is_some_and(|ids| ids.contains(&no.node_id));

            if p1_belongs || p2_belongs {
                if segment_intersects_rect_interior(segment, &raw_rect, config.epsilon) {
                    return true;
                }
            } else if segment_intersects_rect_interior(segment, &no.rect, config.epsilon) {
                return true;
            }
        }
        false
    };

    let mut add_grid_edge = |u_id: &str, v_id: &str, segment: Segment| {
        let weight = (segment.b.x - segment.a.x).abs() + (segment.b.y - segment.a.y).abs();
        let edge_id = format!("ge__{}__{}", u_id, v_id);
        let near_obstacle = obstacles.iter().any(|obs| {
            point_on_rect_boundary(&segment.a, obs, config.epsilon)
                || point_on_rect_boundary(&segment.b, obs, config.epsilon)
        });
        let grid_edge = GridEdge {
            id: edge_id,
            u: u_id.to_string(),
            v: v_id.to_string(),
            segment,
            weight,
            near_obstacle,
        };

        edges.push(grid_edge.clone());
        if let Some(vec) = adj.get_mut(u_id) {
            vec.push(AdjEdge {
                target_id: v_id.to_string(),
                edge: grid_edge.clone(),
            });
        }
        if let Some(vec) = adj.get_mut(v_id) {
            vec.push(AdjEdge {
                target_id: u_id.to_string(),
                edge: grid_edge,
            });
        }
    };

    // 5. Connect horizontal neighbors
    for &y in &y_coords {
        let row_vertices: Vec<Point> = x_coords
            .iter()
            .map(|&x| Point { x, y })
            .filter(|pt| vertices.contains_key(&vertex_key(pt)))
            .collect();

        for i in 0..row_vertices.len().saturating_sub(1) {
            let p1 = &row_vertices[i];
            let p2 = &row_vertices[i + 1];
            let segment = Segment {
                a: *p1,
                b: *p2,
            };

            if !segment_intersects_unrelated_obstacle(p1, p2, &segment) {
                add_grid_edge(&vertex_key(p1), &vertex_key(p2), segment);
            }
        }
    }

    // 6. Connect vertical neighbors
    for &x in &x_coords {
        let col_vertices: Vec<Point> = y_coords
            .iter()
            .map(|&y| Point { x, y })
            .filter(|pt| vertices.contains_key(&vertex_key(pt)))
            .collect();

        for i in 0..col_vertices.len().saturating_sub(1) {
            let p1 = &col_vertices[i];
            let p2 = &col_vertices[i + 1];
            let segment = Segment {
                a: *p1,
                b: *p2,
            };

            if !segment_intersects_unrelated_obstacle(p1, p2, &segment) {
                add_grid_edge(&vertex_key(p1), &vertex_key(p2), segment);
            }
        }
    }

    let mut vertex_index_map = HashMap::new();
    for (v_idx, v_id) in vertices.keys().enumerate() {
        vertex_index_map.insert(v_id.clone(), v_idx);
    }

    RoutingGrid {
        vertices,
        vertex_index_map,
        edges,
        adj,
        obstacles,
        node_obstacles,
    }
}
