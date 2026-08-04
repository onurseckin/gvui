//! # Phase 7b: Brandes-Koepf horizontal coordinate assignment
//!
//! Four independent candidate assignments — {align upward, align downward} x {pack left, pack
//! right} — are computed and then blended. Each candidate is built in three steps:
//!
//! 1. **Mark type-1 conflicts.** An *inner segment* joins two non-`Real` items. Any non-inner
//!    segment that crosses an inner segment is marked and may never be used for alignment. This is
//!    the single mechanism that keeps dummy chains perfectly vertical: a dummy chain can always win
//!    the alignment fight against a node-to-node segment, never the other way round.
//! 2. **Vertical alignment.** Each item tries to align with its median neighbour in the previous
//!    rank of the sweep. Successful alignments build *blocks* of items that will share one x.
//! 3. **Horizontal compaction.** Blocks are placed by longest path in the block graph, honouring
//!    the exact per-pair separations Phase 6 computed, then linked classes are merged by shifting.
//!
//! Balancing averages the two innermost of the four candidates, which is what removes the
//! directional bias each individual pass has.
//!
//! Nothing here searches and nothing is retried. The separations arriving from Phase 6 are already
//! sufficient for every route Phase 8 will draw, so the only thing this phase must get right is to
//! never violate them — and the closing left-to-right repair makes that unconditional even if a
//! compaction edge case slips.

use std::cmp::Ordering;
use std::collections::HashSet;

use crate::config::{BkAlign, CustomLayoutConfig};
use crate::types::{Csr, Layered, RoutingDemand};

/// Sentinel rank for an item that no `rank_range` covers. Such an item cannot participate in any
/// adjacency or separation and ends up at x = 0; it exists only so a malformed `Layered` degrades
/// instead of panicking.
const NO_RANK: u32 = u32::MAX;

/// Brandes-Koepf horizontal coordinate assignment.
///
/// Returns the CENTRE x of every item, indexed by global item index.
/// Guarantees: <= 2 bends per adjacent-rank edge, dummy chains perfectly vertical, arbitrary
/// per-item widths and per-pair separations respected, O(V + E).
///
/// The returned coordinates are centres, not top-left corners, and they are **not** translated:
/// the origin is wherever compaction happened to land. [`assign_coordinates`] normalizes.
///
/// The postcondition every caller may rely on: for consecutive items `o` and `o+1` of any rank,
/// `x[o+1] - x[o] >= width[o]/2 + width[o+1]/2 + separation_min[(rank, o)]`. It holds exactly,
/// because the final pass repairs it left to right regardless of what compaction produced.
///
/// [`assign_coordinates`]: super::coordinate_facade::assign_coordinates
pub fn brandes_kopf_x(
    layered: &Layered,
    demand: &RoutingDemand,
    config: &CustomLayoutConfig,
) -> Vec<f64> {
    let layout = BkLayout::build(layered, demand, config);
    if layout.n == 0 {
        return Vec::new();
    }

    let marked = mark_type1_conflicts(&layout);

    // Candidate order is fixed and matches `BkAlign::{UpLeft, UpRight, DownLeft, DownRight}`.
    const COMBOS: [(Vertical, Horizontal); 4] = [
        (Vertical::Up, Horizontal::Left),
        (Vertical::Up, Horizontal::Right),
        (Vertical::Down, Horizontal::Left),
        (Vertical::Down, Horizontal::Right),
    ];

    let mut candidates: Vec<Vec<f64>> = Vec::with_capacity(4);
    for &(vert, horiz) in COMBOS.iter() {
        let pass = BkPass::build(&layout, vert, horiz);
        let (root, align) = vertical_alignment(&pass, &marked, layout.n);
        let mut xs = horizontal_compaction(&pass, &root, &align, layout.n);
        if horiz == Horizontal::Right {
            // The pass ran on a mirrored layering; mirror the result back.
            for x in xs.iter_mut() {
                *x = -*x;
            }
        }
        sanitize(&mut xs);
        candidates.push(xs);
    }

    let widths: Vec<f64> = candidates
        .iter()
        .map(|xs| candidate_width(xs, &layout.width))
        .collect();

    // Reference for the common frame: the narrowest candidate. Width is translation invariant, so
    // choosing it before or after aligning makes no difference.
    let reference = argmin(&widths);
    align_candidates(&mut candidates, reference, &COMBOS);

    let mut centres = match config.bk_align {
        BkAlign::Median => balance(&candidates, layout.n),
        BkAlign::Leftmost => candidates[argmin(&widths)].clone(),
        BkAlign::Rightmost => candidates[argmax(&widths)].clone(),
        BkAlign::UpLeft => candidates[0].clone(),
        BkAlign::UpRight => candidates[1].clone(),
        BkAlign::DownLeft => candidates[2].clone(),
        BkAlign::DownRight => candidates[3].clone(),
    };

    sanitize(&mut centres);
    repair_rank_order(&mut centres, &layout);
    centres
}

/// Rank-centred fallback used by `Coordinator::Simple`. Debug aid, no guarantees.
///
/// Each rank is packed left to right at exactly the required separations and then centred on
/// x = 0. Alignment is not attempted at all, so dummy chains bend; the value of this coordinator is
/// that its output is trivially predictable when a Brandes-Koepf result looks wrong.
///
/// The no-overlap postcondition still holds — it is satisfied by construction here.
pub fn simple_x(
    layered: &Layered,
    demand: &RoutingDemand,
    config: &CustomLayoutConfig,
) -> Vec<f64> {
    let layout = BkLayout::build(layered, demand, config);
    if layout.n == 0 {
        return Vec::new();
    }

    let mut centres = vec![0.0f64; layout.n];
    for (r, row) in layout.ranks.iter().enumerate() {
        if row.is_empty() {
            continue;
        }
        let mut running = vec![0.0f64; row.len()];
        for o in 1..row.len() {
            let sep = layout.sep[r].get(o - 1).copied().unwrap_or(0.0);
            running[o] = running[o - 1] + sep;
        }
        let first_w = layout.width[row[0] as usize];
        let last = row.len() - 1;
        let last_w = layout.width[row[last] as usize];
        let left_edge = running[0] - first_w / 2.0;
        let right_edge = running[last] + last_w / 2.0;
        let mid = (left_edge + right_edge) / 2.0;
        for (o, &v) in row.iter().enumerate() {
            centres[v as usize] = running[o] - mid;
        }
    }

    sanitize(&mut centres);
    repair_rank_order(&mut centres, &layout);
    centres
}

// ---------------------------------------------------------------------------------------------
// Layout view
// ---------------------------------------------------------------------------------------------

/// Sweep direction of a candidate pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Vertical {
    /// Sweep ranks top to bottom, aligning each item with its median **predecessor**.
    Up,
    /// Sweep ranks bottom to top, aligning each item with its median **successor**.
    Down,
}

/// Packing side of a candidate pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Horizontal {
    /// Blocks are pushed as far left as their separations allow.
    Left,
    /// Blocks are pushed as far right as their separations allow, by mirroring the layering.
    Right,
}

/// The read-only, pass-independent view of the ordered layering.
///
/// Everything Brandes-Koepf needs is denormalized into dense slices here exactly once, so the four
/// passes never touch `Layered` or a `HashMap` in a loop.
struct BkLayout {
    n: usize,
    /// Position of each item inside its rank, left to right.
    pos: Vec<u32>,
    width: Vec<f64>,
    /// Item indices per rank, left to right.
    ranks: Vec<Vec<u32>>,
    /// `sep[r][o]` is the required **centre-to-centre** distance between `ranks[r][o]` and
    /// `ranks[r][o + 1]`: both half widths plus the Phase 6 gap.
    sep: Vec<Vec<f64>>,
    /// CSR of predecessors (rank `r - 1`), each list sorted by position.
    up_off: Vec<u32>,
    up_tgt: Vec<u32>,
    /// CSR of successors (rank `r + 1`), each list sorted by position.
    down_off: Vec<u32>,
    down_tgt: Vec<u32>,
    /// True when the item is not a `Real` node, i.e. it may take part in an inner segment.
    inner: Vec<bool>,
}

impl BkLayout {
    fn build(layered: &Layered, demand: &RoutingDemand, config: &CustomLayoutConfig) -> BkLayout {
        let n = layered.items.len();
        let mut rank_of = vec![NO_RANK; n];
        let mut pos = vec![0u32; n];
        let mut ranks: Vec<Vec<u32>> = Vec::with_capacity(layered.rank_ranges.len());

        for (r, range) in layered.rank_ranges.iter().enumerate() {
            let lo = (range.start as usize).min(n);
            let hi = (range.end as usize).min(n);
            let mut row: Vec<u32> = (lo..hi.max(lo)).map(|i| i as u32).collect();
            // `order` is Phase 5's only output and is a permutation of `0..len`; sorting by it
            // makes this correct even if a future Phase 5 stops physically permuting the arena.
            // The item index is the tie-break so the result never depends on sort stability.
            row.sort_unstable_by_key(|&i| (layered.items[i as usize].order, i));
            for (o, &v) in row.iter().enumerate() {
                rank_of[v as usize] = r as u32;
                pos[v as usize] = o as u32;
            }
            ranks.push(row);
        }

        let width: Vec<f64> = layered
            .items
            .iter()
            .map(|it| {
                if it.width.is_finite() && it.width > 0.0 {
                    it.width
                } else {
                    0.0
                }
            })
            .collect();

        let inner: Vec<bool> = layered.items.iter().map(|it| !it.kind.is_real()).collect();

        let fallback = config.effective_node_gap();
        let sep: Vec<Vec<f64>> = ranks
            .iter()
            .enumerate()
            .map(|(r, row)| {
                (0..row.len().saturating_sub(1))
                    .map(|o| {
                        let a = width[row[o] as usize];
                        let b = width[row[o + 1] as usize];
                        let raw = if r <= u16::MAX as usize && o <= u16::MAX as usize {
                            demand
                                .separation_min
                                .get(&(r as u16, o as u16))
                                .copied()
                                .unwrap_or(fallback)
                        } else {
                            fallback
                        };
                        let gap = if raw.is_finite() && raw >= 0.0 {
                            raw
                        } else {
                            fallback
                        };
                        a / 2.0 + b / 2.0 + gap
                    })
                    .collect()
            })
            .collect();

        let (up_off, up_tgt) = sorted_adjacency(&layered.up, &rank_of, &pos, n, -1);
        let (down_off, down_tgt) = sorted_adjacency(&layered.down, &rank_of, &pos, n, 1);

        BkLayout {
            n,
            pos,
            width,
            ranks,
            sep,
            up_off,
            up_tgt,
            down_off,
            down_tgt,
            inner,
        }
    }

    #[inline]
    fn up_neighbours(&self, v: u32) -> &[u32] {
        let s = self.up_off[v as usize] as usize;
        let e = self.up_off[v as usize + 1] as usize;
        &self.up_tgt[s..e]
    }
}

/// Rebuilds one of `Layered`'s adjacency lists with every neighbour list sorted by rank position,
/// which turns the median lookup in the alignment pass into an O(1) index instead of a scan.
///
/// `delta` is `-1` for predecessors and `+1` for successors; entries whose rank does not match are
/// dropped. `Layered::up`/`down` are documented to be restricted to the adjacent rank, and
/// tolerating a violation silently here would corrupt every median rather than fail loudly later.
fn sorted_adjacency(
    csr: &Csr,
    rank_of: &[u32],
    pos: &[u32],
    n: usize,
    delta: i64,
) -> (Vec<u32>, Vec<u32>) {
    let mut offsets = vec![0u32; n + 1];
    let available = csr.node_count().min(n);

    let keep = |v: usize, t: usize| -> bool {
        t < n
            && rank_of[v] != NO_RANK
            && rank_of[t] != NO_RANK
            && rank_of[t] as i64 == rank_of[v] as i64 + delta
    };

    for v in 0..available {
        for &t in csr.neighbours(v as u32) {
            if keep(v, t as usize) {
                offsets[v + 1] += 1;
            }
        }
    }
    for v in 0..n {
        offsets[v + 1] += offsets[v];
    }

    let total = offsets[n] as usize;
    let mut targets = vec![0u32; total];
    let mut cursor: Vec<u32> = offsets[..n].to_vec();
    for (v, slot) in cursor.iter_mut().enumerate().take(available) {
        for &t in csr.neighbours(v as u32) {
            if keep(v, t as usize) {
                targets[*slot as usize] = t;
                *slot += 1;
            }
        }
    }

    for v in 0..n {
        let s = offsets[v] as usize;
        let e = offsets[v + 1] as usize;
        targets[s..e].sort_unstable_by_key(|&t| (pos[t as usize], t));
    }

    (offsets, targets)
}

// ---------------------------------------------------------------------------------------------
// Step 1: type-1 conflicts
// ---------------------------------------------------------------------------------------------

/// Canonical, direction-free key for a segment. Using the unordered item pair means one conflict
/// set serves both the upward and the downward passes.
#[inline]
fn segment_key(a: u32, b: u32) -> (u32, u32) {
    if a <= b {
        (a, b)
    } else {
        (b, a)
    }
}

/// Marks every non-inner segment that crosses an inner segment.
///
/// Determinism: the returned set is only ever queried by membership, never iterated, so its hash
/// order cannot influence any decision.
fn mark_type1_conflicts(layout: &BkLayout) -> HashSet<(u32, u32)> {
    let mut marked: HashSet<(u32, u32)> = HashSet::new();

    for i in 1..layout.ranks.len() {
        let prev_len = layout.ranks[i - 1].len() as i64;
        let layer = &layout.ranks[i];
        if layer.is_empty() {
            continue;
        }
        let last = layer.len() - 1;

        // `k0`/`k1` bracket the positions in the previous rank that the segments of the current
        // scan window are allowed to reach. Anything outside crosses an inner segment.
        let mut k0: i64 = 0;
        let mut scan_pos: usize = 0;

        for i1 in 0..layer.len() {
            let v = layer[i1];
            let partner = other_inner_segment_node(layout, v);
            if partner.is_none() && i1 != last {
                continue;
            }
            let k1: i64 = match partner {
                Some(u) => layout.pos[u as usize] as i64,
                None => prev_len - 1,
            };
            if scan_pos <= i1 {
                for &scan_node in &layer[scan_pos..=i1] {
                    for &u in layout.up_neighbours(scan_node) {
                        let u_pos = layout.pos[u as usize] as i64;
                        let crosses = u_pos < k0 || u_pos > k1;
                        let both_inner =
                            layout.inner[u as usize] && layout.inner[scan_node as usize];
                        if crosses && !both_inner {
                            marked.insert(segment_key(u, scan_node));
                        }
                    }
                }
            }
            scan_pos = i1 + 1;
            k0 = k1;
        }
    }

    marked
}

/// The predecessor that turns `v`'s incoming segment into an inner segment, if any.
///
/// A dummy or label item has exactly one predecessor by construction, so at most one candidate
/// exists; `find` is used rather than an index so a malformed chain cannot panic.
fn other_inner_segment_node(layout: &BkLayout, v: u32) -> Option<u32> {
    if !layout.inner[v as usize] {
        return None;
    }
    layout
        .up_neighbours(v)
        .iter()
        .copied()
        .find(|&u| layout.inner[u as usize])
}

// ---------------------------------------------------------------------------------------------
// Per-pass transformed view
// ---------------------------------------------------------------------------------------------

/// One of the four candidate passes, expressed as a transformed view of [`BkLayout`].
///
/// Rather than writing four near-identical alignment routines, the layering itself is transformed:
/// a `Down` pass reverses the rank order and reads the successor adjacency, a `Right` pass mirrors
/// each rank. The single generic routine below then always sweeps "downward" and packs "left", and
/// the caller mirrors the resulting x back for `Right`.
struct BkPass<'a> {
    ranks: Vec<Vec<u32>>,
    pos: Vec<u32>,
    rank_of: Vec<u32>,
    sep: Vec<Vec<f64>>,
    prev_off: &'a [u32],
    prev_tgt: &'a [u32],
    /// The base adjacency lists are sorted by base position; mirroring a rank reverses that order.
    mirrored: bool,
}

impl<'a> BkPass<'a> {
    fn build(base: &'a BkLayout, vert: Vertical, horiz: Horizontal) -> BkPass<'a> {
        let mut ranks = base.ranks.clone();
        let mut sep = base.sep.clone();

        if horiz == Horizontal::Right {
            for row in ranks.iter_mut() {
                row.reverse();
            }
            // `sep[r]` has one entry per adjacent pair, so mirroring the rank mirrors the pairs.
            for row in sep.iter_mut() {
                row.reverse();
            }
        }
        if vert == Vertical::Down {
            ranks.reverse();
            sep.reverse();
        }

        let mut pos = vec![0u32; base.n];
        let mut rank_of = vec![NO_RANK; base.n];
        for (r, row) in ranks.iter().enumerate() {
            for (o, &v) in row.iter().enumerate() {
                pos[v as usize] = o as u32;
                rank_of[v as usize] = r as u32;
            }
        }

        let (prev_off, prev_tgt) = match vert {
            Vertical::Up => (&base.up_off, &base.up_tgt),
            Vertical::Down => (&base.down_off, &base.down_tgt),
        };

        BkPass {
            ranks,
            pos,
            rank_of,
            sep,
            prev_off: prev_off.as_slice(),
            prev_tgt: prev_tgt.as_slice(),
            mirrored: horiz == Horizontal::Right,
        }
    }

    /// Neighbours of `v` in the previous rank of this pass's sweep.
    #[inline]
    fn prev_neighbours(&self, v: u32) -> &[u32] {
        let s = self.prev_off[v as usize] as usize;
        let e = self.prev_off[v as usize + 1] as usize;
        &self.prev_tgt[s..e]
    }

    /// `k`-th neighbour in **this pass's** left-to-right order.
    #[inline]
    fn nth(&self, list: &[u32], k: usize) -> u32 {
        if self.mirrored {
            list[list.len() - 1 - k]
        } else {
            list[k]
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Step 2: vertical alignment
// ---------------------------------------------------------------------------------------------

/// Builds the block structure for one pass.
///
/// Returns `(root, align)`: `root[v]` is the topmost item of `v`'s block, and `align` is a circular
/// linked list through each block. Two items share an x exactly when they share a root.
///
/// An alignment is taken only when the segment is unmarked **and** it does not cross an alignment
/// already committed in the same rank (`prev_idx`), which is what keeps the block structure planar
/// and therefore compactable without conflict.
fn vertical_alignment(
    pass: &BkPass,
    marked: &HashSet<(u32, u32)>,
    n: usize,
) -> (Vec<u32>, Vec<u32>) {
    let mut root: Vec<u32> = (0..n as u32).collect();
    let mut align: Vec<u32> = (0..n as u32).collect();

    for i in 1..pass.ranks.len() {
        let mut prev_idx: i64 = -1;
        for &v in &pass.ranks[i] {
            let list = pass.prev_neighbours(v);
            if list.is_empty() {
                continue;
            }
            let len = list.len();
            // Lower and upper median. For an even count the pass's leftmost item is tried first,
            // which is the "lower median for leftmost, upper median for rightmost" rule once the
            // mirroring of a `Right` pass is taken into account.
            let lo = (len - 1) / 2;
            let hi = len / 2;
            for m in lo..=hi {
                if align[v as usize] != v {
                    break;
                }
                let u = pass.nth(list, m);
                if marked.contains(&segment_key(u, v)) {
                    continue;
                }
                let u_pos = pass.pos[u as usize] as i64;
                if prev_idx >= u_pos {
                    continue;
                }
                align[u as usize] = v;
                root[v as usize] = root[u as usize];
                align[v as usize] = root[v as usize];
                prev_idx = u_pos;
            }
        }
    }

    (root, align)
}

// ---------------------------------------------------------------------------------------------
// Step 3: horizontal compaction
// ---------------------------------------------------------------------------------------------

/// Places every block by longest path in the block graph and merges the resulting classes.
///
/// Implemented with an explicit stack rather than recursion: block chains are as long as the
/// deepest dummy chain, and a 2 000-node graph would put that depth on the WASM stack.
///
/// The traversal budget is a guard against a malformed `align` cycle only; a well-formed block
/// structure visits each item at most twice. Bailing out early cannot produce an overlap because
/// [`repair_rank_order`] runs unconditionally afterwards.
fn horizontal_compaction(pass: &BkPass, root: &[u32], align: &[u32], n: usize) -> Vec<f64> {
    let mut x = vec![0.0f64; n];
    let mut placed = vec![false; n];
    let mut sink: Vec<u32> = (0..n as u32).collect();
    let mut shift = vec![f64::INFINITY; n];

    let mut budget = 4usize.saturating_mul(n).saturating_add(16);
    let mut stack: Vec<(u32, u32)> = Vec::new();

    // Ascending item index: deterministic, and independent of any hash iteration order.
    for v0 in 0..n as u32 {
        if root[v0 as usize] != v0 || placed[v0 as usize] {
            continue;
        }
        placed[v0 as usize] = true;
        x[v0 as usize] = 0.0;
        stack.clear();
        stack.push((v0, v0));

        // `.copied()` ends the borrow of `stack` at the condition, so the body may push and pop.
        while let Some((v, w)) = stack.last().copied() {
            if budget == 0 {
                break;
            }
            budget -= 1;

            let wi = w as usize;
            let p = pass.pos[wi];
            let r = pass.rank_of[wi];
            if p > 0 && r != NO_RANK {
                let row = &pass.ranks[r as usize];
                let left = row[(p - 1) as usize];
                let u = root[left as usize];
                if !placed[u as usize] {
                    placed[u as usize] = true;
                    x[u as usize] = 0.0;
                    stack.push((u, u));
                    continue;
                }
                let delta = pass.sep[r as usize]
                    .get((p - 1) as usize)
                    .copied()
                    .unwrap_or(0.0);
                if sink[v as usize] == v {
                    sink[v as usize] = sink[u as usize];
                }
                if sink[v as usize] != sink[u as usize] {
                    // Different classes: record how far this class may still be pushed right.
                    let s = sink[u as usize] as usize;
                    let candidate = x[v as usize] - x[u as usize] - delta;
                    if candidate < shift[s] {
                        shift[s] = candidate;
                    }
                } else {
                    let candidate = x[u as usize] + delta;
                    if candidate > x[v as usize] {
                        x[v as usize] = candidate;
                    }
                }
            }

            let next_w = align[wi];
            stack.pop();
            if next_w != v {
                stack.push((v, next_w));
            }
        }
    }

    let mut out = vec![0.0f64; n];
    for v in 0..n {
        let r = root[v] as usize;
        let mut xv = x[r];
        let s = sink[r] as usize;
        if shift[s].is_finite() {
            xv += shift[s];
        }
        out[v] = xv;
    }
    out
}

// ---------------------------------------------------------------------------------------------
// Step 4: balance
// ---------------------------------------------------------------------------------------------

/// Total horizontal extent of a candidate, outer edge to outer edge.
fn candidate_width(xs: &[f64], width: &[f64]) -> f64 {
    let mut lo = f64::INFINITY;
    let mut hi = f64::NEG_INFINITY;
    for (v, &x) in xs.iter().enumerate() {
        let half = width.get(v).copied().unwrap_or(0.0) / 2.0;
        lo = lo.min(x - half);
        hi = hi.max(x + half);
    }
    if lo.is_finite() && hi.is_finite() {
        hi - lo
    } else {
        0.0
    }
}

/// Shifts every candidate into a common frame: left-packed candidates share the reference's
/// minimum, right-packed candidates share its maximum. Without this the four candidates sit at
/// arbitrary offsets and averaging them would be meaningless.
fn align_candidates(
    candidates: &mut [Vec<f64>],
    reference: usize,
    combos: &[(Vertical, Horizontal); 4],
) {
    let (ref_min, ref_max) = match candidates.get(reference) {
        Some(xs) => (min_of(xs), max_of(xs)),
        None => return,
    };
    if !ref_min.is_finite() || !ref_max.is_finite() {
        return;
    }
    for (i, xs) in candidates.iter_mut().enumerate() {
        let horiz = combos.get(i).map(|c| c.1).unwrap_or(Horizontal::Left);
        let delta = match horiz {
            Horizontal::Left => ref_min - min_of(xs),
            Horizontal::Right => ref_max - max_of(xs),
        };
        if delta != 0.0 && delta.is_finite() {
            for x in xs.iter_mut() {
                *x += delta;
            }
        }
    }
}

/// Per item, the average of the two innermost of the four candidate values.
fn balance(candidates: &[Vec<f64>], n: usize) -> Vec<f64> {
    let mut out = vec![0.0f64; n];
    for (v, slot) in out.iter_mut().enumerate() {
        let mut vals = [0.0f64; 4];
        for (k, c) in candidates.iter().enumerate().take(4) {
            vals[k] = c.get(v).copied().unwrap_or(0.0);
        }
        vals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
        *slot = (vals[1] + vals[2]) / 2.0;
    }
    out
}

// ---------------------------------------------------------------------------------------------
// Postcondition
// ---------------------------------------------------------------------------------------------

/// Left-to-right repair: the non-negotiable postcondition of this phase.
///
/// Compaction should already satisfy every separation, but the published Brandes-Koepf class-merge
/// step has known edge cases. Running this makes "no two items in a rank overlap" unconditional
/// instead of dependent on the compaction being flawless, and it costs one linear pass.
fn repair_rank_order(centres: &mut [f64], layout: &BkLayout) {
    for (r, row) in layout.ranks.iter().enumerate() {
        for o in 1..row.len() {
            let prev = row[o - 1] as usize;
            let cur = row[o] as usize;
            let sep = layout.sep[r].get(o - 1).copied().unwrap_or(0.0);
            let need = centres[prev] + sep;
            if centres[cur] < need {
                centres[cur] = need;
            }
        }
    }
}

/// Replaces any non-finite coordinate with 0.0 so a single bad width cannot poison the whole
/// drawing through the repair pass or the balance average.
fn sanitize(xs: &mut [f64]) {
    for x in xs.iter_mut() {
        if !x.is_finite() {
            *x = 0.0;
        }
    }
}

fn min_of(xs: &[f64]) -> f64 {
    xs.iter().copied().fold(f64::INFINITY, f64::min)
}

fn max_of(xs: &[f64]) -> f64 {
    xs.iter().copied().fold(f64::NEG_INFINITY, f64::max)
}

/// Index of the smallest value; the first index wins a tie, so the choice is deterministic.
fn argmin(values: &[f64]) -> usize {
    let mut best = 0usize;
    for (i, &v) in values.iter().enumerate() {
        if v < values.get(best).copied().unwrap_or(f64::INFINITY) {
            best = i;
        }
    }
    best
}

/// Index of the largest value; the first index wins a tie.
fn argmax(values: &[f64]) -> usize {
    let mut best = 0usize;
    for (i, &v) in values.iter().enumerate() {
        if v > values.get(best).copied().unwrap_or(f64::NEG_INFINITY) {
            best = i;
        }
    }
    best
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Item, ItemKind};
    use std::collections::HashMap;

    /// Builds a `Layered` from a rank-major description plus adjacent-rank links given as global
    /// item indices. Items are laid out rank-major, so the global index of the `o`-th item of rank
    /// `r` is the running count of all items in earlier ranks plus `o`.
    fn make_layered(ranks: &[Vec<(ItemKind, f64, f64)>], links: &[(u32, u32)]) -> Layered {
        let mut items: Vec<Item> = Vec::new();
        let mut rank_ranges = Vec::new();
        for (r, row) in ranks.iter().enumerate() {
            let start = items.len() as u32;
            for (o, &(kind, width, height)) in row.iter().enumerate() {
                items.push(Item {
                    kind,
                    rank: r as u16,
                    order: o as u16,
                    width,
                    height,
                    x: 0.0,
                    y: 0.0,
                });
            }
            rank_ranges.push(start..items.len() as u32);
        }
        let n = items.len();
        let down_arcs: Vec<(u32, u32, u32)> = links
            .iter()
            .enumerate()
            .map(|(e, &(u, v))| (u, v, e as u32))
            .collect();
        let up_arcs: Vec<(u32, u32, u32)> = links
            .iter()
            .enumerate()
            .map(|(e, &(u, v))| (v, u, e as u32))
            .collect();
        Layered {
            items,
            rank_ranges,
            up: Csr::build(n, &up_arcs),
            down: Csr::build(n, &down_arcs),
            chains: Vec::new(),
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: Vec::new(),
        }
    }

    fn empty_demand() -> RoutingDemand {
        RoutingDemand::default()
    }

    fn real(w: f64) -> (ItemKind, f64, f64) {
        (ItemKind::Real(0), w, 60.0)
    }

    fn dummy(edge: u32, seq: u16) -> (ItemKind, f64, f64) {
        (ItemKind::Dummy { edge, seq }, 0.0, 0.0)
    }

    /// Asserts the phase postcondition: consecutive items in a rank are at least their required
    /// separation apart.
    fn assert_no_overlap(
        layered: &Layered,
        demand: &RoutingDemand,
        config: &CustomLayoutConfig,
        centres: &[f64],
    ) {
        for (r, range) in layered.rank_ranges.iter().enumerate() {
            let lo = range.start as usize;
            let hi = range.end as usize;
            for o in (lo + 1)..hi {
                let a = &layered.items[o - 1];
                let b = &layered.items[o];
                let gap = demand
                    .separation_min
                    .get(&(r as u16, (o - 1 - lo) as u16))
                    .copied()
                    .unwrap_or(config.effective_node_gap());
                let need = a.width / 2.0 + b.width / 2.0 + gap;
                let got = centres[o] - centres[o - 1];
                assert!(
                    got >= need - 1e-9,
                    "rank {r} pair {o}: need {need}, got {got}"
                );
            }
        }
    }

    /// Deterministic 64-bit LCG. A fixed seed keeps the property test reproducible.
    fn next_rand(state: &mut u64) -> u64 {
        *state = state
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        *state >> 33
    }

    #[test]
    fn empty_graph_yields_no_coordinates() {
        let layered = make_layered(&[], &[]);
        let cfg = CustomLayoutConfig::default();
        assert!(brandes_kopf_x(&layered, &empty_demand(), &cfg).is_empty());
        assert!(simple_x(&layered, &empty_demand(), &cfg).is_empty());
    }

    #[test]
    fn single_item_is_placed_without_panicking() {
        let layered = make_layered(&[vec![real(100.0)]], &[]);
        let cfg = CustomLayoutConfig::default();
        let xs = brandes_kopf_x(&layered, &empty_demand(), &cfg);
        assert_eq!(xs.len(), 1);
        assert!(xs[0].is_finite());
    }

    #[test]
    fn adjacent_items_in_a_rank_never_overlap_for_random_widths_and_separations() {
        let mut seed = 0xC0FFEEu64;
        let cfg = CustomLayoutConfig::default();

        for _trial in 0..64 {
            let rank_count = 2 + (next_rand(&mut seed) % 4) as usize;
            let mut ranks: Vec<Vec<(ItemKind, f64, f64)>> = Vec::new();
            for _ in 0..rank_count {
                let n = 1 + (next_rand(&mut seed) % 5) as usize;
                let mut row = Vec::new();
                for _ in 0..n {
                    let w = (next_rand(&mut seed) % 400) as f64;
                    let is_dummy = next_rand(&mut seed).rem_euclid(3) == 0;
                    if is_dummy {
                        row.push(dummy(0, 0));
                    } else {
                        row.push(real(w));
                    }
                }
                ranks.push(row);
            }

            // Random adjacent-rank links.
            let mut starts = Vec::new();
            let mut acc = 0u32;
            for row in &ranks {
                starts.push(acc);
                acc += row.len() as u32;
            }
            let mut links: Vec<(u32, u32)> = Vec::new();
            for r in 0..rank_count - 1 {
                let a = ranks[r].len();
                let b = ranks[r + 1].len();
                let count = 1 + (next_rand(&mut seed) % 4) as usize;
                for _ in 0..count {
                    let u = starts[r] + (next_rand(&mut seed) % a as u64) as u32;
                    let v = starts[r + 1] + (next_rand(&mut seed) % b as u64) as u32;
                    links.push((u, v));
                }
            }

            let layered = make_layered(&ranks, &links);

            let mut separation_min: HashMap<(u16, u16), f64> = HashMap::new();
            for (r, row) in ranks.iter().enumerate() {
                for o in 0..row.len().saturating_sub(1) {
                    let g = (next_rand(&mut seed) % 200) as f64;
                    separation_min.insert((r as u16, o as u16), g);
                }
            }
            let demand = RoutingDemand {
                separation_min,
                ..Default::default()
            };

            let centres = brandes_kopf_x(&layered, &demand, &cfg);
            assert_no_overlap(&layered, &demand, &cfg, &centres);

            let simple = simple_x(&layered, &demand, &cfg);
            assert_no_overlap(&layered, &demand, &cfg, &simple);
        }
    }

    #[test]
    fn a_dummy_chain_is_perfectly_straight_even_against_a_competing_real_path() {
        // rank 0: A                      (item 0)
        // rank 1: D0, B                  (items 1, 2)
        // rank 2: C,  D1                 (items 3, 4)
        // rank 3: E                      (item 5)
        //
        // The dummy chain A -> D0 -> D1 -> E crosses the real path A -> B -> C -> E, so the
        // segment B -> C is a type-1 conflict and must lose the alignment fight.
        let layered = make_layered(
            &[
                vec![real(100.0)],
                vec![dummy(0, 0), real(100.0)],
                vec![real(100.0), dummy(0, 1)],
                vec![real(100.0)],
            ],
            &[(0, 1), (1, 4), (4, 5), (0, 2), (2, 3), (3, 5)],
        );
        let cfg = CustomLayoutConfig::default();
        let centres = brandes_kopf_x(&layered, &empty_demand(), &cfg);

        assert_eq!(
            centres[1], centres[4],
            "dummy chain must be vertical: {centres:?}"
        );
        assert_no_overlap(&layered, &empty_demand(), &cfg, &centres);
    }

    #[test]
    fn a_long_dummy_chain_shares_one_x_across_every_rank() {
        let layered = make_layered(
            &[
                vec![real(120.0)],
                vec![dummy(0, 0), real(80.0)],
                vec![dummy(0, 1), real(80.0)],
                vec![dummy(0, 2), real(80.0)],
                vec![real(120.0)],
            ],
            &[
                (0, 1),
                (1, 3),
                (3, 5),
                (5, 7),
                (0, 2),
                (2, 4),
                (4, 6),
                (6, 7),
            ],
        );
        let cfg = CustomLayoutConfig::default();
        let centres = brandes_kopf_x(&layered, &empty_demand(), &cfg);
        assert_eq!(centres[1], centres[3]);
        assert_eq!(centres[3], centres[5]);
    }

    #[test]
    fn separation_min_is_honoured_exactly_at_the_tightest_pair() {
        // Two nodes in one rank with an explicit, unusual separation demand.
        let layered = make_layered(&[vec![real(100.0), real(60.0)]], &[]);
        let mut separation_min = HashMap::new();
        separation_min.insert((0u16, 0u16), 37.5);
        let demand = RoutingDemand {
            separation_min,
            ..Default::default()
        };
        let cfg = CustomLayoutConfig::default();
        let centres = brandes_kopf_x(&layered, &demand, &cfg);

        // 50 + 30 + 37.5 — exactly, not more: nothing else pushes these two apart.
        assert_eq!(centres[1] - centres[0], 117.5);
    }

    #[test]
    fn an_absent_separation_key_falls_back_to_the_configured_node_gap() {
        let layered = make_layered(&[vec![real(100.0), real(100.0)]], &[]);
        let cfg = CustomLayoutConfig::default();
        let centres = brandes_kopf_x(&layered, &empty_demand(), &cfg);
        assert_eq!(centres[1] - centres[0], 100.0 + cfg.effective_node_gap());
    }

    #[test]
    fn wide_label_items_are_separated_like_any_other_item() {
        let layered = make_layered(
            &[
                vec![real(100.0)],
                vec![(ItemKind::Label(0), 220.0, 28.0), real(100.0)],
                vec![real(100.0)],
            ],
            &[(0, 1), (1, 3), (0, 2), (2, 3)],
        );
        let cfg = CustomLayoutConfig::default();
        let centres = brandes_kopf_x(&layered, &empty_demand(), &cfg);
        assert!(centres[2] - centres[1] >= 110.0 + 50.0 + cfg.effective_node_gap() - 1e-9);
    }

    #[test]
    fn every_bk_align_variant_produces_a_valid_assignment() {
        let layered = make_layered(
            &[
                vec![real(100.0), real(140.0)],
                vec![real(90.0), real(90.0), real(90.0)],
                vec![real(200.0)],
            ],
            &[(0, 2), (0, 3), (1, 4), (2, 5), (3, 5), (4, 5)],
        );
        let demand = empty_demand();
        for align in [
            BkAlign::Median,
            BkAlign::Leftmost,
            BkAlign::Rightmost,
            BkAlign::UpLeft,
            BkAlign::UpRight,
            BkAlign::DownLeft,
            BkAlign::DownRight,
        ] {
            let cfg = CustomLayoutConfig {
                bk_align: align,
                ..CustomLayoutConfig::default()
            };
            let centres = brandes_kopf_x(&layered, &demand, &cfg);
            assert_eq!(centres.len(), layered.items.len());
            assert!(centres.iter().all(|x| x.is_finite()));
            assert_no_overlap(&layered, &demand, &cfg, &centres);
        }
    }

    #[test]
    fn simple_x_centres_each_rank_on_a_common_axis() {
        let layered = make_layered(
            &[vec![real(100.0)], vec![real(100.0), real(100.0)]],
            &[(0, 1), (0, 2)],
        );
        let cfg = CustomLayoutConfig::default();
        let xs = simple_x(&layered, &empty_demand(), &cfg);

        assert_eq!(xs[0], 0.0);
        // The two-item rank straddles the axis symmetrically.
        assert_eq!(xs[1], -xs[2]);
    }

    #[test]
    fn two_runs_over_the_same_input_are_byte_identical() {
        let layered = make_layered(
            &[
                vec![real(100.0), dummy(1, 0), real(140.0)],
                vec![real(90.0), real(90.0), dummy(1, 1)],
                vec![real(200.0), real(70.0)],
            ],
            &[
                (0, 3),
                (1, 5),
                (2, 4),
                (0, 4),
                (3, 6),
                (4, 6),
                (5, 7),
                (2, 3),
            ],
        );
        let mut separation_min = HashMap::new();
        separation_min.insert((0u16, 0u16), 21.0);
        separation_min.insert((1u16, 1u16), 44.0);
        let demand = RoutingDemand {
            separation_min,
            ..Default::default()
        };
        let cfg = CustomLayoutConfig::default();

        let a = brandes_kopf_x(&layered, &demand, &cfg);
        let b = brandes_kopf_x(&layered, &demand, &cfg);
        assert_eq!(a.len(), b.len());
        for (x, y) in a.iter().zip(b.iter()) {
            assert_eq!(x.to_bits(), y.to_bits());
        }
    }

    #[test]
    fn disconnected_items_do_not_break_compaction() {
        let layered = make_layered(
            &[
                vec![real(100.0), real(100.0)],
                vec![real(100.0), real(100.0)],
            ],
            &[(0, 2)],
        );
        let cfg = CustomLayoutConfig::default();
        let centres = brandes_kopf_x(&layered, &empty_demand(), &cfg);
        assert!(centres.iter().all(|x| x.is_finite()));
        assert_no_overlap(&layered, &empty_demand(), &cfg, &centres);
    }

    #[test]
    fn a_marked_segment_is_recorded_for_a_crossing_over_an_inner_segment() {
        let layered = make_layered(
            &[
                vec![real(100.0)],
                vec![dummy(0, 0), real(100.0)],
                vec![real(100.0), dummy(0, 1)],
                vec![real(100.0)],
            ],
            &[(0, 1), (1, 4), (4, 5), (0, 2), (2, 3), (3, 5)],
        );
        let cfg = CustomLayoutConfig::default();
        let layout = BkLayout::build(&layered, &empty_demand(), &cfg);
        let marked = mark_type1_conflicts(&layout);
        // B(item 2) -> C(item 3) crosses the inner segment D0(1) -> D1(4).
        assert!(marked.contains(&segment_key(2, 3)));
        // The inner segment itself is never marked.
        assert!(!marked.contains(&segment_key(1, 4)));
    }
}
