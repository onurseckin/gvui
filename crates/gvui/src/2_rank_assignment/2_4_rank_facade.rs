//! # Step 2.4 (Phase 3): Rank facade
//!
//! Turns the structural DAG into a rank per node — the first genuinely *layered* artefact in the
//! pipeline, and the last chance to decide how tall and how wide the drawing is going to be.
//!
//! Everything downstream treats the rank assignment as settled fact: Phase 4 materialises one dummy
//! item per intermediate rank and puts each edge badge on a rank of its own, Phase 5 orders within
//! ranks, Phase 6 counts lanes per inter-rank channel. None of them can move a node between ranks,
//! so the two invariants this phase establishes — every node has a rank, and
//! `rank(to) >= rank(from) + min_len` for every arc — have to be true on the way out, not repaired
//! later.
//!
//! The `min_len` in that second invariant is the one **this phase decides**, not the one Phase 0
//! wrote: [`relax_peer_edges`] lowers peer edges to 0 first, and the whole phase then works from
//! that relaxed IR. A relaxed edge whose endpoints do land on one rank becomes a
//! [`FlatEdge`](crate::types::FlatEdge) in Phase 4.

use std::borrow::Cow;
use std::cmp::Ordering;

use super::longest_path::rank_longest_path;
use super::network_simplex::{rank_network_simplex, rank_tight_tree};
use super::rank_balancing::{balance_ranks, rank_arc, repair_feasibility};
use crate::config::CustomLayoutConfig;
use crate::types::{Csr, GraphIr, IrEdge, RankResult, Ranker, StructureResult};

/// Nodes a peer probe may visit before it gives up.
///
/// The probe answers "with this edge masked out, does another directed path `u -> v` still exist?".
/// A wrong *yes* costs the edge nothing but its same-rank treatment; a wrong *no* would let the
/// ranker collapse a genuine hierarchy onto one rank. Exhausting the budget is therefore answered
/// yes, which is why the cap can be small enough to keep the whole scan linear-ish in practice.
const PEER_PROBE_BUDGET: usize = 256;

/// Weight multiplier applied to every member of a parallel-edge bundle.
///
/// Network simplex is optimal for `Σ weight · span`, so an eight-fold weight is not a hint: it makes
/// stretching a bundle member eight times as expensive as stretching an ordinary edge, which keeps
/// the members of a bundle on the same pair of ranks and lets Phase 8 route them as one bus. Pulling
/// a bundle apart would have to save eight ordinary edge-ranks to be worth it.
pub const BUNDLE_WEIGHT_BOOST: f64 = 8.0;

/// Assigns a rank to every node.
///
/// Pipeline, in the order the steps have to happen:
///
/// 0. Relax peer edges to `min_len = 0` when `config.same_rank_peer_edges` is set, so the ranker is
///    *allowed* to put two siblings side by side. See [`relax_peer_edges`].
/// 1. Collect the ranking constraints — every non-self edge, already reversed by Phase 2, carrying
///    its `min_len` and its weight, with bundle members boosted by [`BUNDLE_WEIGHT_BOOST`].
/// 2. Run the configured ranker. Network simplex falls back to longest path if it reports
///    infeasibility; the fallback is silent because the only honest signal is the ranks themselves,
///    which are feasible either way.
/// 3. Park isolated nodes on rank 0 — they constrain nothing and are not entitled to depth.
/// 4. Apply pinned ranks, then repair feasibility so the pins cannot leave an arc short.
/// 5. Balance rank widths, unless pins are in play (a pin is an explicit instruction the balancer
///    has no business overriding) or the caller turned balancing off.
/// 6. Normalise to a minimum rank of 0 and index the members of each rank.
///
/// On the interaction between pins and normalisation: pins are honoured exactly whenever some node
/// ends up on rank 0, which is the normal case. If the repair pass lifts *every* node above 0, the
/// whole drawing slides up so it can start at rank 0 — the pins stay correct relative to each other,
/// which is what a rank pin actually means to a layered layout.
///
/// `rank_members` comes back sorted ascending by node index. That is a stable, arbitrary order, not
/// a layout decision: Phase 5 owns the order within a rank and will permute it.
pub fn assign_ranks(
    ir: &GraphIr,
    structure: &StructureResult,
    config: &CustomLayoutConfig,
) -> RankResult {
    let node_count = ir.node_count();
    if node_count == 0 {
        return RankResult::default();
    }

    // Every step below reads its constraints from `graph`, never from the caller's `ir`: the peer
    // relaxation has to be visible to `balance_ranks` too, which re-derives the arc set from the IR
    // rather than taking one.
    let working = relax_peer_edges(ir, structure, config);
    let graph_owned: Option<GraphIr> = None;
    let graph: &GraphIr = working.as_ref();

    let run_ranker = |graph: &GraphIr| -> Vec<u16> {
        let weighted = weighted_arcs(graph, structure);
        let plain: Vec<(u32, u32, u16)> = weighted
            .iter()
            .map(|&(from, to, min_len, _)| (from, to, min_len))
            .collect();
        match config.ranker {
            Ranker::NetworkSimplex => {
                rank_network_simplex(node_count, &weighted, node_count.saturating_mul(4))
                    .unwrap_or_else(|| rank_longest_path(node_count, &plain))
            }
            Ranker::LongestPath => rank_longest_path(node_count, &plain),
            Ranker::TightTree => rank_tight_tree(node_count, &plain),
        }
    };

    let mut rank_of = run_ranker(graph);
    let _ = &graph_owned;

    let weighted = weighted_arcs(graph, structure);
    let plain: Vec<(u32, u32, u16)> = weighted
        .iter()
        .map(|&(from, to, min_len, _)| (from, to, min_len))
        .collect();
    // A ranker is contractually total, but a short vector here would panic several phases later
    // with no trace of where it came from.
    if rank_of.len() != node_count {
        rank_of.resize(node_count, 0);
    }

    let mut constrained = vec![false; node_count];
    for &(from, to, _) in &plain {
        constrained[from as usize] = true;
        constrained[to as usize] = true;
    }
    for (n, &is_constrained) in constrained.iter().enumerate() {
        if !is_constrained {
            rank_of[n] = 0;
        }
    }

    if graph.has_pinned_ranks {
        for (n, node) in graph.nodes.iter().enumerate().take(node_count) {
            if let Some(rank) = node.pinned_rank {
                rank_of[n] = rank;
            }
        }
        repair_feasibility(&mut rank_of, &plain, node_count);
    } else if config.balance_ranks {
        balance_ranks(&mut rank_of, graph, structure, config);
    }

    // Must be the LAST thing that touches `rank_of`. A labelled edge relaxed to `min_len = 0` can
    // legitimately land at span 0 — that is a flat edge and its badge rides the horizontal run —
    // but `balance_ranks` may then push the target down one, leaving span 1. Span 1 is the one
    // value a labelled edge cannot be drawn at: there is no intermediate rank for the `Label` item,
    // so `build_layered` degrades to `label_at = None` and the badge falls through to Phase 8's
    // positional safety net, which is allowed to emit a leader line and is covered by no
    // reservation. Running this before balancing (as an earlier revision did) inspects a rank
    // vector that balancing then invalidates.
    enforce_labelled_span(&mut rank_of, graph, structure, &plain, node_count);

    let min = rank_of.iter().copied().min().unwrap_or(0);
    if min > 0 {
        for rank in rank_of.iter_mut() {
            *rank -= min;
        }
    }

    let max_rank = rank_of.iter().copied().max().unwrap_or(0);
    let mut rank_members: Vec<Vec<u32>> = vec![Vec::new(); max_rank as usize + 1];
    for (n, &rank) in rank_of.iter().enumerate() {
        rank_members[rank as usize].push(n as u32);
    }

    RankResult {
        rank_of,
        max_rank,
        rank_members,
    }
}

/// The IR this phase works from, with every peer edge relaxed to `min_len = 0`.
///
/// Borrows the caller's IR whenever nothing is relaxed, so the clone is paid only by graphs that
/// actually contain peers.
///
/// The relaxation is materialised **in the IR** rather than only in the arc list handed to the
/// ranker because [`balance_ranks`] re-derives the constraint set from the IR itself and closes with
/// a feasibility repair. Given the caller's IR that repair would read `min_len = 1` for a peer edge
/// and pull an equal-ranked pair straight back apart, silently undoing the whole feature.
fn relax_peer_edges<'a>(
    ir: &'a GraphIr,
    structure: &StructureResult,
    config: &CustomLayoutConfig,
) -> Cow<'a, GraphIr> {
    if !config.same_rank_peer_edges {
        return Cow::Borrowed(ir);
    }
    let peers = peer_edges(ir, structure);
    if peers.is_empty() {
        return Cow::Borrowed(ir);
    }
    let mut relaxed = ir.clone();
    for &e in &peers {
        if let Some(edge) = relaxed.edges.get_mut(e as usize) {
            edge.min_len = 0;
        }
    }
    Cow::Owned(relaxed)
}

/// Pushes apart any **labelled** edge left spanning exactly one rank.
///
/// A labelled edge is drawable at span 0 or span >= 2 and at no other value. At span 0 it is a flat
/// edge whose badge sits on the horizontal run; at span >= 2 the middle intermediate rank carries a
/// `Label` item whose box reserves the badge area. At span 1 it has neither.
///
/// Only edges actually sitting at span 1 are constrained — an edge resting at span 0 is left alone,
/// because that is the same-rank placement the peer relaxation exists to produce.
///
/// [`repair_feasibility`] only ever raises ranks, so each pass is monotone and the loop terminates;
/// the bound is belt-and-braces. This runs after balancing because balancing is the step most likely
/// to create the condition.
///
/// Measured before this existed: scenario 17 ("Cyclic Agent Execution Trace") emitted a badge with a
/// leader line overlapping two nodes — the only constraint violation in the whole suite.
fn enforce_labelled_span(
    rank_of: &mut [u16],
    graph: &GraphIr,
    structure: &StructureResult,
    plain: &[(u32, u32, u16)],
    node_count: usize,
) {
    for _ in 0..node_count.saturating_add(1) {
        let mut arcs: Vec<(u32, u32, u16)> = plain.to_vec();
        let mut tightened = false;

        for arc in arcs.iter_mut() {
            let (from, to, min_len) = *arc;
            if min_len >= 2 {
                continue;
            }
            let (Some(&rf), Some(&rt)) = (rank_of.get(from as usize), rank_of.get(to as usize))
            else {
                continue;
            };
            if rt as i32 - rf as i32 != 1 {
                continue;
            }
            // Only labelled edges care; an unlabelled span-1 edge is perfectly drawable.
            if !arc_is_labelled(graph, structure, from, to) {
                continue;
            }
            arc.2 = 2;
            tightened = true;
        }

        if !tightened {
            return;
        }
        repair_feasibility(rank_of, &arcs, node_count);
    }
}

/// True when some non-self edge with these oriented endpoints carries a label.
fn arc_is_labelled(graph: &GraphIr, structure: &StructureResult, from: u32, to: u32) -> bool {
    // `structure` is produced upstream and a length mismatch is an upstream bug we must survive
    // rather than amplify — this phase has no retry to fall back on.
    (0..graph.edge_count() as u32).any(|e| {
        let idx = e as usize;
        let Some(role) = structure.roles.get(idx) else {
            return false;
        };
        if role.is_self_loop() || graph.edges[idx].label.is_none() {
            return false;
        }
        if structure.reversed.len() <= idx {
            return false;
        }
        structure.arc(graph, e) == (from, to)
    })
}


/// Edge indices of the *peer* edges, ascending.
///
/// An edge `u -> v` of the cycle-broken DAG is a peer edge when all three hold:
///
/// 1. it still carries the `min_len` ingest would have defaulted to (see [`has_default_min_len`]),
///    so an explicit host `min_len` is never overridden;
/// 2. `u` and `v` share at least one predecessor — they are siblings hanging off a common parent,
///    which is the shape a reader expects to see side by side;
/// 3. masking this edge out leaves no other directed path from `u` to `v`.
///
/// Rule 3 is what makes the relaxation safe rather than merely optimistic: `min_len = 0` only ever
/// *permits* equality, and if some other path `u -> x -> v` existed the constraint system would
/// force `rank(v) >= rank(u) + 2` regardless — so the relaxation could never create a cycle, but it
/// would waste a rank pretending the edge might be flat. The probe is bounded by
/// [`PEER_PROBE_BUDGET`] and answers "path exists" when it runs out, which keeps the edge
/// hierarchical.
///
/// Determinism: arcs are visited in ascending edge order, both adjacency structures are built from
/// that same ordered list, and the probe is FIFO — so the budget cut-off, the only order-sensitive
/// part of the answer, lands in the same place on every run.
fn peer_edges(ir: &GraphIr, structure: &StructureResult) -> Vec<u32> {
    let node_count = ir.node_count();
    if node_count == 0 {
        return Vec::new();
    }

    let mut arcs: Vec<(u32, u32, u32)> = Vec::with_capacity(ir.edge_count());
    for e in 0..ir.edge_count() as u32 {
        if let Some((from, to)) = rank_arc(ir, structure, e) {
            arcs.push((from, to, e));
        }
    }
    if arcs.is_empty() {
        return Vec::new();
    }

    let succ = Csr::build(node_count, &arcs);
    // Sorting the transposed triples before the build is what leaves each predecessor row in
    // ascending node order, which is the precondition of the merge in `share_a_predecessor`.
    let mut back: Vec<(u32, u32, u32)> = arcs.iter().map(|&(f, t, e)| (t, f, e)).collect();
    back.sort_unstable();
    let pred = Csr::build(node_count, &back);

    // Generation stamps instead of a fresh `visited` vector per probe: one allocation for the whole
    // scan, and clearing is a counter bump.
    let mut stamp = vec![0u32; node_count];
    let mut generation = 0u32;
    let mut frontier: Vec<u32> = Vec::with_capacity(PEER_PROBE_BUDGET.min(node_count));
    let mut peers: Vec<u32> = Vec::new();

    for &(from, to, e) in &arcs {
        let Some(edge) = ir.edges.get(e as usize) else {
            continue;
        };
        if !has_default_min_len(edge) {
            continue;
        }
        if !share_a_predecessor(&pred, from, to) {
            continue;
        }
        generation = generation.wrapping_add(1);
        if generation == 0 {
            // Wrapped: every stale stamp would alias the new generation.
            stamp.iter_mut().for_each(|s| *s = 0);
            generation = 1;
        }
        if !path_exists_without(&succ, from, to, e, &mut stamp, generation, &mut frontier) {
            peers.push(e);
        }
    }

    peers
}

/// True when `edge` still carries the `min_len` [`crate::ingest::build_graph_ir`] defaults to.
///
/// A host that sent an explicit `min_len` is giving an instruction about rank separation, and peer
/// detection must not silently override it. The two defaults (2 with a badge, 1 without) are the
/// only values treated as "no opinion"; an explicit value that happens to equal its own default is
/// indistinguishable from the default and is treated as one, which is harmless because the two ask
/// for the same thing.
fn has_default_min_len(edge: &IrEdge) -> bool {
    edge.min_len == if edge.label.is_some() { 2 } else { 1 }
}

/// True when `u` and `v` have a predecessor in common. Both rows are ascending, so this is a merge.
fn share_a_predecessor(pred: &Csr, u: u32, v: u32) -> bool {
    let a = pred.neighbours(u);
    let b = pred.neighbours(v);
    let (mut i, mut j) = (0usize, 0usize);
    while i < a.len() && j < b.len() {
        match a[i].cmp(&b[j]) {
            Ordering::Less => i += 1,
            Ordering::Greater => j += 1,
            Ordering::Equal => return true,
        }
    }
    false
}

/// Forward reachability probe from `from` to `to` with arc `masked` removed.
///
/// Masks by **edge index**, not by endpoint pair, so one of two parallel `u -> v` edges still sees
/// the other and neither is mistaken for a peer.
///
/// Returns `true` — "a path exists" — both when `to` is reached and when the visit budget runs out,
/// because the caller uses a `false` to widen what the ranker may do.
fn path_exists_without(
    succ: &Csr,
    from: u32,
    to: u32,
    masked: u32,
    stamp: &mut [u32],
    generation: u32,
    frontier: &mut Vec<u32>,
) -> bool {
    frontier.clear();
    frontier.push(from);
    if let Some(slot) = stamp.get_mut(from as usize) {
        *slot = generation;
    }

    let mut head = 0usize;
    let mut visited = 1usize;
    while head < frontier.len() {
        let u = frontier[head];
        head += 1;
        for slot in succ.range(u) {
            if succ.edges[slot] == masked {
                continue;
            }
            let v = succ.targets[slot];
            if v == to {
                return true;
            }
            let Some(seen) = stamp.get_mut(v as usize) else {
                continue;
            };
            if *seen == generation {
                continue;
            }
            *seen = generation;
            visited += 1;
            if visited > PEER_PROBE_BUDGET {
                return true;
            }
            frontier.push(v);
        }
    }
    false
}

/// The ranking constraint set: `(from, to, min_len, weight)` for every edge that constrains a rank.
///
/// Self-loops and unresolvable endpoints are filtered by [`rank_arc`]. A non-finite weight falls
/// back to 1.0 and a negative one is clamped to 0.0, so a hostile input can make an edge
/// *unimportant* but never make the objective unbounded.
fn weighted_arcs(ir: &GraphIr, structure: &StructureResult) -> Vec<(u32, u32, u16, f64)> {
    let mut arcs = Vec::with_capacity(ir.edge_count());
    for e in 0..ir.edge_count() as u32 {
        let (from, to) = match rank_arc(ir, structure, e) {
            Some(pair) => pair,
            None => continue,
        };
        let edge = &ir.edges[e as usize];
        let mut weight = if edge.weight.is_finite() {
            edge.weight.max(0.0)
        } else {
            1.0
        };
        if edge.bundle.is_some() {
            weight *= BUNDLE_WEIGHT_BOOST;
        }
        arcs.push((from, to, edge.min_len, weight));
    }
    arcs
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{EdgeRole, IrNode, LabelBox};

    struct EdgeSpec {
        source: u32,
        target: u32,
        min_len: u16,
        weight: f64,
        bundle: Option<u32>,
        label: Option<LabelBox>,
    }

    fn edge(source: u32, target: u32, min_len: u16) -> EdgeSpec {
        EdgeSpec {
            source,
            target,
            min_len,
            weight: 1.0,
            bundle: None,
            label: None,
        }
    }

    fn ir_of(node_count: usize, edges: Vec<EdgeSpec>) -> GraphIr {
        let mut ir = GraphIr {
            node_names: (0..node_count).map(|i| format!("n{}", i)).collect(),
            node_labels: vec![None; node_count],
            edge_names: (0..edges.len()).map(|i| format!("e{}", i)).collect(),
            ..GraphIr::default()
        };
        ir.nodes = (0..node_count)
            .map(|i| IrNode {
                name: i as u32,
                width: 120.0,
                height: 60.0,
                pinned_rank: None,
                degree: 0,
            })
            .collect();
        ir.edges = edges
            .iter()
            .enumerate()
            .map(|(i, spec)| IrEdge {
                name: i as u32,
                source: spec.source,
                target: spec.target,
                label: spec.label,
                weight: spec.weight,
                min_len: spec.min_len,
                hint: None,
                bundle: spec.bundle,
            })
            .collect();
        for e in &ir.edges {
            ir.nodes[e.source as usize].degree += 1;
            ir.nodes[e.target as usize].degree += 1;
        }
        let out: Vec<(u32, u32, u32)> = ir
            .edges
            .iter()
            .enumerate()
            .map(|(i, e)| (e.source, e.target, i as u32))
            .collect();
        let inc: Vec<(u32, u32, u32)> = ir
            .edges
            .iter()
            .enumerate()
            .map(|(i, e)| (e.target, e.source, i as u32))
            .collect();
        ir.out_csr = Csr::build(node_count, &out);
        ir.in_csr = Csr::build(node_count, &inc);
        ir
    }

    fn dag_structure(ir: &GraphIr) -> StructureResult {
        StructureResult {
            roles: ir
                .edges
                .iter()
                .map(|e| {
                    if e.source == e.target {
                        EdgeRole::SelfLoop
                    } else {
                        EdgeRole::Forward
                    }
                })
                .collect(),
            reversed: vec![false; ir.edge_count()],
            self_loops: ir
                .edges
                .iter()
                .enumerate()
                .filter(|(_, e)| e.source == e.target)
                .map(|(i, _)| i as u32)
                .collect(),
            is_dag: true,
        }
    }

    /// Balancing and peer relaxation off, so a test can observe the ranker's own output on exactly
    /// the constraint set it was handed.
    fn raw_config(ranker: Ranker) -> CustomLayoutConfig {
        CustomLayoutConfig {
            ranker,
            balance_ranks: false,
            same_rank_peer_edges: false,
            ..CustomLayoutConfig::default()
        }
    }

    /// The separation the phase actually promises: each edge's `min_len`, with peer edges relaxed
    /// to 0 exactly as [`assign_ranks`] relaxes them.
    fn effective_min_len(
        ir: &GraphIr,
        structure: &StructureResult,
        config: &CustomLayoutConfig,
    ) -> Vec<u16> {
        let mut out: Vec<u16> = ir.edges.iter().map(|e| e.min_len).collect();
        if config.same_rank_peer_edges {
            for e in peer_edges(ir, structure) {
                out[e as usize] = 0;
            }
        }
        out
    }

    fn assert_result_is_consistent(
        result: &RankResult,
        ir: &GraphIr,
        structure: &StructureResult,
        config: &CustomLayoutConfig,
    ) {
        let min_lens = effective_min_len(ir, structure, config);
        assert_eq!(result.rank_of.len(), ir.node_count());
        assert_eq!(
            result.rank_of.iter().copied().max().unwrap_or(0),
            result.max_rank
        );
        assert_eq!(result.rank_members.len(), result.max_rank as usize + 1);
        assert_eq!(result.rank_of.iter().copied().min().unwrap_or(0), 0);

        let mut seen = 0usize;
        for (r, members) in result.rank_members.iter().enumerate() {
            let mut sorted = members.clone();
            sorted.sort_unstable();
            assert_eq!(&sorted, members, "rank {} members are not ascending", r);
            for &n in members {
                assert_eq!(result.rank_of[n as usize] as usize, r);
                seen += 1;
            }
        }
        assert_eq!(seen, ir.node_count(), "every node must appear exactly once");

        for e in 0..ir.edge_count() as u32 {
            if let Some((from, to)) = rank_arc(ir, structure, e) {
                let min_len = min_lens[e as usize] as i32;
                assert!(
                    result.rank_of[to as usize] as i32 - result.rank_of[from as usize] as i32
                        >= min_len,
                    "edge {} violates min_len in {:?}",
                    e,
                    result.rank_of
                );
            }
        }
    }

    #[test]
    fn diamond_ranks_and_members() {
        let ir = ir_of(
            4,
            vec![edge(0, 1, 1), edge(0, 2, 1), edge(1, 3, 1), edge(2, 3, 1)],
        );
        let structure = dag_structure(&ir);
        let result = assign_ranks(&ir, &structure, &raw_config(Ranker::NetworkSimplex));

        assert_eq!(result.rank_of, vec![0, 1, 1, 2]);
        assert_eq!(result.max_rank, 2);
        assert_eq!(
            result.rank_members,
            vec![vec![0], vec![1, 2], vec![3]]
        );
        assert_result_is_consistent(&result, &ir, &structure, &raw_config(Ranker::NetworkSimplex));
    }

    #[test]
    fn every_ranker_produces_a_feasible_total_ranking() {
        let ir = ir_of(
            6,
            vec![
                edge(0, 1, 1),
                edge(1, 2, 2),
                edge(3, 2, 1),
                edge(0, 4, 1),
                edge(4, 2, 1),
            ],
        );
        let structure = dag_structure(&ir);
        for ranker in [Ranker::NetworkSimplex, Ranker::LongestPath, Ranker::TightTree] {
            let result = assign_ranks(&ir, &structure, &raw_config(ranker));
            assert_result_is_consistent(&result, &ir, &structure, &raw_config(ranker));
            assert_eq!(result.rank_of[5], 0, "isolated node belongs on rank 0");
        }
    }

    #[test]
    fn empty_graph_returns_an_empty_result() {
        let ir = ir_of(0, vec![]);
        let structure = dag_structure(&ir);
        let result = assign_ranks(&ir, &structure, &raw_config(Ranker::NetworkSimplex));
        assert!(result.rank_of.is_empty());
        assert!(result.rank_members.is_empty());
        assert_eq!(result.max_rank, 0);
    }

    #[test]
    fn a_graph_with_no_edges_is_one_rank_wide() {
        let ir = ir_of(3, vec![]);
        let structure = dag_structure(&ir);
        let result = assign_ranks(&ir, &structure, &raw_config(Ranker::NetworkSimplex));
        assert_eq!(result.rank_of, vec![0, 0, 0]);
        assert_eq!(result.rank_members, vec![vec![0, 1, 2]]);
    }

    #[test]
    fn self_loops_do_not_push_a_node_down() {
        let ir = ir_of(2, vec![edge(0, 0, 4), edge(0, 1, 1)]);
        let structure = dag_structure(&ir);
        let result = assign_ranks(&ir, &structure, &raw_config(Ranker::NetworkSimplex));
        assert_eq!(result.rank_of, vec![0, 1]);
    }

    #[test]
    fn a_reversed_feedback_edge_ranks_in_its_reversed_direction() {
        // Phase 2 reversed edge 1 (2 -> 0 becomes 0 -> 2), so it must pull node 2 *down*.
        let ir = ir_of(3, vec![edge(0, 1, 1), edge(2, 0, 1)]);
        let mut structure = dag_structure(&ir);
        structure.reversed = vec![false, true];
        structure.roles = vec![EdgeRole::Forward, EdgeRole::Feedback];

        let result = assign_ranks(&ir, &structure, &raw_config(Ranker::NetworkSimplex));
        assert_eq!(result.rank_of[0], 0);
        assert_eq!(result.rank_of[2], 1);
        assert_result_is_consistent(&result, &ir, &structure, &raw_config(Ranker::NetworkSimplex));
    }

    #[test]
    fn bundle_members_are_pulled_taut_by_their_boosted_weight() {
        // Node 1 may legally sit on rank 1 or 2. Which arc gets to be tight is decided purely by
        // weight, so the same skeleton answers differently once 1 -> 2 is a bundle member.
        let skeleton = || vec![edge(0, 1, 1), edge(0, 2, 3), edge(1, 2, 1)];

        let loose = ir_of(3, skeleton());
        let structure = dag_structure(&loose);
        let result = assign_ranks(&loose, &structure, &raw_config(Ranker::NetworkSimplex));
        assert_eq!(
            result.rank_of[1], 1,
            "unweighted skeleton should leave node 1 where longest path put it"
        );

        let mut bundled_edges = skeleton();
        bundled_edges[2].bundle = Some(0);
        let bundled = ir_of(3, bundled_edges);
        let structure = dag_structure(&bundled);
        let result = assign_ranks(&bundled, &structure, &raw_config(Ranker::NetworkSimplex));
        assert_eq!(
            result.rank_of[2] - result.rank_of[1],
            1,
            "the boosted bundle arc must end up tight: {:?}",
            result.rank_of
        );
    }

    #[test]
    fn pinned_ranks_are_honoured_exactly() {
        let ir_base = ir_of(4, vec![edge(0, 1, 1), edge(1, 2, 1), edge(0, 3, 1)]);
        let mut ir = ir_base;
        ir.has_pinned_ranks = true;
        ir.nodes[2].pinned_rank = Some(5);
        ir.nodes[3].pinned_rank = Some(3);
        let structure = dag_structure(&ir);

        let result = assign_ranks(&ir, &structure, &CustomLayoutConfig::default());

        assert_eq!(result.rank_of[2], 5);
        assert_eq!(result.rank_of[3], 3);
        assert_eq!(result.rank_of[0], 0);
        assert_result_is_consistent(&result, &ir, &structure, &CustomLayoutConfig::default());
    }

    #[test]
    fn a_pin_that_contradicts_min_len_is_repaired_by_raising_successors() {
        // Pinning the head of a chain below its tail leaves the successors short; they get raised
        // rather than the constraint getting violated.
        let mut ir = ir_of(3, vec![edge(0, 1, 1), edge(1, 2, 1)]);
        ir.has_pinned_ranks = true;
        ir.nodes[0].pinned_rank = Some(0);
        ir.nodes[1].pinned_rank = Some(0);
        let structure = dag_structure(&ir);

        let result = assign_ranks(&ir, &structure, &CustomLayoutConfig::default());

        assert_eq!(result.rank_of[0], 0);
        assert!(result.rank_of[1] >= 1);
        assert_result_is_consistent(&result, &ir, &structure, &CustomLayoutConfig::default());
    }

    #[test]
    fn pinning_disables_balancing() {
        // Twelve sinks on one rank: balancing would fan them out, a pin freezes the whole graph.
        let mut edges: Vec<EdgeSpec> = (1..=12u32).map(|t| edge(0, t, 1)).collect();
        edges.push(edge(0, 13, 1));
        let mut ir = ir_of(14, edges);
        ir.has_pinned_ranks = true;
        ir.nodes[13].pinned_rank = Some(1);
        let structure = dag_structure(&ir);

        let config = CustomLayoutConfig {
            max_nodes_per_rank: 3,
            balance_ranks: true,
            ..CustomLayoutConfig::default()
        };
        let result = assign_ranks(&ir, &structure, &config);

        assert_eq!(result.max_rank, 1, "no node should have been pushed down");
        assert_eq!(result.rank_members[1].len(), 13);
        assert_result_is_consistent(&result, &ir, &structure, &config);
    }

    #[test]
    fn balancing_runs_when_enabled_and_unpinned() {
        let edges: Vec<EdgeSpec> = (1..=12u32).map(|t| edge(0, t, 1)).collect();
        let ir = ir_of(13, edges);
        let structure = dag_structure(&ir);
        let config = CustomLayoutConfig {
            max_nodes_per_rank: 3,
            balance_ranks: true,
            ..CustomLayoutConfig::default()
        };

        let result = assign_ranks(&ir, &structure, &config);

        assert!(result.max_rank > 1, "the fan should have been spread out");
        for (r, members) in result.rank_members.iter().enumerate() {
            assert!(
                members.len() <= 3,
                "rank {} exceeds the cap: {:?}",
                r,
                result.rank_of
            );
        }
        assert_result_is_consistent(&result, &ir, &structure, &config);
    }

    #[test]
    fn a_truncated_structure_result_degrades_instead_of_panicking() {
        // Phase 2 is allowed to fail; ranking must not take the process down with it.
        let ir = ir_of(3, vec![edge(0, 1, 1), edge(1, 2, 1)]);
        let structure = StructureResult::default();
        let result = assign_ranks(&ir, &structure, &raw_config(Ranker::NetworkSimplex));
        assert_eq!(result.rank_of, vec![0, 1, 2]);
    }

    #[test]
    fn every_configuration_holds_the_invariants_on_generated_dags() {
        // Deterministic LCG, so a failure is reproducible from the seed alone. Arcs always run from
        // a lower to a higher index, which is exactly the shape Phase 2 hands over.
        let mut state = 0x2545_F491_4F6C_DD1Du64;
        let mut next = move || {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (state >> 33) as u32
        };

        for case in 0..40u32 {
            let node_count = 2 + (case as usize % 11);
            let mut edges: Vec<EdgeSpec> = Vec::new();
            for from in 0..node_count as u32 {
                for to in (from + 1)..node_count as u32 {
                    if next() % 3 != 0 {
                        continue;
                    }
                    let mut spec = edge(from, to, 1 + (next() % 3) as u16);
                    spec.weight = 1.0 + (next() % 5) as f64;
                    if next() % 4 == 0 {
                        spec.bundle = Some(0);
                    }
                    edges.push(spec);
                }
            }
            let ir = ir_of(node_count, edges);
            let structure = dag_structure(&ir);

            for ranker in [Ranker::NetworkSimplex, Ranker::LongestPath, Ranker::TightTree] {
                for balance in [false, true] {
                    // Peer relaxation is swept too: it changes the constraint set every ranker and
                    // the balancer then work from, so it has to hold the same invariants.
                    for peers in [false, true] {
                        let config = CustomLayoutConfig {
                            ranker,
                            balance_ranks: balance,
                            same_rank_peer_edges: peers,
                            max_nodes_per_rank: if case % 2 == 0 { 0 } else { 2 },
                            ..CustomLayoutConfig::default()
                        };
                        let result = assign_ranks(&ir, &structure, &config);
                        assert_result_is_consistent(&result, &ir, &structure, &config);
                        let again = assign_ranks(&ir, &structure, &config);
                        assert_eq!(again.rank_of, result.rank_of, "case {} is unstable", case);
                    }
                }
            }
        }
    }

    #[test]
    fn repeated_runs_are_byte_identical() {
        let edges: Vec<EdgeSpec> = vec![
            edge(0, 1, 1),
            edge(0, 2, 2),
            edge(1, 3, 1),
            edge(2, 3, 1),
            edge(3, 4, 1),
            edge(5, 4, 1),
            edge(0, 6, 1),
            edge(6, 7, 1),
        ];
        let ir = ir_of(9, edges);
        let structure = dag_structure(&ir);
        let config = CustomLayoutConfig {
            max_nodes_per_rank: 2,
            ..CustomLayoutConfig::default()
        };

        let first = assign_ranks(&ir, &structure, &config);
        for _ in 0..8 {
            let again = assign_ranks(&ir, &structure, &config);
            assert_eq!(again.rank_of, first.rank_of);
            assert_eq!(again.rank_members, first.rank_members);
            assert_eq!(again.max_rank, first.max_rank);
        }
        assert_result_is_consistent(&first, &ir, &structure, &config);
    }

    // ---- peer edges ---------------------------------------------------------------------------

    /// Config with peer relaxation on and balancing off, so a peer test observes the relaxation
    /// and nothing else.
    fn peer_config(on: bool) -> CustomLayoutConfig {
        CustomLayoutConfig {
            balance_ranks: false,
            same_rank_peer_edges: on,
            ..CustomLayoutConfig::default()
        }
    }

    /// `root -> a`, `root -> b`, `a -> b`: the canonical peer triangle.
    fn triangle() -> GraphIr {
        ir_of(3, vec![edge(0, 1, 1), edge(0, 2, 1), edge(1, 2, 1)])
    }

    #[test]
    fn a_peer_triangle_puts_both_siblings_on_one_rank() {
        let ir = triangle();
        let structure = dag_structure(&ir);

        assert_eq!(peer_edges(&ir, &structure), vec![2], "a -> b is the peer");

        let on = assign_ranks(&ir, &structure, &peer_config(true));
        assert_eq!(
            on.rank_of[1], on.rank_of[2],
            "the siblings should share a rank: {:?}",
            on.rank_of
        );
        assert_eq!(on.max_rank, 1);
        assert_result_is_consistent(&on, &ir, &structure, &peer_config(true));

        let off = assign_ranks(&ir, &structure, &peer_config(false));
        assert_ne!(
            off.rank_of[1], off.rank_of[2],
            "with the feature off the edge must still force a rank of separation: {:?}",
            off.rank_of
        );
        assert_result_is_consistent(&off, &ir, &structure, &peer_config(false));
    }

    #[test]
    fn a_same_rank_peer_edge_becomes_a_flat_edge_in_phase_four() {
        // The end-to-end point of the relaxation: `FlatEdge` was unreachable for as long as every
        // edge carried `min_len >= 1`, so this asserts the path is genuinely live now.
        let ir = triangle();
        let structure = dag_structure(&ir);
        let config = peer_config(true);
        let ranks = assign_ranks(&ir, &structure, &config);
        let layered = crate::build_layered(&ir, &structure, &ranks, &config);

        assert_eq!(layered.flat_edges.len(), 1);
        let flat = &layered.flat_edges[0];
        assert_eq!(flat.edge, 2);
        assert_eq!(flat.rank, ranks.rank_of[1]);
        assert_ne!(flat.from_item, flat.to_item);
        assert_eq!(layered.chains.len(), 2, "only the two root edges are chains");
    }

    #[test]
    fn balancing_does_not_undo_the_relaxation() {
        // `balance_ranks` re-derives its arcs from the IR and closes with a feasibility repair. If
        // that repair saw the unrelaxed `min_len = 1` it would pull the flat pair apart again.
        let ir = triangle();
        let structure = dag_structure(&ir);
        let config = CustomLayoutConfig {
            balance_ranks: true,
            max_nodes_per_rank: 0,
            ..CustomLayoutConfig::default()
        };
        let result = assign_ranks(&ir, &structure, &config);
        assert_eq!(result.rank_of[1], result.rank_of[2], "{:?}", result.rank_of);
    }

    #[test]
    fn a_chain_is_never_peered() {
        // `a -> b -> c`: neither arc has a common predecessor, so neither is a peer and the chain
        // keeps its three ranks.
        let ir = ir_of(3, vec![edge(0, 1, 1), edge(1, 2, 1)]);
        let structure = dag_structure(&ir);
        assert!(peer_edges(&ir, &structure).is_empty());

        let result = assign_ranks(&ir, &structure, &peer_config(true));
        assert_eq!(result.rank_of, vec![0, 1, 2]);
    }

    #[test]
    fn an_alternative_path_disqualifies_a_peer() {
        // root -> a, root -> b, a -> x -> y -> b, a -> b. The last edge has the common predecessor
        // `root`, but `a -> x -> y -> b` already forces three ranks of separation, so relaxing it
        // would only mislead the ranker. The detour is deliberately long enough that none of its
        // own arcs is a peer either, so the assertion is about `a -> b` alone.
        let ir = ir_of(
            5,
            vec![
                edge(0, 1, 1),
                edge(0, 2, 1),
                edge(1, 3, 1),
                edge(3, 4, 1),
                edge(4, 2, 1),
                edge(1, 2, 1),
            ],
        );
        let structure = dag_structure(&ir);
        assert!(peer_edges(&ir, &structure).is_empty());

        let result = assign_ranks(&ir, &structure, &peer_config(true));
        assert!(result.rank_of[2] - result.rank_of[1] >= 3, "{:?}", result.rank_of);
    }

    #[test]
    fn one_of_two_parallel_edges_is_not_a_peer() {
        // Masking one `a -> b` still leaves the other as a direct path, so neither qualifies.
        let ir = ir_of(
            3,
            vec![edge(0, 1, 1), edge(0, 2, 1), edge(1, 2, 1), edge(1, 2, 1)],
        );
        let structure = dag_structure(&ir);
        assert!(peer_edges(&ir, &structure).is_empty());
    }

    #[test]
    fn an_explicit_min_len_is_never_relaxed() {
        // Same triangle, but the host asked for three ranks of separation on `a -> b`. That is an
        // instruction, not a default, so peer detection must leave it alone.
        let ir = ir_of(3, vec![edge(0, 1, 1), edge(0, 2, 1), edge(1, 2, 3)]);
        let structure = dag_structure(&ir);
        assert!(peer_edges(&ir, &structure).is_empty());

        let result = assign_ranks(&ir, &structure, &peer_config(true));
        assert!(result.rank_of[2] - result.rank_of[1] >= 3);
    }

    #[test]
    fn a_labelled_peer_is_relaxed_from_its_own_default() {
        // A badge makes the ingest default 2, not 1. The relaxation is measured against *that*
        // default, so a labelled sibling edge is still eligible and still ends up flat — Phase 6
        // reserves its corridor width from the `FlatEdge` record instead of a label item.
        let mut edges = vec![edge(0, 1, 1), edge(0, 2, 1), edge(1, 2, 2)];
        edges[2].label = Some(LabelBox {
            width: 120.0,
            height: 28.0,
        });
        let ir = ir_of(3, edges);
        let structure = dag_structure(&ir);
        assert_eq!(peer_edges(&ir, &structure), vec![2]);

        let result = assign_ranks(&ir, &structure, &peer_config(true));
        assert_eq!(result.rank_of[1], result.rank_of[2]);
    }

    #[test]
    fn a_reversed_feedback_edge_is_peered_in_its_reversed_direction() {
        // Phase 2 reversed edge 2 (b -> a becomes a -> b). Peer detection reads the cycle-broken
        // DAG, so it sees a sibling pair, not a back edge.
        let ir = ir_of(3, vec![edge(0, 1, 1), edge(0, 2, 1), edge(2, 1, 1)]);
        let mut structure = dag_structure(&ir);
        structure.reversed = vec![false, false, true];
        structure.roles = vec![EdgeRole::Forward, EdgeRole::Forward, EdgeRole::Feedback];

        assert_eq!(peer_edges(&ir, &structure), vec![2]);
        let result = assign_ranks(&ir, &structure, &peer_config(true));
        assert_eq!(result.rank_of[1], result.rank_of[2]);
    }

    #[test]
    fn a_self_loop_is_never_a_peer() {
        let ir = ir_of(2, vec![edge(0, 1, 1), edge(1, 1, 1)]);
        let mut structure = dag_structure(&ir);
        structure.roles = vec![EdgeRole::Forward, EdgeRole::SelfLoop];
        structure.self_loops = vec![1];
        assert!(peer_edges(&ir, &structure).is_empty());
    }

    #[test]
    fn a_wide_fan_of_peers_all_collapse_onto_one_rank() {
        // One root, eight children, and a chain of peer edges across them. Every peer edge has the
        // root as a common predecessor and no alternative path, so the whole fan stays on rank 1.
        let mut edges: Vec<EdgeSpec> = (1..=8u32).map(|t| edge(0, t, 1)).collect();
        for t in 1..8u32 {
            edges.push(edge(t, t + 1, 1));
        }
        let ir = ir_of(9, edges);
        let structure = dag_structure(&ir);
        assert_eq!(peer_edges(&ir, &structure).len(), 7);

        let result = assign_ranks(&ir, &structure, &peer_config(true));
        assert_eq!(result.max_rank, 1, "{:?}", result.rank_of);
    }

    #[test]
    fn the_probe_budget_answers_conservatively() {
        // A root, two siblings, and a path from the first sibling to the second that is longer
        // than the probe budget. The probe gives up before it arrives and reports "path exists",
        // which keeps the edge hierarchical — the safe direction to be wrong in.
        let long = PEER_PROBE_BUDGET + 8;
        let node_count = long + 3;
        let a = 1u32;
        let b = 2u32;
        let mut edges = vec![edge(0, a, 1), edge(0, b, 1), edge(a, b, 1)];
        // a -> 3 -> 4 -> ... -> b
        let mut prev = a;
        for n in 3..(3 + long as u32) {
            edges.push(edge(prev, n, 1));
            prev = n;
        }
        edges.push(edge(prev, b, 1));

        let ir = ir_of(node_count, edges);
        let structure = dag_structure(&ir);
        assert!(
            peer_edges(&ir, &structure).is_empty(),
            "the budget must be spent before the detour is walked"
        );
    }

    #[test]
    fn peer_detection_is_byte_identical_across_runs() {
        // Deterministic LCG so a failure is reproducible from the seed alone.
        let mut state = 0x9E37_79B9_7F4A_7C15u64;
        let mut next = move || {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (state >> 33) as u32
        };

        for case in 0..24u32 {
            let node_count = 3 + (case as usize % 9);
            let mut edges: Vec<EdgeSpec> = Vec::new();
            for from in 0..node_count as u32 {
                for to in (from + 1)..node_count as u32 {
                    if next() % 2 == 0 {
                        edges.push(edge(from, to, 1));
                    }
                }
            }
            let ir = ir_of(node_count, edges);
            let structure = dag_structure(&ir);

            let first = peer_edges(&ir, &structure);
            let mut sorted = first.clone();
            sorted.sort_unstable();
            assert_eq!(sorted, first, "peer list must be ascending");
            for _ in 0..4 {
                assert_eq!(peer_edges(&ir, &structure), first, "case {} is unstable", case);
            }

            let config = peer_config(true);
            let ranks = assign_ranks(&ir, &structure, &config);
            for _ in 0..4 {
                assert_eq!(assign_ranks(&ir, &structure, &config).rank_of, ranks.rank_of);
            }
            assert_result_is_consistent(&ranks, &ir, &structure, &config);
        }
    }
}
