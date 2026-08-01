import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import initWasm from "../src/engine/layout/custom/wasm_pkg/gvui.js";
import { computeCustomLayoutWasm } from "../src/engine/layout/custom/wasmLayoutAdapter";
import { CUSTOM_LAYOUT_SCENARIOS } from "../src/features/GraphTesting/data/customLayoutScenarios";
import type { GraphDataset } from "../src/types/graphData";
import type { NormalizedEdge, NormalizedNode } from "../src/engine/layout/custom/types";

async function runLayoutAudit() {
  const projectRoot = resolve(import.meta.dirname, "..");
  const wasmPath = join(projectRoot, "src/engine/layout/custom/wasm_pkg/gvui_bg.wasm");
  const wasmBuffer = readFileSync(wasmPath);
  await initWasm(wasmBuffer);

  console.log("\n===============================================================================");
  console.log("                   FULL WASM LAYOUT ENGINE DIAGNOSTIC REPORT                   ");
  console.log("===============================================================================\n");

  let totalHardErrors = 0;
  let totalWarnings = 0;

  // 1. Evaluate Built-in 20 Custom Layout Scenarios
  console.log("--- PART 1: 20 BUILT-IN SCENARIOS DIAGNOSTIC REPORT ---");
  for (const scenario of Object.values(CUSTOM_LAYOUT_SCENARIOS)) {
    const nodes: NormalizedNode[] = scenario.nodes.map((n) => ({ id: n.id, label: n.name, width: n.w, height: n.h }));
    const edges: NormalizedEdge[] = scenario.edges.map((e, idx) => ({
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
      layoutRole: e.layoutRole,
    }));

    const result = await computeCustomLayoutWasm(nodes, edges);
    const { validation, status } = result;

    const hardErrors = (validation.diagnostics ?? []).filter((d) => d.severity === "error");
    const warnings = (validation.diagnostics ?? []).filter((d) => d.severity === "warning");

    totalHardErrors += hardErrors.length;
    totalWarnings += warnings.length;

    console.log(`\nScenario #${scenario.id}: "${scenario.title}"`);
    console.log(`  • Status: ${status} | IsValid: ${validation.isValid}`);
    console.log(`  • Nodes: ${result.nodes.length} | Edges: ${result.edges.length} | Badges: ${result.badges.length}`);
    console.log(`  • Metrics: Crossings=${validation.metrics.crossingCount}, Bends=${validation.metrics.bendCount}, NodeOverlaps=${validation.metrics.nodeNodeOverlaps}, BadgeOverlaps=${validation.metrics.badgeBadgeOverlaps}, EdgePenetrations=${validation.metrics.edgeNodePenetrations}`);

    if (hardErrors.length > 0) {
      console.log(`  ❌ HARD ERRORS (${hardErrors.length}):`);
      hardErrors.forEach((d) => console.log(`     - [${d.code}] ${d.message}`));
    } else {
      console.log(`  ✅ Hard Errors: 0`);
    }

    if (warnings.length > 0) {
      console.log(`  ⚠️ WARNINGS (${warnings.length}):`);
      warnings.forEach((d) => console.log(`     - [${d.code}] ${d.message}`));
    } else {
      console.log(`  ✅ Warnings: 0`);
    }
  }

  // 2. Evaluate 8 Public JSON Graph Datasets
  console.log("\n-------------------------------------------------------------------------------");
  console.log("--- PART 2: 8 PUBLIC GRAPH DATASETS DIAGNOSTIC REPORT ---");
  console.log("-------------------------------------------------------------------------------");

  const graphsDir = join(projectRoot, "public/data/graphs");
  const files = readdirSync(graphsDir).filter((f) => f.endsWith(".json")).sort();

  for (const file of files) {
    const filePath = join(graphsDir, file);
    const content = readFileSync(filePath, "utf-8");
    const dataset: GraphDataset = JSON.parse(content);

    const nodes: NormalizedNode[] = dataset.nodes.map((n) => ({ id: n.id, label: n.name, width: 140, height: 70 }));
    const edges: NormalizedEdge[] = dataset.edges.map((e, idx) => ({
      id: e.id || `e-${e.source}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.label,
      isCycle: e.isCycle,
    }));

    const result = await computeCustomLayoutWasm(nodes, edges);
    const { validation, status } = result;

    const hardErrors = (validation.diagnostics ?? []).filter((d) => d.severity === "error");
    const warnings = (validation.diagnostics ?? []).filter((d) => d.severity === "warning");

    totalHardErrors += hardErrors.length;
    totalWarnings += warnings.length;

    console.log(`\nDataset File: \`${file}\``);
    console.log(`  • Status: ${status} | IsValid: ${validation.isValid}`);
    console.log(`  • Nodes: ${result.nodes.length} | Edges: ${result.edges.length} | Badges: ${result.badges.length}`);
    console.log(`  • Metrics: Crossings=${validation.metrics.crossingCount}, Bends=${validation.metrics.bendCount}, NodeOverlaps=${validation.metrics.nodeNodeOverlaps}, BadgeOverlaps=${validation.metrics.badgeBadgeOverlaps}, EdgePenetrations=${validation.metrics.edgeNodePenetrations}`);

    if (hardErrors.length > 0) {
      console.log(`  ❌ HARD ERRORS (${hardErrors.length}):`);
      hardErrors.forEach((d) => console.log(`     - [${d.code}] ${d.message}`));
    } else {
      console.log(`  ✅ Hard Errors: 0`);
    }

    if (warnings.length > 0) {
      console.log(`  ⚠️ WARNINGS (${warnings.length}):`);
      warnings.forEach((d) => console.log(`     - [${d.code}] ${d.message}`));
    } else {
      console.log(`  ✅ Warnings: 0`);
    }
  }

  console.log("\n===============================================================================");
  console.log(`SUMMARY: Total Hard Errors = ${totalHardErrors} | Total Warnings = ${totalWarnings}`);
  console.log("===============================================================================\n");
}

runLayoutAudit().catch((err) => {
  console.error("❌ Layout Audit Failed:", err);
  process.exit(1);
});
