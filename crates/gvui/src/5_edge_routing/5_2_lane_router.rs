//! # Step 5.2 (Phase 8d): Materialising a chain's polyline
//!
//! This module contains no search, no grid, no collision test and no repair. A chain's polyline is
//! a **pure evaluation** of three things that are already fixed by the time it runs:
//!
//! - the ports (Step 5.1),
//! - the lane index of every link (Phase 6's interval colouring),
//! - the coordinates of every item (Phase 7).
//!
//! Phase 6 sized each rank gap to `lanes * lane_spacing + 2 * port_stub_length` and each corridor to
//! `lanes * lane_spacing + node_gap`, and Phase 7 honoured those separations exactly. Therefore the
//! channel y computed here always lands strictly between the bottom of rank `r`'s band and the top
//! of rank `r + 1`'s, and two links in the same channel with different lanes are always
//! `lane_spacing` apart. **A route emitted here cannot overlap a node or another edge's collinear
//! run, so adding a collision check would be dead code that hides an upstream bug rather than
//! catching one.**

use super::edge_style::simplify_polyline;
use super::ports::PortTable;
use crate::config::{CustomLayoutConfig, LabelPlacement};
use crate::types::{GraphIr, Item, ItemKind, Layered, Point, RoutedPath, RoutingDemand};
use std::collections::HashMap;

/// Hard ceiling on [`reduce_corners`] fixed-point passes.
///
/// Each pass that changes anything removes at least two points, so `len / 2 + 1` passes is
/// unreachable in practice; the constant exists so a future rule that fails to shrink the polyline
/// cannot turn the router into an infinite loop.
const MAX_REDUCTION_PASSES: usize = 8;

/// Bottom y of every rank band, indexed by rank.
///
/// The band bottom is `rank_tops[r] + max(item.height)` over rank `r`, which is where Phase 7's
/// rank-height rule puts it regardless of whether items are top-aligned or centred within the band
/// (the tallest item defines both).
///
/// Computing this once is why [`route_chain_with_bands`] exists: the naive alternative rescans a
/// rank for every link that starts in it, which is `O(links * rank_width)` over the whole graph.
pub fn rank_band_bottoms(layered: &Layered, rank_tops: &[f64]) -> Vec<f64> {
    let mut out = Vec::with_capacity(layered.rank_ranges.len());
    for (r, range) in layered.rank_ranges.iter().enumerate() {
        let top = rank_tops.get(r).copied().unwrap_or(0.0);
        let start = (range.start as usize).min(layered.items.len());
        let end = (range.end as usize).clamp(start, layered.items.len());
        let height = layered.items[start..end]
            .iter()
            .fold(0.0f64, |m, item| m.max(item.height));
        out.push(top + height);
    }
    out
}

/// Materialises the polyline for one chain from its lane assignments. Pure evaluation.
///
/// Returns `None` only for structurally impossible input — an out-of-range index, a chain with
/// fewer than two items, an item index that does not resolve, or a missing port. In a well-formed
/// pipeline every chain routes, because routing cannot fail in v2; a `None` is a defect signal
/// upstream, not a case to be recovered from here.
///
/// Prefer [`route_chain_with_bands`] when routing more than one chain: this wrapper recomputes the
/// whole band table on every call.
pub fn route_chain(
    chain_index: usize,
    layered: &Layered,
    ir: &GraphIr,
    demand: &RoutingDemand,
    ports: &PortTable,
    rank_tops: &[f64],
    config: &CustomLayoutConfig,
) -> Option<RoutedPath> {
    let bands = rank_band_bottoms(layered, rank_tops);
    route_chain_with_bands(
        chain_index,
        layered,
        ir,
        &demand.lane_of_link,
        ports,
        &bands,
        config,
    )
}

/// [`route_chain`] with the rank band bottoms hoisted out of the loop and the lane table supplied
/// directly.
///
/// `band_bottoms` must be the output of [`rank_band_bottoms`] for the same `layered`/`rank_tops`
/// pair; passing a stale table silently shifts every channel.
///
/// `lane_of_link` is passed rather than read off the [`RoutingDemand`] because Step 5.7 refines it
/// once coordinates exist. Taking the whole demand here would make it far too easy to route half a
/// channel from the refined table and half from the original, which puts two edges at the same y.
#[allow(clippy::too_many_arguments)]
pub fn route_chain_with_bands(
    chain_index: usize,
    layered: &Layered,
    ir: &GraphIr,
    lane_of_link: &HashMap<(u32, u32), u16>,
    ports: &PortTable,
    band_bottoms: &[f64],
    config: &CustomLayoutConfig,
) -> Option<RoutedPath> {
    let chain = layered.chains.get(chain_index)?;
    if chain.items.len() < 2 {
        return None;
    }
    let edge = chain.edge;
    let edge_id = ir.edge_names.get(edge as usize)?.clone();
    let source_port = ports.source.get(&edge)?.clone();
    let target_port = ports.target.get(&edge)?.clone();

    let lane_spacing = config.effective_lane_spacing();
    let stub_length = config.port_stub_length;
    let link_count = chain.items.len() - 1;

    let mut points: Vec<Point> = Vec::with_capacity(link_count * 4 + 2);
    points.push(source_port.point);
    points.push(source_port.stub);

    for link in 0..link_count {
        let from = layered.items.get(chain.items[link] as usize)?;
        let to = layered.items.get(chain.items[link + 1] as usize)?;

        // A missing lane means Phase 6 never saw this link. Lane 0 is the only choice that keeps
        // the route inside the reserved gap, so it is the safe default rather than a guess.
        let lane = lane_of_link.get(&(edge, link as u32)).copied().unwrap_or(0);
        let band_bottom = band_bottoms
            .get(from.rank as usize)
            .copied()
            .unwrap_or(from.y + from.height);
        let channel_y = band_bottom + stub_length + (lane as f64 + 0.5) * lane_spacing;

        let from_x = if link == 0 {
            source_port.stub.x
        } else {
            pass_x(from, config)
        };
        let to_x = if link == link_count - 1 {
            target_port.stub.x
        } else {
            pass_x(to, config)
        };

        points.push(Point {
            x: from_x,
            y: channel_y,
        });
        points.push(Point {
            x: to_x,
            y: channel_y,
        });

        if link == link_count - 1 {
            points.push(target_port.stub);
            points.push(target_port.point);
        } else {
            // Interior items (dummies and labels) are traversed vertically through their band. The
            // two points are usually collinear with the channel drops on either side and vanish in
            // `simplify_polyline`; they exist so a Label item under `AboveEdge` can pull the
            // traversal down to its bottom face without a special case in the loop above.
            points.push(Point {
                x: to_x,
                y: band_entry_y(to, config),
            });
            points.push(Point {
                x: to_x,
                y: to.y + to.height,
            });
        }
    }

    Some(RoutedPath {
        edge_id,
        points: reduce_corners(&points, config.epsilon),
        source_port,
        target_port,
    })
}

/// Removes bends a route does not need. Always on, and a pure rewrite of the point list.
///
/// Three rules:
///
/// 1. **Collinear merge and zero-length steps** — delegated to [`simplify_polyline`], which also
///    owns the bit-exact endpoint contract.
/// 2. **Stub absorption** — when the segment leaving the source port runs in the same direction as
///    the stub itself, the stub vertex disappears. This is the collinear merge applied at index 1,
///    not a separate rule, and it is called out here because it is the redundancy the lane router
///    emits most often: every port whose stub points into its own channel produces one.
/// 3. **Redundant jog removal** — four consecutive points that all share a y (or all share an x)
///    within `epsilon` collapse to the single run `A -> D`. This is the shape
///    `A -(h)-> B -(v)-> C -(h)-> D` whose vertical leg has degenerated, and the transpose.
///    [`simplify_polyline`] cannot do this one: it deliberately preserves a run that doubles back
///    on itself, and a jog whose two parallel runs overlap along their shared axis is exactly that.
///
/// ## Why none of this can introduce a collision
///
/// Both extra rewrites only ever *delete* vertices; no surviving vertex moves. So:
///
/// - The merged run `A -> D` spans `[A, D]` on the shared axis. Because `B` and `C` are consecutive
///   with `A` and `D`, the two original runs `[A, B]` and `[C, D]` are connected through `[B, C]`
///   and their union is a single interval containing both `A` and `D`. The result is therefore a
///   **subset of the footprint the route already occupied**, at the same coordinate to within
///   `epsilon`.
/// - An `epsilon`-scale shift cannot move a segment out of the lane Phase 6 reserved for it: lanes
///   are `lane_spacing` apart, which is orders of magnitude larger than `epsilon`.
///
/// A rewrite that could not be justified this way — collapsing a jog whose runs differ by a visible
/// amount, say — is deliberately absent. It would move an edge off its reserved lane, and the
/// reservation is the only reason routing in this engine cannot fail.
pub fn reduce_corners(points: &[Point], epsilon: f64) -> Vec<Point> {
    let eps = if epsilon.is_finite() && epsilon > 0.0 {
        epsilon
    } else {
        0.0
    };
    let mut out = simplify_polyline(points, epsilon);
    for _ in 0..MAX_REDUCTION_PASSES {
        let next = collapse_jogs(&out, eps);
        let shrank = next.len() < out.len();
        out = next;
        if !shrank {
            break;
        }
    }
    simplify_polyline(&out, epsilon)
}

/// One left-to-right sweep of the jog rule. Never touches the first or last point.
fn collapse_jogs(points: &[Point], eps: f64) -> Vec<Point> {
    if points.len() < 4 {
        return points.to_vec();
    }
    let mut out: Vec<Point> = Vec::with_capacity(points.len());
    let mut i = 0usize;
    while i < points.len() {
        if i + 3 < points.len() {
            let a = points[i];
            let b = points[i + 1];
            let c = points[i + 2];
            let d = points[i + 3];
            let flat_y =
                (b.y - a.y).abs() <= eps && (c.y - a.y).abs() <= eps && (d.y - a.y).abs() <= eps;
            let flat_x =
                (b.x - a.x).abs() <= eps && (c.x - a.x).abs() <= eps && (d.x - a.x).abs() <= eps;
            if flat_y || flat_x {
                out.push(a);
                // Resume at `D`, which is kept: dropping only interior vertices is what preserves
                // the endpoints when the jog sits at either end of the polyline.
                i += 3;
                continue;
            }
        }
        out.push(points[i]);
        i += 1;
    }
    out
}

/// Measured badge width carried by a `Label` item.
///
/// Under `BesideEdge` Phase 4 reserves a **double width** item: the left half is the edge's own
/// lane and the right half is the badge. Callers that need the badge's own width must go through
/// this rather than reading `item.width`.
pub fn label_box_width(item: &Item, config: &CustomLayoutConfig) -> f64 {
    match config.label_placement {
        LabelPlacement::BesideEdge => item.width / 2.0,
        LabelPlacement::OnEdge | LabelPlacement::AboveEdge => item.width,
    }
}

/// The x at which a chain crosses an item's band.
///
/// For dummies this is simply the centre, which is what keeps a Brandes-Köpf-aligned dummy chain
/// perfectly straight. For labels it is where `label_placement` says the line runs relative to the
/// badge.
///
/// Visible to Step 5.7, which has to predict the exact x values this module will emit; deriving
/// them independently there would optimise a drawing other than the one produced.
pub(super) fn pass_x(item: &Item, config: &CustomLayoutConfig) -> f64 {
    match item.kind {
        ItemKind::Label(_) => match config.label_placement {
            // Down the middle of the reserved left half; the badge occupies the right half.
            LabelPlacement::BesideEdge => item.x + label_box_width(item, config) / 2.0,
            LabelPlacement::OnEdge | LabelPlacement::AboveEdge => item.center_x(),
        },
        ItemKind::Real(_) | ItemKind::Dummy { .. } => item.center_x(),
    }
}

/// Where the chain enters an interior item's band.
///
/// `AboveEdge` pins the entry to the item's bottom face so the badge sits wholly above the line;
/// every other kind of item is entered at its top.
fn band_entry_y(item: &Item, config: &CustomLayoutConfig) -> f64 {
    match item.kind {
        ItemKind::Label(_) if config.label_placement == LabelPlacement::AboveEdge => {
            item.y + item.height
        }
        _ => item.y,
    }
}

#[cfg(test)]
mod tests {
    use super::super::ports::assign_ports;
    use super::*;
    use crate::types::{EdgeChain, EdgeRole, IrEdge, IrNode};

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

    fn chain(edge: u32, items: Vec<u32>) -> EdgeChain {
        EdgeChain {
            edge,
            reversed: false,
            role: EdgeRole::Forward,
            items,
            label_at: None,
        }
    }

    fn is_orthogonal(points: &[Point]) -> bool {
        points
            .windows(2)
            .all(|w| (w[0].x - w[1].x).abs() < 1e-9 || (w[0].y - w[1].y).abs() < 1e-9)
    }

    /// A -> B, both 100 wide and horizontally aligned, so both ports land on the same x.
    #[test]
    fn aligned_span_one_edge_collapses_to_two_points() {
        let ir = mk_ir(2, &[(0, 1)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0),
                mk_item(ItemKind::Real(1), 1, 0, 0.0, 200.0, 100.0, 40.0),
            ],
            rank_ranges: ranks(&[1, 1]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![chain(0, vec![0, 1])],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 1],
        };
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let demand = RoutingDemand::default();
        let rank_tops = [0.0, 200.0];

        let route = route_chain(0, &layered, &ir, &demand, &ports, &rank_tops, &config)
            .expect("chain routes");
        assert_eq!(route.edge_id, "e0");
        assert_eq!(route.points.len(), 2);
        assert_eq!(route.points[0], ports.source[&0].point);
        assert_eq!(route.points[1], ports.target[&0].point);
    }

    /// A -> dummy -> B with all three at different x. Every emitted segment must be axis-aligned.
    #[test]
    fn span_two_edge_is_orthogonal_end_to_end() {
        let ir = mk_ir(2, &[(0, 1)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0),
                mk_item(
                    ItemKind::Dummy { edge: 0, seq: 0 },
                    1,
                    0,
                    200.0,
                    200.0,
                    1.0,
                    1.0,
                ),
                mk_item(ItemKind::Real(1), 2, 0, 400.0, 400.0, 100.0, 40.0),
            ],
            rank_ranges: ranks(&[1, 1, 1]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![chain(0, vec![0, 1, 2])],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 2],
        };
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let mut demand = RoutingDemand::default();
        demand.lane_of_link.insert((0, 0), 0);
        demand.lane_of_link.insert((0, 1), 0);
        let rank_tops = [0.0, 200.0, 400.0];

        let route = route_chain(0, &layered, &ir, &demand, &ports, &rank_tops, &config)
            .expect("chain routes");
        assert!(is_orthogonal(&route.points), "{:?}", route.points);
        assert!(route.points.len() >= 4);
        assert_eq!(route.points[0], ports.source[&0].point);
        assert_eq!(route.points[route.points.len() - 1], ports.target[&0].point);
        // The dummy is traversed at its centre, which is what keeps aligned chains straight.
        assert!(route.points.iter().any(|p| (p.x - 200.5).abs() < 1e-9));
    }

    /// Two edges sharing channel 0 but coloured into different lanes must run at different y.
    #[test]
    fn different_lanes_produce_different_channel_y() {
        let ir = mk_ir(3, &[(0, 1), (0, 2)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 300.0, 40.0),
                mk_item(ItemKind::Real(1), 1, 0, 0.0, 200.0, 100.0, 40.0),
                mk_item(ItemKind::Real(2), 1, 1, 400.0, 200.0, 100.0, 40.0),
            ],
            rank_ranges: ranks(&[1, 2]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![chain(0, vec![0, 1]), chain(1, vec![0, 2])],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 1, 2],
        };
        // Both edges must keep a horizontal run for their channel y to be observable at all. Step
        // 5.1's straight-shot alignment would slide edge 0's two ports onto one x and delete its
        // run, which is that feature working, not this lane rule failing.
        let config = CustomLayoutConfig {
            straight_shot_alignment: false,
            ..cfg()
        };
        let ports = assign_ports(&layered, &ir, &config);
        let mut demand = RoutingDemand::default();
        demand.lane_of_link.insert((0, 0), 0);
        demand.lane_of_link.insert((1, 0), 1);
        let rank_tops = [0.0, 200.0];
        let bands = rank_band_bottoms(&layered, &rank_tops);

        let a = route_chain_with_bands(
            0,
            &layered,
            &ir,
            &demand.lane_of_link,
            &ports,
            &bands,
            &config,
        )
        .expect("routes");
        let b = route_chain_with_bands(
            1,
            &layered,
            &ir,
            &demand.lane_of_link,
            &ports,
            &bands,
            &config,
        )
        .expect("routes");

        let horiz_y = |r: &RoutedPath| -> f64 {
            r.points
                .windows(2)
                .find(|w| (w[0].y - w[1].y).abs() < 1e-9 && (w[0].x - w[1].x).abs() > 1e-9)
                .map(|w| w[0].y)
                .unwrap_or(f64::NAN)
        };
        let ya = horiz_y(&a);
        let yb = horiz_y(&b);
        assert!(ya.is_finite() && yb.is_finite());
        assert!((yb - ya - config.effective_lane_spacing()).abs() < 1e-9);
        // Both channels sit strictly between the band bottom and the next rank's top.
        assert!(ya > 40.0 && yb < 200.0);
    }

    #[test]
    fn band_bottoms_use_the_tallest_item_in_the_rank() {
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0),
                mk_item(ItemKind::Real(1), 0, 1, 200.0, 0.0, 100.0, 90.0),
            ],
            rank_ranges: ranks(&[2]),
            ..Default::default()
        };
        assert_eq!(rank_band_bottoms(&layered, &[10.0]), vec![100.0]);
        // Missing rank_tops entries degrade to 0.0 rather than panicking.
        assert_eq!(rank_band_bottoms(&layered, &[]), vec![90.0]);
    }

    #[test]
    fn label_pass_x_honours_placement() {
        let mut config = cfg();
        // Double-width label item: measured badge is 80 wide, the item is 160.
        let item = mk_item(ItemKind::Label(0), 1, 0, 100.0, 200.0, 160.0, 28.0);

        config.label_placement = LabelPlacement::BesideEdge;
        assert_eq!(label_box_width(&item, &config), 80.0);
        assert_eq!(pass_x(&item, &config), 140.0);
        assert_eq!(band_entry_y(&item, &config), 200.0);

        config.label_placement = LabelPlacement::OnEdge;
        assert_eq!(pass_x(&item, &config), 180.0);

        config.label_placement = LabelPlacement::AboveEdge;
        assert_eq!(pass_x(&item, &config), 180.0);
        assert_eq!(band_entry_y(&item, &config), 228.0);
    }

    // ---------------------------------------------------------------------------------------
    // Corner reduction
    // ---------------------------------------------------------------------------------------

    fn pt(x: f64, y: f64) -> Point {
        Point { x, y }
    }

    #[test]
    fn a_jog_whose_two_horizontal_runs_share_a_y_collapses_to_one_segment() {
        // `A -(h)-> B -(v)-> C -(h)-> D` with a degenerate vertical leg.
        let pts = [
            pt(0.0, 40.0),
            pt(100.0, 40.0),
            pt(100.0, 40.0005),
            pt(220.0, 40.0005),
        ];
        let out = reduce_corners(&pts, 0.001);
        assert_eq!(out, vec![pts[0], pts[3]]);

        // The transpose: two vertical runs sharing an x.
        let pts = [
            pt(40.0, 0.0),
            pt(40.0, 100.0),
            pt(40.0005, 100.0),
            pt(40.0005, 220.0),
        ];
        let out = reduce_corners(&pts, 0.001);
        assert_eq!(out, vec![pts[0], pts[3]]);
    }

    /// The case `simplify_polyline` alone cannot handle: it preserves a run that doubles back, so
    /// an overshoot inside a single horizontal run survives its collinear pass.
    #[test]
    fn an_overshoot_inside_one_run_is_removed_although_simplify_alone_keeps_it() {
        let pts = [
            pt(0.0, 40.0),
            pt(160.0, 40.0),
            pt(90.0, 40.0),
            pt(240.0, 40.0),
        ];
        assert_eq!(simplify_polyline(&pts, 0.001), pts.to_vec());
        assert_eq!(reduce_corners(&pts, 0.001), vec![pts[0], pts[3]]);
    }

    #[test]
    fn a_stub_running_into_its_own_channel_is_absorbed() {
        // port -> stub -> channel corner -> across. The stub continues straight into the channel
        // drop, so it is not a bend and must not survive as a point.
        let pts = [
            pt(50.0, 40.0),
            pt(50.0, 60.0),
            pt(50.0, 130.0),
            pt(300.0, 130.0),
        ];
        let out = reduce_corners(&pts, 0.001);
        assert_eq!(out, vec![pt(50.0, 40.0), pt(50.0, 130.0), pt(300.0, 130.0)]);
    }

    #[test]
    fn corner_reduction_never_changes_the_first_or_last_point() {
        let cases: Vec<Vec<Point>> = vec![
            vec![
                pt(1.5, 2.5),
                pt(1.5, 90.0),
                pt(200.0, 90.0),
                pt(200.0, 300.25),
            ],
            vec![
                pt(0.0, 0.0),
                pt(120.0, 0.0),
                pt(120.0, 0.0004),
                pt(260.0, 0.0004),
                pt(260.0, 500.0),
            ],
            // A jog sitting flush against the tail of the polyline.
            vec![
                pt(0.0, 0.0),
                pt(0.0, 50.0),
                pt(80.0, 50.0),
                pt(40.0, 50.0),
                pt(175.0, 50.0),
            ],
            vec![pt(7.0, 9.0), pt(7.0, 9.0)],
            vec![pt(3.0, 4.0)],
        ];
        for pts in cases {
            let out = reduce_corners(&pts, 0.001);
            assert_eq!(out[0], pts[0], "{:?}", pts);
            assert_eq!(out[out.len() - 1], pts[pts.len() - 1], "{:?}", pts);
        }
        assert!(reduce_corners(&[], 0.001).is_empty());
    }

    #[test]
    fn a_real_corner_is_not_removed() {
        let pts = [
            pt(0.0, 0.0),
            pt(0.0, 120.0),
            pt(200.0, 120.0),
            pt(200.0, 300.0),
        ];
        assert_eq!(reduce_corners(&pts, 0.001), pts.to_vec());
    }

    #[test]
    fn reduction_is_idempotent_and_survives_a_degenerate_epsilon() {
        let pts = [
            pt(0.0, 0.0),
            pt(0.0, 60.0),
            pt(140.0, 60.0),
            pt(90.0, 60.0),
            pt(260.0, 60.0),
            pt(260.0, 400.0),
        ];
        let once = reduce_corners(&pts, 0.001);
        assert_eq!(reduce_corners(&once, 0.001), once);
        // A non-positive epsilon degrades to exact comparison rather than panicking.
        let exact = reduce_corners(&pts, f64::NAN);
        assert_eq!(exact[0], pts[0]);
        assert_eq!(exact[exact.len() - 1], pts[pts.len() - 1]);
    }

    #[test]
    fn degenerate_inputs_return_none_rather_than_a_wrong_route() {
        let ir = mk_ir(1, &[(0, 0)]);
        let layered = Layered {
            items: vec![mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 100.0, 40.0)],
            rank_ranges: ranks(&[1]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![chain(0, vec![0])],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0],
        };
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let demand = RoutingDemand::default();
        assert!(route_chain(0, &layered, &ir, &demand, &ports, &[0.0], &config).is_none());
        assert!(route_chain(9, &layered, &ir, &demand, &ports, &[0.0], &config).is_none());
    }
}
