/// <reference types="node" />

import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CapsuleValidationError, importCapsule } from "../../scripts/import-capsule";
import {
  writeCapsule,
  writeRawCapsule,
  writeStateCapsule,
  type CapsuleFixture,
} from "./capsuleHarness";

// The retired field name this suite proves is no longer read, held as a value: the whole point of
// the taxonomy rule is that a product never names a symbol, retired or not.
const RETIRED_RUN_FIELD = "playwrightMetadata";

const GRAPHS_DIR = fileURLToPath(new URL("../../public/data/graphs", import.meta.url));

const openFixtures: CapsuleFixture[] = [];

afterEach(() => {
  while (openFixtures.length > 0) openFixtures.pop()?.cleanup();
});

/** A dataset written exactly the way the producer writes one today. */
function currentContractDataset(node: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "contract-probe",
    title: "Contract probe",
    directed: true,
    nodes: [
      { id: "n-1", name: "First", kind: "agent", ...node },
      { id: "n-2", name: "Second", kind: "agent" },
    ],
    edges: [{ id: "e-1", source: "n-1", target: "n-2", kind: "handoff" }],
  };
}

interface ImportOutcome {
  graphId: string;
  warnings: string[];
  written: unknown;
}

function runImport(graph: unknown): ImportOutcome {
  const fixture = writeCapsule(graph);
  openFixtures.push(fixture);
  const result = importCapsule({
    capsulePath: fixture.capsulePath,
    outputDir: fixture.outputDir,
  });
  return {
    graphId: result.graphId,
    warnings: result.warnings,
    written: fixture.readWritten(result.graphId),
  };
}

/** The one thing an import ignored, so a test asserts on a message rather than on a count. */
function soleWarning(graph: unknown): string {
  const { warnings } = runImport(graph);
  expect(warnings).toHaveLength(1);
  return warnings[0] ?? "";
}

/** The issues a capsule that cannot be read as a graph at all was refused with. */
function refusalIssues(fixture: CapsuleFixture): string[] {
  openFixtures.push(fixture);
  try {
    importCapsule({ capsulePath: fixture.capsulePath, outputDir: fixture.outputDir });
  } catch (err: unknown) {
    if (err instanceof CapsuleValidationError) return err.issues;
    throw err;
  }
  throw new Error("the capsule was imported when it should have been refused");
}

describe("capsule import reports what it ignored and imports the rest", () => {
  test("accepts a dataset written the way the producer writes one", () => {
    const outcome = runImport(currentContractDataset());
    expect(outcome.warnings).toEqual([]);
    expect(outcome.written).toBeDefined();
  });

  test("writes the dataset through byte-for-byte, rewriting nothing", () => {
    // The importer is a gate, not a translator. Anything it changed on the way in would be a shape
    // the renderer reads but no producer emits.
    const graph = currentContractDataset({
      assets: [{ id: "a-1", type: "image", url: "assets/shot.png" }],
      telemetry: {
        agentId: "agent-7",
        role: "implementer",
        model: { value: "opus", evidence_class: "host_reported" },
        tokensIn: { value: 1200, evidence_class: "host_reported" },
      },
      scripts: [
        {
          commandId: "cmd-1",
          argv: ["bun", "test"],
          exitCode: 0,
          startedAt: "2026-08-19T10:00:00.000Z",
          evidence_class: "harness_observed",
        },
      ],
      metadata: { role: "implementer", writeScope: ["src/**"] },
    });

    expect(runImport(graph).written).toEqual(graph);
  });

  test("reports everything it ignored at once", () => {
    const { warnings } = runImport(
      currentContractDataset({ mediaAssets: [], screenshots: [], model: "opus", tier: "l" }),
    );
    expect(warnings).toHaveLength(4);
  });

  test("names the canonical home of a field the contract has retired", () => {
    expect(soleWarning(currentContractDataset({ mediaAssets: [] }))).toBe(
      "dataset.nodes[0] (n-1).mediaAssets: retired field, expected dataset.nodes[0] (n-1).assets",
    );
  });

  test("keeps the graph rather than refusing it over a retired field", () => {
    // A field the reader no longer consults costs the graph that field, never the whole document.
    expect(runImport(currentContractDataset({ mediaAssets: [] })).written).toEqual(
      currentContractDataset({ mediaAssets: [] }),
    );
  });

  test("reports node.screenshots", () => {
    expect(soleWarning(currentContractDataset({ screenshots: [] }))).toContain(
      "dataset.nodes[0] (n-1).screenshots: retired field",
    );
  });

  for (const alias of ["assets", "mediaAssets", "screenshots"]) {
    test(`reports metadata.${alias}`, () => {
      expect(soleWarning(currentContractDataset({ metadata: { [alias]: [] } }))).toContain(
        `dataset.nodes[0] (n-1).metadata.${alias}: retired field, expected dataset.nodes[0] (n-1).assets`,
      );
    });
  }

  test("reports playwrightMetadata.screenshots", () => {
    const graph = currentContractDataset({
      metadata: { [RETIRED_RUN_FIELD]: { screenshots: [], browser: "chromium" } },
    });
    expect(soleWarning(graph)).toContain(
      "dataset.nodes[0] (n-1).metadata.playwrightMetadata.screenshots: retired field",
    );
  });

  test("keeps the rest of playwrightMetadata, which lives nowhere else", () => {
    // Only the screenshots were ever a second copy. The viewport, traces, videos, test file,
    // duration, browser and status are recorded here and nowhere else in the graph.
    const legacyRunMetadata = {
      viewport: { width: 1440, height: 900 },
      traces: ["traces/run.zip"],
      videos: ["videos/run.webm"],
      testFile: "tests/visual.spec.ts",
      durationMs: 4210,
      browser: "chromium",
      status: "passed",
    };
    const graph = currentContractDataset({ metadata: { [RETIRED_RUN_FIELD]: legacyRunMetadata } });

    const outcome = runImport(graph);
    expect(outcome.warnings).toEqual([]);
    expect(outcome.written).toEqual(graph);
  });

  test("reports a finding that carries a second copy of its evidence", () => {
    const graph = currentContractDataset({
      metadata: {
        findings: [
          { id: "f-1", severity: "important", observation: "…", status: "open", screenshots: [] },
        ],
      },
    });
    expect(soleWarning(graph)).toContain(
      "dataset.nodes[0] (n-1).metadata.findings[0].screenshots: retired field, expected " +
        "dataset.nodes[0] (n-1).metadata.findings[0].screenshotAssetIds",
    );
  });

  for (const [field, canonical] of [
    ["model", "telemetry.model"],
    ["harnessModel", "telemetry.model"],
    ["tier", "telemetry.modelTier"],
  ]) {
    test(`reports flat node.${field}, which telemetry supersedes`, () => {
      expect(soleWarning(currentContractDataset({ [String(field)]: "opus" }))).toBe(
        `dataset.nodes[0] (n-1).${field}: retired field, expected dataset.nodes[0] (n-1).${canonical}`,
      );
    });
  }

  test("reports a telemetry value that arrives without its provenance", () => {
    expect(soleWarning(currentContractDataset({ telemetry: { model: "opus" } }))).toBe(
      "dataset.nodes[0] (n-1).telemetry.model: expected { value, evidence_class }, " +
        'received "opus"',
    );
  });

  test("reports a provenance label the reader does not understand", () => {
    const graph = currentContractDataset({
      telemetry: { model: { value: "opus", evidence_class: "probably" } },
    });
    expect(soleWarning(graph)).toContain(
      'dataset.nodes[0] (n-1).telemetry.model.evidence_class: "probably" is not an evidence class',
    );
  });

  test("names the node that carries the retired field, not the first one", () => {
    const graph = {
      id: "contract-probe",
      title: "Contract probe",
      nodes: [
        { id: "n-1", name: "First" },
        { id: "n-2", name: "Second", mediaAssets: [] },
      ],
      edges: [],
    };
    expect(soleWarning(graph)).toContain("dataset.nodes[1] (n-2).mediaAssets");
  });
});

describe("capsule import refuses only a document with no graph in it", () => {
  test("names the file that is not valid JSON", () => {
    const fixture = writeRawCapsule("{ nodes: [] ");
    openFixtures.push(fixture);
    expect(() =>
      importCapsule({ capsulePath: fixture.capsulePath, outputDir: fixture.outputDir }),
    ).toThrow(/graph\.json is not valid JSON/);
  });

  test("refuses a document carrying no nodes array, naming the field", () => {
    expect(refusalIssues(writeCapsule({ id: "no-nodes", edges: [] }))).toEqual([
      "dataset.nodes: required, must be an array of node objects, received nothing",
    ]);
  });

  test("refuses a document carrying no edges array", () => {
    expect(refusalIssues(writeCapsule({ id: "no-edges", nodes: [] }))[0]).toContain(
      "dataset.edges: required, must be an array of edge objects",
    );
  });

  test("refuses a document that is not a JSON object", () => {
    expect(refusalIssues(writeCapsule([]))[0]).toBe(
      "dataset: expected a JSON object with nodes and edges arrays, received an array",
    );
  });

  test("says what a graph document must carry, and writes nothing", () => {
    const fixture = writeCapsule({ id: "no-nodes", edges: [] });
    openFixtures.push(fixture);
    expect(() =>
      importCapsule({ capsulePath: fixture.capsulePath, outputDir: fixture.outputDir }),
    ).toThrow(/must be a JSON object carrying nodes and edges arrays/);
    expect(existsSync(join(fixture.outputDir, "manifest.json"))).toBe(false);
  });
});

describe("capsule import leaves open vocabularies open", () => {
  test("accepts node kinds, edge kinds and roles it has never seen", () => {
    const graph = {
      id: "contract-probe",
      title: "Contract probe",
      nodes: [
        { id: "n-1", name: "First", kind: "hypothesis", metadata: { role: "librarian" } },
        { id: "n-2", name: "Second", kind: "artefact" },
      ],
      edges: [{ id: "e-1", source: "n-1", target: "n-2", kind: "cites" }],
      sections: [{ id: "s-1", kind: "shelf", title: "Shelf", nodeIds: ["n-1", "n-2"] }],
    };

    const outcome = runImport(graph);
    expect(outcome.written).toEqual(graph);
    // An unfamiliar member is noted so the reader knows the renderer had no descriptor for it, and
    // the value itself reaches the graph untouched.
    expect(outcome.warnings.every((warning) => warning.includes("is not a known"))).toBe(true);
  });

  test("accepts metadata keys that belong to nobody's schema", () => {
    const graph = currentContractDataset({
      metadata: { shelfMark: "QA76.9", borrowedBy: ["ada", "grace"], overdue: false },
    });
    const outcome = runImport(graph);
    expect(outcome.warnings).toEqual([]);
    expect(outcome.written).toEqual(graph);
  });
});

describe("capsule import names a graph that did not name itself", () => {
  test("calls it after the capsule it was read from", () => {
    const fixture = writeCapsule({ nodes: [{ id: "n-1", name: "Only" }], edges: [] });
    openFixtures.push(fixture);

    const result = importCapsule({
      capsulePath: fixture.capsulePath,
      outputDir: fixture.outputDir,
    });

    expect(result.dataset.id).toBe(basename(fixture.capsulePath));
    expect(result.warnings[0]).toContain("dataset.id: absent, naming the graph");
  });
});

describe("capsule import projects a mid-run capsule from state.json", () => {
  test("builds a dataset the contract accepts", () => {
    // A capsule that is still running has no exported summary. The projection reads the ledger as
    // it is written today; it is not a second supported layout for an old export.
    const fixture = writeStateCapsule({
      tasks: {
        "task-1": { id: "task-1", label: "Draft", status: "done", dependencies: [] },
        "task-2": { id: "task-2", label: "Review", status: "running", dependencies: ["task-1"] },
      },
    });
    openFixtures.push(fixture);

    const result = importCapsule({
      capsulePath: fixture.capsulePath,
      outputDir: fixture.outputDir,
    });

    expect(result.dataset.nodes).toHaveLength(2);
    expect(result.dataset.edges).toHaveLength(1);
  });

  test("projects a branch into its own region, keeping the recorded reason", () => {
    // `branches` is an array in the ledger and only an array, so the projection reads that one
    // shape. The raw ledger status stays in metadata beside the projected node status.
    const fixture = writeStateCapsule({
      tasks: {
        "task-1": { id: "task-1", label: "Parent", status: "branched", dependencies: [] },
      },
      branches: [
        {
          id: "br-1",
          parent_task_id: "task-1",
          reason: "needs a second pair of eyes",
          status: "open",
          sub_tasks: [{ id: "s-1", label: "Probe the cache", status: "claimed" }],
        },
      ],
    });
    openFixtures.push(fixture);

    const { dataset } = importCapsule({
      capsulePath: fixture.capsulePath,
      outputDir: fixture.outputDir,
    });

    expect(dataset.nodes.map((node) => node.id)).toEqual(["node-task-1", "node-br-1-s-1"]);
    expect(dataset.edges.map((edge) => edge.kind)).toEqual(["branch", "collect"]);
    expect(dataset.sections).toEqual([
      {
        id: "section-br-1",
        title: "Branch br-1",
        nodeIds: ["node-br-1-s-1"],
        status: "open",
        parentNodeId: "node-task-1",
        reason: "needs a second pair of eyes",
      },
    ]);
    expect(dataset.nodes[1]?.metadata).toEqual({ branchId: "br-1", subTaskStatus: "claimed" });
  });

  test("ignores a branches value the ledger would never write", () => {
    const fixture = writeStateCapsule({
      tasks: { "task-1": { id: "task-1", label: "Parent", dependencies: [] } },
      branches: { "br-1": { id: "br-1", parent_task_id: "task-1", sub_tasks: [] } },
    });
    openFixtures.push(fixture);

    const { dataset } = importCapsule({
      capsulePath: fixture.capsulePath,
      outputDir: fixture.outputDir,
    });

    expect(dataset.sections).toBeUndefined();
  });
});

describe("shipped datasets", () => {
  test("import, and anything ignored is reported against the path that held it", () => {
    const stems = readdirSync(GRAPHS_DIR)
      .filter((file) => file.endsWith(".json") && file !== "manifest.json")
      .map((file) => file.slice(0, -".json".length));

    expect(stems.length).toBeGreaterThan(0);

    for (const stem of stems) {
      const graph = JSON.parse(readFileSync(`${GRAPHS_DIR}/${stem}.json`, "utf-8")) as unknown;
      const outcome = runImport(graph);
      expect(outcome.warnings.every((warning) => warning.startsWith("dataset."))).toBe(true);
      if (outcome.warnings.length === 0) expect(outcome.written).toEqual(graph);
    }
  });
});
