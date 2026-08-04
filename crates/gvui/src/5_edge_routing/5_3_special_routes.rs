//! # Step 5.3 (Phase 8): Self-loops and flat edges
//!
//! The two edge kinds that never became a chain. Both are still pure evaluation:
//!
//! - A **self-loop** has no ordering, no rank span and no lane. Its geometry is a function of the
//!   node's rectangle and a stacking index, so it is computed directly rather than looked up.
//! - A **flat edge** joins two items in the same rank. Phase 6 reserved it a corridor between two
//!   adjacent orders and widened the corresponding item separation to fit it, so the vertical jog
//!   is placed at the reserved lane and nothing else needs checking.

use super::edge_style::simplify_polyline;
use super::ports::PortTable;
use crate::config::CustomLayoutConfig;
use crate::types::{
    FlatEdge, GraphIr, Item, Layered, Point, PortRef, Rect, RoutedPath, RoutingDemand, Side,
};

/// Smallest outward step between two stacked self-loops, so consecutive loops never share a
/// vertical run even when `lane_spacing` is configured very small.
const MIN_LOOP_STEP: f64 = 4.0;

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

/// Same-rank edge through the corridor between its endpoints.
///
/// The shape is always `port -> stub -> corridor -> stub -> port`: two horizontal runs at the two
/// port heights joined by one vertical jog in the reserved corridor. When both ports happen to sit
/// at the same height — the common case for equal-height neighbours — the jog has zero length and
/// [`simplify_polyline`] collapses the whole thing to a straight line.
///
/// The corridor x is clamped into the interval between the two stubs. Phase 6 always places the
/// corridor between the endpoints, so the clamp is a no-op on well-formed input; it exists to keep
/// the polyline monotone (and therefore free of self-intersections) if a corridor is ever assigned
/// outside the span.
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
    let source_port = ports.source.get(&flat.edge)?.clone();
    let target_port = ports.target.get(&flat.edge)?.clone();

    let lo = source_port.stub.x.min(target_port.stub.x);
    let hi = source_port.stub.x.max(target_port.stub.x);
    let corridor_x = reserved_corridor_x(layered, demand, flat, config)
        .unwrap_or((lo + hi) / 2.0)
        .clamp(lo, hi);

    let points = simplify_polyline(
        &[
            source_port.point,
            source_port.stub,
            Point {
                x: corridor_x,
                y: source_port.stub.y,
            },
            Point {
                x: corridor_x,
                y: target_port.stub.y,
            },
            target_port.stub,
            target_port.point,
        ],
        config.epsilon,
    );

    Some(RoutedPath {
        edge_id,
        points,
        source_port,
        target_port,
    })
}

/// x of the reserved corridor lane for a flat edge, if Phase 6 assigned one.
///
/// The corridor is the gap between the items at `after_order` and `after_order + 1`; Phase 6d
/// widened that gap to `lanes * lane_spacing + label width + node_gap`, so lane `l` sits at
/// `gap_left + (l + 0.5) * lane_spacing` and is guaranteed to land inside the gap.
fn reserved_corridor_x(
    layered: &Layered,
    demand: &RoutingDemand,
    flat: &FlatEdge,
    config: &CustomLayoutConfig,
) -> Option<f64> {
    // `corridor_segs` is a Vec, so "first match wins" is a deterministic tie-break.
    let seg = demand
        .corridor_segs
        .iter()
        .find(|s| s.edge == flat.edge && s.rank == flat.rank)?;
    let left = item_at_order(layered, seg.rank, seg.after_order as usize)?;
    let right = item_at_order(layered, seg.rank, seg.after_order as usize + 1)?;

    let gap_lo = left.x + left.width;
    let gap_hi = right.x;
    if gap_hi <= gap_lo {
        return Some((gap_lo + gap_hi) / 2.0);
    }
    let x = gap_lo + (seg.lane as f64 + 0.5) * config.effective_lane_spacing();
    Some(x.clamp(gap_lo, gap_hi))
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
    use crate::types::{CorridorSeg, IrEdge, IrNode, ItemKind};

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

    /// Two same-rank nodes of different heights, so their facing ports sit at different y and the
    /// corridor jog survives simplification.
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

    #[test]
    fn flat_edge_jogs_in_its_reserved_corridor() {
        let (layered, ir) = flat_fixture();
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let mut demand = RoutingDemand::default();
        demand.corridor_segs.push(CorridorSeg {
            edge: 0,
            rank: 0,
            after_order: 0,
            lane: 2,
        });

        let route =
            route_flat_edge(0, &layered, &ir, &demand, &ports, &config).expect("flat edge routes");
        assert_eq!(route.edge_id, "e0");
        assert!(is_orthogonal(&route.points), "{:?}", route.points);
        assert_eq!(route.points[0], ports.source[&0].point);
        assert_eq!(route.points[route.points.len() - 1], ports.target[&0].point);

        // Exactly one vertical run, and it lies inside the gap between the two items.
        let verticals: Vec<f64> = route
            .points
            .windows(2)
            .filter(|w| (w[0].x - w[1].x).abs() < 1e-9 && (w[0].y - w[1].y).abs() > 1e-9)
            .map(|w| w[0].x)
            .collect();
        assert_eq!(verticals.len(), 1);
        assert!(verticals[0] >= 100.0 && verticals[0] <= 300.0);
    }

    #[test]
    fn flat_edge_without_a_corridor_falls_back_to_the_midpoint() {
        let (layered, ir) = flat_fixture();
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let demand = RoutingDemand::default();

        let route =
            route_flat_edge(0, &layered, &ir, &demand, &ports, &config).expect("flat edge routes");
        assert!(is_orthogonal(&route.points));
        let expected = (ports.source[&0].stub.x + ports.target[&0].stub.x) / 2.0;
        assert!(route.points.iter().any(|p| (p.x - expected).abs() < 1e-9));
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
    }

    #[test]
    fn out_of_range_flat_index_returns_none() {
        let (layered, ir) = flat_fixture();
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let demand = RoutingDemand::default();
        assert!(route_flat_edge(7, &layered, &ir, &demand, &ports, &config).is_none());
    }
}
