//! # Step 1.2 (Phase 2): Tarjan strongly connected components
//!
//! Linear-time SCC decomposition over dense `u32` indices. Phase 2 uses it to find the *only*
//! places a feedback arc set is needed: a trivial (acyclic) component can never contain a cycle,
//! so running the FAS heuristic over it would be wasted work and could only make the drawing
//! worse by reversing an edge that was already fine.
//!
//! The traversal is explicitly stacked rather than recursive. A deep chain in a 2,000-node graph
//! would otherwise blow the (small) wasm stack, and a stack overflow in wasm is an unrecoverable
//! trap, not a caught panic.

use crate::types::Csr;

/// Sentinel for "not yet visited" in the discovery-index array.
const UNVISITED: u32 = u32::MAX;

/// Result of an SCC decomposition. Every field is indexed consistently: `comp_of[n]` is a valid
/// index into both `components` and `cyclic`.
pub struct SccResult {
    /// Component index per node.
    pub comp_of: Vec<u32>,
    /// Node indices per component, each sorted ascending; components ordered by their min node.
    pub components: Vec<Vec<u32>>,
    /// True when the component has >1 node, or 1 node with a self-loop.
    pub cyclic: Vec<bool>,
}

impl SccResult {
    /// Number of components found. Equals `node_count` when the graph has no edges.
    #[inline]
    pub fn component_count(&self) -> usize {
        self.components.len()
    }

    /// True when `a` and `b` are mutually reachable.
    ///
    /// Returns false for out-of-range indices rather than panicking, so callers can probe
    /// endpoints of an arc set that may be wider than the node set.
    #[inline]
    pub fn same_component(&self, a: u32, b: u32) -> bool {
        match (self.comp_of.get(a as usize), self.comp_of.get(b as usize)) {
            (Some(x), Some(y)) => x == y,
            _ => false,
        }
    }
}

/// Decomposes the graph described by `out_csr` into strongly connected components.
///
/// `out_csr` may describe fewer nodes than `node_count` (a CSR built from an arc subset over a
/// smaller index space); the missing tail is treated as having no outgoing arcs. Arcs pointing
/// beyond `node_count` are ignored.
///
/// **Determinism contract:** components are emitted in ascending order of their smallest member
/// and each member list is sorted ascending, so `comp_of` is a function of the arc *set*, not of
/// the arc order or of any traversal accident. Downstream phases index by component and must be
/// able to rely on that.
pub fn tarjan_scc(node_count: usize, out_csr: &Csr) -> SccResult {
    if node_count == 0 {
        return SccResult {
            comp_of: Vec::new(),
            components: Vec::new(),
            cyclic: Vec::new(),
        };
    }

    let csr_nodes = out_csr.node_count();
    let range_of = |v: u32| -> (usize, usize) {
        if (v as usize) < csr_nodes {
            let r = out_csr.range(v);
            (r.start, r.end)
        } else {
            (0, 0)
        }
    };

    let mut indices = vec![UNVISITED; node_count];
    let mut lowlink = vec![0u32; node_count];
    let mut on_stack = vec![false; node_count];
    let mut stack: Vec<u32> = Vec::with_capacity(node_count);
    // (node, cursor into its CSR range) — the explicit substitute for the recursion frame.
    let mut frames: Vec<(u32, usize)> = Vec::with_capacity(node_count);
    let mut raw: Vec<Vec<u32>> = Vec::new();
    let mut next_index: u32 = 0;

    for root in 0..node_count as u32 {
        if indices[root as usize] != UNVISITED {
            continue;
        }

        indices[root as usize] = next_index;
        lowlink[root as usize] = next_index;
        next_index += 1;
        stack.push(root);
        on_stack[root as usize] = true;
        frames.push((root, range_of(root).0));

        while let Some(&(v, cursor)) = frames.last() {
            let (_, end) = range_of(v);
            if cursor < end {
                if let Some(top) = frames.last_mut() {
                    top.1 = cursor + 1;
                }
                let w = out_csr.targets[cursor];
                if w as usize >= node_count {
                    continue;
                }
                if indices[w as usize] == UNVISITED {
                    indices[w as usize] = next_index;
                    lowlink[w as usize] = next_index;
                    next_index += 1;
                    stack.push(w);
                    on_stack[w as usize] = true;
                    frames.push((w, range_of(w).0));
                } else if on_stack[w as usize] {
                    lowlink[v as usize] = lowlink[v as usize].min(indices[w as usize]);
                }
            } else {
                frames.pop();
                if lowlink[v as usize] == indices[v as usize] {
                    let mut comp: Vec<u32> = Vec::new();
                    while let Some(top) = stack.pop() {
                        on_stack[top as usize] = false;
                        comp.push(top);
                        if top == v {
                            break;
                        }
                    }
                    comp.sort_unstable();
                    raw.push(comp);
                }
                // Propagate the finished child's lowlink into its parent frame.
                if let Some(&(parent, _)) = frames.last() {
                    lowlink[parent as usize] = lowlink[parent as usize].min(lowlink[v as usize]);
                }
            }
        }
    }

    // Tarjan emits components in reverse topological order of the condensation, which depends on
    // the DFS root order. Sorting by minimum member makes the numbering input-order independent.
    raw.sort_unstable_by_key(|c| c.first().copied().unwrap_or(0));

    let mut comp_of = vec![0u32; node_count];
    let mut cyclic = Vec::with_capacity(raw.len());
    for (ci, comp) in raw.iter().enumerate() {
        for &n in comp {
            comp_of[n as usize] = ci as u32;
        }
        let is_cyclic = if comp.len() > 1 {
            true
        } else {
            match comp.first() {
                // A singleton is cyclic exactly when it carries a self-loop; that loop is a cycle
                // of length one and still has to be broken.
                Some(&only) => {
                    let (s, e) = range_of(only);
                    out_csr.targets[s..e].contains(&only)
                }
                None => false,
            }
        };
        cyclic.push(is_cyclic);
    }

    SccResult {
        comp_of,
        components: raw,
        cyclic,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn csr(node_count: usize, arcs: &[(u32, u32)]) -> Csr {
        let triples: Vec<(u32, u32, u32)> = arcs
            .iter()
            .enumerate()
            .map(|(i, &(f, t))| (f, t, i as u32))
            .collect();
        Csr::build(node_count, &triples)
    }

    #[test]
    fn empty_graph_has_no_components() {
        let r = tarjan_scc(0, &Csr::default());
        assert!(r.components.is_empty());
        assert!(r.comp_of.is_empty());
        assert!(r.cyclic.is_empty());
    }

    #[test]
    fn isolated_nodes_are_singleton_acyclic_components() {
        let r = tarjan_scc(3, &csr(3, &[]));
        assert_eq!(r.components, vec![vec![0], vec![1], vec![2]]);
        assert_eq!(r.cyclic, vec![false, false, false]);
        assert_eq!(r.comp_of, vec![0, 1, 2]);
    }

    #[test]
    fn three_cycle_is_one_cyclic_component() {
        let r = tarjan_scc(3, &csr(3, &[(0, 1), (1, 2), (2, 0)]));
        assert_eq!(r.components, vec![vec![0, 1, 2]]);
        assert_eq!(r.cyclic, vec![true]);
        assert!(r.same_component(0, 2));
    }

    #[test]
    fn path_is_three_acyclic_components_ordered_by_min_node() {
        let r = tarjan_scc(3, &csr(3, &[(0, 1), (1, 2)]));
        assert_eq!(r.components, vec![vec![0], vec![1], vec![2]]);
        assert_eq!(r.cyclic, vec![false, false, false]);
        assert_eq!(r.comp_of, vec![0, 1, 2]);
        assert!(!r.same_component(0, 1));
    }

    #[test]
    fn self_loop_makes_a_singleton_cyclic() {
        let r = tarjan_scc(2, &csr(2, &[(0, 0), (0, 1)]));
        assert_eq!(r.components, vec![vec![0], vec![1]]);
        assert_eq!(r.cyclic, vec![true, false]);
    }

    #[test]
    fn mixed_graph_separates_the_cycle_from_its_tail() {
        // 0→1→2→0 is a cycle; 2→3 leaves it; 3 is a sink.
        let r = tarjan_scc(4, &csr(4, &[(0, 1), (1, 2), (2, 0), (2, 3)]));
        assert_eq!(r.components, vec![vec![0, 1, 2], vec![3]]);
        assert_eq!(r.cyclic, vec![true, false]);
        assert_eq!(r.comp_of, vec![0, 0, 0, 1]);
    }

    #[test]
    fn two_disjoint_cycles_are_two_components_in_min_node_order() {
        let r = tarjan_scc(4, &csr(4, &[(2, 3), (3, 2), (0, 1), (1, 0)]));
        assert_eq!(r.components, vec![vec![0, 1], vec![2, 3]]);
        assert_eq!(r.cyclic, vec![true, true]);
    }

    #[test]
    fn component_numbering_is_independent_of_arc_order() {
        let a = tarjan_scc(5, &csr(5, &[(0, 1), (1, 0), (2, 3), (3, 4)]));
        let b = tarjan_scc(5, &csr(5, &[(3, 4), (2, 3), (1, 0), (0, 1)]));
        assert_eq!(a.components, b.components);
        assert_eq!(a.comp_of, b.comp_of);
        assert_eq!(a.cyclic, b.cyclic);
    }

    #[test]
    fn deep_chain_does_not_overflow_the_stack() {
        // Recursive Tarjan would recurse 50_000 deep here and trap in wasm.
        let n = 50_000usize;
        let arcs: Vec<(u32, u32)> = (0..n as u32 - 1).map(|i| (i, i + 1)).collect();
        let r = tarjan_scc(n, &csr(n, &arcs));
        assert_eq!(r.components.len(), n);
        assert!(r.cyclic.iter().all(|&c| !c));
    }

    #[test]
    fn csr_shorter_than_node_count_is_tolerated() {
        // A CSR built over only the first two nodes, queried for four.
        let r = tarjan_scc(4, &csr(2, &[(0, 1), (1, 0)]));
        assert_eq!(r.components, vec![vec![0, 1], vec![2], vec![3]]);
        assert_eq!(r.cyclic, vec![true, false, false]);
    }
}
