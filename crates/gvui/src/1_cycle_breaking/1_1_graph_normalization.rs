use std::collections::{HashMap, HashSet, VecDeque};
use std::fmt;
use crate::step_0_common::types::{
    EdgeLayoutHint, NormalizedEdge, NormalizedGraph, NormalizedGraphResult, NormalizedNode,
};

/// Errors encountered during input graph normalization and validation.
#[derive(Debug, Clone, PartialEq)]
pub enum LayoutInputError {
    /// A node was provided with an empty string ID.
    EmptyNodeId,
    /// Two nodes share the same identifier.
    DuplicateNodeId(String),
    /// A node has non-positive or non-finite width or height dimensions.
    InvalidNodeDimensions { id: String, width: f64, height: f64 },
    /// An edge was provided with an empty string ID.
    EmptyEdgeId,
    /// Two edges share the same identifier.
    DuplicateEdgeId(String),
    /// An edge references a source node ID that does not exist in the graph.
    MissingSourceNode { edge_id: String, source_id: String },
    /// An edge references a target node ID that does not exist in the graph.
    MissingTargetNode { edge_id: String, target_id: String },
    /// An edge specifies an invalid layout role hint string.
    InvalidLayoutRole { edge_id: String, role: String },
}

impl fmt::Display for LayoutInputError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            LayoutInputError::EmptyNodeId => write!(f, "Node ID cannot be empty"),
            LayoutInputError::DuplicateNodeId(id) => write!(f, "Duplicate node ID '{}' found", id),
            LayoutInputError::InvalidNodeDimensions { id, width, height } => {
                write!(
                    f,
                    "Node '{}' must have positive finite width and height, got ({}, {})",
                    id, width, height
                )
            }
            LayoutInputError::EmptyEdgeId => write!(f, "Edge ID cannot be empty"),
            LayoutInputError::DuplicateEdgeId(id) => write!(f, "Duplicate edge ID '{}' found", id),
            LayoutInputError::MissingSourceNode { edge_id, source_id } => write!(
                f,
                "Edge '{}' references missing source node '{}'",
                edge_id, source_id
            ),
            LayoutInputError::MissingTargetNode { edge_id, target_id } => write!(
                f,
                "Edge '{}' references missing target node '{}'",
                edge_id, target_id
            ),
            LayoutInputError::InvalidLayoutRole { edge_id, role } => write!(
                f,
                "Edge '{}' has invalid layoutRole '{}'",
                edge_id, role
            ),
        }
    }
}

impl std::error::Error for LayoutInputError {}

/// Normalizes and validates input nodes and edges for directed graph layout.
///
/// Architectural Responsibilities:
/// 1. Validates node/edge uniqueness, non-empty IDs, finite positive dimensions, and node endpoint existence.
/// 2. Deterministically sorts nodes and edges by identifier to guarantee reproducible layout outputs.
/// 3. Builds incoming and outgoing adjacency maps indexed by node ID.
/// 4. Partitions the graph into weakly-connected components via undirected BFS/DFS traversal.
pub fn normalize_graph(
    input_nodes: &[NormalizedNode],
    input_edges: &[NormalizedEdge],
) -> Result<NormalizedGraphResult, LayoutInputError> {
    let mut node_map = HashMap::new();
    let mut edge_map = HashMap::new();

    // 1. Validate nodes
    for node in input_nodes {
        if node.id.trim().is_empty() {
            return Err(LayoutInputError::EmptyNodeId);
        }
        if node_map.contains_key(&node.id) {
            return Err(LayoutInputError::DuplicateNodeId(node.id.clone()));
        }
        if node.width <= 0.0
            || !node.width.is_finite()
            || node.height <= 0.0
            || !node.height.is_finite()
        {
            return Err(LayoutInputError::InvalidNodeDimensions {
                id: node.id.clone(),
                width: node.width,
                height: node.height,
            });
        }
        node_map.insert(node.id.clone(), node.clone());
    }

    // 2. Validate edges
    for edge in input_edges {
        if edge.id.trim().is_empty() {
            return Err(LayoutInputError::EmptyEdgeId);
        }
        if edge_map.contains_key(&edge.id) {
            return Err(LayoutInputError::DuplicateEdgeId(edge.id.clone()));
        }
        if !node_map.contains_key(&edge.source) {
            return Err(LayoutInputError::MissingSourceNode {
                edge_id: edge.id.clone(),
                source_id: edge.source.clone(),
            });
        }
        if !node_map.contains_key(&edge.target) {
            return Err(LayoutInputError::MissingTargetNode {
                edge_id: edge.id.clone(),
                target_id: edge.target.clone(),
            });
        }
        let layout_role = edge.layout_role.unwrap_or(EdgeLayoutHint::Auto);
        let mut edge_copy = edge.clone();
        edge_copy.layout_role = Some(layout_role);
        edge_map.insert(edge.id.clone(), edge_copy);
    }

    // 3. Sort nodes and edges deterministically by ID
    let mut sorted_nodes: Vec<NormalizedNode> = node_map.values().cloned().collect();
    sorted_nodes.sort_by(|a, b| a.id.cmp(&b.id));

    let mut sorted_edges: Vec<NormalizedEdge> = edge_map.values().cloned().collect();
    sorted_edges.sort_by(|a, b| a.id.cmp(&b.id));

    // 4. Build incoming/outgoing adjacency maps
    let mut outgoing_map: HashMap<String, Vec<NormalizedEdge>> = HashMap::new();
    let mut incoming_map: HashMap<String, Vec<NormalizedEdge>> = HashMap::new();

    for node in &sorted_nodes {
        outgoing_map.insert(node.id.clone(), Vec::new());
        incoming_map.insert(node.id.clone(), Vec::new());
    }

    for edge in &sorted_edges {
        if let Some(list) = outgoing_map.get_mut(&edge.source) {
            list.push(edge.clone());
        }
        if let Some(list) = incoming_map.get_mut(&edge.target) {
            list.push(edge.clone());
        }
    }

    // Sort adjacency lists by edge ID for deterministic iteration order
    for node in &sorted_nodes {
        if let Some(list) = outgoing_map.get_mut(&node.id) {
            list.sort_by(|a, b| a.id.cmp(&b.id));
        }
        if let Some(list) = incoming_map.get_mut(&node.id) {
            list.sort_by(|a, b| a.id.cmp(&b.id));
        }
    }

    // 5. Build weakly-connected components using undirected BFS/DFS
    let mut undirected_adj: HashMap<String, HashSet<String>> = HashMap::new();
    for node in &sorted_nodes {
        undirected_adj.insert(node.id.clone(), HashSet::new());
    }
    for edge in &sorted_edges {
        undirected_adj
            .entry(edge.source.clone())
            .or_default()
            .insert(edge.target.clone());
        undirected_adj
            .entry(edge.target.clone())
            .or_default()
            .insert(edge.source.clone());
    }

    let mut visited: HashSet<String> = HashSet::new();
    let mut components: Vec<Vec<String>> = Vec::new();

    for node in &sorted_nodes {
        if visited.contains(&node.id) {
            continue;
        }

        let mut component = Vec::new();
        let mut queue = VecDeque::new();
        queue.push_back(node.id.clone());
        visited.insert(node.id.clone());

        while let Some(curr) = queue.pop_front() {
            component.push(curr.clone());

            let mut neighbors: Vec<String> = undirected_adj
                .get(&curr)
                .map(|s| s.iter().cloned().collect())
                .unwrap_or_default();
            neighbors.sort();

            for n in neighbors {
                if !visited.contains(&n) {
                    visited.insert(n.clone());
                    queue.push_back(n);
                }
            }
        }

        component.sort();
        components.push(component);
    }

    // Sort components by their smallest node ID for deterministic output order
    components.sort_by(|a, b| a[0].cmp(&b[0]));

    let graph = NormalizedGraph {
        nodes: sorted_nodes,
        edges: sorted_edges,
        node_map,
        edge_map,
        outgoing_map,
        incoming_map,
    };

    Ok(NormalizedGraphResult { graph, components })
}
