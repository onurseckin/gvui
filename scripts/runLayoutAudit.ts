/**
 * Layout regression gate. Fails the process (non-zero exit) rather than leaving a bad layout as a
 * line of console output — see docs/planning/layout-engine-v2/04-config-and-quality.md §3c for why
 * that distinction matters (`dense_kubernetes_mesh` shipped an invalid, 191-crossing layout under
 * the old print-only audit).
 *
 * Runs every audited engine/direction pair (`AUDIT_CASES`) against every fixture in
 * public/data/graphs/*.json and every scenario in customLayoutScenarios.ts, feeding node/label
 * boxes through the real `MeasurementProvider` so this exercises the exact same
 * measure -> normalize -> layout path the browser does (mirrors `customLayoutAdapter.ts`'s
 * `buildEngineInputs`, which is not itself exported for reuse here).
 */
import { readdirSync, readFileSync } from "fs";
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
  badgeEdgePenetrations: number;
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

/**
 * One audited configuration: an engine plus the flow direction it runs under.
 *
 * v3 collapsed six mode strings down to two engines (`EngineMode` in
 * crates/gvui/src/0_common/0_2_config.rs). `layered-spline` was only ever `layered` with a
 * different `edgeStyle`, and `left-right` was never an engine at all — it was a *direction* smuggled
 * through the mode string, which is exactly why it silently rendered top-down. Direction is now its
 * own axis, so it has to be its own axis here too: running `layered` at one direction would leave
 * the entire transposed coordinate path (Phase 6 lane demand and Phase 7 routing both swap axes)
 * untested.
 */
interface AuditCase {
  /** Mode string sent over the wire, resolved by `EngineMode::from_mode_str`. */
  mode: LayoutMode;
  direction: Direction;
  /** Stable identifier used in log lines and failure messages. */
  label: string;
}

const AUDIT_CASES: readonly AuditCase[] = [
  { mode: "layered", direction: "top-down", label: "layered/top-down" },
  { mode: "layered", direction: "left-right", label: "layered/left-right" },
  { mode: "radial", direction: "top-down", label: "radial" },
];

/**
 * Counters that must be zero for EVERY engine. These are preventable regardless of how edges are
 * drawn: the rings are separated by construction, and no engine is allowed to drop an edge or a
 * badge.
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
 * segment, and the label item reserves badge area inside the layered graph. Radial has neither: it
 * draws a direct line between two boxes on concentric rings, so a line grazing a third box is a
 * property of straight-line drawing, not a defect. Its badge placement is an explicitly best-effort
 * local pass that announces its failures with a leader line.
 *
 * They are still reported as metrics for radial (and as warnings in the diagnostics), just not as
 * build failures — asserting a guarantee an engine never made would make the gate useless.
 */
const LAYERED_ONLY_CONSTRAINT_FIELDS: readonly (keyof AuditLayoutMetrics)[] = [
  "edgeNodePenetrations",
  "badgeNodeOverlaps",
  "badgeBadgeOverlaps",
  "badgeEdgePenetrations",
];

/** The counters that are build failures for `auditCase`. */
function constraintFieldsFor(auditCase: AuditCase): readonly (keyof AuditLayoutMetrics)[] {
  return auditCase.mode === "layered"
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
 * Measures composite badge text with horizontal padding (+24px, min 54px) and fixed 26px height
 * so the engine reserves exact badge dimensions during routing and crossing optimization.
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

function loadPublicGraphFixtures(projectRoot: string): Fixture[] {
  const graphsDir = join(projectRoot, "public/data/graphs");
  const files = readdirSync(graphsDir)
    // `manifest.json` is the generated index of this directory, not a dataset in it — it holds a
    // string array, so auditing it dereferences a `nodes` that was never there.
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
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
  console.log("                        LAYOUT ENGINE V3 REGRESSION GATE                        ");
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

    for (const auditCase of AUDIT_CASES) {
      runCount += 1;
      // `resolveCustomLayoutConfig` always returns every field populated, and `direction` is now
      // the single source of truth for flow (`EngineMode::from_mode_str` deliberately no longer
      // returns one). Overriding it per case is therefore the only way to exercise a direction.
      const modeConfig: CustomLayoutConfig = { ...config, direction: auditCase.direction };
      const result = computeLayout(normalizedNodes, normalizedEdges, modeConfig, auditCase.mode);
      const { validation, status, optimizationStats } = result;
      const durationMs = optimizationStats.durationMs;

      console.log(
        `  [${auditCase.label}] status=${status} isValid=${validation.isValid} ` +
          `nodes=${result.nodes.length} edges=${result.edges.length} badges=${result.badges.length} ` +
          `${formatMetrics(validation.metrics)} durationMs=${durationMs.toFixed(2)}`,
      );

      const label = `${fixture.name} [${auditCase.label}]`;

      for (const field of constraintFieldsFor(auditCase)) {
        const value = validation.metrics[field];
        if (value !== 0) {
          failures.push(`${label}: constraint '${field}' = ${value} (must be 0)`);
        }
      }

      // Reported, not failed, for radial — see LAYERED_ONLY_CONSTRAINT_FIELDS.
      if (auditCase.mode !== "layered") {
        const soft = LAYERED_ONLY_CONSTRAINT_FIELDS.map(
          (f) => [f, validation.metrics[f]] as const,
        ).filter(([, v]) => v !== 0);
        if (soft.length > 0) {
          console.log(`    (best-effort: ${soft.map(([f, v]) => `${f}=${v}`).join(" ")})`);
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
