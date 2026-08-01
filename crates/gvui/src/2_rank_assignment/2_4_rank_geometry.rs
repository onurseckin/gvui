use std::collections::HashMap;
use crate::types::{LayerNode, RankBand};

/// Calculates the maximum height of real (non-virtual) nodes in each rank layer.
///
/// # Logic
/// - Filters out virtual dummy nodes (which have `is_virtual = true`).
/// - For layers containing real nodes, finds $\max_{n \in \text{real}} \text{height}(n)$.
/// - If a layer consists entirely of virtual nodes, falls back to `default_height`.
pub fn calculate_rank_heights(
    layers: &[Vec<LayerNode>],
    default_height: f64,
) -> HashMap<usize, f64> {
    let mut heights = HashMap::new();
    for (r, layer) in layers.iter().enumerate() {
        let real_nodes: Vec<_> = layer.iter().filter(|n| !n.is_virtual).collect();
        let rank_height = if !real_nodes.is_empty() {
            real_nodes.iter().map(|n| n.height).fold(0.0, f64::max)
        } else {
            default_height
        };
        heights.insert(r, rank_height);
    }
    heights
}

/// Calculates the rank band boundaries and vertical positions (`top_y`, `height`, `center_y`)
/// for each rank layer.
///
/// # Vertical Spatial Layout Formula
/// Starting at `start_y`, for rank layer $r$ with maximum node height $H_r$ and inter-rank gap $G$:
/// $$\text{top\_y}(r) = Y_r$$
/// $$\text{center\_y}(r) = Y_r + \frac{H_r}{2}$$
/// $$Y_{r+1} = Y_r + H_r + G$$
pub fn calculate_rank_bands(
    layers: &[Vec<LayerNode>],
    start_y: f64,
    rank_gap: f64,
    default_height: f64,
) -> HashMap<usize, RankBand> {
    let mut rank_bands = HashMap::new();
    let mut current_y = start_y;

    for (r, layer) in layers.iter().enumerate() {
        let real_nodes: Vec<_> = layer.iter().filter(|n| !n.is_virtual).collect();
        let rank_height = if !real_nodes.is_empty() {
            real_nodes.iter().map(|n| n.height).fold(0.0, f64::max)
        } else {
            default_height
        };
        let center_y = current_y + rank_height / 2.0;

        rank_bands.insert(
            r,
            RankBand {
                top_y: current_y,
                height: rank_height,
                center_y,
            },
        );

        current_y += rank_height + rank_gap;
    }

    rank_bands
}
