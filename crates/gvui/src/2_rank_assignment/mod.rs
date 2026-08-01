#[path = "2_1_longest_path.rs"]
pub mod longest_path;

#[path = "2_2_network_simplex.rs"]
pub mod network_simplex;

#[path = "2_3_layer_graph_builder.rs"]
pub mod layer_graph_builder;

#[path = "2_4_rank_geometry.rs"]
pub mod rank_geometry;

pub use longest_path::assign_ranks_longest_path;
pub use network_simplex::{assign_ranks, run_network_simplex};
pub use layer_graph_builder::build_layer_graph;
pub use rank_geometry::{calculate_rank_bands, calculate_rank_heights};

/// Helper function to construct a `RankAssignmentResult` struct given node ranks.
pub(crate) fn build_result(
    nodes: &[crate::types::NormalizedNode],
    edges: &[crate::types::NormalizedEdge],
    node_rank_map: std::collections::HashMap<String, usize>,
) -> crate::types::RankAssignmentResult {
    let max_rank = node_rank_map.values().cloned().max().unwrap_or(0);

    let mut rank_nodes_map: std::collections::HashMap<usize, Vec<String>> = std::collections::HashMap::new();
    for r in 0..=max_rank {
        rank_nodes_map.insert(r, Vec::new());
    }

    for node in nodes {
        let rank = *node_rank_map.get(&node.id).unwrap_or(&0);
        rank_nodes_map.entry(rank).or_default().push(node.id.clone());
    }

    for (_, list) in rank_nodes_map.iter_mut() {
        list.sort();
    }

    let mut edge_rank_span_map: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for edge in edges {
        let src_rank = *node_rank_map.get(&edge.source).unwrap_or(&0);
        let tgt_rank = *node_rank_map.get(&edge.target).unwrap_or(&0);
        let span = tgt_rank.saturating_sub(src_rank);
        edge_rank_span_map.insert(edge.id.clone(), span);
    }

    crate::types::RankAssignmentResult {
        node_rank_map,
        rank_nodes_map,
        max_rank,
        edge_rank_span_map,
    }
}

#[cfg(test)]
#[path = "tests/spec_rank_assignment.rs"]
mod spec_rank_assignment;

#[cfg(test)]
#[path = "tests/spec_layer_graph.rs"]
mod spec_layer_graph;
