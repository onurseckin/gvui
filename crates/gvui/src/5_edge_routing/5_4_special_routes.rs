//! Step 5.4: Self-Loop & Grid Dogleg Fallback Pathfinding.
//!
//! This module handles special edge routing scenarios:
//! - `route_self_loop`: Routes self-referential edges around node corners (top to right side).
//! - `find_grid_dogleg_route`: Fallback pathfinder that generates simple 2-bend/3-bend orthogonal
//!   dogleg tracks when bounded A* search exhausts maximum iteration limits.
//! - `route_feedback_corridors`: Outer bounding-box corridor router for long back-edges / cycle edges.

use std::collections::HashMap;
use crate::config::CustomLayoutConfig;
use crate::edge_routing::bounded_astar::{
    get_segment_direction, search_orthogonal_route, side_to_inward_dir, side_to_outward_dir,
    RouteSearchOptions,
};
use crate::edge_routing::route_occupancy::{IndexedOccupancy, OccupancyRecord};
use crate::edge_routing::routing_grid::{build_routing_grid, RoutingGrid};
use crate::geometry::{
    is_orthogonal_segment, path_manhattan_length, segment_intersects_rect_interior,
    simplify_orthogonal_path,
};
use crate::types::{NormalizedEdge, NormalizedNode, Point, PortRef, Rect, RoutedPath, Segment, Side};

/// Simplifies an orthogonal path and snaps segment coordinates to ensure 100% strict orthogonality
/// and perpendicular entry/exit at source and target ports.
pub fn sanitize_orthogonal_path(
    raw_points: &[Point],
    source_port: &PortRef,
    target_port: &PortRef,
    epsilon: f64,
) -> Vec<Point> {
    if raw_points.is_empty() {
        return Vec::new();
    }
    if raw_points.len() == 1 {
        return vec![source_port.point];
    }

    let mut pts = raw_points.to_vec();

    // 1. Force exact start/end port positions
    pts[0] = source_port.point;
    let last = pts.len() - 1;
    pts[last] = target_port.point;

    let snap_tol = epsilon.max(0.05);
    let src_is_vert = matches!(source_port.side, Side::Top | Side::Bottom);
    let tgt_is_vert = matches!(target_port.side, Side::Top | Side::Bottom);

    // Snap target_port.point to source_port.point if near-equal along relevant axis
    if (pts[0].x - pts[last].x).abs() <= snap_tol && (src_is_vert || tgt_is_vert) {
        pts[last].x = pts[0].x;
    }
    if (pts[0].y - pts[last].y).abs() <= snap_tol && (!src_is_vert || !tgt_is_vert) {
        pts[last].y = pts[0].y;
    }

    // 2. Snap near-equal coordinates along adjacent segments to guarantee exact orthogonality
    for i in 0..pts.len() - 1 {
        if (pts[i].x - pts[i + 1].x).abs() <= snap_tol {
            pts[i + 1].x = pts[i].x;
        }
        if (pts[i].y - pts[i + 1].y).abs() <= snap_tol {
            pts[i + 1].y = pts[i].y;
        }
    }

    // 3. Force perpendicular departure from source port stub
    if pts.len() > 1 {
        if src_is_vert {
            pts[1].x = pts[0].x;
        } else {
            pts[1].y = pts[0].y;
        }
    }

    // 4. Force perpendicular arrival into target port stub
    if pts.len() > 2 {
        let n = pts.len();
        if tgt_is_vert {
            pts[n - 2].x = pts[n - 1].x;
        } else {
            pts[n - 2].y = pts[n - 1].y;
        }
    }

    // 5. Simplify collinear/duplicate points
    let mut simplified = simplify_orthogonal_path(&pts, epsilon);

    if simplified.is_empty() {
        return vec![source_port.point, target_port.point];
    }

    // Re-enforce exact start/end
    simplified[0] = source_port.point;
    let end_idx = simplified.len() - 1;
    simplified[end_idx] = target_port.point;
    if (simplified[0].x - simplified[end_idx].x).abs() <= snap_tol && (src_is_vert || tgt_is_vert) {
        simplified[end_idx].x = simplified[0].x;
    }
    if (simplified[0].y - simplified[end_idx].y).abs() <= snap_tol && (!src_is_vert || !tgt_is_vert) {
        simplified[end_idx].y = simplified[0].y;
    }

    // Handle 2-point paths
    if simplified.len() == 2 {
        let p0 = simplified[0];
        let p1 = simplified[1];
        let dx = (p0.x - p1.x).abs();
        let dy = (p0.y - p1.y).abs();

        if dx > epsilon && dy > epsilon {
            // Diagonal 2-point path! Must convert to 3 or 4 point orthogonal path.
            if src_is_vert && tgt_is_vert {
                let y_mid = (p0.y + p1.y) / 2.0;
                simplified = vec![
                    p0,
                    Point { x: p0.x, y: y_mid },
                    Point { x: p1.x, y: y_mid },
                    p1,
                ];
            } else if !src_is_vert && !tgt_is_vert {
                let x_mid = (p0.x + p1.x) / 2.0;
                simplified = vec![
                    p0,
                    Point { x: x_mid, y: p0.y },
                    Point { x: x_mid, y: p1.y },
                    p1,
                ];
            } else if src_is_vert && !tgt_is_vert {
                simplified = vec![
                    p0,
                    Point { x: p0.x, y: p1.y },
                    p1,
                ];
            } else {
                simplified = vec![
                    p0,
                    Point { x: p1.x, y: p0.y },
                    p1,
                ];
            }
        } else {
            // Straight 2-point path, ensure exact coordinate alignment
            if src_is_vert || tgt_is_vert {
                simplified[1].x = p0.x;
            } else {
                simplified[1].y = p0.y;
            }
        }
    } else if simplified.len() == 3 {
        let p0 = simplified[0];
        let p1 = simplified[1];
        let p2 = simplified[2];

        if src_is_vert && tgt_is_vert && (p0.x - p2.x).abs() > epsilon {
            // Conflict! 3-point path cannot have both endpoints vertical with different X coordinates.
            let y_mid = p1.y;
            simplified = vec![
                p0,
                Point { x: p0.x, y: y_mid },
                Point { x: p2.x, y: y_mid },
                p2,
            ];
        } else if !src_is_vert && !tgt_is_vert && (p0.y - p2.y).abs() > epsilon {
            // Conflict! 3-point path cannot have both endpoints horizontal with different Y coordinates.
            let x_mid = p1.x;
            simplified = vec![
                p0,
                Point { x: x_mid, y: p0.y },
                Point { x: x_mid, y: p2.y },
                p2,
            ];
        } else {
            if src_is_vert {
                simplified[1].x = p0.x;
            } else {
                simplified[1].y = p0.y;
            }
            if tgt_is_vert {
                simplified[1].x = p2.x;
            } else {
                simplified[1].y = p2.y;
            }
        }
    } else {
        // len >= 4
        let n = simplified.len();
        if src_is_vert {
            simplified[1].x = simplified[0].x;
        } else {
            simplified[1].y = simplified[0].y;
        }
        if tgt_is_vert {
            simplified[n - 2].x = simplified[n - 1].x;
        } else {
            simplified[n - 2].y = simplified[n - 1].y;
        }
    }

    simplify_orthogonal_path(&simplified, epsilon)
}


/// Routes a self-loop edge originating and terminating on the same node.
/// Loops depart from the Top side of the node and enter via the Right side around the top-right corner.
pub fn route_self_loop(
    edge: &NormalizedEdge,
    node: &NormalizedNode,
    node_pos: &Point,
    config: &CustomLayoutConfig,
    loop_index: usize,
) -> RoutedPath {
    let loop_offset = config.port_stub_length + (loop_index as f64) * config.lane_spacing;

    let source_port = PortRef {
        node_id: node.id.clone(),
        side: Side::Top,
        index: loop_index,
        point: Point {
            x: node_pos.x + node.width * 0.75,
            y: node_pos.y,
        },
        stub: Point {
            x: node_pos.x + node.width * 0.75,
            y: node_pos.y - loop_offset,
        },
    };

    let target_port = PortRef {
        node_id: node.id.clone(),
        side: Side::Right,
        index: loop_index,
        point: Point {
            x: node_pos.x + node.width,
            y: node_pos.y + node.height * 0.25,
        },
        stub: Point {
            x: node_pos.x + node.width + loop_offset,
            y: node_pos.y + node.height * 0.25,
        },
    };

    let corner_point = Point {
        x: target_port.stub.x,
        y: source_port.stub.y,
    };

    let raw_points = vec![
        source_port.point,
        source_port.stub,
        corner_point,
        target_port.stub,
        target_port.point,
    ];

    let points = sanitize_orthogonal_path(&raw_points, &source_port, &target_port, config.epsilon);

    RoutedPath {
        edge_id: edge.id.clone(),
        points,
        source_port,
        target_port,
    }
}

/// Helper function to build port references for feedback corridor routing.
fn get_port_ref(
    node: &NormalizedNode,
    node_pos: &Point,
    side: Side,
    index: usize,
    config: &CustomLayoutConfig,
) -> PortRef {
    let (point, stub) = match side {
        Side::Top => {
            let pt = Point {
                x: node_pos.x + node.width / 2.0,
                y: node_pos.y,
            };
            let st = Point {
                x: pt.x,
                y: pt.y - config.port_stub_length,
            };
            (pt, st)
        }
        Side::Bottom => {
            let pt = Point {
                x: node_pos.x + node.width / 2.0,
                y: node_pos.y + node.height,
            };
            let st = Point {
                x: pt.x,
                y: pt.y + config.port_stub_length,
            };
            (pt, st)
        }
        Side::Left => {
            let pt = Point {
                x: node_pos.x,
                y: node_pos.y + node.height / 2.0,
            };
            let st = Point {
                x: pt.x - config.port_stub_length,
                y: pt.y,
            };
            (pt, st)
        }
        Side::Right => {
            let pt = Point {
                x: node_pos.x + node.width,
                y: node_pos.y + node.height / 2.0,
            };
            let st = Point {
                x: pt.x + config.port_stub_length,
                y: pt.y,
            };
            (pt, st)
        }
    };

    PortRef {
        node_id: node.id.clone(),
        side,
        index,
        point,
        stub,
    }
}

/// Dogleg fallback pathfinder executed when A* search space exhausts iteration limits.
/// Evaluates horizontal-first and vertical-first 2-bend or 3-bend candidate track combinations.
pub fn find_grid_dogleg_route(
    edge_id: &str,
    source_port: &PortRef,
    target_port: &PortRef,
    grid: &RoutingGrid,
    occupancy: &[OccupancyRecord],
    config: &CustomLayoutConfig,
    options: &RouteSearchOptions,
) -> Option<RoutedPath> {
    let mut x_coords: Vec<f64> = grid.vertices.values().map(|pt| pt.x).collect();
    let mut y_coords: Vec<f64> = grid.vertices.values().map(|pt| pt.y).collect();
    x_coords.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    y_coords.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    x_coords.dedup_by(|a, b| (*a - *b).abs() <= config.epsilon);
    y_coords.dedup_by(|a, b| (*a - *b).abs() <= config.epsilon);

    let select_tracks = |coordinates: &[f64], src_coord: f64, tgt_coord: f64| -> Vec<f64> {
        let midpoint = (src_coord + tgt_coord) / 2.0;
        let mut sorted = coordinates.to_vec();
        sorted.sort_by(|&a, &b| {
            let diff_a = (a - midpoint).abs();
            let diff_b = (b - midpoint).abs();
            if (diff_a - diff_b).abs() > 1e-9 {
                diff_a.partial_cmp(&diff_b).unwrap()
            } else {
                a.partial_cmp(&b).unwrap()
            }
        });
        let nearest: Vec<f64> = sorted.into_iter().take(8).collect();

        let mut tracks: Vec<f64> = Vec::new();
        if !coordinates.is_empty() {
            tracks.push(coordinates[0]);
            tracks.push(coordinates[coordinates.len() - 1]);
        }
        tracks.push(src_coord);
        tracks.push(tgt_coord);
        tracks.extend(nearest);
        tracks.sort_by(|a, b| a.partial_cmp(b).unwrap());
        tracks.dedup_by(|a, b| (*a - *b).abs() <= 1e-9);
        tracks
    };

    let req_x = options.required_corridor_x;
    let mut candidate_x_tracks = Vec::new();
    if let Some(rx) = req_x {
        candidate_x_tracks.push(rx);
    }
    candidate_x_tracks.extend(select_tracks(&x_coords, source_port.stub.x, target_port.stub.x));
    candidate_x_tracks.sort_by(|a, b| a.partial_cmp(b).unwrap());
    candidate_x_tracks.dedup_by(|a, b| (*a - *b).abs() <= 1e-9);

    let candidate_y_tracks = select_tracks(&y_coords, source_port.stub.y, target_port.stub.y);
    let indexed_occupancy = IndexedOccupancy::new(occupancy, config.epsilon);

    let mut best_route: Option<(usize, usize, f64, RoutedPath)> = None;

    for allow_collinear in [false, true] {
        if best_route.is_some() {
            break;
        }

        for &x in &candidate_x_tracks {
            for &y in &candidate_y_tracks {
                let mut run_candidate = |pts: Vec<Point>| {
                    let simplified = sanitize_orthogonal_path(&pts, source_port, target_port, config.epsilon);
                    if simplified.len() < 2 {
                        return;
                    }

                    if get_segment_direction(&simplified[0], &simplified[1])
                        != side_to_outward_dir(source_port.side)
                        || get_segment_direction(
                            &simplified[simplified.len() - 2],
                            &simplified[simplified.len() - 1],
                        ) != side_to_inward_dir(target_port.side)
                    {
                        return;
                    }

                    if let Some(rx) = req_x {
                        if !simplified
                            .iter()
                            .any(|p| (p.x - rx).abs() <= config.epsilon)
                        {
                            return;
                        }
                    }

                    let mut total_crossings = 0;
                    let mut total_length = 0.0;

                    for index in 0..simplified.len() - 1 {
                        let segment = Segment {
                            a: simplified[index],
                            b: simplified[index + 1],
                        };
                        let is_source_endpoint_leg = index == 0;
                        let is_target_endpoint_leg = index == simplified.len() - 2;

                        if !is_orthogonal_segment(&segment, config.epsilon)
                            || grid.node_obstacles.iter().any(|no| {
                                segment_intersects_rect_interior(&segment, &no.rect, config.epsilon)
                                    && !(is_source_endpoint_leg && no.node_id == source_port.node_id)
                                    && !(is_target_endpoint_leg && no.node_id == target_port.node_id)
                            })
                            || options.forbidden_rects.iter().any(|rect| {
                                !is_source_endpoint_leg
                                    && !is_target_endpoint_leg
                                    && segment_intersects_rect_interior(&segment, rect, config.epsilon)
                            })
                        {
                            return;
                        }

                        let occ_result = indexed_occupancy.check_segment_conflict(&segment, edge_id);
                        if occ_result.is_collinear_occupied && !allow_collinear {
                            return;
                        }
                        if occ_result.is_collinear_occupied {
                            let seg_len = (segment.b.x - segment.a.x).abs() + (segment.b.y - segment.a.y).abs();
                            total_length += seg_len * 1000.0;
                        }
                        total_crossings += occ_result.step_crossings;
                        total_length += (segment.b.x - segment.a.x).abs() + (segment.b.y - segment.a.y).abs();
                    }

                    let bends = simplified.len().saturating_sub(2);
                    let cand_route = RoutedPath {
                        edge_id: edge_id.to_string(),
                        points: simplified,
                        source_port: source_port.clone(),
                        target_port: target_port.clone(),
                    };

                    let is_better = match &best_route {
                        None => true,
                        Some((best_cross, best_bends, best_len, _)) => {
                            if total_crossings != *best_cross {
                                total_crossings < *best_cross
                            } else if bends != *best_bends {
                                bends < *best_bends
                            } else {
                                total_length < *best_len
                            }
                        }
                    };

                    if is_better {
                        best_route = Some((total_crossings, bends, total_length, cand_route));
                    }
                };

                run_candidate(vec![
                    source_port.point,
                    source_port.stub,
                    Point {
                        x,
                        y: source_port.stub.y,
                    },
                    Point { x, y },
                    Point {
                        x: target_port.stub.x,
                        y,
                    },
                    target_port.stub,
                    target_port.point,
                ]);

                run_candidate(vec![
                    source_port.point,
                    source_port.stub,
                    Point {
                        x: source_port.stub.x,
                        y,
                    },
                    Point { x, y },
                    Point {
                        x,
                        y: target_port.stub.y,
                    },
                    target_port.stub,
                    target_port.point,
                ]);
            }
        }
    }

    best_route.map(|(_, _, _, route)| route)
}

/// Routes feedback back-edges through outer graph corridors when direct routes fail or cross nodes.
pub fn route_feedback_corridors(
    feedback_edges: &[NormalizedEdge],
    nodes: &[NormalizedNode],
    node_positions: &HashMap<String, Point>,
    bounding_box: &Rect,
    config: &CustomLayoutConfig,
    initial_occupancy: &[OccupancyRecord],
) -> Vec<RoutedPath> {
    let node_map: HashMap<String, (&NormalizedNode, &Point)> = nodes
        .iter()
        .filter_map(|n| node_positions.get(&n.id).map(|pos| (n.id.clone(), (n, pos))))
        .collect();

    let mut sorted_edges: Vec<&NormalizedEdge> = feedback_edges.iter().collect();
    sorted_edges.sort_by(|a, b| {
        let src_a = node_map.get(&a.source);
        let src_b = node_map.get(&b.source);
        let y_a = src_a.map_or(0.0, |(_, pos)| pos.y);
        let y_b = src_b.map_or(0.0, |(_, pos)| pos.y);
        if (y_b - y_a).abs() > config.epsilon {
            y_b.partial_cmp(&y_a).unwrap()
        } else {
            a.id.cmp(&b.id)
        }
    });

    let mut routes: Vec<RoutedPath> = Vec::new();
    let mut current_occupancy: Vec<OccupancyRecord> = initial_occupancy.to_vec();

    if nodes.is_empty() {
        return routes;
    }

    let min_node_x = nodes
        .iter()
        .map(|n| node_positions.get(&n.id).map_or(0.0, |pos| pos.x))
        .fold(f64::INFINITY, f64::min);
    let max_node_x = nodes
        .iter()
        .map(|n| node_positions.get(&n.id).map_or(0.0, |pos| pos.x + n.width))
        .fold(f64::NEG_INFINITY, f64::max);

    for (idx, edge) in sorted_edges.into_iter().enumerate() {
        let Some(&(src_node, src_pos)) = node_map.get(&edge.source) else {
            continue;
        };
        let Some(&(tgt_node, tgt_pos)) = node_map.get(&edge.target) else {
            continue;
        };

        let mut found_route: Option<RoutedPath> = None;

        // 1. Try short direct routes first
        let side_pairs: [(Side, Side); 8] = [
            (Side::Top, Side::Bottom),
            (Side::Left, Side::Left),
            (Side::Right, Side::Right),
            (Side::Top, Side::Left),
            (Side::Top, Side::Right),
            (Side::Left, Side::Bottom),
            (Side::Right, Side::Bottom),
            (Side::Bottom, Side::Top),
        ];

        let mut best_short_route: Option<RoutedPath> = None;
        let mut min_short_length = f64::INFINITY;

        for (src_side, tgt_side) in side_pairs {
            let source_port = get_port_ref(src_node, src_pos, src_side, idx, config);
            let target_port = get_port_ref(tgt_node, tgt_pos, tgt_side, idx, config);

            for r in 1..=config.initial_lane_rings {
                let grid = build_routing_grid(
                    nodes,
                    node_positions,
                    &[source_port.clone(), target_port.clone()],
                    bounding_box,
                    config,
                    r,
                );
                let route = search_orthogonal_route(
                    &edge.id,
                    &source_port,
                    &target_port,
                    &grid,
                    &current_occupancy,
                    config,
                    &RouteSearchOptions {
                        role: Some(crate::types::EdgeRole::Feedback),
                        ..Default::default()
                    },
                );

                if let Some(r_path) = route {
                    let mut penetrates = false;
                    for i in 0..r_path.points.len().saturating_sub(1) {
                        let seg = crate::types::Segment {
                            a: r_path.points[i],
                            b: r_path.points[i + 1],
                        };
                        for n in nodes {
                            let n_pos = node_positions.get(&n.id).cloned().unwrap_or(Point { x: 0.0, y: 0.0 });
                            let rect = Rect {
                                x: n_pos.x,
                                y: n_pos.y,
                                width: n.width,
                                height: n.height,
                            };
                            if segment_intersects_rect_interior(&seg, &rect, config.epsilon) {
                                penetrates = true;
                                break;
                            }
                        }
                        if penetrates {
                            break;
                        }
                    }

                    if !penetrates {
                        let len = path_manhattan_length(&r_path.points);
                        if len < min_short_length {
                            min_short_length = len;
                            best_short_route = Some(r_path);
                        }
                    }
                }
            }
        }

        if let Some(short_r) = best_short_route {
            found_route = Some(short_r);
        }

        // 2. Outer corridor detours if no direct short route found
        if found_route.is_none() {
            let primary_left = idx % 2 == 0;
            let sides_to_try = [primary_left, !primary_left];

            for &use_left_corridor in &sides_to_try {
                if found_route.is_some() {
                    break;
                }

                let src_side = if use_left_corridor { Side::Left } else { Side::Right };
                let tgt_side = if use_left_corridor { Side::Left } else { Side::Right };
                let source_port = get_port_ref(src_node, src_pos, src_side, idx, config);
                let target_port = get_port_ref(tgt_node, tgt_pos, tgt_side, idx, config);

                for r in 1..=config.max_lane_rings {
                    let corridor_x = if use_left_corridor {
                        min_node_x - config.obstacle_clearance - (r as f64) * config.lane_spacing
                    } else {
                        max_node_x + config.obstacle_clearance + (r as f64) * config.lane_spacing
                    };

                    let grid = build_routing_grid(
                        nodes,
                        node_positions,
                        &[source_port.clone(), target_port.clone()],
                        bounding_box,
                        config,
                        r,
                    );

                    let route = search_orthogonal_route(
                        &edge.id,
                        &source_port,
                        &target_port,
                        &grid,
                        &current_occupancy,
                        config,
                        &RouteSearchOptions {
                            role: Some(crate::types::EdgeRole::Feedback),
                            required_corridor_x: Some(corridor_x),
                            ..Default::default()
                        },
                    );

                    if let Some(r_path) = route {
                        found_route = Some(r_path);
                        break;
                    }
                }
            }
        }

        if let Some(mut f_route) = found_route {
            f_route.points = sanitize_orthogonal_path(
                &f_route.points,
                &f_route.source_port,
                &f_route.target_port,
                config.epsilon,
            );
            for i in 0..f_route.points.len().saturating_sub(1) {
                current_occupancy.push(OccupancyRecord {
                    edge_id: edge.id.clone(),
                    segment: crate::types::Segment {
                        a: f_route.points[i],
                        b: f_route.points[i + 1],
                    },
                });
            }
            routes.push(f_route);
        }
    }

    routes
}
