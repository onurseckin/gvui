//! # Step 3.3: Multi-Pass Rayon Parallel Neighborhood Search Optimization
//!
//! This module implements parallel neighborhood search optimization (Passes 1 through 15) using
//! Rayon data parallelism.
//!
//! ## Parallelization Strategy & Candidate Evaluation
//!
//! 1. **Multi-Pass Iterative Search**:
//!    The optimizer executes up to `max_passes` (typically 15). In each pass, all rank layers are
//!    evaluated concurrently using Rayon parallel iterators (`into_par_iter()`).
//!
//! 2. **Rank-Level Candidate Evaluation**:
//!    For each rank index `r_idx` with $|R_{r\_idx}| \ge 2$:
//!    - Evaluates all candidate adjacent node transpositions $(i, i+1)$ for $0 \le i < |R_{r\_idx}| - 1$.
//!    - For each candidate swap, constructs test rank orderings and evaluates global crossing counts
//!      using `calculate_crossing_count(&test_ranks, edges)`.
//!    - Finds the local minimum crossing count for rank `r_idx`.
//!
//! 3. **Global Greedy Reduction**:
//!    Parallel results across all rank layers are collected into `candidate_ranks` and reduced via
//!    `.min_by_key(|(_, crossing_count)| *crossing_count)`.
//!    If the best candidate swap strictly reduces `best_crossings`, the rank ordering is updated
//!    and search continues to the next pass.
//!
//! 4. **Termination Criteria**:
//!    - Zero crossings achieved (`best_crossings == 0`).
//!    - Bounded local optimum reached (no candidate swap across any rank yields a strict reduction in crossings).
//!    - Maximum pass count (`max_passes`) reached.

use super::crossing_counting::calculate_crossing_count;
use crate::types::NormalizedEdge;
use rayon::prelude::*;

/// Executes parallel multi-pass neighborhood search optimization (Passes 1..=max_passes) using Rayon.
///
/// # Arguments
/// * `initial_ranks` - Initial node ordering per rank layer.
/// * `edges` - List of normalized edges in the graph.
/// * `max_passes` - Maximum search passes (e.g., 15).
///
/// # Returns
/// A tuple `(optimized_ranks, executed_passes)` containing the best rank orderings found and the pass count.
pub fn optimize_layer_orders_parallel(
    initial_ranks: Vec<Vec<String>>,
    edges: &[NormalizedEdge],
    max_passes: usize,
) -> (Vec<Vec<String>>, usize) {
    let mut current_ranks = initial_ranks;
    let mut best_crossings = calculate_crossing_count(&current_ranks, edges);
    let mut executed_passes = 0;

    for pass in 1..=max_passes {
        if best_crossings == 0 {
            break;
        }

        executed_passes = pass;

        // Parallel evaluation of candidate node swaps across ranks using Rayon
        let candidate_ranks: Vec<(Vec<Vec<String>>, usize)> = (0..current_ranks.len())
            .into_par_iter()
            .filter_map(|r_idx| {
                let rank = &current_ranks[r_idx];
                if rank.len() < 2 {
                    return None;
                }

                let mut local_best_ranks = current_ranks.clone();
                let mut local_best_crossings = best_crossings;
                let mut improved = false;

                for i in 0..(rank.len() - 1) {
                    let mut test_ranks = current_ranks.clone();
                    test_ranks[r_idx].swap(i, i + 1);

                    let c = calculate_crossing_count(&test_ranks, edges);
                    if c < local_best_crossings {
                        local_best_crossings = c;
                        local_best_ranks = test_ranks;
                        improved = true;
                    }
                }

                if improved {
                    Some((local_best_ranks, local_best_crossings))
                } else {
                    None
                }
            })
            .collect();

        if let Some((best_swap_ranks, min_c)) = candidate_ranks.into_iter().min_by_key(|(_, c)| *c) {
            if min_c < best_crossings {
                best_crossings = min_c;
                current_ranks = best_swap_ranks;
            } else {
                break;
            }
        } else {
            break;
        }
    }

    (current_ranks, executed_passes)
}
