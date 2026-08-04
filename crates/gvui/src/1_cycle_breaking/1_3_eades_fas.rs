//! # Step 1.3 (Phase 2): Eades-Lin-Smyth greedy feedback arc set
//!
//! Given a cyclic strongly connected component, choose the arcs to reverse so the component
//! becomes acyclic. Minimum FAS is NP-hard; the Eades-Lin-Smyth (1993) sequence heuristic gives
//! `|FAS| <= m/2 - n/6` in linear time, which is more than good enough and — crucially — needs no
//! search. That matters here: Phase 2 has no retry loop, so the FAS must be right the first time.
//!
//! The heuristic builds a linear vertex sequence and calls every arc that points backwards in it a
//! feedback arc:
//!
//! 1. peel off sinks (`out_deg == 0`) onto the right of the sequence,
//! 2. else peel off sources (`in_deg == 0`) onto the left,
//! 3. else peel off the vertex maximising `out_deg - in_deg` onto the left.
//!
//! Step 3 is what needs care: a naive implementation rescans every remaining vertex and turns the
//! pass quadratic. Bucketing vertices by `out_deg - in_deg` with lazy deletion keeps it linear,
//! because each degree update pushes at most one bucket entry and the max-delta pointer rises at
//! most once per update.

use std::collections::HashMap;

use crate::types::Csr;

/// Vertices bucketed by `out_deg - in_deg`, plus the two special buckets for sinks and sources.
///
/// Deletion is lazy: a vertex whose degrees change is re-filed, and the stale entry is skipped
/// when a cursor reaches it. This is what keeps the pass linear — a heap would cost an extra
/// `log n` per degree update, and re-scanning the live set would make it quadratic.
///
/// Every collection is append-only with a forward cursor, so total work is bounded by the number
/// of filings, which is `n + 2m`.
struct DeltaIndex {
    /// Added to `out_deg - in_deg` to index `buckets`. Equals the arc count.
    offset: i64,
    buckets: Vec<Vec<u32>>,
    bucket_cursor: Vec<usize>,
    sinks: Vec<u32>,
    sinks_cursor: usize,
    sources: Vec<u32>,
    sources_cursor: usize,
    /// Highest bucket that has ever held an entry; scans start here and walk down.
    max_bucket: i64,
}

impl DeltaIndex {
    fn new(offset: i64) -> DeltaIndex {
        let bucket_count = (2 * offset + 1) as usize;
        DeltaIndex {
            offset,
            buckets: vec![Vec::new(); bucket_count],
            bucket_cursor: vec![0; bucket_count],
            sinks: Vec::new(),
            sinks_cursor: 0,
            sources: Vec::new(),
            sources_cursor: 0,
            max_bucket: -1,
        }
    }

    /// Files a vertex into the collection matching its *current* degrees.
    ///
    /// Must be called after **every** degree change: the lazy-deletion argument depends on a live
    /// vertex always having a fresh entry at or after its collection's cursor.
    fn file(&mut self, v: u32, out_deg: &[i64], in_deg: &[i64]) {
        let i = v as usize;
        if out_deg[i] == 0 {
            self.sinks.push(v);
        } else if in_deg[i] == 0 {
            self.sources.push(v);
        } else {
            let k = (out_deg[i] - in_deg[i] + self.offset) as usize;
            if k < self.buckets.len() {
                self.buckets[k].push(v);
                self.max_bucket = self.max_bucket.max(k as i64);
            }
        }
    }

    fn take_sink(&mut self, removed: &[bool], out_deg: &[i64]) -> Option<u32> {
        while self.sinks_cursor < self.sinks.len() {
            let v = self.sinks[self.sinks_cursor];
            self.sinks_cursor += 1;
            if !removed[v as usize] && out_deg[v as usize] == 0 {
                return Some(v);
            }
        }
        None
    }

    fn take_source(&mut self, removed: &[bool], out_deg: &[i64], in_deg: &[i64]) -> Option<u32> {
        while self.sources_cursor < self.sources.len() {
            let v = self.sources[self.sources_cursor];
            self.sources_cursor += 1;
            let i = v as usize;
            if !removed[i] && in_deg[i] == 0 && out_deg[i] > 0 {
                return Some(v);
            }
        }
        None
    }

    fn take_max_delta(&mut self, removed: &[bool], out_deg: &[i64], in_deg: &[i64]) -> Option<u32> {
        while self.max_bucket >= 0 {
            let k = self.max_bucket as usize;
            while self.bucket_cursor[k] < self.buckets[k].len() {
                let v = self.buckets[k][self.bucket_cursor[k]];
                self.bucket_cursor[k] += 1;
                let i = v as usize;
                if !removed[i]
                    && out_deg[i] > 0
                    && in_deg[i] > 0
                    && out_deg[i] - in_deg[i] + self.offset == k as i64
                {
                    return Some(v);
                }
            }
            // Exhausted for now; `file` will raise `max_bucket` again if this level refills.
            self.max_bucket -= 1;
        }
        None
    }
}

/// Greedy Eades-Lin-Smyth sequence heuristic. `arcs` are (from, to, edge_index) restricted to
/// one SCC. Returns the edge indices of the feedback arc set, sorted ascending.
/// Guarantee: |FAS| <= m/2 - n/6, linear time.
///
/// Contract subtleties:
///
/// - Node ids in `arcs` that are absent from `nodes_in_scc` are ignored, so a caller may hand over
///   a superset of the component's arcs without pre-filtering the endpoints.
/// - A self-loop `(v, v, e)` is always returned: it is a cycle of length one, and no vertex
///   sequence can order it away.
/// - Parallel arcs are handled independently — each one is judged on its own direction, so a pair
///   of anti-parallel arcs contributes exactly one feedback arc.
/// - The result is deduplicated and sorted, so the caller may use it as a set directly.
pub fn eades_feedback_arc_set(nodes_in_scc: &[u32], arcs: &[(u32, u32, u32)]) -> Vec<u32> {
    let n = nodes_in_scc.len();
    if n == 0 {
        return Vec::new();
    }

    // Lookup only — never iterated, so it cannot leak hash order into the result.
    let mut local_of: HashMap<u32, u32> = HashMap::with_capacity(n);
    for (i, &g) in nodes_in_scc.iter().enumerate() {
        local_of.entry(g).or_insert(i as u32);
    }

    let mut fas: Vec<u32> = Vec::new();
    let mut local_arcs: Vec<(u32, u32, u32)> = Vec::with_capacity(arcs.len());
    for &(from, to, e) in arcs {
        let (Some(&u), Some(&v)) = (local_of.get(&from), local_of.get(&to)) else {
            continue;
        };
        if u == v {
            fas.push(e);
        } else {
            local_arcs.push((u, v, e));
        }
    }

    let out_csr = Csr::build(n, &local_arcs);
    let flipped: Vec<(u32, u32, u32)> = local_arcs.iter().map(|&(u, v, e)| (v, u, e)).collect();
    let in_csr = Csr::build(n, &flipped);

    let mut out_deg: Vec<i64> = (0..n).map(|i| out_csr.degree(i as u32) as i64).collect();
    let mut in_deg: Vec<i64> = (0..n).map(|i| in_csr.degree(i as u32) as i64).collect();
    let mut removed = vec![false; n];

    // `out_deg - in_deg` lies in [-m, m]; shifting by m indexes the bucket array.
    let offset = local_arcs.len() as i64;
    let mut index = DeltaIndex::new(offset);

    // Ascending initial fill: within a bucket, ties are then broken by ascending local index,
    // which for a Tarjan component means ascending node index.
    for v in 0..n as u32 {
        index.file(v, &out_deg, &in_deg);
    }

    let mut left: Vec<u32> = Vec::with_capacity(n);
    let mut right: Vec<u32> = Vec::with_capacity(n);
    let mut remaining = n;

    while remaining > 0 {
        // Sinks first, then sources, then max delta — the Eades-Lin-Smyth priority, and the
        // reason the size bound holds.
        let picked = index
            .take_sink(&removed, &out_deg)
            .map(|v| (v, true))
            .or_else(|| {
                index
                    .take_source(&removed, &out_deg, &in_deg)
                    .map(|v| (v, false))
            })
            .or_else(|| {
                index
                    .take_max_delta(&removed, &out_deg, &in_deg)
                    .map(|v| (v, false))
            });

        // Unreachable while the filing invariant holds; bail rather than spin if it ever does not.
        let Some((v, to_right)) = picked else {
            break;
        };

        removed[v as usize] = true;
        remaining -= 1;
        if to_right {
            right.push(v);
        } else {
            left.push(v);
        }

        for idx in out_csr.range(v) {
            let w = out_csr.targets[idx] as usize;
            if !removed[w] {
                in_deg[w] -= 1;
                index.file(w as u32, &out_deg, &in_deg);
            }
        }
        for idx in in_csr.range(v) {
            let u = in_csr.targets[idx] as usize;
            if !removed[u] {
                out_deg[u] -= 1;
                index.file(u as u32, &out_deg, &in_deg);
            }
        }
    }

    // Sinks were collected front-to-back but belong at the tail in discovery-reversed order.
    right.reverse();
    let mut pos = vec![u32::MAX; n];
    for (i, &v) in left.iter().chain(right.iter()).enumerate() {
        pos[v as usize] = i as u32;
    }

    for &(u, v, e) in &local_arcs {
        if pos[u as usize] >= pos[v as usize] {
            fas.push(e);
        }
    }

    fas.sort_unstable();
    fas.dedup();
    fas
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Reverses the arcs named by `fas` and checks the result has no directed cycle, by Kahn.
    fn acyclic_after_reversal(n: usize, arcs: &[(u32, u32, u32)], fas: &[u32]) -> bool {
        let mut in_deg = vec![0usize; n];
        let mut adj: Vec<Vec<u32>> = vec![Vec::new(); n];
        for &(u, v, e) in arcs {
            let (u, v) = if fas.contains(&e) { (v, u) } else { (u, v) };
            adj[u as usize].push(v);
            in_deg[v as usize] += 1;
        }
        let mut queue: Vec<u32> = (0..n as u32).filter(|&v| in_deg[v as usize] == 0).collect();
        let mut seen = 0usize;
        while let Some(v) = queue.pop() {
            seen += 1;
            for &w in &adj[v as usize] {
                in_deg[w as usize] -= 1;
                if in_deg[w as usize] == 0 {
                    queue.push(w);
                }
            }
        }
        seen == n
    }

    #[test]
    fn empty_component_returns_empty() {
        assert!(eades_feedback_arc_set(&[], &[]).is_empty());
        assert!(eades_feedback_arc_set(&[0, 1], &[]).is_empty());
    }

    #[test]
    fn three_cycle_returns_exactly_one_edge() {
        let arcs = [(0, 1, 0), (1, 2, 1), (2, 0, 2)];
        let fas = eades_feedback_arc_set(&[0, 1, 2], &arcs);
        assert_eq!(fas.len(), 1);
        assert!(acyclic_after_reversal(3, &arcs, &fas));
    }

    #[test]
    fn dag_returns_empty() {
        let arcs = [(0, 1, 0), (1, 2, 1), (0, 2, 2)];
        assert!(eades_feedback_arc_set(&[0, 1, 2], &arcs).is_empty());
    }

    #[test]
    fn two_cycle_returns_exactly_one_of_the_pair() {
        let arcs = [(0, 1, 0), (1, 0, 1)];
        let fas = eades_feedback_arc_set(&[0, 1], &arcs);
        assert_eq!(fas.len(), 1);
        assert!(acyclic_after_reversal(2, &arcs, &fas));
    }

    #[test]
    fn self_loop_is_always_in_the_feedback_set() {
        let arcs = [(0, 0, 7), (0, 1, 8), (1, 0, 9)];
        let fas = eades_feedback_arc_set(&[0, 1], &arcs);
        assert!(fas.contains(&7));
        assert_eq!(fas.len(), 2);
    }

    #[test]
    fn arcs_touching_foreign_nodes_are_ignored() {
        // Node 9 is not in the component; its arcs must not influence the sequence or the result.
        let arcs = [(0, 1, 0), (1, 0, 1), (0, 9, 2), (9, 1, 3)];
        let fas = eades_feedback_arc_set(&[0, 1], &arcs);
        assert!(!fas.contains(&2));
        assert!(!fas.contains(&3));
        assert_eq!(fas.len(), 1);
    }

    #[test]
    fn result_is_sorted_ascending_and_deduplicated() {
        // A 5-ring with a chord, arc indices deliberately out of order.
        let arcs = [
            (0, 1, 40),
            (1, 2, 30),
            (2, 3, 20),
            (3, 4, 10),
            (4, 0, 0),
            (3, 1, 50),
        ];
        let fas = eades_feedback_arc_set(&[0, 1, 2, 3, 4], &arcs);
        let mut sorted = fas.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(fas, sorted);
        assert!(acyclic_after_reversal(5, &arcs, &fas));
    }

    /// Asserts the Eades-Lin-Smyth size bound. It holds for simple digraphs without 2-cycles, so
    /// every caller of this helper must supply such a graph.
    fn assert_eades_bound(node_count: usize, arc_count: usize, fas_len: usize) {
        let bound = arc_count as f64 / 2.0 - node_count as f64 / 6.0;
        assert!(
            fas_len as f64 <= bound,
            "|FAS| = {} exceeded the Eades bound {}",
            fas_len,
            bound
        );
    }

    #[test]
    fn respects_the_eades_size_bound_on_a_dense_circulant() {
        // Circulant digraph on 7 nodes with steps {1, 2, 3}: 21 arcs, every node on many cycles,
        // and no 2-cycles (no step k has 7 - k also a step), so the bound applies.
        let n = 7u32;
        let mut arcs: Vec<(u32, u32, u32)> = Vec::new();
        for i in 0..n {
            for k in 1..=3u32 {
                arcs.push((i, (i + k) % n, arcs.len() as u32));
            }
        }
        let nodes: Vec<u32> = (0..n).collect();
        let fas = eades_feedback_arc_set(&nodes, &arcs);
        assert_eades_bound(nodes.len(), arcs.len(), fas.len());
        assert!(acyclic_after_reversal(n as usize, &arcs, &fas));
    }

    #[test]
    fn breaks_every_cycle_in_a_dense_mesh() {
        // A 12-ring plus every (i, i+5) chord: many overlapping cycles, still no 2-cycles.
        let n = 12u32;
        let mut arcs: Vec<(u32, u32, u32)> = Vec::new();
        for i in 0..n {
            arcs.push((i, (i + 1) % n, arcs.len() as u32));
            arcs.push((i, (i + 5) % n, arcs.len() as u32));
        }
        let nodes: Vec<u32> = (0..n).collect();
        let fas = eades_feedback_arc_set(&nodes, &arcs);
        assert!(!fas.is_empty());
        assert_eades_bound(nodes.len(), arcs.len(), fas.len());
        assert!(acyclic_after_reversal(n as usize, &arcs, &fas));
    }

    #[test]
    fn is_deterministic_across_runs() {
        let n = 30u32;
        let mut arcs: Vec<(u32, u32, u32)> = Vec::new();
        for i in 0..n {
            arcs.push((i, (i + 1) % n, arcs.len() as u32));
            arcs.push((i, (i * 7 + 3) % n, arcs.len() as u32));
        }
        let nodes: Vec<u32> = (0..n).collect();
        let a = eades_feedback_arc_set(&nodes, &arcs);
        let b = eades_feedback_arc_set(&nodes, &arcs);
        assert_eq!(a, b);
    }
}
