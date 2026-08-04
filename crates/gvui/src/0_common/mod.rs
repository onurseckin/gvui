//! # Step 0: Shared Foundations
//!
//! Types, configuration, geometry helpers, fallback badge measurement, and Phase 0 ingest.

#[path = "0_1_types.rs"]
pub mod types;

#[path = "0_2_config.rs"]
pub mod config;

#[path = "0_3_geometry.rs"]
pub mod geometry;

#[path = "0_4_badge_measurement.rs"]
pub mod badge_measurement;

#[path = "0_5_ingest.rs"]
pub mod ingest;

pub use ingest::build_graph_ir;
