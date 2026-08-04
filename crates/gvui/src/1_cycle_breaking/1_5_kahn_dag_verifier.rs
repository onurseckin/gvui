//! # Step 1.5 (Phase 2): Kahn verification and residual back-edge detection
//!
//! Phase 2's contract with everything downstream is a single sentence: *after reversal, the
//! non-self arc set is a DAG.* Phase 3 ranking, Phase 4 layering and Phase 5 ordering all assume
//! it and none of them can detect or repair a violation — a residual cycle would show up as an
//! infinite rank chain or a silently truncated layering.
//!
//! So Phase 2 verifies it here, and when the FAS pass leaves something behind (an explicit
//! caller hint that forced a cycle back in, an arc set the SCC pass never saw) the DFS back-edge
//! scan names the exact arcs to reverse. This is a *safety net*, not a retry loop: it removes
//! violations directly rather than re-running the FAS heuristic and hoping.

use std::cmp::Reverse;
use std::collections::BinaryHeap;

use crate::types::Csr;

/// DFS colour: never reached.
const WHITE: u8 = 0;
/// DFS colour: on the current DFS path. An arc into a grey vertex closes a cycle.
const GREY: u8 = 1;
/// DFS colour: fully explored.
const BLACK: u8 = 2;

/// Kahn topological order over dense indices. `None` when a cycle remains.
/// Ties are broken by ascending node index so the result is deterministic.
///
/// Arcs whose endpoints fall outside `0..node_count` are ignored rather than panicking, so a
/// caller may pass an arc list derived from a wider index space. A self-loop is a cycle and makes
/// this return `None`.
pub fn topological_order(node_count: usize, arcs: &[(u32, u32)]) -> Option<Vec<u32>> {
    if node_count == 0 {
        return Some(Vec::new());
    }

    let triples: Vec<(u32, u32, u32)> = arcs
        .iter()
        .enumerate()
        .filter(|(_, &(f, t))| (f as usize) < node_count && (t as usize) < node_count)
        .map(|(i, &(f, t))| (f, t, i as u32))
        .collect();

    let csr = Csr::build(node_count, &triples);
    let mut in_deg = vec![0u32; node_count];
    for &(_, t, _) in &triples {
        in_deg[t as usize] += 1;
    }

    // A min-heap over distinct node indices: the pop order is a total function of the in-degree
    // history, so two runs over the same arc set emit the same order.
    let mut ready: BinaryHeap<Reverse<u32>> = (0..node_count as u32)
        .filter(|&v| in_deg[v as usize] == 0)
        .map(Reverse)
        .collect();

    let mut order: Vec<u32> = Vec::with_capacity(node_count);
    while let Some(Reverse(v)) = ready.pop() {
        order.push(v);
        for idx in csr.range(v) {
            let w = csr.targets[idx] as usize;
            in_deg[w] -= 1;
            if in_deg[w] == 0 {
                ready.push(Reverse(w as u32));
            }
        }
    }

    if order.len() == node_count {
        Some(order)
    } else {
        None
    }
}

/// True when `arcs` contains no directed cycle over `0..node_count`.
///
/// Self-loops count as cycles. Isolated nodes and an empty arc set are trivially acyclic.
pub fn is_dag(node_count: usize, arcs: &[(u32, u32)]) -> bool {
    topological_order(node_count, arcs).is_some()
}

/// Edge indices that still close a cycle, found by DFS back-edge detection. Used as the safety
/// net when the FAS pass leaves a residual cycle.
///
/// The returned set is sorted ascending and deduplicated. It is *a* set of cycle-closing arcs,
/// not the minimum one: reversing all of them is guaranteed to leave a DAG (the DFS finishing
/// order is a valid topological order of the remaining arcs), but reversing only some of them may
/// not be. Callers that reverse one arc at a time must re-run this after each step.
pub fn find_residual_back_edges(node_count: usize, arcs: &[(u32, u32, u32)]) -> Vec<u32> {
    if node_count == 0 {
        return Vec::new();
    }

    let mut filtered: Vec<(u32, u32, u32)> = Vec::with_capacity(arcs.len());
    for &(f, t, e) in arcs {
        if (f as usize) < node_count && (t as usize) < node_count {
            filtered.push((f, t, e));
        }
    }
    let csr = Csr::build(node_count, &filtered);

    let mut colour = vec![WHITE; node_count];
    let mut back: Vec<u32> = Vec::new();
    // Explicit frames: a 50k-long chain would trap a recursive DFS on the wasm stack.
    let mut frames: Vec<(u32, usize)> = Vec::with_capacity(node_count);

    for root in 0..node_count as u32 {
        if colour[root as usize] != WHITE {
            continue;
        }
        colour[root as usize] = GREY;
        frames.push((root, csr.range(root).start));

        while let Some(&(v, cursor)) = frames.last() {
            let end = csr.range(v).end;
            if cursor < end {
                if let Some(top) = frames.last_mut() {
                    top.1 = cursor + 1;
                }
                let w = csr.targets[cursor];
                match colour[w as usize] {
                    GREY => back.push(csr.edges[cursor]),
                    WHITE => {
                        colour[w as usize] = GREY;
                        frames.push((w, csr.range(w).start));
                    }
                    _ => {}
                }
            } else {
                colour[v as usize] = BLACK;
                frames.pop();
            }
        }
    }

    back.sort_unstable();
    back.dedup();
    back
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_graph_is_a_dag_with_an_empty_order() {
        assert_eq!(topological_order(0, &[]), Some(Vec::new()));
        assert!(is_dag(0, &[]));
        assert!(find_residual_back_edges(0, &[]).is_empty());
    }

    #[test]
    fn isolated_nodes_come_out_in_ascending_order() {
        assert_eq!(topological_order(4, &[]), Some(vec![0, 1, 2, 3]));
    }

    #[test]
    fn path_is_ordered_source_first() {
        assert_eq!(topological_order(3, &[(0, 1), (1, 2)]), Some(vec![0, 1, 2]));
        assert_eq!(topological_order(3, &[(2, 1), (1, 0)]), Some(vec![2, 1, 0]));
    }

    #[test]
    fn ties_are_broken_by_ascending_node_index() {
        // 3 and 1 both become ready once 0 is emitted; 1 must come first.
        let order = topological_order(4, &[(0, 3), (0, 1), (1, 2)]);
        assert_eq!(order, Some(vec![0, 1, 2, 3]));

        // Arc order must not change the result.
        let reordered = topological_order(4, &[(1, 2), (0, 1), (0, 3)]);
        assert_eq!(reordered, order);
    }

    #[test]
    fn a_cycle_has_no_topological_order() {
        assert_eq!(topological_order(3, &[(0, 1), (1, 2), (2, 0)]), None);
        assert!(!is_dag(3, &[(0, 1), (1, 2), (2, 0)]));
    }

    #[test]
    fn a_self_loop_is_a_cycle() {
        assert!(!is_dag(2, &[(0, 0)]));
        assert_eq!(find_residual_back_edges(2, &[(0, 0, 5)]), vec![5]);
    }

    #[test]
    fn a_cycle_with_an_acyclic_tail_still_fails() {
        // 0→1→2→0 plus 2→3.
        assert!(!is_dag(4, &[(0, 1), (1, 2), (2, 0), (2, 3)]));
    }

    #[test]
    fn out_of_range_arcs_are_ignored() {
        assert!(is_dag(2, &[(0, 1), (5, 9)]));
        assert!(find_residual_back_edges(2, &[(0, 1, 0), (7, 7, 1)]).is_empty());
    }

    #[test]
    fn back_edges_are_empty_for_a_dag() {
        let arcs = [(0, 1, 0), (1, 2, 1), (0, 2, 2)];
        assert!(find_residual_back_edges(3, &arcs).is_empty());
    }

    #[test]
    fn back_edges_name_the_cycle_closing_arc() {
        // DFS from 0 walks 0→1→2 and then meets the grey 0 via arc 2.
        let arcs = [(0, 1, 0), (1, 2, 1), (2, 0, 2)];
        assert_eq!(find_residual_back_edges(3, &arcs), vec![2]);
    }

    #[test]
    fn reversing_every_reported_back_edge_yields_a_dag() {
        // Two interlocking cycles sharing node 1.
        let arcs = [
            (0, 1, 0),
            (1, 2, 1),
            (2, 0, 2),
            (1, 3, 3),
            (3, 4, 4),
            (4, 1, 5),
        ];
        let back = find_residual_back_edges(5, &arcs);
        assert!(!back.is_empty());
        let flipped: Vec<(u32, u32)> = arcs
            .iter()
            .map(|&(f, t, e)| if back.contains(&e) { (t, f) } else { (f, t) })
            .collect();
        assert!(is_dag(5, &flipped));
    }

    #[test]
    fn back_edge_detection_is_deterministic() {
        let arcs: Vec<(u32, u32, u32)> = (0..40u32).map(|i| (i, (i * 3 + 1) % 40, i)).collect();
        assert_eq!(
            find_residual_back_edges(40, &arcs),
            find_residual_back_edges(40, &arcs)
        );
    }

    #[test]
    fn deep_chain_does_not_overflow_the_stack() {
        let n = 50_000usize;
        let arcs: Vec<(u32, u32, u32)> = (0..n as u32 - 1).map(|i| (i, i + 1, i)).collect();
        assert!(find_residual_back_edges(n, &arcs).is_empty());
        let pairs: Vec<(u32, u32)> = arcs.iter().map(|&(f, t, _)| (f, t)).collect();
        assert!(is_dag(n, &pairs));
    }
}
