//! # Coordinate Assignment Facade
//!
//! Provides the primary coordinate assignment entrypoint orchestrating rank band calculation,
//! iterative coordinate sweeps via PAVA, translation to graph padding, and bounding box computation.

use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
use crate::types::{ExpandedLayerGraph, LayerNode, NormalizedGraph, SpacingOverrides};

use super::bounding_translation::{
    calculate_bounding_box, calculate_rank_bands, compute_node_positions,
    translate_nodes_and_bands_to_padding, CoordinateAssignmentResult,
};
use super::coordinate_sweep::{initialize_layer_center_xs, perform_coordinate_sweeps};

/// Main entrypoint for coordinate assignment pipeline (Step 4).
///
/// Assigns 2D Cartesian coordinates to nodes in an expanded layer graph by:
/// 1. Calculating vertical rank bands.
/// 2. Initializing rank horizontal center positions.
/// 3. Running iterative predecessor/successor coordinate sweeps with PAVA isotonic projection.
/// 4. Mapping node center coordinates to top-left positions aligned within rank bands.
/// 5. Translating node positions and rank bands to enforce `config.graph_padding`.
/// 6. Computing overall graph bounding box.
pub fn assign_coordinates(
    _graph: &NormalizedGraph,
    layer_graph: &ExpandedLayerGraph,
    ordered_layers: &[Vec<LayerNode>],
    config: &CustomLayoutConfig,
    spacing_overrides: Option<&SpacingOverrides>,
    layer_shifts: Option<&HashMap<String, f64>>,
) -> CoordinateAssignmentResult {
    // 1. Calculate Y positions and rank bands
    let (mut rank_band_map, _total_y) =
        calculate_rank_bands(ordered_layers, config, spacing_overrides, layer_shifts);

    // 2. Initial X assignment per rank
    let initial_center_xs = initialize_layer_center_xs(ordered_layers, config, spacing_overrides);

    // 3. Coordinate sweeps with PAVA isotonic projection
    let center_xs = perform_coordinate_sweeps(
        layer_graph,
        ordered_layers,
        initial_center_xs,
        config,
        spacing_overrides,
    );

    // 4. Set final top-left {x, y} coordinates for each node
    let mut node_positions =
        compute_node_positions(ordered_layers, &center_xs, &rank_band_map, layer_shifts);

    // 5. Translate final coordinates so minimum real node X and Y equal graph padding
    translate_nodes_and_bands_to_padding(&mut node_positions, &mut rank_band_map, layer_graph, config);

    // 6. Calculate overall bounding box
    let bounding_box = calculate_bounding_box(&node_positions, layer_graph);

    CoordinateAssignmentResult {
        node_positions,
        rank_band_map,
        bounding_box,
    }
}
