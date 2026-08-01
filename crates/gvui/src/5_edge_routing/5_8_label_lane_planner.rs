//! Step 5.8: Label Lane Demand Planning.
//!
//! This module analyzes badge placement overlaps against parallel edge channels and node ranks,
//! generating `ExactSpacingDemand` requests to dynamically expand inter-rank ($Y$) or inter-node ($X$)
//! spacing during layout iterations.

use std::collections::{HashMap, HashSet};
use crate::config::CustomLayoutConfig;
use crate::geometry::rects_overlap_strict;
use crate::types::{BadgePlacement, DemandKind, DemandReason, ExactSpacingDemand, RoutedPath};

/// Contextual data required for evaluating label lane demands.
pub struct LabelLanePlannerContext<'a> {
    pub rank_by_node_id: &'a HashMap<String, usize>,
    pub layer_node_ids: &'a [Vec<String>],
    pub node_gap_by_rank: Option<&'a HashMap<usize, f64>>,
    pub rank_gap_after_rank: Option<&'a HashMap<usize, f64>>,
}

type RouteAxis = &'static str; // "horizontal" or "vertical"

struct LabelRouteMetadata<'a> {
    placement: &'a BadgePlacement,
    route: &'a RoutedPath,
    axis: Option<RouteAxis>,
    endpoint_ranks: Vec<usize>,
    endpoint_rank_set: HashSet<usize>,
    rank_boundaries: Vec<usize>,
    rank_boundary_set: HashSet<usize>,
}

fn ranges_overlap(a_start: f64, a_end: f64, b_start: f64, b_end: f64) -> bool {
    a_end.min(b_end) > a_start.max(b_start)
}

fn route_axis_at_badge(
    route: &RoutedPath,
    badge: &BadgePlacement,
    epsilon: f64,
) -> Option<RouteAxis> {
    let mut vertical_coverage = 0.0;
    let mut horizontal_coverage = 0.0;

    for index in 0..route.points.len().saturating_sub(1) {
        let a = &route.points[index];
        let b = &route.points[index + 1];
        if (a.x - b.x).abs() <= epsilon {
            if a.x > badge.rect.x + epsilon
                && a.x < badge.rect.x + badge.rect.width - epsilon
                && ranges_overlap(a.y, b.y, badge.rect.y, badge.rect.y + badge.rect.height)
            {
                vertical_coverage += (b.y - a.y).abs();
            }
        } else if a.y > badge.rect.y + epsilon
            && a.y < badge.rect.y + badge.rect.height - epsilon
            && ranges_overlap(a.x, b.x, badge.rect.x, badge.rect.x + badge.rect.width)
        {
            horizontal_coverage += (b.x - a.x).abs();
        }
    }

    if vertical_coverage == 0.0 && horizontal_coverage == 0.0 {
        None
    } else if vertical_coverage >= horizontal_coverage {
        Some("vertical")
    } else {
        Some("horizontal")
    }
}

fn shared_movable_rank(
    left: &LabelRouteMetadata,
    right: &LabelRouteMetadata,
    context: &LabelLanePlannerContext,
) -> Option<usize> {
    left.endpoint_ranks
        .iter()
        .find(|&&rank| {
            right.endpoint_rank_set.contains(&rank)
                && context.layer_node_ids.get(rank).map_or(0, |l| l.len()) >= 2
        })
        .copied()
}

fn shared_rank_boundary(
    left: &LabelRouteMetadata,
    right: &LabelRouteMetadata,
    context: &LabelLanePlannerContext,
) -> Option<usize> {
    left.rank_boundaries
        .iter()
        .find(|&&rank| {
            right.rank_boundary_set.contains(&rank)
                && context.layer_node_ids.get(rank).is_some()
                && context.layer_node_ids.get(rank + 1).is_some()
        })
        .copied()
}

/// Evaluates badge placement overlaps against parallel edge channels and node ranks,
/// returning spacing demand requests to expand rank or node gaps.
pub fn plan_label_lane_demands(
    placements: &[BadgePlacement],
    routes: &[RoutedPath],
    config: &CustomLayoutConfig,
    context: &LabelLanePlannerContext,
) -> Vec<ExactSpacingDemand> {
    let routes_by_edge_id: HashMap<String, &RoutedPath> =
        routes.iter().map(|r| (r.edge_id.clone(), r)).collect();

    let route_metadata: Vec<Option<LabelRouteMetadata>> = placements
        .iter()
        .map(|placement| {
            let route = *routes_by_edge_id.get(&placement.edge_id)?;
            let source_rank = context.rank_by_node_id.get(&route.source_port.node_id).copied();
            let target_rank = context.rank_by_node_id.get(&route.target_port.node_id).copied();

            let mut endpoint_ranks = Vec::new();
            if let Some(r) = source_rank {
                endpoint_ranks.push(r);
            }
            if let Some(r) = target_rank {
                endpoint_ranks.push(r);
            }
            let endpoint_rank_set: HashSet<usize> = endpoint_ranks.iter().copied().collect();

            let rank_boundaries = match (source_rank, target_rank) {
                (Some(s_r), Some(t_r)) if s_r != t_r => {
                    let min_r = s_r.min(t_r);
                    let max_r = s_r.max(t_r);
                    (min_r..max_r).collect()
                }
                _ => Vec::new(),
            };
            let rank_boundary_set: HashSet<usize> = rank_boundaries.iter().copied().collect();

            Some(LabelRouteMetadata {
                placement,
                route,
                axis: route_axis_at_badge(route, placement, config.epsilon),
                endpoint_ranks,
                endpoint_rank_set,
                rank_boundaries,
                rank_boundary_set,
            })
        })
        .collect();

    let mut demands: Vec<ExactSpacingDemand> = Vec::new();

    // 1. Badge vs Badge Overlap Demands
    for i in 0..route_metadata.len() {
        let Some(ref left) = route_metadata[i] else {
            continue;
        };
        let Some(left_axis) = left.axis else {
            continue;
        };

        for meta_right in route_metadata.iter().skip(i + 1) {
            let Some(ref right) = meta_right else {
                continue;
            };
            if right.axis != Some(left_axis)
                || !rects_overlap_strict(&left.placement.rect, &right.placement.rect, config.epsilon)
            {
                continue;
            }

            let mut affected_edge_ids = vec![
                left.placement.edge_id.clone(),
                right.placement.edge_id.clone(),
            ];
            affected_edge_ids.sort();

            if left_axis == "vertical" {
                let rank = shared_movable_rank(left, right, context);
                let minimum =
                    left.placement.rect.width + right.placement.rect.width + 2.0 * config.badge_clearance;
                let current = rank
                    .and_then(|r| context.node_gap_by_rank.and_then(|m| m.get(&r).copied()))
                    .unwrap_or(config.node_gap);

                if let Some(r) = rank {
                    if minimum > current + config.epsilon {
                        demands.push(ExactSpacingDemand {
                            kind: DemandKind::LaneX,
                            rank: Some(r),
                            after_node_id: None,
                            affected_edge_ids,
                            minimum,
                            reason: DemandReason::ParallelLabels,
                        });
                    }
                }
            } else {
                let rank = shared_rank_boundary(left, right, context);
                let minimum =
                    left.placement.rect.height + right.placement.rect.height + 2.0 * config.badge_clearance;
                let current = rank
                    .and_then(|r| context.rank_gap_after_rank.and_then(|m| m.get(&r).copied()))
                    .unwrap_or(config.rank_gap);

                if let Some(r) = rank {
                    if minimum > current + config.epsilon {
                        demands.push(ExactSpacingDemand {
                            kind: DemandKind::LaneY,
                            rank: Some(r),
                            after_node_id: None,
                            affected_edge_ids,
                            minimum,
                            reason: DemandReason::ParallelLabels,
                        });
                    }
                }
            }
        }
    }

    // 2. Badge vs Node Overlap Demands
    for meta_opt in &route_metadata {
        let Some(ref meta) = meta_opt else {
            continue;
        };
        let badge = meta.placement;
        let route = meta.route;
        let src_rank = context.rank_by_node_id.get(&route.source_port.node_id).copied();
        let tgt_rank = context.rank_by_node_id.get(&route.target_port.node_id).copied();

        if let (Some(s_r), Some(t_r)) = (src_rank, tgt_rank) {
            if s_r == t_r {
                if let Some(nodes_on_rank) = context.layer_node_ids.get(s_r) {
                    if nodes_on_rank.len() >= 2 {
                        let minimum = badge.rect.width + 2.0 * config.badge_clearance + 20.0;
                        let current = context
                            .node_gap_by_rank
                            .and_then(|m| m.get(&s_r).copied())
                            .unwrap_or(config.node_gap);

                        if minimum > current + config.epsilon {
                            demands.push(ExactSpacingDemand {
                                kind: DemandKind::LaneX,
                                rank: Some(s_r),
                                after_node_id: None,
                                affected_edge_ids: vec![badge.edge_id.clone()],
                                minimum,
                                reason: DemandReason::NodeOverlap,
                            });
                        }
                    }
                }
            }
        }
    }

    demands
}
