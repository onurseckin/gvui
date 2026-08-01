//! Step 5.6: Regret-Ordered Greedy Port Side Assignment & Local Improvement Passes.
//!
//! This module assigns optimal attachment sides (Top, Bottom, Left, Right) to every edge endpoint.
//!
//! ## Regret-Ordered Greedy Initialization
//! 1. Calculates regret for each edge: $\text{regret} = \text{cost}_{\text{second\_best}} - \text{cost}_{\text{best}}$.
//! 2. Sorts edges by regret descending (giving highest priority to edges with fewer good side options).
//! 3. Assigns sides greedily while tracking `side_use_map[node_id:side]`.
//! 4. Incorporates quadratic side-reuse cost penalty:
//!    $\text{reuse\_cost} = \text{side\_reuse\_penalty} \times (U_{\text{src}}^2 + U_{\text{tgt}}^2)$.
//!
//! ## Local Improvement Passes
//! Iterates up to `max_port_improvement_passes` in deterministic order. For each edge, tentatively
//! un-assigns its current sides, re-evaluates all candidate costs against updated node side counts,
//! and swaps to a lower-cost side assignment if an improvement is found.
//!
//! ## Port Distribution along Node Sides
//! Once sides are assigned, `distribute_ports` projects remote endpoint centers to sort edge attachments
//! along each node side, placing ports at uniform fractional intervals with `port_endpoint_padding`.

use std::collections::HashMap;
use crate::config::CustomLayoutConfig;
use crate::edge_routing::port_candidates::{
    project_remote_to_side_offset, PortCandidate, PortDistributionResult, PortSideAssignment,
};
use crate::types::{NormalizedEdge, NormalizedNode, Point, PortRef, Side};

#[derive(Debug, Clone)]
pub struct PortSideAssignmentResult {
    pub assignments: HashMap<String, PortCandidate>,
    pub assignments_by_edge: HashMap<String, PortSideAssignment>,
    pub side_use_map: HashMap<String, usize>,
}

#[derive(Debug, Clone, Default)]
pub struct EdgeMetaForAssignment {
    pub is_feedback: bool,
    pub rank_span: usize,
    pub badge_area: f64,
}

struct SideAttachment {
    edge_id: String,
    is_source: bool,
    remote_node_id: String,
    _remote_center: Point,
    projected_offset: f64,
}

/// Globally assigns port attachment sides across all edges using regret-ordered greedy selection
/// followed by deterministic hill-climbing local improvement passes.
pub fn assign_port_sides_globally(
    edges: &[NormalizedEdge],
    candidates_map: &HashMap<String, Vec<PortCandidate>>,
    config: &CustomLayoutConfig,
    edge_meta_map: Option<&HashMap<String, EdgeMetaForAssignment>>,
) -> PortSideAssignmentResult {
    let mut side_use_map: HashMap<String, usize> = HashMap::new();

    let side_key = |node_id: &str, side: Side| -> String { format!("{}:{}", node_id, side.as_str()) };

    let get_side_use = |map: &HashMap<String, usize>, node_id: &str, side: Side| -> usize {
        *map.get(&side_key(node_id, side)).unwrap_or(&0)
    };

    let inc_side_use = |map: &mut HashMap<String, usize>, node_id: &str, side: Side| {
        let key = side_key(node_id, side);
        *map.entry(key).or_insert(0) += 1;
    };

    let dec_side_use = |map: &mut HashMap<String, usize>, node_id: &str, side: Side| {
        let key = side_key(node_id, side);
        if let Some(val) = map.get_mut(&key) {
            if *val > 0 {
                *val -= 1;
            }
        }
    };

    let evaluate_cost =
        |map: &HashMap<String, usize>, cand: &PortCandidate, edge: &NormalizedEdge| -> f64 {
            let src_use = get_side_use(map, &edge.source, cand.src_side) as f64;
            let tgt_use = get_side_use(map, &edge.target, cand.tgt_side) as f64;
            let reuse_cost = config.side_reuse_penalty * (src_use * src_use + tgt_use * tgt_use);
            cand.base_cost + reuse_cost
        };

    struct EdgeItem<'a> {
        edge: &'a NormalizedEdge,
        regret: f64,
        sorted_cands: Vec<PortCandidate>,
        is_feedback: bool,
        rank_span: usize,
        badge_area: f64,
    }

    let mut edge_regret_list: Vec<EdgeItem> = Vec::new();

    for edge in edges {
        let empty_vec = Vec::new();
        let cands = candidates_map.get(&edge.id).unwrap_or(&empty_vec);
        let mut sorted = cands.clone();
        sorted.sort_by(|a, b| a.base_cost.partial_cmp(&b.base_cost).unwrap());
        let best_cost = sorted.first().map_or(0.0, |c| c.base_cost);
        let second_cost = sorted.get(1).map_or(best_cost, |c| c.base_cost);
        let regret = second_cost - best_cost;

        let meta = edge_meta_map.and_then(|m| m.get(&edge.id));
        let is_feedback = meta.map_or_else(
            || edge.is_cycle.unwrap_or(false) || edge.layout_role == Some(crate::types::EdgeLayoutHint::Feedback),
            |m| m.is_feedback,
        );
        let rank_span = meta.map_or(0, |m| m.rank_span);
        let badge_area = meta.map_or(0.0, |m| m.badge_area);

        edge_regret_list.push(EdgeItem {
            edge,
            regret,
            sorted_cands: sorted,
            is_feedback,
            rank_span,
            badge_area,
        });
    }

    edge_regret_list.sort_by(|a, b| {
        if a.is_feedback != b.is_feedback {
            return if a.is_feedback {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }
        if a.rank_span != b.rank_span {
            return b.rank_span.cmp(&a.rank_span);
        }
        if (b.regret - a.regret).abs() > config.epsilon {
            return b.regret.partial_cmp(&a.regret).unwrap();
        }
        if (b.badge_area - a.badge_area).abs() > config.epsilon {
            return b.badge_area.partial_cmp(&a.badge_area).unwrap();
        }
        a.edge.id.cmp(&b.edge.id)
    });

    let mut assignments: HashMap<String, PortCandidate> = HashMap::new();

    // 1. Initial Regret-Ordered Greedy Assignment
    for item in &edge_regret_list {
        let edge = item.edge;
        let cands = &item.sorted_cands;
        if cands.is_empty() {
            continue;
        }

        let mut best_cand = cands[0].clone();
        let mut best_total_cost = f64::INFINITY;

        for cand in cands {
            let cost = evaluate_cost(&side_use_map, cand, edge);
            if cost < best_total_cost {
                best_total_cost = cost;
                best_cand = cand.clone();
            }
        }

        inc_side_use(&mut side_use_map, &edge.source, best_cand.src_side);
        inc_side_use(&mut side_use_map, &edge.target, best_cand.tgt_side);
        assignments.insert(edge.id.clone(), best_cand);
    }

    // 2. Deterministic Local Improvement Passes
    for _pass in 0..config.max_port_improvement_passes {
        let mut improved = false;
        let mut sorted_edges = edges.to_vec();
        sorted_edges.sort_by(|a, b| a.id.cmp(&b.id));

        for edge in &sorted_edges {
            let Some(current_cand) = assignments.get(&edge.id).cloned() else {
                continue;
            };

            dec_side_use(&mut side_use_map, &edge.source, current_cand.src_side);
            dec_side_use(&mut side_use_map, &edge.target, current_cand.tgt_side);

            let empty_vec = Vec::new();
            let cands = candidates_map.get(&edge.id).unwrap_or(&empty_vec);
            let mut best_cand = current_cand.clone();
            let mut best_cost = evaluate_cost(&side_use_map, &current_cand, edge);

            for cand in cands {
                let cost = evaluate_cost(&side_use_map, cand, edge);
                if cost < best_cost - config.epsilon {
                    best_cost = cost;
                    best_cand = cand.clone();
                }
            }

            if best_cand.src_side != current_cand.src_side || best_cand.tgt_side != current_cand.tgt_side {
                improved = true;
            }

            inc_side_use(&mut side_use_map, &edge.source, best_cand.src_side);
            inc_side_use(&mut side_use_map, &edge.target, best_cand.tgt_side);
            assignments.insert(edge.id.clone(), best_cand);
        }

        if !improved {
            break;
        }
    }

    let mut assignments_by_edge = HashMap::new();
    for (edge_id, cand) in &assignments {
        assignments_by_edge.insert(
            edge_id.clone(),
            PortSideAssignment {
                src_side: cand.src_side,
                tgt_side: cand.tgt_side,
            },
        );
    }

    PortSideAssignmentResult {
        assignments,
        assignments_by_edge,
        side_use_map,
    }
}

/// Evenly distributes ports along assigned node side boundaries to prevent port overlapping.
pub fn distribute_ports(
    edges: &[NormalizedEdge],
    side_assignments: &HashMap<String, PortSideAssignment>,
    node_map: &HashMap<String, NormalizedNode>,
    node_positions: &HashMap<String, Point>,
    config: &CustomLayoutConfig,
    explicit_port_orders: Option<&HashMap<String, Vec<String>>>,
) -> PortDistributionResult {
    let mut side_attachments_map: HashMap<String, Vec<SideAttachment>> = HashMap::new();

    let key = |node_id: &str, side: Side| -> String { format!("{}:{}", node_id, side.as_str()) };

    for edge in edges {
        let Some(assignment) = side_assignments.get(&edge.id) else {
            continue;
        };
        let Some(src_node) = node_map.get(&edge.source) else {
            continue;
        };
        let Some(tgt_node) = node_map.get(&edge.target) else {
            continue;
        };
        let Some(src_pos) = node_positions.get(&edge.source) else {
            continue;
        };
        let Some(tgt_pos) = node_positions.get(&edge.target) else {
            continue;
        };

        let src_center = Point {
            x: src_pos.x + src_node.width / 2.0,
            y: src_pos.y + src_node.height / 2.0,
        };
        let tgt_center = Point {
            x: tgt_pos.x + tgt_node.width / 2.0,
            y: tgt_pos.y + tgt_node.height / 2.0,
        };

        let src_key = key(&edge.source, assignment.src_side);
        side_attachments_map.entry(src_key).or_default().push(SideAttachment {
            edge_id: edge.id.clone(),
            is_source: true,
            remote_node_id: edge.target.clone(),
            _remote_center: tgt_center,
            projected_offset: project_remote_to_side_offset(
                src_node,
                &src_pos,
                assignment.src_side,
                &tgt_center,
                config.epsilon,
            ),
        });

        let tgt_key = key(&edge.target, assignment.tgt_side);
        side_attachments_map.entry(tgt_key).or_default().push(SideAttachment {
            edge_id: edge.id.clone(),
            is_source: false,
            remote_node_id: edge.source.clone(),
            _remote_center: src_center,
            projected_offset: project_remote_to_side_offset(
                tgt_node,
                &tgt_pos,
                assignment.tgt_side,
                &src_center,
                config.epsilon,
            ),
        });
    }

    let mut port_refs_map: HashMap<String, PortRef> = HashMap::new();

    let mut sorted_s_keys: Vec<_> = side_attachments_map.keys().cloned().collect();
    sorted_s_keys.sort();

    for s_key in sorted_s_keys {
        let mut attachments = side_attachments_map.remove(&s_key).unwrap();
        let parts: Vec<&str> = s_key.split(':').collect();
        if parts.len() < 2 {
            continue;
        }
        let node_id = parts[0];
        let side = match parts[1] {
            "Top" | "top" => Side::Top,
            "Right" | "right" => Side::Right,
            "Bottom" | "bottom" => Side::Bottom,
            "Left" | "left" => Side::Left,
            _ => continue,
        };

        let Some(node) = node_map.get(node_id) else {
            continue;
        };
        let Some(node_pos) = node_positions.get(node_id) else {
            continue;
        };
        let is_horizontal_side = side == Side::Top || side == Side::Bottom;
        let explicit_order = explicit_port_orders.and_then(|m| m.get(&s_key));

        if let Some(order) = explicit_order {
            if !order.is_empty() {
                let mut order_map = HashMap::new();
                for (idx, k) in order.iter().enumerate() {
                    order_map.insert(k.as_str(), idx);
                }
                attachments.sort_by(|a, b| {
                    let key_a = format!("{}:{}", a.edge_id, if a.is_source { "src" } else { "tgt" });
                    let key_b = format!("{}:{}", b.edge_id, if b.is_source { "src" } else { "tgt" });
                    let idx_a = order_map.get(key_a.as_str()).copied().unwrap_or(999999);
                    let idx_b = order_map.get(key_b.as_str()).copied().unwrap_or(999999);
                    if idx_a != idx_b {
                        return idx_a.cmp(&idx_b);
                    }
                    if (a.projected_offset - b.projected_offset).abs() > config.epsilon {
                        return a.projected_offset.partial_cmp(&b.projected_offset).unwrap();
                    }
                    key_a.cmp(&key_b)
                });
            }
        } else {
            attachments.sort_by(|a, b| {
                if (a.projected_offset - b.projected_offset).abs() > config.epsilon {
                    return a.projected_offset.partial_cmp(&b.projected_offset).unwrap();
                }
                let remote_comp = a.remote_node_id.cmp(&b.remote_node_id);
                if remote_comp != std::cmp::Ordering::Equal {
                    return remote_comp;
                }
                let edge_comp = a.edge_id.cmp(&b.edge_id);
                if edge_comp != std::cmp::Ordering::Equal {
                    return edge_comp;
                }
                if a.is_source != b.is_source {
                    return if a.is_source {
                        std::cmp::Ordering::Less
                    } else {
                        std::cmp::Ordering::Greater
                    };
                }
                std::cmp::Ordering::Equal
            });
        }

        let m = attachments.len() as f64;
        let side_length = if is_horizontal_side {
            node.width
        } else {
            node.height
        };
        let p = config.port_endpoint_padding;
        let usable = 0.0f64.max(side_length - 2.0 * p);

        for (idx, att) in attachments.iter().enumerate() {
            let offset = p + usable * (((idx as f64) + 0.5) / m);

            let (point, stub) = match side {
                Side::Top => {
                    let pt = Point {
                        x: node_pos.x + offset,
                        y: node_pos.y,
                    };
                    let st = Point {
                        x: pt.x,
                        y: pt.y - config.port_stub_length,
                    };
                    (pt, st)
                }
                Side::Bottom => {
                    let pt = Point {
                        x: node_pos.x + offset,
                        y: node_pos.y + node.height,
                    };
                    let st = Point {
                        x: pt.x,
                        y: pt.y + config.port_stub_length,
                    };
                    (pt, st)
                }
                Side::Left => {
                    let pt = Point {
                        x: node_pos.x,
                        y: node_pos.y + offset,
                    };
                    let st = Point {
                        x: pt.x - config.port_stub_length,
                        y: pt.y,
                    };
                    (pt, st)
                }
                Side::Right => {
                    let pt = Point {
                        x: node_pos.x + node.width,
                        y: node_pos.y + offset,
                    };
                    let st = Point {
                        x: pt.x + config.port_stub_length,
                        y: pt.y,
                    };
                    (pt, st)
                }
            };

            let port_ref = PortRef {
                node_id: node_id.to_string(),
                side,
                index: idx,
                point,
                stub,
            };

            let port_key = format!("{}:{}", att.edge_id, if att.is_source { "src" } else { "tgt" });
            port_refs_map.insert(port_key, port_ref);
        }
    }

    let mut ports_by_edge = HashMap::new();

    for edge in edges {
        let source_port = port_refs_map.get(&format!("{}:src", edge.id));
        let target_port = port_refs_map.get(&format!("{}:tgt", edge.id));

        if let (Some(sp), Some(tp)) = (source_port, target_port) {
            ports_by_edge.insert(
                edge.id.clone(),
                crate::edge_routing::port_candidates::EdgePorts {
                    source_port: sp.clone(),
                    target_port: tp.clone(),
                },
            );
        }
    }

    PortDistributionResult { ports_by_edge }
}
