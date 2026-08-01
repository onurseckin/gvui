use std::collections::{HashMap, HashSet};
use crate::step_0_common::types::{EdgeRole, NormalizedEdge};

/// Executes the Eades-Lin-Smyth (1993) greedy feedback arc set heuristic on a cyclic SCC component.
///
/// Theoretical Framework:
/// - A Feedback Arc Set (FAS) is a subset of directed edges whose removal makes the graph acyclic.
/// - Finding the minimum FAS is NP-hard. Eades et al. provided a fast $O(V + E)$ greedy heuristic
///   that constructs a linear ordering of nodes ($v_1, v_2, \dots, v_n$).
/// - An edge $(u, v)$ is a **forward edge** if $pos(u) < pos(v)$, and a **feedback edge** if $pos(u) > pos(v)$.
/// - Algorithm Mechanics:
///   1. **Sink Elimination**: If a node has `out_degree == 0`, remove it and place it at the front of `right_list`.
///   2. **Source Elimination**: If a node has `in_degree == 0`, remove it and place at the back of `left_list`.
///   3. **Max Delta Selection**: If no sources or sinks exist, pick node maximizing $(out\_degree - in\_degree)$,
///      place it at the back of `left_list`, and update degrees of adjacent active nodes.
///   4. Concatenate `[left_list..., right_list...]` to produce the full topological sequence.
pub fn run_eades_fas(
    comp_nodes: &[String],
    scc_edges: &[NormalizedEdge],
    edge_role_map: &mut HashMap<String, EdgeRole>,
    reversed_map: &mut HashMap<String, bool>,
) {
    let mut in_degree: HashMap<String, usize> = HashMap::new();
    let mut out_degree: HashMap<String, usize> = HashMap::new();
    let mut out_edges: HashMap<String, Vec<String>> = HashMap::new();
    let mut in_edges: HashMap<String, Vec<String>> = HashMap::new();

    for node in comp_nodes {
        in_degree.insert(node.clone(), 0);
        out_degree.insert(node.clone(), 0);
        out_edges.insert(node.clone(), Vec::new());
        in_edges.insert(node.clone(), Vec::new());
    }

    for edge in scc_edges {
        *out_degree.get_mut(&edge.source).unwrap() += 1;
        *in_degree.get_mut(&edge.target).unwrap() += 1;
        out_edges.get_mut(&edge.source).unwrap().push(edge.target.clone());
        in_edges.get_mut(&edge.target).unwrap().push(edge.source.clone());
    }

    let mut active_nodes: HashSet<String> = comp_nodes.iter().cloned().collect();
    let mut left_list: Vec<String> = Vec::new();
    let mut right_list: Vec<String> = Vec::new();

    while !active_nodes.is_empty() {
        // 1. Find sinks (out_degree == 0)
        let mut sinks: Vec<String> = active_nodes
            .iter()
            .filter(|n| *out_degree.get(*n).unwrap_or(&0) == 0)
            .cloned()
            .collect();
        sinks.sort();

        if let Some(sink) = sinks.into_iter().next() {
            active_nodes.remove(&sink);
            right_list.insert(0, sink.clone());
            if let Some(preds) = in_edges.get(&sink) {
                for u in preds {
                    if active_nodes.contains(u) {
                        if let Some(deg) = out_degree.get_mut(u) {
                            *deg = deg.saturating_sub(1);
                        }
                    }
                }
            }
            continue;
        }

        // 2. Find sources (in_degree == 0)
        let mut sources: Vec<String> = active_nodes
            .iter()
            .filter(|n| *in_degree.get(*n).unwrap_or(&0) == 0)
            .cloned()
            .collect();
        sources.sort();

        if let Some(source) = sources.into_iter().next() {
            active_nodes.remove(&source);
            left_list.push(source.clone());
            if let Some(succs) = out_edges.get(&source) {
                for v in succs {
                    if active_nodes.contains(v) {
                        if let Some(deg) = in_degree.get_mut(v) {
                            *deg = deg.saturating_sub(1);
                        }
                    }
                }
            }
            continue;
        }

        // 3. Find node maximizing (out_degree - in_degree), tie-break deterministically by node ID
        let mut candidates: Vec<String> = active_nodes.iter().cloned().collect();
        candidates.sort_by(|a, b| {
            let score_a = (*out_degree.get(a).unwrap_or(&0) as i64)
                - (*in_degree.get(a).unwrap_or(&0) as i64);
            let score_b = (*out_degree.get(b).unwrap_or(&0) as i64)
                - (*in_degree.get(b).unwrap_or(&0) as i64);
            if score_b != score_a {
                score_b.cmp(&score_a)
            } else {
                a.cmp(b)
            }
        });

        let best_node = candidates[0].clone();
        active_nodes.remove(&best_node);
        left_list.push(best_node.clone());

        if let Some(succs) = out_edges.get(&best_node) {
            for v in succs {
                if active_nodes.contains(v) {
                    if let Some(deg) = in_degree.get_mut(v) {
                        *deg = deg.saturating_sub(1);
                    }
                }
            }
        }
        if let Some(preds) = in_edges.get(&best_node) {
            for u in preds {
                if active_nodes.contains(u) {
                    if let Some(deg) = out_degree.get_mut(u) {
                        *deg = deg.saturating_sub(1);
                    }
                }
            }
        }
    }

    let mut scc_order = left_list;
    scc_order.extend(right_list);

    let pos_map: HashMap<String, usize> = scc_order
        .into_iter()
        .enumerate()
        .map(|(idx, node_id)| (node_id, idx))
        .collect();

    for edge in scc_edges {
        if edge_role_map.contains_key(&edge.id) {
            continue;
        }

        let src_pos = pos_map[&edge.source];
        let tgt_pos = pos_map[&edge.target];

        if src_pos < tgt_pos {
            edge_role_map.insert(edge.id.clone(), EdgeRole::Forward);
            reversed_map.insert(edge.id.clone(), false);
        } else {
            edge_role_map.insert(edge.id.clone(), EdgeRole::Feedback);
            reversed_map.insert(edge.id.clone(), true);
        }
    }
}
