//! # Step 1 (Phase 2): Structure
//!
//! Strongly connected components, feedback arc set, and edge role classification.
//! Feedback edges are **reversed, not removed** — they take part in every later phase.

#[path = "1_2_tarjan_scc.rs"]
pub mod tarjan_scc;

#[path = "1_3_eades_fas.rs"]
pub mod eades_fas;

#[path = "1_5_kahn_dag_verifier.rs"]
pub mod kahn_dag_verifier;

#[path = "1_6_structure.rs"]
pub mod structure;

pub use structure::analyze_structure;
