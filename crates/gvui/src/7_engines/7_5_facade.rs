//! # Step 7.5: Engine facade
//!
//! One function, one dispatch table. Everything a caller needs to know about mode selection lives
//! here so no other module has to branch on [`EngineMode`].
//!
//! The empty-graph guard is deliberately *in front of* the dispatch rather than duplicated in each
//! engine. It is the only pre-condition all four share, and hoisting it means an engine can assume
//! it was handed at least one node — which is what lets them index `ir.nodes[0]` and reason about a
//! root, a first row or an initial circle without a special case each.

use crate::config::{CustomLayoutConfig, EngineMode};
use crate::types::{CustomLayoutResult, NormalizedEdge, NormalizedNode};

use super::grid::layout_grid;
use super::layered::layout_layered;
use super::organic::layout_organic;
use super::radial::layout_radial;

/// Runs the engine selected by `mode`.
///
/// Contract subtleties worth knowing:
///
/// - **`Layered` and `LayeredSpline` are the same layout.** The spline variant differs only in the
///   path command the renderer emits, so both resolve to [`layout_layered`]; the choice reaches the
///   renderer through `config.edge_style`, not through the engine.
/// - **`config.direction` is honoured only by the layered engine.** Organic, radial and grid have no
///   flow axis; setting a direction for them is meaningless rather than wrong, and is ignored.
/// - **An empty node list is a success, not an error.** It returns a well-formed empty result with
///   `stop_reason = "empty_graph"` so a caller rendering an empty dataset does not have to
///   distinguish "nothing to draw" from "layout failed".
///
/// Never panics and never fails: malformed edges are dropped during ingest and surfaced through
/// `validation.diagnostics`.
pub fn compute_layout(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    config: &CustomLayoutConfig,
    mode: EngineMode,
) -> CustomLayoutResult {
    if nodes.is_empty() {
        return CustomLayoutResult::empty("empty_graph");
    }

    match mode {
        EngineMode::Layered | EngineMode::LayeredSpline => layout_layered(nodes, edges, config),
        EngineMode::Organic => layout_organic(nodes, edges, config),
        EngineMode::Radial => layout_radial(nodes, edges, config),
        EngineMode::Grid => layout_grid(nodes, edges, config),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::DEFAULT_CUSTOM_LAYOUT_CONFIG;

    fn node(id: &str) -> NormalizedNode {
        NormalizedNode {
            id: id.to_string(),
            label: Some(id.to_string()),
            width: 140.0,
            height: 60.0,
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

    fn small() -> (Vec<NormalizedNode>, Vec<NormalizedEdge>) {
        let nodes = vec![node("a"), node("b"), node("c"), node("d")];
        let edges = vec![
            edge("e0", "a", "b"),
            edge("e1", "b", "c"),
            edge("e2", "a", "d"),
        ];
        (nodes, edges)
    }

    const ALL_MODES: [EngineMode; 5] = [
        EngineMode::Layered,
        EngineMode::LayeredSpline,
        EngineMode::Organic,
        EngineMode::Radial,
        EngineMode::Grid,
    ];

    #[test]
    fn empty_input_short_circuits_for_every_mode() {
        for mode in ALL_MODES {
            let out = compute_layout(&[], &[], &DEFAULT_CUSTOM_LAYOUT_CONFIG, mode);
            assert!(out.nodes.is_empty(), "{mode:?}");
            assert!(out.edges.is_empty(), "{mode:?}");
            assert!(out.validation.is_valid, "{mode:?}");
            assert_eq!(out.optimization_stats.stop_reason, "empty_graph", "{mode:?}");
        }
    }

    #[test]
    fn every_mode_positions_every_node_and_routes_every_edge() {
        let (nodes, edges) = small();
        for mode in ALL_MODES {
            let out = compute_layout(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG, mode);
            assert_eq!(out.nodes.len(), nodes.len(), "{mode:?} node count");
            assert_eq!(out.edges.len(), edges.len(), "{mode:?} edge count");
            assert!(
                out.nodes.iter().all(|n| n.x.is_finite() && n.y.is_finite()),
                "{mode:?} produced a non-finite position"
            );
            assert!(
                out.edges.iter().all(|e| e.points.len() >= 2),
                "{mode:?} produced a degenerate route"
            );
        }
    }

    #[test]
    fn every_mode_is_deterministic() {
        let (nodes, edges) = small();
        for mode in ALL_MODES {
            let a = compute_layout(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG, mode);
            let b = compute_layout(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG, mode);
            assert_eq!(
                serde_json::to_string(&a.nodes).unwrap_or_default(),
                serde_json::to_string(&b.nodes).unwrap_or_default(),
                "{mode:?} node positions differ between runs"
            );
            assert_eq!(
                serde_json::to_string(&a.edges).unwrap_or_default(),
                serde_json::to_string(&b.edges).unwrap_or_default(),
                "{mode:?} routes differ between runs"
            );
        }
    }

    #[test]
    fn doubling_node_gap_widens_every_mode() {
        // Twelve siblings under one parent. The fan has to be wide enough that every engine is
        // actually gap-limited: radial spends `node_gap` on arc length between ring siblings, so a
        // sparse ring would have slack to absorb the change and the assertion would say nothing.
        let mut nodes = vec![node("root")];
        let mut edges = Vec::new();
        for i in 0..12 {
            let id = format!("c{}", i);
            nodes.push(node(&id));
            edges.push(edge(&format!("e{}", i), "root", &id));
        }

        let base = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        let mut wide = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        wide.node_gap = base.node_gap * 2.0;

        let width = |r: &CustomLayoutResult| -> f64 {
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
        };

        for mode in ALL_MODES {
            let w0 = width(&compute_layout(&nodes, &edges, &base, mode));
            let w1 = width(&compute_layout(&nodes, &edges, &wide, mode));
            assert!(w1 > w0, "{mode:?}: doubling node_gap must widen ({w0} -> {w1})");
        }
    }

    #[test]
    fn layered_and_layered_spline_produce_the_same_geometry() {
        let (nodes, edges) = small();
        let a = compute_layout(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG, EngineMode::Layered);
        let b = compute_layout(
            &nodes,
            &edges,
            &DEFAULT_CUSTOM_LAYOUT_CONFIG,
            EngineMode::LayeredSpline,
        );
        assert_eq!(
            serde_json::to_string(&a.nodes).unwrap_or_default(),
            serde_json::to_string(&b.nodes).unwrap_or_default(),
            "the spline variant must not change the layout"
        );
    }

    #[test]
    fn graph_padding_is_honoured_by_every_mode() {
        let (nodes, edges) = small();
        let mut cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        cfg.graph_padding = 40.0;
        for mode in ALL_MODES {
            let out = compute_layout(&nodes, &edges, &cfg, mode);
            let min_x = out.nodes.iter().fold(f64::INFINITY, |a, n| a.min(n.x));
            let min_y = out.nodes.iter().fold(f64::INFINITY, |a, n| a.min(n.y));
            assert!(
                min_x >= cfg.graph_padding - 1e-6,
                "{mode:?}: left margin {min_x} is inside the padding"
            );
            assert!(
                min_y >= cfg.graph_padding - 1e-6,
                "{mode:?}: top margin {min_y} is inside the padding"
            );
        }
    }
}
