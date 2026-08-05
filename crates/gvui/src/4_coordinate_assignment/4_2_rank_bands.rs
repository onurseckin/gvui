//! # Phase 7a: Rank bands (Y coordinates)
//!
//! Every rank occupies a horizontal band whose height is the tallest item in it. Because Phase 4
//! turns each edge badge into an ordinary [`Item`](crate::types::Item) carrying its measured box,
//! `Label` items are included in that maximum by construction — which is the whole reason a badge
//! always has vertical room and nothing downstream ever has to make space for one.
//!
//! Items are centred inside their band. Dummies have zero height, so they land exactly on the
//! band's centre line; a chain of dummies therefore shares one y per rank and renders as a single
//! straight vertical run instead of a staircase.
//!
//! This is a single forward pass. The band tops are a running sum and no later phase revisits them.

use crate::config::CustomLayoutConfig;
use crate::types::{Layered, RoutingDemand};

/// Assigns `item.y` for every item and returns the top y of each rank band.
///
/// Rank height is `max(item.height)` over the rank — Label items are included by construction,
/// which is exactly why a badge always has vertical room.
///
/// The band tops start at `0.0`; the facade translates the finished drawing to
/// `config.graph_padding` afterwards, so callers must not expect padding to be baked in here.
///
/// `demand.rank_gap_min[r]` is the gap **below** rank `r`, so the entry for the last rank is never
/// read. The gap is clamped up to [`CustomLayoutConfig::effective_rank_gap`]: `rank_gap` is
/// documented as a minimum that routing channels may only *raise*, and Phase 6 derives
/// `rank_gap_min` from lane counts alone — an empty channel would otherwise collapse two ranks
/// onto each other.
///
/// The returned vector has one entry per rank and is empty when the graph has no ranks.
pub fn assign_rank_bands(
    layered: &mut Layered,
    demand: &RoutingDemand,
    config: &CustomLayoutConfig,
) -> Vec<f64> {
    let rank_count = layered.rank_ranges.len();
    if rank_count == 0 {
        return Vec::new();
    }

    let mut heights = vec![0.0f64; rank_count];
    for (r, range) in layered.rank_ranges.iter().enumerate() {
        let lo = range.start as usize;
        let hi = (range.end as usize).min(layered.items.len());
        let mut tallest = 0.0f64;
        for item in &layered.items[lo.min(hi)..hi] {
            // `f64::max` returns the finite operand when the other is NaN, so a corrupt height
            // degrades to "contributes nothing" rather than poisoning the whole band.
            tallest = tallest.max(item.height.max(0.0));
        }
        heights[r] = tallest;
    }

    let floor_gap = config.effective_rank_gap();
    let mut tops = vec![0.0f64; rank_count];
    for r in 1..rank_count {
        let raw = demand.rank_gap_min.get(r - 1).copied().unwrap_or(floor_gap);
        let gap = if raw.is_finite() {
            raw.max(floor_gap)
        } else {
            floor_gap
        };
        tops[r] = tops[r - 1] + heights[r - 1] + gap;
    }

    for r in 0..rank_count {
        let range = layered.rank_ranges[r].clone();
        let lo = range.start as usize;
        let hi = (range.end as usize).min(layered.items.len());
        let top = tops[r];
        let band = heights[r];
        for item in &mut layered.items[lo.min(hi)..hi] {
            item.y = top + (band - item.height.max(0.0)) / 2.0;
        }
    }

    tops
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{Csr, Item, ItemKind};

    /// Builds a `Layered` from a rank-major description. Items are laid out rank-major, so the
    /// global index of the `o`-th item of rank `r` is `rank_ranges[r].start + o`.
    fn make_layered(ranks: &[Vec<(ItemKind, f64, f64)>]) -> Layered {
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
        Layered {
            items,
            rank_ranges,
            up: Csr::build(n, &[]),
            down: Csr::build(n, &[]),
            chains: Vec::new(),
            flat_edges: Vec::new(),
            self_loops: Vec::new(),
            item_of_node: Vec::new(),
        }
    }

    fn demand_with_gaps(gaps: Vec<f64>) -> RoutingDemand {
        RoutingDemand {
            rank_gap_min: gaps,
            ..Default::default()
        }
    }

    #[test]
    fn empty_layered_returns_no_bands() {
        let mut layered = make_layered(&[]);
        let tops = assign_rank_bands(
            &mut layered,
            &demand_with_gaps(Vec::new()),
            &CustomLayoutConfig::default(),
        );
        assert!(tops.is_empty());
        assert!(layered.items.is_empty());
    }

    #[test]
    fn band_height_is_the_max_item_height() {
        let mut layered = make_layered(&[
            vec![
                (ItemKind::Real(0), 100.0, 40.0),
                (ItemKind::Real(1), 100.0, 90.0),
            ],
            vec![(ItemKind::Real(2), 100.0, 50.0)],
        ]);
        let cfg = CustomLayoutConfig::default();
        let tops = assign_rank_bands(&mut layered, &demand_with_gaps(vec![0.0, 0.0]), &cfg);

        assert_eq!(tops.len(), 2);
        assert_eq!(tops[0], 0.0);
        // Band 0 is 90 tall (the taller of 40 and 90), then the configured minimum gap applies.
        assert_eq!(tops[1], 90.0 + cfg.effective_rank_gap());
    }

    #[test]
    fn items_are_vertically_centred_in_their_band() {
        let mut layered = make_layered(&[vec![
            (ItemKind::Real(0), 100.0, 40.0),
            (ItemKind::Real(1), 100.0, 90.0),
        ]]);
        assign_rank_bands(
            &mut layered,
            &demand_with_gaps(vec![0.0]),
            &CustomLayoutConfig::default(),
        );
        // 40-tall item is centred inside the 90-tall band.
        assert_eq!(layered.items[0].y, 25.0);
        assert_eq!(layered.items[1].y, 0.0);
    }

    #[test]
    fn zero_height_dummies_sit_on_the_band_centre_line() {
        let mut layered = make_layered(&[
            vec![(ItemKind::Real(0), 100.0, 80.0)],
            vec![
                (ItemKind::Dummy { edge: 0, seq: 0 }, 0.0, 0.0),
                (ItemKind::Real(1), 100.0, 60.0),
            ],
            vec![
                (ItemKind::Dummy { edge: 0, seq: 1 }, 0.0, 0.0),
                (ItemKind::Real(2), 100.0, 20.0),
            ],
        ]);
        let cfg = CustomLayoutConfig::default();
        let tops = assign_rank_bands(&mut layered, &demand_with_gaps(vec![0.0, 0.0, 0.0]), &cfg);

        // Each dummy is on its own band's centre line.
        assert_eq!(layered.items[1].y, tops[1] + 30.0);
        assert_eq!(layered.items[3].y, tops[2] + 10.0);
        // A dummy is exactly the centre of its band, so the chain is straight in the sense that
        // each dummy's centre_y equals its band centre.
        assert_eq!(layered.items[1].center_y(), tops[1] + 30.0);
        assert_eq!(layered.items[3].center_y(), tops[2] + 10.0);
    }

    #[test]
    fn a_tall_label_item_raises_its_band() {
        let short = make_layered(&[
            vec![(ItemKind::Real(0), 100.0, 40.0)],
            vec![(ItemKind::Real(1), 100.0, 40.0)],
        ]);
        let tall = make_layered(&[
            vec![
                (ItemKind::Real(0), 100.0, 40.0),
                (ItemKind::Label(7), 80.0, 200.0),
            ],
            vec![(ItemKind::Real(1), 100.0, 40.0)],
        ]);

        let cfg = CustomLayoutConfig::default();
        let mut short = short;
        let mut tall = tall;
        let short_tops = assign_rank_bands(&mut short, &demand_with_gaps(vec![0.0, 0.0]), &cfg);
        let tall_tops = assign_rank_bands(&mut tall, &demand_with_gaps(vec![0.0, 0.0]), &cfg);

        assert_eq!(short_tops[1], 40.0 + cfg.effective_rank_gap());
        assert_eq!(tall_tops[1], 200.0 + cfg.effective_rank_gap());
        assert!(tall_tops[1] > short_tops[1]);
    }

    #[test]
    fn rank_gap_min_is_honoured_when_it_exceeds_the_configured_minimum() {
        let mut layered = make_layered(&[
            vec![(ItemKind::Real(0), 100.0, 30.0)],
            vec![(ItemKind::Real(1), 100.0, 30.0)],
            vec![(ItemKind::Real(2), 100.0, 30.0)],
        ]);
        let cfg = CustomLayoutConfig::default();
        let big = cfg.effective_rank_gap() + 500.0;
        let tops = assign_rank_bands(&mut layered, &demand_with_gaps(vec![big, 1.0, 0.0]), &cfg);

        assert_eq!(tops[1], 30.0 + big);
        // The second gap is below the configured minimum, so the minimum wins.
        assert_eq!(tops[2], tops[1] + 30.0 + cfg.effective_rank_gap());
    }

    #[test]
    fn missing_and_non_finite_gaps_fall_back_to_the_configured_minimum() {
        let mut layered = make_layered(&[
            vec![(ItemKind::Real(0), 100.0, 30.0)],
            vec![(ItemKind::Real(1), 100.0, 30.0)],
        ]);
        let cfg = CustomLayoutConfig::default();

        let empty = assign_rank_bands(&mut layered, &demand_with_gaps(Vec::new()), &cfg);
        assert_eq!(empty[1], 30.0 + cfg.effective_rank_gap());

        let nan = assign_rank_bands(&mut layered, &demand_with_gaps(vec![f64::NAN, 0.0]), &cfg);
        assert_eq!(nan[1], 30.0 + cfg.effective_rank_gap());
    }

    #[test]
    fn a_rank_of_only_dummies_has_zero_height() {
        let mut layered = make_layered(&[
            vec![(ItemKind::Real(0), 100.0, 50.0)],
            vec![(ItemKind::Dummy { edge: 0, seq: 0 }, 0.0, 0.0)],
            vec![(ItemKind::Real(1), 100.0, 50.0)],
        ]);
        let cfg = CustomLayoutConfig::default();
        let tops = assign_rank_bands(&mut layered, &demand_with_gaps(vec![0.0, 0.0, 0.0]), &cfg);
        let gap = cfg.effective_rank_gap();
        assert_eq!(tops[1], 50.0 + gap);
        assert_eq!(tops[2], tops[1] + 0.0 + gap);
        assert_eq!(layered.items[1].y, tops[1]);
    }

    #[test]
    fn repeated_runs_are_byte_identical() {
        let build = || {
            make_layered(&[
                vec![
                    (ItemKind::Real(0), 100.0, 40.0),
                    (ItemKind::Label(1), 60.0, 24.0),
                ],
                vec![
                    (ItemKind::Dummy { edge: 1, seq: 0 }, 0.0, 0.0),
                    (ItemKind::Real(1), 120.0, 70.0),
                ],
            ])
        };
        let cfg = CustomLayoutConfig::default();
        let mut a = build();
        let mut b = build();
        let ta = assign_rank_bands(&mut a, &demand_with_gaps(vec![13.0, 0.0]), &cfg);
        let tb = assign_rank_bands(&mut b, &demand_with_gaps(vec![13.0, 0.0]), &cfg);
        assert_eq!(ta.to_vec(), tb.to_vec());
        for (ia, ib) in a.items.iter().zip(b.items.iter()) {
            assert_eq!(ia.y.to_bits(), ib.y.to_bits());
        }
    }
}
