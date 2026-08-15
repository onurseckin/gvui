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

  test("describes orchestrator dispatcher archetype with blue accent", () => {
    const node: GraphNodeData = { id: "orch-1", name: "Orchestrator", kind: "orchestrator" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#3b82f6");
    expect(desc.label).toBe("COORDINATOR");
  });

  test("describes agent worker archetype with cyan accent", () => {
    const node: GraphNodeData = { id: "ag-1", name: "Worker Agent", kind: "agent" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#06b6d4");
    expect(desc.label).toBe("WORKER");
  });

  test("describes tool CLI archetype with slate accent", () => {
    const node: GraphNodeData = { id: "tool-1", name: "Run Tests", kind: "tool" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#71717a");
    expect(desc.label).toBe("CLI COMMAND");
  });

  test("describes router decision archetype with amber accent", () => {
    const node: GraphNodeData = { id: "rout-1", name: "Branch Router", kind: "router" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#f59e0b");
    expect(desc.label).toBe("ROUTER");
  });

  test("describes validator gate checkpoint archetype with emerald accent", () => {
    const node: GraphNodeData = { id: "gate-1", name: "Validator Gate", kind: "gate" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#10b981");
    expect(desc.label).toBe("VALIDATOR GATE");
  });

  test("describes critic scorecard archetype with indigo/gold critic accent", () => {
    const node: GraphNodeData = { id: "crit-1", name: "Completeness Critic", kind: "critic" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#818cf8");
    expect(desc.label).toBe("COMPLETENESS CRITIC");
  });

  test("describes terminal sealed outcome archetype with emerald green accent", () => {
    const node: GraphNodeData = { id: "term-1", name: "Terminal Node", kind: "terminal" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#10b981");
    expect(desc.label).toBe("SEALED OUTCOME");
  });

  test("describes join archetype with teal accent", () => {
    const node: GraphNodeData = { id: "join-1", name: "Join Node", kind: "join" };
    const desc = describeNodeKind(node);
    expect(desc.accent).toBe("#2dd4bf");
    expect(desc.label).toBe("JOIN");
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
    expect(describeNodeStatus({ id: "n4", name: "N4", status: "warning" }).label).toBe("Warning");
    expect(describeNodeStatus({ id: "n5", name: "N5", status: "skipped" }).label).toBe("Skipped");
    expect(describeNodeStatus({ id: "n6", name: "N6", status: "cached" }).label).toBe("Cached");
    expect(describeNodeStatus({ id: "n7", name: "N7", status: "pending" }).label).toBe("Pending");
  });
});
