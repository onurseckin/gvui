//! # Step 3.5: 21-Component Objective Function & Score Evaluator
//!
//! This module implements the 21-component hierarchical (lexicographical) `LayoutScore` evaluation,
//! hairpin U-turn detection, excess bend penalties, port side imbalance scoring, and badge leader metrics.
//!
//! ## 21-Level Hierarchical Score Ordering
//!
//! Layout candidates are evaluated using a strict 21-level lexicographical vector comparison.
//! Primary constraints (hard errors, overlaps, penetration) precede aesthetic metrics (crossings,
//! hairpins, bends, length).
//!
//! | Priority | Component Name | Description | Target |
//! | :--- | :--- | :--- | :--- |
//! | 1 | `hardErrorCount` | Critical structural or validation errors | Minimize (0) |
//! | 2 | `unresolvedRouteCount` | Unroutable or failed edge paths | Minimize (0) |
//! | 3 | `nodeNodeOverlaps` | Node box collisions in 2D layout | Minimize (0) |
//! | 4 | `edgeNodePenetrations` | Edge polylines cutting through node interiors | Minimize (0) |
//! | 5 | `sharedEdgeSegmentLength` | Overlapping collinear segment channel congestion | Minimize (0.0) |
//! | 6 | `unresolvedBadgeCount` | Unplaced edge label badges | Minimize (0) |
//! | 7 | `badgeNodeOverlaps` | Badge bounding box overlapping with node boxes | Minimize (0) |
//! | 8 | `badgeBadgeOverlaps` | Badge-badge overlaps | Minimize (0) |
//! | 9 | `badgeUnrelatedEdgeOverlaps` | Badge overlapping with unrelated edge paths | Minimize (0) |
//! | 10 | `crossingCount` | 2D edge-edge crossings | Minimize (0) |
//! | 11 | `ordinaryLeaderCount` | Badge leader lines on non-feedback edges | Minimize (0) |
//! | 12 | `avoidableHairpinCount` | Unnecessary 180-degree U-turn reversals | Minimize (0) |
//! | 13 | `excessBendCount` | Bends exceeding max limit (3 for forward, 4 for feedback) | Minimize (0) |
//! | 14 | `hairpinCount` | Total 180-degree U-turns across all routes | Minimize (0) |
//! | 15 | `bendCount` | Total orthogonal bends across all routes | Minimize |
//! | 16 | `directionDeviationPenalty` | Angular deviation penalty from ideal vector | Minimize (0.0) |
//! | 17 | `totalLength` | Total Manhattan edge routing length | Minimize |
//! | 18 | `portSideImbalance` | Variance of edge counts across 4 node sides | Minimize (0.0) |
//! | 19 | `feedbackLeaderCount` | Badge leader lines on feedback edges | Minimize (0) |
//! | 20 | `totalLeaderLength` | Total Manhattan length of badge leader lines | Minimize (0.0) |
//! | 21 | `totalArea` | Bounding box area footprint of entire layout | Minimize (0.0) |
//!
//! **Tie-breaker**: If all 21 metric components are identical between two scores, the tie is broken
//! deterministically using string comparison of `state_hash`.

use crate::types::{
    BadgePlacement, ClassifiedEdge, EdgeRole, LayoutScore, LayoutValidationResult, Point,
    PositionedNode, RoutedPath, Side,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Names of the 21 score components in order of lexicographical evaluation precedence.
pub static ORDER: &[&str] = &[
    "hardErrorCount",
    "unresolvedRouteCount",
    "nodeNodeOverlaps",
    "edgeNodePenetrations",
    "sharedEdgeSegmentLength",
    "unresolvedBadgeCount",
    "badgeNodeOverlaps",
    "badgeBadgeOverlaps",
    "badgeUnrelatedEdgeOverlaps",
    "crossingCount",
    "ordinaryLeaderCount",
    "avoidableHairpinCount",
    "excessBendCount",
    "hairpinCount",
    "bendCount",
    "directionDeviationPenalty",
    "totalLength",
    "portSideImbalance",
    "feedbackLeaderCount",
    "totalLeaderLength",
    "totalArea",
];

/// Compares two `LayoutScore` instances lexicographically across all 21 priority levels.
pub fn compare_layout_score(a: &LayoutScore, b: &LayoutScore) -> std::cmp::Ordering {
    let cmp = a
        .hard_error_count
        .cmp(&b.hard_error_count)
        .then_with(|| a.unresolved_route_count.cmp(&b.unresolved_route_count))
        .then_with(|| a.node_node_overlaps.cmp(&b.node_node_overlaps))
        .then_with(|| a.edge_node_penetrations.cmp(&b.edge_node_penetrations))
        .then_with(|| {
            a.shared_edge_segment_length
                .partial_cmp(&b.shared_edge_segment_length)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .then_with(|| a.unresolved_badge_count.cmp(&b.unresolved_badge_count))
        .then_with(|| a.badge_node_overlaps.cmp(&b.badge_node_overlaps))
        .then_with(|| a.badge_badge_overlaps.cmp(&b.badge_badge_overlaps))
        .then_with(|| a.badge_unrelated_edge_overlaps.cmp(&b.badge_unrelated_edge_overlaps))
        .then_with(|| a.crossing_count.cmp(&b.crossing_count))
        .then_with(|| a.ordinary_leader_count.cmp(&b.ordinary_leader_count))
        .then_with(|| a.avoidable_hairpin_count.cmp(&b.avoidable_hairpin_count))
        .then_with(|| a.excess_bend_count.cmp(&b.excess_bend_count))
        .then_with(|| a.hairpin_count.cmp(&b.hairpin_count))
        .then_with(|| a.bend_count.cmp(&b.bend_count))
        .then_with(|| {
            a.direction_deviation_penalty
                .partial_cmp(&b.direction_deviation_penalty)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .then_with(|| {
            a.total_length
                .partial_cmp(&b.total_length)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .then_with(|| {
            a.port_side_imbalance
                .partial_cmp(&b.port_side_imbalance)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .then_with(|| a.feedback_leader_count.cmp(&b.feedback_leader_count))
        .then_with(|| {
            a.total_leader_length
                .partial_cmp(&b.total_leader_length)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .then_with(|| {
            a.total_area
                .partial_cmp(&b.total_area)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

    if cmp != std::cmp::Ordering::Equal {
        return cmp;
    }
    a.state_hash.cmp(&b.state_hash)
}

/// Simplifies orthogonal polyline path points by collapsing redundant collinear segments.
pub fn simplify_orthogonal_path(points: &[Point], epsilon: f64) -> Vec<Point> {
    if points.len() <= 1 {
        return points.to_vec();
    }

    // Step 1: Filter duplicate adjacent points
    let mut non_dupes = vec![points[0]];
    for curr in points.iter().skip(1) {
        let prev = non_dupes.last().unwrap();
        if (curr.x - prev.x).abs() > epsilon || (curr.y - prev.y).abs() > epsilon {
            non_dupes.push(*curr);
        }
    }

    if non_dupes.len() <= 2 {
        return non_dupes;
    }

    // Step 2: Remove collinear middle points
    let mut result = vec![non_dupes[0]];
    for i in 1..(non_dupes.len() - 1) {
        let prev = result.last().unwrap();
        let curr = &non_dupes[i];
        let next = &non_dupes[i + 1];

        let is_collinear_x =
            (prev.x - curr.x).abs() <= epsilon && (curr.x - next.x).abs() <= epsilon;
        let is_collinear_y =
            (prev.y - curr.y).abs() <= epsilon && (curr.y - next.y).abs() <= epsilon;

        if !is_collinear_x && !is_collinear_y {
            result.push(*curr);
        }
    }

    result.push(*non_dupes.last().unwrap());
    result
}

/// Direction enum for orthogonal polyline segments.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SegmentDirection {
    Up,
    Right,
    Down,
    Left,
}

/// Counts 180-degree U-turn hairpins along a simplified orthogonal polyline path.
pub fn count_path_hairpins(points: &[Point], epsilon: f64) -> usize {
    if points.len() < 4 {
        return 0;
    }
    let simplified = simplify_orthogonal_path(points, epsilon);
    if simplified.len() < 4 {
        return 0;
    }

    let mut directions = Vec::new();
    for i in 0..(simplified.len() - 1) {
        let p1 = &simplified[i];
        let p2 = &simplified[i + 1];
        let dx = p2.x - p1.x;
        let dy = p2.y - p1.y;
        if dx.abs() > dy.abs() {
            directions.push(if dx > 0.0 {
                SegmentDirection::Right
            } else {
                SegmentDirection::Left
            });
        } else if dy.abs() > 0.0 {
            directions.push(if dy > 0.0 {
                SegmentDirection::Down
            } else {
                SegmentDirection::Up
            });
        }
    }

    let mut count = 0;
    if directions.len() >= 3 {
        for i in 0..(directions.len() - 2) {
            let d1 = directions[i];
            let d2 = directions[i + 2];
            if (d1 == SegmentDirection::Up && d2 == SegmentDirection::Down)
                || (d1 == SegmentDirection::Down && d2 == SegmentDirection::Up)
                || (d1 == SegmentDirection::Left && d2 == SegmentDirection::Right)
                || (d1 == SegmentDirection::Right && d2 == SegmentDirection::Left)
            {
                count += 1;
            }
        }
    }
    count
}

/// Trait providing edge role lookup capability for arbitrary collections or maps.
pub trait EdgeRoleProvider {
    fn get_role(&self, edge_id: &str) -> Option<EdgeRole>;
}

impl EdgeRoleProvider for &[ClassifiedEdge] {
    fn get_role(&self, edge_id: &str) -> Option<EdgeRole> {
        self.iter().find(|e| e.edge.id == edge_id).map(|e| e.role)
    }
}

impl EdgeRoleProvider for Option<&HashMap<String, EdgeRole>> {
    fn get_role(&self, edge_id: &str) -> Option<EdgeRole> {
        self.and_then(|map| map.get(edge_id).copied())
    }
}

impl EdgeRoleProvider for Option<HashMap<String, EdgeRole>> {
    fn get_role(&self, edge_id: &str) -> Option<EdgeRole> {
        self.as_ref().and_then(|map| map.get(edge_id).copied())
    }
}

impl EdgeRoleProvider for HashMap<String, EdgeRole> {
    fn get_role(&self, edge_id: &str) -> Option<EdgeRole> {
        self.get(edge_id).copied()
    }
}

/// Helper function to retrieve edge role via `EdgeRoleProvider`.
pub fn get_edge_role<P: EdgeRoleProvider>(edge_id: &str, provider: P) -> Option<EdgeRole> {
    provider.get_role(edge_id)
}

/// Metrics for badge leader line segments.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeaderMetrics {
    pub ordinary_leader_count: usize,
    pub feedback_leader_count: usize,
    pub total_leader_length: f64,
}

/// Hairpin counts separated into total and avoidable hairpins.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HairpinMetrics {
    pub total_hairpins: usize,
    pub avoidable_hairpins: usize,
}

/// Computes total Manhattan length for a sequence of points.
pub fn path_manhattan_length(points: &[Point]) -> f64 {
    let mut total = 0.0;
    for i in 0..(points.len().saturating_sub(1)) {
        let p1 = &points[i];
        let p2 = &points[i + 1];
        total += (p2.x - p1.x).abs() + (p2.y - p1.y).abs();
    }
    total
}

/// Calculates badge leader metrics across all badge placements.
pub fn calculate_leader_metrics<P: EdgeRoleProvider>(
    badges: &[BadgePlacement],
    roles: P,
) -> LeaderMetrics {
    let mut ordinary_leader_count = 0;
    let mut feedback_leader_count = 0;
    let mut total_leader_length = 0.0;

    for badge in badges {
        if let Some(leader_points) = &badge.leader_points {
            if leader_points.len() >= 2 {
                total_leader_length += path_manhattan_length(leader_points);
                let role = roles.get_role(&badge.edge_id);
                if matches!(role, Some(EdgeRole::Feedback) | Some(EdgeRole::SelfLoop) | Some(EdgeRole::SelfRole)) {
                    feedback_leader_count += 1;
                } else {
                    ordinary_leader_count += 1;
                }
            }
        }
    }

    LeaderMetrics {
        ordinary_leader_count,
        feedback_leader_count,
        total_leader_length,
    }
}

/// Calculates total and avoidable hairpins for routed paths.
pub fn calculate_hairpin_count<P: EdgeRoleProvider>(
    edges: &[RoutedPath],
    roles: P,
    epsilon: f64,
) -> HairpinMetrics {
    let mut total_hairpins = 0;
    let mut avoidable_hairpins = 0;

    for edge in edges {
        if edge.points.len() >= 2 {
            let count = count_path_hairpins(&edge.points, epsilon);
            total_hairpins += count;
            let role = roles.get_role(&edge.edge_id);
            let is_structurally_necessary =
                matches!(role, Some(EdgeRole::Feedback) | Some(EdgeRole::SelfLoop) | Some(EdgeRole::SelfRole));
            if !is_structurally_necessary {
                avoidable_hairpins += count;
            } else if count > 1 {
                avoidable_hairpins += count - 1;
            }
        }
    }

    HairpinMetrics {
        total_hairpins,
        avoidable_hairpins,
    }
}

/// Calculates total excess bends exceeding role limits (3 for forward edges, 4 for feedback edges).
pub fn calculate_excess_bends<P: EdgeRoleProvider>(edges: &[RoutedPath], roles: P) -> usize {
    let mut excess = 0;

    for edge in edges {
        if edge.points.len() >= 2 {
            let simplified = simplify_orthogonal_path(&edge.points, 0.001);
            let bend_count = simplified.len().saturating_sub(2);
            let role = roles.get_role(&edge.edge_id);
            let max_allowed = if matches!(role, Some(EdgeRole::Feedback) | Some(EdgeRole::SelfLoop) | Some(EdgeRole::SelfRole)) {
                4
            } else {
                3
            };
            if bend_count > max_allowed {
                excess += bend_count - max_allowed;
            }
        }
    }

    excess
}

/// Calculates port side imbalance penalty (variance of edge connection counts across the 4 sides of each node).
pub fn calculate_port_side_imbalance(nodes: &[PositionedNode], edges: &[RoutedPath]) -> f64 {
    let mut node_side_counts: HashMap<String, [usize; 4]> = HashMap::new(); // [top, right, bottom, left]

    for node in nodes {
        node_side_counts.entry(node.id.clone()).or_insert([0, 0, 0, 0]);
    }

    let side_to_idx = |side: Side| -> usize {
        match side {
            Side::Top => 0,
            Side::Right => 1,
            Side::Bottom => 2,
            Side::Left => 3,
        }
    };

    for edge in edges {
        let counts_src = node_side_counts.entry(edge.source_port.node_id.clone()).or_insert([0, 0, 0, 0]);
        counts_src[side_to_idx(edge.source_port.side)] += 1;

        let counts_tgt = node_side_counts.entry(edge.target_port.node_id.clone()).or_insert([0, 0, 0, 0]);
        counts_tgt[side_to_idx(edge.target_port.side)] += 1;
    }

    let mut total_imbalance = 0.0;
    for counts in node_side_counts.values() {
        let min_count = counts.iter().copied().min().unwrap_or(0);
        let imbalance = counts
            .iter()
            .map(|&c| ((c as f64) - (min_count as f64)).powi(2))
            .sum::<f64>();
        total_imbalance += imbalance;
    }

    total_imbalance
}

/// Constructs a complete 21-component `LayoutScore` object from layout data and validation results.
pub fn build_layout_score(
    nodes: &[PositionedNode],
    edges: &[RoutedPath],
    badges: &[BadgePlacement],
    validation: &LayoutValidationResult,
    classified_edges: &[ClassifiedEdge],
    state_hash: String,
) -> LayoutScore {
    let hard_error_count = validation
        .diagnostics
        .iter()
        .filter(|d| d.severity == "error")
        .count();

    let leader_metrics = calculate_leader_metrics(badges, classified_edges);
    let hairpin_metrics = calculate_hairpin_count(edges, classified_edges, 0.001);
    let excess_bends = calculate_excess_bends(edges, classified_edges);
    let port_side_imbalance = calculate_port_side_imbalance(nodes, edges);

    LayoutScore {
        hard_error_count,
        unresolved_route_count: validation.metrics.unresolved_route_count,
        node_node_overlaps: validation.metrics.node_node_overlaps,
        edge_node_penetrations: validation.metrics.edge_node_penetrations,
        shared_edge_segment_length: validation.metrics.shared_edge_segment_length,
        unresolved_badge_count: validation.metrics.unresolved_badge_count,
        badge_node_overlaps: validation.metrics.badge_node_overlaps,
        badge_badge_overlaps: validation.metrics.badge_badge_overlaps,
        badge_unrelated_edge_overlaps: validation.metrics.badge_unrelated_edge_overlaps,
        crossing_count: validation.metrics.crossing_count,
        ordinary_leader_count: if validation.metrics.ordinary_leader_count > 0 {
            validation.metrics.ordinary_leader_count
        } else {
            leader_metrics.ordinary_leader_count
        },
        avoidable_hairpin_count: if validation.metrics.avoidable_hairpin_count > 0 {
            validation.metrics.avoidable_hairpin_count
        } else {
            hairpin_metrics.avoidable_hairpins
        },
        excess_bend_count: if validation.metrics.excess_bend_count > 0 {
            validation.metrics.excess_bend_count
        } else {
            excess_bends
        },
        hairpin_count: if validation.metrics.hairpin_count > 0 {
            validation.metrics.hairpin_count
        } else {
            hairpin_metrics.total_hairpins
        },
        bend_count: validation.metrics.bend_count,
        direction_deviation_penalty: validation.metrics.direction_deviation_penalty,
        total_length: validation.metrics.total_length,
        port_side_imbalance: if validation.metrics.port_side_imbalance > 0.0 {
            validation.metrics.port_side_imbalance
        } else {
            port_side_imbalance
        },
        feedback_leader_count: if validation.metrics.feedback_leader_count > 0 {
            validation.metrics.feedback_leader_count
        } else {
            leader_metrics.feedback_leader_count
        },
        total_leader_length: if validation.metrics.total_leader_length > 0.0 {
            validation.metrics.total_leader_length
        } else {
            leader_metrics.total_leader_length
        },
        total_area: validation.metrics.total_area,
        state_hash,
    }
}
