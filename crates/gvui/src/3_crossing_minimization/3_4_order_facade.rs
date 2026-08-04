//! # Step 3.4 (Phase 5): The ordering driver
//!
//! The only search in the engine, and the only place a decision is ever reconsidered. Everything
//! downstream of here treats the within-rank permutation as final: Phase 6 derives lane demand
//! from it, Phase 7 derives coordinates from that, and Phase 8 only evaluates. No later phase
//! creates or removes a crossing, so this is where crossings must actually be resolved.
//!
//! The search is deliberately small and bounded — `ordering_seeds` restarts of at most
//! `ordering_sweeps` median/transpose rounds each, over an `O(E log V)` objective — because
//! two-layer crossing minimization is NP-hard and greedy genuinely is not enough. It is not an
//! outer loop around the pipeline: nothing outside Phase 5 is re-run, and nothing is rolled back
//! except this phase's own candidate orderings.

use crate::step3_crossing_minimization::crossing_counting::count_all;
use crate::step3_crossing_minimization::ordering::{
    apply_seed, position_sweep, renumber_orders, transpose,
};
use crate::types::{get_now_ms, CustomLayoutConfig, Layered};

/// Number of consecutive non-improving sweeps that ends a seed. Small on purpose: median sweeps
/// converge fast, and a seed that has stalled is better spent on the next restart than on more
/// rounds of the same basin.
const STALL_LIMIT: usize = 4;

/// What Phase 5 did, for [`crate::types::OptimizationStats`] and the metrics report.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct OrderingOutcome {
    /// Crossings of the ordering actually installed — the best found, not the last tried.
    pub crossings: usize,
    /// Total median+transpose rounds executed across all seeds.
    pub sweeps_executed: usize,
    /// Seeds actually started. Fewer than `config.ordering_seeds` when the search stopped early.
    pub seeds_evaluated: usize,
}

/// Runs the crossing-minimization search and leaves `layered` holding the best ordering found.
///
/// Each seed restarts from the **input** ordering rather than from wherever the previous seed
/// converged, which is what makes the seeds independent samples of the search space instead of one
/// long chain. Within a seed, sweeps alternate downward and upward, each followed by a transpose
/// pass, and the seed ends after [`STALL_LIMIT`] sweeps without a new global best.
///
/// Guarantees on return:
/// - `Item::order` and the physical slice position agree for every item, and every item-index
///   reference in `layered` (`up`, `down`, `chains`, `flat_edges`, `item_of_node`) is consistent
///   with that permutation.
/// - The installed ordering has `crossings` crossings, and that is the minimum over every
///   candidate the search evaluated — including the input ordering, so this can never make a graph
///   worse than it arrived.
///
/// Determinism: identical input yields byte-identical output, with one documented exception —
/// `config.time_budget_ms`. The budget is a safety rail against pathological graphs, not a tuning
/// dial; if it fires, the search stops at a machine-dependent point. It is set high enough
/// (default 250 ms against a phase budget of 3-8 ms) that reaching it means the graph is far
/// outside the design envelope.
pub fn order_layers(layered: &mut Layered, config: &CustomLayoutConfig) -> OrderingOutcome {
    let started_at = get_now_ms();
    renumber_orders(layered);

    let mut best_crossings = count_all(layered);
    let mut outcome = OrderingOutcome {
        crossings: best_crossings,
        sweeps_executed: 0,
        seeds_evaluated: 0,
    };

    if layered.rank_count() < 2
        || best_crossings == 0
        || config.ordering_seeds == 0
        || config.ordering_sweeps == 0
    {
        // Nothing to search for: either there is no adjacent rank pair, the drawing is already
        // planar, or the budget forbids a single round. `renumber_orders` has already established
        // the output invariant.
        return outcome;
    }

    // Snapshots are whole-`Layered` clones rather than a bare `Vec<u16>` of orders because
    // materializing a permutation renumbers item indices; an orders-only snapshot taken before one
    // materialization is meaningless after the next.
    let input = layered.clone();
    let mut best = layered.clone();

    'search: for seed in 0..config.ordering_seeds {
        layered.clone_from(&input);
        apply_seed(layered, seed);
        outcome.seeds_evaluated += 1;

        let mut stalled = 0usize;
        for sweep in 0..config.ordering_sweeps {
            position_sweep(layered, sweep % 2 == 0, config);
            transpose(layered, config);
            outcome.sweeps_executed += 1;

            let crossings = count_all(layered);
            if crossings < best_crossings {
                best_crossings = crossings;
                best.clone_from(&*layered);
                stalled = 0;
            } else {
                stalled += 1;
                if stalled >= STALL_LIMIT {
                    break;
                }
            }

            if best_crossings == 0 {
                break 'search;
            }
            if get_now_ms() - started_at > config.time_budget_ms {
                break 'search;
            }
        }
    }

    layered.clone_from(&best);
    outcome.crossings = best_crossings;
    outcome
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::step3_crossing_minimization::crossing_counting::fixtures::*;
    use crate::types::ItemKind;

    fn cfg() -> CustomLayoutConfig {
        CustomLayoutConfig::default()
    }

    fn fingerprint(layered: &Layered) -> Vec<(u16, u16, ItemKind)> {
        layered
            .items
            .iter()
            .map(|i| (i.rank, i.order, i.kind))
            .collect()
    }

    fn assert_invariant(layered: &Layered) {
        for r in 0..layered.rank_ranges.len() {
            let range = layered.rank_ranges[r].clone();
            for (slot, i) in (range.start..range.end).enumerate() {
                assert_eq!(layered.items[i as usize].order as usize, slot);
            }
        }
    }

    /// A 4-rank graph with a crossing in every rank pair.
    fn tangled() -> Layered {
        let sizes = [3usize, 3, 3, 3];
        let arcs = [
            (0, 5),
            (1, 4),
            (2, 3),
            (3, 8),
            (4, 7),
            (5, 6),
            (6, 11),
            (7, 10),
            (8, 9),
        ];
        build_layered(&sizes, &arcs)
    }

    #[test]
    fn empty_and_single_rank_graphs_are_handled() {
        let mut empty = Layered::default();
        let outcome = order_layers(&mut empty, &cfg());
        assert_eq!(outcome, OrderingOutcome::default());

        let mut single = build_layered(&[4], &[]);
        let outcome = order_layers(&mut single, &cfg());
        assert_eq!(outcome.crossings, 0);
        assert_eq!(outcome.sweeps_executed, 0);
        assert_invariant(&single);
    }

    #[test]
    fn an_already_planar_graph_short_circuits() {
        let mut l = build_layered(&[3, 3], &[(0, 3), (1, 4), (2, 5)]);
        let before = fingerprint(&l);
        let outcome = order_layers(&mut l, &cfg());
        assert_eq!(outcome.crossings, 0);
        assert_eq!(outcome.seeds_evaluated, 0);
        assert_eq!(outcome.sweeps_executed, 0);
        assert_eq!(fingerprint(&l), before);
    }

    #[test]
    fn a_solvable_tangle_is_driven_to_zero() {
        let mut l = tangled();
        assert!(count_all(&l) > 0);
        let outcome = order_layers(&mut l, &cfg());
        assert_eq!(outcome.crossings, 0);
        assert_eq!(count_all(&l), 0);
        assert!(outcome.seeds_evaluated >= 1);
        assert!(outcome.sweeps_executed >= 1);
        assert_invariant(&l);
    }

    #[test]
    fn the_installed_ordering_matches_the_reported_count() {
        // `crossings` describes what is actually in `layered`, not the last candidate tried.
        let mut rng = Lcg(0x0d15_ea5e_0000_0007);
        for _ in 0..25 {
            let sizes: Vec<usize> = (0..5).map(|_| 2 + rng.below(4) as usize).collect();
            let mut starts = Vec::new();
            let mut acc = 0u32;
            for &s in &sizes {
                starts.push(acc);
                acc += s as u32;
            }
            let mut arcs: Vec<(u32, u32)> = Vec::new();
            for r in 0..sizes.len() - 1 {
                for _ in 0..(3 + rng.below(6)) {
                    arcs.push((
                        starts[r] + rng.below(sizes[r] as u32),
                        starts[r + 1] + rng.below(sizes[r + 1] as u32),
                    ));
                }
            }
            let mut l = build_layered(&sizes, &arcs);
            let outcome = order_layers(&mut l, &cfg());
            assert_eq!(outcome.crossings, count_all(&l));
            assert_invariant(&l);
        }
    }

    #[test]
    fn never_returns_worse_than_the_input_ordering() {
        let mut rng = Lcg(0x0d15_ea5e_0000_0011);
        for _ in 0..25 {
            let sizes: Vec<usize> = (0..4).map(|_| 3 + rng.below(4) as usize).collect();
            let mut starts = Vec::new();
            let mut acc = 0u32;
            for &s in &sizes {
                starts.push(acc);
                acc += s as u32;
            }
            let mut arcs: Vec<(u32, u32)> = Vec::new();
            for r in 0..sizes.len() - 1 {
                for _ in 0..(4 + rng.below(8)) {
                    arcs.push((
                        starts[r] + rng.below(sizes[r] as u32),
                        starts[r + 1] + rng.below(sizes[r + 1] as u32),
                    ));
                }
            }
            let mut l = build_layered(&sizes, &arcs);
            let before = count_all(&l);
            let outcome = order_layers(&mut l, &cfg());
            assert!(
                outcome.crossings <= before,
                "search regressed: {before} -> {}",
                outcome.crossings
            );
        }
    }

    #[test]
    fn output_is_byte_identical_across_runs() {
        let mut first = tangled();
        let mut second = tangled();
        let a = order_layers(&mut first, &cfg());
        let b = order_layers(&mut second, &cfg());
        assert_eq!(a, b);
        assert_eq!(fingerprint(&first), fingerprint(&second));
        assert_eq!(first.item_of_node, second.item_of_node);
        assert_eq!(first.down.offsets, second.down.offsets);
        assert_eq!(first.down.targets, second.down.targets);
        assert_eq!(first.down.edges, second.down.edges);
        assert_eq!(first.up.offsets, second.up.offsets);
        assert_eq!(first.up.targets, second.up.targets);
        assert_eq!(first.up.edges, second.up.edges);
    }

    #[test]
    fn output_is_identical_for_a_graph_that_cannot_reach_zero() {
        // Determinism must hold on the path where the seed loop runs to completion, not only on
        // the early `crossings == 0` exit.
        let sizes = [4usize, 4];
        let arcs = [
            (0, 4),
            (0, 6),
            (1, 5),
            (1, 7),
            (2, 4),
            (2, 7),
            (3, 5),
            (3, 6),
        ];
        let mut first = build_layered(&sizes, &arcs);
        let mut second = build_layered(&sizes, &arcs);
        let a = order_layers(&mut first, &cfg());
        let b = order_layers(&mut second, &cfg());
        assert_eq!(a, b);
        assert_eq!(fingerprint(&first), fingerprint(&second));
        assert!(a.seeds_evaluated >= 1);
    }

    #[test]
    fn seed_budget_is_respected_and_reported() {
        let mut c = cfg();
        c.ordering_seeds = 2;
        c.ordering_sweeps = 3;
        let sizes = [4usize, 4];
        let arcs = [
            (0, 4),
            (0, 6),
            (1, 5),
            (1, 7),
            (2, 4),
            (2, 7),
            (3, 5),
            (3, 6),
        ];
        let mut l = build_layered(&sizes, &arcs);
        let outcome = order_layers(&mut l, &c);
        assert!(outcome.seeds_evaluated <= 2);
        assert!(outcome.sweeps_executed <= 2 * 3);
        assert_eq!(outcome.crossings, count_all(&l));
    }

    #[test]
    fn a_long_dummy_chain_survives_the_full_search_straight() {
        // Four dummies of one long edge, with a parallel real chain competing for the same slots.
        let sizes = [2usize, 2, 2, 2, 2, 2];
        let arcs = [
            (0, 3),
            (0, 2),
            (3, 5),
            (2, 4),
            (5, 7),
            (4, 6),
            (7, 9),
            (6, 8),
            (9, 10),
            (8, 11),
        ];
        let mut l = build_layered(&sizes, &arcs);
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
        for &(real, dummy) in [(2u32, 3u32), (4, 5), (6, 7), (8, 9)].iter() {
            set_orders(&mut l, &[real, dummy]);
        }
        let outcome = order_layers(&mut l, &cfg());
        assert_eq!(outcome.crossings, 0);
        let dummy_orders: Vec<u16> = l
            .items
            .iter()
            .filter(|i| i.kind.is_dummy())
            .map(|i| i.order)
            .collect();
        assert_eq!(dummy_orders.len(), 4);
        assert!(
            dummy_orders.iter().all(|&o| o == dummy_orders[0]),
            "dummy chain bent during the search: {dummy_orders:?}"
        );
        assert_invariant(&l);
    }
}
