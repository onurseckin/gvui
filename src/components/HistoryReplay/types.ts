import type { GraphDataset, GraphEdgeData, GraphNodeData, NodeStatus } from "../../types/graphData";

/**
 * Supported playback speeds.
 */
export type ReplaySpeed = 0.5 | 1 | 2 | 5;

/**
 * Bookmark category types.
 */
export type BookmarkCategory = "failure" | "critic" | "milestone" | "custom";

/**
 * Normalized Replay Event representation.
 */
export interface ReplayEvent {
  id: string;
  sequence: number;
  timestamp: string;
  kind: string;
  actor: string;
  payload: Record<string, unknown>;
  projection?: Record<string, unknown>;
  raw?: string;
  isFailure: boolean;
  isCritic: boolean;
  isMilestone: boolean;
  summary?: string;
  tags?: string[];
}

/**
 * Active lease record in history snapshot.
 */
export interface ReplayLeaseInfo {
  taskId: string;
  agentId: string;
  role?: string;
  issuedAt?: string;
  expiresAt?: string;
  tokenDigest?: string;
  writeScope?: string[];
  status?: string;
}

/**
 * Task record reconstructed at a specific point in time.
 */
export interface ReplayTaskInfo {
  id: string;
  label: string;
  status: NodeStatus | string;
  priority?: number;
  effort?: number;
  actor?: string;
  writeScope?: string[];
  lease?: ReplayLeaseInfo | null;
  requirementIds?: string[];
  artifactIds?: string[];
}

/**
 * Complete reconstructed execution state at event index T.
 */
export interface ReplayStateSnapshot {
  eventIndex: number;
  event: ReplayEvent;
  dataset: GraphDataset;
  tasks: Record<string, ReplayTaskInfo>;
  leases: Record<string, ReplayLeaseInfo>;
  activeAgents: string[];
  failedEntities: string[];
  summary: {
    totalNodes: number;
    totalEdges: number;
    activeLeases: number;
    completedTasks: number;
    failedTasks: number;
    runningTasks: number;
    pendingTasks: number;
  };
}

/**
 * Bookmark record with metadata.
 */
export interface ReplayBookmark {
  id: string;
  eventIndex: number;
  sequence: number;
  category: BookmarkCategory;
  label: string;
  note?: string;
  timestamp: string;
  actor?: string;
  kind?: string;
  isCustom?: boolean;
}

/**
 * Property difference between two entities.
 */
export interface PropertyDelta {
  entityId: string;
  entityType: "node" | "edge" | "task" | "lease";
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * Node modification delta.
 */
export interface NodeDelta {
  nodeId: string;
  before: GraphNodeData;
  after: GraphNodeData;
  statusChanged: boolean;
  fromStatus?: NodeStatus;
  toStatus?: NodeStatus;
  changedFields: string[];
}

/**
 * Edge modification delta.
 */
export interface EdgeDelta {
  edgeId: string;
  before: GraphEdgeData;
  after: GraphEdgeData;
  changedFields: string[];
}

/**
 * State diff between two event indices.
 */
export interface StateDiffResult {
  indexA: number;
  indexB: number;
  sequenceA: number;
  sequenceB: number;
  addedNodes: GraphNodeData[];
  removedNodes: GraphNodeData[];
  modifiedNodes: NodeDelta[];
  addedEdges: GraphEdgeData[];
  removedEdges: GraphEdgeData[];
  modifiedEdges: EdgeDelta[];
  addedLeases: ReplayLeaseInfo[];
  releasedLeases: ReplayLeaseInfo[];
  propertyChanges: PropertyDelta[];
  summary: {
    nodesAdded: number;
    nodesRemoved: number;
    nodesModified: number;
    edgesAdded: number;
    edgesRemoved: number;
    edgesModified: number;
    leasesGranted: number;
    leasesReleased: number;
    totalChanges: number;
  };
}

/**
 * Parse warning or error log for malformed JSONL lines.
 */
export interface JsonlParseIssue {
  lineIndex: number;
  rawText: string;
  error: string;
}

/**
 * Result of parsing events.jsonl.
 */
export interface ParseEventsResult {
  events: ReplayEvent[];
  issues: JsonlParseIssue[];
  totalParsed: number;
  totalErrors: number;
}
