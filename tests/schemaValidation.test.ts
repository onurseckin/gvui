import { describe, expect, test } from "bun:test";
import type {
  CommandExecutionDetail,
  FindingDetail,
  GraphDataset,
  GraphNodeData,
  GraphSection,
} from "../src/types/graphData";

describe("GVUI GraphData schema validation", () => {
  test("validates full GraphDataset structure with sections, commands, and findings", () => {
    const cmd: CommandExecutionDetail = {
      id: "C-1",
      argv: ["bun", "test"],
      cwd: "/repo",
      exitCode: 0,
      durationMs: 1200,
      startedAt: "2026-08-14T20:00:00.000Z",
      finishedAt: "2026-08-14T20:00:01.200Z",
      logPath: "commands/C-1/record.json",
    };

    const finding: FindingDetail = {
      id: "F-1",
      requirementId: "R-1",
      severity: "important",
      observation: "Uncovered boundary condition in parser",
      remediation: "Add test case covering empty array",
      status: "resolved",
    };

    const node: GraphNodeData = {
      id: "node-task-1",
      name: "Core Task",
      kind: "agent",
      status: "success",
      sectionId: "sec-exec",
      files: [{ path: "src/index.ts", mode: "write" }],
      metadata: {
        writeScope: ["src/index.ts"],
        leaseAgent: "worker-1",
        repairRounds: 1,
        commands: [cmd],
        findings: [finding],
      },
    };

    const section: GraphSection = {
      id: "sec-exec",
      title: "Phase 2: Execution",
      nodeIds: ["node-task-1"],
    };

    const dataset: GraphDataset = {
      id: "run-full-1",
      title: "Full Execution Run",
      directed: true,
      entry: "node-task-1",
      exits: ["node-task-1"],
      sections: [section],
      nodes: [node],
      edges: [],
    };

    expect(dataset.id).toBe("run-full-1");
    expect(dataset.sections).toHaveLength(1);
    expect(dataset.nodes[0]!.metadata?.commands).toHaveLength(1);
    expect(dataset.nodes[0]!.metadata?.findings).toHaveLength(1);
  });
});
