use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
use crate::types::{
    BadgeRequestKind, DemandKind, DemandReason, NormalizedEdge, NormalizedNode,
};
use super::super::spacing_demand_resolver::{
    canonicalize_exact_spacing_demands, compute_badge_spacing_demands,
    exact_spacing_demand_signature, required_same_rank_badge_gap, resolve_exact_spacing_demands,
    ExactSpacingDemand, MeasuredBadge,
};

#[test]
fn test_same_rank_badge_gap() {
    let config = CustomLayoutConfig::default();
    let badge_width = 80.0;
    let required_gap = required_same_rank_badge_gap(badge_width, &config);
    let expected = 80.0 + 2.0 * config.badge_clearance + 2.0 * config.port_stub_length;
    assert_eq!(required_gap, expected);
}

#[test]
fn test_exact_spacing_demand_canonicalization() {
    let d1 = ExactSpacingDemand {
        kind: DemandKind::NodeGap,
        rank: Some(0),
        after_node_id: Some("n1".to_string()),
        affected_edge_ids: vec!["e1".to_string()],
        minimum: 100.0,
        reason: DemandReason::NodeOverlap,
    };

    let d2 = ExactSpacingDemand {
        kind: DemandKind::NodeGap,
        rank: Some(0),
        after_node_id: Some("n1".to_string()),
        affected_edge_ids: vec!["e2".to_string()],
        minimum: 150.0,
        reason: DemandReason::ParallelLabels,
    };

    let canonical = canonicalize_exact_spacing_demands(&[d1, d2]);
    assert_eq!(canonical.len(), 1);
    assert_eq!(canonical[0].minimum, 150.0);
    assert_eq!(canonical[0].affected_edge_ids, vec!["e1", "e2"]);

    let sig = exact_spacing_demand_signature(&canonical);
    assert!(sig.contains("x:0:n1:150"));
}

#[test]
fn test_compute_badge_spacing_demands_same_rank() {
    let config = CustomLayoutConfig::default();
    let edges = vec![NormalizedEdge {
        id: "e1".to_string(),
        source: "n1".to_string(),
        target: "n2".to_string(),
        label: None,
        is_cycle: None,
        layout_role: None,
    }];

    let mut badge_measurements = HashMap::new();
    badge_measurements.insert(
        "e1".to_string(),
        MeasuredBadge {
            width: 60.0,
            height: 20.0,
        },
    );

    let mut ranks = HashMap::new();
    ranks.insert("n1".to_string(), 0);
    ranks.insert("n2".to_string(), 0);

    let requests = compute_badge_spacing_demands(
        &[
            NormalizedNode {
                id: "n1".to_string(),
                label: Some("N1".to_string()),
                width: 100.0,
                height: 50.0,
            },
            NormalizedNode {
                id: "n2".to_string(),
                label: Some("N2".to_string()),
                width: 100.0,
                height: 50.0,
            },
        ],
        &edges,
        &badge_measurements,
        &ranks,
        &config,
    );

    assert!(!requests.is_empty());
    assert_eq!(requests[0].kind, BadgeRequestKind::NodeGap);
    assert_eq!(requests[0].rank, Some(0));
}

#[test]
fn test_resolve_exact_spacing_demands() {
    let demands = vec![ExactSpacingDemand {
        kind: DemandKind::RankGap,
        rank: Some(1),
        after_node_id: None,
        affected_edge_ids: vec!["e1".to_string()],
        minimum: 180.0,
        reason: DemandReason::BlockedDirectBadge,
    }];

    let overrides = resolve_exact_spacing_demands(&demands, 40.0, 120.0);
    assert_eq!(
        overrides
            .rank_gap_after_rank
            .as_ref()
            .and_then(|m| m.get(&1)),
        Some(&180.0)
    );
}
