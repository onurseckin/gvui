//! Step 5: Edge Routing Subsystem.
//!
//! This module contains discretized routing grid construction, route occupancy ledgers,
//! bounded A* pathfinding, special routes, port assignment, badge placement, label lane planning,
//! SVG path generation, and the high-level edge router facade.

#[path = "5_1_routing_grid.rs"]
pub mod routing_grid;

#[path = "5_2_route_occupancy.rs"]
pub mod route_occupancy;

#[path = "5_3_bounded_astar.rs"]
pub mod bounded_astar;

#[path = "5_4_special_routes.rs"]
pub mod special_routes;

#[path = "5_5_port_candidates.rs"]
pub mod port_candidates;

#[path = "5_6_port_assignment.rs"]
pub mod port_assignment;

#[path = "5_7_badge_placement.rs"]
pub mod badge_placement;

#[path = "5_8_label_lane_planner.rs"]
pub mod label_lane_planner;

#[path = "5_9_svg_path_generator.rs"]
pub mod svg_path_generator;

#[path = "5_10_edge_router_facade.rs"]
pub mod edge_router_facade;

pub use routing_grid::*;
pub use route_occupancy::*;
pub use bounded_astar::*;
pub use special_routes::*;
pub use port_candidates::*;
pub use port_assignment::*;
pub use badge_placement::*;
pub use label_lane_planner::*;
pub use svg_path_generator::*;
pub use edge_router_facade::*;

#[cfg(test)]
pub mod tests;
