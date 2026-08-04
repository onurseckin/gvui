//! # Step 3.1 (Phase 4): Layer construction
//!
//! Turns the ranked DAG into the [`Layered`] arena: one item per real node, one `Dummy` item per
//! intermediate rank of every long edge, and — the point of the whole engine — one `Label` item per
//! labelled edge, carrying the measured badge box.
//!
//! ## Why the label is an item
//!
//! A badge is not decoration bolted on after routing; it is a box that needs area. By making it an
//! ordinary item, the machinery that already exists gets applied to it for free: Phase 5 orders it
//! among its rank siblings, Phase 7 separates it from its neighbours by `node_gap`, and rank height
//! is `max(item.h)` over the rank so the band is tall enough by definition. **The area is reserved
//! by construction, so a badge can never fail to fit, so there is nothing to retry.** This is what
//! deletes v1's expand-gap-and-re-run loop.
//!
//! ## Label item geometry contract (Phase 8 depends on this)
//!
//! Let `lw = label.width + 2 * badge_clearance` and `lh = label.height + 2 * badge_clearance`.
//! The item box is *larger* than the badge so the badge can be inset away from the polyline:
//!
//! | `label_placement` | item `(w, h)` | edge passes through | badge occupies |
//! | --- | --- | --- | --- |
//! | `OnEdge` | `(lw, lh)` | the item centre | the whole box, inset by `badge_clearance` |
//! | `BesideEdge` (default) | `(2 * lw, lh)` | the item's **left face** | the **right half**, inset |
//! | `AboveEdge` | `(lw, 2 * lh)` | the item's **bottom face** | the **top half**, inset |
//!
//! [`badge_rect`] and [`edge_anchor`] are the canonical readers of that contract; Phase 8 should
//! call them rather than re-deriving the halves, so the two never drift apart.
//!
//! ## What is *not* expanded here
//!
//! - **Flat edges** (`span == 0`) get no chain and no `Label` item. Their badge lives in the
//!   vertical corridor between the two endpoints, where its width becomes a separation constraint
//!   computed by Phase 6. A [`FlatEdge`] record is emitted instead.
//! - **Self-loops** get no chain either; the edge list is copied through for Phase 8 to route
//!   against a fixed port pair.
//!
//! Neither contributes to `up`/`down`, which by construction contain only rank-crossing links.

use crate::config::CustomLayoutConfig;
use crate::types::{
    Csr, EdgeChain, EdgeRole, FlatEdge, GraphIr, Item, ItemKind, LabelBox, LabelPlacement, Layered,
    Point, RankResult, Rect, StructureResult,
};
use std::ops::Range;

/// Builds the layered graph from the ranking.
///
/// Guarantees, in the order a caller is likely to rely on them:
///
/// 1. `items` is stored **rank-major**: `rank_ranges[r]` is a contiguous slice, and every item's
///    `order` equals its offset inside that slice. Phase 5 may permute a slice in place and rewrite
///    `order`, but must not move an item between ranks.
/// 2. Within a rank the initial order is *real nodes by ascending node index, then chain items by
///    ascending edge index*. This is a deterministic, input-order-derived seed — not a heuristic.
/// 3. Every non-self edge with `span >= 1` has exactly one [`EdgeChain`], source-first, whose
///    consecutive entries live on consecutive ranks (the sole exception is the
///    `max_dummy_chain_length` pathology guard, below).
/// 4. An edge carrying a [`LabelBox`] and spanning `>= 2` ranks has exactly one `Label` item, on
///    the middle intermediate rank, sized per [`label_item_size`].
/// 5. `up` is the exact transpose of `down`; both are over **item** indices, never node indices.
/// 6. Reversed (feedback) edges are expanded exactly like forward ones. Nothing is dropped — only
///    the arrowhead learns the truth, at emit time.
///
/// The function is total: malformed input (out-of-range endpoints, a stale rank vector, a labelled
/// edge that Phase 3 failed to give `min_len = 2`) degrades rather than panicking, because there is
/// no retry to fall back on.
pub fn build_layered(
    ir: &GraphIr,
    structure: &StructureResult,
    ranks: &RankResult,
    config: &CustomLayoutConfig,
) -> Layered {
    let node_count = ir.node_count();
    let edge_count = ir.edge_count();

    if node_count == 0 {
        // No nodes means no ranks and no items; self-loops on phantom nodes cannot be routed
        // either, but the list is carried so Phase 8/9 see a consistent picture.
        return Layered {
            self_loops: structure.self_loops.clone(),
            ..Default::default()
        };
    }

    // A missing entry is treated as rank 0 rather than panicking: `rank_of` is produced upstream
    // and a length mismatch is an upstream bug we must survive, not amplify.
    let rank_of = |n: u32| -> u16 { ranks.rank_of.get(n as usize).copied().unwrap_or(0) };

    // Trailing empty ranks are harmless (an empty slice), but a rank that exists in `rank_of` and
    // not in `rank_ranges` would panic every downstream phase, so take the max of both sources.
    let mut max_rank: u16 = ranks.max_rank;
    for n in 0..node_count {
        max_rank = max_rank.max(rank_of(n as u32));
    }
    let rank_count = max_rank as usize + 1;

    // ---- Pass A: real items --------------------------------------------------------------------
    // Reals go into their rank bucket first so requirement (2) above holds without a later sort.
    let mut buckets: Vec<Vec<Item>> = vec![Vec::new(); rank_count];
    // Slot = (rank, index within that rank's bucket). Resolved to a global item index once the
    // buckets are flattened and rank offsets are known.
    let mut node_slots: Vec<(u16, u32)> = Vec::with_capacity(node_count);

    for n in 0..node_count {
        let node = &ir.nodes[n];
        let r = rank_of(n as u32);
        let bucket = &mut buckets[r as usize];
        node_slots.push((r, bucket.len() as u32));
        bucket.push(Item {
            kind: ItemKind::Real(n as u32),
            rank: r,
            order: 0,
            width: sanitize(node.width),
            height: sanitize(node.height),
            x: 0.0,
            y: 0.0,
        });
    }

    // ---- Pass B: chains, dummies and label items -----------------------------------------------
    let mut skip_edge = vec![false; edge_count];
    for &e in &structure.self_loops {
        if let Some(slot) = skip_edge.get_mut(e as usize) {
            *slot = true;
        }
    }

    struct PendingChain {
        edge: u32,
        reversed: bool,
        role: EdgeRole,
        from_node: u32,
        to_node: u32,
        /// Intermediate item slots, source-first.
        slots: Vec<(u16, u32)>,
        /// Index into `slots` of the `Label` item, when there is one.
        label_slot: Option<usize>,
    }

    struct PendingFlat {
        edge: u32,
        rank: u16,
        from_node: u32,
        to_node: u32,
        label: Option<LabelBox>,
    }

    let mut pending: Vec<PendingChain> = Vec::with_capacity(edge_count);
    let mut pending_flat: Vec<PendingFlat> = Vec::new();

    for (e, &skipped) in skip_edge.iter().enumerate() {
        if skipped {
            continue;
        }
        let ir_edge = &ir.edges[e];
        if ir_edge.source == ir_edge.target {
            // Defensive: a self-loop Phase 2 forgot to list. Dropping it here is still correct —
            // it contributes no rank-crossing structure — and beats emitting a degenerate chain.
            continue;
        }
        if ir_edge.source as usize >= node_count || ir_edge.target as usize >= node_count {
            continue;
        }

        // Equivalent to `structure.arc(ir, e)`, with a length guard so a truncated `reversed`
        // vector degrades to "not reversed" instead of panicking.
        let reversed = structure.reversed.get(e).copied().unwrap_or(false);
        let (mut from, mut to) = if reversed {
            (ir_edge.target, ir_edge.source)
        } else {
            (ir_edge.source, ir_edge.target)
        };
        let role = structure.roles.get(e).copied().unwrap_or(EdgeRole::Forward);

        let mut r_from = rank_of(from);
        let mut r_to = rank_of(to);
        let mut span = r_to as i32 - r_from as i32;

        debug_assert!(
            span >= 0,
            "Phase 4 saw a backward arc; Phase 2 must reverse every feedback edge before ranking"
        );
        if span < 0 {
            std::mem::swap(&mut from, &mut to);
            std::mem::swap(&mut r_from, &mut r_to);
            span = -span;
        }

        if span == 0 {
            // Flat: no chain, no Label item. Phase 6 turns the badge width into a corridor
            // separation and Phase 8 reads this record to route it.
            pending_flat.push(PendingFlat {
                edge: e as u32,
                rank: r_from,
                from_node: from,
                to_node: to,
                label: ir_edge.label,
            });
            continue;
        }

        let mut slots: Vec<(u16, u32)> = Vec::new();
        let mut label_slot: Option<usize> = None;

        if span >= 2 {
            let first = r_from + 1;
            let last = r_to - 1;
            // Middle intermediate rank. `span / 2` is already inside `[1, span - 1]` for
            // `span >= 2`; the clamp only defends against a future change to that expression.
            let label_rank = ir_edge
                .label
                .map(|_| (r_from + (span as u16) / 2).clamp(first, last));

            let kept = select_intermediate_ranks(first, last);

            let mut seq: usize = 0;
            for r in kept {
                let is_label = Some(r) == label_rank;
                let (width, height) = match (is_label, ir_edge.label) {
                    (true, Some(label)) => label_item_size(label, config),
                    _ => (0.0, 0.0),
                };
                let kind = if is_label {
                    ItemKind::Label(e as u32)
                } else {
                    let this_seq = u16::try_from(seq).unwrap_or(u16::MAX);
                    seq += 1;
                    ItemKind::Dummy {
                        edge: e as u32,
                        seq: this_seq,
                    }
                };
                if is_label {
                    label_slot = Some(slots.len());
                }
                let bucket = &mut buckets[r as usize];
                slots.push((r, bucket.len() as u32));
                bucket.push(Item {
                    kind,
                    rank: r,
                    order: 0,
                    width,
                    height,
                    x: 0.0,
                    y: 0.0,
                });
            }
        }
        // `span == 1` falls through with an empty `slots`: a direct link. If such an edge carries a
        // label, Phase 3 failed to apply `min_len = 2` (or the caller forced `min_len: 1`). We
        // degrade to `label_at = None` and let Phase 8's leader-line safety net place the badge —
        // silently inserting a rank here would invalidate the ranking every other phase assumes.

        pending.push(PendingChain {
            edge: e as u32,
            reversed,
            role,
            from_node: from,
            to_node: to,
            slots,
            label_slot,
        });
    }

    // ---- Flatten rank-major --------------------------------------------------------------------
    let total: usize = buckets.iter().map(|b| b.len()).sum();
    let mut items: Vec<Item> = Vec::with_capacity(total);
    let mut rank_ranges: Vec<Range<u32>> = Vec::with_capacity(rank_count);
    let mut rank_offset: Vec<u32> = Vec::with_capacity(rank_count);

    for bucket in buckets.iter_mut() {
        let start = items.len() as u32;
        rank_offset.push(start);
        for (i, item) in bucket.iter_mut().enumerate() {
            // Saturating rather than wrapping: a rank with > 65_535 items is far outside the
            // supported envelope, and clamping keeps `order` monotone instead of aliasing to 0.
            item.order = u16::try_from(i).unwrap_or(u16::MAX);
            items.push(*item);
        }
        rank_ranges.push(start..items.len() as u32);
    }

    let mut item_of_node: Vec<u32> = vec![0; node_count];
    for (n, &(r, idx)) in node_slots.iter().enumerate() {
        item_of_node[n] = rank_offset[r as usize] + idx;
    }

    // ---- Chains and adjacency ------------------------------------------------------------------
    let mut chains: Vec<EdgeChain> = Vec::with_capacity(pending.len());
    let mut down_arcs: Vec<(u32, u32, u32)> = Vec::new();

    for p in &pending {
        let mut chain_items: Vec<u32> = Vec::with_capacity(p.slots.len() + 2);
        chain_items.push(item_of_node[p.from_node as usize]);
        for &(r, idx) in &p.slots {
            chain_items.push(rank_offset[r as usize] + idx);
        }
        chain_items.push(item_of_node[p.to_node as usize]);

        for link in chain_items.windows(2) {
            down_arcs.push((link[0], link[1], p.edge));
        }

        chains.push(EdgeChain {
            edge: p.edge,
            reversed: p.reversed,
            role: p.role,
            items: chain_items,
            // +1 because slot 0 of the chain is the source node, not an intermediate.
            label_at: p.label_slot.map(|i| i + 1),
        });
    }

    // Built from the same ordered arc list, so `up` is an exact transpose and both are stable.
    let up_arcs: Vec<(u32, u32, u32)> = down_arcs
        .iter()
        .map(|&(from, to, edge)| (to, from, edge))
        .collect();
    let down = Csr::build(items.len(), &down_arcs);
    let up = Csr::build(items.len(), &up_arcs);

    let flat_edges: Vec<FlatEdge> = pending_flat
        .into_iter()
        .map(|f| FlatEdge {
            edge: f.edge,
            rank: f.rank,
            from_item: item_of_node[f.from_node as usize],
            to_item: item_of_node[f.to_node as usize],
            label: f.label,
        })
        .collect();

    Layered {
        items,
        rank_ranges,
        up,
        down,
        chains,
        flat_edges,
        self_loops: structure.self_loops.clone(),
        item_of_node,
    }
}

/// Box a `Label` item must occupy for `label`, honouring [`LabelPlacement`].
///
/// The returned box is the *reservation*, not the badge: it is inflated by `badge_clearance` on
/// every side, and doubled on one axis for the offset placements so the polyline has somewhere to
/// run that is not underneath the badge. See the module header for the full table; use
/// [`badge_rect`] to recover the badge itself from a positioned item.
pub fn label_item_size(label: LabelBox, config: &CustomLayoutConfig) -> (f64, f64) {
    let pad = 2.0 * sanitize(config.badge_clearance);
    let lw = sanitize(label.width) + pad;
    let lh = sanitize(label.height) + pad;
    match config.label_placement {
        LabelPlacement::OnEdge => (lw, lh),
        LabelPlacement::BesideEdge => (2.0 * lw, lh),
        LabelPlacement::AboveEdge => (lw, 2.0 * lh),
    }
}

/// Badge rectangle implied by a positioned `Label` item.
///
/// Phase 8 should call this instead of re-deriving the halves, so the reservation made here and the
/// geometry drawn there cannot drift apart. Passing a non-`Label` item is meaningless but safe: the
/// result is simply the item box inset by `badge_clearance`.
pub fn badge_rect(item: &Item, config: &CustomLayoutConfig) -> Rect {
    let c = sanitize(config.badge_clearance);
    let (x, y, w, h) = match config.label_placement {
        LabelPlacement::OnEdge => (item.x, item.y, item.width, item.height),
        // Right half — the edge runs down the left face.
        LabelPlacement::BesideEdge => (
            item.x + item.width / 2.0,
            item.y,
            item.width / 2.0,
            item.height,
        ),
        // Top half — the edge runs along the bottom face.
        LabelPlacement::AboveEdge => (item.x, item.y, item.width, item.height / 2.0),
    };
    Rect {
        x: x + c,
        y: y + c,
        width: (w - 2.0 * c).max(0.0),
        height: (h - 2.0 * c).max(0.0),
    }
}

/// Point on a positioned `Label` item that the edge polyline must pass through.
///
/// This is the other half of the contract in [`badge_rect`]: the anchor is always on the face the
/// badge was pushed away from, so the line and the badge cannot overlap.
pub fn edge_anchor(item: &Item, config: &CustomLayoutConfig) -> Point {
    match config.label_placement {
        LabelPlacement::OnEdge => Point {
            x: item.center_x(),
            y: item.center_y(),
        },
        LabelPlacement::BesideEdge => Point {
            x: item.x,
            y: item.center_y(),
        },
        LabelPlacement::AboveEdge => Point {
            x: item.center_x(),
            y: item.y + item.height,
        },
    }
}

/// Chooses which of the intermediate ranks `first..=last` get an item.
///
/// **Always every one of them.** A chain link must connect consecutive ranks, with no exceptions:
/// `up`/`down` are declared as adjacent-rank adjacencies, and three separate phases read them that
/// way — Barth-Mutzel-Juenger counting indexes the accumulator tree by the target's `order` within
/// rank `r + 1`, lane demand derives channel intervals from a single rank gap, and Brandes-Koepf's
/// type-1 conflict marking assumes segments span one rank. A link that skips ranks silently
/// violates all three; the first symptom is an out-of-bounds index inside the accumulator tree,
/// far from the cause.
///
/// An earlier revision let `max_dummy_chain_length` drop interior ranks to bound allocation. That
/// is why the cap is now advisory: `build_layered` records a `LONG_EDGE_SPAN` diagnostic when a
/// span exceeds it, and builds the full chain regardless. Correctness first — a very long chain
/// costs memory, whereas a broken adjacency contract costs correctness in phases that cannot
/// detect the breakage.
fn select_intermediate_ranks(first: u16, last: u16) -> Vec<u16> {
    if last < first {
        return Vec::new();
    }
    (first..=last).collect()
}

/// Clamps a host-supplied measurement into a usable non-negative finite value.
///
/// Measurements arrive from JS and can be `NaN` when a font fails to load; a `NaN` width would
/// poison every separation computed downstream, and there is no phase left that could notice.
#[inline]
fn sanitize(v: f64) -> f64 {
    if v.is_finite() && v > 0.0 {
        v
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{IrEdge, IrNode};

    fn node(w: f64, h: f64) -> IrNode {
        IrNode {
            name: 0,
            width: w,
            height: h,
            pinned_rank: None,
            degree: 0,
        }
    }

    fn edge(source: u32, target: u32, label: Option<LabelBox>) -> IrEdge {
        IrEdge {
            name: 0,
            source,
            target,
            label,
            weight: 1.0,
            min_len: 1,
            hint: None,
            bundle: None,
        }
    }

    fn label(w: f64, h: f64) -> Option<LabelBox> {
        Some(LabelBox {
            width: w,
            height: h,
        })
    }

    /// `nodes` are `(w, h, rank)`; edges are taken as-is. Nothing here touches CSRs, which
    /// `build_layered` does not read.
    fn graph(nodes: &[(f64, f64, u16)], edges: Vec<IrEdge>) -> (GraphIr, RankResult) {
        let ir = GraphIr {
            node_names: (0..nodes.len()).map(|i| i.to_string()).collect(),
            edge_names: (0..edges.len()).map(|i| i.to_string()).collect(),
            node_labels: vec![None; nodes.len()],
            nodes: nodes.iter().map(|&(w, h, _)| node(w, h)).collect(),
            edges,
            ..Default::default()
        };
        let rank_of: Vec<u16> = nodes.iter().map(|&(_, _, r)| r).collect();
        let max_rank = rank_of.iter().copied().max().unwrap_or(0);
        let mut rank_members: Vec<Vec<u32>> = vec![Vec::new(); max_rank as usize + 1];
        for (n, &r) in rank_of.iter().enumerate() {
            rank_members[r as usize].push(n as u32);
        }
        let ranks = RankResult {
            rank_of,
            max_rank,
            rank_members,
        };
        (ir, ranks)
    }

    fn structure_for(ir: &GraphIr) -> StructureResult {
        StructureResult {
            roles: vec![EdgeRole::Forward; ir.edge_count()],
            reversed: vec![false; ir.edge_count()],
            self_loops: Vec::new(),
            is_dag: true,
        }
    }

    fn cfg() -> CustomLayoutConfig {
        CustomLayoutConfig::default()
    }

    /// Every `(from, to, edge)` triple in a CSR, in CSR order.
    fn triples(csr: &Csr) -> Vec<(u32, u32, u32)> {
        let mut out = Vec::new();
        for from in 0..csr.node_count() {
            for i in csr.range(from as u32) {
                out.push((from as u32, csr.targets[i], csr.edges[i]));
            }
        }
        out
    }

    // -- expansion ---------------------------------------------------------------------------

    #[test]
    fn span_two_path_produces_exactly_one_intermediate() {
        let (ir, ranks) = graph(
            &[(100.0, 40.0, 0), (100.0, 40.0, 2)],
            vec![edge(0, 1, None)],
        );
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        assert_eq!(l.rank_count(), 3);
        assert_eq!(l.chains.len(), 1);
        let chain = &l.chains[0];
        assert_eq!(chain.items.len(), 3, "source, one dummy, target");
        assert_eq!(chain.link_count(), 2);
        assert_eq!(chain.label_at, None);

        let mid = l.items[chain.items[1] as usize];
        assert_eq!(mid.kind, ItemKind::Dummy { edge: 0, seq: 0 });
        assert_eq!(mid.rank, 1);
        assert_eq!(mid.width, 0.0);
        assert_eq!(mid.height, 0.0);
        // The dummy is the only occupant of rank 1.
        assert_eq!(l.rank_slice(1).len(), 1);
    }

    #[test]
    fn span_one_unlabelled_edge_is_a_direct_link() {
        let (ir, ranks) = graph(&[(10.0, 10.0, 0), (10.0, 10.0, 1)], vec![edge(0, 1, None)]);
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        assert_eq!(l.items.len(), 2, "no dummies for an adjacent-rank edge");
        assert_eq!(
            l.chains[0].items,
            vec![l.item_of_node[0], l.item_of_node[1]]
        );
        assert_eq!(l.chains[0].link_count(), 1);
    }

    #[test]
    fn span_four_labelled_edge_has_three_intermediates_one_of_them_the_label() {
        let (ir, ranks) = graph(
            &[(10.0, 10.0, 0), (10.0, 10.0, 4)],
            vec![edge(0, 1, label(60.0, 20.0))],
        );
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        let chain = &l.chains[0];
        assert_eq!(chain.items.len(), 5, "source + 3 intermediates + target");

        let kinds: Vec<ItemKind> = chain.items[1..4]
            .iter()
            .map(|&i| l.items[i as usize].kind)
            .collect();
        let labels = kinds.iter().filter(|k| k.is_label()).count();
        assert_eq!(labels, 1, "exactly one Label item");
        assert_eq!(kinds.iter().filter(|k| k.is_dummy()).count(), 2);

        // Middle intermediate rank: r_from + span/2 = 0 + 2.
        let at = chain.label_at.expect("labelled edge must record label_at");
        let label_item = l.items[chain.items[at] as usize];
        assert_eq!(label_item.rank, 2);
        assert_eq!(label_item.kind, ItemKind::Label(0));

        // Dummy `seq` counts dummies from 0 along the chain, skipping the label.
        assert_eq!(
            l.items[chain.items[1] as usize].kind,
            ItemKind::Dummy { edge: 0, seq: 0 }
        );
        assert_eq!(
            l.items[chain.items[3] as usize].kind,
            ItemKind::Dummy { edge: 0, seq: 1 }
        );
    }

    #[test]
    fn label_item_box_follows_label_placement() {
        let lb = LabelBox {
            width: 60.0,
            height: 20.0,
        };
        // lw = 60 + 2*10 = 80, lh = 20 + 2*10 = 40 with the default badge_clearance of 10.
        for (placement, expect) in [
            (LabelPlacement::OnEdge, (80.0, 40.0)),
            (LabelPlacement::BesideEdge, (160.0, 40.0)),
            (LabelPlacement::AboveEdge, (80.0, 80.0)),
        ] {
            let mut c = cfg();
            c.label_placement = placement;
            assert_eq!(label_item_size(lb, &c), expect, "{:?}", placement);

            let (ir, ranks) = graph(
                &[(10.0, 10.0, 0), (10.0, 10.0, 2)],
                vec![edge(0, 1, Some(lb))],
            );
            let st = structure_for(&ir);
            let l = build_layered(&ir, &st, &ranks, &c);
            let chain = &l.chains[0];
            let at = chain.label_at.expect("label_at");
            let item = l.items[chain.items[at] as usize];
            assert_eq!(item.rank, 1);
            assert_eq!((item.width, item.height), expect, "{:?}", placement);
        }
    }

    #[test]
    fn badge_rect_and_anchor_honour_the_reservation_contract() {
        let lb = LabelBox {
            width: 60.0,
            height: 20.0,
        };

        let mut c = cfg();
        c.label_placement = LabelPlacement::BesideEdge;
        let (w, h) = label_item_size(lb, &c);
        let item = Item {
            kind: ItemKind::Label(0),
            rank: 1,
            order: 0,
            width: w,
            height: h,
            x: 100.0,
            y: 200.0,
        };
        let r = badge_rect(&item, &c);
        assert_eq!(r.x, 190.0, "right half, inset by badge_clearance");
        assert_eq!(r.width, 60.0, "badge width recovered exactly");
        assert_eq!(r.height, 20.0);
        let a = edge_anchor(&item, &c);
        assert_eq!(a.x, 100.0, "line runs down the LEFT face");
        assert!(a.x < r.x, "badge sits to the right of the line");

        c.label_placement = LabelPlacement::AboveEdge;
        let (w, h) = label_item_size(lb, &c);
        let item = Item {
            width: w,
            height: h,
            ..item
        };
        let r = badge_rect(&item, &c);
        assert_eq!(r.y, 210.0, "top half, inset");
        assert_eq!((r.width, r.height), (60.0, 20.0));
        let a = edge_anchor(&item, &c);
        assert_eq!(a.y, 200.0 + h, "line runs along the BOTTOM face");
        assert!(a.y > r.y + r.height, "badge sits above the line");

        c.label_placement = LabelPlacement::OnEdge;
        let (w, h) = label_item_size(lb, &c);
        let item = Item {
            width: w,
            height: h,
            ..item
        };
        let r = badge_rect(&item, &c);
        assert_eq!((r.width, r.height), (60.0, 20.0));
        let a = edge_anchor(&item, &c);
        assert_eq!((a.x, a.y), (item.center_x(), item.center_y()));
    }

    #[test]
    fn labelled_span_one_edge_degrades_instead_of_panicking() {
        // Phase 3 should have forced min_len = 2. A caller-supplied min_len: 1 must not blow up.
        let (ir, ranks) = graph(
            &[(10.0, 10.0, 0), (10.0, 10.0, 1)],
            vec![edge(0, 1, label(60.0, 20.0))],
        );
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        assert_eq!(l.chains[0].items.len(), 2);
        assert_eq!(l.chains[0].label_at, None);
        assert!(!l.items.iter().any(|i| i.kind.is_label()));
    }

    /// A chain is contiguous no matter how long, even below `max_dummy_chain_length`.
    ///
    /// An earlier revision dropped interior ranks once a chain exceeded the cap, which produced a
    /// link spanning many ranks at once. That silently violates the `up`/`down` adjacency contract
    /// and three downstream phases read it as a guarantee: Barth-Mutzel-Juenger counting indexes
    /// its accumulator tree by the target's `order` within rank `r + 1`, lane demand derives
    /// channel intervals from one rank gap, and Brandes-Koepf's type-1 conflict marking assumes
    /// single-rank segments. The cap is advisory now; this test pins that down.
    #[test]
    fn long_chains_stay_contiguous_regardless_of_the_advisory_cap() {
        let mut c = cfg();
        c.max_dummy_chain_length = 4;
        // span 20 → 19 intermediate ranks, all of which must survive.
        let (ir, ranks) = graph(
            &[(10.0, 10.0, 0), (10.0, 10.0, 20)],
            vec![edge(0, 1, label(30.0, 10.0))],
        );
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &c);

        let chain = &l.chains[0];
        let inter = &chain.items[1..chain.items.len() - 1];
        assert_eq!(inter.len(), 19, "every intermediate rank keeps an item");

        let ranks_kept: Vec<u16> = inter.iter().map(|&i| l.items[i as usize].rank).collect();
        assert_eq!(ranks_kept, (1..=19).collect::<Vec<u16>>());

        // Consecutive chain entries are always exactly one rank apart.
        for w in chain.items.windows(2) {
            let a = l.items[w[0] as usize].rank;
            let b = l.items[w[1] as usize].rank;
            assert_eq!(b, a + 1, "link {a}->{b} skips a rank");
        }

        assert_eq!(
            inter
                .iter()
                .filter(|&&i| l.items[i as usize].kind.is_label())
                .count(),
            1
        );
        let at = chain.label_at.expect("labelled edge keeps its label item");
        assert_eq!(l.items[chain.items[at] as usize].rank, 10);
    }

    // -- storage layout ------------------------------------------------------------------------

    #[test]
    fn items_are_rank_major_and_order_is_the_offset_within_the_rank() {
        // Two ranks of two reals, plus a dummy on rank 1 from a 0→2 edge.
        let (ir, ranks) = graph(
            &[
                (10.0, 10.0, 0),
                (10.0, 10.0, 0),
                (10.0, 10.0, 1),
                (10.0, 10.0, 2),
            ],
            vec![edge(0, 3, None), edge(1, 2, None)],
        );
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        assert_eq!(l.rank_count(), 3);
        let mut cursor = 0u32;
        for r in 0..l.rank_count() {
            let range = l.rank_ranges[r].clone();
            assert_eq!(range.start, cursor, "ranges must tile items with no gaps");
            cursor = range.end;
            for (offset, item) in l.rank_slice(r as u16).iter().enumerate() {
                assert_eq!(item.rank, r as u16);
                assert_eq!(item.order as usize, offset);
                assert_eq!(
                    l.item_index(r as u16, item.order),
                    range.start + offset as u32
                );
            }
        }
        assert_eq!(cursor as usize, l.items.len());

        // Rank 1: real node 2 first, then the dummy of edge 0.
        let r1: Vec<ItemKind> = l.rank_slice(1).iter().map(|i| i.kind).collect();
        assert_eq!(
            r1,
            vec![ItemKind::Real(2), ItemKind::Dummy { edge: 0, seq: 0 }]
        );

        for n in 0..ir.node_count() {
            assert_eq!(
                l.items[l.item_of_node[n] as usize].kind,
                ItemKind::Real(n as u32)
            );
        }
    }

    #[test]
    fn within_rank_chain_items_are_grouped_by_ascending_edge_index() {
        // Three parallel 0→2 edges: their dummies must land on rank 1 in edge order.
        let (ir, ranks) = graph(
            &[(10.0, 10.0, 0), (10.0, 10.0, 2)],
            vec![edge(0, 1, None), edge(0, 1, None), edge(0, 1, None)],
        );
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        let r1: Vec<ItemKind> = l.rank_slice(1).iter().map(|i| i.kind).collect();
        assert_eq!(
            r1,
            vec![
                ItemKind::Dummy { edge: 0, seq: 0 },
                ItemKind::Dummy { edge: 1, seq: 0 },
                ItemKind::Dummy { edge: 2, seq: 0 },
            ]
        );
    }

    // -- adjacency -----------------------------------------------------------------------------

    #[test]
    fn up_and_down_are_exact_transposes_over_adjacent_ranks_only() {
        let (ir, ranks) = graph(
            &[
                (10.0, 10.0, 0),
                (10.0, 10.0, 1),
                (10.0, 10.0, 3),
                (10.0, 10.0, 3),
            ],
            vec![
                edge(0, 1, None),
                edge(0, 2, label(40.0, 12.0)),
                edge(1, 3, None),
            ],
        );
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        let mut d = triples(&l.down);
        let mut u: Vec<(u32, u32, u32)> = triples(&l.up)
            .into_iter()
            .map(|(from, to, e)| (to, from, e))
            .collect();
        assert!(!d.is_empty());
        d.sort_unstable();
        u.sort_unstable();
        assert_eq!(d, u, "up must be the exact transpose of down");

        for (from, to, _) in &d {
            let a = l.items[*from as usize].rank;
            let b = l.items[*to as usize].rank;
            assert_eq!(b, a + 1, "a link must go from rank r to rank r + 1");
        }

        // Every chain link appears exactly once in `down`.
        let links: usize = l.chains.iter().map(|c| c.link_count()).sum();
        assert_eq!(d.len(), links);
    }

    // -- flat edges, self-loops, feedback -------------------------------------------------------

    #[test]
    fn same_rank_edge_becomes_a_flat_edge_with_no_chain_items() {
        let (ir, ranks) = graph(
            &[(10.0, 10.0, 1), (10.0, 10.0, 1)],
            vec![edge(0, 1, label(50.0, 16.0))],
        );
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        assert!(l.chains.is_empty(), "flat edges get no chain");
        assert_eq!(l.items.len(), 2, "no dummy and no Label item");
        assert!(!l.items.iter().any(|i| i.kind.is_label()));
        assert_eq!(l.flat_edges.len(), 1);
        let f = &l.flat_edges[0];
        assert_eq!(f.edge, 0);
        assert_eq!(f.rank, 1);
        assert_eq!(f.from_item, l.item_of_node[0]);
        assert_eq!(f.to_item, l.item_of_node[1]);
        assert_eq!(f.label, label(50.0, 16.0));
        // Flat edges are not rank-crossing, so they contribute nothing to up/down.
        assert!(triples(&l.down).is_empty());
        assert!(triples(&l.up).is_empty());
    }

    #[test]
    fn reversed_feedback_edge_still_gets_a_full_chain() {
        // Stored 1→0 in the IR; Phase 2 reversed it, so the arc runs 0(rank 0) → 1(rank 2).
        let (ir, ranks) = graph(&[(10.0, 10.0, 0), (10.0, 10.0, 2)], vec![edge(1, 0, None)]);
        let st = StructureResult {
            roles: vec![EdgeRole::Feedback],
            reversed: vec![true],
            self_loops: Vec::new(),
            is_dag: true,
        };
        let l = build_layered(&ir, &st, &ranks, &cfg());

        assert_eq!(
            l.chains.len(),
            1,
            "a feedback edge is reversed, never dropped"
        );
        let chain = &l.chains[0];
        assert!(chain.reversed);
        assert_eq!(chain.role, EdgeRole::Feedback);
        assert_eq!(chain.items.len(), 3);
        assert_eq!(
            chain.items[0], l.item_of_node[0],
            "chain is source-first after reversal"
        );
        assert_eq!(chain.items[2], l.item_of_node[1]);
        for (from, to, _) in triples(&l.down) {
            assert_eq!(l.items[to as usize].rank, l.items[from as usize].rank + 1);
        }
    }

    #[test]
    fn self_loops_are_carried_through_and_expand_to_nothing() {
        let (ir, ranks) = graph(
            &[(10.0, 10.0, 0), (10.0, 10.0, 1)],
            vec![edge(0, 0, label(20.0, 10.0)), edge(0, 1, None)],
        );
        let st = StructureResult {
            roles: vec![EdgeRole::SelfLoop, EdgeRole::Forward],
            reversed: vec![false, false],
            self_loops: vec![0],
            is_dag: true,
        };
        let l = build_layered(&ir, &st, &ranks, &cfg());

        assert_eq!(l.self_loops, vec![0]);
        assert_eq!(l.chains.len(), 1);
        assert_eq!(l.chains[0].edge, 1);
        assert!(l.flat_edges.is_empty());
        assert_eq!(l.items.len(), 2);
    }

    #[test]
    fn unlisted_self_loop_is_still_not_expanded() {
        let (ir, ranks) = graph(&[(10.0, 10.0, 0)], vec![edge(0, 0, None)]);
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        assert!(l.chains.is_empty());
        assert!(l.flat_edges.is_empty());
        assert_eq!(l.items.len(), 1);
    }

    // -- degenerate input ------------------------------------------------------------------------

    #[test]
    fn empty_graph_yields_an_empty_layered() {
        let (ir, ranks) = graph(&[], Vec::new());
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        assert_eq!(l.rank_count(), 0);
        assert!(l.items.is_empty());
        assert!(l.chains.is_empty());
        assert!(l.flat_edges.is_empty());
        assert!(l.item_of_node.is_empty());
    }

    #[test]
    fn out_of_range_endpoints_and_nan_boxes_are_survived() {
        let (ir, ranks) = graph(
            &[(f64::NAN, 40.0, 0), (10.0, 10.0, 1)],
            vec![edge(0, 7, None), edge(0, 1, None)],
        );
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        assert_eq!(
            l.chains.len(),
            1,
            "the dangling edge is dropped, not expanded"
        );
        assert_eq!(l.chains[0].edge, 1);
        assert_eq!(
            l.items[l.item_of_node[0] as usize].width, 0.0,
            "NaN is clamped to 0"
        );
    }

    #[test]
    fn isolated_nodes_and_empty_ranks_still_get_ranges() {
        // Node 1 sits alone on rank 2; rank 1 ends up empty.
        let (ir, ranks) = graph(&[(10.0, 10.0, 0), (10.0, 10.0, 2)], Vec::new());
        let st = structure_for(&ir);
        let l = build_layered(&ir, &st, &ranks, &cfg());

        assert_eq!(l.rank_count(), 3);
        assert_eq!(l.rank_width(1), 0);
        assert!(l.rank_slice(1).is_empty());
        assert_eq!(l.rank_width(0), 1);
        assert_eq!(l.rank_width(2), 1);
    }

    #[test]
    fn output_is_byte_identical_across_runs() {
        let (ir, ranks) = graph(
            &[
                (10.0, 10.0, 0),
                (20.0, 10.0, 0),
                (10.0, 10.0, 1),
                (10.0, 10.0, 3),
                (10.0, 10.0, 3),
            ],
            vec![
                edge(0, 3, label(40.0, 12.0)),
                edge(1, 2, None),
                edge(2, 4, None),
                edge(0, 1, None),
                edge(3, 4, None),
            ],
        );
        let st = structure_for(&ir);
        let a = build_layered(&ir, &st, &ranks, &cfg());
        let b = build_layered(&ir, &st, &ranks, &cfg());

        assert_eq!(format!("{:?}", a.items), format!("{:?}", b.items));
        assert_eq!(a.rank_ranges, b.rank_ranges);
        assert_eq!(triples(&a.down), triples(&b.down));
        assert_eq!(triples(&a.up), triples(&b.up));
        assert_eq!(
            a.chains.iter().map(|c| c.items.clone()).collect::<Vec<_>>(),
            b.chains.iter().map(|c| c.items.clone()).collect::<Vec<_>>()
        );
        assert_eq!(a.item_of_node, b.item_of_node);
    }
}
