//! # Step 2.3 (Phase 3): Aspect-ratio rank balancing
//!
//! Network simplex minimises edge length. It has no opinion about the *shape* of the drawing, and
//! the two failure modes that produces are both visible in the sample datasets: a dense mesh
//! collapses into one enormous row, and everything that is not the widest rank is dwarfed by it.
//!
//! This pass caps rank width. It takes the widest over-full rank, picks the members that can afford
//! to move — the ones with real downward slack — and pushes exactly the excess down one rank. It
//! never moves a node whose outgoing arcs are already tight, so `min_len` cannot be violated, and
//! it never moves a node *up*, so it can only widen the rank below, never merge two ranks.
//!
//! ## What this pass cannot do
//!
//! It caps width, not height. A ten-node chain is ten ranks because `rank(v) >= rank(u) + 1` says
//! so ten times over; no rearrangement short of violating `min_len` can shorten it, and violating
//! `min_len` would hand Phase 4 a labelled edge with no rank to put its badge on. Height is set by
//! the graph's longest constrained path, full stop. The knob here is width.

use crate::config::CustomLayoutConfig;
use crate::types::{Csr, GraphIr, StructureResult};

/// Directed endpoints of edge `e` as ranking sees them, or `None` when the edge takes no part in
/// ranking at all.
///
/// Reversal from Phase 2 is already applied, so the returned pair always points "downhill". Four
/// kinds of edge are excluded, and callers must exclude all four consistently or the arc list the
/// balancer repairs against will disagree with the one the ranker solved:
///
/// - self-loops by role (Phase 8 routes them directly, they constrain nothing);
/// - edges whose endpoints coincide after reversal, for the same reason;
/// - endpoints outside `ir.nodes`;
/// - edges Phase 2 never classified, which are read unreversed rather than dropped so a truncated
///   [`StructureResult`] degrades instead of panicking.
pub fn rank_arc(ir: &GraphIr, structure: &StructureResult, e: u32) -> Option<(u32, u32)> {
    let edge = ir.edges.get(e as usize)?;
    if structure
        .roles
        .get(e as usize)
        .is_some_and(|role| role.is_self_loop())
    {
        return None;
    }
    let (from, to) = if (e as usize) < structure.reversed.len() {
        structure.arc(ir, e)
    } else {
        (edge.source, edge.target)
    };
    let node_count = ir.node_count() as u32;
    if from == to || from >= node_count || to >= node_count {
        return None;
    }
    Some((from, to))
}

/// Every ranking constraint in the graph as `(from, to, min_len)`, in ascending edge order.
///
/// This is the single definition of "the arcs ranking cares about"; the facade builds its weighted
/// list from the same [`rank_arc`] filter so the two can never drift apart.
pub fn structural_arcs(ir: &GraphIr, structure: &StructureResult) -> Vec<(u32, u32, u16)> {
    let mut arcs = Vec::with_capacity(ir.edge_count());
    for e in 0..ir.edge_count() as u32 {
        if let Some((from, to)) = rank_arc(ir, structure, e) {
            arcs.push((from, to, ir.edges[e as usize].min_len));
        }
    }
    arcs
}

/// Raises heads until `rank[to] >= rank[from] + min_len` holds for every arc.
///
/// Only ever raises, never lowers, so it terminates on any acyclic constraint set and leaves an
/// already-feasible ranking untouched. Returns `true` when it reached a fixpoint within
/// `max_passes`; `false` means the constraint set has a cycle in it and the ranking that comes back
/// is the best bounded effort rather than a feasible one.
///
/// Pinned ranks are ordinary ranks here: a pin that contradicts an incoming `min_len` is raised
/// like anything else, because Phase 4 can survive a moved node but not a violated `min_len`.
pub fn repair_feasibility(
    rank_of: &mut [u16],
    arcs: &[(u32, u32, u16)],
    max_passes: usize,
) -> bool {
    for _ in 0..max_passes {
        let mut changed = false;
        for &(from, to, min_len) in arcs {
            let (from, to) = (from as usize, to as usize);
            if from >= rank_of.len() || to >= rank_of.len() {
                continue;
            }
            let need = rank_of[from].saturating_add(min_len);
            if rank_of[to] < need {
                rank_of[to] = need;
                changed = true;
            }
        }
        if !changed {
            return true;
        }
    }
    false
}

/// Caps rank width so the drawing tends towards `config.target_aspect_ratio`.
///
/// Mutates `rank_of` in place. The caller is responsible for only invoking this when
/// `config.balance_ranks` is set and no node carries a pinned rank — a pin is an explicit
/// instruction about where a node goes, and this pass would quietly override it.
///
/// Guarantees:
///
/// - **No `min_len` is ever violated.** A node moves down only when its slack — the distance to the
///   tightest outgoing arc — is at least 1, and moving a node down can only *increase* the slack of
///   its incoming arcs. The closing repair pass is belt-and-braces, not load-bearing.
/// - **Termination.** Each round either moves at least one node, retires one rank from
///   consideration, or stops. Rounds are additionally capped, so a graph whose sinks have unbounded
///   slack cannot be pushed down forever.
/// - **Determinism.** Ranks are visited in ascending order, movers are chosen by
///   (greatest slack, fewest same-rank neighbours, lowest node index), and nothing consults a hash
///   container.
///
/// The minimum rank is 0 on return, so the caller's normalisation stays a no-op in the common case.
pub fn balance_ranks(
    rank_of: &mut [u16],
    ir: &GraphIr,
    structure: &StructureResult,
    config: &CustomLayoutConfig,
) {
    let node_count = ir.node_count();
    if node_count == 0 || rank_of.len() < node_count {
        return;
    }

    let mut total_w = 0.0f64;
    let mut total_h = 0.0f64;
    for node in &ir.nodes {
        total_w += node.width;
        total_h += node.height;
    }
    let avg_w = total_w / node_count as f64;
    let avg_h = total_h / node_count as f64;
    let cap = config
        .resolved_max_nodes_per_rank(node_count, avg_w, avg_h)
        .max(1);

    let arcs = structural_arcs(ir, structure);
    let out = Csr::build(
        node_count,
        &arcs
            .iter()
            .enumerate()
            .map(|(i, &(from, to, _))| (from, to, i as u32))
            .collect::<Vec<_>>(),
    );
    let mut undirected = Vec::with_capacity(arcs.len() * 2);
    for &(from, to, _) in &arcs {
        undirected.push((from, to, 0u32));
        undirected.push((to, from, 0u32));
    }
    let neighbours = Csr::build(node_count, &undirected);

    // A rank whose members are all pinned tight by their outgoing arcs is retired: revisiting it
    // would spin, and rule 3 says leave it alone and move on to the next over-full rank.
    let mut retired: Vec<bool> = Vec::new();
    let mut movers: Vec<(u16, u32, u32)> = Vec::new();
    // The per-round budget grows with the rank count, which is how a single over-full rank at the
    // top can still drain across the several ranks it needs. The absolute cap bounds the whole loop
    // regardless: no rank ever empties (a round leaves exactly `cap >= 1` behind), so the rank count
    // cannot exceed the node count and the budget cannot outrun this ceiling.
    let hard_cap = node_count.saturating_mul(4).saturating_add(4);
    let mut round = 0usize;

    loop {
        let rank_count = rank_of[..node_count].iter().copied().max().unwrap_or(0) as usize + 1;
        if round >= rank_count.saturating_mul(4) || round >= hard_cap {
            break;
        }
        round += 1;

        if retired.len() < rank_count {
            retired.resize(rank_count, false);
        }
        let mut counts = vec![0usize; rank_count];
        for n in 0..node_count {
            counts[rank_of[n] as usize] += 1;
        }

        let mut target: Option<(usize, usize)> = None;
        for (r, &count) in counts.iter().enumerate() {
            if retired[r] || count <= cap {
                continue;
            }
            let excess = count - cap;
            match target {
                Some((best_excess, _)) if best_excess >= excess => {}
                _ => target = Some((excess, r)),
            }
        }
        let (excess, rank) = match target {
            Some(t) => t,
            None => break,
        };

        movers.clear();
        for n in 0..node_count as u32 {
            if rank_of[n as usize] as usize != rank {
                continue;
            }
            let slack = downward_slack(n, rank_of, &out, &arcs);
            if slack < 1 {
                continue;
            }
            movers.push((slack, same_rank_neighbours(n, rank_of, &neighbours), n));
        }

        if movers.is_empty() {
            retired[rank] = true;
            continue;
        }

        // Greatest slack first (cheapest to move), then fewest same-rank neighbours (moving a node
        // away from its siblings costs the ordering phase less), then lowest index for determinism.
        movers.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
        for &(_, _, n) in movers.iter().take(excess) {
            rank_of[n as usize] = rank_of[n as usize].saturating_add(1);
        }
    }

    repair_feasibility(rank_of, &arcs, node_count.max(1));

    let min = rank_of.iter().copied().min().unwrap_or(0);
    if min > 0 {
        for r in rank_of.iter_mut() {
            *r -= min;
        }
    }
}

/// How far `n` may descend before some outgoing arc goes short.
///
/// `u16::MAX` for a node with no outgoing arc — a sink is free to move as far down as the layout
/// wants. An already-violated arc reports 0 rather than a negative number, so a node can never be
/// moved on the strength of a constraint that is already broken.
fn downward_slack(n: u32, rank_of: &[u16], out: &Csr, arcs: &[(u32, u32, u16)]) -> u16 {
    let mut slack = u16::MAX;
    for slot in out.range(n) {
        let to = out.targets[slot] as usize;
        let min_len = arcs[out.edges[slot] as usize].2 as i32;
        let room = rank_of[to] as i32 - rank_of[n as usize] as i32 - min_len;
        let room = room.clamp(0, u16::MAX as i32) as u16;
        if room < slack {
            slack = room;
        }
    }
    slack
}

/// Neighbours of `n`, in either direction, that currently share its rank.
fn same_rank_neighbours(n: u32, rank_of: &[u16], neighbours: &Csr) -> u32 {
    let rank = rank_of[n as usize];
    let mut count = 0u32;
    for slot in neighbours.range(n) {
        if rank_of[neighbours.targets[slot] as usize] == rank {
            count += 1;
        }
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{EdgeRole, IrEdge, IrNode};

    /// Builds an IR with uniform 120x60 boxes from `(source, target, min_len)` triples.
    fn ir_of(node_count: usize, edges: &[(u32, u32, u16)]) -> GraphIr {
        let mut ir = GraphIr {
            node_names: (0..node_count).map(|i| format!("n{}", i)).collect(),
            node_labels: vec![None; node_count],
            edge_names: (0..edges.len()).map(|i| format!("e{}", i)).collect(),
            ..GraphIr::default()
        };
        ir.nodes = (0..node_count)
            .map(|i| IrNode {
                name: i as u32,
                width: 120.0,
                height: 60.0,
                pinned_rank: None,
                degree: 0,
            })
            .collect();
        ir.edges = edges
            .iter()
            .enumerate()
            .map(|(i, &(source, target, min_len))| IrEdge {
                name: i as u32,
                source,
                target,
                label: None,
                weight: 1.0,
                min_len,
                hint: None,
                bundle: None,
            })
            .collect();
        for edge in &ir.edges {
            ir.nodes[edge.source as usize].degree += 1;
            ir.nodes[edge.target as usize].degree += 1;
        }
        let out: Vec<(u32, u32, u32)> = ir
            .edges
            .iter()
            .enumerate()
            .map(|(i, e)| (e.source, e.target, i as u32))
            .collect();
        let inc: Vec<(u32, u32, u32)> = ir
            .edges
            .iter()
            .enumerate()
            .map(|(i, e)| (e.target, e.source, i as u32))
            .collect();
        ir.out_csr = Csr::build(node_count, &out);
        ir.in_csr = Csr::build(node_count, &inc);
        ir
    }

    /// Phase 2 output for a graph that was already a DAG.
    fn dag_structure(ir: &GraphIr) -> StructureResult {
        StructureResult {
            roles: ir
                .edges
                .iter()
                .map(|e| {
                    if e.source == e.target {
                        EdgeRole::SelfLoop
                    } else {
                        EdgeRole::Forward
                    }
                })
                .collect(),
            reversed: vec![false; ir.edge_count()],
            self_loops: ir
                .edges
                .iter()
                .enumerate()
                .filter(|(_, e)| e.source == e.target)
                .map(|(i, _)| i as u32)
                .collect(),
            is_dag: true,
        }
    }

    fn config_with_cap(cap: usize) -> CustomLayoutConfig {
        CustomLayoutConfig {
            max_nodes_per_rank: cap,
            ..CustomLayoutConfig::default()
        }
    }

    fn assert_feasible(rank_of: &[u16], edges: &[(u32, u32, u16)]) {
        for &(from, to, min_len) in edges {
            assert!(
                rank_of[to as usize] as i32 - rank_of[from as usize] as i32 >= min_len as i32,
                "arc {}->{} min_len {} violated in {:?}",
                from,
                to,
                min_len,
                rank_of
            );
        }
    }

    fn width_of(rank_of: &[u16], rank: u16) -> usize {
        rank_of.iter().filter(|&&r| r == rank).count()
    }

    #[test]
    fn a_wide_fan_is_split_across_several_ranks() {
        // One source into twelve sinks: rank 1 is twelve wide and every sink has unbounded slack.
        let edges: Vec<(u32, u32, u16)> = (1..=12u32).map(|t| (0u32, t, 1u16)).collect();
        let ir = ir_of(13, &edges);
        let structure = dag_structure(&ir);
        let mut rank_of = vec![0u16; 13];
        for r in rank_of.iter_mut().skip(1) {
            *r = 1;
        }

        balance_ranks(&mut rank_of, &ir, &structure, &config_with_cap(4));

        assert_feasible(&rank_of, &edges);
        let max_rank = rank_of.iter().copied().max().unwrap_or(0);
        for r in 0..=max_rank {
            assert!(
                width_of(&rank_of, r) <= 4,
                "rank {} still over cap in {:?}",
                r,
                rank_of
            );
        }
        assert!(
            max_rank >= 3,
            "fan should have spread downward: {:?}",
            rank_of
        );
    }

    #[test]
    fn a_graph_already_within_cap_is_left_untouched() {
        let edges = [(0u32, 1u32, 1u16), (0, 2, 1), (1, 3, 1), (2, 3, 1)];
        let ir = ir_of(4, &edges);
        let structure = dag_structure(&ir);
        let mut rank_of = vec![0, 1, 1, 2];
        let before = rank_of.clone();

        balance_ranks(&mut rank_of, &ir, &structure, &config_with_cap(8));

        assert_eq!(rank_of, before);
    }

    #[test]
    fn a_chain_keeps_all_ten_ranks() {
        // Ten ranks is what `min_len` demands; the balancer caps width, and no width cap can make a
        // chain shorter without breaking a constraint Phase 4 depends on.
        let edges: Vec<(u32, u32, u16)> = (0..9u32).map(|i| (i, i + 1, 1u16)).collect();
        let ir = ir_of(10, &edges);
        let structure = dag_structure(&ir);
        // `target_aspect_ratio` strongly favouring width drives the derived cap as low as it goes.
        let config = CustomLayoutConfig {
            target_aspect_ratio: 8.0,
            max_nodes_per_rank: 0,
            ..CustomLayoutConfig::default()
        };
        let mut rank_of: Vec<u16> = (0..10u16).collect();

        balance_ranks(&mut rank_of, &ir, &structure, &config);

        assert_feasible(&rank_of, &edges);
        assert_eq!(rank_of.iter().copied().max(), Some(9));
        assert_eq!(rank_of, (0..10u16).collect::<Vec<_>>());
    }

    #[test]
    fn nodes_without_slack_are_never_moved() {
        // Rank 1 = {1,2,3}, each tight against a successor on rank 2; rank 2 = {4,5,6}, all sinks.
        let edges = [
            (0u32, 1u32, 1u16),
            (0, 2, 1),
            (0, 3, 1),
            (1, 4, 1),
            (2, 5, 1),
            (3, 6, 1),
        ];
        let ir = ir_of(7, &edges);
        let structure = dag_structure(&ir);
        let mut rank_of = vec![0, 1, 1, 1, 2, 2, 2];

        balance_ranks(&mut rank_of, &ir, &structure, &config_with_cap(2));

        assert_feasible(&rank_of, &edges);
        assert_eq!(
            &rank_of[1..4],
            &[1, 1, 1],
            "tight nodes must stay put: {:?}",
            rank_of
        );
        assert_eq!(
            width_of(&rank_of, 2),
            2,
            "the sink rank should have shed one"
        );
        assert_eq!(width_of(&rank_of, 3), 1);
    }

    #[test]
    fn slack_is_spent_but_never_overdrawn() {
        // Node 5 has slack 2 towards node 6; the cap forces it down, but never past its constraint.
        let edges = [
            (0u32, 1u32, 1u16),
            (0, 2, 1),
            (0, 3, 1),
            (0, 4, 1),
            (0, 5, 1),
            (5, 6, 3),
            (1, 6, 1),
        ];
        let ir = ir_of(7, &edges);
        let structure = dag_structure(&ir);
        let mut rank_of = vec![0, 1, 1, 1, 1, 1, 4];

        balance_ranks(&mut rank_of, &ir, &structure, &config_with_cap(1));

        assert_feasible(&rank_of, &edges);
        assert!(
            rank_of[5] <= 1 + 3,
            "node 5 overshot its arc: {:?}",
            rank_of
        );
    }

    #[test]
    fn degenerate_inputs_are_no_ops() {
        let ir = ir_of(0, &[]);
        let structure = dag_structure(&ir);
        let mut rank_of: Vec<u16> = Vec::new();
        balance_ranks(&mut rank_of, &ir, &structure, &config_with_cap(2));
        assert!(rank_of.is_empty());

        // A rank_of shorter than the node count is a caller bug; refuse rather than index past it.
        let ir = ir_of(3, &[(0, 1, 1)]);
        let structure = dag_structure(&ir);
        let mut short = vec![0u16];
        balance_ranks(&mut short, &ir, &structure, &config_with_cap(1));
        assert_eq!(short, vec![0]);
    }

    #[test]
    fn self_loops_never_constrain_a_rank() {
        let edges = [(0u32, 0u32, 1u16), (0, 1, 1)];
        let ir = ir_of(2, &edges);
        let structure = dag_structure(&ir);
        assert_eq!(rank_arc(&ir, &structure, 0), None);
        assert_eq!(rank_arc(&ir, &structure, 1), Some((0, 1)));
        assert_eq!(structural_arcs(&ir, &structure), vec![(0, 1, 1)]);
    }

    #[test]
    fn reversed_edges_are_read_in_their_reversed_direction() {
        let edges = [(1u32, 0u32, 1u16)];
        let ir = ir_of(2, &edges);
        let mut structure = dag_structure(&ir);
        structure.reversed = vec![true];
        structure.roles = vec![EdgeRole::Feedback];
        assert_eq!(rank_arc(&ir, &structure, 0), Some((0, 1)));
    }

    #[test]
    fn repair_raises_only_and_reports_convergence() {
        let arcs = [(0u32, 1u32, 2u16), (1, 2, 1)];
        let mut rank_of = vec![0, 0, 0];
        assert!(repair_feasibility(&mut rank_of, &arcs, 8));
        assert_eq!(rank_of, vec![0, 2, 3]);

        // Already feasible: untouched, and a fixpoint is detected on the first pass.
        let mut settled = vec![0, 5, 9];
        assert!(repair_feasibility(&mut settled, &arcs, 8));
        assert_eq!(settled, vec![0, 5, 9]);

        // Cyclic constraints have no fixpoint; the bound must be respected rather than looped on.
        let cyclic = [(0u32, 1u32, 1u16), (1, 0, 1)];
        let mut spun = vec![0, 0];
        assert!(!repair_feasibility(&mut spun, &cyclic, 4));
    }

    #[test]
    fn balancing_is_deterministic() {
        let edges: Vec<(u32, u32, u16)> = (1..=9u32).map(|t| (0u32, t, 1u16)).collect();
        let ir = ir_of(10, &edges);
        let structure = dag_structure(&ir);
        let mut seed: Vec<u16> = vec![1u16; 10];
        seed[0] = 0;

        let mut first = seed.clone();
        balance_ranks(&mut first, &ir, &structure, &config_with_cap(3));
        for _ in 0..8 {
            let mut again = seed.clone();
            balance_ranks(&mut again, &ir, &structure, &config_with_cap(3));
            assert_eq!(again, first);
        }
    }
}
