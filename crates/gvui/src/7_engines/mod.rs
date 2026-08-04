//! # Step 7: Layout engines
//!
//! One entry point per [`crate::config::EngineMode`]. Every engine honours the same
//! [`crate::config::CustomLayoutConfig`] and returns the same
//! [`crate::types::CustomLayoutResult`].

#[path = "7_1_layered.rs"]
pub mod layered;

#[path = "7_2_organic.rs"]
pub mod organic;

#[path = "7_3_radial.rs"]
pub mod radial;

#[path = "7_4_grid.rs"]
pub mod grid;

#[path = "7_5_facade.rs"]
pub mod facade;

pub use facade::compute_layout;
