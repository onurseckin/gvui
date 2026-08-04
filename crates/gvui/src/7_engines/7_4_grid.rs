//! # Step 7.4: Grid engine — the debug mode
//!
//! Row-major placement in input order, straight edges, nothing else. No topology is consulted and
//! nothing is optimized, on purpose: this is the mode you switch to when you want to see *what the
//! data is* rather than what the layout engine thinks of it, and when you need a layout whose output
//! you can predict by hand.
//!
//! Because it consults nothing, it is also the cheapest correctness oracle in the engine — every
//! node is positioned, every edge is routed, no box overlaps another, and that holds for any input.

use crate::config::CustomLayoutConfig;
use crate::step0_common::ingest::build_graph_ir;
use crate::types::{
    get_now_ms, CustomLayoutResult, NormalizedEdge, NormalizedNode, OptimizationStats,
    PhaseTimings, Rect,
};

use super::organic::{build_routes, finish_geometric_layout, place_badges};

/// Lays a graph out on a row-major grid.
///
/// Guarantees:
///
/// - **No two boxes overlap**, for any input: columns are separated by `effective_node_gap()` and
///   rows by `effective_rank_gap()`, and every cell is at least as large as the widest box in its
///   column and the tallest in its row.
/// - **Shape follows `target_aspect_ratio`**: `cols = ceil(sqrt(n * target_aspect_ratio))`.
/// - **Positions depend only on input order**, so the same dataset always draws identically and a
///   diff of two runs is a diff of the data.
pub fn layout_grid(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    config: &CustomLayoutConfig,
) -> CustomLayoutResult {
    if nodes.is_empty() {
        return CustomLayoutResult::empty("empty_graph");
    }

    let t_start = get_now_ms();
    let mut timings = PhaseTimings::default();

    let t = get_now_ms();
    let ir = build_graph_ir(nodes, edges, config);
    timings.ingest = get_now_ms() - t;

    let n = ir.node_count();
    if n == 0 {
        return CustomLayoutResult::empty("empty_graph");
    }

    // ---- geometry -----------------------------------------------------------------------------
    let t = get_now_ms();
    let cols = column_count(n, config.target_aspect_ratio);
    // `column_count` guarantees `cols >= 1`, so this cannot divide by zero.
    let rows = n.div_ceil(cols);

    // Per-column widths and per-row heights, so a single tall node does not inflate the whole grid.
    let mut col_width = vec![0.0f64; cols];
    let mut row_height = vec![0.0f64; rows];
    for (i, node) in ir.nodes.iter().enumerate() {
        col_width[i % cols] = col_width[i % cols].max(node.width);
        row_height[i / cols] = row_height[i / cols].max(node.height);
    }

    let gap_x = config.effective_node_gap().max(0.0);
    let gap_y = config.effective_rank_gap().max(0.0);

    let mut col_x = vec![0.0f64; cols];
    let mut cursor = 0.0;
    for c in 0..cols {
        col_x[c] = cursor;
        cursor += col_width[c] + gap_x;
    }
    let mut row_y = vec![0.0f64; rows];
    let mut cursor = 0.0;
    for r in 0..rows {
        row_y[r] = cursor;
        cursor += row_height[r] + gap_y;
    }

    let mut rects: Vec<Rect> = Vec::with_capacity(n);
    let mut placement: Vec<(usize, usize)> = Vec::with_capacity(n);
    for (i, node) in ir.nodes.iter().enumerate() {
        let (r, c) = (i / cols, i % cols);
        // Centred in its cell: a narrow node in a wide column reads as belonging to the column.
        rects.push(Rect {
            x: col_x[c] + (col_width[c] - node.width) / 2.0,
            y: row_y[r] + (row_height[r] - node.height) / 2.0,
            width: node.width,
            height: node.height,
        });
        placement.push((r, c));
    }
    timings.coordinates = get_now_ms() - t;

    // ---- routes and badges --------------------------------------------------------------------
    let t = get_now_ms();
    let routes = build_routes(&ir, &rects, &[], config);
    timings.route = get_now_ms() - t;

    let (badges, leader_count) = place_badges(&ir, edges, &rects, &routes, config);

    let stats = OptimizationStats {
        global_passes: 0,
        evaluated_port_states: 0,
        spacing_expansions: 0,
        duration_ms: 0.0,
        stop_reason: "grid-complete".to_string(),
        timings,
    };

    finish_geometric_layout(
        &ir, &rects, &placement, routes, badges, leader_count, stats, t_start, config,
    )
}

/// `ceil(sqrt(n * target_aspect_ratio))`, clamped to `1..=n`.
///
/// The clamp is what keeps a hostile `target_aspect_ratio` from producing a zero-column grid (which
/// would divide by zero) or more columns than there are nodes (which would allocate empty rows).
fn column_count(n: usize, target_aspect_ratio: f64) -> usize {
    if n == 0 {
        return 1;
    }
    let aspect = if target_aspect_ratio.is_finite() && target_aspect_ratio > 0.0 {
        target_aspect_ratio
    } else {
        1.0
    };
    let raw = ((n as f64) * aspect).sqrt().ceil();
    if !raw.is_finite() || raw < 1.0 {
        return 1;
    }
    (raw as usize).clamp(1, n)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::DEFAULT_CUSTOM_LAYOUT_CONFIG;
    use crate::geometry::rects_overlap_area;
    use crate::types::Rect as GeoRect;

    fn node(id: &str, w: f64, h: f64) -> NormalizedNode {
        NormalizedNode {
            id: id.to_string(),
            label: Some(id.to_string()),
            width: w,
            height: h,
            rank: None,
            group: None,
        }
    }

    fn edge(id: &str, s: &str, t: &str) -> NormalizedEdge {
        NormalizedEdge {
            id: id.to_string(),
            source: s.to_string(),
            target: t.to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
            weight: None,
            min_len: None,
            label_width: None,
            label_height: None,
        }
    }

    fn ring(len: usize) -> (Vec<NormalizedNode>, Vec<NormalizedEdge>) {
        let nodes: Vec<NormalizedNode> = (0..len)
            .map(|i| node(&format!("n{}", i), 140.0, 60.0))
            .collect();
        let edges: Vec<NormalizedEdge> = (0..len)
            .map(|i| {
                edge(
                    &format!("e{}", i),
                    &format!("n{}", i),
                    &format!("n{}", (i + 1) % len),
                )
            })
            .collect();
        (nodes, edges)
    }

    fn bbox_width(r: &CustomLayoutResult) -> f64 {
        let mut min_x = f64::INFINITY;
        let mut max_x = f64::NEG_INFINITY;
        for n in &r.nodes {
            min_x = min_x.min(n.x);
            max_x = max_x.max(n.x + n.width);
        }
        if min_x > max_x {
            0.0
        } else {
            max_x - min_x
        }
    }

    #[test]
    fn empty_input_is_an_empty_graph() {
        let out = layout_grid(&[], &[], &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        assert!(out.nodes.is_empty());
        assert_eq!(out.optimization_stats.stop_reason, "empty_graph");
    }

    #[test]
    fn every_node_and_edge_is_present() {
        let (nodes, edges) = ring(7);
        let out = layout_grid(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        assert_eq!(out.nodes.len(), 7);
        assert_eq!(out.edges.len(), 7);
        assert!(out.nodes.iter().all(|n| n.x.is_finite() && n.y.is_finite()));
    }

    #[test]
    fn layout_is_deterministic_across_runs() {
        let (nodes, edges) = ring(9);
        let a = layout_grid(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        let b = layout_grid(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        assert_eq!(
            serde_json::to_string(&a.nodes).unwrap_or_default(),
            serde_json::to_string(&b.nodes).unwrap_or_default()
        );
    }

    #[test]
    fn no_two_boxes_overlap() {
        // Deliberately ragged boxes so the per-column / per-row sizing is actually exercised.
        let nodes: Vec<NormalizedNode> = (0..11)
            .map(|i| node(&format!("n{}", i), 130.0 + (i as f64) * 17.0, 40.0 + (i as f64) * 9.0))
            .collect();
        let out = layout_grid(&nodes, &[], &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        for i in 0..out.nodes.len() {
            for j in (i + 1)..out.nodes.len() {
                let a = GeoRect {
                    x: out.nodes[i].x,
                    y: out.nodes[i].y,
                    width: out.nodes[i].width,
                    height: out.nodes[i].height,
                };
                let b = GeoRect {
                    x: out.nodes[j].x,
                    y: out.nodes[j].y,
                    width: out.nodes[j].width,
                    height: out.nodes[j].height,
                };
                assert!(
                    !rects_overlap_area(&a, &b, DEFAULT_CUSTOM_LAYOUT_CONFIG.epsilon),
                    "grid cells {i} and {j} overlap"
                );
            }
        }
    }

    #[test]
    fn placement_is_row_major_in_input_order() {
        let (nodes, _) = ring(6);
        let out = layout_grid(&nodes, &[], &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        let cols = column_count(6, DEFAULT_CUSTOM_LAYOUT_CONFIG.target_aspect_ratio);
        for (i, n) in out.nodes.iter().enumerate() {
            assert_eq!(n.rank, i / cols, "node {i} row");
            assert_eq!(n.order, i % cols, "node {i} column");
        }
    }

    #[test]
    fn column_count_follows_the_target_aspect_ratio() {
        // 6 nodes at 1.6 -> ceil(sqrt(9.6)) = 4.
        assert_eq!(column_count(6, 1.6), 4);
        // A square target packs tighter.
        assert_eq!(column_count(9, 1.0), 3);
        // A wider target uses more columns.
        assert!(column_count(16, 4.0) > column_count(16, 1.0));
        // Degenerate inputs cannot produce a zero-column grid.
        assert_eq!(column_count(5, 0.0), 3);
        assert_eq!(column_count(5, f64::NAN), 3);
        assert_eq!(column_count(0, 1.6), 1);
        // Never more columns than nodes.
        assert_eq!(column_count(2, 1000.0), 2);
    }

    #[test]
    fn doubling_node_gap_widens_the_drawing() {
        let (nodes, edges) = ring(6);
        let base = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        let mut wide = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        wide.node_gap = base.node_gap * 2.0;

        let w0 = bbox_width(&layout_grid(&nodes, &edges, &base));
        let w1 = bbox_width(&layout_grid(&nodes, &edges, &wide));
        assert!(w1 > w0, "doubling node_gap must widen the drawing: {w0} -> {w1}");
    }

    #[test]
    fn compaction_tightens_the_drawing() {
        use crate::config::Compaction;
        let (nodes, edges) = ring(6);
        let mut tight = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        tight.compaction = Compaction::Tight;
        let mut airy = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        airy.compaction = Compaction::Airy;

        let w_tight = bbox_width(&layout_grid(&nodes, &edges, &tight));
        let w_airy = bbox_width(&layout_grid(&nodes, &edges, &airy));
        assert!(w_airy > w_tight, "airy must be wider than tight: {w_tight} vs {w_airy}");
    }

    #[test]
    fn single_node_sits_at_the_padding_corner() {
        let nodes = vec![node("solo", 200.0, 80.0)];
        let out = layout_grid(&nodes, &[], &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        let p = DEFAULT_CUSTOM_LAYOUT_CONFIG.graph_padding;
        assert_eq!(out.nodes.len(), 1);
        assert!((out.nodes[0].x - p).abs() < 1e-6);
        assert!((out.nodes[0].y - p).abs() < 1e-6);
    }
}
