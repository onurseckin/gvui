import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CapsuleValidationError, importCapsule } from "../scripts/import-capsule";
import type { JsonGraphDataset } from "../src/state/graphSchema";

const roots: string[] = [];

async function makeDirs(prefix: string): Promise<{ capsuleDir: string; outDir: string }> {
  const capsuleDir = await mkdtemp(join(tmpdir(), `capsule-${prefix}-`));
  const outDir = await mkdtemp(join(tmpdir(), `gvui-graphs-${prefix}-`));
  roots.push(capsuleDir, outDir);
  return { capsuleDir, outDir };
}

async function writeGraphJson(capsuleDir: string, dataset: unknown): Promise<void> {
  const summaryDir = join(capsuleDir, "summary");
  await mkdir(summaryDir, { recursive: true });
  await writeFile(join(summaryDir, "graph.json"), JSON.stringify(dataset));
}

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
    const { capsuleDir, outDir } = await makeDirs("src");
    await writeGraphJson(capsuleDir, {
      id: "run-capsule-1",
      title: "Test Execution Run",
      directed: true,
      nodes: [
        { id: "n1", name: "Node 1", kind: "agent", status: "success" },
        { id: "n2", name: "Node 2", kind: "gate", status: "pending" },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2", kind: "sequence" }],
    });

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });

    expect(result.graphId).toBe("run-capsule-1");
    expect(result.warnings).toEqual([]);
    expect(existsSync(result.outputPath)).toBe(true);

    const imported = JSON.parse(readFileSync(result.outputPath, "utf-8")) as JsonGraphDataset;
    expect(imported.id).toBe("run-capsule-1");
    expect(imported.nodes).toHaveLength(2);

    const manifest = JSON.parse(readFileSync(join(outDir, "manifest.json"), "utf-8")) as string[];
    expect(manifest).toContain("run-capsule-1");
  });

  test("imports a dataset full of holes, reporting each one it stepped over", async () => {
    const { capsuleDir, outDir } = await makeDirs("holes");
    await writeGraphJson(capsuleDir, {
      title: "Missing everything that matters",
      nodes: [
        { id: "n1", name: "Node 1" },
        { id: "n1", name: "Duplicate" },
      ],
      edges: [{ id: "e1", source: "n1", target: "ghost" }],
    });

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });

    expect(result.dataset.nodes.map((node) => node.name)).toEqual(["Node 1"]);
    expect(result.dataset.edges).toEqual([]);
    expect(result.warnings).toContain(
      'dataset.nodes[1]: ignored, node id "n1" already belongs to an earlier node',
    );
    expect(result.warnings).toContain(
      'dataset.edges[0]: ignored, target "ghost" matches no node in dataset.nodes',
    );
    expect(existsSync(join(outDir, "manifest.json"))).toBe(true);
  });

  test("refuses only a document with no nodes array to draw from", async () => {
    const { capsuleDir, outDir } = await makeDirs("no-nodes");
    await writeGraphJson(capsuleDir, { id: "run-shapeless", edges: [] });

    let thrown: unknown;
    try {
      importCapsule({ capsulePath: capsuleDir, outputDir: outDir });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(CapsuleValidationError);
    const error = thrown as CapsuleValidationError;
    expect(error.issues).toEqual([
      "dataset.nodes: required, must be an array of node objects, received nothing",
    ]);
    expect(error.message).toContain("must be a JSON object carrying nodes and edges arrays");
    // Nothing is written when there is no graph to write.
    expect(existsSync(join(outDir, "manifest.json"))).toBe(false);
  });

  test("reports an unknown vocabulary member as a warning and still imports", async () => {
    const { capsuleDir, outDir } = await makeDirs("warn");
    await writeGraphJson(capsuleDir, {
      id: "run-warn",
      title: "Future Producer",
      nodes: [{ id: "n1", name: "Node 1", kind: "quantum-agent" }],
      edges: [],
    });

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });
    expect(result.warnings[0]).toContain('"quantum-agent" is not a known node kind');
    expect(existsSync(result.outputPath)).toBe(true);
  });

  test("normalises a legacy dataset on import instead of at every render site", async () => {
    const { capsuleDir, outDir } = await makeDirs("legacy");
    await writeGraphJson(capsuleDir, {
      id: "run-legacy",
      title: "Legacy Run",
      nodes: [
        {
          id: "n1",
          name: "Worker",
          kind: "agent",
          model: "claude-3-5-sonnet",
          tier: "m",
          metrics: { tokensIn: 900, tokensOut: 300 },
          mediaAssets: [{ id: "a1", type: "image", url: "/a1.png" }],
          metadata: {
            role: "worker",
            screenshots: [{ id: "a2", type: "image", url: "/a2.png" }],
          },
        },
      ],
      edges: [],
    });

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });
    const node = result.dataset.nodes[0]!;

    expect(node.telemetry).toEqual({
      role: "implementer",
      model: { value: "claude-3-5-sonnet", evidence_class: "unknown" },
      modelTier: { value: "m", evidence_class: "unknown" },
      tokensIn: { value: 900, evidence_class: "unknown" },
      tokensOut: { value: 300, evidence_class: "unknown" },
    });
    expect((node.assets as Array<{ id: string }>).map((asset) => asset.id)).toEqual(["a1", "a2"]);

    const written = JSON.parse(readFileSync(result.outputPath, "utf-8")) as JsonGraphDataset;
    expect(written.nodes[0]!.telemetry).toEqual(node.telemetry);
  });

  test("falls back to state.json and maps every task status the run can hold", async () => {
    const { capsuleDir, outDir } = await makeDirs("state");
    await writeFile(
      join(capsuleDir, "state.json"),
      JSON.stringify({
        tasks: {
          "t-1": { id: "t-1", label: "Task 1", status: "done", dependencies: [] },
          "t-2": { id: "t-2", label: "Task 2", status: "branched", dependencies: ["t-1"] },
          "t-3": { id: "t-3", label: "Task 3", status: "changes_requested", dependencies: [] },
          "t-4": { id: "t-4", label: "Task 4", status: "escalated", dependencies: [] },
          "t-5": { id: "t-5", label: "Task 5", status: "cancelled", dependencies: [] },
          "t-6": { id: "t-6", label: "Task 6", status: "ready", dependencies: [] },
        },
      }),
    );

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });
    const byId = new Map(result.dataset.nodes.map((node) => [node.id, node]));

    expect(byId.get("node-t-1")!.status).toBe("success");
    expect(byId.get("node-t-2")!.status).toBe("running");
    expect(byId.get("node-t-3")!.status).toBe("warning");
    expect(byId.get("node-t-4")!.status).toBe("error");
    expect(byId.get("node-t-5")!.status).toBe("skipped");
    expect(byId.get("node-t-6")!.status).toBe("pending");

    expect(result.dataset.edges).toEqual([
      {
        id: "edge-dep-t-1-t-2",
        source: "node-t-1",
        target: "node-t-2",
        kind: "dependency",
      },
    ]);
  });

  test("projects the branch ledger into a section with its recorded reason", async () => {
    const { capsuleDir, outDir } = await makeDirs("branch");
    await writeFile(
      join(capsuleDir, "state.json"),
      JSON.stringify({
        tasks: { "t-1": { id: "t-1", label: "Parent", status: "branched", dependencies: [] } },
        branches: {
          "B-1": {
            id: "B-1",
            parent_task_id: "t-1",
            parent_agent_id: "agent-1",
            reason: "docs and code needed different scopes",
            status: "collected",
            sub_tasks: [{ id: "s-1", label: "Docs", status: "submitted" }],
          },
        },
      }),
    );

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });

    const sections = result.dataset.sections as Array<Record<string, unknown>>;
    expect(sections).toHaveLength(1);
    expect(sections[0]!.reason).toBe("docs and code needed different scopes");
    expect(sections[0]!.status).toBe("collected");
    expect(sections[0]!.parentNodeId).toBe("node-t-1");
    expect(sections[0]!.nodeIds).toEqual(["node-B-1-s-1"]);

    const subNode = result.dataset.nodes.find((node) => node.id === "node-B-1-s-1");
    expect(subNode!.status).toBe("success");
    // The ledger never records which sub-role the sub-agent held, so none is asserted. The branch
    // region and the branch/collect edges carry the relationship instead.
    expect(subNode!.metadata).toEqual({ branchId: "B-1", subTaskStatus: "submitted" });

    const edgeKinds = result.dataset.edges.map((edge) => edge.kind);
    expect(edgeKinds).toEqual(["branch", "collect"]);
  });

  test("never fills in a status or a role the ledger did not record", async () => {
    const { capsuleDir, outDir } = await makeDirs("absent");
    await writeFile(
      join(capsuleDir, "state.json"),
      JSON.stringify({
        tasks: {
          // A status from a producer newer than this importer must not be rounded to "pending".
          "t-1": { id: "t-1", label: "Future", status: "quarantined", dependencies: [] },
          // No lease means nobody claimed it, so no role was ever recorded.
          "t-2": { id: "t-2", label: "Unclaimed", status: "ready", dependencies: [] },
          // A lease records the real role, and that is the only role worth writing down.
          "t-3": {
            id: "t-3",
            label: "Claimed",
            status: "running",
            dependencies: [],
            lease: { agent_id: "a-1", role: "validator" },
          },
        },
      }),
    );

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });
    const byId = new Map(result.dataset.nodes.map((node) => [node.id, node]));

    expect(byId.get("node-t-1")!.status).toBeUndefined();
    expect(byId.get("node-t-1")!.metadata).toEqual({ taskStatus: "quarantined" });

    expect(byId.get("node-t-2")!.status).toBe("pending");
    expect(byId.get("node-t-2")!.metadata).toEqual({ taskStatus: "ready" });

    expect(byId.get("node-t-3")!.metadata).toEqual({ taskStatus: "running", role: "validator" });

    // Nothing invented survives to disk either.
    const written = JSON.parse(readFileSync(result.outputPath, "utf-8")) as JsonGraphDataset;
    expect(JSON.stringify(written)).not.toContain('"role":"implementer"');
  });

  test("fails with a clear message when the capsule holds neither file", async () => {
    const { capsuleDir, outDir } = await makeDirs("empty");
    expect(() => importCapsule({ capsulePath: capsuleDir, outputDir: outDir })).toThrow(
      /Neither summary\/graph.json nor state.json found/,
    );
  });

  test("names the file that is not valid JSON", async () => {
    const { capsuleDir, outDir } = await makeDirs("broken-json");
    const summaryDir = join(capsuleDir, "summary");
    await mkdir(summaryDir, { recursive: true });
    await writeFile(join(summaryDir, "graph.json"), "{not json");

    expect(() => importCapsule({ capsulePath: capsuleDir, outputDir: outDir })).toThrow(
      /graph.json is not valid JSON/,
    );
  });
});
