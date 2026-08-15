import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { CUSTOM_LAYOUT_SCENARIOS } from "./customLayoutScenarios";
import { computeGraphLayout } from "../../../engine/layout/layoutDispatcher";
import type { GraphDataset } from "../../../types/graphData";
import type { TestScenario } from "../types";

/** Highest scenario id; the record must cover 1..SCENARIO_COUNT with no gaps. */
const SCENARIO_COUNT = 26;

function toGraphDataset(scenario: TestScenario): GraphDataset {
  return {
    id: `scenario-${scenario.id}`,
    title: scenario.title,
    nodes: scenario.nodes.map((n) => ({ id: n.id, name: n.name, description: n.desc })),
    edges: scenario.edges.map((e, i) => ({
      id: `e-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
      layoutRole: e.layoutRole,
    })),
  };
}

function loadPublicGraphDatasets(): GraphDataset[] {
  const projectRoot = resolve(import.meta.dirname, "../../../..");
  const graphsDir = join(projectRoot, "public/data/graphs");
  if (!existsSync(graphsDir)) {
    return [];
  }
  const files = readdirSync(graphsDir)
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .sort();

  const datasets: GraphDataset[] = [];
  for (const file of files) {
    try {
      const raw: unknown = JSON.parse(readFileSync(join(graphsDir, file), "utf-8"));
      if (raw && typeof raw === "object" && "nodes" in raw && "edges" in raw) {
        const d = raw as { id?: unknown; title?: unknown; nodes?: unknown; edges?: unknown };
        if (Array.isArray(d.nodes) && Array.isArray(d.edges)) {
          datasets.push({
            id: typeof d.id === "string" ? d.id : file.replace(".json", ""),
            title: typeof d.title === "string" ? d.title : file,
            nodes: d.nodes,
            edges: d.edges,
          });
        }
      }
    } catch {
      // Ignore unparseable fixtures in test helper
    }
  }
  return datasets;
}

describe("CUSTOM_LAYOUT_SCENARIOS", () => {
  it("covers 1..N contiguously with non-empty metadata", () => {
    // Contiguity is load-bearing, not cosmetic: `GraphTestingPage` indexes this record by number
    // and falls back to a fixed id, so a hole here renders an empty picker entry.
    const scenarioKeys = Object.keys(CUSTOM_LAYOUT_SCENARIOS).map(Number);
    expect(scenarioKeys.length).toBe(SCENARIO_COUNT);

    for (let id = 1; id <= SCENARIO_COUNT; id++) {
      const scenario = CUSTOM_LAYOUT_SCENARIOS[id];
      expect(scenario).toBeDefined();
      expect(scenario.id).toBe(id);
      expect(scenario.title.length).toBeGreaterThan(0);
      expect(scenario.nodes.length).toBeGreaterThan(0);
    }
  });

  it("no longer ships the degenerate empty and single-node fixtures", () => {
    // v3 removed both: with no edges neither reaches a routing decision at all, so they only ever
    // cost an audit run. The bar is *at least one edge*, not at least two nodes — #8 is a single
    // node with a self-loop and is a genuine routing case.
    for (const scenario of Object.values(CUSTOM_LAYOUT_SCENARIOS)) {
      expect(scenario.nodes.length).toBeGreaterThanOrEqual(1);
      expect(scenario.edges.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("ensures all node IDs and edge source/target endpoints are valid within each scenario", () => {
    for (const scenario of Object.values(CUSTOM_LAYOUT_SCENARIOS)) {
      const nodeIds = new Set(scenario.nodes.map((n) => n.id));
      expect(nodeIds.size).toBe(scenario.nodes.length);

      for (const edge of scenario.edges) {
        expect(nodeIds.has(edge.source)).toBe(true);
        expect(nodeIds.has(edge.target)).toBe(true);
      }
    }
  });

  it("covers every structural hazard the layout engine is gated on", () => {
    // The scenario set exists to exercise specific pipeline decisions. Asserting the shapes are
    // present stops the library from silently degrading into twenty variations of a diamond.
    const scenarios = Object.values(CUSTOM_LAYOUT_SCENARIOS);

    const maxRankDepth = Math.max(...scenarios.map((s) => s.nodes.length));
    expect(maxRankDepth).toBeGreaterThanOrEqual(12);

    // Wide fan-out: some node has at least 15 outgoing edges.
    const maxOutDegree = Math.max(
      ...scenarios.flatMap((s) => {
        const out = new Map<string, number>();
        for (const e of s.edges) out.set(e.source, (out.get(e.source) ?? 0) + 1);
        return [...out.values()];
      }),
    );
    expect(maxOutDegree).toBeGreaterThanOrEqual(15);

    // Parallel bundle: the same ordered pair appears more than twice in one scenario.
    const hasBundle = scenarios.some((s) => {
      const pairs = new Map<string, number>();
      for (const e of s.edges) {
        const key = `${e.source}->${e.target}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
      return [...pairs.values()].some((count) => count >= 3);
    });
    expect(hasBundle).toBe(true);

    // Feedback: at least one scenario closes four or more cycles.
    const maxCycles = Math.max(...scenarios.map((s) => s.edges.filter((e) => e.isCycle).length));
    expect(maxCycles).toBeGreaterThanOrEqual(4);

    // Heavy labels: at least one label long enough to force wrapping.
    const longestLabel = Math.max(
      ...scenarios.flatMap((s) => s.edges.map((e) => e.label?.length ?? 0)),
    );
    expect(longestLabel).toBeGreaterThanOrEqual(70);

    // Multi-component: at least one scenario has three or more weakly connected components.
    const maxComponents = Math.max(...scenarios.map(countWeakComponents));
    expect(maxComponents).toBeGreaterThanOrEqual(3);
  });

  it("computes a layered layout for every scenario without throwing", async () => {
    // Regression coverage for the full scenario library against the real dispatcher/engine (WASM),
    // not just the static fixture shape asserted above — this is what would have caught the v1
    // `dense_kubernetes_mesh` failure mode (docs/planning/layout-engine-v2/04-config-and-quality.md
    // § 3a): an engine that returns `status !== "success"` on a fixture instead of surfacing a
    // diagnostic.
    for (const scenario of Object.values(CUSTOM_LAYOUT_SCENARIOS)) {
      const dataset = toGraphDataset(scenario);
      const result = await computeGraphLayout(dataset, "layered");

      expect(result.nodes).toHaveLength(scenario.nodes.length);
      expect(result.edges).toHaveLength(scenario.edges.length);
      for (const node of result.nodes) {
        expect(Number.isFinite(node.x)).toBe(true);
        expect(Number.isFinite(node.y)).toBe(true);
      }
    }
  });

  it("verifies 8-direction matrix layout execution with strictly finite coordinates", async () => {
    const modes = ["layered", "radial"] as const;
    const directions = ["top-down", "bottom-up", "left-right", "right-left"] as const;

    for (const scenario of Object.values(CUSTOM_LAYOUT_SCENARIOS)) {
      const dataset = toGraphDataset(scenario);

      for (const mode of modes) {
        for (const direction of directions) {
          const result = await computeGraphLayout(dataset, mode, { direction });

          expect(result.nodes).toHaveLength(scenario.nodes.length);
          expect(result.edges).toHaveLength(scenario.edges.length);

          for (const node of result.nodes) {
            expect(Number.isFinite(node.x)).toBe(true);
            expect(Number.isFinite(node.y)).toBe(true);
            expect(Number.isFinite(node.width)).toBe(true);
            expect(Number.isFinite(node.height)).toBe(true);
            expect(node.width).toBeGreaterThan(0);
            expect(node.height).toBeGreaterThan(0);
          }

          for (const edge of result.edges) {
            expect(edge.points).toBeDefined();
            const points = edge.points ?? [];
            expect(points.length).toBeGreaterThanOrEqual(2);
            for (const pt of points) {
              expect(Number.isFinite(pt.x)).toBe(true);
              expect(Number.isFinite(pt.y)).toBe(true);
            }
          }
        }
      }
    }
  });

  it("ensures layout determinism across repeated executions in 8-direction matrix", async () => {
    const testScenarios = [
      CUSTOM_LAYOUT_SCENARIOS[1], // Two-node pipeline
      CUSTOM_LAYOUT_SCENARIOS[3], // Fan-out broadcaster
      CUSTOM_LAYOUT_SCENARIOS[8], // Self-loop
    ];

    const directions = ["top-down", "bottom-up", "left-right", "right-left"] as const;

    for (const scenario of testScenarios) {
      if (!scenario) continue;
      const dataset = toGraphDataset(scenario);

      for (const direction of directions) {
        const run1 = await computeGraphLayout(dataset, "layered", { direction });
        const run2 = await computeGraphLayout(dataset, "layered", { direction });

        expect(run1.nodes.length).toBe(run2.nodes.length);
        for (let i = 0; i < run1.nodes.length; i++) {
          const n1 = run1.nodes[i];
          const n2 = run2.nodes[i];
          if (!n1 || !n2) throw new Error("Expected positioned node");
          expect(Math.abs(n1.x - n2.x)).toBeLessThan(1e-4);
          expect(Math.abs(n1.y - n2.y)).toBeLessThan(1e-4);
        }
      }
    }
  });

  it("verifies 280-run matrix proof: asserts per-run execution time <= 250ms and zero geometry corruption across all fixtures", async () => {
    const scenarioDatasets = Object.values(CUSTOM_LAYOUT_SCENARIOS).map(toGraphDataset);
    const publicDatasets = loadPublicGraphDatasets();
    const allFixtures = [...scenarioDatasets, ...publicDatasets];

    const modes = ["layered", "radial"] as const;
    const directions = ["top-down", "bottom-up", "left-right", "right-left"] as const;

    let totalRuns = 0;
    const timings: number[] = [];

    for (const fixture of allFixtures) {
      for (const mode of modes) {
        for (const direction of directions) {
          totalRuns += 1;
          const t0 = performance.now();
          const result = await computeGraphLayout(fixture, mode, { direction });
          const elapsed = performance.now() - t0;
          timings.push(elapsed);

          // Assert individual run performance budget
          expect(elapsed).toBeLessThanOrEqual(250.0);

          // Assert structural completeness and zero geometry corruption
          expect(result.nodes).toHaveLength(fixture.nodes.length);
          expect(result.edges).toHaveLength(fixture.edges.length);

          for (const node of result.nodes) {
            expect(Number.isFinite(node.x)).toBe(true);
            expect(Number.isFinite(node.y)).toBe(true);
            expect(Number.isFinite(node.width)).toBe(true);
            expect(Number.isFinite(node.height)).toBe(true);
            expect(node.width).toBeGreaterThan(0);
            expect(node.height).toBeGreaterThan(0);
          }

          for (const edge of result.edges) {
            expect(edge.points).toBeDefined();
            const pts = edge.points ?? [];
            expect(pts.length).toBeGreaterThanOrEqual(2);
            for (const pt of pts) {
              expect(Number.isFinite(pt.x)).toBe(true);
              expect(Number.isFinite(pt.y)).toBe(true);
            }
          }
        }
      }
    }

    expect(totalRuns).toBeGreaterThanOrEqual(208);
    const totalDuration = timings.reduce((a, b) => a + b, 0);
    const avgDuration = totalDuration / timings.length;
    expect(avgDuration).toBeLessThan(50.0);
    expect(totalDuration).toBeLessThan(3500.0);
  });
});

/** Weakly connected component count via union-find over the undirected edge set. */
function countWeakComponents(scenario: TestScenario): number {
  const parent = new Map<string, string>();
  for (const node of scenario.nodes) parent.set(node.id, node.id);

  const find = (id: string): string => {
    let root = id;
    let next = parent.get(root);
    while (next !== undefined && next !== root) {
      root = next;
      next = parent.get(root);
    }
    return root;
  };

  for (const edge of scenario.edges) {
    const a = find(edge.source);
    const b = find(edge.target);
    if (a !== b) parent.set(a, b);
  }

  return new Set(scenario.nodes.map((n) => find(n.id))).size;
}
