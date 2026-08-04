//! # Step 5.7 (Phase 8b'): Coordinate-space lane assignment
//!
//! Phase 6 decides *how much* routing space each channel needs; this module decides *which* lane
//! each segment takes inside that space, once coordinates exist. The split matters because the two
//! questions want different information and only one of them can be answered early.
//!
//! ## Why the lane order is the whole crossing story
//!
//! Every route this engine emits crosses a channel as a Z: it drops at `from_x` from the band above,
//! runs horizontally at its lane's y, then drops again at `to_x` into the band below. Two such Zs in
//! one channel can only meet where a horizontal run of one passes a vertical drop of the other —
//! horizontal runs never meet each other (different lanes are different y, same-lane runs are
//! x-disjoint by construction), and vertical drops never meet each other (different x). Measured on
//! the sample corpus, **every single geometric crossing was that one shape**, 148 out of 148.
//!
//! That makes the crossing count a pure function of the lane *order*. For segments `a` and `b` with
//! `a` in the shallower lane, exactly two crossings are possible:
//!
//! - `b` drops through `a`'s run — when `b.from_x` lies strictly inside `a`'s span, since `b`'s
//!   first descent passes every lane above its own;
//! - `a` rises through `b`'s run — when `a.to_x` lies strictly inside `b`'s span, since `a`'s second
//!   descent passes every lane below its own.
//!
//! Swap which one is shallower and you get the mirror pair. [`pair_cost`] is that count, and the
//! total is `sum over pairs of pair_cost(shallower, deeper)` — a function of the order alone.
//!
//! ## Why Phase 6 cannot do this
//!
//! Phase 6 colours *order* intervals, because order is all it has. Order is not a proxy for x
//! **across** ranks: item 0 of a fifteen-wide rank of shards and item 0 of a one-wide rank holding
//! the reducer they all feed are at completely different x. So Phase 6 can believe two segments are
//! disjoint when in the drawing they overlap for a thousand pixels, and — worse — a link whose two
//! items share an order index looks perfectly vertical and is excluded from the colouring
//! altogether, which drops it into lane 0 on top of whatever is already there.
//!
//! Phase 6's *count* is unaffected by all this and stays exactly what it was: an upper bound on the
//! lanes needed, which is what Phase 7 must reserve. This module only permutes and packs within the
//! space that reservation bought, so it cannot make a route leave its channel.
//!
//! ## The two tiers
//!
//! 1. **Order, then pack.** Sort the segments by the exact pair cost (adjacent-swap descent — see
//!    [`order_channel`]), then walk that order and start a new lane only when a segment overlaps
//!    something already in the current one. Merging only ever joins segments that are adjacent in
//!    the order, so lane index stays monotone in it and the ordering's crossing count is realised
//!    exactly. This is the good case and it is what almost every channel gets.
//! 2. **Colour, then permute.** When tier 1 needs more lanes than the channel has room for, colour
//!    by ascending left endpoint instead — greedy colouring of an interval graph uses exactly the
//!    maximum overlap depth, the provable minimum — and then permute whole lanes by the same
//!    descent. Coarser, because a lane now moves as a unit, but it fits whenever the drawing has
//!    room for the overlap depth at all.
//!
//! If even tier 2 does not fit, Phase 6's assignment is kept untouched. Routing therefore cannot
//! come out worse than it did before this module existed.

use super::lane_router::pass_x;
use super::ports::PortTable;
use crate::config::CustomLayoutConfig;
use crate::types::{Layered, RoutingDemand};
use std::collections::HashMap;

/// Local-search passes over one channel.
///
/// Each pass is a full bubble sweep, so the order is already stable well before this; the constant
/// only stops a cost function that is not a weak order (possible for three mutually-preferring
/// segments) from cycling forever.
const MAX_DESCENT_PASSES: usize = 16;

/// One channel segment, in coordinate space.
#[derive(Clone, Copy)]
struct Seg {
    edge: u32,
    link: u32,
    /// x at which the route drops into the channel.
    from_x: f64,
    /// x at which it leaves for the rank below.
    to_x: f64,
}

impl Seg {
    fn lo(&self) -> f64 {
        self.from_x.min(self.to_x)
    }
    fn hi(&self) -> f64 {
        self.from_x.max(self.to_x)
    }
}

/// Re-assigns every channel segment's lane using real geometry.
///
/// Returns a complete replacement for [`RoutingDemand::lane_of_link`] — complete rather than a
/// sparse overlay so a caller cannot accidentally mix refined and unrefined lanes within one
/// channel, which would put two routes at the same y.
///
/// `band_bottoms` and `rank_tops` must be the tables Phase 7 produced for this `layered`; they are
/// what bounds each channel, and a stale pair would let the optimiser claim lanes the drawing has
/// no room for.
pub fn refine_channel_lanes(
    layered: &Layered,
    demand: &RoutingDemand,
    ports: &PortTable,
    band_bottoms: &[f64],
    rank_tops: &[f64],
    config: &CustomLayoutConfig,
) -> HashMap<(u32, u32), u16> {
    let mut out = demand.lane_of_link.clone();
    let rank_count = layered.rank_count();
    if rank_count == 0 {
        return out;
    }

    // Collected per channel in chain order, which is graph order, so nothing here depends on
    // hashing.
    let mut by_channel: Vec<Vec<Seg>> = vec![Vec::new(); rank_count];
    for chain in &layered.chains {
        let link_count = chain.items.len().saturating_sub(1);
        for link in 0..link_count {
            let (Some(a), Some(b)) = (
                layered.items.get(chain.items[link] as usize),
                layered.items.get(chain.items[link + 1] as usize),
            ) else {
                continue;
            };
            if a.rank.abs_diff(b.rank) != 1 {
                continue;
            }
            // Exactly the x values `route_chain_with_bands` will use. Deriving them any other way
            // would optimise a drawing that is not the one being emitted.
            let from_x = if link == 0 {
                match ports.source.get(&chain.edge) {
                    Some(p) => p.stub.x,
                    None => continue,
                }
            } else {
                pass_x(a, config)
            };
            let to_x = if link + 1 == link_count {
                match ports.target.get(&chain.edge) {
                    Some(p) => p.stub.x,
                    None => continue,
                }
            } else {
                pass_x(b, config)
            };
            if !from_x.is_finite() || !to_x.is_finite() {
                continue;
            }
            let rank = a.rank.min(b.rank) as usize;
            if let Some(list) = by_channel.get_mut(rank) {
                list.push(Seg {
                    edge: chain.edge,
                    link: link as u32,
                    from_x,
                    to_x,
                });
            }
        }
    }

    let cap_budget = config.lane_order_max_segments.max(1);
    for (rank, segs) in by_channel.iter().enumerate() {
        if segs.len() < 2 || segs.len() > cap_budget {
            continue;
        }
        let capacity = channel_capacity(layered, demand, band_bottoms, rank_tops, rank, config);
        let Some(lanes) = assign_channel(segs, capacity) else {
            continue;
        };
        for (seg, lane) in segs.iter().zip(lanes) {
            out.insert((seg.edge, seg.link), lane);
        }
    }

    out
}

/// Lanes that fit in the channel below `rank`.
///
/// Measured from the drawing rather than taken from Phase 6, because Phase 6's count is a lower
/// bound on the gap and `rank_gap` frequently makes the realised gap larger. Using the real gap
/// gives the optimiser the room the drawing actually has. The Phase 6 count is folded in with a
/// `max` so float error in the division can never report *less* room than was reserved.
fn channel_capacity(
    layered: &Layered,
    demand: &RoutingDemand,
    band_bottoms: &[f64],
    rank_tops: &[f64],
    rank: usize,
    config: &CustomLayoutConfig,
) -> usize {
    let reserved = demand
        .channel_lanes
        .get(rank)
        .copied()
        .unwrap_or(1)
        .max(1) as usize;
    if rank + 1 >= layered.rank_count() {
        return reserved;
    }
    let (Some(&bottom), Some(&next_top)) = (band_bottoms.get(rank), rank_tops.get(rank + 1)) else {
        return reserved;
    };
    let spacing = config.effective_lane_spacing();
    if !spacing.is_finite() || spacing <= 0.0 {
        return reserved;
    }
    let usable = next_top - bottom - 2.0 * config.port_stub_length;
    if !usable.is_finite() || usable <= 0.0 {
        return reserved;
    }
    ((usable / spacing).floor().max(1.0) as usize).max(reserved)
}

/// What one merged pair costs relative to one crossing.
///
/// Strictly worse than the two crossings a pair can otherwise produce, because a crossing stays
/// readable and a merge does not — one of the two edges simply disappears under the other.
const MERGE_PENALTY: u32 = 4;

/// Tolerance for "these two verticals are on the same line", in pixels.
///
/// Deliberately coarser than `config.epsilon`: two runs a hundredth of a pixel apart are drawn on
/// top of each other whatever the arithmetic says. Half a pixel is below anything a reader can
/// distinguish and above anything the coordinate phase produces by accident.
const SAME_LINE_TOLERANCE: f64 = 0.5;

/// What it costs to put `shallow` in the lane nearer the rank above.
///
/// Two terms, and the second is the one that is easy to miss:
///
/// - **Crossings.** `deep` drops through `shallow`'s run when its entry x falls strictly inside
///   that run, and `shallow` rises through `deep`'s run when its exit x falls strictly inside
///   *that* one. Strict containment throughout: a drop landing exactly on the end of a run touches
///   it rather than crossing it, and a run whose ends coincide is a vertical line that crosses
///   nothing.
/// - **Merges.** When `shallow` leaves the channel at the same x as `deep` enters it, the two
///   verticals run along one line between the two lanes and the deeper edge is hidden. Swapping the
///   pair makes that overlap empty, so this is genuinely a property of the order and belongs here
///   rather than in a later repair pass. Left out of the first version of this module, and the
///   audit's new collinear-overlap check found it immediately.
fn pair_cost(shallow: &Seg, deep: &Seg) -> u32 {
    let crossings = u32::from(strictly_inside(deep.from_x, shallow.from_x, shallow.to_x))
        + u32::from(strictly_inside(shallow.to_x, deep.from_x, deep.to_x));
    let merged = (shallow.to_x - deep.from_x).abs() <= SAME_LINE_TOLERANCE;
    crossings + if merged { MERGE_PENALTY } else { 0 }
}

fn strictly_inside(x: f64, a: f64, b: f64) -> bool {
    let (lo, hi) = (a.min(b), a.max(b));
    x > lo && x < hi
}

fn overlaps(a: &Seg, b: &Seg) -> bool {
    a.lo() < b.hi() && b.lo() < a.hi()
}

/// Orders one channel's segments shallow-to-deep.
///
/// The objective decomposes over pairs, so exchanging two neighbours changes the total by exactly
/// `pair_cost(b, a) - pair_cost(a, b)` and a sweep that exchanges every strictly improving adjacent
/// pair is a descent step. That converges to an order in which no single adjacent exchange helps —
/// the same guarantee a comparison sort would give if the preference were transitive, and a sound
/// local optimum when it is not.
///
/// The seed is ascending left endpoint with a total tie-break, so the result is byte-identical
/// across processes.
fn order_channel(segs: &[Seg]) -> Vec<usize> {
    let n = segs.len();
    let mut order: Vec<usize> = (0..n).collect();
    order.sort_by(|&a, &b| {
        segs[a]
            .lo()
            .total_cmp(&segs[b].lo())
            .then(segs[a].hi().total_cmp(&segs[b].hi()))
            .then(segs[a].edge.cmp(&segs[b].edge))
            .then(segs[a].link.cmp(&segs[b].link))
            .then(a.cmp(&b))
    });

    for _ in 0..MAX_DESCENT_PASSES {
        let mut improved = false;
        for k in 0..n.saturating_sub(1) {
            let (a, b) = (order[k], order[k + 1]);
            if pair_cost(&segs[b], &segs[a]) < pair_cost(&segs[a], &segs[b]) {
                order.swap(k, k + 1);
                improved = true;
            }
        }
        if !improved {
            break;
        }
    }
    order
}

/// Lane for each segment, in input order, or `None` when nothing fits in `capacity`.
fn assign_channel(segs: &[Seg], capacity: usize) -> Option<Vec<u16>> {
    if let Some(lanes) = pack_in_order(segs, capacity) {
        return Some(lanes);
    }
    colour_then_permute(segs, capacity)
}

/// Tier 1: walk the crossing-optimal order, opening a new lane only on a genuine overlap.
///
/// A segment joins the current lane when it is x-disjoint from everything already there, so lane
/// index is monotone in the order and same-lane pairs contribute nothing — the count the ordering
/// was optimised for is the count that gets drawn.
fn pack_in_order(segs: &[Seg], capacity: usize) -> Option<Vec<u16>> {
    let order = order_channel(segs);
    let mut lanes = vec![0u16; segs.len()];
    let mut lane: u16 = 0;
    let mut occupied: Vec<usize> = Vec::new();
    for (position, &i) in order.iter().enumerate() {
        if position > 0 && occupied.iter().any(|&j| overlaps(&segs[i], &segs[j])) {
            lane = lane.checked_add(1)?;
            if lane as usize >= capacity {
                return None;
            }
            occupied.clear();
        }
        occupied.push(i);
        lanes[i] = lane;
    }
    Some(lanes)
}

/// Tier 2: colour by ascending left endpoint, then permute whole lanes.
///
/// Greedy colouring of an interval graph in that order uses exactly the maximum overlap depth, so
/// this fits whenever the channel has room for the segments at all. The permutation then recovers
/// as much of the ordering benefit as lane granularity allows.
fn colour_then_permute(segs: &[Seg], capacity: usize) -> Option<Vec<u16>> {
    let n = segs.len();
    let mut by_left: Vec<usize> = (0..n).collect();
    by_left.sort_by(|&a, &b| {
        segs[a]
            .lo()
            .total_cmp(&segs[b].lo())
            .then(segs[a].edge.cmp(&segs[b].edge))
            .then(segs[a].link.cmp(&segs[b].link))
            .then(a.cmp(&b))
    });

    let mut members: Vec<Vec<usize>> = Vec::new();
    let mut lane_of = vec![0usize; n];
    for &i in &by_left {
        let slot = members
            .iter()
            .position(|group| !group.iter().any(|&j| overlaps(&segs[i], &segs[j])));
        let lane = match slot {
            Some(lane) => lane,
            None => {
                if members.len() >= capacity {
                    return None;
                }
                members.push(Vec::new());
                members.len() - 1
            }
        };
        members[lane].push(i);
        lane_of[i] = lane;
    }

    let group_cost = |a: usize, b: usize| -> u32 {
        members[a]
            .iter()
            .map(|&i| {
                members[b]
                    .iter()
                    .map(|&j| pair_cost(&segs[i], &segs[j]))
                    .sum::<u32>()
            })
            .sum()
    };

    let count = members.len();
    let mut order: Vec<usize> = (0..count).collect();
    for _ in 0..MAX_DESCENT_PASSES {
        let mut improved = false;
        for k in 0..count.saturating_sub(1) {
            let (a, b) = (order[k], order[k + 1]);
            if group_cost(b, a) < group_cost(a, b) {
                order.swap(k, k + 1);
                improved = true;
            }
        }
        if !improved {
            break;
        }
    }

    let mut depth = vec![0u16; count];
    for (position, &lane) in order.iter().enumerate() {
        depth[lane] = u16::try_from(position).unwrap_or(u16::MAX);
    }
    Some(lane_of.iter().map(|&lane| depth[lane]).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(from_x: f64, to_x: f64) -> Seg {
        Seg {
            edge: 0,
            link: 0,
            from_x,
            to_x,
        }
    }

    /// Total crossings implied by a lane assignment, computed straight from the definition.
    fn crossings(segs: &[Seg], lanes: &[u16]) -> u32 {
        let mut total = 0;
        for i in 0..segs.len() {
            for j in (i + 1)..segs.len() {
                total += match lanes[i].cmp(&lanes[j]) {
                    std::cmp::Ordering::Less => pair_cost(&segs[i], &segs[j]),
                    std::cmp::Ordering::Greater => pair_cost(&segs[j], &segs[i]),
                    std::cmp::Ordering::Equal => 0,
                };
            }
        }
        total
    }

    /// Fifteen shards converging on one reducer to their right: the runs share a right endpoint and
    /// start progressively further right, so they all overlap. This is the shape that produced 82 of
    /// the corpus's 148 crossings before this module existed, and it is entirely avoidable.
    #[test]
    fn a_fan_in_puts_its_longest_run_deepest_and_reaches_zero() {
        let segs: Vec<Seg> = (0..15)
            .map(|i| seg(200.0 + i as f64 * 200.0, 3400.0 + i as f64 * 2.0))
            .collect();
        let lanes = assign_channel(&segs, 32).expect("fits");
        assert_eq!(crossings(&segs, &lanes), 0);
        // Segment 0 has the longest run and goes deepest: every other segment drops somewhere
        // inside it, so anything shallower would be cut by all fourteen.
        assert!(lanes[0] > lanes[14], "{:?}", lanes);
    }

    /// The mirror image — one source fanning out to fifteen targets on its right — which wants the
    /// **opposite** depth rule: here the longest run belongs shallowest. Any single hand-picked key
    /// gets exactly one of these two cases right, which is why the order is derived from the pair
    /// cost instead.
    #[test]
    fn a_fan_out_puts_its_longest_run_shallowest_and_also_reaches_zero() {
        let segs: Vec<Seg> = (0..15)
            .map(|i| seg(200.0 + i as f64 * 2.0, 600.0 + i as f64 * 200.0))
            .collect();
        let lanes = assign_channel(&segs, 32).expect("fits");
        assert_eq!(crossings(&segs, &lanes), 0);
        // Segment 14 is the longest here, and it is the one that must sit shallowest.
        assert!(lanes[14] < lanes[0], "{:?}", lanes);
    }

    #[test]
    fn disjoint_runs_share_one_lane_instead_of_stacking() {
        let segs = [seg(0.0, 100.0), seg(200.0, 300.0), seg(400.0, 500.0)];
        let lanes = assign_channel(&segs, 8).expect("fits");
        assert_eq!(lanes, vec![0, 0, 0]);
    }

    /// Nested runs cost one crossing whichever way round they go, so the optimiser must not spin
    /// trying to remove it — it must settle, and settle on the same answer every time.
    #[test]
    fn an_unavoidable_crossing_is_accepted_rather_than_chased() {
        let segs = [seg(0.0, 1000.0), seg(200.0, 800.0)];
        let lanes = assign_channel(&segs, 8).expect("fits");
        assert_eq!(crossings(&segs, &lanes), 1);
        assert_eq!(assign_channel(&segs, 8).unwrap(), lanes);
    }

    #[test]
    fn a_channel_with_no_room_reports_it_rather_than_overflowing() {
        // Three mutually overlapping runs need three lanes; offering two must fail both tiers.
        let segs = [seg(0.0, 300.0), seg(100.0, 400.0), seg(200.0, 500.0)];
        assert!(assign_channel(&segs, 2).is_none());
        assert!(assign_channel(&segs, 3).is_some());
    }

    #[test]
    fn tier_two_fits_where_tier_one_cannot() {
        // Nested runs: tier 1 opens a lane per segment, tier 2 still needs the overlap depth, so
        // give it exactly that and check it produces a valid assignment rather than giving up.
        let segs: Vec<Seg> = (0..6)
            .map(|i| seg(i as f64 * 10.0, 1000.0 - i as f64 * 10.0))
            .collect();
        assert!(pack_in_order(&segs, 3).is_none());
        let lanes = colour_then_permute(&segs, 6).expect("overlap depth fits");
        assert_eq!(lanes.len(), 6);
        // No two overlapping runs may share a lane; that would draw them on top of each other.
        for i in 0..segs.len() {
            for j in (i + 1)..segs.len() {
                assert!(
                    lanes[i] != lanes[j] || !overlaps(&segs[i], &segs[j]),
                    "segments {i} and {j} overlap in lane {}",
                    lanes[i]
                );
            }
        }
    }

    /// A link whose two ends share an x draws a straight vertical line through the channel. It has
    /// no run of its own to be cut, but it still has to get past anything running across it — so it
    /// costs one crossing whichever lane it takes, and no ordering can save it.
    ///
    /// This is the case Phase 6 mishandles: it sees an order interval of zero width, concludes the
    /// link is vertical and needs no lane, and drops it into lane 0 on top of whatever is there.
    #[test]
    fn a_vertical_link_costs_one_crossing_whichever_way_it_is_ordered() {
        let vertical = seg(500.0, 500.0);
        let across = seg(0.0, 1000.0);
        assert_eq!(
            pair_cost(&across, &vertical),
            1,
            "the vertical's descent cuts the run above it"
        );
        assert_eq!(
            pair_cost(&vertical, &across),
            1,
            "and its ascent cuts the run below it"
        );
    }
}
