//! # Step 7.3: Radial engine — concentric rings
//!
//! v1's radial mode put **every** node on one circle regardless of depth and routed every edge as a
//! quadratic Bezier through the exact centre, so past a handful of edges the middle of the drawing
//! became an opaque knot. Two changes fix both halves of that:
//!
//! 1. **Concentric rings.** `ring(v)` is BFS depth from the root, and ring `k`'s radius is derived
//!    from the boxes actually on rings `k-1` and `k`, so a ring is always far enough out to hold its
//!    contents.
//! 2. **Proportional wedges.** Each subtree gets an angular slice sized by its **leaf count**, not
//!    `2*PI*i/n`. Uniform allocation is what made dense subtrees collide while sparse ones wasted
//!    arc; proportional allocation gives every leaf the same angular budget, which is the property
//!    that keeps a ring's occupancy even.
//!
//! Non-tree edges bow *toward* the centre by 30% rather than passing through it. That is enough to
//! separate a chord visually from the radial spokes without everything converging on one point.
//!
//! Routing, badges and emit are shared with [`super::organic`].

use std::f64::consts::TAU;

use crate::config::CustomLayoutConfig;
use crate::step0_common::ingest::build_graph_ir;
use crate::types::{
    get_now_ms, CustomLayoutResult, GraphIr, NormalizedEdge, NormalizedNode, OptimizationStats,
    PhaseTimings, Point, Rect,
};

use super::geometric_common::{
    build_routes, finish_geometric_layout, place_badges, remove_overlaps, undirected_adjacency,
};

/// Slack multiplier on the arc a ring must provide for its boxes.
///
/// A ring is a circle, its contents are rectangles, and a rectangle's chord is shorter than its arc;
/// 15% covers that plus the accumulated rounding of the wedge split.
const RING_ARC_SLACK: f64 = 1.15;

/// Fraction of the distance to the centre that a non-tree chord bends.
const CHORD_BOW: f64 = 0.3;

/// Bounds on `target_aspect_ratio` when it is turned into an elliptical stretch. Outside this range
/// the rings degenerate into slots and the mode stops being radial.
const MIN_ASPECT: f64 = 0.25;
const MAX_ASPECT: f64 = 4.0;

/// Lays a graph out as concentric BFS rings around a root.
///
/// Guarantees:
///
/// - **The root is the only node on ring 0**, at the centre; every node reachable from it sits at a
///   strictly larger radius, monotonically increasing with BFS depth.
/// - **Every ring is wide enough for its contents**, both radially (box extents plus
///   `radial_ring_gap`) and circumferentially (summed tangential extents plus
///   `effective_node_gap()`), so ring membership alone can never cause an overlap.
/// - **Deterministic.** Root choice, BFS order, wedge order and ring order all derive from input
///   order or from explicitly sorted keys.
///
/// Nodes unreachable from the root are placed on one extra outermost ring rather than being
/// dropped.
pub fn layout_radial(
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

    // ---- tree ---------------------------------------------------------------------------------
    let t = get_now_ms();
    let adj = undirected_adjacency(&ir);
    let root = choose_root(&ir, config);
    let tree = build_spanning_tree(&adj, n, root);
    timings.structure = get_now_ms() - t;

    // ---- angles then radii --------------------------------------------------------------------
    // Wedges depend only on the tree, and the radial/tangential extent of a box depends on its
    // angle, so angles must be settled before radii can be sized. That ordering is why the ring
    // sizing below can be exact instead of a conservative bound.
    let t = get_now_ms();
    let leaves = leaf_counts(&tree, n);
    let angles = assign_wedges(&tree, &leaves, n, root);
    let (ax, ay) = ellipse_axes(config.target_aspect_ratio);
    let radii = ring_radii(&ir, &tree, &angles, config, ax.min(ay));
    timings.rank = get_now_ms() - t;

    // ---- positions ----------------------------------------------------------------------------
    let t = get_now_ms();
    let mut rects: Vec<Rect> = Vec::with_capacity(n);
    for (v, node) in ir.nodes.iter().enumerate() {
        let r = radii.get(tree.ring[v] as usize).copied().unwrap_or(0.0);
        let theta = angles[v];
        let cx = r * ax * theta.cos();
        let cy = r * ay * theta.sin();
        rects.push(Rect {
            x: cx - node.width / 2.0,
            y: cy - node.height / 2.0,
            width: node.width,
            height: node.height,
        });
    }
    // Ring sizing guarantees a ring has *enough total arc*; it cannot guarantee the arc is evenly
    // spent, because wedges are allocated by subtree leaf count and not by ring occupancy. A deep,
    // narrow subtree therefore crowds its slice of a ring while a shallow, wide one leaves slack.
    // The shared push-apart pass closes exactly that gap, and because the crowding is local its
    // displacements are small enough to leave the ring structure legible.
    remove_overlaps(&mut rects, config);
    timings.coordinates = get_now_ms() - t;

    // ---- routes -------------------------------------------------------------------------------
    let t = get_now_ms();
    let bows = chord_bows(&ir, &tree, &rects);
    let routes = build_routes(&ir, &rects, &bows, config);
    timings.route = get_now_ms() - t;

    let (badges, leader_count) = place_badges(&ir, edges, &rects, &routes, config);
    let placement = ring_placement(&tree, &angles, n);

    let stats = OptimizationStats {
        global_passes: 0,
        evaluated_port_states: 0,
        spacing_expansions: 0,
        duration_ms: 0.0,
        stop_reason: "radial-complete".to_string(),
        timings,
    };

    finish_geometric_layout(
        &ir,
        &rects,
        &placement,
        routes,
        badges,
        leader_count,
        stats,
        t_start,
        config,
    )
}

/// The BFS spanning tree plus the ring each node landed on.
struct RadialTree {
    /// BFS depth, or the extra outermost ring for a node unreachable from the root.
    ring: Vec<u32>,
    /// Tree parent, `u32::MAX` for the root.
    parent: Vec<u32>,
    /// Tree children in BFS discovery order.
    children: Vec<Vec<u32>>,
    /// Highest ring index in use.
    max_ring: u32,
}

/// Picks the root: `config.radial_root` when it names a node, otherwise the highest-degree node.
///
/// Ties go to the lowest index, i.e. the earliest node in the caller's input, which is the only
/// tie-break that does not depend on iteration order of a hash container.
fn choose_root(ir: &GraphIr, config: &CustomLayoutConfig) -> u32 {
    if !config.radial_root.is_empty() {
        for (i, name) in ir.node_names.iter().enumerate() {
            if name == &config.radial_root {
                return i as u32;
            }
        }
    }
    let mut best = 0u32;
    let mut best_degree = 0u32;
    for (i, node) in ir.nodes.iter().enumerate() {
        if node.degree > best_degree {
            best_degree = node.degree;
            best = i as u32;
        }
    }
    best
}

/// BFS spanning tree from `root` over the undirected adjacency.
///
/// Nodes the BFS never reaches are attached to the root and pushed to `max_depth + 1`. They keep a
/// wedge of their own that way instead of piling up at the centre, and the ring sizing below still
/// sees them.
fn build_spanning_tree(adj: &[Vec<u32>], n: usize, root: u32) -> RadialTree {
    let mut ring = vec![u32::MAX; n];
    let mut parent = vec![u32::MAX; n];
    let mut children: Vec<Vec<u32>> = vec![Vec::new(); n];

    let mut queue: Vec<u32> = Vec::with_capacity(n);
    if (root as usize) < n {
        ring[root as usize] = 0;
        queue.push(root);
    }
    let mut head = 0usize;
    let mut max_depth = 0u32;
    while head < queue.len() {
        let v = queue[head];
        head += 1;
        let dv = ring[v as usize];
        max_depth = max_depth.max(dv);
        for &w in &adj[v as usize] {
            if ring[w as usize] == u32::MAX {
                ring[w as usize] = dv + 1;
                parent[w as usize] = v;
                children[v as usize].push(w);
                queue.push(w);
            }
        }
    }

    let outer = max_depth + 1;
    let mut max_ring = max_depth;
    for v in 0..n as u32 {
        if ring[v as usize] == u32::MAX {
            ring[v as usize] = outer;
            parent[v as usize] = root;
            children[root as usize].push(v);
            max_ring = outer;
        }
    }

    RadialTree {
        ring,
        parent,
        children,
        max_ring,
    }
}

/// Leaves under each node. A childless node counts as one leaf.
///
/// Computed by walking rings from the outside in, which is a valid post-order because every child's
/// ring is strictly greater than its parent's — including the unreachable nodes attached to the
/// root, which sit on the outermost ring. No recursion, so a 10,000-deep path cannot blow the stack.
fn leaf_counts(tree: &RadialTree, n: usize) -> Vec<u64> {
    let mut order: Vec<u32> = (0..n as u32).collect();
    order.sort_by(|&a, &b| {
        tree.ring[b as usize]
            .cmp(&tree.ring[a as usize])
            .then(a.cmp(&b))
    });

    let mut leaves = vec![0u64; n];
    for v in order {
        let kids = &tree.children[v as usize];
        if kids.is_empty() {
            leaves[v as usize] = 1;
        } else {
            leaves[v as usize] = kids.iter().map(|&c| leaves[c as usize]).sum();
        }
    }
    leaves
}

/// Assigns every node the midpoint angle of a wedge sized by its subtree's leaf count.
///
/// This is the heart of the mode. A parent's wedge is split among its children in proportion to
/// their leaf counts, so a subtree with ten leaves gets ten times the arc of one with a single leaf
/// and both end up with the same angular room *per drawn box*. Uniform `2*PI*i/n` allocation gives
/// the ten-leaf subtree the same arc as the singleton and is why v1's radial mode collided.
fn assign_wedges(tree: &RadialTree, leaves: &[u64], n: usize, root: u32) -> Vec<f64> {
    let mut angles = vec![0.0f64; n];
    if n == 0 {
        return angles;
    }

    let mut stack: Vec<(u32, f64, f64)> = vec![(root, 0.0, TAU)];
    while let Some((v, a0, a1)) = stack.pop() {
        angles[v as usize] = (a0 + a1) / 2.0;
        let total = leaves[v as usize] as f64;
        if total <= 0.0 {
            continue;
        }
        let span = a1 - a0;
        let mut cursor = a0;
        for &c in &tree.children[v as usize] {
            let share = span * (leaves[c as usize] as f64) / total;
            stack.push((c, cursor, cursor + share));
            cursor += share;
        }
    }
    angles
}

/// The `(x, y)` scale factors that turn the rings into ellipses of aspect `target_aspect_ratio`.
///
/// The product is exactly 1, so the stretch preserves area and cannot inflate the drawing; only its
/// proportions change.
fn ellipse_axes(target_aspect_ratio: f64) -> (f64, f64) {
    let t = if target_aspect_ratio.is_finite() && target_aspect_ratio > 0.0 {
        target_aspect_ratio.clamp(MIN_ASPECT, MAX_ASPECT)
    } else {
        1.0
    };
    let ax = t.sqrt();
    (ax, 1.0 / ax)
}

/// Radius of each ring.
///
/// Two independent requirements, and the radius is the larger:
///
/// - **Radial.** `radius(k) = radius(k-1) + halfExtent(k-1) + halfExtent(k) + ringGap`, where the
///   extent of a box is measured along its own radial direction. Guarantees ring `k` clears ring
///   `k-1` by `ringGap`.
/// - **Circumferential.** The ring must offer at least `SUM(tangentialExtent + nodeGap)` of arc.
///   Enforced against `minor_axis`, the *tighter* of the two elliptical radii, so the stretch can
///   never eat the clearance it was supposed to preserve. This is also the only place
///   `node_gap` enters a radial drawing — arc length between siblings is exactly what it means here.
///
/// `ring_gap` takes `effective_rank_gap()` as a floor so the general spacing family still applies;
/// `radial_ring_gap` is scaled by the compaction preset like every other gap.
fn ring_radii(
    ir: &GraphIr,
    tree: &RadialTree,
    angles: &[f64],
    config: &CustomLayoutConfig,
    minor_axis: f64,
) -> Vec<f64> {
    let ring_count = tree.max_ring as usize + 1;
    let mut members: Vec<Vec<u32>> = vec![Vec::new(); ring_count];
    for v in 0..ir.node_count() as u32 {
        let k = tree.ring[v as usize] as usize;
        if k < ring_count {
            members[k].push(v);
        }
    }

    let ring_gap = (config.radial_ring_gap * config.compaction.gap_scale())
        .max(config.effective_rank_gap())
        .max(0.0);
    let node_gap = config.effective_node_gap().max(0.0);
    let minor = if minor_axis.is_finite() && minor_axis > 0.0 {
        minor_axis
    } else {
        1.0
    };

    let half_radial = |ring: &[u32]| -> f64 {
        ring.iter().fold(0.0f64, |acc, &v| {
            let node = &ir.nodes[v as usize];
            let theta = angles[v as usize];
            acc.max((node.width * theta.cos().abs() + node.height * theta.sin().abs()) / 2.0)
        })
    };

    let mut radii = vec![0.0f64; ring_count];
    for k in 1..ring_count {
        let step = half_radial(&members[k - 1]) + half_radial(&members[k]) + ring_gap;
        let mut r = radii[k - 1] + step;

        let arc: f64 = members[k]
            .iter()
            .map(|&v| {
                let node = &ir.nodes[v as usize];
                let theta = angles[v as usize];
                node.width * theta.sin().abs() + node.height * theta.cos().abs() + node_gap
            })
            .sum();
        let circumference_radius = arc / TAU * RING_ARC_SLACK / minor;
        if circumference_radius.is_finite() {
            r = r.max(circumference_radius);
        }
        radii[k] = r;
    }
    radii
}

/// One interior waypoint per IR edge: `None` for tree edges, a point bowed toward the centre for
/// chords.
///
/// A chord is bent [`CHORD_BOW`] of the way to the origin — the layout is centred there before the
/// final translation — which reads as "this connection is not part of the hierarchy" without every
/// chord piling onto the same point the way v1's through-the-centre Beziers did.
fn chord_bows(ir: &GraphIr, tree: &RadialTree, rects: &[Rect]) -> Vec<Option<Point>> {
    let mut bows = vec![None; ir.edge_count()];
    for (e, edge) in ir.edges.iter().enumerate() {
        let (s, t) = (edge.source, edge.target);
        if s == t {
            continue;
        }
        let is_tree = tree.parent[t as usize] == s || tree.parent[s as usize] == t;
        if is_tree {
            continue;
        }
        let (Some(rs), Some(rt)) = (rects.get(s as usize), rects.get(t as usize)) else {
            continue;
        };
        let a = rs.center();
        let b = rt.center();
        let mid = Point {
            x: (a.x + b.x) / 2.0,
            y: (a.y + b.y) / 2.0,
        };
        bows[e] = Some(Point {
            x: mid.x * (1.0 - CHORD_BOW),
            y: mid.y * (1.0 - CHORD_BOW),
        });
    }
    bows
}

/// `(ring, position within ring)` per node, positions ordered by angle then index.
fn ring_placement(tree: &RadialTree, angles: &[f64], n: usize) -> Vec<(usize, usize)> {
    let ring_count = tree.max_ring as usize + 1;
    let mut members: Vec<Vec<u32>> = vec![Vec::new(); ring_count];
    for v in 0..n as u32 {
        let k = tree.ring[v as usize] as usize;
        if k < ring_count {
            members[k].push(v);
        }
    }

    let mut out = vec![(0usize, 0usize); n];
    for (k, ring) in members.iter_mut().enumerate() {
        ring.sort_by(|&a, &b| {
            angles[a as usize]
                .partial_cmp(&angles[b as usize])
                .unwrap_or(std::cmp::Ordering::Equal)
                .then(a.cmp(&b))
        });
        for (order, &v) in ring.iter().enumerate() {
            out[v as usize] = (k, order);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::DEFAULT_CUSTOM_LAYOUT_CONFIG;

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

    /// A root with `k` children, each child carrying `grandchildren` of its own.
    fn star(k: usize, grandchildren: usize) -> (Vec<NormalizedNode>, Vec<NormalizedEdge>) {
        let mut nodes = vec![node("root", 160.0, 60.0)];
        let mut edges = Vec::new();
        for i in 0..k {
            let child = format!("c{}", i);
            nodes.push(node(&child, 140.0, 60.0));
            edges.push(edge(&format!("e{}", i), "root", &child));
            for g in 0..grandchildren {
                let gc = format!("g{}_{}", i, g);
                nodes.push(node(&gc, 140.0, 60.0));
                edges.push(edge(&format!("e{}_{}", i, g), &child, &gc));
            }
        }
        (nodes, edges)
    }

    fn centre_of(r: &CustomLayoutResult, id: &str) -> Option<Point> {
        r.nodes.iter().find(|n| n.id == id).map(|n| Point {
            x: n.x + n.width / 2.0,
            y: n.y + n.height / 2.0,
        })
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
        let out = layout_radial(&[], &[], &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        assert!(out.nodes.is_empty());
        assert_eq!(out.optimization_stats.stop_reason, "empty_graph");
    }

    #[test]
    fn every_node_and_edge_is_present() {
        let (nodes, edges) = star(4, 2);
        let out = layout_radial(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        assert_eq!(out.nodes.len(), nodes.len());
        assert_eq!(out.edges.len(), edges.len());
        assert!(out.nodes.iter().all(|n| n.x.is_finite() && n.y.is_finite()));
    }

    #[test]
    fn layout_is_deterministic_across_runs() {
        let (nodes, edges) = star(5, 2);
        let a = layout_radial(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        let b = layout_radial(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        assert_eq!(
            serde_json::to_string(&a.nodes).unwrap_or_default(),
            serde_json::to_string(&b.nodes).unwrap_or_default()
        );
    }

    #[test]
    fn root_is_on_ring_zero_and_neighbours_are_strictly_further_out() {
        let (nodes, edges) = star(5, 1);
        let out = layout_radial(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);

        let root = out
            .nodes
            .iter()
            .find(|n| n.id == "root")
            .expect("root present");
        assert_eq!(root.rank, 0, "root must sit on ring 0");
        let origin = Point {
            x: root.x + root.width / 2.0,
            y: root.y + root.height / 2.0,
        };

        for i in 0..5 {
            let id = format!("c{}", i);
            let c = centre_of(&out, &id).expect("child present");
            let d = ((c.x - origin.x).powi(2) + (c.y - origin.y).powi(2)).sqrt();
            assert!(d > 0.0, "child {id} must have a strictly larger radius");
            let child_rank = out
                .nodes
                .iter()
                .find(|n| n.id == id)
                .map(|n| n.rank)
                .unwrap_or(0);
            assert_eq!(child_rank, 1, "child {id} must sit on ring 1");
        }
    }

    #[test]
    fn rings_increase_monotonically_with_depth() {
        let (nodes, edges) = star(3, 2);
        let out = layout_radial(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        let origin = centre_of(&out, "root").expect("root");
        let r_of = |id: &str| -> f64 {
            let c = centre_of(&out, id).unwrap_or(origin);
            ((c.x - origin.x).powi(2) + (c.y - origin.y).powi(2)).sqrt()
        };
        assert!(r_of("g0_0") > r_of("c0"), "ring 2 must be outside ring 1");
    }

    #[test]
    fn explicit_root_wins_over_the_degree_heuristic() {
        let (nodes, edges) = star(4, 0);
        let mut cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        cfg.radial_root = "c2".to_string();
        let out = layout_radial(&nodes, &edges, &cfg);
        let picked = out
            .nodes
            .iter()
            .find(|n| n.rank == 0)
            .map(|n| n.id.clone())
            .unwrap_or_default();
        assert_eq!(picked, "c2");
    }

    #[test]
    fn an_unknown_explicit_root_falls_back_to_highest_degree() {
        let (nodes, edges) = star(4, 0);
        let mut cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        cfg.radial_root = "does-not-exist".to_string();
        let out = layout_radial(&nodes, &edges, &cfg);
        let picked = out
            .nodes
            .iter()
            .find(|n| n.rank == 0)
            .map(|n| n.id.clone())
            .unwrap_or_default();
        assert_eq!(picked, "root");
    }

    #[test]
    fn unreachable_nodes_land_on_the_outermost_ring() {
        let mut nodes = vec![node("root", 160.0, 60.0), node("a", 140.0, 60.0)];
        let edges = vec![edge("e0", "root", "a")];
        nodes.push(node("island", 140.0, 60.0));

        let out = layout_radial(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        let a_rank = out.nodes.iter().find(|n| n.id == "a").map(|n| n.rank);
        let island_rank = out.nodes.iter().find(|n| n.id == "island").map(|n| n.rank);
        assert_eq!(a_rank, Some(1));
        assert_eq!(
            island_rank,
            Some(2),
            "an unreachable node goes one ring out"
        );
    }

    #[test]
    fn proportional_wedges_give_a_dense_subtree_more_arc() {
        // c0 carries six leaves, c1 carries one. Their wedges must differ in the same proportion.
        let mut nodes = vec![
            node("root", 160.0, 60.0),
            node("c0", 140.0, 60.0),
            node("c1", 140.0, 60.0),
        ];
        let mut edges = vec![edge("e0", "root", "c0"), edge("e1", "root", "c1")];
        for i in 0..6 {
            let gc = format!("g{}", i);
            nodes.push(node(&gc, 140.0, 60.0));
            edges.push(edge(&format!("ge{}", i), "c0", &gc));
        }

        // `c0` has the highest degree here, so the root is pinned rather than inferred.
        let mut cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        cfg.radial_root = "root".to_string();

        let ir = build_graph_ir(&nodes, &edges, &cfg);
        let adj = undirected_adjacency(&ir);
        let root = choose_root(&ir, &cfg);
        let tree = build_spanning_tree(&adj, ir.node_count(), root);
        let leaves = leaf_counts(&tree, ir.node_count());
        let angles = assign_wedges(&tree, &leaves, ir.node_count(), root);

        let idx = |name: &str| -> usize {
            ir.node_names
                .iter()
                .position(|n| n == name)
                .expect("node present")
        };
        assert_eq!(leaves[idx("root")], 7);
        assert_eq!(leaves[idx("c0")], 6);
        assert_eq!(leaves[idx("c1")], 1);

        // Wedges: c0 owns [0, 6/7 TAU) and c1 owns [6/7 TAU, TAU), so their midpoints are
        // 3/7 TAU and 13/14 TAU. Six times the leaves, six times the arc.
        assert!((angles[idx("c0")] - TAU * 3.0 / 7.0).abs() < 1e-9);
        assert!((angles[idx("c1")] - TAU * 13.0 / 14.0).abs() < 1e-9);
    }

    #[test]
    fn non_tree_edges_bow_toward_the_centre() {
        // A triangle: root->a, root->b are tree edges, a->b is a chord.
        let nodes = vec![
            node("root", 160.0, 60.0),
            node("a", 140.0, 60.0),
            node("b", 140.0, 60.0),
        ];
        let edges = vec![
            edge("e0", "root", "a"),
            edge("e1", "root", "b"),
            edge("e2", "a", "b"),
        ];
        let out = layout_radial(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        let tree_edge = out.edges.iter().find(|e| e.edge_id == "e0").expect("e0");
        let chord = out.edges.iter().find(|e| e.edge_id == "e2").expect("e2");
        assert_eq!(tree_edge.points.len(), 2, "tree edges are straight");
        assert_eq!(
            chord.points.len(),
            3,
            "chords bend through one control point"
        );
    }

    #[test]
    fn a_dense_ring_has_no_overlapping_boxes() {
        // Uneven subtree sizes make the wedge allocation uneven, which is exactly the case where
        // a ring's total arc can be sufficient while one slice of it is crowded.
        let mut nodes = vec![node("root", 160.0, 60.0)];
        let mut edges = Vec::new();
        for i in 0..4 {
            let child = format!("c{}", i);
            nodes.push(node(&child, 160.0, 70.0));
            edges.push(edge(&format!("e{}", i), "root", &child));
            for g in 0..(i * 4 + 1) {
                let gc = format!("g{}_{}", i, g);
                nodes.push(node(&gc, 160.0, 70.0));
                edges.push(edge(&format!("ge{}_{}", i, g), &child, &gc));
            }
        }

        let out = layout_radial(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        assert_eq!(
            out.validation.metrics.node_node_overlaps, 0,
            "radial must not emit overlapping boxes"
        );
    }

    #[test]
    fn ellipse_axes_preserve_area() {
        let (ax, ay) = ellipse_axes(1.6);
        assert!((ax * ay - 1.0).abs() < 1e-12);
        assert!(ax > ay, "a wide target must stretch x more than y");
        let (bx, by) = ellipse_axes(f64::NAN);
        assert_eq!((bx, by), (1.0, 1.0));
    }

    #[test]
    fn doubling_node_gap_widens_the_drawing() {
        // Twelve siblings on one ring: the arc requirement dominates, and node_gap is what sets it.
        let (nodes, edges) = star(12, 0);
        let base = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        let mut wide = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        wide.node_gap = base.node_gap * 2.0;

        let w0 = bbox_width(&layout_radial(&nodes, &edges, &base));
        let w1 = bbox_width(&layout_radial(&nodes, &edges, &wide));
        assert!(
            w1 > w0,
            "doubling node_gap must widen the drawing: {w0} -> {w1}"
        );
    }

    #[test]
    fn single_node_graph_is_just_the_root() {
        let nodes = vec![node("solo", 200.0, 80.0)];
        let out = layout_radial(&nodes, &[], &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        assert_eq!(out.nodes.len(), 1);
        assert_eq!(out.nodes[0].rank, 0);
        let p = DEFAULT_CUSTOM_LAYOUT_CONFIG.graph_padding;
        assert!((out.nodes[0].x - p).abs() < 1e-6);
    }
}
