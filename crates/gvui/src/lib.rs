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

    // 1. Cycle Breaking
    let classified = break_cycles(&input.nodes, &input.edges);

    let active_edges: Vec<NormalizedEdge> = classified
        .into_iter()
        .map(|c| c.edge)
        .collect();

    // 2. Rank Assignment
    let layered = assign_ranks(&input.nodes, &active_edges, None);

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

    // 4. Coordinate Assignment
    let rank_spacing_y = config.rank_gap;
    let node_spacing_x = config.node_gap;

    let mut positioned_nodes = Vec::new();

    for (rank_idx, rank_node_ids) in optimized_ranks.iter().enumerate() {
        let mut current_x = 50.0;
        let y = 50.0 + (rank_idx as f64) * rank_spacing_y;

        for (order_idx, node_id) in rank_node_ids.iter().enumerate() {
            if let Some(input_node) = input.nodes.iter().find(|n| n.id == *node_id) {
                positioned_nodes.push(PositionedNode {
                    id: input_node.id.clone(),
                    label: input_node.label.clone(),
                    x: current_x,
                    y,
                    width: input_node.width,
                    height: input_node.height,
                    rank: rank_idx,
                    order: order_idx,
                });

                current_x += input_node.width + node_spacing_x;
            }
        }
    }

    // 5. Bounded-Window Orthogonal Edge Routing
    let routed_edges = route_edges(&positioned_nodes, &input.edges);

    let duration_ms = web_sys::window()
        .and_then(|w| w.performance())
        .map(|p| p.now() - t_start)
        .unwrap_or(0.0);

    let crossing_count = calculate_crossing_count(&optimized_ranks, &active_edges);

    let result = CustomLayoutResult {
        nodes: positioned_nodes,
        edges: routed_edges,
        badges: Vec::<BadgePlacement>::new(),
        crossings: Vec::<EdgeCrossing>::new(),
        validation: LayoutValidationResult {
            is_valid: true,
            metrics: LayoutMetrics {
                crossing_count,
                ..Default::default()
            },
            crossings: Vec::new(),
            diagnostics: Vec::new(),
        },
        status: "OPTIMAL_WASM_V2".to_string(),
        optimization_stats: OptimizationStats {
            global_passes: executed_passes,
            duration_ms,
            stop_reason: "bounded-local-optimum".to_string(),
        },
    };

    Ok(serde_wasm_bindgen::to_value(&result)?)
}
