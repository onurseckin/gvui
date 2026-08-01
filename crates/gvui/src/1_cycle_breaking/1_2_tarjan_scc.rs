use std::collections::{HashMap, HashSet};
use crate::step_0_common::types::{DetailedSCCResult, NormalizedGraph};

/// Detects strongly connected components (SCCs) using Tarjan's linear-time ($O(V + E)$) algorithm.
///
/// Mathematical and Algorithmic Mechanics:
/// - **Depth-First Traversal**: Assigns an increasing discovery index `indices[u]` to each node `u`.
/// - **Lowlink Invariant**: `lowlinks[u]` represents the smallest discovery index reachable from `u`
///   via a path of tree edges followed by at most one back-edge into the current active stack.
/// - **Stack Management**: Nodes are pushed onto `stack` and tracked in `on_stack` boolean set.
/// - **SCC Root Condition**: When `lowlinks[u] == indices[u]`, node `u` is the root of an SCC.
///   All nodes above `u` on the stack are popped to form the SCC subset.
/// - **Cyclic Component Detection**: An SCC is cyclic if it contains more than 1 node, or if it
///   consists of a single node containing a self-loop edge.
/// - **Condensation DAG**: Constructs directed condensation edges between distinct SCC components.
pub fn detect_strongly_connected_components(graph: &NormalizedGraph) -> DetailedSCCResult {
    struct TarjanContext<'a> {
        graph: &'a NormalizedGraph,
        index: usize,
        indices: HashMap<String, usize>,
        lowlinks: HashMap<String, usize>,
        stack: Vec<String>,
        on_stack: HashSet<String>,
        raw_components: Vec<Vec<String>>,
    }

    impl<'a> TarjanContext<'a> {
        fn strongconnect(&mut self, node_id: &str) {
            self.indices.insert(node_id.to_string(), self.index);
            self.lowlinks.insert(node_id.to_string(), self.index);
            self.index += 1;
            self.stack.push(node_id.to_string());
            self.on_stack.insert(node_id.to_string());

            let outgoing = self.graph.outgoing_map.get(node_id).cloned().unwrap_or_default();
            for edge in outgoing {
                let target_id = &edge.target;
                if !self.indices.contains_key(target_id) {
                    self.strongconnect(target_id);
                    let target_low = *self.lowlinks.get(target_id).unwrap_or(&usize::MAX);
                    let node_low = self.lowlinks.get_mut(node_id).unwrap();
                    *node_low = (*node_low).min(target_low);
                } else if self.on_stack.contains(target_id) {
                    let target_idx = *self.indices.get(target_id).unwrap_or(&usize::MAX);
                    let node_low = self.lowlinks.get_mut(node_id).unwrap();
                    *node_low = (*node_low).min(target_idx);
                }
            }

            if self.lowlinks.get(node_id) == self.indices.get(node_id) {
                let mut component = Vec::new();
                while let Some(top) = self.stack.pop() {
                    self.on_stack.remove(&top);
                    component.push(top.clone());
                    if top == node_id {
                        break;
                    }
                }
                component.sort();
                self.raw_components.push(component);
            }
        }
    }

    let mut ctx = TarjanContext {
        graph,
        index: 0,
        indices: HashMap::new(),
        lowlinks: HashMap::new(),
        stack: Vec::new(),
        on_stack: HashSet::new(),
        raw_components: Vec::new(),
    };

    for node in &graph.nodes {
        if !ctx.indices.contains_key(&node.id) {
            ctx.strongconnect(&node.id);
        }
    }

    let mut raw_components = ctx.raw_components;

    // Sort raw components by their first node ID for deterministic order
    raw_components.sort_by(|a, b| a[0].cmp(&b[0]));

    let mut component_by_node_id = HashMap::new();
    let mut cyclic_component_ids = HashSet::new();
    let mut condensation_outgoing: HashMap<String, HashSet<String>> = HashMap::new();

    // Identify self-loop nodes
    let mut self_loop_nodes = HashSet::new();
    for edge in &graph.edges {
        if edge.source == edge.target {
            self_loop_nodes.insert(edge.source.clone());
        }
    }

    for comp in &raw_components {
        let comp_id = comp.join(",");
        condensation_outgoing.insert(comp_id.clone(), HashSet::new());

        for node_id in comp {
            component_by_node_id.insert(node_id.clone(), comp_id.clone());
        }

        if comp.len() > 1 || (comp.len() == 1 && self_loop_nodes.contains(&comp[0])) {
            cyclic_component_ids.insert(comp_id);
        }
    }

    // Build condensation DAG adjacency between distinct SCCs
    for edge in &graph.edges {
        let src_comp = component_by_node_id.get(&edge.source).unwrap();
        let tgt_comp = component_by_node_id.get(&edge.target).unwrap();
        if src_comp != tgt_comp {
            if let Some(set) = condensation_outgoing.get_mut(src_comp) {
                set.insert(tgt_comp.clone());
            }
        }
    }

    DetailedSCCResult {
        components: raw_components,
        component_by_node_id,
        cyclic_component_ids,
        condensation_outgoing,
    }
}
