// `tsconfig.app.json` scopes ambient types to `vite/client`, so the node typings this test needs
// to walk `public/data/graphs` have to be pulled in for this file alone.
/// <reference types="node" />

import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { GraphDataset, NodeKind, NodeStatus, PayloadKind } from "./graphData";

const GRAPHS_DIR = fileURLToPath(new URL("../../public/data/graphs", import.meta.url));
const MANIFEST_PATH = `${GRAPHS_DIR}/manifest.json`;

const NODE_KINDS: ReadonlySet<string> = new Set<NodeKind>([
  "orchestrator",
  "agent",
  "tool",
  "router",
  "join",
  "gate",
  "critic",
  "terminal",
  "input",
]);

const NODE_STATUSES: ReadonlySet<string> = new Set<NodeStatus>([
  "pending",
  "running",
  "success",
  "error",
  "warning",
  "skipped",
  "cached",
]);

const PAYLOAD_KINDS: ReadonlySet<string> = new Set<PayloadKind>([
  "full-context",
  "summary",
  "artifact",
  "decision",
  "file",
  "prompt",
]);

function readDatasetStems(): string[] {
  return readdirSync(GRAPHS_DIR)
    .filter((file) => file.endsWith(".json") && file !== "manifest.json")
    .map((file) => file.slice(0, -".json".length))
    .sort();
}

function readDataset(stem: string): GraphDataset {
  return JSON.parse(readFileSync(`${GRAPHS_DIR}/${stem}.json`, "utf-8")) as GraphDataset;
}

const stems = readDatasetStems();

describe("example graph manifest", () => {
  it("lists exactly the datasets on disk", () => {
    // The manifest is what the sidebar reads in a production build, where no dev API exists to
    // re-scan the directory. A stale entry there renders a file-name that 404s on click.
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8")) as string[];
    expect([...manifest].sort()).toEqual(stems);
  });
});

// A plain loop rather than `describe.each`: bun's type definitions do not declare `.each`, and
// reaching for it would mean either an `any` or a suppression, both of which this repo forbids.
for (const stem of stems) {
  describe(`dataset ${stem}`, () => {
    const dataset = readDataset(stem);
    const nodeIds = new Set(dataset.nodes.map((node) => node.id));

    it("has an id matching its filename", () => {
      // `loadGraphFile` fetches `/data/graphs/<routeId>.json`, so a mismatch makes a graph
      // unreachable from its own sidebar entry.
      expect(dataset.id).toBe(stem);
    });

    it("declares a title and description", () => {
      expect(dataset.title.length).toBeGreaterThan(0);
      expect((dataset.description ?? "").length).toBeGreaterThan(0);
    });

    it("gives every node a unique id", () => {
      expect(nodeIds.size).toBe(dataset.nodes.length);
    });

    it("gives every edge a unique id", () => {
      const edgeIds = new Set(dataset.edges.map((edge) => edge.id));
      expect(edgeIds.size).toBe(dataset.edges.length);
    });

    it("resolves every edge endpoint to a real node", () => {
      const dangling = dataset.edges
        .filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))
        .map((edge) => edge.id);
      expect(dangling).toEqual([]);
    });

    it("resolves entry and exits to real nodes", () => {
      // Explicit rather than inferred, because a graph with cycles need not have any node of
      // in-degree zero — see the `entry` field's doc comment.
      expect(dataset.entry).toBeDefined();
      expect(nodeIds.has(dataset.entry as string)).toBe(true);
      for (const exit of dataset.exits ?? []) {
        expect(nodeIds.has(exit)).toBe(true);
      }
    });

    it("uses only known node kinds and statuses", () => {
      const badKinds = dataset.nodes
        .filter((node) => node.kind !== undefined && !NODE_KINDS.has(node.kind))
        .map((node) => node.id);
      const badStatuses = dataset.nodes
        .filter((node) => node.status !== undefined && !NODE_STATUSES.has(node.status))
        .map((node) => node.id);

      expect(badKinds).toEqual([]);
      expect(badStatuses).toEqual([]);
    });

    it("uses only known payload kinds on edge handoffs", () => {
      const bad = dataset.edges
        .filter((edge) => edge.handoff && !PAYLOAD_KINDS.has(edge.handoff.kind))
        .map((edge) => edge.id);
      expect(bad).toEqual([]);
    });

    it("marks every back-edge as a cycle", () => {
      // The layout engine classifies edge roles from `isCycle`; a loop-back that omits it is routed
      // as a forward edge and draws through the nodes it should arc around.
      const loopEdges = dataset.edges.filter((edge) => edge.kind === "loop");
      expect(loopEdges.every((edge) => edge.isCycle === true)).toBe(true);
    });

    it("gives every node a description the card can show", () => {
      const missing = dataset.nodes
        .filter((node) => (node.description ?? "").trim().length === 0)
        .map((node) => node.id);
      expect(missing).toEqual([]);
    });

    it("never attaches metrics to a node that has not run", () => {
      // A pending node with a duration would render a cost footer for work that has not happened.
      const contradictory = dataset.nodes
        .filter((node) => node.status === "pending" && node.metrics !== undefined)
        .map((node) => node.id);
      expect(contradictory).toEqual([]);
    });
  });
}
