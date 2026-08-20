/// <reference types="node" />

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A capsule on disk holding one exported dataset, plus somewhere for the importer to write.
 *
 * The importer is exercised through the filesystem rather than through its internals because the
 * contract it enforces is what reaches `public/data/graphs`, not what it computes on the way.
 */
export interface CapsuleFixture {
  capsulePath: string;
  outputDir: string;
  /** Reads back what the importer wrote for the given graph id. */
  readWritten(graphId: string): unknown;
  cleanup(): void;
}

export function writeCapsule(graph: unknown): CapsuleFixture {
  const capsulePath = mkdtempSync(join(tmpdir(), "gvui-capsule-"));
  const outputDir = mkdtempSync(join(tmpdir(), "gvui-graphs-"));

  mkdirSync(join(capsulePath, "summary"));
  writeFileSync(
    join(capsulePath, "summary", "graph.json"),
    JSON.stringify(graph, null, 2) + "\n",
    "utf-8",
  );

  return {
    capsulePath,
    outputDir,
    readWritten(graphId: string): unknown {
      return JSON.parse(readFileSync(join(outputDir, `${graphId}.json`), "utf-8")) as unknown;
    },
    cleanup(): void {
      rmSync(capsulePath, { recursive: true, force: true });
      rmSync(outputDir, { recursive: true, force: true });
    },
  };
}

/** A capsule whose `graph.json` holds the given bytes, for documents no serializer would produce. */
export function writeRawCapsule(graphJson: string): CapsuleFixture {
  const fixture = writeCapsule({});
  writeFileSync(join(fixture.capsulePath, "summary", "graph.json"), graphJson, "utf-8");
  return fixture;
}

/** A capsule holding only `state.json`, for the projection the importer falls back to mid-run. */
export function writeStateCapsule(state: unknown): CapsuleFixture {
  const fixture = writeCapsule(state);
  rmSync(join(fixture.capsulePath, "summary"), { recursive: true, force: true });
  writeFileSync(
    join(fixture.capsulePath, "state.json"),
    JSON.stringify(state, null, 2) + "\n",
    "utf-8",
  );
  return fixture;
}
