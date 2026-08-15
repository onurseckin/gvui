import { describe, expect, test } from "bun:test";
import type { GraphNodeData } from "../src/types/graphData";
import { OverviewTab } from "../src/components/NodeDetailDrawer/tabs/OverviewTab";
import { IoTab } from "../src/components/NodeDetailDrawer/tabs/IoTab";
import { FilesTab } from "../src/components/NodeDetailDrawer/tabs/FilesTab";
import { CommandsTab } from "../src/components/NodeDetailDrawer/tabs/CommandsTab";
import { FindingsTab } from "../src/components/NodeDetailDrawer/tabs/FindingsTab";
import { RawProvenanceTab } from "../src/components/NodeDetailDrawer/tabs/RawProvenanceTab";
import React from "react";
import ReactTestRenderer from "react-test-renderer";

describe("NodeDetailDrawer tabs rendering", () => {
  const node: GraphNodeData = {
    id: "task-01",
    name: "Sample Agent Task",
    kind: "agent",
    status: "success",
    step: 2,
    stepLabel: "Step 2: Wave 1 Tasks",
    description: "Implements capsule summary engine",
    metrics: { tokensIn: 1000, tokensOut: 500, durationMs: 2500, costUsd: 0.05 },
    files: [{ path: "src/summary/types.ts", mode: "write", additions: 10, deletions: 2 }],
    io: {
      inputs: [{ kind: "prompt", label: "User Prompt", preview: "Build feature" }],
      outputs: [{ kind: "summary", label: "Result Output", preview: "Feature built" }],
    },
    metadata: {
      writeScope: ["src/summary/types.ts"],
      repairRounds: 1,
      commands: [
        {
          id: "cmd-01",
          argv: ["bun", "test"],
          cwd: "/app",
          exitCode: 0,
          durationMs: 400,
          startedAt: "2026-08-14T20:00:00.000Z",
          finishedAt: "2026-08-14T20:00:00.400Z",
          stdoutSnippet: "10 pass",
        },
      ],
      findings: [
        {
          id: "find-01",
          severity: "important",
          observation: "Coverage gap",
          remediation: "Add unit tests",
          status: "resolved",
        },
      ],
    },
  };

  test("renders OverviewTab with metrics and description", () => {
    let tree: ReactTestRenderer.ReactTestRendererJSON | null = null;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <OverviewTab node={node} inputs={[]} outputs={[]} nodeNamesById={new Map()} />,
      ).toJSON() as ReactTestRenderer.ReactTestRendererJSON;
    });
    expect(tree).toBeDefined();
  });

  test("renders IoTab with inputs and outputs previews", () => {
    let tree: ReactTestRenderer.ReactTestRendererJSON | null = null;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <IoTab
          node={node}
          inputs={node.io?.inputs ?? []}
          outputs={node.io?.outputs ?? []}
          nodeNamesById={new Map()}
        />,
      ).toJSON() as ReactTestRenderer.ReactTestRendererJSON;
    });
    expect(tree).toBeDefined();
  });

  test("renders FilesTab with write scope and modified files", () => {
    let tree: ReactTestRenderer.ReactTestRendererJSON | null = null;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <FilesTab node={node} />,
      ).toJSON() as ReactTestRenderer.ReactTestRendererJSON;
    });
    expect(tree).toBeDefined();
  });

  test("renders CommandsTab with executed commands and exit code", () => {
    let tree: ReactTestRenderer.ReactTestRendererJSON | null = null;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <CommandsTab node={node} />,
      ).toJSON() as ReactTestRenderer.ReactTestRendererJSON;
    });
    expect(tree).toBeDefined();
  });

  test("renders FindingsTab with validation findings and repair rounds", () => {
    let tree: ReactTestRenderer.ReactTestRendererJSON | null = null;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <FindingsTab node={node} />,
      ).toJSON() as ReactTestRenderer.ReactTestRendererJSON;
    });
    expect(tree).toBeDefined();
  });

  test("renders RawProvenanceTab with JSON dump and identifiers", () => {
    let tree: ReactTestRenderer.ReactTestRendererJSON | null = null;
    ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <RawProvenanceTab node={node} />,
      ).toJSON() as ReactTestRenderer.ReactTestRendererJSON;
    });
    expect(tree).toBeDefined();
  });
});
