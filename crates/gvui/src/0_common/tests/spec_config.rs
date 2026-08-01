use crate::step_0_common::config::*;

#[test]
fn test_default_config_validation() {
    let config = CustomLayoutConfig::default();
    assert!(config.validate().is_ok());
}

#[test]
fn test_invalid_config_validation() {
    let config = CustomLayoutConfig {
        node_gap: -5.0,
        ..Default::default()
    };
    assert!(config.validate().is_err());

    let config2 = CustomLayoutConfig {
        max_global_passes: 0,
        ..Default::default()
    };
    assert!(config2.validate().is_err());
}

#[test]
fn test_partial_config_resolution() {
    let partial = PartialCustomLayoutConfig {
        node_gap: Some(80.0),
        ..Default::default()
    };
    let resolved = resolve_custom_layout_config(Some(&partial)).unwrap();
    assert_eq!(resolved.node_gap, 80.0);
    assert_eq!(resolved.rank_gap, 120.0); // default maintained
}
