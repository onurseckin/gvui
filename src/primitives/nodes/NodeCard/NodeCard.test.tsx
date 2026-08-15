import { describe, expect, test } from "bun:test";
import { describeNodeKind, describeNodeStatus, resolveModelTier } from "./nodeKinds";
import type { GraphNodeData } from "../../../types/graphData";

describe("NodeCard archetypes and kind descriptors", () => {
  test("describes input stadium archetype with violet accent", () => {
    const node: GraphNodeData = { id: "in-1", name: "User Input", kind: "input" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#8b5cf6");
    expect(desc.label).toBe("USER PROMPT");
  });

  test("describes agent worker archetype with cyan accent", () => {
    const node: GraphNodeData = { id: "ag-1", name: "Worker Agent", kind: "agent" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#06b6d4");
    expect(desc.label).toBe("WORKER");
  });

  test("describes critic scorecard archetype with critic accent", () => {
    const node: GraphNodeData = { id: "crit-1", name: "Completeness Critic", kind: "critic" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#d97706");
    expect(desc.label).toBe("COMPLETENESS CRITIC");
  });

  test("resolves model tiers accurately", () => {
    expect(resolveModelTier({ id: "1", name: "1", model: "claude-3-opus" })).toBe("l");
    expect(resolveModelTier({ id: "2", name: "2", model: "claude-3-5-sonnet" })).toBe("m");
    expect(resolveModelTier({ id: "3", name: "3", model: "claude-3-haiku" })).toBe("s");
    expect(resolveModelTier({ id: "4", name: "4" })).toBe(undefined);
  });

  test("describes node status indicators", () => {
    expect(describeNodeStatus({ id: "n1", name: "N1", status: "success" }).label).toBe("Success");
    expect(describeNodeStatus({ id: "n2", name: "N2", status: "running" }).label).toBe("Running");
    expect(describeNodeStatus({ id: "n3", name: "N3", status: "error" }).label).toBe("Error");
  });
});
