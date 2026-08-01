//! # Step 3.1: Barycenter and Median Layer Node Ordering Heuristics
//!
//! This module implements downward and upward sweep heuristics for two-layer and multi-layer
//! crossing minimization in layered graph drawing (Sugiyama-style framework).
//!
//! ## Heuristic Principles
//!
//! 1. **Downward Sweep**:
//!    For each layer $r$ from 1 to $R_{max}$, nodes in layer $r$ are assigned positions equal to the
//!    average (barycenter) or median of the 0-indexed positions of their predecessor nodes in layer $r-1$.
//!    Nodes are then sorted by these position values.
//!
//! 2. **Upward Sweep**:
//!    For each layer $r$ from $R_{max}-1$ down to 0, nodes in layer $r$ are assigned positions equal to the
//!    average (barycenter) or median of the 0-indexed positions of their successor nodes in layer $r+1$.
//!    Nodes are then sorted by these position values.
//!
//! 3. **Adjacent Transposition Pass**:
//!    After each sweep, adjacent pairs of nodes in each layer are swapped greedily (`i` and `i+1`).
//!    If a swap strictly reduces the total graph crossing count, it is retained; otherwise, it is reverted.
//!
//! 4. **Deterministic Tie-Breaking**:
//!    When two nodes have identical barycenter/median values ($\le 10^{-4}$ difference), ties are broken
//!    deterministically using alphabetical order of node string IDs (`a.id.cmp(&b.id)`).

use super::crossing_counting::count_total_graph_crossings;
use crate::types::LayerNode;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

pub use crate::types::ExpandedLayerGraph;

/// Result of crossing minimization containing the optimized layer ordering and final crossing count.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CrossingMinimizationResult {
    /// Optimized layer node ordering.
    pub ordered_layers: Vec<Vec<LayerNode>>,
    /// Final crossing count after optimization.
    pub crossing_count: usize,
}

/// Applies user-specified layer order overrides to existing layers if provided.
pub fn apply_layer_order_overrides(
    layers: &[Vec<LayerNode>],
    layer_orders: Option<&HashMap<usize, Vec<String>>>,
) -> Vec<Vec<LayerNode>> {
    let Some(layer_orders) = layer_orders else {
        return layers.to_vec();
    };

    layers
        .iter()
        .enumerate()
        .map(|(rank, layer)| {
            if let Some(custom_order) = layer_orders.get(&rank) {
                if custom_order.is_empty() {
                    return layer.clone();
                }
                let order_map: HashMap<&str, usize> = custom_order
                    .iter()
                    .enumerate()
                    .map(|(idx, id)| (id.as_str(), idx))
                    .collect();

                let mut sorted = layer.clone();
                sorted.sort_by(|a, b| {
                    let idx_a = order_map.get(a.id.as_str()).copied().unwrap_or(999999);
                    let idx_b = order_map.get(b.id.as_str()).copied().unwrap_or(999999);
                    if idx_a != idx_b {
                        idx_a.cmp(&idx_b)
                    } else {
                        a.id.cmp(&b.id)
                    }
                });
                sorted
            } else {
                layer.clone()
            }
        })
        .collect()
}

/// Minimizes graph edge crossings using alternating barycenter (mean) sweeps and adjacent transpositions.
///
/// # Arguments
/// * `layer_graph` - The expanded layer graph containing nodes, edges, and connectivity maps.
/// * `max_sweeps` - Maximum number of downward/upward sweep iterations.
/// * `layer_orders` - Optional pre-defined layer order overrides.
pub fn minimize_crossings(
    layer_graph: &ExpandedLayerGraph,
    max_sweeps: usize,
    layer_orders: Option<&HashMap<usize, Vec<String>>>,
) -> CrossingMinimizationResult {
    let mut current_layers = apply_layer_order_overrides(&layer_graph.layers, layer_orders);
    let mut best_layers = current_layers.clone();
    let mut best_crossings = count_total_graph_crossings(&best_layers, &layer_graph.successors_map);

    let has_custom_orders = layer_orders.is_some_and(|m| !m.is_empty());
    if best_crossings == 0 || has_custom_orders {
        return CrossingMinimizationResult {
            ordered_layers: best_layers,
            crossing_count: best_crossings,
        };
    }

    for sweep in 0..max_sweeps {
        // 1. Downward sweep (rank 1 to maxRank)
        for r in 1..current_layers.len() {
            let prev_pos: HashMap<&str, usize> = current_layers[r - 1]
                .iter()
                .enumerate()
                .map(|(idx, n)| (n.id.as_str(), idx))
                .collect();

            let mut barycenters: HashMap<String, f64> = HashMap::new();

            for (i, item) in current_layers[r].iter().enumerate() {
                let preds = layer_graph.predecessors_map.get(&item.id);
                let valid_preds: Vec<usize> = preds
                    .map(|list| {
                        list.iter()
                            .filter_map(|p| prev_pos.get(p.as_str()).copied())
                            .collect()
                    })
                    .unwrap_or_default();

                if !valid_preds.is_empty() {
                    let sum: usize = valid_preds.iter().sum();
                    barycenters.insert(item.id.clone(), sum as f64 / valid_preds.len() as f64);
                } else {
                    barycenters.insert(item.id.clone(), i as f64);
                }
            }

            current_layers[r].sort_by(|a, b| {
                let b_a = barycenters.get(&a.id).copied().unwrap_or(0.0);
                let b_b = barycenters.get(&b.id).copied().unwrap_or(0.0);
                if (b_a - b_b).abs() > 0.0001 {
                    b_a.partial_cmp(&b_b).unwrap_or(std::cmp::Ordering::Equal)
                } else {
                    a.id.cmp(&b.id)
                }
            });
        }

        // 2. Upward sweep (rank maxRank-1 down to 0)
        if current_layers.len() >= 2 {
            for r in (0..=(current_layers.len() - 2)).rev() {
                let next_pos: HashMap<&str, usize> = current_layers[r + 1]
                    .iter()
                    .enumerate()
                    .map(|(idx, n)| (n.id.as_str(), idx))
                    .collect();

                let mut barycenters: HashMap<String, f64> = HashMap::new();

                for (i, item) in current_layers[r].iter().enumerate() {
                    let succs = layer_graph.successors_map.get(&item.id);
                    let valid_succs: Vec<usize> = succs
                        .map(|list| {
                            list.iter()
                                .filter_map(|s| next_pos.get(s.as_str()).copied())
                                .collect()
                        })
                        .unwrap_or_default();

                    if !valid_succs.is_empty() {
                        let sum: usize = valid_succs.iter().sum();
                        barycenters.insert(item.id.clone(), sum as f64 / valid_succs.len() as f64);
                    } else {
                        barycenters.insert(item.id.clone(), i as f64);
                    }
                }

                current_layers[r].sort_by(|a, b| {
                    let b_a = barycenters.get(&a.id).copied().unwrap_or(0.0);
                    let b_b = barycenters.get(&b.id).copied().unwrap_or(0.0);
                    if (b_a - b_b).abs() > 0.0001 {
                        b_a.partial_cmp(&b_b).unwrap_or(std::cmp::Ordering::Equal)
                    } else {
                        a.id.cmp(&b.id)
                    }
                });
            }
        }

        // 3. Adjacent Transposition Pass
        let mut swapped_any = false;
        for r in 0..current_layers.len() {
            let layer_len = current_layers[r].len();
            if layer_len < 2 {
                continue;
            }
            for i in 0..(layer_len - 1) {
                current_layers[r].swap(i, i + 1);

                let new_crossings =
                    count_total_graph_crossings(&current_layers, &layer_graph.successors_map);
                if new_crossings < best_crossings {
                    best_crossings = new_crossings;
                    best_layers = current_layers.clone();
                    swapped_any = true;
                } else {
                    // Revert swap
                    current_layers[r].swap(i, i + 1);
                }
            }
        }

        let current_crossings =
            count_total_graph_crossings(&current_layers, &layer_graph.successors_map);
        if current_crossings < best_crossings {
            best_crossings = current_crossings;
            best_layers = current_layers.clone();
        }

        if best_crossings == 0 || (!swapped_any && sweep > 4) {
            break;
        }
    }

    CrossingMinimizationResult {
        ordered_layers: best_layers,
        crossing_count: best_crossings,
    }
}

/// Minimizes graph edge crossings using alternating median sweeps and adjacent transpositions.
///
/// Median ordering achieves theoretical upper bound guarantees on crossing count (at most 3x optimal).
pub fn minimize_crossings_median(
    layer_graph: &ExpandedLayerGraph,
    max_sweeps: usize,
    layer_orders: Option<&HashMap<usize, Vec<String>>>,
) -> CrossingMinimizationResult {
    let mut current_layers = apply_layer_order_overrides(&layer_graph.layers, layer_orders);
    let mut best_layers = current_layers.clone();
    let mut best_crossings = count_total_graph_crossings(&best_layers, &layer_graph.successors_map);

    let has_custom_orders = layer_orders.is_some_and(|m| !m.is_empty());
    if best_crossings == 0 || has_custom_orders {
        return CrossingMinimizationResult {
            ordered_layers: best_layers,
            crossing_count: best_crossings,
        };
    }

    let compute_median = |positions: &mut [usize], fallback: usize| -> f64 {
        if positions.is_empty() {
            return fallback as f64;
        }
        positions.sort_unstable();
        let len = positions.len();
        if len % 2 == 1 {
            positions[len / 2] as f64
        } else {
            (positions[len / 2 - 1] as f64 + positions[len / 2] as f64) / 2.0
        }
    };

    for sweep in 0..max_sweeps {
        // Downward sweep with median
        for r in 1..current_layers.len() {
            let prev_pos: HashMap<&str, usize> = current_layers[r - 1]
                .iter()
                .enumerate()
                .map(|(idx, n)| (n.id.as_str(), idx))
                .collect();

            let mut medians: HashMap<String, f64> = HashMap::new();

            for (i, item) in current_layers[r].iter().enumerate() {
                let preds = layer_graph.predecessors_map.get(&item.id);
                let mut valid_preds: Vec<usize> = preds
                    .map(|list| {
                        list.iter()
                            .filter_map(|p| prev_pos.get(p.as_str()).copied())
                            .collect()
                    })
                    .unwrap_or_default();

                let med = compute_median(&mut valid_preds, i);
                medians.insert(item.id.clone(), med);
            }

            current_layers[r].sort_by(|a, b| {
                let m_a = medians.get(&a.id).copied().unwrap_or(0.0);
                let m_b = medians.get(&b.id).copied().unwrap_or(0.0);
                if (m_a - m_b).abs() > 0.0001 {
                    m_a.partial_cmp(&m_b).unwrap_or(std::cmp::Ordering::Equal)
                } else {
                    a.id.cmp(&b.id)
                }
            });
        }

        // Upward sweep with median
        if current_layers.len() >= 2 {
            for r in (0..=(current_layers.len() - 2)).rev() {
                let next_pos: HashMap<&str, usize> = current_layers[r + 1]
                    .iter()
                    .enumerate()
                    .map(|(idx, n)| (n.id.as_str(), idx))
                    .collect();

                let mut medians: HashMap<String, f64> = HashMap::new();

                for (i, item) in current_layers[r].iter().enumerate() {
                    let succs = layer_graph.successors_map.get(&item.id);
                    let mut valid_succs: Vec<usize> = succs
                        .map(|list| {
                            list.iter()
                                .filter_map(|s| next_pos.get(s.as_str()).copied())
                                .collect()
                        })
                        .unwrap_or_default();

                    let med = compute_median(&mut valid_succs, i);
                    medians.insert(item.id.clone(), med);
                }

                current_layers[r].sort_by(|a, b| {
                    let m_a = medians.get(&a.id).copied().unwrap_or(0.0);
                    let m_b = medians.get(&b.id).copied().unwrap_or(0.0);
                    if (m_a - m_b).abs() > 0.0001 {
                        m_a.partial_cmp(&m_b).unwrap_or(std::cmp::Ordering::Equal)
                    } else {
                        a.id.cmp(&b.id)
                    }
                });
            }
        }

        // Transposition pass
        let mut swapped_any = false;
        for r in 0..current_layers.len() {
            let layer_len = current_layers[r].len();
            if layer_len < 2 {
                continue;
            }
            for i in 0..(layer_len - 1) {
                current_layers[r].swap(i, i + 1);

                let new_crossings =
                    count_total_graph_crossings(&current_layers, &layer_graph.successors_map);
                if new_crossings < best_crossings {
                    best_crossings = new_crossings;
                    best_layers = current_layers.clone();
                    swapped_any = true;
                } else {
                    current_layers[r].swap(i, i + 1);
                }
            }
        }

        let current_crossings =
            count_total_graph_crossings(&current_layers, &layer_graph.successors_map);
        if current_crossings < best_crossings {
            best_crossings = current_crossings;
            best_layers = current_layers.clone();
        }

        if best_crossings == 0 || (!swapped_any && sweep > 4) {
            break;
        }
    }

    CrossingMinimizationResult {
        ordered_layers: best_layers,
        crossing_count: best_crossings,
    }
}
