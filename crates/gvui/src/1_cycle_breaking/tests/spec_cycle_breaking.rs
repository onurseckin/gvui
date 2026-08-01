use super::cycle_breaking_facade::break_cycles;
use crate::step_0_common::types::{EdgeRole, NormalizedEdge, NormalizedNode};

#[test]
fn test_break_cycles_simple_cycle() {
    let nodes = vec![
        NormalizedNode { id: "n1".into(), label: None, width: 40.0, height: 40.0 },
        NormalizedNode { id: "n2".into(), label: None, width: 40.0, height: 40.0 },
    ];
    let edges = vec![
        NormalizedEdge {
            id: "e1".into(),
            source: "n1".into(),
            target: "n2".into(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
        NormalizedEdge {
            id: "e2".into(),
            source: "n2".into(),
            target: "n1".into(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
    ];

    let classified = break_cycles(&nodes, &edges);
    assert_eq!(classified.len(), 2);

    let feedback_count = classified.iter().filter(|c| c.role == EdgeRole::Feedback).count();
    let forward_count = classified.iter().filter(|c| c.role == EdgeRole::Forward).count();

    assert_eq!(feedback_count, 1);
    assert_eq!(forward_count, 1);
}

#[test]
fn test_break_cycles_self_loop() {
    let nodes = vec![
        NormalizedNode { id: "n1".into(), label: None, width: 40.0, height: 40.0 },
    ];
    let edges = vec![
        NormalizedEdge {
            id: "e1".into(),
            source: "n1".into(),
            target: "n1".into(),
            label: None,
            is_cycle: None,
            layout_role: None,
        },
    ];

    let classified = break_cycles(&nodes, &edges);
    assert_eq!(classified.len(), 1);
    assert_eq!(classified[0].role, EdgeRole::SelfLoop);
}
