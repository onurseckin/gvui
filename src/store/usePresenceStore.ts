import { create } from "zustand";
import { canAcquireLock } from "../engine/GraphCanvas/collaboration/conflictManager";
import type {
  ActivityState,
  AgentPresence,
  AgentRole,
  BatchLockAcquisitionResult,
  CursorPosition,
  CursorTrailPoint,
  LockAcquisitionResult,
  LockInput,
  LockResolutionStrategy,
  Point2D,
  PresenceHeartbeat,
  RoleFilter,
  SelectionLock,
  SpatialConflict,
  StaleEvictionResult,
  ViewportFrustum,
} from "../engine/GraphCanvas/collaboration/types";

export const ROLE_COLORS: Record<string, string> = {
  orchestrator: "#a855f7",
  implementer: "#38bdf8",
  validator: "#f59e0b",
  critic: "#ec4899",
  system: "#71717a",
  user: "#10b981",
  unknown: "#6366f1",
};

export const ROLE_PRIORITIES: Record<string, number> = {
  orchestrator: 5,
  validator: 4,
  critic: 3,
  implementer: 2,
  user: 1,
  system: 1,
  unknown: 0,
};

export function getRoleColor(role?: AgentRole): string {
  if (!role) return ROLE_COLORS.unknown;
  const key = role.toLowerCase();
  return ROLE_COLORS[key] ?? ROLE_COLORS.unknown;
}

export function getRolePriority(role?: AgentRole): number {
  if (!role) return 0;
  const key = role.toLowerCase();
  return ROLE_PRIORITIES[key] ?? 0;
}

export function inferPresenceRole(agentId?: string, explicitRole?: AgentRole): AgentRole {
  if (explicitRole && explicitRole !== "unknown") {
    return explicitRole;
  }
  if (!agentId || typeof agentId !== "string") {
    return "implementer";
  }
  const idLower = agentId.toLowerCase();
  if (
    idLower.includes("orchestrator") ||
    idLower.includes("meta") ||
    idLower.includes("coord") ||
    idLower.includes("root")
  ) {
    return "orchestrator";
  }
  if (idLower.includes("critic") || idLower.includes("review") || idLower.includes("eval")) {
    return "critic";
  }
  if (
    idLower.includes("validator") ||
    idLower.includes("val-") ||
    idLower.includes("-val") ||
    idLower.includes("val_") ||
    idLower.includes("audit")
  ) {
    return "validator";
  }
  if (idLower.includes("system") || idLower.includes("daemon") || idLower.includes("cron")) {
    return "system";
  }
  if (idLower.includes("user") || idLower.includes("human")) {
    return "user";
  }
  return "implementer";
}

export interface PresenceState {
  presences: Record<string, AgentPresence>;
  selfAgentId: string | null;
  followedAgentId: string | null;
  selectionLocks: Record<string, SelectionLock>;
  cursorTrails: Record<string, CursorTrailPoint[]>;
  conflicts: SpatialConflict[];

  // Visibility Toggles
  showCursors: boolean;
  showFrustums: boolean;
  showSelectionRings: boolean;
  showLockBadges: boolean;
  showActivityTrails: boolean;
  showCollaboratorHUD: boolean;
  showProximityWarnings: boolean;

  // Filters & Timeouts
  filterRole: RoleFilter;
  searchQuery: string;
  idleTimeoutMs: number;
  disconnectTimeoutMs: number;
  heartbeatTimeoutMs: number;
  lockTtlMs: number;
  trailMaxPoints: number;
  trailDurationMs: number;
  lockResolutionStrategy: LockResolutionStrategy;
}

export interface PresenceActions {
  // Presence Management
  registerPresence: (presence: Partial<AgentPresence> & { id: string; name: string }) => void;
  updatePresence: (agentId: string, patch: Partial<AgentPresence>) => void;
  removePresence: (agentId: string) => void;
  clearAllPresences: () => void;
  receiveHeartbeat: (heartbeat: PresenceHeartbeat) => void;

  // Real-time Canvas Updates
  updateCursor: (
    agentId: string,
    position: {
      x: number;
      y: number;
      isPointerDown?: boolean;
      targetNodeId?: string | null;
      targetEdgeId?: string | null;
      targetPortId?: string | null;
    },
  ) => void;
  updateViewport: (agentId: string, viewport: ViewportFrustum) => void;
  updateSelection: (agentId: string, selection: string[]) => void;
  setHoveredNode: (agentId: string, nodeId: string | null) => void;

  // Local Agent Controls
  setSelfAgentId: (id: string | null) => void;
  setFollowedAgentId: (id: string | null) => void;

  // Locks & Conflicts
  acquireLock: (lockInput: LockInput) => LockAcquisitionResult;
  acquireLocks: (requests: LockInput[], atomic?: boolean) => BatchLockAcquisitionResult;
  releaseLock: (targetId: string, agentId?: string) => boolean;
  renewLock: (targetId: string, agentId: string, durationMs?: number) => boolean;
  clearExpiredLocks: (currentTime?: number) => number;
  clearAllLocks: () => void;
  setLockResolutionStrategy: (strategy: LockResolutionStrategy) => void;

  // Maintenance & Pruning
  pruneInactivePresences: (currentTime?: number) => StaleEvictionResult;
  evictStalePresences: (staleThresholdMs?: number, currentTime?: number) => StaleEvictionResult;
  pruneCursorTrails: (currentTime?: number) => void;

  // UI Toggles & Filters
  toggleShowCursors: () => void;
  toggleShowFrustums: () => void;
  toggleShowSelectionRings: () => void;
  toggleShowLockBadges: () => void;
  toggleShowActivityTrails: () => void;
  toggleShowCollaboratorHUD: () => void;
  toggleShowProximityWarnings: () => void;
  setFilterRole: (filter: RoleFilter) => void;
  setSearchQuery: (query: string) => void;
  setIdleTimeoutMs: (timeoutMs: number) => void;
  setDisconnectTimeoutMs: (timeoutMs: number) => void;
  setHeartbeatTimeoutMs: (timeoutMs: number) => void;
  setLockTtlMs: (ttlMs: number) => void;

  // Conflicts
  addConflict: (conflict: SpatialConflict) => void;
  resolveConflict: (conflictId: string) => void;
  clearConflicts: () => void;

  // Selectors / Queries
  getVisiblePresences: (currentTime?: number) => AgentPresence[];
  getLocksForNode: (nodeId: string, currentTime?: number) => SelectionLock | null;
  isNodeLockedByOther: (nodeId: string, currentAgentId?: string, currentTime?: number) => boolean;
  getFollowedAgent: () => AgentPresence | null;
  getInterpolatedCursor: (agentId: string, alpha?: number) => Point2D | null;
  getConflictList: () => SpatialConflict[];
}

export type PresenceStore = PresenceState & PresenceActions;

export const INITIAL_PRESENCE_STATE: PresenceState = {
  presences: {},
  selfAgentId: null,
  followedAgentId: null,
  selectionLocks: {},
  cursorTrails: {},
  conflicts: [],
  showCursors: true,
  showFrustums: true,
  showSelectionRings: true,
  showLockBadges: true,
  showActivityTrails: true,
  showCollaboratorHUD: true,
  showProximityWarnings: true,
  filterRole: "all",
  searchQuery: "",
  idleTimeoutMs: 15000,
  disconnectTimeoutMs: 60000,
  heartbeatTimeoutMs: 30000,
  lockTtlMs: 15000,
  trailMaxPoints: 12,
  trailDurationMs: 800,
  lockResolutionStrategy: "priority",
};

export const usePresenceStore = create<PresenceStore>((set, get) => ({
  ...INITIAL_PRESENCE_STATE,

  registerPresence: (presenceInput) => {
    const now = Date.now();
    const role = inferPresenceRole(presenceInput.id, presenceInput.role);
    const color = presenceInput.color ?? getRoleColor(role);

    set((state) => {
      const existing = state.presences[presenceInput.id];
      const newPresence: AgentPresence = {
        id: presenceInput.id,
        name: presenceInput.name || existing?.name || presenceInput.id,
        role,
        color,
        avatarUrl: presenceInput.avatarUrl ?? existing?.avatarUrl,
        cursor: presenceInput.cursor ?? existing?.cursor ?? null,
        viewport: presenceInput.viewport ?? existing?.viewport ?? null,
        selection: presenceInput.selection ?? existing?.selection ?? [],
        hoveredNodeId: presenceInput.hoveredNodeId ?? existing?.hoveredNodeId ?? null,
        activeTaskId: presenceInput.activeTaskId ?? existing?.activeTaskId,
        activityState: presenceInput.activityState ?? existing?.activityState ?? "active",
        lastHeartbeat: now,
        clientInfo: presenceInput.clientInfo ?? existing?.clientInfo,
        meta: { ...existing?.meta, ...presenceInput.meta },
      };

      return {
        presences: {
          ...state.presences,
          [presenceInput.id]: newPresence,
        },
      };
    });
  },

  updatePresence: (agentId, patch) => {
    set((state) => {
      const existing = state.presences[agentId];
      if (!existing) return state;

      const updated: AgentPresence = {
        ...existing,
        ...patch,
        lastHeartbeat: patch.lastHeartbeat ?? Date.now(),
        meta: patch.meta ? { ...existing.meta, ...patch.meta } : existing.meta,
      };

      return {
        presences: {
          ...state.presences,
          [agentId]: updated,
        },
      };
    });
  },

  removePresence: (agentId) => {
    set((state) => {
      const { [agentId]: _, ...remainingPresences } = state.presences;
      const { [agentId]: __, ...remainingTrails } = state.cursorTrails;

      // Also clean up any locks held by this agent
      const nextLocks: Record<string, SelectionLock> = {};
      for (const [key, lock] of Object.entries(state.selectionLocks)) {
        if (lock.agentId !== agentId) {
          nextLocks[key] = lock;
        }
      }

      return {
        presences: remainingPresences,
        cursorTrails: remainingTrails,
        selectionLocks: nextLocks,
        followedAgentId: state.followedAgentId === agentId ? null : state.followedAgentId,
      };
    });
  },

  clearAllPresences: () => {
    set({
      presences: {},
      cursorTrails: {},
      selectionLocks: {},
      conflicts: [],
      followedAgentId: null,
    });
  },

  receiveHeartbeat: (heartbeat) => {
    const now = heartbeat.timestamp || Date.now();
    const role = inferPresenceRole(heartbeat.agentId, heartbeat.role);
    const color = heartbeat.color ?? getRoleColor(role);

    set((state) => {
      const existing = state.presences[heartbeat.agentId];
      const activityState: ActivityState = heartbeat.activityState ?? "active";

      const updated: AgentPresence = {
        id: heartbeat.agentId,
        name: heartbeat.name || existing?.name || heartbeat.agentId,
        role,
        color,
        avatarUrl: existing?.avatarUrl,
        cursor: heartbeat.cursor !== undefined ? heartbeat.cursor : (existing?.cursor ?? null),
        viewport:
          heartbeat.viewport !== undefined ? heartbeat.viewport : (existing?.viewport ?? null),
        selection:
          heartbeat.selection !== undefined ? heartbeat.selection : (existing?.selection ?? []),
        hoveredNodeId:
          heartbeat.hoveredNodeId !== undefined
            ? heartbeat.hoveredNodeId
            : (existing?.hoveredNodeId ?? null),
        activeTaskId: heartbeat.activeTaskId ?? existing?.activeTaskId,
        activityState,
        lastHeartbeat: now,
        clientInfo: existing?.clientInfo,
        meta: { ...existing?.meta, ...heartbeat.meta },
      };

      return {
        presences: {
          ...state.presences,
          [heartbeat.agentId]: updated,
        },
      };
    });
  },

  updateCursor: (agentId, position) => {
    const now = Date.now();

    set((state) => {
      const existing = state.presences[agentId];
      if (!existing) return state;

      const prevCursor = existing.cursor;
      let vx = 0;
      let vy = 0;

      if (prevCursor && prevCursor.lastUpdated > 0) {
        const dt = Math.max(1, (now - prevCursor.lastUpdated) / 1000);
        vx = (position.x - prevCursor.x) / dt;
        vy = (position.y - prevCursor.y) / dt;
      }

      const nextCursor: CursorPosition = {
        x: position.x,
        y: position.y,
        lastUpdated: now,
        isPointerDown: position.isPointerDown ?? prevCursor?.isPointerDown ?? false,
        vx,
        vy,
        targetNodeId:
          position.targetNodeId !== undefined
            ? position.targetNodeId
            : (prevCursor?.targetNodeId ?? null),
        targetEdgeId:
          position.targetEdgeId !== undefined
            ? position.targetEdgeId
            : (prevCursor?.targetEdgeId ?? null),
        targetPortId:
          position.targetPortId !== undefined
            ? position.targetPortId
            : (prevCursor?.targetPortId ?? null),
      };

      // Update cursor trail
      const currentTrail = state.cursorTrails[agentId] ?? [];
      const newTrailPoint: CursorTrailPoint = {
        x: position.x,
        y: position.y,
        timestamp: now,
        opacity: 1.0,
      };

      const trailCutoff = now - state.trailDurationMs;
      const prunedTrail = [...currentTrail.filter((p) => p.timestamp >= trailCutoff), newTrailPoint]
        .slice(-state.trailMaxPoints)
        .map((p, idx, arr) => ({
          ...p,
          opacity: Math.max(0.1, (idx + 1) / arr.length),
        }));

      return {
        presences: {
          ...state.presences,
          [agentId]: {
            ...existing,
            cursor: nextCursor,
            hoveredNodeId: position.targetNodeId ?? existing.hoveredNodeId,
            activityState: "active",
            lastHeartbeat: now,
          },
        },
        cursorTrails: {
          ...state.cursorTrails,
          [agentId]: prunedTrail,
        },
      };
    });
  },

  updateViewport: (agentId, viewport) => {
    set((state) => {
      const existing = state.presences[agentId];
      if (!existing) return state;

      return {
        presences: {
          ...state.presences,
          [agentId]: {
            ...existing,
            viewport,
            lastHeartbeat: Date.now(),
          },
        },
      };
    });
  },

  updateSelection: (agentId, selection) => {
    set((state) => {
      const existing = state.presences[agentId];
      if (!existing) return state;

      return {
        presences: {
          ...state.presences,
          [agentId]: {
            ...existing,
            selection,
            lastHeartbeat: Date.now(),
          },
        },
      };
    });
  },

  setHoveredNode: (agentId, nodeId) => {
    set((state) => {
      const existing = state.presences[agentId];
      if (!existing) return state;

      return {
        presences: {
          ...state.presences,
          [agentId]: {
            ...existing,
            hoveredNodeId: nodeId,
            lastHeartbeat: Date.now(),
          },
        },
      };
    });
  },

  setSelfAgentId: (id) => set({ selfAgentId: id }),

  setFollowedAgentId: (id) => set({ followedAgentId: id }),

  acquireLock: (lockInput) => {
    const now = Date.now();
    const duration = lockInput.durationMs ?? get().lockTtlMs;
    const expiresAt = now + duration;
    const state = get();
    const existingLock = state.selectionLocks[lockInput.targetId];

    const newLock: SelectionLock = {
      id: lockInput.id || lockInput.targetId,
      targetType: lockInput.targetType,
      targetId: lockInput.targetId,
      agentId: lockInput.agentId,
      agentName: lockInput.agentName,
      role: lockInput.role,
      color: lockInput.color || getRoleColor(lockInput.role),
      acquiredAt: now,
      expiresAt,
      reason: lockInput.reason,
      optimistic: lockInput.optimistic,
      writeScope: lockInput.writeScope,
    };

    if (existingLock && existingLock.expiresAt > now) {
      // If already owned by same agent, extend/renew lock
      if (existingLock.agentId === lockInput.agentId) {
        const renewedLock: SelectionLock = {
          ...existingLock,
          ...lockInput,
          acquiredAt: existingLock.acquiredAt,
          expiresAt,
        };

        set((st) => ({
          selectionLocks: {
            ...st.selectionLocks,
            [lockInput.targetId]: renewedLock,
          },
        }));

        return { success: true, lock: renewedLock };
      }

      // Check conflict resolution strategy using robust conflict manager
      const strategy = state.lockResolutionStrategy;
      const validation = canAcquireLock(
        lockInput.targetId,
        {
          id: lockInput.agentId,
          name: lockInput.agentName,
          role: lockInput.role,
          acquiredAt: now,
          optimistic: lockInput.optimistic,
        },
        state.selectionLocks,
        strategy,
        now,
      );

      if (!validation.allowed && !lockInput.optimistic && strategy !== "optimistic") {
        const conflict: SpatialConflict = {
          id: `conflict-${lockInput.targetId}-${now}`,
          type: "lock_collision",
          involvedAgentIds: [existingLock.agentId, lockInput.agentId],
          targetId: lockInput.targetId,
          targetType: lockInput.targetType,
          severity: "high",
          message:
            validation.reason ||
            `Agent ${lockInput.agentName} (${lockInput.role}) conflicted with lock held by ${existingLock.agentName} (${existingLock.role})`,
          timestamp: now,
        };

        set((st) => ({
          conflicts: [...st.conflicts, conflict],
        }));

        return {
          success: false,
          reason:
            validation.reason ||
            `Target ${lockInput.targetId} is already locked by ${existingLock.agentName}`,
          conflict,
        };
      }

      if (validation.override) {
        const conflict: SpatialConflict = {
          id: `override-${lockInput.targetId}-${now}`,
          type: "lock_collision",
          involvedAgentIds: [existingLock.agentId, lockInput.agentId],
          targetId: lockInput.targetId,
          targetType: lockInput.targetType,
          severity: "medium",
          message: `Agent ${lockInput.agentName} (${lockInput.role}) overrode lock on ${lockInput.targetId} previously held by ${existingLock.agentName} (${existingLock.role}) [${validation.reason}]`,
          timestamp: now,
        };

        set((st) => ({
          selectionLocks: {
            ...st.selectionLocks,
            [lockInput.targetId]: newLock,
          },
          conflicts: [...st.conflicts, conflict],
        }));

        return { success: true, lock: newLock, conflict };
      }
    }

    set((st) => ({
      selectionLocks: {
        ...st.selectionLocks,
        [lockInput.targetId]: newLock,
      },
    }));

    return { success: true, lock: newLock };
  },

  acquireLocks: (requests, atomic = false) => {
    const acquiredLocks: SelectionLock[] = [];
    const rejectedLocks: Array<{
      targetId: string;
      reason: string;
      conflict?: SpatialConflict;
    }> = [];

    for (const req of requests) {
      const result = get().acquireLock(req);
      if (result.success && result.lock) {
        acquiredLocks.push(result.lock);
      } else {
        rejectedLocks.push({
          targetId: req.targetId,
          reason: result.reason || "Lock acquisition failed",
          conflict: result.conflict,
        });
      }
    }

    if (atomic && rejectedLocks.length > 0) {
      // Roll back any locks acquired in this transaction
      for (const lock of acquiredLocks) {
        get().releaseLock(lock.targetId, lock.agentId);
      }
      return {
        allSucceeded: false,
        acquiredLocks: [],
        rejectedLocks,
      };
    }

    return {
      allSucceeded: rejectedLocks.length === 0,
      acquiredLocks,
      rejectedLocks,
    };
  },

  releaseLock: (targetId, agentId) => {
    const state = get();
    const existing = state.selectionLocks[targetId];
    if (!existing) return false;

    if (agentId && existing.agentId !== agentId) {
      return false;
    }

    set((st) => {
      const { [targetId]: _, ...remainingLocks } = st.selectionLocks;
      return { selectionLocks: remainingLocks };
    });

    return true;
  },

  renewLock: (targetId, agentId, durationMs) => {
    const now = Date.now();
    const state = get();
    const existing = state.selectionLocks[targetId];

    if (!existing || existing.agentId !== agentId) {
      return false;
    }

    const duration = durationMs ?? state.lockTtlMs;
    const renewed: SelectionLock = {
      ...existing,
      expiresAt: now + duration,
    };

    set((st) => ({
      selectionLocks: {
        ...st.selectionLocks,
        [targetId]: renewed,
      },
    }));

    return true;
  },

  clearExpiredLocks: (currentTime) => {
    const now = currentTime ?? Date.now();
    let removedCount = 0;

    set((state) => {
      const validLocks: Record<string, SelectionLock> = {};
      for (const [key, lock] of Object.entries(state.selectionLocks)) {
        if (lock.expiresAt > now) {
          validLocks[key] = lock;
        } else {
          removedCount++;
        }
      }

      if (removedCount === 0) return state;
      return { selectionLocks: validLocks };
    });

    return removedCount;
  },

  clearAllLocks: () => set({ selectionLocks: {} }),

  setLockResolutionStrategy: (strategy) => set({ lockResolutionStrategy: strategy }),

  pruneInactivePresences: (currentTime) => {
    const now = currentTime ?? Date.now();
    const state = get();
    let idleCount = 0;
    let disconnectedCount = 0;
    let removedCount = 0;
    const evictedAgentIds: string[] = [];

    const nextPresences: Record<string, AgentPresence> = {};
    const deadThreshold = Math.max(state.disconnectTimeoutMs * 2, state.heartbeatTimeoutMs * 2);
    const disconnectThreshold = Math.min(state.disconnectTimeoutMs, state.heartbeatTimeoutMs);

    for (const [id, presence] of Object.entries(state.presences)) {
      const elapsed = now - presence.lastHeartbeat;

      if (elapsed >= deadThreshold) {
        // Drop completely if dead beyond timeout
        removedCount++;
        evictedAgentIds.push(id);
        continue;
      }

      if (elapsed >= disconnectThreshold) {
        disconnectedCount++;
        nextPresences[id] = {
          ...presence,
          activityState: "disconnected",
        };
      } else if (elapsed >= state.idleTimeoutMs) {
        idleCount++;
        nextPresences[id] = {
          ...presence,
          activityState: presence.activityState === "busy" ? "busy" : "idle",
        };
      } else {
        nextPresences[id] = presence;
      }
    }

    // Auto-evict associated locks and trails for completely dropped agents
    const nextTrails = { ...state.cursorTrails };
    const nextLocks = { ...state.selectionLocks };
    let releasedLocksCount = 0;

    for (const agentId of evictedAgentIds) {
      delete nextTrails[agentId];
      for (const [targetId, lock] of Object.entries(nextLocks)) {
        if (lock.agentId === agentId) {
          delete nextLocks[targetId];
          releasedLocksCount++;
        }
      }
    }

    const nextFollowed =
      state.followedAgentId && evictedAgentIds.includes(state.followedAgentId)
        ? null
        : state.followedAgentId;

    set({
      presences: nextPresences,
      cursorTrails: nextTrails,
      selectionLocks: nextLocks,
      followedAgentId: nextFollowed,
    });

    return {
      idleCount,
      disconnectedCount,
      removedCount,
      evictedAgentIds,
      releasedLocksCount,
    };
  },

  evictStalePresences: (staleThresholdMs, currentTime) => {
    const now = currentTime ?? Date.now();
    const state = get();
    const threshold = staleThresholdMs ?? state.heartbeatTimeoutMs;
    const evictedAgentIds: string[] = [];

    const nextPresences: Record<string, AgentPresence> = {};
    const nextTrails = { ...state.cursorTrails };
    const nextLocks = { ...state.selectionLocks };
    let releasedLocksCount = 0;

    for (const [id, presence] of Object.entries(state.presences)) {
      const elapsed = now - presence.lastHeartbeat;
      if (elapsed >= threshold) {
        evictedAgentIds.push(id);
        delete nextTrails[id];
        for (const [targetId, lock] of Object.entries(nextLocks)) {
          if (lock.agentId === id) {
            delete nextLocks[targetId];
            releasedLocksCount++;
          }
        }
      } else {
        nextPresences[id] = presence;
      }
    }

    const nextFollowed =
      state.followedAgentId && evictedAgentIds.includes(state.followedAgentId)
        ? null
        : state.followedAgentId;

    set({
      presences: nextPresences,
      cursorTrails: nextTrails,
      selectionLocks: nextLocks,
      followedAgentId: nextFollowed,
    });

    return {
      evictedAgentIds,
      releasedLocksCount,
      idleCount: 0,
      disconnectedCount: 0,
      removedCount: evictedAgentIds.length,
    };
  },

  pruneCursorTrails: (currentTime) => {
    const now = currentTime ?? Date.now();
    const state = get();
    const cutoff = now - state.trailDurationMs;
    const nextTrails: Record<string, CursorTrailPoint[]> = {};

    for (const [agentId, trail] of Object.entries(state.cursorTrails)) {
      const validPoints = trail.filter((p) => p.timestamp >= cutoff);
      if (validPoints.length > 0) {
        nextTrails[agentId] = validPoints.map((p, idx, arr) => ({
          ...p,
          opacity: Math.max(0.1, (idx + 1) / arr.length),
        }));
      }
    }

    set({ cursorTrails: nextTrails });
  },

  toggleShowCursors: () => set((state) => ({ showCursors: !state.showCursors })),
  toggleShowFrustums: () => set((state) => ({ showFrustums: !state.showFrustums })),
  toggleShowSelectionRings: () =>
    set((state) => ({ showSelectionRings: !state.showSelectionRings })),
  toggleShowLockBadges: () => set((state) => ({ showLockBadges: !state.showLockBadges })),
  toggleShowActivityTrails: () =>
    set((state) => ({ showActivityTrails: !state.showActivityTrails })),
  toggleShowCollaboratorHUD: () =>
    set((state) => ({ showCollaboratorHUD: !state.showCollaboratorHUD })),
  toggleShowProximityWarnings: () =>
    set((state) => ({ showProximityWarnings: !state.showProximityWarnings })),

  setFilterRole: (filterRole) => set({ filterRole }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIdleTimeoutMs: (idleTimeoutMs) => set({ idleTimeoutMs }),
  setDisconnectTimeoutMs: (disconnectTimeoutMs) => set({ disconnectTimeoutMs }),
  setHeartbeatTimeoutMs: (heartbeatTimeoutMs) => set({ heartbeatTimeoutMs }),
  setLockTtlMs: (lockTtlMs) => set({ lockTtlMs }),

  addConflict: (conflict) =>
    set((state) => ({
      conflicts: [...state.conflicts.filter((c) => c.id !== conflict.id), conflict],
    })),

  resolveConflict: (conflictId) =>
    set((state) => ({
      conflicts: state.conflicts.map((c) => (c.id === conflictId ? { ...c, resolved: true } : c)),
    })),

  clearConflicts: () => set({ conflicts: [] }),

  getVisiblePresences: (currentTime) => {
    const state = get();
    const now = currentTime ?? Date.now();
    const query = state.searchQuery.trim().toLowerCase();

    return Object.values(state.presences).filter((presence) => {
      // Role filter
      if (
        state.filterRole !== "all" &&
        presence.role.toLowerCase() !== state.filterRole.toLowerCase()
      ) {
        return false;
      }

      // Search query filter
      if (query.length > 0) {
        const nameMatch = presence.name.toLowerCase().includes(query);
        const idMatch = presence.id.toLowerCase().includes(query);
        const roleMatch = presence.role.toLowerCase().includes(query);
        const taskMatch = presence.activeTaskId?.toLowerCase().includes(query) ?? false;
        if (!nameMatch && !idMatch && !roleMatch && !taskMatch) {
          return false;
        }
      }

      // Drop dead presences past 2x disconnect timeout
      const elapsed = now - presence.lastHeartbeat;
      if (elapsed >= state.disconnectTimeoutMs * 2) {
        return false;
      }

      return true;
    });
  },

  getLocksForNode: (nodeId, currentTime) => {
    const state = get();
    const now = currentTime ?? Date.now();
    const lock = state.selectionLocks[nodeId];
    if (!lock) return null;
    if (lock.expiresAt <= now) return null;
    return lock;
  },

  isNodeLockedByOther: (nodeId, currentAgentId, currentTime) => {
    const state = get();
    const now = currentTime ?? Date.now();
    const lock = state.selectionLocks[nodeId];
    if (!lock || lock.expiresAt <= now) return false;
    const selfId = currentAgentId ?? state.selfAgentId;
    return lock.agentId !== selfId;
  },

  getFollowedAgent: () => {
    const state = get();
    if (!state.followedAgentId) return null;
    return state.presences[state.followedAgentId] ?? null;
  },

  getInterpolatedCursor: (agentId, alpha = 0.5) => {
    const state = get();
    const presence = state.presences[agentId];
    if (!presence || !presence.cursor) return null;

    const trail = state.cursorTrails[agentId];
    if (!trail || trail.length === 0) {
      return { x: presence.cursor.x, y: presence.cursor.y };
    }

    const lastPoint = trail[trail.length - 1];
    const prevPoint = trail.length > 1 ? trail[trail.length - 2] : lastPoint;

    // Linear interpolation between previous and target
    const clampedAlpha = Math.min(1, Math.max(0, alpha));
    const ix = prevPoint.x + (presence.cursor.x - prevPoint.x) * clampedAlpha;
    const iy = prevPoint.y + (presence.cursor.y - prevPoint.y) * clampedAlpha;

    return { x: ix, y: iy };
  },

  getConflictList: () => {
    return get().conflicts.filter((c) => !c.resolved);
  },
}));
