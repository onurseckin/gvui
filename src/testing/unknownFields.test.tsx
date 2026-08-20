/// <reference types="node" />

import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { importCapsule } from "../../scripts/import-capsule";
import { toGraphDataset } from "../state/graphSchema";
import type { GraphDataset, GraphNodeData, PositionedNode } from "../types/graphData";
import { describeNodeKind } from "../primitives/nodes/NodeCard/nodeKinds";
import { NodeCard } from "../primitives/nodes/NodeCard";
import { writeCapsule, type CapsuleFixture } from "./capsuleHarness";

/**
 * A graph from a producer newer than this renderer, holding every departure short of unparseable
 * bytes: keys nobody has taught gvui, known fields carrying shapes it cannot walk, a node with no
 * id, a second node claiming an id already taken, an edge to a node that was never declared.
 *
 * The promise it holds the reader to is that none of that is fatal. Everything the renderer
 * understands draws; everything else is reported and left out, exactly as if the document had never
 * mentioned it. This file goes red the day one unknown key can blank the canvas.
 */
const FIXTURE_PATH = fileURLToPath(new URL("./fixtures/future-bakery-line.json", import.meta.url));
const GRAPH_ID = "future-bakery-line";

const declared = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as Record<string, unknown>;

/** The ids the document declares that anything can actually point at. */
const ADDRESSABLE = ["n-order", "n-dough", "n-proof", "n-bake", "n-cool", "n-deliver"];

let fixture: CapsuleFixture;
let warnings: string[];
let imported: Record<string, unknown>;
let dataset: GraphDataset;
let layout: Awaited<
  ReturnType<
    typeof import("../engine/layout/custom/wasmLayoutAdapter").computeCustomEngineGraphLayoutWasm
  >
>;

beforeAll(async () => {
  fixture = writeCapsule(declared);
  const result = importCapsule({
    capsulePath: fixture.capsulePath,
    outputDir: fixture.outputDir,
  });
  warnings = result.warnings;
  imported = fixture.readWritten(GRAPH_ID) as Record<string, unknown>;
  dataset = toGraphDataset(result.dataset);

  const { computeCustomEngineGraphLayoutWasm } =
    await import("../engine/layout/custom/wasmLayoutAdapter");
  layout = await computeCustomEngineGraphLayoutWasm(dataset, undefined, "layered");
});

function nodeById(id: string): GraphNodeData {
  const node = dataset.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new Error(`nothing survived import under the id ${id}`);
  return node;
}

function positioned(node: GraphNodeData): PositionedNode {
  const box = layout.nodes.find((candidate) => candidate.id === node.id);
  if (box === undefined) throw new Error(`layout produced no box for ${node.id}`);
  return box;
}

function warningsMentioning(fragment: string): string[] {
  return warnings.filter((warning) => warning.includes(fragment));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The node as it reached disk, where a prop no interface declares can still be looked at. */
function writtenNode(id: string): Record<string, unknown> {
  const entries: unknown[] = Array.isArray(imported.nodes) ? imported.nodes : [];
  for (const entry of entries) {
    if (isRecord(entry) && entry.id === id) return entry;
  }
  throw new Error(`nothing was written under the id ${id}`);
}

describe("a document full of things the renderer has never seen still imports", () => {
  test("raises nothing, and reports every departure against the path that held it", () => {
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((warning) => warning.startsWith("dataset."))).toBe(true);
  });

  test("keeps every node anything can point at", () => {
    expect(dataset.nodes.map((node) => node.id)).toEqual(ADDRESSABLE);
  });

  test("keeps top-level keys no reader knows, down to the bottom of the nesting", () => {
    expect(imported.schemaVersion).toBe(12);
    expect(imported.producedBy).toEqual(declared.producedBy);
    expect(imported.futureBlock).toEqual(declared.futureBlock);
  });

  test("keeps node props no reader knows, down to the bottom of the nesting", () => {
    expect(writtenNode("n-order").moodRing).toBe("teal");
    expect(writtenNode("n-order").provenanceOfTheDough).toEqual({
      mill: { name: "Kepez", grind: { coarseness: 4 } },
    });
    expect(writtenNode("n-deliver").routeHints).toEqual({
      stops: [{ district: "Moda", window: { from: "07:10", to: "07:40" } }],
    });
  });
});

describe("a known field of an unexpected shape costs that field and nothing more", () => {
  test("drops a list that arrived as a string, keeping the node around it", () => {
    const dough = nodeById("n-dough");
    expect("assets" in dough).toBe(false);
    expect("stateTransitions" in nodeById("n-proof")).toBe(false);
    expect(dough.name).toBe("Mix and knead");
    expect(dough.kind).toBe("mixing-stage");
    expect(dough.metadata?.role).toBe("back-of-house");
    expect(warningsMentioning("(n-dough).assets")).toEqual([
      'dataset.nodes[1] (n-dough).assets: ignored, expected an array, received "photos/dough.jpg"',
    ]);
  });

  test("drops an object that arrived as null, keeping the node around it", () => {
    expect("metadata" in nodeById("n-proof")).toBe(false);
    expect(nodeById("n-proof").name).toBe("Bulk proof");
    expect(warningsMentioning("(n-proof).metadata")).toEqual([
      "dataset.nodes[2] (n-proof).metadata: ignored, expected an object, received null",
    ]);
  });

  test("drops a number that arrived as a string, keeping the node around it", () => {
    expect("step" in nodeById("n-dough")).toBe(false);
    expect(warningsMentioning("(n-dough).step")).toHaveLength(1);
  });

  test("drops a string that arrived as a number or a list", () => {
    const cool = nodeById("n-cool");
    expect("kind" in cool).toBe(false);
    expect("status" in cool).toBe(false);
    expect(warningsMentioning("(n-cool).kind")).toHaveLength(1);
    expect(warningsMentioning("(n-cool).status")).toHaveLength(1);
  });

  test("drops the list entries the renderer cannot walk, keeping the recorded siblings", () => {
    const order = nodeById("n-order");
    expect(order.tools).toEqual([{ name: "till" }]);
    expect(order.badges).toEqual([{ label: "First of the day" }]);
    expect(warningsMentioning("(n-order).tools")).toEqual([
      "dataset.nodes[0] (n-order).tools: 1 of 2 ignored, each entry must be an object",
    ]);
    expect(warningsMentioning("(n-order).badges")).toEqual([
      "dataset.nodes[0] (n-order).badges: 1 of 2 ignored, each entry must be an object",
    ]);

    const edge = dataset.edges.find((candidate) => candidate.id === "e-order-dough");
    expect(edge?.exchanges).toEqual([{ id: "x-1" }]);
    expect(warningsMentioning("(e-order-dough).exchanges")).toEqual([
      "dataset.edges[0] (e-order-dough).exchanges: 1 of 2 ignored, each entry must be an object",
    ]);
  });

  test("drops an edge label that arrived as a list, keeping the edge", () => {
    const edge = dataset.edges.find((candidate) => candidate.id === "e-bake-cool");
    expect(edge?.kind).toBe("feeds");
    expect(edge !== undefined && "label" in edge).toBe(false);
  });
});

describe("what nothing can point at is left out and said out loud", () => {
  test("leaves out the node the document never gave an id", () => {
    expect(dataset.nodes.some((node) => node.name === "Ghost mixer")).toBe(false);
    expect(warningsMentioning("dataset.nodes[6]")).toEqual([
      "dataset.nodes[6]: ignored, a node needs a non-empty string id, received nothing",
    ]);
  });

  test("leaves out the second node claiming an id already taken", () => {
    expect(nodeById("n-dough").name).toBe("Mix and knead");
    expect(warningsMentioning("dataset.nodes[7]")).toEqual([
      'dataset.nodes[7]: ignored, node id "n-dough" already belongs to an earlier node',
    ]);
  });

  test("leaves out the edge that ends at a node nobody declared", () => {
    expect(dataset.edges.some((edge) => edge.target === "n-nightshift")).toBe(false);
    expect(warningsMentioning("dataset.edges[5]")).toEqual([
      'dataset.edges[5]: ignored, target "n-nightshift" matches no node in dataset.nodes',
    ]);
  });

  test("addresses the edge the document did not, rather than losing the relationship", () => {
    const promised = dataset.edges.find((edge) => edge.kind === "promises");
    expect(promised?.id).toBe("edge-6");
    expect(promised?.source).toBe("n-order");
    expect(promised?.target).toBe("n-deliver");
  });

  test("drops the region member nobody declared and keeps the region", () => {
    const sections = imported.sections;
    const kitchen = Array.isArray(sections) ? sections[0] : undefined;
    expect(kitchen).toEqual({
      id: "sec-kitchen",
      kind: "room",
      title: "Kitchen",
      nodeIds: ["n-dough", "n-proof", "n-bake"],
    });
  });
});

describe("a node the document never named is labelled by its own id", () => {
  test("names a node that carried no name at all", () => {
    expect(nodeById("n-bake").name).toBe("n-bake");
    expect(warningsMentioning("(n-bake).name")).toEqual([
      "dataset.nodes[3] (n-bake).name: absent, showing the node id instead",
    ]);
  });

  test("names a node whose name was not a string", () => {
    expect(nodeById("n-cool").name).toBe("n-cool");
    expect(warningsMentioning("(n-cool).name")[0]).toContain("received a number");
  });
});

describe("everything that survived actually draws", () => {
  test("every node gets a box with finite coordinates and real size", () => {
    expect(layout.nodes).toHaveLength(dataset.nodes.length);
    for (const node of dataset.nodes) {
      const box = positioned(node);
      expect(Number.isFinite(box.x)).toBe(true);
      expect(Number.isFinite(box.y)).toBe(true);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test("every edge that survived gets a drawable path", () => {
    expect(layout.edges).toHaveLength(dataset.edges.length);
    for (const edge of layout.edges) {
      expect(edge.path.startsWith("M")).toBe(true);
    }
  });

  test("every card renders, including the one whose kind was thrown away", () => {
    for (const node of dataset.nodes) {
      const html = renderToString(
        <NodeCard
          node={positioned(node)}
          isSelected={false}
          isFiltered={false}
          isCollapsed={false}
          onSelect={() => {}}
          onToggleCollapse={() => {}}
        />,
      );

      expect(html).toContain(node.name);
      expect(html).toContain(describeNodeKind(node).accent);
    }
  });

  test("an unfamiliar kind and an unfamiliar role each still read back as themselves", () => {
    const order = describeNodeKind(nodeById("n-order"));
    const deliver = describeNodeKind(nodeById("n-deliver"));
    expect(order.label.length).toBeGreaterThan(0);
    expect(order.accent).not.toBe(deliver.accent);
  });
});
