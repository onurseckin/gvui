//! # Step 4 (Phases 6 & 7): Routing demand and coordinates
//!
//! Lane demand is computed from the fixed ordering by interval-graph colouring — exact and
//! optimal — and the resulting separations feed Brandes-Koepf. This is the single point where a
//! downstream requirement reaches an upstream decision, and it is resolved in one pass.

#[path = "4_1_lane_demand.rs"]
pub mod lane_demand;

#[path = "4_2_rank_bands.rs"]
pub mod rank_bands;

#[path = "4_3_brandes_kopf.rs"]
pub mod brandes_kopf;

#[path = "4_4_coordinate_facade.rs"]
pub mod coordinate_facade;

pub use coordinate_facade::assign_coordinates;
pub use lane_demand::compute_routing_demand;
