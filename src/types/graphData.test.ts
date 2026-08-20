import { describe, expect, it } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { describeEdgeKind, resolveEdgeAccent } from "../primitives/edges/GraphEdge/edgeKinds";
import { describeNodeArchetype, resolveNodeRole } from "../primitives/nodes/NodeCard/nodeKinds";
import {
  EDGE_KINDS,
  NODE_ROLES,
  resolveEvidenceClass,
  type GraphDataset,
  type GraphNodeData,
} from "./graphData";

const SHIPPED_DATASET = "public/data/graphs/fixture-demo.json";

function loadShippedDataset(): GraphDataset {
  return JSON.parse(readFileSync(SHIPPED_DATASET, "utf8")) as GraphDataset;
}

describe("Producer contract parity", () => {
  it("declares the producer's full 19-member edge vocabulary", () => {
    expect([...EDGE_KINDS].sort()).toEqual([
      "backtrack",
      "branch",
      "collect",
      "conditional",
      "critic",
      "data",
      "dependency",
      "dispatch",
      "fallback",
      "gate",
      "handoff",
      "join",
      "loop",
      "probe",
      "pushback",
      "sequence",
      "signoff",
      "spawn",
      "validation",
    ]);
  });

  it("declares the producer's full role vocabulary", () => {
    expect([...NODE_ROLES].sort()).toEqual([
      "completeness-critic",
      "coordinator",
      "implementer",
      "planner",
      "repairer",
      "sub-implementer",
      "sub-investigator",
      "sub-validator",
      "validator",
    ]);
  });

  it("treats an unlabelled value as unknown rather than promoting it to a measurement", () => {
    expect(resolveEvidenceClass(undefined)).toBe("unknown");
    expect(resolveEvidenceClass("harness_observed")).toBe("harness_observed");
  });

  it("accepts a node carrying the canonical evidence, telemetry, scripts and transitions", () => {
    const node: GraphNodeData = {
      id: "task-1",
      name: "Implementer",
      kind: "agent",
      telemetry: {
        agentId: "A-1",
        role: "implementer",
        host: "claude-code",
        model: { value: "claude-opus-4", evidence_class: "host_reported" },
        tokensIn: { value: 1200, evidence_class: "derived", is_estimated: true },
      },
      assets: [{ id: "shot-1", type: "image", url: "/blob/shot-1.png" }],
      scripts: [
        {
          commandId: "cmd-1",
          argv: ["bun", "test"],
          exitCode: 0,
          startedAt: "2026-08-15T10:00:00.000Z",
          evidence_class: "harness_observed",
        },
      ],
      tools: [{ name: "Bash", evidence_class: "agent_reported" }],
      stateTransitions: [
        {
          at: "2026-08-15T10:01:00.000Z",
          actor: "validator-1",
          from: "validating",
          to: "satisfied",
          reason: "review passed",
          attempt: 1,
          evidence_class: "harness_observed",
          verdict: "pass",
          round: 1,
          findingClass: "probe_demand",
          findingCount: 0,
        },
      ],
    };

    expect(resolveNodeRole(node)).toBe("implementer");
    expect(describeNodeArchetype(node).label).toBe("IMPLEMENTER");
    expect(node.telemetry?.tokensIn?.is_estimated).toBe(true);
    expect(node.assets?.[0].id).toBe("shot-1");
  });

  it("renders a section's recorded reason as part of the section, not as a guess", () => {
    const dataset: GraphDataset = {
      id: "d",
      title: "d",
      nodes: [],
      edges: [],
      sections: [
        {
          id: "B-1",
          title: "Branch",
          nodeIds: ["a"],
          reason: "the fixture and the writer had to move together",
          parentNodeId: "task-1",
          status: "collected",
        },
      ],
    };

    expect(dataset.sections?.[0].reason).toBe("the fixture and the writer had to move together");
    expect(dataset.sections?.[0].status).toBe("collected");
  });
});

describe("The shipped dataset", () => {
  const dataset = loadShippedDataset();

  it("parses into the current GraphDataset shape", () => {
    expect(dataset.nodes.length).toBeGreaterThan(0);
    expect(dataset.edges.length).toBeGreaterThan(0);
  });

  it("resolves every edge in the shipped dataset to a declared kind", () => {
    for (const edge of dataset.edges) {
      const descriptor = describeEdgeKind(edge);
      expect(EDGE_KINDS).toContain(descriptor.kind);
      // The producer stamps its own accent on every edge in this run, and a dataset-supplied
      // accent wins over the kind's default per resolveEdgeAccent's own contract.
      expect(resolveEdgeAccent(edge)).toBe(edge.accent ?? descriptor.accent);
    }
  });

  it("gives the shipped dataset's join edges their own treatment instead of folding them into sequence", () => {
    const joins = dataset.edges.filter((edge) => edge.kind === "join");
    expect(joins.length).toBeGreaterThan(0);
    for (const edge of joins) {
      expect(describeEdgeKind(edge).kind).toBe("join");
    }
    expect(describeEdgeKind("join").accent).not.toBe(describeEdgeKind("sequence").accent);
  });

  it("renders every node without crashing, whether or not it recorded a role", () => {
    // The shipped run records a role for its agent nodes (implementer, validator,
    // completeness-critic) and none for its structural nodes (input, orchestrator, gate,
    // terminal). Both cases must render: a declared role labels itself, and its absence falls back
    // to the bare kind rather than throwing.
    const withRole = dataset.nodes.filter((node) => resolveNodeRole(node) !== undefined);
    const withoutRole = dataset.nodes.filter((node) => resolveNodeRole(node) === undefined);
    expect(withRole.length).toBeGreaterThan(0);
    expect(withoutRole.length).toBeGreaterThan(0);

    for (const node of dataset.nodes) {
      expect(describeNodeArchetype(node).label.length).toBeGreaterThan(0);
    }
  });
});

/**
 * `assets` and `telemetry` are the one home each for a node's evidence and its model provenance.
 * A second read of an older spelling is what lets the two drift, so the renderer has none.
 */
describe("One home per fact", () => {
  const RETIRED_READS = [
    "node.mediaAssets",
    "node.screenshots",
    "metadata.mediaAssets",
    "metadata.screenshots",
    "metadata.assets",
    "metadata?.mediaAssets",
    "metadata?.screenshots",
    "metadata?.assets",
    "playwrightMetadata",
    "node.model",
    "node.harnessModel",
    "node.tier",
  ];

  function renderSources(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${entry.name}`;
      if (entry.isDirectory()) files.push(...renderSources(full));
      else if (/\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")) files.push(full);
    }
    return files;
  }

  function scan(dirs: readonly string[]): string[] {
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const file of renderSources(dir)) {
        const source = readFileSync(file, "utf8");
        for (const read of RETIRED_READS) {
          if (source.includes(read)) offenders.push(`${file}: ${read}`);
        }
      }
    }
    return offenders.sort();
  }

  it("leaves no reader of a retired spelling anywhere the canvas draws from", () => {
    expect(scan(["src/primitives", "src/engine/GraphCanvas", "src/state", "src/utils"])).toEqual(
      [],
    );
  });

  /**
   * Every remaining textual hit in the app, so the clean trees above cannot be mistaken for a clean
   * repo. The match is on source text, so an entry means a human still has to look: some are real
   * second reads of a node's model or evidence, and some are view models of their own that happen
   * to own a field called `model` or `tier`. Either way the list may only shrink — anything new
   * fails here rather than being absorbed silently.
   */
  const UNSWEPT_TEXT_MATCHES: readonly string[] = [
    "src/components/ComparisonView/ComparisonView.tsx: node.model",
    "src/components/ExecutiveReport/TokenAttributionChartView.tsx: node.model",
    "src/components/ExecutiveReport/TokenAttributionChartView.tsx: node.tier",
    "src/components/Flamegraph/FlamegraphSpanBar.tsx: node.tier",
    "src/components/Flamegraph/flamegraphEngine.ts: node.tier",
    "src/components/GraphDiff/GraphDiffOverlay.tsx: node.model",
    "src/components/GraphDiff/diffEngine.ts: node.model",
    "src/engine/export/slqExporter.ts: node.model",
    "src/engine/export/slqExporter.ts: node.tier",
    "src/engine/reporting/metricsAggregator.ts: node.harnessModel",
    "src/engine/reporting/metricsAggregator.ts: node.model",
    "src/engine/reporting/metricsAggregator.ts: node.tier",
    "src/engine/search/slqAutocomplete.ts: node.harnessModel",
    "src/engine/search/slqAutocomplete.ts: node.model",
    "src/engine/search/slqEvaluator.ts: node.harnessModel",
    "src/engine/search/slqEvaluator.ts: node.model",
    "src/engine/search/slqEvaluator.ts: node.tier",
    "src/store/useAnalyticsStore.ts: node.harnessModel",
    "src/store/useAnalyticsStore.ts: node.model",
    "src/store/useAnalyticsStore.ts: node.tier",
  ];

  it("introduces no retired spelling outside the sites already known to carry one", () => {
    const known = new Set(UNSWEPT_TEXT_MATCHES);
    expect(scan(["src"]).filter((offender) => !known.has(offender))).toEqual([]);
  });
});
