import { describe, expect, test } from "bun:test";
import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import {
  extractLineageTree,
  normalizeRole,
  type SubagentLineageNode,
} from "./tabs/SubagentLineageTree";

function custodyNode(records: Record<string, unknown>[]): GraphNodeData {
  return {
    id: "node-task-T-1",
    name: "Task T-1",
    kind: "task",
    provenance: { chainOfCustody: records as never },
  };
}

function child(tree: SubagentLineageNode[]): SubagentLineageNode {
  const first = tree[0]?.children?.[0];
  expect(first).toBeDefined();
  return first as SubagentLineageNode;
}

describe("a lineage role is read, never guessed from an agent id", () => {
  test("an agent id containing val does not make the agent a validator", () => {
    const tree = extractLineageTree(custodyNode([{ actorId: "val-shaped-name" }]));

    expect(child(tree).role).toBeUndefined();
    expect(normalizeRole(child(tree).role).roleType).not.toBe("validator");
  });

  test("the recorded role is used verbatim", () => {
    const tree = extractLineageTree(custodyNode([{ actorId: "agent-9", role: "validator" }]));

    expect(child(tree).role).toBe("validator");
    expect(normalizeRole(child(tree).role).roleType).toBe("validator");
  });

  test("an unrecorded role renders as UNKNOWN rather than a neutral badge", () => {
    expect(normalizeRole(undefined).label).toBe("UNKNOWN");
    expect(normalizeRole("").label).toBe("UNKNOWN");
  });

  test("a canonical role is never relabelled as a different canonical role", () => {
    // `planner` is one of the nine preset roles, not a synonym for `coordinator`. The canvas has
    // always drawn it as PLANNER; the drawer used to draw the same node as COORDINATOR.
    for (const role of [
      "planner",
      "repairer",
      "completeness-critic",
      "sub-implementer",
      "sub-validator",
      "sub-investigator",
    ]) {
      expect(normalizeRole(role).label).toBe(role.toUpperCase());
    }
  });

  test("two unfamiliar roles get their own stable accents, absence gets none", () => {
    const registrar = normalizeRole("registrar");
    const radiographer = normalizeRole("radiographer");

    expect(registrar.color).not.toBe(radiographer.color);
    expect(normalizeRole("registrar").color).toBe(registrar.color);
    expect(registrar.bg).toContain("hsla(");
    // Nothing was recorded, so nothing wears a generated colour.
    expect(normalizeRole(undefined).color).toBe("#a1a1aa");
  });

  test("a node with no recorded role stays roleless when its lineage comes from edges", () => {
    const dataset: GraphDataset = {
      id: "dataset-lineage-role",
      title: "Lineage role dataset",
      nodes: [
        { id: "node-a", name: "A", kind: "task" },
        { id: "node-b", name: "B", telemetry: { role: "sub-implementer" } },
      ],
      edges: [{ id: "edge-1", source: "node-a", target: "node-b", kind: "spawn" }],
    };

    const [root] = extractLineageTree(dataset.nodes[0], dataset);

    expect(root?.role).toBe("task");
    expect(root?.children?.[0]?.role).toBe("sub-implementer");
  });
});
