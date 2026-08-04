//! # Step 1.6 (Phase 2): Structure
//!
//! Assigns every edge a structural role and, for the ones that close a cycle, the `reversed` flag
//! that turns the input digraph into a DAG.
//!
//! **A feedback edge is reversed, never dropped.** This is the single most important contract in
//! the phase. v1 excluded feedback edges from the layer graph entirely: they got no dummy chain,
//! contributed nothing to ordering, were invisible to crossing counting, and the router then had
//! to invent a path for them through a layout that had never accounted for them. Here a feedback
//! edge keeps its entry in `roles` and `reversed`, every later phase reads its endpoints through
//! [`StructureResult::arc`], and only Phase 9 flips the arrowhead back.
//!
//! Nothing here is `Cross`. An edge whose endpoints land on the same rank is a *ranking* outcome,
//! discovered in Phase 4 — pre-classifying it would remove it from ranking, which is one of the
//! reasons v1's dense meshes collapsed into two ranks.
//!
//! The pass is single-shot by construction: SCC decomposition finds exactly the components that
//! need breaking, the FAS heuristic breaks each one in linear time, and the Kahn check at the end
//! is a verification with a direct repair, not a retry of the heuristic.

use crate::types::{Csr, EdgeLayoutHint, EdgeRole, GraphIr, StructureResult};

use super::eades_fas::eades_feedback_arc_set;
use super::kahn_dag_verifier::{find_residual_back_edges, is_dag};
use super::tarjan_scc::tarjan_scc;

/// Classifies every edge of `ir` and produces the reversal flags that make the graph acyclic.
///
/// Guarantees, in the order later phases depend on them:
///
/// 1. `roles`, `reversed` and `ir.edges` are index-aligned and the same length — **no edge is ever
///    dropped**, so `StructureResult::arc(ir, e)` is valid for every `e`.
/// 2. Every self-loop is in `self_loops` with role [`EdgeRole::SelfLoop`] and `reversed = false`;
///    self-loops take no part in ranking, layering or ordering and are routed directly in Phase 8.
/// 3. No edge is given [`EdgeRole::Cross`]; that label belongs to Phase 4.
/// 4. When `is_dag` is true — the normal case — the arc set `{ arc(e) | role(e) != SelfLoop }` has
///    no directed cycle. A false value means the caller forced a cycle that could not be broken
///    without contradicting an explicit hint, and Phase 3 must fall back to longest-path ranking.
pub fn analyze_structure(ir: &GraphIr) -> StructureResult {
    let node_count = ir.node_count();
    let edge_count = ir.edge_count();

    let mut roles = vec![EdgeRole::Forward; edge_count];
    let mut reversed = vec![false; edge_count];
    let mut self_loops: Vec<u32> = Vec::new();

    // ---- 1/2. Self-loops, and caller hints as a STARTING ORIENTATION ---------------------------
    //
    // A `Feedback` hint pre-reverses the edge, but it does NOT exempt it from the FAS pass below.
    // Treating hints as mandates is unsound: `is_cycle` only says "this edge closes a cycle in the
    // author's mental model", and blindly reversing such an edge can create cycles that were not
    // there before. If the FAS pass is then forbidden from touching it, no repair exists and the
    // graph stays cyclic — which propagates into ranking as an unbounded longest-path relaxation.
    // (Measured before this was fixed: `dense_kubernetes_mesh`, which carries 12 `isCycle` edges,
    // produced 129 ranks for 30 nodes and could not be ordered at all.)
    //
    // So hints are a BIAS: they choose the orientation the FAS pass starts from, which is usually
    // the one it keeps, and acyclicity is guaranteed by the pass rather than assumed.
    for (e, edge) in ir.edges.iter().enumerate() {
        if edge.source == edge.target {
            roles[e] = EdgeRole::SelfLoop;
            reversed[e] = false;
            self_loops.push(e as u32);
            continue;
        }
        if edge.hint == Some(EdgeLayoutHint::Feedback) {
            reversed[e] = true;
        }
        // An explicit `Cross` is honoured as `Forward` here on purpose: Phase 4 relabels it if
        // ranking actually puts both endpoints on one rank, and forcing it now would take it out
        // of ranking altogether.
    }

    // ---- 3. SCC decomposition over EVERY non-self arc, in its current orientation ---------------
    //
    // Every non-self edge takes part, including hinted ones. `eades_feedback_arc_set` derives its
    // result from a total vertex sequence — it returns exactly the arcs that run backward in that
    // sequence — so TOGGLING the orientation of that set leaves every arc in the component
    // pointing forward along the sequence. Acyclicity is therefore a property of the algorithm,
    // not something the safety net below has to discover.
    let oriented: Vec<(u32, u32, u32)> = (0..edge_count as u32)
        .filter(|&e| roles[e as usize] != EdgeRole::SelfLoop)
        .map(|e| {
            let edge = &ir.edges[e as usize];
            if reversed[e as usize] {
                (edge.target, edge.source, e)
            } else {
                (edge.source, edge.target, e)
            }
        })
        .collect();

    if !oriented.is_empty() && node_count > 0 {
        let csr = Csr::build(node_count, &oriented);
        let scc = tarjan_scc(node_count, &csr);

        // Bucket arcs by the component holding both endpoints. Arcs between components lie on the
        // condensation DAG and can never be on a cycle, so they keep their orientation.
        let mut per_comp: Vec<Vec<(u32, u32, u32)>> = vec![Vec::new(); scc.components.len()];
        for &(from, to, e) in &oriented {
            let (Some(&cf), Some(&ct)) =
                (scc.comp_of.get(from as usize), scc.comp_of.get(to as usize))
            else {
                continue;
            };
            if cf == ct && scc.cyclic.get(cf as usize).copied().unwrap_or(false) {
                per_comp[cf as usize].push((from, to, e));
            }
        }

        // Components are ordered by their minimum node, so this walk is deterministic.
        for (ci, comp) in scc.components.iter().enumerate() {
            if !scc.cyclic[ci] || per_comp[ci].is_empty() {
                continue;
            }
            for e in eades_feedback_arc_set(comp, &per_comp[ci]) {
                let idx = e as usize;
                if idx < edge_count {
                    // Toggle, not set: `per_comp` holds arcs in their CURRENT orientation, so a
                    // hinted edge that Eades wants pointing the other way is flipped back.
                    reversed[idx] = !reversed[idx];
                }
            }
        }
    }

    // ---- 4/5. Role follows the final orientation; nothing is Cross ----------------------------
    //
    // Role is derived from `reversed` rather than from the hint, so it never claims an edge is a
    // feedback edge while the pipeline is treating it as forward. Phase 8 keys its loop-around
    // routing off this, and a mismatch would draw the wrong thing.
    for e in 0..edge_count {
        if roles[e] != EdgeRole::SelfLoop {
            roles[e] = if reversed[e] {
                EdgeRole::Feedback
            } else {
                EdgeRole::Forward
            };
        }
    }

    // ---- 6. Verify, and repair directly if the FAS pass left something behind -----------------
    let mut result = StructureResult {
        roles,
        reversed,
        self_loops,
        is_dag: false,
    };

    let mut dag = false;
    for _ in 0..node_count.saturating_add(1) {
        let pairs: Vec<(u32, u32)> = (0..edge_count as u32)
            .filter(|&e| result.roles[e as usize] != EdgeRole::SelfLoop)
            .map(|e| result.arc(ir, e))
            .collect();
        if is_dag(node_count, &pairs) {
            dag = true;
            break;
        }

        let triples: Vec<(u32, u32, u32)> = (0..edge_count as u32)
            .filter(|&e| result.roles[e as usize] != EdgeRole::SelfLoop)
            .map(|e| {
                let (a, b) = result.arc(ir, e);
                (a, b, e)
            })
            .collect();

        // Step 3 already guarantees acyclicity, so reaching here means a bug upstream rather than
        // an awkward input. Repair anyway: TOGGLE the lowest-index residual back edge. Toggling —
        // rather than only ever setting `reversed = true` — matters because the arc that has to
        // move may be one this pass already flipped; refusing to flip it back is what previously
        // left `is_dag = false` and let ranking relax along a live cycle.
        let back = find_residual_back_edges(node_count, &triples);
        let Some(&victim) = back.first() else {
            break;
        };
        let idx = victim as usize;
        result.reversed[idx] = !result.reversed[idx];
        result.roles[idx] = if result.reversed[idx] {
            EdgeRole::Feedback
        } else {
            EdgeRole::Forward
        };
    }

    result.is_dag = dag;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::CustomLayoutConfig;
    use crate::ingest::build_graph_ir;
    use crate::types::{NormalizedEdge, NormalizedNode};

    fn node(id: &str) -> NormalizedNode {
        NormalizedNode {
            id: id.to_string(),
            label: None,
            width: 100.0,
            height: 40.0,
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

    fn ir_of(node_ids: &[&str], edges: Vec<NormalizedEdge>) -> GraphIr {
        let nodes: Vec<NormalizedNode> = node_ids.iter().map(|id| node(id)).collect();
        build_graph_ir(&nodes, &edges, &CustomLayoutConfig::default())
    }

    /// Independent re-check that the post-reversal arc set really is acyclic.
    fn arcs_are_acyclic(ir: &GraphIr, r: &StructureResult) -> bool {
        let pairs: Vec<(u32, u32)> = (0..ir.edge_count() as u32)
            .filter(|&e| r.roles[e as usize] != EdgeRole::SelfLoop)
            .map(|e| r.arc(ir, e))
            .collect();
        is_dag(ir.node_count(), &pairs)
    }

    #[test]
    fn empty_graph_is_a_dag() {
        let r = analyze_structure(&ir_of(&[], vec![]));
        assert!(r.is_dag);
        assert!(r.roles.is_empty());
        assert!(r.reversed.is_empty());
        assert!(r.self_loops.is_empty());
    }

    #[test]
    fn a_dag_is_left_entirely_forward() {
        let ir = ir_of(
            &["a", "b", "c"],
            vec![
                edge("e1", "a", "b"),
                edge("e2", "b", "c"),
                edge("e3", "a", "c"),
            ],
        );
        let r = analyze_structure(&ir);
        assert!(r.is_dag);
        assert_eq!(r.roles, vec![EdgeRole::Forward; 3]);
        assert_eq!(r.reversed, vec![false; 3]);
    }

    #[test]
    fn a_cycle_becomes_a_dag_and_the_feedback_edge_survives() {
        let ir = ir_of(
            &["a", "b", "c"],
            vec![
                edge("e1", "a", "b"),
                edge("e2", "b", "c"),
                edge("e3", "c", "a"),
            ],
        );
        let r = analyze_structure(&ir);

        assert!(r.is_dag);
        assert!(arcs_are_acyclic(&ir, &r));

        // Every edge is still present and accounted for — nothing was dropped.
        assert_eq!(r.roles.len(), 3);
        assert_eq!(r.reversed.len(), 3);

        let feedback: Vec<usize> = (0..3)
            .filter(|&i| r.roles[i] == EdgeRole::Feedback)
            .collect();
        assert_eq!(feedback.len(), 1);
        let f = feedback[0];
        assert!(r.reversed[f]);

        // The reversed edge presents flipped endpoints to every later phase...
        let (a, b) = r.arc(&ir, f as u32);
        assert_eq!((a, b), (ir.edges[f].target, ir.edges[f].source));
        // ...while the IR itself is untouched, so Phase 9 can flip the arrowhead back.
        assert_ne!(ir.edges[f].source, ir.edges[f].target);
    }

    #[test]
    fn no_edge_is_ever_labelled_cross() {
        let ir = ir_of(
            &["a", "b", "c"],
            vec![
                edge("e1", "a", "b"),
                edge("e2", "b", "c"),
                edge("e3", "c", "a"),
                edge("e4", "a", "c"),
            ],
        );
        let r = analyze_structure(&ir);
        assert!(r.roles.iter().all(|&role| role != EdgeRole::Cross));
    }

    #[test]
    fn self_loops_are_isolated_and_never_reversed() {
        let ir = ir_of(
            &["a", "b"],
            vec![edge("loop", "a", "a"), edge("e", "a", "b")],
        );
        let r = analyze_structure(&ir);
        assert_eq!(r.self_loops, vec![0]);
        assert_eq!(r.roles[0], EdgeRole::SelfLoop);
        assert!(!r.reversed[0]);
        assert_eq!(r.roles[1], EdgeRole::Forward);
        // A self-loop must not make the graph look cyclic.
        assert!(r.is_dag);
    }

    #[test]
    fn an_explicit_feedback_hint_is_honoured_without_a_cycle() {
        let mut e = edge("e1", "a", "b");
        e.layout_role = Some(EdgeLayoutHint::Feedback);
        let ir = ir_of(&["a", "b"], vec![e]);
        let r = analyze_structure(&ir);
        assert_eq!(r.roles[0], EdgeRole::Feedback);
        assert!(r.reversed[0]);
        assert_eq!(r.arc(&ir, 0), (1, 0));
        assert!(r.is_dag);
    }

    #[test]
    fn is_cycle_true_reverses_the_edge() {
        let mut e = edge("e1", "b", "a");
        e.is_cycle = Some(true);
        let ir = ir_of(&["a", "b"], vec![edge("e0", "a", "b"), e]);
        let r = analyze_structure(&ir);
        assert_eq!(r.roles[1], EdgeRole::Feedback);
        assert!(r.reversed[1]);
        assert!(r.is_dag);
    }

    #[test]
    fn an_explicit_cross_hint_is_treated_as_forward() {
        let mut e = edge("e1", "a", "b");
        e.layout_role = Some(EdgeLayoutHint::Cross);
        let ir = ir_of(&["a", "b"], vec![e]);
        let r = analyze_structure(&ir);
        assert_eq!(r.roles[0], EdgeRole::Forward);
        assert!(!r.reversed[0]);
    }

    #[test]
    fn an_explicit_forward_hint_survives_the_fas_pass() {
        // a→b is pinned Forward, so the FAS pass may only choose among the other two arcs.
        let mut pinned = edge("e1", "a", "b");
        pinned.layout_role = Some(EdgeLayoutHint::Forward);
        let ir = ir_of(
            &["a", "b", "c"],
            vec![pinned, edge("e2", "b", "c"), edge("e3", "c", "a")],
        );
        let r = analyze_structure(&ir);
        assert_eq!(r.roles[0], EdgeRole::Forward);
        assert!(!r.reversed[0]);
        assert!(r.is_dag);
        assert!(arcs_are_acyclic(&ir, &r));
    }

    #[test]
    fn the_safety_net_breaks_a_cycle_the_fas_pass_could_not_see() {
        // b→a is hinted Feedback, so it is reversed to a→b before the SCC pass and never enters
        // it. The remaining a→b arc plus the reversal forms no cycle, but a→b→a via e3 does:
        // e3 is the arc the SCC pass cannot reach because e1 was pinned out of the arc set.
        let mut hinted = edge("e1", "b", "a");
        hinted.layout_role = Some(EdgeLayoutHint::Feedback);
        let mut hinted2 = edge("e2", "b", "a");
        hinted2.layout_role = Some(EdgeLayoutHint::Forward);
        let ir = ir_of(&["a", "b"], vec![hinted, hinted2, edge("e3", "a", "b")]);
        let r = analyze_structure(&ir);

        // e2 (b→a, pinned forward) and e3 (a→b) close a 2-cycle that neither the hints nor the
        // SCC pass removed; the Kahn safety net has to catch it.
        assert!(r.is_dag);
        assert!(arcs_are_acyclic(&ir, &r));
        assert_eq!(r.roles.len(), 3);
    }

    #[test]
    fn every_cycle_in_a_dense_mesh_is_broken() {
        let ids: Vec<String> = (0..14).map(|i| format!("n{}", i)).collect();
        let refs: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();
        let mut edges = Vec::new();
        for i in 0..14u32 {
            edges.push(edge(
                &format!("r{}", i),
                &ids[i as usize],
                &ids[((i + 1) % 14) as usize],
            ));
            edges.push(edge(
                &format!("c{}", i),
                &ids[i as usize],
                &ids[((i + 5) % 14) as usize],
            ));
        }
        let ir = ir_of(&refs, edges);
        let r = analyze_structure(&ir);

        assert!(r.is_dag);
        assert!(arcs_are_acyclic(&ir, &r));
        assert_eq!(r.roles.len(), ir.edge_count());
        assert!(r.roles.contains(&EdgeRole::Feedback));
        // Reversal is the only repair: no edge may lose its slot.
        assert!(r
            .roles
            .iter()
            .all(|&role| role == EdgeRole::Forward || role == EdgeRole::Feedback));
    }

    #[test]
    fn two_independent_cycles_are_broken_independently() {
        let ir = ir_of(
            &["a", "b", "c", "d"],
            vec![
                edge("e1", "a", "b"),
                edge("e2", "b", "a"),
                edge("e3", "c", "d"),
                edge("e4", "d", "c"),
            ],
        );
        let r = analyze_structure(&ir);
        assert!(r.is_dag);
        assert_eq!(
            r.roles.iter().filter(|&&x| x == EdgeRole::Feedback).count(),
            2
        );
    }

    #[test]
    fn result_is_identical_across_runs() {
        let ids: Vec<String> = (0..20).map(|i| format!("n{}", i)).collect();
        let refs: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();
        let mut edges = Vec::new();
        for i in 0..20u32 {
            edges.push(edge(
                &format!("e{}", i),
                &ids[i as usize],
                &ids[((i * 7 + 3) % 20) as usize],
            ));
        }
        let ir = ir_of(&refs, edges);
        let a = analyze_structure(&ir);
        let b = analyze_structure(&ir);
        assert_eq!(a.roles, b.roles);
        assert_eq!(a.reversed, b.reversed);
        assert_eq!(a.self_loops, b.self_loops);
        assert_eq!(a.is_dag, b.is_dag);
    }
}
