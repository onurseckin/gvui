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

use super::longest_path::rank_longest_path;
use super::network_simplex::{rank_network_simplex, rank_tight_tree};
use super::rank_balancing::{balance_ranks, rank_arc, repair_feasibility};
use crate::config::CustomLayoutConfig;
use crate::types::{GraphIr, RankResult, Ranker, StructureResult};

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

    let weighted = weighted_arcs(ir, structure);
    let plain: Vec<(u32, u32, u16)> = weighted
        .iter()
        .map(|&(from, to, min_len, _)| (from, to, min_len))
        .collect();

    let mut rank_of = match config.ranker {
        Ranker::NetworkSimplex => {
            rank_network_simplex(node_count, &weighted, node_count.saturating_mul(4))
                .unwrap_or_else(|| rank_longest_path(node_count, &plain))
        }
        Ranker::LongestPath => rank_longest_path(node_count, &plain),
        Ranker::TightTree => rank_tight_tree(node_count, &plain),
    };
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

    if ir.has_pinned_ranks {
        for (n, node) in ir.nodes.iter().enumerate().take(node_count) {
            if let Some(rank) = node.pinned_rank {
                rank_of[n] = rank;
            }
        }
        repair_feasibility(&mut rank_of, &plain, node_count);
    } else if config.balance_ranks {
        balance_ranks(&mut rank_of, ir, structure, config);
    }

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
    use crate::types::{Csr, EdgeRole, IrEdge, IrNode};

    struct EdgeSpec {
        source: u32,
        target: u32,
        min_len: u16,
        weight: f64,
        bundle: Option<u32>,
    }

    fn edge(source: u32, target: u32, min_len: u16) -> EdgeSpec {
        EdgeSpec {
            source,
            target,
            min_len,
            weight: 1.0,
            bundle: None,
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
                label: None,
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

    /// Balancing off, so a test can observe the ranker's own output.
    fn raw_config(ranker: Ranker) -> CustomLayoutConfig {
        CustomLayoutConfig {
            ranker,
            balance_ranks: false,
            ..CustomLayoutConfig::default()
        }
    }

    fn assert_result_is_consistent(result: &RankResult, ir: &GraphIr, structure: &StructureResult) {
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
                let min_len = ir.edges[e as usize].min_len as i32;
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
        assert_result_is_consistent(&result, &ir, &structure);
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
            assert_result_is_consistent(&result, &ir, &structure);
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
        assert_result_is_consistent(&result, &ir, &structure);
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
        assert_result_is_consistent(&result, &ir, &structure);
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
        assert_result_is_consistent(&result, &ir, &structure);
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
        assert_result_is_consistent(&result, &ir, &structure);
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
        assert_result_is_consistent(&result, &ir, &structure);
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
                    let config = CustomLayoutConfig {
                        ranker,
                        balance_ranks: balance,
                        max_nodes_per_rank: if case % 2 == 0 { 0 } else { 2 },
                        ..CustomLayoutConfig::default()
                    };
                    let result = assign_ranks(&ir, &structure, &config);
                    assert_result_is_consistent(&result, &ir, &structure);
                    let again = assign_ranks(&ir, &structure, &config);
                    assert_eq!(again.rank_of, result.rank_of, "case {} is unstable", case);
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
        assert_result_is_consistent(&first, &ir, &structure);
    }
}
