use std::collections::{HashMap, HashSet};
use crate::types::{EdgeRole, NormalizedEdge, NormalizedNode, RankAssignmentResult};
use super::{assign_ranks_longest_path, build_result};

/// Runs the Gansner et al. (1993) Network Simplex algorithm to find optimal node rank assignments.
///
/// # Network Simplex Ranking Formulation
///
/// ## 1. Objective Function & Feasibility Constraints
/// The Network Simplex rank assignment minimizes the total weighted edge length in a DAG:
/// $$\min \sum_{(u, v) \in E} \omega(u, v) \cdot (\text{rank}(v) - \text{rank}(u))$$
/// subject to the edge separation (feasibility) constraints:
/// $$\text{rank}(v) - \text{rank}(u) \ge \delta(u, v) \quad \forall (u, v) \in E$$
/// where $\delta(u, v) = 1$ is the minimum required rank difference between connected nodes.
///
/// ## 2. Slack Calculation & Tight Spanning Tree
/// The **slack** of an edge $e = (u, v)$ is defined as:
/// $$\text{slack}(u, v) = \text{rank}(v) - \text{rank}(u) - \delta(u, v)$$
/// An edge is **tight** if $\text{slack}(u, v) = 0$.
/// Network Simplex maintains a tight spanning tree $T \subseteq E$ spanning all nodes in $V$.
///
/// ## 3. Edge Cut Value Calculation (Pivot Sweeps)
/// Removing any tree edge $e = (u, v) \in T$ splits $T$ into two disjoint components:
/// - The **tail component** $W_e$ containing $u$.
/// - The **head component** $V \setminus W_e$ containing $v$.
///
/// The **cut value** $c(e)$ of the tree edge $e$ measures the net change in total edge length if
/// the ranks of all nodes in $V \setminus W_e$ are incremented by 1:
/// $$c(e) = \sum_{(x, y) \in E, x \in W_e, y \notin W_e} \omega(x, y) - \sum_{(x, y) \in E, x \notin W_e, y \in W_e} \omega(x, y)$$
///
/// If $c(e) < 0$, moving the component $V \setminus W_e$ reduces the objective cost:
/// 1. **Leaving edge**: Select a tree edge $e$ with negative cut value ($c(e) < 0$).
/// 2. **Entering edge**: Find a non-tree edge $e' = (x, y)$ directed from $V \setminus W_e$ back to $W_e$
///    ($x \notin W_e, y \in W_e$) with minimum slack $\gamma = \text{slack}(x, y)$.
/// 3. **Pivot sweep**: Replace $e$ with $e'$ in $T$, and shift ranks of all nodes in $V \setminus W_e$ by $+\gamma$.
///
/// The algorithm terminates when all tree edges have non-negative cut values ($c(e) \ge 0$),
/// guaranteeing an optimal rank assignment.
pub fn run_network_simplex(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    edge_role_map: Option<&HashMap<String, EdgeRole>>,
    initial_ranks: &HashMap<String, usize>,
) -> Option<RankAssignmentResult> {
    if nodes.is_empty() {
        return None;
    }

    let node_indices: HashMap<String, usize> = nodes
        .iter()
        .enumerate()
        .map(|(idx, n)| (n.id.clone(), idx))
        .collect();

    let forward_edges: Vec<(usize, usize, String)> = edges
        .iter()
        .filter(|e| match edge_role_map {
            Some(map) => map.get(&e.id) == Some(&EdgeRole::Forward),
            None => !e.is_cycle.unwrap_or(false) && e.source != e.target,
        })
        .filter_map(|e| {
            let u = *node_indices.get(&e.source)?;
            let v = *node_indices.get(&e.target)?;
            Some((u, v, e.id.clone()))
        })
        .collect();

    if forward_edges.is_empty() {
        return None;
    }

    let n_nodes = nodes.len();
    let mut ranks: Vec<i64> = vec![0; n_nodes];
    for (id, idx) in &node_indices {
        ranks[*idx] = *initial_ranks.get(id).unwrap_or(&0) as i64;
    }

    // Ensure initial feasibility: rank(v) - rank(u) >= 1 for all forward edges
    for _ in 0..n_nodes {
        let mut changed = false;
        for &(u, v, _) in &forward_edges {
            if ranks[v] < ranks[u] + 1 {
                ranks[v] = ranks[u] + 1;
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }

    // Network Simplex iteration: tight tree construction & cut-value optimization
    let mut tree_edges: HashSet<usize> = HashSet::new();

    // 1. Build initial tight spanning tree T
    let mut visited: HashSet<usize> = HashSet::new();
    visited.insert(0);

    while visited.len() < n_nodes {
        let mut best_edge_idx = None;
        let mut min_slack = i64::MAX;

        for (e_idx, &(u, v, _)) in forward_edges.iter().enumerate() {
            let u_visited = visited.contains(&u);
            let v_visited = visited.contains(&v);
            if u_visited != v_visited {
                let slack = (ranks[v] - ranks[u] - 1).max(0);
                if slack < min_slack {
                    min_slack = slack;
                    best_edge_idx = Some((e_idx, u_visited));
                }
            }
        }

        if let Some((e_idx, u_visited)) = best_edge_idx {
            let (u, v, _) = forward_edges[e_idx];
            let shift_val = ranks[v] - ranks[u] - 1;
            if min_slack > 0 {
                // Shift unvisited component to make edge tight (slack = 0)
                if u_visited {
                    let mut stack = vec![v];
                    let mut shifted = HashSet::new();
                    while let Some(curr) = stack.pop() {
                        if !visited.contains(&curr) && shifted.insert(curr) {
                            ranks[curr] -= shift_val;
                            for &(su, sv, _) in &forward_edges {
                                if su == curr && !visited.contains(&sv) {
                                    stack.push(sv);
                                }
                                if sv == curr && !visited.contains(&su) {
                                    stack.push(su);
                                }
                            }
                        }
                    }
                } else {
                    let mut stack = vec![u];
                    let mut shifted = HashSet::new();
                    while let Some(curr) = stack.pop() {
                        if !visited.contains(&curr) && shifted.insert(curr) {
                            ranks[curr] += shift_val;
                            for &(su, sv, _) in &forward_edges {
                                if su == curr && !visited.contains(&sv) {
                                    stack.push(sv);
                                }
                                if sv == curr && !visited.contains(&su) {
                                    stack.push(su);
                                }
                            }
                        }
                    }
                }
            }

            tree_edges.insert(e_idx);
            visited.insert(u);
            visited.insert(v);
        } else {
            // Include remaining unvisited disconnected components into tree construction
            if let Some(unvisited_node) = (0..n_nodes).find(|i| !visited.contains(i)) {
                visited.insert(unvisited_node);
            } else {
                break;
            }
        }
    }

    // 2. Cut value optimization loop (Pivot sweeps)
    let max_iter = n_nodes * 4;
    for _ in 0..max_iter {
        let mut min_cut_val = 0i64;
        let mut leave_edge = None;

        for &te_idx in &tree_edges {
            let (tu, _tv, _) = forward_edges[te_idx];
            // Compute cut value by splitting tree along te_idx
            let mut component_tail = HashSet::new();
            let mut stack = vec![tu];
            while let Some(curr) = stack.pop() {
                if component_tail.insert(curr) {
                    for &other_te in &tree_edges {
                        if other_te != te_idx {
                            let (ou, ov, _) = forward_edges[other_te];
                            if ou == curr && !component_tail.contains(&ov) {
                                stack.push(ov);
                            }
                            if ov == curr && !component_tail.contains(&ou) {
                                stack.push(ou);
                            }
                        }
                    }
                }
            }

            let mut cut_val = 0i64;
            for &(fe_u, fe_v, _) in &forward_edges {
                let u_in_tail = component_tail.contains(&fe_u);
                let v_in_tail = component_tail.contains(&fe_v);
                if u_in_tail && !v_in_tail {
                    cut_val += 1;
                } else if !u_in_tail && v_in_tail {
                    cut_val -= 1;
                }
            }

            if cut_val < min_cut_val {
                min_cut_val = cut_val;
                leave_edge = Some((te_idx, component_tail));
            }
        }

        if let Some((leave_idx, component_tail)) = leave_edge {
            // Find substitute non-tree edge with minimum slack from head component to tail component
            let mut enter_edge = None;
            let mut min_slack = i64::MAX;

            for (e_idx, &(u, v, _)) in forward_edges.iter().enumerate() {
                if !tree_edges.contains(&e_idx) {
                    let u_in_tail = component_tail.contains(&u);
                    let v_in_tail = component_tail.contains(&v);
                    if !u_in_tail && v_in_tail {
                        let slack = ranks[v] - ranks[u] - 1;
                        if slack < min_slack {
                            min_slack = slack;
                            enter_edge = Some(e_idx);
                        }
                    }
                }
            }

            if let Some(enter_idx) = enter_edge {
                tree_edges.remove(&leave_idx);
                tree_edges.insert(enter_idx);

                // Adjust ranks by min_slack for head component
                for (idx, r) in ranks.iter_mut().enumerate().take(n_nodes) {
                    if !component_tail.contains(&idx) {
                        *r += min_slack;
                    }
                }
            } else {
                break;
            }
        } else {
            // All tree edges have non-negative cut values (cut_val >= 0): optimal ranking achieved
            break;
        }
    }

    // 3. Normalize ranks so minimum rank is 0
    let min_r = *ranks.iter().min().unwrap_or(&0);
    let mut node_rank_map = HashMap::new();
    for (id, &idx) in &node_indices {
        let norm_r = (ranks[idx] - min_r).max(0) as usize;
        node_rank_map.insert(id.clone(), norm_r);
    }

    Some(build_result(nodes, edges, node_rank_map))
}

/// Assigns ranks to nodes in the graph using Network Simplex layering with Longest-Path fallback.
pub fn assign_ranks(
    nodes: &[NormalizedNode],
    edges: &[NormalizedEdge],
    edge_role_map: Option<&HashMap<String, EdgeRole>>,
) -> RankAssignmentResult {
    let longest_path_res = assign_ranks_longest_path(nodes, edges, edge_role_map);
    if let Some(simplex_res) =
        run_network_simplex(nodes, edges, edge_role_map, &longest_path_res.node_rank_map)
    {
        simplex_res
    } else {
        longest_path_res
    }
}
