import { create } from "zustand";
import type {
  AgentInfo,
  AgentLock,
  AgentRole,
  CollaborationEvent,
  CollaborationEventInput,
  CollaborationEventType,
  CollaborationFeedFilterOptions,
  EventSeverity,
  HandoffRecord,
  RoleFilter,
  SeverityFilter,
  ThroughputMetrics,
} from "../components/CollaborationFeed/types";

export interface CollaborationState {
  events: CollaborationEvent[];
  activeLocks: Record<string, AgentLock>;
  handoffs: HandoffRecord[];
  agents: Record<string, AgentInfo>;
  throughput: ThroughputMetrics;
  severityFilter: SeverityFilter;
  roleFilter: RoleFilter;
  searchQuery: string;
  isStreamingPaused: boolean;
  isDocked: boolean;
  isCollapsed: boolean;
  maxStoredEvents: number;
}

export interface CollaborationActions {
  addEvent: (eventInput: CollaborationEventInput) => void;
  setEvents: (events: CollaborationEvent[]) => void;
  clearEvents: () => void;
  updateAgentLock: (lock: AgentLock) => void;
  releaseAgentLock: (taskId: string) => void;
  clearAllLocks: () => void;
  pruneExpiredLocks: (currentTime?: number) => void;
  updateThroughput: (metrics: Partial<ThroughputMetrics>) => void;
  setSeverityFilter: (filter: SeverityFilter) => void;
  setRoleFilter: (filter: RoleFilter) => void;
  setSearchQuery: (query: string) => void;
  togglePauseStreaming: () => void;
  setIsStreamingPaused: (paused: boolean) => void;
  registerAgent: (agent: AgentInfo) => void;
  setDocked: (docked: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
  setMaxStoredEvents: (max: number) => void;
  exportFeedJson: () => string;
  getFilteredEvents: () => CollaborationEvent[];
  getActiveLocks: (currentTime?: number) => AgentLock[];
  getThroughputStats: () => ThroughputMetrics;
  getActiveAgents: () => AgentInfo[];
  getHandoffHistory: () => HandoffRecord[];
}

export type CollaborationStore = CollaborationState & CollaborationActions;

export function sanitizeThroughputNumber(
  val: unknown,
  fallback = 0,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (typeof val !== "number" || !Number.isFinite(val) || Number.isNaN(val)) {
    return fallback;
  }
  return Math.min(Math.max(val, min), max);
}

export function inferAgentRole(agentId?: string, explicitRole?: AgentRole): AgentRole {
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
    idLower.includes("audit") ||
    idLower.includes("check")
  ) {
    return "validator";
  }
  if (idLower.includes("system") || idLower.includes("engine") || idLower.includes("harness")) {
    return "system";
  }
  if (idLower.includes("user")) {
    return "user";
  }
  if (
    idLower.includes("impl") ||
    idLower.includes("worker") ||
    idLower.includes("dev") ||
    idLower.includes("coder")
  ) {
    return "implementer";
  }
  return "implementer";
}

export function inferEventSeverity(
  type?: CollaborationEventType,
  explicitSeverity?: EventSeverity,
): EventSeverity {
  if (explicitSeverity) {
    return explicitSeverity;
  }
  if (!type) {
    return "info";
  }
  switch (type) {
    case "validation_rejected":
    case "error":
      return "reject";
    case "validation_approved":
    case "critic_approved":
      return "approve";
    case "warn":
      return "warn";
    case "claim":
    case "start":
    case "finish":
    case "tool_call":
    case "handoff":
    case "lease_acquired":
    case "lease_released":
    case "validation_started":
    case "critic_started":
    case "token_metric":
    default:
      return "info";
  }
}

export function filterCollaborationEvents(
  events: readonly CollaborationEvent[],
  options: CollaborationFeedFilterOptions,
): CollaborationEvent[] {
  const { severity, role, searchQuery } = options;
  const queryLower = (searchQuery ?? "").trim().toLowerCase();

  return events.filter((evt) => {
    // 1. Severity filter
    if (severity !== "all") {
      if (severity === "reject") {
        if (evt.severity !== "reject" && evt.severity !== "error") return false;
      } else if (severity === "error") {
        if (evt.severity !== "error" && evt.severity !== "reject") return false;
      } else if (evt.severity !== severity) {
        return false;
      }
    }

    // 2. Role filter
    if (role !== "all") {
      if (evt.role !== role) {
        return false;
      }
    }

    // 3. Search query filter
    if (queryLower.length > 0) {
      const summaryMatch = (evt.summary ?? "").toLowerCase().includes(queryLower);
      const agentIdMatch = (evt.agentId ?? "").toLowerCase().includes(queryLower);
      const agentNameMatch = (evt.agentName ?? "").toLowerCase().includes(queryLower);
      const taskIdMatch = (evt.taskId ?? "").toLowerCase().includes(queryLower);
      const taskLabelMatch = (evt.taskLabel ?? "").toLowerCase().includes(queryLower);
      const typeMatch = (evt.type ?? "").toLowerCase().includes(queryLower);
      const detailsMatch =
        typeof evt.details === "string"
          ? evt.details.toLowerCase().includes(queryLower)
          : evt.details
            ? JSON.stringify(evt.details).toLowerCase().includes(queryLower)
            : false;
      const payloadMatch = evt.payload
        ? JSON.stringify(evt.payload).toLowerCase().includes(queryLower)
        : false;
      const targetAgentMatch =
        (evt.targetAgentId ?? "").toLowerCase().includes(queryLower) ||
        (evt.targetAgentName ?? "").toLowerCase().includes(queryLower);

      if (
        !summaryMatch &&
        !agentIdMatch &&
        !agentNameMatch &&
        !taskIdMatch &&
        !taskLabelMatch &&
        !typeMatch &&
        !detailsMatch &&
        !payloadMatch &&
        !targetAgentMatch
      ) {
        return false;
      }
    }

    return true;
  });
}

const INITIAL_THROUGHPUT: ThroughputMetrics = {
  tokensPerSec: 0,
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  latencyMs: 0,
  peakTokensPerSec: 0,
  sampleCount: 0,
  history: [],
};

const DEFAULT_MAX_STORED_EVENTS = 2000;

export const useCollaborationStore = create<CollaborationStore>()((set, get) => ({
  events: [],
  activeLocks: {},
  handoffs: [],
  agents: {},
  throughput: { ...INITIAL_THROUGHPUT },
  severityFilter: "all",
  roleFilter: "all",
  searchQuery: "",
  isStreamingPaused: false,
  isDocked: false,
  isCollapsed: false,
  maxStoredEvents: DEFAULT_MAX_STORED_EVENTS,

  addEvent: (eventInput: CollaborationEventInput) => {
    const rawTimestamp = eventInput.timestamp;
    const timestamp =
      rawTimestamp !== undefined && rawTimestamp !== null
        ? typeof rawTimestamp === "number" && !Number.isNaN(rawTimestamp)
          ? rawTimestamp
          : typeof rawTimestamp === "string"
            ? rawTimestamp
            : Date.now()
        : Date.now();

    const agentId = (eventInput.agentId && eventInput.agentId.trim()) || "anonymous-agent";
    const role = inferAgentRole(agentId, eventInput.role);
    const severity = inferEventSeverity(eventInput.type, eventInput.severity);
    const summary = eventInput.summary ?? "";
    const type = eventInput.type || "tool_call";
    const id = eventInput.id ?? `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const event: CollaborationEvent = {
      id,
      timestamp,
      agentId,
      agentName: eventInput.agentName ?? agentId,
      role,
      type,
      taskId: eventInput.taskId,
      taskLabel: eventInput.taskLabel,
      severity,
      summary,
      details: eventInput.details,
      payload: eventInput.payload,
      metrics: eventInput.metrics,
      targetAgentId: eventInput.targetAgentId,
      targetAgentName: eventInput.targetAgentName,
      lockInfo: eventInput.lockInfo,
    };

    set((state) => {
      // 1. Maintain events list with capped length
      const newEvents = [event, ...state.events];
      if (newEvents.length > state.maxStoredEvents) {
        newEvents.length = state.maxStoredEvents;
      }

      // 2. Update agent registry
      const existingAgent = state.agents[event.agentId];
      const agentStatus =
        event.type === "finish" || event.type === "lease_released"
          ? "idle"
          : severity === "reject" || severity === "error"
            ? "error"
            : "busy";

      const incPrompt = sanitizeThroughputNumber(event.metrics?.promptTokens, 0);
      const incComp = sanitizeThroughputNumber(event.metrics?.completionTokens, 0);
      const incTotal =
        typeof event.metrics?.totalTokens === "number"
          ? sanitizeThroughputNumber(event.metrics.totalTokens, incPrompt + incComp)
          : incPrompt + incComp;

      const updatedAgent: AgentInfo = {
        id: event.agentId,
        name: event.agentName ?? existingAgent?.name ?? event.agentId,
        role: role,
        avatarUrl: existingAgent?.avatarUrl,
        status: agentStatus,
        lastActiveAt: timestamp,
        currentTaskId:
          event.type === "finish" || event.type === "lease_released"
            ? undefined
            : (event.taskId ?? existingAgent?.currentTaskId),
        totalTokens: (existingAgent?.totalTokens ?? 0) + incTotal,
        completedTasks:
          (existingAgent?.completedTasks ?? 0) +
          (event.type === "finish" || event.type === "validation_approved" ? 1 : 0),
      };

      const updatedAgents = {
        ...state.agents,
        [event.agentId]: updatedAgent,
      };

      // 3. Handle Lock & Lease lifecycles
      const updatedLocks = { ...state.activeLocks };
      const isAcquiringLock =
        event.type === "claim" ||
        event.type === "lease_acquired" ||
        (event.lockInfo !== undefined && Object.keys(event.lockInfo).length > 0);

      const isReleasingLock = event.type === "finish" || event.type === "lease_released";

      if (event.taskId) {
        if (isAcquiringLock) {
          const writeScope =
            event.lockInfo?.writeScope ??
            (Array.isArray(event.payload?.writeScope)
              ? event.payload.writeScope.filter((s): s is string => typeof s === "string")
              : undefined);

          const tokenDigest =
            event.lockInfo?.tokenDigest ??
            (typeof event.payload?.tokenDigest === "string"
              ? event.payload.tokenDigest
              : undefined);

          const durationSeconds = Math.max(
            1,
            sanitizeThroughputNumber(event.lockInfo?.durationSeconds, 3600),
          );

          const numAcquiredAt = typeof timestamp === "number" ? timestamp : Date.now();

          const expiresAt = event.lockInfo?.expiresAt ?? numAcquiredAt + durationSeconds * 1000;

          const lock: AgentLock = {
            taskId: event.taskId,
            taskLabel: event.taskLabel ?? event.lockInfo?.taskLabel ?? event.taskId,
            agentId: event.agentId,
            agentName: event.agentName ?? event.agentId,
            role,
            acquiredAt: event.lockInfo?.acquiredAt ?? timestamp,
            expiresAt,
            durationSeconds,
            writeScope,
            tokenDigest,
          };
          updatedLocks[event.taskId] = lock;
        } else if (isReleasingLock) {
          delete updatedLocks[event.taskId];
        }
      }

      // 4. Handle handoffs
      let updatedHandoffs = state.handoffs;
      if (event.type === "handoff" && event.targetAgentId) {
        const handoffRecord: HandoffRecord = {
          id: event.id,
          fromAgentId: event.agentId,
          toAgentId: event.targetAgentId,
          fromAgentName: event.agentName,
          toAgentName: event.targetAgentName,
          taskId: event.taskId,
          taskLabel: event.taskLabel,
          timestamp,
          reason:
            typeof event.payload?.reason === "string"
              ? event.payload.reason
              : typeof event.details === "string"
                ? event.details
                : event.summary,
          status: "completed",
        };
        updatedHandoffs = [handoffRecord, ...state.handoffs].slice(0, 500);
      }

      // 5. Update Throughput Metrics with hardened clamping
      let updatedThroughput = state.throughput;
      if (event.metrics || event.type === "token_metric") {
        const pTokens = sanitizeThroughputNumber(event.metrics?.promptTokens, 0);
        const cTokens = sanitizeThroughputNumber(event.metrics?.completionTokens, 0);
        const totTokens =
          typeof event.metrics?.totalTokens === "number"
            ? sanitizeThroughputNumber(event.metrics.totalTokens, pTokens + cTokens)
            : pTokens + cTokens;
        const tps = sanitizeThroughputNumber(event.metrics?.tokensPerSec, 0, 0, 100_000_000);
        const latency =
          event.metrics?.latencyMs !== undefined
            ? sanitizeThroughputNumber(
                event.metrics.latencyMs,
                state.throughput.latencyMs,
                0,
                3_600_000,
              )
            : state.throughput.latencyMs;

        const newPeak = Math.max(state.throughput.peakTokensPerSec, tps);
        const newHistory = [...(state.throughput.history ?? [])];
        if (tps > 0) {
          const numTs = typeof timestamp === "number" ? timestamp : Date.now();
          newHistory.push({ timestamp: numTs, rate: tps });
          if (newHistory.length > 60) {
            newHistory.shift();
          }
        }

        updatedThroughput = {
          tokensPerSec: tps > 0 ? tps : state.throughput.tokensPerSec,
          promptTokens: state.throughput.promptTokens + pTokens,
          completionTokens: state.throughput.completionTokens + cTokens,
          totalTokens: state.throughput.totalTokens + totTokens,
          latencyMs: latency,
          peakTokensPerSec: newPeak,
          sampleCount: state.throughput.sampleCount + 1,
          history: newHistory,
        };
      }

      return {
        events: newEvents,
        agents: updatedAgents,
        activeLocks: updatedLocks,
        handoffs: updatedHandoffs,
        throughput: updatedThroughput,
      };
    });
  },

  setEvents: (events: CollaborationEvent[]) => {
    set({ events: [...events] });
  },

  clearEvents: () => {
    set({ events: [] });
  },

  updateAgentLock: (lock: AgentLock) => {
    const durationSeconds = Math.max(1, sanitizeThroughputNumber(lock.durationSeconds, 3600));
    const acquiredAtMs = typeof lock.acquiredAt === "number" ? lock.acquiredAt : Date.now();
    const expiresAt = lock.expiresAt ?? acquiredAtMs + durationSeconds * 1000;

    set((state) => ({
      activeLocks: {
        ...state.activeLocks,
        [lock.taskId]: {
          ...lock,
          durationSeconds,
          expiresAt,
        },
      },
    }));
  },

  releaseAgentLock: (taskId: string) => {
    set((state) => {
      const copy = { ...state.activeLocks };
      delete copy[taskId];
      return { activeLocks: copy };
    });
  },

  clearAllLocks: () => {
    set({ activeLocks: {} });
  },

  pruneExpiredLocks: (currentTime?: number) => {
    const now = currentTime ?? Date.now();
    set((state) => {
      let changed = false;
      const nextLocks: Record<string, AgentLock> = {};

      for (const [taskId, lock] of Object.entries(state.activeLocks)) {
        if (typeof lock.expiresAt === "number" && lock.expiresAt <= now) {
          changed = true;
        } else {
          nextLocks[taskId] = lock;
        }
      }

      return changed ? { activeLocks: nextLocks } : state;
    });
  },

  updateThroughput: (metrics: Partial<ThroughputMetrics>) => {
    set((state) => {
      const current = state.throughput;
      const rawTps =
        metrics.tokensPerSec !== undefined
          ? sanitizeThroughputNumber(metrics.tokensPerSec, current.tokensPerSec, 0, 100_000_000)
          : current.tokensPerSec;
      const rawPeak =
        metrics.peakTokensPerSec !== undefined
          ? sanitizeThroughputNumber(
              metrics.peakTokensPerSec,
              current.peakTokensPerSec,
              0,
              100_000_000,
            )
          : current.peakTokensPerSec;
      const peak = Math.max(current.peakTokensPerSec, rawPeak, rawTps);

      return {
        throughput: {
          tokensPerSec: rawTps,
          promptTokens:
            metrics.promptTokens !== undefined
              ? sanitizeThroughputNumber(metrics.promptTokens, current.promptTokens)
              : current.promptTokens,
          completionTokens:
            metrics.completionTokens !== undefined
              ? sanitizeThroughputNumber(metrics.completionTokens, current.completionTokens)
              : current.completionTokens,
          totalTokens:
            metrics.totalTokens !== undefined
              ? sanitizeThroughputNumber(metrics.totalTokens, current.totalTokens)
              : current.totalTokens,
          latencyMs:
            metrics.latencyMs !== undefined
              ? sanitizeThroughputNumber(metrics.latencyMs, current.latencyMs, 0, 3_600_000)
              : current.latencyMs,
          peakTokensPerSec: peak,
          sampleCount:
            metrics.sampleCount !== undefined
              ? sanitizeThroughputNumber(metrics.sampleCount, current.sampleCount + 1)
              : current.sampleCount + 1,
          history: metrics.history ?? current.history,
        },
      };
    });
  },

  setSeverityFilter: (severityFilter: SeverityFilter) => {
    set({ severityFilter });
  },

  setRoleFilter: (roleFilter: RoleFilter) => {
    set({ roleFilter });
  },

  setSearchQuery: (searchQuery: string) => {
    set({ searchQuery });
  },

  togglePauseStreaming: () => {
    set((state) => ({ isStreamingPaused: !state.isStreamingPaused }));
  },

  setIsStreamingPaused: (isStreamingPaused: boolean) => {
    set({ isStreamingPaused });
  },

  registerAgent: (agent: AgentInfo) => {
    set((state) => ({
      agents: {
        ...state.agents,
        [agent.id]: agent,
      },
    }));
  },

  setDocked: (isDocked: boolean) => {
    set({ isDocked });
  },

  setCollapsed: (isCollapsed: boolean) => {
    set({ isCollapsed });
  },

  setMaxStoredEvents: (maxStoredEvents: number) => {
    set({ maxStoredEvents });
  },

  exportFeedJson: () => {
    const state = get();
    const payload = {
      exportedAt: new Date().toISOString(),
      eventsCount: state.events.length,
      activeLocks: Object.values(state.activeLocks),
      throughput: state.throughput,
      agents: Object.values(state.agents),
      handoffs: state.handoffs,
      events: state.events,
    };
    return JSON.stringify(payload, null, 2);
  },

  getFilteredEvents: () => {
    const state = get();
    return filterCollaborationEvents(state.events, {
      severity: state.severityFilter,
      role: state.roleFilter,
      searchQuery: state.searchQuery,
    });
  },

  getActiveLocks: (currentTime?: number) => {
    const state = get();
    const locks = Object.values(state.activeLocks);
    if (currentTime === undefined) {
      return locks;
    }
    return locks.filter(
      (lock) => typeof lock.expiresAt !== "number" || lock.expiresAt > currentTime,
    );
  },

  getThroughputStats: () => {
    const state = get();
    return state.throughput;
  },

  getActiveAgents: () => {
    const state = get();
    return Object.values(state.agents);
  },

  getHandoffHistory: () => {
    const state = get();
    return state.handoffs;
  },
}));
