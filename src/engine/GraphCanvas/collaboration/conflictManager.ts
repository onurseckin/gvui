import { getRolePriority } from "../../../store/usePresenceStore";
import type {
  AgentPresence,
  FrustumScaleOptions,
  LockResolutionStrategy,
  NodeBoundingBox,
  Point2D,
  SelectionLock,
  SpatialConflict,
  ViewportFrustum,
} from "./types";

export interface CanAcquireLockResult {
  allowed: boolean;
  reason?: string;
  existingLock?: SelectionLock;
  override?: boolean;
}

export interface LockResolutionResult {
  winner: SelectionLock;
  loser: SelectionLock;
  reason: string;
}

export interface RectBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_PROXIMITY_THRESHOLD = 90; // Graph units (pixels)
export const MIN_SAFE_ZOOM = 0.001;
export const MAX_SAFE_ZOOM = 1000.0;
export const MIN_SAFE_FRUSTUM_DIMENSION = 1.0;
export const MAX_SAFE_FRUSTUM_DIMENSION = 10000000.0;

/**
 * Validates if an agent can acquire a lock on a target according to existing locks and strategy.
 * Handles simultaneous lock contention and strategy-based override resolution.
 */
export function canAcquireLock(
  targetId: string,
  requestingAgent: {
    id: string;
    name: string;
    role?: string;
    acquiredAt?: number;
    optimistic?: boolean;
  },
  currentLocks: Record<string, SelectionLock>,
  strategy: LockResolutionStrategy = "priority",
  currentTime: number = Date.now(),
): CanAcquireLockResult {
  const existingLock = currentLocks[targetId];

  // If no lock exists or it is expired, allowed immediately
  if (!existingLock || existingLock.expiresAt <= currentTime) {
    return { allowed: true };
  }

  // If already owned by requesting agent, allow renewal/re-acquisition
  if (existingLock.agentId === requestingAgent.id) {
    return { allowed: true, existingLock };
  }

  // If optimistic strategy, allowed with warning
  if (strategy === "optimistic" || requestingAgent.optimistic) {
    return {
      allowed: true,
      existingLock,
      reason: "Optimistic lock allowed concurrent acquisition",
    };
  }

  // Construct mock lock for requesting agent to resolve race deterministically
  const requestingLock: SelectionLock = {
    id: `req-${targetId}-${requestingAgent.id}`,
    targetType: existingLock.targetType,
    targetId,
    agentId: requestingAgent.id,
    agentName: requestingAgent.name,
    role: requestingAgent.role || "implementer",
    color: existingLock.color,
    acquiredAt: requestingAgent.acquiredAt ?? currentTime,
    expiresAt: currentTime + 10000,
  };

  // Resolve conflict using the specified strategy
  const resolution = resolveLockConflict(requestingLock, existingLock, strategy);
  if (resolution.winner.agentId === requestingAgent.id) {
    return {
      allowed: true,
      existingLock,
      override: true,
      reason: resolution.reason,
    };
  }

  return {
    allowed: false,
    existingLock,
    reason: `Target is locked by ${existingLock.agentName} (${existingLock.role}): ${resolution.reason}`,
  };
}

/**
 * Resolves a conflict between two competing locks based on resolution strategy.
 * Guarantees a deterministic winner in simultaneous race conditions with zero deadlock.
 */
export function resolveLockConflict(
  lockA: SelectionLock,
  lockB: SelectionLock,
  strategy: LockResolutionStrategy = "priority",
): LockResolutionResult {
  // Deterministic tie-breaker for identical timestamps and priorities
  const tieBreakWinner = (reasonSuffix: string): LockResolutionResult => {
    if (lockA.agentId.localeCompare(lockB.agentId) <= 0) {
      return {
        winner: lockA,
        loser: lockB,
        reason: `Deterministic tie-breaker favored ${lockA.agentName} (${lockA.agentId} <= ${lockB.agentId}) [${reasonSuffix}]`,
      };
    }
    return {
      winner: lockB,
      loser: lockA,
      reason: `Deterministic tie-breaker favored ${lockB.agentName} (${lockB.agentId} < ${lockA.agentId}) [${reasonSuffix}]`,
    };
  };

  if (strategy === "priority") {
    const priorityA = getRolePriority(lockA.role);
    const priorityB = getRolePriority(lockB.role);

    if (priorityA > priorityB) {
      return {
        winner: lockA,
        loser: lockB,
        reason: `Agent ${lockA.agentName} (${lockA.role}: priority ${priorityA}) has higher priority than ${lockB.agentName} (${lockB.role}: priority ${priorityB})`,
      };
    }
    if (priorityB > priorityA) {
      return {
        winner: lockB,
        loser: lockA,
        reason: `Agent ${lockB.agentName} (${lockB.role}: priority ${priorityB}) has higher priority than ${lockA.agentName} (${lockA.role}: priority ${priorityA})`,
      };
    }

    // Same priority -> tie-break with earliest timestamp
    if (lockA.acquiredAt < lockB.acquiredAt) {
      return {
        winner: lockA,
        loser: lockB,
        reason: `Equal priority (${lockA.role}); ${lockA.agentName} acquired earlier (${lockA.acquiredAt} < ${lockB.acquiredAt})`,
      };
    }
    if (lockB.acquiredAt < lockA.acquiredAt) {
      return {
        winner: lockB,
        loser: lockA,
        reason: `Equal priority (${lockB.role}); ${lockB.agentName} acquired earlier (${lockB.acquiredAt} < ${lockA.acquiredAt})`,
      };
    }

    return tieBreakWinner(
      `equal priority ${priorityA} and identical timestamp ${lockA.acquiredAt}`,
    );
  }

  if (strategy === "timestamp") {
    // Latest timestamp wins (LWW)
    if (lockA.acquiredAt > lockB.acquiredAt) {
      return {
        winner: lockA,
        loser: lockB,
        reason: `Lock by ${lockA.agentName} acquired more recently (${lockA.acquiredAt} > ${lockB.acquiredAt})`,
      };
    }
    if (lockB.acquiredAt > lockA.acquiredAt) {
      return {
        winner: lockB,
        loser: lockA,
        reason: `Lock by ${lockB.agentName} acquired more recently (${lockB.acquiredAt} > ${lockA.acquiredAt})`,
      };
    }

    // Equal timestamp -> priority tie-break
    const priorityA = getRolePriority(lockA.role);
    const priorityB = getRolePriority(lockB.role);
    if (priorityA > priorityB) {
      return {
        winner: lockA,
        loser: lockB,
        reason: `Identical timestamp; ${lockA.agentName} has higher priority (${lockA.role} > ${lockB.role})`,
      };
    }
    if (priorityB > priorityA) {
      return {
        winner: lockB,
        loser: lockA,
        reason: `Identical timestamp; ${lockB.agentName} has higher priority (${lockB.role} > ${lockA.role})`,
      };
    }

    return tieBreakWinner(`identical timestamp ${lockA.acquiredAt} and equal priority`);
  }

  // Default and "first-write-wins": earliest acquiredAt wins
  if (lockA.acquiredAt < lockB.acquiredAt) {
    return {
      winner: lockA,
      loser: lockB,
      reason: `Lock by ${lockA.agentName} acquired earlier (${lockA.acquiredAt} < ${lockB.acquiredAt})`,
    };
  }
  if (lockB.acquiredAt < lockA.acquiredAt) {
    return {
      winner: lockB,
      loser: lockA,
      reason: `Lock by ${lockB.agentName} acquired earlier (${lockB.acquiredAt} < ${lockA.acquiredAt})`,
    };
  }

  // Identical timestamp -> priority tie-break
  const priorityA = getRolePriority(lockA.role);
  const priorityB = getRolePriority(lockB.role);
  if (priorityA > priorityB) {
    return {
      winner: lockA,
      loser: lockB,
      reason: `Identical timestamp; ${lockA.agentName} has higher priority (${lockA.role} > ${lockB.role})`,
    };
  }
  if (priorityB > priorityA) {
    return {
      winner: lockB,
      loser: lockA,
      reason: `Identical timestamp; ${lockB.agentName} has higher priority (${lockB.role} > ${lockA.role})`,
    };
  }

  return tieBreakWinner(`identical timestamp ${lockA.acquiredAt} and equal priority`);
}

/**
 * Resolves simultaneous lock requests from multiple agents competing for the same resource.
 * Produces exactly one deterministic winner and an array of rejected requests.
 */
export function resolveSimultaneousLockRequests(
  requests: SelectionLock[],
  strategy: LockResolutionStrategy = "priority",
): { winner: SelectionLock | null; rejected: SelectionLock[] } {
  if (requests.length === 0) {
    return { winner: null, rejected: [] };
  }
  if (requests.length === 1) {
    return { winner: requests[0], rejected: [] };
  }

  // Progressively tournament-sort to find the ultimate winner
  let currentWinner = requests[0];
  const rejected: SelectionLock[] = [];

  for (let i = 1; i < requests.length; i++) {
    const candidate = requests[i];
    const resolution = resolveLockConflict(currentWinner, candidate, strategy);
    if (resolution.winner === candidate) {
      rejected.push(currentWinner);
      currentWinner = candidate;
    } else {
      rejected.push(candidate);
    }
  }

  return { winner: currentWinner, rejected };
}

/**
 * Scales a viewport frustum under extreme canvas zoom levels with safety clamping.
 * Safeguards against 0, negative, NaN, and Infinity zoom levels.
 */
export function scaleFrustumForZoom(
  frustum: ViewportFrustum,
  zoomFactor: number,
  options?: FrustumScaleOptions,
): ViewportFrustum {
  const minZoom = options?.minZoom ?? MIN_SAFE_ZOOM;
  const maxZoom = options?.maxZoom ?? MAX_SAFE_ZOOM;
  const minDim = options?.clampMinDimension ?? MIN_SAFE_FRUSTUM_DIMENSION;
  const maxDim = options?.clampMaxDimension ?? MAX_SAFE_FRUSTUM_DIMENSION;

  const validZoom =
    Number.isFinite(zoomFactor) && zoomFactor > 0
      ? Math.max(minZoom, Math.min(maxZoom, zoomFactor))
      : 1.0;

  const baseWidth = Number.isFinite(frustum.width) && frustum.width > 0 ? frustum.width : minDim;
  const baseHeight =
    Number.isFinite(frustum.height) && frustum.height > 0 ? frustum.height : minDim;
  const baseX = Number.isFinite(frustum.x) ? frustum.x : 0;
  const baseY = Number.isFinite(frustum.y) ? frustum.y : 0;

  const scaledWidth = Math.max(minDim, Math.min(maxDim, baseWidth / validZoom));
  const scaledHeight = Math.max(minDim, Math.min(maxDim, baseHeight / validZoom));

  return {
    x: baseX,
    y: baseY,
    width: scaledWidth,
    height: scaledHeight,
    zoom: validZoom,
    rotation: frustum.rotation ?? 0,
  };
}

/**
 * Converts screen-space viewport bounds to graph-space frustum under any canvas zoom level.
 */
export function screenToGraphFrustum(
  screenRect: { width: number; height: number; x?: number; y?: number },
  panOffset: Point2D,
  zoomLevel: number,
  options?: FrustumScaleOptions,
): ViewportFrustum {
  const minZoom = options?.minZoom ?? MIN_SAFE_ZOOM;
  const maxZoom = options?.maxZoom ?? MAX_SAFE_ZOOM;
  const minDim = options?.clampMinDimension ?? MIN_SAFE_FRUSTUM_DIMENSION;
  const maxDim = options?.clampMaxDimension ?? MAX_SAFE_FRUSTUM_DIMENSION;

  const safeZoom =
    Number.isFinite(zoomLevel) && zoomLevel > 0
      ? Math.max(minZoom, Math.min(maxZoom, zoomLevel))
      : 1.0;

  const screenX = screenRect.x ?? 0;
  const screenY = screenRect.y ?? 0;
  const screenW = Math.max(1, screenRect.width);
  const screenH = Math.max(1, screenRect.height);

  const graphX = (screenX - panOffset.x) / safeZoom;
  const graphY = (screenY - panOffset.y) / safeZoom;
  const graphW = Math.max(minDim, Math.min(maxDim, screenW / safeZoom));
  const graphH = Math.max(minDim, Math.min(maxDim, screenH / safeZoom));

  return {
    x: graphX,
    y: graphY,
    width: graphW,
    height: graphH,
    zoom: safeZoom,
  };
}

/**
 * Converts graph-space frustum to screen-space coordinates under canvas zoom and pan.
 */
export function graphToScreenFrustum(
  graphFrustum: ViewportFrustum,
  panOffset: Point2D,
  zoomLevel: number,
): ViewportFrustum {
  const safeZoom = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1.0;
  const screenX = graphFrustum.x * safeZoom + panOffset.x;
  const screenY = graphFrustum.y * safeZoom + panOffset.y;
  const screenW = graphFrustum.width * safeZoom;
  const screenH = graphFrustum.height * safeZoom;

  return {
    x: screenX,
    y: screenY,
    width: screenW,
    height: screenH,
    zoom: safeZoom,
    rotation: graphFrustum.rotation,
  };
}

/**
 * Checks if a point is within a frustum rectangle with extreme zoom tolerance.
 */
export function isPointInFrustum(
  point: Point2D,
  frustum: ViewportFrustum,
  tolerance: number = 1e-4,
): boolean {
  if (
    !Number.isFinite(frustum.width) ||
    frustum.width <= 0 ||
    !Number.isFinite(frustum.height) ||
    frustum.height <= 0
  ) {
    return false;
  }

  return (
    point.x >= frustum.x - tolerance &&
    point.x <= frustum.x + frustum.width + tolerance &&
    point.y >= frustum.y - tolerance &&
    point.y <= frustum.y + frustum.height + tolerance
  );
}

/**
 * Checks if a node bounding box intersects with a viewport frustum.
 */
export function isNodeInFrustum(
  node: NodeBoundingBox,
  frustum: ViewportFrustum,
  tolerance: number = 1e-4,
): boolean {
  if (
    !Number.isFinite(frustum.width) ||
    frustum.width <= 0 ||
    !Number.isFinite(frustum.height) ||
    frustum.height <= 0 ||
    !Number.isFinite(node.width) ||
    node.width <= 0 ||
    !Number.isFinite(node.height) ||
    node.height <= 0
  ) {
    return false;
  }

  return !(
    node.x + node.width < frustum.x - tolerance ||
    node.x > frustum.x + frustum.width + tolerance ||
    node.y + node.height < frustum.y - tolerance ||
    node.y > frustum.y + frustum.height + tolerance
  );
}

/**
 * Checks if two frustums overlap in 2D space.
 */
export function checkFrustumOverlap(
  frustumA: ViewportFrustum,
  frustumB: ViewportFrustum,
  tolerance: number = 1e-4,
): boolean {
  if (
    !Number.isFinite(frustumA.width) ||
    frustumA.width <= 0 ||
    !Number.isFinite(frustumA.height) ||
    frustumA.height <= 0 ||
    !Number.isFinite(frustumB.width) ||
    frustumB.width <= 0 ||
    !Number.isFinite(frustumB.height) ||
    frustumB.height <= 0
  ) {
    return false;
  }

  return !(
    frustumA.x + frustumA.width < frustumB.x - tolerance ||
    frustumA.x > frustumB.x + frustumB.width + tolerance ||
    frustumA.y + frustumA.height < frustumB.y - tolerance ||
    frustumA.y > frustumB.y + frustumB.height + tolerance
  );
}

/**
 * Calculates the bounding rectangle of two overlapping frustums. Returns null if they do not intersect.
 */
export function calculateFrustumIntersection(
  frustumA: ViewportFrustum,
  frustumB: ViewportFrustum,
): RectBounds | null {
  if (!checkFrustumOverlap(frustumA, frustumB)) {
    return null;
  }

  const x1 = Math.max(frustumA.x, frustumB.x);
  const y1 = Math.max(frustumA.y, frustumB.y);
  const x2 = Math.min(frustumA.x + frustumA.width, frustumB.x + frustumB.width);
  const y2 = Math.min(frustumA.y + frustumA.height, frustumB.y + frustumB.height);

  const width = x2 - x1;
  const height = y2 - y1;

  if (width <= 0 || height <= 0) {
    return null;
  }

  return { x: x1, y: y1, width, height };
}

/**
 * Calculates Euclidean distance between two 2D points.
 */
export function calculateDistance(pointA: Point2D, pointB: Point2D): number {
  const dx = pointA.x - pointB.x;
  const dy = pointA.y - pointB.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Detects proximity conflicts when agents are operating in close proximity.
 */
export function detectProximityConflicts(
  presences: AgentPresence[],
  thresholdDistance: number = DEFAULT_PROXIMITY_THRESHOLD,
  now: number = Date.now(),
): SpatialConflict[] {
  const conflicts: SpatialConflict[] = [];
  const activePresences = presences.filter((p) => p.cursor && p.activityState !== "disconnected");

  for (let i = 0; i < activePresences.length; i++) {
    for (let j = i + 1; j < activePresences.length; j++) {
      const p1 = activePresences[i];
      const p2 = activePresences[j];
      if (!p1.cursor || !p2.cursor) continue;

      const dist = calculateDistance(p1.cursor, p2.cursor);
      if (dist < thresholdDistance) {
        // High severity if targeting the same node or both dragging/clicking
        const sameTarget =
          Boolean(p1.cursor.targetNodeId) && p1.cursor.targetNodeId === p2.cursor.targetNodeId;
        const bothInteracting = p1.cursor.isPointerDown && p2.cursor.isPointerDown;

        let severity: SpatialConflict["severity"] = "low";
        if (sameTarget && bothInteracting) {
          severity = "critical";
        } else if (sameTarget || bothInteracting) {
          severity = "high";
        } else if (dist < thresholdDistance * 0.5) {
          severity = "medium";
        }

        conflicts.push({
          id: `prox-${p1.id}-${p2.id}-${Math.floor(now / 1000)}`,
          type: "proximity_warning",
          involvedAgentIds: [p1.id, p2.id],
          targetId: p1.cursor.targetNodeId ?? p2.cursor.targetNodeId ?? undefined,
          targetType: "node",
          severity,
          message: `Agents ${p1.name} and ${p2.name} are in close proximity (${Math.round(dist)}px)${
            sameTarget ? ` on node ${p1.cursor.targetNodeId}` : ""
          }`,
          timestamp: now,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Scans all active presences, selections, and locks for spatial conflicts.
 */
export function detectSpatialConflicts(
  presences: AgentPresence[],
  selectionLocks: Record<string, SelectionLock>,
  proximityThreshold: number = DEFAULT_PROXIMITY_THRESHOLD,
  now: number = Date.now(),
): SpatialConflict[] {
  const conflicts: SpatialConflict[] = [];

  // 1. Proximity conflicts
  conflicts.push(...detectProximityConflicts(presences, proximityThreshold, now));

  // 2. Selection collisions (multiple agents selecting the same node)
  const nodeSelectionMap = new Map<string, string[]>();
  for (const presence of presences) {
    if (presence.activityState === "disconnected") continue;
    for (const nodeId of presence.selection) {
      const list = nodeSelectionMap.get(nodeId) || [];
      list.push(presence.id);
      nodeSelectionMap.set(nodeId, list);
    }
  }

  for (const [nodeId, agentIds] of nodeSelectionMap.entries()) {
    if (agentIds.length > 1) {
      const names = agentIds.map((id) => presences.find((p) => p.id === id)?.name || id).join(", ");
      conflicts.push({
        id: `sel-collision-${nodeId}-${now}`,
        type: "selection_collision",
        involvedAgentIds: agentIds,
        targetId: nodeId,
        targetType: "node",
        severity: "medium",
        message: `Multiple agents (${names}) selected node "${nodeId}" simultaneously`,
        timestamp: now,
      });
    }
  }

  // 3. Selection on locked node collision
  for (const presence of presences) {
    if (presence.activityState === "disconnected") continue;
    for (const nodeId of presence.selection) {
      const lock = selectionLocks[nodeId];
      if (lock && lock.expiresAt > now && lock.agentId !== presence.id) {
        conflicts.push({
          id: `lock-collision-${nodeId}-${presence.id}-${now}`,
          type: "lock_collision",
          involvedAgentIds: [lock.agentId, presence.id],
          targetId: nodeId,
          targetType: "node",
          severity: "high",
          message: `Agent ${presence.name} selected node "${nodeId}" currently locked by ${lock.agentName}`,
          timestamp: now,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Finds all agents whose viewport frustum currently contains the specified node.
 */
export function findAgentsViewingNode(
  node: NodeBoundingBox,
  presences: AgentPresence[],
): AgentPresence[] {
  return presences.filter(
    (presence) =>
      presence.activityState !== "disconnected" &&
      presence.viewport !== null &&
      isNodeInFrustum(node, presence.viewport),
  );
}

/**
 * Finds all agents within a given radius from a position.
 */
export function findAgentsNearPosition(
  pos: Point2D,
  presences: AgentPresence[],
  radius: number,
): AgentPresence[] {
  return presences.filter((presence) => {
    if (presence.activityState === "disconnected") return false;
    if (!presence.cursor) return false;
    return calculateDistance(pos, presence.cursor) <= radius;
  });
}
