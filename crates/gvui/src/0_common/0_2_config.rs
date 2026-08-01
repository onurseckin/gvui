use std::fmt;
use serde::{Deserialize, Serialize};

/// Error indicating invalid layout configuration parameters passed to validation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LayoutConfigurationError {
    pub message: String,
}

impl fmt::Display for LayoutConfigurationError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for LayoutConfigurationError {}

/// Configuration parameters controlling layout gaps, routing penalties, pass limits, and algorithm bounds.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomLayoutConfig {
    /// Minimum horizontal spacing between adjacent nodes in the same rank (must be > 0).
    pub node_gap: f64,
    /// Minimum vertical spacing between adjacent rank layers (must be > 0).
    pub rank_gap: f64,
    /// Minimum spacing between disconnected weakly connected subgraphs (must be > 0).
    pub component_gap: f64,
    /// Outer margin surrounding the total graph bounding box (must be > 0).
    pub graph_padding: f64,
    /// Length of straight port stub segment exiting node boundary before turn (must be > 0).
    pub port_stub_length: f64,
    /// Clearance distance between port endpoint and node corner (must be >= 0).
    pub port_endpoint_padding: f64,
    /// Clearance margin required between routed edge segments and node obstacles (must be > 0).
    pub obstacle_clearance: f64,
    /// Spacing between parallel routing channels/lanes (must be > 0).
    pub lane_spacing: f64,
    /// Initial ring count searched around node bounding box during routing grid creation (must be > 0).
    pub initial_lane_rings: usize,
    /// Maximum ring expansion count for routing grid creation (must be > 0).
    pub max_lane_rings: usize,
    /// Cost penalty assigned to each 90-degree orthogonal bend during A* edge routing (must be >= 0).
    pub bend_penalty: f64,
    /// Cost penalty assigned to each edge-edge crossing during route optimization (must be >= 0).
    pub crossing_penalty: f64,
    /// Cost penalty for routing edge segments against default rank flow direction (must be >= 0).
    pub direction_penalty: f64,
    /// Cost penalty for assigning multiple ports to the same node side (must be >= 0).
    pub side_reuse_penalty: f64,
    /// Cost penalty for routing edge segments adjacent to node obstacle boundaries (must be >= 0).
    pub near_obstacle_penalty: f64,
    /// Clearance gap maintained around edge label badges (must be > 0).
    pub badge_clearance: f64,
    /// Maximum candidate badge positions evaluated per edge (must be > 0).
    pub max_badge_candidates_per_edge: usize,
    /// Maximum backtrack steps allowed during badge placement (must be > 0).
    pub max_badge_backtrack_steps: usize,
    /// Maximum crossing minimization sweep passes (must be > 0).
    pub max_crossing_sweeps: usize,
    /// Maximum port assignment improvement passes (must be > 0).
    pub max_port_improvement_passes: usize,
    /// Maximum rip-up and reroute passes for conflicting edges (must be > 0).
    pub max_rip_up_passes: usize,
    /// Maximum global layout optimization passes (must be > 0).
    pub max_global_passes: usize,
    /// Numerical floating point epsilon tolerance for coordinate comparisons (must be > 0).
    pub epsilon: f64,
    /// Maximum aesthetic fine-tuning improvement passes (must be > 0).
    pub max_aesthetic_passes: usize,
    /// Maximum port states evaluated per pass (must be > 0).
    pub max_port_states_per_pass: usize,
    /// Maximum alternative port choices per edge (must be > 0).
    pub max_port_alternatives_per_edge: usize,
    /// Maximum route ordering permutations evaluated (must be > 0).
    pub max_route_order_variants: usize,
    /// Limit on coordinate assignment alignment sweep iterations (must be > 0).
    pub coordinate_sweep_limit: usize,
    /// Maximum layout states stored in local search history (must be > 0).
    pub max_layout_states: usize,
    /// Maximum size of frontier queue in layout optimization (must be > 0).
    pub max_frontier_size: usize,
    /// Maximum neighbor states generated per search step (must be > 0).
    pub max_neighbors_per_state: usize,
    /// Maximum A* path search state explorations per edge route (must be > 0).
    pub max_astar_states_per_route: usize,
    /// Maximum number of conflicting edges in a single permutation set (must be > 0).
    pub max_conflict_permutation_size: usize,
    /// Maximum conflict permutations generated per pass (must be > 0).
    pub max_conflict_permutations: usize,
    /// Maximum route candidates saved per edge (must be > 0).
    pub max_route_candidates_per_edge: usize,
    /// Maximum badge placement states evaluated (must be > 0).
    pub max_badge_states: usize,
}

/// Default standard layout configuration instance with tuned defaults.
pub const DEFAULT_CUSTOM_LAYOUT_CONFIG: CustomLayoutConfig = CustomLayoutConfig {
    node_gap: 56.0,
    rank_gap: 120.0,
    component_gap: 160.0,
    graph_padding: 80.0,
    port_stub_length: 20.0,
    port_endpoint_padding: 16.0,
    obstacle_clearance: 16.0,
    lane_spacing: 12.0,
    initial_lane_rings: 4,
    max_lane_rings: 8,

    bend_penalty: 40.0,
    crossing_penalty: 500.0,
    direction_penalty: 120.0,
    side_reuse_penalty: 32.0,
    near_obstacle_penalty: 8.0,
    badge_clearance: 10.0,
    max_badge_candidates_per_edge: 48,
    max_badge_backtrack_steps: 1000,
    max_crossing_sweeps: 24,
    max_port_improvement_passes: 12,
    max_rip_up_passes: 12,
    max_global_passes: 8,
    epsilon: 0.001,
    max_aesthetic_passes: 12,
    max_port_states_per_pass: 8,
    max_port_alternatives_per_edge: 4,
    max_route_order_variants: 4,
    coordinate_sweep_limit: 16,
    max_layout_states: 50,
    max_frontier_size: 50,
    max_neighbors_per_state: 16,
    max_astar_states_per_route: 8000,
    max_conflict_permutation_size: 6,

    max_conflict_permutations: 32,
    max_route_candidates_per_edge: 4,
    max_badge_states: 200,
};

impl Default for CustomLayoutConfig {
    fn default() -> Self {
        DEFAULT_CUSTOM_LAYOUT_CONFIG
    }
}

/// Partial option struct for user configuration overrides.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialCustomLayoutConfig {
    pub node_gap: Option<f64>,
    pub rank_gap: Option<f64>,
    pub component_gap: Option<f64>,
    pub graph_padding: Option<f64>,
    pub port_stub_length: Option<f64>,
    pub port_endpoint_padding: Option<f64>,
    pub obstacle_clearance: Option<f64>,
    pub lane_spacing: Option<f64>,
    pub initial_lane_rings: Option<usize>,
    pub max_lane_rings: Option<usize>,
    pub bend_penalty: Option<f64>,
    pub crossing_penalty: Option<f64>,
    pub direction_penalty: Option<f64>,
    pub side_reuse_penalty: Option<f64>,
    pub near_obstacle_penalty: Option<f64>,
    pub badge_clearance: Option<f64>,
    pub max_badge_candidates_per_edge: Option<usize>,
    pub max_badge_backtrack_steps: Option<usize>,
    pub max_crossing_sweeps: Option<usize>,
    pub max_port_improvement_passes: Option<usize>,
    pub max_rip_up_passes: Option<usize>,
    pub max_global_passes: Option<usize>,
    pub epsilon: Option<f64>,
    pub max_aesthetic_passes: Option<usize>,
    pub max_port_states_per_pass: Option<usize>,
    pub max_port_alternatives_per_edge: Option<usize>,
    pub max_route_order_variants: Option<usize>,
    pub coordinate_sweep_limit: Option<usize>,
    pub max_layout_states: Option<usize>,
    pub max_frontier_size: Option<usize>,
    pub max_neighbors_per_state: Option<usize>,
    pub max_astar_states_per_route: Option<usize>,
    pub max_conflict_permutation_size: Option<usize>,
    pub max_conflict_permutations: Option<usize>,
    pub max_route_candidates_per_edge: Option<usize>,
    pub max_badge_states: Option<usize>,
}

impl CustomLayoutConfig {
    /// Validates all configuration parameters against required numerical bounds.
    /// Positive fields must be > 0 and finite. Non-negative fields must be >= 0 and finite.
    pub fn validate(&self) -> Result<(), LayoutConfigurationError> {
        let positive_f64_fields: &[(&str, f64)] = &[
            ("nodeGap", self.node_gap),
            ("rankGap", self.rank_gap),
            ("componentGap", self.component_gap),
            ("graphPadding", self.graph_padding),
            ("portStubLength", self.port_stub_length),
            ("obstacleClearance", self.obstacle_clearance),
            ("laneSpacing", self.lane_spacing),
            ("badgeClearance", self.badge_clearance),
            ("epsilon", self.epsilon),
        ];

        for &(name, val) in positive_f64_fields {
            if val <= 0.0 || val.is_nan() {
                return Err(LayoutConfigurationError {
                    message: format!(
                        "Configuration property '{}' must be a positive number, got {}",
                        name, val
                    ),
                });
            }
        }

        let positive_usize_fields: &[(&str, usize)] = &[
            ("initialLaneRings", self.initial_lane_rings),
            ("maxLaneRings", self.max_lane_rings),
            ("maxBadgeCandidatesPerEdge", self.max_badge_candidates_per_edge),
            ("maxBadgeBacktrackSteps", self.max_badge_backtrack_steps),
            ("maxCrossingSweeps", self.max_crossing_sweeps),
            ("maxPortImprovementPasses", self.max_port_improvement_passes),
            ("maxRipUpPasses", self.max_rip_up_passes),
            ("maxGlobalPasses", self.max_global_passes),
            ("maxAestheticPasses", self.max_aesthetic_passes),
            ("maxPortStatesPerPass", self.max_port_states_per_pass),
            ("maxPortAlternativesPerEdge", self.max_port_alternatives_per_edge),
            ("maxRouteOrderVariants", self.max_route_order_variants),
            ("coordinateSweepLimit", self.coordinate_sweep_limit),
            ("maxLayoutStates", self.max_layout_states),
            ("maxFrontierSize", self.max_frontier_size),
            ("maxNeighborsPerState", self.max_neighbors_per_state),
            ("maxAStarStatesPerRoute", self.max_astar_states_per_route),
            ("maxConflictPermutationSize", self.max_conflict_permutation_size),
            ("maxConflictPermutations", self.max_conflict_permutations),
            ("maxRouteCandidatesPerEdge", self.max_route_candidates_per_edge),
            ("maxBadgeStates", self.max_badge_states),
        ];

        for &(name, val) in positive_usize_fields {
            if val == 0 {
                return Err(LayoutConfigurationError {
                    message: format!(
                        "Configuration property '{}' must be a positive number, got {}",
                        name, val
                    ),
                });
            }
        }

        let non_negative_f64_fields: &[(&str, f64)] = &[
            ("portEndpointPadding", self.port_endpoint_padding),
            ("bendPenalty", self.bend_penalty),
            ("crossingPenalty", self.crossing_penalty),
            ("directionPenalty", self.direction_penalty),
            ("sideReusePenalty", self.side_reuse_penalty),
            ("nearObstaclePenalty", self.near_obstacle_penalty),
        ];

        for &(name, val) in non_negative_f64_fields {
            if val < 0.0 || val.is_nan() {
                return Err(LayoutConfigurationError {
                    message: format!(
                        "Configuration property '{}' must be a non-negative number, got {}",
                        name, val
                    ),
                });
            }
        }

        Ok(())
    }
}

/// Resolves user-provided partial configuration options against defaults and validates final bounds.
pub fn resolve_custom_layout_config(
    partial: Option<&PartialCustomLayoutConfig>,
) -> Result<CustomLayoutConfig, LayoutConfigurationError> {
    let mut merged = DEFAULT_CUSTOM_LAYOUT_CONFIG;

    if let Some(p) = partial {
        if let Some(val) = p.node_gap { merged.node_gap = val; }
        if let Some(val) = p.rank_gap { merged.rank_gap = val; }
        if let Some(val) = p.component_gap { merged.component_gap = val; }
        if let Some(val) = p.graph_padding { merged.graph_padding = val; }
        if let Some(val) = p.port_stub_length { merged.port_stub_length = val; }
        if let Some(val) = p.port_endpoint_padding { merged.port_endpoint_padding = val; }
        if let Some(val) = p.obstacle_clearance { merged.obstacle_clearance = val; }
        if let Some(val) = p.lane_spacing { merged.lane_spacing = val; }
        if let Some(val) = p.initial_lane_rings { merged.initial_lane_rings = val; }
        if let Some(val) = p.max_lane_rings { merged.max_lane_rings = val; }
        if let Some(val) = p.bend_penalty { merged.bend_penalty = val; }
        if let Some(val) = p.crossing_penalty { merged.crossing_penalty = val; }
        if let Some(val) = p.direction_penalty { merged.direction_penalty = val; }
        if let Some(val) = p.side_reuse_penalty { merged.side_reuse_penalty = val; }
        if let Some(val) = p.near_obstacle_penalty { merged.near_obstacle_penalty = val; }
        if let Some(val) = p.badge_clearance { merged.badge_clearance = val; }
        if let Some(val) = p.max_badge_candidates_per_edge { merged.max_badge_candidates_per_edge = val; }
        if let Some(val) = p.max_badge_backtrack_steps { merged.max_badge_backtrack_steps = val; }
        if let Some(val) = p.max_crossing_sweeps { merged.max_crossing_sweeps = val; }
        if let Some(val) = p.max_port_improvement_passes { merged.max_port_improvement_passes = val; }
        if let Some(val) = p.max_rip_up_passes { merged.max_rip_up_passes = val; }
        if let Some(val) = p.max_global_passes { merged.max_global_passes = val; }
        if let Some(val) = p.epsilon { merged.epsilon = val; }
        if let Some(val) = p.max_aesthetic_passes { merged.max_aesthetic_passes = val; }
        if let Some(val) = p.max_port_states_per_pass { merged.max_port_states_per_pass = val; }
        if let Some(val) = p.max_port_alternatives_per_edge { merged.max_port_alternatives_per_edge = val; }
        if let Some(val) = p.max_route_order_variants { merged.max_route_order_variants = val; }
        if let Some(val) = p.coordinate_sweep_limit { merged.coordinate_sweep_limit = val; }
        if let Some(val) = p.max_layout_states { merged.max_layout_states = val; }
        if let Some(val) = p.max_frontier_size { merged.max_frontier_size = val; }
        if let Some(val) = p.max_neighbors_per_state { merged.max_neighbors_per_state = val; }
        if let Some(val) = p.max_astar_states_per_route { merged.max_astar_states_per_route = val; }
        if let Some(val) = p.max_conflict_permutation_size { merged.max_conflict_permutation_size = val; }
        if let Some(val) = p.max_conflict_permutations { merged.max_conflict_permutations = val; }
        if let Some(val) = p.max_route_candidates_per_edge { merged.max_route_candidates_per_edge = val; }
        if let Some(val) = p.max_badge_states { merged.max_badge_states = val; }
    }

    merged.validate()?;
    Ok(merged)
}
