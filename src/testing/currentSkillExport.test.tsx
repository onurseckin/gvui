/// <reference types="node" />

import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { importCapsule } from "../../scripts/import-capsule";
import { describeEdgeKind } from "../primitives/edges/GraphEdge/edgeKinds";
import { NodeCard } from "../primitives/nodes/NodeCard";
import { describeNodeKind } from "../primitives/nodes/NodeCard/nodeKinds";
import { EDGE_KINDS, NODE_KINDS, toGraphDataset, validateGraphDataset } from "../state/graphSchema";
import type { GraphDataset, PositionedNode } from "../types/graphData";
import { writeCapsule, type CapsuleFixture } from "./capsuleHarness";

/**
 * `current-skill-export.graph.json` is a real (trimmed, never fabricated) `summary/graph.json`
 * produced by running `bun orchestrating-long-tasks/scripts/harness.ts summary:export` against a
 * genuine capsule (`skills/.capsules/2026-08-17-skills-documentation-elevation`) in the sibling
 * `skills` repo, on today's generator code. It carries the top-level `run` field (`RunFacts`) that
 * the generator has emitted since the step-level-provenance and telemetry-conflict work landed,
 * including `run.steps` (`ActionStepRecord[]`) — the run's step-level provenance. Only bulk was
 * trimmed (fewer scripts, events and repository inspections, and `run.reports` dropped entirely,
 * which is an optional field); every value that remains is verbatim from the real export, not
 * invented.
 */
const FIXTURE_PATH = fileURLToPath(
  new URL("./fixtures/current-skill-export.graph.json", import.meta.url),
);
const GRAPH_ID = "2026-08-17-skills-documentation-elevation";

const declared = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as Record<string, unknown>;

let fixture: CapsuleFixture;
let imported: Record<string, unknown>;

beforeAll(() => {
  fixture = writeCapsule(declared);
  importCapsule({ capsulePath: fixture.capsulePath, outputDir: fixture.outputDir });
  imported = fixture.readWritten(GRAPH_ID) as Record<string, unknown>;
});

describe("the current skill's real export imports without a single unknown-vocabulary warning", () => {
  test("every node kind and edge kind the current generator used is one gvui already knows", () => {
    const result = validateGraphDataset(declared, { sourceId: GRAPH_ID });
    expect(result.errors).toEqual([]);
    const kindWarnings = result.warnings.filter((warning) => warning.includes("not a known"));
    expect(kindWarnings).toEqual([]);

    const usedNodeKinds = new Set((declared.nodes as { kind?: string }[]).map((n) => n.kind));
    const usedEdgeKinds = new Set((declared.edges as { kind?: string }[]).map((e) => e.kind));
    for (const kind of usedNodeKinds) expect(NODE_KINDS).toContain(kind);
    for (const kind of usedEdgeKinds) expect(EDGE_KINDS).toContain(kind);
  });

  test("round-trips through the importer inventing nothing and dropping nothing", () => {
    expect(imported).toEqual(declared);
  });
});

describe("the run-level payload (RunFacts, including step-level provenance) survives ingestion untouched", () => {
  // This is the passthrough half of the compatibility gap in the report: nothing in gvui's ingest
  // drops or breaks on `run`, but nothing in gvui's UI reads it either — see
  // `src/testing/currentSkillExport.test.tsx`'s sibling report finding "RunFacts is unconsumed".
  test("dataset.run round-trips byte-for-byte, including run.steps", () => {
    expect(imported.run).toEqual(declared.run);
    const run = imported.run as { steps?: unknown[] };
    expect(Array.isArray(run.steps)).toBe(true);
    expect((run.steps ?? []).length).toBeGreaterThan(0);
  });

  test("validateGraphDataset does not fold run under NODE_FIELD_SHAPES/EDGE_FIELD_SHAPES and does not warn about it", () => {
    const result = validateGraphDataset(declared, { sourceId: GRAPH_ID });
    expect(result.warnings.some((warning) => warning.startsWith("dataset.run"))).toBe(false);
    expect(result.dataset?.run).toEqual(declared.run);
  });
});

describe("an invented node kind, an invented edge kind and an unknown top-level field never break ingest or rendering", () => {
  // Per the workstream brief: these three are deliberately invented probes, not real fields the
  // skill emits today — they stand in for whatever the exporter grows next, the same way a graph
  // from an entirely different producer would.
  const INVENTED_NODE_KIND = "plan-audit-invariant";
  const INVENTED_EDGE_KIND = "scope-hash-verified";
  const INVENTED_TOP_LEVEL_FIELD = "probeUnknownTopLevelField";

  function withInventedVocabulary(): Record<string, unknown> {
    const nodes = declared.nodes as Record<string, unknown>[];
    const edges = declared.edges as Record<string, unknown>[];
    return {
      ...declared,
      [INVENTED_TOP_LEVEL_FIELD]: { anything: true, nested: [1, 2, 3] },
      nodes: [
        ...nodes,
        { id: "node-invented-kind-probe", name: "Invented Kind Probe", kind: INVENTED_NODE_KIND },
      ],
      edges: [
        ...edges,
        {
          id: "edge-invented-kind-probe",
          source: "node-input-prompt",
          target: "node-invented-kind-probe",
          kind: INVENTED_EDGE_KIND,
        },
      ],
    };
  }

  test("validateGraphDataset accepts it: no errors, nothing dropped, and it warns rather than refusing", () => {
    const mutated = withInventedVocabulary();
    const result = validateGraphDataset(mutated, { sourceId: GRAPH_ID });

    expect(result.errors).toEqual([]);
    expect(result.dataset).toBeDefined();
    expect(result.dataset?.nodes).toHaveLength((declared.nodes as unknown[]).length + 1);
    expect(result.dataset?.edges).toHaveLength((declared.edges as unknown[]).length + 1);

    expect(
      result.warnings.some(
        (w) => w.includes(INVENTED_NODE_KIND) && w.includes("not a known node kind"),
      ),
    ).toBe(true);
    expect(
      result.warnings.some(
        (w) => w.includes(INVENTED_EDGE_KIND) && w.includes("not a known edge kind"),
      ),
    ).toBe(true);
  });

  test("the unknown top-level field passes through untouched rather than being stripped", () => {
    const mutated = withInventedVocabulary();
    const result = validateGraphDataset(mutated, { sourceId: GRAPH_ID });
    expect(result.dataset?.[INVENTED_TOP_LEVEL_FIELD]).toEqual({
      anything: true,
      nested: [1, 2, 3],
    });
  });

  test("the invented node kind still gets a real, non-throwing archetype and renders as a card", () => {
    const mutated = withInventedVocabulary();
    const result = validateGraphDataset(mutated, { sourceId: GRAPH_ID });
    const dataset = toGraphDataset(result.dataset!);
    const node = dataset.nodes.find((n) => n.id === "node-invented-kind-probe")!;
    expect(node).toBeDefined();

    const descriptor = describeNodeKind(node);
    expect(descriptor.label.length).toBeGreaterThan(0);
    expect(descriptor.accent.length).toBeGreaterThan(0);

    const positioned: PositionedNode = { ...node, x: 0, y: 0, width: 220, height: 96 };
    const html = renderToString(
      <NodeCard
        node={positioned}
        isSelected={false}
        isFiltered={false}
        isCollapsed={false}
        onSelect={() => {}}
        onToggleCollapse={() => {}}
      />,
    );
    expect(html).toContain("Invented Kind Probe");
    expect(html).toContain(`kind-${INVENTED_NODE_KIND}`);
  });

  test("the invented edge kind still gets a real, non-throwing descriptor", () => {
    const descriptor = describeEdgeKind(INVENTED_EDGE_KIND);
    expect(descriptor.label.length).toBeGreaterThan(0);
    expect(descriptor.accent.length).toBeGreaterThan(0);
    expect(descriptor.markerId.length).toBeGreaterThan(0);
  });

  test("the mutated dataset still lays out end to end via the real WASM engine", async () => {
    const mutated = withInventedVocabulary();
    const result = validateGraphDataset(mutated, { sourceId: GRAPH_ID });
    const dataset: GraphDataset = toGraphDataset(result.dataset!);

    const { computeCustomEngineGraphLayoutWasm } =
      await import("../engine/layout/custom/wasmLayoutAdapter");
    const layout = await computeCustomEngineGraphLayoutWasm(dataset, undefined, "layered");

    expect(layout.nodes).toHaveLength(dataset.nodes.length);
    expect(layout.edges).toHaveLength(dataset.edges.length);
    for (const box of layout.nodes) {
      expect(Number.isFinite(box.x)).toBe(true);
      expect(Number.isFinite(box.y)).toBe(true);
    }
    for (const edge of layout.edges) {
      expect(edge.path.startsWith("M")).toBe(true);
    }
  });
});
