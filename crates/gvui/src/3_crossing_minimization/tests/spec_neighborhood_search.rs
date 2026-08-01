use crate::step_0_common::types::{LayoutScore, Point, Side};
use crate::step3_crossing_minimization::objective_evaluator::{
    compare_layout_score, count_path_hairpins,
};
use crate::step_3_crossing_minimization::trial_state_generator::adjacent_sides;

fn create_test_score() -> LayoutScore {
    LayoutScore {
        hard_error_count: 0,
        unresolved_route_count: 0,
        node_node_overlaps: 0,
        edge_node_penetrations: 0,
        shared_edge_segment_length: 0.0,
        unresolved_badge_count: 0,
        badge_node_overlaps: 0,
        badge_badge_overlaps: 0,
        badge_unrelated_edge_overlaps: 0,
        crossing_count: 0,
        ordinary_leader_count: 0,
        avoidable_hairpin_count: 0,
        excess_bend_count: 0,
        hairpin_count: 0,
        bend_count: 0,
        direction_deviation_penalty: 0.0,
        total_length: 0.0,
        port_side_imbalance: 0.0,
        feedback_leader_count: 0,
        total_leader_length: 0.0,
        total_area: 0.0,
        state_hash: "hash_0".to_string(),
    }
}

#[test]
fn test_state_hash_deduplication() {
    let mut score_a = create_test_score();
    let mut score_b = create_test_score();

    score_a.state_hash = "hash_a".to_string();
    score_b.state_hash = "hash_b".to_string();

    assert_eq!(compare_layout_score(&score_a, &score_b), std::cmp::Ordering::Less);
}

#[test]
fn test_adjacent_sides() {
    let top_adj = adjacent_sides(Side::Top);
    assert_eq!(top_adj, vec![Side::Left, Side::Right]);
}

#[test]
fn test_orthogonal_path_simplification_and_hairpins() {
    let points = vec![
        Point { x: 0.0, y: 0.0 },
        Point { x: 10.0, y: 0.0 },
        Point { x: 10.0, y: 10.0 },
        Point { x: 0.0, y: 10.0 }, // U-turn hairpin (Right -> Down -> Left)
    ];

    let hairpins = count_path_hairpins(&points, 1e-3);
    assert!(hairpins >= 1);
}

#[test]
fn test_21_component_score_comparison() {
    let mut score_a = create_test_score();
    let mut score_b = create_test_score();

    score_a.crossing_count = 5;
    score_b.crossing_count = 2;

    assert_eq!(compare_layout_score(&score_a, &score_b), std::cmp::Ordering::Greater);

    // Hard error count takes precedence over crossing count
    score_a.hard_error_count = 1;
    score_b.hard_error_count = 2;
    assert_eq!(compare_layout_score(&score_a, &score_b), std::cmp::Ordering::Less);
}
