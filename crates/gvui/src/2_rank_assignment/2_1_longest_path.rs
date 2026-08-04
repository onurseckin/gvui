//! # Step 2.1 (Phase 3): Longest-path ranking
//!
//! The unconditional ranker. It runs in O(V + E), it cannot fail, and it produces the *tallest*
//! feasible ranking: every source sits on rank 0 and every other node sits exactly as far down as
//! its longest constrained ancestor path forces it.
//!
//! That makes it a poor default — a ten-node chain becomes ten ranks and a node whose only
//! successor is far below still hugs the top — but a perfect safety net. Network simplex starts
//! from it (a feasible starting basis is required before any pivot can be evaluated) and the facade
//! falls back to it when simplex reports infeasibility.

use crate::types::Csr;

/// Ranks every node by the longest `min_len`-weighted path ending at it.
///
/// `arcs` are `(from, to, min_len)` over dense node indices and must already be acyclic — Phase 2
/// reverses every feedback edge, so the caller hands us a DAG. Two classes of arc are dropped
/// silently because no ranking could ever satisfy them: an arc whose endpoints are equal (it would
/// also stall the topological sweep, since the node could never leave the frontier) and an arc
/// naming a node outside `node_count`.
///
/// Guarantees, in order of how much later phases depend on them:
///
/// - **Feasibility.** `rank[to] >= rank[from] + min_len` for every retained arc. Phase 4 turns a
///   violated `min_len` into a label item with nowhere to live, so this is not negotiable.
/// - **Totality.** Every node index in `0..node_count` gets a rank, including isolated ones, which
///   land on 0.
/// - **Normalisation.** The minimum rank is 0.
/// - **Determinism.** Byte-identical output for byte-identical input; nothing here consults a hash
///   container.
///
/// Ranks saturate at `u16::MAX` rather than wrapping. A graph deep enough to reach that is already
/// far outside anything the renderer can draw, and a saturated rank is a survivable artefact where
/// a wrapped one would silently invert the flow direction.
pub fn rank_longest_path(node_count: usize, arcs: &[(u32, u32, u16)]) -> Vec<u16> {
    let mut rank = vec![0u16; node_count];
    if node_count == 0 {
        return rank;
    }

    let kept = retain_rankable(node_count, arcs);
    let triples: Vec<(u32, u32, u32)> = kept
        .iter()
        .enumerate()
        .map(|(i, &(from, to, _))| (from, to, i as u32))
        .collect();
    let out = Csr::build(node_count, &triples);

    let mut in_degree = vec![0u32; node_count];
    for &(_, to, _) in &kept {
        in_degree[to as usize] += 1;
    }

    // Kahn's sweep. The ranks themselves do not depend on the order sources are drained in (the
    // recurrence is a max), but the traversal must still be reproducible, so the frontier is seeded
    // in ascending index order and consumed FIFO.
    let mut queue: Vec<u32> = (0..node_count as u32)
        .filter(|&n| in_degree[n as usize] == 0)
        .collect();
    let mut head = 0usize;
    let mut settled = 0usize;

    while head < queue.len() {
        let u = queue[head];
        head += 1;
        settled += 1;
        for slot in out.range(u) {
            let v = out.targets[slot] as usize;
            let min_len = kept[out.edges[slot] as usize].2;
            let need = rank[u as usize].saturating_add(min_len);
            if rank[v] < need {
                rank[v] = need;
            }
            in_degree[v] -= 1;
            if in_degree[v] == 0 {
                queue.push(v as u32);
            }
        }
    }

    // Defence in depth. Phase 2 promises a DAG, but a caller that hands us a cycle must still get a
    // total ranking rather than a half-ranked graph that crashes Phase 4. Bounded relaxation cannot
    // satisfy a cyclic constraint set, so it simply stops after `node_count` passes.
    if settled < node_count {
        relax_to_fixpoint(&mut rank, &kept, node_count);
    }

    normalise_to_zero(&mut rank);
    rank
}

/// Drops arcs that no ranking could satisfy, so every later step can assume well-formed endpoints.
fn retain_rankable(node_count: usize, arcs: &[(u32, u32, u16)]) -> Vec<(u32, u32, u16)> {
    let mut kept = Vec::with_capacity(arcs.len());
    for &(from, to, min_len) in arcs {
        if from == to || from as usize >= node_count || to as usize >= node_count {
            continue;
        }
        kept.push((from, to, min_len));
    }
    kept
}

/// Raises heads until no arc is short, or until `max_passes` is spent on a constraint set that has
/// no solution.
fn relax_to_fixpoint(rank: &mut [u16], arcs: &[(u32, u32, u16)], max_passes: usize) {
    for _ in 0..max_passes {
        let mut changed = false;
        for &(from, to, min_len) in arcs {
            let need = rank[from as usize].saturating_add(min_len);
            if rank[to as usize] < need {
                rank[to as usize] = need;
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
}

/// Shifts the whole ranking so the minimum rank is 0.
fn normalise_to_zero(rank: &mut [u16]) {
    let min = rank.iter().copied().min().unwrap_or(0);
    if min > 0 {
        for r in rank.iter_mut() {
            *r -= min;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// True when every arc's `min_len` is satisfied — the invariant Phase 4 relies on.
    fn feasible(rank: &[u16], arcs: &[(u32, u32, u16)]) -> bool {
        arcs.iter().all(|&(from, to, min_len)| {
            rank[to as usize] as i32 - rank[from as usize] as i32 >= min_len as i32
        })
    }

    #[test]
    fn diamond_ranks_are_zero_one_one_two() {
        // 0 -> {1, 2} -> 3
        let arcs = [(0, 1, 1), (0, 2, 1), (1, 3, 1), (2, 3, 1)];
        assert_eq!(rank_longest_path(4, &arcs), vec![0, 1, 1, 2]);
    }

    #[test]
    fn min_len_two_forces_an_intermediate_rank() {
        // This is the labelled-edge case: Phase 0 sets min_len = 2 so Phase 4 has a rank to host
        // the badge item on.
        let arcs = [(0, 1, 2)];
        assert_eq!(rank_longest_path(2, &arcs), vec![0, 2]);
    }

    #[test]
    fn longest_of_several_paths_wins() {
        // 0 -> 1 -> 2 -> 3 and 0 -> 3 directly: the head is pushed to the deep path's depth.
        let arcs = [(0, 1, 1), (1, 2, 1), (2, 3, 1), (0, 3, 1)];
        let rank = rank_longest_path(4, &arcs);
        assert_eq!(rank, vec![0, 1, 2, 3]);
        assert!(feasible(&rank, &arcs));
    }

    #[test]
    fn empty_graph_yields_no_ranks() {
        assert!(rank_longest_path(0, &[]).is_empty());
        assert!(rank_longest_path(0, &[(0, 1, 1)]).is_empty());
    }

    #[test]
    fn isolated_nodes_land_on_rank_zero() {
        assert_eq!(rank_longest_path(3, &[]), vec![0, 0, 0]);
        // A node with no arcs stays at 0 even when the rest of the graph is deep.
        let arcs = [(0, 1, 3)];
        assert_eq!(rank_longest_path(3, &arcs), vec![0, 3, 0]);
    }

    #[test]
    fn unsatisfiable_arcs_are_dropped_rather_than_panicking() {
        // Self-arc and out-of-range endpoint: both ignored, both would otherwise stall or index out
        // of bounds.
        let arcs = [(0, 0, 1), (0, 9, 1), (7, 1, 1), (0, 1, 1)];
        assert_eq!(rank_longest_path(2, &arcs), vec![0, 1]);
    }

    #[test]
    fn a_cycle_still_produces_a_total_ranking() {
        // Not a contract input, but it must not leave nodes unranked.
        let arcs = [(0, 1, 1), (1, 2, 1), (2, 0, 1)];
        let rank = rank_longest_path(3, &arcs);
        assert_eq!(rank.len(), 3);
        assert_eq!(rank.iter().copied().min(), Some(0));
    }

    #[test]
    fn min_len_zero_allows_a_shared_rank() {
        let arcs = [(0, 1, 0), (1, 2, 1)];
        let rank = rank_longest_path(3, &arcs);
        assert_eq!(rank, vec![0, 0, 1]);
        assert!(feasible(&rank, &arcs));
    }

    #[test]
    fn repeated_runs_are_byte_identical() {
        let arcs = [(3, 1, 1), (0, 3, 2), (2, 1, 1), (0, 2, 1), (1, 4, 1)];
        let first = rank_longest_path(5, &arcs);
        for _ in 0..8 {
            assert_eq!(rank_longest_path(5, &arcs), first);
        }
        assert!(feasible(&first, &arcs));
        assert_eq!(first.iter().copied().min(), Some(0));
    }
}
