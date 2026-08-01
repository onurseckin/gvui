use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
use crate::types::LayerNode;
use super::super::pava_isotonic_regression::project_layer_centers;

#[test]
fn test_pava_ordering_violation_resolution() {
    let config = CustomLayoutConfig::default();
    let layer = vec![
        LayerNode {
            id: "n1".to_string(),
            is_virtual: false,
            original_node_id: None,
            source_edge_id: None,
            rank: 0,
            width: 100.0,
            height: 50.0,
            x: None,
            y: None,
        },
        LayerNode {
            id: "n2".to_string(),
            is_virtual: false,
            original_node_id: None,
            source_edge_id: None,
            rank: 0,
            width: 100.0,
            height: 50.0,
            x: None,
            y: None,
        },
    ];

    let mut desired_x = HashMap::new();
    // Violation: n1 wants x=300, n2 wants x=100
    desired_x.insert("n1".to_string(), 300.0);
    desired_x.insert("n2".to_string(), 100.0);

    let mut weights = HashMap::new();
    weights.insert("n1".to_string(), 1.0);
    weights.insert("n2".to_string(), 1.0);

    let res = project_layer_centers(&layer, &desired_x, &weights, 0, &config, None);

    let x1 = res.get("n1").expect("n1 pos");
    let x2 = res.get("n2").expect("n2 pos");

    // Separation required: (100+100)/2 + 56 (default node gap) = 156.0
    let min_separation = (100.0 + 100.0) / 2.0 + config.node_gap;
    assert!(*x2 >= *x1 + min_separation);
}

#[test]
fn test_pava_monotonic_no_violation() {
    let config = CustomLayoutConfig::default();
    let layer = vec![
        LayerNode {
            id: "n1".to_string(),
            is_virtual: false,
            original_node_id: None,
            source_edge_id: None,
            rank: 0,
            width: 100.0,
            height: 50.0,
            x: None,
            y: None,
        },
        LayerNode {
            id: "n2".to_string(),
            is_virtual: false,
            original_node_id: None,
            source_edge_id: None,
            rank: 0,
            width: 100.0,
            height: 50.0,
            x: None,
            y: None,
        },
    ];

    let mut desired_x = HashMap::new();
    // Well separated: n1 at 100, n2 at 500
    desired_x.insert("n1".to_string(), 100.0);
    desired_x.insert("n2".to_string(), 500.0);

    let weights = HashMap::new();

    let res = project_layer_centers(&layer, &desired_x, &weights, 0, &config, None);

    let x1 = res.get("n1").expect("n1 pos");
    let x2 = res.get("n2").expect("n2 pos");

    assert_eq!(*x1, 100.0);
    assert_eq!(*x2, 500.0);
}
