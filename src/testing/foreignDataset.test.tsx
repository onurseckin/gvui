/// <reference types="node" />

import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToString } from "react-dom/server";
import { importCapsule } from "../../scripts/import-capsule";
import {
  EDGE_KINDS,
  NODE_KINDS,
  NODE_ROLES,
  readSections,
  toGraphDataset,
} from "../state/graphSchema";
import type { GraphDataset, GraphNodeData, PositionedNode } from "../types/graphData";
import { describeNodeKind } from "../primitives/nodes/NodeCard/nodeKinds";
import { describeEdgeKind } from "../primitives/edges/GraphEdge/edgeKinds";
import { NodeCard } from "../primitives/nodes/NodeCard";
import { writeCapsule, type CapsuleFixture } from "./capsuleHarness";

/**
 * A graph from outside the orchestration world: an idea map about catching roof water, sketched by
 * someone who never heard of a wave, a gate or a repair round.
 *
 * It is here to hold the renderer to its wider promise. Every kind, role, edge kind and section
 * type in it is one gvui has never seen, so an assertion below only passes while unknown vocabulary
 * is a normal case. The day someone teaches the renderer that a node is either an implementer or a
 * validator, this file goes red.
 */
const FIXTURE_PATH = fileURLToPath(new URL("./fixtures/rainwater-idea-map.json", import.meta.url));
const GRAPH_ID = "rainwater-idea-map";

const declared = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as Record<string, unknown>;

let fixture: CapsuleFixture;
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
  imported = fixture.readWritten(GRAPH_ID) as Record<string, unknown>;
  dataset = toGraphDataset(result.dataset);

  const { computeCustomEngineGraphLayoutWasm } =
    await import("../engine/layout/custom/wasmLayoutAdapter");
  layout = await computeCustomEngineGraphLayoutWasm(dataset, undefined, "layered");
});

/** Compares vocabulary members by letters alone, so `open-question` matches `OPEN QUESTION`. */
function vocabToken(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function declaredKind(node: GraphNodeData): string {
  return String(node.kind);
}

function declaredRole(node: GraphNodeData): string | undefined {
  const role = node.metadata?.role;
  return typeof role === "string" ? role : undefined;
}

function nodeById(id: string): GraphNodeData {
  const node = dataset.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new Error(`fixture is missing node ${id}`);
  return node;
}

function positioned(node: GraphNodeData): PositionedNode {
  const box = layout.nodes.find((candidate) => candidate.id === node.id);
  if (box === undefined) throw new Error(`layout produced no box for ${node.id}`);
  return box;
}

/** The preset vocabularies, as plain strings: the point here is what the fixture avoids. */
const PRESET_NODE_KINDS = new Set<string>(NODE_KINDS);
const PRESET_EDGE_KINDS = new Set<string>(EDGE_KINDS);
const PRESET_NODE_ROLES = new Set<string>(NODE_ROLES);

describe("the foreign dataset speaks none of the orchestration vocabulary", () => {
  test("declares node kinds gvui has never seen", () => {
    const kinds = dataset.nodes.map(declaredKind);
    expect(kinds.filter((kind) => PRESET_NODE_KINDS.has(kind))).toEqual([]);
    expect(new Set(kinds).size).toBeGreaterThan(5);
  });

  test("declares edge kinds gvui has never seen", () => {
    const kinds = dataset.edges.map((edge) => String(edge.kind));
    expect(kinds.filter((kind) => PRESET_EDGE_KINDS.has(kind))).toEqual([]);
    expect(new Set(kinds).size).toBeGreaterThan(5);
  });

  test("declares roles gvui has never seen", () => {
    const roles = dataset.nodes.map(declaredRole).filter((role) => role !== undefined);
    expect(roles.filter((role) => PRESET_NODE_ROLES.has(role))).toEqual([]);
    expect(new Set(roles).size).toBeGreaterThan(2);
  });

  test("carries none of the execution-run props", () => {
    // These stay optional in the contract precisely so a graph like this one can omit them. A node
    // here that grew a `telemetry` block would mean the fixture had drifted back towards the
    // schema it exists to test against.
    const orchestrationOnly = ["scripts", "tools", "stateTransitions", "telemetry", "assets"];
    for (const node of dataset.nodes) {
      for (const prop of orchestrationOnly) {
        expect({ id: node.id, prop, present: prop in node }).toEqual({
          id: node.id,
          prop,
          present: false,
        });
      }
      expect(node.metadata?.findings).toBeUndefined();
    }
  });
});

describe("importing the foreign dataset", () => {
  test("raises no error", () => {
    expect(dataset.nodes).toHaveLength(18);
    expect(dataset.edges).toHaveLength(24);
  });

  test("writes it back exactly as declared, inventing nothing and dropping nothing", () => {
    expect(imported).toEqual(declared);
  });

  test("keeps metadata props that belong to no schema", () => {
    const seed = nodeById("n-seed");
    expect(seed.metadata?.confidence).toBe("hunch");
    expect(seed.metadata?.noticedOn).toBe("2026-02-11");
    expect(seed.metadata?.tags).toEqual(["water", "roof"]);
    expect(nodeById("n-option-cistern").metadata?.estimatedCostTry).toBe(48000);
    expect(nodeById("n-challenge-freeze").metadata?.raisedBy).toBe("Mert");
  });

  test("keeps sections, including the section type it invented", () => {
    const sections = readSections(imported);
    expect(sections.map((section) => section.id)).toEqual(["sec-water", "sec-money", "sec-people"]);

    const grouped = sections.flatMap((section) => section.nodeIds);
    expect(new Set(grouped).size).toBe(dataset.nodes.length);

    const rawSections = imported.sections;
    expect(
      Array.isArray(rawSections) ? rawSections.map((s) => (s as { kind: string }).kind) : [],
    ).toEqual(["theme", "theme", "theme"]);
  });
});

describe("every node and edge in the foreign dataset renders", () => {
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

  test("every edge gets a drawable path", () => {
    expect(layout.edges).toHaveLength(dataset.edges.length);
    for (const edge of layout.edges) {
      expect(edge.path.startsWith("M")).toBe(true);
    }
  });

  test("every card shows its own name, its own kind and its own accent", () => {
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
      expect(html).toContain(`kind-${declaredKind(node)}`);
      expect(html).toContain(describeNodeKind(node).accent);
    }
  });
});

/** The members that ended up sharing one colour, named so a failure points at the pair. */
function accentCollisions(accentByMember: ReadonlyMap<string, string>): string[] {
  const membersByAccent = new Map<string, string[]>();
  for (const [member, accent] of accentByMember) {
    membersByAccent.set(accent, [...(membersByAccent.get(accent) ?? []), member]);
  }
  return [...membersByAccent.values()]
    .filter((members) => members.length > 1)
    .map((members) => members.join(" + "));
}

describe("unknown vocabulary renders as itself, not as something familiar", () => {
  test("each unfamiliar node kind gets its own accent", () => {
    const withoutRole = dataset.nodes.filter((node) => declaredRole(node) === undefined);
    const accentByKind = new Map<string, string>();
    for (const node of withoutRole) {
      accentByKind.set(declaredKind(node), describeNodeKind(node).accent);
    }

    expect(accentByKind.size).toBeGreaterThan(5);
    expect(accentCollisions(accentByKind)).toEqual([]);
  });

  test("each unfamiliar node kind gets a label that reads back the kind", () => {
    // The failure this guards against is silent: an unknown kind drawn as a WORKER looks correct
    // and says something the dataset never said.
    for (const node of dataset.nodes.filter((n) => declaredRole(n) === undefined)) {
      const label = describeNodeKind(node).label;
      expect(label.length).toBeGreaterThan(0);
      expect(vocabToken(label)).toContain(vocabToken(declaredKind(node)));
    }
  });

  test("an unfamiliar role refines its kind rather than being discarded", () => {
    // Two stakeholders differ only by the role they were given; a renderer that ignores unknown
    // roles draws them identically and loses the only distinction the sketch made.
    const hulya = describeNodeKind(nodeById("n-stakeholder-hulya"));
    const mert = describeNodeKind(nodeById("n-stakeholder-mert"));
    expect(hulya.accent).not.toBe(mert.accent);

    const bareRisk = describeNodeKind(nodeById("n-risk-mosquito"));
    const roledRisk = describeNodeKind(nodeById("n-risk-permit"));
    expect(bareRisk.accent).not.toBe(roledRisk.accent);
  });

  test("an accent is stable across calls and across node objects", () => {
    for (const node of dataset.nodes) {
      const first = describeNodeKind(node).accent;
      expect(describeNodeKind(node).accent).toBe(first);
      expect(
        describeNodeKind({ kind: node.kind, metadata: node.metadata, telemetry: node.telemetry })
          .accent,
      ).toBe(first);
    }
  });

  test("each unfamiliar edge kind gets its own accent and its own label", () => {
    // Two relationships in one graph drawn in one colour is a rendering defect, and the fix belongs
    // in the accent generator rather than in this sketch: renaming an edge to dodge a colour clash
    // would leave the next dataset to discover it.
    const accentByKind = new Map<string, string>();

    for (const kind of new Set(dataset.edges.map((edge) => String(edge.kind)))) {
      const descriptor = describeEdgeKind(kind);
      accentByKind.set(kind, descriptor.accent);
      expect(vocabToken(descriptor.label)).toContain(vocabToken(kind));
    }

    expect(accentByKind.size).toBeGreaterThan(5);
    expect(accentCollisions(accentByKind)).toEqual([]);
  });

  test("an edge draws in its kind's colour, never in a neighbouring node's", () => {
    const supports = describeEdgeKind("supports");
    const contradicts = describeEdgeKind("contradicts");
    expect(supports.accent).not.toBe(contradicts.accent);
  });
});
