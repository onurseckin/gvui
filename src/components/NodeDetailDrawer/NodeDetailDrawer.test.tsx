import { describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { describeNodeKind, describeNodeStatus } from "../../primitives/nodes/NodeCard/nodeKinds";
import type { GraphEdgeData, GraphNodeData, IoPort } from "../../types/graphData";
import { DrawerSection, edgeToPort, formatBytes, getByteLength } from "./DrawerSection";
import { IoStreamItem } from "./IoStreamItem";
import { OverviewTab } from "./tabs/OverviewTab";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("NodeDetailDrawer tests", () => {
  const sampleNode: GraphNodeData = {
    id: "node-1",
    name: "Planner Dispatch",
    kind: "orchestrator",
    status: "running",
    step: 2,
    model: "claude-3-5-sonnet",
    description: "Orchestrates subagent tasks across workers",
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
    expect(kind.accent).toBe("#818cf8");
  });

  describe("DrawerSection container component", () => {
    test("renders section title and badge count correctly", () => {
      const html = renderToString(
        <DrawerSection title="Telemetry Metrics" count={5}>
          <div className="content">Payload</div>
        </DrawerSection>,
      );
      expect(html.includes("Telemetry Metrics")).toBe(true);
      expect(html.includes("drawer-section-count")).toBe(true);
      expect(html.includes("5")).toBe(true);
      expect(html.includes("Payload")).toBe(true);
    });
  });

  describe("formatBytes & getByteLength helper utilities", () => {
    test("formats 0 and invalid byte values gracefully", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(-10)).toBe("0 B");
      expect(formatBytes(Number.NaN)).toBe("0 B");
    });

    test("formats small byte sizes as B", () => {
      expect(formatBytes(420)).toBe("420 B");
      expect(formatBytes(1023)).toBe("1023 B");
    });

    test("formats kilobyte and megabyte sizes accurately", () => {
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(2560)).toBe("2.5 KB");
      expect(formatBytes(1048576)).toBe("1.0 MB");
      expect(formatBytes(5242880)).toBe("5.0 MB");
    });

    test("calculates accurate UTF-8 byte length for ascii and unicode", () => {
      expect(getByteLength("")).toBe(0);
      expect(getByteLength("hello world")).toBe(11);
      expect(getByteLength("🚀 Antigravity")).toBe(16);
    });
  });

  describe("edgeToPort boilerplate label elimination", () => {
    test("cleans up generic (handoff) and default summary placeholders", () => {
      const edgeWithHandoff: GraphEdgeData = {
        id: "edge-1",
        source: "node-planner",
        target: "node-worker",
        label: "(handoff)",
      };

      const inPort = edgeToPort(edgeWithHandoff, "in");
      expect(inPort.label).toBe("Input from node-planner");
      expect(inPort.label.includes("(handoff)")).toBe(false);

      const outPort = edgeToPort(edgeWithHandoff, "out");
      expect(outPort.label).toBe("Output to node-worker");
      expect(outPort.label.includes("(handoff)")).toBe(false);
    });

    test("preserves meaningful summary or condition labels when present", () => {
      const customEdge: GraphEdgeData = {
        id: "edge-2",
        source: "node-router",
        target: "node-validator",
        handoff: {
          kind: "artifact",
          summary: "Parsed AST bundle with exports",
          tokens: 450,
        },
      };

      const port = edgeToPort(customEdge, "in");
      expect(port.label).toBe("Parsed AST bundle with exports");
      expect(port.kind).toBe("artifact");
      expect(port.tokens).toBe(450);
    });
  });

  describe("IoStreamItem expandable accordion & typography", () => {
    const inputPort: IoPort = {
      node: "node-planner",
      kind: "artifact",
      label: "Component architecture specification",
      tokens: 320,
      preview: "export interface DrawerModel {\n  id: string;\n  status: string;\n}",
    };

    test("renders accordion header, stream title, peer source, and token/byte counters", () => {
      const html = renderToString(
        <IoStreamItem
          port={inputPort}
          peerName="Planner Dispatch"
          direction="in"
          defaultExpanded={true}
        />,
      );

      expect(html.includes("Component architecture specification")).toBe(true);
      expect(html.includes("Planner Dispatch")).toBe(true);
      expect(html.includes("src:")).toBe(true);
      expect(html.includes("320")).toBe(true);
      expect(html.includes("tok")).toBe(true);
      expect(html.includes("64 B")).toBe(true);
      expect(html.includes("payload-artifact")).toBe(true);
      expect(html.includes("Copy")).toBe(true);
      expect(html.includes("drawer-stream-payload")).toBe(true);
    });

    test("eliminates redundant generic SUMMARY pills and generic (handoff)", () => {
      const genericPort: IoPort = {
        node: "node-upstream",
        kind: "summary",
        label: "(handoff)",
        tokens: 150,
      };

      const html = renderToString(
        <IoStreamItem
          port={genericPort}
          peerName="Upstream Service"
          direction="in"
          defaultExpanded={false}
        />,
      );

      expect(html.includes("(handoff)")).toBe(false);
      expect(html.includes("From Upstream Service")).toBe(true);
      expect(html.includes("payload-summary")).toBe(false);
      expect(html.includes("SUMMARY</span>")).toBe(false);
    });

    test("renders full unclipped stream payload without arbitrary clipping", () => {
      const longPayload = "Line 1: init\nLine 2: process\nLine 3: finish\nLine 4: audit";
      const fullPort: IoPort = {
        node: "node-exec",
        kind: "prompt",
        label: "Execution Plan Prompt",
        preview: longPayload,
      };

      const html = renderToString(
        <IoStreamItem port={fullPort} direction="out" defaultExpanded={true} />,
      );

      expect(html.includes("Line 1: init")).toBe(true);
      expect(html.includes("Line 4: audit")).toBe(true);
      expect(html.includes("drawer-stream-payload")).toBe(true);
    });
  });

  describe("OverviewTab unified Overview & I/O integration", () => {
    test("renders merged Overview & I/O with Purpose, Metrics, and expandable Stream Accordions", () => {
      const testNode: GraphNodeData = {
        id: "node-merged",
        name: "Observability Agent",
        description: "Aggregates whole-graph execution metrics and stream handoffs",
        metrics: {
          tokensIn: 12000,
          tokensOut: 4500,
          durationMs: 3400,
          costUsd: 0.045,
          retries: 1,
        },
        tools: [{ name: "run_command" }, { name: "read_file" }],
      };

      const inputs: IoPort[] = [
        {
          node: "node-in-1",
          kind: "artifact",
          label: "Input AST Specifications",
          tokens: 500,
          preview: "const spec = { valid: true };",
        },
      ];

      const outputs: IoPort[] = [
        {
          node: "node-out-1",
          kind: "decision",
          label: "Validation Gate Decision",
          tokens: 200,
          preview: "STATUS: PASS",
        },
      ];

      const namesMap = new Map<string, string>([
        ["node-in-1", "Parser Agent"],
        ["node-out-1", "Reviewer Critic"],
      ]);

      const html = renderToString(
        <OverviewTab node={testNode} inputs={inputs} outputs={outputs} nodeNamesById={namesMap} />,
      );

      expect(html.includes("Purpose")).toBe(true);
      expect(html.includes("Aggregates whole-graph execution metrics")).toBe(true);
      expect(html.includes("Metrics")).toBe(true);
      expect(html.includes("12k")).toBe(true);
      expect(html.includes("Input Streams")).toBe(true);
      expect(html.includes("Input AST Specifications")).toBe(true);
      expect(html.includes("Parser Agent")).toBe(true);
      expect(html.includes("Output Streams")).toBe(true);
      expect(html.includes("Validation Gate Decision")).toBe(true);
      expect(html.includes("Reviewer Critic")).toBe(true);
      expect(html.includes("Tools")).toBe(true);
      expect(html.includes("run_command")).toBe(true);
    });
  });
});
