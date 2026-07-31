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
  severity: "error" | "warning";
  message: string;
  ids: string[];
}

export interface NormalizedNode {
  id: string;
  label?: string;
  width: number;
  height: number;
}

export interface NormalizedEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  isCycle?: boolean;
  layoutRole?: EdgeLayoutHint;
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
    | "crossing-channel";
}

export type SearchStopReason =
  | "objective-target"
  | "frontier-exhausted"
  | "layout-state-budget"
  | "route-state-budget"
  | "badge-state-budget"
  | "conflict-permutation-budget"
  | "deadline-exceeded"
  | "cancelled"
  | "repeated-logical-state"
  | "hard-failure";

export interface LayoutMetrics {
  nodeNodeOverlaps: number;
  edgeNodePenetrations: number;
  sharedEdgeSegmentLength: number;
  badgeNodeOverlaps: number;
  badgeBadgeOverlaps: number;
  badgeUnrelatedEdgeOverlaps: number;
  crossingCount: number;
  bendCount: number;
  totalLength: number;
  directionDeviationPenalty: number;
  portSideReusePenalty: number;
  totalArea: number;
  ordinaryLeaderCount?: number;
  feedbackLeaderCount?: number;
  totalLeaderLength?: number;
  hairpinCount?: number;
  portSideImbalance?: number;
  avoidableHairpinCount?: number;
  excessBendCount?: number;
  maximumOrdinaryEdgeBends?: number;
  maximumFeedbackEdgeBends?: number;
}

export interface OptimizationStats {
  globalPasses: number;
  evaluatedPortStates: number;
  spacingExpansions: number;
  repeatedStateStop: boolean;
  totalPasses?: number;
  totalEvaluatedStates?: number;
  visitedStateHashes?: number;
  durationMs?: number;
  evaluatedLayoutStates?: number;
  generatedNeighborStates?: number;
  routeSearchCalls?: number;
  aStarExpandedStates?: number;
  routeCacheHits?: number;
  stateCacheHits?: number;
  stopReason?: SearchStopReason;
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
  nodeNodeOverlaps: number;
  edgeNodePenetrations: number;
  sharedEdgeSegmentLength: number;
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
  status: "success" | "unresolved_soft_conflicts" | "invalid_hard_failure";
  optimizationStats?: OptimizationStats;
  nodePositions?: Map<string, Point>;
  rankBandMap?: Map<number, { topY: number; height: number; centerY: number }>;
  boundingBox?: Rect;
}

