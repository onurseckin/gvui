//! # Step 3.3 (Phase 5b/5c/5d): Ordering primitives
//!
//! The three moves the Phase 5 search is built from — a median/barycenter [`position_sweep`], a
//! local adjacent-swap [`transpose`] pass, and [`apply_seed`] for diverse restarts. The driver
//! that combines them lives in `3_4_order_facade.rs`.
//!
//! ## The two-representation problem, and how this module resolves it
//!
//! [`crate::types::Layered`] stores items rank-major, so a rank is a contiguous slice and
//! `Item::order` is an index into it. But `up`/`down`/`chains`/`item_of_node` all address items by
//! their **global slice index**, so physically permuting a rank invalidates every one of them.
//!
//! So each pass here works in two steps:
//!
//! 1. Mutate `Item::order` only. Crossing counting reads `order`, never the slice position
//!    (see [`crate::step3_crossing_minimization::crossing_counting`]), so the graph stays
//!    countable throughout — which is what makes `transpose`'s local re-count legal.
//! 2. Call [`materialize`] once at the end, which permutes the slices to match `order` **and**
//!    remaps every item-index reference in the structure.
//!
//! Every public function in this module therefore leaves `Layered` fully self-consistent: the
//! physical slice position of an item always equals its `order`, and no index is stale. Later
//! phases index by both and must never see them disagree.

use crate::config::{CustomLayoutConfig, OrderingHeuristic};
use crate::step3_crossing_minimization::crossing_counting::{
    count_between_ranks, down_neighbours, up_neighbours,
};
use crate::types::{Csr, ItemKind, Layered};

/// Priority floor reserved for [`ItemKind::Label`]; real-node priorities are clamped below it so a
/// very high-degree node can never outrank a badge.
const LABEL_PRIORITY: u32 = 1_000_000;

/// Highest priority a [`ItemKind::Real`] item may reach, one below [`LABEL_PRIORITY`].
const MAX_REAL_PRIORITY: u32 = LABEL_PRIORITY - 1;

// =============================================================================================
// Structural invariants
// =============================================================================================

/// Forces `Item::order` to agree with the physical slice position of every item.
///
/// Physical position is the ground truth — [`Layered::item_index`] and [`Layered::rank_slice`] are
/// defined in terms of it — so this repairs `order`, not the layout. Call it once on entry to
/// Phase 5 so nothing downstream depends on Phase 4 having got both fields right.
pub fn renumber_orders(layered: &mut Layered) {
    for r in 0..layered.rank_ranges.len() {
        let range = layered.rank_ranges[r].clone();
        for (slot, i) in (range.start..range.end).enumerate() {
            if let Some(item) = layered.items.get_mut(i as usize) {
                item.order = slot as u16;
            }
        }
    }
}

/// Permutes each rank's slice so the physical position of every item equals its `order`, and
/// rewrites every item-index reference in the structure to match.
///
/// This is the only place item indices change. It remaps `up`, `down`, `chains[..].items`,
/// `flat_edges` and `item_of_node`; `EdgeChain::label_at` is a position *within* a chain and is
/// untouched, as are `self_loops`, which hold edge indices.
///
/// Robust to a rank whose `order` values are not a clean permutation: items are sequenced by
/// `(order, current index)`, so duplicates and out-of-range values degrade to a stable order
/// instead of panicking. Adjacency rows keep their relative order, so downstream phases that rely
/// on CSR row order see no churn beyond the remap itself.
pub fn materialize(layered: &mut Layered) {
    let count = layered.items.len();
    if count == 0 {
        return;
    }

    let mut new_of_old: Vec<u32> = vec![0; count];
    let mut scratch: Vec<(u16, u32)> = Vec::new();
    for r in 0..layered.rank_ranges.len() {
        let range = layered.rank_ranges[r].clone();
        scratch.clear();
        for i in range.start..range.end {
            let order = layered
                .items
                .get(i as usize)
                .map(|it| it.order)
                .unwrap_or(u16::MAX);
            scratch.push((order, i));
        }
        scratch.sort_unstable();
        for (slot, &(_, old)) in scratch.iter().enumerate() {
            new_of_old[old as usize] = range.start + slot as u32;
        }
    }

    // Items are `Copy`, so a clone-then-scatter is the cheapest correct permutation.
    let mut permuted = layered.items.clone();
    for (old, &new) in new_of_old.iter().enumerate() {
        permuted[new as usize] = layered.items[old];
    }
    layered.items = permuted;

    for r in 0..layered.rank_ranges.len() {
        let range = layered.rank_ranges[r].clone();
        for (slot, i) in (range.start..range.end).enumerate() {
            if let Some(item) = layered.items.get_mut(i as usize) {
                item.order = slot as u16;
            }
        }
    }

    layered.up = remap_csr(&layered.up, &new_of_old, count);
    layered.down = remap_csr(&layered.down, &new_of_old, count);

    let remap = |i: u32| -> u32 { new_of_old.get(i as usize).copied().unwrap_or(i) };
    for chain in layered.chains.iter_mut() {
        for item in chain.items.iter_mut() {
            *item = remap(*item);
        }
    }
    for flat in layered.flat_edges.iter_mut() {
        flat.from_item = remap(flat.from_item);
        flat.to_item = remap(flat.to_item);
    }
    for item in layered.item_of_node.iter_mut() {
        *item = remap(*item);
    }
}

/// Rebuilds a CSR under the item permutation, preserving the relative order inside each row.
fn remap_csr(csr: &Csr, new_of_old: &[u32], count: usize) -> Csr {
    let mut arcs: Vec<(u32, u32, u32)> = Vec::with_capacity(csr.targets.len());
    let rows = csr.node_count().min(count);
    for old in 0..rows as u32 {
        let range = csr.range(old);
        let from = new_of_old.get(old as usize).copied().unwrap_or(old);
        for slot in range {
            let to_old = csr.targets[slot];
            let to = new_of_old.get(to_old as usize).copied().unwrap_or(to_old);
            arcs.push((from, to, csr.edges[slot]));
        }
    }
    // `Csr::build` bucket-sorts by `from` and is stable within a bucket. Every new `from` receives
    // arcs from exactly one old row, so row order survives.
    Csr::build(count, &arcs)
}

// =============================================================================================
// Item classification
// =============================================================================================

/// `(kind rank, primary index, secondary index)` — see [`discriminator`].
type Discriminator = (u8, u32, u16);

/// `(traversal position, current order, discriminator, item index)`: the total sort key for one
/// item within its rank when a seed reorders it.
type RankSortKey = (u32, u16, Discriminator, u32);

/// Deterministic total-order discriminator: `(kind rank, primary index, secondary index)` with
/// `Real < Label < Dummy`. Used as the last tie-break so sorting never depends on hash order or on
/// which sibling happened to be visited first.
fn discriminator(kind: ItemKind) -> Discriminator {
    match kind {
        ItemKind::Real(node) => (0, node, 0),
        ItemKind::Label(edge) => (1, edge, 0),
        ItemKind::Dummy { edge, seq } => (2, edge, seq),
    }
}

/// How reluctant an item is to be displaced.
///
/// Dummies are immovable: a dummy chain that keeps one order index across ranks renders as a
/// single straight line instead of a staircase, which is the largest aesthetic win available in
/// this phase. Labels come next so a badge is not pushed off the line it annotates. Real nodes are
/// ranked by degree, clamped so they can never reach [`LABEL_PRIORITY`].
///
/// Priority only decides **contests** — items whose computed positions are equal — and the tie
/// rule in [`transpose`]. It deliberately does not let a high-priority item claim a slot away from
/// an item with a strictly better position: positions live in the *adjacent* rank's index space,
/// so a rank of 3 fed by a rank of 10 would need a rescale to interpret them as slots, and any
/// rescale re-invents the ordering the median heuristic just computed. Getting a dummy chain
/// perfectly vertical is Phase 7's job — Brandes-Koepf marks type-1 conflicts precisely so inner
/// segments stay straight — and this phase only has to avoid handing it an ordering that makes
/// that impossible.
fn priority(layered: &Layered, item: u32) -> u32 {
    let kind = match layered.items.get(item as usize) {
        Some(it) => it.kind,
        None => return 0,
    };
    match kind {
        ItemKind::Dummy { .. } => u32::MAX,
        ItemKind::Label(_) => LABEL_PRIORITY,
        ItemKind::Real(_) => {
            let degree = up_neighbours(layered, item).len() + down_neighbours(layered, item).len();
            (degree as u32).min(MAX_REAL_PRIORITY)
        }
    }
}

// =============================================================================================
// Phase 5c — position sweep
// =============================================================================================

/// One median (or barycenter, per config) pass.
///
/// `downward` means rank `r` is positioned from its predecessors in `r - 1`, sweeping ranks in
/// increasing order so each rank sees the freshly computed orders of the one above; upward is the
/// mirror image. The first (respectively last) rank is a fixed point and is not touched.
///
/// An item with no neighbours in the adjacent rank takes its current order as its position, so it
/// holds station instead of collapsing to 0 and dragging the rank around it.
///
/// `config.dummy_priority` changes how **contested positions** are resolved: when two items in a
/// rank compute the same position, the higher-priority one takes the lower slot and the other
/// settles beside it, so a lower-priority item can never displace a higher-priority one. See
/// [`priority`] for the ranking and for why the pass is deliberately restricted to contests.
///
/// On exit, `order` and physical position agree again.
pub fn position_sweep(layered: &mut Layered, downward: bool, config: &CustomLayoutConfig) {
    let rank_count = layered.rank_count();
    if rank_count < 2 {
        return;
    }
    if downward {
        for r in 1..rank_count {
            sweep_rank(layered, r, true, config);
        }
    } else {
        for r in (0..rank_count - 1).rev() {
            sweep_rank(layered, r, false, config);
        }
    }
    materialize(layered);
}

/// Per-item state for one rank's sweep. Kept flat so the sort is a single pass over a `Vec`.
struct Candidate {
    item: u32,
    position: f64,
    current_order: u16,
    disc: Discriminator,
    priority: u32,
}

/// Repositions a single rank from the adjacent rank named by `from_up`.
fn sweep_rank(layered: &mut Layered, rank: usize, from_up: bool, config: &CustomLayoutConfig) {
    let range = match layered.rank_ranges.get(rank) {
        Some(r) => r.clone(),
        None => return,
    };
    let n = range.len();
    if n < 2 {
        return;
    }
    let mut candidates: Vec<Candidate> = Vec::with_capacity(n);
    let mut neighbour_orders: Vec<u16> = Vec::new();
    for i in range.start..range.end {
        let item = match layered.items.get(i as usize) {
            Some(it) => it,
            None => continue,
        };
        let current_order = item.order;
        let disc = discriminator(item.kind);

        neighbour_orders.clear();
        let neighbours = if from_up {
            up_neighbours(layered, i)
        } else {
            down_neighbours(layered, i)
        };
        for &t in neighbours {
            if let Some(other) = layered.items.get(t as usize) {
                neighbour_orders.push(other.order);
            }
        }
        neighbour_orders.sort_unstable();

        let position = if neighbour_orders.is_empty() {
            current_order as f64
        } else {
            match config.ordering {
                OrderingHeuristic::Median => median_position(&neighbour_orders),
                OrderingHeuristic::Barycenter => barycenter_position(&neighbour_orders),
            }
        };

        candidates.push(Candidate {
            item: i,
            position,
            current_order,
            disc,
            priority: priority(layered, i),
        });
    }
    if candidates.len() < 2 {
        return;
    }

    // Total order on (position, [priority], current order, discriminator). Every component after
    // `position` is a tie-break, so the heuristic's own decisions are never overridden — only the
    // contests it leaves undecided are.
    let dummy_priority = config.dummy_priority;
    let mut placement: Vec<usize> = (0..candidates.len()).collect();
    placement.sort_by(|&l, &r| {
        let (a, b) = (&candidates[l], &candidates[r]);
        a.position
            .total_cmp(&b.position)
            .then_with(|| {
                if dummy_priority {
                    b.priority.cmp(&a.priority)
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .then(a.current_order.cmp(&b.current_order))
            .then(a.disc.cmp(&b.disc))
    });

    for (slot, &ci) in placement.iter().enumerate() {
        if let Some(item) = layered.items.get_mut(candidates[ci].item as usize) {
            item.order = slot as u16;
        }
    }
}

/// Median of the neighbour orders.
///
/// Odd cardinality is the plain middle element. Even cardinality uses the Gansner et al.
/// interpolated median, which biases toward the denser half and is what "median heuristic" means
/// in the layered-drawing literature; the degenerate all-equal case falls back to the midpoint so
/// the result is never `NaN` (a `NaN` position would make the sort order depend on comparison
/// details, which would break determinism).
fn median_position(sorted: &[u16]) -> f64 {
    let m = sorted.len();
    match m {
        0 => 0.0,
        1 => sorted[0] as f64,
        2 => (sorted[0] as f64 + sorted[1] as f64) / 2.0,
        _ => {
            let mid = m / 2;
            if m % 2 == 1 {
                return sorted[mid] as f64;
            }
            let lo = sorted[mid - 1] as f64;
            let hi = sorted[mid] as f64;
            let left = lo - sorted[0] as f64;
            let right = sorted[m - 1] as f64 - hi;
            if left + right <= 0.0 {
                (lo + hi) / 2.0
            } else {
                (lo * right + hi * left) / (left + right)
            }
        }
    }
}

/// Arithmetic mean of the neighbour orders.
fn barycenter_position(orders: &[u16]) -> f64 {
    if orders.is_empty() {
        return 0.0;
    }
    let sum: f64 = orders.iter().map(|&o| o as f64).sum();
    sum / orders.len() as f64
}

// =============================================================================================
// Phase 5c — transpose
// =============================================================================================

/// Adjacent-swap pass. Returns true if any swap strictly reduced the crossing count.
///
/// Each candidate swap is judged against the **current** local count over the two rank pairs it
/// can affect, never against a global best. That distinction is the entire point of this function:
/// v1 compared every candidate to a monotonically decreasing global best, so once a best had been
/// recorded the pass silently stopped accepting anything and the transpose step became a no-op.
/// Nothing here carries state between calls, so a second pass on a worsened graph improves exactly
/// as freely as the first.
///
/// The pair count for the state after a decision is the pair count *before* the next candidate, so
/// the running count is carried forward and each candidate costs one re-count rather than two.
///
/// Ties are accepted, which is what lets the search cross plateaus. The one exception is when
/// `config.dummy_priority` is set and the swap strictly worsens how well a dummy or label lines up
/// with its chain neighbours: an equal-crossing swap that bends a long edge is pure loss.
pub fn transpose(layered: &mut Layered, config: &CustomLayoutConfig) -> bool {
    let rank_count = layered.rank_count();
    if rank_count == 0 {
        return false;
    }
    let mut changed = false;
    let mut slot_to_item: Vec<u32> = Vec::new();

    for r in 0..rank_count {
        let range = layered.rank_ranges[r].clone();
        let n = range.len();
        if n < 2 {
            continue;
        }
        slot_to_item.clear();
        slot_to_item.resize(n, 0);
        for i in range.start..range.end {
            let order = layered.items[i as usize].order as usize;
            if order < n {
                slot_to_item[order] = i;
            }
        }

        let mut current = local_pair_count(layered, r);
        for i in 0..n - 1 {
            let a = slot_to_item[i];
            let b = slot_to_item[i + 1];
            let align_before = if config.dummy_priority {
                chain_align_cost(layered, a) + chain_align_cost(layered, b)
            } else {
                0
            };

            swap_slots(layered, &mut slot_to_item, i);
            let after = local_pair_count(layered, r);

            if after > current {
                swap_slots(layered, &mut slot_to_item, i);
            } else if after < current {
                changed = true;
                current = after;
            } else if config.dummy_priority
                && chain_align_cost(layered, a) + chain_align_cost(layered, b) > align_before
            {
                swap_slots(layered, &mut slot_to_item, i);
            } else {
                current = after;
            }
        }
    }

    materialize(layered);
    changed
}

/// Crossings over the only two rank pairs an in-rank swap at `rank` can change.
fn local_pair_count(layered: &Layered, rank: usize) -> usize {
    let above = if rank > 0 {
        count_between_ranks(layered, (rank - 1) as u16)
    } else {
        0
    };
    above.saturating_add(count_between_ranks(layered, rank as u16))
}

/// Swaps the items occupying slots `i` and `i + 1`, keeping `order` in step. Applying it twice is
/// an exact undo, which is how a rejected candidate is rolled back.
fn swap_slots(layered: &mut Layered, slot_to_item: &mut [u32], i: usize) {
    slot_to_item.swap(i, i + 1);
    let a = slot_to_item[i];
    let b = slot_to_item[i + 1];
    if let Some(item) = layered.items.get_mut(a as usize) {
        item.order = i as u16;
    }
    if let Some(item) = layered.items.get_mut(b as usize) {
        item.order = (i + 1) as u16;
    }
}

/// How far a dummy or label sits from its chain neighbours, summed over both directions.
///
/// Zero for real nodes: only long-edge bend points and badges have a "straight" to preserve.
fn chain_align_cost(layered: &Layered, item: u32) -> u32 {
    let kind = match layered.items.get(item as usize) {
        Some(it) => it.kind,
        None => return 0,
    };
    if kind.is_real() {
        return 0;
    }
    let order = layered.items[item as usize].order as i32;
    let mut cost = 0u32;
    for &t in up_neighbours(layered, item)
        .iter()
        .chain(down_neighbours(layered, item).iter())
    {
        if let Some(other) = layered.items.get(t as usize) {
            cost = cost.saturating_add((other.order as i32 - order).unsigned_abs());
        }
    }
    cost
}

// =============================================================================================
// Phase 5b — seeds
// =============================================================================================

/// Overwrites the within-rank order from one of `config.ordering_seeds` deterministic seeds.
///
/// - `0` — keep the current order.
/// - `1` — DFS pre-order over `down` from the rank-0 items sorted by descending out-degree.
/// - `2` — BFS level order from the same roots.
/// - `3` — reverse of seed 1.
/// - `>= 4` — rotate rank `r` by `(seed + r) % len`.
///
/// Items never move between ranks; only the order within a rank changes. Items unreachable from
/// rank 0 are picked up by a second traversal in item-index order, so every item gets a defined
/// position and no seed silently degenerates on a graph with disconnected upper ranks.
pub fn apply_seed(layered: &mut Layered, seed: usize) {
    match seed {
        0 => {}
        1 => traversal_seed(layered, false, false),
        2 => traversal_seed(layered, true, false),
        3 => traversal_seed(layered, false, true),
        _ => rotate_seed(layered, seed),
    }
    materialize(layered);
}

/// Orders every rank by first-visit time of a DFS pre-order or BFS level order over `down`.
fn traversal_seed(layered: &mut Layered, breadth_first: bool, reverse: bool) {
    let count = layered.items.len();
    if count == 0 {
        return;
    }

    let mut roots: Vec<u32> = match layered.rank_ranges.first() {
        Some(range) => (range.start..range.end).collect(),
        None => Vec::new(),
    };
    roots.sort_by(|&l, &r| {
        down_neighbours(layered, r)
            .len()
            .cmp(&down_neighbours(layered, l).len())
            .then(
                layered.items[l as usize]
                    .order
                    .cmp(&layered.items[r as usize].order),
            )
            .then(l.cmp(&r))
    });

    let mut seq_pos: Vec<u32> = vec![u32::MAX; count];
    let mut counter: u32 = 0;
    if breadth_first {
        let mut queue: Vec<u32> = Vec::with_capacity(count);
        let mut head = 0usize;
        let enqueue = |queue: &mut Vec<u32>, seq_pos: &mut Vec<u32>, counter: &mut u32, v: u32| {
            if let Some(slot) = seq_pos.get_mut(v as usize) {
                if *slot == u32::MAX {
                    *slot = *counter;
                    *counter += 1;
                    queue.push(v);
                }
            }
        };
        for &root in roots.iter() {
            enqueue(&mut queue, &mut seq_pos, &mut counter, root);
        }
        for start in 0..count as u32 {
            enqueue(&mut queue, &mut seq_pos, &mut counter, start);
            while head < queue.len() {
                let v = queue[head];
                head += 1;
                for k in 0..down_neighbours(layered, v).len() {
                    let t = down_neighbours(layered, v)[k];
                    enqueue(&mut queue, &mut seq_pos, &mut counter, t);
                }
            }
        }
    } else {
        let mut stack: Vec<u32> = Vec::with_capacity(count);
        for &root in roots.iter().rev() {
            stack.push(root);
        }
        let mut next_unvisited = 0u32;
        loop {
            while let Some(v) = stack.pop() {
                let slot = match seq_pos.get_mut(v as usize) {
                    Some(s) => s,
                    None => continue,
                };
                if *slot != u32::MAX {
                    continue;
                }
                *slot = counter;
                counter += 1;
                let degree = down_neighbours(layered, v).len();
                for k in (0..degree).rev() {
                    let t = down_neighbours(layered, v)[k];
                    if seq_pos.get(t as usize).copied() == Some(u32::MAX) {
                        stack.push(t);
                    }
                }
            }
            while seq_pos
                .get(next_unvisited as usize)
                .is_some_and(|&p| p != u32::MAX)
            {
                next_unvisited += 1;
            }
            if next_unvisited as usize >= count {
                break;
            }
            stack.push(next_unvisited);
        }
    }

    order_ranks_by_key(layered, &seq_pos, reverse);
}

/// Assigns within-rank orders from an ascending sort on `key`, optionally reversed.
fn order_ranks_by_key(layered: &mut Layered, key: &[u32], reverse: bool) {
    let mut scratch: Vec<RankSortKey> = Vec::new();
    for r in 0..layered.rank_ranges.len() {
        let range = layered.rank_ranges[r].clone();
        let n = range.len();
        if n == 0 {
            continue;
        }
        scratch.clear();
        for i in range.start..range.end {
            let item = match layered.items.get(i as usize) {
                Some(it) => it,
                None => continue,
            };
            let k = key.get(i as usize).copied().unwrap_or(u32::MAX);
            scratch.push((k, item.order, discriminator(item.kind), i));
        }
        scratch.sort_unstable();
        for (slot, &(_, _, _, i)) in scratch.iter().enumerate() {
            let order = if reverse { n - 1 - slot } else { slot };
            if let Some(item) = layered.items.get_mut(i as usize) {
                item.order = order as u16;
            }
        }
    }
}

/// Rotates rank `r` by `(seed + r) % len`, which spreads later seeds over structurally unrelated
/// starting permutations without ever needing randomness.
fn rotate_seed(layered: &mut Layered, seed: usize) {
    for r in 0..layered.rank_ranges.len() {
        let range = layered.rank_ranges[r].clone();
        let n = range.len();
        if n < 2 {
            continue;
        }
        let shift = (seed + r) % n;
        for i in range.start..range.end {
            if let Some(item) = layered.items.get_mut(i as usize) {
                item.order = ((item.order as usize + shift) % n) as u16;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::step3_crossing_minimization::crossing_counting::{count_all, fixtures::*};
    use crate::types::ItemKind;

    fn cfg() -> CustomLayoutConfig {
        CustomLayoutConfig::default()
    }

    /// `(rank, order)` of every item, in item-index order — the ordering fingerprint.
    fn fingerprint(layered: &Layered) -> Vec<(u16, u16, ItemKind)> {
        layered
            .items
            .iter()
            .map(|i| (i.rank, i.order, i.kind))
            .collect()
    }

    /// Every rank's `order` values must be exactly `0..len`, and must match slice position.
    fn assert_invariant(layered: &Layered) {
        for r in 0..layered.rank_ranges.len() {
            let range = layered.rank_ranges[r].clone();
            for (slot, i) in (range.start..range.end).enumerate() {
                assert_eq!(
                    layered.items[i as usize].order as usize, slot,
                    "rank {r} slot {slot}: order disagrees with slice position"
                );
                assert_eq!(layered.items[i as usize].rank as usize, r);
            }
        }
    }

    #[test]
    fn degenerate_inputs_are_no_ops() {
        let mut empty = Layered::default();
        position_sweep(&mut empty, true, &cfg());
        assert!(!transpose(&mut empty, &cfg()));
        apply_seed(&mut empty, 1);
        assert!(empty.items.is_empty());

        let mut single = build_layered(&[3], &[]);
        position_sweep(&mut single, true, &cfg());
        assert!(!transpose(&mut single, &cfg()));
        assert_invariant(&single);
    }

    #[test]
    fn position_sweep_leaves_an_optimal_ordering_unchanged() {
        // 0,1,2 | 3,4,5 straight through: already optimal in both directions.
        let mut l = build_layered(&[3, 3], &[(0, 3), (1, 4), (2, 5)]);
        let before = fingerprint(&l);
        position_sweep(&mut l, true, &cfg());
        assert_eq!(fingerprint(&l), before);
        position_sweep(&mut l, false, &cfg());
        assert_eq!(fingerprint(&l), before);
        assert_eq!(count_all(&l), 0);
        assert_invariant(&l);
    }

    #[test]
    fn position_sweep_resolves_a_crossing_and_keeps_the_invariant() {
        // 0,1 | 2,3 with 0->3, 1->2: the lower rank must flip.
        let mut l = build_layered(&[2, 2], &[(0, 3), (1, 2)]);
        assert_eq!(count_all(&l), 1);
        position_sweep(&mut l, true, &cfg());
        assert_eq!(count_all(&l), 0);
        assert_invariant(&l);
    }

    #[test]
    fn isolated_items_hold_station() {
        // Item 4 has no predecessor; it must stay at order 1 rather than drift to 0.
        let mut l = build_layered(&[2, 3], &[(0, 2), (1, 3)]);
        position_sweep(&mut l, true, &cfg());
        assert_invariant(&l);
        let order_of = |kind_index: u32, layered: &Layered| -> u16 {
            layered
                .items
                .iter()
                .find(|i| i.kind == ItemKind::Real(kind_index))
                .map(|i| i.order)
                .unwrap_or(u16::MAX)
        };
        // Original item 4 had order 2 within its rank and no neighbours, so it keeps the tail slot.
        assert_eq!(order_of(4, &l), 2);
    }

    #[test]
    fn barycenter_and_median_agree_on_a_single_neighbour() {
        let mut c = cfg();
        c.ordering = OrderingHeuristic::Barycenter;
        let mut l = build_layered(&[2, 2], &[(0, 3), (1, 2)]);
        position_sweep(&mut l, true, &c);
        assert_eq!(count_all(&l), 0);
        assert_invariant(&l);
    }

    #[test]
    fn median_of_even_sets_is_finite_and_between_the_middles() {
        assert_eq!(median_position(&[]), 0.0);
        assert_eq!(median_position(&[5]), 5.0);
        assert_eq!(median_position(&[2, 6]), 4.0);
        assert_eq!(median_position(&[1, 2, 3]), 2.0);
        // All four equal: the interpolation denominator is zero and must not produce NaN.
        let flat = median_position(&[3, 3, 3, 3]);
        assert!(flat.is_finite());
        assert_eq!(flat, 3.0);
        let skewed = median_position(&[0, 4, 5, 6]);
        assert!(skewed.is_finite() && (4.0..=5.0).contains(&skewed));
    }

    /// Builds a 6-rank graph with a dummy chain running beside a parallel chain of real nodes,
    /// deliberately started with the real node ahead of the dummy in every rank.
    ///
    /// `A` fans out to both `D1` and `R1`, so those two compute the **same** position in rank 1 —
    /// a genuine contest, which is the only situation dummy priority is allowed to decide.
    fn dummy_chain_graph() -> Layered {
        // rank 0: 0=A, 1=Z   ranks 1..4: real R, dummy D   rank 5: 10=B, 11=Y
        let sizes = [2usize, 2, 2, 2, 2, 2];
        let arcs = [
            (0, 3),  // A -> D1
            (0, 2),  // A -> R1  (same source: D1 and R1 contest one position)
            (3, 5),  // D1 -> D2
            (2, 4),  // R1 -> R2
            (5, 7),  // D2 -> D3
            (4, 6),  // R2 -> R3
            (7, 9),  // D3 -> D4
            (6, 8),  // R3 -> R4
            (9, 10), // D4 -> B
            (8, 11), // R4 -> Y
        ];
        let mut l = build_layered(&sizes, &arcs);
        // Items 3, 5, 7, 9 are the dummy chain of edge 0.
        for (seq, &item) in [3u32, 5, 7, 9].iter().enumerate() {
            set_kind(
                &mut l,
                item,
                ItemKind::Dummy {
                    edge: 0,
                    seq: seq as u16,
                },
            );
        }
        // Start each middle rank with the real node first, so the dummy has to win its slot back.
        for &(real, dummy) in [(2u32, 3u32), (4, 5), (6, 7), (8, 9)].iter() {
            set_orders(&mut l, &[real, dummy]);
        }
        materialize(&mut l);
        l
    }

    #[test]
    fn dummy_priority_straightens_a_four_rank_chain() {
        let mut l = dummy_chain_graph();
        let c = cfg();
        assert!(c.dummy_priority);
        position_sweep(&mut l, true, &c);
        assert_invariant(&l);

        let dummy_orders: Vec<u16> = l
            .items
            .iter()
            .filter(|i| i.kind.is_dummy())
            .map(|i| i.order)
            .collect();
        assert_eq!(dummy_orders.len(), 4);
        assert!(
            dummy_orders.iter().all(|&o| o == dummy_orders[0]),
            "dummy chain is not straight: {dummy_orders:?}"
        );
    }

    #[test]
    fn dummy_priority_is_what_decides_the_contested_slot() {
        // With priority off, the real node's earlier current order wins the tie in rank 1 and the
        // chain starts at order 1 instead of 0. This is the control for the test above.
        let mut c = cfg();
        c.dummy_priority = false;
        let mut l = dummy_chain_graph();
        position_sweep(&mut l, true, &c);
        let first_dummy = l
            .items
            .iter()
            .find(|i| i.kind == ItemKind::Dummy { edge: 0, seq: 0 })
            .map(|i| i.order)
            .unwrap_or(u16::MAX);
        assert_eq!(first_dummy, 1);

        let mut with_priority = dummy_chain_graph();
        position_sweep(&mut with_priority, true, &cfg());
        let priority_first = with_priority
            .items
            .iter()
            .find(|i| i.kind == ItemKind::Dummy { edge: 0, seq: 0 })
            .map(|i| i.order)
            .unwrap_or(u16::MAX);
        assert_eq!(priority_first, 0);
    }

    #[test]
    fn transpose_removes_a_single_fixable_crossing() {
        let mut l = build_layered(&[2, 2], &[(0, 3), (1, 2)]);
        assert_eq!(count_all(&l), 1);
        assert!(transpose(&mut l, &cfg()));
        assert_eq!(count_all(&l), 0);
        assert_invariant(&l);
    }

    #[test]
    fn transpose_fixes_independent_crossings_in_one_pass() {
        // Two disjoint fixable crossings, one in rank pair (0,1) and one in (2,3).
        let sizes = [2usize, 2, 2, 2];
        let arcs = [(0, 3), (1, 2), (4, 7), (5, 6)];
        let mut l = build_layered(&sizes, &arcs);
        assert_eq!(count_all(&l), 2);
        assert!(transpose(&mut l, &cfg()));
        assert_eq!(count_all(&l), 0);
        assert_invariant(&l);
    }

    #[test]
    fn transpose_keeps_improving_after_a_better_state_was_already_reached() {
        // The v1 regression. v1 judged each candidate against a global best that only ever fell,
        // so after one good pass nothing was ever accepted again. `transpose` holds no state: a
        // second pass over a re-worsened graph must improve exactly as much as the first did.
        let reversal = || build_layered(&[4, 4], &[(0, 7), (1, 6), (2, 5), (3, 4)]);

        let mut l = reversal();
        assert_eq!(count_all(&l), 6);
        assert!(transpose(&mut l, &cfg()));
        let after_first = count_all(&l);
        assert!(after_first < 6, "first pass did not improve");

        // Re-scramble the *same* graph object back to the worst ordering. Item indices moved when
        // the first pass materialized, so the reset addresses items by identity.
        let lower: Vec<u32> = (4..8).map(|n| item_of_real(&l, n)).collect();
        let upper: Vec<u32> = (0..4).map(|n| item_of_real(&l, n)).collect();
        set_orders(&mut l, &lower);
        set_orders(&mut l, &upper);
        assert_eq!(count_all(&l), 6);

        assert!(
            transpose(&mut l, &cfg()),
            "second pass refused an improving swap"
        );
        assert_eq!(
            count_all(&l),
            after_first,
            "second pass must reach the same local optimum as the first"
        );
        assert_invariant(&l);
    }

    #[test]
    fn transpose_never_increases_the_count() {
        let mut rng = Lcg(0xabcd_ef01_2345_6789);
        for _ in 0..80 {
            let sizes: Vec<usize> = (0..4).map(|_| 2 + rng.below(4) as usize).collect();
            let mut starts = Vec::new();
            let mut acc = 0u32;
            for &s in &sizes {
                starts.push(acc);
                acc += s as u32;
            }
            let mut arcs: Vec<(u32, u32)> = Vec::new();
            for r in 0..sizes.len() - 1 {
                for _ in 0..(2 + rng.below(6)) {
                    arcs.push((
                        starts[r] + rng.below(sizes[r] as u32),
                        starts[r + 1] + rng.below(sizes[r + 1] as u32),
                    ));
                }
            }
            let mut l = build_layered(&sizes, &arcs);
            let before = count_all(&l);
            transpose(&mut l, &cfg());
            assert!(count_all(&l) <= before);
            assert_invariant(&l);
        }
    }

    #[test]
    fn seeds_permute_within_ranks_only() {
        let sizes = [3usize, 4, 2];
        let arcs = [(0, 3), (0, 4), (1, 5), (2, 6), (3, 7), (5, 8)];
        for seed in 0..7usize {
            let mut l = build_layered(&sizes, &arcs);
            apply_seed(&mut l, seed);
            assert_invariant(&l);
            for (r, &n) in sizes.iter().enumerate() {
                let range = l.rank_ranges[r].clone();
                assert_eq!(range.len(), n);
                let mut nodes: Vec<u32> = (range.start..range.end)
                    .filter_map(|i| match l.items[i as usize].kind {
                        ItemKind::Real(node) => Some(node),
                        _ => None,
                    })
                    .collect();
                nodes.sort_unstable();
                let expected: Vec<u32> = (range.start..range.end).collect();
                assert_eq!(nodes, expected, "seed {seed} moved items between ranks");
            }
        }
    }

    #[test]
    fn seed_zero_keeps_the_current_order_and_seed_three_reverses_seed_one() {
        let sizes = [3usize, 4, 2];
        let arcs = [(0, 3), (0, 4), (1, 5), (2, 6), (3, 7), (5, 8)];

        let mut untouched = build_layered(&sizes, &arcs);
        let before = fingerprint(&untouched);
        apply_seed(&mut untouched, 0);
        assert_eq!(fingerprint(&untouched), before);

        let mut dfs = build_layered(&sizes, &arcs);
        apply_seed(&mut dfs, 1);
        let mut reversed = build_layered(&sizes, &arcs);
        apply_seed(&mut reversed, 3);
        for r in 0..sizes.len() {
            let range = dfs.rank_ranges[r].clone();
            let n = range.len();
            let forward: Vec<ItemKind> = (range.start..range.end)
                .map(|i| dfs.items[i as usize].kind)
                .collect();
            let backward: Vec<ItemKind> = (range.start..range.end)
                .map(|i| reversed.items[i as usize].kind)
                .collect();
            for k in 0..n {
                assert_eq!(forward[k], backward[n - 1 - k], "rank {r} slot {k}");
            }
        }
    }

    #[test]
    fn seeds_are_reproducible() {
        let sizes = [3usize, 4, 2];
        let arcs = [(0, 3), (0, 4), (1, 5), (2, 6), (3, 7), (5, 8)];
        for seed in 0..7usize {
            let mut a = build_layered(&sizes, &arcs);
            let mut b = build_layered(&sizes, &arcs);
            apply_seed(&mut a, seed);
            apply_seed(&mut b, seed);
            assert_eq!(fingerprint(&a), fingerprint(&b), "seed {seed}");
        }
    }

    #[test]
    fn materialize_remaps_every_item_index() {
        let mut l = build_layered(&[2, 2], &[(0, 3), (1, 2)]);
        // Flip the lower rank by hand, then materialize.
        l.items[2].order = 1;
        l.items[3].order = 0;
        materialize(&mut l);
        assert_invariant(&l);
        // Item 0 must still point at the same logical target (originally item 3, now at slot 2).
        let zero = l
            .items
            .iter()
            .position(|i| i.kind == ItemKind::Real(0))
            .unwrap_or(usize::MAX) as u32;
        let targets: Vec<ItemKind> = down_neighbours(&l, zero)
            .iter()
            .map(|&t| l.items[t as usize].kind)
            .collect();
        assert_eq!(targets, vec![ItemKind::Real(3)]);
        assert_eq!(count_all(&l), 0);
    }
}
