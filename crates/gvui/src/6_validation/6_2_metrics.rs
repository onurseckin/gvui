//! # Step 6.2 (Phase 9): Quality metrics
//!
//! Metrics are **REPORTED, never optimised**. v1 folded twenty-one numbers into a lexicographic
//! `LayoutScore` and searched against it; v2 has no search to feed, so everything here is pure
//! measurement of an already-final drawing.
//!
//! Two of these numbers are early-warning signals rather than aesthetics:
//! `straight_chain_ratio` dropping means Brandes-Koepf's dummy-chain alignment is being defeated,
//! and `leader_count` rising means a label item's reserved area was not respected. Both are
//! structural failures that a single aggregate score would hide, which is precisely why they are
//! reported separately instead of being blended into one figure.

use std::collections::HashMap;

use crate::config::CustomLayoutConfig;
use crate::geometry::{is_finite_point, path_manhattan_length, simplify_orthogonal_path};
use crate::types::{
    BadgePlacement, EdgeCrossing, Layered, LayoutMetrics, PositionedNode, RoutedPath, Side,
};

use super::constraints::{
    rect_is_finite, scan_badge_badge_overlaps, scan_badge_edge_penetrations,
    scan_badge_node_overlaps, scan_collinear_edge_overlaps, scan_edge_node_penetrations,
    scan_node_node_overlaps,
};

/// Suffix the host's label measurer appends when a label hit `max_label_lines` and was ellipsized.
///
/// The engine never sees text except as an already-measured box, so truncation cannot be observed
/// directly; the badge's display string is the only evidence that survives into Phase 9.
const ELLIPSIS: char = '\u{2026}';

/// Measures the finished drawing. Nothing here influences the drawing.
///
/// `combinatorial_crossings` is Phase 5's exact Barth-Mutzel-Juenger count, reported as
/// [`LayoutMetrics::crossings`]; `crossings` is the geometric count measured from the emitted
/// polylines. **The two are expected to agree.** A large gap means routing introduced crossings the
/// ordering had already resolved, i.e. a bug in Phase 6 or 8 — not a tuning opportunity.
///
/// `layered` is optional because the non-layered engines (organic, radial, grid) have no layered
/// graph; with `None`, `straight_chain_ratio` reports 1.0 (nothing to keep straight) and
/// `rank_count`/`dummy_count` report 0.
///
/// `leader_count` and `lane_depth_max` are passed in rather than derived because only the caller
/// knows them: leaders are decided by Phase 8's badge safety net, and lane depth lives in the
/// Phase 6 [`crate::types::RoutingDemand`], neither of which survives into the wire payload.
// Nine parameters, and the doc comment above justifies each one: they are values only the
// caller can know, not state this function could re-derive. Bundling them into a struct would
// add a type whose only purpose is to satisfy the lint.
#[allow(clippy::too_many_arguments)]
pub fn compute_metrics(
    nodes: &[PositionedNode],
    routes: &[RoutedPath],
    badges: &[BadgePlacement],
    crossings: &[EdgeCrossing],
    layered: Option<&Layered>,
    combinatorial_crossings: usize,
    leader_count: usize,
    lane_depth_max: usize,
    config: &CustomLayoutConfig,
) -> LayoutMetrics {
    let eps = config.epsilon;

    // ---- path shape ---------------------------------------------------------------------------
    let mut bend_count = 0usize;
    let mut total_length = 0.0f64;
    let mut unresolved_route_count = 0usize;
    for r in routes {
        if r.points.len() < 2 || r.points.iter().any(|p| !is_finite_point(p)) {
            unresolved_route_count += 1;
            continue;
        }
        // Bends are counted on the simplified polyline: a collinear vertex is an artefact of
        // materialisation, not a bend a reader can see.
        let simplified = simplify_orthogonal_path(&r.points, eps);
        bend_count += simplified.len().saturating_sub(2);
        total_length += path_manhattan_length(&r.points);
    }

    // ---- straight chain ratio -----------------------------------------------------------------
    let straight_chain_ratio = straight_chain_ratio(layered, eps);

    // ---- bounding box -------------------------------------------------------------------------
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    let mut max_y = f64::NEG_INFINITY;
    let mut extend = |x0: f64, y0: f64, x1: f64, y1: f64| {
        if x0.is_finite() && y0.is_finite() && x1.is_finite() && y1.is_finite() {
            min_x = min_x.min(x0);
            min_y = min_y.min(y0);
            max_x = max_x.max(x1);
            max_y = max_y.max(y1);
        }
    };
    for n in nodes {
        extend(n.x, n.y, n.x + n.width, n.y + n.height);
    }
    for r in routes {
        for p in &r.points {
            extend(p.x, p.y, p.x, p.y);
        }
    }
    for b in badges {
        extend(
            b.rect.x,
            b.rect.y,
            b.rect.x + b.rect.width,
            b.rect.y + b.rect.height,
        );
    }
    let (width, height) = if min_x <= max_x && min_y <= max_y {
        (max_x - min_x, max_y - min_y)
    } else {
        (0.0, 0.0)
    };
    let area = width * height;
    // An empty or single-row drawing has no meaningful ratio; 1.0 is the neutral report.
    let aspect_ratio = if height > 0.0 { width / height } else { 1.0 };

    // ---- port side balance --------------------------------------------------------------------
    let port_side_balance = port_side_balance(nodes, routes);

    // ---- badge health -------------------------------------------------------------------------
    let labels_truncated = badges
        .iter()
        .filter(|b| b.label.ends_with(ELLIPSIS) || b.label.ends_with("..."))
        .count();
    let unresolved_badge_count = badges
        .iter()
        .filter(|b| {
            !rect_is_finite(&b.rect)
                || b.rect.width <= 0.0
                || b.rect.height <= 0.0
                || !is_finite_point(&b.anchor_point)
                || b.leader_points
                    .as_ref()
                    .is_some_and(|pts| pts.iter().any(|p| !is_finite_point(p)))
        })
        .count();

    // ---- constraint counters; every one of these is a bug when nonzero ------------------------
    let mut node_node_overlaps = 0usize;
    scan_node_node_overlaps(nodes, eps, |_, _| node_node_overlaps += 1);
    let mut edge_node_penetrations = 0usize;
    scan_edge_node_penetrations(nodes, routes, eps, |_, _, _| edge_node_penetrations += 1);
    let mut badge_node_overlaps = 0usize;
    scan_badge_node_overlaps(badges, nodes, eps, |_, _| badge_node_overlaps += 1);
    let mut badge_badge_overlaps = 0usize;
    scan_badge_badge_overlaps(badges, eps, |_, _| badge_badge_overlaps += 1);
    let mut badge_edge_penetrations = 0usize;
    scan_badge_edge_penetrations(badges, routes, eps, |_, _, _| badge_edge_penetrations += 1);
    let mut collinear_edge_overlaps = 0usize;
    scan_collinear_edge_overlaps(routes, eps, |_, _| collinear_edge_overlaps += 1);

    let (rank_count, dummy_count) = match layered {
        Some(l) => (
            l.rank_count(),
            l.items.iter().filter(|i| i.kind.is_dummy()).count(),
        ),
        None => (0, 0),
    };

    LayoutMetrics {
        crossings: combinatorial_crossings,
        geometric_crossings: crossings.len(),
        bend_count,
        total_length,
        straight_chain_ratio,
        area,
        aspect_ratio,
        lane_depth_max,
        port_side_balance,
        leader_count,
        labels_truncated,
        node_count: nodes.len(),
        edge_count: routes.len(),
        rank_count,
        dummy_count,
        node_node_overlaps,
        edge_node_penetrations,
        badge_node_overlaps,
        badge_badge_overlaps,
        badge_edge_penetrations,
        unresolved_route_count,
        unresolved_badge_count,
        collinear_edge_overlaps,
    }
}

/// Fraction of edge chains whose interior items all share one centre x.
///
/// Chains with no interior item (an adjacent-rank edge) are excluded from **both** numerator and
/// denominator: they are straight by definition and including them would dilute the signal until it
/// stopped moving. With no qualifying chain at all the ratio is 1.0 — there is nothing bent.
///
/// The measurement is taken in **layered space** (the item's own centre x), which is where
/// Brandes-Koepf makes its alignment guarantee, so the number stays comparable across
/// [`crate::config::Direction`] values even though the emitted geometry is transposed for `LR`/`RL`.
fn straight_chain_ratio(layered: Option<&Layered>, epsilon: f64) -> f64 {
    let Some(l) = layered else { return 1.0 };

    let mut aligned = 0usize;
    let mut considered = 0usize;
    for chain in &l.chains {
        if chain.items.len() < 3 {
            continue;
        }
        considered += 1;
        let interior = &chain.items[1..chain.items.len() - 1];
        let mut reference: Option<f64> = None;
        let mut straight = true;
        for &item_idx in interior {
            let Some(item) = l.items.get(item_idx as usize) else {
                straight = false;
                break;
            };
            let cx = item.center_x();
            if !cx.is_finite() {
                straight = false;
                break;
            }
            match reference {
                None => reference = Some(cx),
                Some(r) => {
                    if (cx - r).abs() > epsilon {
                        straight = false;
                        break;
                    }
                }
            }
        }
        if straight {
            aligned += 1;
        }
    }

    if considered == 0 {
        1.0
    } else {
        aligned as f64 / considered as f64
    }
}

/// Mean over nodes of `1 - |top - bottom| / max(1, total)`.
///
/// 1.0 means every node's edges are split evenly between its top and bottom sides; 0.0 means every
/// node attaches everything to one of them. A node with no ports scores 1.0 — it is not unbalanced.
/// Left/right ports (flat edges and self-loops) count toward `total` only, so a node dominated by
/// side attachments reads as balanced rather than as an outlier.
fn port_side_balance(nodes: &[PositionedNode], routes: &[RoutedPath]) -> f64 {
    if nodes.is_empty() {
        return 1.0;
    }

    // (top, bottom, total) per node id. Only ever looked up by key, never iterated, so the map's
    // ordering cannot reach the result.
    let mut counts: HashMap<&str, (usize, usize, usize)> = HashMap::with_capacity(nodes.len());
    for n in nodes {
        counts.insert(n.id.as_str(), (0, 0, 0));
    }
    for r in routes {
        for port in [&r.source_port, &r.target_port] {
            if let Some(entry) = counts.get_mut(port.node_id.as_str()) {
                match port.side {
                    Side::Top => entry.0 += 1,
                    Side::Bottom => entry.1 += 1,
                    _ => {}
                }
                entry.2 += 1;
            }
        }
    }

    let mut sum = 0.0;
    for n in nodes {
        let (top, bottom, total) = counts.get(n.id.as_str()).copied().unwrap_or((0, 0, 0));
        let skew = (top as f64 - bottom as f64).abs();
        sum += 1.0 - skew / (total.max(1) as f64);
    }
    sum / nodes.len() as f64
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::EdgeStyle;
    use crate::types::{EdgeChain, EdgeRole, Item, ItemKind, Point, PortRef, Rect};

    fn cfg() -> CustomLayoutConfig {
        CustomLayoutConfig::default()
    }

    fn node(id: &str, x: f64, y: f64, w: f64, h: f64) -> PositionedNode {
        PositionedNode {
            id: id.to_string(),
            label: None,
            x,
            y,
            width: w,
            height: h,
            rank: 0,
            order: 0,
        }
    }

    fn port(node_id: &str, side: Side, p: Point) -> PortRef {
        PortRef {
            node_id: node_id.to_string(),
            side,
            index: 0,
            point: p,
            stub: p,
        }
    }

    fn route(edge_id: &str, pts: Vec<Point>, src: &str, tgt: &str) -> RoutedPath {
        let a = pts.first().copied().unwrap_or(Point { x: 0.0, y: 0.0 });
        let b = pts.last().copied().unwrap_or(Point { x: 0.0, y: 0.0 });
        RoutedPath {
            edge_id: edge_id.to_string(),
            points: pts,
            source_port: port(src, Side::Bottom, a),
            target_port: port(tgt, Side::Top, b),
        }
    }

    fn dummy_item(rank: u16, order: u16, x: f64) -> Item {
        Item {
            kind: ItemKind::Dummy {
                edge: 0,
                seq: order,
            },
            rank,
            order,
            width: 10.0,
            height: 10.0,
            x,
            y: rank as f64 * 100.0,
        }
    }

    fn real_item(node: u32, rank: u16, x: f64) -> Item {
        Item {
            kind: ItemKind::Real(node),
            rank,
            order: 0,
            width: 10.0,
            height: 10.0,
            x,
            y: rank as f64 * 100.0,
        }
    }

    /// One chain `[real, dummy, dummy, real]` whose two interior dummies sit at `xs`.
    fn chain_layered(xs: [f64; 2]) -> Layered {
        let items = vec![
            real_item(0, 0, 0.0),
            dummy_item(1, 0, xs[0]),
            dummy_item(2, 0, xs[1]),
            real_item(1, 3, 0.0),
        ];
        Layered {
            items,
            rank_ranges: vec![0..1, 1..2, 2..3, 3..4],
            chains: vec![EdgeChain {
                edge: 0,
                reversed: false,
                role: EdgeRole::Forward,
                items: vec![0, 1, 2, 3],
                label_at: None,
            }],
            item_of_node: vec![0, 3],
            ..Default::default()
        }
    }

    #[test]
    fn straight_chain_ratio_is_one_for_an_aligned_chain() {
        let l = chain_layered([50.0, 50.0]);
        let m = compute_metrics(&[], &[], &[], &[], Some(&l), 0, 0, 0, &cfg());
        assert_eq!(m.straight_chain_ratio, 1.0);
    }

    #[test]
    fn straight_chain_ratio_drops_for_a_staircase() {
        let l = chain_layered([50.0, 90.0]);
        let m = compute_metrics(&[], &[], &[], &[], Some(&l), 0, 0, 0, &cfg());
        assert!(m.straight_chain_ratio < 1.0, "{}", m.straight_chain_ratio);
        assert_eq!(m.straight_chain_ratio, 0.0);
    }

    #[test]
    fn chains_without_interior_items_are_excluded_entirely() {
        // A single adjacent-rank chain: no interior item, so the denominator is 0 and the ratio is
        // the neutral 1.0 rather than 0/0.
        let l = Layered {
            items: vec![real_item(0, 0, 0.0), real_item(1, 1, 400.0)],
            rank_ranges: vec![0..1, 1..2],
            chains: vec![EdgeChain {
                edge: 0,
                reversed: false,
                role: EdgeRole::Forward,
                items: vec![0, 1],
                label_at: None,
            }],
            item_of_node: vec![0, 1],
            ..Default::default()
        };
        let m = compute_metrics(&[], &[], &[], &[], Some(&l), 0, 0, 0, &cfg());
        assert_eq!(m.straight_chain_ratio, 1.0);
    }

    #[test]
    fn mixed_chains_report_a_fraction() {
        let mut l = chain_layered([50.0, 50.0]);
        // A second chain, bent.
        let base = l.items.len() as u32;
        l.items.push(real_item(2, 0, 300.0));
        l.items.push(dummy_item(1, 1, 300.0));
        l.items.push(dummy_item(2, 1, 380.0));
        l.items.push(real_item(3, 3, 300.0));
        l.chains.push(EdgeChain {
            edge: 1,
            reversed: false,
            role: EdgeRole::Forward,
            items: vec![base, base + 1, base + 2, base + 3],
            label_at: None,
        });
        let m = compute_metrics(&[], &[], &[], &[], Some(&l), 0, 0, 0, &cfg());
        assert_eq!(m.straight_chain_ratio, 0.5);
    }

    #[test]
    fn empty_input_is_degenerate_but_well_formed() {
        let m = compute_metrics(&[], &[], &[], &[], None, 0, 0, 0, &cfg());
        assert_eq!(m.node_count, 0);
        assert_eq!(m.edge_count, 0);
        assert_eq!(m.area, 0.0);
        assert_eq!(m.aspect_ratio, 1.0);
        assert_eq!(m.straight_chain_ratio, 1.0);
        assert_eq!(m.port_side_balance, 1.0);
        assert_eq!(m.bend_count, 0);
    }

    #[test]
    fn bend_count_counts_interior_vertices_of_the_simplified_polyline() {
        let routes = vec![
            // Straight after simplification: 0 bends.
            route(
                "e0",
                vec![
                    Point { x: 0.0, y: 0.0 },
                    Point { x: 0.0, y: 50.0 },
                    Point { x: 0.0, y: 100.0 },
                ],
                "a",
                "b",
            ),
            // One real corner.
            route(
                "e1",
                vec![
                    Point { x: 0.0, y: 0.0 },
                    Point { x: 0.0, y: 100.0 },
                    Point { x: 80.0, y: 100.0 },
                ],
                "a",
                "b",
            ),
        ];
        let m = compute_metrics(&[], &routes, &[], &[], None, 0, 0, 0, &cfg());
        assert_eq!(m.bend_count, 1);
        assert_eq!(m.total_length, 100.0 + 180.0);
    }

    #[test]
    fn aspect_ratio_is_bbox_width_over_height() {
        let nodes = vec![node("a", 0.0, 0.0, 300.0, 100.0)];
        let m = compute_metrics(&nodes, &[], &[], &[], None, 0, 0, 0, &cfg());
        assert_eq!(m.area, 30_000.0);
        assert_eq!(m.aspect_ratio, 3.0);

        // Zero height must not divide by zero.
        let flat = vec![node("a", 0.0, 0.0, 300.0, 0.0)];
        let m2 = compute_metrics(&flat, &[], &[], &[], None, 0, 0, 0, &cfg());
        assert_eq!(m2.aspect_ratio, 1.0);
    }

    #[test]
    fn port_side_balance_rewards_even_top_bottom_split() {
        let nodes = vec![node("a", 0.0, 0.0, 100.0, 50.0)];
        // One route in via the top, one out via the bottom: perfectly balanced.
        let mut r_in = route("e0", vec![Point { x: 0.0, y: 0.0 }], "x", "a");
        r_in.target_port = port("a", Side::Top, Point { x: 0.0, y: 0.0 });
        let mut r_out = route("e1", vec![Point { x: 0.0, y: 0.0 }], "a", "y");
        r_out.source_port = port("a", Side::Bottom, Point { x: 0.0, y: 0.0 });
        let m = compute_metrics(&nodes, &[r_in, r_out], &[], &[], None, 0, 0, 0, &cfg());
        assert_eq!(m.port_side_balance, 1.0);
    }

    #[test]
    fn port_side_balance_penalises_one_sided_nodes() {
        let nodes = vec![node("a", 0.0, 0.0, 100.0, 50.0)];
        let mut r1 = route("e0", vec![Point { x: 0.0, y: 0.0 }], "a", "y");
        r1.source_port = port("a", Side::Bottom, Point { x: 0.0, y: 0.0 });
        r1.target_port = port("y", Side::Top, Point { x: 0.0, y: 0.0 });
        let mut r2 = route("e1", vec![Point { x: 0.0, y: 0.0 }], "a", "z");
        r2.source_port = port("a", Side::Bottom, Point { x: 0.0, y: 0.0 });
        r2.target_port = port("z", Side::Top, Point { x: 0.0, y: 0.0 });
        let m = compute_metrics(&nodes, &[r1, r2], &[], &[], None, 0, 0, 0, &cfg());
        assert_eq!(m.port_side_balance, 0.0);
    }

    #[test]
    fn constraint_counters_are_reported_not_scored() {
        let nodes = vec![
            node("a", 0.0, 0.0, 100.0, 50.0),
            node("b", 10.0, 10.0, 100.0, 50.0),
        ];
        let m = compute_metrics(&nodes, &[], &[], &[], None, 0, 0, 0, &cfg());
        assert_eq!(m.node_node_overlaps, 1);
        assert_eq!(m.edge_node_penetrations, 0);
        assert_eq!(m.badge_edge_penetrations, 0);
    }

    #[test]
    fn badge_edge_penetrations_are_counted() {
        let routes = vec![
            route(
                "e0",
                vec![Point { x: 50.0, y: 0.0 }, Point { x: 50.0, y: 200.0 }],
                "a",
                "b",
            ),
            route(
                "e1",
                vec![Point { x: 0.0, y: 100.0 }, Point { x: 100.0, y: 100.0 }],
                "c",
                "d",
            ),
        ];
        let badges = vec![BadgePlacement {
            edge_id: "e0".to_string(),
            label: "badge".to_string(),
            rect: Rect {
                x: 30.0,
                y: 80.0,
                width: 40.0,
                height: 40.0,
            },
            anchor_point: Point { x: 50.0, y: 100.0 },
            leader_points: None,
        }];
        let m = compute_metrics(&[], &routes, &badges, &[], None, 0, 0, 0, &cfg());
        assert_eq!(m.badge_edge_penetrations, 1);
    }

    #[test]
    fn truncated_labels_and_unresolved_badges_are_counted() {
        let badges = vec![
            BadgePlacement {
                edge_id: "e0".to_string(),
                label: "a very long label\u{2026}".to_string(),
                rect: Rect {
                    x: 0.0,
                    y: 0.0,
                    width: 40.0,
                    height: 20.0,
                },
                anchor_point: Point { x: 0.0, y: 0.0 },
                leader_points: None,
            },
            BadgePlacement {
                edge_id: "e1".to_string(),
                label: "short".to_string(),
                rect: Rect {
                    x: 500.0,
                    y: 0.0,
                    width: 0.0,
                    height: 0.0,
                },
                anchor_point: Point { x: 500.0, y: 0.0 },
                leader_points: None,
            },
        ];
        let m = compute_metrics(&[], &[], &badges, &[], None, 0, 0, 0, &cfg());
        assert_eq!(m.labels_truncated, 1);
        assert_eq!(m.unresolved_badge_count, 1);
    }

    #[test]
    fn degenerate_routes_are_reported_as_unresolved() {
        let routes = vec![
            route("e0", vec![Point { x: 0.0, y: 0.0 }], "a", "b"),
            route(
                "e1",
                vec![
                    Point { x: 0.0, y: 0.0 },
                    Point {
                        x: f64::NAN,
                        y: 0.0,
                    },
                ],
                "a",
                "b",
            ),
        ];
        let m = compute_metrics(&[], &routes, &[], &[], None, 0, 0, 0, &cfg());
        assert_eq!(m.unresolved_route_count, 2);
        assert_eq!(m.bend_count, 0);
    }

    #[test]
    fn combinatorial_and_geometric_crossings_are_reported_separately() {
        let crossings = vec![EdgeCrossing {
            edge_id_a: "e0".to_string(),
            edge_id_b: "e1".to_string(),
            point: Point { x: 1.0, y: 2.0 },
            bridge_owner_edge_id: None,
        }];
        let m = compute_metrics(&[], &[], &[], &crossings, None, 7, 3, 5, &cfg());
        assert_eq!(m.crossings, 7);
        assert_eq!(m.geometric_crossings, 1);
        assert_eq!(m.leader_count, 3);
        assert_eq!(m.lane_depth_max, 5);
    }

    #[test]
    fn all_seven_collision_metrics_plus_collinear_measured_exactly() {
        // 1. Two overlapping nodes -> node_node_overlaps = 1
        let nodes = vec![
            node("n0", 0.0, 0.0, 100.0, 50.0),
            node("n1", 50.0, 20.0, 100.0, 50.0), // overlaps n0
            node("obstacle", 330.0, 0.0, 100.0, 50.0),
        ];

        // 2. Edge e0 penetrates obstacle -> edge_node_penetrations = 1
        // 3. Edges e1 and e2 share a collinear run -> collinear_edge_overlaps = 1
        // 4. Edge e3 is degenerate (< 2 pts) -> unresolved_route_count = 1
        let routes = vec![
            // Penetrates obstacle at (330..430, 0..50)
            RoutedPath {
                edge_id: "e0".to_string(),
                points: vec![Point { x: 250.0, y: 25.0 }, Point { x: 450.0, y: 25.0 }],
                source_port: port("n0", Side::Right, Point { x: 250.0, y: 25.0 }),
                target_port: port("obstacle", Side::Left, Point { x: 450.0, y: 25.0 }),
            },
            // Collinear segment 1
            RoutedPath {
                edge_id: "e1".to_string(),
                points: vec![Point { x: 0.0, y: 200.0 }, Point { x: 100.0, y: 200.0 }],
                source_port: port("n0", Side::Bottom, Point { x: 0.0, y: 200.0 }),
                target_port: port("n1", Side::Bottom, Point { x: 100.0, y: 200.0 }),
            },
            // Collinear segment 2 overlapping e1
            RoutedPath {
                edge_id: "e2".to_string(),
                points: vec![Point { x: 50.0, y: 200.0 }, Point { x: 150.0, y: 200.0 }],
                source_port: port("n0", Side::Bottom, Point { x: 50.0, y: 200.0 }),
                target_port: port("n1", Side::Bottom, Point { x: 150.0, y: 200.0 }),
            },
            // Degenerate unresolved route
            RoutedPath {
                edge_id: "e3".to_string(),
                points: vec![Point { x: 0.0, y: 0.0 }],
                source_port: port("n0", Side::Top, Point { x: 0.0, y: 0.0 }),
                target_port: port("n1", Side::Top, Point { x: 0.0, y: 0.0 }),
            },
        ];

        // 5. Badge b0 overlaps node n0 -> badge_node_overlaps = 1
        // 6. Badges b1 and b2 overlap each other -> badge_badge_overlaps = 1
        // 7. Route e0 penetrates badge b1 (owned by e1) -> badge_edge_penetrations = 1
        // 8. Badge b3 has zero width -> unresolved_badge_count = 1
        let badges = vec![
            // Overlaps n0 (0..100, 0..50) but not n1 (50..150)
            BadgePlacement {
                edge_id: "e0".to_string(),
                label: "b0".to_string(),
                rect: Rect {
                    x: 10.0,
                    y: 10.0,
                    width: 30.0,
                    height: 20.0,
                },
                anchor_point: Point { x: 10.0, y: 10.0 },
                leader_points: None,
            },
            // Sits at (280..320, 15..35) penetrated by e0 at y=25
            BadgePlacement {
                edge_id: "e1".to_string(),
                label: "b1".to_string(),
                rect: Rect {
                    x: 280.0,
                    y: 15.0,
                    width: 40.0,
                    height: 20.0,
                },
                anchor_point: Point { x: 280.0, y: 15.0 },
                leader_points: None,
            },
            // Overlaps b1 in (290..320, 30..35); not penetrated by e0 at y=25
            BadgePlacement {
                edge_id: "e2".to_string(),
                label: "b2".to_string(),
                rect: Rect {
                    x: 290.0,
                    y: 30.0,
                    width: 40.0,
                    height: 20.0,
                },
                anchor_point: Point { x: 290.0, y: 30.0 },
                leader_points: None,
            },
            // Unresolved zero-size badge
            BadgePlacement {
                edge_id: "e3".to_string(),
                label: "b3".to_string(),
                rect: Rect {
                    x: 800.0,
                    y: 800.0,
                    width: 0.0,
                    height: 0.0,
                },
                anchor_point: Point { x: 800.0, y: 800.0 },
                leader_points: None,
            },
        ];

        let m = compute_metrics(&nodes, &routes, &badges, &[], None, 0, 0, 0, &cfg());

        assert_eq!(m.node_node_overlaps, 1, "node_node_overlaps mismatch");
        assert_eq!(
            m.edge_node_penetrations, 1,
            "edge_node_penetrations mismatch"
        );
        assert_eq!(m.badge_node_overlaps, 1, "badge_node_overlaps mismatch");
        assert_eq!(m.badge_badge_overlaps, 1, "badge_badge_overlaps mismatch");
        assert_eq!(
            m.badge_edge_penetrations, 1,
            "badge_edge_penetrations mismatch"
        );
        assert_eq!(
            m.unresolved_route_count, 1,
            "unresolved_route_count mismatch"
        );
        assert_eq!(
            m.unresolved_badge_count, 1,
            "unresolved_badge_count mismatch"
        );
        assert_eq!(
            m.collinear_edge_overlaps, 1,
            "collinear_edge_overlaps mismatch"
        );
    }

    #[test]
    fn radial_clean_layout_metrics_are_all_zero() {
        let root = node("root", 200.0, 200.0, 80.0, 80.0);
        let c0 = node("c0", 350.0, 200.0, 60.0, 40.0);
        let c1 = node("c1", 50.0, 200.0, 60.0, 40.0);
        let nodes = vec![root, c0, c1];

        let routes = vec![
            RoutedPath {
                edge_id: "e0".to_string(),
                points: vec![Point { x: 280.0, y: 240.0 }, Point { x: 350.0, y: 220.0 }],
                source_port: port("root", Side::Right, Point { x: 280.0, y: 240.0 }),
                target_port: port("c0", Side::Left, Point { x: 350.0, y: 220.0 }),
            },
            RoutedPath {
                edge_id: "e1".to_string(),
                points: vec![Point { x: 200.0, y: 240.0 }, Point { x: 110.0, y: 220.0 }],
                source_port: port("root", Side::Left, Point { x: 200.0, y: 240.0 }),
                target_port: port("c1", Side::Right, Point { x: 110.0, y: 220.0 }),
            },
        ];

        let badges = vec![
            BadgePlacement {
                edge_id: "e0".to_string(),
                label: "badge0".to_string(),
                rect: Rect {
                    x: 300.0,
                    y: 260.0,
                    width: 40.0,
                    height: 16.0,
                },
                anchor_point: Point { x: 315.0, y: 230.0 },
                leader_points: None,
            },
            BadgePlacement {
                edge_id: "e1".to_string(),
                label: "badge1".to_string(),
                rect: Rect {
                    x: 130.0,
                    y: 260.0,
                    width: 40.0,
                    height: 16.0,
                },
                anchor_point: Point { x: 155.0, y: 230.0 },
                leader_points: None,
            },
        ];

        let mut radial_cfg = cfg();
        radial_cfg.edge_style = EdgeStyle::Straight;

        let m = compute_metrics(&nodes, &routes, &badges, &[], None, 0, 0, 0, &radial_cfg);
        assert_eq!(m.node_node_overlaps, 0);
        assert_eq!(m.edge_node_penetrations, 0);
        assert_eq!(m.badge_node_overlaps, 0);
        assert_eq!(m.badge_badge_overlaps, 0);
        assert_eq!(m.badge_edge_penetrations, 0);
        assert_eq!(m.unresolved_route_count, 0);
        assert_eq!(m.unresolved_badge_count, 0);
        assert_eq!(m.collinear_edge_overlaps, 0);
    }

    #[test]
    fn stress_test_metrics_dense_parallel_bundles() {
        let nodes = vec![
            node("src", 0.0, 0.0, 100.0, 500.0),
            node("tgt", 600.0, 0.0, 100.0, 500.0),
        ];

        let n_routes = 16;
        let mut routes = Vec::new();
        for i in 0..n_routes {
            let y = 20.0 + (i as f64) * 20.0;
            routes.push(RoutedPath {
                edge_id: format!("e_{}", i),
                points: vec![Point { x: 100.0, y }, Point { x: 600.0, y }],
                source_port: port("src", Side::Right, Point { x: 100.0, y }),
                target_port: port("tgt", Side::Left, Point { x: 600.0, y }),
            });
        }

        let mut badges = Vec::new();
        for i in 0..n_routes {
            let y = 20.0 + (i as f64) * 20.0;
            let x = 150.0 + (i as f64) * 25.0;
            badges.push(BadgePlacement {
                edge_id: format!("e_{}", i),
                label: format!("badge_{}", i),
                rect: Rect {
                    x,
                    y: y - 5.0,
                    width: 40.0,
                    height: 10.0,
                },
                anchor_point: Point { x: x + 20.0, y },
                leader_points: None,
            });
        }

        // Clean bundle: zero violations across all metric counters
        let m_clean = compute_metrics(&nodes, &routes, &badges, &[], None, 0, 0, 0, &cfg());
        assert_eq!(m_clean.badge_edge_penetrations, 0);
        assert_eq!(m_clean.badge_badge_overlaps, 0);
        assert_eq!(m_clean.badge_node_overlaps, 0);
        assert_eq!(m_clean.node_node_overlaps, 0);

        // Inject 2 penetrations and 1 overlap
        badges[2].rect.x = 400.0;
        badges[2].rect.y = 45.0;
        badges[2].rect.height = 40.0; // penetrates e_3 (y=80)
        badges[6].rect.x = 200.0;
        badges[6].rect.y = 130.0;
        badges[6].rect.height = 20.0;
        badges[7].rect.x = 210.0;
        badges[7].rect.y = 145.0;
        badges[7].rect.height = 20.0; // overlaps badge 6
        badges[10].rect.x = 500.0;
        badges[10].rect.y = 205.0;
        badges[10].rect.height = 40.0; // penetrates e_11 (y=240)

        let m_adv = compute_metrics(&nodes, &routes, &badges, &[], None, 0, 0, 0, &cfg());
        assert_eq!(
            m_adv.badge_edge_penetrations, 2,
            "m_adv badge_edge_penetrations mismatch"
        );
        assert_eq!(
            m_adv.badge_badge_overlaps, 1,
            "m_adv badge_badge_overlaps mismatch"
        );
    }

    #[test]
    fn validation_metric_invariants_and_zero_tolerance_bounds() {
        // Invariant 1: Clean layout produces exactly 0 for all collision/defect metrics
        let nodes = vec![
            node("n1", 0.0, 0.0, 100.0, 50.0),
            node("n2", 200.0, 0.0, 100.0, 50.0),
        ];
        let routes = vec![RoutedPath {
            edge_id: "e1".to_string(),
            points: vec![Point { x: 100.0, y: 25.0 }, Point { x: 200.0, y: 25.0 }],
            source_port: port("n1", Side::Right, Point { x: 100.0, y: 25.0 }),
            target_port: port("n2", Side::Left, Point { x: 200.0, y: 25.0 }),
        }];
        let badges = vec![BadgePlacement {
            edge_id: "e1".to_string(),
            label: "clean".to_string(),
            rect: Rect {
                x: 130.0,
                y: 15.0,
                width: 40.0,
                height: 20.0,
            },
            anchor_point: Point { x: 150.0, y: 25.0 },
            leader_points: None,
        }];
        let m = compute_metrics(&nodes, &routes, &badges, &[], None, 0, 0, 0, &cfg());
        assert_eq!(m.node_node_overlaps, 0);
        assert_eq!(m.edge_node_penetrations, 0);
        assert_eq!(m.badge_node_overlaps, 0);
        assert_eq!(m.badge_badge_overlaps, 0);
        assert_eq!(m.badge_edge_penetrations, 0);
        assert_eq!(m.unresolved_route_count, 0);
        assert_eq!(m.unresolved_badge_count, 0);
        assert_eq!(m.collinear_edge_overlaps, 0);

        // Invariant 2: Symmetry - node ordering in input does not alter overlap detection
        let nodes_rev = vec![nodes[1].clone(), nodes[0].clone()];
        let m_rev = compute_metrics(&nodes_rev, &routes, &badges, &[], None, 0, 0, 0, &cfg());
        assert_eq!(m.node_node_overlaps, m_rev.node_node_overlaps);
        assert_eq!(m.edge_node_penetrations, m_rev.edge_node_penetrations);

        // Invariant 3: Additivity - independent violations in disjoint subgraphs sum linearly
        let nodes_disjoint = vec![
            // Overlapping pair 1 at origin
            node("a1", 0.0, 0.0, 100.0, 50.0),
            node("a2", 50.0, 20.0, 100.0, 50.0),
            // Overlapping pair 2 far away at (1000, 1000)
            node("b1", 1000.0, 1000.0, 100.0, 50.0),
            node("b2", 1050.0, 1020.0, 100.0, 50.0),
        ];
        let m_disjoint = compute_metrics(&nodes_disjoint, &[], &[], &[], None, 0, 0, 0, &cfg());
        assert_eq!(m_disjoint.node_node_overlaps, 2);
    }
}
