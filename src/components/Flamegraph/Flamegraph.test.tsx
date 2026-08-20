import { beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import {
  buildSpanTree,
  calculatePercentile,
  clampRange,
  computeFlamegraphLayout,
  computeMetrics,
  flattenSpanTree,
  formatCostUsd,
  formatDuration,
  formatTimestamp,
  formatTokens,
  getSpanColor,
  matchesFilterOptions,
  normalizeSpan,
  sanitizeNumber,
  sanitizeTokenMetrics,
  searchMatchesSpan,
} from "./flamegraphEngine";
import { createFlamegraphStore, useFlamegraphStore } from "../../store/useFlamegraphStore";
import type { FlamegraphFilterOptions, ProfileSpan } from "./types";
import {
  FlamegraphDetailDrawer,
  FlamegraphMetricsSummary,
  FlamegraphScrubber,
  FlamegraphSpanBar,
  FlamegraphView,
} from "./index";

const sampleSpans: ProfileSpan[] = [
  {
    id: "span-root-1",
    parentId: null,
    name: "Orchestrator Goal Planner",
    agentId: "meta-orchestrator",
    agentRole: "orchestrator",
    tier: "root",
    status: "success",
    category: "agent_cascade",
    startTime: 0,
    endTime: 1000,
    duration: 1000,
    tokens: {
      promptTokens: 1200,
      completionTokens: 300,
      reasoningTokens: 500,
      totalTokens: 2000,
    },
    costUsd: 0.05,
    tags: ["root", "planning"],
    metadata: { model: "gemini-2.5-pro", temperature: 0.2 },
  },
  {
    id: "span-subagent-1",
    parentId: "span-root-1",
    name: "Implementer 1 Task Execution",
    agentId: "implementer-01",
    agentRole: "implementer",
    tier: "subagent",
    status: "success",
    category: "task_lease",
    startTime: 100,
    endTime: 600,
    duration: 500,
    tokens: {
      promptTokens: 2000,
      completionTokens: 800,
      reasoningTokens: 1200,
      totalTokens: 4000,
    },
    costUsd: 0.1,
    tags: ["task", "diffing"],
  },
  {
    id: "span-tool-1",
    parentId: "span-subagent-1",
    name: "tool:run_command (bun test)",
    agentId: "implementer-01",
    agentRole: "implementer",
    tier: "tool",
    status: "success",
    category: "tool_execution",
    startTime: 150,
    endTime: 300,
    duration: 150,
    tokens: {
      promptTokens: 100,
      completionTokens: 50,
      reasoningTokens: 0,
      totalTokens: 150,
    },
    costUsd: 0.002,
  },
  {
    id: "span-subagent-2",
    parentId: "span-root-1",
    name: "Implementer 2 Flamegraph Profiler",
    agentId: "implementer-02",
    agentRole: "implementer",
    tier: "subagent",
    status: "running",
    category: "task_lease",
    startTime: 400,
    endTime: 900,
    duration: 500,
    tokens: {
      promptTokens: 1500,
      completionTokens: 500,
      reasoningTokens: 1000,
      totalTokens: 3000,
    },
    costUsd: 0.08,
  },
  {
    id: "span-gate-1",
    parentId: "span-subagent-2",
    name: "gate:validator_audit",
    agentId: "validator-01",
    agentRole: "validator",
    tier: "gate",
    status: "error",
    category: "validator_gate",
    startTime: 700,
    endTime: 850,
    duration: 150,
    tokens: {
      promptTokens: 500,
      completionTokens: 100,
      reasoningTokens: 200,
      totalTokens: 800,
    },
    error: "Gate check failed with coverage deficit",
    costUsd: 0.02,
  },
];

function resetStore() {
  act(() => {
    useFlamegraphStore.getState().clearSpans();
    useFlamegraphStore.getState().setSpans(sampleSpans);
    useFlamegraphStore.getState().setColorScheme("tier");
    useFlamegraphStore.getState().setSearchQuery("");
    useFlamegraphStore.getState().setTierFilter("all");
    useFlamegraphStore.getState().setStatusFilter("all");
    useFlamegraphStore.getState().setCategoryFilter("all");
    useFlamegraphStore.getState().setAgentFilter("all");
    useFlamegraphStore.getState().setMinDurationMs(0);
    useFlamegraphStore.getState().resetZoom();
  });
}

beforeEach(() => {
  resetStore();
});

describe("Flamegraph Engine & Pure Computation", () => {
  describe("sanitizeNumber & sanitizeTokenMetrics", () => {
    it("handles valid, invalid, and boundary numbers", () => {
      expect(sanitizeNumber(100)).toBe(100);
      expect(sanitizeNumber("invalid", 5)).toBe(5);
      expect(sanitizeNumber(NaN, 10)).toBe(10);
      expect(sanitizeNumber(Infinity, 0, 0, 100)).toBe(0);
      expect(sanitizeNumber(150, 0, 0, 100)).toBe(100);
      expect(sanitizeNumber(-50, 0, 0, 100)).toBe(0);
    });

    it("sanitizes token metrics with fallback and auto-sum total", () => {
      const tokens = sanitizeTokenMetrics({
        promptTokens: 100.8,
        completionTokens: 200.4,
        reasoningTokens: 300,
      });
      expect(tokens.promptTokens).toBe(100);
      expect(tokens.completionTokens).toBe(200);
      expect(tokens.reasoningTokens).toBe(300);
      expect(tokens.totalTokens).toBe(600);

      const emptyTokens = sanitizeTokenMetrics(null);
      expect(emptyTokens.promptTokens).toBe(0);
      expect(emptyTokens.totalTokens).toBe(0);
    });
  });

  describe("normalizeSpan", () => {
    it("fills defaults and enforces valid fields", () => {
      const raw: Partial<ProfileSpan> = {
        name: "Test Span",
        startTime: 50,
        endTime: 20, // inverted
      };
      const normalized = normalizeSpan(raw);
      expect(normalized.name).toBe("Test Span");
      expect(normalized.startTime).toBe(50);
      expect(normalized.endTime).toBe(50); // clamped to startTime
      expect(normalized.duration).toBe(0);
      expect(normalized.tier).toBe("subagent");
      expect(normalized.status).toBe("success");
      expect(normalized.category).toBe("agent_cascade");
      expect(normalized.id).toBeDefined();
    });

    it("preserves explicit valid tiers, statuses, and categories", () => {
      const span = normalizeSpan({
        id: "s1",
        tier: "coordinator",
        status: "cancelled",
        category: "validator_gate",
        startTime: 10,
        endTime: 40,
        tags: ["a", "b"],
      });
      expect(span.tier).toBe("coordinator");
      expect(span.status).toBe("cancelled");
      expect(span.category).toBe("validator_gate");
      expect(span.duration).toBe(30);
      expect(span.tags).toEqual(["a", "b"]);
    });
  });

  describe("buildSpanTree & flattenSpanTree", () => {
    it("builds hierarchy correctly with children sorted chronologically", () => {
      const tree = buildSpanTree(sampleSpans);
      expect(tree.length).toBe(1);
      expect(tree[0].id).toBe("span-root-1");
      expect(tree[0].children?.length).toBe(2);

      const sub1 = tree[0].children?.[0];
      const sub2 = tree[0].children?.[1];
      expect(sub1?.id).toBe("span-subagent-1");
      expect(sub2?.id).toBe("span-subagent-2");

      expect(sub1?.children?.length).toBe(1);
      expect(sub1?.children?.[0].id).toBe("span-tool-1");

      expect(sub2?.children?.length).toBe(1);
      expect(sub2?.children?.[0].id).toBe("span-gate-1");
    });

    it("handles empty arrays and null parent references safely", () => {
      expect(buildSpanTree([])).toEqual([]);

      const orphans: ProfileSpan[] = [
        normalizeSpan({ id: "orphan-1", parentId: "nonexistent" }),
        normalizeSpan({ id: "orphan-2", parentId: "also-nonexistent" }),
      ];
      const tree = buildSpanTree(orphans);
      expect(tree.length).toBe(2);
    });

    it("prevents circular recursion cycles", () => {
      const cyclic: ProfileSpan[] = [
        normalizeSpan({ id: "c1", parentId: "c2" }),
        normalizeSpan({ id: "c2", parentId: "c1" }),
      ];
      const tree = buildSpanTree(cyclic);
      expect(tree.length).toBeGreaterThan(0);
      const flattened = flattenSpanTree(tree);
      expect(flattened.length).toBe(2);
    });

    it("flattens tree into FlamegraphNodes with depth and self-time calculation", () => {
      const tree = buildSpanTree(sampleSpans);
      const flattened = flattenSpanTree(tree);

      expect(flattened.length).toBe(5);

      const rootNode = flattened.find((n) => n.id === "span-root-1");
      expect(rootNode?.depth).toBe(0);
      expect(rootNode?.hasChildren).toBe(true);
      expect(rootNode?.childIds).toEqual(["span-subagent-1", "span-subagent-2"]);
      // Root duration 1000, children sum 500 + 500 = 1000 -> selfTime = 0
      expect(rootNode?.selfTime).toBe(0);

      const sub1Node = flattened.find((n) => n.id === "span-subagent-1");
      expect(sub1Node?.depth).toBe(1);
      // Sub1 duration 500, child duration 150 -> selfTime = 350
      expect(sub1Node?.selfTime).toBe(350);

      const toolNode = flattened.find((n) => n.id === "span-tool-1");
      expect(toolNode?.depth).toBe(2);
      expect(toolNode?.hasChildren).toBe(false);
      expect(toolNode?.selfTime).toBe(150);
    });
  });

  describe("searchMatchesSpan & matchesFilterOptions", () => {
    const testSpan = sampleSpans[0];

    it("matches span by name, agentId, tags, metadata, and role", () => {
      expect(searchMatchesSpan(testSpan, "Orchestrator")).toBe(true);
      expect(searchMatchesSpan(testSpan, "meta-orchestrator")).toBe(true);
      expect(searchMatchesSpan(testSpan, "planning")).toBe(true);
      expect(searchMatchesSpan(testSpan, "gemini-2.5-pro")).toBe(true);
      expect(searchMatchesSpan(testSpan, "nonexistent-query")).toBe(false);
      expect(searchMatchesSpan(testSpan, "")).toBe(true);
    });

    it("filters spans by tier, status, category, agent, and minDuration", () => {
      const defaultFilters: FlamegraphFilterOptions = {
        tierFilter: "all",
        statusFilter: "all",
        categoryFilter: "all",
        agentFilter: "all",
        searchQuery: "",
        minDurationMs: 0,
      };

      expect(matchesFilterOptions(testSpan, defaultFilters)).toBe(true);

      expect(matchesFilterOptions(testSpan, { ...defaultFilters, tierFilter: "root" })).toBe(true);
      expect(matchesFilterOptions(testSpan, { ...defaultFilters, tierFilter: "worker" })).toBe(
        false,
      );

      expect(matchesFilterOptions(testSpan, { ...defaultFilters, statusFilter: "success" })).toBe(
        true,
      );
      expect(matchesFilterOptions(testSpan, { ...defaultFilters, statusFilter: "error" })).toBe(
        false,
      );

      expect(
        matchesFilterOptions(testSpan, { ...defaultFilters, categoryFilter: "agent_cascade" }),
      ).toBe(true);
      expect(
        matchesFilterOptions(testSpan, { ...defaultFilters, categoryFilter: "llm_call" }),
      ).toBe(false);

      expect(
        matchesFilterOptions(testSpan, { ...defaultFilters, agentFilter: "meta-orchestrator" }),
      ).toBe(true);
      expect(
        matchesFilterOptions(testSpan, { ...defaultFilters, agentFilter: "other-agent" }),
      ).toBe(false);

      expect(matchesFilterOptions(testSpan, { ...defaultFilters, minDurationMs: 500 })).toBe(true);
      expect(matchesFilterOptions(testSpan, { ...defaultFilters, minDurationMs: 2000 })).toBe(
        false,
      );
    });
  });

  describe("computeMetrics", () => {
    it("returns zeroed metrics for empty span array", () => {
      const metrics = computeMetrics([]);
      expect(metrics.totalSpans).toBe(0);
      expect(metrics.totalDurationMs).toBe(0);
      expect(metrics.totalTokens.totalTokens).toBe(0);
      expect(metrics.concurrencyPeak).toBe(0);
    });

    it("computes accurate aggregate metrics across sample spans", () => {
      const metrics = computeMetrics(sampleSpans);
      expect(metrics.totalSpans).toBe(5);
      expect(metrics.minStartTime).toBe(0);
      expect(metrics.maxEndTime).toBe(1000);
      expect(metrics.totalDurationMs).toBe(1000);
      expect(metrics.activeExecutionMs).toBe(1000);

      // Total tokens: 2000 + 4000 + 150 + 3000 + 800 = 9950
      expect(metrics.totalTokens.totalTokens).toBe(9950);
      expect(metrics.totalTokens.promptTokens).toBe(1200 + 2000 + 100 + 1500 + 500); // 5300
      expect(metrics.totalTokens.completionTokens).toBe(300 + 800 + 50 + 500 + 100); // 1750
      expect(metrics.totalTokens.reasoningTokens).toBe(500 + 1200 + 0 + 1000 + 200); // 2900

      // Concurrency peak: at time 450, root, sub1, and sub2 are active = 3
      expect(metrics.concurrencyPeak).toBeGreaterThanOrEqual(2);

      // Max depth: root (0) -> subagent (1) -> tool/gate (2) = 2
      expect(metrics.maxDepth).toBe(2);

      // Status counts
      expect(metrics.statusCounts.success).toBe(3);
      expect(metrics.statusCounts.running).toBe(1);
      expect(metrics.statusCounts.error).toBe(1);

      // Tier counts
      expect(metrics.tierCounts.root).toBe(1);
      expect(metrics.tierCounts.subagent).toBe(2);
      expect(metrics.tierCounts.tool).toBe(1);
      expect(metrics.tierCounts.gate).toBe(1);

      // Agent breakdown
      expect(metrics.agentBreakdown["meta-orchestrator"]?.spanCount).toBe(1);
      expect(metrics.agentBreakdown["implementer-01"]?.spanCount).toBe(2);
      expect(metrics.agentBreakdown["implementer-02"]?.spanCount).toBe(1);
      expect(metrics.agentBreakdown["validator-01"]?.spanCount).toBe(1);
    });

    it("calculates percentiles correctly", () => {
      const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      expect(calculatePercentile(values, 0)).toBe(10);
      expect(calculatePercentile(values, 50)).toBe(55);
      expect(calculatePercentile(values, 100)).toBe(100);
      expect(calculatePercentile([], 50)).toBe(0);
    });
  });

  describe("getSpanColor", () => {
    it("returns proper colors for tier, status, tokens, latency, and agent schemes", () => {
      const span = sampleSpans[0];
      expect(getSpanColor(span, "tier")).toBe("#6366f1");
      expect(getSpanColor(span, "status")).toBe("#10b981");

      const errSpan = sampleSpans[4];
      expect(getSpanColor(errSpan, "status")).toBe("#ef4444");

      const tokenColor = getSpanColor(span, "tokens", { maxTokens: 5000 });
      expect(tokenColor.startsWith("hsl")).toBe(true);

      const latencyColor = getSpanColor(span, "latency", { maxLatency: 2000 });
      expect(latencyColor.startsWith("hsl")).toBe(true);

      const agentColor = getSpanColor(span, "agent");
      expect(agentColor.startsWith("hsl")).toBe(true);
    });
  });

  describe("clampRange & formatters", () => {
    it("clamps viewport range correctly within bounds", () => {
      const bounds = { start: 0, end: 1000 };
      expect(clampRange({ start: -100, end: 500 }, bounds)).toEqual({ start: 0, end: 500 });
      expect(clampRange({ start: 200, end: 1500 }, bounds)).toEqual({ start: 200, end: 1000 });
      expect(clampRange({ start: 800, end: 400 }, bounds)).toEqual({ start: 400, end: 800 });
    });

    it("formats durations, tokens, timestamps, and cost cleanly", () => {
      expect(formatDuration(0.5)).toBe("500µs");
      expect(formatDuration(450)).toBe("450ms");
      expect(formatDuration(1500)).toBe("1.50s");
      expect(formatDuration(65000)).toBe("1m 5.0s");

      expect(formatTokens(0)).toBe("0");
      expect(formatTokens(850)).toBe("850");
      expect(formatTokens(2500)).toBe("2.5k");
      expect(formatTokens(1500000)).toBe("1.50M");

      expect(formatTimestamp(120)).toBe("+120ms");
      expect(formatTimestamp(4500)).toBe("+4.50s");

      expect(formatCostUsd(undefined)).toBe("unknown");
      expect(formatCostUsd(0)).toBe("$0.0000");
      expect(formatCostUsd(0.0025)).toBe("$0.0025");
      expect(formatCostUsd(1.5)).toBe("$1.50");
    });
  });

  describe("computeFlamegraphLayout", () => {
    it("computes accurate positioning with zoom and search match flags", () => {
      const layout = computeFlamegraphLayout(sampleSpans, {
        viewport: { start: 0, end: 1000 },
        zoom: 1,
        panOffsetPct: 0,
        colorScheme: "tier",
        filterOptions: {
          tierFilter: "all",
          statusFilter: "all",
          categoryFilter: "all",
          agentFilter: "all",
          searchQuery: "Implementer",
          minDurationMs: 0,
        },
      });

      expect(layout.nodes.length).toBe(5);
      expect(layout.maxDepth).toBe(2);

      const rootNode = layout.nodes.find((n) => n.id === "span-root-1");
      expect(rootNode?.xPct).toBe(0);
      expect(rootNode?.widthPct).toBe(100);
      expect(rootNode?.isMatchedBySearch).toBe(false); // Does not contain "Implementer"

      const sub1Node = layout.nodes.find((n) => n.id === "span-subagent-1");
      expect(sub1Node?.xPct).toBe(10); // 100ms / 1000ms * 100
      expect(sub1Node?.widthPct).toBe(50); // 500ms / 1000ms * 100
      expect(sub1Node?.isMatchedBySearch).toBe(true);
    });
  });
});

describe("Flamegraph Zustand Store", () => {
  it("initializes with provided spans and bounds", () => {
    const store = createFlamegraphStore(sampleSpans);
    const state = store.getState();
    expect(state.spans.length).toBe(5);
    expect(state.timelineBounds.start).toBe(0);
    expect(state.timelineBounds.end).toBe(1000);
    expect(state.zoom).toBe(1);
    expect(state.colorScheme).toBe("tier");
  });

  it("handles adding, updating, removing, and clearing spans", () => {
    const store = createFlamegraphStore();
    expect(store.getState().spans.length).toBe(0);

    store.getState().addSpan({
      id: "new-span-1",
      name: "Dynamic Span",
      startTime: 200,
      endTime: 800,
    });
    expect(store.getState().spans.length).toBe(1);
    expect(store.getState().timelineBounds.end).toBe(800);

    store.getState().updateSpan("new-span-1", { name: "Updated Name", endTime: 1200 });
    expect(store.getState().getSpanById("new-span-1")?.name).toBe("Updated Name");
    expect(store.getState().timelineBounds.end).toBe(1200);

    store.getState().setSelectedSpanId("new-span-1");
    expect(store.getState().selectedSpanId).toBe("new-span-1");
    expect(store.getState().isDrawerOpen).toBe(true);

    store.getState().removeSpan("new-span-1");
    expect(store.getState().spans.length).toBe(0);
    expect(store.getState().selectedSpanId).toBeNull();
    expect(store.getState().isDrawerOpen).toBe(false);
  });

  it("handles zoom, pan, and viewport adjustments with clamping", () => {
    const store = createFlamegraphStore(sampleSpans);
    store.getState().zoomIn();
    expect(store.getState().zoom).toBeCloseTo(1.3, 1);

    store.getState().zoomOut();
    expect(store.getState().zoom).toBeCloseTo(1.0, 1);

    store.getState().setZoom(100); // clamped to max 50
    expect(store.getState().zoom).toBe(50);

    store.getState().setPanOffset(50);
    expect(store.getState().panOffsetPct).toBe(50);

    store.getState().resetZoom();
    expect(store.getState().zoom).toBe(1);
    expect(store.getState().panOffsetPct).toBe(0);

    store.getState().setViewport({ start: 200, end: 700 });
    expect(store.getState().viewport).toEqual({ start: 200, end: 700 });
  });

  it("computes ancestry and children correctly", () => {
    const store = createFlamegraphStore(sampleSpans);
    const gateAncestry = store.getState().getAncestry("span-gate-1");
    expect(gateAncestry.map((s) => s.id)).toEqual(["span-root-1", "span-subagent-2"]);

    const rootChildren = store.getState().getChildren("span-root-1");
    expect(rootChildren.map((s) => s.id)).toEqual(["span-subagent-1", "span-subagent-2"]);
  });

  it("exports and imports profile JSON safely", () => {
    const store = createFlamegraphStore(sampleSpans);
    const jsonStr = store.getState().exportProfileJson();
    expect(typeof jsonStr).toBe("string");

    const newStore = createFlamegraphStore();
    const success = newStore.getState().importProfileJson(jsonStr);
    expect(success).toBe(true);
    expect(newStore.getState().spans.length).toBe(5);

    // Invalid JSON
    expect(newStore.getState().importProfileJson("corrupted {json")).toBe(false);
    expect(newStore.getState().importProfileJson(JSON.stringify({ notSpans: 123 }))).toBe(false);
  });
});

describe("Flamegraph UI Components Rendering & Interaction", () => {
  it("renders FlamegraphSpanBar and handles click/hover/keyboard events", () => {
    let selectedId: string | null = null;
    let hoveredId: string | null = null;

    const node = flattenSpanTree(buildSpanTree(sampleSpans))[0];
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(
        <FlamegraphSpanBar
          node={node}
          isSelected={false}
          isHovered={false}
          onSelect={(id) => {
            selectedId = id;
          }}
          onHover={(id) => {
            hoveredId = id;
          }}
        />,
      );
    });

    const root = renderer!.root;
    const barEl = root.findByProps({ "data-testid": `flamegraph-span-${node.id}` });
    expect(barEl).toBeDefined();

    act(() => {
      barEl.props.onClick({ stopPropagation: () => {} });
    });
    expect(selectedId).toBe(node.id);

    act(() => {
      barEl.props.onMouseEnter();
    });
    expect(hoveredId).toBe(node.id);

    act(() => {
      barEl.props.onMouseLeave();
    });
    expect(hoveredId).toBeNull();

    act(() => {
      barEl.props.onKeyDown({ key: "Enter", preventDefault: () => {} });
    });
    expect(selectedId).toBe(node.id);
  });

  it("renders FlamegraphScrubber with slider inputs and zoom buttons", () => {
    let rangeChanged: Partial<{ start: number; end: number }> | null = null;
    let zoomInCalled = false;
    let zoomOutCalled = false;
    let resetZoomCalled = false;
    let resetScrubberCalled = false;

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <FlamegraphScrubber
          timelineBounds={{ start: 0, end: 1000 }}
          viewport={{ start: 100, end: 800 }}
          spans={sampleSpans}
          zoom={1.5}
          onRangeChange={(range) => {
            rangeChanged = range;
          }}
          onZoomIn={() => {
            zoomInCalled = true;
          }}
          onZoomOut={() => {
            zoomOutCalled = true;
          }}
          onResetZoom={() => {
            resetZoomCalled = true;
          }}
          onResetScrubber={() => {
            resetScrubberCalled = true;
          }}
        />,
      );
    });

    const root = renderer!.root;
    const zoomBadge = root.findByProps({ "data-testid": "zoom-level-badge" });
    expect(zoomBadge.props.children[1]).toBe("1.5x");

    const zoomInBtn = root.findByProps({ "data-testid": "zoom-in-btn" });
    act(() => {
      zoomInBtn.props.onClick();
    });
    expect(zoomInCalled).toBe(true);

    const zoomOutBtn = root.findByProps({ "data-testid": "zoom-out-btn" });
    act(() => {
      zoomOutBtn.props.onClick();
    });
    expect(zoomOutCalled).toBe(true);

    const resetZoomBtn = root.findByProps({ "data-testid": "reset-zoom-btn" });
    act(() => {
      resetZoomBtn.props.onClick();
    });
    expect(resetZoomCalled).toBe(true);

    const resetRangeBtn = root.findByProps({ "data-testid": "reset-scrubber-btn" });
    act(() => {
      resetRangeBtn.props.onClick();
    });
    expect(resetScrubberCalled).toBe(true);

    const startSlider = root.findByProps({ "data-testid": "scrubber-start-slider" });
    act(() => {
      startSlider.props.onChange({ target: { value: "20" } });
    });
    expect(rangeChanged).toEqual({ start: 200 });
  });

  it("renders FlamegraphMetricsSummary with duration, latency, tokens, and concurrency", () => {
    const metrics = computeMetrics(sampleSpans);
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = create(<FlamegraphMetricsSummary metrics={metrics} />);
    });

    const root = renderer!.root;
    expect(root.findByProps({ "data-testid": "metric-duration-card" })).toBeDefined();
    expect(root.findByProps({ "data-testid": "metric-hierarchy-card" })).toBeDefined();
    expect(root.findByProps({ "data-testid": "metric-latency-card" })).toBeDefined();
    expect(root.findByProps({ "data-testid": "metric-tokens-card" })).toBeDefined();
  });

  it("renders FlamegraphDetailDrawer with all sections and handles navigation", () => {
    const span = sampleSpans[4]; // Gate span with error
    const ancestry = [sampleSpans[0], sampleSpans[3]];
    let closed = false;
    let selectedId: string | null = null;

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <FlamegraphDetailDrawer
          span={span}
          ancestry={ancestry}
          childSpans={[]}
          isOpen={true}
          onClose={() => {
            closed = true;
          }}
          onSelectSpan={(id) => {
            selectedId = id;
          }}
        />,
      );
    });

    const root = renderer!.root;
    const nameEl = root.findByProps({ "data-testid": "drawer-span-name" });
    expect(nameEl.props.children).toBe(span.name);

    const errorAlert = root.findByProps({ "data-testid": "drawer-error-alert" });
    expect(errorAlert).toBeDefined();

    const closeBtn = root.findByProps({ "data-testid": "drawer-close-btn" });
    act(() => {
      closeBtn.props.onClick();
    });
    expect(closed).toBe(true);

    // Click ancestry breadcrumb
    const crumbBtn = root.findAllByProps({ className: "ancestry-crumb-btn" })[0];
    act(() => {
      crumbBtn.props.onClick();
    });
    expect(selectedId).toBe(sampleSpans[0].id);
  });

  it("renders full FlamegraphView and interacts with search, filters, and selection", () => {
    const testStore = createFlamegraphStore(sampleSpans);
    let spanSelected: ProfileSpan | null = null;

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <FlamegraphView
          customStore={testStore}
          onSelectSpan={(s) => {
            spanSelected = s;
          }}
        />,
      );
    });

    const root = renderer!.root;
    const titleEl = root.findByProps({ className: "profiler-title" });
    expect(titleEl.props.children).toBe("Token & Latency Flamegraph Profiler");

    // Search input
    const searchInput = root.findByProps({ "data-testid": "flamegraph-search-input" });
    act(() => {
      searchInput.props.onChange({ target: { value: "Flamegraph" } });
    });
    expect(testStore.getState().filterOptions.searchQuery).toBe("Flamegraph");

    // Tier select
    const tierSelect = root.findByProps({ "data-testid": "tier-filter-select" });
    act(() => {
      tierSelect.props.onChange({ target: { value: "subagent" } });
    });
    expect(testStore.getState().filterOptions.tierFilter).toBe("subagent");

    // Status select
    const statusSelect = root.findByProps({ "data-testid": "status-filter-select" });
    act(() => {
      statusSelect.props.onChange({ target: { value: "running" } });
    });
    expect(testStore.getState().filterOptions.statusFilter).toBe("running");

    // Reset filters
    act(() => {
      testStore.getState().setSearchQuery("");
      testStore.getState().setTierFilter("all");
      testStore.getState().setStatusFilter("all");
    });

    // Check depth rows
    expect(root.findByProps({ "data-testid": "flamegraph-row-depth-0" })).toBeDefined();
    expect(root.findByProps({ "data-testid": "flamegraph-row-depth-1" })).toBeDefined();
    expect(root.findByProps({ "data-testid": "flamegraph-row-depth-2" })).toBeDefined();

    // Select span bar
    const spanBar = root.findByProps({ "data-testid": "flamegraph-span-span-root-1" });
    act(() => {
      spanBar.props.onClick({ stopPropagation: () => {} });
    });
    expect((spanSelected as ProfileSpan | null)?.id).toBe("span-root-1");
    expect(testStore.getState().selectedSpanId).toBe("span-root-1");
    expect(testStore.getState().isDrawerOpen).toBe(true);

    // Clear spans
    const clearBtn = root.findByProps({ "data-testid": "clear-spans-btn" });
    act(() => {
      clearBtn.props.onClick();
    });
    expect(testStore.getState().spans.length).toBe(0);
    expect(root.findByProps({ "data-testid": "flamegraph-empty-state" })).toBeDefined();
  });
});

describe("Adversarial Stress Tests & Edge Cases", () => {
  it("handles 150-level deeply nested cascades (>100 levels) without stack overflow", () => {
    const deepSpans: ProfileSpan[] = [];
    for (let i = 0; i < 150; i++) {
      deepSpans.push(
        normalizeSpan({
          id: `deep-${i}`,
          parentId: i === 0 ? null : `deep-${i - 1}`,
          name: `Cascade Level ${i}`,
          startTime: i * 5,
          endTime: 1000 - i * 2,
          tier: i === 0 ? "root" : i % 2 === 0 ? "subagent" : "worker",
          tokens: { promptTokens: 10, completionTokens: 10, reasoningTokens: 10, totalTokens: 30 },
        }),
      );
    }

    const tree = buildSpanTree(deepSpans);
    expect(tree.length).toBe(1);

    const flattened = flattenSpanTree(tree);
    expect(flattened.length).toBe(150);
    expect(flattened[149].depth).toBe(149);

    const metrics = computeMetrics(deepSpans);
    expect(metrics.maxDepth).toBe(149);
    expect(metrics.totalSpans).toBe(150);

    const store = createFlamegraphStore(deepSpans);
    const ancestry = store.getState().getAncestry("deep-149");
    expect(ancestry.length).toBe(149);
    expect(ancestry[0].id).toBe("deep-0");
    expect(ancestry[148].id).toBe("deep-148");

    const layout = computeFlamegraphLayout(deepSpans);
    expect(layout.maxDepth).toBe(149);
    expect(layout.nodes.length).toBe(150);
  });

  it("handles zero-duration spans and sub-millisecond instant events", () => {
    const zeroSpans: ProfileSpan[] = [
      normalizeSpan({
        id: "z1",
        parentId: null,
        name: "Zero Duration Root Event",
        startTime: 100,
        endTime: 100,
        tier: "root",
      }),
      normalizeSpan({
        id: "z2",
        parentId: "z1",
        name: "Zero Duration Sub Event",
        startTime: 100,
        endTime: 100,
        tier: "tool",
      }),
    ];

    expect(zeroSpans[0].duration).toBe(0);
    expect(zeroSpans[1].duration).toBe(0);

    const metrics = computeMetrics(zeroSpans);
    expect(metrics.totalSpans).toBe(2);
    expect(metrics.totalDurationMs).toBe(0);
    expect(metrics.activeExecutionMs).toBe(0);
    expect(metrics.latencyP50).toBe(0);
    expect(metrics.latencyP95).toBe(0);
    expect(metrics.latencyP99).toBe(0);

    const layout = computeFlamegraphLayout(zeroSpans);
    expect(layout.nodes.length).toBe(2);
    // Should have minimum visual width
    expect(layout.nodes[0].widthPct).toBeGreaterThan(0);
    expect(layout.nodes[1].widthPct).toBeGreaterThan(0);

    // Detail drawer rendering
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <FlamegraphDetailDrawer
          span={zeroSpans[0]}
          node={layout.nodes[0]}
          ancestry={[]}
          childSpans={[zeroSpans[1]]}
          isOpen={true}
          onClose={() => {}}
          onSelectSpan={() => {}}
        />,
      );
    });
    const root = renderer!.root;
    expect(root.findByProps({ "data-testid": "drawer-span-name" })).toBeDefined();
  });

  it("handles out-of-order, negative, and inverted timestamps", () => {
    const inverted = normalizeSpan({
      id: "inv-1",
      name: "Inverted Span",
      startTime: 500,
      endTime: 100, // end before start
    });
    expect(inverted.startTime).toBe(500);
    expect(inverted.endTime).toBe(500);
    expect(inverted.duration).toBe(0);

    const negative = normalizeSpan({
      id: "neg-1",
      name: "Negative Timestamp Span",
      startTime: -300,
      endTime: -100,
    });
    expect(negative.startTime).toBe(-300);
    expect(negative.endTime).toBe(-100);
    expect(negative.duration).toBe(200);

    // Out-of-order array with child before parent
    const shuffled: ProfileSpan[] = [
      normalizeSpan({ id: "child-2", parentId: "parent-1", startTime: 300, endTime: 400 }),
      normalizeSpan({ id: "child-1", parentId: "parent-1", startTime: 100, endTime: 200 }),
      normalizeSpan({ id: "parent-1", parentId: null, startTime: 50, endTime: 500 }),
    ];

    const tree = buildSpanTree(shuffled);
    expect(tree.length).toBe(1);
    expect(tree[0].id).toBe("parent-1");
    // Children sorted chronologically
    expect(tree[0].children?.[0].id).toBe("child-1");
    expect(tree[0].children?.[1].id).toBe("child-2");
  });

  it("handles negative and corrupt token metrics gracefully", () => {
    const corruptTokens = sanitizeTokenMetrics({
      promptTokens: -500,
      completionTokens: -200,
      reasoningTokens: -100,
      totalTokens: -800,
    });

    expect(corruptTokens.promptTokens).toBe(0);
    expect(corruptTokens.completionTokens).toBe(0);
    expect(corruptTokens.reasoningTokens).toBe(0);
    expect(corruptTokens.totalTokens).toBe(0);

    const spanWithNegTokens = normalizeSpan({
      id: "neg-tok",
      tokens: {
        promptTokens: -1000,
        completionTokens: -500,
        reasoningTokens: -250,
        totalTokens: -1750,
      },
    });

    expect(spanWithNegTokens.tokens.totalTokens).toBe(0);
    expect(formatTokens(-500)).toBe("0");

    const metrics = computeMetrics([spanWithNegTokens]);
    expect(metrics.totalTokens.totalTokens).toBe(0);
    expect(metrics.totalTokens.promptTokens).toBe(0);
  });

  it("handles extreme scrubber boundaries, zero bounds, and zoom/pan clamping", () => {
    // Zero total duration bounds
    const zeroBounds = { start: 500, end: 500 };
    const clampedZero = clampRange({ start: 300, end: 700 }, zeroBounds);
    expect(clampedZero.start).toBe(500);
    expect(clampedZero.end).toBe(500);

    // Inverted range
    const bounds = { start: 0, end: 1000 };
    const clampedInverted = clampRange({ start: 800, end: 200 }, bounds);
    expect(clampedInverted.start).toBe(200);
    expect(clampedInverted.end).toBe(800);

    // Collapsed range
    const collapsed = clampRange({ start: 400, end: 400 }, bounds);
    expect(collapsed.start).toBe(400);
    expect(collapsed.end).toBe(401);

    // Store zoom and pan bounds
    const store = createFlamegraphStore();
    store.getState().setZoom(0.1); // min clamp to 1
    expect(store.getState().zoom).toBe(1);

    store.getState().setZoom(100); // max clamp to 50
    expect(store.getState().zoom).toBe(50);

    store.getState().setPanOffset(-500); // min clamp to -200
    expect(store.getState().panOffsetPct).toBe(-200);

    store.getState().setPanOffset(500); // max clamp to 200
    expect(store.getState().panOffsetPct).toBe(200);
  });

  it("enforces strict zero-any typing across all Flamegraph source files", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const flamegraphDir = path.resolve(
      (import.meta as unknown as { dir: string }).dir ||
        path.join(process.cwd(), "src/components/Flamegraph"),
    );
    const storeFile = path.resolve(flamegraphDir, "../../store/useFlamegraphStore.ts");

    const filesToAudit = [
      path.join(flamegraphDir, "types.ts"),
      path.join(flamegraphDir, "flamegraphEngine.ts"),
      path.join(flamegraphDir, "FlamegraphSpanBar.tsx"),
      path.join(flamegraphDir, "FlamegraphScrubber.tsx"),
      path.join(flamegraphDir, "FlamegraphMetricsSummary.tsx"),
      path.join(flamegraphDir, "FlamegraphDetailDrawer.tsx"),
      path.join(flamegraphDir, "FlamegraphView.tsx"),
      path.join(flamegraphDir, "index.ts"),
      storeFile,
    ];

    const anyWord = "any";
    const prohibitedPatterns = [
      new RegExp(":\\s*" + anyWord + "\\b"),
      new RegExp("\\bas\\s+" + anyWord + "\\b"),
      new RegExp("<" + anyWord + ">"),
      new RegExp("Promise<" + anyWord + ">"),
      new RegExp("Record<string,\\s*" + anyWord + ">"),
      new RegExp("@ts-" + "ignore"),
      new RegExp("@ts-" + "expect-error"),
      new RegExp("@ts-" + "nocheck"),
      new RegExp("eslint-" + "disable"),
    ];

    for (const filePath of filesToAudit) {
      const content = await fs.readFile(filePath, "utf-8");
      for (const pattern of prohibitedPatterns) {
        const matches = content.match(pattern);
        expect(matches).toBeNull();
      }
    }
  });

  it("handles high concurrency overlap with 50 parallel spans", () => {
    const parallelSpans: ProfileSpan[] = [];
    for (let i = 0; i < 50; i++) {
      parallelSpans.push(
        normalizeSpan({
          id: `par-${i}`,
          parentId: null,
          name: `Parallel Worker ${i}`,
          startTime: 100,
          endTime: 500,
          tier: "worker",
          status: "success",
        }),
      );
    }

    const metrics = computeMetrics(parallelSpans);
    expect(metrics.totalSpans).toBe(50);
    expect(metrics.concurrencyPeak).toBe(50);
    expect(metrics.activeExecutionMs).toBe(400); // 500 - 100
  });

  it("handles special characters and unicode in search queries safely", () => {
    const span = normalizeSpan({
      id: "special-1",
      name: "Special [.*+?^${}()|] Task 🔍",
      tags: ["regex-test", "emoji-🚀"],
      metadata: { query: "select * from table where id = '1'" },
    });

    expect(searchMatchesSpan(span, "[.*+?^${}()|]")).toBe(true);
    expect(searchMatchesSpan(span, "🔍")).toBe(true);
    expect(searchMatchesSpan(span, "emoji-🚀")).toBe(true);
    expect(searchMatchesSpan(span, "select * from")).toBe(true);
    expect(searchMatchesSpan(span, "nonexistent*?")).toBe(false);
  });

  it("verifies all color scheme branches for every tier and status", () => {
    const tiers = ["root", "coordinator", "subagent", "worker", "tool", "gate", "system"] as const;
    for (const tier of tiers) {
      const s = normalizeSpan({ tier });
      const color = getSpanColor(s, "tier");
      expect(typeof color).toBe("string");
      expect(color.startsWith("#") || color.startsWith("hsl")).toBe(true);
    }

    const statuses = ["pending", "running", "success", "error", "cancelled"] as const;
    for (const status of statuses) {
      const s = normalizeSpan({ status });
      const color = getSpanColor(s, "status");
      expect(typeof color).toBe("string");
      expect(color.startsWith("#") || color.startsWith("hsl")).toBe(true);
    }

    // Heatmap schemes
    const s = normalizeSpan({
      tokens: {
        promptTokens: 1000,
        completionTokens: 2000,
        reasoningTokens: 500,
        totalTokens: 3500,
      },
      duration: 1500,
    });
    expect(getSpanColor(s, "tokens", { maxTokens: 4000 })).toContain("hsl");
    expect(getSpanColor(s, "latency", { maxLatency: 2000 })).toContain("hsl");
  });

  it("handles detail drawer table view vs raw JSON view toggle", () => {
    const spanWithMeta = normalizeSpan({
      id: "meta-span",
      name: "Meta Inspector Span",
      metadata: { key1: "value1", key2: 42, key3: { nested: true } },
    });

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        <FlamegraphDetailDrawer
          span={spanWithMeta}
          ancestry={[]}
          childSpans={[]}
          isOpen={true}
          onClose={() => {}}
          onSelectSpan={() => {}}
        />,
      );
    });

    const root = renderer!.root;
    // Initial table view
    expect(root.findByProps({ className: "metadata-table" })).toBeDefined();

    // Toggle to raw JSON view
    const toggleBtn = root.findByProps({ className: "gvui-btn-text" });
    act(() => {
      toggleBtn.props.onClick();
    });
    expect(root.findByProps({ className: "metadata-json-block" })).toBeDefined();
  });
});
