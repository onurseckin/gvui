//! Step 5.2: Ledger Tracking Edge Segment and Node Interior Occupancy.
//!
//! This module manages track occupancy reservations across the routing grid to prevent
//! overlapping edges (collinear sharing of non-zero length segments) and node interior penetrations.
//!
//! Features:
//! - `RouteOccupancyLedger`: Maintains committed edge segment reservations. When a new route is
//!   committed, existing and new segments are split at all intermediate grid intersection points
//!   so that segment-level occupancy queries operate on uniform grid cell boundaries.
//! - `IndexedOccupancy`: High-performance 1D spatial hash bucket structure splitting horizontal
//!   and vertical occupied segments into `horiz_map` (keyed by rounded Y coordinate) and `vert_map`
//!   (keyed by rounded X coordinate) for fast $O(1)$ collinear conflict and crossing checks.

use std::collections::{HashMap, HashSet};
use serde::{Deserialize, Serialize};
use crate::geometry::{collinear_overlap_length, segment_intersects_rect_interior, segments_cross};
use crate::types::{Point, PortRef, Rect, Segment};

/// Represents an individual edge segment reservation in the occupancy ledger.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteReservation {
    pub edge_id: String,
    pub segment: Segment,
    pub is_endpoint_leg: bool,
}

/// Simplified occupancy record used during pathfinding conflict queries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OccupancyRecord {
    pub edge_id: String,
    pub segment: Segment,
}

/// Conflict report generated when two edges collide.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteConflict {
    #[serde(rename = "edgeIdA")]
    pub edge_id_a: String,
    #[serde(rename = "edgeIdB")]
    pub edge_id_b: String,
    pub reason: String,
}

fn point_equals(p1: &Point, p2: &Point, epsilon: f64) -> bool {
    (p1.x - p2.x).abs() <= epsilon && (p1.y - p2.y).abs() <= epsilon
}

fn point_strictly_inside_segment(p: &Point, seg: &Segment, epsilon: f64) -> bool {
    let is_horiz = (seg.a.y - seg.b.y).abs() <= epsilon;
    let is_vert = (seg.a.x - seg.b.x).abs() <= epsilon;

    if is_horiz {
        if (p.y - seg.a.y).abs() > epsilon {
            return false;
        }
        let min_x = seg.a.x.min(seg.b.x);
        let max_x = seg.a.x.max(seg.b.x);
        return p.x > min_x + epsilon && p.x < max_x - epsilon;
    }

    if is_vert {
        if (p.x - seg.a.x).abs() > epsilon {
            return false;
        }
        let min_y = seg.a.y.min(seg.b.y);
        let max_y = seg.a.y.max(seg.b.y);
        return p.y > min_y + epsilon && p.y < max_y - epsilon;
    }

    false
}

fn segment_intersection_point(s1: &Segment, s2: &Segment, epsilon: f64) -> Option<Point> {
    let s1_horiz = (s1.a.y - s1.b.y).abs() <= epsilon;
    let s1_vert = (s1.a.x - s1.b.x).abs() <= epsilon;
    let s2_horiz = (s2.a.y - s2.b.y).abs() <= epsilon;
    let s2_vert = (s2.a.x - s2.b.x).abs() <= epsilon;

    if s1_horiz && s2_vert {
        let pt = Point {
            x: s2.a.x,
            y: s1.a.y,
        };
        let on_s1 = pt.x >= s1.a.x.min(s1.b.x) - epsilon && pt.x <= s1.a.x.max(s1.b.x) + epsilon;
        let on_s2 = pt.y >= s2.a.y.min(s2.b.y) - epsilon && pt.y <= s2.a.y.max(s2.b.y) + epsilon;
        if on_s1 && on_s2 {
            return Some(pt);
        }
    }

    if s1_vert && s2_horiz {
        let pt = Point {
            x: s1.a.x,
            y: s2.a.y,
        };
        let on_s1 = pt.y >= s1.a.y.min(s1.b.y) - epsilon && pt.y <= s1.a.y.max(s1.b.y) + epsilon;
        let on_s2 = pt.x >= s2.a.x.min(s2.b.x) - epsilon && pt.x <= s2.a.x.max(s2.b.x) + epsilon;
        if on_s1 && on_s2 {
            return Some(pt);
        }
    }

    None
}

fn split_segment_at_points(seg: &Segment, candidate_points: &[Point], epsilon: f64) -> Vec<Segment> {
    let mut internal_points: Vec<Point> = Vec::new();

    for p in candidate_points {
        if point_strictly_inside_segment(p, seg, epsilon)
            && !internal_points.iter().any(|existing| point_equals(existing, p, epsilon)) {
                internal_points.push(*p);
            }
    }

    if internal_points.is_empty() {
        return vec![seg.clone()];
    }

    let is_horiz = (seg.a.y - seg.b.y).abs() <= epsilon;
    let forward = if is_horiz { seg.a.x <= seg.b.x } else { seg.a.y <= seg.b.y };

    internal_points.sort_by(|p1, p2| {
        if is_horiz {
            if forward {
                p1.x.partial_cmp(&p2.x).unwrap()
            } else {
                p2.x.partial_cmp(&p1.x).unwrap()
            }
        } else {
            if forward {
                p1.y.partial_cmp(&p2.y).unwrap()
            } else {
                p2.y.partial_cmp(&p1.y).unwrap()
            }
        }
    });

    let mut all_points: Vec<Point> = vec![seg.a];
    all_points.extend(internal_points);
    all_points.push(seg.b);

    let mut sub_segments: Vec<Segment> = Vec::new();
    for i in 0..all_points.len() - 1 {
        sub_segments.push(Segment {
            a: all_points[i],
            b: all_points[i + 1],
        });
    }

    sub_segments
}

/// Sorts route conflicts deterministically by edge IDs and conflict reason.
pub fn sort_route_conflicts(conflicts: Vec<RouteConflict>) -> Vec<RouteConflict> {
    let mut unique_map: HashMap<String, RouteConflict> = HashMap::new();

    for c in conflicts {
        let key = format!("{}::{}", c.edge_id_a, c.edge_id_b);
        if let Some(existing) = unique_map.get(&key) {
            if existing.reason == "collinear_overlap" && c.reason == "endpoint_stub_conflict" {
                unique_map.insert(key, c);
            }
        } else {
            unique_map.insert(key, c);
        }
    }

    let mut list: Vec<RouteConflict> = unique_map.into_values().collect();
    list.sort_by(|a, b| {
        if a.edge_id_a != b.edge_id_a {
            return a.edge_id_a.cmp(&b.edge_id_a);
        }
        if a.edge_id_b != b.edge_id_b {
            return a.edge_id_b.cmp(&b.edge_id_b);
        }
        a.reason.cmp(&b.reason)
    });
    list
}

/// Performs a preflight check on an endpoint stub leg before routing.
pub fn preflight_endpoint_leg(
    edge_id: &str,
    node_id: &str,
    leg: &Segment,
    obstacles: &[(String, Rect)],
    ledger_reservations: &[RouteReservation],
    epsilon: f64,
) -> Vec<RouteConflict> {
    let mut conflicts: Vec<RouteConflict> = Vec::new();

    for (obs_node_id, rect) in obstacles {
        if obs_node_id == node_id {
            continue;
        }
        if segment_intersects_rect_interior(leg, rect, epsilon) {
            conflicts.push(RouteConflict {
                edge_id_a: edge_id.to_string(),
                edge_id_b: obs_node_id.clone(),
                reason: "node_penetration".to_string(),
            });
        }
    }

    for res in ledger_reservations {
        if res.edge_id == edge_id {
            continue;
        }
        let overlap = collinear_overlap_length(leg, &res.segment, epsilon);
        if overlap > epsilon {
            conflicts.push(RouteConflict {
                edge_id_a: edge_id.to_string(),
                edge_id_b: res.edge_id.clone(),
                reason: if res.is_endpoint_leg {
                    "endpoint_stub_conflict".to_string()
                } else {
                    "collinear_overlap".to_string()
                },
            });
        }
    }

    sort_route_conflicts(conflicts)
}

fn is_leg_for_port(seg: &Segment, port: &PortRef, epsilon: f64) -> bool {
    (point_equals(&seg.a, &port.point, epsilon) && point_equals(&seg.b, &port.stub, epsilon))
        || (point_equals(&seg.a, &port.stub, epsilon) && point_equals(&seg.b, &port.point, epsilon))
}

/// Stateful occupancy ledger tracking committed edge routes.
#[derive(Debug, Clone)]
pub struct RouteOccupancyLedger {
    reservations: Vec<RouteReservation>,
    grid_x_coords: HashSet<i64>,
    grid_y_coords: HashSet<i64>,
    epsilon: f64,
}

impl RouteOccupancyLedger {
    pub fn new(epsilon: f64) -> Self {
        Self {
            reservations: Vec::new(),
            grid_x_coords: HashSet::new(),
            grid_y_coords: HashSet::new(),
            epsilon,
        }
    }

    pub fn set_grid_coordinates(&mut self, x_coords: &[f64], y_coords: &[f64]) {
        self.grid_x_coords = x_coords
            .iter()
            .map(|&x| (x * 1000.0).round() as i64)
            .collect();
        self.grid_y_coords = y_coords
            .iter()
            .map(|&y| (y * 1000.0).round() as i64)
            .collect();
    }

    pub fn commit_route(
        &mut self,
        edge_id: &str,
        points: &[Point],
        source_port: Option<&PortRef>,
        target_port: Option<&PortRef>,
    ) {
        let mut raw_reservations: Vec<RouteReservation> = Vec::new();

        if let Some(sp) = source_port {
            let src_leg = Segment {
                a: sp.point,
                b: sp.stub,
            };
            if (src_leg.a.x - src_leg.b.x).abs() > self.epsilon
                || (src_leg.a.y - src_leg.b.y).abs() > self.epsilon
            {
                raw_reservations.push(RouteReservation {
                    edge_id: edge_id.to_string(),
                    segment: src_leg,
                    is_endpoint_leg: true,
                });
            }
        }

        for i in 0..points.len().saturating_sub(1) {
            let seg = Segment {
                a: points[i],
                b: points[i + 1],
            };
            let is_src_stub_leg = source_port.is_some_and(|sp| is_leg_for_port(&seg, sp, self.epsilon));
            let is_tgt_stub_leg = target_port.is_some_and(|tp| is_leg_for_port(&seg, tp, self.epsilon));
            let is_endpoint_leg = is_src_stub_leg || is_tgt_stub_leg;

            if is_src_stub_leg
                && source_port.is_some_and(|sp| {
                    raw_reservations.iter().any(|r| {
                        r.is_endpoint_leg && is_leg_for_port(&r.segment, sp, self.epsilon)
                    })
                })
            {
                continue;
            }

            raw_reservations.push(RouteReservation {
                edge_id: edge_id.to_string(),
                segment: seg,
                is_endpoint_leg,
            });
        }

        if let Some(tp) = target_port {
            let tgt_leg = Segment {
                a: tp.stub,
                b: tp.point,
            };
            if (tgt_leg.a.x - tgt_leg.b.x).abs() > self.epsilon
                || (tgt_leg.a.y - tgt_leg.b.y).abs() > self.epsilon
            {
                let exists = raw_reservations.iter().any(|r| {
                    r.is_endpoint_leg && is_leg_for_port(&r.segment, tp, self.epsilon)
                });
                if !exists {
                    raw_reservations.push(RouteReservation {
                        edge_id: edge_id.to_string(),
                        segment: tgt_leg,
                        is_endpoint_leg: true,
                    });
                }
            }
        }

        self.commit_reservations(&raw_reservations);
    }

    pub fn commit_reservations(&mut self, raw_reservations: &[RouteReservation]) {
        let mut split_points: Vec<Point> = Vec::new();

        for &x_val in &self.grid_x_coords {
            let x = (x_val as f64) / 1000.0;
            for res in raw_reservations {
                if (res.segment.a.y - res.segment.b.y).abs() <= self.epsilon {
                    split_points.push(Point { x, y: res.segment.a.y });
                }
            }
        }
        for &y_val in &self.grid_y_coords {
            let y = (y_val as f64) / 1000.0;
            for res in raw_reservations {
                if (res.segment.a.x - res.segment.b.x).abs() <= self.epsilon {
                    split_points.push(Point { x: res.segment.a.x, y });
                }
            }
        }

        for existing in &self.reservations {
            split_points.push(existing.segment.a);
            split_points.push(existing.segment.b);
        }

        for raw in raw_reservations {
            split_points.push(raw.segment.a);
            split_points.push(raw.segment.b);

            for existing in &self.reservations {
                if let Some(intersection) =
                    segment_intersection_point(&raw.segment, &existing.segment, self.epsilon)
                {
                    split_points.push(intersection);
                }
            }
        }

        let mut updated_existing: Vec<RouteReservation> = Vec::new();
        for existing in &self.reservations {
            let sub_segs = split_segment_at_points(&existing.segment, &split_points, self.epsilon);
            for sub in sub_segs {
                updated_existing.push(RouteReservation {
                    edge_id: existing.edge_id.clone(),
                    segment: sub,
                    is_endpoint_leg: existing.is_endpoint_leg,
                });
            }
        }
        self.reservations = updated_existing;

        for raw in raw_reservations {
            let sub_segs = split_segment_at_points(&raw.segment, &split_points, self.epsilon);
            for sub in sub_segs {
                self.reservations.push(RouteReservation {
                    edge_id: raw.edge_id.clone(),
                    segment: sub,
                    is_endpoint_leg: raw.is_endpoint_leg,
                });
            }
        }
    }

    pub fn query_conflicts(&self, candidates: &[RouteReservation]) -> Vec<RouteConflict> {
        let mut conflicts: Vec<RouteConflict> = Vec::new();

        for cand in candidates {
            for res in &self.reservations {
                if cand.edge_id == res.edge_id {
                    continue;
                }

                let overlap = collinear_overlap_length(&cand.segment, &res.segment, self.epsilon);
                if overlap > self.epsilon {
                    let reason = if cand.is_endpoint_leg || res.is_endpoint_leg {
                        "endpoint_stub_conflict"
                    } else {
                        "collinear_overlap"
                    };
                    conflicts.push(RouteConflict {
                        edge_id_a: cand.edge_id.clone(),
                        edge_id_b: res.edge_id.clone(),
                        reason: reason.to_string(),
                    });
                }
            }
        }

        sort_route_conflicts(conflicts)
    }

    pub fn release(&mut self, edge_id: &str) {
        self.reservations.retain(|r| r.edge_id != edge_id);
    }

    pub fn get_reservations(&self) -> Vec<RouteReservation> {
        let mut list = self.reservations.clone();
        list.sort_by(|a, b| {
            if a.edge_id != b.edge_id {
                return a.edge_id.cmp(&b.edge_id);
            }
            if (a.segment.a.x - b.segment.a.x).abs() > self.epsilon {
                return a.segment.a.x.partial_cmp(&b.segment.a.x).unwrap();
            }
            if (a.segment.a.y - b.segment.a.y).abs() > self.epsilon {
                return a.segment.a.y.partial_cmp(&b.segment.a.y).unwrap();
            }
            if (a.segment.b.x - b.segment.b.x).abs() > self.epsilon {
                return a.segment.b.x.partial_cmp(&b.segment.b.x).unwrap();
            }
            a.segment.b.y.partial_cmp(&b.segment.b.y).unwrap()
        });
        list
    }

    pub fn to_occupancy_records(&self) -> Vec<OccupancyRecord> {
        self.get_reservations()
            .into_iter()
            .map(|r| OccupancyRecord {
                edge_id: r.edge_id,
                segment: r.segment,
            })
            .collect()
    }
}

/// 1D coordinate-indexed spatial hash bucket map for rapid pathfinding step checks.
pub struct IndexedOccupancy {
    horiz_map: HashMap<i64, Vec<OccupancyRecord>>,
    vert_map: HashMap<i64, Vec<OccupancyRecord>>,
    horiz_y_keys: Vec<i64>,
    vert_x_keys: Vec<i64>,
    other_records: Vec<OccupancyRecord>,
    epsilon: f64,
}

pub struct CheckSegmentConflictResult {
    pub is_collinear_occupied: bool,
    pub step_crossings: usize,
    pub queries_count: usize,
}

impl IndexedOccupancy {
    pub fn new(occupancy: &[OccupancyRecord], epsilon: f64) -> Self {
        let mut horiz_map: HashMap<i64, Vec<OccupancyRecord>> = HashMap::new();
        let mut vert_map: HashMap<i64, Vec<OccupancyRecord>> = HashMap::new();
        let mut other_records: Vec<OccupancyRecord> = Vec::new();

        let round_coord = |val: f64| (val * 1000.0).round() as i64;

        for occ in occupancy {
            let is_horiz = (occ.segment.a.y - occ.segment.b.y).abs() <= epsilon;
            let is_vert = (occ.segment.a.x - occ.segment.b.x).abs() <= epsilon;

            if is_horiz {
                let y_key = round_coord(occ.segment.a.y);
                horiz_map.entry(y_key).or_default().push(occ.clone());
            } else if is_vert {
                let x_key = round_coord(occ.segment.a.x);
                vert_map.entry(x_key).or_default().push(occ.clone());
            } else {
                other_records.push(occ.clone());
            }
        }

        let mut horiz_y_keys: Vec<i64> = horiz_map.keys().cloned().collect();
        horiz_y_keys.sort();
        let mut vert_x_keys: Vec<i64> = vert_map.keys().cloned().collect();
        vert_x_keys.sort();

        Self {
            horiz_map,
            vert_map,
            horiz_y_keys,
            vert_x_keys,
            other_records,
            epsilon,
        }
    }

    pub fn check_segment_conflict(
        &self,
        seg: &Segment,
        edge_id: &str,
    ) -> CheckSegmentConflictResult {
        let mut queries_count = 0;
        let mut is_collinear_occupied = false;
        let mut step_crossings = 0;

        let round_coord = |val: f64| (val * 1000.0).round() as i64;

        let is_horiz = (seg.a.y - seg.b.y).abs() <= self.epsilon;
        let is_vert = (seg.a.x - seg.b.x).abs() <= self.epsilon;

        if is_horiz {
            let y_key = round_coord(seg.a.y);
            let min_x_key = round_coord(seg.a.x.min(seg.b.x));
            let max_x_key = round_coord(seg.a.x.max(seg.b.x));

            if let Some(col_list) = self.horiz_map.get(&y_key) {
                queries_count += 1;
                for occ in col_list {
                    if occ.edge_id == edge_id {
                        continue;
                    }
                    if collinear_overlap_length(seg, &occ.segment, self.epsilon) > self.epsilon {
                        is_collinear_occupied = true;
                        break;
                    }
                }
            }

            if !is_collinear_occupied {
                for &x_key in &self.vert_x_keys {
                    if x_key < min_x_key - 1 {
                        continue;
                    }
                    if x_key > max_x_key + 1 {
                        break;
                    }
                    if let Some(vert_list) = self.vert_map.get(&x_key) {
                        queries_count += 1;
                        for occ in vert_list {
                            if occ.edge_id == edge_id {
                                continue;
                            }
                            if segments_cross(seg, &occ.segment, self.epsilon) {
                                step_crossings += 1;
                            }
                        }
                    }
                }
            }
        } else if is_vert {
            let x_key = round_coord(seg.a.x);
            let min_y_key = round_coord(seg.a.y.min(seg.b.y));
            let max_y_key = round_coord(seg.a.y.max(seg.b.y));

            if let Some(col_list) = self.vert_map.get(&x_key) {
                queries_count += 1;
                for occ in col_list {
                    if occ.edge_id == edge_id {
                        continue;
                    }
                    if collinear_overlap_length(seg, &occ.segment, self.epsilon) > self.epsilon {
                        is_collinear_occupied = true;
                        break;
                    }
                }
            }

            if !is_collinear_occupied {
                for &y_key in &self.horiz_y_keys {
                    if y_key < min_y_key - 1 {
                        continue;
                    }
                    if y_key > max_y_key + 1 {
                        break;
                    }
                    if let Some(horiz_list) = self.horiz_map.get(&y_key) {
                        queries_count += 1;
                        for occ in horiz_list {
                            if occ.edge_id == edge_id {
                                continue;
                            }
                            if segments_cross(seg, &occ.segment, self.epsilon) {
                                step_crossings += 1;
                            }
                        }
                    }
                }
            }
        }

        if !is_collinear_occupied && !self.other_records.is_empty() {
            queries_count += 1;
            for occ in &self.other_records {
                if occ.edge_id == edge_id {
                    continue;
                }
                if collinear_overlap_length(seg, &occ.segment, self.epsilon) > self.epsilon {
                    is_collinear_occupied = true;
                    break;
                }
                if segments_cross(seg, &occ.segment, self.epsilon) {
                    step_crossings += 1;
                }
            }
        }

        CheckSegmentConflictResult {
            is_collinear_occupied,
            step_crossings,
            queries_count,
        }
    }
}
