//! # Phase 7: Coordinate assignment
//!
//! Runs the two halves of the phase and normalizes the result:
//!
//! 1. [`assign_rank_bands`] fixes `item.y` from the rank heights and the Phase 6 channel demand.
//! 2. [`brandes_kopf_x`] (or [`simple_x`]) fixes the centre x of every item from the Phase 6
//!    separation demand.
//! 3. Centres become top-left corners and the whole drawing is translated so its bounding corner
//!    lands on `config.graph_padding`.
//!
//! `config.direction` is deliberately **not** applied here. Transposition and mirroring happen in
//! the engine around the entire pipeline, so every phase between ingest and routing can assume one
//! canonical top-down orientation; applying it twice is the classic way to get a mirrored drawing.

use crate::config::{Coordinator, CustomLayoutConfig};
use crate::types::{Layered, RoutingDemand};

use super::brandes_kopf::{brandes_kopf_x, simple_x};
use super::rank_bands::assign_rank_bands;

/// Fills `item.x` and `item.y` for every item, then translates so the drawing's top-left
/// bounding corner sits at `(graph_padding, graph_padding)`.
///
/// Returns the **post-translation** top y of each rank band, which Phase 8 needs to locate routing
/// channels. Returning it here rather than making the caller run [`assign_rank_bands`] separately
/// is deliberate: the band tops are only valid in the same coordinate space as the items, and the
/// translation below moves that space. A caller that captured the tops before this ran would place
/// every channel off by the translation delta, and the routes would cut straight back through
/// their own source nodes — which is exactly what happened before this signature changed.
///
/// The bounding corner is measured over `Real` and `Label` items only. Dummies are zero-sized
/// points sitting on band centre lines and a chain of them can extend past the leftmost node, so
/// including them would push visible content inward by an arbitrary amount and make the padding
/// look wrong.
///
/// Idempotence caveat: calling this twice re-runs the full assignment from scratch and produces
/// the same result, but it is not an incremental update — the caller must not expect previously
/// written coordinates to be preserved.
pub fn assign_coordinates(
    layered: &mut Layered,
    demand: &RoutingDemand,
    config: &CustomLayoutConfig,
) -> Vec<f64> {
    if layered.items.is_empty() {
        return Vec::new();
    }

    let mut rank_tops = assign_rank_bands(layered, demand, config);

    let centres = match config.coordinator {
        Coordinator::BrandesKopf => brandes_kopf_x(layered, demand, config),
        Coordinator::Simple => simple_x(layered, demand, config),
    };

    for (i, item) in layered.items.iter_mut().enumerate() {
        let centre = centres.get(i).copied().unwrap_or(0.0);
        let half = if item.width.is_finite() && item.width > 0.0 {
            item.width / 2.0
        } else {
            0.0
        };
        item.x = centre - half;
    }

    let (mut min_x, mut min_y) = bounding_corner(layered, false);
    if !min_x.is_finite() || !min_y.is_finite() {
        // Degenerate graph made entirely of dummies: fall back to every item so the translation
        // still happens rather than silently leaving the drawing at an arbitrary origin.
        let all = bounding_corner(layered, true);
        min_x = all.0;
        min_y = all.1;
    }
    if !min_x.is_finite() || !min_y.is_finite() {
        return rank_tops;
    }

    let dx = config.graph_padding - min_x;
    let dy = config.graph_padding - min_y;
    if dx == 0.0 && dy == 0.0 {
        return rank_tops;
    }
    for item in layered.items.iter_mut() {
        item.x += dx;
        item.y += dy;
    }
    // The band tops live in the same space as the items, so they move with them.
    for top in rank_tops.iter_mut() {
        *top += dy;
    }
    rank_tops
}

/// Top-left corner of the bounding box. When `include_dummies` is false only `Real` and `Label`
/// items count; the result is `(inf, inf)` when nothing qualifies.
fn bounding_corner(layered: &Layered, include_dummies: bool) -> (f64, f64) {
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    for item in layered.items.iter() {
        if !include_dummies && item.kind.is_dummy() {
            continue;
        }
        if item.x.is_finite() {
            min_x = min_x.min(item.x);
        }
        if item.y.is_finite() {
            min_y = min_y.min(item.y);
        }
    }
    (min_x, min_y)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{BkAlign, Compaction};
    use crate::types::{Csr, Item, ItemKind};
    use std::collections::HashMap;

    fn make_layered(ranks: &[Vec<(ItemKind, f64, f64)>], links: &[(u32, u32)]) -> Layered {
        let mut items: Vec<Item> = Vec::new();
        let mut rank_ranges = Vec::new();
        for (r, row) in ranks.iter().enumerate() {
            let start = items.len() as u32;
            for (o, &(kind, width, height)) in row.iter().enumerate() {
                items.push(Item {
                    kind,
                    rank: r as u16,
                    order: o as u16,
                    width,
                    height,
                    x: 0.0,
                    y: 0.0,
                });
            }
            rank_ranges.push(start..items.len() as u32);
        }
        let n = items.len();
        let down_arcs: Vec<(u32, u32, u32)> = links
            .iter()
            .enumerate()
            .map(|(e, &(u, v))| (u, v, e as u32))
            .collect();
        let up_arcs: Vec<(u32, u32, u32)> = links
            .iter()
            .enumerate()
            .map(|(e, &(u, v))| (v, u, e as u32))
            .collect();
        Layered {
            items,
            rank_ranges,
            up: Csr::build(n, &up_arcs),
            down: Csr::build(n, &down_arcs),
            chains: Vec::new(),
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: Vec::new(),
        }
    }

    fn real(w: f64, h: f64) -> (ItemKind, f64, f64) {
        (ItemKind::Real(0), w, h)
    }

    fn dummy(edge: u32, seq: u16) -> (ItemKind, f64, f64) {
        (ItemKind::Dummy { edge, seq }, 0.0, 0.0)
    }

    fn demand_for(rank_count: usize) -> RoutingDemand {
        RoutingDemand {
            rank_gap_min: vec![0.0; rank_count],
            ..Default::default()
        }
    }

    #[test]
    fn empty_layered_is_a_no_op() {
        let mut layered = make_layered(&[], &[]);
        assign_coordinates(&mut layered, &demand_for(0), &CustomLayoutConfig::default());
        assert!(layered.items.is_empty());
    }

    #[test]
    fn the_real_bounding_box_starts_exactly_at_graph_padding() {
        let mut layered = make_layered(
            &[
                vec![real(100.0, 40.0), real(140.0, 60.0)],
                vec![real(90.0, 30.0)],
            ],
            &[(0, 2), (1, 2)],
        );
        let cfg = CustomLayoutConfig::default();
        assign_coordinates(&mut layered, &demand_for(2), &cfg);

        let min_x = layered
            .items
            .iter()
            .map(|i| i.x)
            .fold(f64::INFINITY, f64::min);
        let min_y = layered
            .items
            .iter()
            .map(|i| i.y)
            .fold(f64::INFINITY, f64::min);
        assert_eq!(min_x, cfg.graph_padding);
        assert_eq!(min_y, cfg.graph_padding);
    }

    #[test]
    fn zero_size_dummies_do_not_drag_the_bounding_box() {
        // The dummy chain sits to the left of every real node; if it counted toward the bounding
        // box the real nodes would be pushed right of `graph_padding`.
        let mut layered = make_layered(
            &[
                vec![real(100.0, 40.0)],
                vec![dummy(0, 0), real(100.0, 40.0)],
                vec![real(100.0, 40.0)],
            ],
            &[(0, 1), (1, 3), (0, 2), (2, 3)],
        );
        let cfg = CustomLayoutConfig::default();
        assign_coordinates(&mut layered, &demand_for(3), &cfg);

        let real_min_x = layered
            .items
            .iter()
            .filter(|i| !i.kind.is_dummy())
            .map(|i| i.x)
            .fold(f64::INFINITY, f64::min);
        let real_min_y = layered
            .items
            .iter()
            .filter(|i| !i.kind.is_dummy())
            .map(|i| i.y)
            .fold(f64::INFINITY, f64::min);
        assert_eq!(real_min_x, cfg.graph_padding);
        assert_eq!(real_min_y, cfg.graph_padding);
    }

    #[test]
    fn a_graph_of_only_dummies_still_gets_translated() {
        let mut layered = make_layered(&[vec![dummy(0, 0)], vec![dummy(0, 1)]], &[(0, 1)]);
        let cfg = CustomLayoutConfig::default();
        assign_coordinates(&mut layered, &demand_for(2), &cfg);
        assert_eq!(layered.items[0].x, cfg.graph_padding);
        assert_eq!(layered.items[0].y, cfg.graph_padding);
    }

    #[test]
    fn x_is_the_top_left_corner_not_the_centre() {
        let mut layered = make_layered(&[vec![real(100.0, 40.0), real(300.0, 40.0)]], &[]);
        let cfg = CustomLayoutConfig::default();
        assign_coordinates(&mut layered, &demand_for(1), &cfg);

        let a = &layered.items[0];
        let b = &layered.items[1];
        // Facing edges are exactly `node_gap` apart, which is only true if `x` is the left edge.
        assert!(
            (b.x - (a.x + a.width) - cfg.effective_node_gap()).abs() < 1e-9,
            "a={a:?} b={b:?}"
        );
    }

    #[test]
    fn no_two_items_in_a_rank_overlap_after_a_full_assignment() {
        let mut separation_min: HashMap<(u16, u16), f64> = HashMap::new();
        separation_min.insert((1u16, 0u16), 5.0);
        separation_min.insert((1u16, 1u16), 240.0);
        let demand = RoutingDemand {
            rank_gap_min: vec![0.0; 3],
            separation_min,
            ..Default::default()
        };

        let mut layered = make_layered(
            &[
                vec![real(120.0, 40.0)],
                vec![
                    real(100.0, 40.0),
                    (ItemKind::Label(0), 180.0, 26.0),
                    real(60.0, 40.0),
                ],
                vec![real(200.0, 40.0)],
            ],
            &[(0, 1), (0, 2), (0, 3), (1, 4), (2, 4), (3, 4)],
        );
        let cfg = CustomLayoutConfig::default();
        assign_coordinates(&mut layered, &demand, &cfg);

        let range = layered.rank_ranges[1].clone();
        let lo = range.start as usize;
        let hi = range.end as usize;
        for i in (lo + 1)..hi {
            let prev = layered.items[i - 1];
            let cur = layered.items[i];
            let gap = demand
                .separation_min
                .get(&(1u16, (i - 1 - lo) as u16))
                .copied()
                .unwrap_or(cfg.effective_node_gap());
            let facing = cur.x - (prev.x + prev.width);
            assert!(
                facing >= gap - 1e-9,
                "pair {i}: facing {facing}, need {gap}"
            );
        }
    }

    #[test]
    fn rank_bands_are_stacked_top_to_bottom_with_the_configured_gap() {
        let mut layered = make_layered(
            &[vec![real(100.0, 40.0)], vec![real(100.0, 80.0)]],
            &[(0, 1)],
        );
        let cfg = CustomLayoutConfig::default();
        assign_coordinates(&mut layered, &demand_for(2), &cfg);

        let top = &layered.items[0];
        let bottom = &layered.items[1];
        assert_eq!(top.y, cfg.graph_padding);
        assert_eq!(
            bottom.y,
            cfg.graph_padding + 40.0 + cfg.effective_rank_gap()
        );
    }

    #[test]
    fn the_simple_coordinator_is_selectable_and_still_normalizes() {
        let mut layered = make_layered(
            &[
                vec![real(100.0, 40.0), real(100.0, 40.0)],
                vec![real(100.0, 40.0)],
            ],
            &[(0, 2), (1, 2)],
        );
        let cfg = CustomLayoutConfig {
            coordinator: Coordinator::Simple,
            ..CustomLayoutConfig::default()
        };
        assign_coordinates(&mut layered, &demand_for(2), &cfg);

        let min_x = layered
            .items
            .iter()
            .map(|i| i.x)
            .fold(f64::INFINITY, f64::min);
        assert_eq!(min_x, cfg.graph_padding);
        // The lone item of rank 1 is centred under the two-item rank.
        assert_eq!(
            layered.items[2].center_x(),
            (layered.items[0].center_x() + layered.items[1].center_x()) / 2.0
        );
    }

    #[test]
    fn direction_is_not_applied_here() {
        // A `left-right` direction must not transpose anything: the engine owns that.
        let build = || {
            make_layered(
                &[vec![real(100.0, 40.0)], vec![real(100.0, 40.0)]],
                &[(0, 1)],
            )
        };
        let mut top_down = build();
        let mut left_right = build();
        let base = CustomLayoutConfig::default();
        let sideways = CustomLayoutConfig {
            direction: crate::config::Direction::LeftRight,
            ..CustomLayoutConfig::default()
        };
        assign_coordinates(&mut top_down, &demand_for(2), &base);
        assign_coordinates(&mut left_right, &demand_for(2), &sideways);

        for (a, b) in top_down.items.iter().zip(left_right.items.iter()) {
            assert_eq!(a.x, b.x);
            assert_eq!(a.y, b.y);
        }
    }

    #[test]
    fn two_runs_over_the_same_input_are_byte_identical() {
        let build = || {
            make_layered(
                &[
                    vec![real(100.0, 40.0), dummy(1, 0), real(140.0, 55.0)],
                    vec![real(90.0, 30.0), (ItemKind::Label(1), 70.0, 24.0)],
                    vec![real(200.0, 45.0), real(70.0, 45.0)],
                ],
                &[(0, 3), (1, 4), (2, 3), (3, 5), (4, 6), (0, 4)],
            )
        };
        let cfg = CustomLayoutConfig {
            compaction: Compaction::Airy,
            bk_align: BkAlign::Median,
            ..CustomLayoutConfig::default()
        };
        let mut a = build();
        let mut b = build();
        assign_coordinates(&mut a, &demand_for(3), &cfg);
        assign_coordinates(&mut b, &demand_for(3), &cfg);

        for (ia, ib) in a.items.iter().zip(b.items.iter()) {
            assert_eq!(ia.x.to_bits(), ib.x.to_bits());
            assert_eq!(ia.y.to_bits(), ib.y.to_bits());
        }
    }
}
