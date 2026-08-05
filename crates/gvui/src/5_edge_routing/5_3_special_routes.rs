//! # Step 5.3 (Phase 8): Self-loops and flat edges
//!
//! The two edge kinds that never became a chain. Both are still pure evaluation:
//!
//! - A **self-loop** has no ordering, no rank span and no lane. Its geometry is a function of the
//!   node's rectangle and a stacking index, so it is computed directly rather than looked up.
//! - A **flat edge** joins two items in the same rank. Phase 6 reserved it a corridor between every
//!   pair of adjacent orders it spans and widened those separations to fit both its lanes and its
//!   badge, so the geometry here is a lookup into space that already exists.
//!
//! A flat edge takes one of two shapes, decided by whether its endpoints are **neighbours in the
//! rank order**:
//!
//! - **Neighbours**: one straight horizontal segment between the two facing sides. Nothing stands
//!   between them, the reserved corridor *is* the segment, and the badge sits at its midpoint —
//!   which is the middle of a gap Phase 6 widened by the badge width, so it clears both nodes.
//! - **Not neighbours**: the run has to get past the items in between, so it steps out of the rank
//!   band entirely — up into the channel above it or down into the one below, whichever is the
//!   shorter climb — and comes back down in the reserved corridor beside the far endpoint. Every
//!   item of a rank is centred in that rank's band, so a run outside the band clears the whole rank
//!   by construction rather than by checking.

use super::edge_style::simplify_polyline;
use super::ports::PortTable;
use crate::config::CustomLayoutConfig;
use crate::types::{
    FlatEdge, GraphIr, Item, Layered, Point, PortRef, Rect, RoutedPath, RoutingDemand, Side,
};

/// Smallest outward step between two stacked self-loops, so consecutive loops never share a
/// vertical run even when `lane_spacing` is configured very small.
const MIN_LOOP_STEP: f64 = 4.0;

/// How far a detouring flat edge steps outside its rank band, in units of `lane_spacing`.
///
/// The run only has to clear the band, so it hugs it: a short step keeps the detour visually
/// attached to the rank it belongs to instead of sending it halfway up the channel where it would
/// read as an inter-rank edge. It is additionally capped at half the free room above (or below) the
/// band, so it can never reach into the neighbouring rank.
const DETOUR_STEPS: f64 = 1.0;

/// Self-loop as a rounded rectangle off the node's right side; `index` stacks multiple loops.
///
/// The loop leaves the right side above the node's centre and re-enters below it, so the two ports
/// are distinct and the arrow direction is legible. Successive `index` values grow **both** the
/// outward reach and the vertical separation of the two ports, which nests the loops concentrically
/// instead of letting them overlap. The vertical spread is capped at the node's own half-height, so
/// a node with more self-loops than it is tall will eventually stack loops that share a port
/// height — a degenerate case that no amount of geometry can fix and which the caller should
/// surface as a diagnostic rather than route around.
///
/// `edge_id` and `node_id` are the wire ids, not indices; this function is the one place in Phase 8
/// that has no `GraphIr` to intern against.
pub fn route_self_loop(
    edge_id: &str,
    node_id: &str,
    rect: &Rect,
    index: usize,
    config: &CustomLayoutConfig,
) -> RoutedPath {
    let ring = index as f64;
    let half_height = (rect.height.max(2.0)) / 2.0;
    let centre_y = rect.y + rect.height / 2.0;

    let step = config.effective_lane_spacing().max(MIN_LOOP_STEP);
    let reach = config.port_stub_length + (ring + 1.0) * step;
    let spread = (half_height / 3.0 + ring * config.port_pitch.max(MIN_LOOP_STEP))
        .min((half_height - 1.0).max(1.0))
        .max(1.0);

    let exit = Point {
        x: rect.right(),
        y: centre_y - spread,
    };
    let entry = Point {
        x: rect.right(),
        y: centre_y + spread,
    };
    let far_x = rect.right() + reach;

    let points = simplify_polyline(
        &[
            exit,
            Point {
                x: far_x,
                y: exit.y,
            },
            Point {
                x: far_x,
                y: entry.y,
            },
            entry,
        ],
        config.epsilon,
    );

    let stub_x = rect.right() + config.port_stub_length;
    RoutedPath {
        edge_id: edge_id.to_string(),
        points,
        source_port: PortRef {
            node_id: node_id.to_string(),
            side: Side::Right,
            index: index * 2,
            point: exit,
            stub: Point {
                x: stub_x,
                y: exit.y,
            },
        },
        target_port: PortRef {
            node_id: node_id.to_string(),
            side: Side::Right,
            index: index * 2 + 1,
            point: entry,
            stub: Point {
                x: stub_x,
                y: entry.y,
            },
        },
    }
}

/// Same-rank edge, routed as a straight run between neighbours or a detour around whatever sits
/// between them.
///
/// Which shape is used is decided by the rank *order*, not by geometry, so the decision is the same
/// combinatorial fact Phase 6 reserved space against:
///
/// - `|order difference| == 1` and the two ports face each other: a **single horizontal segment**.
///   Both ports are re-seated on one shared y inside the vertical overlap of the two boxes, which
///   they always have (Phase 7a centres every item of a rank on the band's centre line, so any two
///   items of a rank share it). The result is exactly two points, and its midpoint — where
///   [`super::badges`] centres the badge — is the middle of a gap Phase 6d widened by the badge
///   width, so the badge clears both nodes.
/// - Anything else: the run leaves the rank band and comes back, see [`detour_points`].
///
/// Re-seating the ports is deliberate and safe: the new y is inside both boxes, so both points stay
/// on their node's boundary, and the ports are emitted from this function rather than read back
/// from the table, so nothing downstream sees a stale height. The alternative — honouring the
/// distributed port offsets — buys nothing here (the side carries one port per flat edge) and costs
/// the straightness the whole feature exists for.
///
/// The `port -> stub -> ...` prologue is dropped in the straight case on purpose: the stub points
/// are collinear with the segment, so they would either be simplified away or, when the gap is
/// narrower than two stubs, survive as a backtracking spike [`simplify_polyline`] refuses to erase.
///
/// Returns `None` when the flat edge index, its items or its ports do not resolve.
pub fn route_flat_edge(
    flat_index: usize,
    layered: &Layered,
    ir: &GraphIr,
    demand: &RoutingDemand,
    ports: &PortTable,
    config: &CustomLayoutConfig,
) -> Option<RoutedPath> {
    let flat = layered.flat_edges.get(flat_index)?;
    let edge_id = ir.edge_names.get(flat.edge as usize)?.clone();
    let mut source_port = ports.source.get(&flat.edge)?.clone();
    let mut target_port = ports.target.get(&flat.edge)?.clone();
    let from = layered.items.get(flat.from_item as usize)?;
    let to = layered.items.get(flat.to_item as usize)?;

    let neighbours = from.order.abs_diff(to.order) == 1;
    let straight = if neighbours {
        straight_shot_y(from, to, &source_port, &target_port, config)
    } else {
        None
    };

    let points = match straight {
        Some(y) => {
            source_port.point.y = y;
            source_port.stub.y = y;
            target_port.point.y = y;
            target_port.stub.y = y;
            vec![source_port.point, target_port.point]
        }
        // Neighbours never detour: nothing stands between them, so a step out of the band would be
        // a bend bought for nothing. The jog inside their one shared corridor is the honest shape.
        None if neighbours => corridor_jog_points(
            flat,
            from,
            to,
            &source_port,
            &target_port,
            layered,
            demand,
            config,
        ),
        None => detour_points(
            flat,
            from,
            to,
            &source_port,
            &target_port,
            layered,
            demand,
            config,
        )
        .unwrap_or_else(|| {
            corridor_jog_points(
                flat,
                from,
                to,
                &source_port,
                &target_port,
                layered,
                demand,
                config,
            )
        }),
    };

    Some(RoutedPath {
        edge_id,
        points,
        source_port,
        target_port,
    })
}

/// Shared y for a straight shot, or `None` when the two endpoints cannot be joined by one segment.
///
/// Two conditions have to hold. The ports must **face** each other — the left box exits right and
/// the right box enters left — because a port on any other side would need a turn to reach the
/// corridor at all. And the boxes must share a horizontal band; the midpoint of the two assigned
/// port heights is clamped into it, which keeps two flat edges on the same pair of nodes at
/// distinct heights instead of collapsing them onto one line.
fn straight_shot_y(
    from: &Item,
    to: &Item,
    source: &PortRef,
    target: &PortRef,
    config: &CustomLayoutConfig,
) -> Option<f64> {
    let source_is_left = from.x <= to.x;
    let faces = if source_is_left {
        source.side == Side::Right && target.side == Side::Left
    } else {
        source.side == Side::Left && target.side == Side::Right
    };
    if !faces {
        return None;
    }

    let lo = from.y.max(to.y);
    let hi = (from.y + from.height.max(0.0)).min(to.y + to.height.max(0.0));
    let eps = if config.epsilon.is_finite() && config.epsilon > 0.0 {
        config.epsilon
    } else {
        0.0
    };
    // A NaN coordinate has no overlap rather than an unknown one, so it falls through to the jog
    // instead of producing a segment nothing downstream can measure.
    let overlap = hi - lo;
    if !overlap.is_finite() || overlap <= eps {
        return None;
    }

    let y = (source.point.y + target.point.y) / 2.0;
    if !y.is_finite() {
        return None;
    }
    Some(y.clamp(lo, hi))
}

/// Polyline for a flat edge whose endpoints are not neighbours in the rank order.
///
/// Shape: `port -> corridor beside the source -> out of the band -> across -> corridor beside the
/// target -> port`. Six points, four corners, every segment axis-aligned.
///
/// Two facts make it collision-free without any checking:
///
/// - Phase 7a centres every item of a rank inside that rank's band, so a horizontal run placed
///   outside the band clears **every** item of the rank, not just the ones this edge spans.
/// - The vertical runs sit in the corridors immediately beside the two endpoints, which Phase 6
///   reserved a lane in for this very edge, and which are by definition free of items.
///
/// The step out of the band is capped at half the free room to the neighbouring rank, so the run
/// can never reach a node of the rank it steps toward either.
///
/// Returns `None` when the rank band or either corridor cannot be resolved; the caller then falls
/// back to the in-corridor jog.
#[allow(clippy::too_many_arguments)]
fn detour_points(
    flat: &FlatEdge,
    from: &Item,
    to: &Item,
    source: &PortRef,
    target: &PortRef,
    layered: &Layered,
    demand: &RoutingDemand,
    config: &CustomLayoutConfig,
) -> Option<Vec<Point>> {
    if from.order == to.order {
        return None;
    }
    let (band_top, band_bottom) = rank_extent(layered, flat.rank as usize)?;

    // Room to the neighbouring rank. A missing neighbour means the drawing simply continues past
    // the outermost band, so the configured rank gap stands in for "as much as we need".
    let free_gap = config.effective_rank_gap().max(0.0);
    let above_room = match flat
        .rank
        .checked_sub(1)
        .and_then(|r| rank_extent(layered, r as usize))
    {
        Some((_, prev_bottom)) => (band_top - prev_bottom).max(0.0),
        None => free_gap,
    };
    let below_room = match rank_extent(layered, flat.rank as usize + 1) {
        Some((next_top, _)) => (next_top - band_bottom).max(0.0),
        None => free_gap,
    };

    let step = (config.effective_lane_spacing().max(0.0) * DETOUR_STEPS).max(0.0);
    let y_above = band_top - step.min(above_room / 2.0);
    let y_below = band_bottom + step.min(below_room / 2.0);

    let cost_above = (source.point.y - y_above).abs() + (target.point.y - y_above).abs();
    let cost_below = (y_below - source.point.y).abs() + (y_below - target.point.y).abs();
    // Ties go up, so the choice never depends on floating-point noise ordering two equal costs.
    let y_run = if cost_below < cost_above {
        y_below
    } else {
        y_above
    };

    let source_after = adjacent_corridor(from.order, to.order)?;
    let target_after = adjacent_corridor(to.order, from.order)?;
    let source_x = corridor_x(layered, demand, flat, source_after, config)?;
    let target_x = corridor_x(layered, demand, flat, target_after, config)?;

    Some(simplify_polyline(
        &[
            source.point,
            Point {
                x: source_x,
                y: source.point.y,
            },
            Point {
                x: source_x,
                y: y_run,
            },
            Point {
                x: target_x,
                y: y_run,
            },
            Point {
                x: target_x,
                y: target.point.y,
            },
            target.point,
        ],
        config.epsilon,
    ))
}

/// Fallback shape: `port -> stub -> corridor -> stub -> port`, one vertical jog in the corridor
/// between two neighbouring items.
///
/// This is only reached when the endpoints are neighbours but [`straight_shot_y`] declined — a port
/// on a side that does not face the other endpoint, or two boxes with no shared horizontal band.
/// Phase 7a makes the latter impossible, so in practice this covers a port-side policy that puts a
/// flat edge somewhere other than the two facing sides.
#[allow(clippy::too_many_arguments)]
fn corridor_jog_points(
    flat: &FlatEdge,
    from: &Item,
    to: &Item,
    source: &PortRef,
    target: &PortRef,
    layered: &Layered,
    demand: &RoutingDemand,
    config: &CustomLayoutConfig,
) -> Vec<Point> {
    let lo = source.stub.x.min(target.stub.x);
    let hi = source.stub.x.max(target.stub.x);
    let x = corridor_x(layered, demand, flat, from.order.min(to.order), config)
        .unwrap_or((lo + hi) / 2.0)
        .clamp(lo, hi);

    simplify_polyline(
        &[
            source.point,
            source.stub,
            Point {
                x,
                y: source.stub.y,
            },
            Point {
                x,
                y: target.stub.y,
            },
            target.stub,
            target.point,
        ],
        config.epsilon,
    )
}

/// `after_order` of the corridor immediately beside the item at `own`, on the side facing `other`.
///
/// `None` when the two orders are equal — a flat edge whose endpoints share a slot has no corridor
/// and no meaningful geometry.
fn adjacent_corridor(own: u16, other: u16) -> Option<u16> {
    match own.cmp(&other) {
        std::cmp::Ordering::Less => Some(own),
        std::cmp::Ordering::Greater => own.checked_sub(1),
        std::cmp::Ordering::Equal => None,
    }
}

/// x of this edge's reserved lane in the corridor after `(rank, after_order)`.
///
/// Phase 6d widened that gap to `max(node_gap, lanes * lane_spacing) + badge width`, so the lane
/// block is narrower than the gap. It is **centred** in the gap rather than packed against the left
/// item, which is what keeps a badge drawn on a lane run — [`super::badges`] centres it on the
/// vertical — inside the space Phase 6 reserved for it instead of hanging over the node to its left.
///
/// A corridor with no recorded lane count is treated as a single lane: the reservation is a
/// minimum, so an unrecorded corridor is still at least `node_gap` wide.
fn corridor_x(
    layered: &Layered,
    demand: &RoutingDemand,
    flat: &FlatEdge,
    after_order: u16,
    config: &CustomLayoutConfig,
) -> Option<f64> {
    let left = item_at_order(layered, flat.rank, after_order as usize)?;
    let right = item_at_order(layered, flat.rank, after_order as usize + 1)?;

    let gap_lo = left.x + left.width;
    let gap_hi = right.x;
    if gap_hi <= gap_lo {
        return Some((gap_lo + gap_hi) / 2.0);
    }

    // `corridor_segs` is a Vec, so "first match wins" is a deterministic tie-break.
    let lane = demand
        .corridor_segs
        .iter()
        .find(|s| s.edge == flat.edge && s.rank == flat.rank && s.after_order == after_order)
        .map(|s| s.lane)
        .unwrap_or(0);
    let lanes = demand
        .corridor_lanes
        .get(&(flat.rank, after_order))
        .copied()
        .unwrap_or(0)
        .max(lane.saturating_add(1)) as f64;

    let spacing = config.effective_lane_spacing().max(0.0);
    let block = lanes * spacing;
    let start = gap_lo + ((gap_hi - gap_lo) - block).max(0.0) / 2.0;
    Some((start + (lane as f64 + 0.5) * spacing).clamp(gap_lo, gap_hi))
}

/// Vertical extent `(top, bottom)` of a rank band, read back from the items themselves.
///
/// Phase 7a sets the band height to the tallest item and centres every item in it, so the tallest
/// item's own extent *is* the band. Deriving it here rather than threading the band tops through
/// Phase 8 keeps this function exact under any later change to how bands are computed.
fn rank_extent(layered: &Layered, rank: usize) -> Option<(f64, f64)> {
    let range = layered.rank_ranges.get(rank)?;
    let start = (range.start as usize).min(layered.items.len());
    let end = (range.end as usize).clamp(start, layered.items.len());
    let mut top = f64::INFINITY;
    let mut bottom = f64::NEG_INFINITY;
    for item in &layered.items[start..end] {
        if !item.y.is_finite() {
            continue;
        }
        top = top.min(item.y);
        bottom = bottom.max(item.y + item.height.max(0.0));
    }
    if top.is_finite() && bottom.is_finite() {
        Some((top, bottom))
    } else {
        None
    }
}

/// Item at a given `(rank, order)`.
///
/// Phase 5 permutes each rank slice in place, so `order` is the position within the slice and the
/// direct index is correct. The linear fallback covers an ordering implementation that assigns
/// `order` without permuting; it is never hit on a well-formed `Layered` and costs nothing there.
fn item_at_order(layered: &Layered, rank: u16, order: usize) -> Option<&Item> {
    let range = layered.rank_ranges.get(rank as usize)?;
    let start = (range.start as usize).min(layered.items.len());
    let end = (range.end as usize).clamp(start, layered.items.len());
    let slice = &layered.items[start..end];
    if let Some(item) = slice.get(order) {
        if item.order as usize == order {
            return Some(item);
        }
    }
    slice.iter().find(|item| item.order as usize == order)
}

#[cfg(test)]
mod tests {
    use super::super::ports::assign_ports;
    use super::*;
    use crate::config::EngineMode;
    use crate::types::{CorridorSeg, IrEdge, IrNode, ItemKind, NormalizedEdge, NormalizedNode};

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

    fn mk_ir(node_count: usize, edges: &[(u32, u32)]) -> GraphIr {
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
        for (i, &(s, t)) in edges.iter().enumerate() {
            ir.edge_names.push(format!("e{}", i));
            ir.edges.push(IrEdge {
                name: i as u32,
                source: s,
                target: t,
                label: None,
                weight: 1.0,
                min_len: 1,
                hint: None,
                bundle: None,
            });
        }
        ir
    }

    fn is_orthogonal(points: &[Point]) -> bool {
        points
            .windows(2)
            .all(|w| (w[0].x - w[1].x).abs() < 1e-9 || (w[0].y - w[1].y).abs() < 1e-9)
    }

    fn node_rect() -> Rect {
        Rect {
            x: 10.0,
            y: 20.0,
            width: 100.0,
            height: 60.0,
        }
    }

    #[test]
    fn self_loop_is_orthogonal_and_closed_off_the_right_side() {
        let config = cfg();
        let rect = node_rect();
        let route = route_self_loop("e0", "n0", &rect, 0, &config);

        assert_eq!(route.edge_id, "e0");
        assert_eq!(route.points.len(), 4);
        assert!(is_orthogonal(&route.points));

        let first = route.points[0];
        let last = route.points[route.points.len() - 1];
        assert_eq!(first.x, rect.right());
        assert_eq!(last.x, rect.right());
        // Leaves above the centre, re-enters below it.
        assert!(first.y < rect.center().y);
        assert!(last.y > rect.center().y);
        // The bulge stays on the right of the node.
        assert!(route.points.iter().all(|p| p.x >= rect.right()));

        assert_eq!(route.source_port.side, Side::Right);
        assert_eq!(route.target_port.side, Side::Right);
        assert_eq!(route.source_port.point, first);
        assert_eq!(route.target_port.point, last);
        assert_eq!(route.source_port.node_id, "n0");
    }

    #[test]
    fn stacked_self_loops_nest_rather_than_overlap() {
        let config = cfg();
        let rect = node_rect();
        let inner = route_self_loop("e0", "n0", &rect, 0, &config);
        let outer = route_self_loop("e1", "n0", &rect, 1, &config);

        let reach = |r: &RoutedPath| r.points.iter().fold(f64::MIN, |m, p| m.max(p.x));
        assert!(reach(&outer) > reach(&inner));

        let spread = |r: &RoutedPath| (r.points[r.points.len() - 1].y - r.points[0].y).abs();
        assert!(spread(&outer) > spread(&inner));

        // Distinct port indices so nothing downstream collapses them.
        assert_eq!(inner.source_port.index, 0);
        assert_eq!(inner.target_port.index, 1);
        assert_eq!(outer.source_port.index, 2);
        assert_eq!(outer.target_port.index, 3);
    }

    #[test]
    fn zero_height_node_still_yields_a_well_formed_loop() {
        let config = cfg();
        let rect = Rect {
            x: 0.0,
            y: 0.0,
            width: 10.0,
            height: 0.0,
        };
        let route = route_self_loop("e0", "n0", &rect, 0, &config);
        assert!(is_orthogonal(&route.points));
        assert!(route.points.len() >= 2);
        assert_ne!(route.points[0], route.points[route.points.len() - 1]);
    }

    /// Two same-rank neighbours of different heights. Unequal heights matter: the two assigned
    /// ports then sit at different offsets, so a two-point result proves the ports were re-seated
    /// rather than that they happened to line up.
    fn flat_fixture() -> (Layered, GraphIr) {
        let ir = mk_ir(2, &[(0, 1)]);
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
                label: None,
            }],
            self_loops: Vec::new(),
            item_of_node: vec![0, 1],
        };
        (layered, ir)
    }

    /// Three ranks; the middle one holds four boxes in a row and carries one flat edge from the
    /// leftmost to the rightmost, so the run has two items to get past.
    ///
    /// Rank 1's band is `[200, 240]`, with 160px of free room to the rank above and below.
    fn detour_fixture(from_order: u32, to_order: u32) -> (Layered, GraphIr) {
        let ir = mk_ir(6, &[(1 + from_order, 1 + to_order)]);
        let mut items = vec![mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0)];
        for o in 0..4u16 {
            items.push(mk_item(
                ItemKind::Real(1 + o as u32),
                1,
                o,
                o as f64 * 200.0,
                200.0,
                100.0,
                40.0,
            ));
        }
        items.push(mk_item(ItemKind::Real(5), 2, 0, 0.0, 400.0, 100.0, 40.0));

        let layered = Layered {
            items,
            rank_ranges: ranks(&[1, 4, 1]),
            up: Default::default(),
            down: Default::default(),
            chains: Vec::new(),
            flat_edges: vec![FlatEdge {
                edge: 0,
                rank: 1,
                from_item: 1 + from_order,
                to_item: 1 + to_order,
                label: None,
            }],
            self_loops: Vec::new(),
            item_of_node: vec![0, 1, 2, 3, 4, 5],
        };
        (layered, ir)
    }

    /// True when `seg` passes through the interior of `rect`. Orthogonal segments only, which is
    /// all this module produces.
    fn penetrates(a: Point, b: Point, rect: &Rect) -> bool {
        let (lo_x, hi_x) = (a.x.min(b.x), a.x.max(b.x));
        let (lo_y, hi_y) = (a.y.min(b.y), a.y.max(b.y));
        hi_x > rect.x + 1e-9
            && lo_x < rect.right() - 1e-9
            && hi_y > rect.y + 1e-9
            && lo_y < rect.bottom() - 1e-9
    }

    fn assert_clears_every_item(points: &[Point], layered: &Layered, skip: &[u32]) {
        for (i, item) in layered.items.iter().enumerate() {
            if skip.contains(&(i as u32)) {
                continue;
            }
            let rect = item.rect();
            for w in points.windows(2) {
                assert!(
                    !penetrates(w[0], w[1], &rect),
                    "segment {:?} -> {:?} cuts item {} at {:?}",
                    w[0],
                    w[1],
                    i,
                    rect
                );
            }
        }
    }

    #[test]
    fn neighbouring_flat_edge_is_one_straight_horizontal_segment() {
        let (layered, ir) = flat_fixture();
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let mut demand = RoutingDemand::default();
        demand.corridor_segs.push(CorridorSeg {
            edge: 0,
            rank: 0,
            after_order: 0,
            lane: 0,
        });
        demand.corridor_lanes.insert((0, 0), 1);

        let route =
            route_flat_edge(0, &layered, &ir, &demand, &ports, &config).expect("flat edge routes");

        assert_eq!(route.edge_id, "e0");
        assert_eq!(route.points.len(), 2, "{:?}", route.points);
        assert!((route.points[0].y - route.points[1].y).abs() < 1e-9);
        // Facing sides: out of the left box's right edge, into the right box's left edge.
        assert_eq!(route.points[0].x, 100.0);
        assert_eq!(route.points[1].x, 300.0);
        assert_eq!(route.source_port.side, Side::Right);
        assert_eq!(route.target_port.side, Side::Left);
        // Inside both boxes vertically, so both ends really are on a node boundary.
        assert!(route.points[0].y > 0.0 && route.points[0].y < 40.0);
        // The ports travel with the segment; a stale height here would break emit's bounding box.
        assert_eq!(route.source_port.point, route.points[0]);
        assert_eq!(route.target_port.point, route.points[1]);
        assert_eq!(route.source_port.stub.y, route.points[0].y);
        assert_eq!(route.target_port.stub.y, route.points[1].y);
    }

    #[test]
    fn a_straight_flat_edge_ignores_the_corridor_lane() {
        // The lane reservation is spare room, not a required detour: a neighbour pair has nothing
        // between it, so a high lane index must not bend the segment.
        let (layered, ir) = flat_fixture();
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let mut demand = RoutingDemand::default();
        demand.corridor_segs.push(CorridorSeg {
            edge: 0,
            rank: 0,
            after_order: 0,
            lane: 5,
        });
        demand.corridor_lanes.insert((0, 0), 6);

        let route =
            route_flat_edge(0, &layered, &ir, &demand, &ports, &config).expect("flat edge routes");
        assert_eq!(route.points.len(), 2);
    }

    #[test]
    fn equal_height_neighbours_collapse_to_a_straight_line() {
        let ir = mk_ir(2, &[(0, 1)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0),
                mk_item(ItemKind::Real(1), 0, 1, 300.0, 0.0, 100.0, 40.0),
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
                label: None,
            }],
            self_loops: Vec::new(),
            item_of_node: vec![0, 1],
        };
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let demand = RoutingDemand::default();
        let route =
            route_flat_edge(0, &layered, &ir, &demand, &ports, &config).expect("flat edge routes");
        assert_eq!(route.points.len(), 2);
        assert_eq!(route.points[0].y, 20.0);
    }

    #[test]
    fn a_non_neighbour_flat_edge_detours_outside_the_rank_band() {
        let (layered, ir) = detour_fixture(0, 3);
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let demand = RoutingDemand::default();

        let route =
            route_flat_edge(0, &layered, &ir, &demand, &ports, &config).expect("flat edge routes");

        assert!(is_orthogonal(&route.points), "{:?}", route.points);
        assert_eq!(route.points[0], ports.source[&0].point);
        assert_eq!(route.points[route.points.len() - 1], ports.target[&0].point);

        // The long run has to be clear of rank 1's band, whose extent is [200, 240].
        let long_run = route
            .points
            .windows(2)
            .filter(|w| (w[0].y - w[1].y).abs() < 1e-9)
            .max_by(|a, b| (a[0].x - a[1].x).abs().total_cmp(&(b[0].x - b[1].x).abs()))
            .map(|w| w[0].y)
            .expect("a horizontal run");
        assert!(
            !(200.0..=240.0).contains(&long_run),
            "run at y {}",
            long_run
        );

        // Endpoints excluded: a route legitimately touches its own two boxes' boundaries.
        assert_clears_every_item(&route.points, &layered, &[1, 4]);
    }

    #[test]
    fn the_detour_takes_the_shorter_way_out_of_the_band() {
        // One tall item stretches rank 1's band to [200, 600] while the two endpoints stay short.
        // Sliding the endpoints from the top of that band to the bottom is the only difference
        // between the two runs, and it is enough to flip which way out is cheaper.
        let config = cfg();
        let demand = RoutingDemand::default();

        let sink_y = |endpoint_y: f64| {
            let (mut layered, ir) = detour_fixture(0, 3);
            for item in layered.items.iter_mut() {
                match item.rank {
                    1 if item.order == 1 => item.height = 400.0,
                    1 => item.y = endpoint_y,
                    2 => item.y = 800.0,
                    _ => {}
                }
            }
            let ports = assign_ports(&layered, &ir, &config);
            let route = route_flat_edge(0, &layered, &ir, &demand, &ports, &config)
                .expect("flat edge routes");
            let ys: Vec<f64> = route.points.iter().map(|p| p.y).collect();
            (
                ys.iter().copied().fold(f64::MAX, f64::min),
                ys.iter().copied().fold(f64::MIN, f64::max),
            )
        };

        let (high_min, _) = sink_y(200.0);
        assert!(
            high_min < 200.0,
            "endpoints near the top should exit upward"
        );

        let (_, low_max) = sink_y(560.0);
        assert!(
            low_max > 600.0,
            "endpoints near the bottom should exit downward"
        );
    }

    #[test]
    fn a_detour_turns_in_the_corridors_beside_its_own_endpoints() {
        let (layered, ir) = detour_fixture(0, 3);
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let mut demand = RoutingDemand::default();
        for after in 0..3u16 {
            demand.corridor_segs.push(CorridorSeg {
                edge: 0,
                rank: 1,
                after_order: after,
                lane: 0,
            });
            demand.corridor_lanes.insert((1, after), 1);
        }

        let route =
            route_flat_edge(0, &layered, &ir, &demand, &ports, &config).expect("flat edge routes");
        let verticals: Vec<f64> = route
            .points
            .windows(2)
            .filter(|w| (w[0].x - w[1].x).abs() < 1e-9 && (w[0].y - w[1].y).abs() > 1e-9)
            .map(|w| w[0].x)
            .collect();
        assert_eq!(verticals.len(), 2, "{:?}", route.points);
        // Corridor 0 is the gap [100, 200]; corridor 2 is [500, 600].
        assert!(
            verticals[0] > 100.0 && verticals[0] < 200.0,
            "{:?}",
            verticals
        );
        assert!(
            verticals[1] > 500.0 && verticals[1] < 600.0,
            "{:?}",
            verticals
        );
    }

    #[test]
    fn a_right_to_left_detour_is_the_mirror_image() {
        let (layered, ir) = detour_fixture(3, 0);
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let demand = RoutingDemand::default();

        let route =
            route_flat_edge(0, &layered, &ir, &demand, &ports, &config).expect("flat edge routes");
        assert!(is_orthogonal(&route.points));
        assert_eq!(route.source_port.side, Side::Left);
        assert_eq!(route.target_port.side, Side::Right);
        assert_clears_every_item(&route.points, &layered, &[1, 4]);
    }

    #[test]
    fn a_lane_block_is_centred_in_its_corridor() {
        // The badge for a flat edge is centred on its vertical run, and the corridor was widened by
        // the badge width. Packing the lanes against the left item would push that badge over the
        // node; centring the block is what keeps it inside the reservation.
        let (layered, ir) = detour_fixture(0, 3);
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let mut demand = RoutingDemand::default();
        demand.corridor_segs.push(CorridorSeg {
            edge: 0,
            rank: 1,
            after_order: 0,
            lane: 0,
        });
        demand.corridor_lanes.insert((1, 0), 1);

        let route =
            route_flat_edge(0, &layered, &ir, &demand, &ports, &config).expect("flat edge routes");
        let x = route.points[1].x;
        // Gap [100, 200], one 12px lane: the block starts at 144 and its centre line is 150.
        assert!((x - 150.0).abs() < 1e-9, "lane at {}", x);
    }

    #[test]
    fn a_flat_edge_whose_ports_do_not_face_falls_back_to_the_corridor_jog() {
        // A port-side policy that puts a flat edge on Top/Bottom cannot be drawn as one segment.
        // The fallback still has to be orthogonal and still has to turn inside the corridor.
        let (layered, ir) = flat_fixture();
        let config = cfg();
        let mut ports = assign_ports(&layered, &ir, &config);
        let source = ports.source.get(&0).cloned().expect("source port");
        let target = ports.target.get(&0).cloned().expect("target port");
        ports.source.insert(
            0,
            PortRef {
                side: Side::Bottom,
                point: Point { x: 50.0, y: 40.0 },
                stub: Point { x: 50.0, y: 60.0 },
                ..source
            },
        );
        ports.target.insert(
            0,
            PortRef {
                side: Side::Bottom,
                point: Point { x: 350.0, y: 100.0 },
                stub: Point { x: 350.0, y: 120.0 },
                ..target
            },
        );

        let demand = RoutingDemand::default();
        let route =
            route_flat_edge(0, &layered, &ir, &demand, &ports, &config).expect("flat edge routes");
        assert!(is_orthogonal(&route.points), "{:?}", route.points);
        assert!(route.points.len() > 2, "{:?}", route.points);
        let verticals: Vec<f64> = route
            .points
            .windows(2)
            .filter(|w| (w[0].x - w[1].x).abs() < 1e-9 && (w[0].y - w[1].y).abs() > 1e-9)
            .map(|w| w[0].x)
            .collect();
        // The turn happens inside the gap [100, 300], not somewhere over a node.
        assert!(
            verticals.iter().any(|&x| x > 100.0 && x < 300.0),
            "{:?}",
            verticals
        );
        // Neighbours never leave their band: the route stays between the two boxes.
        assert!(route.points.iter().all(|p| (0.0..=400.0).contains(&p.x)));
    }

    #[test]
    fn flat_routing_is_byte_identical_across_runs() {
        let config = cfg();
        let demand = RoutingDemand::default();
        for (layered, ir) in [flat_fixture(), detour_fixture(0, 3), detour_fixture(3, 0)] {
            let ports = assign_ports(&layered, &ir, &config);
            let first = route_flat_edge(0, &layered, &ir, &demand, &ports, &config)
                .expect("flat edge routes");
            for _ in 0..8 {
                let again = route_flat_edge(0, &layered, &ir, &demand, &ports, &config)
                    .expect("flat edge routes");
                assert_eq!(again.points, first.points);
                assert_eq!(again.source_port.point, first.source_port.point);
                assert_eq!(again.target_port.point, first.target_port.point);
            }
        }
    }

    #[test]
    fn out_of_range_flat_index_returns_none() {
        let (layered, ir) = flat_fixture();
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let demand = RoutingDemand::default();
        assert!(route_flat_edge(7, &layered, &ir, &demand, &ports, &config).is_none());
    }

    // ---- end to end ----------------------------------------------------------------------------
    //
    // The corridor reservation is made in Phase 6 and spent in Phase 7, so only the whole pipeline
    // can show that the badge Phase 8 centres on the segment actually has the room it was promised.

    fn wire_node(id: &str) -> NormalizedNode {
        NormalizedNode {
            id: id.to_string(),
            label: Some(id.to_string()),
            width: 160.0,
            height: 76.0,
            rank: None,
            group: None,
        }
    }

    fn wire_edge(id: &str, source: &str, target: &str) -> NormalizedEdge {
        NormalizedEdge {
            id: id.to_string(),
            source: source.to_string(),
            target: target.to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
            weight: None,
            min_len: None,
            label_width: None,
            label_height: None,
        }
    }

    #[test]
    fn a_labelled_peer_edge_is_a_straight_run_with_room_for_its_badge() {
        const LABEL_WIDTH: f64 = 180.0;

        let nodes = vec![wire_node("root"), wire_node("a"), wire_node("b")];
        let mut peer = wire_edge("peer", "a", "b");
        peer.label = Some("depends on".to_string());
        peer.label_width = Some(LABEL_WIDTH);
        peer.label_height = Some(28.0);
        let edges = vec![
            wire_edge("root_a", "root", "a"),
            wire_edge("root_b", "root", "b"),
            peer,
        ];

        let result = crate::compute_layout(&nodes, &edges, &cfg(), EngineMode::Layered);

        let a = result
            .nodes
            .iter()
            .find(|n| n.id == "a")
            .expect("a is placed");
        let b = result
            .nodes
            .iter()
            .find(|n| n.id == "b")
            .expect("b is placed");
        assert_eq!(a.rank, b.rank, "the peers must share a rank");

        let route = result
            .edges
            .iter()
            .find(|e| e.edge_id == "peer")
            .expect("the peer edge is routed");
        assert_eq!(route.points.len(), 2, "{:?}", route.points);
        assert!((route.points[0].y - route.points[1].y).abs() < 1e-9);

        let gap = (b.x - (a.x + a.width))
            .abs()
            .max((a.x - (b.x + b.width)).abs());
        assert!(
            gap >= LABEL_WIDTH,
            "corridor {} is narrower than the {}px badge",
            gap,
            LABEL_WIDTH
        );

        let badge = result
            .badges
            .iter()
            .find(|badge| badge.edge_id == "peer")
            .expect("the peer edge has a badge");
        assert!(badge.leader_points.is_none(), "no leader line is needed");
        let midpoint = Point {
            x: (route.points[0].x + route.points[1].x) / 2.0,
            y: route.points[0].y,
        };
        assert!((badge.rect.center().x - midpoint.x).abs() < 1e-6);
        assert!((badge.rect.center().y - midpoint.y).abs() < 1e-6);
        for node in [a, b] {
            let rect = Rect {
                x: node.x,
                y: node.y,
                width: node.width,
                height: node.height,
            };
            assert!(
                badge.rect.right() <= rect.x + 1e-9 || badge.rect.x >= rect.right() - 1e-9,
                "badge {:?} overlaps node {}",
                badge.rect,
                node.id
            );
        }

        let errors: Vec<&str> = result
            .validation
            .diagnostics
            .iter()
            .filter(|d| d.severity == "error")
            .map(|d| d.message.as_str())
            .collect();
        assert!(errors.is_empty(), "{:?}", errors);
    }
}
