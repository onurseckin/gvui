import { describe, expect, test } from "bun:test";
import {
  aggregateRecordedCost,
  aggregateTokens,
  EDGE_KINDS,
  NODE_KINDS,
  NODE_ROLES,
  NODE_STATUSES,
  normalizeGraphDataset,
  readNodeTelemetry,
  readNodeTokenDetail,
  readSections,
  resolveNodeRole,
  ROLE_GROUPS,
  ROLE_LABELS,
  roleGroupOf,
  summarizeReviewActivity,
  validateGraphDataset,
  weakestEvidence,
  type JsonGraphDataset,
} from "./graphSchema";

// The retired field name this suite proves is no longer read, held as a value: the whole point of
// the taxonomy rule is that a product never names a symbol, retired or not.
const RETIRED_RUN_FIELD = "playwrightMetadata";

const minimalDataset = {
  id: "run-1",
  title: "Run 1",
  nodes: [{ id: "n1", name: "Node 1", kind: "agent" }],
  edges: [],
};

/** What survived validation, so a test reads what the renderer would get rather than the report. */
function accepted(value: unknown, sourceId?: string): JsonGraphDataset {
  const result = validateGraphDataset(value, sourceId === undefined ? {} : { sourceId });
  expect(result.errors).toEqual([]);
  const dataset = result.dataset;
  if (dataset === undefined) throw new Error(`unexpectedly rejected: ${result.errors.join("; ")}`);
  return dataset;
}

function firstNode(value: unknown): Record<string, unknown> {
  const node = accepted(value).nodes[0];
  if (node === undefined) throw new Error("no node survived validation");
  return node;
}

function warningsOf(value: unknown): string[] {
  return validateGraphDataset(value).warnings;
}

describe("validateGraphDataset hard-fails only on a document with no graph in it", () => {
  test("names what arrived instead of an object", () => {
    expect(validateGraphDataset([]).errors).toEqual([
      "dataset: expected a JSON object with nodes and edges arrays, received an array",
    ]);
    expect(validateGraphDataset(null).errors[0]).toContain("received null");
    expect(validateGraphDataset("{}").errors[0]).toContain('received "{}"');
    expect(validateGraphDataset(7).errors[0]).toContain("received a number");
    expect(validateGraphDataset(undefined).dataset).toBeUndefined();
  });

  test("refuses a document with no nodes array, naming the field and what it held", () => {
    const result = validateGraphDataset({ id: "run-1", title: "Run 1", edges: [] });
    expect(result.dataset).toBeUndefined();
    expect(result.errors).toEqual([
      "dataset.nodes: required, must be an array of node objects, received nothing",
    ]);
  });

  test("refuses a nodes value that is not an array", () => {
    const result = validateGraphDataset({ nodes: { n1: {} }, edges: [] });
    expect(result.dataset).toBeUndefined();
    expect(result.errors[0]).toContain("dataset.nodes: required, must be an array");
    expect(result.errors[0]).toContain("received an object");
  });

  test("refuses a document with no edges array and reports both skeleton faults at once", () => {
    const result = validateGraphDataset({ id: "run-1" });
    expect(result.dataset).toBeUndefined();
    expect(result.errors).toHaveLength(2);
    expect(result.errors[1]).toContain("dataset.edges: required, must be an array");
  });

  test("draws an empty graph rather than refusing one", () => {
    const dataset = accepted({ id: "run-1", title: "Run 1", nodes: [], edges: [] });
    expect(dataset.nodes).toEqual([]);
    expect(dataset.edges).toEqual([]);
  });
});

describe("validateGraphDataset ignores what it does not understand", () => {
  test("accepts a well-formed dataset without a word of complaint", () => {
    const result = validateGraphDataset(minimalDataset);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.dataset?.id).toBe("run-1");
  });

  test("carries top-level keys that belong to nobody's schema through untouched", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      weatherToday: "rainy",
      futureBlock: { schemaVersion: 9, nested: { deeper: [1, 2, { deepest: true }] } },
    });
    expect(result.warnings).toEqual([]);
    expect(result.dataset?.weatherToday).toBe("rainy");
    expect(result.dataset?.futureBlock).toEqual({
      schemaVersion: 9,
      nested: { deeper: [1, 2, { deepest: true }] },
    });
  });

  test("carries node and edge props no reader knows through untouched", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      nodes: [
        { id: "n1", name: "Node 1", moodRing: "teal", sensor: { calibration: { drift: 3 } } },
      ],
      edges: [{ id: "e1", source: "n1", target: "n1", thickness: "chunky" }],
    });
    expect(result.warnings).toEqual([]);
    expect(result.dataset?.nodes[0]?.moodRing).toBe("teal");
    expect(result.dataset?.nodes[0]?.sensor).toEqual({ calibration: { drift: 3 } });
    expect(result.dataset?.edges[0]?.thickness).toBe("chunky");
  });

  test("keeps a node whose known field arrived in a shape it cannot walk", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      nodes: [
        {
          id: "n1",
          name: "Node 1",
          kind: 42,
          assets: "a string where a list belongs",
          metadata: null,
          step: "third",
          keptAnyway: "yes",
        },
      ],
    });

    const node = result.dataset?.nodes[0];
    expect(node?.id).toBe("n1");
    expect(node?.name).toBe("Node 1");
    expect(node?.keptAnyway).toBe("yes");
    expect("kind" in (node ?? {})).toBe(false);
    expect("assets" in (node ?? {})).toBe(false);
    expect("metadata" in (node ?? {})).toBe(false);
    expect("step" in (node ?? {})).toBe(false);
    expect(result.warnings).toEqual([
      "dataset.nodes[0] (n1).kind: ignored, expected a string, received a number",
      'dataset.nodes[0] (n1).step: ignored, expected a finite number, received "third"',
      "dataset.nodes[0] (n1).metadata: ignored, expected an object, received null",
      'dataset.nodes[0] (n1).assets: ignored, expected an array, received "a string where a list belongs"',
    ]);
  });

  test("keeps an edge whose known field arrived in a shape it cannot walk", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      edges: [{ id: "e1", source: "n1", target: "n1", label: [], handoff: 3, weight: "heavy" }],
    });
    const edge = result.dataset?.edges[0];
    expect(edge?.id).toBe("e1");
    expect("label" in (edge ?? {})).toBe(false);
    expect("handoff" in (edge ?? {})).toBe(false);
    expect("weight" in (edge ?? {})).toBe(false);
    expect(result.warnings).toHaveLength(3);
  });

  test("prunes the list entries the renderer cannot walk and keeps the rest of the list", () => {
    // The render sites reach into these entries by name, so one unwalkable member would blank the
    // canvas; dropping the member alone keeps every recorded sibling drawable.
    const result = validateGraphDataset({
      ...minimalDataset,
      nodes: [
        {
          id: "n1",
          name: "Node 1",
          tools: [null, { name: "mixer" }, "hammer"],
          badges: [{ label: "hot" }],
          files: [3],
        },
      ],
      edges: [{ id: "e1", source: "n1", target: "n1", exchanges: [null, { id: "x1" }] }],
    });

    const node = result.dataset?.nodes[0];
    expect(node?.tools).toEqual([{ name: "mixer" }]);
    expect(node?.badges).toEqual([{ label: "hot" }]);
    expect(node?.files).toEqual([]);
    expect(result.dataset?.edges[0]?.exchanges).toEqual([{ id: "x1" }]);
    expect(result.warnings).toEqual([
      "dataset.nodes[0] (n1).tools: 2 of 3 ignored, each entry must be an object",
      "dataset.nodes[0] (n1).files: 1 of 1 ignored, each entry must be an object",
      "dataset.edges[0] (e1).exchanges: 1 of 2 ignored, each entry must be an object",
    ]);
  });

  test("prunes every list the renderer reaches into by name", () => {
    const lists = [
      "badges",
      "tools",
      "scripts",
      "stateTransitions",
      "assets",
      "browserTests",
      "files",
      "timeline",
      "events",
    ];
    for (const field of lists) {
      const result = validateGraphDataset({
        ...minimalDataset,
        nodes: [{ id: "n1", name: "Node 1", [field]: [null, { keep: true }] }],
      });
      expect(result.dataset?.nodes[0]?.[field]).toEqual([{ keep: true }]);
      expect(result.warnings).toEqual([
        `dataset.nodes[0] (n1).${field}: 1 of 2 ignored, each entry must be an object`,
      ]);
    }
  });

  test("leaves a list whose every entry it can walk exactly as it arrived", () => {
    const tools = [{ name: "mixer" }, { name: "oven" }];
    const node = { id: "n1", name: "Node 1", tools };
    const result = validateGraphDataset({ ...minimalDataset, nodes: [node] });
    expect(result.warnings).toEqual([]);
    expect(result.dataset?.nodes[0]).toBe(node);
    expect(result.dataset?.nodes[0]?.tools).toBe(tools);
  });

  test("leaves an entry it had nothing to drop as the very object it was handed", () => {
    // Identity, not equality: the pass must not clone a clean dataset into a second shape.
    const node = { id: "n1", name: "Node 1", kind: "agent" };
    expect(accepted({ ...minimalDataset, nodes: [node] }).nodes[0]).toBe(node);
  });

  test("warns on an unrecognised vocabulary member and renders it anyway", () => {
    const result = validateGraphDataset({
      id: "run-2",
      title: "Run 2",
      nodes: [{ id: "n1", name: "Node 1", kind: "supervisor", status: "melting" }],
      edges: [{ id: "e1", source: "n1", target: "n1", kind: "telepathy" }],
    });

    expect(result.dataset?.nodes[0]?.kind).toBe("supervisor");
    expect(result.dataset?.edges[0]?.kind).toBe("telepathy");
    expect(result.warnings[0]).toContain('dataset.nodes[0] (n1).kind: "supervisor" is not a known');
    expect(result.warnings[1]).toContain('dataset.nodes[0] (n1).status: "melting" is not a known');
    expect(result.warnings[2]).toContain('dataset.edges[0] (e1).kind: "telepathy" is not a known');
  });

  test("accepts every edge kind the producer emits", () => {
    // Driven off EDGE_KINDS itself so a kind added to the contract cannot quietly go unvalidated.
    expect(EDGE_KINDS.length).toBe(19);
    const result = validateGraphDataset({
      ...minimalDataset,
      edges: EDGE_KINDS.map((kind) => ({ id: `e-${kind}`, source: "n1", target: "n1", kind })),
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  test("accepts every node kind and status the producer emits", () => {
    for (const kind of NODE_KINDS) {
      expect(
        validateGraphDataset({ ...minimalDataset, nodes: [{ id: "n1", name: "Node 1", kind }] })
          .warnings,
      ).toEqual([]);
    }
    for (const status of NODE_STATUSES) {
      expect(
        validateGraphDataset({
          ...minimalDataset,
          nodes: [{ id: "n1", name: "Node 1", kind: "agent", status }],
        }).warnings,
      ).toEqual([]);
    }
  });
});

describe("validateGraphDataset drops only what nothing can point at", () => {
  test("skips a node with no usable id and keeps its neighbours", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      nodes: [
        { name: "Nameless" },
        { id: "  ", name: "Blank" },
        { id: null },
        minimalDataset.nodes[0],
      ],
    });

    expect(result.dataset?.nodes.map((node) => node.id)).toEqual(["n1"]);
    expect(result.warnings).toEqual([
      "dataset.nodes[0]: ignored, a node needs a non-empty string id, received nothing",
      'dataset.nodes[1]: ignored, a node needs a non-empty string id, received "  "',
      "dataset.nodes[2]: ignored, a node needs a non-empty string id, received null",
    ]);
  });

  test("skips an entry in the nodes array that is not an object", () => {
    const result = validateGraphDataset({ ...minimalDataset, nodes: ["n1", 3, null, []] });
    expect(result.dataset?.nodes).toEqual([]);
    expect(result.warnings[0]).toBe('dataset.nodes[0]: ignored, expected an object, received "n1"');
    expect(result.warnings[3]).toBe(
      "dataset.nodes[3]: ignored, expected an object, received an array",
    );
  });

  test("keeps the first node holding an id and skips the second claim on it", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      nodes: [
        { id: "n1", name: "First" },
        { id: "n1", name: "Second" },
      ],
    });
    expect(result.dataset?.nodes.map((node) => node.name)).toEqual(["First"]);
    expect(result.warnings).toEqual([
      'dataset.nodes[1]: ignored, node id "n1" already belongs to an earlier node',
    ]);
  });

  test("labels a node the document never named with its own id", () => {
    expect(firstNode({ ...minimalDataset, nodes: [{ id: "n1" }] }).name).toBe("n1");
    expect(warningsOf({ ...minimalDataset, nodes: [{ id: "n1" }] })).toEqual([
      "dataset.nodes[0] (n1).name: absent, showing the node id instead",
    ]);
  });

  test("labels a node whose name is not a string with its own id", () => {
    expect(firstNode({ ...minimalDataset, nodes: [{ id: "n1", name: 42 }] }).name).toBe("n1");
    expect(warningsOf({ ...minimalDataset, nodes: [{ id: "n1", name: 42 }] })[0]).toBe(
      "dataset.nodes[0] (n1).name: ignored, expected a non-empty string, received a number; " +
        "showing the node id instead",
    );
  });

  test("skips an edge that points at a node the document never declared", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      edges: [
        { id: "e1", source: "n1", target: "ghost" },
        { id: "e2", source: "phantom", target: "n1" },
        { id: "e3", source: "n1", target: "n1" },
      ],
    });

    expect(result.dataset?.edges.map((edge) => edge.id)).toEqual(["e3"]);
    expect(result.warnings).toEqual([
      'dataset.edges[0]: ignored, target "ghost" matches no node in dataset.nodes',
      'dataset.edges[1]: ignored, source "phantom" matches no node in dataset.nodes',
    ]);
  });

  test("reports both ends of an edge that names neither", () => {
    const result = validateGraphDataset({ ...minimalDataset, edges: [{ id: "e1", source: 7 }] });
    expect(result.dataset?.edges).toEqual([]);
    expect(result.warnings).toEqual([
      "dataset.edges[0]: ignored, source must be a non-empty node id, received a number",
      "dataset.edges[0]: ignored, target must be a non-empty node id, received nothing",
    ]);
  });

  test("skips an entry in the edges array that is not an object", () => {
    const result = validateGraphDataset({ ...minimalDataset, edges: [true] });
    expect(result.dataset?.edges).toEqual([]);
    expect(result.warnings).toEqual([
      "dataset.edges[0]: ignored, expected an object, received a boolean",
    ]);
  });

  test("addresses an edge the document did not, by where it sits", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      edges: [{ source: "n1", target: "n1" }],
    });
    expect(result.dataset?.edges[0]?.id).toBe("edge-0");
    expect(result.warnings).toEqual([
      "dataset.edges[0].id: ignored, expected a non-empty string, received nothing; " +
        'addressing this edge as "edge-0"',
    ]);
  });

  test("addresses an edge whose id was not a string", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      edges: [{ id: 9, source: "n1", target: "n1" }],
    });
    expect(result.dataset?.edges[0]?.id).toBe("edge-0");
    expect(result.warnings[0]).toContain("received a number");
  });

  test("re-addresses a second edge claiming an id rather than losing the relationship", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      edges: [
        { id: "e1", source: "n1", target: "n1", kind: "handoff" },
        { id: "e1", source: "n1", target: "n1", kind: "dependency" },
      ],
    });
    expect(result.dataset?.edges.map((edge) => edge.id)).toEqual(["e1", "edge-1"]);
    expect(result.dataset?.edges[1]?.kind).toBe("dependency");
    expect(result.warnings[0]).toBe(
      'dataset.edges[1].id: "e1" already belongs to an earlier edge, addressing this one as "edge-1"',
    );
  });

  test("steps past a positional handle another edge already answers to", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      edges: [
        { id: "edge-1", source: "n1", target: "n1" },
        { source: "n1", target: "n1" },
      ],
    });
    expect(result.dataset?.edges.map((edge) => edge.id)).toEqual(["edge-1", "edge-1-2"]);
  });
});

describe("validateGraphDataset names a graph that did not name itself", () => {
  test("uses the source the caller read the document from", () => {
    const result = validateGraphDataset({ nodes: [], edges: [] }, { sourceId: "capsule-7" });
    expect(result.dataset?.id).toBe("capsule-7");
    expect(result.dataset?.title).toBe("capsule-7");
    expect(result.warnings).toEqual([
      'dataset.id: absent, naming the graph "capsule-7" after the source it was read from',
      "dataset.title: absent, falling back to dataset.id",
    ]);
  });

  test("leaves the graph unnamed rather than inventing a name for it", () => {
    const result = validateGraphDataset({ nodes: [], edges: [] });
    expect(result.dataset?.id).toBe("");
    expect(result.warnings[0]).toBe(
      "dataset.id: absent, and the caller named no source, so the graph is left unnamed",
    );
  });

  test("ignores an id or title of the wrong type and says so", () => {
    const result = validateGraphDataset(
      { id: 12, title: [], nodes: [], edges: [] },
      {
        sourceId: "capsule-7",
      },
    );
    expect(result.dataset?.id).toBe("capsule-7");
    expect(result.warnings[0]).toBe(
      "dataset.id: ignored, expected a non-empty string, received a number",
    );
    expect(result.warnings[2]).toBe(
      "dataset.title: ignored, expected a non-empty string, received an array",
    );
  });

  test("falls back to the declared id when only the title is missing", () => {
    const result = validateGraphDataset({ id: "run-1", nodes: [], edges: [] });
    expect(result.dataset?.title).toBe("run-1");
    expect(result.warnings).toEqual(["dataset.title: absent, falling back to dataset.id"]);
  });
});

describe("validateGraphDataset keeps regions pointing at nodes that exist", () => {
  test("drops a member id nothing answers to and keeps the region", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      sections: [{ id: "sec-1", title: "Region", kind: "theme", nodeIds: ["n1", "ghost", 7] }],
    });

    expect(readSections(result.dataset)).toEqual([
      { id: "sec-1", title: "Region", nodeIds: ["n1"] },
    ]);
    expect(result.warnings).toEqual([
      "dataset.sections[0] (sec-1).nodeIds: 2 of 3 ignored, matching no node in dataset.nodes",
    ]);
  });

  test("keeps the section props that belong to no schema", () => {
    const sections = accepted({
      ...minimalDataset,
      sections: [{ id: "sec-1", title: "Region", kind: "theme", nodeIds: ["n1", "ghost"] }],
    }).sections;
    expect(Array.isArray(sections) ? sections[0] : undefined).toEqual({
      id: "sec-1",
      title: "Region",
      kind: "theme",
      nodeIds: ["n1"],
    });
  });

  test("leaves a clean sections array as the array it was handed", () => {
    const sections = [{ id: "sec-1", title: "Region", nodeIds: ["n1"] }];
    expect(accepted({ ...minimalDataset, sections }).sections).toBe(sections);
  });

  test("drops a sections value it cannot iterate", () => {
    const result = validateGraphDataset({ ...minimalDataset, sections: "sec-1" });
    expect("sections" in (result.dataset ?? {})).toBe(false);
    expect(result.warnings).toEqual([
      'dataset.sections: ignored, expected an array, received "sec-1"',
    ]);
  });

  test("drops a section entry that is not an object, and a member list that is not a list", () => {
    const result = validateGraphDataset({
      ...minimalDataset,
      sections: [null, { id: "sec-1", nodeIds: "n1" }],
    });
    expect(readSections(result.dataset).map((section) => section.id)).toEqual(["sec-1"]);
    expect(result.warnings).toEqual([
      "dataset.sections[0]: ignored, expected an object, received null",
      'dataset.sections[1] (sec-1).nodeIds: ignored, expected an array, received "n1"',
    ]);
  });
});

describe("normalizeGraphDataset", () => {
  const retiredSpellings: JsonGraphDataset = {
    id: "retired-run",
    title: "Retired Run",
    nodes: [
      {
        id: "n1",
        name: "Worker",
        kind: "agent",
        model: "some-model",
        harnessModel: "some-harness-model",
        tier: "M",
        mediaAssets: [{ id: "a1", type: "image", url: "/a1.png" }],
        screenshots: [{ id: "a2", type: "image", url: "/a2.png" }],
        metadata: {
          role: "worker",
          assets: [{ id: "a3", type: "image", url: "/a3.png" }],
          mediaAssets: [{ id: "a4", type: "image", url: "/a4.png" }],
          screenshots: [{ id: "a5", type: "image", url: "/a5.png" }],
          [RETIRED_RUN_FIELD]: { screenshots: [{ id: "a6", type: "image", url: "/a6.png" }] },
        },
      },
    ],
    edges: [],
  };

  test("takes evidence from node.assets and from no other spelling of it", () => {
    const node = normalizeGraphDataset(retiredSpellings).nodes[0]!;
    expect(node.assets).toBeUndefined();
  });

  test("leaves node.assets exactly as the dataset recorded it", () => {
    const assets = [
      { id: "a1", type: "image", url: "/a1.png" },
      { id: "a2", type: "image", url: "/a2.png" },
    ];
    const node = normalizeGraphDataset({
      ...retiredSpellings,
      nodes: [{ id: "n1", name: "Worker", assets }],
    }).nodes[0]!;
    expect(node.assets).toEqual(assets);
  });

  test("takes model and tier from telemetry and from no other spelling of them", () => {
    const node = normalizeGraphDataset(retiredSpellings).nodes[0]!;
    expect(node.telemetry).toEqual({ role: "implementer" });
  });

  test("lifts a host agent's model and tier in as stated, with no provenance claimed", () => {
    const node = normalizeGraphDataset({
      ...retiredSpellings,
      nodes: [{ id: "n1", name: "Worker", hostAgent: { model: "host-model", tier: "L" } }],
    }).nodes[0]!;
    expect(node.telemetry).toEqual({
      model: { value: "host-model", evidence_class: "unknown" },
      modelTier: { value: "l", evidence_class: "unknown" },
    });
  });

  test("lifts recorded metric tokens in under the provenance the metrics record stated", () => {
    const node = normalizeGraphDataset({
      ...retiredSpellings,
      nodes: [
        {
          id: "n1",
          name: "Worker",
          metrics: {
            tokensIn: 100,
            tokensOut: 20,
            tokens: { evidenceClass: "derived", isEstimated: true },
          },
        },
      ],
    }).nodes[0]!;
    expect(node.telemetry).toEqual({
      tokensIn: { value: 100, evidence_class: "derived", is_estimated: true },
      tokensOut: { value: 20, evidence_class: "derived", is_estimated: true },
    });
  });

  test("labels a metrics token count that stated no provenance as unknown", () => {
    const node = normalizeGraphDataset({
      ...retiredSpellings,
      nodes: [{ id: "n1", name: "Worker", metrics: { tokens: { inputTokens: 7 } } }],
    }).nodes[0]!;
    expect(node.telemetry).toEqual({ tokensIn: { value: 7, evidence_class: "unknown" } });
  });

  test("leaves a role implied by the node kind out of the data", () => {
    const node = normalizeGraphDataset({
      ...retiredSpellings,
      nodes: [{ id: "n1", name: "Gate", kind: "gate" }],
    }).nodes[0]!;
    expect(node.telemetry).toBeUndefined();
    expect(resolveNodeRole(node)).toEqual({ role: "validator", declared: false });
  });

  test("is idempotent and never weakens a recorded evidence class", () => {
    const once = normalizeGraphDataset({
      ...retiredSpellings,
      nodes: [
        {
          id: "n1",
          name: "Worker",
          hostAgent: { model: "host-model" },
          telemetry: { model: { value: "recorded-model", evidence_class: "host_reported" } },
        },
      ],
    });
    const twice = normalizeGraphDataset(once);
    expect(twice).toEqual(once);
    expect(once.nodes[0]!.telemetry).toEqual({
      model: { value: "recorded-model", evidence_class: "host_reported" },
    });
  });
});

describe("readNodeTokenDetail", () => {
  test("reads the counts the metrics record carries", () => {
    expect(
      readNodeTokenDetail({
        metrics: {
          tokens: {
            reasoningTokens: 30,
            cacheReadTokens: 40,
            cacheCreationTokens: 50,
            totalTokens: 120,
          },
        },
      }),
    ).toEqual({ reasoning: 30, cacheRead: 40, cacheWrite: 50, total: 120 });
  });

  test("takes counts from metrics and from no other spelling of them", () => {
    expect(
      readNodeTokenDetail({ metadata: { tokens: { reasoningTokens: 30, totalTokens: 120 } } }),
    ).toEqual({});
  });

  test("leaves a count nothing recorded absent rather than reporting it as zero", () => {
    expect(readNodeTokenDetail({ id: "n1" })).toEqual({});
    expect(readNodeTokenDetail(undefined)).toEqual({});
  });

  test("keeps a recorded zero, which is a measurement and not an absence", () => {
    expect(readNodeTokenDetail({ metrics: { tokens: { reasoningTokens: 0 } } })).toEqual({
      reasoning: 0,
    });
  });
});

describe("readNodeTelemetry", () => {
  test("reads the evidenced field and never a retired flat spelling of it", () => {
    const telemetry = readNodeTelemetry({
      model: "flat-model",
      telemetry: { model: { value: "recorded-model", evidence_class: "host_reported" } },
    });
    expect(telemetry.model).toEqual({ value: "recorded-model", evidence_class: "host_reported" });
    expect(
      readNodeTelemetry({ model: "flat-model", harnessModel: "flat-harness" }).model,
    ).toBeUndefined();
    expect(readNodeTelemetry({ tier: "l" }).modelTier).toBeUndefined();
    expect(readNodeTelemetry({ metadata: { model: "meta-model" } }).model).toBeUndefined();
  });

  test("leaves a model the run never reported absent", () => {
    expect(readNodeTelemetry({ id: "n1", name: "Node" }).model).toBeUndefined();
    expect(readNodeTelemetry(undefined).model).toBeUndefined();
  });

  test("keeps the estimate flag on an estimated token count", () => {
    const telemetry = readNodeTelemetry({
      telemetry: { tokensIn: { value: 10, evidence_class: "derived", is_estimated: true } },
    });
    expect(telemetry.tokensIn).toEqual({
      value: 10,
      evidence_class: "derived",
      is_estimated: true,
    });
  });
});

describe("aggregates", () => {
  test("counts only the nodes that reported tokens", () => {
    const totals = aggregateTokens({
      nodes: [
        { telemetry: { tokensIn: { value: 10, evidence_class: "host_reported" } } },
        { id: "silent" },
      ],
    });
    expect(totals.tokensIn).toBe(10);
    expect(totals.reportingNodes).toBe(1);
    expect(totals.totalNodes).toBe(2);
  });

  test("returns no cost at all when nothing recorded one", () => {
    expect(aggregateRecordedCost({ nodes: [{ id: "n1" }] })).toBeUndefined();
    expect(aggregateRecordedCost({ nodes: [{ metrics: { costUsd: 0.5 } }] })).toEqual({
      total: 0.5,
      reportingNodes: 1,
    });
  });

  test("weakest evidence wins over an aggregate", () => {
    expect(weakestEvidence(["harness_observed", "derived", "host_reported"])).toBe("derived");
    expect(weakestEvidence([])).toBeUndefined();
  });
});

describe("summarizeReviewActivity", () => {
  test("counts probes apart from pushbacks", () => {
    const summary = summarizeReviewActivity({
      nodes: [
        {
          stateTransitions: [
            { verdict: "probe", round: 1, evidence_class: "harness_observed" },
            { verdict: "probe", round: 2, evidence_class: "harness_observed" },
            { verdict: "reject", round: 1, evidence_class: "harness_observed" },
          ],
          metadata: {
            findings: [{ class: "probe_demand" }, { class: "defect" }, { class: "defect" }],
          },
        },
      ],
      edges: [{ kind: "probe" }, { kind: "pushback" }],
    });

    expect(summary).toEqual({
      probeRounds: 2,
      pushbackRounds: 1,
      probeEdges: 1,
      pushbackEdges: 1,
      probeDemands: 1,
      defects: 2,
      nodesProbed: 1,
      nodesPushedBack: 1,
      hasRecord: true,
    });
  });

  test("reports no record rather than zero rounds when nothing was reviewed", () => {
    expect(summarizeReviewActivity({ nodes: [{ id: "n1" }], edges: [] }).hasRecord).toBe(false);
  });
});

describe("readSections", () => {
  test("reads the branch reason, parent and status the producer recorded", () => {
    expect(
      readSections({
        sections: [
          {
            id: "sec-1",
            title: "Branch B-1",
            nodeIds: ["n1", 7],
            reason: "scope split",
            parentNodeId: "n0",
            status: "collected",
          },
          { title: "no id" },
        ],
      }),
    ).toEqual([
      {
        id: "sec-1",
        title: "Branch B-1",
        nodeIds: ["n1"],
        reason: "scope split",
        parentNodeId: "n0",
        status: "collected",
      },
    ]);
  });
});

describe("the five domain validators", () => {
  // The producer's own role-file names (roles/validator-<domain>.md), not gvui's invention: each
  // domain checks something different, through different evidence, so each keeps its own node
  // identity instead of collapsing into the one generic "validator" every domain used to share.
  const DOMAIN_VALIDATOR_ROLES = [
    "validator-code-quality",
    "validator-product",
    "validator-security",
    "validator-system-design",
    "validator-ui-design",
  ] as const;

  test("resolveNodeRole reads a domain validator recorded in metadata.role as declared", () => {
    for (const role of DOMAIN_VALIDATOR_ROLES) {
      const node = { id: "n1", kind: "agent", metadata: { role } };
      expect(resolveNodeRole(node)).toEqual({ role, declared: true });
    }
  });

  test("resolveNodeRole reads a domain validator recorded in telemetry.role as declared", () => {
    for (const role of DOMAIN_VALIDATOR_ROLES) {
      const node = { id: "n1", kind: "agent", telemetry: { role } };
      expect(resolveNodeRole(node)).toEqual({ role, declared: true });
    }
  });

  test("every domain validator groups under the same coarse Validators bucket as validator and plan-validator", () => {
    for (const role of DOMAIN_VALIDATOR_ROLES) {
      expect(roleGroupOf(role)).toBe("validator");
    }
    expect(roleGroupOf("validator")).toBe("validator");
    expect(roleGroupOf("plan-validator")).toBe("validator");
  });

  test("each domain validator gets its own human-meaningful label, none of them the bare word Validator", () => {
    expect(ROLE_LABELS["validator-code-quality"]).toBe("Code Quality Validator");
    expect(ROLE_LABELS["validator-product"]).toBe("Product Validator");
    expect(ROLE_LABELS["validator-security"]).toBe("Security Validator");
    expect(ROLE_LABELS["validator-system-design"]).toBe("System Design Validator");
    expect(ROLE_LABELS["validator-ui-design"]).toBe("UI Design Validator");

    for (const role of DOMAIN_VALIDATOR_ROLES) {
      expect(ROLE_LABELS[role]).not.toBe(ROLE_LABELS.validator);
    }
  });

  test("declares exactly the producer's 15-member role vocabulary", () => {
    expect([...NODE_ROLES].sort()).toEqual([
      "completeness-critic",
      "coordinator",
      "implementer",
      "plan-validator",
      "planner",
      "repairer",
      "sub-implementer",
      "sub-investigator",
      "sub-validator",
      "validator",
      "validator-code-quality",
      "validator-product",
      "validator-security",
      "validator-system-design",
      "validator-ui-design",
    ]);
  });

  test("every declared role has its own label and belongs to a real role group, and no two roles share a label", () => {
    const labels = new Set<string>();
    for (const role of NODE_ROLES) {
      const label = ROLE_LABELS[role];
      expect(label.length).toBeGreaterThan(0);
      expect(labels.has(label)).toBe(false);
      labels.add(label);
      expect(ROLE_GROUPS).toContain(roleGroupOf(role));
    }
  });
});

describe("tolerance for a role this renderer has never seen", () => {
  test("an invented role in metadata.role never throws and never fabricates a role the run did not declare", () => {
    const node = { id: "n1", kind: "tool", metadata: { role: "validator-chaos-engineering" } };
    expect(() => resolveNodeRole(node)).not.toThrow();
    // "tool" implies nothing, and the invented spelling matches no known alias, so the run's own
    // (unrecognised) role is left for the raw-role UI path rather than guessed at here.
    expect(resolveNodeRole(node)).toBeUndefined();
  });

  test("an invented role in telemetry.role falls back to what the node's kind implies, never throws, and is flagged as inferred rather than recorded", () => {
    const node = { id: "n1", kind: "agent", telemetry: { role: "validator-chaos-engineering" } };
    expect(() => resolveNodeRole(node)).not.toThrow();
    expect(resolveNodeRole(node)).toEqual({ role: "implementer", declared: false });
  });

  test("roleGroupOf and ROLE_LABELS resolve every real NODE_ROLES member without throwing", () => {
    for (const role of NODE_ROLES) {
      expect(() => roleGroupOf(role)).not.toThrow();
      expect(() => ROLE_LABELS[role]).not.toThrow();
    }
  });
});
