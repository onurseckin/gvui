//! Step 3: Crossing Minimization & Parallel Search Module.
//!
//! Refactored and modularized step 3 pipeline for crossing minimization, 2D crossing detection,
//! Rayon parallel neighborhood search optimization, trial state generation, and 21-component objective evaluation.

#[path = "3_1_barycenter_median_ordering.rs"]
pub mod barycenter_median_ordering;

#[path = "3_2_crossing_counting.rs"]
pub mod crossing_counting;

#[path = "3_3_rayon_parallel_search.rs"]
pub mod rayon_parallel_search;

#[path = "3_4_trial_state_generator.rs"]
pub mod trial_state_generator;

#[path = "3_5_objective_evaluator.rs"]
pub mod objective_evaluator;

#[path = "3_6_layout_optimizer_state.rs"]
pub mod layout_optimizer_state;

#[cfg(test)]
pub mod tests;

pub use barycenter_median_ordering::*;
pub use crossing_counting::*;
pub use layout_optimizer_state::*;
pub use objective_evaluator::*;
pub use rayon_parallel_search::*;
pub use trial_state_generator::*;
