import { describe, expect, it, afterEach } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importCapsule } from "./import-capsule";

/**
 * The importer's asset-portability pass is the fix for a real, previously-shipped defect: the
 * exporter writes `assets[].url` etc. as filesystem paths meaningful only on the machine that ran
 * the orchestration (often absolute paths under its own gitignored `.capsules/`). These tests build
 * a real, temp-directory capsule with real bytes on disk — not a mock of the filesystem — because
 * the behaviour under test IS filesystem interaction: does a referenced file get found and copied.
 */

const cleanupDirs: string[] = [];

afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  cleanupDirs.push(dir);
  return dir;
}

/** Builds a minimal on-disk capsule (`summary/graph.json` only) the importer can read directly. */
function writeCapsule(capsuleDir: string, dataset: Record<string, unknown>): void {
  mkdirSync(join(capsuleDir, "summary"), { recursive: true });
  writeFileSync(join(capsuleDir, "summary", "graph.json"), JSON.stringify(dataset));
}

describe("importCapsule asset portability", () => {
  it("copies a screenshot referenced by an absolute path and rewrites the url to a portable one", () => {
    const root = makeTempDir("import-capsule-abs-");
    const capsuleDir = join(root, "capsule");
    const sourceDir = join(root, "evidence-source");
    const outDir = join(root, "out");
    mkdirSync(sourceDir, { recursive: true });

    const pngBytes = Buffer.from("not-a-real-png-but-real-bytes-1");
    const sourcePath = join(sourceDir, "task-1-main.png");
    writeFileSync(sourcePath, pngBytes);

    writeCapsule(capsuleDir, {
      id: "abs-path-run",
      directed: true,
      nodes: [
        {
          id: "n1",
          name: "Node One",
          kind: "agent",
          assets: [{ id: "a1", type: "image", url: sourcePath, title: "Shot" }],
        },
      ],
      edges: [],
    });

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });

    const node = result.dataset.nodes.find((n) => n.id === "n1") as {
      assets?: Array<{ url: string }>;
    };
    const rewrittenUrl = node.assets?.[0]?.url ?? "";
    expect(rewrittenUrl.startsWith(`/data/graphs/${result.graphId}-assets/`)).toBe(true);
    expect(rewrittenUrl).not.toContain(root);

    // The bytes actually landed under the assets directory next to the exported dataset.
    const assetsDir = join(outDir, `${result.graphId}-assets`);
    const fileName = rewrittenUrl.split("/").pop() as string;
    expect(existsSync(join(assetsDir, fileName))).toBe(true);
    expect(readFileSync(join(assetsDir, fileName))).toEqual(pngBytes);

    // The rewrite is disclosed, not silent.
    expect(result.warnings.some((w) => w.includes("rewrote asset") && w.includes(sourcePath))).toBe(
      true,
    );

    // The written dataset file on disk carries the same rewritten url, not the original absolute one.
    const onDisk = JSON.parse(readFileSync(result.outputPath, "utf-8")) as {
      nodes: Array<{ assets?: Array<{ url: string }> }>;
    };
    expect(onDisk.nodes[0]?.assets?.[0]?.url).toBe(rewrittenUrl);
  });

  it("dedupes identical bytes referenced under two different original paths to one physical file", () => {
    const root = makeTempDir("import-capsule-dedupe-");
    const capsuleDir = join(root, "capsule");
    const sourceDir = join(root, "evidence-source");
    const outDir = join(root, "out");
    mkdirSync(sourceDir, { recursive: true });

    const sharedBytes = Buffer.from("identical-content-shared-by-two-names");
    const pathA = join(sourceDir, "evidence", "C-aaaa-01-main.png");
    const pathB = join(sourceDir, "reports", "task-1-01-main.png");
    mkdirSync(join(sourceDir, "evidence"), { recursive: true });
    mkdirSync(join(sourceDir, "reports"), { recursive: true });
    writeFileSync(pathA, sharedBytes);
    writeFileSync(pathB, sharedBytes);

    writeCapsule(capsuleDir, {
      id: "dedupe-run",
      directed: true,
      nodes: [
        {
          id: "n1",
          name: "Node One",
          kind: "agent",
          assets: [{ id: "a1", type: "image", url: pathA }],
        },
        {
          id: "n2",
          name: "Node Two",
          kind: "agent",
          assets: [{ id: "a2", type: "image", url: pathB }],
        },
      ],
      edges: [],
    });

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });

    const urlA = (result.dataset.nodes[0] as { assets?: Array<{ url: string }> }).assets?.[0]?.url;
    const urlB = (result.dataset.nodes[1] as { assets?: Array<{ url: string }> }).assets?.[0]?.url;
    expect(urlA).toBe(urlB);

    const assetsDir = join(outDir, `${result.graphId}-assets`);
    const written = readdirSync(assetsDir);
    expect(written.length).toBe(1);
  });

  it("leaves an already-portable /data/ reference untouched", () => {
    const root = makeTempDir("import-capsule-portable-");
    const capsuleDir = join(root, "capsule");
    const outDir = join(root, "out");

    writeCapsule(capsuleDir, {
      id: "already-portable-run",
      directed: true,
      nodes: [
        {
          id: "n1",
          name: "Node One",
          kind: "agent",
          assets: [{ id: "a1", type: "image", url: "/data/graphs/other-run-assets/deadbeef.png" }],
        },
      ],
      edges: [],
    });

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });

    const node = result.dataset.nodes[0] as { assets?: Array<{ url: string }> };
    expect(node.assets?.[0]?.url).toBe("/data/graphs/other-run-assets/deadbeef.png");
    expect(existsSync(join(outDir, `${result.graphId}-assets`))).toBe(false);
    expect(result.warnings.some((w) => w.includes("rewrote asset"))).toBe(false);
  });

  it("leaves data:, blob: and remote http(s) references untouched", () => {
    const root = makeTempDir("import-capsule-remote-");
    const capsuleDir = join(root, "capsule");
    const outDir = join(root, "out");

    writeCapsule(capsuleDir, {
      id: "remote-run",
      directed: true,
      nodes: [
        {
          id: "n1",
          name: "Node One",
          kind: "agent",
          assets: [
            { id: "a1", type: "image", url: "data:image/png;base64,AAAA" },
            { id: "a2", type: "image", url: "https://example.com/shot.png" },
            { id: "a3", type: "image", url: "blob:http://localhost/abc" },
          ],
        },
      ],
      edges: [],
    });

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });
    const node = result.dataset.nodes[0] as { assets?: Array<{ url: string }> };
    expect(node.assets?.map((a) => a.url)).toEqual([
      "data:image/png;base64,AAAA",
      "https://example.com/shot.png",
      "blob:http://localhost/abc",
    ]);
  });

  it("reports, without fabricating a path, when a referenced local file no longer exists", () => {
    const root = makeTempDir("import-capsule-missing-");
    const capsuleDir = join(root, "capsule");
    const outDir = join(root, "out");
    const missingPath = join(root, "gone", "shot.png");

    writeCapsule(capsuleDir, {
      id: "missing-file-run",
      directed: true,
      nodes: [
        {
          id: "n1",
          name: "Node One",
          kind: "agent",
          assets: [{ id: "a1", type: "image", url: missingPath, thumbnailUrl: missingPath }],
        },
      ],
      edges: [],
    });

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });
    const node = result.dataset.nodes[0] as {
      assets?: Array<{ url: string; thumbnailUrl?: string }>;
    };
    // Left exactly as recorded — never swapped for a plausible-looking placeholder.
    expect(node.assets?.[0]?.url).toBe(missingPath);
    expect(node.assets?.[0]?.thumbnailUrl).toBe(missingPath);
    expect(
      result.warnings.some(
        (w) => w.includes("does not resolve to a local file") && w.includes(missingPath),
      ),
    ).toBe(true);
  });

  it("rewrites browserTests traces and videos, which live outside assets[].url", () => {
    const root = makeTempDir("import-capsule-browsertests-");
    const capsuleDir = join(root, "capsule");
    const sourceDir = join(root, "evidence-source");
    const outDir = join(root, "out");
    mkdirSync(sourceDir, { recursive: true });

    const traceBytes = Buffer.from("trace-bundle-bytes");
    const tracePath = join(sourceDir, "trace.zip.png"); // extension irrelevant to the importer
    writeFileSync(tracePath, traceBytes);

    writeCapsule(capsuleDir, {
      id: "browsertests-run",
      directed: true,
      nodes: [
        {
          id: "n1",
          name: "Node One",
          kind: "agent",
          browserTests: [{ runner: "playwright", traces: [tracePath], videos: [] }],
        },
      ],
      edges: [],
    });

    const result = importCapsule({ capsulePath: capsuleDir, outputDir: outDir });
    const node = result.dataset.nodes[0] as { browserTests?: Array<{ traces?: string[] }> };
    const rewrittenTrace = node.browserTests?.[0]?.traces?.[0] ?? "";
    expect(rewrittenTrace.startsWith(`/data/graphs/${result.graphId}-assets/`)).toBe(true);
  });
});
