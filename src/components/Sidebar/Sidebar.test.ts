// `tsconfig.app.json` scopes ambient types to `vite/client`, so the node typings this test needs
// to walk `public/data/graphs` have to be pulled in for this file alone.
/// <reference types="node" />

import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SAMPLE_GRAPHS } from "./sampleGraphs";

const GRAPHS_DIR = fileURLToPath(new URL("../../../public/data/graphs", import.meta.url));

function readDatasetStems(): string[] {
  return readdirSync(GRAPHS_DIR)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length))
    .sort();
}

function readDatasetTitle(stem: string): string {
  const raw: unknown = JSON.parse(readFileSync(`${GRAPHS_DIR}/${stem}.json`, "utf-8"));
  if (typeof raw !== "object" || raw === null || !("title" in raw)) {
    throw new Error(`${stem}.json has no title`);
  }
  const { title } = raw;
  if (typeof title !== "string") {
    throw new Error(`${stem}.json title is not a string`);
  }
  return title;
}

describe("Sidebar SAMPLE_GRAPHS", () => {
  it("points every entry at a dataset that exists on disk", () => {
    const stems = new Set(readDatasetStems());
    const missing = SAMPLE_GRAPHS.filter((sample) => !stems.has(sample.id)).map(
      (sample) => sample.id,
    );

    // A dangling id navigates to `/data/graphs/<id>.json`, 404s, and renders nothing — the
    // failure the v3 dataset rename shipped unnoticed.
    expect(missing).toEqual([]);
  });

  it("offers every dataset on disk", () => {
    const listed = new Set(SAMPLE_GRAPHS.map((sample) => sample.id));
    const unlisted = readDatasetStems().filter((stem) => !listed.has(stem));

    expect(unlisted).toEqual([]);
  });

  it("labels each entry with the dataset's own title", () => {
    const drifted = SAMPLE_GRAPHS.filter(
      (sample) => sample.name !== readDatasetTitle(sample.id),
    ).map((sample) => sample.id);

    expect(drifted).toEqual([]);
  });

  it("gives every entry a distinct id and a non-empty icon", () => {
    const ids = SAMPLE_GRAPHS.map((sample) => sample.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SAMPLE_GRAPHS.filter((sample) => sample.icon.length === 0)).toEqual([]);
  });
});
