import { afterEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import {
  ComparisonView,
  computeGraphDiff,
  getNodeCostUsd,
  getNodeDurationMs,
  getNodeFindings,
  getNodeModel,
  getNodeRepairRounds,
  getNodeTokensBreakdown,
} from "./index";
import { RunComparisonSelector } from "../Sidebar/RunComparisonSelector";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceReactTestRendererDeprecationWarning<T>(fn: () => T): T {
  const originalConsoleError = console.error;
  console.error = (message?: unknown, ...args: unknown[]) => {
    if (
      message ===
      "react-test-renderer is deprecated. See https://react.dev/warnings/react-test-renderer"
    ) {
      return;
    }
    originalConsoleError(message, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = originalConsoleError;
  }
}

// Sample Datasets for Testing
const mockDatasetA: GraphDataset = {
  id: "run-round-1",
  title: "Round 1 Baseline Execution",
  nodes: [
    {
      id: "node-dispatch",
      name: "Dispatcher",
      kind: "orchestrator",
      status: "success",
      telemetry: { model: { value: "claude-3-5-sonnet", evidence_class: "host_reported" } },
      metrics: {
        durationMs: 2000,
        tokensIn: 1000,
        tokensOut: 500,
        costUsd: 0.015,
        retries: 0,
      },
    },
    {
      id: "node-worker-1",
      name: "Implementer Agent",
      kind: "agent",
      status: "error",
      telemetry: { model: { value: "claude-3-haiku", evidence_class: "host_reported" } },
      metrics: {
        durationMs: 5000,
        tokensIn: 4000,
        tokensOut: 2000,
        costUsd: 0.02,
        retries: 2,
        repairRounds: 2,
      },
      metadata: {
        findings: [
          {
            id: "finding-01",
            requirementId: "req-01",
            severity: "critical",
            observation: "Missing validation check on node input ports",
            remediation: "Add boundary checks before processing",
            status: "open",
          },
          {
            id: "finding-02",
            requirementId: "req-02",
            severity: "important",
            observation: "Suboptimal token caching policy",
            remediation: "Enable prompt caching headers",
            status: "open",
          },
        ],
      },
    },
    {
      id: "node-legacy-tool",
      name: "Legacy Cleanup Tool",
      kind: "tool",
      status: "success",
      metrics: {
        durationMs: 800,
        tokensIn: 200,
        tokensOut: 100,
      },
    },
  ],
  edges: [
    { id: "e1", source: "node-dispatch", target: "node-worker-1", kind: "dispatch" },
    { id: "e2", source: "node-worker-1", target: "node-legacy-tool", kind: "sequence" },
  ],
};

const mockDatasetB: GraphDataset = {
  id: "run-round-2",
  title: "Round 2 Optimized Execution",
  nodes: [
    {
      id: "node-dispatch",
      name: "Dispatcher",
      kind: "orchestrator",
      status: "success",
      telemetry: { model: { value: "claude-3-5-sonnet", evidence_class: "host_reported" } },
      metrics: {
        durationMs: 1500, // Faster (-500ms)
        tokensIn: 1000,
        tokensOut: 500,
        costUsd: 0.015,
        retries: 0,
      },
    },
    {
      id: "node-worker-1",
      name: "Implementer Agent",
      kind: "agent",
      status: "success", // Fixed!
      telemetry: { model: { value: "claude-3-5-sonnet", evidence_class: "host_reported" } }, // Upgraded model
      metrics: {
        durationMs: 2500, // Faster (-2500ms)
        tokensIn: 2000, // Reduced tokens
        tokensOut: 1000,
        costUsd: 0.01,
        retries: 0,
        repairRounds: 0,
      },
      metadata: {
        findings: [
          {
            id: "finding-01",
            requirementId: "req-01",
            severity: "critical",
            observation: "Missing validation check on node input ports",
            remediation: "Add boundary checks before processing",
            status: "resolved", // Repaired finding!
            revalidationProof: {
              method: "Automated Unit Gate",
              evidence: ["PASS: src/components/ComparisonView.test.tsx"],
            },
          },
          {
            id: "finding-02",
            requirementId: "req-02",
            severity: "important",
            observation: "Suboptimal token caching policy",
            remediation: "Enable prompt caching headers",
            status: "resolved", // Repaired finding!
          },
          {
            id: "finding-03",
            requirementId: "req-03",
            severity: "suggestion",
            observation: "New minor lint warning",
            status: "open", // New finding in target
          },
        ],
      },
    },
    {
      id: "node-validator-gate",
      name: "Adversarial Gate",
      kind: "gate",
      status: "success", // Added node
      metrics: {
        durationMs: 600,
        tokensIn: 500,
        tokensOut: 200,
      },
    },
  ],
  edges: [
    { id: "e1", source: "node-dispatch", target: "node-worker-1", kind: "dispatch" },
    { id: "e3", source: "node-worker-1", target: "node-validator-gate", kind: "gate" }, // Added edge
  ],
};

describe("Multi-Run Comparison & Topology Diff Engine", () => {
  it("computes duration, token, and topology deltas accurately", () => {
    const diff = computeGraphDiff(mockDatasetA, mockDatasetB);

    expect(diff.hasDatasets).toBe(true);
    expect(diff.isIdentical).toBe(false);

    // Duration: Base = 2000 + 5000 + 800 = 7800ms. Target = 1500 + 2500 + 600 = 4600ms. Delta = -3200ms
    expect(diff.summary.duration.baseValue).toBe(7800);
    expect(diff.summary.duration.targetValue).toBe(4600);
    expect(diff.summary.duration.delta).toBe(-3200);

    // Tokens: Base = (1000+500) + (4000+2000) + (200+100) = 7800. Target = (1000+500) + (2000+1000) + (500+200) = 5200. Delta = -2600
    expect(diff.summary.tokens.baseValue).toBe(7800);
    expect(diff.summary.tokens.targetValue).toBe(5200);
    expect(diff.summary.tokens.delta).toBe(-2600);

    // Nodes topology: Base has 3 nodes, Target has 3 nodes (1 removed, 1 added, 2 common [1 modified, 1 modified duration/ms])
    expect(diff.summary.nodes.totalA).toBe(3);
    expect(diff.summary.nodes.totalB).toBe(3);
    expect(diff.summary.nodes.added).toBe(1); // node-validator-gate
    expect(diff.summary.nodes.removed).toBe(1); // node-legacy-tool
    expect(diff.summary.nodes.modified).toBe(2); // node-dispatch + node-worker-1

    // Edges topology: e2 removed, e3 added, e1 unchanged
    expect(diff.summary.edges.added).toBe(1);
    expect(diff.summary.edges.removed).toBe(1);
    expect(diff.summary.edges.unchanged).toBe(1);

    // Repaired findings: finding-01 and finding-02 were repaired! finding-03 is new.
    expect(diff.summary.findings.repaired).toBe(2);
    expect(diff.summary.findings.newIssues).toBe(1);
  });

  it("handles null or undefined datasets gracefully", () => {
    const diffNull = computeGraphDiff(null, null);
    expect(diffNull.hasDatasets).toBe(false);
    expect(diffNull.isIdentical).toBe(true);
    expect(diffNull.nodesDiff.length).toBe(0);

    const diffOne = computeGraphDiff(mockDatasetA, null);
    expect(diffOne.hasDatasets).toBe(true);
    expect(diffOne.summary.nodes.totalA).toBe(3);
    expect(diffOne.summary.nodes.totalB).toBe(0);
    expect(diffOne.summary.nodes.removed).toBe(3);
  });

  it("detects identical datasets", () => {
    const diffIdentical = computeGraphDiff(mockDatasetA, mockDatasetA);
    expect(diffIdentical.hasDatasets).toBe(true);
    expect(diffIdentical.isIdentical).toBe(true);
    expect(diffIdentical.summary.nodes.modified).toBe(0);
    expect(diffIdentical.summary.nodes.added).toBe(0);
    expect(diffIdentical.summary.nodes.removed).toBe(0);
    expect(diffIdentical.summary.nodes.unchanged).toBe(3);
  });

  it("extracts node metrics, models, repair rounds, costs, and token breakdowns", () => {
    const node = mockDatasetA.nodes[1];
    const tokens = getNodeTokensBreakdown(node);
    expect(tokens.tokensIn).toBe(4000);
    expect(tokens.tokensOut).toBe(2000);
    expect(tokens.totalTokens).toBe(6000);

    const findings = getNodeFindings(node);
    expect(findings.length).toBe(2);
    expect(findings[0].id).toBe("finding-01");

    expect(getNodeDurationMs(node)).toBe(5000);
    expect(getNodeCostUsd(node)).toBe(0.02);
    expect(getNodeModel(node)).toBe("claude-3-haiku");
    expect(getNodeRepairRounds(node)).toBe(2);

    // Node with fallback timings
    const nodeFallback: GraphNodeData = {
      id: "node-fallback",
      name: "Fallback Node",
      metadata: {
        durationMs: 1200,
        repairRounds: 1,
        hostAgent: { model: "claude-3-opus" },
      },
    };
    expect(getNodeDurationMs(nodeFallback)).toBe(1200);
    expect(getNodeRepairRounds(nodeFallback)).toBe(1);
    expect(getNodeModel(nodeFallback)).toBe("claude-3-opus");
  });

  it("handles provenance remediations fallback for findings", () => {
    const nodeWithRemediations: GraphNodeData = {
      id: "node-prov",
      name: "Provenance Node",
      provenance: {
        remediations: [
          {
            findingId: "f-prov-1",
            severity: "critical",
            observation: "Observed buffer issue",
            remediation: "Increase buffer limit",
            status: "resolved",
          },
        ],
      },
    };

    const findings = getNodeFindings(nodeWithRemediations);
    expect(findings.length).toBe(1);
    expect(findings[0].id).toBe("f-prov-1");
    expect(findings[0].status).toBe("resolved");
  });

  it("accurately categorizes findings as repaired, new, regressed, persistent_open, persistent_resolved", () => {
    const run1: GraphDataset = {
      id: "r1",
      title: "R1",
      nodes: [
        {
          id: "n1",
          name: "Node 1",
          metadata: {
            findings: [
              {
                id: "f-repaired",
                severity: "important",
                observation: "Fixed later",
                status: "open",
              },
              {
                id: "f-regressed",
                severity: "important",
                observation: "Broken later",
                status: "resolved",
              },
              { id: "f-open", severity: "important", observation: "Stays open", status: "open" },
              {
                id: "f-resolved",
                severity: "important",
                observation: "Stays resolved",
                status: "resolved",
              },
            ],
          },
        },
      ],
      edges: [],
    };

    const run2: GraphDataset = {
      id: "r2",
      title: "R2",
      nodes: [
        {
          id: "n1",
          name: "Node 1",
          metadata: {
            findings: [
              {
                id: "f-repaired",
                severity: "important",
                observation: "Fixed later",
                status: "resolved",
              },
              {
                id: "f-regressed",
                severity: "important",
                observation: "Broken later",
                status: "open",
              },
              { id: "f-open", severity: "important", observation: "Stays open", status: "open" },
              {
                id: "f-resolved",
                severity: "important",
                observation: "Stays resolved",
                status: "resolved",
              },
              { id: "f-new", severity: "critical", observation: "Newly found", status: "open" },
            ],
          },
        },
      ],
      edges: [],
    };

    const diff = computeGraphDiff(run1, run2);
    expect(diff.summary.findings.repaired).toBe(1);
    expect(diff.summary.findings.regressed).toBe(1);
    expect(diff.summary.findings.persistentOpen).toBe(1);
    expect(diff.summary.findings.persistentResolved).toBe(1);
    expect(diff.summary.findings.newIssues).toBe(1);
  });
});

describe("ComparisonView Component", () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    if (renderer) {
      silenceReactTestRendererDeprecationWarning(() => {
        act(() => {
          renderer.unmount();
        });
      });
    }
  });

  it("renders comparison view with KPI summary cards and run tags", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <ComparisonView
            baseDataset={mockDatasetA}
            targetDataset={mockDatasetB}
            baseRunId="Round-1"
            targetRunId="Round-2"
          />,
        );
      });
    });

    const root = renderer.root;
    const view = root.findByProps({ "data-testid": "comparison-view" });
    expect(view).toBeDefined();

    // Check tags
    const baseTag = root.findByProps({ "data-testid": "base-run-tag" });
    expect(baseTag.props.children).toBe("Round-1");

    const targetTag = root.findByProps({ "data-testid": "target-run-tag" });
    expect(targetTag.props.children).toBe("Round-2");

    // Check KPI cards
    const kpiDuration = root.findByProps({ "data-testid": "kpi-duration" });
    expect(kpiDuration).toBeDefined();

    const kpiTokens = root.findByProps({ "data-testid": "kpi-tokens" });
    expect(kpiTokens).toBeDefined();

    const kpiNodes = root.findByProps({ "data-testid": "kpi-nodes" });
    expect(kpiNodes).toBeDefined();

    const kpiFindings = root.findByProps({ "data-testid": "kpi-findings" });
    expect(kpiFindings).toBeDefined();
  });

  it("switches tabs and displays performance & tokens table", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <ComparisonView baseDataset={mockDatasetA} targetDataset={mockDatasetB} />,
        );
      });
    });

    const root = renderer.root;
    const perfTab = root.findByProps({ "data-testid": "tab-performance" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        perfTab.props.onClick();
      });
    });

    const perfView = root.findByProps({ "data-testid": "performance-diff-view" });
    expect(perfView).toBeDefined();

    const row = root.findByProps({ "data-testid": "perf-row-node-worker-1" });
    expect(row).toBeDefined();
  });

  it("renders repaired findings with revalidation proof in findings tab", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <ComparisonView baseDataset={mockDatasetA} targetDataset={mockDatasetB} />,
        );
      });
    });

    const root = renderer.root;
    const findingsTab = root.findByProps({ "data-testid": "tab-findings" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        findingsTab.props.onClick();
      });
    });

    const findingsView = root.findByProps({ "data-testid": "findings-diff-view" });
    expect(findingsView).toBeDefined();

    const finding1Status = root.findByProps({ "data-testid": "finding-status-finding-01" });
    expect(finding1Status.props.children).toBe("✓ REPAIRED");

    const proof = root.findByProps({ "data-testid": "finding-proof-finding-01" });
    expect(proof).toBeDefined();
  });

  it("renders raw diff JSON tab", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <ComparisonView baseDataset={mockDatasetA} targetDataset={mockDatasetB} />,
        );
      });
    });

    const root = renderer.root;
    const rawTab = root.findByProps({ "data-testid": "tab-raw" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        rawTab.props.onClick();
      });
    });

    const rawView = root.findByProps({ "data-testid": "raw-diff-view" });
    expect(rawView).toBeDefined();
  });

  it("expands node diff card via click or Enter key to show side-by-side property diff table", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <ComparisonView baseDataset={mockDatasetA} targetDataset={mockDatasetB} />,
        );
      });
    });

    const root = renderer.root;
    const nodeCard = root.findByProps({ "data-testid": "node-diff-node-worker-1" });
    const header = nodeCard.findByProps({ role: "button" });

    // Keyboard Enter trigger
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        header.props.onKeyDown({ key: "Enter", preventDefault: () => {} });
      });
    });

    const detail = root.findByProps({ "data-testid": "node-diff-detail-node-worker-1" });
    expect(detail).toBeDefined();
  });

  it("filters diff items using status filter buttons and search input", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <ComparisonView baseDataset={mockDatasetA} targetDataset={mockDatasetB} />,
        );
      });
    });

    const root = renderer.root;

    // Filter by + Added
    const addedFilter = root.findByProps({ "data-testid": "filter-status-added" });
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        addedFilter.props.onClick();
      });
    });

    // Only added node should appear
    expect(() =>
      root.findByProps({ "data-testid": "node-diff-node-validator-gate" }),
    ).not.toThrow();
    expect(() => root.findByProps({ "data-testid": "node-diff-node-worker-1" })).toThrow();

    // Search input
    const searchInput = root.findByProps({ "data-testid": "comparison-search-input" });
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        searchInput.props.onChange({ target: { value: "validator" } });
      });
    });

    expect(() =>
      root.findByProps({ "data-testid": "node-diff-node-validator-gate" }),
    ).not.toThrow();
  });

  it("renders identical dataset empty state banner", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <ComparisonView
            baseDataset={mockDatasetA}
            targetDataset={mockDatasetA}
            baseRunId="Round-1"
            targetRunId="Round-1"
          />,
        );
      });
    });

    const root = renderer.root;
    const banner = root.findByProps({ "data-testid": "identical-runs-banner" });
    expect(banner).toBeDefined();
  });

  it("renders empty dataset banner when no datasets provided", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<ComparisonView baseDataset={null} targetDataset={null} />);
      });
    });

    const root = renderer.root;
    const banner = root.findByProps({ "data-testid": "empty-datasets-banner" });
    expect(banner).toBeDefined();
  });

  it("handles onClose, onSwapRuns, and onSelectNode callbacks", () => {
    let closed = false;
    let swapped = false;

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <ComparisonView
            baseDataset={mockDatasetA}
            targetDataset={mockDatasetB}
            onClose={() => {
              closed = true;
            }}
            onSwapRuns={() => {
              swapped = true;
            }}
            onSelectNode={() => {}}
          />,
        );
      });
    });

    const root = renderer.root;
    const closeBtn = root.findByProps({ "data-testid": "comparison-close-btn" });
    const swapBtn = root.findByProps({ "data-testid": "comparison-swap-btn" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        closeBtn.props.onClick();
        swapBtn.props.onClick();
      });
    });

    expect(closed).toBe(true);
    expect(swapped).toBe(true);
  });
});

describe("RunComparisonSelector Component", () => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    if (renderer) {
      silenceReactTestRendererDeprecationWarning(() => {
        act(() => {
          renderer.unmount();
        });
      });
    }
  });

  it("renders run selectors with available options and trigger change callbacks", () => {
    const runs = ["run-01.json", "run-02.json", "run-03.json"];
    let base = "run-01.json";
    let target = "run-02.json";
    let compareArgs: { a: string; b: string } | null = null;

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <RunComparisonSelector
            runs={runs}
            baseRun={base}
            targetRun={target}
            onBaseRunChange={(v) => {
              base = v;
            }}
            onTargetRunChange={(v) => {
              target = v;
            }}
            onCompare={(a, b) => {
              compareArgs = { a, b };
            }}
          />,
        );
      });
    });

    const root = renderer.root;
    const baseSelect = root.findByProps({ "data-testid": "base-run-select" });
    const targetSelect = root.findByProps({ "data-testid": "target-run-select" });
    const compareBtn = root.findByProps({ "data-testid": "compare-runs-btn" });

    expect(baseSelect.props.value).toBe("run-01.json");
    expect(targetSelect.props.value).toBe("run-02.json");

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        baseSelect.props.onChange({ target: { value: "run-03.json" } });
        compareBtn.props.onClick();
      });
    });

    expect(base).toBe("run-03.json");
    expect(compareArgs).toEqual({ a: "run-01.json", b: "run-02.json" });
  });

  it("handles swapping baseline and candidate runs when onSwap is provided", () => {
    const runs = ["run-01.json", "run-02.json"];
    let swapped = false;

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <RunComparisonSelector
            runs={runs}
            baseRun="run-01.json"
            targetRun="run-02.json"
            onSwap={() => {
              swapped = true;
            }}
          />,
        );
      });
    });

    const root = renderer.root;
    const swapBtn = root.findByProps({ "data-testid": "swap-runs-btn" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        swapBtn.props.onClick();
      });
    });

    expect(swapped).toBe(true);
  });

  it("handles swapping baseline and candidate runs internally when onSwap is not provided", () => {
    const runs = ["run-01.json", "run-02.json"];
    let base = "run-01.json";
    let target = "run-02.json";

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <RunComparisonSelector
            runs={runs}
            baseRun={base}
            targetRun={target}
            onBaseRunChange={(v) => {
              base = v;
            }}
            onTargetRunChange={(v) => {
              target = v;
            }}
          />,
        );
      });
    });

    const root = renderer.root;
    const swapBtn = root.findByProps({ "data-testid": "swap-runs-btn" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        swapBtn.props.onClick();
      });
    });

    expect(base).toBe("run-02.json");
    expect(target).toBe("run-01.json");
  });

  it("displays empty state when no runs are available", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<RunComparisonSelector runs={[]} />);
      });
    });

    const root = renderer.root;
    const msg = root.findByProps({ "data-testid": "no-runs-message" });
    expect(msg).toBeDefined();
  });

  it("displays same-run warning when baseline and candidate match", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <RunComparisonSelector
            runs={["run-01.json", "run-02.json"]}
            baseRun="run-01.json"
            targetRun="run-01.json"
          />,
        );
      });
    });

    const root = renderer.root;
    const warning = root.findByProps({ "data-testid": "same-run-warning" });
    expect(warning).toBeDefined();
  });
});
