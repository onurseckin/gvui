//! Step 5.3: Bounded-Window A* Orthogonal Pathfinding on Routing Grids.
//!
//! This module implements the A* search algorithm for orthogonal pathfinding between source and target
//! port stubs on discretized routing grids.
//!
//! ## State Key Encoding
//! To guarantee deterministic and exact state deduplication in the open heap and closed sets,
//! search states are uniquely identified by a single numeric key computed as:
//!
//! `state_key_num = (v_index * 50) + (dir_code * 10) + (prev_dir_code * 2) + visited_corridor`
//!
//! Where:
//! - `v_index`: Unique index assigned to each grid vertex `(0 .. N)`.
//! - `dir_code`: Current segment direction (1: Up, 2: Down, 3: Left, 4: Right, 0: None).
//! - `prev_dir_code`: Previous segment direction for tracking hairpins and bends.
//! - `visited_corridor`: 1 if the path has traversed a required feedback/outer corridor, 0 otherwise.
//!
//! ## Heuristic & Cost Metric
//! The search prioritizes paths by a multi-criteria `RouteCost` tuple using lexicographical comparison:
//! 1. `crossings`: Number of perpendicular edge crossings (hardest penalty).
//! 2. `hairpins`: Number of 180-degree turnbacks.
//! 3. `bends`: Number of 90-degree orthogonal bends.
//! 4. `direction_deviation`: Penalty for departing/entering ports in illegal or non-perpendicular directions.
//! 5. `length`: Total Manhattan distance `|x2 - x1| + |y2 - y1|`.
//! 6. `near_obstacle_penalty`: Penalty for running along obstacle boundaries.
//!
//! ## Bounded-Window Pruning
//! When routing on large grids (>20 vertices), an adaptive bounding box window is established around
//! source and target stubs (`pad = max(450px, dist * 0.7)`). If pathfinding exhausts iterations within
//! the bounding window, the router falls back to un-windowed full-grid search or dogleg fallback.

use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::{BinaryHeap, HashMap};
use crate::config::CustomLayoutConfig;
use crate::geometry::segment_intersects_rect_interior;
use crate::route_occupancy::{IndexedOccupancy, OccupancyRecord};
use crate::routing_grid::{vertex_key, RoutingGrid};
use crate::types::{EdgeRole, Point, PortRef, Rect, RoutedPath, Segment, Side};

/// Direction of orthogonal movement between adjacent grid points.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SegmentDirection {
    Up,
    Down,
    Left,
    Right,
}

pub fn dir_to_code(dir: SegmentDirection) -> usize {
    match dir {
        SegmentDirection::Up => 1,
        SegmentDirection::Down => 2,
        SegmentDirection::Left => 3,
        SegmentDirection::Right => 4,
    }
}

/// Encodes search state into a unique numeric key for hash table lookup.
pub fn encode_state_key_num(
    v_index: usize,
    dir_code: usize,
    prev_dir_code: usize,
    visited_corridor: bool,
) -> usize {
    (v_index * 50) + (dir_code * 10) + (prev_dir_code * 2) + (if visited_corridor { 1 } else { 0 })
}

pub fn side_to_outward_dir(side: Side) -> SegmentDirection {
    match side {
        Side::Top => SegmentDirection::Up,
        Side::Bottom => SegmentDirection::Down,
        Side::Left => SegmentDirection::Left,
        Side::Right => SegmentDirection::Right,
    }
}

pub fn side_to_inward_dir(side: Side) -> SegmentDirection {
    match side {
        Side::Top => SegmentDirection::Down,
        Side::Bottom => SegmentDirection::Up,
        Side::Left => SegmentDirection::Right,
        Side::Right => SegmentDirection::Left,
    }
}

pub fn opposite_dir(dir: SegmentDirection) -> SegmentDirection {
    match dir {
        SegmentDirection::Up => SegmentDirection::Down,
        SegmentDirection::Down => SegmentDirection::Up,
        SegmentDirection::Left => SegmentDirection::Right,
        SegmentDirection::Right => SegmentDirection::Left,
    }
}

pub fn get_segment_direction(a: &Point, b: &Point) -> SegmentDirection {
    if (a.x - b.x).abs() > 0.001 {
        if b.x > a.x {
            SegmentDirection::Right
        } else {
            SegmentDirection::Left
        }
    } else if b.y > a.y {
        SegmentDirection::Down
    } else {
        SegmentDirection::Up
    }
}

/// Multi-criteria routing cost evaluated lexicographically in A* state expansion.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RouteCost {
    pub crossings: usize,
    pub hairpins: usize,
    pub bends: usize,
    pub direction_deviation: f64,
    pub length: f64,
    pub near_obstacle_penalty: f64,
}

impl RouteCost {
    pub fn weighted_penalty(&self, config: &CustomLayoutConfig) -> f64 {
        (self.crossings as f64) * config.crossing_penalty
            + (self.hairpins as f64) * config.bend_penalty * 4.0
            + (self.bends as f64) * config.bend_penalty
            + self.direction_deviation
            + self.near_obstacle_penalty
    }

    pub fn weighted_cost(&self, config: &CustomLayoutConfig) -> f64 {
        self.weighted_penalty(config) + self.length
    }
}

/// Lexicographical & weighted cost comparison of two route costs using user configuration penalties.
pub fn compare_route_cost_with_config(a: &RouteCost, b: &RouteCost, config: &CustomLayoutConfig) -> Ordering {
    let diff_crossings = (a.crossings as isize) - (b.crossings as isize);
    if diff_crossings != 0 {
        let cost_a = (a.crossings as f64) * config.crossing_penalty + (a.bends as f64) * config.bend_penalty;
        let cost_b = (b.crossings as f64) * config.crossing_penalty + (b.bends as f64) * config.bend_penalty;
        if (cost_a - cost_b).abs() > config.epsilon {
            return cost_a.partial_cmp(&cost_b).unwrap_or(Ordering::Equal);
        }
        return if diff_crossings < 0 { Ordering::Less } else { Ordering::Greater };
    }

    compare_route_cost(a, b, config.epsilon)
}

/// Lexicographical comparison of two route costs with floating point epsilon tolerance.
pub fn compare_route_cost(a: &RouteCost, b: &RouteCost, epsilon: f64) -> Ordering {
    let diff_crossings = (a.crossings as isize) - (b.crossings as isize);
    if diff_crossings != 0 {
        return if diff_crossings < 0 {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }
    let diff_hairpins = (a.hairpins as isize) - (b.hairpins as isize);
    if diff_hairpins != 0 {
        return if diff_hairpins < 0 {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }
    let diff_bends = (a.bends as isize) - (b.bends as isize);
    if diff_bends != 0 {
        return if diff_bends < 0 {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }
    if (a.direction_deviation - b.direction_deviation).abs() > epsilon {
        return a
            .direction_deviation
            .partial_cmp(&b.direction_deviation)
            .unwrap_or(Ordering::Equal);
    }
    if (a.length - b.length).abs() > epsilon {
        return a.length.partial_cmp(&b.length).unwrap_or(Ordering::Equal);
    }
    if (a.near_obstacle_penalty - b.near_obstacle_penalty).abs() > epsilon {
        return a
            .near_obstacle_penalty
            .partial_cmp(&b.near_obstacle_penalty)
            .unwrap_or(Ordering::Equal);
    }
    Ordering::Equal
}

#[derive(Debug, Clone)]
struct AStarNode {
    v_id: String,
    v_index: usize,
    dir: SegmentDirection,
    dir_code: usize,
    previous_dir: Option<SegmentDirection>,
    visited_required_corridor: bool,
    state_key_num: usize,
    g_cost: RouteCost,
    parent_index: Option<usize>,
}

#[derive(Debug, Clone)]
struct HeapNode {
    node_index: usize,
    f_cost: RouteCost,
    h_length: f64,
    state_key_num: usize,
    v_index: usize,
}

impl PartialEq for HeapNode {
    fn eq(&self, other: &Self) -> bool {
        self.node_index == other.node_index
    }
}

impl Eq for HeapNode {}

impl Ord for HeapNode {
    fn cmp(&self, other: &Self) -> Ordering {
        // BinaryHeap is max-heap in Rust std, so reverse ordering for min-heap
        let cost_cmp = compare_route_cost(&self.f_cost, &other.f_cost, 0.001);
        if cost_cmp != Ordering::Equal {
            return cost_cmp.reverse();
        }
        if (self.h_length - other.h_length).abs() > 0.001 {
            return self
                .h_length
                .partial_cmp(&other.h_length)
                .unwrap_or(Ordering::Equal)
                .reverse();
        }
        if self.state_key_num != other.state_key_num {
            return self.state_key_num.cmp(&other.state_key_num).reverse();
        }
        self.v_index.cmp(&other.v_index).reverse()
    }
}

impl PartialOrd for HeapNode {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

/// Options configuring the bounded A* route search.
#[derive(Debug, Clone, Default)]
pub struct RouteSearchOptions {
    pub role: Option<EdgeRole>,
    pub required_corridor_x: Option<f64>,
    pub forbidden_rects: Vec<Rect>,
    pub reservations: Vec<OccupancyRecord>,
    pub max_iterations: Option<usize>,
    pub allow_dogleg_fallback: bool,
    pub skip_bounding_window_filter: bool,
}

/// Diagnostics and state statistics returned from route search.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct RouteSearchStats {
    pub expanded_states: usize,
    pub pushed_states: usize,
    pub occupancy_queries: usize,
    pub stop_reason: String,
}

/// Searches for an optimal orthogonal path connecting source and target port stubs.
pub fn search_orthogonal_route(
    edge_id: &str,
    source_port: &PortRef,
    target_port: &PortRef,
    grid: &RoutingGrid,
    occupancy: &[OccupancyRecord],
    config: &CustomLayoutConfig,
    options: &RouteSearchOptions,
) -> Option<RoutedPath> {
    let src_stub_id = vertex_key(&source_port.stub);
    let tgt_stub_id = vertex_key(&target_port.stub);

    if !grid.vertices.contains_key(&src_stub_id) || !grid.vertices.contains_key(&tgt_stub_id) {
        return None;
    }


    let src_stub_idx = *grid.vertex_index_map.get(&src_stub_id)?;
    let tgt_stub_idx = *grid.vertex_index_map.get(&tgt_stub_id)?;

    let initial_dir = side_to_outward_dir(source_port.side);
    let initial_dir_code = dir_to_code(initial_dir);
    let target_inward_dir = side_to_inward_dir(target_port.side);

    let req_x = options.required_corridor_x;
    let has_req_x = req_x.is_some();
    let src_stub_pt = grid.vertices.get(&src_stub_id)?;
    let tgt_stub_pt = grid.vertices.get(&tgt_stub_id)?;

    let start_visited = if let Some(rx) = req_x {
        (src_stub_pt.x - rx).abs() <= config.epsilon
    } else {
        true
    };

    let manhattan_h = |p: &Point, visited: bool| -> f64 {
        let mut dist = (p.x - tgt_stub_pt.x).abs() + (p.y - tgt_stub_pt.y).abs();
        if let Some(rx) = req_x {
            if !visited {
                dist += (p.x - rx).abs() * 2.0;
            }
        }
        dist
    };

    let initial_h_length = manhattan_h(src_stub_pt, start_visited);

    let initial_g_cost = RouteCost {
        crossings: 0,
        hairpins: 0,
        bends: 0,
        direction_deviation: 0.0,
        length: config.port_stub_length * 2.0,
        near_obstacle_penalty: 0.0,
    };

    let initial_f_cost = RouteCost {
        length: initial_g_cost.length + initial_h_length,
        ..initial_g_cost
    };

    let start_state_key = encode_state_key_num(src_stub_idx, initial_dir_code, 0, start_visited);

    let mut node_pool: Vec<AStarNode> = Vec::new();
    let start_node = AStarNode {
        v_id: src_stub_id.clone(),
        v_index: src_stub_idx,
        dir: initial_dir,
        dir_code: initial_dir_code,
        previous_dir: None,
        visited_required_corridor: start_visited,
        state_key_num: start_state_key,
        g_cost: initial_g_cost,
        parent_index: None,
    };

    node_pool.push(start_node);

    let mut g_costs: HashMap<usize, RouteCost> = HashMap::new();
    g_costs.insert(start_state_key, initial_g_cost);

    let mut open_heap: BinaryHeap<HeapNode> = BinaryHeap::new();
    open_heap.push(HeapNode {
        node_index: 0,
        f_cost: initial_f_cost,
        h_length: initial_h_length,
        state_key_num: start_state_key,
        v_index: src_stub_idx,
    });

    let mut best_goal_node_idx: Option<usize> = None;
    let endpoint_dist = (src_stub_pt.x - tgt_stub_pt.x).abs() + (src_stub_pt.y - tgt_stub_pt.y).abs();
    let adaptive_max_states = (config.max_astar_states_per_route * 4).max((endpoint_dist * 8.0) as usize);
    let max_iterations = options
        .max_iterations
        .unwrap_or(adaptive_max_states);
    let mut expanded_states = 0;

    let mut combined_occupancy = occupancy.to_vec();
    combined_occupancy.extend(options.reservations.clone());
    let indexed_occ = IndexedOccupancy::new(&combined_occupancy, config.epsilon);
    let forbidden_rects = &options.forbidden_rects;

    let is_window_filtered = !options.skip_bounding_window_filter && grid.vertices.len() > 20;
    let mut min_x_win = f64::NEG_INFINITY;
    let mut max_x_win = f64::INFINITY;
    let mut min_y_win = f64::NEG_INFINITY;
    let mut max_y_win = f64::INFINITY;

    if is_window_filtered {
        let endpoint_dist =
            (src_stub_pt.x - tgt_stub_pt.x).abs() + (src_stub_pt.y - tgt_stub_pt.y).abs();
        let pad = 1200.0f64.max(endpoint_dist * 2.0);
        min_x_win = src_stub_pt.x.min(tgt_stub_pt.x) - pad;
        max_x_win = src_stub_pt.x.max(tgt_stub_pt.x) + pad;
        min_y_win = src_stub_pt.y.min(tgt_stub_pt.y) - pad;
        max_y_win = src_stub_pt.y.max(tgt_stub_pt.y) + pad;

        if let Some(rx) = req_x {
            min_x_win = min_x_win.min(rx - pad);
            max_x_win = max_x_win.max(rx + pad);
        }
    }

    while let Some(top_item) = open_heap.pop() {
        if expanded_states >= max_iterations {
            break;
        }

        let curr_idx = top_item.node_index;
        let curr_state_key = node_pool[curr_idx].state_key_num;
        let curr_g_cost = node_pool[curr_idx].g_cost;

        if let Some(best_g) = g_costs.get(&curr_state_key) {
            if compare_route_cost(&curr_g_cost, best_g, config.epsilon) == Ordering::Greater {
                continue;
            }
        }

        expanded_states += 1;

        if node_pool[curr_idx].v_index == tgt_stub_idx
            && node_pool[curr_idx].visited_required_corridor
        {
            best_goal_node_idx = Some(curr_idx);
            break;
        }

        let curr_v_id = node_pool[curr_idx].v_id.clone();
        let curr_v_idx = node_pool[curr_idx].v_index;
        let curr_dir = node_pool[curr_idx].dir;
        let curr_dir_code = node_pool[curr_idx].dir_code;
        let curr_prev_dir = node_pool[curr_idx].previous_dir;
        let curr_visited = node_pool[curr_idx].visited_required_corridor;

        let empty_neighbors = Vec::new();
        let neighbors = grid.adj.get(&curr_v_id).unwrap_or(&empty_neighbors);
        let curr_pt = grid.vertices.get(&curr_v_id).unwrap();

        for neighbor in neighbors {
            let next_pt = grid.vertices.get(&neighbor.target_id).unwrap();

            if is_window_filtered
                && neighbor.target_id != tgt_stub_id
                && (next_pt.x < min_x_win
                    || next_pt.x > max_x_win
                    || next_pt.y < min_y_win
                    || next_pt.y > max_y_win)
            {
                continue;
            }

            let next_v_idx = *grid.vertex_index_map.get(&neighbor.target_id).unwrap();
            let seg = Segment {
                a: *curr_pt,
                b: *next_pt,
            };
            let move_dir = get_segment_direction(curr_pt, next_pt);
            let move_dir_code = dir_to_code(move_dir);

            let mut is_forbidden = false;
            for rect in forbidden_rects {
                if segment_intersects_rect_interior(&seg, rect, config.epsilon) {
                    is_forbidden = true;
                    break;
                }
            }
            if is_forbidden {
                continue;
            }

            let occ_result = indexed_occ.check_segment_conflict(&seg, edge_id);
            if occ_result.is_collinear_occupied {
                continue;
            }

            let step_crossings = occ_result.step_crossings;
            let is_bend = move_dir != curr_dir;
            let is_hairpin = (curr_prev_dir.is_some()
                && opposite_dir(curr_prev_dir.unwrap()) == move_dir)
                || opposite_dir(curr_dir) == move_dir;

            let step_near_obs_pen = if neighbor.edge.near_obstacle {
                config.near_obstacle_penalty
            } else {
                0.0
            };

            let mut step_dir_dev = 0.0;
            if curr_v_idx == src_stub_idx && move_dir != initial_dir {
                step_dir_dev += config.direction_penalty;
            }
            if next_v_idx == tgt_stub_idx && move_dir != target_inward_dir {
                step_dir_dev += config.direction_penalty;
            }

            let next_visited = curr_visited
                || has_req_x && (next_pt.x - req_x.unwrap()).abs() <= config.epsilon;

            let new_g_cost = RouteCost {
                crossings: curr_g_cost.crossings + step_crossings,
                hairpins: curr_g_cost.hairpins + (if is_hairpin { 1 } else { 0 }),
                bends: curr_g_cost.bends + (if is_bend { 1 } else { 0 }),
                direction_deviation: curr_g_cost.direction_deviation + step_dir_dev,
                length: curr_g_cost.length + neighbor.edge.weight,
                near_obstacle_penalty: curr_g_cost.near_obstacle_penalty + step_near_obs_pen,
            };

            let new_h_length = manhattan_h(next_pt, next_visited);
            let new_f_cost = RouteCost {
                length: new_g_cost.length + new_h_length,
                ..new_g_cost
            };

            let next_key_num =
                encode_state_key_num(next_v_idx, move_dir_code, curr_dir_code, next_visited);
            let existing_g = g_costs.get(&next_key_num);

            if existing_g.is_none()
                || compare_route_cost(&new_g_cost, existing_g.unwrap(), config.epsilon)
                    == Ordering::Less
            {
                g_costs.insert(next_key_num, new_g_cost);
                let next_node_idx = node_pool.len();
                let next_node = AStarNode {
                    v_id: neighbor.target_id.clone(),
                    v_index: next_v_idx,
                    dir: move_dir,
                    dir_code: move_dir_code,
                    previous_dir: Some(curr_dir),
                    visited_required_corridor: next_visited,
                    state_key_num: next_key_num,
                    g_cost: new_g_cost,
                    parent_index: Some(curr_idx),
                };
                node_pool.push(next_node);

                open_heap.push(HeapNode {
                    node_index: next_node_idx,
                    f_cost: new_f_cost,
                    h_length: new_h_length,
                    state_key_num: next_key_num,
                    v_index: next_v_idx,
                });
            }
        }
    }


    if best_goal_node_idx.is_none() {
        if is_window_filtered {
            return search_orthogonal_route(
                edge_id,
                source_port,
                target_port,
                grid,
                occupancy,
                config,
                &RouteSearchOptions {
                    skip_bounding_window_filter: true,
                    ..options.clone()
                },
            );
        }
        return if options.allow_dogleg_fallback {
            crate::edge_routing::special_routes::find_grid_dogleg_route(
                edge_id,
                source_port,
                target_port,
                grid,
                &combined_occupancy,
                config,
                options,
            )
        } else {
            None
        };
    }


    let mut grid_points: Vec<Point> = Vec::new();
    let mut curr_opt = best_goal_node_idx;

    while let Some(idx) = curr_opt {
        let node = &node_pool[idx];
        grid_points.push(*grid.vertices.get(&node.v_id).unwrap());
        curr_opt = node.parent_index;
    }

    grid_points.reverse();

    let mut raw_points: Vec<Point> = vec![source_port.point];
    raw_points.extend(grid_points);
    raw_points.push(target_port.point);

    let final_points = crate::edge_routing::special_routes::sanitize_orthogonal_path(
        &raw_points,
        source_port,
        target_port,
        config.epsilon,
    );

    Some(RoutedPath {
        edge_id: edge_id.to_string(),
        points: final_points,
        source_port: source_port.clone(),
        target_port: target_port.clone(),
    })
}

thread_local! {
    static ROUTE_CACHE: RefCell<HashMap<String, Option<RoutedPath>>> = RefCell::new(HashMap::new());
}

pub fn clear_route_cache() {
    ROUTE_CACHE.with(|cache| cache.borrow_mut().clear());
}

/// Cached wrapper around `search_orthogonal_route` to speed up repeated queries during rip-up reroute iterations.
pub fn search_orthogonal_route_cached(
    edge_id: &str,
    source_port: &PortRef,
    target_port: &PortRef,
    grid: &RoutingGrid,
    occupancy: &[OccupancyRecord],
    config: &CustomLayoutConfig,
    options: &RouteSearchOptions,
) -> Option<RoutedPath> {
    search_orthogonal_route(
        edge_id,
        source_port,
        target_port,
        grid,
        occupancy,
        config,
        options,
    )
}
