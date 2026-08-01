use std::collections::HashMap;
use serde::{Deserialize, Serialize};

pub use super::config::CustomLayoutConfig;

/// Represents one of the four cardinal sides of a rectangular node boundary.
/// Used for port placement and edge attachment routing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Side {
    Top,
    Right,
    Bottom,
    Left,
}

impl Side {
    pub fn as_str(&self) -> &'static str {
        match self {
            Side::Top => "top",
            Side::Right => "right",
            Side::Bottom => "bottom",
            Side::Left => "left",
        }
    }
}


/// User-provided or inferred layout hints for edge role classification during cycle breaking.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EdgeLayoutHint {
    /// Automatic role determination using graph algorithms (Tarjan SCC, Eades FAS, Auto-Cross).
    Auto,
    /// Edge follows top-to-bottom / left-to-right rank flow.
    Forward,
    /// Edge connects nodes on the same rank or non-hierarchical lateral branches.
    Cross,
    /// Edge creates a cycle and flows backwards in rank order.
    Feedback,
}

/// Final classified structural role of an edge in the layout hierarchy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EdgeRole {
    /// Standard downward or forward edge in the DAG.
    Forward,
    /// Lateral edge connecting nodes at the same rank level.
    Cross,
    /// Reversed edge breaking a cycle in the original graph.
    Feedback,
    /// Self-loop edge attached to a single node.
    #[serde(rename = "self")]
    SelfRole,
    /// Alias for self-loop edge.
    #[serde(rename = "self_loop")]
    SelfLoop,
}

/// 2D Cartesian coordinate point in continuous float space.
/// Origin (0,0) is at top-left, x increases rightward, y increases downward.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point {
    /// Horizontal coordinate in pixels/units.
    pub x: f64,
    /// Vertical coordinate in pixels/units.
    pub y: f64,
}

/// Axis-aligned bounding rectangle defined by top-left origin and dimensions.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    /// Top-left corner x coordinate.
    pub x: f64,
    /// Top-left corner y coordinate.
    pub y: f64,
    /// Width of rectangle (must be positive).
    pub width: f64,
    /// Height of rectangle (must be positive).
    pub height: f64,
}

/// Directed or undirected line segment connecting two endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    /// Start point of segment.
    pub a: Point,
    /// End point of segment.
    pub b: Point,
}

/// Reference descriptor for an edge port attachment site on a node boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PortRef {
    /// Identifier of the target node owning this port.
    #[serde(rename = "nodeId")]
    pub node_id: String,
    /// Cardinal side of the node boundary where the port is located.
    pub side: Side,
    /// 0-based index of this port along the specified side.
    pub index: usize,
    /// Exact 2D coordinate of the port on the node boundary.
    pub point: Point,
    /// Stub offset point extending outside the node for orthogonal routing clearance.
    pub stub: Point,
}

/// Validated and normalized representation of an input graph node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedNode {
    /// Unique node identifier.
    pub id: String,
    /// Optional human-readable display label.
    pub label: Option<String>,
    /// Outer width of node bounding box in pixels.
    pub width: f64,
    /// Outer height of node bounding box in pixels.
    pub height: f64,
}

/// Validated and normalized representation of an input graph edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedEdge {
    /// Unique edge identifier.
    pub id: String,
    /// Source node identifier.
    pub source: String,
    /// Target node identifier.
    pub target: String,
    /// Optional text label attached to edge.
    pub label: Option<String>,
    /// Flag indicating whether edge was explicitly flagged as cyclic by user.
    #[serde(rename = "isCycle")]
    pub is_cycle: Option<bool>,
    /// Explicit layout role hint specified by user.
    #[serde(rename = "layoutRole")]
    pub layout_role: Option<EdgeLayoutHint>,
}

/// Wrapper around `NormalizedEdge` with assigned structural `EdgeRole` and reversal state.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassifiedEdge {
    /// Underlying normalized edge.
    pub edge: NormalizedEdge,
    /// Determined structural role (Forward, Cross, Feedback, SelfLoop).
    pub role: EdgeRole,
    /// True if edge direction was reversed during cycle breaking to form a DAG.
    pub reversed: bool,
}

impl std::ops::Deref for ClassifiedEdge {
    type Target = NormalizedEdge;
    fn deref(&self) -> &Self::Target {
        &self.edge
    }
}

impl ClassifiedEdge {
    /// Returns the edge identifier.
    pub fn id(&self) -> &str {
        &self.edge.id
    }
    /// Returns the source node identifier.
    pub fn source(&self) -> &str {
        &self.edge.source
    }
    /// Returns the target node identifier.
    pub fn target(&self) -> &str {
        &self.edge.target
    }
    /// Returns whether this edge forms a cycle.
    pub fn is_cycle(&self) -> bool {
        self.edge.is_cycle.unwrap_or(false)
    }
}

/// Normalized directed graph structure containing deterministic collections and fast map lookups.
#[derive(Debug, Clone, Default)]
pub struct NormalizedGraph {
    /// Sorted list of normalized nodes.
    pub nodes: Vec<NormalizedNode>,
    /// Sorted list of normalized edges.
    pub edges: Vec<NormalizedEdge>,
    /// Map of node ID to NormalizedNode.
    pub node_map: HashMap<String, NormalizedNode>,
    /// Map of edge ID to NormalizedEdge.
    pub edge_map: HashMap<String, NormalizedEdge>,
    /// Map of node ID to outgoing NormalizedEdges sorted by edge ID.
    pub outgoing_map: HashMap<String, Vec<NormalizedEdge>>,
    /// Map of node ID to incoming NormalizedEdges sorted by edge ID.
    pub incoming_map: HashMap<String, Vec<NormalizedEdge>>,
}

/// Output wrapper containing the normalized graph and its weakly connected components.
#[derive(Debug, Clone)]
pub struct NormalizedGraphResult {
    /// Normalized graph structure.
    pub graph: NormalizedGraph,
    /// Partitioned weakly-connected component node ID lists, sorted deterministically.
    pub components: Vec<Vec<String>>,
}

impl std::ops::Deref for NormalizedGraphResult {
    type Target = NormalizedGraph;
    fn deref(&self) -> &Self::Target {
        &self.graph
    }
}

/// Detailed result structure from Tarjan's Strongly Connected Components algorithm.
#[derive(Debug, Clone)]
pub struct DetailedSCCResult {
    /// List of SCCs, each represented as a vector of node IDs.
    pub components: Vec<Vec<String>>,
    /// Lookup mapping each node ID to its comma-joined SCC identifier.
    pub component_by_node_id: HashMap<String, String>,
    /// Set of SCC identifiers that contain cycles (size > 1 or single node self-loops).
    pub cyclic_component_ids: std::collections::HashSet<String>,
    /// Condensation DAG adjacency map mapping SCC ID to successor SCC IDs.
    pub condensation_outgoing: HashMap<String, std::collections::HashSet<String>>,
}

/// Result of the cycle breaking phase containing classified edges and DAG verification flag.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CycleBreakingResult {
    /// List of classified edges with assigned roles and reversal status.
    pub classified_edges: Vec<ClassifiedEdge>,
    /// Map of edge ID to assigned EdgeRole.
    pub edge_role_map: HashMap<String, EdgeRole>,
    /// Identifiers of edges classified as feedback edges.
    pub feedback_edge_ids: Vec<String>,
    /// Flag indicating whether the remaining forward edges form a valid DAG.
    pub is_dag: bool,
}

/// Assigned cardinal side configuration for source and target ports of an edge.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortSideAssignment {
    /// Source node side assignment.
    pub src_side: Side,
    /// Target node side assignment.
    pub tgt_side: Side,
}

/// Node representation within a rank layer, supporting virtual dummy nodes for multi-rank edges.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayerNode {
    /// Node identifier (original or virtual dummy ID).
    pub id: String,
    /// True if node is a virtual bend point inserted for long span edge.
    #[serde(rename = "isVirtual", default)]
    pub is_virtual: bool,
    /// Original node ID if real, or original source node for virtual node.
    #[serde(rename = "originalNodeId")]
    pub original_node_id: Option<String>,
    /// ID of long-span edge associated with virtual dummy node.
    #[serde(rename = "sourceEdgeId")]
    pub source_edge_id: Option<String>,
    /// 0-based rank index.
    pub rank: usize,
    /// Bounding width.
    pub width: f64,
    /// Bounding height.
    pub height: f64,
    /// Assigned X coordinate.
    pub x: Option<f64>,
    /// Assigned Y coordinate.
    pub y: Option<f64>,
}

/// Fully positioned node with concrete canvas coordinates, rank, and ordering index.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionedNode {
    /// Unique node identifier.
    pub id: String,
    /// Display label.
    pub label: Option<String>,
    /// Top-left canvas X coordinate.
    pub x: f64,
    /// Top-left canvas Y coordinate.
    pub y: f64,
    /// Node bounding width.
    pub width: f64,
    /// Node bounding height.
    pub height: f64,
    /// Rank index.
    pub rank: usize,
    /// Order index within rank.
    pub order: usize,
}

/// Fully routed orthogonal polyline path for an edge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoutedPath {
    /// Unique edge identifier.
    #[serde(rename = "edgeId")]
    pub edge_id: String,
    /// Polyline waypoint points along the orthogonal path.
    pub points: Vec<Point>,
    /// Detailed source port reference.
    #[serde(rename = "sourcePort")]
    pub source_port: PortRef,
    /// Detailed target port reference.
    #[serde(rename = "targetPort")]
    pub target_port: PortRef,
}

/// Computed placement and bounding geometry for an edge label badge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BadgePlacement {
    /// Target edge identifier.
    #[serde(rename = "edgeId")]
    pub edge_id: String,
    /// Display text of badge.
    pub label: String,
    /// Bounding rectangle of badge container.
    pub rect: Rect,
    /// Anchor point on the edge path.
    #[serde(rename = "anchorPoint")]
    pub anchor_point: Point,
    /// Leader line points connecting badge to anchor point if offset.
    #[serde(rename = "leaderPoints")]
    pub leader_points: Option<Vec<Point>>,
}

/// Descriptor recording an intersection crossing point between two routed edges.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeCrossing {
    /// ID of first crossing edge.
    #[serde(rename = "edgeIdA")]
    pub edge_id_a: String,
    /// ID of second crossing edge.
    #[serde(rename = "edgeIdB")]
    pub edge_id_b: String,
    /// Exact 2D coordinate of intersection point.
    pub point: Point,
    /// Edge ID assigned to render bridge arc over crossing, if applicable.
    #[serde(rename = "bridgeOwnerEdgeId")]
    pub bridge_owner_edge_id: Option<String>,
}

/// Diagnostic warning or error message emitted during layout optimization.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutDiagnostic {
    /// Diagnostic code.
    pub code: String,
    /// Severity level (error, warning, info).
    pub severity: String,
    /// Human-readable message.
    pub message: String,
    /// Optional affected node/edge identifiers.
    pub ids: Option<Vec<String>>,
}

/// Transient state vector evaluated during local neighborhood search optimization.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[derive(Default)]
pub struct LayoutSearchState {
    /// Map of edge ID to port side assignment.
    pub side_assignments: HashMap<String, PortSideAssignment>,
    /// Map of node ID to ordered list of port IDs per side.
    pub port_orders: HashMap<String, Vec<String>>,
    /// Map of rank index to ordered list of node IDs.
    pub layer_orders: HashMap<usize, Vec<String>>,
    /// Map of rank index to Y shift offset.
    pub layer_shifts: HashMap<usize, f64>,
    /// Active exact spacing demands.
    pub exact_demands: Vec<ExactSpacingDemand>,
}


/// Comprehensive aesthetic and topological metrics computed for a layout state.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct LayoutMetrics {
    /// Number of node-node overlap violations.
    #[serde(rename = "nodeNodeOverlaps")]
    pub node_node_overlaps: usize,
    /// Number of edge-node penetration violations.
    #[serde(rename = "edgeNodePenetrations")]
    pub edge_node_penetrations: usize,
    /// Cumulative length of collinear shared edge segments.
    #[serde(rename = "sharedEdgeSegmentLength")]
    pub shared_edge_segment_length: f64,
    /// Total count of edge-edge crossings.
    #[serde(rename = "crossingCount")]
    pub crossing_count: usize,
    /// Total count of 90-degree orthogonal bends across all edges.
    #[serde(rename = "bendCount")]
    pub bend_count: usize,
    /// Sum of all routed edge lengths.
    #[serde(rename = "totalLength")]
    pub total_length: f64,
    /// Number of edges that failed orthogonal route search.
    #[serde(rename = "unresolvedRouteCount", default)]
    pub unresolved_route_count: usize,
    /// Number of badges that failed collision-free placement.
    #[serde(rename = "unresolvedBadgeCount", default)]
    pub unresolved_badge_count: usize,
    /// Number of badge-node overlaps.
    #[serde(rename = "badgeNodeOverlaps", default)]
    pub badge_node_overlaps: usize,
    /// Number of badge-badge overlaps.
    #[serde(rename = "badgeBadgeOverlaps", default)]
    pub badge_badge_overlaps: usize,
    /// Number of badge overlaps with unrelated edges.
    #[serde(rename = "badgeUnrelatedEdgeOverlaps", default)]
    pub badge_unrelated_edge_overlaps: usize,
    /// Count of ordinary leader lines drawn.
    #[serde(rename = "ordinaryLeaderCount", default)]
    pub ordinary_leader_count: usize,
    /// Count of avoidable hairpin turns in routes.
    #[serde(rename = "avoidableHairpinCount", default)]
    pub avoidable_hairpin_count: usize,
    /// Count of excess bends beyond minimal routing path.
    #[serde(rename = "excessBendCount", default)]
    pub excess_bend_count: usize,
    /// Total hairpin turn count.
    #[serde(rename = "hairpinCount", default)]
    pub hairpin_count: usize,
    /// Penalty score for edge flow direction deviations.
    #[serde(rename = "directionDeviationPenalty", default)]
    pub direction_deviation_penalty: f64,
    /// Penalty score for side reuse on crowded node faces.
    #[serde(rename = "portSideReusePenalty", default)]
    pub port_side_reuse_penalty: f64,
    /// Imbalance penalty across opposite node sides.
    #[serde(rename = "portSideImbalance", default)]
    pub port_side_imbalance: f64,
    /// Leader line count for feedback edges.
    #[serde(rename = "feedbackLeaderCount", default)]
    pub feedback_leader_count: usize,
    /// Total length of leader lines.
    #[serde(rename = "totalLeaderLength", default)]
    pub total_leader_length: f64,
    /// Total bounding box area of layout.
    #[serde(rename = "totalArea", default)]
    pub total_area: f64,
}

/// Weighted composite objective evaluation score for layout optimization state ordering.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LayoutScore {
    pub hard_error_count: usize,
    pub unresolved_route_count: usize,
    pub node_node_overlaps: usize,
    pub edge_node_penetrations: usize,
    pub shared_edge_segment_length: f64,
    pub unresolved_badge_count: usize,
    pub badge_node_overlaps: usize,
    pub badge_badge_overlaps: usize,
    pub badge_unrelated_edge_overlaps: usize,
    pub crossing_count: usize,
    pub ordinary_leader_count: usize,
    pub avoidable_hairpin_count: usize,
    pub excess_bend_count: usize,
    pub hairpin_count: usize,
    pub bend_count: usize,
    pub direction_deviation_penalty: f64,
    pub total_length: f64,
    pub port_side_imbalance: f64,
    pub feedback_leader_count: usize,
    pub total_leader_length: f64,
    pub total_area: f64,
    pub state_hash: String,
}

/// Comprehensive layout validation verdict with metrics, crossings, and diagnostics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutValidationResult {
    /// True if layout satisfies all hard constraints.
    #[serde(rename = "isValid")]
    pub is_valid: bool,
    /// Quantitative layout metrics.
    pub metrics: LayoutMetrics,
    /// Detected edge crossing list.
    pub crossings: Vec<EdgeCrossing>,
    /// Warnings or error diagnostics.
    #[serde(default)]
    pub diagnostics: Vec<LayoutDiagnostic>,
}

/// Optimization pass execution metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OptimizationStats {
    /// Total number of global optimization passes completed.
    #[serde(rename = "globalPasses")]
    pub global_passes: usize,
    /// Total number of evaluated port states.
    #[serde(rename = "evaluatedPortStates", default = "default_one")]
    pub evaluated_port_states: usize,
    /// Total number of spacing expansion iterations.
    #[serde(rename = "spacingExpansions", default)]
    pub spacing_expansions: usize,
    /// Total execution duration in milliseconds.
    #[serde(rename = "durationMs")]
    pub duration_ms: f64,
    /// Reason string describing optimization termination.
    #[serde(rename = "stopReason")]
    pub stop_reason: String,
}

fn default_one() -> usize {
    1
}

/// Final layout payload produced for WebAssembly or renderer consumption.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomLayoutResult {
    pub nodes: Vec<PositionedNode>,
    pub edges: Vec<RoutedPath>,
    pub badges: Vec<BadgePlacement>,
    pub crossings: Vec<EdgeCrossing>,
    pub validation: LayoutValidationResult,
    pub status: String,
    #[serde(rename = "optimizationStats")]
    pub optimization_stats: OptimizationStats,
}

/// Result structure of rank assignment step.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankAssignmentResult {
    /// Map of node ID to assigned rank index.
    pub node_rank_map: HashMap<String, usize>,
    /// Map of rank index to list of node IDs assigned to that rank.
    pub rank_nodes_map: HashMap<usize, Vec<String>>,
    /// Highest rank index assigned in the graph.
    pub max_rank: usize,
    /// Map of edge ID to rank span distance (target_rank - source_rank).
    pub edge_rank_span_map: HashMap<String, i32>,
}

/// Vertical band region occupied by a layout rank layer.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RankBand {
    /// Top boundary Y coordinate of the rank band.
    pub top_y: f64,
    /// Vertical height of the rank band.
    pub height: f64,
    /// Center Y coordinate of the rank band.
    pub center_y: f64,
}

/// Layered graph hierarchy including real and virtual dummy nodes.
#[derive(Debug, Clone, Default)]
pub struct ExpandedLayerGraph {
    /// Ordered layers, each containing a list of `LayerNode` items.
    pub layers: Vec<Vec<LayerNode>>,
    /// List of real (non-virtual) layer nodes.
    pub real_nodes: Vec<LayerNode>,
    /// List of virtual dummy nodes inserted for multi-rank edges.
    pub virtual_nodes: Vec<LayerNode>,
    /// Map of node ID to `LayerNode`.
    pub item_map: HashMap<String, LayerNode>,
    /// Map of node ID to predecessor node IDs in adjacent upper rank.
    pub predecessors_map: HashMap<String, Vec<String>>,
    /// Map of node ID to successor node IDs in adjacent lower rank.
    pub successors_map: HashMap<String, Vec<String>>,
}

/// Category kind of exact spacing demand.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DemandKind {
    RankGap,
    NodeGap,
    LaneX,
    LaneY,
    GraphPadding,
}

impl DemandKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            DemandKind::RankGap => "rank-gap",
            DemandKind::NodeGap => "node-gap",
            DemandKind::LaneX => "lane-x",
            DemandKind::LaneY => "lane-y",
            DemandKind::GraphPadding => "graph-padding",
        }
    }
}

impl std::fmt::Display for DemandKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Rationale explaining why a specific spacing demand was instantiated.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DemandReason {
    SameRankLabel,
    ParallelLabels,
    BlockedDirectBadge,
    EndpointFanOut,
    CrossingChannel,
    NodeOverlap,
}

impl DemandReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            DemandReason::SameRankLabel => "same-rank-label",
            DemandReason::ParallelLabels => "parallel-labels",
            DemandReason::BlockedDirectBadge => "blocked-direct-badge",
            DemandReason::EndpointFanOut => "endpoint-fan-out",
            DemandReason::CrossingChannel => "crossing-channel",
            DemandReason::NodeOverlap => "node-overlap",
        }
    }
}

impl std::fmt::Display for DemandReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Geometric spacing constraint demand enforced during coordinate assignment.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExactSpacingDemand {
    pub kind: DemandKind,
    pub rank: Option<usize>,
    #[serde(rename = "afterNodeId")]
    pub after_node_id: Option<String>,
    #[serde(rename = "affectedEdgeIds")]
    pub affected_edge_ids: Vec<String>,
    pub minimum: f64,
    pub reason: DemandReason,
}

/// Category kind for badge placement spacing requests.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BadgeRequestKind {
    RankGap,
    NodeGap,
    GraphPadding,
}

impl BadgeRequestKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            BadgeRequestKind::RankGap => "rank-gap",
            BadgeRequestKind::NodeGap => "node-gap",
            BadgeRequestKind::GraphPadding => "graph-padding",
        }
    }
}

impl std::fmt::Display for BadgeRequestKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Reason explaining why a badge spacing expansion was requested.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BadgeRequestReason {
    SameRankLabel,
    ParallelLabels,
    BlockedDirectBadge,
}

impl BadgeRequestReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            BadgeRequestReason::SameRankLabel => "same-rank-label",
            BadgeRequestReason::ParallelLabels => "parallel-labels",
            BadgeRequestReason::BlockedDirectBadge => "blocked-direct-badge",
        }
    }
}

impl std::fmt::Display for BadgeRequestReason {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// Request for additional spacing clearance to accommodate edge label badges.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BadgeSpacingRequest {
    #[serde(rename = "edgeId")]
    pub edge_id: String,
    pub kind: BadgeRequestKind,
    pub rank: Option<usize>,
    #[serde(rename = "afterNodeId")]
    pub after_node_id: Option<String>,
    pub minimum: f64,
    pub reason: BadgeRequestReason,
}

/// Dimension metrics of a measured edge badge text element.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct MeasuredBadge {
    pub width: f64,
    pub height: f64,
}

/// User or heuristic override values for layout element spacing gaps.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpacingOverrides {
    pub rank_gaps: Option<HashMap<usize, f64>>,
    pub node_gaps: Option<HashMap<String, f64>>,
    pub node_gap_by_rank: Option<HashMap<usize, f64>>,
    pub rank_gap_after_rank: Option<HashMap<usize, f64>>,
    pub node_gap_after_node_id: Option<HashMap<String, f64>>,
    pub global_node_gap: Option<f64>,
    pub global_rank_gap: Option<f64>,
    pub outer_padding: Option<f64>,
}
