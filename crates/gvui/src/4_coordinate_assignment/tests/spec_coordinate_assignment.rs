use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
use crate::types::{ExpandedLayerGraph, LayerNode, NormalizedGraph};
use super::super::coordinate_assignment_facade::assign_coordinates;

#[test]
fn test_coordinate_assignment_facade_basic() {
    let graph = NormalizedGraph::default();

    let n1 = LayerNode {
        id: "n1".to_string(),
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        rank: 0,
        width: 100.0,
        height: 50.0,
        x: None,
        y: None,
    };
    let n2 = LayerNode {
        id: "n2".to_string(),
        is_virtual: false,
        original_node_id: None,
        source_edge_id: None,
        rank: 1,
        width: 100.0,
        height: 50.0,
        x: None,
        y: None,
    };

    let mut item_map = HashMap::new();
    item_map.insert("n1".to_string(), n1.clone());
    item_map.insert("n2".to_string(), n2.clone());

    let mut predecessors_map = HashMap::new();
    let mut successors_map = HashMap::new();
    successors_map.insert("n1".to_string(), vec!["n2".to_string()]);
    predecessors_map.insert("n2".to_string(), vec!["n1".to_string()]);

    let layer_graph = ExpandedLayerGraph {
        layers: vec![vec![n1.clone()], vec![n2.clone()]],
        real_nodes: vec![n1.clone(), n2.clone()],
        virtual_nodes: vec![],
        item_map,
        predecessors_map,
        successors_map,
    };

    let ordered_layers = vec![vec![n1], vec![n2]];
    let config = CustomLayoutConfig::default();

    let res = assign_coordinates(&graph, &layer_graph, &ordered_layers, &config, None, None);

    assert_eq!(res.node_positions.len(), 2);
    assert!(res.bounding_box.width > 0.0);
    assert!(res.bounding_box.height > 0.0);

    let p1 = res.node_positions.get("n1").unwrap();
    let p2 = res.node_positions.get("n2").unwrap();

    assert_eq!(p1.x, config.graph_padding);
    assert_eq!(p1.y, config.graph_padding);
    assert!(p2.y > p1.y);
}
