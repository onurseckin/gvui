//! # Bounding Translation & Rank Band Calculation
//!
//! Handles vertical rank band allocation, final node top-left coordinate calculation, padding translation,
//! and global graph bounding box `Rect` evaluation.

use std::collections::HashMap;
use serde::{Deserialize, Serialize};

use crate::config::CustomLayoutConfig;
use crate::types::{ExpandedLayerGraph, LayerNode, Point, Rect, SpacingOverrides};

use super::spacing_demand_resolver::get_effective_rank_gap;

/// Vertical band specification for a rank in the layout.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankBand {
    pub top_y: f64,
    pub height: f64,
    pub center_y: f64,
}

/// Final result returned by the coordinate assignment step.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoordinateAssignmentResult {
    pub node_positions: HashMap<String, Point>,
    pub rank_band_map: HashMap<usize, RankBand>,
    pub bounding_box: Rect,
}

/// Calculates rank band heights and Y coordinates for all ordered ranks.
pub fn calculate_rank_bands(
    ordered_layers: &[Vec<LayerNode>],
    config: &CustomLayoutConfig,
    spacing_overrides: Option<&SpacingOverrides>,
    layer_shifts: Option<&HashMap<String, f64>>,
) -> (HashMap<usize, RankBand>, f64) {
    let mut rank_band_map: HashMap<usize, RankBand> = HashMap::new();

    let get_shift = |key: &str| -> f64 {
        layer_shifts
            .and_then(|m| m.get(key))
            .copied()
            .unwrap_or(0.0)
    };

    let mut current_y = config.graph_padding;

    for (r, layer) in ordered_layers.iter().enumerate() {
        let real_nodes_in_rank: Vec<&LayerNode> = layer.iter().filter(|n| !n.is_virtual).collect();

        let rank_height = if !real_nodes_in_rank.is_empty() {
            real_nodes_in_rank
                .iter()
                .map(|n| n.height)
                .fold(f64::NEG_INFINITY, f64::max)
        } else {
            40.0
        };

        let rank_y_shift = get_shift(&format!("rank:{}:y", r));
        let center_y = current_y + rank_height / 2.0 + rank_y_shift;
        rank_band_map.insert(
            r,
            RankBand {
                top_y: current_y + rank_y_shift,
                height: rank_height,
                center_y,
            },
        );

        let effective_rank_gap = get_effective_rank_gap(r, spacing_overrides, config);
        current_y += rank_height + effective_rank_gap;
    }

    (rank_band_map, current_y)
}

/// Computes final top-left {x, y} coordinates for each node based on center X positions and rank bands.
pub fn compute_node_positions(
    ordered_layers: &[Vec<LayerNode>],
    center_xs: &HashMap<String, f64>,
    rank_band_map: &HashMap<usize, RankBand>,
    layer_shifts: Option<&HashMap<String, f64>>,
) -> HashMap<String, Point> {
    let mut node_positions: HashMap<String, Point> = HashMap::new();

    let get_shift = |key: &str| -> f64 {
        layer_shifts
            .and_then(|m| m.get(key))
            .copied()
            .unwrap_or(0.0)
    };

    for (r, layer) in ordered_layers.iter().enumerate() {
        let band = &rank_band_map[&r];

        for item in layer {
            let cx = center_xs[&item.id];
            let width = if item.is_virtual { 0.0 } else { item.width };
            let height = if item.is_virtual { 0.0 } else { item.height };

            let x = cx - width / 2.0;
            let y = if item.is_virtual {
                band.center_y
            } else {
                band.top_y + (band.height - height) / 2.0
            };
            let shift_x = get_shift(&format!("node:{}:x", item.id));
            let shift_y = get_shift(&format!("node:{}:y", item.id));

            node_positions.insert(item.id.clone(), Point { x: x + shift_x, y: y + shift_y });
        }
    }

    node_positions
}

/// Translates all node positions and rank bands so that the minimum top-left X and Y of real nodes equal `config.graph_padding`.
pub fn translate_nodes_and_bands_to_padding(
    node_positions: &mut HashMap<String, Point>,
    rank_band_map: &mut HashMap<usize, RankBand>,
    layer_graph: &ExpandedLayerGraph,
    config: &CustomLayoutConfig,
) {
    let mut min_node_x = f64::INFINITY;
    let mut min_node_y = f64::INFINITY;

    for (id, pos) in node_positions.iter() {
        if let Some(item) = layer_graph.item_map.get(id) {
            if !item.is_virtual {
                min_node_x = min_node_x.min(pos.x);
                min_node_y = min_node_y.min(pos.y);
            }
        }
    }

    if min_node_x.is_finite() && min_node_y.is_finite() {
        let shift_x = config.graph_padding - min_node_x;
        let shift_y = config.graph_padding - min_node_y;

        if shift_x != 0.0 || shift_y != 0.0 {
            for pos in node_positions.values_mut() {
                pos.x += shift_x;
                pos.y += shift_y;
            }
            for band in rank_band_map.values_mut() {
                band.top_y += shift_y;
                band.center_y += shift_y;
            }
        }
    }
}

/// Computes global bounding box `Rect` encompassing all nodes in the layout.
pub fn calculate_bounding_box(
    node_positions: &HashMap<String, Point>,
    layer_graph: &ExpandedLayerGraph,
) -> Rect {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;

    for (id, pos) in node_positions {
        let item = layer_graph.item_map.get(id);
        let is_virtual = item.is_some_and(|it| it.is_virtual);
        let w = if is_virtual { 0.0 } else { item.map_or(0.0, |it| it.width) };
        let h = if is_virtual { 0.0 } else { item.map_or(0.0, |it| it.height) };

        min_x = min_x.min(pos.x);
        min_y = min_y.min(pos.y);
        max_x = max_x.max(pos.x + w);
        max_y = max_y.max(pos.y + h);
    }

    if min_x.is_finite() && min_y.is_finite() && max_x.is_finite() && max_y.is_finite() {
        Rect {
            x: min_x,
            y: min_y,
            width: max_x - min_x,
            height: max_y - min_y,
        }
    } else {
        Rect {
            x: 0.0,
            y: 0.0,
            width: 0.0,
            height: 0.0,
        }
    }
}
