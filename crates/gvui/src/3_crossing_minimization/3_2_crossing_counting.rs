//! # Step 3.2 (Phase 5a): Crossing counting
//!
//! Phase 5 is the engine's only search, and a search is only as affordable as its objective
//! function. Two objectives live here:
//!
//! - [`count_between_ranks`] / [`count_all`] — the **exact combinatorial** crossing number of the
//!   current item ordering, via the Barth-Mutzel-Juenger accumulator tree in `O(E log V)`.
//!   v1 counted in `O(E^2)` *and* cloned a `Vec<String>` per layer per call, which is why its
//!   sweep budget had to be neutered by an early return. Everything Phase 5 does is affordable
//!   only because this is cheap.
//! - [`detect_geometric_crossings`] — crossings measured on the emitted polylines. This is a
//!   **reporting** function, never an optimization target. A large gap between it and
//!   [`count_all`] means Phase 8 introduced crossings that Phase 5 had already resolved, which is
//!   a bug rather than a tuning opportunity.
//!
//! Both rank counters read [`crate::types::Item::order`] and never the physical slice position, so
//! they stay correct while Phase 5 is mid-permutation.

use crate::types::{EdgeCrossing, EdgeRole, Layered, Point, RoutedPath};
use std::collections::HashMap;

// =============================================================================================
// Adjacency access
// =============================================================================================

/// Successors of `item` in the next rank.
///
/// Returns an empty slice when the CSR was never built for that item instead of panicking, so a
/// degenerate or partially built [`Layered`] cannot take the whole layout down. Callers must not
/// treat an empty slice as "no such item".
#[inline]
pub fn down_neighbours(layered: &Layered, item: u32) -> &[u32] {
    if (item as usize) + 1 < layered.down.offsets.len() {
        layered.down.neighbours(item)
    } else {
        &[]
    }
}

/// Predecessors of `item` in the previous rank. Same tolerance as [`down_neighbours`].
#[inline]
pub fn up_neighbours(layered: &Layered, item: u32) -> &[u32] {
    if (item as usize) + 1 < layered.up.offsets.len() {
        layered.up.neighbours(item)
    } else {
        &[]
    }
}

// =============================================================================================
// Combinatorial counting — Barth, Mutzel & Juenger
// =============================================================================================

/// Exact number of pair crossings between rank `upper` and rank `upper + 1`.
///
/// Barth-Mutzel-Juenger accumulator tree: sort the arcs by `(source order, target order)`, then
/// insert target orders into a binary indexed tree, accumulating the number of already-inserted
/// targets that are strictly greater. `O(E log V)`.
///
/// Sorting by `(source, target)` is what makes edges that share an endpoint count as
/// non-crossing for free: an arc inserted earlier from the same source always has a target that is
/// less than or equal to the current one, so it is never counted.
///
/// Returns 0 when `upper` is the last rank, so callers may probe out-of-range ranks freely — the
/// transpose pass relies on that to avoid branching on rank boundaries.
pub fn count_between_ranks(layered: &Layered, upper: u16) -> usize {
    let r = upper as usize;
    if r + 1 >= layered.rank_ranges.len() {
        return 0;
    }
    let q = layered.rank_ranges[r + 1].len();
    if q < 2 {
        // A single target slot cannot host an inversion.
        return 0;
    }

    let upper_range = layered.rank_ranges[r].clone();
    let mut arcs: Vec<(u16, u16)> = Vec::with_capacity(upper_range.len() * 2);
    for i in upper_range.start..upper_range.end {
        let src_order = match layered.items.get(i as usize) {
            Some(item) => item.order,
            None => continue,
        };
        for &t in down_neighbours(layered, i) {
            if let Some(target) = layered.items.get(t as usize) {
                arcs.push((src_order, target.order));
            }
        }
    }
    if arcs.len() < 2 {
        return 0;
    }
    arcs.sort_unstable();

    // Accumulator tree over 2^ceil(log2(q)) leaves. Node 0 is the root; leaf `k` is at `k + size-1`.
    let mut size = 1usize;
    while size < q {
        size <<= 1;
    }
    // `2 * size` rather than the tight `2 * size - 1`: the sibling probe below reads `index + 1`
    // and one spare cell removes the need for a bounds branch in the hot loop.
    let mut tree = vec![0u32; 2 * size];

    let mut crossings = 0usize;
    for &(_, target_order) in arcs.iter() {
        if target_order as usize >= q {
            // An `order` outside its own rank means Phase 4 or Phase 5 broke the rank-major
            // invariant, or a `down` arc reached a non-adjacent rank. Guard on `q` rather than on
            // `tree.len()`: a leaf index can be in bounds while the sibling probe below
            // (`tree[index + 1]`) is not, so a length check alone still panics.
            continue;
        }
        let mut index = target_order as usize + size - 1;
        tree[index] += 1;
        while index > 0 {
            if index % 2 == 1 {
                crossings += tree[index + 1] as usize;
            }
            index = (index - 1) / 2;
            tree[index] += 1;
        }
    }
    crossings
}

/// Total crossings over every adjacent rank pair.
///
/// This is the value Phase 5's driver minimizes and the value reported as
/// [`crate::types::LayoutMetrics::crossings`]. Rank pairs are independent, so the sum is exact.
pub fn count_all(layered: &Layered) -> usize {
    let rank_count = layered.rank_count();
    if rank_count < 2 {
        return 0;
    }
    let last = (rank_count - 1).min(u16::MAX as usize);
    let mut total = 0usize;
    for r in 0..last {
        total = total.saturating_add(count_between_ranks(layered, r as u16));
    }
    total
}

// =============================================================================================
// Geometric crossings — metrics only
// =============================================================================================

/// One polyline segment, carrying its bounding box so the sweep never recomputes it.
#[derive(Clone, Copy)]
struct Seg {
    /// Index into the `routes` slice, not an edge index.
    route: u32,
    /// Position of this segment within the whole segment set; makes the sweep order total.
    seq: u32,
    a: Point,
    b: Point,
    min_x: f64,
    max_x: f64,
    min_y: f64,
    max_y: f64,
}

/// Geometric crossings between emitted polylines, for the metrics report only.
///
/// Uses a left-to-right sweep with an active list keyed on `max_x`, so the cost is
/// `O(n log n + p)` where `p` is the number of x-overlapping segment pairs rather than the
/// `O(n^2)` of an all-pairs scan. Only **proper** intersections count: two routes that merely
/// touch at a shared port or run collinearly are not crossings.
///
/// Output order is deterministic — segments are visited in `(min_x, route, seq)` order and the
/// active list preserves insertion order — and each pair is reported with the lower route index
/// first, so the result is stable across processes.
pub fn detect_geometric_crossings(
    routes: &[RoutedPath],
    edge_roles: &HashMap<String, EdgeRole>,
    epsilon: f64,
) -> Vec<EdgeCrossing> {
    let mut segs: Vec<Seg> = Vec::new();
    for (ri, route) in routes.iter().enumerate() {
        if route.points.len() < 2 {
            continue;
        }
        for w in route.points.windows(2) {
            let (a, b) = (w[0], w[1]);
            if !a.x.is_finite() || !a.y.is_finite() || !b.x.is_finite() || !b.y.is_finite() {
                continue;
            }
            if (a.x - b.x).abs() <= epsilon && (a.y - b.y).abs() <= epsilon {
                // Degenerate point segment: cannot cross anything.
                continue;
            }
            let seq = segs.len() as u32;
            segs.push(Seg {
                route: ri as u32,
                seq,
                a,
                b,
                min_x: a.x.min(b.x),
                max_x: a.x.max(b.x),
                min_y: a.y.min(b.y),
                max_y: a.y.max(b.y),
            });
        }
    }
    if segs.len() < 2 {
        return Vec::new();
    }

    let mut order: Vec<usize> = (0..segs.len()).collect();
    order.sort_by(|&l, &r| {
        segs[l]
            .min_x
            .total_cmp(&segs[r].min_x)
            .then(segs[l].route.cmp(&segs[r].route))
            .then(segs[l].seq.cmp(&segs[r].seq))
    });

    let mut crossings: Vec<EdgeCrossing> = Vec::new();
    let mut active: Vec<usize> = Vec::new();
    for &si in order.iter() {
        let cur = segs[si];
        active.retain(|&ai| segs[ai].max_x >= cur.min_x - epsilon);
        for &ai in active.iter() {
            let other = segs[ai];
            if other.route == cur.route {
                continue;
            }
            if other.max_y < cur.min_y - epsilon || cur.max_y < other.min_y - epsilon {
                continue;
            }
            let point = match proper_intersection(&other, &cur, epsilon) {
                Some(p) => p,
                None => continue,
            };
            let (lo, hi) = if other.route < cur.route {
                (other.route as usize, cur.route as usize)
            } else {
                (cur.route as usize, other.route as usize)
            };
            let id_a = routes[lo].edge_id.as_str();
            let id_b = routes[hi].edge_id.as_str();
            let owner = bridge_owner_edge_id(
                (id_a, edge_roles.get(id_a).copied()),
                (id_b, edge_roles.get(id_b).copied()),
            );
            crossings.push(EdgeCrossing {
                edge_id_a: id_a.to_string(),
                edge_id_b: id_b.to_string(),
                point,
                bridge_owner_edge_id: Some(owner),
            });
        }
        active.push(si);
    }
    crossings
}

/// Ranks edge roles for bridge-arc ownership. Higher wins and stays straight.
///
/// Preserved from v1 because the renderer keys its bridge glyphs off this ordering.
pub fn role_priority(role: Option<EdgeRole>) -> u8 {
    match role {
        Some(EdgeRole::Forward) => 4,
        Some(EdgeRole::Cross) => 3,
        Some(EdgeRole::Feedback) => 2,
        Some(EdgeRole::SelfRole) | Some(EdgeRole::SelfLoop) => 1,
        None => 0,
    }
}

/// Picks which of two crossing edges draws the bridge arc: the **lower**-priority one hops.
///
/// Ties are broken by edge id so the choice is stable regardless of the order the pair was
/// discovered in.
pub fn bridge_owner_edge_id(
    edge_a: (&str, Option<EdgeRole>),
    edge_b: (&str, Option<EdgeRole>),
) -> String {
    let prio_a = role_priority(edge_a.1);
    let prio_b = role_priority(edge_b.1);
    if prio_a != prio_b {
        if prio_a > prio_b {
            edge_b.0.to_string()
        } else {
            edge_a.0.to_string()
        }
    } else if edge_a.0 < edge_b.0 {
        edge_b.0.to_string()
    } else {
        edge_a.0.to_string()
    }
}

/// Strict interior intersection of two segments, or `None`.
///
/// Axis-aligned pairs are handled exactly; anything else (spline or straight edge styles) falls
/// back to the orientation straddle test. Parallel pairs never cross, collinear or not.
fn proper_intersection(s1: &Seg, s2: &Seg, eps: f64) -> Option<Point> {
    let h1 = (s1.a.y - s1.b.y).abs() <= eps;
    let v1 = (s1.a.x - s1.b.x).abs() <= eps;
    let h2 = (s2.a.y - s2.b.y).abs() <= eps;
    let v2 = (s2.a.x - s2.b.x).abs() <= eps;

    if h1 && v2 {
        return ortho_cross(s1, s2, eps);
    }
    if v1 && h2 {
        return ortho_cross(s2, s1, eps);
    }
    if (h1 && h2) || (v1 && v2) {
        return None;
    }
    general_cross(s1, s2, eps)
}

/// Intersection of a horizontal segment with a vertical one, strictly inside both.
fn ortho_cross(h: &Seg, v: &Seg, eps: f64) -> Option<Point> {
    let x = v.a.x;
    let y = h.a.y;
    if x > h.min_x + eps && x < h.max_x - eps && y > v.min_y + eps && y < v.max_y - eps {
        Some(Point { x, y })
    } else {
        None
    }
}

/// 2D cross product of `(q - p)` and `(r - q)`; sign gives the turn direction.
fn orient(p: Point, q: Point, r: Point) -> f64 {
    (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
}

/// Orientation straddle test plus the parametric intersection point.
fn general_cross(s1: &Seg, s2: &Seg, eps: f64) -> Option<Point> {
    let o1 = orient(s1.a, s1.b, s2.a);
    let o2 = orient(s1.a, s1.b, s2.b);
    let o3 = orient(s2.a, s2.b, s1.a);
    let o4 = orient(s2.a, s2.b, s1.b);
    let straddle1 = (o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps);
    let straddle2 = (o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps);
    if !(straddle1 && straddle2) {
        return None;
    }
    let d1x = s1.b.x - s1.a.x;
    let d1y = s1.b.y - s1.a.y;
    let d2x = s2.b.x - s2.a.x;
    let d2y = s2.b.y - s2.a.y;
    let denom = d1x * d2y - d1y * d2x;
    if denom.abs() <= f64::EPSILON {
        return None;
    }
    let t = ((s2.a.x - s1.a.x) * d2y - (s2.a.y - s1.a.y) * d2x) / denom;
    let p = Point {
        x: s1.a.x + t * d1x,
        y: s1.a.y + t * d1y,
    };
    if p.x.is_finite() && p.y.is_finite() {
        Some(p)
    } else {
        None
    }
}

// =============================================================================================
// Shared test fixtures
// =============================================================================================

/// Hand-built [`Layered`] graphs and a brute-force crossing reference, shared by the unit tests of
/// every Phase 5 module. Test-only.
#[cfg(test)]
pub(crate) mod fixtures {
    use crate::types::{Csr, Item, ItemKind, Layered};

    /// Builds a layered graph of `rank_sizes[r]` real items per rank, wired by `arcs` given as
    /// `(global item index, global item index)` pairs pointing from rank `r` to rank `r + 1`.
    pub(crate) fn build_layered(rank_sizes: &[usize], arcs: &[(u32, u32)]) -> Layered {
        let mut items = Vec::new();
        let mut rank_ranges = Vec::new();
        let mut next: u32 = 0;
        for (r, &n) in rank_sizes.iter().enumerate() {
            let start = next;
            for o in 0..n {
                items.push(Item {
                    kind: ItemKind::Real(next),
                    rank: r as u16,
                    order: o as u16,
                    width: 10.0,
                    height: 10.0,
                    x: 0.0,
                    y: 0.0,
                });
                next += 1;
            }
            rank_ranges.push(start..next);
        }
        let count = items.len();
        let down_arcs: Vec<(u32, u32, u32)> = arcs
            .iter()
            .enumerate()
            .map(|(e, &(a, b))| (a, b, e as u32))
            .collect();
        let up_arcs: Vec<(u32, u32, u32)> = arcs
            .iter()
            .enumerate()
            .map(|(e, &(a, b))| (b, a, e as u32))
            .collect();
        Layered {
            items,
            rank_ranges,
            up: Csr::build(count, &up_arcs),
            down: Csr::build(count, &down_arcs),
            chains: Vec::new(),
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: (0..count as u32).collect(),
        }
    }

    /// Retags an item so tests can exercise dummy/label handling.
    pub(crate) fn set_kind(layered: &mut Layered, item: u32, kind: ItemKind) {
        if let Some(it) = layered.items.get_mut(item as usize) {
            it.kind = kind;
        }
    }

    /// Rewrites one rank's `order` fields: `slots[k]` is the global item index that must end up at
    /// order `k`.
    ///
    /// Deliberately does **not** move items physically — that would invalidate the CSRs, which
    /// address items by slice index. Crossing counting reads `order`, so the graph is countable
    /// immediately; call `ordering::materialize` (or any public ordering pass) to reconcile the
    /// slice.
    pub(crate) fn set_orders(layered: &mut Layered, slots: &[u32]) {
        for (k, &i) in slots.iter().enumerate() {
            if let Some(item) = layered.items.get_mut(i as usize) {
                item.order = k as u16;
            }
        }
    }

    /// Current global index of the item tagged `ItemKind::Real(node)`. Item indices move whenever
    /// an ordering pass materializes, so tests that reorder after a pass must look items up by
    /// identity rather than reusing an index they captured earlier.
    pub(crate) fn item_of_real(layered: &Layered, node: u32) -> u32 {
        layered
            .items
            .iter()
            .position(|it| it.kind == ItemKind::Real(node))
            .map(|i| i as u32)
            .unwrap_or(u32::MAX)
    }

    /// `O(E^2)` reference implementation of [`super::count_between_ranks`].
    pub(crate) fn brute_force_between(layered: &Layered, upper: u16) -> usize {
        let r = upper as usize;
        if r + 1 >= layered.rank_ranges.len() {
            return 0;
        }
        let range = layered.rank_ranges[r].clone();
        let mut arcs: Vec<(u16, u16)> = Vec::new();
        for i in range.start..range.end {
            let so = layered.items[i as usize].order;
            for &t in super::down_neighbours(layered, i) {
                arcs.push((so, layered.items[t as usize].order));
            }
        }
        let mut count = 0usize;
        for i in 0..arcs.len() {
            for j in (i + 1)..arcs.len() {
                let (u1, v1) = arcs[i];
                let (u2, v2) = arcs[j];
                if (u1 < u2 && v1 > v2) || (u1 > u2 && v1 < v2) {
                    count += 1;
                }
            }
        }
        count
    }

    /// Deterministic 64-bit LCG. Tests must never depend on a real RNG.
    pub(crate) struct Lcg(pub u64);

    impl Lcg {
        pub(crate) fn next_u32(&mut self) -> u32 {
            self.0 = self
                .0
                .wrapping_mul(6_364_136_223_846_793_005)
                .wrapping_add(1_442_695_040_888_963_407);
            (self.0 >> 33) as u32
        }

        pub(crate) fn below(&mut self, n: u32) -> u32 {
            if n == 0 {
                0
            } else {
                self.next_u32() % n
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::fixtures::*;
    use super::*;
    use crate::types::PortRef;
    use crate::types::Side;

    fn port(x: f64, y: f64) -> PortRef {
        PortRef {
            node_id: "n".to_string(),
            side: Side::Bottom,
            index: 0,
            point: Point { x, y },
            stub: Point { x, y },
        }
    }

    fn route(id: &str, pts: &[(f64, f64)]) -> RoutedPath {
        let points: Vec<Point> = pts.iter().map(|&(x, y)| Point { x, y }).collect();
        let first = *points.first().unwrap_or(&Point { x: 0.0, y: 0.0 });
        let last = *points.last().unwrap_or(&Point { x: 0.0, y: 0.0 });
        RoutedPath {
            edge_id: id.to_string(),
            points,
            source_port: port(first.x, first.y),
            target_port: port(last.x, last.y),
        }
    }

    #[test]
    fn empty_and_degenerate_inputs_count_zero() {
        let empty = Layered::default();
        assert_eq!(count_all(&empty), 0);
        assert_eq!(count_between_ranks(&empty, 0), 0);

        // A single rank has no adjacent pair.
        let one = build_layered(&[3], &[]);
        assert_eq!(count_all(&one), 0);

        // Two ranks, no arcs.
        let bare = build_layered(&[2, 2], &[]);
        assert_eq!(count_all(&bare), 0);

        // Probing past the last rank must be safe, not a panic.
        assert_eq!(count_between_ranks(&bare, 9), 0);
    }

    #[test]
    fn planar_ladder_has_no_crossings() {
        // 0,1,2 | 3,4,5  with straight-through arcs.
        let l = build_layered(&[3, 3], &[(0, 3), (1, 4), (2, 5)]);
        assert_eq!(count_between_ranks(&l, 0), 0);
        assert_eq!(count_all(&l), 0);
    }

    #[test]
    fn single_inversion_counts_exactly_one() {
        // 0,1 | 2,3 with 0->3 and 1->2.
        let l = build_layered(&[2, 2], &[(0, 3), (1, 2)]);
        assert_eq!(count_between_ranks(&l, 0), 1);
        assert_eq!(count_all(&l), 1);
    }

    #[test]
    fn shared_endpoints_never_cross() {
        // Fan-out from one source and fan-in to one target both yield zero.
        let fan_out = build_layered(&[1, 3], &[(0, 1), (0, 2), (0, 3)]);
        assert_eq!(count_all(&fan_out), 0);
        let fan_in = build_layered(&[3, 1], &[(0, 3), (1, 3), (2, 3)]);
        assert_eq!(count_all(&fan_in), 0);
    }

    #[test]
    fn full_reversal_counts_all_pairs() {
        // Four arcs in reverse order cross pairwise: C(4,2) = 6.
        let l = build_layered(&[4, 4], &[(0, 7), (1, 6), (2, 5), (3, 4)]);
        assert_eq!(count_between_ranks(&l, 0), 6);
    }

    #[test]
    fn bmj_matches_brute_force_on_random_bipartite_layers() {
        let mut rng = Lcg(0x5eed_1234_abcd_0001);
        for trial in 0..200u32 {
            let upper = 1 + rng.below(7) as usize;
            let lower = 1 + rng.below(7) as usize;
            let arc_count = rng.below(14);
            let mut arcs: Vec<(u32, u32)> = Vec::new();
            for _ in 0..arc_count {
                let a = rng.below(upper as u32);
                let b = upper as u32 + rng.below(lower as u32);
                arcs.push((a, b));
            }
            let l = build_layered(&[upper, lower], &arcs);
            assert_eq!(
                count_between_ranks(&l, 0),
                brute_force_between(&l, 0),
                "trial {trial}: upper={upper} lower={lower} arcs={arcs:?}"
            );
        }
    }

    #[test]
    fn bmj_matches_brute_force_across_many_ranks() {
        let mut rng = Lcg(0x5eed_1234_abcd_0002);
        for _ in 0..60u32 {
            let sizes: Vec<usize> = (0..4).map(|_| 1 + rng.below(5) as usize).collect();
            let mut starts = Vec::new();
            let mut acc = 0u32;
            for &s in &sizes {
                starts.push(acc);
                acc += s as u32;
            }
            let mut arcs: Vec<(u32, u32)> = Vec::new();
            for r in 0..sizes.len() - 1 {
                for _ in 0..rng.below(8) {
                    let a = starts[r] + rng.below(sizes[r] as u32);
                    let b = starts[r + 1] + rng.below(sizes[r + 1] as u32);
                    arcs.push((a, b));
                }
            }
            let l = build_layered(&sizes, &arcs);
            let reference: usize = (0..sizes.len() - 1)
                .map(|r| brute_force_between(&l, r as u16))
                .sum();
            assert_eq!(count_all(&l), reference);
        }
    }

    #[test]
    fn counting_follows_the_order_field_not_the_slice_position() {
        // Phase 5 mutates `order` before it permutes the slice; the count must track `order`.
        let mut l = build_layered(&[2, 2], &[(0, 2), (1, 3)]);
        assert_eq!(count_all(&l), 0);
        l.items[2].order = 1;
        l.items[3].order = 0;
        assert_eq!(count_all(&l), 1);
    }

    #[test]
    fn geometric_crossing_detected_between_two_polylines() {
        let routes = vec![
            route("a", &[(0.0, 10.0), (100.0, 10.0)]),
            route("b", &[(50.0, 0.0), (50.0, 40.0)]),
        ];
        let roles: HashMap<String, EdgeRole> = HashMap::new();
        let found = detect_geometric_crossings(&routes, &roles, 0.001);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].edge_id_a, "a");
        assert_eq!(found[0].edge_id_b, "b");
        assert!((found[0].point.x - 50.0).abs() < 1e-9);
        assert!((found[0].point.y - 10.0).abs() < 1e-9);
    }

    #[test]
    fn touching_endpoints_and_parallel_runs_are_not_crossings() {
        let routes = vec![
            // Meets `b` exactly at its endpoint — a shared port, not a crossing.
            route("a", &[(0.0, 10.0), (50.0, 10.0)]),
            route("b", &[(50.0, 10.0), (50.0, 40.0)]),
            // Collinear overlap with `a`.
            route("c", &[(20.0, 10.0), (80.0, 10.0)]),
        ];
        let roles: HashMap<String, EdgeRole> = HashMap::new();
        assert!(detect_geometric_crossings(&routes, &roles, 0.001).is_empty());
    }

    #[test]
    fn bridge_owner_is_the_lower_priority_edge() {
        let mut roles = HashMap::new();
        roles.insert("a".to_string(), EdgeRole::Forward);
        roles.insert("b".to_string(), EdgeRole::Feedback);
        let routes = vec![
            route("a", &[(0.0, 10.0), (100.0, 10.0)]),
            route("b", &[(50.0, 0.0), (50.0, 40.0)]),
        ];
        let found = detect_geometric_crossings(&routes, &roles, 0.001);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].bridge_owner_edge_id.as_deref(), Some("b"));
    }

    #[test]
    fn geometric_detection_is_order_stable() {
        let routes = vec![
            route("a", &[(0.0, 10.0), (100.0, 10.0)]),
            route("b", &[(30.0, 0.0), (30.0, 40.0)]),
            route("c", &[(70.0, 0.0), (70.0, 40.0)]),
        ];
        let roles: HashMap<String, EdgeRole> = HashMap::new();
        let first = detect_geometric_crossings(&routes, &roles, 0.001);
        let second = detect_geometric_crossings(&routes, &roles, 0.001);
        assert_eq!(first.len(), 2);
        let key = |v: &Vec<EdgeCrossing>| -> Vec<(String, String, i64, i64)> {
            v.iter()
                .map(|c| {
                    (
                        c.edge_id_a.clone(),
                        c.edge_id_b.clone(),
                        c.point.x as i64,
                        c.point.y as i64,
                    )
                })
                .collect()
        };
        assert_eq!(key(&first), key(&second));
    }
}
