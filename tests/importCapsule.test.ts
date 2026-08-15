import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importCapsule } from "../scripts/import-capsule";
import type { GraphDataset } from "../src/types/graphData";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots) {
    try {
      await rm(root, { recursive: true, force: true });
    } catch {}
  }
  roots.length = 0;
});

describe("importCapsule script", () => {
  test("imports capsule with summary/graph.json into destination directory", async () => {
    const capsuleDir = await mkdtemp(join(tmpdir(), "capsule-src-"));
    const outDir = await mkdtemp(join(tmpdir(), "gvui-graphs-"));
    roots.push(capsuleDir, outDir);

    const summaryDir = join(capsuleDir, "summary");
    await mkdir(summaryDir, { recursive: true });

    const dataset: GraphDataset = {
      id: "run-capsule-1",
      title: "Test Execution Run",
      directed: true,
      nodes: [
        { id: "n1", name: "Node 1", kind: "agent", status: "success" },
        { id: "n2", name: "Node 2", kind: "gate", status: "pending" },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", kind: "sequence" }],
    };

    await writeFile(join(summaryDir, "graph.json"), JSON.stringify(dataset));

    const result = importCapsule({
      capsulePath: capsuleDir,
      outputDir: outDir,
    });

    expect(result.graphId).toBe("run-capsule-1");
    expect(existsSync(result.outputPath)).toBe(true);

    const imported = JSON.parse(readFileSync(result.outputPath, "utf-8")) as GraphDataset;
    expect(imported.id).toBe("run-capsule-1");
    expect(imported.nodes).toHaveLength(2);

    const manifestPath = join(outDir, "manifest.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as string[];
    expect(manifest).toContain("run-capsule-1");
  });

  test("falls back gracefully to state.json if summary/graph.json is absent", async () => {
    const capsuleDir = await mkdtemp(join(tmpdir(), "capsule-state-"));
    const outDir = await mkdtemp(join(tmpdir(), "gvui-graphs-state-"));
    roots.push(capsuleDir, outDir);

    const stateObj = {
      tasks: {
        "t-1": { id: "t-1", label: "Task 1", status: "done" },
        "t-2": { id: "t-2", label: "Task 2", status: "running" },
      },
    };

    await writeFile(join(capsuleDir, "state.json"), JSON.stringify(stateObj));

    const result = importCapsule({
      capsulePath: capsuleDir,
      outputDir: outDir,
    });

    expect(existsSync(result.outputPath)).toBe(true);
    expect(result.dataset.nodes).toHaveLength(2);
  });
});
