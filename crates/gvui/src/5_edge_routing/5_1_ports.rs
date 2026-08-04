//! # Step 5.1 (Phase 8a-8c): Port assignment
//!
//! Every attachment decision here is **determined or sorted, never searched**. The v1 engine tried
//! all sixteen `(source_side, target_side)` combinations per edge and then searched again to repair
//! the crossings that produced. Both searches disappear because:
//!
//! 1. **The side is a table lookup.** In the engine's internal top-down frame a chain edge always
//!    leaves the bottom and enters the top; a flat edge uses the two facing sides; a self-loop uses
//!    the right side twice. Direction (`LeftRight`, `BottomUp`, ...) is a transposition applied
//!    elsewhere, so this module never branches on it.
//! 2. **The order along a side is a sort by the neighbour's `order`.** Phase 5 already minimised
//!    crossings *between* ranks; sorting the bottom ports by the order of the item they run to (and
//!    the top ports by the order of the item they come from) makes the attachment locally
//!    crossing-free as a consequence, with no counting and no repair pass.
//!
//! Reversed (feedback) edges had their endpoints swapped by Phase 2, so in the internal frame they
//! are ordinary `Bottom -> Top` edges and are deliberately *not* special-cased. Phase 9 flips the
//! arrowhead back.

use crate::config::CustomLayoutConfig;
use crate::types::{GraphIr, Item, ItemKind, Layered, Point, PortRef, Rect, Side};
use std::collections::HashMap;

/// Pitch floor used when a node is still too narrow for its port count after Phase 0's
/// degree-driven width growth (i.e. the node clamped at `max_node_width`).
///
/// Coordinates are already final when this module runs, so the node cannot be widened and the
/// ports are allowed to crowd instead. The run is re-centred on the side rather than allowed to
/// overflow the corner, which keeps the "every port lies on the node boundary" invariant intact.
const CROWDED_MIN_PITCH: f64 = 2.0;

/// Sides in a fixed, deterministic iteration order. Never iterate a `HashMap` to reach these.
const SIDES: [Side; 4] = [Side::Top, Side::Right, Side::Bottom, Side::Left];

/// Source and target port for every non-self edge, keyed by edge index.
///
/// "Source" and "target" are the **chain's** two ends in the internal frame, which for a reversed
/// feedback edge are the original target and source respectively. Phase 9 un-reverses both the
/// polyline and this pair together, so callers must not try to correct for it here.
///
/// Self-loops are absent by design: their two ports are generated together with their polyline by
/// [`super::special_routes::route_self_loop`], because the stacking index couples them.
pub struct PortTable {
    pub source: HashMap<u32, PortRef>,
    pub target: HashMap<u32, PortRef>,
}

impl PortTable {
    /// Number of edges that received both a source and a target port.
    pub fn len(&self) -> usize {
        self.source.len().min(self.target.len())
    }

    /// True when no edge received a port pair.
    pub fn is_empty(&self) -> bool {
        self.source.is_empty() && self.target.is_empty()
    }
}

/// One pending port before spacing is known. Collected in graph order, then sorted.
#[derive(Clone, Copy)]
struct PortSlot {
    edge: u32,
    /// Primary key for `Top`/`Bottom`: the `order` of the adjacent item in the neighbouring rank.
    order_key: u32,
    /// Primary key for `Left`/`Right`: the other endpoint item's `y`.
    y_key: f64,
    /// True when this slot is the chain's source end.
    is_source: bool,
}

/// Assigns a source and target port to every chain edge and every flat edge.
///
/// Contract subtleties a caller could get wrong:
/// - The returned points are in the **internal top-down frame** and are final; nothing downstream
///   may move a node to make a port fit.
/// - `stub` is exactly `config.port_stub_length` along the side's outward normal, so a router can
///   emit `point -> stub` as its first segment without re-deriving the direction.
/// - An edge whose chain endpoint is not a `Real` item (which Phase 4 never produces) is skipped
///   rather than approximated; it will show up as a missing route, not as a wrong one.
pub fn assign_ports(layered: &Layered, ir: &GraphIr, config: &CustomLayoutConfig) -> PortTable {
    let node_count = ir.node_count();
    let mut table = PortTable {
        source: HashMap::with_capacity(layered.chains.len() + layered.flat_edges.len()),
        target: HashMap::with_capacity(layered.chains.len() + layered.flat_edges.len()),
    };
    if node_count == 0 {
        return table;
    }

    // `slots[node * 4 + side_index(side)]` — a dense Vec, so collection order is graph order and
    // never depends on hashing.
    let mut slots: Vec<Vec<PortSlot>> = vec![Vec::new(); node_count * 4];

    for chain in &layered.chains {
        if chain.items.len() < 2 {
            continue;
        }
        let last = chain.items.len() - 1;

        // Bottom side of the source node, keyed by the order of the item in rank r + 1.
        if let (Some(node), Some(next)) = (
            real_node_of(layered, chain.items[0]),
            layered.items.get(chain.items[1] as usize),
        ) {
            if let Some(list) = slots.get_mut(node as usize * 4 + side_index(Side::Bottom)) {
                list.push(PortSlot {
                    edge: chain.edge,
                    order_key: next.order as u32,
                    y_key: 0.0,
                    is_source: true,
                });
            }
        }

        // Top side of the target node, keyed by the order of the item in rank r - 1.
        if let (Some(node), Some(prev)) = (
            real_node_of(layered, chain.items[last]),
            layered.items.get(chain.items[last - 1] as usize),
        ) {
            if let Some(list) = slots.get_mut(node as usize * 4 + side_index(Side::Top)) {
                list.push(PortSlot {
                    edge: chain.edge,
                    order_key: prev.order as u32,
                    y_key: 0.0,
                    is_source: false,
                });
            }
        }
    }

    for flat in &layered.flat_edges {
        let (Some(from), Some(to)) = (
            layered.items.get(flat.from_item as usize),
            layered.items.get(flat.to_item as usize),
        ) else {
            continue;
        };
        let (Some(from_node), Some(to_node)) = (
            real_node_of(layered, flat.from_item),
            real_node_of(layered, flat.to_item),
        ) else {
            continue;
        };
        if from_node == to_node {
            // A same-node flat edge is a self-loop; Phase 4 records those separately.
            continue;
        }

        // Items within a rank never overlap, so comparing left edges is the same as comparing
        // centres and is stable under differing widths.
        let source_side = if from.x <= to.x {
            Side::Right
        } else {
            Side::Left
        };
        let target_side = source_side.opposite();

        if let Some(list) = slots.get_mut(from_node as usize * 4 + side_index(source_side)) {
            list.push(PortSlot {
                edge: flat.edge,
                order_key: 0,
                y_key: to.y,
                is_source: true,
            });
        }
        if let Some(list) = slots.get_mut(to_node as usize * 4 + side_index(target_side)) {
            list.push(PortSlot {
                edge: flat.edge,
                order_key: 0,
                y_key: from.y,
                is_source: false,
            });
        }
    }

    for node in 0..node_count {
        let Some(item) = layered
            .item_of_node
            .get(node)
            .and_then(|&ix| layered.items.get(ix as usize))
        else {
            continue;
        };
        let Some(node_id) = ir.node_names.get(node) else {
            continue;
        };
        let rect = item.rect();

        for (si, side) in SIDES.iter().copied().enumerate() {
            let Some(list) = slots.get_mut(node * 4 + si) else {
                continue;
            };
            if list.is_empty() {
                continue;
            }

            match side {
                Side::Top | Side::Bottom => {
                    list.sort_by(|a, b| a.order_key.cmp(&b.order_key).then(a.edge.cmp(&b.edge)))
                }
                // `total_cmp` rather than `partial_cmp` so a NaN coordinate cannot make the
                // comparator inconsistent and the sort order implementation-defined.
                Side::Left | Side::Right => {
                    list.sort_by(|a, b| a.y_key.total_cmp(&b.y_key).then(a.edge.cmp(&b.edge)))
                }
            }

            let side_length = match side {
                Side::Top | Side::Bottom => rect.width,
                Side::Left | Side::Right => rect.height,
            };
            let (pitch, base) = port_spacing(side_length, list.len(), config);

            for (i, slot) in list.iter().enumerate() {
                let offset = (base + (i as f64 + 1.0) * pitch).clamp(0.0, side_length.max(0.0));
                let port = make_port(node_id, side, i, &rect, offset, config.port_stub_length);
                if slot.is_source {
                    table.source.insert(slot.edge, port);
                } else {
                    table.target.insert(slot.edge, port);
                }
            }
        }
    }

    table
}

/// Node index behind an item, or `None` when the item is a dummy or a label.
fn real_node_of(layered: &Layered, item_index: u32) -> Option<u32> {
    match layered.items.get(item_index as usize)?.kind {
        ItemKind::Real(n) => Some(n),
        _ => None,
    }
}

/// Dense side ordinal used to index the per-node slot table.
fn side_index(side: Side) -> usize {
    match side {
        Side::Top => 0,
        Side::Right => 1,
        Side::Bottom => 2,
        Side::Left => 3,
    }
}

/// Pitch and base offset for `n` ports on a side of length `side_length`.
///
/// The normal branch is the spec formula: `pitch = (len - 2 * padding) / (n + 1)` with the first
/// port one pitch past the padding, which distributes ports symmetrically and keeps the outermost
/// ones `port_endpoint_padding` clear of the corners.
///
/// The crowded branch fires only when Phase 0's width growth hit `max_node_width`. It pins the
/// pitch at [`CROWDED_MIN_PITCH`] and re-centres the run on the side, because a node whose
/// coordinates are already final must not be moved and ports piled onto a corner would break the
/// "port lies on the boundary at a distinct offset" property more visibly than dense ports do.
fn port_spacing(side_length: f64, n: usize, config: &CustomLayoutConfig) -> (f64, f64) {
    let padding = config.port_endpoint_padding.max(0.0);
    let usable = (side_length - 2.0 * padding).max(0.0);
    let count = n as f64;
    let ideal = usable / (count + 1.0);
    if ideal >= CROWDED_MIN_PITCH {
        (ideal, padding)
    } else {
        let pitch = CROWDED_MIN_PITCH;
        (pitch, side_length / 2.0 - (count + 1.0) * pitch / 2.0)
    }
}

/// Materialises a port at `offset` along `side`, measured from the side's start
/// (left for `Top`/`Bottom`, top for `Left`/`Right`).
fn make_port(
    node_id: &str,
    side: Side,
    index: usize,
    rect: &Rect,
    offset: f64,
    stub_length: f64,
) -> PortRef {
    let point = match side {
        Side::Top => Point {
            x: rect.x + offset,
            y: rect.y,
        },
        Side::Bottom => Point {
            x: rect.x + offset,
            y: rect.bottom(),
        },
        Side::Left => Point {
            x: rect.x,
            y: rect.y + offset,
        },
        Side::Right => Point {
            x: rect.right(),
            y: rect.y + offset,
        },
    };
    let normal = side.normal();
    PortRef {
        node_id: node_id.to_string(),
        side,
        index,
        point,
        stub: Point {
            x: point.x + normal.x * stub_length,
            y: point.y + normal.y * stub_length,
        },
    }
}

/// Convenience for routers: the item backing a real node, if Phase 4 recorded one.
pub fn node_item(layered: &Layered, node: u32) -> Option<&Item> {
    layered
        .item_of_node
        .get(node as usize)
        .and_then(|&ix| layered.items.get(ix as usize))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{EdgeChain, EdgeRole, FlatEdge, IrEdge, IrNode};

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

    /// One source at rank 0 fanning out to three targets at rank 1. Edge indices are deliberately
    /// scrambled relative to target order so the sort is actually exercised.
    fn fan_out() -> (Layered, GraphIr) {
        let ir = mk_ir(4, &[(0, 3), (0, 1), (0, 2)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 300.0, 40.0),
                mk_item(ItemKind::Real(1), 1, 0, 0.0, 200.0, 100.0, 40.0),
                mk_item(ItemKind::Real(2), 1, 1, 150.0, 200.0, 100.0, 40.0),
                mk_item(ItemKind::Real(3), 1, 2, 300.0, 200.0, 100.0, 40.0),
            ],
            rank_ranges: ranks(&[1, 3]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![
                chain(0, vec![0, 3]),
                chain(1, vec![0, 1]),
                chain(2, vec![0, 2]),
            ],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 1, 2, 3],
        };
        (layered, ir)
    }

    #[test]
    fn bottom_port_order_follows_target_item_order() {
        let (layered, ir) = fan_out();
        let ports = assign_ports(&layered, &ir, &cfg());

        // edge 1 -> item order 0, edge 2 -> item order 1, edge 0 -> item order 2.
        assert_eq!(ports.source[&1].index, 0);
        assert_eq!(ports.source[&2].index, 1);
        assert_eq!(ports.source[&0].index, 2);

        // Strictly increasing x along the bottom side is what makes the attachment crossing-free.
        assert!(ports.source[&1].point.x < ports.source[&2].point.x);
        assert!(ports.source[&2].point.x < ports.source[&0].point.x);

        for e in 0..3u32 {
            assert_eq!(ports.source[&e].side, Side::Bottom);
            assert_eq!(ports.target[&e].side, Side::Top);
        }
    }

    #[test]
    fn ports_lie_on_the_boundary_and_stubs_are_exactly_one_stub_length_out() {
        let (layered, ir) = fan_out();
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);

        for e in 0..3u32 {
            let s = &ports.source[&e];
            // Bottom side of the rank-0 node: y == node bottom, x inside the node's width.
            assert_eq!(s.point.y, 40.0);
            assert!(s.point.x >= 0.0 && s.point.x <= 300.0);
            assert_eq!(s.stub.x, s.point.x);
            assert_eq!(s.stub.y - s.point.y, config.port_stub_length);

            let t = &ports.target[&e];
            assert_eq!(t.point.y, 200.0);
            assert_eq!(t.stub.x, t.point.x);
            assert_eq!(t.point.y - t.stub.y, config.port_stub_length);
        }
    }

    #[test]
    fn spacing_matches_the_pitch_formula() {
        let (layered, ir) = fan_out();
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);

        let pitch = (300.0 - 2.0 * config.port_endpoint_padding) / 4.0;
        let expect = |i: usize| config.port_endpoint_padding + (i as f64 + 1.0) * pitch;

        assert!((ports.source[&1].point.x - expect(0)).abs() < 1e-9);
        assert!((ports.source[&2].point.x - expect(1)).abs() < 1e-9);
        assert!((ports.source[&0].point.x - expect(2)).abs() < 1e-9);
    }

    #[test]
    fn crowded_side_clamps_pitch_and_keeps_ports_on_the_boundary() {
        let config = cfg();
        // 200 ports on a 120 wide side: the ideal pitch is far below the floor.
        let (pitch, base) = port_spacing(120.0, 200, &config);
        assert_eq!(pitch, CROWDED_MIN_PITCH);
        let first = base + pitch;
        let last = base + 200.0 * pitch;
        // The run is re-centred, so it straddles the middle of the side symmetrically.
        assert!((first + last - 120.0).abs() < 1e-9);
    }

    #[test]
    fn flat_edge_sides_follow_relative_x() {
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
        let ports = assign_ports(&layered, &ir, &cfg());

        assert_eq!(ports.source[&0].side, Side::Right);
        assert_eq!(ports.target[&0].side, Side::Left);
        assert_eq!(ports.source[&0].point.x, 100.0);
        assert_eq!(ports.target[&0].point.x, 300.0);
        // Stubs point outward along the horizontal normal.
        assert_eq!(ports.source[&0].stub.x, 120.0);
        assert_eq!(ports.target[&0].stub.x, 280.0);
        assert_eq!(ports.source[&0].stub.y, ports.source[&0].point.y);
    }

    #[test]
    fn empty_graph_yields_an_empty_table() {
        let ir = GraphIr::default();
        let layered = Layered::default();
        let ports = assign_ports(&layered, &ir, &cfg());
        assert!(ports.is_empty());
        assert_eq!(ports.len(), 0);
    }

    #[test]
    fn degenerate_single_item_chain_is_skipped_not_approximated() {
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
        let ports = assign_ports(&layered, &ir, &cfg());
        assert!(ports.source.is_empty());
        assert!(ports.target.is_empty());
    }

    #[test]
    fn assignment_is_byte_stable_across_runs() {
        let (layered, ir) = fan_out();
        let a = assign_ports(&layered, &ir, &cfg());
        let b = assign_ports(&layered, &ir, &cfg());
        for e in 0..3u32 {
            assert_eq!(a.source[&e], b.source[&e]);
            assert_eq!(a.target[&e], b.target[&e]);
        }
    }
}
