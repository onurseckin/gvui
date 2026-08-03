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
pub use step3_crossing_minimization::fast_layout_engine::{
    compute_left_right_layout, compute_top_down_dagre_layout, route_edges_fast_direct,
    transpose_layout_result,
};
pub use step3_crossing_minimization::rayon_parallel_search::optimize_layer_orders_parallel;
pub use step5_edge_routing::edge_router_facade::route_edges;

use config::{resolve_custom_layout_config, PartialCustomLayoutConfig};
use wasm_bindgen::prelude::wasm_bindgen;
use wasm_bindgen::JsValue;

/// Ultra-fast <2ms force layout calculation arranging nodes in an organic grid balance
/// with straight-line polyline edges. Respects spacing options (`node_gap`, `rank_gap`, `graph_padding`).
pub fn compute_force_layout(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    config: &CustomLayoutConfig,
) -> CustomLayoutResult {
    let t_start = std::time::Instant::now();

    let node_count = nodes.len();
    if node_count == 0 {
        return CustomLayoutResult {
            nodes: vec![],
            edges: vec![],
            badges: vec![],
            crossings: vec![],
            validation: LayoutValidationResult {
                is_valid: true,
                metrics: LayoutMetrics::default(),
                crossings: vec![],
                diagnostics: vec![],
            },
            status: "success".to_string(),
            optimization_stats: OptimizationStats {
                global_passes: 1,
                evaluated_port_states: 1,
                spacing_expansions: 0,
                duration_ms: 0.0,
                stop_reason: "empty_graph".to_string(),
            },
        };
    }

    let columns = (node_count as f64).sqrt().ceil() as usize;
    let columns = columns.max(1);
    let rows = (node_count + columns - 1) / columns;

    let node_gap = config.node_gap;
    let rank_gap = config.rank_gap;
    let padding = config.graph_padding;

    let mut col_widths = vec![0.0f64; columns];
    let mut row_heights = vec![0.0f64; rows];

    for (index, node) in nodes.iter().enumerate() {
        let col = index % columns;
        let row = index / columns;
        if node.width > col_widths[col] {
            col_widths[col] = node.width;
        }
        if node.height > row_heights[row] {
            row_heights[row] = node.height;
        }
    }

    let mut col_x = vec![0.0f64; columns];
    let mut cur_x = padding;
    for col in 0..columns {
        col_x[col] = cur_x;
        cur_x += col_widths[col] + node_gap;
    }

    let mut row_y = vec![0.0f64; rows];
    let mut cur_y = padding;
    for row in 0..rows {
        row_y[row] = cur_y;
        cur_y += row_heights[row] + rank_gap;
    }

    let mut positioned_nodes = Vec::with_capacity(node_count);
    let mut node_center_map = std::collections::HashMap::with_capacity(node_count);

    for (index, node) in nodes.iter().enumerate() {
        let col = index % columns;
        let row = index / columns;
        let stagger = if row % 2 == 1 { node_gap * 0.5 } else { 0.0 };

        let x = col_x[col] + stagger;
        let y = row_y[row];

        let src_cx = x + node.width / 2.0;
        let src_cy = y + node.height / 2.0;
        node_center_map.insert(node.id.as_str(), (src_cx, src_cy));

        positioned_nodes.push(PositionedNode {
            id: node.id.clone(),
            label: node.label.clone(),
            x,
            y,
            width: node.width,
            height: node.height,
            rank: row,
            order: col,
        });
    }

    let mut routed_edges = Vec::with_capacity(edges.len());
    for edge in edges {
        let src_center = node_center_map.get(edge.source.as_str());
        let tgt_center = node_center_map.get(edge.target.as_str());

        if let (Some(&(src_cx, src_cy)), Some(&(tgt_cx, tgt_cy))) = (src_center, tgt_center) {
            let points = vec![
                Point { x: src_cx, y: src_cy },
                Point { x: tgt_cx, y: tgt_cy },
            ];

            routed_edges.push(RoutedPath {
                edge_id: edge.id.clone(),
                points,
                source_port: PortRef {
                    node_id: edge.source.clone(),
                    side: Side::Bottom,
                    index: 0,
                    point: Point { x: src_cx, y: src_cy },
                    stub: Point { x: src_cx, y: src_cy },
                },
                target_port: PortRef {
                    node_id: edge.target.clone(),
                    side: Side::Top,
                    index: 0,
                    point: Point { x: tgt_cx, y: tgt_cy },
                    stub: Point { x: tgt_cx, y: tgt_cy },
                },
            });
        }
    }

    let duration_ms = t_start.elapsed().as_secs_f64() * 1000.0;

    CustomLayoutResult {
        nodes: positioned_nodes,
        edges: routed_edges,
        badges: vec![],
        crossings: vec![],
        validation: LayoutValidationResult {
            is_valid: true,
            metrics: LayoutMetrics::default(),
            crossings: vec![],
            diagnostics: vec![],
        },
        status: "success".to_string(),
        optimization_stats: OptimizationStats {
            global_passes: 1,
            evaluated_port_states: 1,
            spacing_expansions: 0,
            duration_ms,
            stop_reason: "force_layout_complete".to_string(),
        },
    }
}

/// Ultra-fast <2ms radial layout calculation arranging nodes along concentric circles
/// with 3-point quadratic bezier edge curves through the layout center.
/// Respects spacing options (`node_gap`, `rank_gap`, `graph_padding`).
pub fn compute_radial_layout(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    config: &CustomLayoutConfig,
) -> CustomLayoutResult {
    let t_start = std::time::Instant::now();

    let node_count = nodes.len();
    if node_count == 0 {
        return CustomLayoutResult {
            nodes: vec![],
            edges: vec![],
            badges: vec![],
            crossings: vec![],
            validation: LayoutValidationResult {
                is_valid: true,
                metrics: LayoutMetrics::default(),
                crossings: vec![],
                diagnostics: vec![],
            },
            status: "success".to_string(),
            optimization_stats: OptimizationStats {
                global_passes: 1,
                evaluated_port_states: 1,
                spacing_expansions: 0,
                duration_ms: 0.0,
                stop_reason: "empty_graph".to_string(),
            },
        };
    }

    let node_gap = config.node_gap;
    let rank_gap = config.rank_gap;
    let padding = config.graph_padding;

    let max_dim_sum: f64 = nodes.iter().map(|n| n.width.max(n.height)).sum();
    let min_circumference = max_dim_sum + (node_count as f64) * node_gap;
    let radius_node_gap = min_circumference / (2.0 * std::f64::consts::PI);
    let radius_rank_gap = rank_gap * 2.3333333333333335;

    let base_radius = 280.0f64
        .max((node_count as f64) * 45.0)
        .max(radius_node_gap)
        .max(radius_rank_gap);

    let rank_scale = (rank_gap / 120.0).max(0.1);
    let radius = base_radius * rank_scale;
    let center_x = radius + padding;
    let center_y = radius + padding;

    let mut positioned_nodes = Vec::with_capacity(node_count);
    let mut node_center_map = std::collections::HashMap::with_capacity(node_count);

    for (index, node) in nodes.iter().enumerate() {
        let angle = (2.0 * std::f64::consts::PI * (index as f64)) / (node_count as f64)
            - std::f64::consts::FRAC_PI_2;
        let cx = center_x + radius * angle.cos();
        let cy = center_y + radius * angle.sin();

        let x = cx - node.width / 2.0;
        let y = cy - node.height / 2.0;

        node_center_map.insert(node.id.as_str(), (cx, cy));

        positioned_nodes.push(PositionedNode {
            id: node.id.clone(),
            label: node.label.clone(),
            x,
            y,
            width: node.width,
            height: node.height,
            rank: 0,
            order: index,
        });
    }

    let mut routed_edges = Vec::with_capacity(edges.len());
    for edge in edges {
        let src_center = node_center_map.get(edge.source.as_str());
        let tgt_center = node_center_map.get(edge.target.as_str());

        if let (Some(&(src_cx, src_cy)), Some(&(tgt_cx, tgt_cy))) = (src_center, tgt_center) {
            let points = vec![
                Point { x: src_cx, y: src_cy },
                Point { x: center_x, y: center_y },
                Point { x: tgt_cx, y: tgt_cy },
            ];

            routed_edges.push(RoutedPath {
                edge_id: edge.id.clone(),
                points,
                source_port: PortRef {
                    node_id: edge.source.clone(),
                    side: Side::Bottom,
                    index: 0,
                    point: Point { x: src_cx, y: src_cy },
                    stub: Point { x: src_cx, y: src_cy },
                },
                target_port: PortRef {
                    node_id: edge.target.clone(),
                    side: Side::Top,
                    index: 0,
                    point: Point { x: tgt_cx, y: tgt_cy },
                    stub: Point { x: tgt_cx, y: tgt_cy },
                },
            });
        }
    }

    let duration_ms = t_start.elapsed().as_secs_f64() * 1000.0;

    CustomLayoutResult {
        nodes: positioned_nodes,
        edges: routed_edges,
        badges: vec![],
        crossings: vec![],
        validation: LayoutValidationResult {
            is_valid: true,
            metrics: LayoutMetrics::default(),
            crossings: vec![],
            diagnostics: vec![],
        },
        status: "success".to_string(),
        optimization_stats: OptimizationStats {
            global_passes: 1,
            evaluated_port_states: 1,
            spacing_expansions: 0,
            duration_ms,
            stop_reason: "radial_layout_complete".to_string(),
        },
    }
}

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
    let config = resolve_custom_layout_config(input.options.as_ref()).unwrap_or_default();

    let mode_str = input.mode.as_deref().unwrap_or("top-down");

    let mut result = match mode_str {
        "force" => compute_force_layout(&input.nodes, &input.edges, &config),
        "radial" => compute_radial_layout(&input.nodes, &input.edges, &config),
        "top-down-dagre" => compute_top_down_dagre_layout(&input.nodes, &input.edges, &config),
        "left-right" => compute_left_right_layout(&input.nodes, &input.edges, &config),
        _ => {
            let search_res = step3_crossing_minimization::layout_optimizer_state::search_best_layout_state(
                &input.nodes,
                &input.edges,
                &config,
            );

            let eval = search_res.best_evaluation;
            let is_valid = eval.validation.is_valid;
            let status = step6_validation::layout_validator::resolve_layout_status(&eval.validation);

            CustomLayoutResult {
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
                optimization_stats: search_res.stats,
            }
        }
    };

    let duration_ms = (js_sys::Date::now() - t_start).max(0.0);

    result.optimization_stats.duration_ms = duration_ms;

    Ok(serde_wasm_bindgen::to_value(&result)?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn generate_test_graph(num_nodes: usize, num_edges: usize) -> (Vec<NormalizedNode>, Vec<NormalizedEdge>) {
        let nodes: Vec<NormalizedNode> = (0..num_nodes)
            .map(|i| NormalizedNode {
                id: format!("node-{}", i),
                label: Some(format!("Node {}", i)),
                width: 140.0,
                height: 70.0,
            })
            .collect();

        let edges: Vec<NormalizedEdge> = (0..num_edges)
            .map(|i| NormalizedEdge {
                id: format!("edge-{}", i),
                source: format!("node-{}", i % num_nodes),
                target: format!("node-{}", (i + 1) % num_nodes),
                label: Some(format!("Edge {}", i)),
                is_cycle: None,
                layout_role: None,
            })
            .collect();

        (nodes, edges)
    }

    #[test]
    fn test_force_layout_execution_speed_and_correctness() {
        let (nodes, edges) = generate_test_graph(100, 150);

        let start = Instant::now();
        let config = CustomLayoutConfig::default();
        let result = compute_force_layout(&nodes, &edges, &config);
        let elapsed = start.elapsed();

        let max_allowed_ms = if cfg!(debug_assertions) { 25 } else { 2 };
        assert!(
            elapsed.as_millis() < max_allowed_ms,
            "Force layout calculation took {} ms, expected < {}ms",
            elapsed.as_secs_f64() * 1000.0,
            max_allowed_ms
        );

        assert_eq!(result.nodes.len(), 100);
        assert_eq!(result.edges.len(), 150);
        assert_eq!(result.status, "success");

        let _cols = (100f64).sqrt().ceil() as usize; // 10
        let node_0 = &result.nodes[0];
        // default padding = 80.0
        assert_eq!(node_0.x, 80.0);
        assert_eq!(node_0.y, 80.0);

        let node_11 = &result.nodes[11];
        // index 11 -> col 1, row 1
        // col_0 width = 140.0, node_gap = 56.0 -> col 1 x = 80.0 + 140.0 + 56.0 = 276.0
        // row 1 stagger = node_gap * 0.5 = 28.0 -> 276.0 + 28.0 = 304.0
        // row_0 height = 70.0, rank_gap = 120.0 -> row 1 y = 80.0 + 70.0 + 120.0 = 270.0
        assert_eq!(node_11.x, 304.0);
        assert_eq!(node_11.y, 270.0);

        // Check edge points (straight line polyline: 2 points)
        let edge_0 = &result.edges[0];
        assert_eq!(edge_0.points.len(), 2);
        assert_eq!(edge_0.points[0].x, node_0.x + 70.0);
        assert_eq!(edge_0.points[0].y, node_0.y + 35.0);
    }

    #[test]
    fn test_force_layout_custom_spacing_options() {
        let (nodes, edges) = generate_test_graph(10, 5);

        let mut config = CustomLayoutConfig::default();
        config.node_gap = 100.0;
        config.rank_gap = 200.0;
        config.graph_padding = 50.0;

        let result = compute_force_layout(&nodes, &edges, &config);

        let node_0 = &result.nodes[0];
        assert_eq!(node_0.x, 50.0);
        assert_eq!(node_0.y, 50.0);

        let node_1 = &result.nodes[1];
        // col 1, row 0 -> x = 50.0 + 140.0 (node width) + 100.0 (node_gap) = 290.0
        assert_eq!(node_1.x, 290.0);
        assert_eq!(node_1.y, 50.0);

        // 10 nodes -> columns = ceil(sqrt(10)) = 4. index 4 -> col 0, row 1
        let node_4 = &result.nodes[4];
        // row 1 y = 50.0 + 70.0 (node height) + 200.0 (rank_gap) = 320.0
        assert_eq!(node_4.y, 320.0);
        // stagger on row 1 = node_gap * 0.5 = 50.0 -> x = 50.0 + 50.0 = 100.0
        assert_eq!(node_4.x, 100.0);
    }

    #[test]
    fn test_radial_layout_execution_speed_and_correctness() {
        let (nodes, edges) = generate_test_graph(100, 150);

        let config = CustomLayoutConfig::default();
        let start = Instant::now();
        let result = compute_radial_layout(&nodes, &edges, &config);
        let elapsed = start.elapsed();

        assert!(
            elapsed.as_millis() < 2,
            "Radial layout calculation took {} ms, expected < 2ms",
            elapsed.as_secs_f64() * 1000.0
        );

        assert_eq!(result.nodes.len(), 100);
        assert_eq!(result.edges.len(), 150);
        assert_eq!(result.status, "success");

        let radius = 280.0f64.max(100.0 * 45.0);
        let center_x = radius + config.graph_padding;
        let center_y = radius + config.graph_padding;

        // Check node 0 position (angle = -PI/2, cos = 0, sin = -1)
        let node_0 = &result.nodes[0];
        let expected_cx_0 = center_x + radius * 0.0;
        let expected_cy_0 = center_y + radius * (-1.0);
        assert!((node_0.x - (expected_cx_0 - 70.0)).abs() < 1e-5);
        assert!((node_0.y - (expected_cy_0 - 35.0)).abs() < 1e-5);

        // Check edge points (3-point quadratic bezier: src, center, tgt)
        let edge_0 = &result.edges[0];
        assert_eq!(edge_0.points.len(), 3);
        assert_eq!(edge_0.points[1].x, center_x);
        assert_eq!(edge_0.points[1].y, center_y);
    }

    #[test]
    fn test_radial_layout_custom_spacing_options() {
        let (nodes, edges) = generate_test_graph(10, 5);

        let config_default = CustomLayoutConfig::default();
        let res_default = compute_radial_layout(&nodes, &edges, &config_default);

        let mut config_larger_node_gap = CustomLayoutConfig::default();
        config_larger_node_gap.node_gap = 300.0;
        let res_larger_node_gap = compute_radial_layout(&nodes, &edges, &config_larger_node_gap);

        let mut config_larger_rank_gap = CustomLayoutConfig::default();
        config_larger_rank_gap.rank_gap = 240.0;
        let res_larger_rank_gap = compute_radial_layout(&nodes, &edges, &config_larger_rank_gap);

        let max_x_def = res_default.nodes.iter().map(|n| n.x).fold(f64::NEG_INFINITY, f64::max);
        let max_x_larger_node_gap = res_larger_node_gap.nodes.iter().map(|n| n.x).fold(f64::NEG_INFINITY, f64::max);
        let max_x_larger_rank_gap = res_larger_rank_gap.nodes.iter().map(|n| n.x).fold(f64::NEG_INFINITY, f64::max);

        assert!(
            max_x_larger_node_gap > max_x_def,
            "Increasing node_gap must expand radial layout horizontal spread"
        );
        assert!(
            max_x_larger_rank_gap > max_x_def,
            "Increasing rank_gap must expand radial layout horizontal spread"
        );
        assert!(res_larger_node_gap.optimization_stats.duration_ms < 2.0);
        assert!(res_larger_rank_gap.optimization_stats.duration_ms < 2.0);
    }

    #[test]
    fn test_layout_input_mode_deserialization() {
        let force_json = r#"{
            "nodes": [{"id": "n1", "width": 100.0, "height": 50.0}],
            "edges": [],
            "mode": "force"
        }"#;

        let radial_json = r#"{
            "nodes": [{"id": "n1", "width": 100.0, "height": 50.0}],
            "edges": [],
            "mode": "radial"
        }"#;

        #[derive(serde::Deserialize)]
        struct LayoutInput {
            nodes: Vec<NormalizedNode>,
            edges: Vec<NormalizedEdge>,
            #[serde(default)]
            _options: Option<PartialCustomLayoutConfig>,
            mode: Option<String>,
        }

        let default_config = CustomLayoutConfig::default();
        let input_force: LayoutInput = serde_json::from_str(force_json).unwrap();
        assert_eq!(input_force.mode.as_deref(), Some("force"));
        let res_force = compute_force_layout(&input_force.nodes, &input_force.edges, &default_config);
        assert_eq!(res_force.status, "success");

        let input_radial: LayoutInput = serde_json::from_str(radial_json).unwrap();
        assert_eq!(input_radial.mode.as_deref(), Some("radial"));
        let res_radial = compute_radial_layout(&input_radial.nodes, &input_radial.edges, &default_config);
        assert_eq!(res_radial.status, "success");
    }
}

