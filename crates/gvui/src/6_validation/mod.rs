//! # Step 6 (Phase 9): Constraints, metrics and emit
//!
//! Constraints are asserted, not scored. Metrics are reported, not optimized.

#[path = "6_1_constraints.rs"]
pub mod constraints;

#[path = "6_2_metrics.rs"]
pub mod metrics;

#[path = "6_3_emit.rs"]
pub mod emit;

pub use constraints::check_constraints;
pub use metrics::compute_metrics;
