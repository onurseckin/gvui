#[path = "0_1_types.rs"]
pub mod types;

#[path = "0_2_config.rs"]
pub mod config;

#[path = "0_3_geometry.rs"]
pub mod geometry;

#[path = "0_4_badge_measurement.rs"]
pub mod badge_measurement;

#[cfg(test)]
#[path = "tests/spec_common_types.rs"]
mod spec_common_types;

#[cfg(test)]
#[path = "tests/spec_config.rs"]
mod spec_config;
