import { afterEach, describe, expect, test } from "bun:test";
import * as bunTest from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

interface ModuleMocker {
  module(id: string, factory: () => unknown): void | Promise<void>;
}

const mock = (bunTest as unknown as { mock: ModuleMocker }).mock;

mock.module("@tanstack/react-router", () => ({
  useNavigate: () => () => Promise.resolve(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { useGraphStore } from "../../state/useGraphStore";
import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import { NodeDetailDrawer } from "../NodeDetailDrawer";
import {
  Sidebar,
  SidebarNodeProperties,
  SidebarNodeStatus,
  SidebarRoleBreakdown,
  SidebarVocabulary,
  describeDatasetFacets,
} from "../Sidebar";

/**
 * A graph from outside the orchestration world: an idea map about catching roof water. Every kind,
 * role, status, edge kind and property in it is one this renderer has never seen, so the panels can
 * only pass by surfacing what the nodes actually carry — and by inventing nothing where the sketch
 * says nothing.
 */
const foreignDataset: GraphDataset = {
  id: "rainwater-sketch",
  title: "Rainwater for the block",
  sections: [
    {
      id: "sec-water",
      title: "Water in, water out",
      description: "Supply, demand and the pipes between them",
      nodeIds: ["n-seed", "n-rainfall"],
    },
  ],
  nodes: [
    {
      id: "n-seed",
      name: "The roof throws away every drop",
      kind: "premise",
      description: "140 m² of bitumen sheds straight into the storm drain.",
      metadata: {
        role: "me",
        confidence: "hunch",
        noticedOn: "2026-02-11",
        tags: ["water", "roof"],
      },
    },
    {
      id: "n-rainfall",
      name: "810 mm a year, mostly November to March",
      kind: "observation",
      status: "success",
      metadata: {
        confidence: "measured",
        source: { station: "Kandilli", years: 30 },
        referenceUrl: "https://example.org/istanbul-rainfall",
      },
    },
    {
      id: "n-risk",
      name: "A winter-only tank is a winter-only toy",
      kind: "risk",
      status: "unresolved",
      metadata: {
        role: "devils-advocate",
        raisedBy: "the neighbour on the third floor",
        estimatedCostTry: 60000,
        blocking: true,
        mitigation: null,
      },
    },
    {
      id: "n-decision",
      name: "Try one tank on the north downpipe",
      kind: "decision",
      metadata: { role: "building-manager", tags: ["money"] },
    },
  ],
  edges: [
    { id: "e-1", source: "n-seed", target: "n-rainfall", kind: "sparked-by" },
    { id: "e-2", source: "n-rainfall", target: "n-decision", kind: "supports" },
    { id: "e-3", source: "n-risk", target: "n-decision", kind: "contradicts" },
  ],
};

/** A node from the orchestration producer, kept alongside to prove nothing was traded away. */
const orchestrationNode: GraphNodeData = {
  id: "node-task-t01",
  name: "Implementer: sidebar generality",
  kind: "agent",
  status: "success",
  telemetry: {
    role: "implementer",
    agentId: "impl-t01",
    model: { value: "claude-opus-5", evidence_class: "host_reported" },
    tokensIn: { value: 4200, evidence_class: "harness_observed" },
  },
  scripts: [
    {
      commandId: "C-01",
      argv: ["bun", "test", "src/components"],
      exitCode: 0,
      startedAt: "2026-08-19T10:00:00.000Z",
      evidence_class: "harness_observed",
    },
  ],
  tools: [{ name: "Bash", evidence_class: "host_reported" }],
  stateTransitions: [
    {
      at: "2026-08-19T09:00:00.000Z",
      actor: "coordinator",
      from: "pending",
      to: "claimed",
      reason: "lease granted",
      attempt: 1,
      evidence_class: "harness_observed",
    },
  ],
};

const orchestrationDataset: GraphDataset = {
  id: "orchestration-run",
  title: "Orchestration Run",
  nodes: [orchestrationNode],
  edges: [],
};

function renderJson(element: Parameters<typeof create>[0]): {
  root: ReactTestRenderer["root"];
  json: () => string;
  unmount: () => void;
} {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(element);
  });
  return {
    root: renderer.root,
    json: () => JSON.stringify(renderer.toJSON()),
    unmount: () => act(() => renderer.unmount()),
  };
}

function selectNode(dataset: GraphDataset, nodeId: string): void {
  act(() => {
    useGraphStore.setState({ dataset, selectedNodeId: nodeId });
  });
}

afterEach(() => {
  act(() => {
    useGraphStore.setState({ dataset: null, selectedNodeId: null });
  });
});

describe("the sidebar reads a graph that speaks none of the orchestration vocabulary", () => {
  test("offers only the breakdowns this dataset has something behind", () => {
    const facets = describeDatasetFacets(foreignDataset);
    expect(facets.hasRoles).toBe(true);
    expect(facets.hasRegions).toBe(true);
    expect(facets.hasGenericFields).toBe(true);
    expect(facets.hasReviewActivity).toBe(false);
    expect(facets.hasTokens).toBe(false);
    expect(facets.hasModels).toBe(false);

    selectNode(foreignDataset, "n-seed");
    const { root, unmount } = renderJson(
      <Sidebar currentFile="rainwater.json" onSelectSample={() => {}} />,
    );

    for (const absent of [
      "sidebar-review-rounds",
      "token-footprint-breakdown",
      "sidebar-model-breakdown",
    ]) {
      expect(root.findAllByProps({ "data-testid": absent }).length).toBe(0);
    }
    for (const present of [
      "sidebar-vocabulary",
      "sidebar-role-breakdown",
      "sidebar-section-breakdown",
      "sidebar-node-status",
      "sidebar-node-properties",
    ]) {
      expect(root.findByProps({ "data-testid": present })).toBeDefined();
    }

    unmount();
  });

  test("names every kind and edge kind the graph uses, in the graph's own words", () => {
    const { root, json, unmount } = renderJson(<SidebarVocabulary dataset={foreignDataset} />);

    const accents = new Set<string>();
    for (const kind of ["premise", "observation", "risk", "decision"]) {
      const chip = root.findByProps({ "data-testid": `vocabulary-kind-${kind}` });
      expect(String(chip.props.className)).toContain("is-custom");
      accents.add(String(chip.findByProps({ className: "open-vocab-dot" }).props.style.background));
    }
    // A generated accent is derived from the member's own name, so four kinds get four colours.
    expect(accents.size).toBe(4);

    for (const edgeKind of ["sparked-by", "supports", "contradicts"]) {
      expect(root.findByProps({ "data-testid": `vocabulary-edge-kind-${edgeKind}` })).toBeDefined();
    }

    const rendered = json();
    expect(rendered).toContain("PREMISE");
    expect(rendered).toContain("DECISION");
    // None of these nodes is a worker, and none may be drawn as one.
    expect(rendered).not.toContain("WORKER");

    unmount();
  });

  test("keeps this graph's own roles instead of collapsing them into unknown", () => {
    const { root, json, unmount } = renderJson(<SidebarRoleBreakdown dataset={foreignDataset} />);
    const rendered = json();

    expect(root.findByProps({ "data-testid": "role-group-other" })).toBeDefined();
    for (const role of ["me", "devils-advocate", "building-manager"]) {
      expect(root.findByProps({ "data-testid": `role-chip-${role}` })).toBeDefined();
    }
    expect(rendered).toContain("Building Manager");
    // The one node with no role at all is the only unknown here.
    expect(root.findByProps({ "data-testid": "role-group-count-unknown" }).children).toEqual(["1"]);

    unmount();
  });

  test("buckets an unfamiliar status as itself and a missing one as unknown", () => {
    const { root, unmount } = renderJson(<SidebarNodeStatus dataset={foreignDataset} />);

    expect(root.findByProps({ "data-testid": "status-item-unresolved" })).toBeDefined();
    expect(root.findByProps({ "data-testid": "status-count-unresolved" }).children).toEqual(["1"]);
    expect(root.findByProps({ "data-testid": "status-count-unknown" }).children).toEqual(["2"]);
    expect(root.findAllByProps({ "data-testid": "status-item-pending" }).length).toBe(0);

    unmount();
  });

  test("indexes every field these nodes carry that no dedicated view renders", () => {
    const { root, unmount } = renderJson(<SidebarNodeProperties dataset={foreignDataset} />);

    for (const key of [
      "confidence",
      "noticedOn",
      "tags",
      "source",
      "referenceUrl",
      "raisedBy",
      "estimatedCostTry",
      "blocking",
      "mitigation",
    ]) {
      expect(root.findByProps({ "data-testid": `node-property-${key}` })).toBeDefined();
    }
    expect(root.findByProps({ "data-testid": "node-property-count-confidence" }).children).toEqual([
      "2",
    ]);

    unmount();
  });
});

describe("the node drawer expands whatever a foreign node carries", () => {
  test("shows the node's own kind and says unknown where the sketch says nothing", () => {
    selectNode(foreignDataset, "n-seed");
    const { root, json, unmount } = renderJson(<NodeDetailDrawer />);

    expect(root.findByProps({ "data-testid": "drawer-kind-label" }).children).toEqual(["ME"]);
    expect(root.findByProps({ "data-testid": "drawer-status-pill" }).children).toEqual(["unknown"]);
    const rendered = json();
    expect(rendered).not.toContain("Pending");
    expect(rendered).not.toContain("WORKER");
    expect(rendered).not.toContain("completed");
    // An idea map has no host agent, so the drawer does not ask which model wrote this node.
    expect(rendered).not.toContain("drawer-model");

    unmount();
  });

  test("offers no tab built for a schema this dataset does not use", () => {
    selectNode(foreignDataset, "n-risk");
    const { root, unmount } = renderJson(<NodeDetailDrawer />);

    expect(root.findByProps({ "data-testid": "drawer-tab-properties" })).toBeDefined();
    for (const orchestrationOnly of [
      "cost",
      "scripts",
      "tools",
      "state-machine",
      "findings",
      "assets",
    ]) {
      expect(root.findAllByProps({ "data-testid": `drawer-tab-${orchestrationOnly}` }).length).toBe(
        0,
      );
    }

    unmount();
  });

  test("renders every unfamiliar property by its shape, dropping none of them", () => {
    selectNode(foreignDataset, "n-risk");
    const { root, json, unmount } = renderJson(<NodeDetailDrawer />);

    act(() => {
      root.findByProps({ "data-testid": "drawer-tab-properties" }).props.onClick();
    });

    const rendered = json();
    expect(root.findByProps({ "data-testid": "metadata-generic-fields" })).toBeDefined();
    expect(rendered).toContain("Raised By");
    expect(rendered).toContain("the neighbour on the third floor");
    expect(rendered).toContain("60,000");
    expect(rendered).toContain("true");
    // A key the dataset recorded with no value is empty, not absent and not a zero.
    expect(rendered).toContain("empty");

    unmount();
  });

  test("renders a nested object, a list and a link the way each is shaped", () => {
    selectNode(foreignDataset, "n-rainfall");
    const { root, unmount } = renderJson(<NodeDetailDrawer />);

    act(() => {
      root.findByProps({ "data-testid": "drawer-tab-properties" }).props.onClick();
    });

    const fields = root.findByProps({ "data-testid": "metadata-generic-fields" });
    expect(fields.findByProps({ "data-testid": "open-field-station" })).toBeDefined();
    expect(fields.findByProps({ "data-testid": "open-field-years" })).toBeDefined();

    const link = fields.findByType("a");
    expect(link.props.href).toBe("https://example.org/istanbul-rainfall");

    unmount();
  });

  test("still renders the whole node when only the graph's own fields exist", () => {
    selectNode(foreignDataset, "n-seed");
    const { root, json, unmount } = renderJson(<NodeDetailDrawer />);

    // What the node says about itself comes first, before any of its own fields.
    const overview = json();
    expect(overview).toContain("The roof throws away every drop");
    expect(overview).toContain("140 m² of bitumen sheds straight into the storm drain.");

    act(() => {
      root.findByProps({ "data-testid": "drawer-tab-properties" }).props.onClick();
    });

    const properties = json();
    for (const value of ["hunch", "2026-02-11", "water", "roof"]) {
      expect(properties).toContain(value);
    }

    act(() => {
      root.findByProps({ "data-testid": "drawer-tab-provenance" }).props.onClick();
    });
    // The evidence index is an orchestration index; this node has none of it and is told so once.
    expect(root.findByProps({ "data-testid": "evidence-inventory-absent" })).toBeDefined();

    unmount();
  });
});

describe("the orchestration views keep their purpose-built treatment", () => {
  test("a node with the producer's fields still gets every view built for them", () => {
    selectNode(orchestrationDataset, orchestrationNode.id);
    const { root, unmount } = renderJson(<NodeDetailDrawer />);

    for (const tabId of ["scripts", "tools", "state-machine", "cost"]) {
      expect(root.findByProps({ "data-testid": `drawer-tab-${tabId}` })).toBeDefined();
    }
    expect(root.findByProps({ "data-testid": "drawer-kind-label" }).children).toEqual([
      "IMPLEMENTER",
    ]);
    expect(root.findByProps({ "data-testid": "drawer-status-pill" }).children).toEqual(["Success"]);

    unmount();
  });
});
