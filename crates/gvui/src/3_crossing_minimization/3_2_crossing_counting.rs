//! # Step 3.2: Edge Crossing Detection & Counting
//!
//! This module provides fast algorithms for detecting and counting edge crossings in both discrete
//! layered graph representations (rank order sequences) and continuous 2D routed polylines.
//!
//! ## Mathematical Formulas & Algorithms
//!
//! 1. **Single-Layer Edge Crossing Detection**:
//!    Given two adjacent layers $L_{upper}$ and $L_{lower}$ with 0-indexed node orders $u_{pos}: U \to \mathbb{N}$
//!    and $v_{pos}: V \to \mathbb{N}$, two edges $e_1 = (u_1, v_1)$ and $e_2 = (u_2, v_2)$ cross if and only if:
//!    $$ (u_{pos}(u_1) < u_{pos}(u_2) \land v_{pos}(v_1) > v_{pos}(v_2)) \lor (u_{pos}(u_1) > u_{pos}(u_2) \land v_{pos}(v_1) < v_{pos}(v_2)) $$
//!    Edges sharing an endpoint ($u_1 = u_2$ or $v_1 = v_2$) do not cross.
//!
//! 2. **Multi-Rank Span Crossing Counting**:
//!    For edges spanning across multiple ranks, crossing detection tests whether two edges $e_1, e_2$
//!    overlap in their rank intervals $[r_{src1}, r_{tgt1}]$ and $[r_{src2}, r_{tgt2}]$. When intervals overlap,
//!    their endpoint orders $o_{src1}, o_{tgt1}, o_{src2}, o_{tgt2}$ are compared at shared rank levels.
//!
//! 3. **2D Segment Crossings & Orientations**:
//!    For continuous routed edge segments $S_1 = (p_1, q_1)$ and $S_2 = (p_2, q_2)$, the 2D cross product orientation is:
//!    $$ \text{orientation}(p, q, r) = (q_y - p_y)(r_x - q_x) - (q_x - p_x)(r_y - q_y) $$
//!    Segments cross iff $(O(p_1,q_1,p_2) \cdot O(p_1,q_1,q_2) < 0) \land (O(p_2,q_2,p_1) \cdot O(p_2,q_2,q_1) < 0)$
//!    within floating-point tolerance $\epsilon$.
//!
//! 4. **Bridge Owner Priority**:
//!    When two edges cross in 2D space, the edge with higher structural role priority (Forward > Cross > Feedback > SelfLoop)
//!    or alphabetical ID tie-breaker is designated as the straight edge, and the other edge gets a bridge arc.

use crate::types::{EdgeCrossing, EdgeRole, LayerNode, NormalizedEdge, Point, RoutedPath, Segment};
use std::collections::HashMap;

/// Counts edge crossings between two adjacent layers (`layer_upper` and `layer_lower`).
pub fn count_layer_crossings(
    layer_upper: &[String],
    layer_lower: &[String],
    edges: &[(String, String)],
) -> usize {
    let u_pos: HashMap<&str, usize> = layer_upper
        .iter()
        .enumerate()
        .map(|(idx, id)| (id.as_str(), idx))
        .collect();

    let v_pos: HashMap<&str, usize> = layer_lower
        .iter()
        .enumerate()
        .map(|(idx, id)| (id.as_str(), idx))
        .collect();

    let valid_edges: Vec<&(String, String)> = edges
        .iter()
        .filter(|(u, v)| u_pos.contains_key(u.as_str()) && v_pos.contains_key(v.as_str()))
        .collect();

    let mut crossings = 0;

    for i in 0..valid_edges.len() {
        for j in (i + 1)..valid_edges.len() {
            let e1 = valid_edges[i];
            let e2 = valid_edges[j];

            if e1.0 == e2.0 || e1.1 == e2.1 {
                continue;
            }

            let u1 = u_pos[e1.0.as_str()];
            let u2 = u_pos[e2.0.as_str()];
            let v1 = v_pos[e1.1.as_str()];
            let v2_actual = v_pos[e2.1.as_str()];

            if (u1 < u2 && v1 > v2_actual) || (u1 > u2 && v1 < v2_actual) {
                crossings += 1;
            }
        }
    }

    crossings
}

/// Counts total edge crossings across all adjacent layer pairs in an expanded layer graph.
pub fn count_total_graph_crossings(
    layers: &[Vec<LayerNode>],
    successors_map: &HashMap<String, Vec<String>>,
) -> usize {
    let mut total = 0;

    if layers.len() < 2 {
        return 0;
    }

    for r in 0..(layers.len() - 1) {
        let upper_ids: Vec<String> = layers[r].iter().map(|n| n.id.clone()).collect();
        let lower_ids: Vec<String> = layers[r + 1].iter().map(|n| n.id.clone()).collect();

        let mut edges_between = Vec::new();
        for u in &upper_ids {
            if let Some(succs) = successors_map.get(u) {
                for v in succs {
                    edges_between.push((u.clone(), v.clone()));
                }
            }
        }

        total += count_layer_crossings(&upper_ids, &lower_ids, &edges_between);
    }

    total
}

/// Evaluates total edge crossing count for a given rank ordering state, accounting for multi-rank spans and same-rank edges.
pub fn calculate_crossing_count(ranks: &[Vec<String>], edges: &[NormalizedEdge]) -> usize {
    let mut pos_map: HashMap<String, (usize, usize)> = HashMap::new();
    for (r_idx, rank) in ranks.iter().enumerate() {
        for (o_idx, node_id) in rank.iter().enumerate() {
            pos_map.insert(node_id.clone(), (r_idx, o_idx));
        }
    }

    let mut count = 0;
    for i in 0..edges.len() {
        for j in (i + 1)..edges.len() {
            let e1 = &edges[i];
            let e2 = &edges[j];

            if let (
                Some(&(r1_src, o1_src)),
                Some(&(r1_tgt, o1_tgt)),
                Some(&(r2_src, o2_src)),
                Some(&(r2_tgt, o2_tgt)),
            ) = (
                pos_map.get(&e1.source),
                pos_map.get(&e1.target),
                pos_map.get(&e2.source),
                pos_map.get(&e2.target),
            ) {
                let min_r1 = r1_src.min(r1_tgt);
                let max_r1 = r1_src.max(r1_tgt);
                let min_r2 = r2_src.min(r2_tgt);
                let max_r2 = r2_src.max(r2_tgt);

                if min_r1 <= max_r2 && max_r1 >= min_r2 {
                    if (r1_src == r2_src && r1_tgt == r2_tgt)
                        || (r1_src == r2_tgt && r1_tgt == r2_src)
                    {
                        if (o1_src < o2_src && o1_tgt > o2_tgt) || (o1_src > o2_src && o1_tgt < o2_tgt)
                        {
                            count += 1;
                        }
                    } else if r1_src == r2_src {
                        let o1_end = if r1_src < r1_tgt { o1_tgt } else { o1_src };
                        let o2_end = if r2_src < r2_tgt { o2_tgt } else { o2_src };
                        if (o1_src < o2_src && o1_end > o2_end) || (o1_src > o2_src && o1_end < o2_end) {
                            count += 1;
                        }
                    } else if r1_src == r1_tgt && (r2_src == r1_src || r2_tgt == r1_src) {
                        // e1 is same-rank edge at r1_src
                        let left_1 = o1_src.min(o1_tgt);
                        let right_1 = o1_src.max(o1_tgt);
                        let pos_2 = if r2_src == r1_src { o2_src } else { o2_tgt };
                        if pos_2 > left_1 && pos_2 < right_1 {
                            count += 1;
                        }
                    } else if r2_src == r2_tgt && (r1_src == r2_src || r1_tgt == r2_src) {
                        // e2 is same-rank edge at r2_src
                        let left_2 = o2_src.min(o2_tgt);
                        let right_2 = o2_src.max(o2_tgt);
                        let pos_1 = if r1_src == r2_src { o1_src } else { o1_tgt };
                        if pos_1 > left_2 && pos_1 < right_2 {
                            count += 1;
                        }
                    }
                }
            }
        }
    }
    count
}

/// Returns the 2D cross-product orientation of point triplet (p, q, r).
pub fn orientation(p: &Point, q: &Point, r: &Point) -> f64 {
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
}

/// Checks if point q lies on segment pr (bounding box test with epsilon tolerance).
pub fn on_segment(p: &Point, q: &Point, r: &Point, epsilon: f64) -> bool {
    q.x >= p.x.min(r.x) - epsilon
        && q.x <= p.x.max(r.x) + epsilon
        && q.y >= p.y.min(r.y) - epsilon
        && q.y <= p.y.max(r.y) + epsilon
}

/// Determines whether segment A and segment B cross in 2D space.
/// Strictly tests interior intersection of perpendicular orthogonal segments, matching Legacy TS.
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

    // Non-orthogonal diagonal segment fallback for general 2D geometry tests
    let o1 = orientation(&s1.a, &s1.b, &s2.a);
    let o2 = orientation(&s1.a, &s1.b, &s2.b);
    let o3 = orientation(&s2.a, &s2.b, &s1.a);
    let o4 = orientation(&s2.a, &s2.b, &s1.b);

    (o1 > epsilon && o2 < -epsilon || o1 < -epsilon && o2 > epsilon)
        && (o3 > epsilon && o4 < -epsilon || o3 < -epsilon && o4 > epsilon)
}

/// Assigns a numerical priority integer to edge roles (higher = higher priority).
pub fn role_priority(role: Option<EdgeRole>) -> usize {
    match role {
        Some(EdgeRole::Forward) => 4,
        Some(EdgeRole::Cross) => 3,
        Some(EdgeRole::Feedback) => 2,
        Some(EdgeRole::SelfLoop) | Some(EdgeRole::SelfRole) => 1,
        None => 0,
    }
}

/// Determines which edge owns the bridge arc when edge A and edge B cross.
pub fn get_bridge_owner_edge_id(
    edge_a: (&str, Option<EdgeRole>),
    edge_b: (&str, Option<EdgeRole>),
) -> String {
    let prio_a = role_priority(edge_a.1);
    let prio_b = role_priority(edge_b.1);

    if prio_a != prio_b {
        if prio_a > prio_b {
            edge_b.0.to_string()
        } else {
            edge_a.0.to_string()
        }
    } else {
        if edge_a.0 < edge_b.0 {
            edge_b.0.to_string()
        } else {
            edge_a.0.to_string()
        }
    }
}

/// Detects all 2D segment crossings among a set of routed edge polylines.
pub fn detect_edge_crossings(
    edges: &[RoutedPath],
    edge_roles: Option<&HashMap<String, EdgeRole>>,
    epsilon: f64,
) -> Vec<EdgeCrossing> {
    let mut crossings: Vec<EdgeCrossing> = Vec::new();

    for i in 0..edges.len() {
        let edge_a = &edges[i];
        if edge_a.points.len() < 2 {
            continue;
        }

        for edge_b in edges.iter().skip(i + 1) {
            if edge_b.points.len() < 2 {
                continue;
            }

            for k in 0..edge_a.points.len() - 1 {
                let seg_a = Segment {
                    a: edge_a.points[k],
                    b: edge_a.points[k + 1],
                };

                for l in 0..edge_b.points.len() - 1 {
                    let seg_b = Segment {
                        a: edge_b.points[l],
                        b: edge_b.points[l + 1],
                    };

                    if segments_cross(&seg_a, &seg_b, epsilon) {
                        let pt = if (seg_a.a.y - seg_a.b.y).abs() <= epsilon {
                            Point {
                                x: seg_b.a.x,
                                y: seg_a.a.y,
                            }
                        } else {
                            Point {
                                x: seg_a.a.x,
                                y: seg_b.a.y,
                            }
                        };

                        let role_a = edge_roles.and_then(|m| m.get(&edge_a.edge_id)).cloned();
                        let role_b = edge_roles.and_then(|m| m.get(&edge_b.edge_id)).cloned();

                        let bridge_owner_edge_id = get_bridge_owner_edge_id(
                            (&edge_a.edge_id, role_a),
                            (&edge_b.edge_id, role_b),
                        );

                        crossings.push(EdgeCrossing {
                            edge_id_a: edge_a.edge_id.clone(),
                            edge_id_b: edge_b.edge_id.clone(),
                            point: pt,
                            bridge_owner_edge_id: Some(bridge_owner_edge_id),
                        });
                    }
                }
            }
        }
    }

    crossings
}
