//! # Step 0.2: Layout Engine Configuration
//!
//! Three tiers:
//! - **Tier 1 — Aesthetics**: knobs with a monotone, predictable effect. These are what users tune.
//! - **Tier 2 — Algorithm selection**: swap the algorithm used by a phase (for A/B and debugging).
//! - **Tier 3 — Budgets**: safety rails, not quality dials.
//!
//! Every field is optional over the wire (`PartialCustomLayoutConfig`) and merges over
//! [`DEFAULT_CUSTOM_LAYOUT_CONFIG`]. Unknown incoming fields are ignored, so older clients that
//! still send the removed v1 search-budget knobs keep working.

use serde::{Deserialize, Serialize};
use std::fmt;

/// Error indicating invalid layout configuration parameters.
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

// ---------------------------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------------------------

/// Primary flow direction of a layered layout.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Direction {
    /// Ranks increase downward (default).
    #[default]
    TopDown,
    /// Ranks increase upward.
    BottomUp,
    /// Ranks increase rightward.
    LeftRight,
    /// Ranks increase leftward.
    RightLeft,
}

impl Direction {
    /// True when the rank axis is horizontal, meaning boxes are transposed before layering
    /// and coordinates are transposed on the way out.
    pub fn is_horizontal(self) -> bool {
        matches!(self, Direction::LeftRight | Direction::RightLeft)
    }

    /// True when the final coordinates must be mirrored along the rank axis.
    pub fn is_reversed(self) -> bool {
        matches!(self, Direction::BottomUp | Direction::RightLeft)
    }
}

/// How edge polylines are rendered.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum EdgeStyle {
    /// Axis-aligned polyline with sharp corners.
    Orthogonal,
    /// Axis-aligned polyline with corners rounded to `corner_radius` (default).
    #[default]
    Rounded,
    /// Smooth cubic spline through the chain waypoints.
    Spline,
    /// Orthogonal polyline whose right-angle corners are replaced by 45-degree chamfers wherever
    /// the chamfer is collision-free. This is the "8-direction" look, applied as a post-pass so the
    /// exact lane model — and with it the guarantee that routing cannot fail — is preserved.
    Octilinear,
    /// Direct source-to-target line, clipped to node boundaries.
    Straight,
}

/// Where an edge badge sits relative to its edge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum LabelPlacement {
    /// Badge centred on the edge; the edge passes behind it (default).
    ///
    /// This is the default because a badge that sits beside its edge has to be joined to it by a
    /// leader line, and a drawing full of dotted connectors reads worse than one where each label
    /// simply sits on the line it describes.
    #[default]
    OnEdge,
    /// Badge offset to the right of the edge; the edge passes along its left face.
    BesideEdge,
    /// Badge offset above the edge's horizontal run.
    AboveEdge,
}

/// Rank assignment algorithm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Ranker {
    /// Gansner et al. network simplex: optimal for the weighted edge-length objective (default).
    #[default]
    NetworkSimplex,
    /// Longest-path layering: fast, maximally tall.
    LongestPath,
    /// Tight spanning tree without simplex pivots.
    TightTree,
}

/// Two-layer ordering heuristic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum OrderingHeuristic {
    /// Median ordering; bounded at 3x optimal for the two-layer problem (default).
    #[default]
    Median,
    /// Barycenter (mean) ordering; no bound, occasionally smoother on regular graphs.
    Barycenter,
}

/// Horizontal coordinate assignment algorithm.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Coordinator {
    /// Brandes-Koepf: <=2 bends per edge, straight dummy chains, O(V+E) (default).
    #[default]
    BrandesKopf,
    /// Rank-centered packing. Debug aid; produces no alignment guarantees.
    Simple,
}

/// Which of the four Brandes-Koepf candidate assignments to emit.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum BkAlign {
    /// Average of the two innermost of the four candidates (default).
    #[default]
    Median,
    /// Minimum-width candidate.
    Leftmost,
    /// Maximum-width candidate.
    Rightmost,
    UpLeft,
    UpRight,
    DownLeft,
    DownRight,
}

/// Preset over the spacing family.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum Compaction {
    /// Multiplies gaps by 0.65.
    Tight,
    /// Gaps used as configured (default).
    #[default]
    Balanced,
    /// Multiplies gaps by 1.45.
    Airy,
}

impl Compaction {
    pub fn gap_scale(self) -> f64 {
        match self {
            Compaction::Tight => 0.65,
            Compaction::Balanced => 1.0,
            Compaction::Airy => 1.45,
        }
    }
}

/// Which layout engine runs. Selected by the `mode` field of the WASM entry point; this enum is
/// the canonical internal form.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
#[serde(rename_all = "kebab-case")]
pub enum EngineMode {
    /// Full layered pipeline with orthogonal lane routing (default).
    #[default]
    Layered,
    /// Concentric BFS rings with proportional wedge allocation.
    Radial,
}

impl EngineMode {
    /// Resolves a `mode` string, including the legacy values older clients still send.
    ///
    /// Direction is deliberately **not** returned here. It used to be, and the result was that
    /// `left-right` silently did nothing: the client sends a fully resolved config, so
    /// `direction` was always present, and the "explicit direction wins over mode" rule discarded
    /// the mode's direction every single time. Flow direction now has exactly one source of
    /// truth — [`CustomLayoutConfig::direction`].
    pub fn from_mode_str(s: &str) -> EngineMode {
        match s {
            "radial" => EngineMode::Radial,
            // Everything else, including the retired `organic`/`grid`/`layered-spline` values and
            // every direction-bearing legacy string, resolves to the layered engine.
            _ => EngineMode::Layered,
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------------------------

/// Resolved, validated layout configuration.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomLayoutConfig {
    // ---- Tier 1: aesthetics -------------------------------------------------------------------
    /// Primary flow direction.
    pub direction: Direction,
    /// Minimum horizontal separation between adjacent items in a rank (> 0).
    pub node_gap: f64,
    /// Minimum vertical separation between rank bands; routing channels may raise it (> 0).
    pub rank_gap: f64,
    /// Minimum separation between disconnected components (> 0).
    pub component_gap: f64,
    /// Outer margin around the whole drawing (> 0).
    pub graph_padding: f64,
    /// Distance between parallel routing lanes inside a channel or corridor (> 0).
    pub lane_spacing: f64,
    /// Minimum spacing between two ports on the same node side (> 0).
    pub port_pitch: f64,
    /// Straight run leaving a port before the first bend (> 0).
    pub port_stub_length: f64,
    /// Clearance between the outermost port and a node corner (>= 0).
    pub port_endpoint_padding: f64,
    /// Bend rounding radius; `0.0` yields sharp corners (>= 0).
    pub corner_radius: f64,
    /// Edge rendering style.
    pub edge_style: EdgeStyle,
    /// Badge position relative to its edge.
    pub label_placement: LabelPlacement,
    /// Padding reserved around a badge box (> 0).
    pub badge_clearance: f64,
    /// Wrap width for edge labels, in pixels (> 0).
    pub max_label_width: f64,
    /// Maximum wrapped lines before ellipsis (> 0).
    pub max_label_lines: usize,
    /// Lower clamp for measured node width (> 0).
    pub min_node_width: f64,
    /// Upper clamp for measured node width; must exceed `min_node_width`.
    pub max_node_width: f64,
    /// Width:height target used by rank balancing and component packing (> 0).
    pub target_aspect_ratio: f64,
    /// Hard cap on items per rank. `0` derives it from `target_aspect_ratio`.
    pub max_nodes_per_rank: usize,
    /// Whether rank balancing runs at all.
    pub balance_ranks: bool,
    /// Route parallel edges between the same node pair as one bus.
    pub bundle_parallel_edges: bool,
    /// Spacing preset multiplier.
    pub compaction: Compaction,
    /// Let the router pick any of the four node sides per endpoint, scored geometrically, instead
    /// of forcing every forward edge onto Bottom -> Top. Sideways targets then leave sideways,
    /// which removes the dog-leg they would otherwise need.
    pub flexible_port_sides: bool,
    /// How strongly a forward edge still prefers the rank-flow sides (Bottom/Top) when
    /// `flexible_port_sides` is on. 0 is purely geometric; larger values keep the hierarchy
    /// reading top-to-bottom even when a sideways exit would be marginally shorter.
    pub flow_side_bias: f64,
    /// Snap a source and target port to a common coordinate when that turns a dog-leg into one
    /// straight segment. The largest single reducer of unnecessary corners.
    pub straight_shot_alignment: bool,
    /// Allow the ranker to place the endpoints of a peer edge on the same rank (`min_len = 0`), so
    /// two siblings can be joined by a straight horizontal line instead of being forced onto
    /// different ranks and connected vertically.
    pub same_rank_peer_edges: bool,

    // ---- Tier 2: algorithm selection ----------------------------------------------------------
    /// Rank assignment algorithm.
    pub ranker: Ranker,
    /// Two-layer ordering heuristic.
    pub ordering: OrderingHeuristic,
    /// Down/up sweep count in the ordering phase (> 0).
    pub ordering_sweeps: usize,
    /// Independent ordering seeds; the best result wins (> 0).
    pub ordering_seeds: usize,
    /// Horizontal coordinate algorithm.
    pub coordinator: Coordinator,
    /// Brandes-Koepf candidate selection.
    pub bk_align: BkAlign,
    /// Keep dummy chains straight by making dummies reluctant to move during ordering.
    pub dummy_priority: bool,

    // ---- Tier 2b: organic (stress) mode --------------------------------------------------------
    /// SGD epochs for organic mode (> 0).
    pub stress_iterations: usize,
    /// Desired pixel length of one graph-distance unit (> 0).
    pub stress_ideal_edge_length: f64,
    /// Overlap-removal passes after stress convergence (>= 0).
    pub overlap_removal_passes: usize,

    // ---- Tier 2c: radial mode ------------------------------------------------------------------
    /// Gap between concentric rings (> 0).
    pub radial_ring_gap: f64,
    /// Explicit root node id for radial mode; empty selects the highest-degree node.
    pub radial_root: String,

    // ---- Tier 3: budgets -----------------------------------------------------------------------
    /// Soft wall-clock budget in milliseconds; ordering stops sweeping when exceeded (> 0).
    pub time_budget_ms: f64,
    /// Guard against pathological rank spans (> 0).
    pub max_dummy_chain_length: usize,
    /// Run the Phase 9 invariant checks even in release builds.
    pub assert_constraints: bool,
    /// Floating point comparison tolerance (> 0).
    pub epsilon: f64,

    // ---- UI passthrough (not used by layout) ---------------------------------------------------
    /// Viewport wheel/pinch sensitivity. Carried for the renderer's convenience.
    pub zoom_sensitivity: f64,
}

/// Tuned defaults.
pub const DEFAULT_CUSTOM_LAYOUT_CONFIG: CustomLayoutConfig = CustomLayoutConfig {
    direction: Direction::TopDown,
    node_gap: 60.0,
    rank_gap: 60.0,
    component_gap: 160.0,
    graph_padding: 80.0,
    lane_spacing: 12.0,
    port_pitch: 18.0,
    port_stub_length: 20.0,
    port_endpoint_padding: 16.0,
    corner_radius: 8.0,
    edge_style: EdgeStyle::Rounded,
    label_placement: LabelPlacement::OnEdge,
    badge_clearance: 10.0,
    max_label_width: 220.0,
    max_label_lines: 3,
    min_node_width: 120.0,
    max_node_width: 420.0,
    target_aspect_ratio: 1.6,
    max_nodes_per_rank: 0,
    balance_ranks: true,
    bundle_parallel_edges: true,
    compaction: Compaction::Balanced,
    flexible_port_sides: true,
    flow_side_bias: 1.0,
    straight_shot_alignment: true,
    same_rank_peer_edges: true,

    ranker: Ranker::NetworkSimplex,
    ordering: OrderingHeuristic::Median,
    ordering_sweeps: 16,
    ordering_seeds: 4,
    coordinator: Coordinator::BrandesKopf,
    bk_align: BkAlign::Median,
    dummy_priority: true,

    stress_iterations: 30,
    stress_ideal_edge_length: 180.0,
    overlap_removal_passes: 6,

    radial_ring_gap: 140.0,
    radial_root: String::new(),

    time_budget_ms: 250.0,
    max_dummy_chain_length: 64,
    assert_constraints: false,
    epsilon: 0.001,

    zoom_sensitivity: 1.0,
};

impl Default for CustomLayoutConfig {
    fn default() -> Self {
        DEFAULT_CUSTOM_LAYOUT_CONFIG
    }
}

impl CustomLayoutConfig {
    /// Effective node gap after applying the compaction preset.
    pub fn effective_node_gap(&self) -> f64 {
        self.node_gap * self.compaction.gap_scale()
    }

    /// Effective rank gap after applying the compaction preset.
    pub fn effective_rank_gap(&self) -> f64 {
        self.rank_gap * self.compaction.gap_scale()
    }

    /// Effective lane spacing after applying the compaction preset.
    pub fn effective_lane_spacing(&self) -> f64 {
        self.lane_spacing * self.compaction.gap_scale()
    }

    /// Resolved cap on items per rank. Derives from `target_aspect_ratio` when
    /// `max_nodes_per_rank` is 0.
    ///
    /// The derivation treats the drawing as `node_count` boxes of average aspect
    /// `avg_w / avg_h`; a rank width of `sqrt(node_count * aspect_of_box / target)` produces a
    /// drawing whose overall aspect approaches `target_aspect_ratio`.
    pub fn resolved_max_nodes_per_rank(&self, node_count: usize, avg_w: f64, avg_h: f64) -> usize {
        if self.max_nodes_per_rank > 0 {
            return self.max_nodes_per_rank;
        }
        if node_count == 0 {
            return 1;
        }
        let box_aspect = if avg_h > 0.0 { avg_w / avg_h } else { 1.0 };
        let denom = (box_aspect / self.target_aspect_ratio.max(0.05)).max(0.05);
        let derived = ((node_count as f64) / denom).sqrt().ceil() as usize;
        derived.max(1)
    }

    /// Validates every numeric bound. Returns the first violation encountered.
    pub fn validate(&self) -> Result<(), LayoutConfigurationError> {
        let positive_f64: &[(&str, f64)] = &[
            ("nodeGap", self.node_gap),
            ("rankGap", self.rank_gap),
            ("componentGap", self.component_gap),
            ("graphPadding", self.graph_padding),
            ("laneSpacing", self.lane_spacing),
            ("portPitch", self.port_pitch),
            ("portStubLength", self.port_stub_length),
            ("badgeClearance", self.badge_clearance),
            ("maxLabelWidth", self.max_label_width),
            ("minNodeWidth", self.min_node_width),
            ("maxNodeWidth", self.max_node_width),
            ("targetAspectRatio", self.target_aspect_ratio),
            ("stressIdealEdgeLength", self.stress_ideal_edge_length),
            ("radialRingGap", self.radial_ring_gap),
            ("timeBudgetMs", self.time_budget_ms),
            ("epsilon", self.epsilon),
            ("zoomSensitivity", self.zoom_sensitivity),
        ];
        for &(name, v) in positive_f64 {
            if !v.is_finite() || v <= 0.0 {
                return Err(LayoutConfigurationError {
                    message: format!(
                        "Configuration property '{}' must be a positive finite number, got {}",
                        name, v
                    ),
                });
            }
        }

        let non_negative_f64: &[(&str, f64)] = &[
            ("portEndpointPadding", self.port_endpoint_padding),
            ("cornerRadius", self.corner_radius),
            ("flowSideBias", self.flow_side_bias),
        ];
        for &(name, v) in non_negative_f64 {
            if !v.is_finite() || v < 0.0 {
                return Err(LayoutConfigurationError {
                    message: format!(
                        "Configuration property '{}' must be a non-negative finite number, got {}",
                        name, v
                    ),
                });
            }
        }

        let positive_usize: &[(&str, usize)] = &[
            ("maxLabelLines", self.max_label_lines),
            ("orderingSweeps", self.ordering_sweeps),
            ("orderingSeeds", self.ordering_seeds),
            ("stressIterations", self.stress_iterations),
            ("maxDummyChainLength", self.max_dummy_chain_length),
        ];
        for &(name, v) in positive_usize {
            if v == 0 {
                return Err(LayoutConfigurationError {
                    message: format!("Configuration property '{}' must be greater than 0", name),
                });
            }
        }

        if self.max_node_width < self.min_node_width {
            return Err(LayoutConfigurationError {
                message: format!(
                    "Configuration property 'maxNodeWidth' ({}) must be >= 'minNodeWidth' ({})",
                    self.max_node_width, self.min_node_width
                ),
            });
        }

        Ok(())
    }
}

// ---------------------------------------------------------------------------------------------
// Partial / merge
// ---------------------------------------------------------------------------------------------

/// Wire-format partial override. Unknown fields are ignored, so clients still sending the removed
/// v1 search-budget knobs continue to work.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PartialCustomLayoutConfig {
    pub direction: Option<Direction>,
    pub node_gap: Option<f64>,
    pub rank_gap: Option<f64>,
    pub component_gap: Option<f64>,
    pub graph_padding: Option<f64>,
    pub lane_spacing: Option<f64>,
    pub port_pitch: Option<f64>,
    pub port_stub_length: Option<f64>,
    pub port_endpoint_padding: Option<f64>,
    pub corner_radius: Option<f64>,
    pub edge_style: Option<EdgeStyle>,
    pub label_placement: Option<LabelPlacement>,
    pub badge_clearance: Option<f64>,
    pub max_label_width: Option<f64>,
    pub max_label_lines: Option<usize>,
    pub min_node_width: Option<f64>,
    pub max_node_width: Option<f64>,
    pub target_aspect_ratio: Option<f64>,
    pub max_nodes_per_rank: Option<usize>,
    pub balance_ranks: Option<bool>,
    pub bundle_parallel_edges: Option<bool>,
    pub compaction: Option<Compaction>,
    pub flexible_port_sides: Option<bool>,
    pub flow_side_bias: Option<f64>,
    pub straight_shot_alignment: Option<bool>,
    pub same_rank_peer_edges: Option<bool>,

    pub ranker: Option<Ranker>,
    pub ordering: Option<OrderingHeuristic>,
    pub ordering_sweeps: Option<usize>,
    pub ordering_seeds: Option<usize>,
    pub coordinator: Option<Coordinator>,
    pub bk_align: Option<BkAlign>,
    pub dummy_priority: Option<bool>,

    pub stress_iterations: Option<usize>,
    pub stress_ideal_edge_length: Option<f64>,
    pub overlap_removal_passes: Option<usize>,

    pub radial_ring_gap: Option<f64>,
    pub radial_root: Option<String>,

    pub time_budget_ms: Option<f64>,
    pub max_dummy_chain_length: Option<usize>,
    pub assert_constraints: Option<bool>,
    pub epsilon: Option<f64>,

    pub zoom_sensitivity: Option<f64>,
}

/// Merges a partial override over the defaults and validates the result.
pub fn resolve_custom_layout_config(
    partial: Option<&PartialCustomLayoutConfig>,
) -> Result<CustomLayoutConfig, LayoutConfigurationError> {
    let mut c = DEFAULT_CUSTOM_LAYOUT_CONFIG;

    if let Some(p) = partial {
        macro_rules! take {
            ($field:ident) => {
                if let Some(v) = p.$field {
                    c.$field = v;
                }
            };
        }

        take!(direction);
        take!(node_gap);
        take!(rank_gap);
        take!(component_gap);
        take!(graph_padding);
        take!(lane_spacing);
        take!(port_pitch);
        take!(port_stub_length);
        take!(port_endpoint_padding);
        take!(corner_radius);
        take!(edge_style);
        take!(label_placement);
        take!(badge_clearance);
        take!(max_label_width);
        take!(max_label_lines);
        take!(min_node_width);
        take!(max_node_width);
        take!(target_aspect_ratio);
        take!(max_nodes_per_rank);
        take!(balance_ranks);
        take!(bundle_parallel_edges);
        take!(compaction);
        take!(flexible_port_sides);
        take!(flow_side_bias);
        take!(straight_shot_alignment);
        take!(same_rank_peer_edges);

        take!(ranker);
        take!(ordering);
        take!(ordering_sweeps);
        take!(ordering_seeds);
        take!(coordinator);
        take!(bk_align);
        take!(dummy_priority);

        take!(stress_iterations);
        take!(stress_ideal_edge_length);
        take!(overlap_removal_passes);

        take!(radial_ring_gap);
        take!(time_budget_ms);

        take!(max_dummy_chain_length);
        take!(assert_constraints);
        take!(epsilon);
        take!(zoom_sensitivity);

        if let Some(ref v) = p.radial_root {
            c.radial_root = v.clone();
        }
    }

    c.validate()?;
    Ok(c)
}
