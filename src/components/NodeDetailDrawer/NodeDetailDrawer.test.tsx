import { describe, expect, test } from "bun:test";
import type { GraphNodeData } from "../../types/graphData";
import { describeNodeKind, describeNodeStatus } from "../../primitives/nodes/NodeCard/nodeKinds";

describe("NodeDetailDrawer tests", () => {
  const sampleNode: GraphNodeData = {
    id: "node-1",
    name: "Planner Dispatch",
    kind: "orchestrator",
    status: "running",
    step: 2,
    model: "claude-3-5-sonnet",
    description: "Orchestrates subagent tasks",
    files: [{ path: "src/engine/planner.ts", mode: "write", additions: 45, deletions: 12 }],
    metadata: {
      writeScope: ["src/engine/planner.ts"],
      repairRounds: 0,
      commands: [
        {
          id: "cmd-1",
          argv: ["bun", "test"],
          cwd: "/repo",
          exitCode: 0,
          durationMs: 1200,
          startedAt: "2026-08-14T20:00:00.000Z",
          finishedAt: "2026-08-14T20:00:01.200Z",
        },
      ],
      findings: [],
    },
  };

  test("resolves correct node kind descriptor and accent", () => {
    const kind = describeNodeKind(sampleNode);
    expect(kind.label).toBe("COORDINATOR");
    expect(kind.accent).toBe("#3b82f6");
  });

  test("resolves correct node status descriptor", () => {
    const status = describeNodeStatus(sampleNode);
    expect(status.label).toBe("Running");
    expect(status.animated).toBe(true);
  });

  test("handles files and execution metadata properly", () => {
    expect(sampleNode.files?.length).toBe(1);
    expect(sampleNode.files?.[0]?.path).toBe("src/engine/planner.ts");
    expect(sampleNode.files?.[0]?.additions).toBe(45);
  });

  test("handles critic scorecard archetype details", () => {
    const criticNode: GraphNodeData = {
      id: "node-critic",
      name: "Completeness Critic",
      kind: "critic",
      status: "success",
      step: 4,
    };
    const kind = describeNodeKind(criticNode);
    expect(kind.label).toBe("COMPLETENESS CRITIC");
    expect(kind.accent).toBe("#d97706");
  });
});
