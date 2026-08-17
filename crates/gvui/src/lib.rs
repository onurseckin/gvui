//! # GVUI Layout Engine
//!
//! A layered graph layout engine built on one rule: **constraints flow forward, nothing is
//! retried.** Every phase produces a result that is correct by construction with respect to the
//! constraints its successors cannot repair.
//!
//! Two consequences make the whole design work:
//!
//! - Edge labels are **items in the layered graph** carrying their measured box, so badge space is
//!   allocated by the same machinery that separates nodes. It cannot fail to fit, so there is
//!   nothing to retry.
//! - Routing lane demand is **computed from the fixed ordering before any geometry exists**, by
//!   interval-graph colouring, and fed into node separation. One pass, exact, no pathfinding.
//!
//! See `docs/engine/` and `docs/concepts/` for the full design.
//!
//! ## Phases
//!
//! | Phase | Module | Output |
//! | --- | --- | --- |
//! | 0 Ingest | [`step0_common::ingest`] | [`types::GraphIr`] |
//! | 2 Structure | [`step1_cycle_breaking::structure`] | [`types::StructureResult`] |
//! | 3 Rank | [`step2_rank_assignment::rank_facade`] | [`types::RankResult`] |
//! | 4 Layer | [`step3_crossing_minimization::layer_builder`] | [`types::Layered`] |
//! | 5 Order | [`step3_crossing_minimization::order_facade`] | item orders |
//! | 6 Demand | [`step4_coordinate_assignment::lane_demand`] | [`types::RoutingDemand`] |
//! | 7 Coordinates | [`step4_coordinate_assignment::coordinate_facade`] | item positions |
//! | 8 Route | [`step5_edge_routing::route_facade`] | routes and badges |
//! | 9 Emit | [`step6_validation::emit`] | [`types::CustomLayoutResult`] |

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

#[path = "7_engines/mod.rs"]
pub mod step7_engines;

// ---- Ergonomic aliases -----------------------------------------------------------------------

pub use step0_common::badge_measurement;
pub use step0_common::config;
pub use step0_common::geometry;
pub use step0_common::ingest;
pub use step0_common::types;
pub use step0_common::types::*;

pub use step1_cycle_breaking as structure;
pub use step2_rank_assignment as rank_assignment;
pub use step3_crossing_minimization as ordering;
pub use step4_coordinate_assignment as coordinates;
pub use step5_edge_routing as routing;
pub use step6_validation as validation;
pub use step7_engines as engines;

pub use step0_common::ingest::build_graph_ir;
pub use step1_cycle_breaking::analyze_structure;
pub use step2_rank_assignment::assign_ranks;
pub use step3_crossing_minimization::{build_layered, order_layers};
pub use step4_coordinate_assignment::{assign_coordinates, compute_routing_demand};
pub use step5_edge_routing::route_edges;
pub use step7_engines::compute_layout;

use config::{resolve_custom_layout_config, PartialCustomLayoutConfig};
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

/// WebAssembly entry point.
///
/// Input shape:
/// ```jsonc
/// {
///   "nodes":   [{ "id": "n1", "label": "...", "width": 200, "height": 90 }],
///   "edges":   [{ "id": "e1", "source": "n1", "target": "n2", "label": "...",
///                 "labelWidth": 84, "labelHeight": 28 }],
///   "options": { "nodeGap": 56, "direction": "top-down", ... },
///   "mode":    "top-down" | "left-right" | "organic" | "radial" | "grid"
/// }
/// ```
#[wasm_bindgen]
pub fn compute_custom_layout_wasm(val: JsValue) -> Result<JsValue, JsValue> {
    let t_start = js_sys::Date::now();

    #[derive(serde::Deserialize)]
    struct LayoutInput {
        nodes: Vec<NormalizedNode>,
        edges: Vec<NormalizedEdge>,
        #[serde(default)]
        options: Option<PartialCustomLayoutConfig>,
        #[serde(default)]
        mode: Option<String>,
    }

    let input: LayoutInput = serde_wasm_bindgen::from_value(val)?;

    let cfg = resolve_custom_layout_config(input.options.as_ref())
        .map_err(|e| JsValue::from_str(&e.message))?;

    // `mode` selects the engine and nothing else. Flow direction comes only from
    // `cfg.direction`. The previous version also derived a direction from the mode string and let
    // an explicit config value override it — but the client always sends a fully resolved config,
    // so the explicit value was always present and the mode's direction was discarded every time.
    // `left-right` therefore drew exactly like `top-down`.
    let engine_mode = EngineMode::from_mode_str(input.mode.as_deref().unwrap_or("layered"));

    let mut result = compute_layout(&input.nodes, &input.edges, &cfg, engine_mode);
    result.optimization_stats.duration_ms = (js_sys::Date::now() - t_start).max(0.0);
    result.optimization_stats.timings.total = result.optimization_stats.duration_ms;

    Ok(serde_wasm_bindgen::to_value(&result)?)
}
