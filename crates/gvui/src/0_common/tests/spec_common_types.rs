use crate::step_0_common::badge_measurement::*;
use crate::step_0_common::config::*;
use crate::step_0_common::geometry::*;
use crate::step_0_common::types::*;

#[test]
fn test_point_and_rect_geometry() {
    let p = Point { x: 10.0, y: 20.0 };
    assert!(is_finite_point(&p));

    let rect = Rect { x: 0.0, y: 0.0, width: 100.0, height: 50.0 };
    assert!(point_in_rect_interior(&Point { x: 50.0, y: 25.0 }, &rect, 0.001));
    assert!(!point_in_rect_interior(&Point { x: 150.0, y: 25.0 }, &rect, 0.001));

    let expanded = expand_rect(&rect, 10.0);
    assert_eq!(expanded.x, -10.0);
    assert_eq!(expanded.y, -10.0);
    assert_eq!(expanded.width, 120.0);
    assert_eq!(expanded.height, 70.0);
}

#[test]
fn test_segment_math() {
    let seg1 = Segment { a: Point { x: 0.0, y: 10.0 }, b: Point { x: 20.0, y: 10.0 } };
    let seg2 = Segment { a: Point { x: 10.0, y: 0.0 }, b: Point { x: 10.0, y: 20.0 } };

    assert!(is_orthogonal_segment(&seg1, 0.001));
    assert!(is_orthogonal_segment(&seg2, 0.001));
    assert_eq!(segment_length(&seg1), 20.0);
    assert!(segments_cross(&seg1, &seg2, 0.001));
}

#[test]
fn test_badge_measurement() {
    let config = CustomLayoutConfig::default();
    let rect = measure_badge_rect("Test Label", &config, false);
    assert!(rect.width >= 60.0);
    assert_eq!(rect.height, 28.0);

    let cycle_text = get_badge_display_text(Some("Loop"), true);
    assert_eq!(cycle_text, Some("↺ Loop".to_string()));
}
