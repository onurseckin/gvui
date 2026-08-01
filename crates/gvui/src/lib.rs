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

    let search_res = step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
        &input.nodes,
        &input.edges,
        &config,
    );

    let duration_ms = web_sys::window()
        .and_then(|w| w.performance())
        .map(|p| p.now() - t_start)
        .unwrap_or(0.0);

    let mut stats = search_res.stats;
    stats.duration_ms = duration_ms;

    let eval = search_res.best_evaluation;
    let is_valid = eval.validation.is_valid;
    let status = step6_validation::layout_validator::resolve_layout_status(&eval.validation);

    let result = CustomLayoutResult {
        nodes: eval.nodes,
        edges: eval.routes,
        badges: eval.badges,
        crossings: eval.validation.crossings.clone(),
        validation: LayoutValidationResult {
            is_valid,
            metrics: eval.validation.metrics,
            crossings: eval.validation.crossings,
            diagnostics: eval.diagnostics,
        },
        status,
        optimization_stats: stats,
    };

    Ok(serde_wasm_bindgen::to_value(&result)?)
}
