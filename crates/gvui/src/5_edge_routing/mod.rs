//! # Step 5 (Phase 8): Routing and attachment
//!
//! Port sides are determined rather than searched; port order along a side is a sort; polylines
//! are materialized from lane indices. No pathfinding, no grid, no rip-up.

#[path = "5_1_ports.rs"]
pub mod ports;

#[path = "5_2_lane_router.rs"]
pub mod lane_router;

#[path = "5_3_special_routes.rs"]
pub mod special_routes;

#[path = "5_4_badges.rs"]
pub mod badges;

#[path = "5_5_edge_style.rs"]
pub mod edge_style;

#[path = "5_6_route_facade.rs"]
pub mod route_facade;

pub use route_facade::{route_edges, RouteResult};
