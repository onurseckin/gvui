import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import {
  calculateMetricDelta,
  compareEdgeProperties,
  compareFiles,
  compareFindings,
  compareNodeProperties,
  comparePorts,
  compareTools,
  computeGraphDiff,
  deepEqual,
  detectCycles,
  detectDanglingEdges,
  detectOrphanedNodes,
  filterEdgeDiffs,
  filterNodeDiffs,
  formatCostUsd,
  formatDurationMs,
  formatMetricDeltaValue,
  getEdgeTraffic,
  getNodeCostUsd,
  getNodeDurationMs,
  getNodeFindings,
  getNodeModel,
  getNodeRepairRounds,
  getNodeRetries,
  getNodeTokensBreakdown,
  GraphDiffLegend,
  GraphDiffOverlay,
  GraphDiffSummaryDrawer,
  GraphDiffToolbar,
  isPrimitive,
  safeStringify,
  sanitizeEdge,
  sanitizeNode,
  useGraphDiffStore,
} from "./index";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Helper to suppress react-test-renderer deprecation warning in tests
function silenceDeprecations<T>(fn: () => T): T {
  const originalConsoleError = console.error;
  console.error = (message?: unknown, ...args: unknown[]) => {
    if (typeof message === "string" && message.includes("react-test-renderer is deprecated")) {
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

// Sample Test Datasets
const sampleBaselineDataset: GraphDataset = {
  id: "run-baseline-001",
  title: "Baseline Execution Run",
  nodes: [
    {
      id: "node-dispatch",
      name: "Dispatcher Node",
      kind: "orchestrator",
      status: "success",
      telemetry: { model: { value: "claude-3-5-sonnet", evidence_class: "host_reported" } },
      metrics: {
        durationMs: 1500,
        tokensIn: 2000,
        tokensOut: 800,
        costUsd: 0.015,
        retries: 0,
        repairRounds: 0,
      },
      tools: [{ name: "run_command" }],
      files: [{ path: "src/main.ts", mode: "read", additions: 0, deletions: 0 }],
      io: {
        inputs: [{ label: "task_spec", kind: "prompt", tokens: 500 }],
        outputs: [{ label: "plan", kind: "artifact", tokens: 300 }],
      },
    },
    {
      id: "node-worker-1",
      name: "Worker 1 Agent",
      kind: "agent",
      status: "error",
      telemetry: { model: { value: "claude-3-haiku", evidence_class: "host_reported" } },
      metrics: {
        durationMs: 4500,
        tokensIn: 5000,
        tokensOut: 1500,
        costUsd: 0.025,
        retries: 2,
        repairRounds: 2,
      },
      metadata: {
        findings: [
          {
            id: "finding-01",
            requirementId: "req-auth-01",
            severity: "critical",
            observation: "Authentication token was missing expiry check",
            remediation: "Add JWT exp verification",
            status: "open",
          },
        ],
      },
    },
    {
      id: "node-removed-worker",
      name: "Deprecated Preprocessor",
      kind: "tool",
      status: "success",
      metrics: {
        durationMs: 800,
        tokensIn: 400,
        tokensOut: 100,
        costUsd: 0.002,
      },
    },
  ],
  edges: [
    {
      id: "edge-dispatch-to-worker",
      source: "node-dispatch",
      target: "node-worker-1",
      kind: "spawn",
      label: "Spawns worker",
      weight: 1,
      traffic: {
        volume: 5,
        tokens: 3000,
        bytes: 12000,
        messagesCount: 5,
      },
    },
    {
      id: "edge-removed",
      source: "node-dispatch",
      target: "node-removed-worker",
      kind: "sequence",
    },
  ],
};

const sampleComparisonDataset: GraphDataset = {
  id: "run-comparison-002",
  title: "Candidate Execution Run",
  nodes: [
    {
      id: "node-dispatch",
      name: "Dispatcher Node V2", // Modified name
      kind: "orchestrator",
      status: "success",
      telemetry: {
        model: { value: "claude-3-5-sonnet-20241022", evidence_class: "host_reported" },
      }, // Modified model
      metrics: {
        durationMs: 1200, // Faster duration
        tokensIn: 1800,
        tokensOut: 700,
        costUsd: 0.012,
        retries: 0,
        repairRounds: 0,
      },
      tools: [{ name: "run_command" }, { name: "search_web" }], // Added tool
      files: [{ path: "src/main.ts", mode: "write", additions: 20, deletions: 5 }],
      io: {
        inputs: [{ label: "task_spec", kind: "prompt", tokens: 450 }],
        outputs: [{ label: "plan", kind: "artifact", tokens: 300 }],
      },
    },
    {
      id: "node-worker-1",
      name: "Worker 1 Agent",
      kind: "agent",
      status: "success", // Status repaired from error to success
      telemetry: { model: { value: "claude-3-5-sonnet", evidence_class: "host_reported" } }, // Upgraded model
      metrics: {
        durationMs: 3000, // Faster
        tokensIn: 4000,
        tokensOut: 1200,
        costUsd: 0.03,
        retries: 0,
        repairRounds: 0,
      },
      metadata: {
        findings: [
          {
            id: "finding-01",
            requirementId: "req-auth-01",
            severity: "critical",
            observation: "Authentication token was missing expiry check",
            remediation: "Add JWT exp verification",
            status: "resolved", // Resolved finding
            revalidationProof: {
              method: "unit-test",
              evidence: ["token-verification-test passed with 100% assertions"],
            },
          },
          {
            id: "finding-02",
            requirementId: "req-rate-limit",
            severity: "important",
            observation: "Rate limit threshold set too low",
            status: "open", // New finding
          },
        ],
      },
    },
    {
      id: "node-added-gate",
      name: "Validation Gate",
      kind: "gate",
      status: "success",
      metrics: {
        durationMs: 400,
        tokensIn: 600,
        tokensOut: 200,
        costUsd: 0.004,
      },
    },
  ],
  edges: [
    {
      id: "edge-dispatch-to-worker",
      source: "node-dispatch",
      target: "node-worker-1",
      kind: "spawn",
      label: "Spawns optimized worker", // Modified label
      weight: 2,
      traffic: {
        volume: 8,
        tokens: 4500,
        bytes: 18000,
        messagesCount: 8,
      },
    },
    {
      id: "edge-worker-to-gate",
      source: "node-worker-1",
      target: "node-added-gate",
      kind: "validation",
      label: "Validate output",
    },
  ],
};

describe("GVUI Graph Diff Pure Engine & Utilities", () => {
  it("calculates metric deltas accurately for positive, negative, and zero values", () => {
    const delta1 = calculateMetricDelta(100, 150);
    expect(delta1.delta).toBe(50);
    expect(delta1.percentChange).toBe(50);
    expect(delta1.isIncrease).toBe(true);
    expect(delta1.isDecrease).toBe(false);
    expect(delta1.isNeutral).toBe(false);

    const delta2 = calculateMetricDelta(200, 100);
    expect(delta2.delta).toBe(-100);
    expect(delta2.percentChange).toBe(-50);
    expect(delta2.isIncrease).toBe(false);
    expect(delta2.isDecrease).toBe(true);

    const delta3 = calculateMetricDelta(50, 50);
    expect(delta3.delta).toBe(0);
    expect(delta3.percentChange).toBe(0);
    expect(delta3.isNeutral).toBe(true);

    // 0 denominator handling
    const deltaZeroBase = calculateMetricDelta(0, 100);
    expect(deltaZeroBase.percentChange).toBe(100);
    expect(deltaZeroBase.delta).toBe(100);

    const deltaZeroComp = calculateMetricDelta(100, 0);
    expect(deltaZeroComp.percentChange).toBe(-100);
    expect(deltaZeroComp.delta).toBe(-100);
  });

  it("formats metric delta strings correctly", () => {
    expect(formatMetricDeltaValue(0)).toBe("0");
    expect(formatMetricDeltaValue(500)).toBe("+500");
    expect(formatMetricDeltaValue(-500)).toBe("-500");
    expect(formatMetricDeltaValue(2500, "tok")).toBe("+2.5k tok");
    expect(formatMetricDeltaValue(3500000)).toBe("+3.5M");
  });

  it("formats durations and USD costs cleanly", () => {
    expect(formatDurationMs(0)).toBe("0 ms");
    expect(formatDurationMs(450)).toBe("450 ms");
    expect(formatDurationMs(2500)).toBe("2.50 s");
    expect(formatDurationMs(65000)).toBe("1m 5.0s");
    expect(formatDurationMs(-3000)).toBe("-3.00 s");

    expect(formatCostUsd(0)).toBe("$0.00");
    expect(formatCostUsd(0.0045)).toBe("$0.0045");
    expect(formatCostUsd(12.5)).toBe("$12.50");
    expect(formatCostUsd(-0.015)).toBe("-$0.0150");
  });

  it("deep equality comparison tests primitives, arrays, objects, and circular structures", () => {
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(10, 10)).toBe(true);
    expect(deepEqual("abc", "abc")).toBe(true);
    expect(deepEqual("abc", "def")).toBe(false);

    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(true);
    expect(deepEqual({ a: 1, b: "x" }, { a: 1, b: "y" })).toBe(false);

    // Circular references handling
    const objA: Record<string, unknown> = { name: "test" };
    objA.self = objA;
    const objB: Record<string, unknown> = { name: "test" };
    objB.self = objB;
    expect(deepEqual(objA, objB)).toBe(true);

    expect(isPrimitive(null)).toBe(true);
    expect(isPrimitive(undefined)).toBe(true);
    expect(isPrimitive("str")).toBe(true);
    expect(isPrimitive({})).toBe(false);

    expect(safeStringify(undefined)).toBe("undefined");
    expect(safeStringify(null)).toBe("null");
    expect(safeStringify(42)).toBe("42");
    expect(safeStringify({ a: 1 })).toBe('{"a":1}');
  });

  it("extracts node metrics, timing, tokens, costs, models, and findings correctly", () => {
    const nodeA: GraphNodeData = {
      id: "test-node",
      name: "Test",
      metrics: {
        durationMs: 1200,
        tokensIn: 500,
        tokensOut: 200,
        costUsd: 0.005,
        repairRounds: 1,
        retries: 2,
        tokens: {
          promptTokens: 500,
          completionTokens: 200,
          reasoningTokens: 100,
          cacheReadTokens: 50,
          cacheCreationTokens: 25,
          totalTokens: 800,
        },
      },
    };

    expect(getNodeDurationMs(nodeA)).toBe(1200);
    expect(getNodeCostUsd(nodeA)).toBe(0.005);
    expect(getNodeRepairRounds(nodeA)).toBe(1);
    expect(getNodeRetries(nodeA)).toBe(2);

    const tokensBreakdown = getNodeTokensBreakdown(nodeA);
    expect(tokensBreakdown.prompt).toBe(500);
    expect(tokensBreakdown.completion).toBe(200);
    expect(tokensBreakdown.reasoning).toBe(100);
    expect(tokensBreakdown.cacheRead).toBe(50);
    expect(tokensBreakdown.cacheCreation).toBe(25);
    expect(tokensBreakdown.total).toBe(800);

    const emptyNode: GraphNodeData = { id: "empty", name: "Empty" };
    expect(getNodeDurationMs(emptyNode)).toBe(0);
    expect(getNodeCostUsd(emptyNode)).toBe(0);
    expect(getNodeRepairRounds(emptyNode)).toBe(0);
    expect(getNodeRetries(emptyNode)).toBe(0);
    expect(getNodeModel(emptyNode)).toBe(null);
    expect(getNodeFindings(emptyNode)).toEqual([]);

    expect(getEdgeTraffic(null)).toEqual({
      volume: 0,
      tokens: 0,
      bytes: 0,
      messagesCount: 0,
      exchangesCount: 0,
    });
  });

  it("handles null and undefined datasets gracefully in computeGraphDiff", () => {
    const resultNull = computeGraphDiff(null, null);
    expect(resultNull.hasDatasets).toBe(false);
    expect(resultNull.isIdentical).toBe(false);
    expect(resultNull.nodeDiffs).toHaveLength(0);
    expect(resultNull.edgeDiffs).toHaveLength(0);

    const resultPartial = computeGraphDiff(sampleBaselineDataset, null);
    expect(resultPartial.hasDatasets).toBe(true);
    expect(resultPartial.counts.nodes.removed).toBe(3);
    expect(resultPartial.counts.edges.removed).toBe(2);
  });

  it("detects identical datasets accurately", () => {
    const identicalResult = computeGraphDiff(sampleBaselineDataset, sampleBaselineDataset);
    expect(identicalResult.hasDatasets).toBe(true);
    expect(identicalResult.isIdentical).toBe(true);
    expect(identicalResult.topologyChanged).toBe(false);
    expect(identicalResult.counts.nodes.unchanged).toBe(3);
    expect(identicalResult.counts.edges.unchanged).toBe(2);
    expect(identicalResult.counts.nodes.added).toBe(0);
    expect(identicalResult.counts.nodes.removed).toBe(0);
    expect(identicalResult.counts.nodes.modified).toBe(0);
  });

  it("computes complete topology and metric diff across baseline and candidate runs", () => {
    const diff = computeGraphDiff(sampleBaselineDataset, sampleComparisonDataset);
    expect(diff.hasDatasets).toBe(true);
    expect(diff.isIdentical).toBe(false);
    expect(diff.topologyChanged).toBe(true);
    expect(diff.executionMetricsChanged).toBe(true);

    // Node Counts
    expect(diff.counts.nodes.added).toBe(1);
    expect(diff.counts.nodes.removed).toBe(1);
    expect(diff.counts.nodes.modified).toBe(2);
    expect(diff.counts.nodes.total).toBe(4);

    // Edge Counts
    expect(diff.counts.edges.added).toBe(1);
    expect(diff.counts.edges.removed).toBe(1);
    expect(diff.counts.edges.modified).toBe(1);

    // Findings Statuses
    expect(diff.counts.findings.repaired).toBe(1);
    expect(diff.counts.findings.new).toBe(1);

    // Node Diff inspection
    const addedGate = diff.nodeDiffMap["node-added-gate"];
    expect(addedGate).toBeDefined();
    expect(addedGate?.status).toBe("added");
    expect(addedGate?.isStructuralChange).toBe(true);

    const removedWorker = diff.nodeDiffMap["node-removed-worker"];
    expect(removedWorker).toBeDefined();
    expect(removedWorker?.status).toBe("removed");

    const modifiedDispatch = diff.nodeDiffMap["node-dispatch"];
    expect(modifiedDispatch).toBeDefined();
    expect(modifiedDispatch?.status).toBe("modified");
    expect(
      modifiedDispatch?.toolChanges.some((t) => t.name === "search_web" && t.status === "added"),
    ).toBe(true);
    expect(
      modifiedDispatch?.fileChanges.some(
        (f) => f.path === "src/main.ts" && f.status === "modified",
      ),
    ).toBe(true);

    // Metric Summary Deltas
    expect(diff.metrics.gateCount.delta).toBe(1);
    expect(diff.metrics.repairRoundsCount.delta).toBe(-2);
    expect(diff.metrics.totalDurationMs.delta).toBeLessThan(0);
  });

  it("accurately compares ports, tools, and files sub-entities", () => {
    const portsBase = [{ label: "in1", kind: "prompt" as const, tokens: 100 }];
    const portsComp = [
      { label: "in1", kind: "prompt" as const, tokens: 200 },
      { label: "in2", kind: "artifact" as const, tokens: 50 },
    ];
    const portDiffs = comparePorts(portsBase, portsComp);
    expect(portDiffs).toHaveLength(2);
    expect(portDiffs.find((p) => p.label === "in1")?.status).toBe("modified");
    expect(portDiffs.find((p) => p.label === "in2")?.status).toBe("added");

    const toolsBase = [{ name: "bash" }, { name: "python" }];
    const toolsComp = [{ name: "bash" }, { name: "node" }];
    const toolDiffs = compareTools(toolsBase, toolsComp);
    expect(toolDiffs.find((t) => t.name === "python")?.status).toBe("removed");
    expect(toolDiffs.find((t) => t.name === "node")?.status).toBe("added");
    expect(toolDiffs.find((t) => t.name === "bash")?.status).toBe("unchanged");

    const filesBase = [{ path: "a.ts", additions: 10, deletions: 2 }];
    const filesComp = [{ path: "a.ts", additions: 15, deletions: 2 }, { path: "b.ts" }];
    const fileDiffs = compareFiles(filesBase, filesComp);
    expect(fileDiffs.find((f) => f.path === "a.ts")?.status).toBe("modified");
    expect(fileDiffs.find((f) => f.path === "b.ts")?.status).toBe("added");

    const findingsBase = [
      { id: "f1", severity: "critical" as const, observation: "obs 1", status: "open" as const },
      {
        id: "f2",
        severity: "important" as const,
        observation: "obs 2",
        status: "resolved" as const,
      },
    ];
    const findingsComp = [
      {
        id: "f1",
        severity: "critical" as const,
        observation: "obs 1",
        status: "resolved" as const,
      },
      { id: "f2", severity: "important" as const, observation: "obs 2", status: "open" as const },
    ];
    const findingsDiff = compareFindings(findingsBase, findingsComp);
    expect(findingsDiff.find((f) => f.id === "f1")?.status).toBe("repaired");
    expect(findingsDiff.find((f) => f.id === "f2")?.status).toBe("regressed");

    const nodeProps = compareNodeProperties(
      {
        id: "n1",
        name: "Node 1",
        telemetry: { model: { value: "gpt-4o", evidence_class: "host_reported" } },
      },
      {
        id: "n1",
        name: "Node 1 Updated",
        telemetry: { model: { value: "claude-3-5-sonnet", evidence_class: "host_reported" } },
      },
    );
    expect(nodeProps.find((p) => p.field === "name")?.isDifferent).toBe(true);
    expect(nodeProps.find((p) => p.field === "model")?.isDifferent).toBe(true);

    const edgeProps = compareEdgeProperties(
      { id: "e1", source: "n1", target: "n2", kind: "sequence" },
      { id: "e1", source: "n1", target: "n2", kind: "spawn" },
    );
    expect(edgeProps.find((p) => p.field === "kind")?.isDifferent).toBe(true);
  });

  it("filters node and edge diffs correctly with modes and search query", () => {
    const diff = computeGraphDiff(sampleBaselineDataset, sampleComparisonDataset);

    const addedOnly = filterNodeDiffs(diff.nodeDiffs, "added-only");
    expect(addedOnly).toHaveLength(1);
    expect(addedOnly[0]?.id).toBe("node-added-gate");

    const removedOnly = filterNodeDiffs(diff.nodeDiffs, "removed-only");
    expect(removedOnly).toHaveLength(1);
    expect(removedOnly[0]?.id).toBe("node-removed-worker");

    const modifiedOnly = filterNodeDiffs(diff.nodeDiffs, "modified-only");
    expect(modifiedOnly).toHaveLength(2);

    const changesOnly = filterNodeDiffs(diff.nodeDiffs, "changes-only");
    expect(changesOnly).toHaveLength(4);

    const searchGate = filterNodeDiffs(diff.nodeDiffs, "all", "Gate");
    expect(searchGate).toHaveLength(1);
    expect(searchGate[0]?.id).toBe("node-added-gate");

    const searchModel = filterNodeDiffs(diff.nodeDiffs, "all", "sonnet");
    expect(searchModel).toHaveLength(2);

    const edgesAdded = filterEdgeDiffs(diff.edgeDiffs, "added-only");
    expect(edgesAdded).toHaveLength(1);
    expect(edgesAdded[0]?.id).toBe("edge-worker-to-gate");

    const edgeSearch = filterEdgeDiffs(diff.edgeDiffs, "all", "worker");
    expect(edgeSearch).toHaveLength(3);
  });
});

describe("Adversarial Stress-Testing & Topology Edge Cases", () => {
  it("detects directed cycles, self-loops, and mutual feedback cycles accurately", () => {
    // 3-node cycle: A -> B -> C -> A
    const cyclicDataset: GraphDataset = {
      id: "run-cyclic",
      title: "Cyclic Graph",
      nodes: [
        { id: "node-a", name: "A" },
        { id: "node-b", name: "B" },
        { id: "node-c", name: "C" },
      ],
      edges: [
        { id: "e-ab", source: "node-a", target: "node-b" },
        { id: "e-bc", source: "node-b", target: "node-c" },
        { id: "e-ca", source: "node-c", target: "node-a", isCycle: true },
      ],
    };

    const acyclicDataset: GraphDataset = {
      id: "run-acyclic",
      title: "Acyclic Graph",
      nodes: [
        { id: "node-a", name: "A" },
        { id: "node-b", name: "B" },
        { id: "node-c", name: "C" },
      ],
      edges: [
        { id: "e-ab", source: "node-a", target: "node-b" },
        { id: "e-bc", source: "node-b", target: "node-c" },
      ],
    };

    const cycles = detectCycles(["node-a", "node-b", "node-c"], cyclicDataset.edges);
    expect(cycles.cyclicNodeIds.has("node-a")).toBe(true);
    expect(cycles.cyclicNodeIds.has("node-b")).toBe(true);
    expect(cycles.cyclicNodeIds.has("node-c")).toBe(true);
    expect(cycles.cyclicEdgeIds.has("e-ca")).toBe(true);

    // Diff where baseline has cycle and candidate resolves/breaks it
    const diff = computeGraphDiff(cyclicDataset, acyclicDataset);
    expect(diff.counts.edges.removed).toBe(1);
    expect(diff.edgeDiffMap["e-ca"]?.status).toBe("removed");
    expect(diff.edgeDiffMap["e-ca"]?.isCycleBase).toBe(true);
    expect(diff.edgeDiffMap["e-ca"]?.isCycleComp).toBe(false);

    // Self-loop test: Node X -> Node X
    const selfLoopCycles = detectCycles(
      ["node-x"],
      [{ id: "e-self", source: "node-x", target: "node-x" }],
    );
    expect(selfLoopCycles.cyclicNodeIds.has("node-x")).toBe(true);
    expect(selfLoopCycles.cyclicEdgeIds.has("e-self")).toBe(true);
  });

  it("detects orphaned nodes and dangling edges accurately", () => {
    const orphanedDataset: GraphDataset = {
      id: "run-orphans",
      title: "Orphans Run",
      nodes: [
        { id: "connected-1", name: "Connected 1" },
        { id: "connected-2", name: "Connected 2" },
        { id: "isolated-orphan", name: "Orphan Node" },
      ],
      edges: [
        { id: "edge-valid", source: "connected-1", target: "connected-2" },
        { id: "edge-dangling-src", source: "non-existent-src", target: "connected-2" },
        { id: "edge-dangling-tgt", source: "connected-1", target: "non-existent-tgt" },
      ],
    };

    const nodeIds = new Set(["connected-1", "connected-2", "isolated-orphan"]);
    const orphans = detectOrphanedNodes(orphanedDataset.nodes, orphanedDataset.edges);
    expect(orphans.has("isolated-orphan")).toBe(true);
    expect(orphans.has("connected-1")).toBe(false);

    const dangling = detectDanglingEdges(orphanedDataset.edges, nodeIds);
    expect(dangling.has("edge-dangling-src")).toBe(true);
    expect(dangling.has("edge-dangling-tgt")).toBe(true);
    expect(dangling.has("edge-valid")).toBe(false);

    const diff = computeGraphDiff(orphanedDataset, sampleBaselineDataset);
    expect(diff.counts.orphans.baseNodes).toBe(1);
    expect(diff.counts.orphans.baseEdges).toBe(2);
    expect(diff.nodeDiffMap["isolated-orphan"]?.isOrphanedBase).toBe(true);
    expect(diff.edgeDiffMap["edge-dangling-src"]?.isDanglingBase).toBe(true);
  });

  it("handles completely empty topology diffs", () => {
    const emptyA: GraphDataset = { id: "empty-a", title: "", nodes: [], edges: [] };
    const emptyB: GraphDataset = { id: "empty-b", title: "", nodes: [], edges: [] };

    const diff = computeGraphDiff(emptyA, emptyB);
    expect(diff.hasDatasets).toBe(true);
    expect(diff.isIdentical).toBe(true);
    expect(diff.topologyChanged).toBe(false);
    expect(diff.counts.nodes.total).toBe(0);
    expect(diff.counts.edges.total).toBe(0);
    expect(diff.counts.findings.total).toBe(0);

    // Empty vs Populated
    const diffEmptyVsPopulated = computeGraphDiff(emptyA, sampleBaselineDataset);
    expect(diffEmptyVsPopulated.counts.nodes.added).toBe(3);
    expect(diffEmptyVsPopulated.counts.edges.added).toBe(2);
    expect(diffEmptyVsPopulated.topologyChanged).toBe(true);
  });

  it("resiliently sanitizes invalid graph schemas, nullish fields, and non-finite numbers", () => {
    const invalidDatasetA = {
      id: "run-invalid-a",
      title: "Corrupt Run",
      nodes: [
        null,
        undefined,
        "not-a-node-object",
        { id: "", name: "" }, // empty string ID
        {
          id: "node-corrupt-metrics",
          name: "Corrupt Metrics",
          metrics: {
            durationMs: Number.NaN,
            costUsd: Number.POSITIVE_INFINITY,
            retries: Number.NEGATIVE_INFINITY,
            tokensIn: "not-a-number",
          },
        },
      ],
      edges: [null, "not-an-edge", { id: "e1", source: null, target: undefined }],
    } as unknown as GraphDataset;

    const sanitizedNode = sanitizeNode(null, 99);
    expect(sanitizedNode.id).toBe("node-synth-99");
    expect(sanitizedNode.status).toBe("pending");

    const sanitizedEdge = sanitizeEdge(null, 42);
    expect(sanitizedEdge.id).toBe("edge-synth-42");

    // computeGraphDiff must not throw or crash on corrupt inputs
    const diff = computeGraphDiff(invalidDatasetA, sampleBaselineDataset);
    expect(diff.hasDatasets).toBe(true);
    expect(diff.nodeDiffs.length).toBeGreaterThan(0);

    const corruptNodeDiff = diff.nodeDiffMap["node-corrupt-metrics"];
    expect(corruptNodeDiff).toBeDefined();
    expect(Number.isFinite(corruptNodeDiff?.metrics.durationMs.baseValue)).toBe(true);
    expect(corruptNodeDiff?.metrics.durationMs.baseValue).toBe(0);
    expect(corruptNodeDiff?.metrics.costUsd.baseValue).toBe(0);
  });
});

describe("GVUI useGraphDiffStore Zustand Store", () => {
  beforeEach(() => {
    act(() => {
      useGraphDiffStore.getState().reset();
    });
  });

  it("initializes with clean default state", () => {
    const state = useGraphDiffStore.getState();
    expect(state.baseRunId).toBe(null);
    expect(state.comparisonRunId).toBe(null);
    expect(state.baseDataset).toBe(null);
    expect(state.comparisonDataset).toBe(null);
    expect(state.filterMode).toBe("all");
    expect(state.visualMode).toBe("unified-overlay");
    expect(state.overlayOpacity).toBe(0.75);
    expect(state.splitRatio).toBe(0.5);
    expect(state.isSummaryDrawerOpen).toBe(false);
    expect(state.isLegendOpen).toBe(true);
  });

  it("sets datasets and recomputes diff correctly", () => {
    act(() => {
      useGraphDiffStore
        .getState()
        .setDatasets(sampleBaselineDataset, sampleComparisonDataset, "run-base", "run-comp");
    });

    const state = useGraphDiffStore.getState();
    expect(state.baseRunId).toBe("run-base");
    expect(state.comparisonRunId).toBe("run-comp");
    expect(state.diffResult.hasDatasets).toBe(true);
    expect(state.diffResult.counts.nodes.total).toBe(4);

    expect(state.getFilteredNodes()).toHaveLength(4);
    expect(state.getFilteredEdges()).toHaveLength(3);
    expect(state.getCounts().nodes.added).toBe(1);
    expect(state.getMetrics().gateCount.delta).toBe(1);
  });

  it("updates filter mode, visual mode, opacity, and search query", () => {
    act(() => {
      useGraphDiffStore.getState().setDatasets(sampleBaselineDataset, sampleComparisonDataset);
      useGraphDiffStore.getState().setFilterMode("added-only");
      useGraphDiffStore.getState().setVisualMode("split-screen");
      useGraphDiffStore.getState().setOverlayOpacity(0.4);
      useGraphDiffStore.getState().setSearchQuery("gate");
    });

    const state = useGraphDiffStore.getState();
    expect(state.filterMode).toBe("added-only");
    expect(state.visualMode).toBe("split-screen");
    expect(state.overlayOpacity).toBe(0.4);
    expect(state.searchQuery).toBe("gate");

    const filtered = state.getFilteredNodes();
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.id).toBe("node-added-gate");
  });

  it("clamps overlay opacity and split ratio within safe bounds", () => {
    act(() => {
      useGraphDiffStore.getState().setOverlayOpacity(1.5);
      useGraphDiffStore.getState().setSplitRatio(0.02);
    });

    const state = useGraphDiffStore.getState();
    expect(state.overlayOpacity).toBe(1.0);
    expect(state.splitRatio).toBe(0.1);

    act(() => {
      useGraphDiffStore.getState().setOverlayOpacity(-0.5);
      useGraphDiffStore.getState().setSplitRatio(0.99);
    });

    const state2 = useGraphDiffStore.getState();
    expect(state2.overlayOpacity).toBe(0.05);
    expect(state2.splitRatio).toBe(0.9);
  });

  it("selects node and edge and auto-opens summary drawer", () => {
    act(() => {
      useGraphDiffStore.getState().setDatasets(sampleBaselineDataset, sampleComparisonDataset);
      useGraphDiffStore.getState().setSelectedNodeId("node-worker-1");
    });

    const state = useGraphDiffStore.getState();
    expect(state.selectedNodeId).toBe("node-worker-1");
    expect(state.selectedEdgeId).toBe(null);
    expect(state.isSummaryDrawerOpen).toBe(true);
    expect(state.activeDrawerTab).toBe("nodes");
    expect(state.getSelectedNodeDiff()?.name).toBe("Worker 1 Agent");

    act(() => {
      useGraphDiffStore.getState().setSelectedEdgeId("edge-dispatch-to-worker");
    });

    const stateEdge = useGraphDiffStore.getState();
    expect(stateEdge.selectedEdgeId).toBe("edge-dispatch-to-worker");
    expect(stateEdge.selectedNodeId).toBe(null);
    expect(stateEdge.activeDrawerTab).toBe("edges");
    expect(stateEdge.getSelectedEdgeDiff()?.source).toBe("node-dispatch");
  });

  it("toggles summary drawer, legend, and metric badges", () => {
    act(() => {
      useGraphDiffStore.getState().toggleSummaryDrawer();
      useGraphDiffStore.getState().toggleLegend();
      useGraphDiffStore.getState().toggleMetricBadges();
    });

    const state = useGraphDiffStore.getState();
    expect(state.isSummaryDrawerOpen).toBe(true);
    expect(state.isLegendOpen).toBe(false);
    expect(state.showMetricBadges).toBe(false);
  });

  it("swaps baseline and comparison runs and recomputes the inverted diff", () => {
    act(() => {
      useGraphDiffStore
        .getState()
        .setDatasets(sampleBaselineDataset, sampleComparisonDataset, "run-base", "run-comp");
      useGraphDiffStore.getState().swapRuns();
    });

    const state = useGraphDiffStore.getState();
    expect(state.baseRunId).toBe("run-comp");
    expect(state.comparisonRunId).toBe("run-base");
    expect(state.diffResult.counts.nodes.removed).toBe(1);
    expect(state.diffResult.counts.nodes.added).toBe(1);
  });
});

describe("GVUI GraphDiff UI Components Rendering", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    act(() => {
      useGraphDiffStore.getState().reset();
      useGraphDiffStore
        .getState()
        .setDatasets(
          sampleBaselineDataset,
          sampleComparisonDataset,
          "run-baseline",
          "run-candidate",
        );
    });
  });

  afterEach(() => {
    if (renderer) {
      act(() => {
        renderer?.unmount();
      });
      renderer = null;
    }
  });

  it("renders GraphDiffToolbar with run badges, mode buttons, and filter pills", () => {
    silenceDeprecations(() => {
      act(() => {
        renderer = create(<GraphDiffToolbar onSwapRuns={() => {}} onClose={() => {}} />);
      });
    });

    expect(renderer).not.toBeNull();
    const json = JSON.stringify(renderer?.toJSON());
    expect(json).toContain("Graph Diff");
    expect(json).toContain("Base:");
    expect(json).toContain("Comp:");
    expect(json).toContain("Overlay");
    expect(json).toContain("Side by Side");
    expect(json).toContain("Split");
    expect(json).toContain("+ Added");
    expect(json).toContain("- Removed");
    expect(json).toContain("Δ Modified");
  });

  it("renders GraphDiffLegend and handles filter clicking", () => {
    silenceDeprecations(() => {
      act(() => {
        renderer = create(<GraphDiffLegend />);
      });
    });

    expect(renderer).not.toBeNull();
    const json = JSON.stringify(renderer?.toJSON());
    expect(json).toContain("Topology Diff Legend");
    expect(json).toContain("+ Added Node / Edge");
    expect(json).toContain("- Removed Node / Edge");
    expect(json).toContain("Δ Modified Node / Edge");
  });

  it("renders GraphDiffSummaryDrawer with KPI summary cards and tab navigation", () => {
    act(() => {
      useGraphDiffStore.getState().setSummaryDrawerOpen(true);
    });

    silenceDeprecations(() => {
      act(() => {
        renderer = create(<GraphDiffSummaryDrawer />);
      });
    });

    expect(renderer).not.toBeNull();
    const json = JSON.stringify(renderer?.toJSON());
    expect(json).toContain("Diff Inspector");
    expect(json).toContain("Duration");
    expect(json).toContain("Total Tokens");
    expect(json).toContain("Gate Findings");
    expect(json).toContain("Topology Change Breakdown");
  });

  it("renders GraphDiffOverlay in unified overlay mode", () => {
    silenceDeprecations(() => {
      act(() => {
        renderer = create(
          <GraphDiffOverlay
            baseDataset={sampleBaselineDataset}
            comparisonDataset={sampleComparisonDataset}
          />,
        );
      });
    });

    expect(renderer).not.toBeNull();
    const json = JSON.stringify(renderer?.toJSON());
    expect(json).toContain("Dispatcher Node");
    expect(json).toContain("Worker 1 Agent");
    expect(json).toContain("Validation Gate");
  });

  it("renders GraphDiffOverlay in side-by-side mode", () => {
    act(() => {
      useGraphDiffStore.getState().setVisualMode("side-by-side");
    });

    silenceDeprecations(() => {
      act(() => {
        renderer = create(
          <GraphDiffOverlay
            baseDataset={sampleBaselineDataset}
            comparisonDataset={sampleComparisonDataset}
          />,
        );
      });
    });

    expect(renderer).not.toBeNull();
    const json = JSON.stringify(renderer?.toJSON());
    expect(json).toContain("Baseline Run:");
    expect(json).toContain("Candidate Run:");
  });

  it("renders GraphDiffOverlay in split-screen mode", () => {
    act(() => {
      useGraphDiffStore.getState().setVisualMode("split-screen");
    });

    silenceDeprecations(() => {
      act(() => {
        renderer = create(
          <GraphDiffOverlay
            baseDataset={sampleBaselineDataset}
            comparisonDataset={sampleComparisonDataset}
          />,
        );
      });
    });

    expect(renderer).not.toBeNull();
    const json = JSON.stringify(renderer?.toJSON());
    expect(json).toContain("diff-split-container");
    expect(json).toContain("diff-split-divider");
  });

  it("renders empty banners when datasets are identical or missing", () => {
    act(() => {
      useGraphDiffStore.getState().setDatasets(sampleBaselineDataset, sampleBaselineDataset);
    });

    silenceDeprecations(() => {
      act(() => {
        renderer = create(<GraphDiffOverlay />);
      });
    });

    expect(renderer).not.toBeNull();
    let json = JSON.stringify(renderer?.toJSON());
    expect(json).toContain("Graphs are Structurally & Operationally Identical");

    act(() => {
      useGraphDiffStore.getState().setDatasets(null, null);
    });

    silenceDeprecations(() => {
      act(() => {
        renderer = create(<GraphDiffOverlay />);
      });
    });

    json = JSON.stringify(renderer?.toJSON());
    expect(json).toContain("No Comparison Datasets Loaded");
  });
});
