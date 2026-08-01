use super::graph_normalization::normalize_graph;
use super::tarjan_scc::detect_strongly_connected_components;
use crate::step_0_common::types::{NormalizedEdge, NormalizedNode};

#[test]
fn test_tarjan_scc_acyclic() {
    let nodes = vec![
        NormalizedNode { id: "a".into(), label: None, width: 10.0, height: 10.0 },
        NormalizedNode { id: "b".into(), label: None, width: 10.0, height: 10.0 },
    ];
    let edges = vec![
        NormalizedEdge {
            id: "e1".into(),
            source: "a".into(),
            target: "b".into(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
    ];

    let norm = normalize_graph(&nodes, &edges).unwrap();
    let scc = detect_strongly_connected_components(&norm);

    assert_eq!(scc.components.len(), 2);
    assert!(scc.cyclic_component_ids.is_empty());
}

#[test]
fn test_tarjan_scc_cycle() {
    let nodes = vec![
        NormalizedNode { id: "a".into(), label: None, width: 10.0, height: 10.0 },
        NormalizedNode { id: "b".into(), label: None, width: 10.0, height: 10.0 },
    ];
    let edges = vec![
        NormalizedEdge {
            id: "e1".into(),
            source: "a".into(),
            target: "b".into(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e2".into(),
            source: "b".into(),
            target: "a".into(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
    ];

    let norm = normalize_graph(&nodes, &edges).unwrap();
    let scc = detect_strongly_connected_components(&norm);

    assert_eq!(scc.components.len(), 1);
    assert_eq!(scc.cyclic_component_ids.len(), 1);
}
