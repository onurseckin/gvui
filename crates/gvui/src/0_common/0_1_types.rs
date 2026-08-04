//! # Step 0.1: Shared Types
//!
//! Three layers live here:
//!
//! 1. **Wire input** — [`NormalizedNode`], [`NormalizedEdge`]. Deserialized from the host.
//! 2. **Internal IR** — [`GraphIr`], [`Layered`], [`RoutingDemand`]. Dense `u32` indices and CSR
//!    adjacency; no `String` keys in any hot path.
//! 3. **Wire output** — [`CustomLayoutResult`] and friends. Consumed by the renderer.
//!
//! The pipeline converts wire input to IR exactly once (Phase 0) and back exactly once (Phase 9).

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ops::Range;

pub use super::config::{
    BkAlign, Compaction, Coordinator, CustomLayoutConfig, Direction, EdgeStyle, EngineMode,
    LabelPlacement, OrderingHeuristic, Ranker,
};

// =============================================================================================
// Geometric primitives
// =============================================================================================

/// One of the four cardinal sides of a rectangular node boundary.
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

    /// Outward unit normal.
    pub fn normal(self) -> Point {
        match self {
            Side::Top => Point { x: 0.0, y: -1.0 },
            Side::Right => Point { x: 1.0, y: 0.0 },
            Side::Bottom => Point { x: 0.0, y: 1.0 },
            Side::Left => Point { x: -1.0, y: 0.0 },
        }
    }

    pub fn opposite(self) -> Side {
        match self {
            Side::Top => Side::Bottom,
            Side::Bottom => Side::Top,
            Side::Left => Side::Right,
            Side::Right => Side::Left,
        }
    }

    /// Rotates a side for the `LeftRight` transposition (Top<->Left, Bottom<->Right).
    pub fn transposed(self) -> Side {
        match self {
            Side::Top => Side::Left,
            Side::Left => Side::Top,
            Side::Bottom => Side::Right,
            Side::Right => Side::Bottom,
        }
    }
}

/// 2D point. Origin top-left, x rightward, y downward.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

/// Axis-aligned rectangle anchored at its top-left corner.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    pub fn center(&self) -> Point {
        Point {
            x: self.x + self.width / 2.0,
            y: self.y + self.height / 2.0,
        }
    }
    pub fn right(&self) -> f64 {
        self.x + self.width
    }
    pub fn bottom(&self) -> f64 {
        self.y + self.height
    }
}

/// Line segment.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Segment {
    pub a: Point,
    pub b: Point,
}

/// An edge endpoint attached to a node boundary.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PortRef {
    #[serde(rename = "nodeId")]
    pub node_id: String,
    pub side: Side,
    /// 0-based position along the side, left-to-right / top-to-bottom.
    pub index: usize,
    /// Exact point on the node boundary.
    pub point: Point,
    /// Point one `port_stub_length` outward from `point`.
    pub stub: Point,
}

// =============================================================================================
// Edge roles
// =============================================================================================

/// Caller-supplied hint overriding automatic role classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EdgeLayoutHint {
    Auto,
    Forward,
    Cross,
    Feedback,
}

/// Structural role assigned during Phase 2.
///
/// A `Feedback` edge is **reversed, not removed**: it participates in ranking, layering, ordering
/// and routing exactly like a `Forward` edge, and only its arrowhead is flipped back at emit time.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EdgeRole {
    /// Follows rank order.
    Forward,
    /// Endpoints landed on the same rank.
    Cross,
    /// Closes a cycle; stored reversed.
    Feedback,
    #[serde(rename = "self")]
    SelfRole,
    #[serde(rename = "self_loop")]
    SelfLoop,
}

impl EdgeRole {
    pub fn is_self_loop(self) -> bool {
        matches!(self, EdgeRole::SelfRole | EdgeRole::SelfLoop)
    }
}

// =============================================================================================
// Wire input
// =============================================================================================

/// A node as received from the host. `width`/`height` are already measured by the host's
/// `MeasurementProvider`; the engine never sees text.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedNode {
    pub id: String,
    #[serde(default)]
    pub label: Option<String>,
    pub width: f64,
    pub height: f64,
    /// Pins the node to a rank. Disables rank balancing for the whole graph when any node sets it.
    #[serde(default)]
    pub rank: Option<usize>,
    /// Reserved for future cluster support; carried through untouched.
    #[serde(default)]
    pub group: Option<String>,
}

/// An edge as received from the host.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedEdge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default, rename = "isCycle", alias = "is_cycle")]
    pub is_cycle: Option<bool>,
    #[serde(default, rename = "layoutRole", alias = "layout_role")]
    pub layout_role: Option<EdgeLayoutHint>,
    /// Ranking and ordering priority. Defaults to 1.0.
    #[serde(default)]
    pub weight: Option<f64>,
    /// Forces a minimum rank span. Defaults to 1, or 2 when the edge carries a label.
    #[serde(default, rename = "minLen", alias = "min_len")]
    pub min_len: Option<usize>,
    /// Host-measured badge width. When absent the engine falls back to character estimation.
    #[serde(default, rename = "labelWidth", alias = "label_width")]
    pub label_width: Option<f64>,
    /// Host-measured badge height.
    #[serde(default, rename = "labelHeight", alias = "label_height")]
    pub label_height: Option<f64>,
}

// =============================================================================================
// Internal IR — Phase 0 output
// =============================================================================================

/// Compressed sparse row adjacency over dense `u32` node indices.
///
/// Neighbours of `n` are `targets[offsets[n] .. offsets[n + 1]]`, with the originating edge index
/// at the same position in `edges`.
#[derive(Debug, Clone, Default)]
pub struct Csr {
    pub offsets: Vec<u32>,
    pub targets: Vec<u32>,
    pub edges: Vec<u32>,
}

impl Csr {
    /// Builds a CSR from `(from, to, edge)` triples over `node_count` nodes.
    /// Entries are grouped by `from` and stable within a group.
    pub fn build(node_count: usize, arcs: &[(u32, u32, u32)]) -> Csr {
        let mut counts = vec![0u32; node_count + 1];
        for &(from, _, _) in arcs {
            counts[from as usize + 1] += 1;
        }
        for i in 0..node_count {
            counts[i + 1] += counts[i];
        }
        let offsets = counts.clone();
        let mut cursor = counts;
        let mut targets = vec![0u32; arcs.len()];
        let mut edges = vec![0u32; arcs.len()];
        for &(from, to, e) in arcs {
            let slot = cursor[from as usize] as usize;
            targets[slot] = to;
            edges[slot] = e;
            cursor[from as usize] += 1;
        }
        Csr {
            offsets,
            targets,
            edges,
        }
    }

    #[inline]
    pub fn range(&self, n: u32) -> Range<usize> {
        self.offsets[n as usize] as usize..self.offsets[n as usize + 1] as usize
    }

    #[inline]
    pub fn neighbours(&self, n: u32) -> &[u32] {
        &self.targets[self.range(n)]
    }

    #[inline]
    pub fn degree(&self, n: u32) -> usize {
        self.range(n).len()
    }

    pub fn node_count(&self) -> usize {
        self.offsets.len().saturating_sub(1)
    }
}

/// Measured badge box.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct LabelBox {
    pub width: f64,
    pub height: f64,
}

/// A node in the IR.
#[derive(Debug, Clone)]
pub struct IrNode {
    /// Index into `GraphIr::node_names`.
    pub name: u32,
    pub width: f64,
    pub height: f64,
    pub pinned_rank: Option<u16>,
    /// `in_degree + out_degree`, used for port-pitch driven width growth.
    pub degree: u32,
}

/// An edge in the IR.
#[derive(Debug, Clone)]
pub struct IrEdge {
    /// Index into `GraphIr::edge_names`.
    pub name: u32,
    pub source: u32,
    pub target: u32,
    pub label: Option<LabelBox>,
    pub weight: f64,
    pub min_len: u16,
    pub hint: Option<EdgeLayoutHint>,
    /// Set when this edge is part of a parallel-edge bundle.
    pub bundle: Option<u32>,
}

/// A group of parallel edges between the same unordered node pair.
#[derive(Debug, Clone)]
pub struct Bundle {
    pub a: u32,
    pub b: u32,
    pub edges: Vec<u32>,
}

/// Phase 0 output. Everything downstream indexes into this.
#[derive(Debug, Clone, Default)]
pub struct GraphIr {
    pub node_names: Vec<String>,
    pub edge_names: Vec<String>,
    pub node_labels: Vec<Option<String>>,
    /// Display text of each edge's badge, indexed by edge.
    ///
    /// Carried separately from [`IrEdge::label`], which holds only the measured *box*. Phase 8 needs
    /// the text to fill [`BadgePlacement::label`]; without it that field is always empty, and any
    /// consumer that trusts it — the testing playground, the HTML/PNG exporters — draws blank
    /// badges while the main renderer looks right because it reads the original dataset instead.
    pub edge_labels: Vec<Option<String>>,
    pub nodes: Vec<IrNode>,
    pub edges: Vec<IrEdge>,
    /// Successors, keyed by source.
    pub out_csr: Csr,
    /// Predecessors, keyed by target.
    pub in_csr: Csr,
    pub bundles: Vec<Bundle>,
    /// Weakly connected components, each a sorted list of node indices.
    pub components: Vec<Vec<u32>>,
    /// True when at least one node carries an explicit `rank`.
    pub has_pinned_ranks: bool,
    /// Diagnostics raised during ingest (unknown endpoints, dropped edges).
    pub diagnostics: Vec<LayoutDiagnostic>,
}

impl GraphIr {
    #[inline]
    pub fn node_count(&self) -> usize {
        self.nodes.len()
    }
    #[inline]
    pub fn edge_count(&self) -> usize {
        self.edges.len()
    }
    #[inline]
    pub fn node_name(&self, n: u32) -> &str {
        &self.node_names[n as usize]
    }
    #[inline]
    pub fn edge_name(&self, e: u32) -> &str {
        &self.edge_names[e as usize]
    }
}

// =============================================================================================
// Internal IR — Phase 2 output
// =============================================================================================

/// Phase 2 output: per-edge structural role plus the reversal flag.
#[derive(Debug, Clone, Default)]
pub struct StructureResult {
    /// Indexed by edge.
    pub roles: Vec<EdgeRole>,
    /// Indexed by edge. When true, `(source, target)` is stored flipped for the rest of the pipeline.
    pub reversed: Vec<bool>,
    /// Edge indices that are self-loops; excluded from ranking, layering and ordering.
    pub self_loops: Vec<u32>,
    /// True when the non-self, non-reversed edge set forms a DAG.
    pub is_dag: bool,
}

impl StructureResult {
    /// Directed endpoints after reversal has been applied.
    #[inline]
    pub fn arc(&self, ir: &GraphIr, e: u32) -> (u32, u32) {
        let edge = &ir.edges[e as usize];
        if self.reversed[e as usize] {
            (edge.target, edge.source)
        } else {
            (edge.source, edge.target)
        }
    }
}

// =============================================================================================
// Internal IR — Phase 3 output
// =============================================================================================

/// Phase 3 output.
#[derive(Debug, Clone, Default)]
pub struct RankResult {
    /// Indexed by node.
    pub rank_of: Vec<u16>,
    pub max_rank: u16,
    /// Node indices per rank, in arbitrary order at this stage.
    pub rank_members: Vec<Vec<u32>>,
}

// =============================================================================================
// Internal IR — Phase 4/5: the layered graph
// =============================================================================================

/// What an [`Item`] represents.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemKind {
    /// An input node.
    Real(u32),
    /// A bend point of a long edge.
    Dummy { edge: u32, seq: u16 },
    /// An edge badge occupying reserved area. This is what makes badge space allocation
    /// correct by construction — see `docs/planning/layout-engine-v2/02-algorithms.md`.
    Label(u32),
}

impl ItemKind {
    pub fn is_real(&self) -> bool {
        matches!(self, ItemKind::Real(_))
    }
    pub fn is_dummy(&self) -> bool {
        matches!(self, ItemKind::Dummy { .. })
    }
    pub fn is_label(&self) -> bool {
        matches!(self, ItemKind::Label(_))
    }
    /// The edge this item belongs to, for dummy and label items.
    pub fn edge(&self) -> Option<u32> {
        match self {
            ItemKind::Dummy { edge, .. } | ItemKind::Label(edge) => Some(*edge),
            ItemKind::Real(_) => None,
        }
    }
}

/// One entry in a rank. Real nodes, dummies and labels are the same type on purpose: every
/// downstream phase treats a label exactly like a node, so no phase needs label special-casing.
#[derive(Debug, Clone, Copy)]
pub struct Item {
    pub kind: ItemKind,
    pub rank: u16,
    /// Position within the rank. The sole output of Phase 5.
    pub order: u16,
    pub width: f64,
    pub height: f64,
    /// Top-left corner. Filled by Phase 7.
    pub x: f64,
    pub y: f64,
}

impl Item {
    pub fn center_x(&self) -> f64 {
        self.x + self.width / 2.0
    }
    pub fn center_y(&self) -> f64 {
        self.y + self.height / 2.0
    }
    pub fn rect(&self) -> Rect {
        Rect {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height,
        }
    }
}

/// The chain of items an edge traverses, source-first.
#[derive(Debug, Clone)]
pub struct EdgeChain {
    pub edge: u32,
    /// True when Phase 2 reversed this edge; the arrowhead is flipped back at emit time.
    pub reversed: bool,
    pub role: EdgeRole,
    /// `[source_real, dummy.., label?, dummy.., target_real]` as item indices.
    pub items: Vec<u32>,
    /// Position within `items` of the `Label` item, when the edge has a badge.
    pub label_at: Option<usize>,
}

impl EdgeChain {
    /// Number of adjacent-rank links.
    pub fn link_count(&self) -> usize {
        self.items.len().saturating_sub(1)
    }
}

/// An edge whose endpoints landed on the same rank.
#[derive(Debug, Clone)]
pub struct FlatEdge {
    pub edge: u32,
    pub rank: u16,
    /// Item index of the source node.
    pub from_item: u32,
    /// Item index of the target node.
    pub to_item: u32,
    pub label: Option<LabelBox>,
}

/// Phase 4 output. Items are stored rank-major so a rank is a contiguous slice and `order` is an
/// index into it; Phase 5 permutes slices in place.
#[derive(Debug, Clone, Default)]
pub struct Layered {
    pub items: Vec<Item>,
    /// `rank_ranges[r]` slices `items` for rank `r`.
    pub rank_ranges: Vec<Range<u32>>,
    /// Predecessor adjacency over items, restricted to rank `r-1`.
    pub up: Csr,
    /// Successor adjacency over items, restricted to rank `r+1`.
    pub down: Csr,
    pub chains: Vec<EdgeChain>,
    pub flat_edges: Vec<FlatEdge>,
    /// Edge indices of self-loops, routed directly in Phase 8.
    pub self_loops: Vec<u32>,
    /// Item index of each real node, indexed by node.
    pub item_of_node: Vec<u32>,
}

impl Layered {
    pub fn rank_count(&self) -> usize {
        self.rank_ranges.len()
    }

    #[inline]
    pub fn rank_slice(&self, r: u16) -> &[Item] {
        let range = &self.rank_ranges[r as usize];
        &self.items[range.start as usize..range.end as usize]
    }

    #[inline]
    pub fn rank_slice_mut(&mut self, r: u16) -> &mut [Item] {
        let range = self.rank_ranges[r as usize].clone();
        &mut self.items[range.start as usize..range.end as usize]
    }

    /// Global item index of the item at `order` within `rank`.
    #[inline]
    pub fn item_index(&self, rank: u16, order: u16) -> u32 {
        self.rank_ranges[rank as usize].start + order as u32
    }

    pub fn rank_width(&self, r: u16) -> usize {
        self.rank_ranges[r as usize].len()
    }
}

// =============================================================================================
// Internal IR — Phase 6: routing demand
// =============================================================================================

/// A horizontal segment crossing the channel between rank `rank` and `rank + 1`.
#[derive(Debug, Clone, Copy)]
pub struct ChannelSeg {
    pub edge: u32,
    /// Index of the link within the owning chain.
    pub link: u32,
    pub rank: u16,
    /// Order interval spanned in the channel, inclusive.
    pub lo_order: u16,
    pub hi_order: u16,
    /// Assigned lane, `0 .. channel_lanes[rank]`.
    pub lane: u16,
}

/// A vertical segment running through the corridor between orders `after_order` and
/// `after_order + 1` of rank `rank`.
#[derive(Debug, Clone, Copy)]
pub struct CorridorSeg {
    pub edge: u32,
    pub rank: u16,
    pub after_order: u16,
    pub lane: u16,
}

/// Phase 6 output. Lane counts are exact minimum colourings of interval graphs, so the
/// separations they imply are exactly sufficient — no routing can fail afterwards.
#[derive(Debug, Clone, Default)]
pub struct RoutingDemand {
    pub channel_segs: Vec<ChannelSeg>,
    /// Lanes needed in the channel below rank `r`. Length `rank_count`.
    pub channel_lanes: Vec<u16>,
    pub corridor_segs: Vec<CorridorSeg>,
    /// Lanes needed in the corridor after `(rank, order)`.
    pub corridor_lanes: HashMap<(u16, u16), u16>,
    /// Minimum gap below rank `r`, derived from `channel_lanes`. Length `rank_count`.
    pub rank_gap_min: Vec<f64>,
    /// Minimum separation between the items at `(rank, order)` and `(rank, order + 1)`.
    pub separation_min: HashMap<(u16, u16), f64>,
    /// Lane index per `(edge, link)` for fast lookup in Phase 8.
    pub lane_of_link: HashMap<(u32, u32), u16>,
}

// =============================================================================================
// Wire output
// =============================================================================================

/// A positioned input node.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PositionedNode {
    pub id: String,
    pub label: Option<String>,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rank: usize,
    pub order: usize,
}

/// A fully routed edge.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct RoutedPath {
    #[serde(rename = "edgeId")]
    pub edge_id: String,
    pub points: Vec<Point>,
    #[serde(rename = "sourcePort")]
    pub source_port: PortRef,
    #[serde(rename = "targetPort")]
    pub target_port: PortRef,
}

/// A placed edge badge.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BadgePlacement {
    #[serde(rename = "edgeId")]
    pub edge_id: String,
    pub label: String,
    pub rect: Rect,
    #[serde(rename = "anchorPoint")]
    pub anchor_point: Point,
    #[serde(rename = "leaderPoints")]
    pub leader_points: Option<Vec<Point>>,
}

/// An intersection between two routed edges.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EdgeCrossing {
    #[serde(rename = "edgeIdA")]
    pub edge_id_a: String,
    #[serde(rename = "edgeIdB")]
    pub edge_id_b: String,
    pub point: Point,
    #[serde(rename = "bridgeOwnerEdgeId")]
    pub bridge_owner_edge_id: Option<String>,
}

/// A warning or error emitted during layout.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutDiagnostic {
    pub code: String,
    /// `"error"` | `"warning"` | `"info"`.
    pub severity: String,
    pub message: String,
    pub ids: Option<Vec<String>>,
}

impl LayoutDiagnostic {
    pub fn error(code: &str, message: String, ids: Vec<String>) -> Self {
        LayoutDiagnostic {
            code: code.to_string(),
            severity: "error".to_string(),
            message,
            ids: Some(ids),
        }
    }
    pub fn warning(code: &str, message: String, ids: Vec<String>) -> Self {
        LayoutDiagnostic {
            code: code.to_string(),
            severity: "warning".to_string(),
            message,
            ids: Some(ids),
        }
    }
    pub fn info(code: &str, message: String) -> Self {
        LayoutDiagnostic {
            code: code.to_string(),
            severity: "info".to_string(),
            message,
            ids: None,
        }
    }
}

/// Quality metrics. These are **reported, never optimized** — the v1 lexicographic score is gone.
///
/// `crossings` comes from Phase 5's combinatorial count; `geometric_crossings` is measured from
/// the emitted polylines. A large gap between them means routing introduced crossings the ordering
/// had already resolved, which is a bug rather than a tuning opportunity.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LayoutMetrics {
    pub crossings: usize,
    pub geometric_crossings: usize,
    pub bend_count: usize,
    pub total_length: f64,
    /// Fraction of dummy chains that are perfectly straight. Best single proxy for "looks designed".
    pub straight_chain_ratio: f64,
    pub area: f64,
    pub aspect_ratio: f64,
    /// Widest routing channel. Large values mean the ordering is fighting the topology.
    pub lane_depth_max: usize,
    pub port_side_balance: f64,
    /// Badges that needed a leader line. Should be ~0; nonzero means a reservation was defeated.
    pub leader_count: usize,
    pub labels_truncated: usize,
    pub node_count: usize,
    pub edge_count: usize,
    pub rank_count: usize,
    pub dummy_count: usize,
    // ---- constraint counters; any nonzero value is a bug, not a score ----
    pub node_node_overlaps: usize,
    pub edge_node_penetrations: usize,
    pub badge_node_overlaps: usize,
    pub badge_badge_overlaps: usize,
    pub unresolved_route_count: usize,
    pub unresolved_badge_count: usize,
    /// Pairs of edges drawing an axis-aligned run along the same line, so that one hides the other.
    ///
    /// Invisible to `geometric_crossings`, which counts proper intersections only. Two merged edges
    /// are worse than two crossing ones — a crossing stays readable — so this is a constraint
    /// counter rather than an aesthetic score.
    pub collinear_edge_overlaps: usize,
}

/// Per-phase timings, in milliseconds.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PhaseTimings {
    pub ingest: f64,
    pub structure: f64,
    pub rank: f64,
    pub layer: f64,
    pub order: f64,
    pub demand: f64,
    pub coordinates: f64,
    pub route: f64,
    pub emit: f64,
    pub total: f64,
}

/// Constraint verification verdict.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutValidationResult {
    #[serde(rename = "isValid")]
    pub is_valid: bool,
    pub metrics: LayoutMetrics,
    pub crossings: Vec<EdgeCrossing>,
    #[serde(default)]
    pub diagnostics: Vec<LayoutDiagnostic>,
}

/// Execution metadata. Field names preserved for renderer compatibility.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizationStats {
    /// Ordering sweeps actually executed.
    pub global_passes: usize,
    /// Ordering seeds evaluated.
    pub evaluated_port_states: usize,
    /// Always 0 in v2; spacing is exact, never expanded by retry.
    pub spacing_expansions: usize,
    pub duration_ms: f64,
    pub stop_reason: String,
    #[serde(default)]
    pub timings: PhaseTimings,
}

impl Default for OptimizationStats {
    fn default() -> Self {
        OptimizationStats {
            global_passes: 0,
            evaluated_port_states: 0,
            spacing_expansions: 0,
            duration_ms: 0.0,
            stop_reason: "ok".to_string(),
            timings: PhaseTimings::default(),
        }
    }
}

/// Final payload handed to the renderer.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CustomLayoutResult {
    pub nodes: Vec<PositionedNode>,
    pub edges: Vec<RoutedPath>,
    pub badges: Vec<BadgePlacement>,
    pub crossings: Vec<EdgeCrossing>,
    pub validation: LayoutValidationResult,
    /// `"success"` | `"unresolved_soft_conflicts"` | `"invalid_hard_failure"`.
    pub status: String,
    #[serde(rename = "optimizationStats")]
    pub optimization_stats: OptimizationStats,
}

impl CustomLayoutResult {
    /// An empty but well-formed result.
    pub fn empty(stop_reason: &str) -> Self {
        CustomLayoutResult {
            nodes: Vec::new(),
            edges: Vec::new(),
            badges: Vec::new(),
            crossings: Vec::new(),
            validation: LayoutValidationResult {
                is_valid: true,
                metrics: LayoutMetrics::default(),
                crossings: Vec::new(),
                diagnostics: Vec::new(),
            },
            status: "success".to_string(),
            optimization_stats: OptimizationStats {
                stop_reason: stop_reason.to_string(),
                ..Default::default()
            },
        }
    }
}

// =============================================================================================
// Misc
// =============================================================================================

/// Cross-platform monotonic milliseconds.
pub fn get_now_ms() -> f64 {
    #[cfg(target_arch = "wasm32")]
    {
        js_sys::Date::now()
    }
    #[cfg(not(target_arch = "wasm32"))]
    {
        static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
        let start = START.get_or_init(std::time::Instant::now);
        start.elapsed().as_secs_f64() * 1000.0
    }
}
