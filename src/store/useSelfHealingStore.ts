/**
 * Zustand Store for Autonomous Self-Healing Graph Engine
 * 100% Zero-Any Strict TypeScript
 */

import { create } from "zustand";
import type { GraphDataset } from "../types/graphData";
import {
  DEFAULT_SELF_HEALING_CONFIG,
  type CircuitBreakerInfo,
  type CircuitBreakerState,
  type FallbackRoute,
  type HealthStatus,
  type Incident,
  type NodeHealthRecord,
  type PlaybookRule,
  type ReplaySession,
  type SelfHealingAuditLogEntry,
  type SelfHealingConfig,
} from "../engine/selfHealing/types";
import type { SelfHealingEngine } from "../engine/selfHealing/selfHealingEngine";

export interface ReplayPlayerState {
  isPlaying: boolean;
  currentSessionId?: string;
  stepIndex: number;
  totalSteps: number;
  currentSnapshot?: GraphDataset;
  speed: number;
}

export interface SelfHealingStoreState {
  enabled: boolean;
  config: SelfHealingConfig;
  incidents: Incident[];
  activeIncidents: Incident[];
  circuitBreakers: Record<string, CircuitBreakerInfo>;
  fallbackRouteTable: Record<string, FallbackRoute>;
  nodeHealth: Record<string, NodeHealthRecord>;
  replaySessions: Record<string, ReplaySession>;
  replayPlayer: ReplayPlayerState;
  auditLog: SelfHealingAuditLogEntry[];
  playbooks: PlaybookRule[];

  // Actions
  setEnabled: (enabled: boolean) => void;
  updateConfig: (config: Partial<SelfHealingConfig>) => void;
  recordIncident: (incident: Incident) => void;
  resolveIncident: (incidentId: string, resolution?: string, finalSnapshot?: GraphDataset) => void;
  updateNodeHealth: (nodeId: string, health: Partial<NodeHealthRecord>) => void;
  updateCircuitBreaker: (id: string, update: Partial<CircuitBreakerInfo>) => void;
  setFallbackRoute: (originalEdgeId: string, route: FallbackRoute) => void;
  removeFallbackRoute: (originalEdgeId: string) => void;
  registerPlaybook: (playbook: PlaybookRule) => void;
  removePlaybook: (playbookId: string) => void;
  togglePlaybook: (playbookId: string, enabled?: boolean) => void;

  // Replay Actions
  startReplay: (session: ReplaySession) => void;
  playReplay: () => void;
  pauseReplay: () => void;
  stepReplay: (direction: "forward" | "backward") => void;
  jumpReplay: (stepIndex: number) => void;
  resetReplay: () => void;
  setReplaySpeed: (speed: number) => void;

  // Audit Log Actions
  addAuditLog: (
    entry: Omit<SelfHealingAuditLogEntry, "id" | "timestamp"> & {
      id?: string;
      timestamp?: number;
    },
  ) => void;
  clearAuditLog: () => void;

  // Synchronization & Reset
  syncFromEngine: (engine: SelfHealingEngine) => void;
  resetAll: () => void;
}

const initialReplayPlayer: ReplayPlayerState = {
  isPlaying: false,
  stepIndex: 0,
  totalSteps: 0,
  speed: 1,
};

export const useSelfHealingStore = create<SelfHealingStoreState>((set, get) => ({
  enabled: true,
  config: DEFAULT_SELF_HEALING_CONFIG,
  incidents: [],
  activeIncidents: [],
  circuitBreakers: {},
  fallbackRouteTable: {},
  nodeHealth: {},
  replaySessions: {},
  replayPlayer: initialReplayPlayer,
  auditLog: [],
  playbooks: [],

  setEnabled: (enabled: boolean) => {
    set({ enabled });
  },

  updateConfig: (configPatch: Partial<SelfHealingConfig>) => {
    set((state) => ({
      config: { ...state.config, ...configPatch },
    }));
  },

  recordIncident: (incident: Incident) => {
    set((state) => {
      const incidents = [incident, ...state.incidents.filter((i) => i.id !== incident.id)];
      if (incidents.length > state.config.maxIncidentHistory) {
        incidents.length = state.config.maxIncidentHistory;
      }
      const activeIncidents = incidents.filter(
        (i) => i.status === "detected" || i.status === "remediating" || i.status === "remediated",
      );
      return { incidents, activeIncidents };
    });
  },

  resolveIncident: (incidentId: string, _resolution?: string, finalSnapshot?: GraphDataset) => {
    set((state) => {
      const incidents = state.incidents.map((inc) => {
        if (inc.id === incidentId) {
          return {
            ...inc,
            status: "resolved" as const,
            resolvedAt: Date.now(),
            finalSnapshot: finalSnapshot ?? inc.finalSnapshot,
          };
        }
        return inc;
      });
      const activeIncidents = incidents.filter(
        (i) => i.status === "detected" || i.status === "remediating" || i.status === "remediated",
      );
      return { incidents, activeIncidents };
    });
  },

  updateNodeHealth: (nodeId: string, health: Partial<NodeHealthRecord>) => {
    set((state) => {
      const current = state.nodeHealth[nodeId] ?? {
        nodeId,
        status: "healthy" as HealthStatus,
        lastHeartbeat: Date.now(),
        restartAttempts: 0,
        consecutiveFailures: 0,
      };

      const updated: NodeHealthRecord = {
        ...current,
        ...health,
        metrics: {
          ...(current.metrics ?? {}),
          ...(health.metrics ?? {}),
        },
      };

      return {
        nodeHealth: {
          ...state.nodeHealth,
          [nodeId]: updated,
        },
      };
    });
  },

  updateCircuitBreaker: (id: string, update: Partial<CircuitBreakerInfo>) => {
    set((state) => {
      const current = state.circuitBreakers[id] ?? {
        id,
        state: "CLOSED" as CircuitBreakerState,
        failureCount: 0,
        successCount: 0,
        consecutiveSuccesses: 0,
        lastStateChange: Date.now(),
        halfOpenTrials: 0,
      };

      const updated: CircuitBreakerInfo = {
        ...current,
        ...update,
      };

      return {
        circuitBreakers: {
          ...state.circuitBreakers,
          [id]: updated,
        },
      };
    });
  },

  setFallbackRoute: (originalEdgeId: string, route: FallbackRoute) => {
    set((state) => ({
      fallbackRouteTable: {
        ...state.fallbackRouteTable,
        [originalEdgeId]: route,
      },
    }));
  },

  removeFallbackRoute: (originalEdgeId: string) => {
    set((state) => {
      const nextTable = { ...state.fallbackRouteTable };
      delete nextTable[originalEdgeId];
      return { fallbackRouteTable: nextTable };
    });
  },

  registerPlaybook: (playbook: PlaybookRule) => {
    set((state) => ({
      playbooks: [...state.playbooks.filter((p) => p.id !== playbook.id), playbook].sort(
        (a, b) => b.priority - a.priority,
      ),
    }));
  },

  removePlaybook: (playbookId: string) => {
    set((state) => ({
      playbooks: state.playbooks.filter((p) => p.id !== playbookId),
    }));
  },

  togglePlaybook: (playbookId: string, enabled?: boolean) => {
    set((state) => ({
      playbooks: state.playbooks.map((p) => {
        if (p.id === playbookId) {
          return { ...p, enabled: enabled ?? !p.enabled };
        }
        return p;
      }),
    }));
  },

  startReplay: (session: ReplaySession) => {
    const totalSteps = session.steps.length;
    const initialSnapshot = session.steps[0]?.snapshot ?? session.initialGraph;

    set((state) => ({
      replaySessions: {
        ...state.replaySessions,
        [session.id]: session,
      },
      replayPlayer: {
        isPlaying: false,
        currentSessionId: session.id,
        stepIndex: 0,
        totalSteps,
        currentSnapshot: initialSnapshot,
        speed: state.replayPlayer.speed,
      },
    }));
  },

  playReplay: () => {
    set((state) => ({
      replayPlayer: {
        ...state.replayPlayer,
        isPlaying: true,
      },
    }));
  },

  pauseReplay: () => {
    set((state) => ({
      replayPlayer: {
        ...state.replayPlayer,
        isPlaying: false,
      },
    }));
  },

  stepReplay: (direction: "forward" | "backward") => {
    const { replayPlayer, replaySessions } = get();
    if (!replayPlayer.currentSessionId) return;

    const session = replaySessions[replayPlayer.currentSessionId];
    if (!session || session.steps.length === 0) return;

    let nextIndex = replayPlayer.stepIndex;
    if (direction === "forward" && nextIndex < session.steps.length - 1) {
      nextIndex += 1;
    } else if (direction === "backward" && nextIndex > 0) {
      nextIndex -= 1;
    }

    const nextSnapshot = session.steps[nextIndex]?.snapshot;

    set({
      replayPlayer: {
        ...replayPlayer,
        stepIndex: nextIndex,
        currentSnapshot: nextSnapshot,
      },
    });
  },

  jumpReplay: (stepIndex: number) => {
    const { replayPlayer, replaySessions } = get();
    if (!replayPlayer.currentSessionId) return;

    const session = replaySessions[replayPlayer.currentSessionId];
    if (!session || session.steps.length === 0) return;

    const clampedIndex = Math.max(0, Math.min(stepIndex, session.steps.length - 1));
    const nextSnapshot = session.steps[clampedIndex]?.snapshot;

    set({
      replayPlayer: {
        ...replayPlayer,
        stepIndex: clampedIndex,
        currentSnapshot: nextSnapshot,
      },
    });
  },

  resetReplay: () => {
    const { replayPlayer, replaySessions } = get();
    if (!replayPlayer.currentSessionId) return;

    const session = replaySessions[replayPlayer.currentSessionId];
    const initialSnapshot = session?.steps[0]?.snapshot ?? session?.initialGraph;

    set({
      replayPlayer: {
        ...replayPlayer,
        isPlaying: false,
        stepIndex: 0,
        currentSnapshot: initialSnapshot,
      },
    });
  },

  setReplaySpeed: (speed: number) => {
    set((state) => ({
      replayPlayer: {
        ...state.replayPlayer,
        speed: Math.max(0.25, Math.min(speed, 5)),
      },
    }));
  },

  addAuditLog: (entry) => {
    const id = entry.id ?? `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const timestamp = entry.timestamp ?? Date.now();

    const fullEntry: SelfHealingAuditLogEntry = {
      id,
      timestamp,
      type: entry.type,
      message: entry.message,
      targetId: entry.targetId,
      details: entry.details,
    };

    set((state) => {
      const nextLog = [fullEntry, ...state.auditLog];
      if (nextLog.length > state.config.maxAuditLogHistory) {
        nextLog.length = state.config.maxAuditLogHistory;
      }
      return { auditLog: nextLog };
    });
  },

  clearAuditLog: () => {
    set({ auditLog: [] });
  },

  syncFromEngine: (engine: SelfHealingEngine) => {
    set({
      config: engine.getConfig(),
      enabled: engine.isEngineEnabled(),
      incidents: engine.getAllIncidents(),
      activeIncidents: engine.getActiveIncidents(),
      circuitBreakers: engine.circuitBreakers.getAllInfos(),
      fallbackRouteTable: engine.getFallbackRoutes(),
      nodeHealth: engine.getAllNodeHealth(),
      auditLog: engine.getAuditLog(),
      playbooks: engine.getPlaybooks(),
    });
  },

  resetAll: () => {
    set({
      enabled: true,
      config: DEFAULT_SELF_HEALING_CONFIG,
      incidents: [],
      activeIncidents: [],
      circuitBreakers: {},
      fallbackRouteTable: {},
      nodeHealth: {},
      replaySessions: {},
      replayPlayer: initialReplayPlayer,
      auditLog: [],
      playbooks: [],
    });
  },
}));
