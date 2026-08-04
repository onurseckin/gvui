/**
 * v2 regression gate. Extends the old print-only diagnostic dump into a real assertion: it fails
 * the process (non-zero exit) rather than leaving a bad layout as a line of console output — see
 * docs/planning/layout-engine-v2/04-config-and-quality.md §3c for why that distinction matters
 * (`dense_kubernetes_mesh` shipped an invalid, 191-crossing layout under the old print-only audit).
 *
 * Runs every engine mode against every fixture in public/data/graphs/*.json and every scenario in
 * customLayoutScenarios.ts, feeding node/label boxes through the real `MeasurementProvider` so this
 * exercises the exact same measure -> normalize -> layout path the browser does (mirrors
 * `customLayoutAdapter.ts`'s `buildEngineInputs`, which is not itself exported for reuse here).
 */
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import initWasm, { compute_custom_layout_wasm } from "../src/engine/layout/custom/wasm_pkg/gvui.js";
import {
  resolveCustomLayoutConfig,
  type CustomLayoutConfig,
} from "../src/engine/layout/custom/config";
import { getDefaultMeasurer } from "../src/engine/layout/measurement";
import type { NormalizedEdge, NormalizedNode } from "../src/engine/layout/custom/types";
import { CUSTOM_LAYOUT_SCENARIOS } from "../src/features/GraphTesting/data/customLayoutScenarios";
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
interface AuditLayoutMetrics {
  crossings: number;
  geometricCrossings: number;
  bendCount: number;
  straightChainRatio: number;
  leaderCount: number;
  nodeNodeOverlaps: number;
  edgeNodePenetrations: number;
  badgeNodeOverlaps: number;
  badgeBadgeOverlaps: number;
  unresolvedRouteCount: number;
  unresolvedBadgeCount: number;
}

interface AuditDiagnostic {
  code: string;
  severity: string;
  message: string;
}

interface AuditValidation {
  isValid: boolean;
  metrics: AuditLayoutMetrics;
  diagnostics: AuditDiagnostic[];
}

interface AuditOptimizationStats {
  durationMs: number;
  stopReason: string;
}

interface AuditLayoutResult {
  nodes: unknown[];
  edges: unknown[];
  badges: unknown[];
  validation: AuditValidation;
  status: "success" | "unresolved_soft_conflicts" | "invalid_hard_failure";
  optimizationStats: AuditOptimizationStats;
}

/** Every mode the wasm entry point accepts, per `EngineMode` in crates/gvui/src/lib.rs. */
const ALL_MODES: readonly LayoutMode[] = [
  "layered",
  "layered-spline",
  "left-right",
  "organic",
  "radial",
  "grid",
];

/**
 * Counters that must be zero for EVERY engine. These are preventable regardless of how edges are
 * drawn: overlap removal handles node collisions in organic mode, the grid and the rings are
 * separated by construction, and no engine is allowed to drop an edge or a badge.
 */
const UNIVERSAL_CONSTRAINT_FIELDS: readonly (keyof AuditLayoutMetrics)[] = [
  "nodeNodeOverlaps",
  "unresolvedRouteCount",
  "unresolvedBadgeCount",
];

/**
 * Counters that must additionally be zero for the LAYERED engines only.
 *
 * The layered pipeline guarantees these by construction — Phase 6 reserves a routing lane for every
 * segment, and the label item reserves badge area inside the layered graph. The straight-line
 * engines have neither: organic, radial and grid draw a direct line between two boxes, so a line
 * grazing a third box is a property of straight-line drawing, not a defect. Their badge placement
 * is an explicitly best-effort local pass that announces its failures with a leader line.
 *
 * They are still reported as metrics for those engines (and as warnings in the diagnostics), just
 * not as build failures — asserting a guarantee an engine never made would make the gate useless.
 */
const LAYERED_ONLY_CONSTRAINT_FIELDS: readonly (keyof AuditLayoutMetrics)[] = [
  "edgeNodePenetrations",
  "badgeNodeOverlaps",
  "badgeBadgeOverlaps",
];

const LAYERED_MODES: ReadonlySet<string> = new Set(["layered", "layered-spline", "left-right"]);

/** The counters that are build failures for `mode`. */
function constraintFieldsFor(mode: string): readonly (keyof AuditLayoutMetrics)[] {
  return LAYERED_MODES.has(mode)
    ? [...UNIVERSAL_CONSTRAINT_FIELDS, ...LAYERED_ONLY_CONSTRAINT_FIELDS]
    : UNIVERSAL_CONSTRAINT_FIELDS;
}

const TIME_BUDGET_MS = 250;

interface Fixture {
  name: string;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

/**
 * Bridge cast at the WASM boundary: `compute_custom_layout_wasm`'s generated d.ts signature is
 * `(val: any) => any` (wasm-bindgen glue, not code this repo owns), so its return has to be
 * asserted rather than inferred. `input as unknown as object` keeps our concrete request type from
 * being silently widened by the `any` parameter; `as unknown as AuditLayoutResult` is the one
 * documented bridge for the response, matching the shape verified against
 * crates/gvui/src/0_common/0_1_types.rs above.
 */
function computeLayout(
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
 */
function buildEngineInputs(
  nodes: GraphNodeData[],
  edges: GraphEdgeData[],
  config: CustomLayoutConfig,
): { normalizedNodes: NormalizedNode[]; normalizedEdges: NormalizedEdge[] } {
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
      width: size.width,
      height: size.height,
      rank: node.rank,
      group: node.group,
    };
  });

  const normalizedEdges: NormalizedEdge[] = edges.map((edge, index) => {
    const id = edge.id || `e-${edge.source}-${edge.target}-${index}`;
    const labelBox = edge.label
      ? measurer.measureLabel(edge.label, {
          maxWidth: config.maxLabelWidth,
          maxLines: config.maxLabelLines,
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
      labelWidth: labelBox?.width,
      labelHeight: labelBox?.height,
    };
  });

  return { normalizedNodes, normalizedEdges };
}

function loadPublicGraphFixtures(projectRoot: string): Fixture[] {
  const graphsDir = join(projectRoot, "public/data/graphs");
  const files = readdirSync(graphsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  return files.map((file) => {
    const raw: unknown = JSON.parse(readFileSync(join(graphsDir, file), "utf-8"));
    // Single documented bridge cast: these fixtures are hand-authored JSON, not host input that
    // needs runtime validation — the same trust boundary the rest of the app applies to
    // `public/data/graphs/*.json`.
    const dataset = raw as { nodes: GraphNodeData[]; edges: GraphEdgeData[] };
    return { name: file, nodes: dataset.nodes, edges: dataset.edges };
  });
}

function loadScenarioFixtures(): Fixture[] {
  return Object.values(CUSTOM_LAYOUT_SCENARIOS).map((scenario) => ({
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
  }));
}

function formatMetrics(metrics: AuditLayoutMetrics): string {
  return (
    `crossings=${metrics.crossings} geometricCrossings=${metrics.geometricCrossings} ` +
    `bendCount=${metrics.bendCount} straightChainRatio=${metrics.straightChainRatio.toFixed(2)} ` +
    `leaderCount=${metrics.leaderCount}`
  );
}

async function runLayoutAudit(): Promise<void> {
  const projectRoot = resolve(import.meta.dirname, "..");
  const wasmPath = join(projectRoot, "src/engine/layout/custom/wasm_pkg/gvui_bg.wasm");
  const wasmBuffer = readFileSync(wasmPath);
  await initWasm(wasmBuffer);

  const config = resolveCustomLayoutConfig();
  const fixtures = [...loadScenarioFixtures(), ...loadPublicGraphFixtures(projectRoot)];

  console.log("\n===============================================================================");
  console.log("                        LAYOUT ENGINE V2 REGRESSION GATE                        ");
  console.log("===============================================================================\n");

  const failures: string[] = [];
  let runCount = 0;

  for (const fixture of fixtures) {
    const { normalizedNodes, normalizedEdges } = buildEngineInputs(
      fixture.nodes,
      fixture.edges,
      config,
    );

    console.log(`\n--- ${fixture.name} ---`);

    for (const mode of ALL_MODES) {
      runCount += 1;
      // `resolveCustomLayoutConfig` always returns every field populated, including `direction` —
      // so passing it verbatim as `options` makes the wasm entry point treat `direction` as
      // explicitly set (see `EngineMode::from_mode_str` in crates/gvui/src/lib.rs) and skip the
      // mode-implied direction entirely. Without this override, `"left-right"` would silently run
      // as top-down and the audit would test `"layered"` twice under two different labels.
      const modeConfig: CustomLayoutConfig =
        mode === "left-right" ? { ...config, direction: "left-right" } : config;
      const result = computeLayout(normalizedNodes, normalizedEdges, modeConfig, mode);
      const { validation, status, optimizationStats } = result;
      const durationMs = optimizationStats.durationMs;

      console.log(
        `  [${mode}] status=${status} isValid=${validation.isValid} ` +
          `nodes=${result.nodes.length} edges=${result.edges.length} badges=${result.badges.length} ` +
          `${formatMetrics(validation.metrics)} durationMs=${durationMs.toFixed(2)}`,
      );

      const label = `${fixture.name} [${mode}]`;

      for (const field of constraintFieldsFor(mode)) {
        const value = validation.metrics[field];
        if (value !== 0) {
          failures.push(`${label}: constraint '${field}' = ${value} (must be 0)`);
        }
      }

      // Reported, not failed, for the straight-line engines — see LAYERED_ONLY_CONSTRAINT_FIELDS.
      if (!LAYERED_MODES.has(mode)) {
        const soft = LAYERED_ONLY_CONSTRAINT_FIELDS.map(
          (f) => [f, validation.metrics[f]] as const,
        ).filter(([, v]) => v !== 0);
        if (soft.length > 0) {
          console.log(
            `    (best-effort: ${soft.map(([f, v]) => `${f}=${v}`).join(" ")})`,
          );
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
    }
  }

  console.log("\n===============================================================================");
  console.log(`SUMMARY: ${runCount} fixture/mode runs, ${failures.length} failures`);
  console.log("===============================================================================\n");

  if (failures.length > 0) {
    console.error("FAILURES:");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }
}

runLayoutAudit().catch((err) => {
  console.error("Layout audit crashed:", err);
  process.exit(1);
});
