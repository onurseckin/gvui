//! # Step 5.4 (Phase 8g): Badge placement
//!
//! In v1 this was a 1,000-line candidate generator with scoring, a disjoint-set structure and
//! backtracking. In v2 it is a **lookup**, because Phase 4 turned every edge label into a real
//! `Label` item in the layered graph: Phase 5 ordered it among its rank's siblings, Phase 7
//! separated it from its neighbours by `node_gap`, and the rank is tall enough for it by the
//! definition of rank height. The space is allocated by construction, so there is nothing to search
//! for and nothing to retry.
//!
//! The only search-shaped code here is the **safety net**, which fires exclusively for the
//! degenerate case of an edge that carries a label but never got a `Label` item (a `min_len = 1`
//! labelled edge, which Phase 3 is supposed to make impossible). It tries five fixed offsets and
//! then gives up with a leader line. [`BadgeResult::leader_count`] is therefore a **quality signal
//! that something upstream failed**, not a normal outcome — a healthy layout reports zero.

use super::edge_style::simplify_polyline;
use crate::config::{CustomLayoutConfig, LabelPlacement};
use crate::geometry::{expand_rect, point_at_path_ratio, rects_overlap_strict};
use crate::types::{BadgePlacement, GraphIr, Item, LabelBox, Layered, Point, Rect, RoutedPath};
use std::collections::HashMap;

/// Cell size of the uniform spatial hash used by the safety net, in pixels.
///
/// Chosen to be comfortably larger than a badge and a typical node so a query touches at most a
/// handful of cells. It is a bucketing constant, not a tuning knob: it changes speed, never output.
const HASH_CELL: f64 = 200.0;

/// Beyond this many cells a rectangle is filed in the "wide" list and checked on every query,
/// instead of being registered cell by cell.
const MAX_CELLS_PER_RECT: i64 = 256;

/// Fixed offsets along the route tried by the safety net, in path-length ratio, most central first.
const SAFETY_NET_RATIOS: [f64; 5] = [0.5, 0.35, 0.65, 0.2, 0.8];

/// Placed badges plus the count of those that needed a leader line.
pub struct BadgeResult {
    pub badges: Vec<BadgePlacement>,
    pub leader_count: usize,
}

/// Places one badge for every labelled edge.
///
/// Ordering is deterministic and structural: labelled chains in chain index order, then flat edges
/// in flat index order, then self-loops in `layered.self_loops` order, then the safety-net cases in
/// chain index order. Nothing here iterates a `HashMap` to reach a decision.
///
/// **`BadgePlacement::label` is left empty.** `GraphIr` interns edge *ids* but not edge label text
/// — nothing after Phase 1 is allowed to see text — so Phase 9 must join these placements back to
/// the wire edges by `edge_id` and fill the display string in.
pub fn place_badges(
    layered: &Layered,
    ir: &GraphIr,
    routes: &[RoutedPath],
    config: &CustomLayoutConfig,
) -> BadgeResult {
    let mut route_of: HashMap<&str, usize> = HashMap::with_capacity(routes.len());
    for (i, route) in routes.iter().enumerate() {
        route_of.entry(route.edge_id.as_str()).or_insert(i);
    }

    // Obstacles for the safety net: every real node, then every badge as it is placed. Dummy and
    // label items are not obstacles — a label item *is* the badge's reservation.
    let mut obstacles = SpatialHash::new(HASH_CELL);
    for item in &layered.items {
        if item.kind.is_real() {
            obstacles.insert(item.rect());
        }
    }

    let mut badges: Vec<BadgePlacement> = Vec::new();
    let mut leader_count = 0usize;
    let mut orphans: Vec<usize> = Vec::new();

    // ---- 1. Labelled chains: the reservation is the answer -------------------------------------
    for (chain_index, chain) in layered.chains.iter().enumerate() {
        let measured = ir.edges.get(chain.edge as usize).and_then(|e| e.label);
        let Some(label_at) = chain.label_at else {
            if measured.is_some() {
                orphans.push(chain_index);
            }
            continue;
        };
        let Some(item) = chain
            .items
            .get(label_at)
            .and_then(|&ix| layered.items.get(ix as usize))
        else {
            continue;
        };
        let Some(edge_id) = ir.edge_names.get(chain.edge as usize) else {
            continue;
        };

        let rect = badge_rect_from_label_item(item, measured, config);
        let anchor_point = route_of
            .get(edge_id.as_str())
            .and_then(|&i| routes.get(i))
            .map(|r| nearest_point_on_polyline(&r.points, rect.center()))
            .unwrap_or_else(|| rect.center());

        obstacles.insert(rect);
        badges.push(BadgePlacement {
            edge_id: edge_id.clone(),
            label: String::new(),
            rect,
            anchor_point,
            leader_points: None,
        });
    }

    // ---- 2. Flat edges: centre the badge on the corridor run ------------------------------------
    for flat in &layered.flat_edges {
        let Some(measured) = flat.label else {
            continue;
        };
        let Some(edge_id) = ir.edge_names.get(flat.edge as usize) else {
            continue;
        };
        let Some(route) = route_of.get(edge_id.as_str()).and_then(|&i| routes.get(i)) else {
            continue;
        };

        // Phase 6d widened the corridor by the label width, so the vertical run is exactly where
        // the space was reserved. A flat edge that collapsed to a straight line has no vertical
        // run; its midpoint is then the reserved position by the same argument.
        let centre = longest_vertical_midpoint(&route.points)
            .unwrap_or_else(|| point_at_path_ratio(&route.points, 0.5));
        let rect = centred_rect(centre, measured);
        let anchor_point = nearest_point_on_polyline(&route.points, centre);

        obstacles.insert(rect);
        badges.push(BadgePlacement {
            edge_id: edge_id.clone(),
            label: String::new(),
            rect,
            anchor_point,
            leader_points: None,
        });
    }

    // ---- 3. Self-loops: hang the badge off the loop's outer run ---------------------------------
    for &edge in &layered.self_loops {
        let Some(measured) = ir.edges.get(edge as usize).and_then(|e| e.label) else {
            continue;
        };
        let Some(edge_id) = ir.edge_names.get(edge as usize) else {
            continue;
        };
        let Some(route) = route_of.get(edge_id.as_str()).and_then(|&i| routes.get(i)) else {
            continue;
        };

        // The loop's outer vertical run is the only part of it that is guaranteed clear of the
        // node, so the badge sits just beyond it.
        let run = longest_vertical_midpoint(&route.points)
            .unwrap_or_else(|| point_at_path_ratio(&route.points, 0.5));
        let centre = Point {
            x: run.x + measured.width / 2.0 + config.badge_clearance,
            y: run.y,
        };
        let rect = centred_rect(centre, measured);
        let anchor_point = nearest_point_on_polyline(&route.points, centre);

        obstacles.insert(rect);
        badges.push(BadgePlacement {
            edge_id: edge_id.clone(),
            label: String::new(),
            rect,
            anchor_point,
            leader_points: None,
        });
    }

    // ---- 4. Safety net: a labelled edge with no reservation --------------------------------------
    for chain_index in orphans {
        let Some(chain) = layered.chains.get(chain_index) else {
            continue;
        };
        let Some(measured) = ir.edges.get(chain.edge as usize).and_then(|e| e.label) else {
            continue;
        };
        let Some(edge_id) = ir.edge_names.get(chain.edge as usize) else {
            continue;
        };
        let Some(route) = route_of.get(edge_id.as_str()).and_then(|&i| routes.get(i)) else {
            continue;
        };

        // One perpendicular direction, taken from the segment at the route's midpoint, then a few
        // slides along the route. No rotation, no scoring, no backtracking.
        let normal = midpoint_normal(&route.points);
        let offset = measured.width.max(measured.height) / 2.0 + config.badge_clearance;
        let clearance = config.badge_clearance.max(0.0);

        let mut placed: Option<Rect> = None;
        for &ratio in SAFETY_NET_RATIOS.iter() {
            let on_path = point_at_path_ratio(&route.points, ratio);
            let candidate = centred_rect(
                Point {
                    x: on_path.x + normal.x * offset,
                    y: on_path.y + normal.y * offset,
                },
                measured,
            );
            if !obstacles.overlaps(&expand_rect(&candidate, clearance), config.epsilon) {
                placed = Some(candidate);
                break;
            }
        }

        let (rect, leader_points) = match placed {
            Some(rect) => (rect, None),
            None => {
                let on_path = point_at_path_ratio(&route.points, 0.5);
                let rect = centred_rect(
                    Point {
                        x: on_path.x + normal.x * offset,
                        y: on_path.y + normal.y * offset,
                    },
                    measured,
                );
                leader_count += 1;
                let leader = simplify_polyline(&[on_path, rect.center()], config.epsilon);
                (rect, Some(leader))
            }
        };

        let anchor_point = nearest_point_on_polyline(&route.points, rect.center());
        obstacles.insert(rect);
        badges.push(BadgePlacement {
            edge_id: edge_id.clone(),
            label: String::new(),
            rect,
            anchor_point,
            leader_points,
        });
    }

    BadgeResult {
        badges,
        leader_count,
    }
}

/// Badge rectangle for a chain that owns a `Label` item.
///
/// The rectangle is always contained in the item's own box, which is what makes "no badge overlaps
/// a node or another badge" true by construction rather than by checking. Under `BesideEdge` the
/// item is double width and only the **right** half is the badge; the left half is the lane the
/// edge runs down. `badge_clearance` is spent as a push away from that lane, and only as far as the
/// spare width allows, so the badge is never shrunk below its measured size.
fn badge_rect_from_label_item(
    item: &Item,
    measured: Option<LabelBox>,
    config: &CustomLayoutConfig,
) -> Rect {
    let region = match config.label_placement {
        LabelPlacement::BesideEdge => Rect {
            x: item.x + item.width / 2.0,
            y: item.y,
            width: item.width / 2.0,
            height: item.height,
        },
        LabelPlacement::OnEdge | LabelPlacement::AboveEdge => item.rect(),
    };

    let width = measured
        .map(|b| b.width)
        .unwrap_or(region.width)
        .clamp(0.0, region.width.max(0.0));
    let height = measured
        .map(|b| b.height)
        .unwrap_or(region.height)
        .clamp(0.0, region.height.max(0.0));

    let slack_x = (region.width - width).max(0.0);
    let slack_y = (region.height - height).max(0.0);
    let bias = if matches!(config.label_placement, LabelPlacement::BesideEdge) {
        config.badge_clearance.max(0.0).min(slack_x / 2.0)
    } else {
        0.0
    };

    Rect {
        x: region.x + slack_x / 2.0 + bias,
        y: region.y + slack_y / 2.0,
        width,
        height,
    }
}

/// A `LabelBox` centred on a point.
fn centred_rect(centre: Point, size: LabelBox) -> Rect {
    Rect {
        x: centre.x - size.width / 2.0,
        y: centre.y - size.height / 2.0,
        width: size.width,
        height: size.height,
    }
}

/// Midpoint of the longest vertical run in a polyline, if it has one.
///
/// Ties keep the earliest run so the result does not depend on iteration incidentals.
fn longest_vertical_midpoint(points: &[Point]) -> Option<Point> {
    let mut best: Option<(f64, Point)> = None;
    for w in points.windows(2) {
        let dx = (w[1].x - w[0].x).abs();
        let dy = (w[1].y - w[0].y).abs();
        if dx > dy || dy <= 0.0 {
            continue;
        }
        if best.as_ref().is_none_or(|(len, _)| dy > *len) {
            best = Some((
                dy,
                Point {
                    x: (w[0].x + w[1].x) / 2.0,
                    y: (w[0].y + w[1].y) / 2.0,
                },
            ));
        }
    }
    best.map(|(_, p)| p)
}

/// Unit perpendicular of the segment containing the route's midpoint.
///
/// A vertical run is offset to the right, a horizontal run upward — the conventions a reader
/// expects for a badge that sits *beside* rather than *on* its edge. Degenerate input offsets
/// upward.
fn midpoint_normal(points: &[Point]) -> Point {
    let mid = point_at_path_ratio(points, 0.5);
    let mut best: Option<(f64, Point)> = None;
    for w in points.windows(2) {
        let dx = w[1].x - w[0].x;
        let dy = w[1].y - w[0].y;
        if dx == 0.0 && dy == 0.0 {
            continue;
        }
        let px = w[0].x + (w[1].x - w[0].x) / 2.0;
        let py = w[0].y + (w[1].y - w[0].y) / 2.0;
        let d = (px - mid.x).powi(2) + (py - mid.y).powi(2);
        if best.as_ref().is_none_or(|(bd, _)| d < *bd) {
            let len = (dx * dx + dy * dy).sqrt();
            // Rotate the direction by -90 degrees: vertical -> +x, horizontal -> -y.
            best = Some((
                d,
                Point {
                    x: dy / len,
                    y: -dx / len,
                },
            ));
        }
    }
    best.map(|(_, n)| n).unwrap_or(Point { x: 0.0, y: -1.0 })
}

/// Closest point on a polyline to `target`.
///
/// Used for `anchor_point`, which the renderer draws the leader from and uses to attach hover
/// affordances; it must lie *on* the drawn path, so this projects onto segments rather than
/// returning the nearest vertex.
fn nearest_point_on_polyline(points: &[Point], target: Point) -> Point {
    let Some(&first) = points.first() else {
        return target;
    };
    let mut best = first;
    let mut best_distance = squared_distance(first, target);
    for w in points.windows(2) {
        let (a, b) = (w[0], w[1]);
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let length_squared = dx * dx + dy * dy;
        let t = if length_squared > 0.0 {
            (((target.x - a.x) * dx + (target.y - a.y) * dy) / length_squared).clamp(0.0, 1.0)
        } else {
            0.0
        };
        let candidate = Point {
            x: a.x + t * dx,
            y: a.y + t * dy,
        };
        let distance = squared_distance(candidate, target);
        if distance < best_distance {
            best_distance = distance;
            best = candidate;
        }
    }
    best
}

fn squared_distance(a: Point, b: Point) -> f64 {
    (a.x - b.x).powi(2) + (a.y - b.y).powi(2)
}

/// Uniform spatial hash over rectangles.
///
/// Only ever asked a boolean question ("does anything overlap this?"), so the order in which
/// candidates come back from the bucket map cannot influence the answer and determinism is
/// preserved despite the `HashMap`.
struct SpatialHash {
    cell: f64,
    rects: Vec<Rect>,
    buckets: HashMap<(i64, i64), Vec<u32>>,
    /// Rectangles too large to be worth bucketing; checked on every query.
    wide: Vec<u32>,
}

impl SpatialHash {
    fn new(cell: f64) -> Self {
        SpatialHash {
            cell: if cell.is_finite() && cell > 0.0 {
                cell
            } else {
                HASH_CELL
            },
            rects: Vec::new(),
            buckets: HashMap::new(),
            wide: Vec::new(),
        }
    }

    fn insert(&mut self, rect: Rect) {
        if !rect.x.is_finite() || !rect.y.is_finite() {
            return;
        }
        let id = self.rects.len() as u32;
        self.rects.push(rect);
        match self.cell_span(&rect) {
            Some((x0, y0, x1, y1)) => {
                for cx in x0..=x1 {
                    for cy in y0..=y1 {
                        self.buckets.entry((cx, cy)).or_default().push(id);
                    }
                }
            }
            None => self.wide.push(id),
        }
    }

    fn overlaps(&self, query: &Rect, epsilon: f64) -> bool {
        let hit = |id: &u32| {
            self.rects
                .get(*id as usize)
                .is_some_and(|r| rects_overlap_strict(query, r, epsilon))
        };
        if self.wide.iter().any(hit) {
            return true;
        }
        match self.cell_span(query) {
            Some((x0, y0, x1, y1)) => {
                for cx in x0..=x1 {
                    for cy in y0..=y1 {
                        if let Some(ids) = self.buckets.get(&(cx, cy)) {
                            if ids.iter().any(hit) {
                                return true;
                            }
                        }
                    }
                }
                false
            }
            // Query too large to bucket: fall back to a full scan rather than miss a hit.
            None => self
                .rects
                .iter()
                .any(|r| rects_overlap_strict(query, r, epsilon)),
        }
    }

    /// Inclusive cell range covering a rectangle, or `None` when it spans too many cells.
    fn cell_span(&self, rect: &Rect) -> Option<(i64, i64, i64, i64)> {
        if !rect.x.is_finite()
            || !rect.y.is_finite()
            || !rect.width.is_finite()
            || !rect.height.is_finite()
        {
            return None;
        }
        let x0 = (rect.x / self.cell).floor() as i64;
        let y0 = (rect.y / self.cell).floor() as i64;
        let x1 = (rect.right() / self.cell).floor() as i64;
        let y1 = (rect.bottom() / self.cell).floor() as i64;
        if x1 < x0 || y1 < y0 {
            return None;
        }
        let cells = (x1 - x0 + 1).saturating_mul(y1 - y0 + 1);
        if cells > MAX_CELLS_PER_RECT {
            return None;
        }
        Some((x0, y0, x1, y1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{EdgeChain, EdgeRole, FlatEdge, IrEdge, IrNode, ItemKind, PortRef, Side};

    fn cfg() -> CustomLayoutConfig {
        CustomLayoutConfig::default()
    }

    /// Rank ranges for a rank-major item list, given the number of items in each rank.
    fn ranks(widths: &[u32]) -> Vec<std::ops::Range<u32>> {
        let mut out = Vec::with_capacity(widths.len());
        let mut start = 0u32;
        for &w in widths {
            out.push(start..start + w);
            start += w;
        }
        out
    }

    fn mk_item(kind: ItemKind, rank: u16, order: u16, x: f64, y: f64, w: f64, h: f64) -> Item {
        Item {
            kind,
            rank,
            order,
            width: w,
            height: h,
            x,
            y,
        }
    }

    fn mk_ir(node_count: usize, edges: &[(u32, u32, Option<LabelBox>)]) -> GraphIr {
        let mut ir = GraphIr::default();
        for i in 0..node_count {
            ir.node_names.push(format!("n{}", i));
            ir.node_labels.push(None);
            ir.nodes.push(IrNode {
                name: i as u32,
                width: 100.0,
                height: 40.0,
                pinned_rank: None,
                degree: 0,
            });
        }
        for (i, &(s, t, label)) in edges.iter().enumerate() {
            ir.edge_names.push(format!("e{}", i));
            ir.edges.push(IrEdge {
                name: i as u32,
                source: s,
                target: t,
                label,
                weight: 1.0,
                min_len: 1,
                hint: None,
                bundle: None,
            });
        }
        ir
    }

    fn dummy_port(id: &str) -> PortRef {
        PortRef {
            node_id: id.to_string(),
            side: Side::Bottom,
            index: 0,
            point: Point { x: 0.0, y: 0.0 },
            stub: Point { x: 0.0, y: 0.0 },
        }
    }

    fn route(edge_id: &str, points: Vec<Point>) -> RoutedPath {
        RoutedPath {
            edge_id: edge_id.to_string(),
            points,
            source_port: dummy_port("n0"),
            target_port: dummy_port("n1"),
        }
    }

    /// A -> Label -> B. The badge must land inside the Label item's reserved box, with no leader.
    #[test]
    fn labelled_chain_badge_lands_inside_its_reservation() {
        let label = LabelBox {
            width: 80.0,
            height: 28.0,
        };
        let ir = mk_ir(2, &[(0, 1, Some(label))]);
        let label_item = mk_item(ItemKind::Label(0), 1, 0, 100.0, 200.0, 160.0, 28.0);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0),
                label_item,
                mk_item(ItemKind::Real(1), 2, 0, 0.0, 400.0, 100.0, 40.0),
            ],
            rank_ranges: ranks(&[1, 1, 1]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![EdgeChain {
                edge: 0,
                reversed: false,
                role: EdgeRole::Forward,
                items: vec![0, 1, 2],
                label_at: Some(1),
            }],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 2],
        };
        let routes = vec![route(
            "e0",
            vec![Point { x: 140.0, y: 40.0 }, Point { x: 140.0, y: 400.0 }],
        )];

        let result = place_badges(&layered, &ir, &routes, &cfg());
        assert_eq!(result.leader_count, 0);
        assert_eq!(result.badges.len(), 1);

        let badge = &result.badges[0];
        assert_eq!(badge.edge_id, "e0");
        assert!(badge.leader_points.is_none());
        // Contained in the Label item's box.
        let item_rect = label_item.rect();
        assert!(badge.rect.x >= item_rect.x - 1e-9);
        assert!(badge.rect.right() <= item_rect.right() + 1e-9);
        assert!(badge.rect.y >= item_rect.y - 1e-9);
        assert!(badge.rect.bottom() <= item_rect.bottom() + 1e-9);
        // BesideEdge: the right half of the double-width item, never the left lane.
        assert!(badge.rect.x >= item_rect.x + item_rect.width / 2.0 - 1e-9);
        assert_eq!(badge.rect.width, 80.0);
        assert_eq!(badge.rect.height, 28.0);
        // The anchor is on the drawn polyline.
        assert!((badge.anchor_point.x - 140.0).abs() < 1e-9);
    }

    #[test]
    fn on_edge_placement_uses_the_whole_item_box() {
        let mut config = cfg();
        config.label_placement = LabelPlacement::OnEdge;
        let item = mk_item(ItemKind::Label(0), 1, 0, 100.0, 200.0, 80.0, 28.0);
        let measured = LabelBox {
            width: 80.0,
            height: 28.0,
        };
        let rect = badge_rect_from_label_item(&item, Some(measured), &config);
        assert_eq!(rect, item.rect());
    }

    #[test]
    fn an_oversized_measurement_is_clamped_into_the_reservation() {
        let config = cfg();
        let item = mk_item(ItemKind::Label(0), 1, 0, 0.0, 0.0, 40.0, 10.0);
        let measured = LabelBox {
            width: 500.0,
            height: 500.0,
        };
        let rect = badge_rect_from_label_item(&item, Some(measured), &config);
        assert!(rect.width <= 20.0 + 1e-9);
        assert!(rect.height <= 10.0 + 1e-9);
        assert!(rect.x >= 20.0 - 1e-9);
    }

    #[test]
    fn flat_edge_badge_sits_on_the_corridor_run() {
        let label = LabelBox {
            width: 60.0,
            height: 20.0,
        };
        let ir = mk_ir(2, &[(0, 1, Some(label))]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0),
                mk_item(ItemKind::Real(1), 0, 1, 300.0, 0.0, 100.0, 100.0),
            ],
            rank_ranges: ranks(&[2]),
            up: Default::default(),
            down: Default::default(),
            chains: Vec::new(),
            flat_edges: vec![FlatEdge {
                edge: 0,
                rank: 0,
                from_item: 0,
                to_item: 1,
                label: Some(label),
            }],
            self_loops: Vec::new(),
            item_of_node: vec![0, 1],
        };
        let routes = vec![route(
            "e0",
            vec![
                Point { x: 100.0, y: 20.0 },
                Point { x: 200.0, y: 20.0 },
                Point { x: 200.0, y: 50.0 },
                Point { x: 300.0, y: 50.0 },
            ],
        )];

        let result = place_badges(&layered, &ir, &routes, &cfg());
        assert_eq!(result.leader_count, 0);
        assert_eq!(result.badges.len(), 1);
        let badge = &result.badges[0];
        // Centred on the vertical run at x = 200, y = 35.
        assert!((badge.rect.center().x - 200.0).abs() < 1e-9);
        assert!((badge.rect.center().y - 35.0).abs() < 1e-9);
        assert!(badge.leader_points.is_none());
    }

    /// An orphan is a labelled edge with no `Label` item — the `min_len = 1` degeneracy.
    fn orphan_fixture(node_rects: Vec<Item>) -> (Layered, GraphIr, Vec<RoutedPath>) {
        let label = LabelBox {
            width: 40.0,
            height: 20.0,
        };
        let ir = mk_ir(2, &[(0, 1, Some(label))]);
        let mut items = vec![
            mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0),
            mk_item(ItemKind::Real(1), 1, 0, 0.0, 400.0, 100.0, 40.0),
        ];
        items.extend(node_rects);
        let layered = Layered {
            items,
            rank_ranges: ranks(&[1, 1]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![EdgeChain {
                edge: 0,
                reversed: false,
                role: EdgeRole::Forward,
                items: vec![0, 1],
                label_at: None,
            }],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 1],
        };
        let routes = vec![route(
            "e0",
            vec![Point { x: 50.0, y: 40.0 }, Point { x: 50.0, y: 400.0 }],
        )];
        (layered, ir, routes)
    }

    #[test]
    fn safety_net_places_an_orphan_badge_without_a_leader_when_space_exists() {
        let (layered, ir, routes) = orphan_fixture(Vec::new());
        let result = place_badges(&layered, &ir, &routes, &cfg());
        assert_eq!(result.badges.len(), 1);
        assert_eq!(result.leader_count, 0);
        let badge = &result.badges[0];
        assert!(badge.leader_points.is_none());
        // Offset to the right of the vertical run, never on top of it.
        assert!(badge.rect.center().x > 50.0);
    }

    #[test]
    fn safety_net_emits_a_leader_and_counts_it_when_nothing_clears() {
        // A giant real node smothering every candidate position.
        let blocker = mk_item(ItemKind::Real(0), 0, 1, -1000.0, -1000.0, 4000.0, 4000.0);
        let (layered, ir, routes) = orphan_fixture(vec![blocker]);
        let result = place_badges(&layered, &ir, &routes, &cfg());
        assert_eq!(result.badges.len(), 1);
        assert_eq!(result.leader_count, 1);
        let badge = &result.badges[0];
        let leader = badge.leader_points.as_ref().expect("leader emitted");
        assert_eq!(leader.len(), 2);
        assert!((leader[0].x - 50.0).abs() < 1e-9);
        assert_eq!(leader[leader.len() - 1], badge.rect.center());
    }

    #[test]
    fn unlabelled_graph_produces_no_badges() {
        let ir = mk_ir(2, &[(0, 1, None)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0),
                mk_item(ItemKind::Real(1), 1, 0, 0.0, 200.0, 100.0, 40.0),
            ],
            rank_ranges: ranks(&[1, 1]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![EdgeChain {
                edge: 0,
                reversed: false,
                role: EdgeRole::Forward,
                items: vec![0, 1],
                label_at: None,
            }],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 1],
        };
        let result = place_badges(&layered, &ir, &[], &cfg());
        assert!(result.badges.is_empty());
        assert_eq!(result.leader_count, 0);
    }

    #[test]
    fn empty_input_is_safe() {
        let result = place_badges(&Layered::default(), &GraphIr::default(), &[], &cfg());
        assert!(result.badges.is_empty());
        assert_eq!(result.leader_count, 0);
    }

    #[test]
    fn spatial_hash_agrees_with_brute_force() {
        let mut hash = SpatialHash::new(HASH_CELL);
        let rects = [
            Rect {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
            },
            Rect {
                x: 900.0,
                y: 900.0,
                width: 100.0,
                height: 50.0,
            },
            // Deliberately wider than MAX_CELLS_PER_RECT allows, exercising the `wide` path.
            Rect {
                x: -5000.0,
                y: 5000.0,
                width: 20000.0,
                height: 20000.0,
            },
        ];
        for r in rects.iter() {
            hash.insert(*r);
        }
        let probes = [
            Rect {
                x: 50.0,
                y: 10.0,
                width: 10.0,
                height: 10.0,
            },
            Rect {
                x: 400.0,
                y: 400.0,
                width: 10.0,
                height: 10.0,
            },
            Rect {
                x: 0.0,
                y: 6000.0,
                width: 10.0,
                height: 10.0,
            },
        ];
        for probe in probes.iter() {
            let brute = rects.iter().any(|r| rects_overlap_strict(probe, r, 0.001));
            assert_eq!(hash.overlaps(probe, 0.001), brute, "{:?}", probe);
        }
    }

    #[test]
    fn nearest_point_projects_onto_a_segment_not_a_vertex() {
        let line = [Point { x: 0.0, y: 0.0 }, Point { x: 100.0, y: 0.0 }];
        let got = nearest_point_on_polyline(&line, Point { x: 40.0, y: 25.0 });
        assert!((got.x - 40.0).abs() < 1e-9);
        assert!((got.y).abs() < 1e-9);
        assert_eq!(
            nearest_point_on_polyline(&[], Point { x: 3.0, y: 4.0 }),
            Point { x: 3.0, y: 4.0 }
        );
    }

    #[test]
    fn midpoint_normal_points_right_of_a_vertical_run() {
        let line = [Point { x: 0.0, y: 0.0 }, Point { x: 0.0, y: 100.0 }];
        let n = midpoint_normal(&line);
        assert!((n.x - 1.0).abs() < 1e-9);
        assert!(n.y.abs() < 1e-9);

        let flat = [Point { x: 0.0, y: 0.0 }, Point { x: 100.0, y: 0.0 }];
        let n = midpoint_normal(&flat);
        assert!(n.x.abs() < 1e-9);
        assert!((n.y + 1.0).abs() < 1e-9);
    }
}
