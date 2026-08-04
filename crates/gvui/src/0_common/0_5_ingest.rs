//! # Step 0.5 (Phase 0): Ingest
//!
//! Converts the wire-format `NormalizedNode`/`NormalizedEdge` arrays into the internal
//! [`GraphIr`]: dense `u32` indices, CSR adjacency, parallel-edge bundles and weakly connected
//! components. This is the **only** place string ids are hashed; every later phase indexes.
//!
//! Three things are decided here that no later phase can repair, and so must be correct by
//! construction:
//!
//! 1. **Node width already accounts for its ports.** Port pitch is a hard constraint at attach
//!    time, but node width is an input to ranking and ordering — so degree-driven growth has to
//!    happen before ranking, not during routing (see `02-algorithms.md` §8c).
//! 2. **A labelled edge gets `min_len = 2`.** Phase 4 hosts the badge on an intermediate rank; if
//!    the span were 1 there would be no rank to put it on and the reservation would be impossible.
//!    That is a *default*, not a floor: an explicit `min_len` from the host is honoured verbatim,
//!    including `0`, which is what lets two peers share a rank and be joined by a flat edge.
//! 3. **Unresolvable edges are dropped here, loudly.** v1 skipped them silently inside the router,
//!    which made a data error look like a layout bug.
//!
//! Every decision is driven by `Vec` iteration or an explicitly sorted key list. The one
//! `HashMap` present is a lookup table that is never iterated, so output is byte-identical across
//! processes.

use std::collections::HashMap;

use crate::badge_measurement;
use crate::config::CustomLayoutConfig;
use crate::types::{
    Bundle, Csr, EdgeLayoutHint, GraphIr, IrEdge, IrNode, LabelBox, LayoutDiagnostic,
    NormalizedEdge, NormalizedNode,
};

/// Diagnostic code for a repeated node id.
const CODE_DUPLICATE_NODE: &str = "DUPLICATE_NODE";
/// Diagnostic code for a repeated edge id.
const CODE_DUPLICATE_EDGE: &str = "DUPLICATE_EDGE";
/// Diagnostic code for an edge whose source or target is not a known node id.
const CODE_UNKNOWN_ENDPOINT: &str = "UNKNOWN_ENDPOINT";

/// Builds the Phase 0 IR from host input.
///
/// Never fails: malformed input is dropped and reported through [`GraphIr::diagnostics`], because a
/// single bad edge must not cost the user the whole drawing. Contract subtleties a caller can get
/// wrong:
///
/// - **Node order is input order.** Node index `i` is the `i`-th *surviving* node of `nodes`, so a
///   dropped duplicate shifts every later index. Never assume `nodes[i]` maps to IR index `i`;
///   resolve through [`GraphIr::node_names`].
/// - **`is_cycle` is folded into [`IrEdge::hint`]** as [`EdgeLayoutHint::Feedback`] when no
///   explicit `layout_role` overrides it. The IR has no separate `is_cycle` field; Phase 2 reads
///   the hint alone.
/// - **Self-loops are present in both CSRs** and count twice toward `degree`, so port allocation
///   reserves room for both ends.
/// - **Bundles are only built when `config.bundle_parallel_edges` is set**, and group by the
///   *unordered* pair, so `a→b` and `b→a` land in the same bundle.
pub fn build_graph_ir(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    config: &CustomLayoutConfig,
) -> GraphIr {
    let mut ir = GraphIr::default();

    // ---- 1/2. Intern node ids in input order -------------------------------------------------
    // `index_of` exists purely for O(1) endpoint resolution and is never iterated; all ordering
    // comes from `kept` and from index ranges.
    let mut index_of: HashMap<&str, u32> = HashMap::with_capacity(nodes.len());
    let mut kept: Vec<&NormalizedNode> = Vec::with_capacity(nodes.len());

    for node in nodes {
        if index_of.contains_key(node.id.as_str()) {
            ir.diagnostics.push(LayoutDiagnostic::warning(
                CODE_DUPLICATE_NODE,
                format!(
                    "Duplicate node id '{}'; keeping the first occurrence and skipping this one.",
                    node.id
                ),
                vec![node.id.clone()],
            ));
            continue;
        }
        let idx = kept.len() as u32;
        index_of.insert(node.id.as_str(), idx);
        kept.push(node);
        ir.node_names.push(node.id.clone());
        ir.node_labels.push(node.label.clone());
    }

    let node_count = kept.len();

    // ---- 3/4/5/7/8/9. Resolve edges ----------------------------------------------------------
    let mut seen_edge_ids: HashMap<&str, ()> = HashMap::with_capacity(edges.len());
    let mut in_degree = vec![0u32; node_count];
    let mut out_degree = vec![0u32; node_count];

    for edge in edges {
        if seen_edge_ids.insert(edge.id.as_str(), ()).is_some() {
            ir.diagnostics.push(LayoutDiagnostic::warning(
                CODE_DUPLICATE_EDGE,
                format!(
                    "Duplicate edge id '{}'; keeping the first occurrence and skipping this one.",
                    edge.id
                ),
                vec![edge.id.clone()],
            ));
            continue;
        }

        let source = index_of.get(edge.source.as_str()).copied();
        let target = index_of.get(edge.target.as_str()).copied();
        let (source, target) = match (source, target) {
            (Some(s), Some(t)) => (s, t),
            _ => {
                let mut ids = vec![edge.id.clone()];
                let mut missing: Vec<&str> = Vec::with_capacity(2);
                if source.is_none() {
                    missing.push(edge.source.as_str());
                }
                if target.is_none() && edge.target != edge.source {
                    missing.push(edge.target.as_str());
                }
                for m in &missing {
                    ids.push((*m).to_string());
                }
                ir.diagnostics.push(LayoutDiagnostic::warning(
                    CODE_UNKNOWN_ENDPOINT,
                    format!(
                        "Edge '{}' references unknown node id(s) [{}]; edge dropped.",
                        edge.id,
                        missing.join(", ")
                    ),
                    ids,
                ));
                continue;
            }
        };

        let is_cycle = edge.is_cycle.unwrap_or(false);
        let label = resolve_label_box(edge, is_cycle, config);

        // A labelled edge must span >= 2 ranks so Phase 4 has an intermediate rank on which to
        // materialise the label item. An explicit `min_len` from the host always wins — including
        // `0`, which asks for a same-rank (flat) edge. Zero is deliberately *not* floored to 1:
        // every ranker treats `min_len` as a lower bound on `rank(to) - rank(from)`, so 0 is a
        // legal constraint that simply permits equality, and Phase 4 turns a zero span into a
        // `FlatEdge`. Flooring it here is what made flat edges unreachable in v2.
        let min_len: u16 = match edge.min_len {
            Some(m) => m.min(u16::MAX as usize) as u16,
            None if label.is_some() => 2,
            None => 1,
        };

        let weight = match edge.weight {
            Some(w) if w.is_finite() && w > 0.0 => w,
            _ => 1.0,
        };

        // `Auto` is "no opinion", so it must not shadow the `is_cycle` flag.
        let explicit = match edge.layout_role {
            Some(EdgeLayoutHint::Auto) | None => None,
            other => other,
        };
        let hint = explicit.or(if is_cycle {
            Some(EdgeLayoutHint::Feedback)
        } else {
            None
        });

        out_degree[source as usize] += 1;
        in_degree[target as usize] += 1;

        ir.edge_names.push(edge.id.clone());
        ir.edges.push(IrEdge {
            name: (ir.edge_names.len() - 1) as u32,
            source,
            target,
            label,
            weight,
            min_len,
            hint,
            bundle: None,
        });
    }

    // ---- 6/13. Node boxes -------------------------------------------------------------------
    for (i, node) in kept.iter().enumerate() {
        let raw_w = if node.width.is_finite() {
            node.width
        } else {
            0.0
        };
        let mut width = raw_w.max(config.min_node_width).min(config.max_node_width);

        // Ports on one side are pitched `port_pitch` apart with `port_endpoint_padding` of
        // clearance at each corner; the busier side dictates the width.
        let side_deg = in_degree[i].max(out_degree[i]) as f64;
        let required = side_deg * config.port_pitch + 2.0 * config.port_endpoint_padding;
        width = width.max(required).min(config.max_node_width);

        let height = if node.height.is_finite() {
            node.height.max(1.0)
        } else {
            1.0
        };

        ir.nodes.push(IrNode {
            name: i as u32,
            width,
            height,
            pinned_rank: node.rank.map(|r| r.min(u16::MAX as usize) as u16),
            degree: in_degree[i] + out_degree[i],
        });
    }

    ir.has_pinned_ranks = ir.nodes.iter().any(|n| n.pinned_rank.is_some());

    // ---- 10. Parallel-edge bundles -----------------------------------------------------------
    if config.bundle_parallel_edges {
        // Sorting `(a, b, edge)` triples groups the unordered pairs and keeps members ascending,
        // which is what makes bundle indices reproducible.
        let mut keys: Vec<(u32, u32, u32)> = Vec::with_capacity(ir.edges.len());
        for (e, edge) in ir.edges.iter().enumerate() {
            if edge.source == edge.target {
                continue;
            }
            let a = edge.source.min(edge.target);
            let b = edge.source.max(edge.target);
            keys.push((a, b, e as u32));
        }
        keys.sort_unstable();

        let mut i = 0usize;
        while i < keys.len() {
            let (a, b, _) = keys[i];
            let mut j = i + 1;
            while j < keys.len() && keys[j].0 == a && keys[j].1 == b {
                j += 1;
            }
            if j - i >= 2 {
                let bundle = ir.bundles.len() as u32;
                let members: Vec<u32> = keys[i..j].iter().map(|k| k.2).collect();
                for &m in &members {
                    ir.edges[m as usize].bundle = Some(bundle);
                }
                ir.bundles.push(Bundle {
                    a,
                    b,
                    edges: members,
                });
            }
            i = j;
        }
    }

    // ---- 11. CSR adjacency -------------------------------------------------------------------
    let mut out_arcs: Vec<(u32, u32, u32)> = Vec::with_capacity(ir.edges.len());
    let mut in_arcs: Vec<(u32, u32, u32)> = Vec::with_capacity(ir.edges.len());
    for (e, edge) in ir.edges.iter().enumerate() {
        out_arcs.push((edge.source, edge.target, e as u32));
        in_arcs.push((edge.target, edge.source, e as u32));
    }
    ir.out_csr = Csr::build(node_count, &out_arcs);
    ir.in_csr = Csr::build(node_count, &in_arcs);

    // ---- 12. Weakly connected components -----------------------------------------------------
    ir.components = weak_components(node_count, &ir.edges);

    ir
}

/// Chooses the badge box for an edge.
///
/// Host-measured `label_width`/`label_height` always win because they come from real font metrics;
/// the character-estimate fallback exists only for hosts that cannot measure.
fn resolve_label_box(
    edge: &NormalizedEdge,
    is_cycle: bool,
    config: &CustomLayoutConfig,
) -> Option<LabelBox> {
    if let (Some(w), Some(h)) = (edge.label_width, edge.label_height) {
        if w.is_finite() && h.is_finite() && w > 0.0 && h > 0.0 {
            return Some(LabelBox {
                width: w,
                height: h,
            });
        }
    }

    if !badge_measurement::has_badge(edge.label.as_deref(), is_cycle) {
        return None;
    }

    let rect = badge_measurement::measure_badge_rect(
        edge.label.as_deref().unwrap_or(""),
        config,
        is_cycle,
    );
    if rect.width > 0.0 && rect.height > 0.0 {
        Some(LabelBox {
            width: rect.width,
            height: rect.height,
        })
    } else {
        None
    }
}

/// Union-find over non-self edges, returning components sorted ascending and ordered by their
/// minimum node index. Isolated nodes each form their own single-element component.
fn weak_components(node_count: usize, edges: &[IrEdge]) -> Vec<Vec<u32>> {
    let mut parent: Vec<u32> = (0..node_count as u32).collect();

    fn find(parent: &mut [u32], mut x: u32) -> u32 {
        while parent[x as usize] != x {
            // Path halving: no recursion, no allocation.
            let grand = parent[parent[x as usize] as usize];
            parent[x as usize] = grand;
            x = grand;
        }
        x
    }

    for edge in edges {
        if edge.source == edge.target {
            continue;
        }
        let a = find(&mut parent, edge.source);
        let b = find(&mut parent, edge.target);
        if a != b {
            // Union by index keeps the representative deterministic.
            if a < b {
                parent[b as usize] = a;
            } else {
                parent[a as usize] = b;
            }
        }
    }

    let mut slot = vec![u32::MAX; node_count];
    let mut components: Vec<Vec<u32>> = Vec::new();
    // Ascending node scan gives both guarantees at once: each list is sorted, and a component is
    // first created at its minimum member.
    for v in 0..node_count as u32 {
        let root = find(&mut parent, v) as usize;
        if slot[root] == u32::MAX {
            slot[root] = components.len() as u32;
            components.push(Vec::new());
        }
        components[slot[root] as usize].push(v);
    }
    components
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(id: &str, w: f64, h: f64) -> NormalizedNode {
        NormalizedNode {
            id: id.to_string(),
            label: None,
            width: w,
            height: h,
            rank: None,
            group: None,
        }
    }

    fn edge(id: &str, source: &str, target: &str) -> NormalizedEdge {
        NormalizedEdge {
            id: id.to_string(),
            source: source.to_string(),
            target: target.to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
            weight: None,
            min_len: None,
            label_width: None,
            label_height: None,
        }
    }

    fn cfg() -> CustomLayoutConfig {
        CustomLayoutConfig::default()
    }

    #[test]
    fn empty_input_yields_empty_ir() {
        let ir = build_graph_ir(&[], &[], &cfg());
        assert_eq!(ir.node_count(), 0);
        assert_eq!(ir.edge_count(), 0);
        assert!(ir.components.is_empty());
        assert!(ir.diagnostics.is_empty());
        // A CSR over zero nodes must still be queryable.
        assert_eq!(ir.out_csr.node_count(), 0);
    }

    #[test]
    fn happy_path_interns_in_input_order() {
        let nodes = vec![node("b", 100.0, 40.0), node("a", 100.0, 40.0)];
        let edges = vec![edge("e1", "b", "a")];
        let ir = build_graph_ir(&nodes, &edges, &cfg());

        assert_eq!(ir.node_names, vec!["b".to_string(), "a".to_string()]);
        assert_eq!(ir.edges[0].source, 0);
        assert_eq!(ir.edges[0].target, 1);
        assert_eq!(ir.out_csr.neighbours(0), &[1]);
        assert_eq!(ir.in_csr.neighbours(1), &[0]);
        assert!(ir.diagnostics.is_empty());
    }

    #[test]
    fn unknown_endpoint_drops_only_that_edge() {
        let nodes = vec![node("a", 100.0, 40.0), node("b", 100.0, 40.0)];
        let edges = vec![
            edge("bad", "a", "ghost"),
            edge("good", "a", "b"),
            edge("bad2", "ghost", "phantom"),
        ];
        let ir = build_graph_ir(&nodes, &edges, &cfg());

        assert_eq!(ir.edge_count(), 1);
        assert_eq!(ir.edge_name(0), "good");

        let unknown: Vec<&LayoutDiagnostic> = ir
            .diagnostics
            .iter()
            .filter(|d| d.code == CODE_UNKNOWN_ENDPOINT)
            .collect();
        assert_eq!(unknown.len(), 2);
        assert_eq!(unknown[0].severity, "warning");
        let ids = unknown[0].ids.clone().unwrap_or_default();
        assert!(ids.contains(&"bad".to_string()));
        assert!(ids.contains(&"ghost".to_string()));
    }

    #[test]
    fn duplicate_node_and_edge_ids_keep_the_first() {
        let nodes = vec![
            node("a", 100.0, 40.0),
            node("a", 999.0, 999.0),
            node("b", 100.0, 40.0),
        ];
        let edges = vec![edge("e", "a", "b"), edge("e", "b", "a")];
        let ir = build_graph_ir(&nodes, &edges, &cfg());

        assert_eq!(ir.node_count(), 2);
        assert_eq!(ir.node_names, vec!["a".to_string(), "b".to_string()]);
        // The clamp floor is 120, so the surviving node kept its own (clamped) box, not the
        // duplicate's 999.
        assert_eq!(ir.nodes[0].height, 40.0);
        assert_eq!(ir.edge_count(), 1);
        assert_eq!(ir.edges[0].source, 0);

        assert_eq!(
            ir.diagnostics
                .iter()
                .filter(|d| d.code == CODE_DUPLICATE_NODE)
                .count(),
            1
        );
        assert_eq!(
            ir.diagnostics
                .iter()
                .filter(|d| d.code == CODE_DUPLICATE_EDGE)
                .count(),
            1
        );
    }

    #[test]
    fn labelled_edge_gets_min_len_two() {
        let nodes = vec![node("a", 100.0, 40.0), node("b", 100.0, 40.0)];
        let mut labelled = edge("e1", "a", "b");
        labelled.label = Some("depends on".to_string());
        let plain = edge("e2", "a", "b");
        let ir = build_graph_ir(&nodes, &[labelled, plain], &cfg());

        assert!(ir.edges[0].label.is_some());
        assert_eq!(ir.edges[0].min_len, 2);
        assert!(ir.edges[1].label.is_none());
        assert_eq!(ir.edges[1].min_len, 1);
    }

    #[test]
    fn explicit_min_len_and_host_measured_label_win() {
        let nodes = vec![node("a", 100.0, 40.0), node("b", 100.0, 40.0)];
        let mut e = edge("e1", "a", "b");
        e.label = Some("x".to_string());
        e.label_width = Some(77.0);
        e.label_height = Some(31.0);
        e.min_len = Some(5);
        e.weight = Some(4.0);
        let ir = build_graph_ir(&nodes, &[e], &cfg());

        let lb = ir.edges[0].label.unwrap_or(LabelBox {
            width: 0.0,
            height: 0.0,
        });
        assert_eq!(lb.width, 77.0);
        assert_eq!(lb.height, 31.0);
        assert_eq!(ir.edges[0].min_len, 5);
        assert_eq!(ir.edges[0].weight, 4.0);
    }

    #[test]
    fn an_explicit_min_len_of_zero_survives_ingest() {
        // `minLen: 0` is the host asking for a same-rank edge. It must reach the ranker intact on
        // both a plain and a labelled edge, otherwise `span == 0` — and with it every flat-edge
        // code path — stays unreachable.
        let nodes = vec![node("a", 100.0, 40.0), node("b", 100.0, 40.0)];
        let mut plain = edge("e1", "a", "b");
        plain.min_len = Some(0);
        let mut labelled = edge("e2", "a", "b");
        labelled.label = Some("peer".to_string());
        labelled.min_len = Some(0);

        let ir = build_graph_ir(&nodes, &[plain, labelled], &cfg());
        assert_eq!(ir.edges[0].min_len, 0);
        assert_eq!(ir.edges[1].min_len, 0);
        assert!(
            ir.edges[1].label.is_some(),
            "a zero-span edge still carries its badge; Phase 6 reserves corridor width for it"
        );
    }

    #[test]
    fn non_finite_or_zero_weight_falls_back_to_one() {
        let nodes = vec![node("a", 100.0, 40.0), node("b", 100.0, 40.0)];
        let mut e1 = edge("e1", "a", "b");
        e1.weight = Some(0.0);
        let mut e2 = edge("e2", "a", "b");
        e2.weight = Some(f64::NAN);
        let ir = build_graph_ir(&nodes, &[e1, e2], &cfg());
        assert_eq!(ir.edges[0].weight, 1.0);
        assert_eq!(ir.edges[1].weight, 1.0);
    }

    #[test]
    fn is_cycle_becomes_a_feedback_hint_unless_overridden() {
        let nodes = vec![node("a", 100.0, 40.0), node("b", 100.0, 40.0)];
        let mut cyc = edge("e1", "a", "b");
        cyc.is_cycle = Some(true);
        let mut overridden = edge("e2", "a", "b");
        overridden.is_cycle = Some(true);
        overridden.layout_role = Some(EdgeLayoutHint::Forward);
        let mut auto = edge("e3", "a", "b");
        auto.is_cycle = Some(true);
        auto.layout_role = Some(EdgeLayoutHint::Auto);

        let ir = build_graph_ir(&nodes, &[cyc, overridden, auto], &cfg());
        assert_eq!(ir.edges[0].hint, Some(EdgeLayoutHint::Feedback));
        assert_eq!(ir.edges[1].hint, Some(EdgeLayoutHint::Forward));
        assert_eq!(ir.edges[2].hint, Some(EdgeLayoutHint::Feedback));
    }

    #[test]
    fn node_width_grows_for_port_pitch_and_clamps_at_max() {
        let mut c = cfg();
        c.bundle_parallel_edges = false;
        // 10 out-edges: 10 * 18 + 2 * 16 = 212, above the 120 floor and below the 420 ceiling.
        let mut nodes = vec![node("hub", 100.0, 40.0)];
        let mut edges = Vec::new();
        for i in 0..10 {
            let id = format!("t{}", i);
            nodes.push(node(&id, 100.0, 40.0));
            edges.push(edge(&format!("e{}", i), "hub", &id));
        }
        let ir = build_graph_ir(&nodes, &edges, &c);
        assert_eq!(ir.nodes[0].width, 212.0);
        assert_eq!(ir.nodes[0].degree, 10);
        // Leaves keep the min-width floor.
        assert_eq!(ir.nodes[1].width, c.min_node_width);

        // 30 out-edges: 30 * 18 + 32 = 572, clamped down to max_node_width.
        let mut nodes = vec![node("hub", 100.0, 40.0)];
        let mut edges = Vec::new();
        for i in 0..30 {
            let id = format!("t{}", i);
            nodes.push(node(&id, 100.0, 40.0));
            edges.push(edge(&format!("e{}", i), "hub", &id));
        }
        let ir = build_graph_ir(&nodes, &edges, &c);
        assert_eq!(ir.nodes[0].width, c.max_node_width);
    }

    #[test]
    fn self_loop_counts_twice_and_appears_in_both_csrs() {
        let nodes = vec![node("a", 100.0, 40.0)];
        let ir = build_graph_ir(&nodes, &[edge("e", "a", "a")], &cfg());
        assert_eq!(ir.nodes[0].degree, 2);
        assert_eq!(ir.out_csr.neighbours(0), &[0]);
        assert_eq!(ir.in_csr.neighbours(0), &[0]);
        // A self-loop never bundles and never joins two components.
        assert!(ir.bundles.is_empty());
        assert_eq!(ir.components, vec![vec![0]]);
    }

    #[test]
    fn bundles_group_parallel_edges_in_both_directions() {
        let nodes = vec![
            node("a", 100.0, 40.0),
            node("b", 100.0, 40.0),
            node("c", 100.0, 40.0),
        ];
        let edges = vec![
            edge("ab1", "a", "b"),
            edge("ac", "a", "c"),
            edge("ba", "b", "a"),
            edge("ab2", "a", "b"),
        ];
        let ir = build_graph_ir(&nodes, &edges, &cfg());

        assert_eq!(ir.bundles.len(), 1);
        assert_eq!(ir.bundles[0].a, 0);
        assert_eq!(ir.bundles[0].b, 1);
        assert_eq!(ir.bundles[0].edges, vec![0, 2, 3]);
        assert_eq!(ir.edges[0].bundle, Some(0));
        assert_eq!(ir.edges[2].bundle, Some(0));
        assert_eq!(ir.edges[3].bundle, Some(0));
        // The lone a→c edge is not part of any bundle.
        assert_eq!(ir.edges[1].bundle, None);
    }

    #[test]
    fn bundling_is_off_when_configured_off() {
        let mut c = cfg();
        c.bundle_parallel_edges = false;
        let nodes = vec![node("a", 100.0, 40.0), node("b", 100.0, 40.0)];
        let ir = build_graph_ir(&nodes, &[edge("e1", "a", "b"), edge("e2", "a", "b")], &c);
        assert!(ir.bundles.is_empty());
        assert!(ir.edges.iter().all(|e| e.bundle.is_none()));
    }

    #[test]
    fn weak_components_split_a_disconnected_graph() {
        let nodes = vec![
            node("a", 100.0, 40.0),
            node("b", 100.0, 40.0),
            node("c", 100.0, 40.0),
            node("d", 100.0, 40.0),
            node("lonely", 100.0, 40.0),
        ];
        // b→a is a *reverse* edge; weak connectivity ignores direction.
        let edges = vec![edge("e1", "b", "a"), edge("e2", "c", "d")];
        let ir = build_graph_ir(&nodes, &edges, &cfg());

        assert_eq!(ir.components, vec![vec![0, 1], vec![2, 3], vec![4]]);
    }

    #[test]
    fn pinned_ranks_are_detected_and_saturated() {
        let mut nodes = vec![node("a", 100.0, 40.0), node("b", 100.0, 40.0)];
        nodes[1].rank = Some(usize::MAX);
        let ir = build_graph_ir(&nodes, &[], &cfg());
        assert!(ir.has_pinned_ranks);
        assert_eq!(ir.nodes[0].pinned_rank, None);
        assert_eq!(ir.nodes[1].pinned_rank, Some(u16::MAX));

        let ir2 = build_graph_ir(&[node("a", 100.0, 40.0)], &[], &cfg());
        assert!(!ir2.has_pinned_ranks);
    }

    #[test]
    fn non_finite_boxes_are_replaced_by_clamped_defaults() {
        let nodes = vec![node("a", f64::NAN, f64::INFINITY)];
        let ir = build_graph_ir(&nodes, &[], &cfg());
        assert_eq!(ir.nodes[0].width, cfg().min_node_width);
        assert_eq!(ir.nodes[0].height, 1.0);
    }

    #[test]
    fn output_is_byte_identical_across_runs() {
        let nodes: Vec<NormalizedNode> = (0..12)
            .map(|i| node(&format!("n{}", i), 100.0 + i as f64, 40.0))
            .collect();
        let edges: Vec<NormalizedEdge> = (0..12)
            .map(|i| {
                edge(
                    &format!("e{}", i),
                    &format!("n{}", i),
                    &format!("n{}", (i * 5 + 1) % 12),
                )
            })
            .collect();

        let a = build_graph_ir(&nodes, &edges, &cfg());
        let b = build_graph_ir(&nodes, &edges, &cfg());
        assert_eq!(a.node_names, b.node_names);
        assert_eq!(a.components, b.components);
        assert_eq!(a.out_csr.targets, b.out_csr.targets);
        assert_eq!(a.in_csr.targets, b.in_csr.targets);
        let ba: Vec<Option<u32>> = a.edges.iter().map(|e| e.bundle).collect();
        let bb: Vec<Option<u32>> = b.edges.iter().map(|e| e.bundle).collect();
        assert_eq!(ba, bb);
    }
}
