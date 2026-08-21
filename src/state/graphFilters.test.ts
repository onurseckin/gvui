import { describe, expect, test } from "bun:test";
import {
  canonicalFilterCategory,
  matchesFilterCategory,
  resolveFilterableRole,
  roleFilterId,
  roleIdFromFilter,
  type FilterCategory,
} from "./graphFilters";
import { NODE_ROLES, type GraphNodeData } from "../types/graphData";

// The producer's own role-file names, not gvui's invention: each domain checks something different
// through different evidence, so each must be singled-out filterable on its own, not only reachable
// through the shared "validators" group filter.
const DOMAIN_VALIDATOR_ROLES = [
  "validator-code-quality",
  "validator-product",
  "validator-security",
  "validator-system-design",
  "validator-ui-design",
] as const;

const ALL_PRESET_ROLES = [
  "coordinator",
  "planner",
  "implementer",
  "validator",
  ...DOMAIN_VALIDATOR_ROLES,
  "repairer",
  "completeness-critic",
  "sub-implementer",
  "sub-validator",
  "sub-investigator",
  "plan-validator",
] as const;

function agentNode(id: string, role: string): GraphNodeData {
  return { id, name: id, kind: "agent", telemetry: { role } };
}

describe("resolveFilterableRole", () => {
  test("exercises the whole role vocabulary, not a subset of it", () => {
    // A guard that this file's own enumeration below covers every role the renderer ships, so a
    // role added to the vocabulary without being exercised here is caught rather than assumed.
    expect([...ALL_PRESET_ROLES].sort()).toEqual([...NODE_ROLES].sort());
  });

  test("reads every preset role, including each domain validator, as declared and preset", () => {
    for (const role of ALL_PRESET_ROLES) {
      const resolved = resolveFilterableRole(agentNode(`n-${role}`, role));
      expect(resolved).toEqual({ id: role, declared: true, isPreset: true });
    }
  });

  test("two different domain validators resolve to two different identities", () => {
    const uiDesign = resolveFilterableRole(agentNode("n1", "validator-ui-design"));
    const security = resolveFilterableRole(agentNode("n2", "validator-security"));
    expect(uiDesign?.id).toBe("validator-ui-design");
    expect(security?.id).toBe("validator-security");
    expect(uiDesign?.id).not.toBe(security?.id);
  });

  test("a role this renderer has never shipped a preset for keeps its own name instead of the kind-implied one", () => {
    // kind "agent" implies "implementer", but the run named something more specific — that recorded
    // name must win, never the generic fallback the kind alone would suggest.
    const node: GraphNodeData = {
      id: "n1",
      name: "n1",
      kind: "agent",
      telemetry: { role: "validator-chaos-engineering" },
    };
    expect(resolveFilterableRole(node)).toEqual({
      id: "validator-chaos-engineering",
      declared: true,
      isPreset: false,
    });
  });

  test("an implied role with no recorded name at all is still filterable, but flagged as not declared", () => {
    const node: GraphNodeData = { id: "n1", name: "n1", kind: "agent" };
    expect(resolveFilterableRole(node)).toEqual({
      id: "implementer",
      declared: false,
      isPreset: true,
    });
  });

  test("a node with neither a role nor a role-bearing kind has no filterable identity", () => {
    const node: GraphNodeData = { id: "n1", name: "n1", kind: "tool" };
    expect(resolveFilterableRole(node)).toBeUndefined();
  });
});

describe("roleFilterId / roleIdFromFilter", () => {
  test("round-trips a role id through its filter category", () => {
    for (const role of ALL_PRESET_ROLES) {
      const filter = roleFilterId(role);
      expect(roleIdFromFilter(filter)).toBe(role);
    }
  });

  test("a filter with no role: prefix has no role id", () => {
    expect(roleIdFromFilter("validators")).toBeUndefined();
    expect(roleIdFromFilter("all")).toBeUndefined();
  });

  test("canonicalFilterCategory leaves a role filter untouched", () => {
    const filter = roleFilterId("validator-ui-design");
    expect(canonicalFilterCategory(filter)).toBe(filter);
  });
});

describe("matchesFilterCategory: single-role filtering, across the whole role vocabulary", () => {
  test("a role filter matches only nodes carrying that exact role", () => {
    for (const role of ALL_PRESET_ROLES) {
      const matching = agentNode("match", role);
      const filter = roleFilterId(role);
      expect(matchesFilterCategory(matching, filter)).toBe(true);

      for (const other of ALL_PRESET_ROLES) {
        if (other === role) continue;
        expect(matchesFilterCategory(agentNode("other", other), filter)).toBe(false);
      }
    }
  });

  test("filtering to one domain validator excludes the other four and the generic validator", () => {
    const filter = roleFilterId("validator-ui-design");
    expect(matchesFilterCategory(agentNode("n", "validator-ui-design"), filter)).toBe(true);
    expect(matchesFilterCategory(agentNode("n", "validator-security"), filter)).toBe(false);
    expect(matchesFilterCategory(agentNode("n", "validator-product"), filter)).toBe(false);
    expect(matchesFilterCategory(agentNode("n", "validator-system-design"), filter)).toBe(false);
    expect(matchesFilterCategory(agentNode("n", "validator-code-quality"), filter)).toBe(false);
    expect(matchesFilterCategory(agentNode("n", "validator"), filter)).toBe(false);
  });

  test("a graph's own foreign role is filterable by its own name, not only by the group it falls into", () => {
    const node: GraphNodeData = {
      id: "n1",
      name: "n1",
      kind: "gate",
      metadata: { role: "devils-advocate" },
    };
    expect(matchesFilterCategory(node, roleFilterId("devils-advocate"))).toBe(true);
    expect(matchesFilterCategory(node, roleFilterId("building-manager"))).toBe(false);
  });
});

describe("matchesFilterCategory: the validators group still means every validator", () => {
  test("every domain validator, the generic validator, and the plan validator all match the validators group", () => {
    for (const role of ["validator", "plan-validator", ...DOMAIN_VALIDATOR_ROLES]) {
      expect(matchesFilterCategory(agentNode("n", role), "validators")).toBe(true);
    }
  });

  test("the validators group does not match an implementer or a repairer", () => {
    expect(matchesFilterCategory(agentNode("n", "implementer"), "validators")).toBe(false);
    expect(matchesFilterCategory(agentNode("n", "repairer"), "validators")).toBe(false);
  });

  test("single-role and group filtering never disagree about which nodes are validators", () => {
    const nodes: GraphNodeData[] = [
      agentNode("v1", "validator"),
      agentNode("v2", "validator-security"),
      agentNode("v3", "validator-ui-design"),
      agentNode("i1", "implementer"),
      agentNode("r1", "repairer"),
    ];
    const groupMatches = nodes.filter((node) => matchesFilterCategory(node, "validators"));
    const perRoleMatches = nodes.filter(
      (node) =>
        matchesFilterCategory(node, roleFilterId("validator")) ||
        matchesFilterCategory(node, roleFilterId("validator-security")) ||
        matchesFilterCategory(node, roleFilterId("validator-ui-design")),
    );
    expect(groupMatches.map((n) => n.id).sort()).toEqual(perRoleMatches.map((n) => n.id).sort());
    expect(groupMatches.map((n) => n.id).sort()).toEqual(["v1", "v2", "v3"]);
  });
});

describe("matchesFilterCategory: unaffected pre-existing categories", () => {
  const errorNode: GraphNodeData = { id: "e1", name: "e1", kind: "agent", status: "error" };
  const successNode: GraphNodeData = { id: "s1", name: "s1", kind: "agent", status: "success" };
  const toolNode: GraphNodeData = { id: "t1", name: "t1", kind: "tool" };

  test("all matches everything", () => {
    expect(matchesFilterCategory(errorNode, "all")).toBe(true);
  });

  test("errors and its pre-realignment spelling both match error status", () => {
    expect(matchesFilterCategory(errorNode, "errors")).toBe(true);
    expect(matchesFilterCategory(errorNode, "error")).toBe(true);
    expect(matchesFilterCategory(successNode, "errors")).toBe(false);
  });

  test("success matches success status", () => {
    expect(matchesFilterCategory(successNode, "success")).toBe(true);
    expect(matchesFilterCategory(errorNode, "success")).toBe(false);
  });

  test("tools matches tool-kind nodes", () => {
    expect(matchesFilterCategory(toolNode, "tools")).toBe(true);
    expect(matchesFilterCategory(errorNode, "tools")).toBe(false);
  });

  test("a role filter never falls through to matching everything", () => {
    const filter: FilterCategory = roleFilterId("validator-ui-design");
    expect(matchesFilterCategory(errorNode, filter)).toBe(false);
  });
});
