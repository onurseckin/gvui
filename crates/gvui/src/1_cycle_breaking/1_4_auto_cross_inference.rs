use std::collections::{HashMap, HashSet, VecDeque};
use crate::step_0_common::types::{EdgeLayoutHint, EdgeRole, NormalizedGraph};

/// Computes temporary longest-path ranks over active forward edges in the DAG.
fn compute_temp_ranks(
    active_edges: &HashSet<String>,
    graph: &NormalizedGraph,
) -> HashMap<String, usize> {
    let mut in_deg: HashMap<String, usize> = HashMap::new();
    let mut preds_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut succs_map: HashMap<String, Vec<String>> = HashMap::new();

    for node in &graph.nodes {
        in_deg.insert(node.id.clone(), 0);
        preds_map.insert(node.id.clone(), Vec::new());
        succs_map.insert(node.id.clone(), Vec::new());
    }

    for edge in &graph.edges {
        if active_edges.contains(&edge.id) {
            *in_deg.get_mut(&edge.target).unwrap() += 1;
            preds_map.get_mut(&edge.target).unwrap().push(edge.source.clone());
            succs_map.get_mut(&edge.source).unwrap().push(edge.target.clone());
        }
    }

    let mut q: Vec<String> = graph
        .nodes
        .iter()
        .map(|n| n.id.clone())
        .filter(|id| *in_deg.get(id).unwrap_or(&0) == 0)
        .collect();
    q.sort();

    let mut topo: Vec<String> = Vec::new();
    while !q.is_empty() {
        let curr = q.remove(0);
        topo.push(curr.clone());

        let mut succs = succs_map.get(&curr).cloned().unwrap_or_default();
        succs.sort();
        for s in succs {
            let next_deg = in_deg.get_mut(&s).unwrap();
            *next_deg -= 1;
            if *next_deg == 0 {
                q.push(s);
                q.sort();
            }
        }
    }

    let mut node_rank: HashMap<String, usize> = HashMap::new();
    for id in topo {
        let preds = preds_map.get(&id).unwrap();
        if preds.is_empty() {
            node_rank.insert(id, 0);
        } else {
            let mut max_pred = 0;
            for p in preds {
                if let Some(&r) = node_rank.get(p) {
                    max_pred = max_pred.max(r);
                }
            }
            node_rank.insert(id, max_pred + 1);
        }
    }

    node_rank
}

/// Retrieves all ancestor node IDs reachable upstream from `target_id` using BFS traversal over active forward edges.
pub fn get_ancestors(
    target_id: &str,
    active_edges: &HashSet<String>,
    graph: &NormalizedGraph,
) -> HashSet<String> {
    let mut ancestors = HashSet::new();
    let mut q = VecDeque::new();
    q.push_back(target_id.to_string());

    while let Some(curr) = q.pop_front() {
        for edge in &graph.edges {
            if active_edges.contains(&edge.id)
                && edge.target == curr
                && !ancestors.contains(&edge.source)
            {
                ancestors.insert(edge.source.clone());
                q.push_back(edge.source.clone());
            }
        }
    }
    ancestors
}

/// Retrieves all descendant node IDs reachable downstream from `source_id` using BFS traversal over active forward edges.
pub fn get_descendants(
    source_id: &str,
    active_edges: &HashSet<String>,
    graph: &NormalizedGraph,
) -> HashSet<String> {
    let mut descendants = HashSet::new();
    let mut q = VecDeque::new();
    q.push_back(source_id.to_string());

    while let Some(curr) = q.pop_front() {
        for edge in &graph.edges {
            if active_edges.contains(&edge.id)
                && edge.source == curr
                && !descendants.contains(&edge.target)
            {
                descendants.insert(edge.target.clone());
                q.push_back(edge.target.clone());
            }
        }
    }
    descendants
}

/// Evaluates unclassified `Auto` candidate edges to infer whether they should be reclassified as `EdgeRole::Cross`.
///
/// Algorithmic Rationale:
/// - Candidate selection: Edges with auto layout hints, not flagged as cycle, connecting distinct source/target nodes,
///   currently assigned as `EdgeRole::Forward`.
/// - Evaluation Procedure:
///   1. Temporarily remove candidate edge $e = (u, v)$ from the set of active forward edges.
///   2. Recompute topological rank levels for $u$ and $v$.
///   3. If $rank(u) == rank(v)$ and $v$ has existing incoming edges in the DAG, inspect ancestor and descendant sets.
///   4. If $u$ and $v$ share a common ancestor or common descendant (excluding $u$ and $v$), edge $(u, v)$ represents
///      a lateral cross connection within the same hierarchy layer rather than a downward flow edge.
///   5. Reclassify $(u, v)$ as `EdgeRole::Cross` (`reversed = false`).
pub fn infer_auto_cross_edges(
    graph: &NormalizedGraph,
    edge_role_map: &mut HashMap<String, EdgeRole>,
    reversed_map: &mut HashMap<String, bool>,
) {
    let mut auto_candidates: Vec<_> = graph
        .edges
        .iter()
        .filter(|e| {
            (e.layout_role.is_none() || e.layout_role == Some(EdgeLayoutHint::Auto))
                && !e.is_cycle.unwrap_or(false)
                && e.source != e.target
                && edge_role_map.get(&e.id) == Some(&EdgeRole::Forward)
        })
        .cloned()
        .collect();

    auto_candidates.sort_by(|a, b| a.id.cmp(&b.id));

    let mut active_forward_set: HashSet<String> = HashSet::new();
    for edge in &graph.edges {
        if edge_role_map.get(&edge.id) == Some(&EdgeRole::Forward) {
            active_forward_set.insert(edge.id.clone());
        }
    }

    for candidate in auto_candidates {
        let u = candidate.source.clone();
        let v = candidate.target.clone();

        active_forward_set.remove(&candidate.id);

        let temp_ranks = compute_temp_ranks(&active_forward_set, graph);
        let rank_u = temp_ranks.get(&u);
        let rank_v = temp_ranks.get(&v);

        let in_deg_v = graph
            .edges
            .iter()
            .filter(|e| active_forward_set.contains(&e.id) && e.target == v)
            .count();

        if in_deg_v > 0 && rank_u.is_some() && rank_v.is_some() && rank_u == rank_v {
            let ancestors_u = get_ancestors(&u, &active_forward_set, graph);
            let ancestors_v = get_ancestors(&v, &active_forward_set, graph);
            let descendants_u = get_descendants(&u, &active_forward_set, graph);
            let descendants_v = get_descendants(&v, &active_forward_set, graph);

            let mut share_alt_pred = false;
            for p in &ancestors_u {
                if p != &u && p != &v && ancestors_v.contains(p) {
                    share_alt_pred = true;
                    break;
                }
            }

            let mut share_alt_succ = false;
            for s in &descendants_u {
                if s != &u && s != &v && descendants_v.contains(s) {
                    share_alt_succ = true;
                    break;
                }
            }

            if share_alt_pred || share_alt_succ {
                edge_role_map.insert(candidate.id.clone(), EdgeRole::Cross);
                reversed_map.insert(candidate.id.clone(), false);
                continue;
            }
        }

        active_forward_set.insert(candidate.id.clone());
    }
}
