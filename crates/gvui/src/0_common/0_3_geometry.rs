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

        let is_collinear_x = (prev.x - curr.x).abs() <= epsilon
            && (curr.x - next.x).abs() <= epsilon
            && (dy1 * dy2 > 0.0);
        let is_collinear_y = (prev.y - curr.y).abs() <= epsilon
            && (curr.y - next.y).abs() <= epsilon
            && (dx1 * dx2 > 0.0);

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

/// Orthogonal-aware strict crossing test for two axis-aligned segments. Mirrors the pairing logic
/// of [`segments_cross`] (one segment must be horizontal, the other vertical) but returns the
/// actual intersection point instead of a boolean, for callers that need to record a crossing.
pub fn orthogonal_crossing_point(s1: &Segment, s2: &Segment, epsilon: f64) -> Option<Point> {
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

        if x > s1_min_x + epsilon
            && x < s1_max_x - epsilon
            && y > s2_min_y + epsilon
            && y < s2_max_y - epsilon
        {
            return Some(Point { x, y });
        }
        return None;
    }

    if s1_vert && s2_horiz {
        let s1_min_y = s1.a.y.min(s1.b.y);
        let s1_max_y = s1.a.y.max(s1.b.y);
        let s2_min_x = s2.a.x.min(s2.b.x);
        let s2_max_x = s2.a.x.max(s2.b.x);

        let x = s1.a.x;
        let y = s2.a.y;

        if x > s2_min_x + epsilon
            && x < s2_max_x - epsilon
            && y > s1_min_y + epsilon
            && y < s1_max_y - epsilon
        {
            return Some(Point { x, y });
        }
        return None;
    }

    None
}

/// Nearest point on a polyline to `p`, plus the index of the segment (`points[i]..points[i+1]`)
/// that contains it. Ties (equal distance on two adjacent segments, i.e. `p` nearest a shared
/// vertex) resolve to the lower segment index, since segments are scanned in order and a later
/// segment only replaces the result on a strictly smaller distance.
pub fn nearest_point_on_polyline(points: &[Point], p: &Point) -> (Point, usize) {
    if points.is_empty() {
        return (Point { x: 0.0, y: 0.0 }, 0);
    }
    if points.len() == 1 {
        return (points[0], 0);
    }

    let mut best_point = points[0];
    let mut best_seg = 0usize;
    let mut best_dist = f64::INFINITY;

    for i in 0..points.len() - 1 {
        let a = &points[i];
        let b = &points[i + 1];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let len_sq = dx * dx + dy * dy;

        let t = if len_sq > 0.0 {
            (((p.x - a.x) * dx + (p.y - a.y) * dy) / len_sq).clamp(0.0, 1.0)
        } else {
            0.0
        };

        let candidate = Point {
            x: a.x + t * dx,
            y: a.y + t * dy,
        };
        let ddx = candidate.x - p.x;
        let ddy = candidate.y - p.y;
        let dist = ddx * ddx + ddy * ddy;

        if dist < best_dist {
            best_dist = dist;
            best_point = candidate;
            best_seg = i;
        }
    }

    (best_point, best_seg)
}

/// Axis-aligned bounding box of a point set. `None` for an empty slice, since there is no
/// meaningful rectangle to return.
pub fn bounding_box_of_points(points: &[Point]) -> Option<Rect> {
    let first = points.first()?;
    let mut min_x = first.x;
    let mut max_x = first.x;
    let mut min_y = first.y;
    let mut max_y = first.y;

    for p in &points[1..] {
        min_x = min_x.min(p.x);
        max_x = max_x.max(p.x);
        min_y = min_y.min(p.y);
        max_y = max_y.max(p.y);
    }

    Some(Rect {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
    })
}

/// Union of two rectangles: the smallest axis-aligned rectangle containing both.
pub fn rect_union(a: &Rect, b: &Rect) -> Rect {
    let min_x = a.x.min(b.x);
    let min_y = a.y.min(b.y);
    let max_x = a.right().max(b.right());
    let max_y = a.bottom().max(b.bottom());

    Rect {
        x: min_x,
        y: min_y,
        width: max_x - min_x,
        height: max_y - min_y,
    }
}

/// Translates every point in place by `(dx, dy)`.
pub fn translate_points(points: &mut [Point], dx: f64, dy: f64) {
    for p in points.iter_mut() {
        p.x += dx;
        p.y += dy;
    }
}

/// True when the rect pair overlaps with at least `epsilon` of overlap extent in both axes.
/// Distinct from [`rects_overlap_strict`]: this measures the overlap span directly against
/// `epsilon` rather than shrinking each rectangle's boundary by `epsilon` first, so callers that
/// want "meaningfully more than a hairline touch" should use this one.
pub fn rects_overlap_area(a: &Rect, b: &Rect, epsilon: f64) -> bool {
    let overlap_w = a.right().min(b.right()) - a.x.max(b.x);
    let overlap_h = a.bottom().min(b.bottom()) - a.y.max(b.y);
    overlap_w > epsilon && overlap_h > epsilon
}

/// Clips the ray from `rect`'s centre toward `toward` to the rect boundary. Used by
/// straight/spline edge styles where there is no port to anchor to.
///
/// When `toward` coincides with the centre (degenerate: no direction to clip along), returns the
/// centre itself rather than an arbitrary side, since there is no well-defined ray.
pub fn clip_ray_to_rect(rect: &Rect, toward: &Point) -> Point {
    let center = rect.center();
    let dx = toward.x - center.x;
    let dy = toward.y - center.y;

    if dx == 0.0 && dy == 0.0 {
        return center;
    }

    let half_w = rect.width / 2.0;
    let half_h = rect.height / 2.0;

    let t_x = if dx != 0.0 && half_w > 0.0 {
        half_w / dx.abs()
    } else {
        f64::INFINITY
    };
    let t_y = if dy != 0.0 && half_h > 0.0 {
        half_h / dy.abs()
    } else {
        f64::INFINITY
    };

    let t = t_x.min(t_y);
    if !t.is_finite() {
        // Degenerate rect (zero width and height): nothing to clip to.
        return center;
    }

    Point {
        x: center.x + dx * t,
        y: center.y + dy * t,
    }
}

/// Shelf/strip packer. Given component bounding boxes (only their `width`/`height` matter — the
/// existing `x`/`y` are the pre-pack layout the returned translation moves away from), returns the
/// translation for each box, by input index, so the packed arrangement approaches `target_aspect`
/// (packed total width / packed total height).
///
/// Deterministic: boxes are visited in descending height order, ties broken by ascending input
/// index, and placed left-to-right on a shelf until the next box would exceed the target shelf
/// width, at which point a new shelf starts below the tallest box seen on the current shelf. This
/// guarantees no two returned placements overlap, regardless of `target_aspect` or `gap`.
pub fn pack_boxes(boxes: &[Rect], gap: f64, target_aspect: f64) -> Vec<(f64, f64)> {
    if boxes.is_empty() {
        return Vec::new();
    }

    let gap = if gap.is_finite() && gap >= 0.0 {
        gap
    } else {
        0.0
    };
    let aspect = if target_aspect.is_finite() && target_aspect > 0.0 {
        target_aspect
    } else {
        1.0
    };

    let total_area: f64 = boxes
        .iter()
        .map(|b| b.width.max(0.0) * b.height.max(0.0))
        .sum();
    let max_width = boxes
        .iter()
        .fold(0.0f64, |acc, b| acc.max(b.width.max(0.0)));
    let target_width = (total_area * aspect).sqrt().max(max_width);

    let mut order: Vec<usize> = (0..boxes.len()).collect();
    order.sort_by(|&i, &j| {
        boxes[j]
            .height
            .partial_cmp(&boxes[i].height)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(i.cmp(&j))
    });

    let mut translations = vec![(0.0, 0.0); boxes.len()];
    let mut x_cursor = 0.0f64;
    let mut y_cursor = 0.0f64;
    let mut shelf_height = 0.0f64;

    for i in order {
        let b = &boxes[i];
        let w = b.width.max(0.0);
        let h = b.height.max(0.0);

        if x_cursor > 0.0 && x_cursor + w > target_width {
            y_cursor += shelf_height + gap;
            x_cursor = 0.0;
            shelf_height = 0.0;
        }

        translations[i] = (x_cursor - b.x, y_cursor - b.y);

        x_cursor += w + gap;
        shelf_height = shelf_height.max(h);
    }

    translations
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

#[cfg(test)]
mod tests {
    use super::*;

    fn pt(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    fn rect(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect {
            x,
            y,
            width: w,
            height: h,
        }
    }

    // ---- orthogonal_crossing_point ----

    #[test]
    fn crossing_point_finds_interior_intersection() {
        let horiz = Segment {
            a: pt(0.0, 5.0),
            b: pt(10.0, 5.0),
        };
        let vert = Segment {
            a: pt(5.0, 0.0),
            b: pt(5.0, 10.0),
        };
        let got = orthogonal_crossing_point(&horiz, &vert, 1e-6);
        assert_eq!(got, Some(pt(5.0, 5.0)));
    }

    #[test]
    fn crossing_point_none_when_disjoint() {
        let horiz = Segment {
            a: pt(0.0, 5.0),
            b: pt(4.0, 5.0),
        };
        let vert = Segment {
            a: pt(5.0, 0.0),
            b: pt(5.0, 10.0),
        };
        assert_eq!(orthogonal_crossing_point(&horiz, &vert, 1e-6), None);
    }

    #[test]
    fn crossing_point_none_for_parallel_segments() {
        let h1 = Segment {
            a: pt(0.0, 0.0),
            b: pt(10.0, 0.0),
        };
        let h2 = Segment {
            a: pt(0.0, 5.0),
            b: pt(10.0, 5.0),
        };
        assert_eq!(orthogonal_crossing_point(&h1, &h2, 1e-6), None);
    }

    // ---- nearest_point_on_polyline ----

    #[test]
    fn nearest_point_on_polyline_empty() {
        let (p, seg) = nearest_point_on_polyline(&[], &pt(1.0, 1.0));
        assert_eq!(p, pt(0.0, 0.0));
        assert_eq!(seg, 0);
    }

    #[test]
    fn nearest_point_on_polyline_picks_containing_segment() {
        let points = vec![pt(0.0, 0.0), pt(10.0, 0.0), pt(10.0, 10.0)];
        let (nearest, seg) = nearest_point_on_polyline(&points, &pt(10.0, 5.0));
        assert_eq!(nearest, pt(10.0, 5.0));
        assert_eq!(seg, 1);
    }

    #[test]
    fn nearest_point_on_polyline_clamps_to_endpoint() {
        let points = vec![pt(0.0, 0.0), pt(10.0, 0.0)];
        let (nearest, seg) = nearest_point_on_polyline(&points, &pt(-5.0, 3.0));
        assert_eq!(nearest, pt(0.0, 0.0));
        assert_eq!(seg, 0);
    }

    // ---- bounding_box_of_points ----

    #[test]
    fn bounding_box_of_points_empty_is_none() {
        assert_eq!(bounding_box_of_points(&[]), None);
    }

    #[test]
    fn bounding_box_of_points_covers_all_points() {
        let points = vec![pt(3.0, -2.0), pt(-1.0, 5.0), pt(10.0, 1.0)];
        let bb = bounding_box_of_points(&points).expect("non-empty input");
        assert_eq!(bb, rect(-1.0, -2.0, 11.0, 7.0));
    }

    // ---- rect_union ----

    #[test]
    fn rect_union_covers_both_rects() {
        let a = rect(0.0, 0.0, 5.0, 5.0);
        let b = rect(3.0, 3.0, 5.0, 5.0);
        assert_eq!(rect_union(&a, &b), rect(0.0, 0.0, 8.0, 8.0));
    }

    #[test]
    fn rect_union_disjoint_rects() {
        let a = rect(0.0, 0.0, 1.0, 1.0);
        let b = rect(10.0, 10.0, 1.0, 1.0);
        assert_eq!(rect_union(&a, &b), rect(0.0, 0.0, 11.0, 11.0));
    }

    // ---- translate_points ----

    #[test]
    fn translate_points_shifts_every_point() {
        let mut points = vec![pt(0.0, 0.0), pt(1.0, 1.0)];
        translate_points(&mut points, 2.0, -3.0);
        assert_eq!(points, vec![pt(2.0, -3.0), pt(3.0, -2.0)]);
    }

    #[test]
    fn translate_points_empty_is_noop() {
        let mut points: Vec<Point> = vec![];
        translate_points(&mut points, 5.0, 5.0);
        assert!(points.is_empty());
    }

    // ---- rects_overlap_area ----

    #[test]
    fn rects_overlap_area_true_for_real_overlap() {
        let a = rect(0.0, 0.0, 10.0, 10.0);
        let b = rect(5.0, 5.0, 10.0, 10.0);
        assert!(rects_overlap_area(&a, &b, 1e-6));
    }

    #[test]
    fn rects_overlap_area_false_for_hairline_touch() {
        let a = rect(0.0, 0.0, 10.0, 10.0);
        let b = rect(10.0, 0.0, 10.0, 10.0);
        assert!(!rects_overlap_area(&a, &b, 1e-6));
    }

    // ---- clip_ray_to_rect ----

    #[test]
    fn clip_ray_to_rect_toward_right() {
        let r = rect(0.0, 0.0, 10.0, 20.0);
        let got = clip_ray_to_rect(&r, &pt(100.0, 10.0));
        assert_eq!(got, pt(10.0, 10.0));
    }

    #[test]
    fn clip_ray_to_rect_toward_left() {
        let r = rect(0.0, 0.0, 10.0, 20.0);
        let got = clip_ray_to_rect(&r, &pt(-100.0, 10.0));
        assert_eq!(got, pt(0.0, 10.0));
    }

    #[test]
    fn clip_ray_to_rect_toward_bottom() {
        let r = rect(0.0, 0.0, 10.0, 20.0);
        let got = clip_ray_to_rect(&r, &pt(5.0, 1000.0));
        assert_eq!(got, pt(5.0, 20.0));
    }

    #[test]
    fn clip_ray_to_rect_toward_top() {
        let r = rect(0.0, 0.0, 10.0, 20.0);
        let got = clip_ray_to_rect(&r, &pt(5.0, -1000.0));
        assert_eq!(got, pt(5.0, 0.0));
    }

    #[test]
    fn clip_ray_to_rect_degenerate_centre_returns_centre() {
        let r = rect(0.0, 0.0, 10.0, 20.0);
        let center = r.center();
        assert_eq!(clip_ray_to_rect(&r, &center), center);
    }

    // ---- pack_boxes ----

    #[test]
    fn pack_boxes_single_box_needs_no_translation_when_already_at_origin() {
        let boxes = vec![rect(0.0, 0.0, 5.0, 5.0)];
        let translations = pack_boxes(&boxes, 1.0, 1.0);
        assert_eq!(translations, vec![(0.0, 0.0)]);
    }

    #[test]
    fn pack_boxes_empty_input() {
        assert_eq!(pack_boxes(&[], 1.0, 1.0), Vec::<(f64, f64)>::new());
    }

    #[test]
    fn pack_boxes_equal_boxes_form_grid_with_no_overlap() {
        // Nine equal unit-ish boxes at arbitrary starting positions, packed toward a square aspect.
        let boxes: Vec<Rect> = (0..9)
            .map(|i| rect(i as f64 * 100.0, i as f64 * 37.0, 10.0, 10.0))
            .collect();
        let translations = pack_boxes(&boxes, 2.0, 1.0);
        assert_eq!(translations.len(), 9);

        let packed: Vec<Rect> = boxes
            .iter()
            .zip(translations.iter())
            .map(|(b, (dx, dy))| rect(b.x + dx, b.y + dy, b.width, b.height))
            .collect();

        for i in 0..packed.len() {
            for j in (i + 1)..packed.len() {
                assert!(
                    !rects_overlap_area(&packed[i], &packed[j], 1e-6),
                    "boxes {i} and {j} overlap: {:?} vs {:?}",
                    packed[i],
                    packed[j]
                );
            }
        }

        // Square target aspect over 9 equal boxes should settle into multiple shelves (rows),
        // i.e. not a single degenerate row.
        let distinct_ys: std::collections::BTreeSet<i64> = packed
            .iter()
            .map(|r| (r.y * 1000.0).round() as i64)
            .collect();
        assert!(distinct_ys.len() > 1);
    }

    #[test]
    fn pack_boxes_varied_sizes_no_overlap() {
        let boxes = vec![
            rect(0.0, 0.0, 40.0, 10.0),
            rect(0.0, 0.0, 10.0, 30.0),
            rect(0.0, 0.0, 20.0, 20.0),
            rect(0.0, 0.0, 5.0, 5.0),
            rect(0.0, 0.0, 15.0, 25.0),
        ];
        let translations = pack_boxes(&boxes, 3.0, 1.6);
        let packed: Vec<Rect> = boxes
            .iter()
            .zip(translations.iter())
            .map(|(b, (dx, dy))| rect(b.x + dx, b.y + dy, b.width, b.height))
            .collect();

        for i in 0..packed.len() {
            for j in (i + 1)..packed.len() {
                assert!(!rects_overlap_area(&packed[i], &packed[j], 1e-6));
            }
        }
    }
}
