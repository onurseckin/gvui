//! Step 5.7: Badge Candidate Scoring, Orthogonal Leaders & DSU Backtracking.
//!
//! This module places text labels and badges along routed edge paths without overlapping nodes,
//! other badges, or unrelated edge segments.
//!
//! ## Candidate Candidate Scoring & Leader Lines
//! 1. Evaluates candidate placement anchors along the routed path at path ratios $r \in \{0.5, 0.35, 0.65, 0.2, 0.8\}$
//!    and segment midpoints.
//! 2. Expands candidates outward perpendicular to the path direction across concentric rings $1..=4$.
//! 3. If a badge cannot be placed directly on the route segment without overlapping obstacles,
//!    an orthogonal "leader line" (L-shaped or 2-bend line) connects the anchor point on the route
//!    to the offset badge rectangle.
//! 4. Candidates are scored based on ring offset distance, ratio deviation from midpoint $(|r - 0.5|)$,
//!    leader length, and exterior graph envelope placement penalties.
//!
//! ## DSU Component Decomposition & DFS Backtracking Search
//! 1. Builds an adjacency conflict graph where two badge candidates conflict if their rectangles overlap,
//!    leader lines cross, or leader lines intersect candidate rectangles.
//! 2. Uses Disjoint Set Union (DSU) with path compression to partition the global badge placement problem
//!    into small, independent connected components.
//! 3. Solves each connected component independently using depth-first backtracking search bounded by
//!    `max_badge_backtrack_steps`. If a component exceeds step limits, a fast greedy fallback places
//!    partial non-conflicting placements and emits `BadgeSpacingRequest`s for layout expansion.

use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};
use crate::badge_measurement::{has_badge, measure_badge_rect};
use crate::config::CustomLayoutConfig;
use crate::geometry::{
    collinear_overlap_length, expand_rect, path_manhattan_length, point_at_path_ratio,
    rects_overlap_strict, segment_intersects_rect_interior, segments_cross, simplify_orthogonal_path,
};
use crate::step4_coordinate_assignment::spacing_demand_resolver::required_same_rank_badge_gap;
use crate::types::{
    BadgePlacement, BadgeRequestKind, BadgeRequestReason, BadgeSpacingRequest, NormalizedEdge, Point,
    PortRef, PositionedNode, Rect, RoutedPath, Segment, Side,
};

/// Represents a candidate position and leader line for an edge badge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BadgeCandidate {
    pub point: Point,
    pub rect: Rect,
    pub score: f64,
    pub leader_points: Option<Vec<Point>>,
}

/// Evaluates whether two badge candidates conflict with each other.
pub fn candidates_conflict(c_a: &BadgeCandidate, c_b: &BadgeCandidate, epsilon: f64) -> bool {
    if rects_overlap_strict(&c_a.rect, &c_b.rect, epsilon) {
        return true;
    }

    if let Some(ref leader_b) = c_b.leader_points {
        for i in 0..leader_b.len().saturating_sub(1) {
            let seg = Segment {
                a: leader_b[i],
                b: leader_b[i + 1],
            };
            if segment_intersects_rect_interior(&seg, &c_a.rect, epsilon) {
                return true;
            }
        }
    }

    if let Some(ref leader_a) = c_a.leader_points {
        for i in 0..leader_a.len().saturating_sub(1) {
            let seg = Segment {
                a: leader_a[i],
                b: leader_a[i + 1],
            };
            if segment_intersects_rect_interior(&seg, &c_b.rect, epsilon) {
                return true;
            }
        }
    }

    if let (Some(ref leader_a), Some(ref leader_b)) = (&c_a.leader_points, &c_b.leader_points) {
        for i in 0..leader_a.len().saturating_sub(1) {
            let seg_a = Segment {
                a: leader_a[i],
                b: leader_a[i + 1],
            };
            for j in 0..leader_b.len().saturating_sub(1) {
                let seg_b = Segment {
                    a: leader_b[j],
                    b: leader_b[j + 1],
                };
                if segments_cross(&seg_a, &seg_b, epsilon) {
                    return true;
                }
                if collinear_overlap_length(&seg_a, &seg_b, epsilon) > epsilon {
                    return true;
                }
            }
        }
    }

    false
}

pub struct BadgePlacementOptions<'a> {
    pub node_rects: &'a [Rect],
    pub placed_badge_rects: &'a [Rect],
    pub unrelated_segments: &'a [Segment],
    pub graph_envelope: &'a Rect,
    pub allow_leaders: bool,
}

/// Generates scored badge position candidates along a route.
pub fn generate_badge_candidates(
    route: &RoutedPath,
    label: &str,
    is_cycle: bool,
    config: &CustomLayoutConfig,
    options: &BadgePlacementOptions,
) -> Vec<BadgeCandidate> {
    let node_rects = options.node_rects;
    let placed_badge_rects = options.placed_badge_rects;
    let unrelated_segments = options.unrelated_segments;
    let graph_envelope = options.graph_envelope;
    let allow_leaders = options.allow_leaders;
    let badge_dim = measure_badge_rect(label, config, is_cycle);
    if badge_dim.width <= 0.0 || badge_dim.height <= 0.0 {
        return Vec::new();
    }

    let mut candidates: Vec<BadgeCandidate> = Vec::new();

    let get_legal_leader = |shape1: Vec<Point>, shape2: Vec<Point>| -> Option<Vec<Point>> {
        let is_legal = |points: &[Point]| -> bool {
            for i in 0..points.len().saturating_sub(1) {
                let seg = Segment {
                    a: points[i],
                    b: points[i + 1],
                };
                for n_rect in node_rects {
                    if segment_intersects_rect_interior(&seg, n_rect, config.epsilon) {
                        return false;
                    }
                }
                for p_rect in placed_badge_rects {
                    if segment_intersects_rect_interior(&seg, p_rect, config.epsilon) {
                        return false;
                    }
                }
                for u_seg in unrelated_segments {
                    if collinear_overlap_length(&seg, u_seg, config.epsilon) > config.epsilon {
                        return false;
                    }
                }
            }
            true
        };

        let legal1 = is_legal(&shape1);
        let legal2 = is_legal(&shape2);

        if legal1 && legal2 {
            if path_manhattan_length(&shape1) <= path_manhattan_length(&shape2) {
                return Some(shape1);
            } else {
                return Some(shape2);
            }
        } else if legal1 {
            return Some(shape1);
        } else if legal2 {
            return Some(shape2);
        }

        // Try 2-bend detour paths around node obstacles if 1-bend L-shapes collide
        let mut detour_paths: Vec<Vec<Point>> = Vec::new();
        let anchor = shape1[0];
        let center = shape1[shape1.len() - 1];

        for n_rect in node_rects {
            let offset_xs = [
                n_rect.x - config.badge_clearance - 15.0,
                n_rect.x + n_rect.width + config.badge_clearance + 15.0,
            ];
            let offset_ys = [
                n_rect.y - config.badge_clearance - 15.0,
                n_rect.y + n_rect.height + config.badge_clearance + 15.0,
            ];

            for &ox in &offset_xs {
                let path = simplify_orthogonal_path(
                    &[
                        anchor,
                        Point { x: ox, y: anchor.y },
                        Point { x: ox, y: center.y },
                        center,
                    ],
                    config.epsilon,
                );
                if is_legal(&path) {
                    detour_paths.push(path);
                }
            }

            for &oy in &offset_ys {
                let path = simplify_orthogonal_path(
                    &[
                        anchor,
                        Point { x: anchor.x, y: oy },
                        Point { x: center.x, y: oy },
                        center,
                    ],
                    config.epsilon,
                );
                if is_legal(&path) {
                    detour_paths.push(path);
                }
            }
        }

        detour_paths.sort_by(|a, b| {
            path_manhattan_length(a).partial_cmp(&path_manhattan_length(b)).unwrap()
        });

        detour_paths.into_iter().next()
    };

    struct AnchorSpec {
        anchor: Point,
        orientation: String,
        ratio_penalty: f64,
    }

    let mut anchor_specs: Vec<AnchorSpec> = Vec::new();

    let ratios = [0.5, 0.35, 0.65, 0.2, 0.8];
    for &r in &ratios {
        let pt = point_at_path_ratio(&route.points, r);
        let mut orientation = "horizontal".to_string();
        for i in 0..route.points.len().saturating_sub(1) {
            let a = &route.points[i];
            let b = &route.points[i + 1];
            let min_x = a.x.min(b.x) - config.epsilon;
            let max_x = a.x.max(b.x) + config.epsilon;
            let min_y = a.y.min(b.y) - config.epsilon;
            let max_y = a.y.max(b.y) + config.epsilon;

            if pt.x >= min_x && pt.x <= max_x && pt.y >= min_y && pt.y <= max_y {
                if (a.x - b.x).abs() <= config.epsilon {
                    orientation = "vertical".to_string();
                } else {
                    orientation = "horizontal".to_string();
                }
                break;
            }
        }
        anchor_specs.push(AnchorSpec {
            anchor: pt,
            orientation,
            ratio_penalty: (r - 0.5).abs(),
        });
    }

    for i in 0..route.points.len().saturating_sub(1) {
        let a = &route.points[i];
        let b = &route.points[i + 1];
        let seg_len = (b.x - a.x).abs() + (b.y - a.y).abs();
        if seg_len <= config.epsilon {
            continue;
        }

        let mid = Point {
            x: (a.x + b.x) / 2.0,
            y: (a.y + b.y) / 2.0,
        };
        let orientation = if (a.x - b.x).abs() <= config.epsilon {
            "vertical".to_string()
        } else {
            "horizontal".to_string()
        };

        anchor_specs.push(AnchorSpec {
            anchor: mid,
            orientation,
            ratio_penalty: 0.1,
        });
    }

    let max_rings = 4.min(config.max_lane_rings);

    for spec in &anchor_specs {
        let anchor = &spec.anchor;
        let orientation = &spec.orientation;
        let ratio_penalty = spec.ratio_penalty;

        let try_add_candidate = |anchor: &Point,
                                  center: &Point,
                                  ring: usize,
                                  ratio_pen: f64,
                                  is_exterior: bool,
                                  cands: &mut Vec<BadgeCandidate>| {
            let b_rect = Rect {
                x: center.x - badge_dim.width / 2.0,
                y: center.y - badge_dim.height / 2.0,
                width: badge_dim.width,
                height: badge_dim.height,
            };

            for n_rect in node_rects {
                if rects_overlap_strict(&b_rect, n_rect, config.epsilon) {
                    return;
                }
            }

            for p_rect in placed_badge_rects {
                if rects_overlap_strict(&b_rect, p_rect, config.epsilon) {
                    return;
                }
            }

            for u_seg in unrelated_segments {
                if segment_intersects_rect_interior(u_seg, &b_rect, config.epsilon) {
                    return;
                }
            }

            let mut score = (ring as f64) * 1000.0 + ratio_pen * 50.0;

            let mut leader_points: Option<Vec<Point>> = None;
            let is_offset = (anchor.x - center.x).abs() > config.epsilon
                || (anchor.y - center.y).abs() > config.epsilon;

            if !allow_leaders && is_offset {
                return;
            }

            if allow_leaders && is_offset {
                let shape1 = simplify_orthogonal_path(
                    &[
                        *anchor,
                        Point {
                            x: center.x,
                            y: anchor.y,
                        },
                        *center,
                    ],
                    config.epsilon,
                );
                let shape2 = simplify_orthogonal_path(
                    &[
                        *anchor,
                        Point {
                            x: anchor.x,
                            y: center.y,
                        },
                        *center,
                    ],
                    config.epsilon,
                );
                let legal_leader = get_legal_leader(shape1, shape2);
                let Some(leader) = legal_leader else {
                    return;
                };
                leader_points = Some(leader);
            }

            if is_offset {
                if let Some(ref lp) = leader_points {
                    score += path_manhattan_length(lp) * 0.1;
                }
            }
            if is_exterior {
                score += 500.0;
            }

            cands.push(BadgeCandidate {
                point: *anchor,
                rect: b_rect,
                score,
                leader_points,
            });
        };

        try_add_candidate(anchor, anchor, 0, ratio_penalty, false, &mut candidates);

        let perp_dirs = if orientation == "horizontal" {
            vec![Point { x: 0.0, y: -1.0 }, Point { x: 0.0, y: 1.0 }]
        } else {
            vec![Point { x: -1.0, y: 0.0 }, Point { x: 1.0, y: 0.0 }]
        };

        let half_perp_size = if orientation == "horizontal" {
            badge_dim.height / 2.0
        } else {
            badge_dim.width / 2.0
        };
        let min_clearance = if orientation == "horizontal" {
            65.0
        } else {
            90.0
        };
        let base_dist = (half_perp_size + config.badge_clearance).max(min_clearance);

        for ring in 1..=max_rings + 2 {
            let dist = base_dist + ((ring - 1) as f64) * config.lane_spacing;
            for dir in &perp_dirs {
                let center = Point {
                    x: anchor.x + dir.x * dist,
                    y: anchor.y + dir.y * dist,
                };
                try_add_candidate(anchor, &center, ring, ratio_penalty, false, &mut candidates);
            }
        }

        let env_min_x = graph_envelope.x;
        let env_max_x = graph_envelope.x + graph_envelope.width;
        let env_min_y = graph_envelope.y;
        let env_max_y = graph_envelope.y + graph_envelope.height;

        let exterior_centers = vec![
            Point {
                x: anchor.x,
                y: env_min_y - badge_dim.height / 2.0 - config.badge_clearance,
            },
            Point {
                x: anchor.x,
                y: env_max_y + badge_dim.height / 2.0 + config.badge_clearance,
            },
            Point {
                x: env_min_x - badge_dim.width / 2.0 - config.badge_clearance,
                y: anchor.y,
            },
            Point {
                x: env_max_x + badge_dim.width / 2.0 + config.badge_clearance,
                y: anchor.y,
            },
        ];

        for ext_center in &exterior_centers {
            try_add_candidate(
                anchor,
                ext_center,
                max_rings + 1,
                ratio_penalty,
                true,
                &mut candidates,
            );
        }
    }

    if candidates.is_empty() {
        let env_min_x = graph_envelope.x;
        let env_max_x = graph_envelope.x + graph_envelope.width;
        let env_min_y = graph_envelope.y;
        let env_max_y = graph_envelope.y + graph_envelope.height;

        let ext_candidates = [
            Point {
                x: (env_min_x + env_max_x) / 2.0,
                y: env_min_y - badge_dim.height / 2.0 - config.badge_clearance,
            },
            Point {
                x: (env_min_x + env_max_x) / 2.0,
                y: env_max_y + badge_dim.height / 2.0 + config.badge_clearance,
            },
            Point {
                x: env_min_x - badge_dim.width / 2.0 - config.badge_clearance,
                y: (env_min_y + env_max_y) / 2.0,
            },
            Point {
                x: env_max_x + badge_dim.width / 2.0 + config.badge_clearance,
                y: (env_min_y + env_max_y) / 2.0,
            },
        ];

        for (idx, ext_center) in ext_candidates.iter().enumerate() {
            let b_rect = Rect {
                x: ext_center.x - badge_dim.width / 2.0,
                y: ext_center.y - badge_dim.height / 2.0 + (idx as f64) * (badge_dim.height + 5.0),
                width: badge_dim.width,
                height: badge_dim.height,
            };
            let mut overlaps_node = false;
            for n_rect in node_rects {
                if rects_overlap_strict(&b_rect, n_rect, config.epsilon) {
                    overlaps_node = true;
                    break;
                }
            }
            if !overlaps_node {
                let anchor = route.points.first().copied().unwrap_or(Point { x: 0.0, y: 0.0 });
                candidates.push(BadgeCandidate {
                    point: anchor,
                    rect: b_rect,
                    score: 10000.0 + (idx as f64) * 100.0,
                    leader_points: None,
                });
                break;
            }
        }

        if candidates.is_empty() {
            for spec in &anchor_specs {
                let anchor = &spec.anchor;
                let center = *anchor;
                let b_rect = Rect {
                    x: center.x - badge_dim.width / 2.0,
                    y: center.y - badge_dim.height / 2.0,
                    width: badge_dim.width,
                    height: badge_dim.height,
                };
                candidates.push(BadgeCandidate {
                    point: *anchor,
                    rect: b_rect,
                    score: 20000.0,
                    leader_points: None,
                });
                break;
            }
        }
    }


    candidates.sort_by(|a, b| {
        if (a.score - b.score).abs() > config.epsilon {
            return a.score.partial_cmp(&b.score).unwrap();
        }
        if (a.point.x - b.point.x).abs() > config.epsilon {
            return a.point.x.partial_cmp(&b.point.x).unwrap();
        }
        if (a.point.y - b.point.y).abs() > config.epsilon {
            return a.point.y.partial_cmp(&b.point.y).unwrap();
        }
        if (a.rect.x - b.rect.x).abs() > config.epsilon {
            return a.rect.x.partial_cmp(&b.rect.x).unwrap();
        }
        a.rect.y.partial_cmp(&b.rect.y).unwrap()
    });

    if candidates.len() > config.max_badge_candidates_per_edge {
        candidates.truncate(config.max_badge_candidates_per_edge);
    }

    candidates
}

#[derive(Debug, Clone)]
struct BadgeItem {
    edge_id: String,
    label: String,
    _is_cycle: bool,
    candidates: Vec<BadgeCandidate>,
    area: f64,
}

/// Output result of global badge placement.
#[derive(Debug, Clone)]
pub struct BadgePlacementResult {
    pub placements: Vec<BadgePlacement>,
    pub placements_map: HashMap<String, BadgePlacement>,
    pub unresolved_edge_ids: Vec<String>,
    pub spacing_requests: Vec<BadgeSpacingRequest>,
}

pub fn create_badge_spacing_request(
    edge: &NormalizedEdge,
    rank_map: &HashMap<String, usize>,
    config: &CustomLayoutConfig,
) -> BadgeSpacingRequest {
    let badge_dim = measure_badge_rect(
        edge.label.as_deref().unwrap_or(""),
        config,
        edge.is_cycle.unwrap_or(false),
    );
    let src_rank = rank_map.get(&edge.source);
    let tgt_rank = rank_map.get(&edge.target);

    if let (Some(&s_r), Some(&t_r)) = (src_rank, tgt_rank) {
        if s_r == t_r {
            return BadgeSpacingRequest {
                edge_id: edge.id.clone(),
                kind: BadgeRequestKind::NodeGap,
                rank: Some(s_r),
                after_node_id: Some(edge.source.clone()),
                minimum: required_same_rank_badge_gap(badge_dim.width, config),
                reason: BadgeRequestReason::SameRankLabel,
            };
        }
    }

    let rank_val = match (src_rank, tgt_rank) {
        (Some(&s_r), Some(&t_r)) => Some(s_r.min(t_r)),
        (Some(&s_r), None) => Some(s_r),
        (None, Some(&t_r)) => Some(t_r),
        _ => None,
    };

    BadgeSpacingRequest {
        edge_id: edge.id.clone(),
        kind: BadgeRequestKind::RankGap,
        rank: rank_val,
        after_node_id: None,
        minimum: badge_dim.height + 2.0 * config.badge_clearance + 2.0 * config.port_stub_length,
        reason: BadgeRequestReason::BlockedDirectBadge,
    }
}

/// Places edge badges using DSU conflict component decomposition and DFS backtracking search.
pub fn place_edge_badges(
    routes: &[RoutedPath],
    nodes: &[PositionedNode],
    edges: &[NormalizedEdge],
    rank_map: &HashMap<String, usize>,
    config: &CustomLayoutConfig,
) -> BadgePlacementResult {
    let node_rects: Vec<Rect> = nodes
        .iter()
        .map(|n| {
            expand_rect(
                &Rect {
                    x: n.x,
                    y: n.y,
                    width: n.width,
                    height: n.height,
                },
                config.badge_clearance,
            )
        })
        .collect();

    let node_map: HashMap<String, &PositionedNode> = nodes.iter().map(|n| (n.id.clone(), n)).collect();
    let routes_by_edge_id: HashMap<String, &RoutedPath> = routes.iter().map(|r| (r.edge_id.clone(), r)).collect();

    let mut sorted_routes = routes.to_vec();
    sorted_routes.sort_by(|a, b| a.edge_id.cmp(&b.edge_id));

    let mut sorted_edges = edges.to_vec();
    sorted_edges.sort_by(|a, b| a.id.cmp(&b.id));

    let mut env_min_x = f64::INFINITY;
    let mut env_min_y = f64::INFINITY;
    let mut env_max_x = f64::NEG_INFINITY;
    let mut env_max_y = f64::NEG_INFINITY;

    for n in nodes {
        env_min_x = env_min_x.min(n.x);
        env_min_y = env_min_y.min(n.y);
        env_max_x = env_max_x.max(n.x + n.width);
        env_max_y = env_max_y.max(n.y + n.height);
    }

    for r in &sorted_routes {
        for p in &r.points {
            env_min_x = env_min_x.min(p.x);
            env_min_y = env_min_y.min(p.y);
            env_max_x = env_max_x.max(p.x);
            env_max_y = env_max_y.max(p.y);
        }
    }

    if !env_min_x.is_finite() {
        env_min_x = 0.0;
        env_min_y = 0.0;
        env_max_x = 800.0;
        env_max_y = 600.0;
    }

    let graph_envelope = Rect {
        x: env_min_x - config.graph_padding,
        y: env_min_y - config.graph_padding,
        width: env_max_x - env_min_x + config.graph_padding * 2.0,
        height: env_max_y - env_min_y + config.graph_padding * 2.0,
    };

    let mut route_segments_map: HashMap<String, Vec<Segment>> = HashMap::new();
    for r in &sorted_routes {
        let mut segs = Vec::new();
        for i in 0..r.points.len().saturating_sub(1) {
            segs.push(Segment {
                a: r.points[i],
                b: r.points[i + 1],
            });
        }
        route_segments_map.insert(r.edge_id.clone(), segs);
    }


    let mut badge_items: Vec<BadgeItem> = Vec::new();
    let mut unresolved_edge_ids: Vec<String> = Vec::new();
    let mut spacing_requests_map: HashMap<String, BadgeSpacingRequest> = HashMap::new();

    for edge in &sorted_edges {
        let label = edge.label.as_deref();
        let is_cycle = edge.is_cycle.unwrap_or(false);

        if !has_badge(label, is_cycle) {
            continue;
        }

        let allow_leaders = true;

        let synthetic_route;
        let route = if let Some(&r) = routes_by_edge_id.get(&edge.id) {
            r
        } else {
            let src_node = node_map.get(&edge.source);
            let tgt_node = node_map.get(&edge.target);
            let pt_src = src_node
                .map(|n| Point {
                    x: n.x + n.width / 2.0,
                    y: n.y + n.height / 2.0,
                })
                .unwrap_or(Point { x: 100.0, y: 100.0 });
            let pt_tgt = tgt_node
                .map(|n| Point {
                    x: n.x + n.width / 2.0,
                    y: n.y + n.height / 2.0,
                })
                .unwrap_or(Point { x: 200.0, y: 200.0 });
            synthetic_route = RoutedPath {
                edge_id: edge.id.clone(),
                points: vec![pt_src, pt_tgt],
                source_port: PortRef {
                    node_id: edge.source.clone(),
                    side: Side::Bottom,
                    index: 0,
                    point: pt_src,
                    stub: pt_src,
                },
                target_port: PortRef {
                    node_id: edge.target.clone(),
                    side: Side::Top,
                    index: 0,
                    point: pt_tgt,
                    stub: pt_tgt,
                },
            };
            &synthetic_route
        };

        let mut unrelated_segments: Vec<Segment> = Vec::new();
        for (e_id, segs) in &route_segments_map {
            if e_id != &edge.id {
                unrelated_segments.extend(segs.clone());
            }
        }

        let placement_opts = BadgePlacementOptions {
            node_rects: &node_rects,
            placed_badge_rects: &[],
            unrelated_segments: &unrelated_segments,
            graph_envelope: &graph_envelope,
            allow_leaders,
        };
        let candidates = generate_badge_candidates(
            route,
            label.unwrap_or(""),
            is_cycle,
            config,
            &placement_opts,
        );

        let badge_dim = measure_badge_rect(label.unwrap_or(""), config, is_cycle);
        let area = badge_dim.width * badge_dim.height;
        let has_on_path_candidate = candidates.iter().any(|c| c.score < 500.0);

        if candidates.is_empty() || !has_on_path_candidate {
            spacing_requests_map.insert(
                edge.id.clone(),
                create_badge_spacing_request(edge, rank_map, config),
            );
        }

        if !candidates.is_empty() {
            badge_items.push(BadgeItem {
                edge_id: edge.id.clone(),
                label: label
                    .unwrap_or(if is_cycle { "Cycle" } else { "" })
                    .to_string(),
                _is_cycle: is_cycle,
                candidates,
                area,
            });
        }
    }

    let num_items = badge_items.len();
    let mut parent: Vec<usize> = (0..num_items).collect();

    fn find(i: usize, parent: &mut [usize]) -> usize {
        let mut curr = i;
        while curr != parent[curr] {
            parent[curr] = parent[parent[curr]];
            curr = parent[curr];
        }
        curr
    }

    for (i, item_i) in badge_items.iter().enumerate().take(num_items) {
        for (j, item_j) in badge_items.iter().enumerate().take(num_items).skip(i + 1) {
            let mut has_conflict = false;
            for c_a in &item_i.candidates {
                for c_b in &item_j.candidates {
                    if candidates_conflict(c_a, c_b, config.epsilon) {
                        has_conflict = true;
                        break;
                    }
                }
                if has_conflict {
                    break;
                }
            }
            if has_conflict {
                let root_i = find(i, &mut parent);
                let root_j = find(j, &mut parent);
                if root_i != root_j {
                    parent[root_i] = root_j;
                }
            }
        }
    }

    let mut component_map: HashMap<usize, Vec<BadgeItem>> = HashMap::new();
    for (i, item) in badge_items.iter().enumerate().take(num_items) {
        let root = find(i, &mut parent);
        component_map.entry(root).or_default().push(item.clone());
    }

    let mut sorted_components: Vec<Vec<BadgeItem>> = component_map.into_values().collect();
    sorted_components.sort_by(|a, b| {
        let mut edges_a: Vec<String> = a.iter().map(|x| x.edge_id.clone()).collect();
        let mut edges_b: Vec<String> = b.iter().map(|x| x.edge_id.clone()).collect();
        edges_a.sort();
        edges_b.sort();
        edges_a[0].cmp(&edges_b[0])
    });

    let mut final_placements_map: HashMap<String, BadgePlacement> = HashMap::new();

    for component in sorted_components {
        let mut sorted_comp_badges = component.clone();
        sorted_comp_badges.sort_by(|a, b| {
            if a.candidates.len() != b.candidates.len() {
                return a.candidates.len().cmp(&b.candidates.len());
            }
            if (b.area - a.area).abs() > 0.001 {
                return b.area.partial_cmp(&a.area).unwrap();
            }
            a.edge_id.cmp(&b.edge_id)
        });

        struct BacktrackCtx<'a> {
            sorted_comp_badges: &'a [BadgeItem],
            max_steps: usize,
            epsilon: f64,
            step_count: usize,
            visited_states: HashSet<String>,
            solution_map: HashMap<String, BadgeCandidate>,
            current_map: HashMap<String, BadgeCandidate>,
        }

        impl<'a> BacktrackCtx<'a> {
            fn search(&mut self, idx: usize) -> bool {
                if idx == self.sorted_comp_badges.len() {
                    for (k, v) in self.current_map.iter() {
                        self.solution_map.insert(k.clone(), v.clone());
                    }
                    return true;
                }

                if self.step_count >= self.max_steps {
                    return false;
                }

                let state_key = self.sorted_comp_badges[..idx]
                    .iter()
                    .map(|b| {
                        let c = self.current_map.get(&b.edge_id).unwrap();
                        format!(
                            "{}:{},{},{},{}",
                            b.edge_id, c.point.x, c.point.y, c.rect.x, c.rect.y
                        )
                    })
                    .collect::<Vec<_>>()
                    .join("|");

                if self.visited_states.contains(&state_key) {
                    return false;
                }
                self.visited_states.insert(state_key);

                let badge = &self.sorted_comp_badges[idx];

                for cand in &badge.candidates {
                    self.step_count += 1;
                    if self.step_count > self.max_steps {
                        return false;
                    }

                    let mut conflict = false;
                    for assigned_cand in self.current_map.values() {
                        if candidates_conflict(cand, assigned_cand, self.epsilon) {
                            conflict = true;
                            break;
                        }
                    }

                    if conflict {
                        continue;
                    }

                    self.current_map.insert(badge.edge_id.clone(), cand.clone());
                    if self.search(idx + 1) {
                        return true;
                    }
                    self.current_map.remove(&badge.edge_id);
                }

                false
            }
        }

        let max_steps = config.max_badge_backtrack_steps;
        let mut ctx = BacktrackCtx {
            sorted_comp_badges: &sorted_comp_badges,
            max_steps,
            epsilon: config.epsilon,
            step_count: 0,
            visited_states: HashSet::new(),
            solution_map: HashMap::new(),
            current_map: HashMap::new(),
        };

        let found_full_solution = ctx.search(0);
        let solution_map = ctx.solution_map;

        if found_full_solution {
            for b_item in &sorted_comp_badges {
                let cand = solution_map.get(&b_item.edge_id).unwrap();
                final_placements_map.insert(
                    b_item.edge_id.clone(),
                    BadgePlacement {
                        edge_id: b_item.edge_id.clone(),
                        label: b_item.label.clone(),
                        rect: cand.rect,
                        anchor_point: cand.point,
                        leader_points: cand.leader_points.clone(),
                    },
                );
            }
        } else {
            let mut partial_map: HashMap<String, BadgeCandidate> = HashMap::new();
            for b_item in &sorted_comp_badges {
                let mut best_cand: Option<BadgeCandidate> = None;
                for cand in &b_item.candidates {
                    let mut conflict = false;
                    for assigned_cand in partial_map.values() {
                        if candidates_conflict(cand, assigned_cand, config.epsilon) {
                            conflict = true;
                            break;
                        }
                    }
                    if !conflict {
                        best_cand = Some(cand.clone());
                        break;
                    }
                }
                let cand = best_cand.unwrap_or_else(|| b_item.candidates[0].clone());
                partial_map.insert(b_item.edge_id.clone(), cand.clone());
                final_placements_map.insert(
                    b_item.edge_id.clone(),
                    BadgePlacement {
                        edge_id: b_item.edge_id.clone(),
                        label: b_item.label.clone(),
                        rect: cand.rect,
                        anchor_point: cand.point,
                        leader_points: cand.leader_points.clone(),
                    },
                );
            }
        }
    }

    let mut placements: Vec<BadgePlacement> = Vec::new();
    let mut placements_map: HashMap<String, BadgePlacement> = HashMap::new();

    for edge in &sorted_edges {
        if let Some(p) = final_placements_map.get(&edge.id) {
            placements.push(p.clone());
            placements_map.insert(p.edge_id.clone(), p.clone());
        }
    }

    let mut spacing_requests: Vec<BadgeSpacingRequest> =
        spacing_requests_map.into_values().collect();
    spacing_requests.sort_by(|a, b| a.edge_id.cmp(&b.edge_id));
    unresolved_edge_ids.sort();

    BadgePlacementResult {
        placements,
        placements_map,
        unresolved_edge_ids,
        spacing_requests,
    }
}

pub use place_edge_badges as place_badges;
