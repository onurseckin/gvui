//! # Step 3 (Phases 4 & 5): Layering and ordering
//!
//! Builds the layered graph — dummy chains for long edges and **label items** carrying badge
//! boxes — then minimizes crossings with median/barycenter sweeps and a local transpose pass over
//! Barth-Mutzel-Juenger crossing counts.

#[path = "3_1_layer_builder.rs"]
pub mod layer_builder;

#[path = "3_2_crossing_counting.rs"]
pub mod crossing_counting;

#[path = "3_3_ordering.rs"]
pub mod ordering;

#[path = "3_4_order_facade.rs"]
pub mod order_facade;

pub use layer_builder::build_layered;
pub use order_facade::{order_layers, OrderingOutcome};
