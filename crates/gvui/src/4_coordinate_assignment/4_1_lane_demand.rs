//! # Step 4.1 (Phase 6): Routing demand
//!
//! This phase replaces the v1 route/measure/widen/retry loop with a single exact computation.
//!
//! Once Phase 5 has fixed the order of every item within its rank, the *topology* of every route is
//! already determined even though no coordinate exists yet: which channel a horizontal run crosses,
//! and which corridor a vertical run turns in, is pure combinatorics on the layered structure. So
//! the lane demand is computed here, in **order space**, and handed to Phase 7 as node separations.
//! Phase 7 then produces coordinates in which every route provably fits.
//!
//! Two facts make this exact rather than a heuristic:
//!
//! - The segments crossing one channel form an **interval graph** over the order axis. Interval
//!   graphs are perfect, so greedy colouring by ascending left endpoint uses exactly `omega`
//!   colours, where `omega` is the maximum overlap depth. That is the provable minimum, so the
//!   separation derived from it is exactly sufficient — never too small (routing cannot fail) and
//!   never larger than necessary (no wasted whitespace).
//! - Every flat edge in one corridor overlaps every other one, so a corridor's lane count is simply
//!   its segment count.
//!
//! There is consequently no rip-up, no reroute, and no "expand the gap and try again".

use crate::config::CustomLayoutConfig;
use crate::types::{ChannelSeg, CorridorSeg, GraphIr, Layered, RoutingDemand};
use std::cmp::Reverse;
use std::collections::{BinaryHeap, HashMap};

/// Computes every routing lane the fixed ordering implies, plus the node separations that guarantee
/// those lanes fit.
///
/// The returned [`RoutingDemand`] is the *only* channel through which a downstream requirement
/// (routing space) reaches an upstream decision (coordinate assignment). Phase 7 must treat
/// `rank_gap_min` and `separation_min` as hard lower bounds; if it honours them, Phase 8 can
/// materialise every polyline by table lookup and no route can fail.
///
/// Contract subtleties a caller can get wrong:
///
/// - `separation_min[(r, o)]` is the gap between the **facing edges** of the items at `(r, o)` and
///   `(r, o + 1)` — not a centre-to-centre distance. Phase 7 adds the two half-widths itself.
/// - `separation_min` is populated densely for every adjacent pair of every rank, and every entry is
///   already at least `config.effective_node_gap()`. A missing key therefore means "no such pair",
///   not "use the default".
/// - `rank_gap_min[r]` is the gap **below** rank `r`. The final entry is populated for uniform
///   indexing and is meaningless (there is no channel below the last rank).
/// - `lane_of_link[(edge, link)]` is defined for every adjacent-rank link of every chain, including
///   perfectly vertical ones. A vertical link reports lane `0` but is excluded from the colouring,
///   so it contributes nothing to `channel_lanes` — straight edges must not inflate a channel.
///
/// `ir` is consulted only as a fallback source of flat-edge label boxes when Phase 4 did not copy
/// the box onto the [`crate::types::FlatEdge`].
pub fn compute_routing_demand(
    layered: &Layered,
    ir: &GraphIr,
    config: &CustomLayoutConfig,
) -> RoutingDemand {
    let rank_count = layered.rank_count();
    if rank_count == 0 {
        return RoutingDemand::default();
    }

    // ---- 6a. Channel segments -----------------------------------------------------------------
    let (mut channel_segs, heads_left) = collect_channel_segs(layered, rank_count);

    // Membership is grouped into a dense `Vec` per channel, never a map, so nothing downstream can
    // depend on hash iteration order. Perfectly vertical links are excluded here: they need no
    // horizontal run, so letting them take a colour would widen the channel for nothing.
    let mut by_channel: Vec<Vec<u32>> = vec![Vec::new(); rank_count];
    for (i, seg) in channel_segs.iter().enumerate() {
        if seg.lo_order == seg.hi_order {
            continue;
        }
        by_channel[seg.rank as usize].push(i as u32);
    }

    // ---- 6b/6c. Optimal colouring, then the bus relabel ---------------------------------------
    let mut channel_lanes = vec![0u16; rank_count];
    for r in 0..rank_count {
        let members = &mut by_channel[r];
        let lanes = colour_channel(&mut channel_segs, members);
        relabel_channel(&mut channel_segs, &heads_left, members, lanes);
        channel_lanes[r] = lanes;
    }

    // ---- 6a/6b. Corridor segments --------------------------------------------------------------
    let (corridor_segs, corridor_lanes) = build_corridors(layered);
    let corridor_label_width = corridor_label_widths(layered, ir);

    // ---- 6d. Emit separations ------------------------------------------------------------------
    let lane_spacing = config.effective_lane_spacing();
    let stub_allowance = 2.0 * config.port_stub_length;
    let rank_gap_min: Vec<f64> = channel_lanes
        .iter()
        .map(|&lanes| {
            config
                .effective_rank_gap()
                .max(lanes as f64 * lane_spacing + stub_allowance)
        })
        .collect();

    let mut separation_min: HashMap<(u16, u16), f64> = HashMap::new();
    for r in 0..rank_count {
        let range = &layered.rank_ranges[r];
        let width = (range.end.saturating_sub(range.start) as usize).min(u16::MAX as usize);
        let rank = r as u16;
        for o in 0..width.saturating_sub(1) {
            let key = (rank, o as u16);
            let sep = separation_for(key, &corridor_lanes, &corridor_label_width, config);
            separation_min.insert(key, sep);
        }
    }
    // Defensive union: an order value that does not fall inside its rank's slice would otherwise
    // lose its demand entirely. Driven from a `Vec`, so it stays order-independent.
    for seg in &corridor_segs {
        let key = (seg.rank, seg.after_order);
        separation_min
            .entry(key)
            .or_insert_with(|| separation_for(key, &corridor_lanes, &corridor_label_width, config));
    }

    // ---- 6e. Per-link lane lookup for Phase 8 --------------------------------------------------
    let mut lane_of_link: HashMap<(u32, u32), u16> = HashMap::with_capacity(channel_segs.len());
    for seg in &channel_segs {
        lane_of_link.insert((seg.edge, seg.link), seg.lane);
    }

    RoutingDemand {
        channel_segs,
        channel_lanes,
        corridor_segs,
        corridor_lanes,
        rank_gap_min,
        separation_min,
        lane_of_link,
    }
}

// ------------------------------------------------------------------------------------------------
// 6a — segment collection
// ------------------------------------------------------------------------------------------------

/// Walks every chain and emits one [`ChannelSeg`] per adjacent-rank link.
///
/// Returns a parallel `heads_left` flag per segment: `true` when the link travels toward a smaller
/// order (`order(b) < order(a)`). [`ChannelSeg`] stores only the sorted interval, so the travel
/// direction has to be carried separately for the aesthetic relabel in 6c.
///
/// Links whose two items are not on consecutive ranks are skipped rather than trusted; a malformed
/// chain must not be able to index a channel that does not exist.
fn collect_channel_segs(layered: &Layered, rank_count: usize) -> (Vec<ChannelSeg>, Vec<bool>) {
    let mut segs: Vec<ChannelSeg> = Vec::new();
    let mut heads_left: Vec<bool> = Vec::new();

    for chain in &layered.chains {
        let link_count = chain.items.len().saturating_sub(1);
        for link in 0..link_count {
            let ia = chain.items[link];
            let ib = chain.items[link + 1];
            let (Some(a), Some(b)) = (
                layered.items.get(ia as usize),
                layered.items.get(ib as usize),
            ) else {
                continue;
            };
            if a.rank.abs_diff(b.rank) != 1 {
                continue;
            }
            let rank = a.rank.min(b.rank);
            if rank as usize >= rank_count {
                continue;
            }
            segs.push(ChannelSeg {
                edge: chain.edge,
                link: link as u32,
                rank,
                lo_order: a.order.min(b.order),
                hi_order: a.order.max(b.order),
                lane: 0,
            });
            heads_left.push(b.order < a.order);
        }
    }

    (segs, heads_left)
}

// ------------------------------------------------------------------------------------------------
// 6b — interval-graph colouring
// ------------------------------------------------------------------------------------------------

/// Colours one channel's segments and returns the number of lanes used, which equals the maximum
/// overlap depth of the interval set and is therefore the minimum possible.
///
/// `members` is sorted in place by `(lo_order, hi_order, edge, link)` and the caller relies on that
/// order afterwards. Two segments may share a lane iff their **closed** order intervals are
/// disjoint: the sweep retires an active segment only when `hi_order < lo_order` strictly, because
/// touching intervals meet at the same x and would overlap collinearly if they shared a lane.
///
/// Freed lanes are recycled lowest-first from a min-heap so the assignment depends only on the
/// interval set, never on allocation history.
fn colour_channel(segs: &mut [ChannelSeg], members: &mut [u32]) -> u16 {
    if members.is_empty() {
        return 0;
    }
    members.sort_unstable_by_key(|&i| {
        let s = &segs[i as usize];
        (s.lo_order, s.hi_order, s.edge, s.link)
    });

    // Keyed by (hi_order, lane) so the heap order is total and never depends on insertion order.
    let mut active: BinaryHeap<Reverse<(u16, u16)>> = BinaryHeap::new();
    let mut free_lanes: BinaryHeap<Reverse<u16>> = BinaryHeap::new();
    let mut next_lane: u16 = 0;

    for &m in members.iter() {
        let lo = segs[m as usize].lo_order;
        let hi = segs[m as usize].hi_order;
        while let Some(&Reverse((active_hi, active_lane))) = active.peek() {
            if active_hi < lo {
                active.pop();
                free_lanes.push(Reverse(active_lane));
            } else {
                break;
            }
        }
        let lane = match free_lanes.pop() {
            Some(Reverse(l)) => l,
            None => {
                let l = next_lane;
                // Saturating rather than wrapping: a channel with 65_535 mutually overlapping
                // segments is already pathological, and sharing the top lane is far better than
                // silently wrapping to lane 0.
                next_lane = next_lane.saturating_add(1);
                l
            }
        };
        segs[m as usize].lane = lane;
        active.push(Reverse((hi, lane)));
    }

    next_lane
}

// ------------------------------------------------------------------------------------------------
// 6c — lane ordering for the "bus" look
// ------------------------------------------------------------------------------------------------

/// Permutes the lane ids of one channel so the drawing reads as a bus instead of a tangle.
///
/// Which lane a segment occupies is free within the colouring, so it is chosen by the left-edge
/// rule from VLSI channel routing: segments travelling **left** take the outer (higher) lanes,
/// segments travelling **right** take the inner (lower) lanes, and within each group the longest
/// runs sit outermost. Parallel runs then align instead of weaving.
///
/// The permutation is applied to whole lanes, never to individual segments, so the colouring stays
/// valid by construction — two overlapping segments were in different lanes and remain so. The
/// sort key ends with the old lane id, which makes the ordering strictly total and the result
/// byte-identical across runs.
fn relabel_channel(segs: &mut [ChannelSeg], heads_left: &[bool], members: &[u32], lane_count: u16) {
    if lane_count <= 1 {
        return;
    }
    let n = lane_count as usize;
    let mut left_votes = vec![0u32; n];
    let mut right_votes = vec![0u32; n];
    let mut max_span = vec![0u16; n];
    let mut min_lo = vec![u16::MAX; n];
    let mut min_edge = vec![u32::MAX; n];

    for &m in members {
        let idx = m as usize;
        let seg = segs[idx];
        let lane = seg.lane as usize;
        if lane >= n {
            continue;
        }
        if heads_left.get(idx).copied().unwrap_or(false) {
            left_votes[lane] += 1;
        } else {
            right_votes[lane] += 1;
        }
        max_span[lane] = max_span[lane].max(seg.hi_order - seg.lo_order);
        min_lo[lane] = min_lo[lane].min(seg.lo_order);
        min_edge[lane] = min_edge[lane].min(seg.edge);
    }

    // Ascending key order becomes ascending lane order: rightward group first (inner), then the
    // leftward group (outer); inside each group, shorter runs first so the longest ends outermost.
    let mut order: Vec<u16> = (0..lane_count).collect();
    order.sort_unstable_by_key(|&lane| {
        let l = lane as usize;
        let dir_rank: u8 = if left_votes[l] > right_votes[l] { 1 } else { 0 };
        (dir_rank, max_span[l], min_lo[l], min_edge[l], lane)
    });

    let mut new_lane = vec![0u16; n];
    for (position, &old) in order.iter().enumerate() {
        new_lane[old as usize] = position as u16;
    }
    for &m in members {
        let lane = segs[m as usize].lane as usize;
        if lane < n {
            segs[m as usize].lane = new_lane[lane];
        }
    }
}

// ------------------------------------------------------------------------------------------------
// 6a/6b — corridors
// ------------------------------------------------------------------------------------------------

/// Emits one [`CorridorSeg`] per corridor a flat edge spans and colours each corridor.
///
/// Every flat edge in a rank occupies the whole rank band vertically, so inside one corridor every
/// segment conflicts with every other one and the optimal lane count is simply the segment count.
/// Lanes are handed out by ascending `(span, edge)` so the longest flat edge sits outermost — the
/// same aesthetic rule the channel relabel applies.
///
/// The returned `Vec` is sorted by `(rank, after_order, span, edge)`, which is a total order, so the
/// output is identical across runs.
fn build_corridors(layered: &Layered) -> (Vec<CorridorSeg>, HashMap<(u16, u16), u16>) {
    // (rank, after_order, span, edge)
    let mut raw: Vec<(u16, u16, u16, u32)> = Vec::new();
    for flat in &layered.flat_edges {
        let (Some(a), Some(b)) = (
            layered.items.get(flat.from_item as usize),
            layered.items.get(flat.to_item as usize),
        ) else {
            continue;
        };
        let lo = a.order.min(b.order);
        let hi = a.order.max(b.order);
        let span = hi - lo;
        for after in lo..hi {
            raw.push((flat.rank, after, span, flat.edge));
        }
    }
    raw.sort_unstable();

    let mut segs: Vec<CorridorSeg> = Vec::with_capacity(raw.len());
    let mut lanes: HashMap<(u16, u16), u16> = HashMap::new();
    let mut i = 0usize;
    while i < raw.len() {
        let (rank, after, _, _) = raw[i];
        let mut lane: u16 = 0;
        let mut j = i;
        while j < raw.len() && raw[j].0 == rank && raw[j].1 == after {
            segs.push(CorridorSeg {
                edge: raw[j].3,
                rank,
                after_order: after,
                lane,
            });
            lane = lane.saturating_add(1);
            j += 1;
        }
        lanes.insert((rank, after), lane);
        i = j;
    }

    (segs, lanes)
}

/// Widest flat-edge label box covering each corridor.
///
/// A flat edge's badge sits in the band between its endpoints, so every corridor the edge spans has
/// to be wide enough for it. Phase 4 normally copies the measured box onto the
/// [`crate::types::FlatEdge`]; the IR is consulted as a fallback so a flat edge never silently
/// loses its badge reservation.
fn corridor_label_widths(layered: &Layered, ir: &GraphIr) -> HashMap<(u16, u16), f64> {
    let mut widths: HashMap<(u16, u16), f64> = HashMap::new();
    for flat in &layered.flat_edges {
        let width = flat
            .label
            .map(|l| l.width)
            .or_else(|| {
                ir.edges
                    .get(flat.edge as usize)
                    .and_then(|e| e.label.as_ref())
                    .map(|l| l.width)
            })
            .unwrap_or(0.0);
        if !width.is_finite() || width <= 0.0 {
            continue;
        }
        let (Some(a), Some(b)) = (
            layered.items.get(flat.from_item as usize),
            layered.items.get(flat.to_item as usize),
        ) else {
            continue;
        };
        let lo = a.order.min(b.order);
        let hi = a.order.max(b.order);
        for after in lo..hi {
            let slot = widths.entry((flat.rank, after)).or_insert(0.0);
            if width > *slot {
                *slot = width;
            }
        }
    }
    widths
}

/// Minimum gap between the facing edges of the items at `(rank, order)` and `(rank, order + 1)`.
///
/// The routing demand and the base node gap are a `max`, not a sum — the lanes live *inside* the
/// gap. The flat-edge label is added on top because the badge and the lanes cannot share space.
fn separation_for(
    key: (u16, u16),
    corridor_lanes: &HashMap<(u16, u16), u16>,
    corridor_label_width: &HashMap<(u16, u16), f64>,
    config: &CustomLayoutConfig,
) -> f64 {
    let lanes = corridor_lanes.get(&key).copied().unwrap_or(0);
    let routing = lanes as f64 * config.effective_lane_spacing();
    let label = corridor_label_width.get(&key).copied().unwrap_or(0.0);
    config.effective_node_gap().max(routing) + label
}

// ------------------------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{EdgeChain, EdgeRole, FlatEdge, Item, ItemKind, LabelBox};

    fn cfg() -> CustomLayoutConfig {
        CustomLayoutConfig::default()
    }

    fn item(kind: ItemKind, rank: u16, order: u16) -> Item {
        Item {
            kind,
            rank,
            order,
            width: 100.0,
            height: 40.0,
            x: 0.0,
            y: 0.0,
        }
    }

    /// Two ranks of `top` / `bottom` real items, with one two-item chain per `(top_order,
    /// bottom_order)` pair. Edge index equals the position in `links`.
    fn two_rank(top: u16, bottom: u16, links: &[(u16, u16)]) -> Layered {
        let mut items = Vec::new();
        for o in 0..top {
            items.push(item(ItemKind::Real(o as u32), 0, o));
        }
        for o in 0..bottom {
            items.push(item(ItemKind::Real((top + o) as u32), 1, o));
        }
        let mut layered = Layered {
            items,
            rank_ranges: vec![0..top as u32, top as u32..(top + bottom) as u32],
            ..Default::default()
        };
        for (e, &(a, b)) in links.iter().enumerate() {
            layered.chains.push(EdgeChain {
                edge: e as u32,
                reversed: false,
                role: EdgeRole::Forward,
                items: vec![a as u32, (top + b) as u32],
                label_at: None,
            });
        }
        layered
    }

    /// Lane assigned to the link `0` of edge `e`.
    fn lane_of(demand: &RoutingDemand, e: u32) -> u16 {
        demand
            .lane_of_link
            .get(&(e, 0))
            .copied()
            .unwrap_or(u16::MAX)
    }

    /// Independent maximum-overlap-depth sweep. Closed intervals over integer orders, so the
    /// maximum clique of the interval graph is the maximum number of intervals containing a common
    /// integer point. Degenerate (`lo == hi`) intervals are excluded, exactly as the phase does.
    fn brute_force_max_depth(links: &[(u16, u16)]) -> u16 {
        let mut best = 0u16;
        let hi_bound = links.iter().map(|&(a, b)| a.max(b)).max().unwrap_or(0);
        for x in 0..=hi_bound {
            let mut depth = 0u16;
            for &(a, b) in links {
                let lo = a.min(b);
                let hi = a.max(b);
                if lo == hi {
                    continue;
                }
                if lo <= x && x <= hi {
                    depth += 1;
                }
            }
            best = best.max(depth);
        }
        best
    }

    #[test]
    fn empty_input_yields_empty_demand() {
        let layered = Layered::default();
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &cfg());
        assert!(demand.channel_segs.is_empty());
        assert!(demand.channel_lanes.is_empty());
        assert!(demand.corridor_segs.is_empty());
        assert!(demand.rank_gap_min.is_empty());
        assert!(demand.separation_min.is_empty());
        assert!(demand.lane_of_link.is_empty());
    }

    #[test]
    fn three_nested_intervals_need_three_lanes() {
        // [0,5] ⊃ [1,4] ⊃ [2,3]: mutually overlapping, so ω = 3.
        let links = [(0u16, 5u16), (1, 4), (2, 3)];
        let layered = two_rank(6, 6, &links);
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &cfg());

        assert_eq!(demand.channel_lanes[0], 3);
        let mut lanes: Vec<u16> = (0..3).map(|e| lane_of(&demand, e)).collect();
        lanes.sort_unstable();
        assert_eq!(
            lanes,
            vec![0, 1, 2],
            "three overlapping runs need distinct lanes"
        );
        // Every link of every chain is recorded, and the channel below the last rank is empty.
        assert_eq!(demand.lane_of_link.len(), 3);
        assert_eq!(demand.channel_lanes[1], 0);
    }

    #[test]
    fn three_disjoint_intervals_share_one_lane() {
        // [0,1], [2,3], [4,5] — pairwise disjoint (and not even touching), so ω = 1.
        let links = [(0u16, 1u16), (2, 3), (4, 5)];
        let layered = two_rank(6, 6, &links);
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &cfg());

        assert_eq!(demand.channel_lanes[0], 1);
        for e in 0..3 {
            assert_eq!(lane_of(&demand, e), 0, "disjoint runs all reuse lane 0");
        }
    }

    #[test]
    fn touching_intervals_do_not_share_a_lane() {
        // [0,2] and [2,4] meet at order 2: same x, collinear overlap, so they must be separated.
        let links = [(0u16, 2u16), (2, 4)];
        let layered = two_rank(5, 5, &links);
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &cfg());

        assert_eq!(demand.channel_lanes[0], 2);
        assert_ne!(lane_of(&demand, 0), lane_of(&demand, 1));
    }

    #[test]
    fn vertical_link_consumes_no_lane() {
        // Perfectly straight links: no horizontal run at all, so the channel stays empty.
        let links = [(0u16, 0u16), (1, 1), (2, 2)];
        let layered = two_rank(3, 3, &links);
        let c = cfg();
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &c);

        assert_eq!(demand.channel_lanes[0], 0);
        for e in 0..3 {
            assert_eq!(lane_of(&demand, e), 0);
        }
        assert_eq!(demand.channel_segs.len(), 3);
        assert_eq!(
            demand.rank_gap_min[0],
            c.effective_rank_gap().max(2.0 * c.port_stub_length),
            "straight edges must not inflate the rank gap"
        );
    }

    #[test]
    fn straight_link_mixed_with_a_run_does_not_inflate_the_channel() {
        let links = [(1u16, 1u16), (0, 3)];
        let layered = two_rank(4, 4, &links);
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &cfg());
        assert_eq!(demand.channel_lanes[0], 1);
    }

    #[test]
    fn rank_gap_grows_with_lane_count_and_never_drops_below_the_configured_gap() {
        let mut c = cfg();
        c.rank_gap = 10.0;
        c.lane_spacing = 40.0;
        c.port_stub_length = 5.0;

        let one = compute_routing_demand(&two_rank(6, 6, &[(0u16, 1u16)]), &GraphIr::default(), &c);
        let three = compute_routing_demand(
            &two_rank(6, 6, &[(0u16, 5u16), (1, 4), (2, 3)]),
            &GraphIr::default(),
            &c,
        );

        assert_eq!(one.channel_lanes[0], 1);
        assert_eq!(three.channel_lanes[0], 3);
        assert!(three.rank_gap_min[0] > one.rank_gap_min[0]);
        assert_eq!(three.rank_gap_min[0], 3.0 * 40.0 + 10.0);

        // With a large configured gap the lane demand is absorbed, never subtracted.
        c.rank_gap = 1000.0;
        let big = compute_routing_demand(
            &two_rank(6, 6, &[(0u16, 5u16), (1, 4), (2, 3)]),
            &GraphIr::default(),
            &c,
        );
        for r in 0..big.rank_gap_min.len() {
            assert!(big.rank_gap_min[r] >= c.effective_rank_gap());
        }
        assert_eq!(
            big.rank_gap_min.len(),
            2,
            "one entry per rank, last included"
        );
    }

    #[test]
    fn leftward_runs_take_outer_lanes_and_rightward_runs_inner() {
        // Edge 0: 0 -> 3, rightward, interval [0,3]. Edge 1: 3 -> 1, leftward, interval [1,3].
        // They overlap, so the colouring needs two lanes and the relabel decides which is which.
        let links = [(0u16, 3u16), (3, 1)];
        let layered = two_rank(4, 4, &links);
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &cfg());

        assert_eq!(demand.channel_lanes[0], 2);
        assert_eq!(lane_of(&demand, 0), 0, "rightward run takes the inner lane");
        assert_eq!(lane_of(&demand, 1), 1, "leftward run takes the outer lane");
    }

    #[test]
    fn longest_run_in_a_group_ends_outermost() {
        // All rightward and mutually overlapping; spans 5, 3, 1.
        let links = [(0u16, 5u16), (1, 4), (2, 3)];
        let layered = two_rank(6, 6, &links);
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &cfg());

        assert_eq!(lane_of(&demand, 2), 0, "shortest run innermost");
        assert_eq!(lane_of(&demand, 1), 1);
        assert_eq!(lane_of(&demand, 0), 2, "longest run outermost");
    }

    #[test]
    fn relabel_stays_a_valid_colouring() {
        // 200 pseudo-random intervals: after the relabel, no two overlapping segments may share a
        // lane and the lane ids must still be exactly 0..channel_lanes.
        let mut state: u64 = 0x5eed_1234_abcd_ef01;
        let mut next = || {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (state >> 33) as u16
        };
        let links: Vec<(u16, u16)> = (0..200).map(|_| (next() % 30, next() % 30)).collect();
        let layered = two_rank(30, 30, &links);
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &cfg());

        let lanes = demand.channel_lanes[0];
        let mut seen = vec![false; lanes as usize];
        let runs: Vec<&ChannelSeg> = demand
            .channel_segs
            .iter()
            .filter(|s| s.lo_order != s.hi_order)
            .collect();
        for s in &runs {
            assert!(s.lane < lanes);
            seen[s.lane as usize] = true;
        }
        assert!(
            seen.iter().all(|&b| b),
            "relabel must be a bijection on lanes"
        );
        for i in 0..runs.len() {
            for j in (i + 1)..runs.len() {
                let (a, b) = (runs[i], runs[j]);
                let overlaps = a.lo_order <= b.hi_order && b.lo_order <= a.hi_order;
                if overlaps {
                    assert_ne!(
                        a.lane, b.lane,
                        "overlapping intervals [{},{}] and [{},{}] share a lane",
                        a.lo_order, a.hi_order, b.lo_order, b.hi_order
                    );
                }
            }
        }
    }

    #[test]
    fn colouring_is_optimal_against_a_brute_force_sweep() {
        let mut state: u64 = 0xdead_beef_0000_0001;
        let mut next = || {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (state >> 33) as u16
        };
        for trial in 0..40 {
            let count = 3 + (trial % 17);
            let links: Vec<(u16, u16)> = (0..count).map(|_| (next() % 20, next() % 20)).collect();
            let layered = two_rank(20, 20, &links);
            let demand = compute_routing_demand(&layered, &GraphIr::default(), &cfg());
            assert_eq!(
                demand.channel_lanes[0],
                brute_force_max_depth(&links),
                "greedy colouring must use exactly ω lanes (trial {trial}, links {links:?})"
            );
        }
    }

    #[test]
    fn lane_assignment_is_deterministic() {
        let mut state: u64 = 0x0123_4567_89ab_cdef;
        let mut next = || {
            state = state
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            (state >> 33) as u16
        };
        let links: Vec<(u16, u16)> = (0..120).map(|_| (next() % 25, next() % 25)).collect();
        let layered = two_rank(25, 25, &links);

        let a = compute_routing_demand(&layered, &GraphIr::default(), &cfg());
        let b = compute_routing_demand(&layered, &GraphIr::default(), &cfg());

        assert_eq!(a.channel_lanes, b.channel_lanes);
        let key_a: Vec<(u32, u32, u16, u16, u16, u16)> = a
            .channel_segs
            .iter()
            .map(|s| (s.edge, s.link, s.rank, s.lo_order, s.hi_order, s.lane))
            .collect();
        let key_b: Vec<(u32, u32, u16, u16, u16, u16)> = b
            .channel_segs
            .iter()
            .map(|s| (s.edge, s.link, s.rank, s.lo_order, s.hi_order, s.lane))
            .collect();
        assert_eq!(key_a, key_b);
        assert_eq!(a.lane_of_link, b.lane_of_link);
        assert_eq!(a.rank_gap_min, b.rank_gap_min);
    }

    // ---- corridors ------------------------------------------------------------------------------

    /// One rank of `width` real items plus the given flat edges as `(from_order, to_order, label)`.
    fn flat_rank(width: u16, flats: &[(u16, u16, Option<f64>)]) -> Layered {
        let mut items = Vec::new();
        for o in 0..width {
            items.push(item(ItemKind::Real(o as u32), 0, o));
        }
        let mut layered = Layered {
            items,
            ..Default::default()
        };
        layered.rank_ranges.push(0..width as u32);
        for (e, &(a, b, label)) in flats.iter().enumerate() {
            layered.flat_edges.push(FlatEdge {
                edge: e as u32,
                rank: 0,
                from_item: a as u32,
                to_item: b as u32,
                label: label.map(|w| LabelBox {
                    width: w,
                    height: 20.0,
                }),
            });
        }
        layered
    }

    #[test]
    fn corridor_lane_count_equals_the_number_of_flat_edges_crossing_it() {
        // Edges 0->3 and 1->2 both cross corridor 1; only edge 0 crosses corridors 0 and 2.
        let layered = flat_rank(4, &[(0, 3, None), (1, 2, None)]);
        let c = cfg();
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &c);

        assert_eq!(demand.corridor_lanes.get(&(0, 0)).copied(), Some(1));
        assert_eq!(demand.corridor_lanes.get(&(0, 1)).copied(), Some(2));
        assert_eq!(demand.corridor_lanes.get(&(0, 2)).copied(), Some(1));
        assert_eq!(demand.corridor_segs.len(), 4);

        // Inside corridor 1 the two segments must be on different lanes, longest outermost.
        let mid: Vec<&CorridorSeg> = demand
            .corridor_segs
            .iter()
            .filter(|s| s.after_order == 1)
            .collect();
        assert_eq!(mid.len(), 2);
        let long = mid.iter().find(|s| s.edge == 0).map(|s| s.lane);
        let short = mid.iter().find(|s| s.edge == 1).map(|s| s.lane);
        assert_eq!(short, Some(0));
        assert_eq!(long, Some(1));
    }

    #[test]
    fn flat_edge_label_widens_exactly_the_corridors_it_spans() {
        // Edge 0 spans corridors 1 and 2 only, and carries a 300px badge.
        let layered = flat_rank(5, &[(1, 3, Some(300.0))]);
        let c = cfg();
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &c);

        let base = c.effective_node_gap();
        let lane = c.effective_lane_spacing();
        let widened = base.max(lane) + 300.0;

        assert_eq!(demand.separation_min.get(&(0, 0)).copied(), Some(base));
        assert_eq!(demand.separation_min.get(&(0, 1)).copied(), Some(widened));
        assert_eq!(demand.separation_min.get(&(0, 2)).copied(), Some(widened));
        assert_eq!(demand.separation_min.get(&(0, 3)).copied(), Some(base));
        // Dense population: one entry per adjacent pair, none for the last item.
        assert_eq!(demand.separation_min.len(), 4);
        assert_eq!(demand.separation_min.get(&(0, 4)), None);
    }

    #[test]
    fn separation_never_drops_below_the_configured_node_gap() {
        let mut c = cfg();
        c.node_gap = 500.0;
        c.lane_spacing = 1.0;
        let layered = flat_rank(4, &[(0, 3, None), (1, 2, None)]);
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &c);
        for o in 0..3u16 {
            let sep = demand.separation_min.get(&(0, o)).copied().unwrap_or(0.0);
            assert!(sep >= c.effective_node_gap(), "corridor {o} sep {sep}");
        }
    }

    #[test]
    fn many_flat_edges_widen_a_corridor_by_the_lane_demand() {
        let mut c = cfg();
        c.node_gap = 10.0;
        c.lane_spacing = 30.0;
        let flats: Vec<(u16, u16, Option<f64>)> = (0..4).map(|_| (0u16, 1u16, None)).collect();
        let layered = flat_rank(2, &flats);
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &c);

        assert_eq!(demand.corridor_lanes.get(&(0, 0)).copied(), Some(4));
        assert_eq!(demand.separation_min.get(&(0, 0)).copied(), Some(120.0));
    }

    #[test]
    fn multi_link_chain_records_one_segment_per_link() {
        // Three ranks: a chain 0 -> dummy -> 2 with a bend, so two links in two channels.
        let items = vec![
            item(ItemKind::Real(0), 0, 0),
            item(ItemKind::Real(1), 0, 1),
            item(ItemKind::Dummy { edge: 0, seq: 0 }, 1, 0),
            item(ItemKind::Real(2), 2, 0),
            item(ItemKind::Real(3), 2, 1),
        ];
        let mut layered = Layered {
            items,
            rank_ranges: vec![0..2, 2..3, 3..5],
            ..Default::default()
        };
        layered.chains.push(EdgeChain {
            edge: 0,
            reversed: false,
            role: EdgeRole::Forward,
            items: vec![1, 2, 4],
            label_at: None,
        });
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &cfg());

        assert_eq!(demand.channel_segs.len(), 2);
        assert_eq!(demand.channel_segs[0].rank, 0);
        assert_eq!(demand.channel_segs[0].link, 0);
        assert_eq!(
            (
                demand.channel_segs[0].lo_order,
                demand.channel_segs[0].hi_order
            ),
            (0, 1)
        );
        assert_eq!(demand.channel_segs[1].rank, 1);
        assert_eq!(demand.channel_segs[1].link, 1);
        assert_eq!(
            (
                demand.channel_segs[1].lo_order,
                demand.channel_segs[1].hi_order
            ),
            (0, 1)
        );
        assert_eq!(demand.channel_lanes, vec![1, 1, 0]);
        assert_eq!(demand.rank_gap_min.len(), 3);
        assert!(demand.lane_of_link.contains_key(&(0, 0)));
        assert!(demand.lane_of_link.contains_key(&(0, 1)));
    }

    #[test]
    fn malformed_chain_links_are_skipped_not_trusted() {
        // items[1] and items[2] are both on rank 0, so the link is not an adjacent-rank link.
        let items = vec![item(ItemKind::Real(0), 0, 0), item(ItemKind::Real(1), 0, 1)];
        let mut layered = Layered {
            items,
            ..Default::default()
        };
        layered.rank_ranges.push(0..2);
        layered.chains.push(EdgeChain {
            edge: 0,
            reversed: false,
            role: EdgeRole::Forward,
            // The trailing index is out of range as well.
            items: vec![0, 1, 99],
            label_at: None,
        });
        let demand = compute_routing_demand(&layered, &GraphIr::default(), &cfg());
        assert!(demand.channel_segs.is_empty());
        assert_eq!(demand.channel_lanes, vec![0]);
    }
}
