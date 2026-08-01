use std::collections::HashMap;
use crate::types::{EdgeRole, NormalizedEdge, NormalizedNode, RankAssignmentResult};
use super::build_result;

/// Longest-path rank assignment algorithm using Kahn's topological sorting.
///
/// # Algorithm Details & Mathematical Foundation
/// 1. **Graph Filtering**: Forward edges are identified either by explicit `EdgeRole::Forward` in
///    `edge_role_map` or by excluding cyclic edges (`is_cycle != Some(true)`) and self-loops.
/// 2. **Kahn's Topological Sort**:
///    - In-degrees of forward edges are computed for all nodes.
///    - Nodes with in-degree 0 are pushed to a priority queue (sorted lexicographically for determinism).
///    - Vertices are popped from the queue, appended to `topo_order`, and their outgoing neighbors'
///      in-degrees are decremented. Neighbors reaching 0 in-degree are added to the queue.
/// 3. **Longest-Path Rank Assignment**:
///    - Iterating through `topo_order`, node ranks are calculated via dynamic programming:
///      $$\text{rank}(v) = \begin{cases} 0 & \text{if } \text{Pred}(v) = \emptyset \\ \max_{u \in \text{Pred}(v)} (\text{rank}(u)) + 1 & \text{otherwise} \end{cases}$$
///    - This guarantees that for every directed forward edge $(u, v)$, $\text{rank}(v) \ge \text{rank}(u) + 1$,
///      yielding a valid, minimal-depth feasible ranking.
pub fn assign_ranks_longest_path(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    edge_role_map: Option<&HashMap<String, EdgeRole>>,
) -> RankAssignmentResult {
    let mut forward_in_degree: HashMap<String, usize> = HashMap::new();
    let mut forward_predecessors: HashMap<String, Vec<String>> = HashMap::new();
    let mut forward_successors: HashMap<String, Vec<String>> = HashMap::new();

    for node in nodes {
        forward_in_degree.insert(node.id.clone(), 0);
        forward_predecessors.insert(node.id.clone(), Vec::new());
        forward_successors.insert(node.id.clone(), Vec::new());
    }

    for edge in edges {
        let is_forward = match edge_role_map {
            Some(map) => map.get(&edge.id) == Some(&EdgeRole::Forward),
            None => !edge.is_cycle.unwrap_or(false) && edge.source != edge.target,
        };
        if is_forward {
            *forward_in_degree.entry(edge.target.clone()).or_insert(0) += 1;
            forward_predecessors
                .entry(edge.target.clone())
                .or_default()
                .push(edge.source.clone());
            forward_successors
                .entry(edge.source.clone())
                .or_default()
                .push(edge.target.clone());
        }
    }

    // Topological sort via Kahn's algorithm with deterministic sorting
    let mut queue: Vec<String> = nodes
        .iter()
        .map(|n| n.id.clone())
        .filter(|id| *forward_in_degree.get(id).unwrap_or(&0) == 0)
        .collect();
    queue.sort();

    let mut topo_order: Vec<String> = Vec::new();

    while !queue.is_empty() {
        let curr = queue.remove(0);
        topo_order.push(curr.clone());

        let mut successors = forward_successors.get(&curr).cloned().unwrap_or_default();
        successors.sort();

        for succ in successors {
            let next_degree = forward_in_degree
                .get(&succ)
                .cloned()
                .unwrap_or(0)
                .saturating_sub(1);
            forward_in_degree.insert(succ.clone(), next_degree);
            if next_degree == 0 {
                queue.push(succ);
                queue.sort();
            }
        }
    }

    // Longest path rank assignment recurrence
    let mut node_rank_map: HashMap<String, usize> = HashMap::new();

    for node_id in &topo_order {
        let preds = forward_predecessors.get(node_id).cloned().unwrap_or_default();
        if preds.is_empty() {
            node_rank_map.insert(node_id.clone(), 0);
        } else {
            let mut max_pred_rank = 0;
            for p in &preds {
                let r = *node_rank_map.get(p).unwrap_or(&0);
                if r > max_pred_rank {
                    max_pred_rank = r;
                }
            }
            let rank = max_pred_rank + 1;
            node_rank_map.insert(node_id.clone(), rank);
        }
    }

    // Ensure all input nodes (including unvisited disconnected ones) are assigned a rank
    for node in nodes {
        node_rank_map.entry(node.id.clone()).or_insert(0);
    }

    build_result(nodes, edges, node_rank_map)
}
