//! Step 5.5: Port Candidate Generation & Remote Center Projections.
//!
//! This module evaluates candidate port attachment sides (Top, Bottom, Left, Right) on source
//! and target nodes for each edge.
//!
//! ## Remote Center Projection & Angular Penalty
//! For a given edge connecting source node $S$ and target node $T$:
//! 1. Computes center-to-center vector $\vec{D} = T_{\text{center}} - S_{\text{center}}$.
//! 2. Normalizes $\vec{D}$ into unit direction vector $\hat{u}_{\text{remote}}$.
//! 3. Computes dot product with side outward normal $\hat{n}_{\text{side}}$:
//!    $\text{dot} = \hat{u}_{\text{remote}} \cdot \hat{n}_{\text{side}}$
//! 4. Computes angular deviation: $\text{dev} = 1 - \text{clamp}(\text{dot}, -1, 1)$.
//! 5. Adds angular penalty $(dev_S + dev_T) \times \text{direction\_penalty}$ to `base_cost`.

use serde::{Deserialize, Serialize};
use crate::config::CustomLayoutConfig;
use crate::geometry::segment_intersects_rect_interior;
use crate::types::{EdgeRole, NormalizedEdge, NormalizedNode, Point, PortRef, Rect, Segment, Side};

/// Candidate port attachment configuration evaluated during global port assignment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortCandidate {
    #[serde(rename = "edgeId")]
    pub edge_id: String,
    #[serde(rename = "srcSide")]
    pub src_side: Side,
    #[serde(rename = "tgtSide")]
    pub tgt_side: Side,
    #[serde(rename = "srcPoint")]
    pub src_point: Point,
    #[serde(rename = "srcStub")]
    pub src_stub: Point,
    #[serde(rename = "tgtPoint")]
    pub tgt_point: Point,
    #[serde(rename = "tgtStub")]
    pub tgt_stub: Point,
    #[serde(rename = "estimatedLength")]
    pub estimated_length: f64,
    #[serde(rename = "bendEstimate")]
    pub bend_estimate: usize,
    #[serde(rename = "baseCost")]
    pub base_cost: f64,
}

/// Assigned port sides for an edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortSideAssignment {
    #[serde(rename = "srcSide")]
    pub src_side: Side,
    #[serde(rename = "tgtSide")]
    pub tgt_side: Side,
}

/// Pair of fully resolved source and target port references for an edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgePorts {
    #[serde(rename = "sourcePort")]
    pub source_port: PortRef,
    #[serde(rename = "targetPort")]
    pub target_port: PortRef,
}

/// Result of distributing ports along node side boundaries.
#[derive(Debug, Clone)]
pub struct PortDistributionResult {
    pub ports_by_edge: std::collections::HashMap<String, EdgePorts>,
}

/// Calculates the center point on a specified node side boundary and its outward stub endpoint.
pub fn get_side_center_and_stub(
    node_pos: &Point,
    width: f64,
    height: f64,
    side: Side,
    stub_len: f64,
) -> (Point, Point) {
    let x = node_pos.x;
    let y = node_pos.y;
    match side {
        Side::Top => (
            Point {
                x: x + width / 2.0,
                y,
            },
            Point {
                x: x + width / 2.0,
                y: y - stub_len,
            },
        ),
        Side::Right => (
            Point {
                x: x + width,
                y: y + height / 2.0,
            },
            Point {
                x: x + width + stub_len,
                y: y + height / 2.0,
            },
        ),
        Side::Bottom => (
            Point {
                x: x + width / 2.0,
                y: y + height,
            },
            Point {
                x: x + width / 2.0,
                y: y + height + stub_len,
            },
        ),
        Side::Left => (
            Point {
                x,
                y: y + height / 2.0,
            },
            Point {
                x: x - stub_len,
                y: y + height / 2.0,
            },
        ),
    }
}

/// Returns the outward unit normal vector for a node side.
pub fn get_side_normal(side: Side) -> Point {
    match side {
        Side::Top => Point { x: 0.0, y: -1.0 },
        Side::Right => Point { x: 1.0, y: 0.0 },
        Side::Bottom => Point { x: 0.0, y: 1.0 },
        Side::Left => Point { x: -1.0, y: 0.0 },
    }
}

pub struct NodeContext<'a> {
    pub node: &'a NormalizedNode,
    pub pos: &'a Point,
}

/// Generates candidate port attachments across all 16 combination pairs of (Source Side, Target Side).
pub fn generate_port_candidates(
    edge: &NormalizedEdge,
    src: &NodeContext,
    tgt: &NodeContext,
    role: EdgeRole,
    config: &CustomLayoutConfig,
    all_nodes: Option<&[NormalizedNode]>,
    node_positions: Option<&std::collections::HashMap<String, Point>>,
) -> Vec<PortCandidate> {
    let src_node = src.node;
    let src_pos = src.pos;
    let tgt_node = tgt.node;
    let tgt_pos = tgt.pos;
    let sides = [Side::Top, Side::Right, Side::Bottom, Side::Left];
    let mut all_candidates: Vec<PortCandidate> = Vec::new();
    let mut valid_candidates: Vec<PortCandidate> = Vec::new();

    let src_center = Point {
        x: src_pos.x + src_node.width / 2.0,
        y: src_pos.y + src_node.height / 2.0,
    };
    let tgt_center = Point {
        x: tgt_pos.x + tgt_node.width / 2.0,
        y: tgt_pos.y + tgt_node.height / 2.0,
    };

    let dx_center = tgt_center.x - src_center.x;
    let dy_center = tgt_center.y - src_center.y;
    let dist_center = dx_center.hypot(dy_center);

    let src_remote_unit = if dist_center > config.epsilon {
        Point {
            x: dx_center / dist_center,
            y: dy_center / dist_center,
        }
    } else {
        Point { x: 0.0, y: 0.0 }
    };

    let tgt_remote_unit = Point {
        x: -src_remote_unit.x,
        y: -src_remote_unit.y,
    };

    for &src_side in &sides {
        let (src_pt, src_stub) = get_side_center_and_stub(
            src_pos,
            src_node.width,
            src_node.height,
            src_side,
            config.port_stub_length,
        );

        let src_normal = get_side_normal(src_side);
        let src_dot = src_remote_unit.x * src_normal.x + src_remote_unit.y * src_normal.y;
        let src_dev = 1.0 - src_dot.clamp(-1.0, 1.0);

        for &tgt_side in &sides {
            let (tgt_pt, tgt_stub) = get_side_center_and_stub(
                tgt_pos,
                tgt_node.width,
                tgt_node.height,
                tgt_side,
                config.port_stub_length,
            );

            let tgt_normal = get_side_normal(tgt_side);
            let tgt_dot = tgt_remote_unit.x * tgt_normal.x + tgt_remote_unit.y * tgt_normal.y;
            let tgt_dev = 1.0 - tgt_dot.clamp(-1.0, 1.0);

            let dx = (tgt_stub.x - src_stub.x).abs();
            let dy = (tgt_stub.y - src_stub.y).abs();
            let estimated_length = dx + dy;

            let mut bend_estimate = 2;
            if dx < config.epsilon || dy < config.epsilon {
                bend_estimate = 0;
            } else if (src_side == Side::Right
                && tgt_side == Side::Top
                && tgt_stub.x >= src_stub.x
                && tgt_stub.y >= src_stub.y)
                || (src_side == Side::Bottom
                    && tgt_side == Side::Left
                    && tgt_stub.x >= src_stub.x
                    && tgt_stub.y >= src_stub.y)
                || (src_side == Side::Bottom
                    && tgt_side == Side::Right
                    && tgt_stub.x <= src_stub.x
                    && tgt_stub.y >= src_stub.y)
            {
                bend_estimate = 1;
            }

            let mut angular_penalty = (src_dev + tgt_dev) * config.direction_penalty;

            let is_upward_feedback = (role == EdgeRole::Feedback || edge.is_cycle.unwrap_or(false))
                && tgt_center.y < src_center.y - config.node_gap;
            if is_upward_feedback
                && (src_side == Side::Right || src_side == Side::Left)
                    && (tgt_side == Side::Top || tgt_side == Side::Right || tgt_side == Side::Left)
                {
                    angular_penalty *= 0.1;
                }

            let base_cost =
                estimated_length + (bend_estimate as f64) * config.bend_penalty + angular_penalty;

            let candidate = PortCandidate {
                edge_id: edge.id.clone(),
                src_side,
                tgt_side,
                src_point: src_pt,
                src_stub,
                tgt_point: tgt_pt,
                tgt_stub,
                estimated_length,
                bend_estimate,
                base_cost,
            };

            all_candidates.push(candidate.clone());

            let src_leg = Segment {
                a: src_pt,
                b: src_stub,
            };
            let tgt_leg = Segment {
                a: tgt_pt,
                b: tgt_stub,
            };

            let mut has_leg_conflict = false;
            if let (Some(nodes), Some(positions)) = (all_nodes, node_positions) {
                for n in nodes {
                    let Some(pos) = positions.get(&n.id) else {
                        continue;
                    };
                    let rect = Rect {
                        x: pos.x,
                        y: pos.y,
                        width: n.width,
                        height: n.height,
                    };
                    if n.id != src_node.id
                        && segment_intersects_rect_interior(&src_leg, &rect, config.epsilon)
                    {
                        has_leg_conflict = true;
                        break;
                    }
                    if n.id != tgt_node.id
                        && segment_intersects_rect_interior(&tgt_leg, &rect, config.epsilon)
                    {
                        has_leg_conflict = true;
                        break;
                    }
                }
            }

            if !has_leg_conflict {
                valid_candidates.push(candidate);
            }
        }
    }

    if !valid_candidates.is_empty() {
        valid_candidates
    } else {
        all_candidates
    }
}

/// Enumerates alternative port side assignments sorted by base cost.
pub fn enumerate_port_alternatives(
    _edge_id: &str,
    current: &PortSideAssignment,
    candidates: &[PortCandidate],
    limit: usize,
) -> Vec<PortSideAssignment> {
    let mut sorted = candidates.to_vec();
    sorted.sort_by(|a, b| {
        if (a.base_cost - b.base_cost).abs() > 1e-9 {
            a.base_cost.partial_cmp(&b.base_cost).unwrap()
        } else {
            let key_a = format!("{}:{}", a.src_side.as_str(), a.tgt_side.as_str());
            let key_b = format!("{}:{}", b.src_side.as_str(), b.tgt_side.as_str());
            key_a.cmp(&key_b)
        }
    });

    let mut alternatives: Vec<PortSideAssignment> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    let current_key = format!("{}:{}", current.src_side.as_str(), current.tgt_side.as_str());
    seen.insert(current_key);

    for cand in sorted {
        let key = format!("{}:{}", cand.src_side.as_str(), cand.tgt_side.as_str());
        if seen.contains(&key) {
            continue;
        }
        seen.insert(key);
        alternatives.push(PortSideAssignment {
            src_side: cand.src_side,
            tgt_side: cand.tgt_side,
        });
        if alternatives.len() >= limit {
            break;
        }
    }

    alternatives
}

/// Projects a remote point onto a node side boundary to calculate sorting offset.
pub fn project_remote_to_side_offset(
    node: &NormalizedNode,
    node_pos: &Point,
    side: Side,
    remote_center: &Point,
    epsilon: f64,
) -> f64 {
    let cx = node_pos.x + node.width / 2.0;
    let cy = node_pos.y + node.height / 2.0;
    let dx = remote_center.x - cx;
    let dy = remote_center.y - cy;

    if side == Side::Left || side == Side::Right {
        let side_x = if side == Side::Left {
            node_pos.x
        } else {
            node_pos.x + node.width
        };
        let t = if dx.abs() <= epsilon {
            0.0
        } else {
            (side_x - cx) / dx
        };
        cy + dy * t - node_pos.y
    } else {
        let side_y = if side == Side::Top {
            node_pos.y
        } else {
            node_pos.y + node.height
        };
        let t = if dy.abs() <= epsilon {
            0.0
        } else {
            (side_y - cy) / dy
        };
        cx + dx * t - node_pos.x
    }
}
