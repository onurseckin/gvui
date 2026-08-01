#[path = "1_1_graph_normalization.rs"]
pub mod graph_normalization;

#[path = "1_2_tarjan_scc.rs"]
pub mod tarjan_scc;

#[path = "1_3_eades_fas.rs"]
pub mod eades_fas;

#[path = "1_4_auto_cross_inference.rs"]
pub mod auto_cross_inference;

#[path = "1_5_kahn_dag_verifier.rs"]
pub mod kahn_dag_verifier;

#[path = "1_6_cycle_breaking_facade.rs"]
pub mod cycle_breaking_facade;

#[cfg(test)]
#[path = "tests/spec_cycle_breaking.rs"]
mod spec_cycle_breaking;

#[cfg(test)]
#[path = "tests/spec_tarjan_scc.rs"]
mod spec_tarjan_scc;

pub use cycle_breaking_facade::*;
