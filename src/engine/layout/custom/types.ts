export type Side = "top" | "right" | "bottom" | "left";
export type AxisDirection = "horizontal" | "vertical";
export type EdgeRole = "forward" | "cross" | "feedback" | "self";
export type EdgeLayoutHint = "auto" | "forward" | "cross" | "feedback";
export type SegmentDirection = "up" | "right" | "down" | "left";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Segment {
  a: Point;
  b: Point;
}

export type NodeSizeMap = Record<string, { width: number; height: number }>;

export interface PortRef {
  nodeId: string;
  side: Side;
  index: number;
  point: Point;
  stub: Point;
}

export interface RoutedPath {
  edgeId: string;
  points: Point[];
  sourcePort: PortRef;
  targetPort: PortRef;
  stats?: RouteSearchStats;
}

export interface RouteSearchStats {
  expandedStates: number;
  pushedStates: number;
  occupancyQueries: number;
  stopReason: "target_reached" | "queue_exhausted" | "max_iterations";
}

export interface LayoutDiagnostic {
  code: string;
  severity: "error" | "warning" | "info" | string;
  message: string;
  ids?: string[];
}

export interface NormalizedNode {
  id: string;
  label?: string;
  width: number;
  height: number;
  /** Pins the node to a rank. Disables rank balancing for the whole graph when any node sets it. */
  rank?: number;
  /** Reserved for future cluster support; carried through untouched by the layout engine. */
  group?: string;
}

export interface NormalizedEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  isCycle?: boolean;
  layoutRole?: EdgeLayoutHint;
  /** Ranking and ordering priority. Rust default is 1.0 when omitted. */
  weight?: number;
  /** Forces a minimum rank span. Rust default is 1, or 2 when the edge carries a label. */
  minLen?: number;
  /** Host-measured badge width; when absent the Rust side falls back to character estimation. */
  labelWidth?: number;
  /** Host-measured badge height. */
  labelHeight?: number;
}

export interface NormalizedGraph {
  nodes: NormalizedNode[];
  edges: NormalizedEdge[];
  nodeMap: Map<string, NormalizedNode>;
  edgeMap: Map<string, NormalizedEdge>;
  outgoingMap: Map<string, NormalizedEdge[]>;
  incomingMap: Map<string, NormalizedEdge[]>;
}

export interface SCCResult {
  components: string[][];
  nodeComponentMap: Map<string, number>;
}

export interface ClassifiedEdge extends NormalizedEdge {
  role: EdgeRole;
  reversed: boolean;
}

export interface LayerNode {
  id: string;
  isVirtual: boolean;
  originalNodeId?: string;
  sourceEdgeId?: string;
  rank: number;
  width: number;
  height: number;
  x?: number;
  y?: number;
}

export interface LayerGraph {
  layers: LayerNode[][];
  nodeLayerMap: Map<string, { rank: number; index: number }>;
}

export interface GridVertex {
  id: string;
  point: Point;
  isObstacle: boolean;
}

export interface GridEdge {
  id: string;
  u: string;
  v: string;
  segment: Segment;
  weight: number;
  nearObstacle?: boolean;
}

export interface OccupancyRecord {
  edgeId: string;
  segment: Segment;
}

export interface RouteReservation {
  edgeId: string;
  segment: Segment;
  isEndpointLeg?: boolean;
}

export interface RouteConflict {
  edgeIdA: string;
  edgeIdB: string;
  reason: "collinear_overlap" | "endpoint_stub_conflict" | "node_penetration";
}

export interface SpacingOverrides {
  rankGaps?: Record<number, number>;
  nodeGaps?: Record<string, number>;
  nodeGapByRank?: Map<number, number>;
  rankGapAfterRank?: Map<number, number>;
  nodeGapAfterNodeId?: Map<string, number>;
}

export interface BadgeCandidate {
  point: Point;
  rect: Rect;
  score: number;
  leaderPoints?: Point[];
}

export interface BadgePlacement {
  edgeId: string;
  label: string;
  rect: Rect;
  anchorPoint: Point;
  leaderPoints?: Point[];
}

export interface EdgeCrossing {
  edgeIdA: string;
  edgeIdB: string;
  point: Point;
  bridgeOwnerEdgeId?: string;
}

export interface LayoutValidationResult {
  isValid: boolean;
  diagnostics: LayoutDiagnostic[];
  metrics: LayoutMetrics;
  crossings?: EdgeCrossing[];
}

export interface RouteAestheticMetrics {
  avoidableHairpinCount: number;
  excessBendCount: number;
  maximumOrdinaryEdgeBends: number;
  maximumFeedbackEdgeBends: number;
}

export interface CanonicalSpacingOverrides {
  rankGaps?: Record<number, number>;
  nodeGaps?: Record<string, number>;
  nodeGapByRank?: Map<number, number>;
  rankGapAfterRank?: Map<number, number>;
  nodeGapAfterNodeId?: Map<string, number>;
  outerPadding?: number;
}

export type RouteOrderStrategy =
  | "natural"
  | "longest_first"
  | "shortest_first"
  | "feedback_last"
  | "crossings_first";

export interface LayoutSearchState {
  sideAssignments: Map<string, PortSideAssignment>;
  portOrders: Record<string, string[]>;
  exactDemands: ExactSpacingDemand[];
  layerOrders: Map<number, string[]>;
  layerShifts: Map<string, number>;
  visitedSignatures: Set<string>;
  orderedLayerIds?: string[][];
  spacing?: CanonicalSpacingOverrides;
  graphPadding?: number;
  routeOrderStrategy?: RouteOrderStrategy;
}

export interface ExactSpacingDemand {
  kind: "rank-gap" | "node-gap" | "lane-x" | "lane-y" | "graph-padding";
  rank?: number;
  afterNodeId?: string;
  affectedEdgeIds: string[];
  minimum: number;
  reason:
    | "same-rank-label"
    | "parallel-labels"
    | "blocked-direct-badge"
    | "endpoint-fan-out"
    | "crossing-channel"
    | "node-overlap";
}

/**
 * Why the v2 pipeline stopped. There is no state-space search any more, so the v1 budget-exhaustion
 * reasons are gone: the only things that can end a run are convergence, the ordering time budget,
 * an empty graph, or a degenerate stop in a non-layered engine.
 */
export type SearchStopReason =
  | "ordering-converged"
  | "local-optimum"
  | "time-budget"
  | "empty_graph"
  | "ok";

/**
 * Mirrors Rust's `LayoutMetrics` (crates/gvui/src/0_common/0_1_types.rs).
 *
 * These are **reported, never optimized** — v1's 21-field lexicographic `LayoutScore` is gone.
 * The constraint counters at the bottom are guaranteed zero by construction in v2, so a non-zero
 * value is a bug report rather than a tuning signal.
 */
export interface LayoutMetrics {
  /** Combinatorial crossings after ordering (Phase 5). */
  crossings: number;
  /**
   * Crossings measured from the emitted polylines. Runs somewhat above `crossings` by design —
   * lane routing also crosses where a vertical run meets another edge's horizontal run in the
   * same channel, which the combinatorial count does not model. Watch the ratio, not the equality.
   */
  geometricCrossings: number;
  bendCount: number;
  totalLength: number;
  /** Fraction of dummy chains that are perfectly straight. Best single proxy for "looks designed". */
  straightChainRatio: number;
  area: number;
  aspectRatio: number;
  /** Widest routing channel. A large value means ordering is fighting the topology. */
  laneDepthMax: number;
  portSideBalance: number;
  /** Badges that needed a leader line. Should be ~0; non-zero means a reservation was defeated. */
  leaderCount: number;
  labelsTruncated: number;
  nodeCount: number;
  edgeCount: number;
  rankCount: number;
  dummyCount: number;

  // ---- constraint counters; any non-zero value is a bug, not a score ----
  nodeNodeOverlaps: number;
  edgeNodePenetrations: number;
  badgeNodeOverlaps: number;
  badgeBadgeOverlaps: number;
  badgeEdgePenetrations: number;
  unresolvedRouteCount: number;
  unresolvedBadgeCount: number;
  /** Pairs of edges drawing an axis-aligned run along the same line, so that one hides the other. */
  collinearEdgeOverlaps: number;
}

/** Per-phase wall-clock in milliseconds. Mirrors Rust's `PhaseTimings`. */
export interface PhaseTimings {
  ingest: number;
  structure: number;
  rank: number;
  layer: number;
  order: number;
  demand: number;
  coordinates: number;
  route: number;
  emit: number;
  total: number;
}

/** Mirrors Rust's `OptimizationStats`. Field names kept for renderer compatibility. */
export interface OptimizationStats {
  /** Ordering sweeps actually executed. */
  globalPasses: number;
  /** Ordering seeds evaluated. */
  evaluatedPortStates: number;
  /** Always 0 in v2 — spacing is exact and is never expanded by retry. */
  spacingExpansions: number;
  durationMs?: number;
  stopReason?: SearchStopReason;
  timings?: PhaseTimings;
}

export interface RouteCost {
  crossings: number;
  hairpins: number;
  bends: number;
  directionDeviation: number;
  length: number;
  nearObstaclePenalty: number;
}

export interface LayoutScore {
  hardErrorCount: number;
  unresolvedRouteCount?: number;
  nodeNodeOverlaps: number;
  edgeNodePenetrations: number;
  sharedEdgeSegmentLength: number;
  unresolvedBadgeCount?: number;
  badgeNodeOverlaps: number;
  badgeBadgeOverlaps: number;
  badgeUnrelatedEdgeOverlaps: number;
  crossingCount: number;
  ordinaryLeaderCount: number;
  avoidableHairpinCount: number;
  excessBendCount: number;
  hairpinCount: number;
  bendCount: number;
  directionDeviationPenalty: number;
  totalLength: number;
  portSideImbalance: number;
  feedbackLeaderCount: number;
  totalLeaderLength: number;
  totalArea: number;
  stateHash: string;
}

export interface BadgeSpacingRequest {
  edgeId: string;
  kind: "rank-gap" | "node-gap" | "graph-padding";
  rank?: number;
  afterNodeId?: string;
  minimum: number;
  reason: "same-rank-label" | "parallel-labels" | "blocked-direct-badge";
}

export interface PortSideAssignment {
  srcSide: Side;
  tgtSide: Side;
}

export interface CustomLayoutResult {
  nodes: (NormalizedNode & Point)[];
  edges: RoutedPath[];
  badges: BadgePlacement[];
  crossings: EdgeCrossing[];
  validation: LayoutValidationResult;
  status: "success" | "unresolved_soft_conflicts" | "invalid_hard_failure" | string;
  optimizationStats?: OptimizationStats;
  nodePositions?: Map<string, Point>;
  rankBandMap?: Map<number, { topY: number; height: number; centerY: number }>;
  boundingBox?: Rect;
}

/** Error thrown when data returned from WebAssembly violates the CustomLayoutResult contract. */
export class WasmLayoutBoundaryError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WasmLayoutBoundaryError";
  }
}

/**
 * Type guard asserting that an unknown value received from the WASM bridge conforms
 * to the CustomLayoutResult shape.
 */
export function isCustomLayoutResult(val: unknown): val is CustomLayoutResult {
  if (typeof val !== "object" || val === null) {
    return false;
  }
  const candidate = val as Record<string, unknown>;
  return (
    Array.isArray(candidate.nodes) &&
    Array.isArray(candidate.edges) &&
    Array.isArray(candidate.badges) &&
    Array.isArray(candidate.crossings) &&
    typeof candidate.status === "string" &&
    typeof candidate.validation === "object" &&
    candidate.validation !== null
  );
}

/**
 * Validates and casts an unknown boundary payload to CustomLayoutResult.
 */
export function validateWasmLayoutResult(val: unknown): CustomLayoutResult {
  if (!isCustomLayoutResult(val)) {
    throw new WasmLayoutBoundaryError(
      "Invalid payload returned across WebAssembly layout boundary",
    );
  }
  return val;
}
