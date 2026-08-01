//! # Spacing Demand Resolver
//!
//! Handles badge gap requirements, exact demand canonicalization, and spacing override resolution
//! for rank-level and node-level layout spacing constraints.

use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
pub use crate::types::{
    BadgeRequestKind, BadgeRequestReason, BadgeSpacingRequest, DemandKind, DemandReason,
    ExactSpacingDemand, LayerNode, MeasuredBadge, NormalizedEdge, NormalizedNode, SpacingOverrides,
};

/// Calculates required gap between nodes in the same rank when an edge has a badge.
pub fn required_same_rank_badge_gap(badge_width: f64, config: &CustomLayoutConfig) -> f64 {
    badge_width + 2.0 * config.badge_clearance + 2.0 * config.port_stub_length
}

/// Maps demand kind to primary layout axis ("x" or "y").
fn spacing_axis(kind: DemandKind) -> &'static str {
    match kind {
        DemandKind::NodeGap | DemandKind::LaneX => "x",
        DemandKind::RankGap | DemandKind::LaneY => "y",
        DemandKind::GraphPadding => "padding",
    }
}

/// Computes unique scope key for grouping exact spacing demands during canonicalization.
fn spacing_demand_scope_key(demand: &ExactSpacingDemand) -> String {
    format!(
        "{}:{}:{}",
        spacing_axis(demand.kind),
        demand.rank.map_or("global".to_string(), |r| r.to_string()),
        demand.after_node_id.as_deref().unwrap_or("")
    )
}

/// Computes representative key for deterministic tie-breaking.
fn spacing_demand_representative_key(demand: &ExactSpacingDemand) -> String {
    format!("{}:{}", demand.kind, demand.reason)
}

/// Canonicalizes a list of spacing demands by grouping by scope, taking the maximum minimum constraint,
/// and deduplicating affected edge IDs.
pub fn canonicalize_exact_spacing_demands(
    demands: &[ExactSpacingDemand],
) -> Vec<ExactSpacingDemand> {
    let mut by_scope: HashMap<String, ExactSpacingDemand> = HashMap::new();

    for demand in demands {
        let key = spacing_demand_scope_key(demand);
        let existing = by_scope.get(&key);

        let mut affected_edge_ids = existing
            .map(|e| e.affected_edge_ids.clone())
            .unwrap_or_default();
        affected_edge_ids.extend(demand.affected_edge_ids.clone());
        affected_edge_ids.sort();
        affected_edge_ids.dedup();

        let update = match existing {
            None => true,
            Some(ex) => {
                if demand.minimum > ex.minimum {
                    true
                } else if (demand.minimum - ex.minimum).abs() < 1e-9 {
                    spacing_demand_representative_key(demand)
                        .cmp(&spacing_demand_representative_key(ex))
                        .is_lt()
                } else {
                    false
                }
            }
        };

        if update {
            let mut new_d = demand.clone();
            new_d.affected_edge_ids = affected_edge_ids;
            by_scope.insert(key, new_d);
        } else if let Some(ex) = by_scope.get_mut(&key) {
            ex.affected_edge_ids = affected_edge_ids;
        }
    }

    let mut keys: Vec<String> = by_scope.keys().cloned().collect();
    keys.sort();

    keys.into_iter().map(|k| by_scope.remove(&k).unwrap()).collect()
}

/// Computes a string signature for a set of exact spacing demands after canonicalization.
pub fn exact_spacing_demand_signature(demands: &[ExactSpacingDemand]) -> String {
    canonicalize_exact_spacing_demands(demands)
        .iter()
        .map(|demand| format!("{}:{}", spacing_demand_scope_key(demand), demand.minimum))
        .collect::<Vec<_>>()
        .join(";")
}

/// Computes badge spacing requests required by edge labels given measured badge sizes and node ranks.
pub fn compute_badge_spacing_demands(
    _nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    badge_measurements: &HashMap<String, MeasuredBadge>,
    ranks: &HashMap<String, usize>,
    config: &CustomLayoutConfig,
) -> Vec<BadgeSpacingRequest> {
    let mut requests: Vec<BadgeSpacingRequest> = Vec::new();
    let mut pair_groups: HashMap<String, Vec<(&NormalizedEdge, &MeasuredBadge)>> = HashMap::new();

    for edge in edges {
        let Some(badge) = badge_measurements.get(&edge.id) else {
            continue;
        };
        if badge.width <= 0.0 || badge.height <= 0.0 {
            continue;
        }

        let pair_key = if edge.source < edge.target {
            format!("{}::{}", edge.source, edge.target)
        } else {
            format!("{}::{}", edge.target, edge.source)
        };

        pair_groups
            .entry(pair_key)
            .or_default()
            .push((edge, badge));
    }

    for group in pair_groups.values() {
        if group.is_empty() {
            continue;
        }

        let first_edge = group[0].0;
        let r_u = ranks.get(&first_edge.source);
        let r_v = ranks.get(&first_edge.target);

        let (Some(&r_u), Some(&r_v)) = (r_u, r_v) else {
            continue;
        };

        if group.len() == 1 {
            let (edge, badge) = group[0];
            if r_u == r_v {
                let min_gap = required_same_rank_badge_gap(badge.width, config);
                requests.push(BadgeSpacingRequest {
                    edge_id: edge.id.clone(),
                    kind: BadgeRequestKind::NodeGap,
                    rank: Some(r_u),
                    after_node_id: Some(edge.source.clone()),
                    minimum: min_gap,
                    reason: BadgeRequestReason::SameRankLabel,
                });
                requests.push(BadgeSpacingRequest {
                    edge_id: edge.id.clone(),
                    kind: BadgeRequestKind::NodeGap,
                    rank: Some(r_u),
                    after_node_id: Some(edge.target.clone()),
                    minimum: min_gap,
                    reason: BadgeRequestReason::SameRankLabel,
                });
            } else {
                let required_height =
                    badge.height + 2.0 * config.badge_clearance + 2.0 * config.port_stub_length;
                if required_height > config.rank_gap {
                    requests.push(BadgeSpacingRequest {
                        edge_id: edge.id.clone(),
                        kind: BadgeRequestKind::RankGap,
                        rank: Some(r_u.min(r_v)),
                        after_node_id: None,
                        minimum: required_height,
                        reason: BadgeRequestReason::BlockedDirectBadge,
                    });
                }
            }
        } else if r_u == r_v {
            let sum_width: f64 = group.iter().map(|item| item.1.width).sum();
            let total_minimum = sum_width + ((group.len() + 1) as f64) * config.badge_clearance;

            for (edge, _) in group {
                requests.push(BadgeSpacingRequest {
                    edge_id: edge.id.clone(),
                    kind: BadgeRequestKind::NodeGap,
                    rank: Some(r_u),
                    after_node_id: Some(edge.source.clone()),
                    minimum: total_minimum,
                    reason: BadgeRequestReason::ParallelLabels,
                });
            }
        } else {
            let sum_height: f64 = group.iter().map(|item| item.1.height).sum();
            let total_minimum = sum_height
                + ((group.len() + 1) as f64) * config.badge_clearance
                + 2.0 * config.port_stub_length;
            let minimum = config.rank_gap.max(total_minimum);

            for (edge, _) in group {
                requests.push(BadgeSpacingRequest {
                    edge_id: edge.id.clone(),
                    kind: BadgeRequestKind::RankGap,
                    rank: Some(r_u.min(r_v)),
                    after_node_id: None,
                    minimum,
                    reason: BadgeRequestReason::ParallelLabels,
                });
            }
        }
    }

    requests
}

/// Resolves effective spacing overrides from badge spacing requests.
pub fn resolve_effective_spacing_overrides(
    requests: &[BadgeSpacingRequest],
    default_node_gap: f64,
    default_rank_gap: f64,
) -> SpacingOverrides {
    let mut overrides = SpacingOverrides::default();

    for req in requests {
        if req.kind == BadgeRequestKind::NodeGap {
            if let Some(r) = req.rank {
                let map = overrides.node_gap_by_rank.get_or_insert_with(HashMap::new);
                let curr = *map.get(&r).unwrap_or(&default_node_gap);
                map.insert(r, curr.max(req.minimum));
            }
            if let Some(ref nid) = req.after_node_id {
                let map = overrides.node_gap_after_node_id.get_or_insert_with(HashMap::new);
                let curr = *map.get(nid).unwrap_or(&default_node_gap);
                map.insert(nid.clone(), curr.max(req.minimum));
            }
        } else if req.kind == BadgeRequestKind::RankGap {
            if let Some(r) = req.rank {
                let map = overrides.rank_gap_after_rank.get_or_insert_with(HashMap::new);
                let curr = *map.get(&r).unwrap_or(&default_rank_gap);
                map.insert(r, curr.max(req.minimum));
            }
        }
    }

    overrides
}

/// Resolves exact spacing demands into concrete layout spacing overrides.
pub fn resolve_exact_spacing_demands(
    demands: &[ExactSpacingDemand],
    default_node_gap: f64,
    default_rank_gap: f64,
) -> SpacingOverrides {
    let mut overrides = SpacingOverrides::default();
    let mut global_node_gap = default_node_gap;
    let mut global_rank_gap = default_rank_gap;

    for d in demands {
        if d.kind == DemandKind::NodeGap || d.kind == DemandKind::LaneX {
            if let Some(r) = d.rank {
                let map = overrides.node_gap_by_rank.get_or_insert_with(HashMap::new);
                let curr = *map.get(&r).unwrap_or(&default_node_gap);
                map.insert(r, curr.max(d.minimum));
            }
            if let Some(ref nid) = d.after_node_id {
                let map = overrides.node_gap_after_node_id.get_or_insert_with(HashMap::new);
                let curr = *map.get(nid).unwrap_or(&default_node_gap);
                map.insert(nid.clone(), curr.max(d.minimum));
            }
            if d.rank.is_none() && d.after_node_id.is_none() {
                global_node_gap = global_node_gap.max(d.minimum);
            }
        } else if d.kind == DemandKind::RankGap || d.kind == DemandKind::LaneY {
            if let Some(r) = d.rank {
                let map = overrides.rank_gap_after_rank.get_or_insert_with(HashMap::new);
                let curr = *map.get(&r).unwrap_or(&default_rank_gap);
                map.insert(r, curr.max(d.minimum));
            } else {
                global_rank_gap = global_rank_gap.max(d.minimum);
            }
        }
    }

    overrides.global_node_gap = Some(global_node_gap);
    overrides.global_rank_gap = Some(global_rank_gap);
    overrides
}

/// Resolves the effective rank gap following rank `rank`, taking into account config defaults and overrides.
pub fn get_effective_rank_gap(
    rank: usize,
    spacing_overrides: Option<&SpacingOverrides>,
    config: &CustomLayoutConfig,
) -> f64 {
    let Some(overrides) = spacing_overrides else {
        return config.rank_gap;
    };

    let override1 = overrides
        .rank_gap_after_rank
        .as_ref()
        .and_then(|m| m.get(&rank))
        .copied();
    let override2 = overrides
        .rank_gaps
        .as_ref()
        .and_then(|m| m.get(&rank))
        .copied();
    let global_rank_gap = overrides.global_rank_gap.unwrap_or(0.0);

    config
        .rank_gap
        .max(global_rank_gap)
        .max(override1.unwrap_or(0.0))
        .max(override2.unwrap_or(0.0))
}

/// Resolves the effective node gap for a given node in rank `rank`, matching on node ID or original node ID.
pub fn get_effective_node_gap(
    rank: usize,
    node: &LayerNode,
    spacing_overrides: Option<&SpacingOverrides>,
    config: &CustomLayoutConfig,
) -> f64 {
    let Some(overrides) = spacing_overrides else {
        return config.node_gap;
    };

    let mut target_ids = vec![node.id.as_str()];
    if let Some(ref orig_id) = node.original_node_id {
        if orig_id != &node.id {
            target_ids.push(orig_id.as_str());
        }
    }

    let mut override_node_id: Option<f64> = None;
    if let Some(ref map) = overrides.node_gap_after_node_id {
        for id in &target_ids {
            if let Some(&val) = map.get(*id) {
                override_node_id = Some(override_node_id.map_or(val, |curr| curr.max(val)));
            }
        }
    }

    let mut override_node_gaps: Option<f64> = None;
    if let Some(ref map) = overrides.node_gaps {
        for id in &target_ids {
            if let Some(&val) = map.get(*id) {
                override_node_gaps = Some(override_node_gaps.map_or(val, |curr| curr.max(val)));
            }
        }
    }

    let override_rank = overrides
        .node_gap_by_rank
        .as_ref()
        .and_then(|m| m.get(&rank))
        .copied();

    let global_node_gap = overrides.global_node_gap.unwrap_or(0.0);

    config
        .node_gap
        .max(global_node_gap)
        .max(override_node_id.unwrap_or(0.0))
        .max(override_node_gaps.unwrap_or(0.0))
        .max(override_rank.unwrap_or(0.0))
}
