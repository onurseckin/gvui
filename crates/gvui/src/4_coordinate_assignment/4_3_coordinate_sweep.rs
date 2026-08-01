//! # Coordinate Sweep Engine
//!
//! Executes iterative predecessor and successor median sweeps combined with PAVA isotonic regression
//! to achieve global horizontal alignment across ranks.
//!
//! ## Algorithmic Principles
//!
//! 1. **Initial Assignment**: Nodes in each rank are placed sequentially starting at `graph_padding`
//!    separated by effective node gaps.
//! 2. **Iterative Sweeps**:
//!    - **Target Position Calculation**: For each node, its target horizontal center $a_i$ is computed as the
//!      halfway interpolation between its current center position $X_i^{(t)}$ and the median center position
//!      of its adjacent neighbors (predecessors in rank $r-1$ and successors in rank $r+1$):
//!      $$X_{\text{neighbors}} = \text{median}(\{X_u \mid u \in \text{Preds}(i) \cup \text{Succs}(i)\})$$
//!      $$a_i = 0.5 \cdot X_i^{(t)} + 0.5 \cdot X_{\text{neighbors}}$$
//!    - **Weighting**: Node influence weights $w_i = \max(1, |\text{Preds}(i)| + |\text{Succs}(i)|)$ reflect topological degree,
//!      ensuring highly connected nodes pull adjacent layers more strongly toward straight vertical alignment.
//!    - **Synchronous Isotonic Layer Projection**: `project_layer_centers` (PAVA) is invoked per rank using
//!      the desired positions $a_i$ and weights $w_i$.
//! 3. **Convergence**: Sweeps repeat until the maximum node coordinate movement $\max_i |X_i^{(t+1)} - X_i^{(t)}|$
//!    falls below `config.epsilon` or `config.coordinate_sweep_limit` iterations are reached.

use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
use crate::types::{ExpandedLayerGraph, LayerNode, SpacingOverrides};

use super::pava_isotonic_regression::project_layer_centers;

/// Initializes initial horizontal center coordinates for all nodes in each rank.
pub fn initialize_layer_center_xs(
    ordered_layers: &[Vec<LayerNode>],
    config: &CustomLayoutConfig,
    spacing_overrides: Option<&SpacingOverrides>,
) -> HashMap<String, f64> {
    let mut initial_center_x_map: HashMap<String, f64> = HashMap::new();

    for (r, layer) in ordered_layers.iter().enumerate() {
        let mut current_x = config.graph_padding;

        for i in 0..layer.len() {
            let item = &layer[i];
            let width = if item.is_virtual { 0.0 } else { item.width };

            initial_center_x_map.insert(item.id.clone(), current_x + width / 2.0);
            let next_item = layer.get(i + 1);
            let effective_node_gap = match next_item {
                Some(next) => super::spacing_demand_resolver::get_effective_node_gap(r, item, spacing_overrides, config)
                    .max(super::spacing_demand_resolver::get_effective_node_gap(r, next, spacing_overrides, config)),
                None => super::spacing_demand_resolver::get_effective_node_gap(r, item, spacing_overrides, config),
            };
            current_x += width + effective_node_gap;
        }
    }

    initial_center_x_map
}

/// Performs iterative coordinate sweeps over ordered layer ranks using PAVA layer projections.
pub fn perform_coordinate_sweeps(
    layer_graph: &ExpandedLayerGraph,
    ordered_layers: &[Vec<LayerNode>],
    initial_center_xs: HashMap<String, f64>,
    config: &CustomLayoutConfig,
    spacing_overrides: Option<&SpacingOverrides>,
) -> HashMap<String, f64> {
    let mut center_xs = initial_center_xs;

    for _sweep in 0..config.coordinate_sweep_limit {
        let prev_center_x_map = center_xs.clone();
        let mut desired_x_map: HashMap<String, f64> = HashMap::new();
        let mut weights_map: HashMap<String, f64> = HashMap::new();

        // 1 & 2. Calculate target positions & weights for all nodes from previous iteration positions
        for layer in ordered_layers {
            for item in layer {
                let preds = layer_graph.predecessors_map.get(&item.id);
                let succs = layer_graph.successors_map.get(&item.id);

                let mut neighbors: Vec<&str> = Vec::new();
                if let Some(preds_vec) = preds {
                    for p in preds_vec {
                        if prev_center_x_map.contains_key(p) {
                            neighbors.push(p.as_str());
                        }
                    }
                }
                if let Some(succs_vec) = succs {
                    for s in succs_vec {
                        if prev_center_x_map.contains_key(s) {
                            neighbors.push(s.as_str());
                        }
                    }
                }

                let desired_x: f64 = if !neighbors.is_empty() {
                    let mut sorted_neighbor_x: Vec<f64> = neighbors
                        .iter()
                        .map(|id| prev_center_x_map[*id])
                        .collect();
                    sorted_neighbor_x
                        .sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                    let mid = sorted_neighbor_x.len() / 2;
                    let median_neighbor_x = if !sorted_neighbor_x.len().is_multiple_of(2) {
                        sorted_neighbor_x[mid]
                    } else {
                        (sorted_neighbor_x[mid - 1] + sorted_neighbor_x[mid]) / 2.0
                    };
                    let prev_x = prev_center_x_map[&item.id];
                    0.5 * prev_x + 0.5 * median_neighbor_x
                } else {
                    prev_center_x_map[&item.id]
                };

                desired_x_map.insert(item.id.clone(), desired_x);
                let p_len = preds.map_or(0, |p| p.len());
                let s_len = succs.map_or(0, |s| s.len());
                weights_map.insert(item.id.clone(), 1.0f64.max((p_len + s_len) as f64));
            }
        }

        // 3. Project layer center positions per rank via PAVA
        let mut next_center_x_map: HashMap<String, f64> = HashMap::new();
        for (r, layer) in ordered_layers.iter().enumerate() {
            let projected = project_layer_centers(
                layer,
                &desired_x_map,
                &weights_map,
                r,
                config,
                spacing_overrides,
            );
            for (id, x) in projected {
                next_center_x_map.insert(id, x);
            }
        }

        // 4. Measure maximum node movement and evaluate convergence threshold
        let mut max_movement = 0.0f64;
        for (id, new_x) in &next_center_x_map {
            if let Some(&old_x) = prev_center_x_map.get(id) {
                let movement = (new_x - old_x).abs();
                if movement > max_movement {
                    max_movement = movement;
                }
            }
        }

        center_xs = next_center_x_map;

        if max_movement <= config.epsilon {
            break;
        }
    }

    center_xs
}
