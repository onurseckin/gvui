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
    route_chain_with_bands(chain_index, layered, ir, demand, ports, &bands, config)
}

/// [`route_chain`] with the rank band bottoms hoisted out of the loop.
///
/// `band_bottoms` must be the output of [`rank_band_bottoms`] for the same `layered`/`rank_tops`
/// pair; passing a stale table silently shifts every channel.
#[allow(clippy::too_many_arguments)]
pub fn route_chain_with_bands(
    chain_index: usize,
    layered: &Layered,
    ir: &GraphIr,
    demand: &RoutingDemand,
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
        let lane = demand
            .lane_of_link
            .get(&(edge, link as u32))
            .copied()
            .unwrap_or(0);
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
        points: simplify_polyline(&points, config.epsilon),
        source_port,
        target_port,
    })
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
fn pass_x(item: &Item, config: &CustomLayoutConfig) -> f64 {
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
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let mut demand = RoutingDemand::default();
        demand.lane_of_link.insert((0, 0), 0);
        demand.lane_of_link.insert((1, 0), 1);
        let rank_tops = [0.0, 200.0];
        let bands = rank_band_bottoms(&layered, &rank_tops);

        let a = route_chain_with_bands(0, &layered, &ir, &demand, &ports, &bands, &config)
            .expect("routes");
        let b = route_chain_with_bands(1, &layered, &ir, &demand, &ports, &bands, &config)
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
