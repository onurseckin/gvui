//! # Step 5.1 (Phase 8a-8c): Port assignment
//!
//! Every attachment decision here is **determined or sorted, never searched**. The v1 engine tried
//! all sixteen `(source_side, target_side)` combinations per edge and then searched again to repair
//! the crossings that produced. v3 still evaluates sixteen combinations, but it *scores* them with a
//! closed-form cost and takes the minimum — one pass, no repair, no backtracking:
//!
//! 1. **The side is a scored choice** ([`plan_chain_sides`]). Under `flexible_port_sides` a chain
//!    edge may attach to any face whose stub direction the lane model can realise, ranked
//!    lexicographically by `(bends, flow_penalty + length / 1000, congestion, candidate order)`.
//!    With `flexible_port_sides` off the side is the v2 table: every chain edge is `Bottom -> Top`.
//! 2. **The order along a side is a sort by the neighbour's `order`.** Phase 5 already minimised
//!    crossings *between* ranks; sorting the bottom ports by the order of the item they run to (and
//!    the top ports by the order of the item they come from) makes the attachment locally
//!    crossing-free as a consequence, with no counting and no repair pass.
//! 3. **Straight-shot alignment** ([`apply_straight_shot_alignment`]) then slides ports onto a
//!    common x wherever the slack allows, turning a dog-leg into one straight segment. It is the
//!    other half of step 1: a vertical face is only ever chosen because the *other* end can come and
//!    meet the fixed x it drops at, and this is the pass that makes it do so.
//!
//! Reversed (feedback) edges had their endpoints swapped by Phase 2, so in the internal frame they
//! are ordinary `Bottom -> Top` edges and are deliberately *not* special-cased. Phase 9 flips the
//! arrowhead back.
//!
//! ## Why a side port cannot break Phase 6's reservation
//!
//! Phase 6 reserved routing space in **order space**, before any coordinate existed: a channel below
//! each rank sized by an interval colouring, and a corridor between each adjacent pair of items in a
//! rank. Moving an attachment point from the bottom face to a side face does not touch either
//! reservation, because a side port **still descends into the channel below its own rank** — Step
//! 5.2 drops from `port.stub` straight to the channel y and runs horizontally from there. The
//! travel direction through the layered structure is unchanged; only the last few pixels before the
//! node boundary move. What *does* change is where that descent happens: `stub.x` is now
//! `port_stub_length` outside a vertical face rather than inside the node's own width, so the
//! descent lives in the gap between the node and its rank neighbour. That gap is Phase 6's corridor,
//! and [`face_clearance`] refuses a side face unless the corridor is at least
//! [`SIDE_FACE_CLEARANCE_FACTOR`] stub lengths wide — which is what keeps the descent out of the
//! neighbour's interior and the "no edge-node penetration" invariant intact.

use super::lane_router::pass_x;
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

/// Candidate faces for a chain's **source** end, best-guess first.
///
/// The order is the final tie-break of the side score, so it decides only genuine ties. It leads
/// with the rank-flow face because a tie means "the geometry does not care", and when the geometry
/// does not care a hierarchy should read top-to-bottom.
const SOURCE_CANDIDATES: [Side; 4] = [Side::Bottom, Side::Right, Side::Left, Side::Top];

/// Candidate faces for a chain's **target** end, best-guess first. Mirror of
/// [`SOURCE_CANDIDATES`].
const TARGET_CANDIDATES: [Side; 4] = [Side::Top, Side::Right, Side::Left, Side::Bottom];

/// How many stub lengths of clearance a vertical face needs before a port may attach to it.
///
/// A port on a `Left`/`Right` face makes Step 5.2 descend at `port_stub_length` outside that face,
/// so the whole departure — the horizontal stub *and* the vertical run down to the channel — lives
/// in the gap between this node and its rank neighbour. One stub length would put the descent
/// exactly on the neighbour's boundary; requiring twice that keeps it clear of the neighbour by as
/// much again, which is the margin that makes "no edge-node penetration" hold by construction
/// rather than by luck.
const SIDE_FACE_CLEARANCE_FACTOR: f64 = 2.0;

/// Pixels of extra path length that cost as much as one unit of `flow_side_bias`.
///
/// This is what makes `(flow_penalty + length / LENGTH_PER_FLOW_UNIT)` a single comparable number:
/// at the default bias of 1.0 an off-flow face has to save a kilopixel before it outranks the flow
/// face on an otherwise equal-bend candidate, which in practice means side faces are chosen only
/// when they strictly *reduce* the bend count.
const LENGTH_PER_FLOW_UNIT: f64 = 1000.0;

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
    /// Where along its face this port would sit if it were the only one there: the centre of the
    /// adjacent chain item, projected onto the face's axis (x for `Top`/`Bottom`, y otherwise).
    ///
    /// This is a *want*, not a position — [`place_by_affinity`] reconciles all the wants on one face
    /// against the sorted order and `port_pitch`. Aiming at the neighbour's centre rather than at its
    /// port keeps the two ends of an edge from chasing each other.
    desired: f64,
    /// True when this slot is the chain's source end.
    is_source: bool,
}

/// Where a materialised port lives: `(node * 4 + side_index, position along that face)`.
type SlotAddress = (usize, usize);

/// Assigns a source and target port to every chain edge and every flat edge.
///
/// Contract subtleties a caller could get wrong:
/// - The returned points are in the **internal top-down frame** and are final; nothing downstream
///   may move a node to make a port fit.
/// - `stub` is exactly `config.port_stub_length` along the side's outward normal, so a router can
///   emit `point -> stub` as its first segment without re-deriving the direction. This holds for
///   side faces too, which is why a side port's descent x is `stub.x` and why [`face_clearance`]
///   has to vet the gap it lands in.
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

    let plan = plan_chain_sides(layered, ir, config);

    // `slots[node * 4 + side_index(side)]` — a dense Vec, so collection order is graph order and
    // never depends on hashing.
    let mut slots: Vec<Vec<PortSlot>> = vec![Vec::new(); node_count * 4];

    for (chain_index, chain) in layered.chains.iter().enumerate() {
        if chain.items.len() < 2 {
            continue;
        }
        let last = chain.items.len() - 1;
        let (source_side, target_side) = plan
            .get(chain_index)
            .copied()
            .unwrap_or((Side::Bottom, Side::Top));

        // Source face, keyed by the order of the item in rank r + 1.
        if let (Some(node), Some(next)) = (
            real_node_of(layered, chain.items[0]),
            layered.items.get(chain.items[1] as usize),
        ) {
            if let Some(list) = slots.get_mut(node as usize * 4 + side_index(source_side)) {
                list.push(PortSlot {
                    edge: chain.edge,
                    order_key: next.order as u32,
                    y_key: next.center_y(),
                    desired: face_axis_target(next, source_side, config),
                    is_source: true,
                });
            }
        }

        // Target face, keyed by the order of the item in rank r - 1.
        if let (Some(node), Some(prev)) = (
            real_node_of(layered, chain.items[last]),
            layered.items.get(chain.items[last - 1] as usize),
        ) {
            if let Some(list) = slots.get_mut(node as usize * 4 + side_index(target_side)) {
                list.push(PortSlot {
                    edge: chain.edge,
                    order_key: prev.order as u32,
                    y_key: prev.center_y(),
                    desired: face_axis_target(prev, target_side, config),
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

        let source_side = flat_source_side(from, to);
        let target_side = source_side.opposite();

        if let Some(list) = slots.get_mut(from_node as usize * 4 + side_index(source_side)) {
            list.push(PortSlot {
                edge: flat.edge,
                order_key: 0,
                y_key: to.y,
                desired: face_axis_target(to, source_side, config),
                is_source: true,
            });
        }
        if let Some(list) = slots.get_mut(to_node as usize * 4 + side_index(target_side)) {
            list.push(PortSlot {
                edge: flat.edge,
                order_key: 0,
                y_key: from.y,
                desired: face_axis_target(from, target_side, config),
                is_source: false,
            });
        }
    }

    // ---- distribute along each face ------------------------------------------------------------
    let mut node_rects: Vec<Option<Rect>> = vec![None; node_count];
    // Absolute coordinate of each port along its face: x for `Top`/`Bottom`, y for `Left`/`Right`.
    let mut positions: Vec<Vec<f64>> = vec![Vec::new(); node_count * 4];

    for node in 0..node_count {
        let Some(item) = layered
            .item_of_node
            .get(node)
            .and_then(|&ix| layered.items.get(ix as usize))
        else {
            continue;
        };
        let rect = item.rect();
        node_rects[node] = Some(rect);

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
            let origin = match side {
                Side::Top | Side::Bottom => rect.x,
                Side::Left | Side::Right => rect.y,
            };
            let even = || {
                let (pitch, base) = port_spacing(side_length, list.len(), config);
                (0..list.len())
                    .map(|i| {
                        origin + (base + (i as f64 + 1.0) * pitch).clamp(0.0, side_length.max(0.0))
                    })
                    .collect::<Vec<f64>>()
            };
            positions[node * 4 + si] = if config.port_destination_affinity {
                place_by_affinity(list, origin, side_length, config).unwrap_or_else(even)
            } else {
                even()
            };
        }
    }

    // ---- straight-shot alignment ---------------------------------------------------------------
    if config.straight_shot_alignment {
        let mut locate: Vec<Option<SlotAddress>> = vec![None; ir.edge_count() * 2];
        for (face, list) in slots.iter().enumerate() {
            for (i, slot) in list.iter().enumerate() {
                let key = slot.edge as usize * 2 + usize::from(!slot.is_source);
                if let Some(cell) = locate.get_mut(key) {
                    *cell = Some((face, i));
                }
            }
        }
        apply_straight_shot_alignment(
            layered,
            ir,
            &plan,
            &locate,
            &node_rects,
            &mut positions,
            config,
        );
    }

    // ---- materialise ---------------------------------------------------------------------------
    for node in 0..node_count {
        let Some(rect) = node_rects.get(node).copied().flatten() else {
            continue;
        };
        let Some(node_id) = ir.node_names.get(node) else {
            continue;
        };
        for (si, side) in SIDES.iter().copied().enumerate() {
            let Some(list) = slots.get(node * 4 + si) else {
                continue;
            };
            for (i, slot) in list.iter().enumerate() {
                let Some(coord) = positions
                    .get(node * 4 + si)
                    .and_then(|face| face.get(i))
                    .copied()
                else {
                    continue;
                };
                let port = make_port(node_id, side, i, &rect, coord, config);
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

// ------------------------------------------------------------------------------------------------
// 8a — side selection
// ------------------------------------------------------------------------------------------------

/// One end of a chain, as the side scorer sees it.
struct EndContext {
    node: u32,
    item_index: u32,
    /// Channel this end's first (or last) link runs through, indexed like `demand.channel_lanes`.
    channel: usize,
    /// Box of the endpoint node itself.
    rect: Rect,
    /// The x at which the route will traverse the adjacent chain item — the one it reaches first
    /// (source end) or arrives from (target end). Taken from [`pass_x`] rather than the item's plain
    /// centre so a badge item under `BesideEdge` reports the line's x and not the badge's.
    hop_x: f64,
}

/// Chooses `(source_side, target_side)` for every chain, indexed by chain index.
///
/// With `flexible_port_sides` off this is the v2 table and nothing is scored. With it on, chains are
/// visited in ascending **edge index** — not `layered.chains` order — so that the congestion term,
/// which depends on what earlier edges claimed, is a function of the graph alone and not of how
/// Phase 4 happened to emit chains.
///
/// Flat edges claim their faces first. A flat edge has no side choice (Step 5.3 routes it through
/// the corridor between its endpoints), so letting a chain edge take a vertical face a flat edge
/// needs would be trading a free decision for a forced one.
fn plan_chain_sides(
    layered: &Layered,
    ir: &GraphIr,
    config: &CustomLayoutConfig,
) -> Vec<(Side, Side)> {
    let mut plan = vec![(Side::Bottom, Side::Top); layered.chains.len()];
    let node_count = ir.node_count();
    if !config.flexible_port_sides || node_count == 0 {
        return plan;
    }

    let mut used = vec![0usize; node_count * 4];
    // Channel runs already committed by earlier edges, indexed by channel. Only the *unavoidable*
    // part of a conflict is scored -- see `residual_crossings`.
    let mut committed: Vec<Vec<(f64, f64)>> = vec![Vec::new(); layered.rank_count()];

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
            continue;
        }
        let source_side = flat_source_side(from, to);
        claim_face(&mut used, from_node, source_side);
        claim_face(&mut used, to_node, source_side.opposite());
    }

    let mut order: Vec<(u32, usize)> = Vec::with_capacity(layered.chains.len());
    for (chain_index, chain) in layered.chains.iter().enumerate() {
        if chain.items.len() >= 2 {
            order.push((chain.edge, chain_index));
        }
    }
    order.sort_unstable();

    for (_, chain_index) in order {
        let Some(chain) = layered.chains.get(chain_index) else {
            continue;
        };
        let last = chain.items.len() - 1;
        let (Some(source_node), Some(target_node)) = (
            real_node_of(layered, chain.items[0]),
            real_node_of(layered, chain.items[last]),
        ) else {
            continue;
        };
        let (Some(source_item), Some(target_item)) = (
            layered.items.get(chain.items[0] as usize),
            layered.items.get(chain.items[last] as usize),
        ) else {
            continue;
        };
        let (Some(source_hop), Some(target_hop)) = (
            layered.items.get(chain.items[1] as usize),
            layered.items.get(chain.items[last - 1] as usize),
        ) else {
            continue;
        };

        let source = EndContext {
            node: source_node,
            item_index: chain.items[0],
            channel: source_item.rank as usize,
            rect: source_item.rect(),
            hop_x: pass_x(source_hop, config),
        };
        let target = EndContext {
            node: target_node,
            item_index: chain.items[last],
            channel: (target_item.rank as usize).saturating_sub(1),
            rect: target_item.rect(),
            hop_x: pass_x(target_hop, config),
        };

        let choice = best_side_pair(
            &source,
            &target,
            last == 1,
            layered,
            &used,
            &committed,
            config,
        );
        if let Some(cell) = plan.get_mut(chain_index) {
            *cell = choice;
        }
        claim_face(&mut used, source_node, choice.0);
        claim_face(&mut used, target_node, choice.1);
        commit_runs(&mut committed, &source, &target, choice, last == 1, config);
    }

    plan
}

/// Scores the sixteen `(source_side, target_side)` combinations and returns the cheapest.
///
/// The cost is closed form — evaluated, not searched — and ranked lexicographically by:
///
/// 1. **`bends`**: corners the lane router will actually emit at the two ends. A route leaves one
///    end's face, drops to the channel, runs horizontally and rises to the other end; that
///    horizontal run costs two corners and vanishes when the two ends can agree on one x. So a
///    candidate scores 0 when the `Top`/`Bottom` face's port range overlaps the other end's, and 2
///    when it cannot. Multi-rank chains score their two ends independently, because their ends sit
///    in different channels and never have to agree with each other.
/// 2. **`residual`**: crossings against the runs already committed in the same channel that *no*
///    lane ordering could remove — see [`residual_crossings`]. Step 5.7 deletes every crossing the
///    lane order can reach, so the only thing left for the side choice to influence is what it
///    cannot, and scoring anything else here would be double-counting. This is the key that makes
///    an edge arrive on a node's side rather than its top when the top approach would have to cut
///    across something.
/// 3. **`flow_penalty + length / 1000`**: `flow_side_bias` per end that is not on the rank-flow
///    face, plus the Manhattan distance between the two candidate attachment points. This is where
///    "keep the hierarchy readable" is priced against "take the shorter path".
/// 4. **`congestion`**: ports already claimed on the two faces, so a fan-out spreads instead of
///    piling onto one face once the first two keys stop discriminating.
/// 5. **Candidate order** ([`SOURCE_CANDIDATES`] x [`TARGET_CANDIDATES`]), which makes the choice
///    total and therefore byte-identical across processes.
///
/// Bends outrank crossings deliberately. A crossing is one intersection; a needless corner is a
/// permanent kink in the line, and the two complaints that produced this scorer -- "unnecessary
/// cornering" and "edges cutting each other" -- are not worth the same. Anything that reorders
/// these two keys should be measured against `cargo run --example audit` before it ships.
///
/// Infeasible combinations are skipped rather than scored (see [`face_is_feasible`]); `(Bottom,
/// Top)` is always feasible, so the fallback at the end is unreachable on well-formed input and is
/// there only to keep the function total.
#[allow(clippy::too_many_arguments)]
fn best_side_pair(
    source: &EndContext,
    target: &EndContext,
    single_link: bool,
    layered: &Layered,
    used: &[usize],
    committed: &[Vec<(f64, f64)>],
    config: &CustomLayoutConfig,
) -> (Side, Side) {
    let pad = config.port_endpoint_padding.max(0.0);
    let stub = config.port_stub_length.max(0.0);
    let bias = config.flow_side_bias;

    let mut best: Option<(u32, f64, usize)> = None;
    let mut best_pair = (Side::Bottom, Side::Top);

    for source_side in SOURCE_CANDIDATES {
        if !face_is_feasible(source_side, true, source, layered, used, config) {
            continue;
        }
        let source_span = drop_span(&source.rect, source_side, pad, stub);
        let source_point = face_point(&source.rect, source_side, target.rect.center(), pad);

        for target_side in TARGET_CANDIDATES {
            if !face_is_feasible(target_side, false, target, layered, used, config) {
                continue;
            }
            let target_span = drop_span(&target.rect, target_side, pad, stub);
            let target_point = face_point(&target.rect, target_side, source.rect.center(), pad);

            let run_bends = if single_link {
                if spans_intersect(source_span, target_span) {
                    0
                } else {
                    2
                }
            } else {
                let head = if span_contains(source_span, source.hop_x) {
                    0
                } else {
                    2
                };
                let tail = if span_contains(target_span, target.hop_x) {
                    0
                } else {
                    2
                };
                head + tail
            };
            // Leaving a vertical face costs one turn the flow faces do not pay: the route steps out
            // horizontally to the stub before it can start descending, and that corner survives
            // even when the two ends agree on an x. Charging it explicitly is what makes
            // `flow_side_bias` a meaningful trade rather than a knob with no reachable effect.
            let bends = run_bends
                + u32::from(!is_flow_face(source_side, true))
                + u32::from(!is_flow_face(target_side, false));

            let off_flow = u32::from(!is_flow_face(source_side, true))
                + u32::from(!is_flow_face(target_side, false));
            let length = manhattan(source_point, target_point);
            // One weighted number rather than a second lexicographic key, so that `flow_side_bias`
            // can genuinely outweigh a corner. Lexicographic keys made it unreachable: a horizontal
            // face has a whole interval to drop from and a vertical face has a single point, so the
            // horizontal face won the bend key essentially always and nothing after it was ever
            // consulted.
            let weighted = bends as f64 + bias * off_flow as f64 + length / LENGTH_PER_FLOW_UNIT;
            let congestion = face_usage(used, source.node, source_side)
                + face_usage(used, target.node, target_side);

            let (source_run, target_run) = candidate_runs(
                source,
                target,
                (source_side, target_side),
                single_link,
                config,
            );
            let mut residual = residual_crossings(committed, source.channel, source_run);
            if let Some(run) = target_run {
                residual += residual_crossings(committed, target.channel, run);
            }

            // Strictly-less, so the first candidate of an exact tie wins and the enumeration order
            // is the documented final key.
            let better = match best {
                None => true,
                Some((b_residual, b_weighted, b_congestion)) => {
                    residual
                        .cmp(&b_residual)
                        .then_with(|| weighted.total_cmp(&b_weighted))
                        .then_with(|| congestion.cmp(&b_congestion))
                        == std::cmp::Ordering::Less
                }
            };
            if better {
                best = Some((residual, weighted, congestion));
                best_pair = (source_side, target_side);
            }
        }
    }

    best_pair
}

/// True when `side` is the face the rank flow naturally uses at this end.
fn is_flow_face(side: Side, is_source: bool) -> bool {
    if is_source {
        side == Side::Bottom
    } else {
        side == Side::Top
    }
}

/// The channel run each end of a chain would make under a candidate side pair.
///
/// The source end always produces one; the target end produces one only for a multi-link chain,
/// because a single-link chain has just one run and both ends share it.
///
/// These are *estimates*, and deliberately so: the exact drop x of a horizontal face is not settled
/// until [`place_by_affinity`] has reconciled every port on it, which cannot happen before the sides
/// are chosen. A vertical face is exact ([`fixed_drop_x`]); a horizontal face is quoted at the point
/// it would take if it were free to slide, which is the same best case [`face_point`] reports for
/// the length term.
fn candidate_runs(
    source: &EndContext,
    target: &EndContext,
    sides: (Side, Side),
    single_link: bool,
    config: &CustomLayoutConfig,
) -> ((f64, f64), Option<(f64, f64)>) {
    let pad = config.port_endpoint_padding.max(0.0);
    let stub = config.port_stub_length.max(0.0);

    let source_drop = drop_x_estimate(&source.rect, sides.0, source.hop_x, pad, stub);
    if single_link {
        let target_drop = drop_x_estimate(&target.rect, sides.1, target.hop_x, pad, stub);
        return ((source_drop, target_drop), None);
    }
    let target_drop = drop_x_estimate(&target.rect, sides.1, target.hop_x, pad, stub);
    (
        (source_drop, source.hop_x),
        Some((target.hop_x, target_drop)),
    )
}

/// x at which a port on `side` would enter the channel, sliding toward `toward` where it can.
fn drop_x_estimate(rect: &Rect, side: Side, toward: f64, pad: f64, stub: f64) -> f64 {
    match side {
        Side::Right => rect.right() + stub,
        Side::Left => rect.x - stub,
        Side::Top | Side::Bottom => {
            let (lo, hi) = padded_range(rect.x, rect.right(), pad);
            clamp_finite(toward, lo, hi)
        }
    }
}

/// Crossings between `run` and the runs already committed in `channel` that no lane order can
/// remove.
///
/// Step 5.7 will choose the depth order, and it removes every crossing that choice can reach. What
/// survives is the pairwise minimum: the cost of putting `a` above `b` versus `b` above `a`,
/// whichever is smaller. Scoring the raw conflict count here instead would charge the side choice
/// for crossings the lane phase is about to delete, and push it into contortions for nothing.
///
/// Mirrors [`super::lane_order::pair_cost`]'s crossing half. The merge half is deliberately absent:
/// two runs meeting end-to-end are separable by ordering, so they are not residual.
fn residual_crossings(committed: &[Vec<(f64, f64)>], channel: usize, run: (f64, f64)) -> u32 {
    let Some(others) = committed.get(channel) else {
        return 0;
    };
    others
        .iter()
        .map(|&other| {
            let ab = u32::from(inside(other.0, run)) + u32::from(inside(run.1, other));
            let ba = u32::from(inside(run.0, other)) + u32::from(inside(other.1, run));
            ab.min(ba)
        })
        .sum()
}

fn inside(x: f64, run: (f64, f64)) -> bool {
    let (lo, hi) = (run.0.min(run.1), run.0.max(run.1));
    x > lo && x < hi
}

/// Records the runs a committed side choice produces, so later edges can score against them.
fn commit_runs(
    committed: &mut [Vec<(f64, f64)>],
    source: &EndContext,
    target: &EndContext,
    sides: (Side, Side),
    single_link: bool,
    config: &CustomLayoutConfig,
) {
    let (source_run, target_run) = candidate_runs(source, target, sides, single_link, config);
    if let Some(list) = committed.get_mut(source.channel) {
        list.push(source_run);
    }
    if let (Some(run), Some(list)) = (target_run, committed.get_mut(target.channel)) {
        list.push(run);
    }
}

/// How far outside its face the port at `index` on a vertical side reaches before descending.
///
/// Every port on one vertical face used to descend at the same x, which is why only one was ever
/// allowed there — a second would have run collinear with the first from its own y down to the
/// channel. Staggering the reach by `port_pitch` per port gives each its own descent line and is
/// what makes `side_face_capacity > 1` safe. [`face_is_feasible`] charges the extra reach against
/// the corridor before allowing the face, so the descents still land in the gap Phase 6 reserved.
fn side_stub_reach(index: usize, config: &CustomLayoutConfig) -> f64 {
    config.port_stub_length.max(0.0) + index as f64 * config.port_pitch.max(0.0)
}

/// True when a port may attach to `side` of this end.
///
/// Two rules, both of them about what Step 5.2 will draw:
///
/// - A source may not use `Top` and a target may not use `Bottom`. The router always descends from
///   the source into the channel below its rank and rises into the target from that same channel,
///   so a backward-facing stub would have to cross the node's own interior to get there.
/// - A vertical face may hold up to `side_face_capacity` ports, and needs clearance to its rank
///   neighbour for **all** of them: [`SIDE_FACE_CLEARANCE_FACTOR`] stub lengths for the first, plus
///   one [`CustomLayoutConfig::port_pitch`] for each further descent line
///   ([`side_stub_reach`]). Charging for the port about to be added rather than for the configured
///   capacity is what lets a node with one narrow-ish gap still use its side once.
fn face_is_feasible(
    side: Side,
    is_source: bool,
    end: &EndContext,
    layered: &Layered,
    used: &[usize],
    config: &CustomLayoutConfig,
) -> bool {
    match side {
        Side::Top => !is_source,
        Side::Bottom => is_source,
        Side::Left | Side::Right => {
            let taken = face_usage(used, end.node, side);
            if taken >= config.side_face_capacity.max(1) {
                return false;
            }
            let needed = SIDE_FACE_CLEARANCE_FACTOR * config.port_stub_length.max(0.0)
                + taken as f64 * config.port_pitch.max(0.0);
            face_clearance(layered, end.item_index, side) >= needed
        }
    }
}

/// Horizontal gap between an item and its rank neighbour on `side`, or infinity when there is none.
///
/// This is the space a side port's stub and its descent to the channel have to live in. Phase 6
/// guarantees the gap is at least `node_gap` wide, but `node_gap` is configurable and
/// `port_stub_length` is configurable independently, so the two can be set into conflict — which is
/// exactly the case this function exists to reject.
fn face_clearance(layered: &Layered, item_index: u32, side: Side) -> f64 {
    let Some(item) = layered.items.get(item_index as usize) else {
        return 0.0;
    };
    let neighbour_order = match side {
        Side::Right => item.order.checked_add(1),
        Side::Left => item.order.checked_sub(1),
        // A horizontal face has no rank neighbour in the order axis; the caller never asks.
        Side::Top | Side::Bottom => return f64::INFINITY,
    };
    let Some(order) = neighbour_order else {
        return f64::INFINITY;
    };
    let Some(neighbour) = item_at_order(layered, item.rank, order) else {
        return f64::INFINITY;
    };
    let gap = match side {
        Side::Right => neighbour.x - (item.x + item.width),
        _ => item.x - (neighbour.x + neighbour.width),
    };
    if gap.is_finite() {
        gap
    } else {
        0.0
    }
}

/// Item at a given `(rank, order)`.
///
/// Phase 5 permutes each rank slice in place, so `order` is the position within the slice and the
/// direct index is correct. The linear fallback covers an ordering implementation that assigns
/// `order` without permuting; it is never hit on a well-formed `Layered` and costs nothing there.
fn item_at_order(layered: &Layered, rank: u16, order: u16) -> Option<&Item> {
    let range = layered.rank_ranges.get(rank as usize)?;
    let start = (range.start as usize).min(layered.items.len());
    let end = (range.end as usize).clamp(start, layered.items.len());
    let slice = &layered.items[start..end];
    if let Some(item) = slice.get(order as usize) {
        if item.order == order {
            return Some(item);
        }
    }
    slice.iter().find(|item| item.order == order)
}

/// Side a flat edge leaves from. Items within a rank never overlap, so comparing left edges is the
/// same as comparing centres and is stable under differing widths.
fn flat_source_side(from: &Item, to: &Item) -> Side {
    if from.x <= to.x {
        Side::Right
    } else {
        Side::Left
    }
}

/// Interval of x at which a port on `side` can enter or leave the routing channel.
///
/// A `Top`/`Bottom` port drops straight down from wherever it sits along the face, so its interval
/// is the whole padded face. A `Left`/`Right` port drops at exactly one x — `port_stub_length`
/// outside the face — so its interval is a point. Two ends can share a channel x, and thereby skip
/// the horizontal run and its two corners, exactly when their intervals meet.
fn drop_span(rect: &Rect, side: Side, pad: f64, stub: f64) -> (f64, f64) {
    match side {
        Side::Top | Side::Bottom => padded_range(rect.x, rect.right(), pad),
        Side::Right => {
            let x = rect.right() + stub;
            (x, x)
        }
        Side::Left => {
            let x = rect.x - stub;
            (x, x)
        }
    }
}

/// Attachment point a port on `side` would take if it were free to slide toward `toward`.
///
/// Used only for the `length` term, so it is the *best case* for that face rather than the position
/// the distribution will actually produce.
fn face_point(rect: &Rect, side: Side, toward: Point, pad: f64) -> Point {
    match side {
        Side::Top | Side::Bottom => {
            let (lo, hi) = padded_range(rect.x, rect.right(), pad);
            Point {
                x: clamp_finite(toward.x, lo, hi),
                y: if side == Side::Top {
                    rect.y
                } else {
                    rect.bottom()
                },
            }
        }
        Side::Left | Side::Right => {
            let (lo, hi) = padded_range(rect.y, rect.bottom(), pad);
            Point {
                x: if side == Side::Left {
                    rect.x
                } else {
                    rect.right()
                },
                y: clamp_finite(toward.y, lo, hi),
            }
        }
    }
}

/// `[lo + pad, hi - pad]`, collapsed to the midpoint when the padding would invert it.
fn padded_range(lo: f64, hi: f64, pad: f64) -> (f64, f64) {
    let a = lo + pad;
    let b = hi - pad;
    if a <= b {
        (a, b)
    } else {
        let mid = (lo + hi) / 2.0;
        (mid, mid)
    }
}

/// `clamp` that cannot panic on a non-finite input and never returns NaN for a finite range.
fn clamp_finite(v: f64, lo: f64, hi: f64) -> f64 {
    if !v.is_finite() {
        return (lo + hi) / 2.0;
    }
    v.max(lo).min(hi)
}

fn spans_intersect(a: (f64, f64), b: (f64, f64)) -> bool {
    a.0 <= b.1 && b.0 <= a.1
}

fn span_contains(a: (f64, f64), x: f64) -> bool {
    a.0 <= x && x <= a.1
}

fn manhattan(a: Point, b: Point) -> f64 {
    (a.x - b.x).abs() + (a.y - b.y).abs()
}

fn face_usage(used: &[usize], node: u32, side: Side) -> usize {
    used.get(node as usize * 4 + side_index(side))
        .copied()
        .unwrap_or(0)
}

fn claim_face(used: &mut [usize], node: u32, side: Side) {
    if let Some(slot) = used.get_mut(node as usize * 4 + side_index(side)) {
        *slot += 1;
    }
}

// ------------------------------------------------------------------------------------------------
// 8c — straight-shot alignment
// ------------------------------------------------------------------------------------------------

/// Slides ports onto a common x so their edge becomes one straight segment.
///
/// The lane router draws every chain end as "drop from the port into the channel". Two ends that
/// drop at the same x need no horizontal run between them and therefore no corners, which is what
/// this pass buys.
///
/// A port on `Top`/`Bottom` is **free**: it drops wherever it sits along the face, so it can be
/// slid. A port on `Left`/`Right` is **fixed**: it drops exactly `port_stub_length` outside its
/// face and there is nothing to slide. So there are three cases, and the mixed one matters as much
/// as the symmetric one — [`best_side_pair`] only ever prefers a vertical face because it expects
/// the *other*, free end to come and meet it:
///
/// - both free: both move to a shared x between them,
/// - one free: the free end moves onto the fixed end's drop x,
/// - both fixed: nothing to do.
///
/// Chains are processed by descending `weight` then ascending edge index. Weight is the caller's
/// statement of which edges matter, and the ordering is total, so the result is byte-identical
/// across processes.
///
/// A snap is refused unless the port stays inside `[x + padding, x + width - padding]` **and** at
/// least `port_pitch` from the ports on either side of it. Those neighbours are what Phase 8b sorted
/// into a crossing-free order, so keeping the moved port strictly between them is what stops the
/// alignment from re-introducing the crossings the sort removed. A face already packed tighter than
/// `port_pitch` — which happens when Phase 0's width growth clamped at `max_node_width` — therefore
/// never straightens, because crowding it further is worse than a dog-leg.
///
/// Multi-rank chains straighten too, but only when every interior item is a `Dummy`: a `Label` item
/// is traversed at an x that depends on `label_placement`, and that rule belongs to Step 5.2 rather
/// than being worth duplicating here for an alignment that would rarely fire.
#[allow(clippy::too_many_arguments)]
fn apply_straight_shot_alignment(
    layered: &Layered,
    ir: &GraphIr,
    plan: &[(Side, Side)],
    locate: &[Option<SlotAddress>],
    node_rects: &[Option<Rect>],
    positions: &mut [Vec<f64>],
    config: &CustomLayoutConfig,
) {
    let pad = config.port_endpoint_padding.max(0.0);
    let pitch = config.port_pitch.max(0.0);

    let mut order: Vec<(usize, u32, f64)> = Vec::with_capacity(layered.chains.len());
    for (chain_index, chain) in layered.chains.iter().enumerate() {
        if chain.items.len() < 2 {
            continue;
        }
        let Some((source_side, target_side)) = plan.get(chain_index).copied() else {
            continue;
        };
        if !is_free_face(source_side) && !is_free_face(target_side) {
            continue;
        }
        let weight = ir
            .edges
            .get(chain.edge as usize)
            .map(|e| e.weight)
            .unwrap_or(1.0);
        order.push((chain_index, chain.edge, weight));
    }
    order.sort_by(|a, b| b.2.total_cmp(&a.2).then(a.1.cmp(&b.1)));

    for (chain_index, edge, _) in order {
        let Some(chain) = layered.chains.get(chain_index) else {
            continue;
        };
        let Some((source_side, target_side)) = plan.get(chain_index).copied() else {
            continue;
        };
        let last = chain.items.len() - 1;

        let (Some(&(source_face, source_slot)), Some(&(target_face, target_slot))) = (
            locate.get(edge as usize * 2).and_then(|cell| cell.as_ref()),
            locate
                .get(edge as usize * 2 + 1)
                .and_then(|cell| cell.as_ref()),
        ) else {
            continue;
        };
        let (Some(source_rect), Some(target_rect)) = (
            node_rects.get(source_face / 4).copied().flatten(),
            node_rects.get(target_face / 4).copied().flatten(),
        ) else {
            continue;
        };

        let source_span = slidable_range(
            positions.get(source_face),
            source_slot,
            &source_rect,
            pad,
            pitch,
        );
        let target_span = slidable_range(
            positions.get(target_face),
            target_slot,
            &target_rect,
            pad,
            pitch,
        );

        if last == 1 {
            match (is_free_face(source_side), is_free_face(target_side)) {
                (true, true) => {
                    let (Some(source_span), Some(target_span)) = (source_span, target_span) else {
                        continue;
                    };
                    let lo = source_span.0.max(target_span.0);
                    let hi = source_span.1.min(target_span.1);
                    if lo > hi {
                        continue;
                    }
                    let (Some(&from), Some(&to)) = (
                        positions
                            .get(source_face)
                            .and_then(|face| face.get(source_slot)),
                        positions
                            .get(target_face)
                            .and_then(|face| face.get(target_slot)),
                    ) else {
                        continue;
                    };
                    let x = clamp_finite((from + to) / 2.0, lo, hi);
                    set_position(positions, source_face, source_slot, x);
                    set_position(positions, target_face, target_slot, x);
                }
                (true, false) => {
                    let want = fixed_drop_x(&target_rect, target_side, target_slot, config);
                    if let (Some(span), Some(want)) = (source_span, want) {
                        if span_contains(span, want) {
                            set_position(positions, source_face, source_slot, want);
                        }
                    }
                }
                (false, true) => {
                    let want = fixed_drop_x(&source_rect, source_side, source_slot, config);
                    if let (Some(span), Some(want)) = (target_span, want) {
                        if span_contains(span, want) {
                            set_position(positions, target_face, target_slot, want);
                        }
                    }
                }
                (false, false) => {}
            }
        } else {
            let interior_is_dummy = chain.items[1..last].iter().all(|&ix| {
                layered
                    .items
                    .get(ix as usize)
                    .is_some_and(|item| item.kind.is_dummy())
            });
            if !interior_is_dummy {
                continue;
            }
            let (Some(head), Some(tail)) = (
                layered.items.get(chain.items[1] as usize),
                layered.items.get(chain.items[last - 1] as usize),
            ) else {
                continue;
            };
            if is_free_face(source_side) {
                if let Some(span) = source_span {
                    let head_x = head.center_x();
                    if span_contains(span, head_x) {
                        set_position(positions, source_face, source_slot, head_x);
                    }
                }
            }
            if is_free_face(target_side) {
                if let Some(span) = target_span {
                    let tail_x = tail.center_x();
                    if span_contains(span, tail_x) {
                        set_position(positions, target_face, target_slot, tail_x);
                    }
                }
            }
        }
    }
}

/// True when a port on `side` can be slid along its face without changing where it drops into the
/// channel — i.e. when the face is horizontal.
fn is_free_face(side: Side) -> bool {
    matches!(side, Side::Top | Side::Bottom)
}

/// The single x at which a port on a vertical face drops into the channel, or `None` for a
/// horizontal face, which has no single x.
///
/// `index` is the port's position along the face, because [`side_stub_reach`] staggers each further
/// port outward. A caller that passes the wrong index snaps the *other* end of the edge onto a line
/// nothing descends at, which turns a straight shot into a dog-leg with no bend saved.
fn fixed_drop_x(rect: &Rect, side: Side, index: usize, config: &CustomLayoutConfig) -> Option<f64> {
    let reach = side_stub_reach(index, config);
    match side {
        Side::Right => Some(rect.right() + reach),
        Side::Left => Some(rect.x - reach),
        Side::Top | Side::Bottom => None,
    }
}

/// Interval the port at `slot` may be slid into without leaving its node or crowding a neighbour.
///
/// `None` means there is no room at all: either the node is narrower than twice the endpoint
/// padding, or the face is already packed tighter than `port_pitch`.
fn slidable_range(
    face: Option<&Vec<f64>>,
    slot: usize,
    rect: &Rect,
    pad: f64,
    pitch: f64,
) -> Option<(f64, f64)> {
    let face = face?;
    if slot >= face.len() {
        return None;
    }
    let mut lo = rect.x + pad;
    let mut hi = rect.right() - pad;
    if slot > 0 {
        lo = lo.max(face[slot - 1] + pitch);
    }
    if slot + 1 < face.len() {
        hi = hi.min(face[slot + 1] - pitch);
    }
    if lo.is_finite() && hi.is_finite() && lo <= hi {
        Some((lo, hi))
    } else {
        None
    }
}

fn set_position(positions: &mut [Vec<f64>], face: usize, slot: usize, value: f64) {
    if let Some(cell) = positions.get_mut(face).and_then(|face| face.get_mut(slot)) {
        *cell = value;
    }
}

// ------------------------------------------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------------------------------------------

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

/// Where along a `side` face's axis the adjacent item wants this port to sit.
///
/// For a horizontal face this is [`pass_x`] — the x at which Step 5.2 will actually traverse that
/// item — rather than its plain centre. The two differ for a badge under `BesideEdge`, where the
/// item is double width and the line runs down the reserved left half; aiming at the centre there
/// would pull the port toward the badge instead of toward the line.
fn face_axis_target(item: &Item, side: Side, config: &CustomLayoutConfig) -> f64 {
    match side {
        Side::Top | Side::Bottom => pass_x(item, config),
        Side::Left | Side::Right => item.center_y(),
    }
}

/// Places the ports of one face as near their wants as the order and the pitch allow.
///
/// Even distribution treats a face as a row of identical pigeonholes, which is exactly wrong for
/// routing: it puts a port at the far end of a node from the thing it connects to, and the channel
/// run then has to travel back. That run is what other edges' drops cut, so a longer one is not just
/// uglier but measurably more crossings.
///
/// ## Why this is a projection and not a heuristic
///
/// The wants are already in the crossing-free order the caller sorted them into, and the constraint
/// is that consecutive ports stay `pitch` apart inside `[lo, hi]`. Substituting `q_i = p_i - i*pitch`
/// turns "at least `pitch` apart" into plain "non-decreasing", so the problem becomes: find the
/// non-decreasing sequence closest to the shifted wants. That is isotonic regression, and
/// [`pool_adjacent_violators`] solves it exactly in one pass. So this is the *optimal* placement for
/// the given order, not an approximation of one — and because the result is monotone in the input
/// index, it cannot reorder the ports and undo the sort that made the attachment crossing-free.
///
/// Returns `None` when the face is too crowded to hold the run at [`CROWDED_MIN_PITCH`], which
/// hands the caller back to [`port_spacing`]'s crowded branch rather than piling every port on one
/// point.
fn place_by_affinity(
    slots: &[PortSlot],
    origin: f64,
    side_length: f64,
    config: &CustomLayoutConfig,
) -> Option<Vec<f64>> {
    let n = slots.len();
    if n == 0 || !side_length.is_finite() {
        return None;
    }
    let pad = config.port_endpoint_padding.max(0.0);
    let lo = origin + pad;
    let hi = origin + side_length - pad;
    let span = hi - lo;
    if !span.is_finite() || span < 0.0 {
        return None;
    }

    // Room for the ideal pitch, else the widest that fits, else give up to the crowded branch.
    let gaps = n.saturating_sub(1) as f64;
    let pitch = if gaps > 0.0 {
        let widest = span / gaps;
        if widest < CROWDED_MIN_PITCH {
            return None;
        }
        config.port_pitch.max(0.0).min(widest)
    } else {
        0.0
    };

    let midpoint = (lo + hi) / 2.0;
    let shifted: Vec<f64> = slots
        .iter()
        .enumerate()
        .map(|(i, slot)| {
            let want = if slot.desired.is_finite() {
                slot.desired
            } else {
                midpoint
            };
            want - i as f64 * pitch
        })
        .collect();

    let fitted = pool_adjacent_violators(&shifted);
    // The whole run has to fit, so the first port's ceiling is `hi` minus the run's own length.
    // Clamping a non-decreasing sequence into an interval leaves it non-decreasing, so the pitch
    // guarantee survives this step.
    let ceiling = (hi - gaps * pitch).max(lo);
    Some(
        fitted
            .iter()
            .enumerate()
            .map(|(i, &q)| clamp_finite(q, lo, ceiling) + i as f64 * pitch)
            .collect(),
    )
}

/// The non-decreasing sequence minimising the squared distance to `values` — the classic
/// pool-adjacent-violators algorithm, linear in the input.
///
/// Each block holds a mean and the number of original entries it covers. A new value is pushed as
/// its own block; while the last two blocks are out of order they are merged into their weighted
/// mean, which is the least-squares fit for a block forced to one level. The merge cannot cascade
/// more than once per input overall, so the loop is amortised O(1) per element.
fn pool_adjacent_violators(values: &[f64]) -> Vec<f64> {
    let mut level: Vec<f64> = Vec::with_capacity(values.len());
    let mut weight: Vec<f64> = Vec::with_capacity(values.len());
    for &v in values {
        level.push(v);
        weight.push(1.0);
        while level.len() >= 2 && level[level.len() - 2] > level[level.len() - 1] {
            let (v_hi, w_hi) = (level.pop().unwrap_or(0.0), weight.pop().unwrap_or(1.0));
            let (v_lo, w_lo) = (level.pop().unwrap_or(0.0), weight.pop().unwrap_or(1.0));
            let total = w_lo + w_hi;
            level.push((v_lo * w_lo + v_hi * w_hi) / total);
            weight.push(total);
        }
    }
    let mut out: Vec<f64> = Vec::with_capacity(values.len());
    for (&value, &count) in level.iter().zip(weight.iter()) {
        for _ in 0..(count as usize) {
            out.push(value);
        }
    }
    out
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

/// Materialises a port at `coord` along `side`, where `coord` is an **absolute** coordinate on the
/// face's axis: x for `Top`/`Bottom`, y for `Left`/`Right`.
fn make_port(
    node_id: &str,
    side: Side,
    index: usize,
    rect: &Rect,
    coord: f64,
    config: &CustomLayoutConfig,
) -> PortRef {
    // A horizontal face gives every port its own x already, so its stub is a plain outward step.
    // A vertical face does not: the descent line is the stub's x, so the reach has to grow with the
    // index or two ports on one face would run collinear.
    let stub_length = match side {
        Side::Top | Side::Bottom => config.port_stub_length,
        Side::Left | Side::Right => side_stub_reach(index, config),
    };
    let point = match side {
        Side::Top => Point {
            x: coord,
            y: rect.y,
        },
        Side::Bottom => Point {
            x: coord,
            y: rect.bottom(),
        },
        Side::Left => Point {
            x: rect.x,
            y: coord,
        },
        Side::Right => Point {
            x: rect.right(),
            y: coord,
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

    /// The v2 fixed-table baseline: sides come from the table and no port is ever moved from where
    /// even distribution puts it. Tests that pin the exact spacing formula use this, because every
    /// feature added since is allowed to move ports.
    fn classic_cfg() -> CustomLayoutConfig {
        CustomLayoutConfig {
            flexible_port_sides: false,
            straight_shot_alignment: false,
            port_destination_affinity: false,
            ..CustomLayoutConfig::default()
        }
    }

    /// A config that asks for side attachment despite its corner cost — the aesthetic opt-in
    /// `flow_side_bias` exists for. `-2.0` is comfortably past the one-corner threshold.
    fn side_seeking_cfg() -> CustomLayoutConfig {
        CustomLayoutConfig {
            flow_side_bias: -2.0,
            ..CustomLayoutConfig::default()
        }
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

    /// A single adjacent-rank edge between two boxes the caller places.
    fn one_hop(source: Rect, target: Rect) -> (Layered, GraphIr) {
        let ir = mk_ir(2, &[(0, 1)]);
        let layered = Layered {
            items: vec![
                mk_item(
                    ItemKind::Real(0),
                    0,
                    0,
                    source.x,
                    source.y,
                    source.width,
                    source.height,
                ),
                mk_item(
                    ItemKind::Real(1),
                    1,
                    0,
                    target.x,
                    target.y,
                    target.width,
                    target.height,
                ),
            ],
            rank_ranges: ranks(&[1, 1]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![chain(0, vec![0, 1])],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 1],
        };
        (layered, ir)
    }

    fn rect(x: f64, y: f64, w: f64, h: f64) -> Rect {
        Rect {
            x,
            y,
            width: w,
            height: h,
        }
    }

    // ---- v2 baseline ---------------------------------------------------------------------------

    #[test]
    fn bottom_port_order_follows_target_item_order() {
        let (layered, ir) = fan_out();
        let ports = assign_ports(&layered, &ir, &classic_cfg());

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
        let config = classic_cfg();
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
        let config = classic_cfg();
        let ports = assign_ports(&layered, &ir, &config);

        let pitch = (300.0 - 2.0 * config.port_endpoint_padding) / 4.0;
        let expect = |i: usize| config.port_endpoint_padding + (i as f64 + 1.0) * pitch;

        assert!((ports.source[&1].point.x - expect(0)).abs() < 1e-9);
        assert!((ports.source[&2].point.x - expect(1)).abs() < 1e-9);
        assert!((ports.source[&0].point.x - expect(2)).abs() < 1e-9);
    }

    // ---------------------------------------------------------------------------------------
    // Destination affinity
    // ---------------------------------------------------------------------------------------

    #[test]
    fn affinity_moves_each_port_toward_the_child_it_serves() {
        let (layered, ir) = fan_out();
        // Children sit at x = 0..100, 150..250 and 300..400 under a source spanning 0..300, so
        // every port has somewhere distinct it would rather be.
        let even = assign_ports(&layered, &ir, &classic_cfg());
        let hugged = assign_ports(&layered, &ir, &cfg());

        // Edge 1 runs to the leftmost child (centre 50) and edge 0 to the rightmost (centre 350).
        let error =
            |ports: &PortTable, edge: u32, want: f64| (ports.source[&edge].point.x - want).abs();
        assert!(
            error(&hugged, 1, 50.0) < error(&even, 1, 50.0),
            "left child: {} should beat {}",
            error(&hugged, 1, 50.0),
            error(&even, 1, 50.0)
        );
        assert!(
            error(&hugged, 0, 350.0) < error(&even, 0, 350.0),
            "right child: {} should beat {}",
            error(&hugged, 0, 350.0),
            error(&even, 0, 350.0)
        );
    }

    #[test]
    fn affinity_keeps_the_sorted_order_and_the_pitch() {
        let (layered, ir) = fan_out();
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);

        // Same order the even distribution produced: sorted by the child's position, which is what
        // makes the attachment crossing-free. Affinity must not permute it.
        let mut xs = [
            ports.source[&1].point.x,
            ports.source[&2].point.x,
            ports.source[&0].point.x,
        ];
        assert!(xs[0] < xs[1] && xs[1] < xs[2], "{:?}", xs);
        for pair in xs.windows(2) {
            assert!(
                pair[1] - pair[0] >= config.port_pitch - 1e-9,
                "ports {:?} are closer than the pitch",
                pair
            );
        }
        // Everything stays on the face, inside the endpoint padding.
        xs.sort_by(f64::total_cmp);
        assert!(xs[0] >= config.port_endpoint_padding - 1e-9);
        assert!(xs[2] <= 300.0 - config.port_endpoint_padding + 1e-9);
    }

    #[test]
    fn a_face_too_crowded_for_the_floor_falls_back_to_even_spacing() {
        let config = cfg();
        let slots: Vec<PortSlot> = (0..200)
            .map(|_| PortSlot {
                edge: 0,
                order_key: 0,
                y_key: 0.0,
                desired: 60.0,
                is_source: true,
            })
            .collect();
        // 200 ports on a 120-wide face cannot hold `CROWDED_MIN_PITCH`, so affinity declines and
        // `port_spacing`'s crowded branch takes over rather than stacking every port on one x.
        assert!(place_by_affinity(&slots, 0.0, 120.0, &config).is_none());
        assert!(place_by_affinity(&slots[..3], 0.0, 120.0, &config).is_some());
    }

    #[test]
    fn pooling_violators_yields_the_nearest_non_decreasing_sequence() {
        // Already sorted: nothing to do.
        assert_eq!(
            pool_adjacent_violators(&[1.0, 2.0, 3.0]),
            vec![1.0, 2.0, 3.0]
        );
        // One inversion collapses to the block mean, which is the least-squares fit for a run
        // forced to a single level.
        assert_eq!(pool_adjacent_violators(&[5.0, 1.0]), vec![3.0, 3.0]);
        // A cascade: the merge of the last two blocks can violate the one before it.
        assert_eq!(
            pool_adjacent_violators(&[10.0, 20.0, 0.0]),
            vec![10.0, 10.0, 10.0]
        );
        assert!(pool_adjacent_violators(&[]).is_empty());
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

    // ---- geometric side selection --------------------------------------------------------------

    #[test]
    fn a_target_directly_below_keeps_the_flow_faces() {
        let (layered, ir) = one_hop(rect(0.0, 0.0, 120.0, 40.0), rect(0.0, 200.0, 120.0, 40.0));
        let ports = assign_ports(&layered, &ir, &cfg());
        assert_eq!(ports.source[&0].side, Side::Bottom);
        assert_eq!(ports.target[&0].side, Side::Top);
        // Nothing to align: both ports are already the only port on their face and share an x.
        assert_eq!(ports.source[&0].point.x, ports.target[&0].point.x);
    }

    #[test]
    fn a_sideways_target_at_a_shallow_rank_delta_uses_a_vertical_face() {
        // The source's padded bottom face spans [16, 104] and the target's left-face descent lands
        // at 110 - port_stub_length = 90, so `Bottom -> Left` shares one x and costs a single
        // corner, while `Bottom -> Top` cannot share any x at all ([16, 104] vs [126, 214]).
        //
        // `Right -> Top` scores identically here — the two boxes are the same width, so the mirror
        // shape saves exactly as much — and the candidate order breaks that tie in favour of
        // keeping the *source* on the rank-flow face, which is what preserves the top-down read.
        //
        // Needs a negative `flow_side_bias`. A vertical face always costs one corner more than a
        // flow face — the route must step out to its stub before it can descend — so at the default
        // bias the flow faces win here too, and asking for the side is a deliberate opt-in.
        let (layered, ir) = one_hop(rect(0.0, 0.0, 120.0, 40.0), rect(110.0, 120.0, 120.0, 40.0));

        let flexible = assign_ports(&layered, &ir, &side_seeking_cfg());
        assert_eq!(flexible.source[&0].side, Side::Bottom);
        assert_eq!(flexible.target[&0].side, Side::Left);
        assert_eq!(flexible.target[&0].point.x, 110.0);
        assert_eq!(flexible.target[&0].stub.x, 90.0);
        // And the alignment pass delivers what the side score promised: the free end slid onto the
        // fixed end's drop x, so the whole route is `down, right` — one corner.
        assert_eq!(flexible.source[&0].point.x, 90.0);
        assert!(flexible.source[&0].point.x >= cfg().port_endpoint_padding);
        assert!(flexible.source[&0].point.x <= 120.0 - cfg().port_endpoint_padding);

        let fixed = assign_ports(&layered, &ir, &classic_cfg());
        assert_eq!(fixed.source[&0].side, Side::Bottom);
        assert_eq!(fixed.target[&0].side, Side::Top);
    }

    #[test]
    fn a_fixed_departure_pulls_the_free_arrival_onto_its_drop_x() {
        // The target's left face is blocked by a rank neighbour 20px away, so the mirror choice
        // `Bottom -> Left` is unavailable and the source leaves through its own right face instead.
        // The alignment then has to bring the target's top port to the source's drop x of 140.
        let ir = mk_ir(3, &[(0, 1)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 120.0, 40.0),
                mk_item(ItemKind::Real(2), 1, 0, 0.0, 200.0, 90.0, 40.0),
                mk_item(ItemKind::Real(1), 1, 1, 110.0, 200.0, 120.0, 40.0),
            ],
            rank_ranges: ranks(&[1, 2]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![chain(0, vec![0, 2])],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 2, 1],
        };
        let ports = assign_ports(&layered, &ir, &side_seeking_cfg());
        assert_eq!(ports.source[&0].side, Side::Right);
        assert_eq!(ports.target[&0].side, Side::Top);
        assert_eq!(ports.source[&0].stub.x, 140.0);
        assert_eq!(ports.target[&0].point.x, 140.0);
    }

    #[test]
    fn a_crowded_rank_neighbour_forbids_the_vertical_face() {
        // Same shape as the test above, but every vertical face that would win now has a rank
        // neighbour less than two stub lengths away, so the descent has nowhere to go and the flow
        // faces must win instead.
        let ir = mk_ir(4, &[(0, 1)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 120.0, 40.0),
                mk_item(ItemKind::Real(2), 0, 1, 140.0, 0.0, 120.0, 40.0),
                mk_item(ItemKind::Real(3), 1, 0, 0.0, 120.0, 90.0, 40.0),
                mk_item(ItemKind::Real(1), 1, 1, 110.0, 120.0, 120.0, 40.0),
            ],
            rank_ranges: ranks(&[2, 2]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![chain(0, vec![0, 3])],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 3, 1, 2],
        };
        let ports = assign_ports(&layered, &ir, &cfg());
        assert_eq!(ports.source[&0].side, Side::Bottom);
        assert_eq!(ports.target[&0].side, Side::Top);
    }

    /// One source fanning out to `count` targets laid out left to right in rank 1, the source
    /// sitting above the middle one so that targets fall on both of its vertical faces.
    fn fan(count: usize) -> (Layered, GraphIr) {
        let edges: Vec<(u32, u32)> = (1..=count as u32).map(|t| (0, t)).collect();
        let ir = mk_ir(count + 1, &edges);
        let source_x = (count / 2) as f64 * 200.0;
        let mut items = vec![mk_item(ItemKind::Real(0), 0, 0, source_x, 0.0, 120.0, 40.0)];
        let mut item_of_node = vec![0u32];
        for t in 0..count {
            items.push(mk_item(
                ItemKind::Real(t as u32 + 1),
                1,
                t as u16,
                t as f64 * 200.0,
                200.0,
                120.0,
                40.0,
            ));
            item_of_node.push(t as u32 + 1);
        }
        let chains = (0..count)
            .map(|t| chain(t as u32, vec![0, t as u32 + 1]))
            .collect();
        let layered = Layered {
            items,
            rank_ranges: ranks(&[1, count as u32]),
            up: Default::default(),
            down: Default::default(),
            chains,
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node,
        };
        (layered, ir)
    }

    #[test]
    fn a_vertical_face_holds_no_more_ports_than_its_capacity() {
        let (layered, ir) = fan(6);
        for capacity in [1usize, 2, 3] {
            let config = CustomLayoutConfig {
                side_face_capacity: capacity,
                ..side_seeking_cfg()
            };
            let ports = assign_ports(&layered, &ir, &config);
            let count = |side: Side| (0..6u32).filter(|e| ports.source[e].side == side).count();
            assert!(count(Side::Right) <= capacity, "right, cap {capacity}");
            assert!(count(Side::Left) <= capacity, "left, cap {capacity}");
            // A source may never leave through its own top, whatever the capacity.
            assert_eq!(count(Side::Top), 0);
        }
    }

    #[test]
    fn every_port_on_one_vertical_face_gets_its_own_descent_line() {
        // This is the whole reason a vertical face may hold more than one port. The descent x is the
        // stub's x, so without the per-index stagger a second port would run collinear with the
        // first from its own y all the way down to the channel — two edges drawn as one.
        let (layered, ir) = fan(6);
        let config = CustomLayoutConfig {
            side_face_capacity: 3,
            ..side_seeking_cfg()
        };
        let ports = assign_ports(&layered, &ir, &config);

        for side in [Side::Left, Side::Right] {
            let mut drops: Vec<f64> = (0..6u32)
                .filter(|e| ports.source[e].side == side)
                .map(|e| ports.source[&e].stub.x)
                .collect();
            let claimed = drops.len();
            drops.sort_by(f64::total_cmp);
            drops.dedup_by(|a, b| (*a - *b).abs() < 1e-9);
            assert_eq!(drops.len(), claimed, "{side:?} reused a descent line");
            for pair in drops.windows(2) {
                assert!(
                    pair[1] - pair[0] >= config.port_pitch - 1e-9,
                    "{side:?} descent lines {pair:?} are closer than the pitch"
                );
            }
        }
    }

    /// Fan-out wide enough that every child is off to one side. With no flow bias the congestion
    /// term spreads the ports across faces; with a large bias every one of them stays on the flow
    /// face.
    fn wide_fan() -> (Layered, GraphIr) {
        let ir = mk_ir(4, &[(0, 1), (0, 2), (0, 3)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 200.0, 0.0, 120.0, 40.0),
                mk_item(ItemKind::Real(1), 1, 0, 0.0, 200.0, 120.0, 40.0),
                mk_item(ItemKind::Real(2), 1, 1, 200.0, 200.0, 120.0, 40.0),
                mk_item(ItemKind::Real(3), 1, 2, 400.0, 200.0, 120.0, 40.0),
            ],
            rank_ranges: ranks(&[1, 3]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![
                chain(0, vec![0, 1]),
                chain(1, vec![0, 2]),
                chain(2, vec![0, 3]),
            ],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 1, 2, 3],
        };
        (layered, ir)
    }

    #[test]
    fn a_negative_flow_bias_buys_side_faces_and_a_positive_one_refuses_them() {
        let (layered, ir) = wide_fan();
        let count_sides = |bias: f64| {
            let config = CustomLayoutConfig {
                flow_side_bias: bias,
                ..cfg()
            };
            let ports = assign_ports(&layered, &ir, &config);
            (0..3u32)
                .filter(|e| {
                    matches!(ports.source[e].side, Side::Left | Side::Right)
                        || matches!(ports.target[e].side, Side::Left | Side::Right)
                })
                .count()
        };

        // The sign is the switch, not the magnitude. A side attachment costs exactly one corner
        // more than a flow one, so nothing at or above zero can ever buy it — including zero, which
        // means "price the corner honestly and let geometry decide", and geometry decides against.
        assert_eq!(count_sides(10.0), 0);
        assert_eq!(count_sides(0.0), 0);
        assert!(
            count_sides(-2.0) > 0,
            "a negative bias must reach the sides"
        );
    }

    #[test]
    fn a_source_never_leaves_from_the_top_and_a_target_never_enters_from_the_bottom() {
        // Both flags on and a deliberately awkward geometry: the target is above-left of where the
        // flow faces point, which is exactly the shape that would tempt a backward stub.
        let (layered, ir) = one_hop(rect(400.0, 0.0, 120.0, 40.0), rect(0.0, 60.0, 120.0, 400.0));
        let mut config = cfg();
        config.flow_side_bias = 0.0;
        let ports = assign_ports(&layered, &ir, &config);
        assert_ne!(ports.source[&0].side, Side::Top);
        assert_ne!(ports.target[&0].side, Side::Bottom);
    }

    // ---- straight-shot alignment ---------------------------------------------------------------

    /// Source with two out-edges (so its bottom ports are off-centre) and two targets each with a
    /// single in-port at their own centre: the classic dog-leg the alignment exists to remove.
    fn dog_leg() -> (Layered, GraphIr) {
        let ir = mk_ir(3, &[(0, 1), (0, 2)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 300.0, 40.0),
                mk_item(ItemKind::Real(1), 1, 0, 20.0, 200.0, 120.0, 40.0),
                mk_item(ItemKind::Real(2), 1, 1, 180.0, 200.0, 120.0, 40.0),
            ],
            rank_ranges: ranks(&[1, 2]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![chain(0, vec![0, 1]), chain(1, vec![0, 2])],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 1, 2],
        };
        (layered, ir)
    }

    #[test]
    fn alignment_puts_both_ends_of_a_near_aligned_link_on_one_x() {
        let (layered, ir) = dog_leg();

        let unaligned = assign_ports(&layered, &ir, &classic_cfg());
        assert!(
            (unaligned.source[&0].point.x - unaligned.target[&0].point.x).abs() > 1e-6,
            "fixture must actually dog-leg"
        );

        let aligned = assign_ports(&layered, &ir, &cfg());
        for e in 0..2u32 {
            assert!(
                (aligned.source[&e].point.x - aligned.target[&e].point.x).abs() < 1e-9,
                "edge {} still dog-legs: {} vs {}",
                e,
                aligned.source[&e].point.x,
                aligned.target[&e].point.x
            );
        }
    }

    #[test]
    fn alignment_respects_port_pitch_and_the_node_box() {
        let (layered, ir) = dog_leg();
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);

        let mut bottom: Vec<f64> = (0..2u32).map(|e| ports.source[&e].point.x).collect();
        bottom.sort_by(f64::total_cmp);
        assert!(
            bottom[1] - bottom[0] >= config.port_pitch - 1e-9,
            "ports {:?} are closer than port_pitch",
            bottom
        );
        for x in bottom {
            assert!(x >= config.port_endpoint_padding - 1e-9);
            assert!(x <= 300.0 - config.port_endpoint_padding + 1e-9);
        }
        for e in 0..2u32 {
            let t = &ports.target[&e];
            let left = if e == 0 { 20.0 } else { 180.0 };
            assert!(t.point.x >= left + config.port_endpoint_padding - 1e-9);
            assert!(t.point.x <= left + 120.0 - config.port_endpoint_padding + 1e-9);
        }
    }

    #[test]
    fn alignment_refuses_a_snap_that_would_leave_the_node() {
        // The target is far to the right of the source's whole width, so no common x exists and
        // both ports must stay exactly where the distribution put them.
        let (layered, ir) = one_hop(rect(0.0, 0.0, 120.0, 40.0), rect(900.0, 200.0, 120.0, 40.0));
        let config = cfg();
        let ports = assign_ports(&layered, &ir, &config);
        let s = &ports.source[&0];
        let t = &ports.target[&0];
        assert!(s.point.x >= config.port_endpoint_padding - 1e-9);
        assert!(s.point.x <= 120.0 - config.port_endpoint_padding + 1e-9);
        assert!(t.point.x >= 900.0 + config.port_endpoint_padding - 1e-9);
        assert!(t.point.x <= 1020.0 - config.port_endpoint_padding + 1e-9);
    }

    /// A span-2 chain whose dummy sits at x = 100.5, plus a second out-edge that keeps the source's
    /// bottom ports off-centre so the alignment has something to correct.
    fn dummy_chain() -> (Layered, GraphIr) {
        let ir = mk_ir(3, &[(0, 1), (0, 2)]);
        let layered = Layered {
            items: vec![
                mk_item(ItemKind::Real(0), 0, 0, 0.0, 0.0, 300.0, 40.0),
                mk_item(
                    ItemKind::Dummy { edge: 0, seq: 0 },
                    1,
                    0,
                    100.0,
                    200.0,
                    1.0,
                    1.0,
                ),
                mk_item(ItemKind::Real(2), 1, 1, 400.0, 200.0, 120.0, 40.0),
                mk_item(ItemKind::Real(1), 2, 0, 60.0, 400.0, 120.0, 40.0),
            ],
            rank_ranges: ranks(&[1, 2, 1]),
            up: Default::default(),
            down: Default::default(),
            chains: vec![chain(0, vec![0, 1, 3]), chain(1, vec![0, 2])],
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: vec![0, 3, 2],
        };
        (layered, ir)
    }

    #[test]
    fn a_dummy_chain_pulls_both_end_ports_onto_the_dummy_x() {
        let (layered, ir) = dummy_chain();

        let unaligned = assign_ports(&layered, &ir, &classic_cfg());
        assert!(
            (unaligned.source[&0].point.x - 100.5).abs() > 1e-6,
            "fixture must actually start off the dummy's x"
        );

        let ports = assign_ports(&layered, &ir, &cfg());
        assert_eq!(ports.source[&0].side, Side::Bottom);
        assert_eq!(ports.target[&0].side, Side::Top);
        assert!((ports.source[&0].point.x - 100.5).abs() < 1e-9);
        assert!((ports.target[&0].point.x - 100.5).abs() < 1e-9);
    }

    #[test]
    fn a_label_carrying_chain_is_left_alone() {
        // Same shape as `dummy_chain`, but the interior item is a badge: where a chain crosses a
        // `Label` is Step 5.2's rule, so the alignment declines rather than guessing at it.
        //
        // Affinity is held off on both sides, because it does not decline — it asks `pass_x` where
        // the crossing will be and aims there, which is the same rule rather than a guess at it.
        // Leaving it on would test the two features at once and prove neither.
        let (mut layered, ir) = dummy_chain();
        layered.items[1].kind = ItemKind::Label(0);

        let straight_shot_only = CustomLayoutConfig {
            port_destination_affinity: false,
            ..cfg()
        };
        let aligned = assign_ports(&layered, &ir, &straight_shot_only);
        let plain = assign_ports(&layered, &ir, &classic_cfg());
        assert_eq!(aligned.source[&0].point.x, plain.source[&0].point.x);
        assert_eq!(aligned.target[&0].point.x, plain.target[&0].point.x);
    }

    #[test]
    fn alignment_order_is_stable_under_unequal_weights() {
        let (layered, mut ir) = dog_leg();
        ir.edges[1].weight = 9.0;

        let first = assign_ports(&layered, &ir, &cfg());
        for _ in 0..8 {
            let again = assign_ports(&layered, &ir, &cfg());
            for e in 0..2u32 {
                assert_eq!(
                    first.source[&e].point.x.to_bits(),
                    again.source[&e].point.x.to_bits()
                );
                assert_eq!(
                    first.target[&e].point.x.to_bits(),
                    again.target[&e].point.x.to_bits()
                );
            }
        }
        // The heavier edge went first and still got a straight shot.
        assert!((first.source[&1].point.x - first.target[&1].point.x).abs() < 1e-9);
    }

    // ---- determinism ---------------------------------------------------------------------------

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

    #[test]
    fn flexible_sides_and_alignment_are_byte_stable_across_runs() {
        let (layered, ir) = wide_fan();
        let mut config = cfg();
        config.flow_side_bias = 0.0;
        let first = assign_ports(&layered, &ir, &config);
        for _ in 0..8 {
            let again = assign_ports(&layered, &ir, &config);
            for e in 0..3u32 {
                assert_eq!(first.source[&e], again.source[&e]);
                assert_eq!(first.target[&e], again.target[&e]);
                assert_eq!(
                    first.source[&e].point.x.to_bits(),
                    again.source[&e].point.x.to_bits()
                );
            }
        }
    }
}
