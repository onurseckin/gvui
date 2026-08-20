import type {
  AgentMetricBreakdown,
  ColorScheme,
  FlamegraphFilterOptions,
  FlamegraphMetrics,
  FlamegraphNode,
  FlattenOptions,
  LayoutOptions,
  ProfileSpan,
  SpanCategory,
  SpanStatus,
  SpanTier,
  TokenMetrics,
  ViewportRange,
} from "./types";
import { UNKNOWN_LABEL } from "../../state/graphSchema";

export function sanitizeNumber(
  val: unknown,
  fallback = 0,
  min = -Number.MAX_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (typeof val !== "number" || !Number.isFinite(val) || Number.isNaN(val)) {
    return fallback;
  }
  return Math.min(Math.max(val, min), max);
}

export function sanitizeTokenMetrics(raw?: Partial<TokenMetrics> | null): TokenMetrics {
  const promptTokens = Math.max(0, Math.floor(sanitizeNumber(raw?.promptTokens, 0)));
  const completionTokens = Math.max(0, Math.floor(sanitizeNumber(raw?.completionTokens, 0)));
  const reasoningTokens = Math.max(0, Math.floor(sanitizeNumber(raw?.reasoningTokens, 0)));
  const total =
    raw?.totalTokens !== undefined
      ? Math.max(0, Math.floor(sanitizeNumber(raw.totalTokens, 0)))
      : promptTokens + completionTokens + reasoningTokens;

  return {
    promptTokens,
    completionTokens,
    reasoningTokens,
    totalTokens: total,
  };
}

export function normalizeSpan(rawSpan: Partial<ProfileSpan>): ProfileSpan {
  const id = rawSpan.id ? String(rawSpan.id) : `span-${Math.random().toString(36).slice(2, 9)}`;
  const parentId = rawSpan.parentId ? String(rawSpan.parentId) : null;
  const name = rawSpan.name ? String(rawSpan.name) : "Unnamed Span";
  const agentId = rawSpan.agentId ? String(rawSpan.agentId) : "unknown-agent";
  const agentRole = rawSpan.agentRole ? String(rawSpan.agentRole) : undefined;
  const tier: SpanTier = validateTier(rawSpan.tier);
  const status: SpanStatus = validateStatus(rawSpan.status);
  const category: SpanCategory = validateCategory(rawSpan.category);

  let startTime = sanitizeNumber(rawSpan.startTime, 0);
  let endTime = sanitizeNumber(rawSpan.endTime, startTime);
  if (endTime < startTime) {
    endTime = startTime;
  }
  const duration = Math.max(0, endTime - startTime);
  const tokens = sanitizeTokenMetrics(rawSpan.tokens);
  // Recorded dollars only: a span that reported none keeps none rather than showing a firm $0.
  const costUsd =
    typeof rawSpan.costUsd === "number" && Number.isFinite(rawSpan.costUsd)
      ? Math.max(0, rawSpan.costUsd)
      : undefined;
  const metadata =
    typeof rawSpan.metadata === "object" && rawSpan.metadata !== null
      ? { ...rawSpan.metadata }
      : undefined;
  const error = rawSpan.error ? String(rawSpan.error) : undefined;
  const tags = Array.isArray(rawSpan.tags)
    ? rawSpan.tags.filter((t): t is string => typeof t === "string")
    : undefined;

  return {
    id,
    parentId,
    name,
    agentId,
    agentRole,
    tier,
    status,
    category,
    startTime,
    endTime,
    duration,
    tokens,
    costUsd,
    metadata,
    error,
    tags,
    children: [],
  };
}

function validateTier(tier?: unknown): SpanTier {
  const valid: SpanTier[] = ["root", "coordinator", "subagent", "worker", "tool", "gate", "system"];
  if (typeof tier === "string" && (valid as string[]).includes(tier)) {
    return tier as SpanTier;
  }
  return "subagent";
}

function validateStatus(status?: unknown): SpanStatus {
  const valid: SpanStatus[] = ["pending", "running", "success", "error", "cancelled"];
  if (typeof status === "string" && (valid as string[]).includes(status)) {
    return status as SpanStatus;
  }
  return "success";
}

function validateCategory(category?: unknown): SpanCategory {
  const valid: SpanCategory[] = [
    "agent_cascade",
    "llm_call",
    "tool_execution",
    "task_lease",
    "validator_gate",
    "custom",
  ];
  if (typeof category === "string" && (valid as string[]).includes(category)) {
    return category as SpanCategory;
  }
  return "agent_cascade";
}

/**
 * Builds a hierarchical tree of ProfileSpans with cycle detection and orphan resolution.
 */
export function buildSpanTree(spans: ProfileSpan[]): ProfileSpan[] {
  if (!spans || spans.length === 0) return [];

  const map = new Map<string, ProfileSpan>();
  const normalizedSpans = spans.map((s) => ({
    ...normalizeSpan(s),
    children: [] as ProfileSpan[],
  }));

  for (const span of normalizedSpans) {
    map.set(span.id, span);
  }

  const roots: ProfileSpan[] = [];

  function hasCycle(currentId: string, ancestorId: string): boolean {
    if (currentId === ancestorId) return true;
    let curr = map.get(ancestorId);
    while (curr && curr.parentId) {
      if (curr.parentId === currentId) return true;
      curr = map.get(curr.parentId);
    }
    return false;
  }

  for (const span of normalizedSpans) {
    if (!span.parentId || !map.has(span.parentId) || hasCycle(span.id, span.parentId)) {
      roots.push(span);
    } else {
      const parent = map.get(span.parentId);
      if (parent) {
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(span);
      } else {
        roots.push(span);
      }
    }
  }

  // Sort children by startTime
  function sortTree(nodes: ProfileSpan[]): void {
    nodes.sort((a, b) => a.startTime - b.startTime || a.endTime - b.endTime);
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        sortTree(node.children);
      }
    }
  }

  sortTree(roots);
  return roots;
}

/**
 * Flattens a span tree into linear FlamegraphNodes with depth and self-time computed.
 */
export function flattenSpanTree(
  rootSpans: ProfileSpan[],
  options?: FlattenOptions,
): FlamegraphNode[] {
  const result: FlamegraphNode[] = [];
  const visited = new Set<string>();

  function traverse(node: ProfileSpan, depth: number) {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    const childSpans = node.children ?? [];
    const childIds = childSpans.map((c) => c.id);
    const childrenDuration = childSpans.reduce((sum, c) => sum + (c.duration || 0), 0);
    const selfTime = Math.max(0, (node.duration || 0) - childrenDuration);

    const isMatch = options?.filterOptions
      ? searchMatchesSpan(node, options.filterOptions.searchQuery) &&
        matchesFilterOptions(node, options.filterOptions)
      : true;

    const flameNode: FlamegraphNode = {
      span: node,
      id: node.id,
      parentId: node.parentId ?? null,
      name: node.name,
      agentId: node.agentId ?? "unknown",
      tier: node.tier,
      status: node.status,
      category: node.category,
      startTime: node.startTime,
      endTime: node.endTime,
      duration: node.duration,
      selfTime,
      tokens: node.tokens,
      costUsd: node.costUsd,
      depth,
      xPct: 0,
      widthPct: 100,
      hasChildren: childSpans.length > 0,
      childIds,
      isMatchedBySearch: isMatch,
      color: "#818cf8",
    };

    result.push(flameNode);

    for (const child of childSpans) {
      traverse(child, depth + 1);
    }
  }

  for (const root of rootSpans) {
    traverse(root, 0);
  }

  return result;
}

/**
 * Checks if a span matches the search query.
 */
export function searchMatchesSpan(span: ProfileSpan, query?: string): boolean {
  if (!query || !query.trim()) return true;
  const q = query.trim().toLowerCase();

  if (span.name.toLowerCase().includes(q)) return true;
  if (span.id.toLowerCase().includes(q)) return true;
  if (span.agentId && span.agentId.toLowerCase().includes(q)) return true;
  if (span.agentRole && span.agentRole.toLowerCase().includes(q)) return true;
  if (span.tier.toLowerCase().includes(q)) return true;
  if (span.category.toLowerCase().includes(q)) return true;
  if (span.status.toLowerCase().includes(q)) return true;
  if (span.error && span.error.toLowerCase().includes(q)) return true;
  if (span.tags && span.tags.some((t) => t.toLowerCase().includes(q))) return true;

  if (span.metadata) {
    for (const [k, v] of Object.entries(span.metadata)) {
      if (k.toLowerCase().includes(q)) return true;
      if (typeof v === "string" && v.toLowerCase().includes(q)) return true;
      if (typeof v === "number" && String(v).includes(q)) return true;
    }
  }

  return false;
}

export function matchesFilterOptions(
  span: ProfileSpan,
  filterOptions: FlamegraphFilterOptions,
): boolean {
  if (filterOptions.tierFilter !== "all" && span.tier !== filterOptions.tierFilter) {
    return false;
  }
  if (filterOptions.statusFilter !== "all" && span.status !== filterOptions.statusFilter) {
    return false;
  }
  if (filterOptions.categoryFilter !== "all" && span.category !== filterOptions.categoryFilter) {
    return false;
  }
  if (filterOptions.agentFilter !== "all" && span.agentId !== filterOptions.agentFilter) {
    return false;
  }
  if (filterOptions.minDurationMs !== undefined && span.duration < filterOptions.minDurationMs) {
    return false;
  }
  return true;
}

/**
 * Computes layout coordinates (xPct, widthPct, color, maxDepth) for Flamegraph nodes.
 */
export function computeFlamegraphLayout(
  spans: ProfileSpan[],
  options?: Partial<LayoutOptions>,
): {
  nodes: FlamegraphNode[];
  maxDepth: number;
  totalWidthPct: number;
  metrics: FlamegraphMetrics;
} {
  const filterOptions = options?.filterOptions ?? {
    tierFilter: "all",
    statusFilter: "all",
    categoryFilter: "all",
    agentFilter: "all",
    searchQuery: "",
    minDurationMs: 0,
  };
  const colorScheme = options?.colorScheme ?? "tier";
  const zoomFactor = Math.max(1, Math.min(50, sanitizeNumber(options?.zoom, 1)));
  const panOffsetPct = sanitizeNumber(options?.panOffsetPct, 0);

  const tree = buildSpanTree(spans);
  const flattened = flattenSpanTree(tree, {
    filterOptions,
  });
  const metrics = computeMetrics(spans);

  const defaultViewportStart = metrics.minStartTime;
  const defaultViewportEnd = Math.max(defaultViewportStart + 1, metrics.maxEndTime);

  const optStart =
    options?.viewport?.start !== undefined ? options.viewport.start : defaultViewportStart;
  const optEnd = options?.viewport?.end !== undefined ? options.viewport.end : defaultViewportEnd;

  const vStart = Math.max(metrics.minStartTime, optStart);
  const vEnd = Math.max(vStart + 1, Math.min(Math.max(metrics.maxEndTime, vStart + 1), optEnd));
  const vDuration = Math.max(1, vEnd - vStart);

  const maxTokens = Math.max(1, metrics.totalTokens.totalTokens);
  const maxLatency = Math.max(1, metrics.totalDurationMs);

  let maxDepth = 0;

  const nodes = flattened.map((node) => {
    if (node.depth > maxDepth) {
      maxDepth = node.depth;
    }

    // Viewport-based percentage
    const viewRelStart = node.startTime - vStart;

    let xPct = (viewRelStart / vDuration) * 100 * zoomFactor + panOffsetPct;
    let widthPct = ((node.endTime - node.startTime) / vDuration) * 100 * zoomFactor;

    // Minimum visible width if duration > 0
    if (widthPct < 0.2 && node.duration > 0) {
      widthPct = 0.2;
    } else if (widthPct <= 0) {
      widthPct = 0.1;
    }

    const color = getSpanColor(node.span, colorScheme, {
      maxTokens,
      maxLatency,
    });

    const isMatch =
      searchMatchesSpan(node.span, filterOptions.searchQuery) &&
      matchesFilterOptions(node.span, filterOptions);

    return {
      ...node,
      xPct,
      widthPct,
      color,
      isMatchedBySearch: isMatch,
    };
  });

  return {
    nodes,
    maxDepth,
    totalWidthPct: 100 * zoomFactor,
    metrics,
  };
}

/**
 * Computes comprehensive telemetry metrics across all spans.
 */
export function computeMetrics(spans: ProfileSpan[]): FlamegraphMetrics {
  if (!spans || spans.length === 0) {
    return {
      totalSpans: 0,
      totalDurationMs: 0,
      activeExecutionMs: 0,
      minStartTime: 0,
      maxEndTime: 0,
      totalTokens: {
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0,
        totalTokens: 0,
      },
      maxDepth: 0,
      concurrencyPeak: 0,
      latencyP50: 0,
      latencyP95: 0,
      latencyP99: 0,
      agentBreakdown: {},
      statusCounts: {
        pending: 0,
        running: 0,
        success: 0,
        error: 0,
        cancelled: 0,
      },
      tierCounts: {
        root: 0,
        coordinator: 0,
        subagent: 0,
        worker: 0,
        tool: 0,
        gate: 0,
        system: 0,
      },
      categoryCounts: {
        agent_cascade: 0,
        llm_call: 0,
        tool_execution: 0,
        task_lease: 0,
        validator_gate: 0,
        custom: 0,
      },
    };
  }

  let minStartTime = Number.MAX_SAFE_INTEGER;
  let maxEndTime = Number.MIN_SAFE_INTEGER;
  let promptTokens = 0;
  let completionTokens = 0;
  let reasoningTokens = 0;
  let totalTokens = 0;
  // Stays undefined until a span reports dollars, so an unpriced profile totals to nothing at all.
  let totalCostUsd: number | undefined;

  const latencies: number[] = [];
  const statusCounts: Record<SpanStatus, number> = {
    pending: 0,
    running: 0,
    success: 0,
    error: 0,
    cancelled: 0,
  };
  const tierCounts: Record<SpanTier, number> = {
    root: 0,
    coordinator: 0,
    subagent: 0,
    worker: 0,
    tool: 0,
    gate: 0,
    system: 0,
  };
  const categoryCounts: Record<SpanCategory, number> = {
    agent_cascade: 0,
    llm_call: 0,
    tool_execution: 0,
    task_lease: 0,
    validator_gate: 0,
    custom: 0,
  };
  const agentBreakdown: Record<string, AgentMetricBreakdown> = {};

  // For concurrency peak calculation (events sweep)
  interface SweepEvent {
    time: number;
    delta: number;
  }
  const sweepEvents: SweepEvent[] = [];

  // Interval union calculation for active execution time
  interface Interval {
    start: number;
    end: number;
  }
  const intervals: Interval[] = [];

  for (const s of spans) {
    const span = normalizeSpan(s);
    if (span.startTime < minStartTime) minStartTime = span.startTime;
    if (span.endTime > maxEndTime) maxEndTime = span.endTime;

    promptTokens += span.tokens.promptTokens;
    completionTokens += span.tokens.completionTokens;
    reasoningTokens += span.tokens.reasoningTokens;
    totalTokens += span.tokens.totalTokens;
    if (span.costUsd !== undefined) totalCostUsd = (totalCostUsd ?? 0) + span.costUsd;

    latencies.push(span.duration);

    statusCounts[span.status] = (statusCounts[span.status] || 0) + 1;
    tierCounts[span.tier] = (tierCounts[span.tier] || 0) + 1;
    categoryCounts[span.category] = (categoryCounts[span.category] || 0) + 1;

    // Agent breakdown
    const aId = span.agentId || "unknown";
    if (!agentBreakdown[aId]) {
      agentBreakdown[aId] = {
        agentId: aId,
        agentRole: span.agentRole || aId,
        spanCount: 0,
        durationMs: 0,
        tokens: {
          promptTokens: 0,
          completionTokens: 0,
          reasoningTokens: 0,
          totalTokens: 0,
        },
      };
    }
    agentBreakdown[aId].spanCount += 1;
    agentBreakdown[aId].durationMs += span.duration;
    agentBreakdown[aId].tokens.promptTokens += span.tokens.promptTokens;
    agentBreakdown[aId].tokens.completionTokens += span.tokens.completionTokens;
    agentBreakdown[aId].tokens.reasoningTokens += span.tokens.reasoningTokens;
    agentBreakdown[aId].tokens.totalTokens += span.tokens.totalTokens;
    if (span.costUsd !== undefined) {
      agentBreakdown[aId].costUsd = (agentBreakdown[aId].costUsd ?? 0) + span.costUsd;
    }

    if (span.duration > 0) {
      sweepEvents.push({ time: span.startTime, delta: 1 });
      sweepEvents.push({ time: span.endTime, delta: -1 });
      intervals.push({ start: span.startTime, end: span.endTime });
    }
  }

  if (minStartTime === Number.MAX_SAFE_INTEGER) minStartTime = 0;
  if (maxEndTime === Number.MIN_SAFE_INTEGER) maxEndTime = 0;

  const totalDurationMs = Math.max(0, maxEndTime - minStartTime);

  // Concurrency peak
  sweepEvents.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let currentConcurrency = 0;
  let concurrencyPeak = spans.length > 0 ? 1 : 0;
  for (const ev of sweepEvents) {
    currentConcurrency += ev.delta;
    if (currentConcurrency > concurrencyPeak) {
      concurrencyPeak = currentConcurrency;
    }
  }

  // Active execution time (merging overlapping intervals)
  intervals.sort((a, b) => a.start - b.start);
  let activeExecutionMs = 0;
  if (intervals.length > 0) {
    let currStart = intervals[0].start;
    let currEnd = intervals[0].end;
    for (let i = 1; i < intervals.length; i++) {
      const next = intervals[i];
      if (next.start <= currEnd) {
        currEnd = Math.max(currEnd, next.end);
      } else {
        activeExecutionMs += currEnd - currStart;
        currStart = next.start;
        currEnd = next.end;
      }
    }
    activeExecutionMs += currEnd - currStart;
  }

  // Latency percentiles
  latencies.sort((a, b) => a - b);
  const latencyP50 = calculatePercentile(latencies, 50);
  const latencyP95 = calculatePercentile(latencies, 95);
  const latencyP99 = calculatePercentile(latencies, 99);

  // Depth calculation
  const tree = buildSpanTree(spans);
  const flattened = flattenSpanTree(tree);
  let maxDepth = 0;
  for (const node of flattened) {
    if (node.depth > maxDepth) {
      maxDepth = node.depth;
    }
  }

  return {
    totalSpans: spans.length,
    totalDurationMs,
    activeExecutionMs,
    minStartTime,
    maxEndTime,
    totalTokens: {
      promptTokens,
      completionTokens,
      reasoningTokens,
      totalTokens,
    },
    totalCostUsd,
    maxDepth,
    concurrencyPeak,
    latencyP50,
    latencyP95,
    latencyP99,
    agentBreakdown,
    statusCounts,
    tierCounts,
    categoryCounts,
  };
}

/**
 * Calculates a percentile value from a sorted array of numbers.
 */
export function calculatePercentile(sortedValues: number[], percentile: number): number {
  if (!sortedValues || sortedValues.length === 0) return 0;
  if (percentile <= 0) return sortedValues[0];
  if (percentile >= 100) return sortedValues[sortedValues.length - 1];

  const index = (percentile / 100) * (sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

/**
 * Computes color for span according to color scheme.
 */
export function getSpanColor(
  span: ProfileSpan,
  scheme: ColorScheme,
  metrics?: { maxTokens?: number; maxLatency?: number },
): string {
  switch (scheme) {
    case "tier": {
      switch (span.tier) {
        case "root":
          return "#6366f1"; // Indigo
        case "coordinator":
          return "#8b5cf6"; // Purple
        case "subagent":
          return "#3b82f6"; // Blue
        case "worker":
          return "#06b6d4"; // Cyan
        case "tool":
          return "#10b981"; // Emerald
        case "gate":
          return "#f59e0b"; // Amber
        case "system":
          return "#64748b"; // Slate
        default:
          return "#818cf8";
      }
    }
    case "status": {
      switch (span.status) {
        case "success":
          return "#10b981"; // Green
        case "error":
          return "#ef4444"; // Red
        case "running":
          return "#f59e0b"; // Amber
        case "pending":
          return "#6b7280"; // Gray
        case "cancelled":
          return "#9ca3af"; // Light Gray
        default:
          return "#10b981";
      }
    }
    case "tokens": {
      const maxTokens = Math.max(1, metrics?.maxTokens ?? 5000);
      const ratio = Math.min(1, Math.max(0, span.tokens.totalTokens / maxTokens));
      // Heatmap scale: Cyan -> Blue -> Purple -> Hot Pink
      const hue = Math.round(190 - ratio * 150); // 190 (cyan) down to 40 (amber/pink)
      const saturation = 80 + Math.round(ratio * 15);
      const lightness = 45 + Math.round(ratio * 10);
      return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }
    case "latency": {
      const maxLatency = Math.max(1, metrics?.maxLatency ?? 1000);
      const ratio = Math.min(1, Math.max(0, span.duration / maxLatency));
      // Heatmap scale: Emerald (140) -> Amber (45) -> Red (0)
      const hue = Math.round(140 - ratio * 140);
      const lightness = 45 + Math.round(ratio * 5);
      return `hsl(${hue}, 85%, ${lightness}%)`;
    }
    case "agent":
    default: {
      const str = span.agentId || span.name || "default";
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      const hue = Math.abs(hash) % 360;
      return `hsl(${hue}, 70%, 55%)`;
    }
  }
}

/**
 * Clamps viewport range within timeline bounds.
 */
export function clampRange(range: ViewportRange, bounds: ViewportRange): ViewportRange {
  const min = Math.min(bounds.start, bounds.end);
  const max = Math.max(bounds.start, bounds.end);

  let start = sanitizeNumber(range.start, min, min, max);
  let end = sanitizeNumber(range.end, max, min, max);

  if (start > end) {
    const temp = start;
    start = end;
    end = temp;
  }

  if (end - start < 1 && max > min) {
    if (end < max) {
      end = Math.min(max, start + 1);
    } else {
      start = Math.max(min, end - 1);
    }
  }

  return { start, end };
}

/**
 * Format duration in ms to human readable format (ms, s, min).
 */
export function formatDuration(ms: number): string {
  if (typeof ms !== "number" || isNaN(ms) || ms < 0) return "0ms";
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(ms % 1 === 0 ? 0 : 1)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(1);
  return `${mins}m ${secs}s`;
}

/**
 * Format token count with K / M suffix.
 */
export function formatTokens(count: number): string {
  if (typeof count !== "number" || isNaN(count) || count <= 0) return "0";
  if (count < 1000) return count.toLocaleString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}k`;
  return `${(count / 1000000).toFixed(2)}M`;
}

/**
 * Format timestamp into standard display string.
 */
export function formatTimestamp(ms: number): string {
  if (typeof ms !== "number" || isNaN(ms)) return "0ms";
  if (ms < 1000) return `+${ms.toFixed(0)}ms`;
  if (ms < 60000) return `+${(ms / 1000).toFixed(2)}s`;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(1);
  return `+${m}m ${s}s`;
}

/**
 * Format USD cost.
 */
export function formatCostUsd(usd: number | undefined): string {
  if (usd === undefined) return UNKNOWN_LABEL;
  if (typeof usd !== "number" || isNaN(usd) || usd <= 0) return "$0.0000";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
