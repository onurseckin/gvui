//! Step 6.1: Layout Validation Rules, Overlap Checks, Diagnostics, & Comparative Scores.
//!
//! This module implements the layout verification engine for Step 6 (Layout Validation).
//!
//! ## Hard Error Validation Rules
//! 1. `NON_FINITE_COORDINATE`: Ensures all node positions, dimensions, port points, stubs,
//!    and routed path segment points contain finite `f64` numbers (no NaN or Infinity).
//! 2. `NODE_NODE_OVERLAP`: Checks if any two node rectangles overlap in strict 2D space.
//! 3. `MISSING_ROUTE` / `MISSING_BADGE`: Verifies that every expected edge has a rendered path
//!    and required badge.
//! 4. `NON_ORTHOGONAL_SEGMENT`: Asserts every edge path segment is strictly horizontal or vertical.
//! 5. `ENDPOINT_OFF_BOUNDARY`: Confirms port endpoints touch the exact outer boundary of node rectangles.
//! 6. `WRONG_DEPARTURE_DIRECTION` / `WRONG_ENTRY_DIRECTION`: Confirms initial and final stub legs leave/enter
//!    perpendicular to assigned node sides.
//! 7. `EDGE_NODE_PENETRATION`: Detects if any edge segment intersects the strict interior of a node.
//! 8. `SHARED_EDGE_SEGMENT`: Checks if non-identical edge paths share collinear segment overlaps.
//!
//! ## Soft Overlap & Diagnostic Warning Checks
//! - `BADGE_NODE_OVERLAP`: Badge rectangle overlaps node interior.
//! - `BADGE_BADGE_OVERLAP`: Badge rectangle overlaps another badge rectangle.
//! - `BADGE_UNRELATED_EDGE_OVERLAP`: Badge overlaps an unrelated edge path segment.
//!
//! ## Layout Score Conversion & Comparison
//! Converts `ExtendedLayoutValidationResult` into a multi-criteria `LayoutScore` tuple for objective
//! ranking and optimization comparison.

use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};
use crate::config::CustomLayoutConfig;
use crate::geometry::{
    collinear_overlap_length, is_finite_point, is_orthogonal_segment, path_manhattan_length,
    point_on_rect_boundary, rects_overlap_strict, segment_intersects_rect_interior,
    simplify_orthogonal_path,
};
use crate::step3_crossing_minimization::crossing_counting::detect_edge_crossings;
use crate::step3_crossing_minimization::objective_evaluator::{
    calculate_excess_bends, calculate_hairpin_count, calculate_leader_metrics,
    calculate_port_side_imbalance, compare_layout_score, compare_layout_score_with_config,
};
use crate::types::{
    BadgePlacement, EdgeCrossing, EdgeRole, LayoutMetrics, LayoutScore,
    NormalizedEdge, PositionedNode, Rect, RoutedPath, Segment, Side,
};

/// Structure representing a layout validation diagnostic issue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutDiagnostic {
    pub code: String,
    pub severity: String,
    pub message: String,
    pub ids: Vec<String>,
}

/// Detailed layout diagnostic including geometrical context (segment or rect).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtendedLayoutDiagnostic {
    pub code: String,
    pub severity: String,
    pub message: String,
    pub ids: Vec<String>,
    pub segment: Option<Segment>,
    pub rect: Option<Rect>,
}

/// Detailed validation output containing metrics, crossings, and extended diagnostics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtendedLayoutValidationResult {
    pub is_valid: bool,
    pub metrics: LayoutMetrics,
    pub crossings: Vec<EdgeCrossing>,
    pub diagnostics: Vec<ExtendedLayoutDiagnostic>,
}

fn add_diagnostic(
    diagnostics: &mut Vec<ExtendedLayoutDiagnostic>,
    seen_keys: &mut HashSet<String>,
    diag: ExtendedLayoutDiagnostic,
) -> bool {
    let key = if diag.ids.is_empty() {
        diag.code.clone()
    } else if diag.ids.len() == 1 {
        format!("{}:{}", diag.code, diag.ids[0])
    } else {
        let mut sorted = diag.ids.clone();
        sorted.sort();
        format!("{}:{}", diag.code, sorted.join(":"))
    };

    if !seen_keys.contains(&key) {
        seen_keys.insert(key);
        diagnostics.push(diag);
        true
    } else {
        false
    }
}

/// Evaluates all hard validation rules and soft layout quality diagnostics.
pub fn validate_custom_layout(
    nodes: &[PositionedNode],
    edges: &[RoutedPath],
    badges: &[BadgePlacement],
    expected_edges: Option<&[NormalizedEdge]>,
    edge_roles: Option<&HashMap<String, EdgeRole>>,
    config: &CustomLayoutConfig,
) -> ExtendedLayoutValidationResult {
    let mut diagnostics: Vec<ExtendedLayoutDiagnostic> = Vec::new();
    let mut seen_diagnostic_keys = HashSet::new();

    let mut metrics = LayoutMetrics {
        node_node_overlaps: 0,
        edge_node_penetrations: 0,
        shared_edge_segment_length: 0.0,
        crossing_count: 0,
        bend_count: 0,
        total_length: 0.0,
        ..Default::default()
    };

    if let Some(exp_edges) = expected_edges {
        let routes_by_edge_id: HashMap<String, &RoutedPath> = edges
            .iter()
            .filter(|e| e.points.len() >= 2)
            .map(|e| (e.edge_id.clone(), e))
            .collect();
        let badges_by_edge_id: HashMap<String, &BadgePlacement> =
            badges.iter().map(|b| (b.edge_id.clone(), b)).collect();

        for expected_edge in exp_edges {
            if !routes_by_edge_id.contains_key(&expected_edge.id)
                && add_diagnostic(
                    &mut diagnostics,
                    &mut seen_diagnostic_keys,
                    ExtendedLayoutDiagnostic {
                        code: "MISSING_ROUTE".to_string(),
                        severity: "error".to_string(),
                        message: format!("Expected edge {} has no rendered route", expected_edge.id),
                        ids: vec![expected_edge.id.clone()],
                        segment: None,
                        rect: None,
                    },
                ) {
                    metrics.unresolved_route_count += 1;
                }

            let requires_badge = expected_edge.is_cycle.unwrap_or(false)
                || expected_edge.label.as_deref().is_some_and(|l| !l.trim().is_empty());
            if requires_badge && !badges_by_edge_id.contains_key(&expected_edge.id)
                && add_diagnostic(
                    &mut diagnostics,
                    &mut seen_diagnostic_keys,
                    ExtendedLayoutDiagnostic {
                        code: "MISSING_BADGE".to_string(),
                        severity: "warning".to_string(),
                        message: format!("Expected edge {} has no rendered badge", expected_edge.id),
                        ids: vec![expected_edge.id.clone()],
                        segment: None,
                        rect: None,
                    },
                ) {
                    metrics.unresolved_badge_count += 1;
                }
        }
    }

    let mut node_rect_map: HashMap<String, Rect> = HashMap::new();

    // 1. Non-finite coordinate check
    for node in nodes {
        if !is_finite_point(&crate::types::Point { x: node.x, y: node.y })
            || !node.width.is_finite()
            || !node.height.is_finite()
        {
            add_diagnostic(
                &mut diagnostics,
                &mut seen_diagnostic_keys,
                ExtendedLayoutDiagnostic {
                    code: "NON_FINITE_COORDINATE".to_string(),
                    severity: "error".to_string(),
                    message: format!("Node {} has non-finite coordinates or dimensions", node.id),
                    ids: vec![node.id.clone()],
                    segment: None,
                    rect: None,
                },
            );
        } else {
            node_rect_map.insert(
                node.id.clone(),
                Rect {
                    x: node.x,
                    y: node.y,
                    width: node.width,
                    height: node.height,
                },
            );
        }
    }

    for edge in edges {
        let mut has_non_finite = false;
        if !is_finite_point(&edge.source_port.point) || !is_finite_point(&edge.source_port.stub) {
            has_non_finite = true;
        }
        if !is_finite_point(&edge.target_port.point) || !is_finite_point(&edge.target_port.stub) {
            has_non_finite = true;
        }
        for p in &edge.points {
            if !is_finite_point(p) {
                has_non_finite = true;
                break;
            }
        }
        if has_non_finite {
            add_diagnostic(
                &mut diagnostics,
                &mut seen_diagnostic_keys,
                ExtendedLayoutDiagnostic {
                    code: "NON_FINITE_COORDINATE".to_string(),
                    severity: "error".to_string(),
                    message: format!("Edge {} has non-finite point coordinates", edge.edge_id),
                    ids: vec![edge.edge_id.clone()],
                    segment: None,
                    rect: None,
                },
            );
        }
    }

    for badge in badges {
        if !badge.rect.x.is_finite()
            || !badge.rect.y.is_finite()
            || !badge.rect.width.is_finite()
            || !badge.rect.height.is_finite()
            || !is_finite_point(&badge.anchor_point)
        {
            add_diagnostic(
                &mut diagnostics,
                &mut seen_diagnostic_keys,
                ExtendedLayoutDiagnostic {
                    code: "NON_FINITE_COORDINATE".to_string(),
                    severity: "error".to_string(),
                    message: format!(
                        "Badge for edge {} has non-finite coordinates or dimensions",
                        badge.edge_id
                    ),
                    ids: vec![badge.edge_id.clone()],
                    segment: None,
                    rect: None,
                },
            );
        }
    }

    // 2. Node-node overlap check
    for i in 0..nodes.len() {
        let n_a = &nodes[i];
        let Some(r_a) = node_rect_map.get(&n_a.id) else {
            continue;
        };
        for n_b in nodes.iter().skip(i + 1) {
            let Some(r_b) = node_rect_map.get(&n_b.id) else {
                continue;
            };
            if rects_overlap_strict(r_a, r_b, config.epsilon)
                && add_diagnostic(
                    &mut diagnostics,
                    &mut seen_diagnostic_keys,
                    ExtendedLayoutDiagnostic {
                        code: "NODE_NODE_OVERLAP".to_string(),
                        severity: "error".to_string(),
                        message: format!("Node {} and Node {} overlap", n_a.id, n_b.id),
                        ids: vec![n_a.id.clone(), n_b.id.clone()],
                        segment: None,
                        rect: Some(*r_a),
                    },
                ) {
                    metrics.node_node_overlaps += 1;
                }
        }
    }

    // 3. Edge endpoint, direction, missing route, and non-orthogonal segment checks
    for edge in edges {
        if edge.points.len() < 2 {
            if add_diagnostic(
                &mut diagnostics,
                &mut seen_diagnostic_keys,
                ExtendedLayoutDiagnostic {
                    code: "MISSING_ROUTE".to_string(),
                    severity: "error".to_string(),
                    message: format!("Edge {} has a missing or incomplete route", edge.edge_id),
                    ids: vec![edge.edge_id.clone()],
                    segment: None,
                    rect: None,
                },
            ) {
                metrics.unresolved_route_count += 1;
            }
            continue;
        }

        for k in 0..edge.points.len() - 1 {
            let seg = Segment {
                a: edge.points[k],
                b: edge.points[k + 1],
            };
            if !is_orthogonal_segment(&seg, config.epsilon) {
                add_diagnostic(
                    &mut diagnostics,
                    &mut seen_diagnostic_keys,
                    ExtendedLayoutDiagnostic {
                        code: "NON_ORTHOGONAL_SEGMENT".to_string(),
                        severity: "error".to_string(),
                        message: format!("Segment of edge {} is non-orthogonal", edge.edge_id),
                        ids: vec![edge.edge_id.clone()],
                        segment: Some(seg),
                        rect: None,
                    },
                );
            }
        }

        if let Some(source_node_rect) = node_rect_map.get(&edge.source_port.node_id) {
            if !point_on_rect_boundary(&edge.source_port.point, source_node_rect, config.epsilon) {
                add_diagnostic(
                    &mut diagnostics,
                    &mut seen_diagnostic_keys,
                    ExtendedLayoutDiagnostic {
                        code: "ENDPOINT_OFF_BOUNDARY".to_string(),
                        severity: "error".to_string(),
                        message: format!(
                            "Source endpoint of edge {} is not on boundary of node {}",
                            edge.edge_id, edge.source_port.node_id
                        ),
                        ids: vec![edge.edge_id.clone(), edge.source_port.node_id.clone()],
                        segment: None,
                        rect: None,
                    },
                );
            }

            let p0 = &edge.points[0];
            let p1 = &edge.points[1];
            let valid_departure = match edge.source_port.side {
                Side::Top => p1.y < p0.y - config.epsilon && (p1.x - p0.x).abs() <= config.epsilon,
                Side::Bottom => p1.y > p0.y + config.epsilon && (p1.x - p0.x).abs() <= config.epsilon,
                Side::Left => p1.x < p0.x - config.epsilon && (p1.y - p0.y).abs() <= config.epsilon,
                Side::Right => p1.x > p0.x + config.epsilon && (p1.y - p0.y).abs() <= config.epsilon,
            };
            if !valid_departure {
                add_diagnostic(
                    &mut diagnostics,
                    &mut seen_diagnostic_keys,
                    ExtendedLayoutDiagnostic {
                        code: "WRONG_DEPARTURE_DIRECTION".to_string(),
                        severity: "error".to_string(),
                        message: format!(
                            "First segment of edge {} does not leave perpendicular from side {:?}",
                            edge.edge_id, edge.source_port.side
                        ),
                        ids: vec![edge.edge_id.clone(), edge.source_port.node_id.clone()],
                        segment: Some(Segment { a: *p0, b: *p1 }),
                        rect: None,
                    },
                );
            }
        }

        if let Some(target_node_rect) = node_rect_map.get(&edge.target_port.node_id) {
            if !point_on_rect_boundary(&edge.target_port.point, target_node_rect, config.epsilon) {
                add_diagnostic(
                    &mut diagnostics,
                    &mut seen_diagnostic_keys,
                    ExtendedLayoutDiagnostic {
                        code: "ENDPOINT_OFF_BOUNDARY".to_string(),
                        severity: "error".to_string(),
                        message: format!(
                            "Target endpoint of edge {} is not on boundary of node {}",
                            edge.edge_id, edge.target_port.node_id
                        ),
                        ids: vec![edge.edge_id.clone(), edge.target_port.node_id.clone()],
                        segment: None,
                        rect: None,
                    },
                );
            }

            let p_last = &edge.points[edge.points.len() - 1];
            let p_prev = &edge.points[edge.points.len() - 2];
            let valid_entry = match edge.target_port.side {
                Side::Top => p_prev.y < p_last.y - config.epsilon && (p_prev.x - p_last.x).abs() <= config.epsilon,
                Side::Bottom => p_prev.y > p_last.y + config.epsilon && (p_prev.x - p_last.x).abs() <= config.epsilon,
                Side::Left => p_prev.x < p_last.x - config.epsilon && (p_prev.y - p_last.y).abs() <= config.epsilon,
                Side::Right => p_prev.x > p_last.x + config.epsilon && (p_prev.y - p_last.y).abs() <= config.epsilon,
            };
            if !valid_entry {
                add_diagnostic(
                    &mut diagnostics,
                    &mut seen_diagnostic_keys,
                    ExtendedLayoutDiagnostic {
                        code: "WRONG_ENTRY_DIRECTION".to_string(),
                        severity: "error".to_string(),
                        message: format!(
                            "Last segment of edge {} does not enter perpendicular to side {:?}",
                            edge.edge_id, edge.target_port.side
                        ),
                        ids: vec![edge.edge_id.clone(), edge.target_port.node_id.clone()],
                        segment: Some(Segment { a: *p_prev, b: *p_last }),
                        rect: None,
                    },
                );
            }
        }

        let p_last = edge.points[edge.points.len() - 1];
        let p_prev = edge.points[edge.points.len() - 2];
        let arrow_seg_len = (p_last.x - p_prev.x).abs() + (p_last.y - p_prev.y).abs();
        if arrow_seg_len <= config.epsilon {
            add_diagnostic(
                &mut diagnostics,
                &mut seen_diagnostic_keys,
                ExtendedLayoutDiagnostic {
                    code: "ZERO_LENGTH_ARROW_SEGMENT".to_string(),
                    severity: "error".to_string(),
                    message: format!(
                        "Edge {} has zero-length final arrowhead segment",
                        edge.edge_id
                    ),
                    ids: vec![edge.edge_id.clone()],
                    segment: Some(Segment { a: p_prev, b: p_last }),
                    rect: None,
                },
            );
        }
    }

    // 4. Edge-node penetration check
    for edge in edges {
        if edge.points.len() < 2 {
            continue;
        }
        for i in 0..edge.points.len() - 1 {
            let seg = Segment {
                a: edge.points[i],
                b: edge.points[i + 1],
            };
            for node in nodes {
                let Some(n_rect) = node_rect_map.get(&node.id) else {
                    continue;
                };
                if segment_intersects_rect_interior(&seg, n_rect, config.epsilon)
                    && add_diagnostic(
                        &mut diagnostics,
                        &mut seen_diagnostic_keys,
                        ExtendedLayoutDiagnostic {
                            code: "EDGE_NODE_PENETRATION".to_string(),
                            severity: "error".to_string(),
                            message: format!(
                                "Segment of edge {} penetrates interior of node {}",
                                edge.edge_id, node.id
                            ),
                            ids: vec![edge.edge_id.clone(), node.id.clone()],
                            segment: Some(seg.clone()),
                            rect: Some(*n_rect),
                        },
                    ) {
                        metrics.edge_node_penetrations += 1;
                    }
            }
        }
    }

    // 5. Shared positive-length collinear edge segment check
    for i in 0..edges.len() {
        let edge_a = &edges[i];
        if edge_a.points.len() < 2 {
            continue;
        }
        for edge_b in edges.iter().skip(i + 1) {
            if edge_b.points.len() < 2 {
                continue;
            }
            let mut shared_len_for_pair = 0.0;
            let mut first_overlap_seg: Option<Segment> = None;
            for k in 0..edge_a.points.len() - 1 {
                let seg_a = Segment {
                    a: edge_a.points[k],
                    b: edge_a.points[k + 1],
                };
                for l in 0..edge_b.points.len() - 1 {
                    let seg_b = Segment {
                        a: edge_b.points[l],
                        b: edge_b.points[l + 1],
                    };
                    let overlap = collinear_overlap_length(&seg_a, &seg_b, config.epsilon);
                    if overlap > config.epsilon {
                        shared_len_for_pair += overlap;
                        if first_overlap_seg.is_none() {
                            first_overlap_seg = Some(seg_a.clone());
                        }
                    }
                }
            }
            if shared_len_for_pair > config.epsilon {
                metrics.shared_edge_segment_length += shared_len_for_pair;
                add_diagnostic(
                    &mut diagnostics,
                    &mut seen_diagnostic_keys,
                    ExtendedLayoutDiagnostic {
                        code: "SHARED_EDGE_SEGMENT".to_string(),
                        severity: "error".to_string(),
                        message: format!(
                            "Edges {} and {} share {:.2}px collinear segment",
                            edge_a.edge_id, edge_b.edge_id, shared_len_for_pair
                        ),
                        ids: vec![edge_a.edge_id.clone(), edge_b.edge_id.clone()],
                        segment: first_overlap_seg,
                        rect: None,
                    },
                );
            }
        }
    }

    // 6. Badge-node overlap check
    for badge in badges {
        for node in nodes {
            let Some(n_rect) = node_rect_map.get(&node.id) else {
                continue;
            };
            if rects_overlap_strict(&badge.rect, n_rect, config.epsilon)
                && add_diagnostic(
                    &mut diagnostics,
                    &mut seen_diagnostic_keys,
                    ExtendedLayoutDiagnostic {
                        code: "BADGE_NODE_OVERLAP".to_string(),
                        severity: "error".to_string(),
                        message: format!("Badge for edge {} overlaps node {}", badge.edge_id, node.id),
                        ids: vec![badge.edge_id.clone(), node.id.clone()],
                        segment: None,
                        rect: Some(badge.rect),
                    },
                ) {
                    metrics.badge_node_overlaps += 1;
                }
        }
    }

    // 7. Badge-badge overlap check
    for (i, b_a) in badges.iter().enumerate() {
        for b_b in badges.iter().skip(i + 1) {
            if rects_overlap_strict(&b_a.rect, &b_b.rect, config.epsilon)
                && add_diagnostic(
                    &mut diagnostics,
                    &mut seen_diagnostic_keys,
                    ExtendedLayoutDiagnostic {
                        code: "BADGE_BADGE_OVERLAP".to_string(),
                        severity: "error".to_string(),
                        message: format!(
                            "Badge for edge {} overlaps badge for edge {}",
                            b_a.edge_id, b_b.edge_id
                        ),
                        ids: vec![b_a.edge_id.clone(), b_b.edge_id.clone()],
                        segment: None,
                        rect: Some(b_a.rect),
                    },
                ) {
                    metrics.badge_badge_overlaps += 1;
                }
        }
    }

    // 8. Badge-unrelated-edge overlap check
    for badge in badges {
        for edge in edges {
            if edge.edge_id == badge.edge_id {
                continue;
            }
            if edge.points.len() < 2 {
                continue;
            }
            for k in 0..edge.points.len() - 1 {
                let seg = Segment {
                    a: edge.points[k],
                    b: edge.points[k + 1],
                };
                if segment_intersects_rect_interior(&seg, &badge.rect, config.epsilon)
                    && add_diagnostic(
                        &mut diagnostics,
                        &mut seen_diagnostic_keys,
                        ExtendedLayoutDiagnostic {
                            code: "BADGE_UNRELATED_EDGE_OVERLAP".to_string(),
                            severity: "warning".to_string(),
                            message: format!(
                                "Badge for edge {} overlaps unrelated edge {}",
                                badge.edge_id, edge.edge_id
                            ),
                            ids: vec![badge.edge_id.clone(), edge.edge_id.clone()],
                            segment: Some(seg),
                            rect: Some(badge.rect),
                        },
                    ) {
                        metrics.badge_unrelated_edge_overlaps += 1;
                    }
            }
        }
    }

    // 9. Leader collision check
    for badge in badges {
        if let Some(ref leader_points) = badge.leader_points {
            if leader_points.len() >= 2 {
                for k in 0..leader_points.len() - 1 {
                    let leader_seg = Segment {
                        a: leader_points[k],
                        b: leader_points[k + 1],
                    };

                    // Collides with node interior?
                    for node in nodes {
                        let Some(n_rect) = node_rect_map.get(&node.id) else {
                            continue;
                        };
                        if segment_intersects_rect_interior(&leader_seg, n_rect, config.epsilon) {
                            add_diagnostic(
                                &mut diagnostics,
                                &mut seen_diagnostic_keys,
                                ExtendedLayoutDiagnostic {
                                    code: "LEADER_COLLISION".to_string(),
                                    severity: "error".to_string(),
                                    message: format!(
                                        "Badge leader for edge {} collides with node {}",
                                        badge.edge_id, node.id
                                    ),
                                    ids: vec![badge.edge_id.clone(), node.id.clone()],
                                    segment: Some(leader_seg.clone()),
                                    rect: Some(*n_rect),
                                },
                            );
                        }
                    }

                    // Collides with another badge interior?
                    for b_other in badges {
                        if b_other.edge_id == badge.edge_id {
                            continue;
                        }
                        if segment_intersects_rect_interior(&leader_seg, &b_other.rect, config.epsilon) {
                            add_diagnostic(
                                &mut diagnostics,
                                &mut seen_diagnostic_keys,
                                ExtendedLayoutDiagnostic {
                                    code: "LEADER_COLLISION".to_string(),
                                    severity: "error".to_string(),
                                    message: format!(
                                        "Badge leader for edge {} collides with badge for edge {}",
                                        badge.edge_id, b_other.edge_id
                                    ),
                                    ids: vec![badge.edge_id.clone(), b_other.edge_id.clone()],
                                    segment: Some(leader_seg.clone()),
                                    rect: Some(b_other.rect),
                                },
                            );
                        }
                    }
                }
            }
        }
    }

    // Soft Metrics & Crossings
    let crossings = detect_edge_crossings(edges, edge_roles, config.epsilon);
    metrics.crossing_count = crossings.len();

    for edge in edges {
        if edge.points.len() < 2 {
            continue;
        }
        let simplified = simplify_orthogonal_path(&edge.points, config.epsilon);
        if simplified.len() > 2 {
            metrics.bend_count += simplified.len() - 2;
        }
        metrics.total_length += path_manhattan_length(&edge.points);

        for k in 0..edge.points.len() - 1 {
            let p1 = &edge.points[k];
            let p2 = &edge.points[k + 1];
            let dy = p2.y - p1.y;
            if dy < -config.epsilon {
                metrics.direction_deviation_penalty += dy.abs() * config.direction_penalty;
            }
        }
    }

    let mut node_side_count_map: HashMap<String, HashMap<Side, usize>> = HashMap::new();
    for edge in edges {
        node_side_count_map
            .entry(edge.source_port.node_id.clone())
            .or_default()
            .entry(edge.source_port.side)
            .and_modify(|c| *c += 1)
            .or_insert(1);

        node_side_count_map
            .entry(edge.target_port.node_id.clone())
            .or_default()
            .entry(edge.target_port.side)
            .and_modify(|c| *c += 1)
            .or_insert(1);
    }
    for (_, side_map) in node_side_count_map {
        for (_, count) in side_map {
            if count > 1 {
                metrics.port_side_reuse_penalty += ((count - 1) as f64) * config.side_reuse_penalty;
            }
        }
    }

    // Soft Metrics: Total Area calculation
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for node in nodes {
        min_x = min_x.min(node.x);
        min_y = min_y.min(node.y);
        max_x = max_x.max(node.x + node.width);
        max_y = max_y.max(node.y + node.height);
    }
    for edge in edges {
        for p in &edge.points {
            min_x = min_x.min(p.x);
            min_y = min_y.min(p.y);
            max_x = max_x.max(p.x);
            max_y = max_y.max(p.y);
        }
    }
    for badge in badges {
        min_x = min_x.min(badge.rect.x);
        min_y = min_y.min(badge.rect.y);
        max_x = max_x.max(badge.rect.x + badge.rect.width);
        max_y = max_y.max(badge.rect.y + badge.rect.height);
    }

    if min_x.is_finite() && max_x.is_finite() && max_x >= min_x && max_y >= min_y {
        metrics.total_area = (max_x - min_x) * (max_y - min_y);
    } else {
        metrics.total_area = 0.0;
    }

    let roles = edge_roles;
    let leader_metrics = calculate_leader_metrics(badges, roles);
    metrics.ordinary_leader_count = leader_metrics.ordinary_leader_count;
    metrics.feedback_leader_count = leader_metrics.feedback_leader_count;
    metrics.total_leader_length = leader_metrics.total_leader_length;

    let hairpin_metrics = calculate_hairpin_count(edges, roles, config.epsilon);
    metrics.hairpin_count = hairpin_metrics.total_hairpins;
    metrics.avoidable_hairpin_count = hairpin_metrics.avoidable_hairpins;
    metrics.excess_bend_count = calculate_excess_bends(edges, roles);
    metrics.port_side_imbalance = calculate_port_side_imbalance(nodes, edges);

    let has_error = diagnostics.iter().any(|d| d.severity == "error");
    let is_valid = !has_error;

    ExtendedLayoutValidationResult {
        is_valid,
        metrics,
        crossings,
        diagnostics,
    }
}

/// Checks if a validation result has any aesthetic defects.
pub fn has_aesthetic_defect(validation: &ExtendedLayoutValidationResult) -> bool {
    let metrics = &validation.metrics;
    metrics.badge_node_overlaps > 0
        || metrics.badge_badge_overlaps > 0
        || metrics.badge_unrelated_edge_overlaps > 0
        || metrics.crossing_count > 0
        || metrics.shared_edge_segment_length > 0.0
        || metrics.ordinary_leader_count > 0
        || metrics.avoidable_hairpin_count > 0
        || metrics.excess_bend_count > 0
}

/// Resolves the layout status string based on validation result.
pub fn resolve_layout_status(validation: &ExtendedLayoutValidationResult) -> String {
    if !validation.is_valid {
        "invalid_hard_failure".to_string()
    } else if validation.metrics.unresolved_badge_count > 0 || has_aesthetic_defect(validation) {
        "unresolved_soft_conflicts".to_string()
    } else {
        "success".to_string()
    }
}

/// Converts an extended layout validation result into a multi-criteria `LayoutScore` struct.
pub fn validation_result_to_score(
    res: &ExtendedLayoutValidationResult,
    _nodes: &[PositionedNode],
    _edges: &[RoutedPath],
    _badges: &[BadgePlacement],
    _edge_roles: Option<&HashMap<String, EdgeRole>>,
) -> LayoutScore {
    let hard_error_count = res.diagnostics.iter().filter(|d| d.severity == "error").count();

    LayoutScore {
        hard_error_count: if res.is_valid { hard_error_count } else { 1.max(hard_error_count) },
        unresolved_route_count: res.metrics.unresolved_route_count,
        node_node_overlaps: res.metrics.node_node_overlaps,
        edge_node_penetrations: res.metrics.edge_node_penetrations,
        shared_edge_segment_length: res.metrics.shared_edge_segment_length,
        unresolved_badge_count: res.metrics.unresolved_badge_count,
        badge_node_overlaps: res.metrics.badge_node_overlaps,
        badge_badge_overlaps: res.metrics.badge_badge_overlaps,
        badge_unrelated_edge_overlaps: res.metrics.badge_unrelated_edge_overlaps,
        crossing_count: res.metrics.crossing_count,
        ordinary_leader_count: res.metrics.ordinary_leader_count,
        avoidable_hairpin_count: res.metrics.avoidable_hairpin_count,
        excess_bend_count: res.metrics.excess_bend_count,
        hairpin_count: res.metrics.hairpin_count,
        bend_count: res.metrics.bend_count,
        direction_deviation_penalty: res.metrics.direction_deviation_penalty,
        total_length: res.metrics.total_length,
        port_side_imbalance: res.metrics.port_side_imbalance,
        feedback_leader_count: res.metrics.feedback_leader_count,
        total_leader_length: res.metrics.total_leader_length,
        total_area: res.metrics.total_area,
        state_hash: String::new(),
    }
}

pub struct LayoutEvaluationCandidate<'a> {
    pub result: &'a ExtendedLayoutValidationResult,
    pub edges: &'a [RoutedPath],
    pub badges: &'a [BadgePlacement],
}

/// Compares two layout validation results lexicographically.
pub fn compare_layout_scores(
    a: &LayoutEvaluationCandidate,
    b: &LayoutEvaluationCandidate,
    nodes: &[PositionedNode],
    edge_roles: Option<&HashMap<String, EdgeRole>>,
) -> std::cmp::Ordering {
    let score_a = validation_result_to_score(a.result, nodes, a.edges, a.badges, edge_roles);
    let score_b = validation_result_to_score(b.result, nodes, b.edges, b.badges, edge_roles);
    compare_layout_score(&score_a, &score_b)
}

/// Compares two layout validation results using user configured penalty weights.
pub fn compare_layout_scores_with_config(
    a: &LayoutEvaluationCandidate,
    b: &LayoutEvaluationCandidate,
    nodes: &[PositionedNode],
    edge_roles: Option<&HashMap<String, EdgeRole>>,
    config: &crate::config::CustomLayoutConfig,
) -> std::cmp::Ordering {
    let score_a = validation_result_to_score(a.result, nodes, a.edges, a.badges, edge_roles);
    let score_b = validation_result_to_score(b.result, nodes, b.edges, b.badges, edge_roles);
    compare_layout_score_with_config(&score_a, &score_b, config)
}
