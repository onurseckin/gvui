//! # Step 2.2 (Phase 3): Network simplex ranking
//!
//! Gansner et al. (1993), §2. Minimises `Σ weight(u,v) · (rank(v) − rank(u))` subject to
//! `rank(v) − rank(u) >= min_len(u,v)`, and it is **optimal** for that objective — which is the
//! whole reason weights are worth exposing. A weight is not a nudge fed into a search that may or
//! may not converge; it is a coefficient in a linear program that is solved exactly. Doubling an
//! edge's weight has a predictable, monotone effect on how hard that edge is pulled taut.
//!
//! The shape of the algorithm:
//!
//! 1. Longest path gives a feasible starting ranking.
//! 2. Grow a spanning forest of *tight* arcs (slack 0), shifting whole unvisited components to make
//!    the cheapest frontier arc tight. Shifting a full component preserves every constraint inside
//!    it, and choosing the globally minimum frontier slack keeps every constraint crossing the
//!    frontier non-negative, so feasibility is never lost.
//! 3. Each tree arc has a cut value: the net weight that would be gained by stretching it. A
//!    negative cut value means the drawing gets shorter if the arc's head side moves away.
//! 4. Pivot on the most negative cut value until none remain.
//!
//! Cut values for *all* tree arcs are computed in one O(V + E) postorder pass rather than by
//! re-splitting the tree per arc, so a pivot costs O(V + E) and the whole solve stays affordable at
//! the graph sizes the renderer deals with.

use super::longest_path::rank_longest_path;
use crate::types::Csr;

/// Cut values are sums of `f64` weights, so a pivot must not be triggered by rounding noise —
/// a spurious pivot can be undone by the next one and the pair can cycle until the iteration
/// budget runs out.
const CUT_EPS: f64 = 1e-9;

/// A sanitised arc: endpoints known in range, tail != head, weight finite and non-negative.
#[derive(Clone, Copy)]
struct Arc {
    from: u32,
    to: u32,
    min_len: i32,
    weight: f64,
}

/// The tight spanning forest, rooted so that cut values can be aggregated bottom-up.
struct Forest {
    /// Parent node, `u32::MAX` for a root.
    parent: Vec<u32>,
    /// Index into the tree-arc list of the arc joining a node to its parent, `u32::MAX` for a root.
    parent_slot: Vec<u32>,
    /// Discovery order: a parent always precedes its descendants, so reverse order aggregates
    /// subtrees before the nodes that contain them.
    order: Vec<u32>,
    /// Which tree of the forest a node belongs to. Arcs never cross trees (a new root is only
    /// seeded once the current tree has exhausted its connected component), so a pivot may safely
    /// shift one tree without disturbing the others.
    tree_id: Vec<u32>,
    /// Undirected adjacency over tree arcs; values are tree-arc slots.
    adj: Csr,
}

/// Optimal rank assignment for the weighted edge-length objective.
///
/// `arcs` are `(from, to, min_len, weight)` over dense node indices, already acyclic and already
/// reversed by Phase 2. Arcs with equal endpoints or out-of-range endpoints are ignored; a
/// non-finite weight is read as the default 1.0 and a negative one is clamped to 0.0, because a
/// negative coefficient would invert the pivot rule and could make the solve diverge.
///
/// Returns `None` only when a feasible starting ranking cannot be established — in practice, when
/// the caller passed a constraint set with a cycle in it. Running out of `max_iterations` is **not**
/// a failure: the iterate is feasible at every step, so a truncated solve returns a valid, merely
/// sub-optimal ranking, which is strictly better than the longest-path fallback would be.
///
/// Guarantees:
///
/// - `rank[to] - rank[from] >= min_len` for every retained arc.
/// - Minimum rank is 0; every node in `0..node_count` has a rank.
/// - Deterministic: the leaving arc is chosen by (most negative cut value, lowest arc index) and
///   the entering arc by (least slack, lowest arc index). No hash iteration influences either.
pub fn rank_network_simplex(
    node_count: usize,
    arcs: &[(u32, u32, u16, f64)],
    max_iterations: usize,
) -> Option<Vec<u16>> {
    if node_count == 0 {
        return Some(Vec::new());
    }

    let arcs = sanitise(node_count, arcs);
    let mut ranks = feasible_start(node_count, &arcs)?;

    let incidence = undirected_incidence(node_count, &arcs);
    let mut tree = build_tight_tree(node_count, &arcs, &incidence, &mut ranks);
    if !is_feasible(&ranks, &arcs) {
        return None;
    }

    let mut in_tree = vec![false; arcs.len()];
    for &slot in &tree {
        in_tree[slot as usize] = true;
    }

    let mut subtree = vec![false; node_count];
    let mut in_head = vec![false; node_count];
    let mut stack: Vec<u32> = Vec::new();

    for _ in 0..max_iterations {
        let forest = root_forest(node_count, &arcs, &tree);
        let flux = subtree_flux(node_count, &arcs, &forest);

        let leaving = match select_leaving(node_count, &arcs, &tree, &forest, &flux) {
            Some(l) => l,
            // Every tree arc has a non-negative cut value: no shift can shorten the drawing, so
            // this ranking is optimal.
            None => break,
        };
        let (leave_arc, child, slot) = leaving;

        mark_subtree(child, &forest, &mut subtree, &mut stack);
        let this_tree = forest.tree_id[child as usize];
        let head_is_subtree = arcs[leave_arc as usize].to == child;
        for n in 0..node_count {
            in_head[n] = if head_is_subtree {
                subtree[n]
            } else {
                forest.tree_id[n] == this_tree && !subtree[n]
            };
        }

        let entering = select_entering(&arcs, &in_tree, &in_head, &forest, this_tree, &ranks);
        let (enter_arc, delta) = match entering {
            // Negative slack would mean feasibility had already been lost upstream, and no pivot can
            // repair that; stop on the last known-good ranking instead of shifting on a broken
            // invariant.
            Some((_, delta)) if delta < 0 => break,
            Some(e) => e,
            // Unreachable while the cut value is negative (a negative cut implies weight flowing
            // head-to-tail, and the only tree arc between the two sides is the leaving one), but a
            // stuck pivot must stop rather than spin.
            None => break,
        };

        if delta > 0 {
            for n in 0..node_count {
                if in_head[n] {
                    ranks[n] += delta;
                }
            }
        }
        in_tree[leave_arc as usize] = false;
        in_tree[enter_arc as usize] = true;
        tree[slot as usize] = enter_arc;
    }

    Some(normalise(&ranks))
}

/// Feasible ranking from a tight spanning tree, with no simplex pivots at all.
///
/// Cheaper than [`rank_network_simplex`] and usually much shorter than plain longest path — the
/// component shifts that make each frontier arc tight pull leaves down towards the neighbours they
/// actually connect to — but it optimises nothing and ignores weights entirely. Offered as a
/// Tier-2 knob for A/B comparison against the simplex.
///
/// Never fails: if the constraint set turns out to be infeasible (a cycle survived Phase 2) it
/// returns the longest-path ranking, which is total and normalised even then.
pub fn rank_tight_tree(node_count: usize, arcs: &[(u32, u32, u16)]) -> Vec<u16> {
    if node_count == 0 {
        return Vec::new();
    }

    let weighted: Vec<(u32, u32, u16, f64)> =
        arcs.iter().map(|&(f, t, m)| (f, t, m, 1.0)).collect();
    let sane = sanitise(node_count, &weighted);

    match feasible_start(node_count, &sane) {
        Some(mut ranks) => {
            let incidence = undirected_incidence(node_count, &sane);
            build_tight_tree(node_count, &sane, &incidence, &mut ranks);
            if is_feasible(&ranks, &sane) {
                normalise(&ranks)
            } else {
                rank_longest_path(node_count, arcs)
            }
        }
        None => rank_longest_path(node_count, arcs),
    }
}

/// Drops arcs no ranking could satisfy and repairs weights that would break the pivot rule.
fn sanitise(node_count: usize, arcs: &[(u32, u32, u16, f64)]) -> Vec<Arc> {
    let mut out = Vec::with_capacity(arcs.len());
    for &(from, to, min_len, weight) in arcs {
        if from == to || from as usize >= node_count || to as usize >= node_count {
            continue;
        }
        let weight = if weight.is_finite() {
            weight.max(0.0)
        } else {
            1.0
        };
        out.push(Arc {
            from,
            to,
            min_len: min_len as i32,
            weight,
        });
    }
    out
}

/// Longest path, re-checked. Simplex needs a *feasible* basis before it can evaluate any pivot, so
/// an infeasible start is reported rather than papered over.
fn feasible_start(node_count: usize, arcs: &[Arc]) -> Option<Vec<i32>> {
    let triples: Vec<(u32, u32, u16)> = arcs
        .iter()
        .map(|a| (a.from, a.to, a.min_len.clamp(0, u16::MAX as i32) as u16))
        .collect();
    let ranks: Vec<i32> = rank_longest_path(node_count, &triples)
        .into_iter()
        .map(|r| r as i32)
        .collect();
    if is_feasible(&ranks, arcs) {
        Some(ranks)
    } else {
        None
    }
}

fn is_feasible(ranks: &[i32], arcs: &[Arc]) -> bool {
    arcs.iter()
        .all(|a| ranks[a.to as usize] - ranks[a.from as usize] >= a.min_len)
}

/// Both directions of every arc, so component traversals can ignore orientation.
fn undirected_incidence(node_count: usize, arcs: &[Arc]) -> Csr {
    let mut triples = Vec::with_capacity(arcs.len() * 2);
    for (i, a) in arcs.iter().enumerate() {
        triples.push((a.from, a.to, i as u32));
        triples.push((a.to, a.from, i as u32));
    }
    Csr::build(node_count, &triples)
}

/// Grows a spanning forest of tight arcs, returning the arc indices that form it.
///
/// Each round takes the frontier arc — exactly one endpoint already in the forest — with the least
/// slack and makes it tight by shifting the *unvisited* endpoint's whole connected component. That
/// shift is safe because:
///
/// - arcs inside the moved component keep their slack (everything moves together);
/// - an arc with one end in the moved component and the other in the forest is itself a frontier
///   arc, so its slack is at least the minimum we shifted by, and the shift direction reduces slack
///   by at most that amount;
/// - any other arc touching the component would have its far end unvisited, hence inside the same
///   component by definition of connectivity.
///
/// Disconnected graphs seed a new root — the lowest unvisited index — when no frontier arc exists.
fn build_tight_tree(
    node_count: usize,
    arcs: &[Arc],
    incidence: &Csr,
    ranks: &mut [i32],
) -> Vec<u32> {
    let mut visited = vec![false; node_count];
    let mut tree: Vec<u32> = Vec::new();
    let mut visited_count = 0usize;
    let mut next_seed = 0usize;
    let mut scratch = ShiftScratch::new(node_count);

    while visited_count < node_count {
        let mut best: Option<(usize, i32)> = None;
        for (i, a) in arcs.iter().enumerate() {
            if visited[a.from as usize] == visited[a.to as usize] {
                continue;
            }
            let slack = ranks[a.to as usize] - ranks[a.from as usize] - a.min_len;
            match best {
                // `<=` keeps the lowest arc index on ties, which is what makes the forest — and
                // therefore every cut value derived from it — reproducible.
                Some((_, best_slack)) if best_slack <= slack => {}
                _ => best = Some((i, slack)),
            }
        }

        match best {
            Some((i, slack)) => {
                let a = arcs[i];
                let (grow_from, delta) = if visited[a.from as usize] {
                    (a.to, -slack)
                } else {
                    (a.from, slack)
                };
                if delta != 0 {
                    scratch.shift(grow_from, &visited, incidence, ranks, delta);
                }
                visited[grow_from as usize] = true;
                visited_count += 1;
                tree.push(i as u32);
            }
            None => {
                while next_seed < node_count && visited[next_seed] {
                    next_seed += 1;
                }
                if next_seed >= node_count {
                    break;
                }
                visited[next_seed] = true;
                visited_count += 1;
            }
        }
    }

    tree
}

/// Reusable buffers for component shifts. The tree build performs one shift per node in the worst
/// case, so a generation stamp replaces the per-call `visited` allocation a plain DFS would need.
struct ShiftScratch {
    stamp: Vec<u32>,
    generation: u32,
    stack: Vec<u32>,
}

impl ShiftScratch {
    fn new(node_count: usize) -> Self {
        ShiftScratch {
            stamp: vec![0u32; node_count],
            generation: 0,
            stack: Vec::new(),
        }
    }

    /// Adds `delta` to every node reachable from `start` without passing through a visited node.
    fn shift(
        &mut self,
        start: u32,
        visited: &[bool],
        incidence: &Csr,
        ranks: &mut [i32],
        delta: i32,
    ) {
        self.generation += 1;
        let generation = self.generation;
        self.stack.clear();
        self.stack.push(start);
        self.stamp[start as usize] = generation;
        while let Some(n) = self.stack.pop() {
            ranks[n as usize] += delta;
            for slot in incidence.range(n) {
                let m = incidence.targets[slot] as usize;
                if visited[m] || self.stamp[m] == generation {
                    continue;
                }
                self.stamp[m] = generation;
                self.stack.push(m as u32);
            }
        }
    }
}

/// Roots each tree of the forest at its lowest node index, recording parents and discovery order.
fn root_forest(node_count: usize, arcs: &[Arc], tree: &[u32]) -> Forest {
    let mut triples = Vec::with_capacity(tree.len() * 2);
    for (slot, &arc_index) in tree.iter().enumerate() {
        let a = arcs[arc_index as usize];
        triples.push((a.from, a.to, slot as u32));
        triples.push((a.to, a.from, slot as u32));
    }
    let adj = Csr::build(node_count, &triples);

    let mut parent = vec![u32::MAX; node_count];
    let mut parent_slot = vec![u32::MAX; node_count];
    let mut tree_id = vec![u32::MAX; node_count];
    let mut order = Vec::with_capacity(node_count);
    let mut stack: Vec<u32> = Vec::new();
    let mut next_tree = 0u32;

    for root in 0..node_count as u32 {
        if tree_id[root as usize] != u32::MAX {
            continue;
        }
        tree_id[root as usize] = next_tree;
        stack.push(root);
        while let Some(n) = stack.pop() {
            order.push(n);
            for slot in adj.range(n) {
                let m = adj.targets[slot] as usize;
                if tree_id[m] != u32::MAX {
                    continue;
                }
                tree_id[m] = next_tree;
                parent[m] = n;
                parent_slot[m] = adj.edges[slot];
                stack.push(m as u32);
            }
        }
        next_tree += 1;
    }

    Forest {
        parent,
        parent_slot,
        order,
        tree_id,
        adj,
    }
}

/// Signed weight crossing the boundary of each node's subtree:
/// `Σ w(a→b) for a inside, b outside` minus `Σ w(a→b) for a outside, b inside`.
///
/// The trick that makes this O(V + E): an arc with *both* ends inside a subtree contributes `+w` at
/// its tail and `−w` at its head and therefore cancels, so summing the per-node signed degree over
/// a subtree leaves exactly the boundary flow. A tree arc's cut value is then just this quantity at
/// its child endpoint, negated when the arc points into the subtree instead of out of it.
fn subtree_flux(node_count: usize, arcs: &[Arc], forest: &Forest) -> Vec<f64> {
    let mut flux = vec![0.0f64; node_count];
    for a in arcs {
        flux[a.from as usize] += a.weight;
        flux[a.to as usize] -= a.weight;
    }
    for &n in forest.order.iter().rev() {
        let p = forest.parent[n as usize];
        if p != u32::MAX {
            flux[p as usize] += flux[n as usize];
        }
    }
    flux
}

/// Picks the tree arc whose cut value is most negative: `(arc index, child endpoint, tree slot)`.
/// `None` means the current tree is optimal.
fn select_leaving(
    node_count: usize,
    arcs: &[Arc],
    tree: &[u32],
    forest: &Forest,
    flux: &[f64],
) -> Option<(u32, u32, u32)> {
    let mut best: Option<(f64, u32, u32, u32)> = None;
    for child in 0..node_count as u32 {
        let slot = forest.parent_slot[child as usize];
        if slot == u32::MAX {
            continue;
        }
        let arc_index = tree[slot as usize];
        let cut = if arcs[arc_index as usize].from == child {
            flux[child as usize]
        } else {
            -flux[child as usize]
        };
        if cut >= -CUT_EPS {
            continue;
        }
        let better = match best {
            None => true,
            Some((best_cut, best_arc, _, _)) => {
                cut < best_cut - CUT_EPS
                    || ((cut - best_cut).abs() <= CUT_EPS && arc_index < best_arc)
            }
        };
        if better {
            best = Some((cut, arc_index, child, slot));
        }
    }
    best.map(|(_, arc_index, child, slot)| (arc_index, child, slot))
}

/// Marks the subtree rooted at `child`, descending only through recorded parent links.
fn mark_subtree(child: u32, forest: &Forest, out: &mut [bool], stack: &mut Vec<u32>) {
    for slot in out.iter_mut() {
        *slot = false;
    }
    stack.clear();
    stack.push(child);
    out[child as usize] = true;
    while let Some(n) = stack.pop() {
        for slot in forest.adj.range(n) {
            let m = forest.adj.targets[slot] as usize;
            if out[m] || forest.parent[m] != n {
                continue;
            }
            out[m] = true;
            stack.push(m as u32);
        }
    }
}

/// Picks the non-tree arc running from the head component back to the tail component with the least
/// slack: `(arc index, slack)`. That slack is exactly how far the head component may be pushed
/// before this arc becomes tight, so it is also the pivot's shift amount.
fn select_entering(
    arcs: &[Arc],
    in_tree: &[bool],
    in_head: &[bool],
    forest: &Forest,
    this_tree: u32,
    ranks: &[i32],
) -> Option<(u32, i32)> {
    let mut best: Option<(u32, i32)> = None;
    for (i, a) in arcs.iter().enumerate() {
        if in_tree[i] {
            continue;
        }
        let from_head = in_head[a.from as usize];
        let to_tail = !in_head[a.to as usize] && forest.tree_id[a.to as usize] == this_tree;
        if !from_head || !to_tail {
            continue;
        }
        let slack = ranks[a.to as usize] - ranks[a.from as usize] - a.min_len;
        match best {
            Some((_, best_slack)) if best_slack <= slack => {}
            _ => best = Some((i as u32, slack)),
        }
    }
    best
}

/// Shifts to a minimum of 0 and clamps into `u16`, the width every downstream phase indexes with.
fn normalise(ranks: &[i32]) -> Vec<u16> {
    let min = ranks.iter().copied().min().unwrap_or(0);
    ranks
        .iter()
        .map(|&r| (r - min).clamp(0, u16::MAX as i32) as u16)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn feasible_weighted(rank: &[u16], arcs: &[(u32, u32, u16, f64)]) -> bool {
        arcs.iter().all(|&(from, to, min_len, _)| {
            rank[to as usize] as i32 - rank[from as usize] as i32 >= min_len as i32
        })
    }

    /// The objective network simplex claims to minimise.
    fn weighted_length(rank: &[u16], arcs: &[(u32, u32, u16, f64)]) -> f64 {
        arcs.iter()
            .map(|&(from, to, _, w)| w * (rank[to as usize] as f64 - rank[from as usize] as f64))
            .sum()
    }

    fn strip(arcs: &[(u32, u32, u16, f64)]) -> Vec<(u32, u32, u16)> {
        arcs.iter().map(|&(f, t, m, _)| (f, t, m)).collect()
    }

    #[test]
    fn beats_longest_path_on_a_late_source() {
        // 0 -> 1 -> 2 and 3 -> 2. Longest path pins the extra source 3 to rank 0 and stretches its
        // only arc across two ranks; the optimum drops it to rank 1, next to its successor.
        let arcs = [(0u32, 1u32, 1u16, 1.0f64), (1, 2, 1, 1.0), (3, 2, 1, 1.0)];
        let simplex = rank_network_simplex(4, &arcs, 16).expect("feasible");
        let greedy = rank_longest_path(4, &strip(&arcs));

        assert!(feasible_weighted(&simplex, &arcs));
        assert_eq!(greedy[3], 0);
        assert_eq!(simplex[3], 1);
        assert!(
            weighted_length(&simplex, &arcs) < weighted_length(&greedy, &arcs),
            "simplex {:?} must be strictly shorter than longest path {:?}",
            simplex,
            greedy
        );
    }

    #[test]
    fn a_heavy_arc_pulls_its_endpoints_adjacent() {
        // Skeleton with genuine freedom: node 1 may sit on rank 1 or rank 2 without violating
        // anything, so the weights alone decide which arc gets to be tight.
        let heavy_tail = [(0u32, 1u32, 1u16, 1.0f64), (0, 2, 3, 1.0), (1, 2, 1, 8.0)];
        let ranks = rank_network_simplex(3, &heavy_tail, 16).expect("feasible");
        assert!(feasible_weighted(&ranks, &heavy_tail));
        assert_eq!(
            ranks[2] - ranks[1],
            1,
            "heavy 1->2 must end up tight, got {:?}",
            ranks
        );

        let heavy_head = [(0u32, 1u32, 1u16, 8.0f64), (0, 2, 3, 1.0), (1, 2, 1, 1.0)];
        let ranks = rank_network_simplex(3, &heavy_head, 16).expect("feasible");
        assert!(feasible_weighted(&ranks, &heavy_head));
        assert_eq!(
            ranks[1] - ranks[0],
            1,
            "heavy 0->1 must end up tight, got {:?}",
            ranks
        );
    }

    #[test]
    fn optimum_is_reached_not_merely_improved() {
        // Exhaustive check on the same skeleton: no assignment within the feasible box beats the
        // one simplex returns.
        let arcs = [(0u32, 1u32, 1u16, 1.0f64), (0, 2, 3, 1.0), (1, 2, 1, 8.0)];
        let ranks = rank_network_simplex(3, &arcs, 16).expect("feasible");
        let best = weighted_length(&ranks, &arcs);
        for r1 in 0..8u16 {
            for r2 in 0..8u16 {
                let candidate = vec![0u16, r1, r2];
                if !feasible_weighted(&candidate, &arcs) {
                    continue;
                }
                assert!(
                    weighted_length(&candidate, &arcs) >= best - 1e-9,
                    "{:?} beats the claimed optimum {:?}",
                    candidate,
                    ranks
                );
            }
        }
    }

    #[test]
    fn diamond_matches_longest_path_when_nothing_can_improve() {
        let arcs = [
            (0u32, 1u32, 1u16, 1.0f64),
            (0, 2, 1, 1.0),
            (1, 3, 1, 1.0),
            (2, 3, 1, 1.0),
        ];
        assert_eq!(rank_network_simplex(4, &arcs, 16), Some(vec![0, 1, 1, 2]));
    }

    #[test]
    fn min_len_is_never_violated_by_a_pivot() {
        let arcs = [
            (0u32, 1u32, 2u16, 1.0f64),
            (1, 2, 2, 1.0),
            (0, 3, 1, 4.0),
            (3, 2, 1, 4.0),
            (4, 2, 1, 1.0),
        ];
        let ranks = rank_network_simplex(5, &arcs, 32).expect("feasible");
        assert!(feasible_weighted(&ranks, &arcs));
        assert_eq!(ranks.iter().copied().min(), Some(0));
    }

    #[test]
    fn empty_and_arcless_graphs_are_handled() {
        assert_eq!(rank_network_simplex(0, &[], 8), Some(Vec::new()));
        assert_eq!(rank_network_simplex(3, &[], 8), Some(vec![0, 0, 0]));
    }

    #[test]
    fn disconnected_components_are_all_ranked_from_zero() {
        // Two chains plus an isolated node; the forest has to seed three roots.
        let arcs = [(0u32, 1u32, 1u16, 1.0f64), (1, 2, 1, 1.0), (3, 4, 2, 1.0)];
        let ranks = rank_network_simplex(6, &arcs, 24).expect("feasible");
        assert!(feasible_weighted(&ranks, &arcs));
        assert_eq!(ranks[0], 0);
        assert_eq!(ranks[3], 0);
        assert_eq!(ranks[5], 0, "isolated node stays on rank 0");
        assert_eq!(ranks.iter().copied().min(), Some(0));
    }

    #[test]
    fn an_infeasible_constraint_set_reports_failure() {
        // A cycle survived Phase 2: no ranking exists, so the facade must be told rather than
        // handed nonsense.
        let arcs = [(0u32, 1u32, 1u16, 1.0f64), (1, 0, 1, 1.0)];
        assert_eq!(rank_network_simplex(2, &arcs, 8), None);
    }

    #[test]
    fn a_zero_iteration_budget_still_returns_a_feasible_ranking() {
        let arcs = [(0u32, 1u32, 1u16, 1.0f64), (0, 2, 3, 1.0), (1, 2, 1, 8.0)];
        let ranks = rank_network_simplex(3, &arcs, 0).expect("feasible");
        assert!(feasible_weighted(&ranks, &arcs));
    }

    #[test]
    fn hostile_weights_do_not_break_the_solve() {
        let arcs = [
            (0u32, 1u32, 1u16, f64::NAN),
            (1, 2, 1, -5.0),
            (0, 2, 1, f64::INFINITY),
            (0, 0, 1, 1.0),
            (9, 1, 1, 1.0),
        ];
        let ranks = rank_network_simplex(3, &arcs, 16).expect("feasible");
        assert_eq!(ranks.len(), 3);
        assert!(ranks[1] > ranks[0] && ranks[2] > ranks[1]);
    }

    #[test]
    fn repeated_runs_are_byte_identical() {
        let arcs = [
            (4u32, 2u32, 1u16, 3.0f64),
            (0, 4, 2, 1.0),
            (1, 2, 1, 5.0),
            (0, 1, 1, 1.0),
            (2, 3, 1, 1.0),
            (0, 3, 1, 2.0),
        ];
        let first = rank_network_simplex(5, &arcs, 20).expect("feasible");
        for _ in 0..8 {
            assert_eq!(rank_network_simplex(5, &arcs, 20), Some(first.clone()));
        }
    }

    #[test]
    fn tight_tree_is_feasible_and_compact() {
        // Same late-source graph: the tight tree pulls node 3 down without any pivot at all.
        let arcs = [(0u32, 1u32, 1u16), (1, 2, 1), (3, 2, 1)];
        let ranks = rank_tight_tree(4, &arcs);
        assert_eq!(ranks, vec![0, 1, 2, 1]);
    }

    #[test]
    fn tight_tree_handles_degenerate_input() {
        assert!(rank_tight_tree(0, &[(0, 1, 1)]).is_empty());
        assert_eq!(rank_tight_tree(3, &[]), vec![0, 0, 0]);
        // Infeasible input falls back to longest path rather than failing.
        let cyclic = [(0u32, 1u32, 1u16), (1, 0, 1)];
        let ranks = rank_tight_tree(2, &cyclic);
        assert_eq!(ranks.len(), 2);
        assert_eq!(ranks.iter().copied().min(), Some(0));
    }

    #[test]
    fn tight_tree_respects_min_len_on_a_diamond() {
        let arcs = [(0u32, 1u32, 2u16), (0, 2, 1), (1, 3, 1), (2, 3, 1)];
        let ranks = rank_tight_tree(4, &arcs);
        for &(from, to, min_len) in &arcs {
            assert!(
                ranks[to as usize] as i32 - ranks[from as usize] as i32 >= min_len as i32,
                "arc {}->{} violated in {:?}",
                from,
                to,
                ranks
            );
        }
        assert_eq!(ranks.iter().copied().min(), Some(0));
    }
}
