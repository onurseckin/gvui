use std::collections::HashMap;
use crate::step_0_common::types::{
    ClassifiedEdge, CycleBreakingResult, DetailedSCCResult, EdgeLayoutHint, EdgeRole,
    NormalizedEdge, NormalizedGraph, NormalizedNode,
};
use super::auto_cross_inference::infer_auto_cross_edges;
use super::eades_fas::run_eades_fas;
use super::graph_normalization::normalize_graph;
use super::kahn_dag_verifier::verify_dag_status;
use super::tarjan_scc::detect_strongly_connected_components;

/// Classifies graph edge roles and determines reversal state using full cycle breaking pipeline.
///
/// Pipeline Steps:
/// 1. Assign explicit roles with precedence: SelfLoop > Feedback > Cross > Forward.
/// 2. Break cycles in cyclic SCCs using Eades-Lin-Smyth greedy FAS algorithm for unclassified edges.
/// 3. Assign remaining unclassified edges to `EdgeRole::Forward`.
/// 4. Infer auto cross edges for same-rank lateral edges via ancestor/descendant graph queries.
/// 5. Verify DAG status via Kahn's topological sort algorithm.
pub fn classify_edge_roles(
    graph: &NormalizedGraph,
    scc_result: &DetailedSCCResult,
) -> CycleBreakingResult {
    let mut edge_role_map: HashMap<String, EdgeRole> = HashMap::new();
    let mut reversed_map: HashMap<String, bool> = HashMap::new();

    // 1. Process explicit roles according to role priority:
    // SelfLoop > Explicit Feedback > Explicit Cross > Explicit Forward
    for edge in &graph.edges {
        if edge.source == edge.target {
            edge_role_map.insert(edge.id.clone(), EdgeRole::SelfLoop);
            reversed_map.insert(edge.id.clone(), false);
        } else if edge.is_cycle == Some(true) || edge.layout_role == Some(EdgeLayoutHint::Feedback) {
            edge_role_map.insert(edge.id.clone(), EdgeRole::Feedback);
            reversed_map.insert(edge.id.clone(), true);
        } else if edge.layout_role == Some(EdgeLayoutHint::Cross) {
            edge_role_map.insert(edge.id.clone(), EdgeRole::Cross);
            reversed_map.insert(edge.id.clone(), false);
        } else if edge.layout_role == Some(EdgeLayoutHint::Forward) {
            edge_role_map.insert(edge.id.clone(), EdgeRole::Forward);
            reversed_map.insert(edge.id.clone(), false);
        }
    }

    // 2. Break cycles in cyclic SCCs using Eades heuristic for unclassified (auto) edges
    for comp_nodes in &scc_result.components {
        let comp_id = comp_nodes.join(",");
        if !scc_result.cyclic_component_ids.contains(&comp_id) || comp_nodes.len() <= 1 {
            continue;
        }

        let nodes_in_scc: std::collections::HashSet<String> = comp_nodes.iter().cloned().collect();
        let scc_edges: Vec<_> = graph
            .edges
            .iter()
            .filter(|e| {
                nodes_in_scc.contains(&e.source)
                    && nodes_in_scc.contains(&e.target)
                    && e.source != e.target
                    && !edge_role_map.contains_key(&e.id)
            })
            .cloned()
            .collect();

        run_eades_fas(comp_nodes, &scc_edges, &mut edge_role_map, &mut reversed_map);
    }

    // 3. Mark remaining unclassified edges as forward (initially)
    for edge in &graph.edges {
        if !edge_role_map.contains_key(&edge.id) {
            edge_role_map.insert(edge.id.clone(), EdgeRole::Forward);
            reversed_map.insert(edge.id.clone(), false);
        }
    }

    // 4. Infer auto cross edges for auto DAG edges
    infer_auto_cross_edges(graph, &mut edge_role_map, &mut reversed_map);

    // 5. Verify DAG condition using Kahn's algorithm on remaining forward edges
    let is_dag = verify_dag_status(graph, &edge_role_map);

    let classified_edges: Vec<ClassifiedEdge> = graph
        .edges
        .iter()
        .map(|edge| ClassifiedEdge {
            edge: edge.clone(),
            role: edge_role_map.get(&edge.id).copied().unwrap_or(EdgeRole::Forward),
            reversed: reversed_map.get(&edge.id).copied().unwrap_or(false),
        })
        .collect();

    let feedback_edge_ids: Vec<String> = classified_edges
        .iter()
        .filter(|e| e.role == EdgeRole::Feedback)
        .map(|e| e.edge.id.clone())
        .collect();

    CycleBreakingResult {
        classified_edges,
        edge_role_map,
        feedback_edge_ids,
        is_dag,
    }
}

/// Orchestrator function to break cycles in a directed graph.
/// Performs normalization, Tarjan SCC analysis, Eades feedback arc set breaking, and edge classification.
pub fn break_cycles(nodes: &[NormalizedNode], edges: &[NormalizedEdge]) -> Vec<ClassifiedEdge> {
    let normalized = match normalize_graph(nodes, edges) {
        Ok(res) => res,
        Err(_) => {
            return edges
                .iter()
                .map(|e| ClassifiedEdge {
                    edge: e.clone(),
                    role: EdgeRole::Forward,
                    reversed: false,
                })
                .collect();
        }
    };
    let scc = detect_strongly_connected_components(&normalized);
    let result = classify_edge_roles(&normalized, &scc);
    result.classified_edges
}
