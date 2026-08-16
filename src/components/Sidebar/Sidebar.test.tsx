import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as bunTest from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

interface ModuleMocker {
  module(id: string, factory: () => unknown): void | Promise<void>;
}

const mock = (bunTest as unknown as { mock: ModuleMocker }).mock;

let lastNavigatedArgs: unknown = null;
const mockNavigate = (args: unknown) => {
  lastNavigatedArgs = args;
  return Promise.resolve();
};

mock.module("@tanstack/react-router", () => ({
  useNavigate: () => mockNavigate,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useGraphFilesStore } from "../../state/useGraphFilesStore";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import {
  Sidebar,
  SidebarFileList,
  SidebarFilterControls,
  SidebarModelBreakdown,
  SidebarNodeStatus,
  SidebarTelemetry,
  TokenFootprintBreakdown,
} from "./index";
import { calculateGraphTokenFootprint, extractNodeTokenFootprint } from "./TokenFootprintBreakdown";

describe("Sidebar Component & Subcomponents", () => {
  const sampleDataset: GraphDataset = {
    id: "test-graph-1",
    title: "Test Orchestration Graph",
    nodes: [
      {
        id: "node-1",
        name: "Dispatcher",
        kind: "orchestrator",
        status: "success",
        model: "claude-3-5-sonnet",
        metrics: {
          tokensIn: 1200,
          tokensOut: 800,
          costUsd: 0.015,
          durationMs: 2500,
          retries: 0,
        },
      },
      {
        id: "node-2",
        name: "Worker Agent 1",
        kind: "agent",
        status: "running",
        model: "claude-3-haiku",
        metrics: {
          tokensIn: 3000,
          tokensOut: 1500,
          costUsd: 0.008,
          durationMs: 4200,
          retries: 1,
        },
      },
      {
        id: "node-3",
        name: "Worker Agent 2",
        kind: "agent",
        status: "error",
        model: "claude-3-5-sonnet",
        metrics: {
          tokensIn: 500,
          tokensOut: 200,
          costUsd: 0.003,
          durationMs: 1100,
          retries: 2,
        },
      },
      {
        id: "node-4",
        name: "CLI Tool",
        kind: "tool",
        status: "success",
        tools: [{ name: "bash_exec" }],
        metrics: {
          durationMs: 800,
        },
      },
      {
        id: "node-5",
        name: "Validator Gate",
        kind: "gate",
        status: "pending",
      },
    ],
    edges: [
      { id: "e1-2", source: "node-1", target: "node-2" },
      { id: "e1-3", source: "node-1", target: "node-3" },
      { id: "e2-4", source: "node-2", target: "node-4" },
      { id: "e3-5", source: "node-3", target: "node-5" },
    ],
  };

  beforeEach(() => {
    lastNavigatedArgs = null;
    act(() => {
      useGraphStore.setState({
        dataset: null,
        currentFile: "sample.json",
        activeFilter: "all",
      });
      useGraphFilesStore.setState({
        files: ["graph-1.json", "graph-2.json", "graph-3.json"],
        isRefreshing: false,
        error: null,
      });
    });
  });

  afterEach(() => {
    act(() => {
      useGraphStore.setState({
        dataset: null,
        currentFile: "",
        activeFilter: "all",
      });
    });
  });

  describe("SidebarTelemetry", () => {
    it("renders complete graph telemetry when dataset is provided", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarTelemetry dataset={sampleDataset} />);
      });

      const root = renderer!.root;
      const telemetrySection = root.findByProps({ "data-testid": "sidebar-telemetry" });
      expect(telemetrySection).toBeDefined();

      const nodesCount = root.findByProps({ "data-testid": "telemetry-nodes-count" });
      expect(nodesCount.children).toEqual(["5"]);

      const edgesCount = root.findByProps({ "data-testid": "telemetry-edges-count" });
      expect(edgesCount.children).toEqual(["4"]);

      const duration = root.findByProps({ "data-testid": "telemetry-duration" });
      expect(duration.children).toEqual(["8.6s"]); // 2500 + 4200 + 1100 + 800 = 8600ms -> 8.6s

      const tokens = root.findByProps({ "data-testid": "telemetry-tokens" });
      expect(tokens.children).toEqual(["7.2k"]); // 2000 + 4500 + 700 = 7200 -> 7.2k

      const cost = root.findByProps({ "data-testid": "telemetry-cost" });
      expect(cost.children).toEqual(["$0.026"]); // 0.015 + 0.008 + 0.003 = 0.026

      const retries = root.findByProps({ "data-testid": "telemetry-retries" });
      expect(retries.children).toEqual(["3"]); // 0 + 1 + 2 = 3
    });

    it("renders empty state message when dataset is null or has no nodes", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarTelemetry dataset={null} />);
      });

      const root = renderer!.root;
      const emptyState = root.findByProps({ className: "sidebar-empty-state" });
      expect(emptyState.children).toEqual(["No graph telemetry available"]);

      act(() => {
        renderer = create(
          <SidebarTelemetry dataset={{ id: "empty", title: "Empty", nodes: [], edges: [] }} />,
        );
      });
      const emptyState2 = renderer!.root.findByProps({ className: "sidebar-empty-state" });
      expect(emptyState2.children).toEqual(["No graph telemetry available"]);
    });

    it("handles nodes with metadata fallback duration and repair rounds", () => {
      const datasetWithMetadata: GraphDataset = {
        id: "meta-graph",
        title: "Metadata Graph",
        nodes: [
          {
            id: "n1",
            name: "Meta Node",
            metadata: {
              durationMs: 3500,
              repairRounds: 2,
            },
          },
        ],
        edges: [],
      };

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarTelemetry dataset={datasetWithMetadata} />);
      });

      const root = renderer!.root;
      const duration = root.findByProps({ "data-testid": "telemetry-duration" });
      expect(duration.children).toEqual(["3.5s"]);

      const retries = root.findByProps({ "data-testid": "telemetry-retries" });
      expect(retries.children).toEqual(["2"]);
    });

    it("aggregates promptTokens + completionTokens from metrics.tokens and metadata.tokens", () => {
      const datasetWithDetailedTokens: GraphDataset = {
        id: "token-fallback-graph",
        title: "Token Fallback Graph",
        nodes: [
          {
            id: "n1",
            name: "Node with metrics token object",
            metrics: {
              tokens: {
                promptTokens: 2500,
                completionTokens: 1500,
                reasoningTokens: 500,
              },
              costUsd: 0.012,
            },
          },
          {
            id: "n2",
            name: "Node with metadata token object",
            metadata: {
              tokens: {
                promptTokens: 800,
                completionTokens: 200,
              },
              tokensIn: 0,
              tokensOut: 0,
            },
          },
          {
            id: "n3",
            name: "Node with metadata direct tokens",
            metadata: {
              tokensIn: 300,
              tokensOut: 200,
            },
          },
        ],
        edges: [],
      };

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarTelemetry dataset={datasetWithDetailedTokens} />);
      });

      const root = renderer!.root;
      const tokens = root.findByProps({ "data-testid": "telemetry-tokens" });
      // n1: 2500 + 1500 + 500 = 4500
      // n2: 800 + 200 = 1000
      // n3: 300 + 200 = 500
      // total: 6000 -> 6.0k
      expect(tokens.children).toEqual(["6.0k"]);
    });
  });

  describe("SidebarNodeStatus", () => {
    it("renders active node counts broken down by status", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarNodeStatus dataset={sampleDataset} />);
      });

      const root = renderer!.root;
      const statusSection = root.findByProps({ "data-testid": "sidebar-node-status" });
      expect(statusSection).toBeDefined();

      const successCount = root.findByProps({ "data-testid": "status-count-success" });
      expect(successCount.children).toEqual(["2"]); // Dispatcher, CLI Tool

      const runningCount = root.findByProps({ "data-testid": "status-count-running" });
      expect(runningCount.children).toEqual(["1"]); // Worker Agent 1

      const errorCount = root.findByProps({ "data-testid": "status-count-error" });
      expect(errorCount.children).toEqual(["1"]); // Worker Agent 2

      const pendingCount = root.findByProps({ "data-testid": "status-count-pending" });
      expect(pendingCount.children).toEqual(["1"]); // Validator Gate
    });

    it("renders empty state when dataset is null or has no nodes", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarNodeStatus dataset={null} />);
      });

      const root = renderer!.root;
      const emptyState = root.findByProps({ className: "sidebar-empty-state" });
      expect(emptyState.children).toEqual(["No active nodes"]);
    });

    it("handles skipped and cached statuses correctly", () => {
      const variedDataset: GraphDataset = {
        id: "varied",
        title: "Varied",
        nodes: [
          { id: "s1", name: "Skipped", status: "skipped" },
          { id: "c1", name: "Cached 1", status: "cached" },
          { id: "c2", name: "Cached 2", status: "cached" },
        ],
        edges: [],
      };

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarNodeStatus dataset={variedDataset} />);
      });

      const root = renderer!.root;
      const skippedCount = root.findByProps({ "data-testid": "status-count-skipped" });
      expect(skippedCount.children).toEqual(["1"]);

      const cachedCount = root.findByProps({ "data-testid": "status-count-cached" });
      expect(cachedCount.children).toEqual(["2"]);
    });
  });

  describe("SidebarModelBreakdown", () => {
    it("aggregates node counts by model name, accounts for Unspecified nodes so total equals nodes count", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarModelBreakdown dataset={sampleDataset} />);
      });

      const root = renderer!.root;
      const modelSection = root.findByProps({ "data-testid": "sidebar-model-breakdown" });
      expect(modelSection).toBeDefined();

      const sonnetCount = root.findByProps({ "data-testid": "model-count-claude-3-5-sonnet" });
      expect(sonnetCount.children).toEqual(["2"]);

      const haikuCount = root.findByProps({ "data-testid": "model-count-claude-3-haiku" });
      expect(haikuCount.children).toEqual(["1"]);

      const unspecifiedCount = root.findByProps({ "data-testid": "model-count-Unspecified" });
      expect(unspecifiedCount.children).toEqual(["2"]); // CLI Tool and Validator Gate

      const sonnetItem = root.findByProps({ "data-testid": "model-item-claude-3-5-sonnet" });
      const tierChip = sonnetItem.findByProps({ className: "model-tier-chip tier-m" });
      expect(tierChip.children).toEqual(["m"]);
    });

    it("resolves model from harnessModel, metadata.model, and hostAgent fallback", () => {
      const fallbackDataset: GraphDataset = {
        id: "fallback-models",
        title: "Fallback Models",
        nodes: [
          { id: "n1", name: "Harness Model Node", harnessModel: "claude-3-opus" },
          { id: "n2", name: "Metadata Model Node", metadata: { model: "gpt-4o" } },
          {
            id: "n3",
            name: "Host Agent Node",
            hostAgent: { model: "claude-3-5-sonnet" },
          },
        ],
        edges: [],
      };

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarModelBreakdown dataset={fallbackDataset} />);
      });

      const root = renderer!.root;
      const opusCount = root.findByProps({ "data-testid": "model-count-claude-3-opus" });
      expect(opusCount.children).toEqual(["1"]);

      const gpt4oCount = root.findByProps({ "data-testid": "model-count-gpt-4o" });
      expect(gpt4oCount.children).toEqual(["1"]);

      const sonnetCount = root.findByProps({ "data-testid": "model-count-claude-3-5-sonnet" });
      expect(sonnetCount.children).toEqual(["1"]);
    });

    it("renders empty state when dataset is null or has 0 nodes", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarModelBreakdown dataset={null} />);
      });

      const root = renderer!.root;
      const emptyState = root.findByProps({ className: "sidebar-empty-state" });
      expect(emptyState.children).toEqual(["No model telemetry available"]);
    });
  });

  describe("SidebarFilterControls", () => {
    it("renders 4 filter buttons with accurate counts and triggers callback on click", () => {
      let selectedFilter = "";
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SidebarFilterControls
            dataset={sampleDataset}
            activeFilter="all"
            onFilterChange={(f) => {
              selectedFilter = f;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const allCount = root.findByProps({ "data-testid": "filter-count-all" });
      expect(allCount.children).toEqual(["5"]);

      const successCount = root.findByProps({ "data-testid": "filter-count-success" });
      expect(successCount.children).toEqual(["2"]);

      const errorCount = root.findByProps({ "data-testid": "filter-count-error" });
      expect(errorCount.children).toEqual(["1"]);

      const toolsCount = root.findByProps({ "data-testid": "filter-count-tools" });
      expect(toolsCount.children).toEqual(["1"]);

      const errorBtn = root.findByProps({ "data-testid": "filter-btn-error" });
      act(() => {
        errorBtn.props.onClick();
      });
      expect(selectedFilter).toBe("error");
    });

    it("toggles active filter back to 'all' when clicking already-active filter button", () => {
      let selectedFilter = "error";
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SidebarFilterControls
            dataset={sampleDataset}
            activeFilter="error"
            onFilterChange={(f) => {
              selectedFilter = f;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const errorBtn = root.findByProps({ "data-testid": "filter-btn-error" });
      expect(errorBtn.props["aria-pressed"]).toBe(true);

      act(() => {
        errorBtn.props.onClick();
      });
      // Toggle should reset to 'all'
      expect(selectedFilter).toBe("all");
    });

    it("keeps filter as 'all' when clicking 'all' while already active", () => {
      let selectedFilter = "all";
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SidebarFilterControls
            dataset={sampleDataset}
            activeFilter="all"
            onFilterChange={(f) => {
              selectedFilter = f;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const allBtn = root.findByProps({ "data-testid": "filter-btn-all" });
      act(() => {
        allBtn.props.onClick();
      });
      expect(selectedFilter).toBe("all");
    });

    it("marks active filter button with aria-pressed=true and active class", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SidebarFilterControls
            dataset={sampleDataset}
            activeFilter="success"
            onFilterChange={() => {}}
          />,
        );
      });

      const root = renderer!.root;
      const successBtn = root.findByProps({ "data-testid": "filter-btn-success" });
      expect(successBtn.props["aria-pressed"]).toBe(true);
      expect(successBtn.props.className).toContain("active");

      const allBtn = root.findByProps({ "data-testid": "filter-btn-all" });
      expect(allBtn.props["aria-pressed"]).toBe(false);
      expect(allBtn.props.className).not.toContain("active");
    });
  });

  describe("SidebarFileList", () => {
    it("renders file list with active highlight, aria-current='true', and handles selection", () => {
      let selectedFile = "";
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SidebarFileList
            files={["pipeline.json", "crawler.json"]}
            currentFile="pipeline.json"
            onSelectFile={(f) => {
              selectedFile = f;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const filesCount = root.findByProps({ "data-testid": "sidebar-files-count" });
      expect(filesCount.children).toEqual(["2"]);

      const item1 = root.findByProps({ "data-testid": "file-item-pipeline.json" });
      expect(item1.props.className).toContain("active");
      expect(item1.props["aria-current"]).toBe("true");

      const item2 = root.findByProps({ "data-testid": "file-item-crawler.json" });
      expect(item2.props.className).not.toContain("active");
      expect(item2.props["aria-current"]).toBe(undefined);

      act(() => {
        item2.props.onClick();
      });
      expect(selectedFile).toBe("crawler.json");
    });

    it("renders empty state message when files list is empty", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<SidebarFileList files={[]} currentFile="" onSelectFile={() => {}} />);
      });

      const root = renderer!.root;
      const emptyState = root.findByProps({ className: "sidebar-empty-state" });
      expect(emptyState.children[0]).toContain("No graph files yet");
    });
  });

  describe("Sidebar Full Integration", () => {
    it("renders all sections together with store state and supports filter toggle reset", () => {
      act(() => {
        useGraphStore.setState({
          dataset: sampleDataset,
          activeFilter: "tools",
        });
      });

      let selectedSample = "";
      let settingsOpened = false;

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <Sidebar
            currentFile="graph-1.json"
            onSelectSample={(id) => {
              selectedSample = id;
            }}
            onOpenSettings={() => {
              settingsOpened = true;
            }}
          />,
        );
      });

      const root = renderer!.root;
      const aside = root.findByProps({ "data-testid": "sidebar" });
      expect(aside).toBeDefined();

      // Files list exists
      const filesSection = root.findByProps({ "data-testid": "sidebar-files" });
      expect(filesSection).toBeDefined();

      // Telemetry exists
      const telemetrySection = root.findByProps({ "data-testid": "sidebar-telemetry" });
      expect(telemetrySection).toBeDefined();

      // Status exists
      const statusSection = root.findByProps({ "data-testid": "sidebar-node-status" });
      expect(statusSection).toBeDefined();

      // Models exists
      const modelsSection = root.findByProps({ "data-testid": "sidebar-model-breakdown" });
      expect(modelsSection).toBeDefined();

      // Filters exist and reflect tools active
      const toolsBtn = root.findByProps({ "data-testid": "filter-btn-tools" });
      expect(toolsBtn.props["aria-pressed"]).toBe(true);

      // Switching filter updates store
      const errorBtn = root.findByProps({ "data-testid": "filter-btn-error" });
      act(() => {
        errorBtn.props.onClick();
      });
      expect(useGraphStore.getState().activeFilter).toBe("error");

      // Selecting file triggers callback and router navigate
      const file2Btn = root.findByProps({ "data-testid": "file-item-graph-2.json" });
      act(() => {
        file2Btn.props.onClick();
      });
      expect(selectedSample).toBe("graph-2.json");
      expect(lastNavigatedArgs).toEqual({
        to: "/graphs/$fileId",
        params: { fileId: "graph-2.json" },
      });

      // Settings button
      const settingsBtn = root.findByProps({ title: "Developer Settings & Graph Testing" });
      act(() => {
        settingsBtn.props.onClick();
      });
      expect(settingsOpened).toBe(true);
      expect(lastNavigatedArgs).toEqual({ to: "/testing" });
    });

    it("displays refresh error banner when refresh error occurs", () => {
      act(() => {
        useGraphFilesStore.setState({
          error: "Failed to fetch graph directory listing",
        });
      });

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<Sidebar currentFile="sample.json" onSelectSample={() => {}} />);
      });

      const root = renderer!.root;
      const errorBanner = root.findByProps({ className: "sidebar-refresh-error" });
      expect(errorBanner.children).toEqual(["Failed to fetch graph directory listing"]);
    });
  });

  describe("TokenFootprintBreakdown Component & Analytics Engine", () => {
    const detailedDataset: GraphDataset = {
      id: "cost-graph-1",
      title: "Cost & Token Test Graph",
      nodes: [
        {
          id: "node-lead",
          name: "Lead Orchestrator",
          kind: "orchestrator",
          status: "success",
          model: "claude-3-opus",
          tier: "l",
          metrics: {
            tokens: {
              promptTokens: 10000,
              completionTokens: 2000,
              reasoningTokens: 1500,
              cacheCreationTokens: 5000,
              cacheReadTokens: 8000,
              totalTokens: 13500,
            },
            costUsd: 0.35,
          },
        },
        {
          id: "node-worker",
          name: "Implementation Agent",
          kind: "agent",
          status: "running",
          model: "claude-3-5-sonnet",
          tier: "m",
          metrics: {
            tokensIn: 5000,
            tokensOut: 1500,
            costUsd: 0.045,
          },
          metadata: {
            tokens: {
              reasoningTokens: 800,
              cacheReadTokens: 3000,
            },
          },
        },
        {
          id: "node-fast",
          name: "Quick Triage Agent",
          kind: "agent",
          status: "success",
          model: "claude-3-haiku",
          tier: "s",
          metrics: {
            tokensIn: 2000,
            tokensOut: 500,
            costUsd: 0.002,
          },
        },
        {
          id: "node-mini",
          name: "Micro Router",
          kind: "router",
          status: "success",
          model: "flash-lite",
          tier: "xs",
          metrics: {
            tokensIn: 1000,
            tokensOut: 200,
            costUsd: 0.0003,
          },
        },
      ],
      edges: [
        { id: "e1", source: "node-lead", target: "node-worker" },
        { id: "e2", source: "node-worker", target: "node-fast" },
      ],
    };

    it("extractNodeTokenFootprint accurately extracts tokens, costs, and tiers from diverse node shapes", () => {
      const leadExtracted = extractNodeTokenFootprint(detailedDataset.nodes[0]);
      expect(leadExtracted.promptTokens).toBe(10000);
      expect(leadExtracted.completionTokens).toBe(2000);
      expect(leadExtracted.reasoningTokens).toBe(1500);
      expect(leadExtracted.cacheCreationTokens).toBe(5000);
      expect(leadExtracted.cacheReadTokens).toBe(8000);
      expect(leadExtracted.totalTokens).toBe(13500);
      expect(leadExtracted.costUsd).toBe(0.35);
      expect(leadExtracted.tier).toBe("l");
      expect(leadExtracted.model).toBe("claude-3-opus");

      // Node with direct tokensIn/Out and metadata reasoning fallback
      const workerExtracted = extractNodeTokenFootprint(detailedDataset.nodes[1]);
      expect(workerExtracted.promptTokens).toBe(5000);
      expect(workerExtracted.completionTokens).toBe(1500);
      expect(workerExtracted.reasoningTokens).toBe(800);
      expect(workerExtracted.cacheReadTokens).toBe(3000);
      expect(workerExtracted.tier).toBe("m");

      // Node with 0 costUsd and tokens estimates cost using tier pricing
      const unpricedNode: GraphNodeData = {
        id: "unpriced",
        name: "Unpriced Node",
        model: "claude-3-5-sonnet",
        tier: "m",
        metrics: {
          tokensIn: 1_000_000,
          tokensOut: 100_000,
        },
      };
      const unpricedExtracted = extractNodeTokenFootprint(unpricedNode);
      // Tier M: 1M prompt * $3 + 100k comp * $15 = $3.00 + $1.50 = $4.50
      expect(unpricedExtracted.costUsd).toBeCloseTo(4.5, 2);
    });

    it("calculateGraphTokenFootprint computes aggregated metrics, cache savings, and tier simulations", () => {
      const analytics = calculateGraphTokenFootprint(detailedDataset);
      expect(analytics).not.toBeNull();
      if (!analytics) return;

      expect(analytics.nodesCount).toBe(4);
      expect(analytics.totalPromptTokens).toBe(18000);
      expect(analytics.totalCompletionTokens).toBe(4200);
      expect(analytics.totalReasoningTokens).toBe(2300);
      expect(analytics.totalCacheReadTokens).toBe(11000);
      expect(analytics.totalCacheCreationTokens).toBe(5000);
      expect(analytics.totalCostUsd).toBeCloseTo(0.3973, 4);

      // Cache hit rate: 11000 / (18000 + 11000) = 11000 / 29000 ~ 37.9%
      expect(analytics.cacheHitRatePercent).toBeGreaterThan(30);
      expect(analytics.cacheHitRatePercent).toBeLessThan(50);
      expect(analytics.cacheCostSavingsUsd).toBeGreaterThan(0);

      // Tier breakdown includes XS, S, M, L
      expect(analytics.tierBreakdown.length).toBe(4);
      const tierL = analytics.tierBreakdown.find((t) => t.tier === "l");
      expect(tierL).toBeDefined();
      expect(tierL?.nodeCount).toBe(1);
      expect(tierL?.costUsd).toBe(0.35);

      // Tier simulations
      expect(analytics.tierSimulations.length).toBe(4);
      const simXS = analytics.tierSimulations.find((s) => s.tier === "xs");
      const simL = analytics.tierSimulations.find((s) => s.tier === "l");
      expect(simXS).toBeDefined();
      expect(simL).toBeDefined();
      // Running all on XS should be much cheaper than running on L
      expect(simXS!.simulatedCostUsd).toBeLessThan(simL!.simulatedCostUsd);
    });

    it("calculateGraphTokenFootprint returns null for empty or null dataset", () => {
      expect(calculateGraphTokenFootprint(null)).toBeNull();
      expect(
        calculateGraphTokenFootprint({ id: "empty", title: "Empty", nodes: [], edges: [] }),
      ).toBeNull();
    });

    it("TokenFootprintBreakdown renders empty state when dataset is null", () => {
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<TokenFootprintBreakdown dataset={null} />);
      });

      const root = renderer!.root;
      const section = root.findByProps({ "data-testid": "token-footprint-breakdown" });
      expect(section).toBeDefined();
      const emptyState = root.findByProps({ className: "sidebar-empty-state" });
      expect(emptyState.children).toEqual(["No token or financial analytics available"]);
    });

    it("TokenFootprintBreakdown renders summary cards and switches views (Tokens, Tiers, Cache, Compare)", () => {
      let selectedTier: string | null = null;
      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(
          <TokenFootprintBreakdown
            dataset={detailedDataset}
            onFilterTier={(t) => {
              selectedTier = t;
            }}
          />,
        );
      });

      const root = renderer!.root;

      // Summary Cards
      const costCard = root.findByProps({ "data-testid": "token-footprint-total-cost" });
      expect(costCard.children.join("")).toContain("$0.39");

      const tokensCard = root.findByProps({ "data-testid": "token-footprint-total-tokens" });
      expect(tokensCard.children.join("")).toBeDefined();

      // View 1: Tokens (Default)
      const tokenPanel = root.findByProps({ "data-testid": "token-view-tokens" });
      expect(tokenPanel).toBeDefined();
      const inputTokens = root.findByProps({ "data-testid": "token-footprint-input-tokens" });
      expect(inputTokens.children.join("")).toContain("18k");
      const reasoningTokens = root.findByProps({
        "data-testid": "token-footprint-reasoning-tokens",
      });
      expect(reasoningTokens.children.join("")).toContain("2.3k");

      // Switch to View 2: Tiers
      const tiersTab = root.findByProps({ "data-testid": "token-view-tab-tiers" });
      act(() => {
        tiersTab.props.onClick();
      });
      const tiersPanel = root.findByProps({ "data-testid": "token-view-tiers" });
      expect(tiersPanel).toBeDefined();
      const tierLRow = root.findByProps({ "data-testid": "tier-row-l" });
      expect(tierLRow).toBeDefined();

      // Click on tier row triggers callback
      act(() => {
        tierLRow.props.onClick();
      });
      expect(selectedTier).toBe("l");

      // Switch to View 3: Cache
      const cacheTab = root.findByProps({ "data-testid": "token-view-tab-cache" });
      act(() => {
        cacheTab.props.onClick();
      });
      const cachePanel = root.findByProps({ "data-testid": "token-view-cache" });
      expect(cachePanel).toBeDefined();
      const cacheHitRate = root.findByProps({ "data-testid": "token-footprint-cache-hit-rate" });
      expect(cacheHitRate.children.join("")).toContain("%");
      const cacheSavings = root.findByProps({ "data-testid": "token-footprint-cache-savings" });
      expect(cacheSavings.children.join("")).toContain("$");

      // Switch to View 4: Simulation (Compare)
      const simTab = root.findByProps({ "data-testid": "token-view-tab-simulation" });
      act(() => {
        simTab.props.onClick();
      });
      const simPanel = root.findByProps({ "data-testid": "token-view-simulation" });
      expect(simPanel).toBeDefined();
      const simXSRow = root.findByProps({ "data-testid": "sim-tier-xs" });
      expect(simXSRow).toBeDefined();
      const simLRow = root.findByProps({ "data-testid": "sim-tier-l" });
      expect(simLRow).toBeDefined();
    });

    it("TokenFootprintBreakdown copies summary to clipboard with interactive feedback", async () => {
      let written = "";
      const originalNav = globalThis.navigator;
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: (text: string) => {
              written = text;
              return Promise.resolve();
            },
          },
        },
        configurable: true,
        writable: true,
      });

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<TokenFootprintBreakdown dataset={detailedDataset} />);
      });

      const root = renderer!.root;
      const copyBtn = root.findByProps({ "data-testid": "copy-token-summary-btn" });
      expect(copyBtn).toBeDefined();

      await act(async () => {
        await copyBtn.props.onClick();
      });

      expect(written).toContain("Graph Cost & Token Footprint Summary");
      expect(written).toContain("Total Cost:");
      const updatedBtn = root.findByProps({ "data-testid": "copy-token-summary-btn" });
      const span = updatedBtn.findByType("span");
      expect(span.props.children).toBe("Copied");

      Object.defineProperty(globalThis, "navigator", {
        value: originalNav,
        configurable: true,
        writable: true,
      });
    });

    it("finding-03-stress-token-footprint: robust handling of zero tokens, NaN, negative values, and extreme numbers", () => {
      const zeroDataset: GraphDataset = {
        id: "zero-run",
        title: "Zero Run",
        nodes: [
          {
            id: "z1",
            name: "Zero Node 1",
            metrics: { tokensIn: 0, tokensOut: 0, costUsd: 0 },
          },
          {
            id: "z2",
            name: "Zero Node 2",
            metrics: {},
            metadata: {},
          },
        ],
        edges: [],
      };

      const analytics = calculateGraphTokenFootprint(zeroDataset);
      expect(analytics).not.toBeNull();
      expect(analytics!.totalTokens).toBe(0);
      expect(analytics!.totalCostUsd).toBe(0);
      expect(analytics!.cacheHitRatePercent).toBe(0);
      expect(analytics!.cacheCostSavingsUsd).toBe(0);

      let renderer: ReactTestRenderer;
      act(() => {
        renderer = create(<TokenFootprintBreakdown dataset={zeroDataset} />);
      });
      const json = JSON.stringify(renderer!.toJSON());
      expect(json).not.toContain("NaN");
      expect(json).toContain("$0.00");
    });

    it("finding-03-adversarial-verification: verifies cache savings calculation and multi-level reasoning token fallbacks", () => {
      // Test multi-level reasoning token telemetry fallbacks
      const nodeWithHostThinking: GraphNodeData = {
        id: "think-node-1",
        name: "Thinking Agent",
        model: "claude-3-opus",
        tier: "l",
        metadata: {
          hostAgent: {
            thinkingTokens: 4500,
            model: "claude-3-opus",
          },
        },
      };
      const extracted1 = extractNodeTokenFootprint(nodeWithHostThinking);
      expect(extracted1.reasoningTokens).toBe(4500);

      const nodeWithCognitiveTokens: GraphNodeData = {
        id: "cog-node-2",
        name: "Cognitive Agent",
        metadata: {
          cognitiveTokens: 3200,
        },
      };
      const extracted2 = extractNodeTokenFootprint(nodeWithCognitiveTokens);
      expect(extracted2.reasoningTokens).toBe(3200);

      const nodeWithDirectThinking: GraphNodeData = {
        id: "think-node-3",
        name: "Direct Thinking Agent",
        metrics: {
          tokens: {
            thinkingTokens: 8800,
            promptTokens: 10000,
            completionTokens: 2000,
          },
        },
      };
      const extracted3 = extractNodeTokenFootprint(nodeWithDirectThinking);
      expect(extracted3.reasoningTokens).toBe(8800);

      // Verify precise cache savings calculation
      const cacheDataset: GraphDataset = {
        id: "cache-verify-graph",
        title: "Cache Verification",
        nodes: [
          {
            id: "cn1",
            name: "Cache Heavy Worker",
            tier: "m",
            metrics: {
              tokens: {
                promptTokens: 100_000,
                cacheReadTokens: 400_000,
                cacheCreationTokens: 50_000,
                completionTokens: 20_000,
              },
            },
          },
        ],
        edges: [],
      };
      const cacheAnalytics = calculateGraphTokenFootprint(cacheDataset);
      expect(cacheAnalytics).not.toBeNull();
      // Cache hit rate: 400,000 / (100,000 + 400,000) = 80.0%
      expect(cacheAnalytics!.cacheHitRatePercent).toBe(80);
      // Tier M: Prompt $3.00/1M, Cache Read $0.30/1M -> Savings = $2.70/1M * 400,000 = $1.08
      expect(Math.abs(cacheAnalytics!.cacheCostSavingsUsd - 1.08) < 0.001).toBe(true);
    });
  });
});
