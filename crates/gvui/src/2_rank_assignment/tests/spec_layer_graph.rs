use crate::types::{NormalizedEdge, NormalizedNode};
use super::{assign_ranks, build_layer_graph, calculate_rank_bands, calculate_rank_heights};

#[test]
fn test_layer_graph_span_1() {
    let nodes = vec![
        NormalizedNode { id: "A".to_string(), label: None, width: 100.0, height: 50.0 },
        NormalizedNode { id: "B".to_string(), label: None, width: 100.0, height: 50.0 },
    ];
    let edges = vec![
        NormalizedEdge { id: "e1".to_string(), source: "A".to_string(), target: "B".to_string(), label: None, is_cycle: None, layout_role: None },
    ];

    let ranks = assign_ranks(&nodes, &edges, None);
    let layer_graph = build_layer_graph(&nodes, &edges, None, &ranks);

    assert_eq!(layer_graph.virtual_nodes.len(), 0);
    assert_eq!(layer_graph.layers[0].iter().map(|n| &n.id).collect::<Vec<_>>(), vec!["A"]);
    assert_eq!(layer_graph.layers[1].iter().map(|n| &n.id).collect::<Vec<_>>(), vec!["B"]);
}

#[test]
fn test_layer_graph_virtual_nodes_naming() {
    let nodes = vec![
        NormalizedNode { id: "A".to_string(), label: None, width: 100.0, height: 50.0 },
        NormalizedNode { id: "B1".to_string(), label: None, width: 100.0, height: 50.0 },
        NormalizedNode { id: "B2".to_string(), label: None, width: 100.0, height: 50.0 },
        NormalizedNode { id: "C".to_string(), label: None, width: 100.0, height: 50.0 },
    ];
    let edges = vec![
        NormalizedEdge { id: "e1".to_string(), source: "A".to_string(), target: "B1".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e2".to_string(), source: "B1".to_string(), target: "B2".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "e3".to_string(), source: "B2".to_string(), target: "C".to_string(), label: None, is_cycle: None, layout_role: None },
        NormalizedEdge { id: "eLong".to_string(), source: "A".to_string(), target: "C".to_string(), label: None, is_cycle: None, layout_role: None },
    ];

    let ranks = assign_ranks(&nodes, &edges, None);
    let layer_graph = build_layer_graph(&nodes, &edges, None, &ranks);

    assert_eq!(layer_graph.virtual_nodes.len(), 2);
    assert_eq!(layer_graph.virtual_nodes[0].id, "virtual__eLong__rank_1");
    assert_eq!(layer_graph.virtual_nodes[1].id, "virtual__eLong__rank_2");
    assert_eq!(layer_graph.virtual_nodes[0].rank, 1);
    assert_eq!(layer_graph.virtual_nodes[1].rank, 2);
    assert_eq!(layer_graph.virtual_nodes[0].source_edge_id.as_deref(), Some("eLong"));
    assert_eq!(layer_graph.virtual_nodes[1].source_edge_id.as_deref(), Some("eLong"));
}

#[test]
fn test_rank_heights_and_bands() {
    let nodes = vec![
        NormalizedNode { id: "A".to_string(), label: None, width: 100.0, height: 60.0 },
        NormalizedNode { id: "B".to_string(), label: None, width: 100.0, height: 40.0 },
    ];
    let edges = vec![
        NormalizedEdge { id: "e1".to_string(), source: "A".to_string(), target: "B".to_string(), label: None, is_cycle: None, layout_role: None },
    ];

    let ranks = assign_ranks(&nodes, &edges, None);
    let layer_graph = build_layer_graph(&nodes, &edges, None, &ranks);

    let heights = calculate_rank_heights(&layer_graph.layers, 50.0);
    assert_eq!(*heights.get(&0).unwrap(), 60.0);
    assert_eq!(*heights.get(&1).unwrap(), 40.0);

    let bands = calculate_rank_bands(&layer_graph.layers, 100.0, 20.0, 50.0);
    let band0 = bands.get(&0).unwrap();
    assert_eq!(band0.top_y, 100.0);
    assert_eq!(band0.height, 60.0);
    assert_eq!(band0.center_y, 130.0);

    let band1 = bands.get(&1).unwrap();
    assert_eq!(band1.top_y, 180.0); // 100 + 60 + 20
    assert_eq!(band1.height, 40.0);
    assert_eq!(band1.center_y, 200.0);
}
