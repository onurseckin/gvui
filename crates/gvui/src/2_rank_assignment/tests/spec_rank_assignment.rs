use crate::types::{NormalizedEdge, NormalizedNode};
use super::{assign_ranks, assign_ranks_longest_path, run_network_simplex};

#[test]
fn test_assign_ranks_linear() {
    let nodes = vec![
        NormalizedNode { id: "A".to_string(), label: None, width: 100.0, height: 50.0 },
        NormalizedNode { id: "B".to_string(), label: None, width: 100.0, height: 50.0 },
        NormalizedNode { id: "C".to_string(), label: None, width: 100.0, height: 50.0 },
    ];
    let edges = vec![
        NormalizedEdge { id: "e1".to_string(), source: "A".to_string(), target: "B".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e2".to_string(), source: "B".to_string(), target: "C".to_string(), label: None, is_cycle: None, layout_role: None },
    ];

    let res = assign_ranks(&nodes, &edges, None);
    assert_eq!(*res.node_rank_map.get("A").unwrap(), 0);
    assert_eq!(*res.node_rank_map.get("B").unwrap(), 1);
    assert_eq!(*res.node_rank_map.get("C").unwrap(), 2);
    assert_eq!(res.max_rank, 2);
}

#[test]
fn test_assign_ranks_diamond() {
    let nodes = vec![
        NormalizedNode { id: "SRC".to_string(), label: None, width: 100.0, height: 50.0 },
        NormalizedNode { id: "M1".to_string(), label: None, width: 100.0, height: 50.0 },
        NormalizedNode { id: "M2".to_string(), label: None, width: 100.0, height: 50.0 },
        NormalizedNode { id: "SINK".to_string(), label: None, width: 100.0, height: 50.0 },
    ];
    let edges = vec![
        NormalizedEdge { id: "e1".to_string(), source: "SRC".to_string(), target: "M1".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e2".to_string(), source: "SRC".to_string(), target: "M2".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e3".to_string(), source: "M1".to_string(), target: "SINK".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e4".to_string(), source: "M2".to_string(), target: "SINK".to_string(), label: None, is_cycle: None, layout_role: None },
    ];

    let res = assign_ranks(&nodes, &edges, None);
    assert_eq!(*res.node_rank_map.get("SRC").unwrap(), 0);
    assert_eq!(*res.node_rank_map.get("M1").unwrap(), 1);
    assert_eq!(*res.node_rank_map.get("M2").unwrap(), 1);
    assert_eq!(*res.node_rank_map.get("SINK").unwrap(), 2);
}

#[test]
fn test_longest_path_ranking() {
    let nodes = vec![
        NormalizedNode { id: "N0".to_string(), label: None, width: 10.0, height: 10.0 },
        NormalizedNode { id: "N1".to_string(), label: None, width: 10.0, height: 10.0 },
    ];
    let edges = vec![
        NormalizedEdge { id: "e0".to_string(), source: "N0".to_string(), target: "N1".to_string(), label: None, is_cycle: None, layout_role: None },
    ];

    let res = assign_ranks_longest_path(&nodes, &edges, None);
    assert_eq!(*res.node_rank_map.get("N0").unwrap(), 0);
    assert_eq!(*res.node_rank_map.get("N1").unwrap(), 1);
    assert_eq!(*res.edge_rank_span_map.get("e0").unwrap(), 1);
}

#[test]
fn test_network_simplex_optimization() {
    let nodes = vec![
        NormalizedNode { id: "A".to_string(), label: None, width: 50.0, height: 50.0 },
        NormalizedNode { id: "B".to_string(), label: None, width: 50.0, height: 50.0 },
        NormalizedNode { id: "C".to_string(), label: None, width: 50.0, height: 50.0 },
    ];
    let edges = vec![
        NormalizedEdge { id: "e1".to_string(), source: "A".to_string(), target: "B".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e2".to_string(), source: "B".to_string(), target: "C".to_string(), label: None, is_cycle: None, layout_role: None },
    ];

    let longest = assign_ranks_longest_path(&nodes, &edges, None);
    let simplex = run_network_simplex(&nodes, &edges, None, &longest.node_rank_map);
    assert!(simplex.is_some());
    let res = simplex.unwrap();
    assert_eq!(*res.node_rank_map.get("A").unwrap(), 0);
    assert_eq!(*res.node_rank_map.get("B").unwrap(), 1);
    assert_eq!(*res.node_rank_map.get("C").unwrap(), 2);
}
