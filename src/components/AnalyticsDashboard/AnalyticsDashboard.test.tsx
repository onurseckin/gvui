import { beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import type { GraphDataset, GraphNodeData, GraphEdgeData } from "../../types/graphData";
import {
  computeAnalyticsMetrics,
  extractNodeDuration,
  extractNodeRepairRounds,
  extractNodeTokens,
  filterDataset,
  resolveNodeTier,
  useAnalyticsStore,
  categorizeError,
} from "../../store/useAnalyticsStore";
import { AnalyticsDashboard, ConcurrencyHeatmapCard, ErrorTaxonomyCard } from "./index";

describe("Analytics Dashboard & Telemetry Store", () => {
  const sampleNodes: GraphNodeData[] = [
    {
      id: "node-root",
      name: "Coordinator Root",
      kind: "orchestrator",
      status: "success",
      step: 1,
      model: "claude-3-5-sonnet",
      metrics: {
        tokensIn: 2000,
        tokensOut: 500,
        costUsd: 0.02,
        durationMs: 3000,
        retries: 0,
        timingBreakdown: {
          thinkDurationMs: 1200,
          toolDurationMs: 800,
        },
      },
    },
    {
      id: "node-worker-1",
      name: "Code Implementer",
      kind: "agent",
      status: "success",
      step: 2,
      model: "gpt-4o",
      metrics: {
        tokensIn: 5000,
        tokensOut: 2000,
        costUsd: 0.05,
        durationMs: 8000,
        retries: 1,
        repairRounds: 1,
        tokens: {
          promptTokens: 5000,
          completionTokens: 2000,
          reasoningTokens: 1000,
          cacheReadTokens: 1500,
          cacheCreationTokens: 500,
          totalTokens: 10000,
        },
        timingBreakdown: {
          thinkDurationMs: 4000,
          toolDurationMs: 3000,
        },
      },
      metadata: {
        findings: [
          {
            id: "f-1",
            severity: "critical",
            observation: "TypeScript type error in store index",
            status: "resolved",
          },
        ],
      },
    },
    {
      id: "node-worker-2",
      name: "Test Runner",
      kind: "agent",
      status: "success",
      step: 2,
      model: "gemini-2.0-flash",
      tier: "s",
      metrics: {
        tokensIn: 1000,
        tokensOut: 300,
        durationMs: 4000,
        retries: 0,
        timingBreakdown: {
          thinkDurationMs: 1000,
          toolDurationMs: 2500,
        },
      },
    },
    {
      id: "node-validator",
      name: "Adversarial Validator",
      kind: "critic",
      status: "error",
      step: 3,
      model: "claude-3-haiku",
      tier: "xs",
      metrics: {
        tokensIn: 3000,
        tokensOut: 800,
        durationMs: 5000,
        retries: 2,
        timingBreakdown: {
          thinkDurationMs: 2000,
          toolDurationMs: 2000,
        },
      },
      logs: "Test assertion failure in validation gate",
      metadata: {
        findings: [
          {
            id: "f-2",
            severity: "important",
            observation: "Validation reject: missing boundary edge test",
            remediation: "Add boundary test cases",
            status: "open",
          },
        ],
        commands: [
          {
            id: "cmd-1",
            argv: ["bun", "test"],
            cwd: "/repos/gvui",
            exitCode: 1,
            durationMs: 1200,
            startedAt: "2026-08-15T10:00:00Z",
            finishedAt: "2026-08-15T10:00:01Z",
            stderrSnippet: "assertion failed: expect(x).toBe(true)",
          },
        ],
      },
    },
    {
      id: "node-terminal",
      name: "Terminal Signoff",
      kind: "terminal",
      status: "pending",
      step: 4,
    },
  ];

  const sampleEdges: GraphEdgeData[] = [
    { id: "e1", source: "node-root", target: "node-worker-1" },
    { id: "e2", source: "node-root", target: "node-worker-2" },
    { id: "e3", source: "node-worker-1", target: "node-validator" },
    { id: "e4", source: "node-worker-2", target: "node-validator" },
    { id: "e5", source: "node-validator", target: "node-terminal" },
    {
      id: "e-cycle",
      source: "node-validator",
      target: "node-worker-1",
      isCycle: true,
      kind: "loop",
    },
  ];

  const sampleDataset: GraphDataset = {
    id: "sample-orchestration-run",
    title: "Long-Task Agent Orchestration Run",
    description: "Meta-orchestrator telemetry pipeline graph",
    nodes: sampleNodes,
    edges: sampleEdges,
  };

  beforeEach(() => {
    act(() => {
      useAnalyticsStore.getState().resetFilters();
      useAnalyticsStore.getState().setDataset(null);
      useAnalyticsStore.getState().setActiveTab("overview");
    });
  });

  // ==========================================================================
  // Store & Metric Computation Unit Tests
  // ==========================================================================
  describe("Metric Computation Engine (computeAnalyticsMetrics)", () => {
    it("handles empty or null datasets gracefully", () => {
      const nullRes = computeAnalyticsMetrics(null);
      expect(nullRes.totalNodes).toBe(0);
      expect(nullRes.completedNodes).toBe(0);
      expect(nullRes.successRate).toBe(0);
      expect(nullRes.criticalPath.totalCriticalPathDurationMs).toBe(0);
      expect(nullRes.runVelocity.nodesPerMinute).toBe(0);
      expect(nullRes.tokenDistribution.totalTokens).toBe(0);

      const emptyRes = computeAnalyticsMetrics({
        id: "empty",
        title: "Empty",
        nodes: [],
        edges: [],
      });
      expect(emptyRes.totalNodes).toBe(0);
      expect(emptyRes.concurrency.peakConcurrency).toBe(0);
    });

    it("computes accurate node counts and success rates", () => {
      const metrics = computeAnalyticsMetrics(sampleDataset);
      expect(metrics.totalNodes).toBe(5);
      expect(metrics.successNodes).toBe(3);
      expect(metrics.errorNodes).toBe(1);
      expect(metrics.pendingNodes).toBe(1);
      expect(metrics.completedNodes).toBe(4);
      expect(metrics.successRate).toBe(75); // 3 of 4
    });

    it("computes accurate Run Velocity & Duration metrics", () => {
      const metrics = computeAnalyticsMetrics(sampleDataset);
      const { runVelocity } = metrics;

      // Critical path: root(3000) + worker-1(8000) + validator(5000) + terminal(0) = 16000ms
      expect(runVelocity.totalWallClockMs).toBe(16000);
      // Cognitive: 1200 + 4000 + 1000 + 2000 = 8200ms
      expect(runVelocity.totalCognitiveMs).toBe(8200);
      // Tool: 800 + 3000 + 2500 + 2000 = 8300ms
      expect(runVelocity.totalToolMs).toBe(8300);

      expect(runVelocity.cognitivePercentage).toBeGreaterThan(0);
      expect(runVelocity.nodesPerMinute).toBeGreaterThan(0);
      expect(runVelocity.phaseVelocities.length).toBe(4); // Steps 1, 2, 3, 4
      expect(runVelocity.fastestStep).toBeDefined();
      expect(runVelocity.slowestStep).toBeDefined();
    });

    it("computes accurate Concurrency Heatmap metrics with 12 timeline bins", () => {
      const metrics = computeAnalyticsMetrics(sampleDataset);
      const { concurrency } = metrics;

      expect(concurrency.bins.length).toBe(12);
      expect(concurrency.peakConcurrency).toBe(2); // Step 2 has worker-1 and worker-2
      expect(concurrency.averageConcurrency).toBeGreaterThan(0);

      const maxBin = concurrency.bins.find((b) => b.activeCount === 2);
      expect(maxBin).toBeDefined();
      expect(maxBin?.nodeIds.length).toBe(2);
    });

    it("computes accurate Token Distribution by Model & Role & Tier", () => {
      const metrics = computeAnalyticsMetrics(sampleDataset);
      const { tokenDistribution } = metrics;

      expect(tokenDistribution.totalPromptTokens).toBeGreaterThan(0);
      expect(tokenDistribution.totalCompletionTokens).toBeGreaterThan(0);
      expect(tokenDistribution.totalReasoningTokens).toBe(1000);
      expect(tokenDistribution.totalCacheReadTokens).toBe(1500);
      expect(tokenDistribution.totalCacheCreationTokens).toBe(500);

      // Verify model breakdown entries
      expect(tokenDistribution.byModel.length).toBeGreaterThanOrEqual(4);
      const sonnet = tokenDistribution.byModel.find((m) => m.model === "claude-3-5-sonnet");
      expect(sonnet).toBeDefined();
      expect(sonnet?.nodeCount).toBe(1);

      // Verify role breakdown
      expect(tokenDistribution.byRole.length).toBe(5);
      const reasoningRole = tokenDistribution.byRole.find((r) => r.role === "reasoning");
      expect(reasoningRole?.tokens).toBe(1000);

      // Verify tier simulation
      expect(tokenDistribution.byTier.length).toBe(4);
      expect(tokenDistribution.cacheSavingsUsd).toBeGreaterThan(0);
    });

    it("computes accurate Repair Cycle Histograms", () => {
      const metrics = computeAnalyticsMetrics(sampleDataset);
      const { repairCycles } = metrics;

      expect(repairCycles.totalRepairs).toBe(3); // worker-1 (1) + validator (2)
      expect(repairCycles.maxRepairsOnNode).toBe(2);
      expect(repairCycles.repairedNodesCount).toBe(2);
      expect(repairCycles.firstPassSuccessCount).toBe(3); // root, worker-2, terminal
      expect(repairCycles.firstPassSuccessRate).toBe(60); // 3 of 5 = 60%

      expect(repairCycles.bins.length).toBe(4);
      expect(repairCycles.bins[0].nodeCount).toBe(3); // 0 repairs
      expect(repairCycles.bins[1].nodeCount).toBe(1); // 1 repair
      expect(repairCycles.bins[2].nodeCount).toBe(1); // 2 repairs
    });

    it("computes accurate Error Taxonomy & Failure Mode classifications", () => {
      const metrics = computeAnalyticsMetrics(sampleDataset);
      const { errorTaxonomy } = metrics;

      expect(errorTaxonomy.totalErrors).toBeGreaterThan(0);
      expect(errorTaxonomy.unresolvedCount).toBe(1); // f-2 is open
      expect(errorTaxonomy.resolvedCount).toBe(1); // f-1 is resolved
      expect(errorTaxonomy.errorNodeCount).toBe(1);

      const syntaxCat = errorTaxonomy.items.find((i) => i.category === "syntax_type");
      expect(syntaxCat).toBeDefined();
      expect(syntaxCat?.affectedNodeIds).toContain("node-worker-1");

      const validationCat = errorTaxonomy.items.find((i) => i.category === "validation_rejection");
      expect(validationCat).toBeDefined();
      expect(validationCat?.affectedNodeIds).toContain("node-validator");
    });

    it("computes DAG Critical Path and Bottleneck Rankings while ignoring cycles", () => {
      const metrics = computeAnalyticsMetrics(sampleDataset);
      const { criticalPath } = metrics;

      expect(criticalPath.pathNodeIds).toEqual([
        "node-root",
        "node-worker-1",
        "node-validator",
        "node-terminal",
      ]);
      expect(criticalPath.totalCriticalPathDurationMs).toBe(16000);
      expect(criticalPath.longestNodeInPath?.nodeId).toBe("node-worker-1");

      expect(criticalPath.bottleneckRankings.length).toBe(5);
      expect(criticalPath.bottleneckRankings[0].nodeId).toBe("node-worker-1");
      expect(criticalPath.bottleneckRankings[0].durationMs).toBe(8000);
      expect(criticalPath.bottleneckRankings[0].isOnCriticalPath).toBe(true);
    });
  });

  // ==========================================================================
  // Helper Extraction Function Tests
  // ==========================================================================
  describe("Helper Extraction Functions", () => {
    it("extractNodeDuration extracts from metrics, metadata, and timing breakdowns", () => {
      expect(extractNodeDuration({ id: "1", name: "1", metrics: { durationMs: 1200 } })).toBe(1200);
      expect(extractNodeDuration({ id: "2", name: "2", metadata: { durationMs: 2500 } })).toBe(
        2500,
      );
      expect(
        extractNodeDuration({
          id: "3",
          name: "3",
          metrics: { timingBreakdown: { wallDurationMs: 4200 } },
        }),
      ).toBe(4200);
      expect(extractNodeDuration({ id: "4", name: "4" })).toBe(0);
    });

    it("extractNodeTokens handles missing, partial, or nested tokens gracefully", () => {
      const tokens1 = extractNodeTokens({
        id: "1",
        name: "1",
        metrics: { tokensIn: 100, tokensOut: 50 },
      });
      expect(tokens1.promptTokens).toBe(100);
      expect(tokens1.completionTokens).toBe(50);
      expect(tokens1.costUsd).toBeGreaterThan(0);

      const tokens2 = extractNodeTokens({
        id: "2",
        name: "2",
        metadata: { tokens: { reasoningTokens: 300, cacheReadTokens: 400 } },
      });
      expect(tokens2.reasoningTokens).toBe(300);
      expect(tokens2.cacheReadTokens).toBe(400);
    });

    it("extractNodeRepairRounds extracts repair iterations across diverse formats", () => {
      expect(extractNodeRepairRounds({ id: "1", name: "1", metrics: { repairRounds: 3 } })).toBe(3);
      expect(extractNodeRepairRounds({ id: "2", name: "2", metadata: { attempt: 3 } })).toBe(2);
      expect(extractNodeRepairRounds({ id: "3", name: "3", metadata: { round: 4 } })).toBe(3);
      expect(
        extractNodeRepairRounds({
          id: "4",
          name: "4",
          provenance: { remediations: [{ findingId: "f1" }, { findingId: "f2" }] },
        }),
      ).toBe(2);
    });

    it("resolveNodeTier categorizes standard and custom models into tiers", () => {
      expect(resolveNodeTier({ id: "1", name: "1", model: "claude-3-haiku" })).toBe("xs");
      expect(resolveNodeTier({ id: "2", name: "2", model: "gemini-2.0-flash" })).toBe("s");
      expect(resolveNodeTier({ id: "3", name: "3", model: "claude-3-5-sonnet" })).toBe("m");
      expect(resolveNodeTier({ id: "4", name: "4", model: "openai-o1" })).toBe("l");
      expect(resolveNodeTier({ id: "5", name: "5", model: "custom-local-model" })).toBe(
        "unspecified",
      );
    });

    it("categorizeError accurately maps error messages to taxonomy keys", () => {
      expect(categorizeError("TS2304: Cannot find name 'foo'")).toBe("syntax_type");
      expect(categorizeError("Vitest assertion failed: expect(a).toBe(b)")).toBe("test_assertion");
      expect(categorizeError("oxlint rule violation: no-unused-vars")).toBe("lint_format");
      expect(categorizeError("Validator rejected round 1 proof")).toBe("validation_rejection");
      expect(categorizeError("Operation timed out after 30000ms")).toBe("timeout_deadlock");
      expect(categorizeError("HTTP 429 Too Many Requests: rate limit exceeded")).toBe(
        "rate_limit_quota",
      );
      expect(categorizeError("Command failed with exit code 127: sh: foo not found")).toBe(
        "command_failure",
      );
      expect(categorizeError("Unhandled network socket disconnection")).toBe("runtime_unhandled");
    });
  });

  // ==========================================================================
  // Filtering Logic Tests
  // ==========================================================================
  describe("Dataset Filtering (filterDataset)", () => {
    it("filters nodes by status", () => {
      const filtered = filterDataset(sampleDataset, {
        searchQuery: "",
        nodeStatus: "error",
        modelTier: "all",
        nodeKind: "all",
        stepRange: null,
      });
      expect(filtered?.nodes.length).toBe(1);
      expect(filtered?.nodes[0].id).toBe("node-validator");
    });

    it("filters nodes by model tier", () => {
      const filtered = filterDataset(sampleDataset, {
        searchQuery: "",
        nodeStatus: "all",
        modelTier: "s",
        nodeKind: "all",
        stepRange: null,
      });
      expect(filtered?.nodes.length).toBe(1);
      expect(filtered?.nodes[0].id).toBe("node-worker-2");
    });

    it("filters nodes by search query matching name or model", () => {
      const filtered = filterDataset(sampleDataset, {
        searchQuery: "Implementer",
        nodeStatus: "all",
        modelTier: "all",
        nodeKind: "all",
        stepRange: null,
      });
      expect(filtered?.nodes.length).toBe(1);
      expect(filtered?.nodes[0].id).toBe("node-worker-1");
    });

    it("filters nodes by step range", () => {
      const filtered = filterDataset(sampleDataset, {
        searchQuery: "",
        nodeStatus: "all",
        modelTier: "all",
        nodeKind: "all",
        stepRange: [2, 2],
      });
      expect(filtered?.nodes.length).toBe(2);
      expect(filtered?.nodes.map((n) => n.id)).toEqual(["node-worker-1", "node-worker-2"]);
    });
  });

  // ==========================================================================
  // React Component Rendering & Interaction Tests
  // ==========================================================================
  describe("AnalyticsDashboard Component Hierarchy", () => {
    it("renders empty state when dataset is null or has no nodes", () => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<AnalyticsDashboard dataset={null} />);
      });
      const emptyState = renderer.root.findByProps({ "data-testid": "analytics-empty-state" });
      expect(emptyState).toBeDefined();
    });

    it("renders executive KPI header banner and tabs when dataset is provided", () => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<AnalyticsDashboard dataset={sampleDataset} />);
      });

      const kpiGrid = renderer.root.findByProps({ "data-testid": "analytics-kpi-grid" });
      expect(kpiGrid).toBeDefined();

      const tabBar = renderer.root.findByProps({ "data-testid": "analytics-tab-bar" });
      expect(tabBar).toBeDefined();

      const overviewGrid = renderer.root.findByProps({
        "data-testid": "analytics-overview-grid",
      });
      expect(overviewGrid).toBeDefined();
    });

    it("renders all 6 executive cards in overview mode", () => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<AnalyticsDashboard dataset={sampleDataset} />);
      });

      expect(renderer.root.findByProps({ "data-testid": "run-velocity-card" })).toBeDefined();
      expect(
        renderer.root.findByProps({ "data-testid": "concurrency-heatmap-card" }),
      ).toBeDefined();
      expect(renderer.root.findByProps({ "data-testid": "token-distribution-card" })).toBeDefined();
      expect(
        renderer.root.findByProps({ "data-testid": "repair-cycle-histogram-card" }),
      ).toBeDefined();
      expect(renderer.root.findByProps({ "data-testid": "error-taxonomy-card" })).toBeDefined();
      expect(renderer.root.findByProps({ "data-testid": "critical-path-card" })).toBeDefined();
    });

    it("switches tabs when tab buttons are clicked", () => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<AnalyticsDashboard dataset={sampleDataset} />);
      });

      const velocityTab = renderer.root.findByProps({ "data-testid": "tab-velocity" });
      act(() => {
        velocityTab.props.onClick();
      });

      expect(useAnalyticsStore.getState().activeTab).toBe("velocity");
      expect(renderer.root.findByProps({ "data-testid": "run-velocity-card" })).toBeDefined();

      const tokensTab = renderer.root.findByProps({ "data-testid": "tab-tokens" });
      act(() => {
        tokensTab.props.onClick();
      });

      expect(useAnalyticsStore.getState().activeTab).toBe("tokens");
      expect(renderer.root.findByProps({ "data-testid": "token-distribution-card" })).toBeDefined();
    });

    it("handles filter changes and reset button", () => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<AnalyticsDashboard dataset={sampleDataset} />);
      });

      const searchInput = renderer.root.findByProps({ "data-testid": "analytics-search-input" });
      act(() => {
        searchInput.props.onChange({ target: { value: "Coordinator" } });
      });

      expect(useAnalyticsStore.getState().filters.searchQuery).toBe("Coordinator");
      expect(useAnalyticsStore.getState().filteredMetrics.totalNodes).toBe(1);

      const resetBtn = renderer.root.findByProps({
        "data-testid": "analytics-reset-filters-btn",
      });
      act(() => {
        resetBtn.props.onClick();
      });

      expect(useAnalyticsStore.getState().filters.searchQuery).toBe("");
      expect(useAnalyticsStore.getState().filteredMetrics.totalNodes).toBe(5);
    });

    it("handles interaction in ConcurrencyHeatmapCard by clicking a slot", () => {
      const metrics = computeAnalyticsMetrics(sampleDataset);
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<ConcurrencyHeatmapCard concurrency={metrics.concurrency} />);
      });

      const slot0 = renderer.root.findByProps({ "data-testid": "concurrency-slot-0" });
      act(() => {
        slot0.props.onClick();
      });

      const detail = renderer.root.findByProps({ "data-testid": "concurrency-slot-detail" });
      expect(detail).toBeDefined();
    });

    it("handles interaction in ErrorTaxonomyCard by expanding a category", () => {
      const metrics = computeAnalyticsMetrics(sampleDataset);
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <ErrorTaxonomyCard
            errorTaxonomy={metrics.errorTaxonomy}
            totalNodes={metrics.totalNodes}
          />,
        );
      });

      const catItem = renderer.root.findByProps({ "data-testid": "error-cat-syntax_type" });
      const header = catItem.children[0] as unknown as { props: { onClick: () => void } };
      act(() => {
        header.props.onClick();
      });

      expect(catItem).toBeDefined();
    });

    it("handles export summary copy to clipboard", () => {
      let copiedText = "";
      (
        globalThis as unknown as {
          navigator: { clipboard?: { writeText: (t: string) => Promise<void> } };
        }
      ).navigator = {
        clipboard: {
          writeText: (t: string) => {
            copiedText = t;
            return Promise.resolve();
          },
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<AnalyticsDashboard dataset={sampleDataset} />);
      });

      const copyBtn = renderer.root.findByProps({
        "data-testid": "analytics-copy-summary-btn",
      });
      act(() => {
        copyBtn.props.onClick();
      });

      expect(copiedText).toContain("GVUI EXEC TELEMETRY SUMMARY");
    });
  });

  // ==========================================================================
  // Adversarial Stress & Edge Cases
  // ==========================================================================
  describe("Adversarial Edge Cases & Stress Tests", () => {
    it("handles extreme numbers, negative durations, and NaN metrics without throwing", () => {
      const weirdDataset: GraphDataset = {
        id: "weird-dataset",
        title: "Weird Dataset",
        nodes: [
          {
            id: "node-nan",
            name: "NaN Duration Node",
            metrics: {
              durationMs: NaN,
              costUsd: -50,
              tokensIn: -100,
              retries: -2,
            },
          },
          {
            id: "node-huge",
            name: "Extreme Node",
            metrics: {
              durationMs: 999_999_999,
              costUsd: 1250.75,
              tokensIn: 50_000_000,
              tokensOut: 20_000_000,
            },
          },
        ],
        edges: [],
      };

      const metrics = computeAnalyticsMetrics(weirdDataset);
      expect(metrics.totalNodes).toBe(2);
      expect(Number.isFinite(metrics.runVelocity.totalWallClockMs)).toBe(true);
      expect(Number.isFinite(metrics.tokenDistribution.totalCostUsd)).toBe(true);
    });

    it("handles highly cyclic graphs without infinite recursion in critical path", () => {
      const cyclicNodes: GraphNodeData[] = [
        { id: "A", name: "Node A", metrics: { durationMs: 1000 } },
        { id: "B", name: "Node B", metrics: { durationMs: 2000 } },
        { id: "C", name: "Node C", metrics: { durationMs: 3000 } },
      ];
      const cyclicEdges: GraphEdgeData[] = [
        { id: "e1", source: "A", target: "B" },
        { id: "e2", source: "B", target: "C" },
        { id: "e3", source: "C", target: "A" }, // Full cycle
      ];

      const cyclicDataset: GraphDataset = {
        id: "cyclic",
        title: "Cyclic",
        nodes: cyclicNodes,
        edges: cyclicEdges,
      };

      const metrics = computeAnalyticsMetrics(cyclicDataset);
      expect(metrics.totalNodes).toBe(3);
      expect(metrics.criticalPath.pathNodeIds.length).toBeGreaterThan(0);
    });

    it("handles disconnected node clusters", () => {
      const disconnectedDataset: GraphDataset = {
        id: "island",
        title: "Island Clusters",
        nodes: [
          { id: "island-1", name: "Island 1", metrics: { durationMs: 5000 } },
          { id: "island-2", name: "Island 2", metrics: { durationMs: 7000 } },
        ],
        edges: [],
      };

      const metrics = computeAnalyticsMetrics(disconnectedDataset);
      expect(metrics.criticalPath.totalCriticalPathDurationMs).toBe(7000);
      expect(metrics.criticalPath.pathNodeIds).toContain("island-2");
    });

    it("finding-task-01-stress-critical-path-ties: deterministically resolves multiple equal-cost longest path branches", () => {
      const tieNodes: GraphNodeData[] = [
        { id: "root", name: "Root", metrics: { durationMs: 1000 } },
        { id: "branch-a", name: "Branch A", metrics: { durationMs: 4000 } },
        { id: "branch-b", name: "Branch B", metrics: { durationMs: 4000 } },
        { id: "sink", name: "Sink", metrics: { durationMs: 1000 } },
      ];
      const tieEdges: GraphEdgeData[] = [
        { id: "e1", source: "root", target: "branch-a" },
        { id: "e2", source: "root", target: "branch-b" },
        { id: "e3", source: "branch-a", target: "sink" },
        { id: "e4", source: "branch-b", target: "sink" },
      ];

      const tieDataset: GraphDataset = {
        id: "tie-graph",
        title: "Tie Graph",
        nodes: tieNodes,
        edges: tieEdges,
      };

      const metrics = computeAnalyticsMetrics(tieDataset);
      // Both root -> branch-a -> sink and root -> branch-b -> sink are 6000ms
      expect(metrics.criticalPath.totalCriticalPathDurationMs).toBe(6000);
      expect(metrics.criticalPath.pathNodeIds.length).toBe(3);
      expect(metrics.criticalPath.pathNodeIds[0]).toBe("root");
      expect(metrics.criticalPath.pathNodeIds[2]).toBe("sink");
      expect(["branch-a", "branch-b"]).toContain(metrics.criticalPath.pathNodeIds[1]);
    });

    it("finding-task-01-stress-identical-timestamps-concurrency: generates valid concurrency bins when all nodes share the same step/timestamp", () => {
      const identicalNodes: GraphNodeData[] = [
        { id: "n1", name: "Task 1", step: 1, metrics: { durationMs: 0 } },
        { id: "n2", name: "Task 2", step: 1, metrics: { durationMs: 0 } },
        { id: "n3", name: "Task 3", step: 1, metrics: { durationMs: 0 } },
      ];

      const identicalDataset: GraphDataset = {
        id: "identical-step-graph",
        title: "Identical Step Graph",
        nodes: identicalNodes,
        edges: [],
      };

      const metrics = computeAnalyticsMetrics(identicalDataset);
      expect(metrics.concurrency.bins.length).toBe(12);
      expect(metrics.concurrency.peakConcurrency).toBe(3);
      expect(metrics.concurrency.bins[0].activeCount).toBe(3);
    });

    it("finding-task-01-stress-invalid-and-reversed-timestamps: safely handles commands with reversed or invalid timestamps", () => {
      const reversedNode: GraphNodeData = {
        id: "rev-node",
        name: "Reversed Timestamp Node",
        metadata: {
          commands: [
            {
              id: "cmd-bad",
              argv: ["echo"],
              cwd: "/",
              exitCode: 0,
              durationMs: -500,
              startedAt: "2026-08-15T12:00:00Z",
              finishedAt: "2026-08-15T11:00:00Z", // end before start!
            },
          ],
        },
      };

      const duration = extractNodeDuration(reversedNode);
      expect(duration).toBe(0);
      expect(Number.isFinite(duration)).toBe(true);
    });

    it("finding-task-01-stress-malformed-and-negative-tokens: extracts non-negative tokens from string, null, and negative values", () => {
      const malformedNode: GraphNodeData = {
        id: "malformed-node",
        name: "Malformed Tokens Node",
        metrics: {
          tokensIn: -999,
          tokensOut: -500,
          tokens: {
            promptTokens: -100,
            completionTokens: -50,
            reasoningTokens: -20,
            cacheReadTokens: -10,
          },
        },
      };

      const tokens = extractNodeTokens(malformedNode);
      expect(tokens.promptTokens).toBe(0);
      expect(tokens.completionTokens).toBe(0);
      expect(tokens.reasoningTokens).toBe(0);
      expect(tokens.cacheReadTokens).toBe(0);
      expect(tokens.totalTokens).toBe(0);
      expect(tokens.costUsd).toBe(0);
    });

    it("finding-task-01-stress-tab-switching-and-filter-resets: full lifecycle across all 7 dashboard tabs", () => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<AnalyticsDashboard dataset={sampleDataset} />);
      });

      const tabs: Array<
        "overview" | "velocity" | "concurrency" | "tokens" | "repairs" | "errors" | "bottlenecks"
      > = ["overview", "velocity", "concurrency", "tokens", "repairs", "errors", "bottlenecks"];

      for (const tab of tabs) {
        const tabBtn = renderer.root.findByProps({ "data-testid": `tab-${tab}` });
        act(() => {
          tabBtn.props.onClick();
        });
        expect(useAnalyticsStore.getState().activeTab).toBe(tab);
      }

      // Reset filters and ensure overview still renders
      act(() => {
        useAnalyticsStore.getState().resetFilters();
        useAnalyticsStore.getState().setActiveTab("overview");
      });
      expect(renderer.root.findByProps({ "data-testid": "analytics-overview-grid" })).toBeDefined();
    });
  });
});
