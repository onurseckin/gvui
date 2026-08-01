use std::collections::HashMap;
use crate::step_0_common::types::{EdgeRole, NormalizedGraph};

/// Verifies whether the remaining forward edges in the graph form a valid Directed Acyclic Graph (DAG) using Kahn's algorithm.
///
/// Theoretical Proof and Mechanics:
/// - **Topological Sort Invariant**: A directed graph is a DAG if and only if every vertex can be processed
///   in an order where all incoming edges originate from previously visited vertices.
/// - **Kahn's Queue Traversal**:
///   1. Calculate initial in-degrees of all nodes restricted strictly to `EdgeRole::Forward` edges.
///   2. Initialize a queue with all nodes having `in_degree == 0` (sorted deterministically by ID).
///   3. Repeatedly dequeue node `u`, count it as visited, and decrement in-degrees of successors.
///   4. When a successor's in-degree drops to zero, insert it into the queue.
/// - **Verdict**: If `visited_count == total_nodes`, all nodes were processed without encountering a cycle loop,
///   proving the graph is a valid DAG. Returns `true` if DAG, `false` if cyclic dependencies remain.
pub fn verify_dag_status(
    graph: &NormalizedGraph,
    edge_role_map: &HashMap<String, EdgeRole>,
) -> bool {
    let mut forward_in_degree: HashMap<String, usize> = HashMap::new();
    let mut forward_adj: HashMap<String, Vec<String>> = HashMap::new();

    for node in &graph.nodes {
        forward_in_degree.insert(node.id.clone(), 0);
        forward_adj.insert(node.id.clone(), Vec::new());
    }

    for edge in &graph.edges {
        if edge_role_map.get(&edge.id) == Some(&EdgeRole::Forward) {
            *forward_in_degree.get_mut(&edge.target).unwrap() += 1;
            forward_adj.get_mut(&edge.source).unwrap().push(edge.target.clone());
        }
    }

    let mut queue: Vec<String> = graph
        .nodes
        .iter()
        .map(|n| n.id.clone())
        .filter(|id| *forward_in_degree.get(id).unwrap_or(&0) == 0)
        .collect();
    queue.sort();

    let mut visited_count = 0;
    while !queue.is_empty() {
        let curr = queue.remove(0);
        visited_count += 1;

        let neighbors = forward_adj.get(&curr).cloned().unwrap_or_default();
        for neighbor in neighbors {
            let next_degree = forward_in_degree.get_mut(&neighbor).unwrap();
            *next_degree -= 1;
            if *next_degree == 0 {
                queue.push(neighbor);
                queue.sort();
            }
        }
    }

    visited_count == graph.nodes.len()
}
