export type AgentRole =
  | "orchestrator"
  | "implementer"
  | "validator"
  | "critic"
  | "system"
  | "user"
  | "unknown"
  | (string & {});

export type ActivityState = "active" | "idle" | "busy" | "following" | "disconnected";

export interface Point2D {
  x: number;
  y: number;
}

export interface CursorPosition {
  x: number;
  y: number;
  lastUpdated: number;
  isPointerDown?: boolean;
  vx?: number;
  vy?: number;
  targetNodeId?: string | null;
  targetEdgeId?: string | null;
  targetPortId?: string | null;
}

export interface CursorTrailPoint {
  x: number;
  y: number;
  timestamp: number;
  opacity?: number;
}

export interface ViewportFrustum {
  x: number;
  y: number;
  width: number;
  height: number;
  zoom: number;
  rotation?: number;
}

export interface SelectionLock {
  id: string;
  targetType: "node" | "edge" | "region";
  targetId: string;
  agentId: string;
  agentName: string;
  role: AgentRole;
  color: string;
  acquiredAt: number;
  expiresAt: number;
  reason?: string;
  optimistic?: boolean;
  writeScope?: string[];
}

export interface AgentPresence {
  id: string;
  name: string;
  role: AgentRole;
  color: string;
  avatarUrl?: string;
  cursor: CursorPosition | null;
  viewport: ViewportFrustum | null;
  selection: string[];
  hoveredNodeId?: string | null;
  activeTaskId?: string;
  activityState: ActivityState;
  lastHeartbeat: number;
  clientInfo?: {
    userAgent?: string;
    ip?: string;
    tabId?: string;
  };
  meta?: Record<string, unknown>;
}

export interface PresenceHeartbeat {
  agentId: string;
  timestamp: number;
  name?: string;
  role?: AgentRole;
  color?: string;
  cursor?: CursorPosition | null;
  viewport?: ViewportFrustum | null;
  selection?: string[];
  hoveredNodeId?: string | null;
  activeTaskId?: string;
  activityState?: ActivityState;
  meta?: Record<string, unknown>;
}

export type ConflictType =
  | "lock_collision"
  | "selection_collision"
  | "proximity_warning"
  | "frustum_overlap";

export interface SpatialConflict {
  id: string;
  type: ConflictType;
  involvedAgentIds: string[];
  targetId?: string;
  targetType?: "node" | "edge" | "region";
  severity: "low" | "medium" | "high" | "critical";
  message: string;
  timestamp: number;
  resolved?: boolean;
}

export type LockResolutionStrategy = "first-write-wins" | "priority" | "timestamp" | "optimistic";

export interface LockInput {
  id?: string;
  targetType: "node" | "edge" | "region";
  targetId: string;
  agentId: string;
  agentName: string;
  role: AgentRole;
  color?: string;
  reason?: string;
  optimistic?: boolean;
  writeScope?: string[];
  durationMs?: number;
}

export interface LockAcquisitionResult {
  success: boolean;
  lock?: SelectionLock;
  conflict?: SpatialConflict;
  reason?: string;
}

export interface BatchLockAcquisitionResult {
  allSucceeded: boolean;
  acquiredLocks: SelectionLock[];
  rejectedLocks: Array<{
    targetId: string;
    reason: string;
    conflict?: SpatialConflict;
  }>;
}

export interface StaleEvictionResult {
  evictedAgentIds: string[];
  releasedLocksCount: number;
  idleCount: number;
  disconnectedCount: number;
  removedCount: number;
}

export interface FrustumScaleOptions {
  minZoom?: number;
  maxZoom?: number;
  clampMinDimension?: number;
  clampMaxDimension?: number;
}

export type RoleFilter =
  | "all"
  | "orchestrator"
  | "implementer"
  | "validator"
  | "critic"
  | "system"
  | "user";

export interface NodeBoundingBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CollaborationOverlayProps {
  containerWidth?: number;
  containerHeight?: number;
  zoomLevel?: number;
  panOffset?: Point2D;
  nodes?: NodeBoundingBox[];
  className?: string;
  onNodeFocus?: (nodeId: string) => void;
  onFollowChange?: (agentId: string | null) => void;
  readOnly?: boolean;
}

export interface CollaboratorHUDProps {
  className?: string;
  position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
  collapsible?: boolean;
  onAgentClick?: (agent: AgentPresence) => void;
}

export interface CursorItemProps {
  presence: AgentPresence;
  trailPoints?: CursorTrailPoint[];
  isSelf?: boolean;
  showTrail?: boolean;
  onClick?: (agentId: string) => void;
}

export interface PresenceBadgeProps {
  presence: AgentPresence;
  size?: "sm" | "md" | "lg";
  showRole?: boolean;
  showStatusDot?: boolean;
  isFollowing?: boolean;
  onFollowToggle?: (agentId: string) => void;
  onClick?: (agent: AgentPresence) => void;
}
