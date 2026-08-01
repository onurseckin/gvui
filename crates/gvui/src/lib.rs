#[path = "0_common/mod.rs"]
pub mod step0_common;

#[path = "1_cycle_breaking/mod.rs"]
pub mod step1_cycle_breaking;

#[path = "2_rank_assignment/mod.rs"]
pub mod step2_rank_assignment;

#[path = "3_crossing_minimization/mod.rs"]
pub mod step3_crossing_minimization;

#[path = "4_coordinate_assignment/mod.rs"]
pub mod step4_coordinate_assignment;

#[path = "5_edge_routing/mod.rs"]
pub mod step5_edge_routing;

#[path = "6_validation/mod.rs"]
pub mod step6_validation;

pub use step0_common as step_0_common;
pub use step1_cycle_breaking as step_1_cycle_breaking;
pub use step2_rank_assignment as step_2_rank_assignment;
pub use step3_crossing_minimization as step_3_crossing_minimization;
pub use step4_coordinate_assignment as step_4_coordinate_assignment;
pub use step5_edge_routing as step_5_edge_routing;
pub use step6_validation as step_6_validation;

pub use step0_common::badge_measurement;
pub use step0_common::config;
pub use step0_common::geometry;
pub use step0_common::types;
pub use step0_common::types::*;

pub use step1_cycle_breaking as cycle_breaking;
pub use step1_cycle_breaking as normalize;
pub use step2_rank_assignment as rank_assignment;
pub use step2_rank_assignment as layering;
pub use step2_rank_assignment as layer_graph;
pub use step3_crossing_minimization as crossing_minimization;
pub use step3_crossing_minimization as crossing_detection;
pub use step3_crossing_minimization as neighborhood_search;
pub use step3_crossing_minimization as objective;
pub use step3_crossing_minimization as layout_objective;
pub use step4_coordinate_assignment as coordinate_assignment;
pub use step4_coordinate_assignment as spacing_demand;
pub use step5_edge_routing as edge_routing;
pub use step5_edge_routing as edge_router;
pub use step5_edge_routing as route_search;
pub use step5_edge_routing as route_occupancy;
pub use step5_edge_routing as routing_grid;
pub use step5_edge_routing as special_routes;
pub use step5_edge_routing as ports;
pub use step5_edge_routing as badges;
pub use step5_edge_routing as svg_path;
pub use step5_edge_routing as routing;
pub use step6_validation as validation;
pub use step6_validation as layout_validator;

pub use step1_cycle_breaking::cycle_breaking_facade::break_cycles;
pub use step2_rank_assignment::assign_ranks;
pub use step3_crossing_minimization::crossing_counting::calculate_crossing_count;
pub use step3_crossing_minimization::rayon_parallel_search::optimize_layer_orders_parallel;
pub use step5_edge_routing::edge_router_facade::route_edges;

use config::{resolve_custom_layout_config, PartialCustomLayoutConfig};
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

#[wasm_bindgen]
pub fn compute_custom_layout_wasm(val: JsValue) -> Result<JsValue, JsValue> {
    let t_start = web_sys::window()
        .and_then(|w| w.performance())
        .map(|p| p.now())
        .unwrap_or(0.0);

    #[derive(serde::Deserialize)]
    struct LayoutInput {
        nodes: Vec<NormalizedNode>,
        edges: Vec<NormalizedEdge>,
        options: Option<PartialCustomLayoutConfig>,
    }

    let input: LayoutInput = serde_wasm_bindgen::from_value(val)?;
    let config = resolve_custom_layout_config(input.options.as_ref()).unwrap_or_default();

    // 1. Cycle Breaking & Classification
    let classified = break_cycles(&input.nodes, &input.edges);
    let active_edges: Vec<NormalizedEdge> = classified.iter().map(|c| c.edge.clone()).collect();
    let edge_role_map: std::collections::HashMap<String, EdgeRole> = classified
        .iter()
        .map(|c| (c.edge.id.clone(), c.role))
        .collect();

    // 2. Rank Assignment & Layer Graph Construction
    let layered = assign_ranks(&input.nodes, &active_edges, None);
    let layer_graph = step2_rank_assignment::layer_graph_builder::build_layer_graph(
        &input.nodes,
        &input.edges,
        Some(&edge_role_map),
        &layered,
    );

    let mut ranks_vec: Vec<Vec<String>> = Vec::new();
    let mut max_rank = 0;
    for &r in layered.rank_nodes_map.keys() {
        if r > max_rank {
            max_rank = r;
        }
    }
    for rank_idx in 0..=max_rank {
        if let Some(nodes) = layered.rank_nodes_map.get(&rank_idx) {
            ranks_vec.push(nodes.clone());
        } else if !layered.rank_nodes_map.is_empty() {
            ranks_vec.push(Vec::new());
        }
    }

    // 3. Parallel Neighborhood Search Optimization (Passes 1-15)
    let (optimized_ranks, executed_passes) =
        optimize_layer_orders_parallel(ranks_vec, &active_edges, config.max_global_passes);

    // 4. Coordinate Assignment (PAVA Monotonic Regression & Padding Alignment)
    let mut ordered_layers: Vec<Vec<LayerNode>> = Vec::new();
    for rank_nodes in &optimized_ranks {
        let mut layer_nodes = Vec::new();
        for node_id in rank_nodes {
            if let Some(ln) = layer_graph.item_map.get(node_id) {
                layer_nodes.push(ln.clone());
            }
        }
        ordered_layers.push(layer_nodes);
    }

    let norm_graph = step1_cycle_breaking::graph_normalization::normalize_graph(&input.nodes, &input.edges)
        .map(|r| r.graph)
        .unwrap_or_default();

    let coord_result = step4_coordinate_assignment::coordinate_assignment_facade::assign_coordinates(
        &norm_graph,
        &layer_graph,
        &ordered_layers,
        &config,
        None,
        None,
    );

    let mut positioned_nodes = Vec::new();
    for (rank_idx, rank_node_ids) in optimized_ranks.iter().enumerate() {
        for (order_idx, node_id) in rank_node_ids.iter().enumerate() {
            if let Some(input_node) = input.nodes.iter().find(|n| n.id == *node_id) {
                let pos = coord_result
                    .node_positions
                    .get(node_id)
                    .cloned()
                    .unwrap_or(Point { x: 50.0, y: 50.0 });
                positioned_nodes.push(PositionedNode {
                    id: input_node.id.clone(),
                    label: input_node.label.clone(),
                    x: pos.x,
                    y: pos.y,
                    width: input_node.width,
                    height: input_node.height,
                    rank: rank_idx,
                    order: order_idx,
                });
            }
        }
    }

    // 5. Bounded-Window Multi-Port Orthogonal Edge Routing
    let router_result = step5_edge_routing::edge_router_facade::route_all_edges(
        &positioned_nodes,
        &input.edges,
        Some(&active_edges),
        &config,
        None,
    );

    // 5.7 Badge Placement & Leader Line Routing
    let badge_result = step5_edge_routing::badge_placement::place_edge_badges(
        &router_result.routes,
        &positioned_nodes,
        &input.edges,
        &layered.node_rank_map,
        &config,
    );

    // 6. Full Extended Layout Validation Engine
    let validation = step6_validation::layout_validator::validate_custom_layout(
        &positioned_nodes,
        &router_result.routes,
        &badge_result.placements,
        Some(&input.edges),
        Some(&edge_role_map),
        &config,
    );

    let duration_ms = web_sys::window()
        .and_then(|w| w.performance())
        .map(|p| p.now() - t_start)
        .unwrap_or(0.0);

    let is_valid = validation.is_valid;
    let unresolved_badges = validation.metrics.unresolved_badge_count;
    let status = if !is_valid {
        "invalid_hard_failure".to_string()
    } else if unresolved_badges > 0 {
        "unresolved_soft_conflicts".to_string()
    } else {
        "success".to_string()
    };

    let simple_diagnostics: Vec<LayoutDiagnostic> = validation
        .diagnostics
        .into_iter()
        .map(|d| LayoutDiagnostic {
            code: d.code,
            severity: d.severity,
            message: d.message,
            ids: Some(d.ids),
        })
        .collect();

    let result = CustomLayoutResult {
        nodes: positioned_nodes,
        edges: router_result.routes,
        badges: badge_result.placements,
        crossings: validation.crossings.clone(),
        validation: LayoutValidationResult {
            is_valid,
            metrics: validation.metrics,
            crossings: validation.crossings,
            diagnostics: simple_diagnostics,
        },
        status,
        optimization_stats: OptimizationStats {
            global_passes: executed_passes,
            duration_ms,
            stop_reason: "bounded-local-optimum".to_string(),
        },
    };

    Ok(serde_wasm_bindgen::to_value(&result)?)
}
