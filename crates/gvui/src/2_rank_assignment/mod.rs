//! # Step 2 (Phase 3): Rank assignment
//!
//! Layer assignment by network simplex (optimal for the weighted edge-length objective), with
//! longest-path and tight-tree alternatives, plus aspect-ratio rank balancing.

#[path = "2_1_longest_path.rs"]
pub mod longest_path;

#[path = "2_2_network_simplex.rs"]
pub mod network_simplex;

#[path = "2_3_rank_balancing.rs"]
pub mod rank_balancing;

#[path = "2_4_rank_facade.rs"]
pub mod rank_facade;

pub use rank_facade::assign_ranks;
