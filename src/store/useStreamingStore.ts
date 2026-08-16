/**
 * Zustand Store for Live Telemetry Streaming & State Synchronization
 * 100% Zero-Any strict TypeScript.
 */

import { create } from "zustand";
import {
  globalTelemetryManager,
  type AgentEventPayload,
  type AnomalyAlertPayload,
  type ConnectionStatus,
  type HeartbeatMetrics,
  type LogChunkPayload,
  type MetricUpdatePayload,
  type MockSinkConfig,
  type NodeStatusPayload,
  type PacketPriority,
  type PacketType,
  type SSESinkConfig,
  type TelemetryPacket,
  type ThroughputStats,
  type TransportProtocol,
  type WebSocketSinkConfig,
} from "../api/streaming";

export interface NodeTelemetrySummary {
  nodeId: string;
  status: "pending" | "running" | "success" | "error" | "warning" | "skipped" | "cached";
  progress?: number;
  message?: string;
  durationMs?: number;
  metrics?: Record<string, unknown>;
  lastUpdated: number;
}

export interface AgentTelemetrySummary {
  agentId: string;
  agentName?: string;
  role?: string;
  taskId?: string;
  lastEventType?: string;
  lastSeverity?: "info" | "warn" | "error" | "approve" | "reject";
  lastMessage?: string;
  totalTokens?: number;
  lastSeen: number;
}

export interface MetricTelemetrySummary {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  lastUpdated: number;
  history: Array<{ timestamp: number; value: number }>;
}

export interface StreamingFilters {
  types: PacketType[];
  nodeIds: string[];
  agentIds: string[];
  minPriority: PacketPriority | "all";
  searchQuery: string;
  paused: boolean;
}

export interface StreamingState {
  status: ConnectionStatus;
  activeTransport: TransportProtocol | null;
  endpointUrl: string | null;
  packets: TelemetryPacket[];
  packetsById: Record<string, TelemetryPacket>;
  nodeStatusMap: Record<string, NodeTelemetrySummary>;
  agentStatusMap: Record<string, AgentTelemetrySummary>;
  metricsMap: Record<string, MetricTelemetrySummary>;
  recentAnomalies: AnomalyAlertPayload[];
  logs: LogChunkPayload[];
  throughput: ThroughputStats;
  heartbeat: HeartbeatMetrics;
  reconnectState: {
    attempt: number;
    maxAttempts: number;
    nextRetryDelayMs: number | null;
    isReconnecting: boolean;
    totalReconnects: number;
  };
  buffer: {
    queueSize: number;
    droppedPackets: number;
    duplicatePackets: number;
    highWatermark: number;
  };
  filters: StreamingFilters;
  subscriptions: string[];
  maxStoredPackets: number;
  maxStoredLogs: number;
}

export interface StreamingActions {
  connectWebSocket: (config: WebSocketSinkConfig | string) => Promise<void>;
  connectSSE: (config: SSESinkConfig | string) => Promise<void>;
  connectMock: (config?: MockSinkConfig) => Promise<void>;
  disconnect: (reason?: string) => void;
  reconnect: () => Promise<void>;
  pauseStream: () => void;
  resumeStream: () => void;
  sendPacket: (packet: TelemetryPacket) => boolean;
  ingestPacket: (packet: TelemetryPacket) => void;
  ingestBatch: (packets: readonly TelemetryPacket[]) => void;
  clearPackets: () => void;
  clearLogs: () => void;
  clearAnomalies: () => void;
  setFilters: (filters: Partial<StreamingFilters>) => void;
  resetFilters: () => void;
  subscribeTopic: (topic: string) => void;
  unsubscribeTopic: (topic: string) => void;
  setMaxStoredPackets: (max: number) => void;
  setMaxStoredLogs: (max: number) => void;
  resetMetrics: () => void;
  getFilteredPackets: () => TelemetryPacket[];
  getNodeTelemetry: (nodeId: string) => NodeTelemetrySummary | undefined;
  getAgentTelemetry: (agentId: string) => AgentTelemetrySummary | undefined;
  getMetricTelemetry: (metricName: string) => MetricTelemetrySummary | undefined;
  getLatestLogs: (count?: number) => LogChunkPayload[];
  getAnomalies: () => AnomalyAlertPayload[];
}

export type StreamingStore = StreamingState & StreamingActions;

const DEFAULT_FILTERS: Readonly<StreamingFilters> = Object.freeze({
  types: [],
  nodeIds: [],
  agentIds: [],
  minPriority: "all",
  searchQuery: "",
  paused: false,
});

const DEFAULT_HEARTBEAT_METRICS: Readonly<HeartbeatMetrics> = Object.freeze({
  latencyMs: 0,
  averageLatencyMs: 0,
  missedHeartbeats: 0,
  isHealthy: true,
  lastPingTimestamp: null,
  lastPongTimestamp: null,
  totalPingsSent: 0,
  totalPongsReceived: 0,
});

const DEFAULT_THROUGHPUT_STATS: Readonly<ThroughputStats> = Object.freeze({
  packetsPerSec: 0,
  bytesPerSec: 0,
  peakPacketsPerSec: 0,
  totalPackets: 0,
  totalBytes: 0,
});

export const useStreamingStore = create<StreamingStore>((set, get) => {
  // Sync manager lifecycle listeners
  globalTelemetryManager.onPacket((packet) => {
    get().ingestPacket(packet);
  });

  globalTelemetryManager.onStatusChange((status) => {
    const metrics = globalTelemetryManager.getMetrics();
    set({
      status,
      activeTransport: globalTelemetryManager.activeTransport,
      endpointUrl: globalTelemetryManager.endpointUrl,
      reconnectState: {
        attempt: metrics?.reconnectAttempts ?? 0,
        maxAttempts: 10,
        nextRetryDelayMs: null,
        isReconnecting: status === "reconnecting",
        totalReconnects: metrics?.totalReconnects ?? 0,
      },
    });
  });

  return {
    status: "disconnected",
    activeTransport: null,
    endpointUrl: null,
    packets: [],
    packetsById: {},
    nodeStatusMap: {},
    agentStatusMap: {},
    metricsMap: {},
    recentAnomalies: [],
    logs: [],
    throughput: { ...DEFAULT_THROUGHPUT_STATS },
    heartbeat: { ...DEFAULT_HEARTBEAT_METRICS },
    reconnectState: {
      attempt: 0,
      maxAttempts: 10,
      nextRetryDelayMs: null,
      isReconnecting: false,
      totalReconnects: 0,
    },
    buffer: {
      queueSize: 0,
      droppedPackets: 0,
      duplicatePackets: 0,
      highWatermark: 0,
    },
    filters: { ...DEFAULT_FILTERS },
    subscriptions: [],
    maxStoredPackets: 2000,
    maxStoredLogs: 1000,

    connectWebSocket: async (configOrUrl: WebSocketSinkConfig | string) => {
      const config: WebSocketSinkConfig =
        typeof configOrUrl === "string" ? { url: configOrUrl } : configOrUrl;
      await globalTelemetryManager.connectWebSocket(config);
      set({
        status: globalTelemetryManager.status,
        activeTransport: "websocket",
        endpointUrl: config.url,
      });
    },

    connectSSE: async (configOrUrl: SSESinkConfig | string) => {
      const config: SSESinkConfig =
        typeof configOrUrl === "string" ? { url: configOrUrl } : configOrUrl;
      await globalTelemetryManager.connectSSE(config);
      set({
        status: globalTelemetryManager.status,
        activeTransport: "sse",
        endpointUrl: config.url,
      });
    },

    connectMock: async (config?: MockSinkConfig) => {
      await globalTelemetryManager.connectMock(config);
      set({
        status: globalTelemetryManager.status,
        activeTransport: "mock",
        endpointUrl: "mock://telemetry-stream",
      });
    },

    disconnect: (reason?: string) => {
      globalTelemetryManager.disconnect(reason);
      set({
        status: "disconnected",
        activeTransport: null,
        endpointUrl: null,
      });
    },

    reconnect: async () => {
      await globalTelemetryManager.reconnect();
      set({
        status: globalTelemetryManager.status,
      });
    },

    pauseStream: () => {
      globalTelemetryManager.pause();
      set((state) => ({
        filters: { ...state.filters, paused: true },
        status: state.status === "connected" ? "paused" : state.status,
      }));
    },

    resumeStream: () => {
      globalTelemetryManager.resume();
      set((state) => ({
        filters: { ...state.filters, paused: false },
        status: state.status === "paused" ? "connected" : state.status,
      }));
    },

    sendPacket: (packet: TelemetryPacket) => {
      return globalTelemetryManager.send(packet);
    },

    ingestPacket: (packet: TelemetryPacket) => {
      get().ingestBatch([packet]);
    },

    ingestBatch: (incomingPackets: readonly TelemetryPacket[]) => {
      if (incomingPackets.length === 0) return;

      set((state) => {
        const nextPackets = [...state.packets, ...incomingPackets];
        const excess = nextPackets.length - state.maxStoredPackets;
        const boundedPackets = excess > 0 ? nextPackets.slice(excess) : nextPackets;

        const nextPacketsById = { ...state.packetsById };
        const nextNodeStatusMap = { ...state.nodeStatusMap };
        const nextAgentStatusMap = { ...state.agentStatusMap };
        const nextMetricsMap = { ...state.metricsMap };
        const nextAnomalies = [...state.recentAnomalies];
        const nextLogs = [...state.logs];

        for (const p of incomingPackets) {
          nextPacketsById[p.id] = p;

          // Project node updates
          if (p.type === "node_status" && p.payload && typeof p.payload === "object") {
            const payload = p.payload as Partial<NodeStatusPayload>;
            const nodeId = payload.nodeId ?? p.nodeId;
            if (nodeId) {
              nextNodeStatusMap[nodeId] = {
                nodeId,
                status: payload.status ?? "running",
                progress: payload.progress,
                message: payload.message,
                durationMs: payload.durationMs,
                metrics: payload.metrics,
                lastUpdated: p.timestamp || Date.now(),
              };
            }
          }

          // Project agent events
          if (p.type === "agent_event" && p.payload && typeof p.payload === "object") {
            const payload = p.payload as Partial<AgentEventPayload>;
            const agentId = payload.agentId ?? p.agentId;
            if (agentId) {
              const prev = nextAgentStatusMap[agentId];
              const prevTokens = prev?.totalTokens ?? 0;
              const addedTokens = typeof payload.tokens === "number" ? payload.tokens : 0;

              nextAgentStatusMap[agentId] = {
                agentId,
                agentName: payload.agentName ?? prev?.agentName,
                role: payload.role ?? prev?.role,
                taskId: payload.taskId ?? prev?.taskId,
                lastEventType: payload.eventType,
                lastSeverity: payload.severity,
                lastMessage: payload.message,
                totalTokens: prevTokens + addedTokens,
                lastSeen: p.timestamp || Date.now(),
              };
            }
          }

          // Project metrics updates
          if (p.type === "metric_update" && p.payload && typeof p.payload === "object") {
            const payload = p.payload as Partial<MetricUpdatePayload>;
            if (payload.metricName && typeof payload.value === "number") {
              const name = payload.metricName;
              const prevMetric = nextMetricsMap[name];
              const prevHistory = prevMetric ? prevMetric.history : [];
              const ts = payload.timestamp ?? p.timestamp ?? Date.now();

              const nextHistory = [...prevHistory, { timestamp: ts, value: payload.value }];
              if (nextHistory.length > 50) {
                nextHistory.shift();
              }

              nextMetricsMap[name] = {
                name,
                value: payload.value,
                unit: payload.unit ?? prevMetric?.unit,
                tags: payload.tags ?? prevMetric?.tags,
                lastUpdated: ts,
                history: nextHistory,
              };
            }
          }

          // Collect anomalies
          if (p.type === "anomaly_alert" && p.payload && typeof p.payload === "object") {
            nextAnomalies.unshift(p.payload as AnomalyAlertPayload);
            if (nextAnomalies.length > 100) {
              nextAnomalies.pop();
            }
          }

          // Collect logs
          if (p.type === "log_chunk" && p.payload && typeof p.payload === "object") {
            nextLogs.push(p.payload as LogChunkPayload);
            if (nextLogs.length > state.maxStoredLogs) {
              nextLogs.shift();
            }
          }
        }

        const managerMetrics = globalTelemetryManager.getMetrics();

        return {
          packets: boundedPackets,
          packetsById: nextPacketsById,
          nodeStatusMap: nextNodeStatusMap,
          agentStatusMap: nextAgentStatusMap,
          metricsMap: nextMetricsMap,
          recentAnomalies: nextAnomalies,
          logs: nextLogs,
          throughput: managerMetrics?.throughput ?? state.throughput,
          heartbeat: managerMetrics?.heartbeat ?? state.heartbeat,
          buffer: managerMetrics
            ? {
                queueSize: managerMetrics.queue.size,
                droppedPackets: managerMetrics.queue.totalDropped,
                duplicatePackets: managerMetrics.deduplicator.duplicateCount,
                highWatermark: managerMetrics.queue.highWatermark,
              }
            : state.buffer,
        };
      });
    },

    clearPackets: () => {
      set({
        packets: [],
        packetsById: {},
        nodeStatusMap: {},
        agentStatusMap: {},
        metricsMap: {},
      });
    },

    clearLogs: () => {
      set({ logs: [] });
    },

    clearAnomalies: () => {
      set({ recentAnomalies: [] });
    },

    setFilters: (newFilters: Partial<StreamingFilters>) => {
      set((state) => ({
        filters: { ...state.filters, ...newFilters },
      }));
    },

    resetFilters: () => {
      set({ filters: { ...DEFAULT_FILTERS } });
    },

    subscribeTopic: (topic: string) => {
      globalTelemetryManager.subscribe(topic);
      set((state) => {
        if (state.subscriptions.includes(topic)) return state;
        return { subscriptions: [...state.subscriptions, topic] };
      });
    },

    unsubscribeTopic: (topic: string) => {
      globalTelemetryManager.unsubscribe(topic);
      set((state) => ({
        subscriptions: state.subscriptions.filter((t) => t !== topic),
      }));
    },

    setMaxStoredPackets: (max: number) => {
      set({ maxStoredPackets: Math.max(1, max) });
    },

    setMaxStoredLogs: (max: number) => {
      set({ maxStoredLogs: Math.max(1, max) });
    },

    resetMetrics: () => {
      set({
        throughput: { ...DEFAULT_THROUGHPUT_STATS },
        heartbeat: { ...DEFAULT_HEARTBEAT_METRICS },
      });
    },

    getFilteredPackets: () => {
      const state = get();
      const { types, nodeIds, agentIds, minPriority, searchQuery } = state.filters;

      return state.packets.filter((p) => {
        if (types.length > 0 && !types.includes(p.type)) {
          return false;
        }
        if (nodeIds.length > 0 && (!p.nodeId || !nodeIds.includes(p.nodeId))) {
          return false;
        }
        if (agentIds.length > 0 && (!p.agentId || !agentIds.includes(p.agentId))) {
          return false;
        }
        if (minPriority !== "all") {
          const priorityOrder: Record<PacketPriority, number> = {
            critical: 3,
            high: 2,
            normal: 1,
            low: 0,
          };
          const packetScore = priorityOrder[p.priority ?? "normal"] ?? 1;
          const minScore = priorityOrder[minPriority] ?? 0;
          if (packetScore < minScore) return false;
        }
        if (searchQuery.trim().length > 0) {
          const query = searchQuery.toLowerCase();
          const matchId = p.id.toLowerCase().includes(query);
          const matchType = p.type.toLowerCase().includes(query);
          const matchNode = p.nodeId?.toLowerCase().includes(query);
          const matchAgent = p.agentId?.toLowerCase().includes(query);
          const matchPayload = JSON.stringify(p.payload).toLowerCase().includes(query);
          if (!matchId && !matchType && !matchNode && !matchAgent && !matchPayload) {
            return false;
          }
        }
        return true;
      });
    },

    getNodeTelemetry: (nodeId: string) => {
      return get().nodeStatusMap[nodeId];
    },

    getAgentTelemetry: (agentId: string) => {
      return get().agentStatusMap[agentId];
    },

    getMetricTelemetry: (metricName: string) => {
      return get().metricsMap[metricName];
    },

    getLatestLogs: (count = 100) => {
      const allLogs = get().logs;
      return allLogs.slice(Math.max(0, allLogs.length - count));
    },

    getAnomalies: () => {
      return get().recentAnomalies;
    },
  };
});
