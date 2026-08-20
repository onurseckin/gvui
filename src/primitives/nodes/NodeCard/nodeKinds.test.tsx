import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { NODE_ROLES, type GraphNodeData, type NodeRole } from "../../../types/graphData";
import { NodeCard } from "./index";
import type { NodeCardProps } from "./NodeCard.types";
import {
  describeNodeArchetype,
  describeNodeKind,
  describeNodeStatus,
  NODE_KIND_DESCRIPTORS,
  NODE_ROLE_DESCRIPTORS,
  NODE_STATUS_DESCRIPTORS,
  resolveNodeRole,
  resolveNodeStatus,
} from "./nodeKinds";

function agentWithRole(role: NodeRole): GraphNodeData {
  return { id: `n-${role}`, name: role, kind: "agent", telemetry: { role } };
}

function cardProps(node: GraphNodeData): NodeCardProps {
  return {
    node: { ...node, x: 0, y: 0, width: 200, height: 100 },
    isSelected: false,
    isFiltered: false,
    isCollapsed: false,
    onSelect: () => {},
    onToggleCollapse: () => {},
  };
}

describe("Node archetypes keyed on kind and role", () => {
  it("registers a descriptor for every declared role", () => {
    expect(NODE_ROLES).toHaveLength(9);
    for (const role of NODE_ROLES) {
      const descriptor = NODE_ROLE_DESCRIPTORS[role];
      expect(descriptor).toBeDefined();
      expect(descriptor.role).toBe(role);
      expect(descriptor.label.length).toBeGreaterThan(0);
    }
  });

  it("gives every role its own accent, so no two roles read alike", () => {
    const accents = new Set(NODE_ROLES.map((role) => NODE_ROLE_DESCRIPTORS[role].accent));
    expect(accents.size).toBe(NODE_ROLES.length);
  });

  it("tells an implementer apart from the validator that reviewed it", () => {
    const implementer = describeNodeArchetype(agentWithRole("implementer"));
    const validator = describeNodeArchetype(agentWithRole("validator"));

    expect(implementer.label).toBe("IMPLEMENTER");
    expect(validator.label).toBe("VALIDATOR");
    expect(implementer.accent).not.toBe(validator.accent);
    expect(implementer.IconComponent).not.toBe(validator.IconComponent);
  });

  it("tells a branch sub-agent apart from its top-level counterpart", () => {
    const implementer = describeNodeArchetype(agentWithRole("implementer"));
    const subImplementer = describeNodeArchetype(agentWithRole("sub-implementer"));
    expect(implementer.accent).not.toBe(subImplementer.accent);
    expect(subImplementer.label).toBe("SUB-IMPLEMENTER");
  });

  it("reads telemetry.role before the producer's metadata role", () => {
    expect(resolveNodeRole({ telemetry: { role: "repairer" } })).toBe("repairer");
    expect(resolveNodeRole({ metadata: { role: "repairer" } })).toBe("repairer");
    expect(
      resolveNodeRole({ telemetry: { role: "repairer" }, metadata: { role: "validator" } }),
    ).toBe("repairer");
  });

  it("falls back to the bare kind only when no role was recorded at all", () => {
    expect(resolveNodeRole({})).toBe(undefined);
    expect(resolveNodeRole({ metadata: { role: "   " } })).toBe(undefined);
    expect(describeNodeKind({ kind: "gate" })).toBe(NODE_KIND_DESCRIPTORS.gate);
  });

  it("puts the role on the card so the stylesheet can give it its own silhouette", () => {
    const html = renderToString(<NodeCard {...cardProps(agentWithRole("validator"))} />);
    expect(html).toContain("role-validator");
    expect(html).toContain("--node-kind-accent:#10b981");
  });

  it("does not stamp a role class on a node that never reported one", () => {
    const html = renderToString(
      <NodeCard {...cardProps({ id: "plain", name: "Plain", kind: "agent" })} />,
    );
    expect(html).not.toContain("role-");
  });
});

describe("Vocabulary members this renderer ships no preset for", () => {
  it("gives an unknown kind its own name rather than drawing it as an agent", () => {
    const descriptor = describeNodeKind({ kind: "quantum-widget" });

    expect(descriptor.label).toBe("QUANTUM WIDGET");
    expect(descriptor.accent).not.toBe(NODE_KIND_DESCRIPTORS.agent.accent);
    expect(descriptor.IconComponent).toBeDefined();
  });

  it("gives an unknown role its own name rather than drawing it as its kind", () => {
    const descriptor = describeNodeArchetype({
      kind: "agent",
      telemetry: { role: "chief-vibes-officer" },
    });

    expect(descriptor.label).toBe("CHIEF VIBES OFFICER");
    expect(descriptor.role).toBe("chief-vibes-officer");
    expect(descriptor.accent).not.toBe(NODE_KIND_DESCRIPTORS.agent.accent);
    expect(descriptor.accent).not.toBe(NODE_ROLE_DESCRIPTORS.implementer.accent);
  });

  it("gives the same unknown member the same accent every time it is asked", () => {
    expect(describeNodeKind({ kind: "quantum-widget" }).accent).toBe(
      describeNodeKind({ kind: "quantum-widget" }).accent,
    );
    expect(describeNodeArchetype({ telemetry: { role: "archivist" } }).accent).toBe(
      describeNodeArchetype({ telemetry: { role: "archivist" } }).accent,
    );
  });

  it("tells two unfamiliar members apart from each other", () => {
    const accents = new Set(
      ["quantum-widget", "ledger", "archivist", "smelter", "beacon"].map(
        (kind) => describeNodeKind({ kind }).accent,
      ),
    );
    expect(accents.size).toBe(5);
  });

  it("keeps every preset accent out of the generated range, so the two never collide", () => {
    const preset = new Set([
      ...Object.values(NODE_KIND_DESCRIPTORS).map((descriptor) => descriptor.accent),
      ...Object.values(NODE_ROLE_DESCRIPTORS).map((descriptor) => descriptor.accent),
    ]);
    for (const kind of ["quantum-widget", "ledger", "archivist", "smelter", "beacon"]) {
      expect(preset.has(describeNodeKind({ kind }).accent)).toBe(false);
    }
  });

  it("renders an unfamiliar kind on a card without throwing", () => {
    const html = renderToString(
      <NodeCard {...cardProps({ id: "u1", name: "Smelter", kind: "smelter" })} />,
    );
    expect(html).toContain("kind-smelter");
    expect(html).toContain("--node-kind-accent:hsl(");
  });
});

describe("Node status is an open vocabulary too", () => {
  it("keeps a lifecycle the renderer ships no preset for", () => {
    const node: GraphNodeData = { id: "q1", name: "Held sample", status: "quarantined" };
    expect(resolveNodeStatus(node)).toBe("quarantined");
    expect(describeNodeStatus(node).label).toBe("Quarantined");
  });

  it("never redraws an unfamiliar lifecycle as a preset one", () => {
    const node: GraphNodeData = { id: "q2", name: "Held sample", status: "quarantined" };
    const preset = new Set(
      Object.values(NODE_STATUS_DESCRIPTORS).map((descriptor) => descriptor.color),
    );
    expect(preset.has(describeNodeStatus(node).color)).toBe(false);
    expect(describeNodeStatus(node).label).not.toBe(NODE_STATUS_DESCRIPTORS.pending.label);
  });

  it("gives two unfamiliar lifecycles their own stable accents", () => {
    const held = describeNodeStatus({ id: "a", name: "a", status: "quarantined" });
    const queued = describeNodeStatus({ id: "b", name: "b", status: "escalated" });
    expect(held.color).not.toBe(queued.color);
    expect(describeNodeStatus({ id: "c", name: "c", status: "quarantined" }).color).toBe(
      held.color,
    );
  });

  it("prefers the declared lifecycle over one implied by a badge variant", () => {
    const node: GraphNodeData = {
      id: "q3",
      name: "Held sample",
      status: "quarantined",
      badges: [{ label: "ok", variant: "success" }],
    };
    expect(resolveNodeStatus(node)).toBe("quarantined");
  });

  it("draws an unfamiliar lifecycle on a card without throwing", () => {
    const html = renderToString(
      <NodeCard {...cardProps({ id: "q4", name: "Held sample", status: "quarantined" })} />,
    );
    expect(html).toContain("status-quarantined");
  });
});
