//! Step 5.9: SVG Path Formatting, Bridge Owner Priority & Rounded Arc Bridges.
//!
//! This module converts raw point sequences into formatted SVG `<path d="...">` command strings.
//!
//! ## SVG Path Command Formatting
//! - `M x y`: Move to starting coordinate.
//! - `L x y`: Draw straight orthogonal line segment to target coordinate.
//!
//! ## Edge Role Priority for Bridge Ownership
//! When two orthogonal edge segments cross in 2D space, one edge is assigned ownership of the straight
//! segment, while the intersecting edge renders a 180-degree rounded arc bridge `A rx ry ...` over it.
//! Bridge ownership priority is determined by edge role:
//! 1. `Forward` (Priority 4): Primary downward DAG edges take straight bridge ownership.
//! 2. `Cross` (Priority 3): Inter-hierarchy cross edges.
//! 3. `Feedback` (Priority 2): Upward cycle back-edges.
//! 4. `SelfLoop` (Priority 1): Node self-referential loops.
//! 5. Tie-breaker: Lexicographical comparison of edge ID strings.
//!
//! ## Rounded Arc Bridge Rendering (`render_path_with_crossing_bridges`)
//! SVG Arc Command Syntax: `A rx ry x-axis-rotation large-arc-flag sweep-flag x y`
//! - `rx, ry`: Radius of the circular arc (set to `bridge_radius`).
//! - `x-axis-rotation`: Set to `0`.
//! - `large-arc-flag`: Set to `0` (minor arc < 180 deg).
//! - `sweep-flag`: Set to `0` (counter-clockwise sweep creating a convex bridge bump over the cross segment).
//! - `x, y`: Endpoint of the arc where the straight line resumes.

use crate::geometry::simplify_orthogonal_path;
use crate::types::{EdgeRole, Point};

fn role_priority(role: Option<EdgeRole>) -> usize {
    match role {
        Some(EdgeRole::Forward) => 4,
        Some(EdgeRole::Cross) => 3,
        Some(EdgeRole::Feedback) => 2,
        Some(EdgeRole::SelfLoop) | Some(EdgeRole::SelfRole) => 1,
        None => 0,
    }
}

/// Formats floating-point numbers to 3 decimal places, converting near-zero values to `"0"`.
pub fn round_num(n: f64) -> String {
    let rounded = (n * 1000.0).round() / 1000.0;
    let abs = rounded.abs();
    if abs < 0.0001 {
        "0".to_string()
    } else {
        rounded.to_string()
    }
}

/// Converts a sequence of 2D points into a standard orthogonal SVG path data string (`M x y L x y ...`).
pub fn points_to_svg_path(points: &[Point]) -> String {
    if points.is_empty() {
        return String::new();
    }
    let simplified = simplify_orthogonal_path(points, 0.001);
    if simplified.is_empty() {
        return String::new();
    }
    if simplified.len() == 1 {
        return format!("M {} {}", round_num(simplified[0].x), round_num(simplified[0].y));
    }

    let mut commands: Vec<String> = Vec::new();
    commands.push(format!("M {} {}", round_num(simplified[0].x), round_num(simplified[0].y)));
    for pt in simplified.iter().skip(1) {
        commands.push(format!("L {} {}", round_num(pt.x), round_num(pt.y)));
    }
    commands.join(" ")
}

/// Bridge ownership determination result.
#[derive(Debug, Clone)]
pub struct BridgeOwnerResult {
    pub straight_edge_id: String,
    pub bridged_edge_id: String,
}

/// Determines which of two crossing edges owns the straight path segment vs the rounded arc bridge.
pub fn determine_crossing_bridge_owner(
    edge_a_id: &str,
    role_a: Option<EdgeRole>,
    edge_b_id: &str,
    role_b: Option<EdgeRole>,
) -> BridgeOwnerResult {
    let prio_a = role_priority(role_a);
    let prio_b = role_priority(role_b);

    if prio_a != prio_b {
        if prio_a > prio_b {
            BridgeOwnerResult {
                straight_edge_id: edge_a_id.to_string(),
                bridged_edge_id: edge_b_id.to_string(),
            }
        } else {
            BridgeOwnerResult {
                straight_edge_id: edge_b_id.to_string(),
                bridged_edge_id: edge_a_id.to_string(),
            }
        }
    } else if edge_a_id < edge_b_id {
        BridgeOwnerResult {
            straight_edge_id: edge_a_id.to_string(),
            bridged_edge_id: edge_b_id.to_string(),
        }
    } else {
        BridgeOwnerResult {
            straight_edge_id: edge_b_id.to_string(),
            bridged_edge_id: edge_a_id.to_string(),
        }
    }
}

#[derive(Debug, Clone)]
struct CrossingOnSegment {
    point: Point,
    dist_from_path_start: f64,
    segment_index: usize,
}

/// Formats an SVG path string containing rounded arc bridges (`A rx ry 0 0 0 x y`) over crossing points.
pub fn render_path_with_crossing_bridges(
    points: &[Point],
    crossings: &[Point],
    bridge_radius: f64,
    epsilon: f64,
) -> String {
    if points.len() <= 1 || crossings.is_empty() {
        return points_to_svg_path(points);
    }

    let simplified = simplify_orthogonal_path(points, epsilon);
    if simplified.len() <= 1 {
        return points_to_svg_path(&simplified);
    }

    let mut crossings_with_pos: Vec<CrossingOnSegment> = Vec::new();
    let mut accumulated_len = 0.0;

    for i in 0..simplified.len() - 1 {
        let a = &simplified[i];
        let b = &simplified[i + 1];
        let is_horiz = (a.y - b.y).abs() <= epsilon;
        let min_x = a.x.min(b.x);
        let max_x = a.x.max(b.x);
        let min_y = a.y.min(b.y);
        let max_y = a.y.max(b.y);
        let seg_len = if is_horiz { max_x - min_x } else { max_y - min_y };

        for c in crossings {
            if is_horiz {
                if (c.y - a.y).abs() <= epsilon && c.x > min_x + epsilon && c.x < max_x - epsilon {
                    let dist_on_seg = (c.x - a.x).abs();
                    crossings_with_pos.push(CrossingOnSegment {
                        point: *c,
                        dist_from_path_start: accumulated_len + dist_on_seg,
                        segment_index: i,
                    });
                }
            } else if (c.x - a.x).abs() <= epsilon && c.y > min_y + epsilon && c.y < max_y - epsilon {
                let dist_on_seg = (c.y - a.y).abs();
                crossings_with_pos.push(CrossingOnSegment {
                    point: *c,
                    dist_from_path_start: accumulated_len + dist_on_seg,
                    segment_index: i,
                });
            }
        }

        accumulated_len += seg_len;
    }

    if crossings_with_pos.is_empty() {
        return points_to_svg_path(&simplified);
    }

    crossings_with_pos.sort_by(|c1, c2| c1.dist_from_path_start.partial_cmp(&c2.dist_from_path_start).unwrap());

    let mut segment_crossings: std::collections::HashMap<usize, Vec<CrossingOnSegment>> = std::collections::HashMap::new();
    for c in crossings_with_pos {
        segment_crossings.entry(c.segment_index).or_default().push(c);
    }

    let mut parts: Vec<String> = Vec::new();
    parts.push(format!("M {} {}", round_num(simplified[0].x), round_num(simplified[0].y)));

    for i in 0..simplified.len() - 1 {
        let a = &simplified[i];
        let b = &simplified[i + 1];
        let list = segment_crossings.get(&i);

        let Some(c_list) = list else {
            parts.push(format!("L {} {}", round_num(b.x), round_num(b.y)));
            continue;
        };
        if c_list.is_empty() {
            parts.push(format!("L {} {}", round_num(b.x), round_num(b.y)));
            continue;
        };

        let is_horiz = (a.y - b.y).abs() <= epsilon;
        let seg_len = (b.x - a.x).abs() + (b.y - a.y).abs();
        let dx = if seg_len > 0.0 { (b.x - a.x) / seg_len } else { 0.0 };
        let dy = if seg_len > 0.0 { (b.y - a.y) / seg_len } else { 0.0 };

        let mut prev_dist = 0.0;

        for k in 0..c_list.len() {
            let cr = &c_list[k];
            let dist_on_seg = if is_horiz { (cr.point.x - a.x).abs() } else { (cr.point.y - a.y).abs() };
            let next_dist_on_seg = if k < c_list.len() - 1 {
                if is_horiz {
                    (c_list[k + 1].point.x - a.x).abs()
                } else {
                    (c_list[k + 1].point.y - a.y).abs()
                }
            } else {
                seg_len
            };

            let avail_before = dist_on_seg - prev_dist;
            let avail_after = next_dist_on_seg - dist_on_seg;
            let max_r = 1.0f64.max(bridge_radius.min(avail_before / 2.0).min(avail_after / 2.0));

            let p_start = Point {
                x: cr.point.x - dx * max_r,
                y: cr.point.y - dy * max_r,
            };
            let p_end = Point {
                x: cr.point.x + dx * max_r,
                y: cr.point.y + dy * max_r,
            };

            parts.push(format!("L {} {}", round_num(p_start.x), round_num(p_start.y)));
            parts.push(format!(
                "A {} {} 0 0 0 {} {}",
                round_num(max_r),
                round_num(max_r),
                round_num(p_end.x),
                round_num(p_end.y)
            ));

            prev_dist = dist_on_seg + max_r;
        }

        parts.push(format!("L {} {}", round_num(b.x), round_num(b.y)));
    }

    parts.join(" ")
}
