//! Step 3.7: Fast Single-Pass Ranked & Transposed Engines (Dagre TB & LR).
//!
//! Provides ultra-fast single-pass fast-path functions for `top-down-dagre` and `left-right` modes.
//! Executes in <10ms without running heavy multi-pass neighborhood search or multi-variant A* rip-up rerouting.

use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
use crate::cycle_breaking::break_cycles;
use crate::edge_routing::badge_placement::place_edge_badges;
use crate::edge_routing::port_assignment::distribute_ports;
use crate::edge_routing::port_candidates::PortSideAssignment;
use crate::edge_routing::special_routes::route_self_loop;
use crate::geometry::simplify_orthogonal_path;
use crate::layer_graph::build_layer_graph;
use crate::rank_assignment::assign_ranks;
use crate::step1_cycle_breaking::graph_normalization::normalize_graph;
use crate::step3_crossing_minimization::barycenter_median_ordering::minimize_crossings;
use crate::step4_coordinate_assignment::coordinate_assignment_facade::assign_coordinates;
use crate::step6_validation::layout_validator::validate_custom_layout;
use crate::types::{
    CustomLayoutResult, EdgeRole,
    LayoutMetrics, LayoutValidationResult, NormalizedEdge, NormalizedGraph, NormalizedNode, OptimizationStats, Point, PortRef,
    PositionedNode, RoutedPath, Side,
};

/// Transposes cardinal side from vertical flow to horizontal flow.
pub fn transpose_side(side: Side) -> Side {
    match side {
        Side::Top => Side::Left,
        Side::Bottom => Side::Right,
        Side::Left => Side::Top,
        Side::Right => Side::Bottom,
    }
}

/// Transposes a PortRef by swapping x and y coordinates and converting cardinal side.
pub fn transpose_port(port: &PortRef) -> PortRef {
    PortRef {
        node_id: port.node_id.clone(),
        side: transpose_side(port.side),
        index: port.index,
        point: Point {
            x: port.point.y,
            y: port.point.x,
        },
        stub: Point {
            x: port.stub.y,
            y: port.stub.x,
        },
    }
}

/// Transposes a CustomLayoutResult by swapping x and y for all node centers, dimensions,
/// port positions, edge route points, badges, and crossings.
pub fn transpose_layout_result(mut result: CustomLayoutResult) -> CustomLayoutResult {
    // 1. Transpose nodes
    for node in &mut result.nodes {
        let old_x = node.x;
        let old_y = node.y;
        let old_w = node.width;
        let old_h = node.height;

        node.x = old_y;
        node.y = old_x;
        node.width = old_h;
        node.height = old_w;
    }

    // 2. Transpose edges (RoutedPath)
    for edge in &mut result.edges {
        for pt in &mut edge.points {
            let old_x = pt.x;
            pt.x = pt.y;
            pt.y = old_x;
        }
        edge.source_port = transpose_port(&edge.source_port);
        edge.target_port = transpose_port(&edge.target_port);
    }

    // 3. Transpose badges
    for badge in &mut result.badges {
        let old_rx = badge.rect.x;
        let old_ry = badge.rect.y;
        let old_rw = badge.rect.width;
        let old_rh = badge.rect.height;

        badge.rect.x = old_ry + old_rh / 2.0 - old_rw / 2.0;
        badge.rect.y = old_rx + old_rw / 2.0 - old_rh / 2.0;
        badge.rect.width = old_rw;
        badge.rect.height = old_rh;

        let old_ax = badge.anchor_point.x;
        badge.anchor_point.x = badge.anchor_point.y;
        badge.anchor_point.y = old_ax;

        if let Some(ref mut leader_points) = badge.leader_points {
            for pt in leader_points {
                let old_lx = pt.x;
                pt.x = pt.y;
                pt.y = old_lx;
            }
        }
    }

    // 4. Transpose crossings
    for crossing in &mut result.crossings {
        let old_cx = crossing.point.x;
        crossing.point.x = crossing.point.y;
        crossing.point.y = old_cx;
    }
    for crossing in &mut result.validation.crossings {
        let old_cx = crossing.point.x;
        crossing.point.x = crossing.point.y;
        crossing.point.y = old_cx;
    }

    result
}

/// Constructs a direct orthogonal polyline path between source port and target port.
pub fn construct_direct_orthogonal_path(
    src_side: Side,
    tgt_side: Side,
    p1: Point,
    s1: Point,
    p2: Point,
    s2: Point,
    lane_spacing: f64,
) -> Vec<Point> {
    let mut raw_points = vec![p1, s1];
    let detour_offset = if lane_spacing > 0.0 {
        (lane_spacing * 3.0).max(40.0)
    } else {
        40.0
    };

    match (src_side, tgt_side) {
        (Side::Bottom, Side::Top) => {
            if s1.y < s2.y {
                let y_mid = (s1.y + s2.y) / 2.0;
                raw_points.push(Point { x: s1.x, y: y_mid });
                raw_points.push(Point { x: s2.x, y: y_mid });
            } else {
                let x_detour = s1.x.max(s2.x) + detour_offset;
                raw_points.push(Point { x: x_detour, y: s1.y });
                raw_points.push(Point { x: x_detour, y: s2.y });
            }
        }
        (Side::Right, Side::Left) => {
            if s1.x < s2.x {
                let x_mid = (s1.x + s2.x) / 2.0;
                raw_points.push(Point { x: x_mid, y: s1.y });
                raw_points.push(Point { x: x_mid, y: s2.y });
            } else {
                let y_detour = s1.y.max(s2.y) + detour_offset;
                raw_points.push(Point { x: s1.x, y: y_detour });
                raw_points.push(Point { x: s2.x, y: y_detour });
            }
        }
        (Side::Top, Side::Bottom) => {
            if s1.y > s2.y {
                let y_mid = (s1.y + s2.y) / 2.0;
                raw_points.push(Point { x: s1.x, y: y_mid });
                raw_points.push(Point { x: s2.x, y: y_mid });
            } else {
                let x_detour = s1.x.max(s2.x) + detour_offset;
                raw_points.push(Point { x: x_detour, y: s1.y });
                raw_points.push(Point { x: x_detour, y: s2.y });
            }
        }
        (Side::Left, Side::Right) => {
            if s1.x > s2.x {
                let x_mid = (s1.x + s2.x) / 2.0;
                raw_points.push(Point { x: x_mid, y: s1.y });
                raw_points.push(Point { x: x_mid, y: s2.y });
            } else {
                let y_detour = s1.y.max(s2.y) + detour_offset;
                raw_points.push(Point { x: s1.x, y: y_detour });
                raw_points.push(Point { x: s2.x, y: y_detour });
            }
        }
        _ => {
            if src_side == Side::Top || src_side == Side::Bottom {
                raw_points.push(Point { x: s1.x, y: s2.y });
            } else {
                raw_points.push(Point { x: s2.x, y: s1.y });
            }
        }
    }

    raw_points.push(s2);
    raw_points.push(p2);

    simplify_orthogonal_path(&raw_points, 0.001)
}

/// Routes all edges using single-pass port distribution and fast direct orthogonal pathing.
pub fn route_edges_fast_direct(
    nodes: &[PositionedNode],
    edges: &[NormalizedEdge],
    rank_map: &HashMap<String, usize>,
    _edge_role_map: &HashMap<String, EdgeRole>,
    config: &CustomLayoutConfig,
) -> Vec<RoutedPath> {
    let node_positions: HashMap<String, Point> = nodes
        .iter()
        .map(|n| (n.id.clone(), Point { x: n.x, y: n.y }))
        .collect();
    let norm_node_map: HashMap<String, NormalizedNode> = nodes
        .iter()
        .map(|n| (n.id.clone(), NormalizedNode {
            id: n.id.clone(),
            label: n.label.clone(),
            width: n.width,
            height: n.height,
        }))
        .collect();

    let mut side_assignments: HashMap<String, PortSideAssignment> = HashMap::new();

    for edge in edges {
        if edge.source == edge.target {
            continue;
        }
        let rank_src = rank_map.get(&edge.source).copied().unwrap_or(0);
        let rank_tgt = rank_map.get(&edge.target).copied().unwrap_or(0);

        let (src_side, tgt_side) = if rank_src < rank_tgt {
            (Side::Bottom, Side::Top)
        } else if rank_src == rank_tgt {
            let x_src = node_positions.get(&edge.source).map(|p| p.x).unwrap_or(0.0);
            let x_tgt = node_positions.get(&edge.target).map(|p| p.x).unwrap_or(0.0);
            if x_src <= x_tgt {
                (Side::Right, Side::Left)
            } else {
                (Side::Left, Side::Right)
            }
        } else {
            (Side::Right, Side::Right)
        };

        side_assignments.insert(edge.id.clone(), PortSideAssignment { src_side, tgt_side });
    }

    let port_dist_res = distribute_ports(
        edges,
        &side_assignments,
        &norm_node_map,
        &node_positions,
        config,
        None,
    );

    let mut routes = Vec::new();
    let mut self_loop_counts: HashMap<String, usize> = HashMap::new();

    for edge in edges {
        if edge.source == edge.target {
            if let (Some(src_pos), Some(norm_node)) = (node_positions.get(&edge.source), norm_node_map.get(&edge.source)) {
                let loop_idx = *self_loop_counts.get(&edge.source).unwrap_or(&0);
                self_loop_counts.insert(edge.source.clone(), loop_idx + 1);

                let self_route = route_self_loop(edge, norm_node, src_pos, config, loop_idx);
                routes.push(self_route);
            }
            continue;
        }

        let Some(edge_ports) = port_dist_res.ports_by_edge.get(&edge.id) else {
            if let (Some(src_pos), Some(tgt_pos)) = (node_positions.get(&edge.source), node_positions.get(&edge.target)) {
                let src_node = norm_node_map.get(&edge.source);
                let tgt_node = norm_node_map.get(&edge.target);
                let src_w = src_node.map_or(140.0, |n| n.width);
                let src_h = src_node.map_or(70.0, |n| n.height);
                let tgt_w = tgt_node.map_or(140.0, |n| n.width);
                let tgt_h = tgt_node.map_or(70.0, |n| n.height);
                let src_cx = src_pos.x + src_w / 2.0;
                let src_cy = src_pos.y + src_h / 2.0;
                let tgt_cx = tgt_pos.x + tgt_w / 2.0;
                let tgt_cy = tgt_pos.y + tgt_h / 2.0;
                routes.push(RoutedPath {
                    edge_id: edge.id.clone(),
                    points: vec![Point { x: src_cx, y: src_cy }, Point { x: tgt_cx, y: tgt_cy }],
                    source_port: PortRef {
                        node_id: edge.source.clone(),
                        side: Side::Bottom,
                        index: 0,
                        point: Point { x: src_cx, y: src_cy },
                        stub: Point { x: src_cx, y: src_cy },
                    },
                    target_port: PortRef {
                        node_id: edge.target.clone(),
                        side: Side::Top,
                        index: 0,
                        point: Point { x: tgt_cx, y: tgt_cy },
                        stub: Point { x: tgt_cx, y: tgt_cy },
                    },
                });
            }
            continue;
        };

        let src_port = edge_ports.source_port.clone();
        let tgt_port = edge_ports.target_port.clone();

        let p1 = src_port.point;
        let s1 = src_port.stub;
        let p2 = tgt_port.point;
        let s2 = tgt_port.stub;

        let waypoints = construct_direct_orthogonal_path(src_port.side, tgt_port.side, p1, s1, p2, s2, config.lane_spacing);

        routes.push(RoutedPath {
            edge_id: edge.id.clone(),
            points: waypoints,
            source_port: src_port,
            target_port: tgt_port,
        });
    }

    routes.sort_by(|a, b| a.edge_id.cmp(&b.edge_id));
    routes
}

/// Fast single-pass top-down dagre layout calculation.
pub fn compute_top_down_dagre_layout(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    config: &CustomLayoutConfig,
) -> CustomLayoutResult {
    let t_start = crate::types::get_now_ms();

    if nodes.is_empty() {
        return CustomLayoutResult {
            nodes: vec![],
            edges: vec![],
            badges: vec![],
            crossings: vec![],
            validation: LayoutValidationResult {
                is_valid: true,
                metrics: LayoutMetrics::default(),
                crossings: vec![],
                diagnostics: vec![],
            },
            status: "success".to_string(),
            optimization_stats: OptimizationStats {
                global_passes: 1,
                evaluated_port_states: 1,
                spacing_expansions: 0,
                duration_ms: 0.0,
                stop_reason: "empty_graph".to_string(),
            },
        };
    }

    // 1. 1-pass Cycle Breaking
    let classified = break_cycles(nodes, edges);
    let active_edges: Vec<NormalizedEdge> = classified.iter().map(|c| c.edge.clone()).collect();
    let edge_role_map: HashMap<String, EdgeRole> =
        classified.iter().map(|c| (c.edge.id.clone(), c.role)).collect();

    // 2. Rank Assignment & Layer Graph Construction
    let layered = assign_ranks(nodes, &active_edges, Some(&edge_role_map));
    let layer_graph = build_layer_graph(nodes, edges, Some(&edge_role_map), &layered);

    // 3. 1 Barycenter Sweep Crossing Minimization
    let minimized = minimize_crossings(&layer_graph, 1, None);

    // 4. PAVA Coordinate Assignment
    let sanitized_nodes: Vec<NormalizedNode> = nodes
        .iter()
        .map(|n| NormalizedNode {
            id: n.id.clone(),
            label: n.label.clone(),
            width: if n.width > 0.0 { n.width } else { 140.0 },
            height: if n.height > 0.0 { n.height } else { 70.0 },
        })
        .collect();

    let norm_graph = normalize_graph(&sanitized_nodes, edges)
        .map(|r| r.graph)
        .unwrap_or_else(|_| NormalizedGraph {
            nodes: sanitized_nodes.clone(),
            edges: edges.to_vec(),
            node_map: sanitized_nodes.iter().map(|n| (n.id.clone(), n.clone())).collect(),
            edge_map: edges.iter().map(|e| (e.id.clone(), e.clone())).collect(),
            outgoing_map: HashMap::new(),
            incoming_map: HashMap::new(),
        });

    let coord_result = assign_coordinates(
        &norm_graph,
        &layer_graph,
        &minimized.ordered_layers,
        config,
        None,
        None,
    );

    let mut positioned_nodes: Vec<PositionedNode> = Vec::new();
    for (rank_idx, layer) in minimized.ordered_layers.iter().enumerate() {
        for (order_idx, layer_node) in layer.iter().enumerate() {
            if !layer_node.is_virtual {
                if let Some(pos) = coord_result.node_positions.get(&layer_node.id) {
                    let pnode = PositionedNode {
                        id: layer_node.id.clone(),
                        label: nodes.iter().find(|n| n.id == layer_node.id).and_then(|n| n.label.clone()),
                        x: pos.x,
                        y: pos.y,
                        width: layer_node.width,
                        height: layer_node.height,
                        rank: rank_idx,
                        order: order_idx,
                    };
                    positioned_nodes.push(pnode);
                }
            }
        }
    }
    let positioned_ids: std::collections::HashSet<String> =
        positioned_nodes.iter().map(|n| n.id.clone()).collect();
    for (idx, node) in nodes.iter().enumerate() {
        if !positioned_ids.contains(&node.id) {
            positioned_nodes.push(PositionedNode {
                id: node.id.clone(),
                label: node.label.clone(),
                x: config.graph_padding + (idx as f64) * (node.width + config.node_gap),
                y: config.graph_padding,
                width: node.width,
                height: node.height,
                rank: 0,
                order: idx,
            });
        }
    }
    positioned_nodes.sort_by(|a, b| a.id.cmp(&b.id));

    // 5. Fast Direct Edge Routing
    let routes = route_edges_fast_direct(&positioned_nodes, edges, &layered.node_rank_map, &edge_role_map, config);

    // 6. Badge Placement
    let badge_res = place_edge_badges(&routes, &positioned_nodes, edges, &layered.node_rank_map, config);

    // 7. Validation & Result Structuring
    let validation = validate_custom_layout(&positioned_nodes, &routes, &badge_res.placements, Some(edges), Some(&edge_role_map), config);
    let duration_ms = (crate::types::get_now_ms() - t_start).max(0.0);

    let stats = OptimizationStats {
        global_passes: 1,
        evaluated_port_states: 1,
        spacing_expansions: 0,
        duration_ms,
        stop_reason: "top_down_dagre_fast_path".to_string(),
    };

    CustomLayoutResult {
        nodes: positioned_nodes,
        edges: routes,
        badges: badge_res.placements,
        crossings: validation.crossings.clone(),
        validation: LayoutValidationResult {
            is_valid: validation.is_valid,
            metrics: validation.metrics,
            crossings: validation.crossings,
            diagnostics: vec![],
        },
        status: "success".to_string(),
        optimization_stats: stats,
    }
}

/// Fast single-pass left-right layout calculation (top-down-dagre pipeline + coordinate transposition).
pub fn compute_left_right_layout(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    config: &CustomLayoutConfig,
) -> CustomLayoutResult {
    let t_start = crate::types::get_now_ms();

    let td_nodes: Vec<NormalizedNode> = nodes
        .iter()
        .map(|n| NormalizedNode {
            id: n.id.clone(),
            label: n.label.clone(),
            width: n.height,
            height: n.width,
        })
        .collect();

    let td_result = compute_top_down_dagre_layout(&td_nodes, edges, config);
    let mut lr_result = transpose_layout_result(td_result);

    let duration_ms = (crate::types::get_now_ms() - t_start).max(0.0);
    lr_result.optimization_stats.duration_ms = duration_ms;
    lr_result.optimization_stats.stop_reason = "left_right_fast_path".to_string();

    lr_result
}
