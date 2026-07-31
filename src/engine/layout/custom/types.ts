export type Side = "top" | "right" | "bottom" | "left";
export type AxisDirection = "horizontal" | "vertical";
export type EdgeRole = "forward" | "cross" | "feedback" | "self";
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
}

export interface OccupancyRecord {
  edgeId: string;
  segment: Segment;
}

export interface BadgeCandidate {
  point: Point;
  rect: Rect;
  score: number;
}

export interface BadgePlacement {
  edgeId: string;
  label: string;
  rect: Rect;
  anchorPoint: Point;
}

export interface EdgeCrossing {
  edgeIdA: string;
  edgeIdB: string;
  point: Point;
}

export interface LayoutValidationResult {
  isValid: boolean;
  diagnostics: LayoutDiagnostic[];
  metrics: LayoutMetrics;
}

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
}

export interface CustomLayoutResult {
  nodes: (NormalizedNode & Point)[];
  edges: RoutedPath[];
  badges: BadgePlacement[];
  crossings: EdgeCrossing[];
  validation: LayoutValidationResult;
  status: "success" | "unresolved_soft_conflicts" | "invalid_hard_failure";
}
