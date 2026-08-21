import { describe, expect, test } from "bun:test";
import { describeNodeArchetype } from "../primitives/nodes/NodeCard/nodeKinds";
import type { GraphNodeData } from "../types/graphData";
import { resolveFilterableRole, matchesFilterCategory, roleFilterId } from "./graphFilters";
import { ROLE_LABELS, resolveNodeRole, roleGroupOf } from "./graphSchema";

const DOMAINS = ["code-quality", "product", "security", "system-design", "ui-design"] as const;

/**
 * The shape `summary/graph-generator-validator-nodes.ts` emits: the generic `validator` role beside
 * the domain as its own field, because the producer's role contracts state the two as separate keys.
 */
function producerValidatorNode(domain: string): GraphNodeData {
  return {
    id: `node-validator-task-1-${domain}`,
    name: `Validator (${domain}): val-1`,
    kind: "agent",
    status: "success",
    metadata: { role: "validator", validatorDomain: domain, validatorId: "val-1" },
    telemetry: { role: "validator" },
  } as unknown as GraphNodeData;
}

describe("a domain validator is its own node, not a generic validator", () => {
  test("each domain resolves to its own role, label and accent", () => {
    const roles = new Set<string>();
    const labels = new Set<string>();
    const accents = new Set<string>();

    for (const domain of DOMAINS) {
      const node = producerValidatorNode(domain);
      const resolved = resolveNodeRole(node);
      expect(resolved).toEqual({ role: `validator-${domain}`, declared: true });

      const archetype = describeNodeArchetype(node);
      roles.add(resolved?.role ?? "");
      labels.add(ROLE_LABELS[`validator-${domain}`]);
      accents.add(archetype.accent);
    }

    expect(roles.size).toBe(DOMAINS.length);
    expect(labels.size).toBe(DOMAINS.length);
    expect(accents.size).toBe(DOMAINS.length);
  });

  test("a security review and a UI-design review never share an icon", () => {
    const security = describeNodeArchetype(producerValidatorNode("security"));
    const uiDesign = describeNodeArchetype(producerValidatorNode("ui-design"));
    expect(security.IconComponent).not.toBe(uiDesign.IconComponent);
    expect(security.accent).not.toBe(uiDesign.accent);
    expect(security.label).not.toBe(uiDesign.label);
  });

  test("one domain can be singled out while the group filter still gathers them all", () => {
    const nodes = DOMAINS.map((domain) => producerValidatorNode(domain));
    const uiOnly = nodes.filter((node) =>
      matchesFilterCategory(node, roleFilterId("validator-ui-design")),
    );
    expect(uiOnly).toHaveLength(1);
    expect(uiOnly[0]?.id).toBe("node-validator-task-1-ui-design");

    expect(nodes.filter((node) => matchesFilterCategory(node, "validators"))).toHaveLength(
      DOMAINS.length,
    );
    for (const node of nodes) {
      expect(roleGroupOf(resolveFilterableRole(node)?.id ?? "validator")).toBe("validator");
    }
  });

  test("a validator whose domain the run never recorded stays the generic validator", () => {
    const node = {
      id: "node-validator-task-2",
      name: "Validator (unknown): val-2",
      kind: "agent",
      metadata: { role: "validator", validatorDomain: "unknown" },
      telemetry: { role: "validator" },
    } as unknown as GraphNodeData;

    expect(resolveNodeRole(node)).toEqual({ role: "validator", declared: true });
    expect(resolveFilterableRole(node)?.id).toBe("validator");
  });

  test("a domain this renderer ships no preset for keeps its own identity and never throws", () => {
    const node = producerValidatorNode("chaos-engineering");
    expect(() => describeNodeArchetype(node)).not.toThrow();
    expect(resolveFilterableRole(node)).toEqual({
      id: "validator-chaos-engineering",
      declared: true,
      isPreset: false,
    });
    expect(describeNodeArchetype(node).label).toBe("VALIDATOR CHAOS ENGINEERING");
    expect(matchesFilterCategory(node, "validators")).toBe(true);
  });
});
