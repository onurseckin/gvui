//! # Step 4: Coordinate Assignment & Spacing
//!
//! Submodule handling rank band calculation, PAVA isotonic regression,
//! iterative coordinate sweeps, spacing demand resolution, and bounding translation.

#[path = "4_1_spacing_demand_resolver.rs"]
pub mod spacing_demand_resolver;

#[path = "4_2_pava_isotonic_regression.rs"]
pub mod pava_isotonic_regression;

#[path = "4_3_coordinate_sweep.rs"]
pub mod coordinate_sweep;

#[path = "4_4_bounding_translation.rs"]
pub mod bounding_translation;

#[path = "4_5_coordinate_assignment_facade.rs"]
pub mod coordinate_assignment_facade;

#[cfg(test)]
pub mod tests;

pub use bounding_translation::*;
pub use coordinate_assignment_facade::*;
pub use coordinate_sweep::*;
pub use pava_isotonic_regression::*;
pub use spacing_demand_resolver::*;
