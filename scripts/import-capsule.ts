import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import type { GraphDataset } from "../src/types/graphData";

export interface ImportOptions {
  capsulePath: string;
  outputDir?: string;
}

export function importCapsule(options: ImportOptions): {
  graphId: string;
  outputPath: string;
  dataset: GraphDataset;
} {
  const resolvedCapsule = isAbsolute(options.capsulePath)
    ? options.capsulePath
    : resolve(process.cwd(), options.capsulePath);

  if (!existsSync(resolvedCapsule)) {
    throw new Error(`Capsule directory does not exist: ${resolvedCapsule}`);
  }

  const graphJsonPath = join(resolvedCapsule, "summary", "graph.json");
  let dataset: GraphDataset;

  if (existsSync(graphJsonPath)) {
    const raw = readFileSync(graphJsonPath, "utf-8");
    dataset = JSON.parse(raw) as GraphDataset;
  } else {
    // Attempt fallback from state.json if summary has not been generated
    const stateJsonPath = join(resolvedCapsule, "state.json");
    if (!existsSync(stateJsonPath)) {
      throw new Error(`Neither summary/graph.json nor state.json found under: ${resolvedCapsule}`);
    }
    const stateRaw = readFileSync(stateJsonPath, "utf-8");
    const stateObj = JSON.parse(stateRaw) as {
      tasks?: Record<string, { id: string; label?: string; status?: string }>;
    };
    const runId = basename(resolvedCapsule);
    const tasks = Object.values(stateObj.tasks ?? {});
    dataset = {
      id: runId,
      title: `Execution Trajectory: ${runId}`,
      directed: true,
      nodes: tasks.map((t) => ({
        id: `node-${t.id}`,
        name: t.label ?? t.id,
        kind: "agent",
        status: t.status === "done" ? "success" : "pending",
      })),
      edges: [],
    };
  }

  if (!dataset.id || !Array.isArray(dataset.nodes) || !Array.isArray(dataset.edges)) {
    throw new Error(`Invalid GraphDataset shape in capsule: ${resolvedCapsule}`);
  }

  const graphsDir = options.outputDir
    ? isAbsolute(options.outputDir)
      ? options.outputDir
      : resolve(process.cwd(), options.outputDir)
    : resolve(import.meta.dir, "../public/data/graphs");

  if (!existsSync(graphsDir)) {
    mkdirSync(graphsDir, { recursive: true });
  }

  const slug = dataset.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const outputPath = join(graphsDir, `${slug}.json`);
  writeFileSync(outputPath, JSON.stringify(dataset, null, 2) + "\n", "utf-8");

  // Update manifest.json index
  const manifestPath = join(graphsDir, "manifest.json");
  let manifest: string[] = [];
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as string[];
    } catch {}
  }
  if (!manifest.includes(slug)) {
    manifest.push(slug);
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  }

  return { graphId: slug, outputPath, dataset };
}

// CLI Execution Entrypoint
if (import.meta.main) {
  const args = process.argv.slice(2);
  let capsulePath = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--capsule" && i + 1 < args.length) {
      capsulePath = args[i + 1]!;
      i++;
    } else if (!args[i]!.startsWith("--") && !capsulePath) {
      capsulePath = args[i]!;
    }
  }

  if (!capsulePath) {
    console.error("Usage: bun scripts/import-capsule.ts --capsule <capsule_path>");
    process.exit(1);
  }

  try {
    const result = processCapsuleImport(capsulePath);
    console.log(`✨ Successfully imported execution graph into GVUI!`);
    console.log(`- Graph ID: ${result.graphId}`);
    console.log(`- Nodes: ${result.dataset.nodes.length} | Edges: ${result.dataset.edges.length}`);
    console.log(`- Output File: ${result.outputPath}`);
    console.log(`- Preview URL: http://localhost:4444/?graph=${result.graphId}`);
  } catch (err: unknown) {
    console.error(`❌ Import failed:`, err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function processCapsuleImport(capsulePath: string) {
  return importCapsule({ capsulePath });
}
