//! # Step 7.2: Shared geometric-engine helpers
//!
//! Utilities used by every engine that places boxes freely and then draws straight edges between
//! them, rather than routing through layered channels. Today that is only the radial engine; the
//! organic (stress-majorization) engine that also used them was removed in v3 at the user's
//! request. The helpers stayed because the alternative was inlining route construction, overlap
//! removal and badge placement into radial, which is where they would then have to be duplicated
//! again by the next geometric mode.
//!
//! The distinction that matters: these engines cannot make the guarantees the layered pipeline
//! makes. A straight line between two boxes may grazes a third, and badge placement is a local
//! best-effort pass. `check_constraints` still reports those, but the audit records them rather
//! than failing on them — see `docs/concepts/quality-model.md`.

use std::collections::HashMap;
use std::f64::consts::TAU;

use crate::badge_measurement::get_badge_display_text;
use crate::config::{CustomLayoutConfig, EdgeStyle, LabelPlacement};
use crate::geometry::{
    clip_ray_to_rect, expand_rect, nearest_point_on_polyline, segment_clipped_length,
    segment_intersects_rect_interior,
};
use crate::step6_validation::constraints::SpatialHash;
use crate::step6_validation::{check_constraints, compute_metrics};
use crate::types::{
    get_now_ms, BadgePlacement, CustomLayoutResult, EdgeCrossing, GraphIr, LayoutDiagnostic,
    LayoutMetrics, LayoutValidationResult, NormalizedEdge, OptimizationStats, Point, PortRef,
    PositionedNode, Rect, RoutedPath, Segment, Side,
};

/// Fraction of the distance to the centre that a non-tree chord bends in radial mode.
pub const CHORD_BOW: f64 = 0.3;

// =============================================================================================
// The engine
// =============================================================================================

/// Separates overlapping rectangles. **After this returns, no two boxes overlap.**
///
/// Two stages, and the split matters:
///
/// 1. [`relax_overlaps`] — `config.overlap_removal_passes` symmetric push-apart passes. Cheap,
///    local, and it preserves the arrangement the caller found because it moves both boxes of a
///    pair equally along whichever axis needs the smaller displacement. It is a *shaping* pass: on
///    a 600-node mesh it removes the great majority of overlaps but not all of them, and driving it
///    to zero takes O(n) passes, i.e. O(n^2) work.
/// 2. [`enforce_separation`] — one exact scan-line pass that closes whatever is left. It is where
///    the guarantee comes from.
///
/// Doing only (1) would ship a defect nothing downstream can repair; doing only (2) would produce a
/// drawing skewed to the right, because (2) resolves everything by moving boxes in one direction.
/// Running (1) first is what leaves (2) almost nothing to do.
///
/// `overlap_removal_passes == 0` disables **both** stages. That is the only configuration in which
/// these engines can emit overlapping boxes, and it does so deliberately, for callers who want to
/// see the raw stress or ring positions.
pub fn remove_overlaps(rects: &mut [Rect], config: &CustomLayoutConfig) {
    if rects.len() < 2 || config.overlap_removal_passes == 0 {
        return;
    }
    relax_overlaps(rects, config);
    enforce_separation(rects, config);
}

/// Symmetric push-apart relaxation; see [`remove_overlaps`] for how it fits.
///
/// Each pass indexes the boxes in a uniform grid, walks the candidate pairs in ascending
/// `(i, j)` order, and for every pair still closer than its required separation moves both centres
/// half the penetration apart **along the axis of least penetration**. The cheaper axis is the
/// smallest displacement that resolves the overlap, which is exactly why the arrangement survives.
///
/// Horizontal clearance is `effective_node_gap()` and vertical clearance is `effective_rank_gap()`.
/// The organic and radial engines have no ranks, but the two knobs still mean "side-by-side
/// breathing room" and "stacked breathing room", so honouring both keeps the spacing family
/// meaningful in these modes.
///
/// Stops early when a pass applies no push. That is a termination shortcut, not a convergence
/// test — nothing is re-run or rolled back.
fn relax_overlaps(rects: &mut [Rect], config: &CustomLayoutConfig) {
    let n = rects.len();
    let gap_x = config.effective_node_gap().max(0.0);
    let gap_y = config.effective_rank_gap().max(0.0);
    let margin = gap_x.max(gap_y);
    let eps = config.epsilon;

    for _pass in 0..config.overlap_removal_passes {
        let mut index = SpatialHash::new(mean_cell(
            rects
                .iter()
                .map(|r| (r.width + 2.0 * margin, r.height + 2.0 * margin)),
        ));
        for (i, r) in rects.iter().enumerate() {
            index.insert(i as u32, &expand_rect(r, margin));
        }

        let mut moved = false;
        for i in 0..n {
            let probe = expand_rect(&rects[i], margin);
            for cand in index.query(&probe) {
                let j = cand as usize;
                if j <= i || j >= n {
                    continue;
                }
                let ci = rects[i].center();
                let cj = rects[j].center();
                let need_x = (rects[i].width + rects[j].width) / 2.0 + gap_x;
                let need_y = (rects[i].height + rects[j].height) / 2.0 + gap_y;
                let dx = cj.x - ci.x;
                let dy = cj.y - ci.y;
                let over_x = need_x - dx.abs();
                let over_y = need_y - dy.abs();
                if over_x <= eps || over_y <= eps {
                    continue;
                }
                if over_x <= over_y {
                    let s = if dx >= 0.0 { 1.0 } else { -1.0 };
                    rects[i].x -= s * over_x / 2.0;
                    rects[j].x += s * over_x / 2.0;
                } else {
                    let s = if dy >= 0.0 { 1.0 } else { -1.0 };
                    rects[i].y -= s * over_y / 2.0;
                    rects[j].y += s * over_y / 2.0;
                }
                moved = true;
            }
        }

        if !moved {
            break;
        }
    }
}

/// Exact horizontal separation sweep. **Guarantees no two boxes overlap when it returns.**
///
/// Boxes are visited in ascending centre-x order and each is pushed just far enough right to clear
/// every already-placed box it still overlaps vertically:
///
/// ```text
/// cx(j) := max( cx(j), max over placed i overlapping j in y of  cx(i) + (w_i + w_j)/2 + nodeGap )
/// ```
///
/// Correctness is the whole point and is easy to see: after `j` is placed, every earlier box either
/// misses it in `y` or is at least `(w_i + w_j)/2` to its left, so no pair can overlap. Because
/// boxes only ever move right, placing `j` cannot disturb a pair that was already resolved — which
/// is what makes one pass sufficient and a second one pointless.
///
/// Vertical conflict is tested on the raw boxes rather than on gap-inflated ones. Demanding
/// `rank_gap` of vertical clearance here would convert nearly every pair into a horizontal
/// constraint and shear the drawing sideways; the relaxation above already opened the comfortable
/// gaps, and this pass exists only to close the residue.
///
/// Ties in centre x are broken by centre y and then by index, so the sweep order — and therefore
/// the output — is identical across processes.
fn enforce_separation(rects: &mut [Rect], config: &CustomLayoutConfig) {
    let n = rects.len();
    if n < 2 {
        return;
    }
    let gap_x = config.effective_node_gap().max(0.0);
    let eps = config.epsilon;

    let mut order: Vec<u32> = (0..n as u32).collect();
    order.sort_by(|&a, &b| {
        let ca = rects[a as usize].center();
        let cb = rects[b as usize].center();
        ca.x.partial_cmp(&cb.x)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(ca.y.partial_cmp(&cb.y).unwrap_or(std::cmp::Ordering::Equal))
            .then(a.cmp(&b))
    });

    for k in 1..n {
        let j = order[k] as usize;
        let cj = rects[j].center();
        let mut required_cx = f64::NEG_INFINITY;
        for &earlier in &order[..k] {
            let i = earlier as usize;
            let ci = rects[i].center();
            let overlap_y = (rects[i].height + rects[j].height) / 2.0;
            if (ci.y - cj.y).abs() >= overlap_y - eps {
                continue;
            }
            let need_x = (rects[i].width + rects[j].width) / 2.0 + gap_x;
            required_cx = required_cx.max(ci.x + need_x);
        }
        if required_cx.is_finite() && cj.x < required_cx {
            rects[j].x += required_cx - cj.x;
        }
    }
}

// =============================================================================================
// Deterministic pseudo-randomness
// =============================================================================================

// =============================================================================================
// Shared geometric-engine support
// =============================================================================================

/// Undirected adjacency over dense node indices, built from both CSRs.
///
/// Self-loops are dropped and duplicate neighbours are kept: BFS ignores repeats and removing them
/// would cost a sort per node for no benefit. Neighbour order follows CSR order, i.e. input edge
/// order, so every traversal built on this is reproducible.
pub fn undirected_adjacency(ir: &GraphIr) -> Vec<Vec<u32>> {
    let n = ir.node_count();
    let mut adj: Vec<Vec<u32>> = vec![Vec::new(); n];
    for v in 0..n as u32 {
        for &w in ir.out_csr.neighbours(v) {
            if w != v {
                adj[v as usize].push(w);
            }
        }
        for &w in ir.in_csr.neighbours(v) {
            if w != v {
                adj[v as usize].push(w);
            }
        }
    }
    adj
}

/// The side of `rect` nearest to a boundary point.
///
/// Ties resolve `Top`, `Right`, `Bottom`, `Left` — a fixed order, so a point landing exactly on a
/// corner always reports the same side.
pub fn nearest_side(rect: &Rect, p: &Point) -> Side {
    let mut best = Side::Top;
    let mut best_d = (p.y - rect.y).abs();
    for (side, d) in [
        (Side::Right, (p.x - rect.right()).abs()),
        (Side::Bottom, (p.y - rect.bottom()).abs()),
        (Side::Left, (p.x - rect.x).abs()),
    ] {
        if d < best_d {
            best = side;
            best_d = d;
        }
    }
    best
}

/// Clips the ray from `rect`'s centre toward `toward`, guaranteeing a point on the boundary.
///
/// [`clip_ray_to_rect`] returns the centre when the direction is degenerate (coincident centres, or
/// a zero-area box). The centre is *not* on the boundary, and Phase 9 rejects an off-boundary port,
/// so this wrapper substitutes the right-edge midpoint — an arbitrary but valid and reproducible
/// attachment.
pub fn clip_to_boundary(rect: &Rect, toward: &Point) -> Point {
    let p = clip_ray_to_rect(rect, toward);
    let c = rect.center();
    let degenerate = (p.x - c.x).abs() < f64::EPSILON
        && (p.y - c.y).abs() < f64::EPSILON
        && (rect.width > 0.0 || rect.height > 0.0);
    if degenerate || !p.x.is_finite() || !p.y.is_finite() {
        Point {
            x: rect.right(),
            y: c.y,
        }
    } else {
        p
    }
}

/// Converts unscaled polar coordinates $(r, \theta)$ to elliptical Cartesian coordinates $(x, y)$.
#[inline]
pub fn polar_to_cartesian(r: f64, theta: f64, ax: f64, ay: f64) -> Point {
    Point {
        x: r * ax * theta.cos(),
        y: r * ay * theta.sin(),
    }
}

/// Converts Cartesian coordinates $(x, y)$ to unscaled polar coordinates $(r, \theta \in [0, 2\pi))$.
#[inline]
pub fn cartesian_to_polar(p: &Point, ax: f64, ay: f64) -> (f64, f64) {
    let ux = if ax.abs() > 1e-9 { p.x / ax } else { p.x };
    let uy = if ay.abs() > 1e-9 { p.y / ay } else { p.y };
    let r = (ux * ux + uy * uy).sqrt();
    let theta = uy.atan2(ux);
    let norm_theta = if theta < 0.0 { theta + TAU } else { theta };
    (r, norm_theta)
}

/// Bounding polar sector of a rectangle in unscaled polar space.
/// Returns `(r_min, r_max, theta_min, theta_max)`.
pub fn polar_bounding_sector(
    rect: &Rect,
    ax: f64,
    ay: f64,
    clearance: f64,
) -> (f64, f64, f64, f64) {
    let c = rect.center();
    let cx_unscaled = if ax.abs() > 1e-9 { c.x / ax } else { c.x };
    let cy_unscaled = if ay.abs() > 1e-9 { c.y / ay } else { c.y };
    let c_r = (cx_unscaled.powi(2) + cy_unscaled.powi(2)).sqrt();
    let c_theta = cy_unscaled.atan2(cx_unscaled);

    let corners = [
        Point {
            x: rect.x,
            y: rect.y,
        },
        Point {
            x: rect.right(),
            y: rect.y,
        },
        Point {
            x: rect.right(),
            y: rect.bottom(),
        },
        Point {
            x: rect.x,
            y: rect.bottom(),
        },
    ];

    let mut r_min = f64::INFINITY;
    let mut r_max = f64::NEG_INFINITY;
    let mut dtheta_min = f64::INFINITY;
    let mut dtheta_max = f64::NEG_INFINITY;

    for pt in &corners {
        let ux = if ax.abs() > 1e-9 { pt.x / ax } else { pt.x };
        let uy = if ay.abs() > 1e-9 { pt.y / ay } else { pt.y };
        let r = (ux.powi(2) + uy.powi(2)).sqrt();
        r_min = r_min.min(r);
        r_max = r_max.max(r);

        let theta = uy.atan2(ux);
        let mut dtheta = theta - c_theta;
        while dtheta > std::f64::consts::PI {
            dtheta -= TAU;
        }
        while dtheta < -std::f64::consts::PI {
            dtheta += TAU;
        }
        dtheta_min = dtheta_min.min(dtheta);
        dtheta_max = dtheta_max.max(dtheta);
    }

    let d_clear_theta = if c_r > 0.0 { clearance / c_r } else { 0.1 };
    (
        (r_min - clearance).max(0.0),
        r_max + clearance,
        c_theta + dtheta_min - d_clear_theta,
        c_theta + dtheta_max + d_clear_theta,
    )
}

/// Axis-aligned bounding box around a line segment expanded by epsilon.
#[inline]
pub fn segment_bbox(seg: &Segment, eps: f64) -> Rect {
    let min_x = seg.a.x.min(seg.b.x) - eps;
    let min_y = seg.a.y.min(seg.b.y) - eps;
    let max_x = seg.a.x.max(seg.b.x) + eps;
    let max_y = seg.a.y.max(seg.b.y) + eps;
    Rect {
        x: if min_x.is_finite() { min_x } else { 0.0 },
        y: if min_y.is_finite() { min_y } else { 0.0 },
        width: if max_x >= min_x && (max_x - min_x).is_finite() {
            max_x - min_x
        } else {
            0.0
        },
        height: if max_y >= min_y && (max_y - min_y).is_finite() {
            max_y - min_y
        } else {
            0.0
        },
    }
}

/// Returns true if any segment of `points` penetrates into the interior of any node box in `rects`.
pub fn check_polyline_node_collision(
    points: &[Point],
    node_index: &SpatialHash,
    rects: &[Rect],
    eps: f64,
) -> bool {
    if points.len() < 2 {
        return false;
    }
    for w in points.windows(2) {
        let seg = Segment { a: w[0], b: w[1] };
        if !seg.a.x.is_finite()
            || !seg.a.y.is_finite()
            || !seg.b.x.is_finite()
            || !seg.b.y.is_finite()
        {
            continue;
        }
        let bb = segment_bbox(&seg, eps);
        for cand in node_index.query(&bb) {
            let j = cand as usize;
            if let Some(r) = rects.get(j) {
                if segment_intersects_rect_interior(&seg, r, eps) {
                    return true;
                }
            }
        }
    }
    false
}

/// Counts total segments of `points` penetrating into the interior of any node box in `rects`.
pub fn count_polyline_node_collisions(
    points: &[Point],
    node_index: &SpatialHash,
    rects: &[Rect],
    eps: f64,
) -> usize {
    if points.len() < 2 {
        return 0;
    }
    let mut count = 0usize;
    for w in points.windows(2) {
        let seg = Segment { a: w[0], b: w[1] };
        if !seg.a.x.is_finite()
            || !seg.a.y.is_finite()
            || !seg.b.x.is_finite()
            || !seg.b.y.is_finite()
        {
            continue;
        }
        let bb = segment_bbox(&seg, eps);
        for cand in node_index.query(&bb) {
            let j = cand as usize;
            if let Some(r) = rects.get(j) {
                if segment_intersects_rect_interior(&seg, r, eps) {
                    count += 1;
                }
            }
        }
    }
    count
}

/// Computes the total Euclidean length of a polyline.
pub fn polyline_length(points: &[Point]) -> f64 {
    let mut len = 0.0;
    for w in points.windows(2) {
        len += (w[1].x - w[0].x).hypot(w[1].y - w[0].y);
    }
    len
}

/// Identifies all node indices whose interior is penetrated by `seg`, skipping endpoints `skip_u` and `skip_v`.
pub fn detect_segment_obstacles(
    seg: &Segment,
    node_index: &SpatialHash,
    rects: &[Rect],
    skip_u: usize,
    skip_v: usize,
    eps: f64,
) -> Vec<usize> {
    let mut obstacles = Vec::new();
    let bb = segment_bbox(seg, eps);
    for cand in node_index.query(&bb) {
        let j = cand as usize;
        if j == skip_u || j == skip_v {
            continue;
        }
        if let Some(r) = rects.get(j) {
            if segment_intersects_rect_interior(seg, r, eps) {
                obstacles.push(j);
            }
        }
    }
    obstacles
}

/// Radius of the concentric routing corridor at index `k`.
///
/// For ring index $k \in \{0, \dots, K-1\}$, $R_{\text{corr}, k} = (R_k + R_{k+1}) / 2$.
/// For outermost ring $K$ and beyond, corridors extend monotonically outward.
pub fn get_corridor_radius(radii: &[f64], k: usize, ring_gap: f64) -> f64 {
    if radii.is_empty() {
        return (k as f64 + 1.0) * ring_gap / 2.0;
    }
    if radii.len() == 1 {
        return radii[0] + (k as f64 + 1.0) * ring_gap / 2.0;
    }
    if k + 1 < radii.len() {
        (radii[k] + radii[k + 1]) / 2.0
    } else {
        let last = *radii.last().unwrap();
        let prev = radii[radii.len().saturating_sub(2)];
        let step = (last - prev).max(ring_gap);
        let extra = (k + 1 - radii.len()) as f64;
        last + step * (extra + 0.5)
    }
}

/// Generates waypoints using the Polar Corridor Detour Routing Algorithm (PCDRA).
fn route_pcdra_waypoints(
    _s: u32,
    _t: u32,
    k_s: usize,
    k_t: usize,
    rs: &Rect,
    rt: &Rect,
    theta_entry: f64,
    theta_exit: f64,
    radii: &[f64],
    ax: f64,
    ay: f64,
    ring_gap: f64,
    track_offset: f64,
    node_index: &SpatialHash,
    rects: &[Rect],
    eps: f64,
) -> Vec<Point> {
    let n_rings = radii.len();

    // Collect candidate corridors in priority order
    let mut candidate_corridors = Vec::new();
    let (k_min, k_max) = if k_s < k_t { (k_s, k_t) } else { (k_t, k_s) };
    if k_min > 0 {
        candidate_corridors.push(get_corridor_radius(radii, k_min - 1, ring_gap));
    }
    for k in k_min..=k_max {
        let r_c = get_corridor_radius(radii, k, ring_gap);
        if !candidate_corridors.contains(&r_c) {
            candidate_corridors.push(r_c);
        }
    }
    for k in 0..n_rings {
        let r_c = get_corridor_radius(radii, k, ring_gap);
        if !candidate_corridors.contains(&r_c) {
            candidate_corridors.push(r_c);
        }
    }

    // Angular directions: clockwise vs counter-clockwise
    let delta_cw = if theta_exit >= theta_entry {
        theta_exit - theta_entry
    } else {
        TAU + theta_exit - theta_entry
    };
    let delta_ccw = TAU - delta_cw;

    let directions = if delta_cw <= delta_ccw {
        [(true, delta_cw), (false, -delta_ccw)]
    } else {
        [(false, -delta_ccw), (true, delta_cw)]
    };

    let mut fallback_candidate: Option<(usize, f64, Vec<Point>)> = None;

    for &r_base in &candidate_corridors {
        for &fractional_offset in &[
            0.0,
            0.25 * ring_gap,
            -0.25 * ring_gap,
            0.5 * ring_gap,
            -0.5 * ring_gap,
        ] {
            let r_c = (r_base + track_offset + fractional_offset).max(1.0);
            for &(is_cw, _span) in &directions {
                let travel_sign = if is_cw { 1.0 } else { -1.0 };
                let alpha_s = travel_sign * (16.0 + track_offset.abs() * 0.5) / r_c.max(50.0);
                let alpha_t = travel_sign * (16.0 + track_offset.abs() * 0.5) / r_c.max(50.0);

                let theta_entry_actual = theta_entry + alpha_s;
                let theta_exit_actual = theta_exit - alpha_t;

                let p_entry = polar_to_cartesian(r_c, theta_entry_actual, ax, ay);
                let p_exit = polar_to_cartesian(r_c, theta_exit_actual, ax, ay);
                let p_src = clip_to_boundary(rs, &p_entry);
                let p_tgt = clip_to_boundary(rt, &p_exit);

                let actual_span = if is_cw {
                    if theta_exit_actual >= theta_entry_actual {
                        theta_exit_actual - theta_entry_actual
                    } else {
                        TAU + theta_exit_actual - theta_entry_actual
                    }
                } else {
                    if theta_exit_actual <= theta_entry_actual {
                        theta_exit_actual - theta_entry_actual
                    } else {
                        theta_exit_actual - theta_entry_actual - TAU
                    }
                };

                let abs_span = actual_span.abs();
                let num_steps =
                    ((abs_span / (std::f64::consts::PI / 6.0)).ceil() as usize).clamp(2, 12);

                let mut pts = Vec::with_capacity(num_steps + 3);
                pts.push(p_src);
                if (p_entry.x - p_src.x).hypot(p_entry.y - p_src.y) > 0.5 {
                    pts.push(p_entry);
                }
                for step in 1..num_steps {
                    let frac = step as f64 / num_steps as f64;
                    let theta_frac = theta_entry_actual + frac * actual_span;
                    let p_frac = polar_to_cartesian(r_c, theta_frac, ax, ay);
                    if (p_frac.x - pts.last().unwrap().x).hypot(p_frac.y - pts.last().unwrap().y)
                        > 0.5
                    {
                        pts.push(p_frac);
                    }
                }
                if (p_exit.x - pts.last().unwrap().x).hypot(p_exit.y - pts.last().unwrap().y) > 0.5
                {
                    pts.push(p_exit);
                }
                if (p_tgt.x - pts.last().unwrap().x).hypot(p_tgt.y - pts.last().unwrap().y) > 0.5 {
                    pts.push(p_tgt);
                } else {
                    *pts.last_mut().unwrap() = p_tgt;
                }

                let collisions = count_polyline_node_collisions(&pts, node_index, rects, eps);
                let length = polyline_length(&pts);

                if collisions == 0 {
                    return pts;
                }

                let is_better = match &fallback_candidate {
                    Some((best_col, best_len, _)) => {
                        collisions < *best_col || (collisions == *best_col && length < *best_len)
                    }
                    None => true,
                };
                if is_better {
                    fallback_candidate = Some((collisions, length, pts));
                }
            }
        }
    }

    if let Some((_, _, pts)) = fallback_candidate {
        pts
    } else {
        vec![
            clip_to_boundary(rs, &rt.center()),
            clip_to_boundary(rt, &rs.center()),
        ]
    }
}

/// Materializes collision-free radial routes using the Polar Corridor Detour Routing Algorithm (PCDRA).
///
/// Guarantees 0 edge-node interior penetrations by:
/// 1. Testing straight spokes (for tree edges) and inward bowed chords against all node boxes.
/// 2. If collisions are detected, routing through concentric inter-ring ($R_{\text{corr}, k} = (R_k + R_{k+1})/2$)
///    or intra-ring corridors with tangential avoidance waypoints `<p_src, p_entry, p_mid, p_exit, p_tgt>`.
/// 3. Clipping endpoints strictly to node boundaries via [`clip_to_boundary`] with outward normal ports.
#[allow(clippy::too_many_arguments)]
pub fn build_radial_pcdra_routes(
    ir: &GraphIr,
    tree_rings: &[u32],
    tree_parents: &[u32],
    rects: &[Rect],
    radii: &[f64],
    ax: f64,
    ay: f64,
    config: &CustomLayoutConfig,
) -> Vec<RoutedPath> {
    let mut port_seq: HashMap<(u32, Side), usize> = HashMap::new();
    let mut out: Vec<RoutedPath> = Vec::with_capacity(ir.edge_count());

    let mut node_index = SpatialHash::new(mean_cell(rects.iter().map(|r| (r.width, r.height))));
    for (i, r) in rects.iter().enumerate() {
        node_index.insert(i as u32, r);
    }

    let eps = if config.epsilon.is_finite() && config.epsilon > 0.0 {
        config.epsilon
    } else {
        1e-9
    };

    let ring_gap = (config.radial_ring_gap * config.compaction.gap_scale())
        .max(config.effective_rank_gap())
        .max(10.0);

    let mut pair_counts: HashMap<(u32, u32), usize> = HashMap::new();
    for edge in &ir.edges {
        let pair = if edge.source < edge.target {
            (edge.source, edge.target)
        } else {
            (edge.target, edge.source)
        };
        *pair_counts.entry(pair).or_insert(0) += 1;
    }

    let mut pair_current: HashMap<(u32, u32), usize> = HashMap::new();

    // Golden ratio for low-discrepancy track staggering across all edges
    let golden_ratio = 0.618_033_988_749_895f64;

    for e in 0..ir.edge_count() {
        let edge = &ir.edges[e];
        let (s, t) = (edge.source as usize, edge.target as usize);
        let edge_id = ir.edge_name(e as u32).to_string();

        let (Some(rs), Some(rt)) = (rects.get(s), rects.get(t)) else {
            continue;
        };

        if s == t {
            out.push(self_loop_route(
                edge_id,
                edge.source,
                ir.node_name(edge.source),
                rs,
                &mut port_seq,
                config,
            ));
            continue;
        }

        let pair = if edge.source < edge.target {
            (edge.source, edge.target)
        } else {
            (edge.target, edge.source)
        };
        let bundle_size = *pair_counts.get(&pair).unwrap_or(&1);
        let bundle_idx = *pair_current.entry(pair).or_insert(0);
        pair_current.insert(pair, bundle_idx + 1);

        let is_tree = (t < tree_parents.len() && tree_parents[t] == edge.source)
            || (s < tree_parents.len() && tree_parents[s] == edge.target);

        let k_s = tree_rings.get(s).copied().unwrap_or(0) as usize;
        let k_t = tree_rings.get(t).copied().unwrap_or(0) as usize;

        let cs = rs.center();
        let ct = rt.center();
        let (_, theta_s) = cartesian_to_polar(&cs, ax, ay);
        let (_, theta_t) = cartesian_to_polar(&ct, ax, ay);

        let dist_st = (cs.x - ct.x).hypot(cs.y - ct.y).max(50.0);
        let bundle_delta_theta = if bundle_size > 1 {
            (bundle_idx as f64 - (bundle_size - 1) as f64 / 2.0) * (10.0 / dist_st)
        } else {
            0.0
        };

        let theta_s_entry = theta_s + bundle_delta_theta;
        let theta_t_exit = theta_t + bundle_delta_theta;

        let bundle_offset = if bundle_size > 1 {
            (bundle_idx as f64 - (bundle_size - 1) as f64 / 2.0)
                * (ring_gap / (bundle_size + 1) as f64).clamp(4.0, 16.0)
        } else {
            0.0
        };

        let edge_frac = ((e as f64 + 1.0) * golden_ratio).fract();
        let edge_track_offset = (edge_frac - 0.5) * (ring_gap * 0.35).min(10.0);

        let mut best_pts: Option<Vec<Point>> = None;

        // If it's a singleton tree edge (bundle_size == 1), direct radial spoke is straight and clean
        if is_tree && bundle_size == 1 {
            let p_src_direct = clip_to_boundary(rs, &ct);
            let p_tgt_direct = clip_to_boundary(rt, &cs);
            let direct_pts = vec![p_src_direct, p_tgt_direct];

            if !check_polyline_node_collision(&direct_pts, &node_index, rects, eps) {
                best_pts = Some(direct_pts);
            }
        }

        // All chords, cross-ring edges, and parallel bundles route through PCDRA corridors
        let points = match best_pts {
            Some(pts) => pts,
            None => route_pcdra_waypoints(
                edge.source,
                edge.target,
                k_s,
                k_t,
                rs,
                rt,
                theta_s_entry,
                theta_t_exit,
                radii,
                ax,
                ay,
                ring_gap,
                bundle_offset + edge_track_offset,
                &node_index,
                rects,
                eps,
            ),
        };

        let p_src = points[0];
        let p_tgt = *points.last().unwrap();

        let source_port = make_port(
            ir.node_name(edge.source).to_string(),
            edge.source,
            rs,
            p_src,
            &mut port_seq,
            config,
        );
        let target_port = make_port(
            ir.node_name(edge.target).to_string(),
            edge.target,
            rt,
            p_tgt,
            &mut port_seq,
            config,
        );

        out.push(RoutedPath {
            edge_id,
            points,
            source_port,
            target_port,
        });
    }

    out
}

/// Materializes one polyline per IR edge, clipped to the endpoint boxes.
///
/// **Index contract:** the returned vector is parallel to [`GraphIr::edges`] — entry `e` routes edge
/// `e`. [`place_badges`] and [`finish_geometric_layout`] rely on that alignment.
///
/// `bows` may be empty (all edges straight) or parallel to `ir.edges`; a `Some(point)` entry inserts
/// that point as the single interior waypoint and, importantly, is also what both ends clip
/// *toward*, so the polyline leaves each box pointing at the bend rather than at the far node.
///
/// Self-loops become a fixed four-point bracket on the node's right side. There is nothing to clip
/// and nothing to search: the shape is a table lookup.
pub fn build_routes(
    ir: &GraphIr,
    rects: &[Rect],
    bows: &[Option<Point>],
    config: &CustomLayoutConfig,
) -> Vec<RoutedPath> {
    let mut port_seq: HashMap<(u32, Side), usize> = HashMap::new();
    let mut out: Vec<RoutedPath> = Vec::with_capacity(ir.edge_count());

    for e in 0..ir.edge_count() {
        let edge = &ir.edges[e];
        let (s, t) = (edge.source as usize, edge.target as usize);
        let edge_id = ir.edge_name(e as u32).to_string();

        let (Some(rs), Some(rt)) = (rects.get(s), rects.get(t)) else {
            continue;
        };

        if s == t {
            out.push(self_loop_route(
                edge_id,
                edge.source,
                ir.node_name(edge.source),
                rs,
                &mut port_seq,
                config,
            ));
            continue;
        }

        let bow = bows.get(e).copied().flatten();
        let toward_src = bow.unwrap_or_else(|| rt.center());
        let toward_tgt = bow.unwrap_or_else(|| rs.center());
        let p_src = clip_to_boundary(rs, &toward_src);
        let p_tgt = clip_to_boundary(rt, &toward_tgt);

        let points = match bow {
            Some(b) => vec![p_src, b, p_tgt],
            None => vec![p_src, p_tgt],
        };

        let source_port = make_port(
            ir.node_name(edge.source).to_string(),
            edge.source,
            rs,
            p_src,
            &mut port_seq,
            config,
        );
        let target_port = make_port(
            ir.node_name(edge.target).to_string(),
            edge.target,
            rt,
            p_tgt,
            &mut port_seq,
            config,
        );

        out.push(RoutedPath {
            edge_id,
            points,
            source_port,
            target_port,
        });
    }

    out
}

/// A port at `point` on `rect`, with its per-`(node, side)` index taken from a running counter.
///
/// The counter is keyed by a `HashMap` that is only ever *looked up*, never iterated, so it cannot
/// leak hash order into the output; the indices it hands out follow IR edge order.
fn make_port(
    node_id: String,
    node: u32,
    rect: &Rect,
    point: Point,
    port_seq: &mut HashMap<(u32, Side), usize>,
    config: &CustomLayoutConfig,
) -> PortRef {
    let side = nearest_side(rect, &point);
    let slot = port_seq.entry((node, side)).or_insert(0);
    let index = *slot;
    *slot += 1;
    let normal = side.normal();
    PortRef {
        node_id,
        side,
        index,
        point,
        stub: Point {
            x: point.x + normal.x * config.port_stub_length,
            y: point.y + normal.y * config.port_stub_length,
        },
    }
}

/// A self-loop drawn as a bracket off the node's right side.
///
/// Both endpoints sit on the right edge at one third and two thirds of the node's height, so the
/// loop is symmetric about the node's centre line and cannot be confused with a real edge that
/// happens to leave rightward.
fn self_loop_route(
    edge_id: String,
    node: u32,
    node_name: &str,
    rect: &Rect,
    port_seq: &mut HashMap<(u32, Side), usize>,
    config: &CustomLayoutConfig,
) -> RoutedPath {
    let reach = config.port_stub_length.max(1.0) + config.effective_node_gap() / 2.0;
    let top = Point {
        x: rect.right(),
        y: rect.y + rect.height / 3.0,
    };
    let bottom = Point {
        x: rect.right(),
        y: rect.y + rect.height * 2.0 / 3.0,
    };
    let points = vec![
        top,
        Point {
            x: rect.right() + reach,
            y: top.y,
        },
        Point {
            x: rect.right() + reach,
            y: bottom.y,
        },
        bottom,
    ];

    let source_port = right_side_port(node, node_name, top, port_seq, config);
    let target_port = right_side_port(node, node_name, bottom, port_seq, config);

    RoutedPath {
        edge_id,
        points,
        source_port,
        target_port,
    }
}

/// A port pinned to the right side, used by [`self_loop_route`] where the nearest-side rule would
/// be ambiguous for the second endpoint.
fn right_side_port(
    node: u32,
    node_name: &str,
    point: Point,
    port_seq: &mut HashMap<(u32, Side), usize>,
    config: &CustomLayoutConfig,
) -> PortRef {
    let slot = port_seq.entry((node, Side::Right)).or_insert(0);
    let index = *slot;
    *slot += 1;
    PortRef {
        node_id: node_name.to_string(),
        side: Side::Right,
        index,
        point,
        stub: Point {
            x: point.x + config.port_stub_length,
            y: point.y,
        },
    }
}

#[derive(Clone, Copy)]
struct RouteSeg {
    route_index: usize,
    a: Point,
    b: Point,
}

/// Places every badge and reports how many needed a leader line.
///
/// `routes` must be the vector [`build_routes`] returned for the same `ir`.
///
/// The algorithm is deliberately local and greedy, because in this family of engines there is no
/// layered structure to reserve badge area in (that trick only exists in the layered pipeline).
/// Badges are placed in **descending area order**, ties by edge index, so the boxes that are
/// hardest to fit choose first; each tries [`BADGE_CANDIDATES`] offsets around its edge's midpoint
/// and takes the first that clears every node box and every already-placed badge, both found
/// through a uniform spatial hash rather than an all-pairs scan.
///
/// When no candidate is clear the *least conflicted* one is used and a leader line is drawn from
/// the edge to the badge. A rising leader count is a quality signal, not a routine outcome.
pub fn place_badges(
    ir: &GraphIr,
    source_edges: &[NormalizedEdge],
    rects: &[Rect],
    routes: &[RoutedPath],
    config: &CustomLayoutConfig,
) -> (Vec<BadgePlacement>, usize) {
    // Lookup only; never iterated, so it cannot influence ordering.
    let mut by_id: HashMap<&str, &NormalizedEdge> = HashMap::with_capacity(source_edges.len());
    for e in source_edges {
        by_id.entry(e.id.as_str()).or_insert(e);
    }

    let mut candidates: Vec<(usize, f64)> = Vec::new();
    for (e, edge) in ir.edges.iter().enumerate() {
        if let Some(label) = edge.label {
            if label.width > 0.0 && label.height > 0.0 && e < routes.len() {
                candidates.push((e, label.width * label.height));
            }
        }
    }
    // Descending area, ties by ascending edge index: a total order with no float-equality hazard.
    candidates.sort_by(|a, b| {
        b.1.partial_cmp(&a.1)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.0.cmp(&b.0))
    });

    let node_index = {
        let mut h = SpatialHash::new(mean_cell(rects.iter().map(|r| (r.width, r.height))));
        for (i, r) in rects.iter().enumerate() {
            h.insert(i as u32, r);
        }
        h
    };
    let mut badge_index = SpatialHash::new(mean_cell(
        candidates
            .iter()
            .filter_map(|(e, _)| ir.edges[*e].label)
            .map(|l| (l.width, l.height)),
    ));

    let mut segs: Vec<RouteSeg> = Vec::new();
    for (r, route) in routes.iter().enumerate() {
        for w in route.points.windows(2) {
            if w[0].x.is_finite() && w[0].y.is_finite() && w[1].x.is_finite() && w[1].y.is_finite()
            {
                segs.push(RouteSeg {
                    route_index: r,
                    a: w[0],
                    b: w[1],
                });
            }
        }
    }

    let seg_bbox =
        |s: &RouteSeg| segment_bbox(&Segment { a: s.a, b: s.b }, config.epsilon.max(1.0));

    let seg_index = {
        let mut h = SpatialHash::new(mean_cell(segs.iter().map(|s| {
            let r = seg_bbox(s);
            (r.width, r.height)
        })));
        for (i, s) in segs.iter().enumerate() {
            h.insert(i as u32, &seg_bbox(s));
        }
        h
    };

    let mut placed: Vec<Rect> = Vec::with_capacity(candidates.len());
    let mut out: Vec<BadgePlacement> = Vec::with_capacity(candidates.len());
    let mut leaders = 0usize;

    for (e, _) in candidates {
        let Some(label) = ir.edges[e].label else {
            continue;
        };
        let route = &routes[e];
        if route.points.len() < 2 {
            continue;
        }

        let offsets = badge_offsets(&route.points, label.width, label.height, config);
        let mut best: Option<Rect> = None;
        let mut fallback: Option<(f64, Rect)> = None;

        for centre in offsets {
            let rect = Rect {
                x: centre.x - label.width / 2.0,
                y: centre.y - label.height / 2.0,
                width: label.width,
                height: label.height,
            };
            let conflict = conflict_area(
                &rect,
                e,
                rects,
                &node_index,
                &placed,
                &badge_index,
                &segs,
                &seg_index,
                config,
            );
            if conflict <= config.epsilon {
                best = Some(rect);
                break;
            }
            let better = match fallback {
                Some((best_conflict, _)) => conflict < best_conflict,
                None => true,
            };
            if better {
                fallback = Some((conflict, rect));
            }
        }

        let (rect, needs_leader) = match best {
            Some(r) => (r, false),
            None => match fallback {
                Some((_, r)) => (r, true),
                None => continue,
            },
        };

        let centre = rect.center();
        let (anchor, _) = nearest_point_on_polyline(&route.points, &centre);
        let display = by_id
            .get(route.edge_id.as_str())
            .and_then(|src| {
                get_badge_display_text(src.label.as_deref(), src.is_cycle.unwrap_or(false))
            })
            .unwrap_or_default();

        if needs_leader {
            leaders += 1;
        }

        badge_index.insert(out.len() as u32, &rect);
        placed.push(rect);
        out.push(BadgePlacement {
            edge_id: route.edge_id.clone(),
            label: display,
            rect,
            anchor_point: anchor,
            leader_points: if needs_leader {
                Some(vec![anchor, centre])
            } else {
                None
            },
        });
    }

    (out, leaders)
}

/// The candidate badge centres, in preference order.
///
/// The first entry honours `config.label_placement`; the rest walk the badge along and across the
/// edge, through detour corridors and outward radial rays so a crowded neighbourhood still has
/// ample zero-conflict space to go.
fn badge_offsets(
    points: &[Point],
    _label_width: f64,
    label_height: f64,
    config: &CustomLayoutConfig,
) -> Vec<Point> {
    if points.is_empty() {
        return Vec::new();
    }
    if points.len() == 1 {
        return vec![points[0]];
    }

    let off = (label_height / 2.0 + config.badge_clearance.max(2.0)).max(10.0);

    // 1. Total path length and segment lengths
    let mut seg_lengths = Vec::with_capacity(points.len().saturating_sub(1));
    let mut total_len = 0.0;
    for w in points.windows(2) {
        let len = (w[1].x - w[0].x).hypot(w[1].y - w[0].y);
        seg_lengths.push(len);
        total_len += len;
    }

    // 2. Chord direction
    let first = points[0];
    let last = points[points.len() - 1];
    let (dx, dy) = (last.x - first.x, last.y - first.y);
    let chord_len = (dx * dx + dy * dy).sqrt();
    let (chord_nx, chord_ny) = if chord_len.is_finite() && chord_len > config.epsilon {
        (-dy / chord_len, dx / chord_len)
    } else {
        (0.0, -1.0)
    };

    // Helper to sample point and local segment normal along path
    let sample_path = |ratio: f64| -> (Point, Point) {
        if total_len <= config.epsilon {
            return (
                points[0],
                Point {
                    x: chord_nx,
                    y: chord_ny,
                },
            );
        }
        let target_d = ratio.clamp(0.0, 1.0) * total_len;
        let mut accum = 0.0;
        for (i, &seg_d) in seg_lengths.iter().enumerate() {
            if accum + seg_d >= target_d || i == seg_lengths.len() - 1 {
                let seg_t = if seg_d > config.epsilon {
                    ((target_d - accum) / seg_d).clamp(0.0, 1.0)
                } else {
                    0.0
                };
                let pt = Point {
                    x: points[i].x + seg_t * (points[i + 1].x - points[i].x),
                    y: points[i].y + seg_t * (points[i + 1].y - points[i].y),
                };
                let norm = if seg_d > config.epsilon {
                    Point {
                        x: -(points[i + 1].y - points[i].y) / seg_d,
                        y: (points[i + 1].x - points[i].x) / seg_d,
                    }
                } else {
                    Point {
                        x: chord_nx,
                        y: chord_ny,
                    }
                };
                return (pt, norm);
            }
            accum += seg_d;
        }
        (
            *points.last().unwrap(),
            Point {
                x: chord_nx,
                y: chord_ny,
            },
        )
    };

    let mut candidates: Vec<Point> = Vec::with_capacity(384);
    let mut seen: std::collections::HashSet<(i32, i32)> =
        std::collections::HashSet::with_capacity(512);
    let mut push_cand = |pt: Point| {
        if pt.x.is_finite() && pt.y.is_finite() {
            let key = (pt.x.round() as i32, pt.y.round() as i32);
            if seen.insert(key) {
                candidates.push(pt);
            }
        }
    };

    // Primary candidate based on label_placement
    let (mid_pt, mid_norm) = sample_path(0.5);
    match config.label_placement {
        LabelPlacement::OnEdge => push_cand(mid_pt),
        LabelPlacement::BesideEdge => push_cand(Point {
            x: mid_pt.x + mid_norm.x * off,
            y: mid_pt.y + mid_norm.y * off,
        }),
        LabelPlacement::AboveEdge => push_cand(Point {
            x: mid_pt.x,
            y: mid_pt.y - off,
        }),
    }

    // Parametric points along polyline path and normal offsets
    let t_values = [
        0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85, 0.1, 0.9, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8, 0.05, 0.95,
    ];
    let normal_multipliers = [
        0.0, 1.0, -1.0, 1.5, -1.5, 2.0, -2.0, 2.5, -2.5, 3.0, -3.0, 3.5, -3.5, 4.0, -4.0, 5.0,
        -5.0, 6.0, -6.0, 7.0, -7.0, 8.0, -8.0, 9.0, -9.0, 10.0, -10.0, 11.0, -11.0, 12.0, -12.0,
        13.0, -13.0, 14.0, -14.0, 15.0, -15.0,
    ];

    for &t in &t_values {
        let (base, local_norm) = sample_path(t);
        for &n in &normal_multipliers {
            push_cand(Point {
                x: base.x + local_norm.x * off * n,
                y: base.y + local_norm.y * off * n,
            });
            if (chord_nx - local_norm.x).abs() > 1e-4 || (chord_ny - local_norm.y).abs() > 1e-4 {
                push_cand(Point {
                    x: base.x + chord_nx * off * n,
                    y: base.y + chord_ny * off * n,
                });
            }
        }
    }

    // For polyline routes with interior waypoints: test detour corridor segments
    if points.len() >= 3 {
        let mut seg_indices: Vec<usize> = (0..points.len() - 1).collect();
        seg_indices.sort_by(|&a, &b| {
            seg_lengths[b]
                .partial_cmp(&seg_lengths[a])
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        for &si in &seg_indices {
            let seg_len = seg_lengths[si];
            if seg_len <= config.epsilon {
                continue;
            }
            let p_a = points[si];
            let p_b = points[si + 1];
            let seg_norm = Point {
                x: -(p_b.y - p_a.y) / seg_len,
                y: (p_b.x - p_a.x) / seg_len,
            };

            for &t_seg in &[0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85, 0.1, 0.9] {
                let p_seg = Point {
                    x: p_a.x + t_seg * (p_b.x - p_a.x),
                    y: p_a.y + t_seg * (p_b.y - p_a.y),
                };
                for &n in &[
                    0.0, 1.0, -1.0, 1.5, -1.5, 2.0, -2.0, 2.5, -2.5, 3.0, -3.0, 4.0, -4.0, 5.0,
                    -5.0, 6.0, -6.0, 8.0, -8.0, 10.0, -10.0, 12.0, -12.0, 15.0, -15.0,
                ] {
                    push_cand(Point {
                        x: p_seg.x + seg_norm.x * off * n,
                        y: p_seg.y + seg_norm.y * off * n,
                    });
                }
            }
        }
    }

    // Outward radial ray expansion where wedge space expands as R increases
    for &t in &[0.5, 0.35, 0.65, 0.25, 0.75, 0.15, 0.85, 0.4, 0.6, 0.2, 0.8] {
        let (base, _) = sample_path(t);
        let r_len = base.x.hypot(base.y);
        if r_len > 1.0 {
            let rx = base.x / r_len;
            let ry = base.y / r_len;
            let tx = -ry;
            let ty = rx;

            for &r_step in &[
                15.0, 30.0, 45.0, 60.0, 80.0, 100.0, 130.0, 160.0, 200.0, 240.0, 280.0, 320.0,
                -15.0, -30.0, -45.0, -60.0, -80.0, -100.0, -130.0, -160.0, -200.0, -240.0, -280.0,
            ] {
                for &tangent_step in &[0.0, 15.0, -15.0, 30.0, -30.0, 50.0, -50.0, 80.0, -80.0] {
                    push_cand(Point {
                        x: base.x + rx * r_step + tx * tangent_step,
                        y: base.y + ry * r_step + ty * tangent_step,
                    });
                }
            }
        }
    }

    candidates
}

/// Total overlap area between `rect` and node boxes, already-placed badges,
/// and crossing/adjacent edge routes.
///
/// Ensures that a candidate position with 0 node overlap, 0 badge overlap, and 0 edge penetration
/// returns exactly `0.0`, so it is immediately selected without triggering a leader line.
fn conflict_area(
    rect: &Rect,
    current_edge_index: usize,
    node_rects: &[Rect],
    node_index: &SpatialHash,
    placed: &[Rect],
    badge_index: &SpatialHash,
    segs: &[RouteSeg],
    seg_index: &SpatialHash,
    config: &CustomLayoutConfig,
) -> f64 {
    if !rect.x.is_finite()
        || !rect.y.is_finite()
        || !rect.width.is_finite()
        || !rect.height.is_finite()
        || rect.width <= 0.0
        || rect.height <= 0.0
    {
        return f64::INFINITY;
    }

    let eps = if config.epsilon.is_finite() && config.epsilon > 0.0 {
        config.epsilon
    } else {
        1e-9
    };

    let mut hard_node_overlap_area = 0.0;
    let mut hard_node_count = 0usize;
    for id in node_index.query(rect) {
        if let Some(other) = node_rects.get(id as usize) {
            let area = overlap_area(rect, other);
            if area > eps * eps {
                hard_node_count += 1;
                hard_node_overlap_area += area;
            }
        }
    }

    let mut hard_badge_overlap_area = 0.0;
    let mut hard_badge_count = 0usize;
    for id in badge_index.query(rect) {
        if let Some(other) = placed.get(id as usize) {
            let area = overlap_area(rect, other);
            if area > eps * eps {
                hard_badge_count += 1;
                hard_badge_overlap_area += area;
            }
        }
    }

    let mut hard_edge_pen_len = 0.0;
    let mut hard_edge_count = 0usize;
    for id in seg_index.query(rect) {
        if let Some(seg) = segs.get(id as usize) {
            if seg.route_index == current_edge_index {
                continue;
            }
            let s = Segment { a: seg.a, b: seg.b };
            if segment_intersects_rect_interior(&s, rect, eps) {
                let len = segment_clipped_length(&s, rect, eps);
                hard_edge_count += 1;
                hard_edge_pen_len += len;
            }
        }
    }

    if hard_node_count == 0 && hard_badge_count == 0 && hard_edge_count == 0 {
        return 0.0;
    }

    let node_penalty = hard_node_count as f64 * 100_000.0 + hard_node_overlap_area * 10.0;
    let badge_penalty = hard_badge_count as f64 * 100_000.0 + hard_badge_overlap_area * 10.0;
    let edge_penalty = hard_edge_count as f64 * 10_000.0
        + hard_edge_pen_len * 50.0
        + (rect.width * rect.height * 0.5);

    node_penalty + badge_penalty + edge_penalty
}

fn overlap_area(a: &Rect, b: &Rect) -> f64 {
    let w = a.right().min(b.right()) - a.x.max(b.x);
    let h = a.bottom().min(b.bottom()) - a.y.max(b.y);
    if w > 0.0 && h > 0.0 {
        w * h
    } else {
        0.0
    }
}

/// Geometric crossings between routed polylines, found through a uniform spatial hash.
///
/// Segments of the *same* route are never tested against each other: a bowed edge bending back on
/// itself is a shape, not a crossing. Output order is by ascending segment index and, within a
/// segment, by ascending candidate id, so it is reproducible.
///
/// `epsilon` widens the index probe so a pair that only just meets is still retrieved; the exact
/// test that follows is strict, so widening the probe can only add candidates, never crossings.
pub fn detect_geometric_crossings(routes: &[RoutedPath], epsilon: f64) -> Vec<EdgeCrossing> {
    struct Seg {
        route: u32,
        a: Point,
        b: Point,
    }

    let mut segs: Vec<Seg> = Vec::new();
    for (r, route) in routes.iter().enumerate() {
        for w in route.points.windows(2) {
            if w[0].x.is_finite() && w[0].y.is_finite() && w[1].x.is_finite() && w[1].y.is_finite()
            {
                segs.push(Seg {
                    route: r as u32,
                    a: w[0],
                    b: w[1],
                });
            }
        }
    }
    if segs.len() < 2 {
        return Vec::new();
    }

    let bbox = |s: &Seg| Rect {
        x: s.a.x.min(s.b.x),
        y: s.a.y.min(s.b.y),
        width: (s.b.x - s.a.x).abs(),
        height: (s.b.y - s.a.y).abs(),
    };

    let mut index = SpatialHash::new(mean_cell(segs.iter().map(|s| {
        let r = bbox(s);
        (r.width, r.height)
    })));
    for (i, s) in segs.iter().enumerate() {
        index.insert(i as u32, &bbox(s));
    }

    let probe_margin = epsilon.max(0.0);
    let mut out: Vec<EdgeCrossing> = Vec::new();
    for i in 0..segs.len() {
        let probe = expand_rect(&bbox(&segs[i]), probe_margin);
        for cand in index.query(&probe) {
            let j = cand as usize;
            if j <= i || j >= segs.len() || segs[j].route == segs[i].route {
                continue;
            }
            let Some(point) = proper_intersection(&segs[i].a, &segs[i].b, &segs[j].a, &segs[j].b)
            else {
                continue;
            };
            let id_a = routes[segs[i].route as usize].edge_id.clone();
            let id_b = routes[segs[j].route as usize].edge_id.clone();
            // The lexicographically larger id owns the bridge, matching the layered engine's rule
            // for equal-priority roles.
            let owner = if id_a < id_b {
                id_b.clone()
            } else {
                id_a.clone()
            };
            out.push(EdgeCrossing {
                edge_id_a: id_a,
                edge_id_b: id_b,
                point,
                bridge_owner_edge_id: Some(owner),
            });
        }
    }
    out
}

/// Strict interior intersection of two segments, or `None`.
///
/// Endpoint touches are excluded, which is why two edges meeting at a shared node do not register
/// as a crossing.
fn proper_intersection(a1: &Point, a2: &Point, b1: &Point, b2: &Point) -> Option<Point> {
    let d1x = a2.x - a1.x;
    let d1y = a2.y - a1.y;
    let d2x = b2.x - b1.x;
    let d2y = b2.y - b1.y;
    let denom = d1x * d2y - d1y * d2x;
    if !denom.is_finite() || denom.abs() < 1e-12 {
        return None;
    }
    let ox = b1.x - a1.x;
    let oy = b1.y - a1.y;
    let t = (ox * d2y - oy * d2x) / denom;
    let u = (ox * d1y - oy * d1x) / denom;
    const PARAM_EPS: f64 = 1e-9;
    if t > PARAM_EPS && t < 1.0 - PARAM_EPS && u > PARAM_EPS && u < 1.0 - PARAM_EPS {
        Some(Point {
            x: a1.x + t * d1x,
            y: a1.y + t * d1y,
        })
    } else {
        None
    }
}

/// Translates the drawing to `graph_padding`, then validates and measures it.
///
/// Shared by the organic, radial and grid engines. `placement[i]` supplies the `(rank, order)` pair
/// reported for node `i`; the engines use it to expose whatever discrete structure they have
/// (ring/angle, row/column) without inventing one.
///
/// Constraints and metrics are evaluated against a config clone whose `edge_style` is
/// [`EdgeStyle::Straight`]. These engines have no flow direction, so orthogonality is meaningless
/// here and the caller's `edge_style` — which is about how the *layered* engine renders — must not
/// turn a correct organic drawing into a hard failure.
///
/// `combinatorial_crossings` is reported as the geometric crossing count: without a layered graph
/// there is no combinatorial count to compare against, and reporting 0 would fake a perfect score.
#[allow(clippy::too_many_arguments)]
pub fn finish_geometric_layout(
    ir: &GraphIr,
    rects: &[Rect],
    placement: &[(usize, usize)],
    mut routes: Vec<RoutedPath>,
    mut badges: Vec<BadgePlacement>,
    leader_count: usize,
    mut stats: OptimizationStats,
    t_start: f64,
    config: &CustomLayoutConfig,
) -> CustomLayoutResult {
    let t_emit = get_now_ms();

    // ---- translate so the drawing's top-left sits at `graph_padding` --------------------------
    let mut min_x = f64::INFINITY;
    let mut min_y = f64::INFINITY;
    let mut note = |x: f64, y: f64| {
        if x.is_finite() && y.is_finite() {
            min_x = min_x.min(x);
            min_y = min_y.min(y);
        }
    };
    for r in rects {
        note(r.x, r.y);
    }
    for r in &routes {
        for p in &r.points {
            note(p.x, p.y);
        }
    }
    for b in &badges {
        note(b.rect.x, b.rect.y);
    }
    let (dx, dy) = if min_x.is_finite() && min_y.is_finite() {
        (config.graph_padding - min_x, config.graph_padding - min_y)
    } else {
        (0.0, 0.0)
    };

    for r in &mut routes {
        for p in &mut r.points {
            p.x += dx;
            p.y += dy;
        }
        for port in [&mut r.source_port, &mut r.target_port] {
            port.point.x += dx;
            port.point.y += dy;
            port.stub.x += dx;
            port.stub.y += dy;
        }
    }
    for b in &mut badges {
        b.rect.x += dx;
        b.rect.y += dy;
        b.anchor_point.x += dx;
        b.anchor_point.y += dy;
        if let Some(pts) = b.leader_points.as_mut() {
            for p in pts {
                p.x += dx;
                p.y += dy;
            }
        }
    }

    let nodes: Vec<PositionedNode> = (0..ir.node_count())
        .map(|i| {
            let r = rects.get(i).copied().unwrap_or(Rect {
                x: 0.0,
                y: 0.0,
                width: 0.0,
                height: 0.0,
            });
            let (rank, order) = placement.get(i).copied().unwrap_or((0, i));
            PositionedNode {
                id: ir.node_names[i].clone(),
                label: ir.node_labels.get(i).cloned().flatten(),
                x: r.x + dx,
                y: r.y + dy,
                width: r.width,
                height: r.height,
                rank,
                order,
            }
        })
        .collect();

    // ---- validate and measure ----------------------------------------------------------------
    let mut geo_cfg = config.clone();
    geo_cfg.edge_style = EdgeStyle::Straight;

    let crossings = detect_geometric_crossings(&routes, geo_cfg.epsilon);

    let mut checks = check_constraints(&nodes, &routes, &badges, &ir.edge_names, &geo_cfg);
    let softened = soften_geometric_diagnostics(&mut checks);
    let mut diagnostics: Vec<LayoutDiagnostic> = ir.diagnostics.clone();
    diagnostics.extend(checks);

    let metrics = compute_metrics(
        &nodes,
        &routes,
        &badges,
        &crossings,
        None,
        crossings.len(),
        leader_count,
        0,
        &geo_cfg,
    );

    let status = classify_status(&diagnostics, &metrics, softened);
    let is_valid = !diagnostics.iter().any(|d| d.severity == "error");

    stats.timings.emit = get_now_ms() - t_emit;
    let total = get_now_ms() - t_start;
    stats.timings.total = total;
    stats.duration_ms = total;

    CustomLayoutResult {
        nodes,
        edges: routes,
        badges,
        crossings: crossings.clone(),
        validation: LayoutValidationResult {
            is_valid,
            metrics,
            crossings,
            diagnostics,
        },
        status,
        optimization_stats: stats,
    }
}

/// Codes [`check_constraints`] raises as errors that are **not** errors for a geometric engine.
///
/// [`check_constraints`] verifies the invariants the *layered* pipeline guarantees by construction,
/// and two of them exist only because that pipeline has machinery these engines deliberately do not:
///
/// - `EDGE_NODE_PENETRATION` is prevented in the layered engine by Phase 6 reserving a routing lane
///   for every segment. Organic, radial and grid draw a straight line between two boxes — the spec
///   for all three says exactly that — so a line grazing a third box is an unavoidable property of
///   straight-line drawing, not a defect in the layout.
/// - `BADGE_*_OVERLAP` is prevented in the layered engine by the label item reserving area inside
///   the layered graph. These engines have no layered graph to reserve in; [`place_badges`] is
///   explicitly a best-effort local pass whose failures are announced with a leader line.
///
/// Reporting these as errors would make the default grid drawing of any wide graph read as a broken
/// layout. They stay in the diagnostic list — the information is real and useful — but as warnings,
/// and they drive the status to `unresolved_soft_conflicts` rather than `invalid_hard_failure`.
const SOFT_FOR_GEOMETRIC_ENGINES: [&str; 4] = [
    "EDGE_NODE_PENETRATION",
    "BADGE_NODE_OVERLAP",
    "BADGE_BADGE_OVERLAP",
    "BADGE_EDGE_PENETRATION",
];

/// Rewrites the severity of every [`SOFT_FOR_GEOMETRIC_ENGINES`] diagnostic to `"warning"`.
/// Returns how many were rewritten, which is what tells [`classify_status`] the difference between
/// "nothing went wrong" and "something went wrong that this engine never promised to prevent".
fn soften_geometric_diagnostics(diagnostics: &mut [LayoutDiagnostic]) -> usize {
    let mut softened = 0usize;
    for d in diagnostics.iter_mut() {
        if d.severity == "error" && SOFT_FOR_GEOMETRIC_ENGINES.contains(&d.code.as_str()) {
            d.severity = "warning".to_string();
            softened += 1;
        }
    }
    softened
}

/// Maps the diagnostic set onto the three wire statuses.
///
/// Anything still carrying severity `"error"` after [`soften_geometric_diagnostics`] is a hard
/// failure: overlapping node boxes, a port off its boundary, a missing route, a NaN. Those are
/// invariants these engines *do* claim, so a violation is an engine bug and must not be reported as
/// a stylistic blemish.
fn classify_status(
    diagnostics: &[LayoutDiagnostic],
    metrics: &LayoutMetrics,
    softened: usize,
) -> String {
    if diagnostics.iter().any(|d| d.severity == "error") {
        return "invalid_hard_failure".to_string();
    }
    if softened > 0 || metrics.unresolved_route_count > 0 || metrics.unresolved_badge_count > 0 {
        return "unresolved_soft_conflicts".to_string();
    }
    "success".to_string()
}

/// Cell size for a [`SpatialHash`] over a population of boxes: the mean of the larger dimension,
/// floored at 1. Cells sized like their contents keep the expected candidate count per query O(1).
fn mean_cell(dims: impl Iterator<Item = (f64, f64)>) -> f64 {
    let mut sum = 0.0;
    let mut n = 0usize;
    for (w, h) in dims {
        if w.is_finite() && h.is_finite() {
            sum += w.abs().max(h.abs());
            n += 1;
        }
    }
    if n == 0 {
        return 128.0;
    }
    (sum / n as f64).clamp(1.0, 1.0e6)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::DEFAULT_CUSTOM_LAYOUT_CONFIG;
    use crate::geometry::rects_overlap_area;
    use crate::step0_common::ingest::build_graph_ir;
    use crate::types::NormalizedNode;

    fn node(id: &str, w: f64, h: f64) -> NormalizedNode {
        NormalizedNode {
            id: id.to_string(),
            label: Some(id.to_string()),
            width: w,
            height: h,
            rank: None,
            group: None,
        }
    }

    fn edge(id: &str, s: &str, t: &str) -> NormalizedEdge {
        NormalizedEdge {
            id: id.to_string(),
            source: s.to_string(),
            target: t.to_string(),
            label: None,
            is_cycle: None,
            layout_role: None,
            weight: None,
            min_len: None,
            label_width: None,
            label_height: None,
        }
    }

    fn dummy_port(id: &str) -> PortRef {
        PortRef {
            node_id: id.to_string(),
            side: Side::Bottom,
            index: 0,
            point: Point { x: 0.0, y: 0.0 },
            stub: Point { x: 0.0, y: 0.0 },
        }
    }

    #[test]
    fn overlap_removal_separates_a_stack_of_identical_boxes() {
        let mut rects = vec![
            Rect {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
            },
            Rect {
                x: 5.0,
                y: 5.0,
                width: 100.0,
                height: 50.0,
            },
            Rect {
                x: 10.0,
                y: 2.0,
                width: 100.0,
                height: 50.0,
            },
        ];
        let cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        remove_overlaps(&mut rects, &cfg);
        for i in 0..rects.len() {
            for j in (i + 1)..rects.len() {
                assert!(
                    !rects_overlap_area(&rects[i], &rects[j], cfg.epsilon),
                    "boxes {i} and {j} still overlap"
                );
            }
        }
    }

    #[test]
    fn overlap_removal_guarantees_separation_from_a_fully_degenerate_stack() {
        // Twenty identical boxes at exactly the same point: the relaxation alone cannot untangle
        // this, so the assertion is really about the exact sweep.
        let cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        let mut rects: Vec<Rect> = (0..20)
            .map(|_| Rect {
                x: 0.0,
                y: 0.0,
                width: 120.0,
                height: 60.0,
            })
            .collect();
        remove_overlaps(&mut rects, &cfg);
        for i in 0..rects.len() {
            for j in (i + 1)..rects.len() {
                assert!(
                    !rects_overlap_area(&rects[i], &rects[j], cfg.epsilon),
                    "boxes {i} and {j} still overlap after removal"
                );
            }
        }
    }

    #[test]
    fn exact_sweep_only_ever_moves_boxes_right() {
        let cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        let before = vec![
            Rect {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
            },
            Rect {
                x: 20.0,
                y: 10.0,
                width: 100.0,
                height: 50.0,
            },
            Rect {
                x: 40.0,
                y: 5.0,
                width: 100.0,
                height: 50.0,
            },
        ];
        let mut after = before.clone();
        enforce_separation(&mut after, &cfg);
        for (a, b) in before.iter().zip(after.iter()) {
            assert!(b.x >= a.x - 1e-9, "the sweep must never pull a box left");
            assert_eq!(b.y, a.y, "the sweep must not touch y");
        }
    }

    #[test]
    fn overlap_removal_is_a_no_op_when_passes_is_zero() {
        let mut cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        cfg.overlap_removal_passes = 0;
        let mut rects = vec![
            Rect {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 50.0,
            },
            Rect {
                x: 1.0,
                y: 1.0,
                width: 100.0,
                height: 50.0,
            },
        ];
        let before = rects.clone();
        remove_overlaps(&mut rects, &cfg);
        assert_eq!(rects[0].x, before[0].x);
        assert_eq!(rects[1].y, before[1].y);
    }

    #[test]
    fn nearest_side_resolves_corners_deterministically() {
        let r = Rect {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 100.0,
        };
        assert_eq!(nearest_side(&r, &Point { x: 50.0, y: 0.0 }), Side::Top);
        assert_eq!(nearest_side(&r, &Point { x: 100.0, y: 50.0 }), Side::Right);
        assert_eq!(nearest_side(&r, &Point { x: 50.0, y: 100.0 }), Side::Bottom);
        assert_eq!(nearest_side(&r, &Point { x: 0.0, y: 50.0 }), Side::Left);
        // A corner is equidistant from two sides; `Top` wins by the documented tie order.
        assert_eq!(nearest_side(&r, &Point { x: 0.0, y: 0.0 }), Side::Top);
    }

    #[test]
    fn clip_to_boundary_never_returns_an_interior_point() {
        let r = Rect {
            x: 0.0,
            y: 0.0,
            width: 100.0,
            height: 50.0,
        };
        // Degenerate direction: `toward` is the centre itself.
        let p = clip_to_boundary(&r, &r.center());
        assert!(
            (p.x - r.right()).abs() < 1e-9 || (p.y - r.y).abs() < 1e-9 || (p.x - r.x).abs() < 1e-9,
            "clip must land on a boundary, got {p:?}"
        );
    }

    #[test]
    fn proper_intersection_ignores_shared_endpoints() {
        let a = Point { x: 0.0, y: 0.0 };
        let b = Point { x: 10.0, y: 10.0 };
        let c = Point { x: 10.0, y: 0.0 };
        // Crossing X.
        assert!(proper_intersection(&a, &b, &c, &Point { x: 0.0, y: 10.0 }).is_some());
        // Shared endpoint at `a` — a touch, not a crossing.
        assert!(proper_intersection(&a, &b, &a, &c).is_none());
        // Parallel.
        assert!(proper_intersection(
            &a,
            &Point { x: 10.0, y: 0.0 },
            &Point { x: 0.0, y: 5.0 },
            &Point { x: 10.0, y: 5.0 }
        )
        .is_none());
    }

    #[test]
    fn straight_line_conflicts_are_softened_but_still_reported() {
        let mut diags = vec![
            LayoutDiagnostic::error("EDGE_NODE_PENETRATION", "line grazes a box".into(), vec![]),
            LayoutDiagnostic::error("BADGE_BADGE_OVERLAP", "badges touch".into(), vec![]),
            LayoutDiagnostic::error(
                "BADGE_EDGE_PENETRATION",
                "line crosses badge".into(),
                vec![],
            ),
            LayoutDiagnostic::error("NODE_NODE_OVERLAP", "boxes overlap".into(), vec![]),
        ];
        let softened = soften_geometric_diagnostics(&mut diags);
        assert_eq!(softened, 3);
        assert_eq!(diags[0].severity, "warning");
        assert_eq!(diags[1].severity, "warning");
        assert_eq!(diags[2].severity, "warning");
        // A structural violation these engines *do* guarantee stays an error.
        assert_eq!(diags[3].severity, "error");
        assert_eq!(diags.len(), 4, "softening must not drop information");
    }

    #[test]
    fn status_reflects_the_worst_surviving_diagnostic() {
        let clean = LayoutMetrics::default();
        assert_eq!(classify_status(&[], &clean, 0), "success");
        assert_eq!(classify_status(&[], &clean, 2), "unresolved_soft_conflicts");

        let broken = LayoutMetrics {
            unresolved_route_count: 1,
            ..LayoutMetrics::default()
        };
        assert_eq!(
            classify_status(&[], &broken, 0),
            "unresolved_soft_conflicts"
        );

        let hard = vec![LayoutDiagnostic::error(
            "NODE_NODE_OVERLAP",
            "x".into(),
            vec![],
        )];
        assert_eq!(classify_status(&hard, &clean, 9), "invalid_hard_failure");

        // Ingest warnings (a dropped edge) are informational and must not change the status.
        let warn = vec![LayoutDiagnostic::warning(
            "UNKNOWN_ENDPOINT",
            "x".into(),
            vec![],
        )];
        assert_eq!(classify_status(&warn, &clean, 0), "success");
    }

    #[test]
    fn undirected_adjacency_sees_both_edge_directions() {
        let nodes = vec![node("a", 10.0, 10.0), node("b", 10.0, 10.0)];
        let edges = vec![edge("e", "a", "b")];
        let ir = build_graph_ir(&nodes, &edges, &DEFAULT_CUSTOM_LAYOUT_CONFIG);
        let adj = undirected_adjacency(&ir);
        assert_eq!(adj[0], vec![1]);
        assert_eq!(adj[1], vec![0]);
    }

    #[test]
    fn place_badges_avoids_crossing_edge_stroke() {
        let nodes = vec![
            node("a", 20.0, 20.0),
            node("b", 20.0, 20.0),
            node("c", 20.0, 20.0),
            node("d", 20.0, 20.0),
        ];
        let mut e0 = edge("e0", "a", "b");
        e0.label = Some("lbl".to_string());
        e0.label_width = Some(40.0);
        e0.label_height = Some(20.0);
        let e1 = edge("e1", "c", "d");
        let edges = vec![e0, e1];

        let cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        let ir = build_graph_ir(&nodes, &edges, &cfg);
        let rects = vec![
            Rect {
                x: 40.0,
                y: 0.0,
                width: 20.0,
                height: 20.0,
            },
            Rect {
                x: 40.0,
                y: 180.0,
                width: 20.0,
                height: 20.0,
            },
            Rect {
                x: 0.0,
                y: 90.0,
                width: 20.0,
                height: 20.0,
            },
            Rect {
                x: 180.0,
                y: 90.0,
                width: 20.0,
                height: 20.0,
            },
        ];
        let routes = vec![
            RoutedPath {
                edge_id: "e0".to_string(),
                points: vec![Point { x: 50.0, y: 20.0 }, Point { x: 50.0, y: 180.0 }],
                source_port: dummy_port("a"),
                target_port: dummy_port("b"),
            },
            RoutedPath {
                edge_id: "e1".to_string(),
                points: vec![Point { x: 20.0, y: 100.0 }, Point { x: 180.0, y: 100.0 }],
                source_port: dummy_port("c"),
                target_port: dummy_port("d"),
            },
        ];

        let (badges, leaders) = place_badges(&ir, &edges, &rects, &routes, &cfg);
        assert_eq!(badges.len(), 1);
        assert_eq!(
            leaders, 0,
            "badge should find a clear offset without needing a leader"
        );
        // Verify badge does not collide with e1 (y=100 from x=20 to 180)
        let b = &badges[0];
        let s = Segment {
            a: Point { x: 20.0, y: 100.0 },
            b: Point { x: 180.0, y: 100.0 },
        };
        assert!(
            !segment_intersects_rect_interior(&s, &b.rect, cfg.epsilon),
            "placed badge {:?} must not be penetrated by crossing edge e1",
            b.rect
        );
    }

    #[test]
    fn place_badges_handles_diagonal_routes_and_negative_clearance() {
        let nodes = vec![
            node("a", 20.0, 20.0),
            node("b", 20.0, 20.0),
            node("c", 20.0, 20.0),
            node("d", 20.0, 20.0),
        ];
        let mut e0 = edge("e0", "a", "b");
        e0.label = Some("lbl".to_string());
        e0.label_width = Some(30.0);
        e0.label_height = Some(15.0);
        let e1 = edge("e1", "c", "d");
        let edges = vec![e0, e1];

        let mut cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        cfg.badge_clearance = -5.0; // Negative clearance handled safely
        let ir = build_graph_ir(&nodes, &edges, &cfg);
        let rects = vec![
            Rect {
                x: 0.0,
                y: 0.0,
                width: 20.0,
                height: 20.0,
            },
            Rect {
                x: 200.0,
                y: 200.0,
                width: 20.0,
                height: 20.0,
            },
            Rect {
                x: 0.0,
                y: 200.0,
                width: 20.0,
                height: 20.0,
            },
            Rect {
                x: 200.0,
                y: 0.0,
                width: 20.0,
                height: 20.0,
            },
        ];
        // e0 diagonal (10, 10) -> (210, 210)
        // e1 diagonal crossing (10, 210) -> (210, 10), intersecting at (110, 110)
        // e1 also has a zero-length segment [Point(10, 210), Point(10, 210)]
        let routes = vec![
            RoutedPath {
                edge_id: "e0".to_string(),
                points: vec![Point { x: 10.0, y: 10.0 }, Point { x: 210.0, y: 210.0 }],
                source_port: dummy_port("a"),
                target_port: dummy_port("b"),
            },
            RoutedPath {
                edge_id: "e1".to_string(),
                points: vec![
                    Point { x: 10.0, y: 210.0 },
                    Point { x: 10.0, y: 210.0 }, // zero-length segment
                    Point { x: 210.0, y: 10.0 },
                ],
                source_port: dummy_port("c"),
                target_port: dummy_port("d"),
            },
        ];

        let (badges, leaders) = place_badges(&ir, &edges, &rects, &routes, &cfg);
        assert_eq!(badges.len(), 1);
        assert_eq!(leaders, 0);
        let b = &badges[0];
        let s = Segment {
            a: Point { x: 10.0, y: 210.0 },
            b: Point { x: 210.0, y: 10.0 },
        };
        assert!(
            !segment_intersects_rect_interior(&s, &b.rect, cfg.epsilon),
            "badge {:?} must avoid crossing diagonal edge",
            b.rect
        );
    }

    #[test]
    fn place_badges_dense_mesh_leader_fallback() {
        // Construct a scenario where an edge is completely enveloped by crossing edge routes,
        // so that all 12 candidate badge offsets have non-zero conflict area.
        let nodes = vec![
            node("src", 50.0, 50.0),
            node("dst", 50.0, 50.0),
            node("n1", 50.0, 50.0),
            node("n2", 50.0, 50.0),
            node("n3", 50.0, 50.0),
            node("n4", 50.0, 50.0),
        ];

        let mut e0 = edge("e0", "src", "dst");
        e0.label = Some("BLOCKED".to_string());
        e0.label_width = Some(60.0);
        e0.label_height = Some(30.0);

        let e1 = edge("e1", "n1", "n2");
        let e2 = edge("e2", "n3", "n4");
        let edges = vec![e0, e1, e2];

        let cfg = DEFAULT_CUSTOM_LAYOUT_CONFIG;
        let ir = build_graph_ir(&nodes, &edges, &cfg);
        let rects = vec![
            Rect {
                x: 0.0,
                y: 200.0,
                width: 50.0,
                height: 50.0,
            },
            Rect {
                x: 400.0,
                y: 200.0,
                width: 50.0,
                height: 50.0,
            },
            Rect {
                x: 200.0,
                y: 0.0,
                width: 50.0,
                height: 50.0,
            },
            Rect {
                x: 200.0,
                y: 400.0,
                width: 50.0,
                height: 50.0,
            },
            Rect {
                x: 0.0,
                y: 0.0,
                width: 50.0,
                height: 50.0,
            },
            Rect {
                x: 400.0,
                y: 400.0,
                width: 50.0,
                height: 50.0,
            },
        ];

        // e0 runs horizontally from (50, 225) to (400, 225)
        // Crossing edges create an unavoidable mesh covering the corridor:
        // e1 runs vertically through the middle from (225, 50) to (225, 400)
        // e2 runs horizontally very close to e0 at y=210 and y=240
        let mut e1_pts = Vec::new();
        for x_step in (-50..=100).map(|i| i as f64 * 10.0) {
            e1_pts.push(Point {
                x: x_step,
                y: -1000.0,
            });
            e1_pts.push(Point {
                x: x_step,
                y: 1000.0,
            });
        }
        let routes = vec![
            RoutedPath {
                edge_id: "e0".to_string(),
                points: vec![Point { x: 50.0, y: 225.0 }, Point { x: 400.0, y: 225.0 }],
                source_port: dummy_port("src"),
                target_port: dummy_port("dst"),
            },
            RoutedPath {
                edge_id: "e1".to_string(),
                points: e1_pts,
                source_port: dummy_port("n1"),
                target_port: dummy_port("n2"),
            },
            RoutedPath {
                edge_id: "e2".to_string(),
                points: vec![
                    Point { x: 50.0, y: 205.0 },
                    Point { x: 400.0, y: 205.0 },
                    Point { x: 50.0, y: 245.0 },
                    Point { x: 400.0, y: 245.0 },
                ],
                source_port: dummy_port("n3"),
                target_port: dummy_port("n4"),
            },
        ];

        let (badges, leaders) = place_badges(&ir, &edges, &rects, &routes, &cfg);
        assert_eq!(badges.len(), 1);
        assert_eq!(leaders, 1, "dense mesh should trigger leader-line fallback");

        let b = &badges[0];
        assert!(
            b.leader_points.is_some(),
            "displaced badge must have leader_points"
        );
        let leader = b.leader_points.as_ref().unwrap();
        assert_eq!(leader.len(), 2);
        assert_eq!(leader[0], b.anchor_point);
        assert_eq!(leader[1], b.rect.center());
    }

    #[test]
    fn polar_cartesian_round_trip() {
        let ax = 1.5;
        let ay = 1.0 / 1.5;
        let r = 120.0;
        let theta = 1.234;
        let pt = polar_to_cartesian(r, theta, ax, ay);
        let (r2, theta2) = cartesian_to_polar(&pt, ax, ay);
        assert!((r - r2).abs() < 1e-6, "radius round-trip: {r} vs {r2}");
        assert!(
            (theta - theta2).abs() < 1e-6,
            "theta round-trip: {theta} vs {theta2}"
        );
    }

    #[test]
    fn polar_bounding_sector_covers_corners() {
        let rect = Rect {
            x: 100.0,
            y: 50.0,
            width: 80.0,
            height: 40.0,
        };
        let (r_min, r_max, theta_min, theta_max) = polar_bounding_sector(&rect, 1.0, 1.0, 5.0);
        assert!(r_min > 0.0);
        assert!(r_max > r_min);
        assert!(theta_max > theta_min);
    }

    #[test]
    fn pcdra_corridor_radius_spacing() {
        let radii = vec![0.0, 100.0, 200.0, 300.0];
        let r_corr0 = get_corridor_radius(&radii, 0, 50.0);
        let r_corr1 = get_corridor_radius(&radii, 1, 50.0);
        let r_corr2 = get_corridor_radius(&radii, 2, 50.0);
        let r_corr3 = get_corridor_radius(&radii, 3, 50.0);

        assert_eq!(r_corr0, 50.0);
        assert_eq!(r_corr1, 150.0);
        assert_eq!(r_corr2, 250.0);
        assert!(r_corr3 > 300.0);
    }

    #[test]
    fn check_polyline_node_collision_detection() {
        let rects = vec![
            Rect {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
            },
            Rect {
                x: 200.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
            }, // obstacle at x in [200, 300]
            Rect {
                x: 400.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
            },
        ];
        let mut index = SpatialHash::new(100.0);
        for (i, r) in rects.iter().enumerate() {
            index.insert(i as u32, r);
        }

        // Segment going right through the middle of obstacle at x=250, y=50
        let colliding = vec![Point { x: 100.0, y: 50.0 }, Point { x: 400.0, y: 50.0 }];
        assert!(check_polyline_node_collision(
            &colliding, &index, &rects, 1e-6
        ));

        // Detour going over the top of the obstacle at y=-50
        let clear = vec![
            Point { x: 100.0, y: 50.0 },
            Point { x: 100.0, y: -50.0 },
            Point { x: 400.0, y: -50.0 },
            Point { x: 400.0, y: 50.0 },
        ];
        assert!(!check_polyline_node_collision(&clear, &index, &rects, 1e-6));
    }
}
