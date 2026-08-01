use std::collections::HashMap;
use crate::types::{
    EdgeRole, ExpandedLayerGraph, LayerNode, NormalizedEdge, NormalizedNode, RankAssignmentResult,
};

/// Builds an expanded layer graph with virtual dummy node insertion for multi-rank edge spans.
///
/// # Multi-Rank Edge Expansion & Virtual Dummy Node Generation
/// When an edge $(u, v)$ spans across more than one rank (i.e. $\text{rank}(v) - \text{rank}(u) = \Delta > 1$),
/// straight or orthogonal routing through intermediate layers requires dummy nodes at each intervening rank.
///
/// ## Virtual Node Properties & Naming Convention
/// 1. **Naming Schema**:
///    Every virtual node created for edge `edge_id` at intermediate rank `r` (where $\text{rank}(u) < r < \text{rank}(v)$)
///    is assigned a unique, deterministic ID following the format:
///    $$\text{virtual\_\_}\{edge\_id\}\text{\_\_rank\_}\{r\}$$
/// 2. **Structural Attributes**:
///    - `is_virtual`: Set to `true`.
///    - `original_node_id`: Set to `None`.
///    - `source_edge_id`: Set to `Some(edge.id.clone())`.
///    - `width` & `height`: Set to `0.0` (zero dimension so layout geometry calculation is unperturbed).
/// 3. **Graph Topology Rewiring**:
///    The original edge $u \to v$ is replaced by a chain of unit-rank edges:
///    $$u \to \text{virtual\_\_}\{edge\_id\}\text{\_\_rank\_}\{src+1\} \to \dots \to \text{virtual\_\_}\{edge\_id\}\text{\_\_rank\_}\{tgt-1\} \to v$$
///    These connections are recorded in `predecessors_map` and `successors_map`.
pub fn build_layer_graph(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    edge_role_map: Option<&HashMap<String, EdgeRole>>,
    rank_assignment: &RankAssignmentResult,
) -> ExpandedLayerGraph {
    let mut item_map: HashMap<String, LayerNode> = HashMap::new();
    let mut real_nodes: Vec<LayerNode> = Vec::new();
    let mut virtual_nodes: Vec<LayerNode> = Vec::new();

    let mut layers: Vec<Vec<LayerNode>> = Vec::new();
    for _ in 0..=rank_assignment.max_rank {
        layers.push(Vec::new());
    }

    // 1. Create real LayerNodes
    for node in nodes {
        let rank = *rank_assignment.node_rank_map.get(&node.id).unwrap_or(&0);
        let item = LayerNode {
            id: node.id.clone(),
            is_virtual: false,
            original_node_id: Some(node.id.clone()),
            source_edge_id: None,
            rank,
            width: node.width,
            height: node.height,
            x: None,
            y: None,
        };
        item_map.insert(node.id.clone(), item.clone());
        real_nodes.push(item.clone());
        if rank < layers.len() {
            layers[rank].push(item);
        }
    }

    let mut predecessors_map: HashMap<String, Vec<String>> = HashMap::new();
    let mut successors_map: HashMap<String, Vec<String>> = HashMap::new();

    let mut add_edge = |u: &str, v: &str| {
        successors_map.entry(u.to_string()).or_default().push(v.to_string());
        predecessors_map.entry(v.to_string()).or_default().push(u.to_string());
    };

    // 2. Process forward edges to expand multi-rank edge spans with virtual dummy nodes
    for edge in edges {
        let is_forward = match edge_role_map {
            Some(map) => map.get(&edge.id) == Some(&EdgeRole::Forward),
            None => !edge.is_cycle.unwrap_or(false) && edge.source != edge.target,
        };
        if !is_forward {
            continue;
        }

        let src_rank = *rank_assignment.node_rank_map.get(&edge.source).unwrap_or(&0);
        let tgt_rank = *rank_assignment.node_rank_map.get(&edge.target).unwrap_or(&0);

        if tgt_rank <= src_rank + 1 {
            add_edge(&edge.source, &edge.target);
        } else {
            let mut prev_id = edge.source.clone();
            for r in (src_rank + 1)..tgt_rank {
                let v_id = format!("virtual__{}__rank_{}", edge.id, r);
                if !item_map.contains_key(&v_id) {
                    let v_item = LayerNode {
                        id: v_id.clone(),
                        is_virtual: true,
                        original_node_id: None,
                        source_edge_id: Some(edge.id.clone()),
                        rank: r,
                        width: 0.0,
                        height: 0.0,
                        x: None,
                        y: None,
                    };
                    item_map.insert(v_id.clone(), v_item.clone());
                    virtual_nodes.push(v_item.clone());
                    if r < layers.len() {
                        layers[r].push(v_item);
                    }
                }
                add_edge(&prev_id, &v_id);
                prev_id = v_id;
            }
            add_edge(&prev_id, &edge.target);
        }
    }

    // 3. Sort items in each layer deterministically by ID initially
    for layer in &mut layers {
        layer.sort_by(|a, b| a.id.cmp(&b.id));
    }

    ExpandedLayerGraph {
        layers,
        real_nodes,
        virtual_nodes,
        item_map,
        predecessors_map,
        successors_map,
    }
}
