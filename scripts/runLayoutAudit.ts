/**
 * Layout Engine Regression Gate & Zero-Tolerance Matrix Verification Suite.
 *
 * ## 1. Exhaustive 280-Run Matrix Architecture
 * Evaluates the full cross-product of 2 layout engines, 4 cardinal flow directions,
 * and 35 graph topologies (|E| x |D| x |F| = 2 x 4 x 35 = 280 test configurations):
 * - **Engines (2)**:
 *   1. `layered`: Sugiyama hierarchical engine with Brandes-Köpf coordinate alignment and channel routing.
 *   2. `radial`: Polar concentric BFS engine with PCDRA obstacle avoidance and PSCA badge sector clearance.
 * - **Flow Directions (4)**:
 *   1. `top-down` (TD): Natural rank progression downward along +y.
 *   2. `bottom-top` (BT): Inverted rank progression upward along -y (wire: `bottom-up`).
 *   3. `left-right` (LR): Transposed rank progression rightward along +x.
 *   4. `right-left` (RL): Inverted-transposed rank progression leftward along -x.
 * - **Graph Fixtures (35)**:
 *   - 26 Synthetic stress-test scenarios (`customLayoutScenarios.ts`)
 *   - 9 Real-world production telemetry topologies (`public/data/graphs/*.json`)
 *
 * ## 2. Strict Zero-Tolerance Invariants
 * All 280 runs are gated on zero-tolerance hard build failures. A nonzero count on any
 * of the 8 constraint fields below constitutes an immediate failure:
 * 1. `nodeNodeOverlaps` = 0: Disjoint node bounding boxes.
 * 2. `edgeNodePenetrations` = 0: Zero edge routes penetrating non-endpoint node interiors.
 * 3. `badgeNodeOverlaps` = 0: Zero edge badge boxes intersecting any node boundary.
 * 4. `badgeBadgeOverlaps` = 0: Zero edge badge boxes intersecting adjacent edge badges.
 * 5. `badgeEdgePenetrations` = 0: Zero non-parent edge polylines piercing edge badges.
 * 6. `unresolvedRouteCount` = 0: 100% of graph edge paths successfully constructed.
 * 7. `unresolvedBadgeCount` = 0: 100% of edge badges successfully allocated.
 * 8. `collinearEdgeOverlaps` = 0: Zero parallel edge segments merging along shared channel/corridor tracks.
 *
 * ## 3. Performance & Quality Bounds
 * - Time Budget: <= 250ms per run.
 * - Global Leader Line Budget: cumulative sum of `leaderCount` across all runs <= 2.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import initWasm, { compute_custom_layout_wasm } from "../src/engine/layout/custom/wasm_pkg/gvui.js";
import {
  resolveCustomLayoutConfig,
  type CustomLayoutConfig,
  type Direction,
} from "../src/engine/layout/custom/config";
import { getDefaultMeasurer } from "../src/engine/layout/measurement";
import type { NormalizedEdge, NormalizedNode } from "../src/engine/layout/custom/types";
import { CUSTOM_LAYOUT_SCENARIOS } from "../src/features/GraphTesting/data/customLayoutScenarios";
import { getEdgeCompositeBadgeText } from "../src/engine/layout/customLayoutAdapter";
import type { LayoutMode } from "../src/state/useGraphStore";
import type { GraphEdgeData, GraphNodeData } from "../src/types/graphData";

// -------------------------------------------------------------------------------------------
// Wire-accurate result shape
// -------------------------------------------------------------------------------------------
// Mirrors `LayoutMetrics` / `OptimizationStats` / `CustomLayoutResult` in
// crates/gvui/src/0_common/0_1_types.rs field-for-field (camelCase over the wire via serde).
// Defined locally rather than imported from `engine/layout/custom/types.ts`: that file's
// `LayoutMetrics`/`OptimizationStats` interfaces still carry pre-v2 field names
// (`crossingCount`, `ordinaryLeaderCount`/`feedbackLeaderCount`, no `straightChainRatio`) pending a
// separate update to that shared, not-owned-by-this-file file. Asserting against the Rust struct
// directly means this audit is correct today and does not need to change again when that catch-up
// lands.
export interface AuditLayoutMetrics {
  crossings: number;
  geometricCrossings: number;
  bendCount: number;
  totalLength: number;
  straightChainRatio: number;
  area: number;
  aspectRatio: number;
  laneDepthMax: number;
  portSideBalance: number;
  leaderCount: number;
  labelsTruncated: number;
  nodeCount: number;
  edgeCount: number;
  rankCount: number;
  dummyCount: number;
  nodeNodeOverlaps: number;
  edgeNodePenetrations: number;
  badgeNodeOverlaps: number;
  badgeBadgeOverlaps: number;
  badgeEdgePenetrations: number;
  unresolvedRouteCount: number;
  unresolvedBadgeCount: number;
  collinearEdgeOverlaps: number;
}

export interface AuditDiagnostic {
  code: string;
  severity: string;
  message: string;
}

export interface AuditValidation {
  isValid: boolean;
  metrics: AuditLayoutMetrics;
  diagnostics: AuditDiagnostic[];
}

export interface AuditOptimizationStats {
  durationMs: number;
  stopReason: string;
}

export interface AuditLayoutResult {
  nodes: unknown[];
  edges: unknown[];
  badges: unknown[];
  validation: AuditValidation;
  status: "success" | "unresolved_soft_conflicts" | "invalid_hard_failure";
  optimizationStats: AuditOptimizationStats;
}

/**
 * One audited configuration: an engine plus the flow direction it runs under.
 *
 * All 8 engine and flow direction combinations are audited across every fixture:
 * 4 layered directions (top-down, bottom-top, left-right, right-left) and
 * 4 radial directions (top-down, bottom-top, left-right, right-left).
 */
export interface AuditCase {
  /** Mode string sent over the wire, resolved by `EngineMode::from_mode_str`. */
  mode: LayoutMode;
  direction: Direction;
  /** Stable identifier used in log lines and failure messages. */
  label: string;
}

export const AUDIT_CASES: readonly AuditCase[] = [
  { mode: "layered", direction: "top-down", label: "layered/top-down" },
  { mode: "layered", direction: "bottom-up", label: "layered/bottom-top" },
  { mode: "layered", direction: "left-right", label: "layered/left-right" },
  { mode: "layered", direction: "right-left", label: "layered/right-left" },
  { mode: "radial", direction: "top-down", label: "radial/top-down" },
  { mode: "radial", direction: "bottom-up", label: "radial/bottom-top" },
  { mode: "radial", direction: "left-right", label: "radial/left-right" },
  { mode: "radial", direction: "right-left", label: "radial/right-left" },
];

/**
 * Hard zero-tolerance collision and integrity constraint counters enforced for ALL engines and directions.
 * Any non-zero count is a layout engine failure.
 */
export const STRICT_CONSTRAINT_FIELDS: readonly (keyof AuditLayoutMetrics)[] = [
  "nodeNodeOverlaps",
  "edgeNodePenetrations",
  "badgeNodeOverlaps",
  "badgeBadgeOverlaps",
  "badgeEdgePenetrations",
  "unresolvedRouteCount",
  "unresolvedBadgeCount",
  "collinearEdgeOverlaps",
];

/** The counters that are build failures for `auditCase`. Unified zero-tolerance across all modes. */
export function constraintFieldsFor(_auditCase: AuditCase): readonly (keyof AuditLayoutMetrics)[] {
  return STRICT_CONSTRAINT_FIELDS;
}

export const TIME_BUDGET_MS = 250;
export const MAX_GLOBAL_LEADER_COUNT = 2;

export interface Fixture {
  name: string;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

/**
 * Validates that all 8 required audit configurations are configured and non-empty.
 */
export function validateAuditCases(cases: readonly AuditCase[]): void {
  if (!Array.isArray(cases) || cases.length !== 8) {
    throw new Error(`Expected exactly 8 audit cases, got ${cases?.length ?? 0}`);
  }
  const expectedLabels = [
    "layered/top-down",
    "layered/bottom-top",
    "layered/left-right",
    "layered/right-left",
    "radial/top-down",
    "radial/bottom-top",
    "radial/left-right",
    "radial/right-left",
  ];
  const labelSet = new Set(cases.map((c) => c.label));
  for (const expected of expectedLabels) {
    if (!labelSet.has(expected)) {
      throw new Error(`Missing expected audit case: '${expected}'`);
    }
  }
}

/**
 * Asserts that the cumulative global leader line count across all fixture runs
 * does not exceed the strict architectural budget (<= 2).
 */
export function assertGlobalLeaderBudget(
  totalLeaderCount: number,
  maxAllowed: number = MAX_GLOBAL_LEADER_COUNT,
): void {
  if (totalLeaderCount > maxAllowed) {
    throw new Error(
      `Global leader line budget exceeded: total leaderCount = ${totalLeaderCount} (max allowed ${maxAllowed})`,
    );
  }
}

/**
 * Bridge cast at the WASM boundary: `compute_custom_layout_wasm`'s generated d.ts signature is
 * `(val: any) => any` (wasm-bindgen glue, not code this repo owns), so its return has to be
 * asserted rather than inferred. `input as unknown as object` keeps our concrete request type from
 * being silently widened by the `any` parameter; `as unknown as AuditLayoutResult` is the one
 * documented bridge for the response, matching the shape verified against
 * crates/gvui/src/0_common/0_1_types.rs above.
 */
export function computeLayout(
  nodes: NormalizedNode[],
  edges: NormalizedEdge[],
  config: CustomLayoutConfig,
  mode: LayoutMode,
): AuditLayoutResult {
  const input = { nodes, edges, options: config, mode };
  return compute_custom_layout_wasm(input as unknown as object) as unknown as AuditLayoutResult;
}

/**
 * Node sizes and edge label boxes measured up front, exactly like `customLayoutAdapter.ts`'s
 * `buildEngineInputs` — the Rust side never sees text, only already-measured boxes.
 * Measures composite badge text with horizontal padding (+24px, min 54px) and fixed 26px height
 * so the engine reserves exact badge dimensions during routing and crossing optimization.
 */
export function buildEngineInputs(
  nodes: GraphNodeData[],
  edges: GraphEdgeData[],
  config: CustomLayoutConfig,
): { normalizedNodes: NormalizedNode[]; normalizedEdges: NormalizedEdge[] } {
  if (!Array.isArray(nodes) || !Array.isArray(edges)) {
    throw new Error("buildEngineInputs requires valid nodes and edges arrays");
  }

  const measurer = getDefaultMeasurer();
  const sizes = measurer.measureNodes(nodes, {
    minNodeWidth: config.minNodeWidth,
    maxNodeWidth: config.maxNodeWidth,
  });

  const normalizedNodes: NormalizedNode[] = nodes.map((node, index) => {
    const size = sizes[index] ?? { width: config.minNodeWidth, height: 0 };
    return {
      id: node.id,
      label: node.name,
      width: Math.max(1, size.width),
      height: Math.max(0, size.height),
      rank: node.rank,
      group: node.group,
    };
  });

  const normalizedEdges: NormalizedEdge[] = edges.map((edge, index) => {
    const id = edge.id || `e-${edge.source}-${edge.target}-${index}`;
    const badgeText = getEdgeCompositeBadgeText(edge);
    const labelBox = badgeText
      ? measurer.measureLabel(badgeText, {
          maxWidth: Math.max(config.maxLabelWidth, 320),
          maxLines: 1,
        })
      : null;

    return {
      id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      isCycle: edge.isCycle,
      layoutRole: edge.layoutRole,
      weight: edge.weight,
      minLen: edge.minLen,
      labelWidth: labelBox ? Math.max(54, labelBox.width + 24) : undefined,
      labelHeight: labelBox ? 26 : undefined,
    };
  });

  return { normalizedNodes, normalizedEdges };
}

export function loadPublicGraphFixtures(projectRoot: string): Fixture[] {
  const graphsDir = join(projectRoot, "public/data/graphs");
  if (!existsSync(graphsDir)) {
    throw new Error(`Graphs directory not found at ${graphsDir}`);
  }

  const files = readdirSync(graphsDir)
    // `manifest.json` is the generated index of this directory, not a dataset in it — it holds a
    // string array, so auditing it dereferences a `nodes` that was never there.
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .sort();

  return files.map((file) => {
    const filePath = join(graphsDir, file);
    try {
      const raw: unknown = JSON.parse(readFileSync(filePath, "utf-8"));
      if (!raw || typeof raw !== "object" || !("nodes" in raw) || !("edges" in raw)) {
        throw new Error(`Invalid graph fixture schema in ${file}: missing nodes or edges array`);
      }
      const dataset = raw as { nodes?: unknown; edges?: unknown };
      if (!Array.isArray(dataset.nodes) || !Array.isArray(dataset.edges)) {
        throw new Error(`Invalid graph fixture in ${file}: nodes and edges must be arrays`);
      }
      return {
        name: file,
        nodes: dataset.nodes as GraphNodeData[],
        edges: dataset.edges as GraphEdgeData[],
      };
    } catch (err) {
      throw new Error(
        `Failed to load fixture ${file}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
}

export function loadScenarioFixtures(): Fixture[] {
  if (!CUSTOM_LAYOUT_SCENARIOS || typeof CUSTOM_LAYOUT_SCENARIOS !== "object") {
    throw new Error("CUSTOM_LAYOUT_SCENARIOS is not available or invalid");
  }

  return Object.values(CUSTOM_LAYOUT_SCENARIOS).map((scenario) => {
    if (!scenario || !Array.isArray(scenario.nodes) || !Array.isArray(scenario.edges)) {
      throw new Error(`Invalid scenario structure for scenario ID ${scenario?.id ?? "unknown"}`);
    }
    return {
      name: `scenario #${scenario.id} ${scenario.title}`,
      nodes: scenario.nodes.map((n) => ({ id: n.id, name: n.name, description: n.desc })),
      edges: scenario.edges.map((e, idx) => ({
        id: `e-${e.source}-${e.target}-${idx}`,
        source: e.source,
        target: e.target,
        label: e.label,
        isCycle: e.isCycle,
        layoutRole: e.layoutRole,
      })),
    };
  });
}

export function formatMetrics(metrics: AuditLayoutMetrics): string {
  return (
    `crossings=${metrics.crossings} geometricCrossings=${metrics.geometricCrossings} ` +
    `bendCount=${metrics.bendCount} straightChainRatio=${metrics.straightChainRatio.toFixed(2)} ` +
    `leaderCount=${metrics.leaderCount} collinearOverlaps=${metrics.collinearEdgeOverlaps}`
  );
}

export async function runLayoutAudit(): Promise<void> {
  validateAuditCases(AUDIT_CASES);

  const totalStartTime = performance.now();
  const projectRoot = resolve(import.meta.dirname, "..");
  const wasmPath = join(projectRoot, "src/engine/layout/custom/wasm_pkg/gvui_bg.wasm");

  if (!existsSync(wasmPath)) {
    throw new Error(`WASM binary not found at ${wasmPath}. Run 'bun run build:wasm' first.`);
  }

  const wasmBuffer = readFileSync(wasmPath);
  await initWasm(wasmBuffer);

  const config = resolveCustomLayoutConfig();
  const scenarioFixtures = loadScenarioFixtures();
  const publicFixtures = loadPublicGraphFixtures(projectRoot);
  const fixtures = [...scenarioFixtures, ...publicFixtures];

  if (fixtures.length === 0) {
    throw new Error("No graph fixtures discovered for regression audit");
  }

  console.log("\n===============================================================================");
  console.log("                        LAYOUT ENGINE V3 REGRESSION GATE                        ");
  console.log("===============================================================================\n");

  const failures: string[] = [];
  let runCount = 0;
  let totalLeaderCount = 0;

  for (const fixture of fixtures) {
    const fixtureStartTime = performance.now();
    const memStart = process.memoryUsage();
    const { normalizedNodes, normalizedEdges } = buildEngineInputs(
      fixture.nodes,
      fixture.edges,
      config,
    );

    console.log(`\n--- ${fixture.name} ---`);

    for (const auditCase of AUDIT_CASES) {
      runCount += 1;
      // `resolveCustomLayoutConfig` always returns every field populated, and `direction` is now
      // the single source of truth for flow (`EngineMode::from_mode_str` deliberately no longer
      // returns one). Overriding it per case is therefore the only way to exercise a direction.
      const modeConfig: CustomLayoutConfig = { ...config, direction: auditCase.direction };
      const runStartTime = performance.now();
      const label = `${fixture.name} [${auditCase.label}]`;

      try {
        const result = computeLayout(normalizedNodes, normalizedEdges, modeConfig, auditCase.mode);
        const runWallTimeMs = performance.now() - runStartTime;
        const { validation, status, optimizationStats } = result;
        const durationMs = optimizationStats.durationMs;
        totalLeaderCount += validation.metrics.leaderCount ?? 0;

        const mem = process.memoryUsage();
        const heapUsedMB = (mem.heapUsed / (1024 * 1024)).toFixed(2);
        const rssMB = (mem.rss / (1024 * 1024)).toFixed(2);

        console.log(
          `  [${auditCase.label}] status=${status} isValid=${validation.isValid} ` +
            `nodes=${result.nodes.length} edges=${result.edges.length} badges=${result.badges.length} ` +
            `${formatMetrics(validation.metrics)} durationMs=${durationMs.toFixed(2)} ` +
            `wallMs=${runWallTimeMs.toFixed(2)} heap=${heapUsedMB}MB rss=${rssMB}MB`,
        );

        for (const field of constraintFieldsFor(auditCase)) {
          const value = validation.metrics[field];
          if (value !== 0) {
            failures.push(`${label}: constraint '${field}' = ${value} (must be 0)`);
          }
        }

        if (!validation.isValid) {
          const errorCodes = validation.diagnostics
            .filter((d) => d.severity === "error")
            .map((d) => d.code)
            .join(", ");
          failures.push(`${label}: isValid = false (${errorCodes || "no error diagnostics"})`);
        }

        if (durationMs > TIME_BUDGET_MS) {
          failures.push(
            `${label}: durationMs = ${durationMs.toFixed(2)} (budget ${TIME_BUDGET_MS}ms)`,
          );
        }
      } catch (err) {
        failures.push(
          `${label}: layout computation threw exception: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const fixtureDurationMs = performance.now() - fixtureStartTime;
    const memEnd = process.memoryUsage();
    const heapDeltaMB = ((memEnd.heapUsed - memStart.heapUsed) / (1024 * 1024)).toFixed(2);
    console.log(
      `  [fixture summary] elapsed=${fixtureDurationMs.toFixed(2)}ms heapDelta=${heapDeltaMB}MB heapUsed=${(memEnd.heapUsed / (1024 * 1024)).toFixed(2)}MB`,
    );
  }

  try {
    assertGlobalLeaderBudget(totalLeaderCount, MAX_GLOBAL_LEADER_COUNT);
  } catch (leaderError) {
    failures.push(leaderError instanceof Error ? leaderError.message : String(leaderError));
  }

  const totalElapsedMs = performance.now() - totalStartTime;
  const finalMem = process.memoryUsage();
  console.log("\n===============================================================================");
  console.log(
    `SUMMARY: ${runCount} fixture/mode runs across ${fixtures.length} fixtures, ` +
      `totalLeaderCount=${totalLeaderCount} (budget <= ${MAX_GLOBAL_LEADER_COUNT}), ` +
      `elapsed=${totalElapsedMs.toFixed(2)}ms, heapUsed=${(finalMem.heapUsed / (1024 * 1024)).toFixed(2)}MB, ` +
      `${failures.length} failures`,
  );
  console.log("===============================================================================\n");

  if (failures.length > 0) {
    console.error("FAILURES:");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }
}

if (
  import.meta.main ||
  (typeof process !== "undefined" && process.argv[1]?.includes("runLayoutAudit.ts"))
) {
  runLayoutAudit().catch((err) => {
    console.error("Layout audit crashed:", err);
    process.exit(1);
  });
}
