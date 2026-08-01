use super::types::{Point, Rect, Segment};

/// Checks if both coordinates of a Point are finite (not NaN or Infinity).
pub fn is_finite_point(p: &Point) -> bool {
    p.x.is_finite() && p.y.is_finite()
}

/// Expands a rectangle in all four cardinal directions by the given margin amount.
/// The resulting rectangle has origin (x - margin, y - margin) and dimensions
/// (width + 2*margin, height + 2*margin).
pub fn expand_rect(rect: &Rect, margin: f64) -> Rect {
    Rect {
        x: rect.x - margin,
        y: rect.y - margin,
        width: rect.width + margin * 2.0,
        height: rect.height + margin * 2.0,
    }
}

/// Determines whether two axis-aligned rectangles overlap strictly in 2D space,
/// applying an epsilon tolerance buffer on boundaries. Returns true if the interior
/// intersection region has area greater than zero.
pub fn rects_overlap_strict(r1: &Rect, r2: &Rect, epsilon: f64) -> bool {
    r1.x < r2.x + r2.width - epsilon
        && r1.x + r1.width > r2.x + epsilon
        && r1.y < r2.y + r2.height - epsilon
        && r1.y + r1.height > r2.y + epsilon
}

/// Checks if a point lies strictly inside the interior of a rectangle,
/// excluding the boundary edges by epsilon.
pub fn point_in_rect_interior(p: &Point, rect: &Rect, epsilon: f64) -> bool {
    p.x > rect.x + epsilon
        && p.x < rect.x + rect.width - epsilon
        && p.y > rect.y + epsilon
        && p.y < rect.y + rect.height - epsilon
}

/// Checks if a point lies directly on any of the four boundary line segments
/// of a rectangle within an epsilon tolerance.
pub fn point_on_rect_boundary(p: &Point, rect: &Rect, epsilon: f64) -> bool {
    let on_left = (p.x - rect.x).abs() <= epsilon
        && p.y >= rect.y - epsilon
        && p.y <= rect.y + rect.height + epsilon;
    let on_right = (p.x - (rect.x + rect.width)).abs() <= epsilon
        && p.y >= rect.y - epsilon
        && p.y <= rect.y + rect.height + epsilon;
    let on_top = (p.y - rect.y).abs() <= epsilon
        && p.x >= rect.x - epsilon
        && p.x <= rect.x + rect.width + epsilon;
    let on_bottom = (p.y - (rect.y + rect.height)).abs() <= epsilon
        && p.x >= rect.x - epsilon
        && p.x <= rect.x + rect.width + epsilon;

    on_left || on_right || on_top || on_bottom
}

/// Verifies if a line segment is axis-aligned (either strictly horizontal or strictly vertical)
/// within the specified epsilon threshold.
pub fn is_orthogonal_segment(s: &Segment, epsilon: f64) -> bool {
    (s.a.x - s.b.x).abs() <= epsilon || (s.a.y - s.b.y).abs() <= epsilon
}

/// Computes the L1 Manhattan length (|dx| + |dy|) of a line segment.
pub fn segment_length(s: &Segment) -> f64 {
    (s.b.x - s.a.x).abs() + (s.b.y - s.a.y).abs()
}

/// Tests whether two orthogonal line segments cross each other strictly in their interiors.
/// One segment must be horizontal and the other vertical.
pub fn segments_cross(s1: &Segment, s2: &Segment, epsilon: f64) -> bool {
    let s1_horiz = (s1.a.y - s1.b.y).abs() <= epsilon;
    let s1_vert = (s1.a.x - s1.b.x).abs() <= epsilon;
    let s2_horiz = (s2.a.y - s2.b.y).abs() <= epsilon;
    let s2_vert = (s2.a.x - s2.b.x).abs() <= epsilon;

    if s1_horiz && s2_vert {
        let s1_min_x = s1.a.x.min(s1.b.x);
        let s1_max_x = s1.a.x.max(s1.b.x);
        let s2_min_y = s2.a.y.min(s2.b.y);
        let s2_max_y = s2.a.y.max(s2.b.y);

        let x = s2.a.x;
        let y = s1.a.y;

        return x > s1_min_x + epsilon
            && x < s1_max_x - epsilon
            && y > s2_min_y + epsilon
            && y < s2_max_y - epsilon;
    }

    if s1_vert && s2_horiz {
        let s1_min_y = s1.a.y.min(s1.b.y);
        let s1_max_y = s1.a.y.max(s1.b.y);
        let s2_min_x = s2.a.x.min(s2.b.x);
        let s2_max_x = s2.a.x.max(s2.b.x);

        let x = s1.a.x;
        let y = s2.a.y;

        return x > s2_min_x + epsilon
            && x < s2_max_x - epsilon
            && y > s1_min_y + epsilon
            && y < s1_max_y - epsilon;
    }

    false
}

/// Calculates the overlapping length between two collinear orthogonal segments.
/// Returns 0.0 if the segments are not collinear or do not overlap.
pub fn collinear_overlap_length(s1: &Segment, s2: &Segment, epsilon: f64) -> f64 {
    let s1_horiz = (s1.a.y - s1.b.y).abs() <= epsilon;
    let s2_horiz = (s2.a.y - s2.b.y).abs() <= epsilon;
    let s1_vert = (s1.a.x - s1.b.x).abs() <= epsilon;
    let s2_vert = (s2.a.x - s2.b.x).abs() <= epsilon;

    if s1_horiz && s2_horiz && (s1.a.y - s2.a.y).abs() <= epsilon {
        let min1 = s1.a.x.min(s1.b.x);
        let max1 = s1.a.x.max(s1.b.x);
        let min2 = s2.a.x.min(s2.b.x);
        let max2 = s2.a.x.max(s2.b.x);

        let overlap_min = min1.max(min2);
        let overlap_max = max1.min(max2);

        return 0.0f64.max(overlap_max - overlap_min);
    }

    if s1_vert && s2_vert && (s1.a.x - s2.a.x).abs() <= epsilon {
        let min1 = s1.a.y.min(s1.b.y);
        let max1 = s1.a.y.max(s1.b.y);
        let min2 = s2.a.y.min(s2.b.y);
        let max2 = s2.a.y.max(s2.b.y);

        let overlap_min = min1.max(min2);
        let overlap_max = max1.min(max2);

        return 0.0f64.max(overlap_max - overlap_min);
    }

    0.0
}

/// Checks if an orthogonal segment penetrates into the interior of a rectangle.
pub fn segment_intersects_rect_interior(s: &Segment, rect: &Rect, epsilon: f64) -> bool {
    if point_in_rect_interior(&s.a, rect, epsilon) || point_in_rect_interior(&s.b, rect, epsilon) {
        return true;
    }

    let s_horiz = (s.a.y - s.b.y).abs() <= epsilon;
    let s_vert = (s.a.x - s.b.x).abs() <= epsilon;

    if s_horiz {
        let min_x = s.a.x.min(s.b.x);
        let max_x = s.a.x.max(s.b.x);
        let y = s.a.y;

        if y > rect.y + epsilon && y < rect.y + rect.height - epsilon {
            let overlap_min = min_x.max(rect.x);
            let overlap_max = max_x.min(rect.x + rect.width);
            if overlap_max - overlap_min > epsilon {
                return true;
            }
        }
    }

    if s_vert {
        let min_y = s.a.y.min(s.b.y);
        let max_y = s.a.y.max(s.b.y);
        let x = s.a.x;

        if x > rect.x + epsilon && x < rect.x + rect.width - epsilon {
            let overlap_min = min_y.max(rect.y);
            let overlap_max = max_y.min(rect.y + rect.height);
            if overlap_max - overlap_min > epsilon {
                return true;
            }
        }
    }

    false
}

/// Simplifies an orthogonal polyline by filtering adjacent duplicate points
/// and removing redundant collinear intermediate bend points.
pub fn simplify_orthogonal_path(points: &[Point], epsilon: f64) -> Vec<Point> {
    if points.len() <= 1 {
        return points.to_vec();
    }

    // Step 1: Filter duplicate adjacent points
    let mut non_dupes: Vec<Point> = vec![points[0]];
    for curr in &points[1..] {
        let prev = &non_dupes[non_dupes.len() - 1];
        if (curr.x - prev.x).abs() > epsilon || (curr.y - prev.y).abs() > epsilon {
            non_dupes.push(*curr);
        }
    }

    if non_dupes.len() <= 2 {
        return non_dupes;
    }

    // Step 2: Remove collinear middle points
    let mut result: Vec<Point> = vec![non_dupes[0]];
    for i in 1..non_dupes.len() - 1 {
        let prev = &result[result.len() - 1];
        let curr = &non_dupes[i];
        let next = &non_dupes[i + 1];

        let dy1 = curr.y - prev.y;
        let dy2 = next.y - curr.y;
        let dx1 = curr.x - prev.x;
        let dx2 = next.x - curr.x;

        let is_collinear_x =
            (prev.x - curr.x).abs() <= epsilon && (curr.x - next.x).abs() <= epsilon && (dy1 * dy2 > 0.0);
        let is_collinear_y =
            (prev.y - curr.y).abs() <= epsilon && (curr.y - next.y).abs() <= epsilon && (dx1 * dx2 > 0.0);

        if !is_collinear_x && !is_collinear_y {
            result.push(*curr);
        }
    }

    result.push(non_dupes[non_dupes.len() - 1]);
    result
}

/// Calculates the total Manhattan path length across a sequence of polyline points.
pub fn path_manhattan_length(points: &[Point]) -> f64 {
    let mut length = 0.0;
    for i in 0..points.len().saturating_sub(1) {
        let a = &points[i];
        let b = &points[i + 1];
        length += (b.x - a.x).abs() + (b.y - a.y).abs();
    }
    length
}

/// Interpolates a 2D Point at a specific parametric ratio [0.0, 1.0] along a polyline.
pub fn point_at_path_ratio(points: &[Point], ratio: f64) -> Point {
    if points.is_empty() {
        return Point { x: 0.0, y: 0.0 };
    }
    if points.len() == 1 {
        return points[0];
    }

    let total_len = path_manhattan_length(points);
    if total_len == 0.0 {
        return points[0];
    }

    let target_dist = ratio.clamp(0.0, 1.0) * total_len;
    let mut accum = 0.0;

    for i in 0..points.len() - 1 {
        let a = &points[i];
        let b = &points[i + 1];
        let seg_len = (b.x - a.x).abs() + (b.y - a.y).abs();

        if accum + seg_len >= target_dist || i == points.len() - 2 {
            let remaining = target_dist - accum;
            let t = if seg_len > 0.0 {
                (remaining / seg_len).clamp(0.0, 1.0)
            } else {
                0.0
            };
            return Point {
                x: a.x + t * (b.x - a.x),
                y: a.y + t * (b.y - a.y),
            };
        }

        accum += seg_len;
    }

    points[points.len() - 1]
}

/// Generates a canonical string key representation for an undirected segment,
/// ordering endpoints lexicographically by (x, y) coordinates.
pub fn canonical_segment_key(s: &Segment) -> String {
    let p1 = if s.a.x < s.b.x || (s.a.x == s.b.x && s.a.y <= s.b.y) {
        &s.a
    } else {
        &s.b
    };
    let p2 = if p1.x == s.a.x && p1.y == s.a.y {
        &s.b
    } else {
        &s.a
    };
    format!("{},{}:{},{}", p1.x, p1.y, p2.x, p2.y)
}
