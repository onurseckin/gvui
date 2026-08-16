import { afterEach, describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describeNodeKind, describeNodeStatus } from "../../primitives/nodes/NodeCard/nodeKinds";
import type {
  CommandExecutionDetail,
  FileRef,
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  IoPort,
  MediaAsset,
} from "../../types/graphData";
import { DrawerSection } from "./DrawerSection";
import {
  copyToClipboard,
  edgeToPort,
  formatBytes,
  formatCost,
  formatDuration,
  formatTokens,
  getByteLength,
} from "./streamUtils";
import { IoStreamItem } from "./IoStreamItem";
import { LightboxDialog } from "./LightboxDialog";
import { AssetsTab } from "./tabs/AssetsTab";
import { CommandsTab, type ExtendedCommandExecutionDetail } from "./tabs/CommandsTab";
import { CommandDetailModal } from "./tabs/CommandDetailModal";
import { FilesTab } from "./tabs/FilesTab";
import { FindingsTab } from "./tabs/FindingsTab";
import { IoTab } from "./tabs/IoTab";
import { OverviewTab } from "./tabs/OverviewTab";
import { CostTab, formatDetailedUsd } from "./tabs/CostTab";
import {
  SubagentLineageTree,
  calculateLineageMetrics,
  collectAllNodeIds,
  describeLineageStatus,
  extractLineageTree,
  flattenLineageTree,
  normalizeRole,
  type SubagentLineageNode,
} from "./tabs/SubagentLineageTree";
import {
  describeProvenanceStatus,
  formatTimestamp,
  formatTokenPreview,
  ProvenanceTimeline,
} from "./tabs/ProvenanceTimeline";
import { RawProvenanceTab } from "./tabs/RawProvenanceTab";
import { DiffViewer, calculateDiffStats, parseUnifiedDiff } from "./DiffViewer";
import { DiffsTab } from "./tabs/DiffsTab";
import {
  AdversarialQuoteBox,
  ErrorInspector,
  FindingDetailCard,
  RemediationPatchViewer,
  StackTraceViewer,
  extractAuditQuotes,
  extractRemediationPatches,
  extractStructuredErrors,
  parseStackTrace,
  type PushbackFindingItem,
  type StructuredError,
} from "./tabs/ErrorInspector";
import { DependenciesTab, formatImpactReport } from "./tabs/DependenciesTab";
import {
  ImpactGraph,
  analyzeNodeDependencies,
  calculateTopologicalLevels,
  detectGraphCycles,
  extractNodeFailureReason,
} from "./tabs/ImpactGraph";

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
    files: [
      {
        path: "src/engine/planner.ts",
        mode: "write",
        additions: 45,
        deletions: 12,
      },
    ],
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

  describe("streamUtils formatter utilities & finite guards", () => {
    test("formats 0 and invalid/non-finite byte values gracefully", () => {
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(-10)).toBe("0 B");
      expect(formatBytes(Number.NaN)).toBe("0 B");
      expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
      expect(formatBytes(Number.NEGATIVE_INFINITY)).toBe("0 B");
      expect(formatBytes(undefined as unknown as number)).toBe("0 B");
      expect(formatBytes("1024" as unknown as number)).toBe("0 B");
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

    test("formats tokens with strict non-finite guards and compact notation", () => {
      expect(formatTokens(0)).toBe("0");
      expect(formatTokens(-500)).toBe("0");
      expect(formatTokens(Number.NaN)).toBe("0");
      expect(formatTokens(Number.POSITIVE_INFINITY)).toBe("0");
      expect(formatTokens(Number.NEGATIVE_INFINITY)).toBe("0");
      expect(formatTokens(undefined as unknown as number)).toBe("0");
      expect(formatTokens("5000" as unknown as number)).toBe("0");

      expect(formatTokens(500)).toBe("500");
      expect(formatTokens(1500)).toBe("1.5k");
      expect(formatTokens(12400)).toBe("12k");
      expect(formatTokens(2500000)).toBe("2.5M");
      expect(formatTokens(15000000)).toBe("15M");
    });

    test("formats duration with strict non-finite guards and millisecond/minute notation", () => {
      expect(formatDuration(0)).toBe("0ms");
      expect(formatDuration(-100)).toBe("0ms");
      expect(formatDuration(Number.NaN)).toBe("0ms");
      expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0ms");
      expect(formatDuration(Number.NEGATIVE_INFINITY)).toBe("0ms");
      expect(formatDuration(undefined as unknown as number)).toBe("0ms");
      expect(formatDuration("1000" as unknown as number)).toBe("0ms");

      expect(formatDuration(450)).toBe("450ms");
      expect(formatDuration(2300)).toBe("2.3s");
      expect(formatDuration(9400)).toBe("9.4s");
      expect(formatDuration(15000)).toBe("15s");
      expect(formatDuration(60000)).toBe("1m");
      expect(formatDuration(125000)).toBe("2m 5s");
    });

    test("formats cost with strict non-finite guards and USD notation", () => {
      expect(formatCost(0)).toBe("$0");
      expect(formatCost(-5)).toBe("$0");
      expect(formatCost(Number.NaN)).toBe("$0");
      expect(formatCost(Number.POSITIVE_INFINITY)).toBe("$0");
      expect(formatCost(Number.NEGATIVE_INFINITY)).toBe("$0");
      expect(formatCost(undefined as unknown as number)).toBe("$0");
      expect(formatCost("1.5" as unknown as number)).toBe("$0");

      expect(formatCost(0.005)).toBe("$0.0050");
      expect(formatCost(0.041)).toBe("$0.041");
      expect(formatCost(1.25)).toBe("$1.25");
      expect(formatCost(12.5)).toBe("$12.50");
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

    test("renders word count and token estimation chips when tokens are not explicitly provided", () => {
      const untokenizedPort: IoPort = {
        node: "node-code",
        kind: "artifact",
        label: "Raw Code Snippet",
        preview: "function calculateMetrics() {\n  return { ok: true };\n}",
      };

      const html = renderToString(
        <IoStreamItem port={untokenizedPort} direction="out" defaultExpanded={true} />,
      );

      expect(html.includes("words")).toBe(true);
      expect(html.includes("drawer-stream-chip--words")).toBe(true);
      expect(html.includes("drawer-stream-chip--tokens")).toBe(true);
      expect(html.includes("tok")).toBe(true);
      expect(html.includes("Copy")).toBe(true);
    });
  });

  describe("IoTab dedicated stream view", () => {
    test("renders input and output streams when present", () => {
      const inPort: IoPort = {
        node: "node-1",
        kind: "prompt",
        label: "System Prompt",
        tokens: 120,
        preview: "Perform static analysis",
      };
      const outPort: IoPort = {
        node: "node-2",
        kind: "decision",
        label: "Analysis Result",
        tokens: 80,
        preview: "PASS",
      };
      const names = new Map<string, string>([
        ["node-1", "Orchestrator"],
        ["node-2", "Validator Gate"],
      ]);

      const html = renderToString(
        <IoTab inputs={[inPort]} outputs={[outPort]} nodeNamesById={names} />,
      );

      expect(html.includes("Input Streams")).toBe(true);
      expect(html.includes("System Prompt")).toBe(true);
      expect(html.includes("Orchestrator")).toBe(true);
      expect(html.includes("Output Streams")).toBe(true);
      expect(html.includes("Analysis Result")).toBe(true);
      expect(html.includes("Validator Gate")).toBe(true);
    });

    test("renders standardized drawer-empty-state when no streams exist", () => {
      const html = renderToString(<IoTab inputs={[]} outputs={[]} nodeNamesById={new Map()} />);
      expect(html.includes("drawer-empty-state")).toBe(true);
      expect(html.includes("No input or output streams recorded for this node.")).toBe(true);
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
      expect(html.includes("Execution Metrics")).toBe(true);
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

    test("renders rich telemetry cards: reasoning tokens in indigo, timing breakdown, cost, and repair rounds warning", () => {
      const richNode: GraphNodeData = {
        id: "node-telemetry",
        name: "Complex Implementation Agent",
        metrics: {
          tokensIn: 14200,
          tokensOut: 3800,
          tokens: {
            promptTokens: 14200,
            completionTokens: 3800,
            reasoningTokens: 8400,
          },
          timingBreakdown: {
            wallDurationMs: 9500,
            toolDurationMs: 4200,
            thinkDurationMs: 8300,
          },
          costUsd: 0.0142,
          repairRounds: 2,
        },
        hostAgent: {
          tool: "Antigravity CLI",
          model: "gemini-2.5-flash",
          tier: "s",
          reasoningEffort: "High",
        },
      };

      const html = renderToString(
        <OverviewTab node={richNode} inputs={[]} outputs={[]} nodeNamesById={new Map()} />,
      );

      expect(html.includes("Execution Metrics")).toBe(true);
      expect(html.includes("Tokens In")).toBe(true);
      expect(html.includes("14k")).toBe(true);
      expect(html.includes("Tokens Out")).toBe(true);
      expect(html.includes("3.8k")).toBe(true);
      expect(html.includes("Cognitive Tokens")).toBe(true);
      expect(html.includes("8.4k")).toBe(true);
      expect(html.includes("drawer-metric--thinking")).toBe(true);
      expect(html.includes("Duration &amp; Memory Footprint")).toBe(true);
      expect(html.includes("&amp;amp;")).toBe(false);
      expect(html.includes("9.5s")).toBe(true);
      expect(html.includes("Active Cmds")).toBe(true);
      expect(html.includes("4.2s")).toBe(true);
      expect(html.includes("Think Time")).toBe(true);
      expect(html.includes("8.3s")).toBe(true);
      expect(html.includes("Cost")).toBe(true);
      expect(html.includes("$0.014")).toBe(true);
      expect(html.includes("Repair Rounds")).toBe(true);
      expect(html.includes("drawer-metric--warn")).toBe(true);
      expect(html.includes("2")).toBe(true);

      // Host Agent Card
      expect(html.includes("Host Agent Attribution")).toBe(true);
      expect(html.includes("Antigravity CLI")).toBe(true);
      expect(html.includes("gemini-2.5-flash")).toBe(true);
      expect(html.includes("Tier S")).toBe(true);
      expect(html.includes("tier-s")).toBe(true);
      expect(html.includes("Thinking Level: High")).toBe(true);
      expect(html.includes("Repair Attempts: 2")).toBe(true);
      expect(html.includes("8.4k Cognitive Tokens")).toBe(true);
    });

    test("renders humanized status pills in OverviewTab with strict mutual exclusion between Clean Execution and Validation Pushback", () => {
      // Case 1: All commands succeed, no repair rounds -> Clean execution only
      const cleanNode: GraphNodeData = {
        id: "clean-node",
        name: "Clean Worker",
        status: "success",
        metadata: {
          repairRounds: 0,
          commands: [
            {
              id: "c1",
              argv: ["bun", "test"],
              cwd: "/app",
              exitCode: 0,
              durationMs: 500,
              startedAt: "2026-08-15T00:00:00.000Z",
              finishedAt: "2026-08-15T00:00:00.500Z",
            },
          ],
        },
      };

      const cleanHtml = renderToString(
        <OverviewTab node={cleanNode} inputs={[]} outputs={[]} nodeNamesById={new Map()} />,
      );
      expect(cleanHtml.includes("✅ Verified Clean Execution")).toBe(true);
      expect(cleanHtml.includes("is-success")).toBe(true);
      expect(cleanHtml.includes("⚠️ Validation Gate Pushback")).toBe(false);
      expect(cleanHtml.includes("is-error")).toBe(false);

      // Case 2: Commands failed -> Pushback only
      const pushbackNode: GraphNodeData = {
        id: "pushback-node",
        name: "Failing Worker",
        status: "error",
        metadata: {
          repairRounds: 1,
          commands: [
            {
              id: "c2",
              argv: ["bun", "test"],
              cwd: "/app",
              exitCode: 1,
              durationMs: 800,
              startedAt: "2026-08-15T00:00:00.000Z",
              finishedAt: "2026-08-15T00:00:00.800Z",
            },
          ],
        },
      };

      const pushbackHtml = renderToString(
        <OverviewTab node={pushbackNode} inputs={[]} outputs={[]} nodeNamesById={new Map()} />,
      );
      expect(pushbackHtml.includes("⚠️ Validation Gate Pushback")).toBe(true);
      expect(pushbackHtml.includes("is-error")).toBe(true);
      expect(pushbackHtml.includes("✅ Verified Clean Execution")).toBe(false);
      expect(pushbackHtml.includes("is-success")).toBe(false);

      // Case 3: Adversarial collision test: Passing commands (exit 0) but repairRounds > 0 -> Must be Pushback only
      const repairCollisionNode: GraphNodeData = {
        id: "collision-node",
        name: "Repaired Worker",
        status: "warning",
        metadata: {
          repairRounds: 2,
          commands: [
            {
              id: "c3",
              argv: ["bun", "test"],
              cwd: "/app",
              exitCode: 0,
              durationMs: 400,
              startedAt: "2026-08-15T00:00:00.000Z",
              finishedAt: "2026-08-15T00:00:00.400Z",
            },
          ],
        },
      };

      const collisionHtml = renderToString(
        <OverviewTab
          node={repairCollisionNode}
          inputs={[]}
          outputs={[]}
          nodeNamesById={new Map()}
        />,
      );
      expect(collisionHtml.includes("⚠️ Validation Gate Pushback")).toBe(true);
      expect(collisionHtml.includes("✅ Verified Clean Execution")).toBe(false);
    });

    test("renders memory footprint and cognitive token counts in OverviewTab", () => {
      const memNode: GraphNodeData = {
        id: "mem-node",
        name: "Memory Heavy Node",
        metrics: {
          durationMs: 12000,
          memoryMb: 256,
          cognitiveTokens: 15400,
        },
        metadata: {
          thinkingLevel: "Deep Reasoning",
          hostModel: "claude-3-7-sonnet",
        },
      };

      const html = renderToString(
        <OverviewTab node={memNode} inputs={[]} outputs={[]} nodeNamesById={new Map()} />,
      );
      expect(html.includes("256 MB")).toBe(true);
      expect(html.includes("15k")).toBe(true);
      expect(html.includes("Cognitive Tokens")).toBe(true);
      expect(html.includes("Thinking Level: Deep Reasoning")).toBe(true);
      expect(html.includes("claude-3-7-sonnet")).toBe(true);
    });
  });

  describe("AssetsTab & LightboxDialog asset gallery", () => {
    test("renders asset gallery cards and playwright test execution summary", async () => {
      const assetNode: GraphNodeData = {
        id: "node-validator-1",
        name: "UI Verification Validator",
        kind: "gate",
        status: "success",
        metadata: {
          playwrightMetadata: {
            testFile: "tests/e2e/nodeDrawer.spec.ts",
            status: "passed",
            browser: "chromium",
            viewport: { width: 1280, height: 720 },
            durationMs: 3450,
          },
          mediaAssets: [
            {
              id: "asset-1",
              type: "image",
              url: "/screenshots/node-drawer-full.png",
              title: "Full Node Drawer Expanded",
              description: "High-resolution screenshot of open node drawer with 5 tabs",
              dimensions: { width: 1280, height: 720 },
              sizeBytes: 1024 * 120,
              step: 3,
            },
            {
              id: "asset-2",
              type: "video",
              url: "/videos/validation-run.webm",
              title: "Playwright E2E Run Video",
              description: "Full viewport interaction recording",
              sizeBytes: 1024 * 1024 * 3,
              step: 3,
            },
          ],
        },
      };

      const html = renderToString(<AssetsTab node={assetNode} />);

      expect(html.includes("Playwright Test Suite Execution")).toBe(true);
      expect(html.includes("tests/e2e/nodeDrawer.spec.ts")).toBe(true);
      expect(html.includes("Passed")).toBe(true);
      expect(html.includes("chromium")).toBe(true);
      expect(html.includes("1280")).toBe(true);
      expect(html.includes("720")).toBe(true);
      expect(html.includes("Validator Media") && html.includes("Inspection Assets")).toBe(true);
      expect(html.includes("Full Node Drawer Expanded")).toBe(true);
      expect(html.includes("Playwright E2E Run Video")).toBe(true);
      expect(html.includes("120.0 KB")).toBe(true);
      expect(html.includes("3.0 MB")).toBe(true);
    });

    test("renders asset filter buttons: All, Screenshots, Diagrams, Documents, Logs", () => {
      const filterNode: GraphNodeData = {
        id: "node-filter-test",
        name: "Filter Test Node",
        mediaAssets: [
          {
            id: "a1",
            type: "screenshot",
            url: "/screenshots/view.png",
            title: "Drawer Screenshot",
            sizeBytes: 1024 * 50,
          },
          {
            id: "a2",
            type: "diagram",
            url: "/diagrams/arch.svg",
            title: "Architecture Diagram",
            sizeBytes: 1024 * 12,
          },
          {
            id: "a3",
            type: "document",
            url: "/docs/spec.md",
            title: "Design Specification",
            sizeBytes: 1024 * 5,
          },
          {
            id: "a4",
            type: "log",
            url: "/logs/run.log",
            title: "Playwright Test Log",
            sizeBytes: 1024 * 8,
          },
        ],
      };

      const html = renderToString(<AssetsTab node={filterNode} />);

      expect(html.includes("All (4)")).toBe(true);
      expect(html.includes("Screenshots (1)")).toBe(true);
      expect(html.includes("Diagrams (1)")).toBe(true);
      expect(html.includes("Documents (1)")).toBe(true);
      expect(html.includes("Logs (1)")).toBe(true);
    });

    test("renders LightboxDialog with zoom controls, keyboard hints, and metadata sidebar", () => {
      const testAssets = [
        {
          id: "lightbox-img-1",
          type: "image",
          url: "/screenshots/active-edge-traffic.png",
          title: "Active Edge Traffic Inspector",
          description: "Chronology of high-traffic edge packets",
          author: "worker-t03",
          timestamp: "2026-08-15T00:00:00.000Z",
          dimensions: { width: 1920, height: 1080 },
          sizeBytes: 1024 * 450,
          mimeType: "image/png",
          step: 2,
        },
      ];

      const html = renderToString(
        <LightboxDialog isOpen={true} assets={testAssets} initialIndex={0} onClose={() => {}} />,
      );

      expect(html.includes("Active Edge Traffic Inspector")).toBe(true);
      expect(html.includes("drawer-lightbox-overlay")).toBe(true);
      expect(html.includes("1 of 1")).toBe(true);
      expect(html.includes("1920") && html.includes("1080")).toBe(true);
      expect(html.includes("450.0 KB")).toBe(true);
      expect(html.includes("Zoom In")).toBe(true);
      expect(html.includes("Reset Zoom")).toBe(true);
      expect(html.includes("100%")).toBe(true);
      expect(html.includes("Asset Details")).toBe(true);
      expect(html.includes("worker-t03")).toBe(true);
      expect(html.includes("image/png")).toBe(true);
      expect(html.includes("Step 2")).toBe(true);
      expect(html.includes("Download Asset")).toBe(true);
    });

    test("handles zoom in, zoom out, and reset button disabled states at 100% and 400% zoom boundaries", () => {
      const testAssets: MediaAsset[] = [
        {
          id: "lightbox-img-1",
          type: "image",
          url: "/screenshots/active-edge-traffic.png",
          title: "Active Edge Traffic Inspector",
        },
      ];

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <LightboxDialog isOpen={true} assets={testAssets} initialIndex={0} onClose={() => {}} />,
        );
      });

      const getZoomInBtn = () => renderer.root.findByProps({ "aria-label": "Zoom in" });
      const getZoomOutBtn = () => renderer.root.findByProps({ "aria-label": "Zoom out" });
      const getResetBtn = () => renderer.root.findByProps({ "aria-label": "Reset zoom" });

      // Initial state at 100%: Zoom Out and Reset are disabled, Zoom In is enabled
      expect(getZoomOutBtn().props.disabled).toBe(true);
      expect(getZoomOutBtn().props["aria-disabled"]).toBe(true);
      expect(getResetBtn().props.disabled).toBe(true);
      expect(getResetBtn().props["aria-disabled"]).toBe(true);
      expect(getZoomInBtn().props.disabled).toBe(false);
      expect(getZoomInBtn().props["aria-disabled"]).toBe(false);

      // Zoom in up to 400% (initial 1.0 -> 1.5 -> 2.0 -> 2.5 -> 3.0 -> 3.5 -> 4.0 = 6 clicks)
      for (let i = 0; i < 6; i++) {
        act(() => {
          getZoomInBtn().props.onClick();
        });
      }

      // At 400%: Zoom In is disabled, Zoom Out is enabled, Reset is enabled
      expect(getZoomInBtn().props.disabled).toBe(true);
      expect(getZoomInBtn().props["aria-disabled"]).toBe(true);
      expect(getZoomOutBtn().props.disabled).toBe(false);
      expect(getZoomOutBtn().props["aria-disabled"]).toBe(false);
      expect(getResetBtn().props.disabled).toBe(false);
      expect(getResetBtn().props["aria-disabled"]).toBe(false);

      // Reset zoom
      act(() => {
        getResetBtn().props.onClick();
      });

      // Back at 100%: Zoom Out and Reset disabled, Zoom In enabled
      expect(getZoomOutBtn().props.disabled).toBe(true);
      expect(getZoomOutBtn().props["aria-disabled"]).toBe(true);
      expect(getResetBtn().props.disabled).toBe(true);
      expect(getResetBtn().props["aria-disabled"]).toBe(true);
      expect(getZoomInBtn().props.disabled).toBe(false);
      expect(getZoomInBtn().props["aria-disabled"]).toBe(false);

      act(() => renderer.unmount());
    });

    test("clamps pan offset during dragging to bounded limits based on zoom level", () => {
      const testAssets: MediaAsset[] = [
        {
          id: "lightbox-img-1",
          type: "image",
          url: "/screenshots/active-edge-traffic.png",
          title: "Active Edge Traffic Inspector",
        },
      ];

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <LightboxDialog isOpen={true} assets={testAssets} initialIndex={0} onClose={() => {}} />,
        );
      });

      const getZoomInBtn = () => renderer.root.findByProps({ "aria-label": "Zoom in" });

      // Zoom in to 2.0x (2 clicks: 1.0 -> 1.5 -> 2.0)
      act(() => {
        getZoomInBtn().props.onClick();
      });
      act(() => {
        getZoomInBtn().props.onClick();
      });

      const viewport = renderer.root.findByProps({
        className: "drawer-lightbox-viewport is-zoomed",
      });

      // Mouse down to start panning
      act(() => {
        viewport.props.onMouseDown({ clientX: 100, clientY: 100 });
      });

      // Mouse move far beyond bound (e.g. clientX: 10000, clientY: -10000)
      // At zoom 2, maxOffset = 2 * 800 = 1600
      act(() => {
        viewport.props.onMouseMove({ clientX: 10000, clientY: -10000 });
      });

      const imageWrap = renderer.root.findByProps({
        className: "drawer-lightbox-image-wrap",
      });

      // transform style should be clamped to 1600px and -1600px
      expect(imageWrap.props.style.transform).toBe("translate(1600px, -1600px) scale(2)");

      // Mouse up to end panning
      act(() => {
        viewport.props.onMouseUp();
      });

      act(() => renderer.unmount());
    });

    test("handles broken image in LightboxDialog with clean fallback error banner", () => {
      const testAssets: MediaAsset[] = [
        {
          id: "broken-img-1",
          type: "image",
          url: "https://invalid-host.example.com/nonexistent.png",
          title: "Broken Screenshot",
        },
      ];

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <LightboxDialog isOpen={true} assets={testAssets} initialIndex={0} onClose={() => {}} />,
        );
      });

      // Find the image element
      const img = renderer.root.findByType("img");
      expect(img).toBeDefined();

      // Trigger onError
      act(() => {
        img.props.onError();
      });

      // Verify the fallback is rendered instead of img
      const json = JSON.stringify(renderer.toJSON());
      expect(json.includes("drawer-lightbox-fallback")).toBe(true);
      expect(json.includes("Image failed to load")).toBe(true);
      expect(json.includes("could not be loaded or is unreachable")).toBe(true);
      expect(json.includes("Open direct URL")).toBe(true);

      act(() => renderer.unmount());
    });

    test("handles broken thumbnail in AssetsTab with clean placeholder fallback", () => {
      const brokenAssetNode: GraphNodeData = {
        id: "node-broken-asset",
        name: "Broken Asset Node",
        mediaAssets: [
          {
            id: "broken-thumb-1",
            type: "image",
            url: "https://invalid-host.example.com/thumb.png",
            title: "Unreachable Image",
          },
        ],
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<AssetsTab node={brokenAssetNode} />);
      });

      const img = renderer.root.findByType("img");
      expect(img).toBeDefined();

      // Trigger thumbnail onError
      act(() => {
        img.props.onError();
      });

      const json = JSON.stringify(renderer.toJSON());
      expect(json.includes("drawer-asset-thumb-placeholder--error")).toBe(true);
      expect(json.includes("Failed to load")).toBe(true);

      act(() => renderer.unmount());
    });

    test("renders standardized drawer-empty-state in AssetsTab when no assets match", () => {
      const emptyAssetNode: GraphNodeData = {
        id: "node-no-assets",
        name: "Empty Asset Node",
        mediaAssets: [],
      };

      const html = renderToString(<AssetsTab node={emptyAssetNode} />);
      expect(html.includes("drawer-empty-state")).toBe(true);
      expect(html.includes("No assets or media artifacts recorded for this node.")).toBe(true);
    });

    test("renders visual preview tiles for all asset types (screenshots, diagrams, PDFs, code files, logs, markdown docs)", () => {
      const allTypesNode: GraphNodeData = {
        id: "node-all-asset-types",
        name: "Multi-Asset Verification Node",
        mediaAssets: [
          {
            id: "asset-screenshot-1",
            type: "screenshot",
            url: "/screenshots/drawer-view.png",
            title: "Drawer Full Screenshot",
            sizeBytes: 1024 * 80,
            step: 1,
          },
          {
            id: "asset-diagram-1",
            type: "diagram",
            url: "/diagrams/system-arch.svg",
            title: "System Architecture Flow",
            sizeBytes: 1024 * 18,
            step: 2,
          },
          {
            id: "asset-pdf-1",
            type: "pdf",
            url: "/docs/specification.pdf",
            title: "Architecture Specification PDF",
            description: "Full architectural specification document",
            sizeBytes: 1024 * 512,
            step: 2,
          },
          {
            id: "asset-code-1",
            type: "code",
            url: "src/engine/layout.ts",
            title: "Layout Engine Code",
            description: "export function computeLayout() { return true; }",
            sizeBytes: 1024 * 4,
            step: 3,
          },
          {
            id: "asset-log-1",
            type: "log",
            url: "/logs/audit-runner.log",
            title: "Audit Runner Output Log",
            description: "2026-08-15 [INFO] Audit pass completed with 0 warnings",
            sizeBytes: 1024 * 6,
            step: 3,
          },
          {
            id: "asset-md-1",
            type: "markdown",
            url: "/docs/GUIDE.md",
            title: "Developer Guide Document",
            description: "# Developer Guide\nInstructions for long task harness.",
            sizeBytes: 1024 * 3,
            step: 4,
          },
        ],
      };

      const html = renderToString(<AssetsTab node={allTypesNode} />);

      // Verify all card types and badges
      expect(html.includes("Drawer Full Screenshot")).toBe(true);
      expect(html.includes("System Architecture Flow")).toBe(true);
      expect(html.includes("Architecture Specification PDF")).toBe(true);
      expect(html.includes("Layout Engine Code")).toBe(true);
      expect(html.includes("Audit Runner Output Log")).toBe(true);
      expect(html.includes("Developer Guide Document")).toBe(true);

      // Verify specialized preview tiles placeholders
      expect(html.includes("drawer-asset-thumb-placeholder--pdf")).toBe(true);
      expect(html.includes("drawer-asset-thumb-placeholder--code")).toBe(true);
      expect(html.includes("drawer-asset-thumb-placeholder--log")).toBe(true);
      expect(html.includes("drawer-asset-thumb-placeholder--markdown")).toBe(true);

      // Verify type badges
      expect(html.includes("drawer-asset-type-badge--pdf")).toBe(true);
      expect(html.includes("drawer-asset-type-badge--code")).toBe(true);
      expect(html.includes("drawer-asset-type-badge--log")).toBe(true);
      expect(html.includes("drawer-asset-type-badge--markdown")).toBe(true);
      expect(html.includes("drawer-asset-type-badge--diagram")).toBe(true);
      expect(html.includes("drawer-asset-type-badge--screenshot")).toBe(true);

      // Verify descriptions and language chips
      expect(html.includes("TS")).toBe(true);
      expect(html.includes("LOG")).toBe(true);
      expect(html.includes("MD")).toBe(true);
      expect(html.includes("512.0 KB")).toBe(true);
    });

    test("AssetsTab interactive filter chip switching filters displayed asset cards", () => {
      const filterNode: GraphNodeData = {
        id: "node-filter-interact",
        name: "Filter Interactive Node",
        mediaAssets: [
          {
            id: "a-screen",
            type: "screenshot",
            url: "/screenshots/screen1.png",
            title: "Screenshot Alpha",
          },
          {
            id: "a-diag",
            type: "diagram",
            url: "/diagrams/diag1.svg",
            title: "Diagram Beta",
          },
          {
            id: "a-doc",
            type: "document",
            url: "/docs/doc1.md",
            title: "Document Gamma",
          },
          {
            id: "a-log",
            type: "log",
            url: "/logs/log1.log",
            title: "Log Delta",
          },
        ],
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<AssetsTab node={filterNode} />);
      });

      // Initially all 4 assets are present
      let json = JSON.stringify(renderer.toJSON());
      expect(json.includes("Screenshot Alpha")).toBe(true);
      expect(json.includes("Diagram Beta")).toBe(true);
      expect(json.includes("Document Gamma")).toBe(true);
      expect(json.includes("Log Delta")).toBe(true);

      // Find filter buttons
      const buttons = renderer.root.findAllByType("button");
      const screenshotBtn = buttons.find((b) => b.children.includes("Screenshots (1)"));
      expect(screenshotBtn).toBeDefined();

      // Click Screenshots filter
      act(() => {
        screenshotBtn?.props.onClick();
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json.includes("Screenshot Alpha")).toBe(true);
      expect(json.includes("Diagram Beta")).toBe(false);
      expect(json.includes("Document Gamma")).toBe(false);
      expect(json.includes("Log Delta")).toBe(false);

      // Click Diagrams filter
      const diagBtn = renderer.root
        .findAllByType("button")
        .find((b) => b.children.includes("Diagrams (1)"));
      expect(diagBtn).toBeDefined();
      act(() => {
        diagBtn?.props.onClick();
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json.includes("Screenshot Alpha")).toBe(false);
      expect(json.includes("Diagram Beta")).toBe(true);

      // Click All filter to restore
      const allBtn = renderer.root
        .findAllByType("button")
        .find((b) => b.children.includes("All (4)"));
      expect(allBtn).toBeDefined();
      act(() => {
        allBtn?.props.onClick();
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json.includes("Screenshot Alpha")).toBe(true);
      expect(json.includes("Diagram Beta")).toBe(true);
      expect(json.includes("Document Gamma")).toBe(true);
      expect(json.includes("Log Delta")).toBe(true);

      act(() => renderer.unmount());
    });

    test("LightboxDialog renders PDF rendering preview with toolbar, document title, and download link", () => {
      const pdfAssets: MediaAsset[] = [
        {
          id: "lightbox-pdf-1",
          type: "pdf",
          url: "https://example.com/spec-sheet.pdf",
          title: "System Architecture Specification",
          sizeBytes: 1024 * 350,
          author: "architect-t01",
          step: 2,
        },
      ];

      const html = renderToString(
        <LightboxDialog isOpen={true} assets={pdfAssets} initialIndex={0} onClose={() => {}} />,
      );

      expect(html.includes("drawer-lightbox-pdf-container")).toBe(true);
      expect(html.includes("drawer-lightbox-pdf-toolbar")).toBe(true);
      expect(html.includes("PDF Document")).toBe(true);
      expect(html.includes("System Architecture Specification")).toBe(true);
      expect(html.includes("drawer-lightbox-pdf-object")).toBe(true);
      expect(html.includes("drawer-lightbox-pdf-iframe")).toBe(true);
      expect(html.includes("350.0 KB")).toBe(true);
      expect(html.includes("architect-t01")).toBe(true);
      expect(html.includes("Download Asset")).toBe(true);
    });

    test("LightboxDialog renders syntax-highlighted code viewer with tokens, line numbers, language tag, and copy button", () => {
      const codeAssets: MediaAsset[] = [
        {
          id: "lightbox-code-1",
          type: "code",
          url: "src/engine/orchestrator.ts",
          title: "Orchestrator Source Code",
          description:
            'import { Engine } from "./engine";\nconst timeout = 5000;\nexport function executeTask() {\n  return 42;\n}',
          sizeBytes: 1024 * 2,
          step: 3,
        },
      ];

      const html = renderToString(
        <LightboxDialog isOpen={true} assets={codeAssets} initialIndex={0} onClose={() => {}} />,
      );

      expect(html.includes("drawer-lightbox-code-viewer")).toBe(true);
      expect(html.includes("drawer-lightbox-code-toolbar")).toBe(true);
      expect(html.includes("TS")).toBe(true);
      expect(html.includes("lines")).toBe(true);
      expect(html.includes("4")).toBe(true);
      expect(html.includes("drawer-code-table")).toBe(true);
      expect(html.includes("drawer-code-lineno")).toBe(true);
      expect(html.includes("token-keyword")).toBe(true);
      expect(html.includes("import")).toBe(true);
      expect(html.includes("export")).toBe(true);
      expect(html.includes("function")).toBe(true);
      expect(html.includes("token-string")).toBe(true);
      expect(html.includes("token-number")).toBe(true);
      expect(html.includes("5000")).toBe(true);
      expect(html.includes("42")).toBe(true);
      expect(html.includes("Copy")).toBe(true);
    });

    test("LightboxDialog renders syntax-highlighted log viewer with log level badges (ERROR, WARN, INFO, DEBUG), timestamps, and copy button", () => {
      const logAssets: MediaAsset[] = [
        {
          id: "lightbox-log-1",
          type: "log",
          url: "logs/e2e-playwright.log",
          title: "Playwright E2E Log Stream",
          description:
            "2026-08-15 08:30:00 [INFO] Suite initialization started\n2026-08-15 08:30:01 [WARN] Resource consumption threshold near 80%\n2026-08-15 08:30:02 [ERROR] Assertion failed in drawer.spec.ts:42",
          sizeBytes: 1024 * 5,
        },
      ];

      const html = renderToString(
        <LightboxDialog isOpen={true} assets={logAssets} initialIndex={0} onClose={() => {}} />,
      );

      expect(html.includes("drawer-lightbox-code-viewer")).toBe(true);
      expect(html.includes("LOG")).toBe(true);
      expect(html.includes("lines")).toBe(true);
      expect(html.includes("3")).toBe(true);
      expect(html.includes("token-timestamp")).toBe(true);
      expect(html.includes("token-log-level--info")).toBe(true);
      expect(html.includes("token-log-level--warn")).toBe(true);
      expect(html.includes("token-log-level--error")).toBe(true);
      expect(html.includes("Suite initialization started")).toBe(true);
      expect(html.includes("Assertion failed in drawer.spec.ts:42")).toBe(true);
    });

    test("LightboxDialog interactive code copy button copies text and displays Copied! feedback", async () => {
      let copiedText = "";
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (t: string) => {
              copiedText = t;
            },
          },
        },
        configurable: true,
        writable: true,
      });

      const codeAssets: MediaAsset[] = [
        {
          id: "code-copy-test",
          type: "code",
          url: "src/utils.ts",
          title: "Utils Module",
          description: "export const answer = 42;",
        },
      ];

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <LightboxDialog isOpen={true} assets={codeAssets} initialIndex={0} onClose={() => {}} />,
        );
      });

      const copyBtn = renderer.root.findByProps({ "aria-label": "Copy code content" });
      expect(copyBtn).toBeDefined();

      await act(async () => {
        await copyBtn.props.onClick();
      });

      expect(copiedText).toBe("export const answer = 42;");
      expect(JSON.stringify(renderer.toJSON())).toContain("Copied!");

      act(() => renderer.unmount());
    });

    test("LightboxDialog keyboard navigation (ArrowLeft / ArrowRight) and keyboard zoom shortcuts (+, -, 0)", () => {
      const multiAssets: MediaAsset[] = [
        {
          id: "item-1",
          type: "image",
          url: "/img/1.png",
          title: "First Asset",
        },
        {
          id: "item-2",
          type: "image",
          url: "/img/2.png",
          title: "Second Asset",
        },
      ];

      const keyListeners: Record<string, ((e: KeyboardEvent) => void)[]> = {};
      const originalWindow = globalThis.window;

      const mockWindow = {
        addEventListener: (event: string, fn: (e: KeyboardEvent) => void) => {
          keyListeners[event] = keyListeners[event] || [];
          keyListeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: (e: KeyboardEvent) => void) => {
          if (keyListeners[event]) {
            keyListeners[event] = keyListeners[event].filter((cb) => cb !== fn);
          }
        },
      };

      Object.defineProperty(globalThis, "window", {
        value: mockWindow,
        configurable: true,
        writable: true,
      });

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <LightboxDialog isOpen={true} assets={multiAssets} initialIndex={0} onClose={() => {}} />,
        );
      });

      const dispatchKey = (key: string) => {
        const ev = {
          key,
          stopPropagation: () => {},
          preventDefault: () => {},
        } as unknown as KeyboardEvent;
        for (const listener of keyListeners.keydown || []) {
          listener(ev);
        }
      };

      // Initial asset 1
      expect(JSON.stringify(renderer.toJSON())).toContain("First Asset");
      expect(JSON.stringify(renderer.toJSON())).toContain("1 of 2");

      // Dispatch ArrowRight
      act(() => {
        dispatchKey("ArrowRight");
      });
      expect(JSON.stringify(renderer.toJSON())).toContain("Second Asset");
      expect(JSON.stringify(renderer.toJSON())).toContain("2 of 2");

      // Dispatch ArrowLeft
      act(() => {
        dispatchKey("ArrowLeft");
      });
      expect(JSON.stringify(renderer.toJSON())).toContain("First Asset");

      // Dispatch '+' key to zoom in
      act(() => {
        dispatchKey("+");
      });
      expect(JSON.stringify(renderer.toJSON())).toContain("150%");

      // Dispatch '0' key to reset zoom
      act(() => {
        dispatchKey("0");
      });
      expect(JSON.stringify(renderer.toJSON())).toContain("100%");

      act(() => renderer.unmount());

      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    });

    test("LightboxDialog toggles metadata inspector sidebar visibility", () => {
      const testAssets: MediaAsset[] = [
        {
          id: "meta-toggle-test",
          type: "image",
          url: "/img/shot.png",
          title: "Screenshot With Metadata",
          description: "Inspectable details sidebar",
          author: "agent-t03",
        },
      ];

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <LightboxDialog isOpen={true} assets={testAssets} initialIndex={0} onClose={() => {}} />,
        );
      });

      // Sidebar is initially visible
      expect(JSON.stringify(renderer.toJSON())).toContain("drawer-lightbox-sidebar");
      expect(JSON.stringify(renderer.toJSON())).toContain("Inspectable details sidebar");

      // Find toggle info button
      const toggleBtn = renderer.root.findByProps({ "aria-label": "Toggle metadata panel" });
      expect(toggleBtn).toBeDefined();

      // Click to hide sidebar
      act(() => {
        toggleBtn.props.onClick();
      });
      expect(JSON.stringify(renderer.toJSON())).not.toContain("drawer-lightbox-sidebar");

      // Click to show sidebar again
      act(() => {
        toggleBtn.props.onClick();
      });
      expect(JSON.stringify(renderer.toJSON())).toContain("drawer-lightbox-sidebar");

      act(() => renderer.unmount());
    });

    test("AssetsTab isDocument filter properly categorizes application/pdf, .pdf URLs, markdown docs, and code files", () => {
      const docCategoryNode: GraphNodeData = {
        id: "node-doc-cat-test",
        name: "Document Categorization Node",
        mediaAssets: [
          {
            id: "doc-pdf-mime",
            type: "document",
            mimeType: "application/pdf",
            url: "/api/files/download/12345",
            title: "Architecture PDF by MIME",
          },
          {
            id: "doc-pdf-ext",
            type: "pdf",
            url: "https://example.com/docs/specs.pdf?version=2",
            title: "Architecture PDF by Extension",
          },
          {
            id: "doc-markdown-file",
            type: "markdown",
            url: "/docs/DESIGN.md",
            title: "Design Markdown Document",
          },
          {
            id: "doc-code-file",
            type: "code",
            url: "src/engine/layout.ts",
            title: "Layout Engine Code File",
          },
          {
            id: "shot-standard",
            type: "screenshot",
            url: "/screenshots/view.png",
            title: "Actual Screenshot",
          },
        ],
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<AssetsTab node={docCategoryNode} />);
      });

      // Filter buttons should show Documents (4), Screenshots (1), All (5)
      const buttons = renderer.root.findAllByType("button");
      const docBtn = buttons.find((b) => b.children.includes("Documents (4)"));
      const screenshotBtn = buttons.find((b) => b.children.includes("Screenshots (1)"));
      const allBtn = buttons.find((b) => b.children.includes("All (5)"));

      expect(docBtn).toBeDefined();
      expect(screenshotBtn).toBeDefined();
      expect(allBtn).toBeDefined();

      // Click Documents filter chip
      act(() => {
        docBtn?.props.onClick();
      });

      let json = JSON.stringify(renderer.toJSON());
      expect(json.includes("Architecture PDF by MIME")).toBe(true);
      expect(json.includes("Architecture PDF by Extension")).toBe(true);
      expect(json.includes("Design Markdown Document")).toBe(true);
      expect(json.includes("Layout Engine Code File")).toBe(true);
      expect(json.includes("Actual Screenshot")).toBe(false);

      act(() => renderer.unmount());
    });

    test("LightboxDialog guards arrow navigation when only a single asset is present", () => {
      const singleAsset: MediaAsset[] = [
        {
          id: "solo-asset-1",
          type: "image",
          url: "/img/lone.png",
          title: "Lone Asset",
        },
      ];

      const keyListeners: Record<string, ((e: KeyboardEvent) => void)[]> = {};
      const originalWindow = globalThis.window;

      const mockWindow = {
        addEventListener: (event: string, fn: (e: KeyboardEvent) => void) => {
          keyListeners[event] = keyListeners[event] || [];
          keyListeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: (e: KeyboardEvent) => void) => {
          if (keyListeners[event]) {
            keyListeners[event] = keyListeners[event].filter((cb) => cb !== fn);
          }
        },
      };

      Object.defineProperty(globalThis, "window", {
        value: mockWindow,
        configurable: true,
        writable: true,
      });

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <LightboxDialog isOpen={true} assets={singleAsset} initialIndex={0} onClose={() => {}} />,
        );
      });

      const json = JSON.stringify(renderer.toJSON());
      expect(json.includes("Lone Asset")).toBe(true);
      expect(json.includes("1 of 1")).toBe(true);
      // No nav buttons rendered when assets.length === 1
      expect(json.includes("drawer-lightbox-nav-btn")).toBe(false);

      const dispatchKey = (key: string) => {
        const ev = {
          key,
          stopPropagation: () => {},
          preventDefault: () => {},
        } as unknown as KeyboardEvent;
        for (const listener of keyListeners.keydown || []) {
          listener(ev);
        }
      };

      // Dispatch ArrowRight and ArrowLeft on single asset
      act(() => {
        dispatchKey("ArrowRight");
        dispatchKey("ArrowLeft");
      });

      // Still displays the single asset without error or index shift
      expect(JSON.stringify(renderer.toJSON())).toContain("1 of 1");

      act(() => renderer.unmount());

      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    });

    test("LightboxDialog renders dedicated document preview card with direct link for generic documents", () => {
      const docAssets: MediaAsset[] = [
        {
          id: "generic-doc-1",
          type: "document",
          url: "https://example.com/reports/audit-summary.csv",
          title: "Audit Summary Data Table",
          description: "step,status,details\n1,pass,all systems nominal\n2,pass,gate approved",
          sizeBytes: 1024 * 8,
          author: "qa-lead",
        },
      ];

      const html = renderToString(
        <LightboxDialog isOpen={true} assets={docAssets} initialIndex={0} onClose={() => {}} />,
      );

      // Verify dedicated document preview card is rendered
      expect(html.includes("drawer-lightbox-doc-card")).toBe(true);
      expect(html.includes("drawer-lightbox-doc-header")).toBe(true);
      expect(html.includes("drawer-lightbox-doc-tag")).toBe(true);
      expect(html.includes("CSV")).toBe(true);
      expect(html.includes("Document")).toBe(true);
      expect(html.includes("Audit Summary Data Table")).toBe(true);
      expect(html.includes("step,status,details")).toBe(true);
      expect(html.includes("all systems nominal")).toBe(true);
      expect(html.includes("8.0 KB")).toBe(true);
      expect(html.includes("Copy")).toBe(true);
      expect(html.includes("drawer-lightbox-action-btn")).toBe(true);

      // Verify that no raw <img> tag is rendered for non-image document
      expect(html.includes("<img")).toBe(false);
    });
  });

  describe("CommandsTab CLI execution breakdown", () => {
    test("renders command cards with exit code pills, duration timers, and stdout/stderr snippets", () => {
      const cmdNode: GraphNodeData = {
        id: "node-cmd-test",
        name: "Test Runner Node",
        metadata: {
          commands: [
            {
              id: "cmd-success",
              argv: ["bun", "test", "src/components/Controls"],
              cwd: "/Users/dev/gvui",
              exitCode: 0,
              durationMs: 1420,
              startedAt: "2026-08-15T06:00:00.000Z",
              finishedAt: "2026-08-15T06:00:01.420Z",
              stdoutSnippet: "(pass) Controls > renders zoom controls [12ms]\n2 pass, 0 fail",
            },
            {
              id: "cmd-fail",
              argv: ["oxlint", "src/legacy"],
              cwd: "/Users/dev/gvui",
              exitCode: 1,
              durationMs: 380,
              startedAt: "2026-08-15T06:00:02.000Z",
              finishedAt: "2026-08-15T06:00:02.380Z",
              stderrSnippet: "Error: 2 lint failures in legacy code",
            },
          ],
        },
      };

      const html = renderToString(<CommandsTab node={cmdNode} />);

      expect(html.includes("Executed Commands")).toBe(true);
      expect(html.includes("✅ Verified Clean Execution (Exit 0)")).toBe(true);
      expect(html.includes("is-success")).toBe(true);
      expect(html.includes("⚠️ Validation Gate Pushback (Exit 1)")).toBe(true);
      expect(html.includes("is-error")).toBe(true);
      expect(html.includes("bun test src/components/Controls")).toBe(true);
      expect(html.includes("1.4s")).toBe(true);
      expect(html.includes("380ms")).toBe(true);
      expect(html.includes("stdout")).toBe(true);
      expect(html.includes("Controls") && html.includes("renders zoom controls")).toBe(true);
      expect(html.includes("stderr")).toBe(true);
      expect(html.includes("Error: 2 lint failures in legacy code")).toBe(true);
      expect(html.includes("CWD:")).toBe(true);
      expect(html.includes("/Users/dev/gvui")).toBe(true);
    });

    test("preserves distinct numeric exit codes (e.g. Exit 137 OOM, Exit 127) alongside humanized pushback badges", () => {
      const oomNode: GraphNodeData = {
        id: "node-oom-test",
        name: "OOM Worker",
        metadata: {
          commands: [
            {
              id: "cmd-oom",
              argv: ["bun", "run", "large-allocator.ts"],
              cwd: "/workspace",
              exitCode: 137,
              durationMs: 12500,
              startedAt: "2026-08-15T08:00:00.000Z",
              finishedAt: "2026-08-15T08:00:12.500Z",
              stderrSnippet: "Killed: Out of memory (exit 137)",
            },
            {
              id: "cmd-not-found",
              argv: ["nonexistent-binary"],
              cwd: "/workspace",
              exitCode: 127,
              durationMs: 50,
              startedAt: "2026-08-15T08:00:13.000Z",
              finishedAt: "2026-08-15T08:00:13.050Z",
              stderrSnippet: "command not found: nonexistent-binary",
            },
          ],
        },
      };

      const html = renderToString(<CommandsTab node={oomNode} />);

      expect(html.includes("⚠️ Validation Gate Pushback (Exit 137)")).toBe(true);
      expect(html.includes("⚠️ Validation Gate Pushback (Exit 127)")).toBe(true);
      expect(html.includes("Killed: Out of memory (exit 137)")).toBe(true);
      expect(html.includes("command not found: nonexistent-binary")).toBe(true);
    });

    test("renders duration & memory footprint, authentic host model, cognitive tokens, thinking level, and repair attempts on command cards", () => {
      const richCmdNode: GraphNodeData = {
        id: "node-rich-cmd",
        name: "Agent Executor",
        metadata: {
          commands: [
            // Bridge extended metadata properties for rich command execution
            {
              id: "cmd-rich-1",
              argv: ["bun", "run", "test:coverage"],
              cwd: "/workspace",
              exitCode: 0,
              durationMs: 5400,
              startedAt: "2026-08-15T07:00:00.000Z",
              finishedAt: "2026-08-15T07:00:05.400Z",
              memoryMb: 128,
              hostModel: "claude-3-5-sonnet",
              thinkingLevel: "High",
              cognitiveTokens: 4200,
              repairAttempt: 2,
            } as unknown as CommandExecutionDetail,
          ],
        },
      };

      const html = renderToString(<CommandsTab node={richCmdNode} />);

      expect(html.includes("✅ Verified Clean Execution")).toBe(true);
      expect(html.includes("5.4s")).toBe(true);
      expect(html.includes("128 MB")).toBe(true);
      expect(html.includes("claude-3-5-sonnet")).toBe(true);
      expect(html.includes("Thinking: High")).toBe(true);
      expect(html.includes("4.2k Cognitive Tokens")).toBe(true);
      expect(html.includes("Repair Attempt #2")).toBe(true);
    });

    test("renders standardized drawer-empty-state when no commands exist", () => {
      const emptyNode: GraphNodeData = {
        id: "node-empty-cmd",
        name: "Empty Command Node",
      };
      const html = renderToString(<CommandsTab node={emptyNode} />);
      expect(html.includes("drawer-empty-state")).toBe(true);
      expect(html.includes("No command executions recorded for this node.")).toBe(true);
    });
  });

  describe("CommandDetailModal & CommandsTab raw stream inspector", () => {
    const mockCommand: ExtendedCommandExecutionDetail = {
      id: "cmd-stream-inspector-01",
      argv: ["bun", "test", "src/components/NodeDetailDrawer"],
      cwd: "/Users/dev/gvui",
      exitCode: 0,
      durationMs: 1420,
      startedAt: "2026-08-15T09:00:00.000Z",
      finishedAt: "2026-08-15T09:00:01.420Z",
      stdoutSnippet: "(pass) NodeDetailDrawer > renders modal [12ms]\n2 pass, 0 fail",
      stderrSnippet: "warn: minor timing jitter",
      memoryMb: 256,
      hostModel: "claude-3-5-sonnet",
      thinkingLevel: "High",
      cognitiveTokens: 3840,
      repairAttempt: 1,
      recordPath: "commands/cmd-stream-inspector-01/record.json",
      evidencePath: "evidence/cmd-stream-inspector-01.json",
      environment: {
        NODE_ENV: "test",
        BUN_ENV: "test",
        CI: "true",
      },
    };

    const mockPushbackCommand: ExtendedCommandExecutionDetail = {
      id: "cmd-pushback-02",
      argv: ["bun", "run", "validate-all.ts"],
      cwd: "/workspace",
      exitCode: 137,
      durationMs: 8900,
      startedAt: "2026-08-15T09:10:00.000Z",
      finishedAt: "2026-08-15T09:10:08.900Z",
      stderrSnippet: "fatal error: runtime memory threshold exceeded (OOM exit 137)",
      hostModel: "o3-mini",
    };

    test("returns null when isOpen is false or command is null/undefined", () => {
      const htmlClosed = renderToString(
        <CommandDetailModal isOpen={false} command={mockCommand} onClose={() => {}} />,
      );
      expect(htmlClosed).toBe("");

      const htmlNoCmd = renderToString(
        <CommandDetailModal isOpen={true} command={null} onClose={() => {}} />,
      );
      expect(htmlNoCmd).toBe("");
    });

    test("renders full modal structure with verified exit code, duration, host model, tokens, record path, and stream snippets", () => {
      const html = renderToString(
        <CommandDetailModal isOpen={true} command={mockCommand} onClose={() => {}} />,
      );

      expect(html.includes("Command Stream Inspector")).toBe(true);
      expect(html.includes("cmd-stream-inspector-01")).toBe(true);
      expect(html.includes("commands/cmd-stream-inspector-01/record.json")).toBe(true);
      expect(html.includes("✅ Verified Clean Execution (Exit 0)")).toBe(true);
      expect(html.includes("1.4s")).toBe(true);
      expect(html.includes("256 MB")).toBe(true);
      expect(html.includes("claude-3-5-sonnet")).toBe(true);
      expect(html.includes("Thinking: High")).toBe(true);
      expect(html.includes("3.8k Cognitive Tokens")).toBe(true);
      expect(html.includes("Repair Attempt #1")).toBe(true);
      expect(html.includes("bun test src/components/NodeDetailDrawer")).toBe(true);
      expect(html.includes("/Users/dev/gvui")).toBe(true);
      expect(html.includes("Standard Output (stdout)")).toBe(true);
      expect(html.includes("renders modal [12ms]")).toBe(true);
      expect(html.includes("Standard Error (stderr)")).toBe(true);
      expect(html.includes("warn: minor timing jitter")).toBe(true);
      expect(html.includes("Copy Payload")).toBe(true);
    });

    test("renders pushback badges and failure notice for non-zero exit codes (e.g. exit 137)", () => {
      const html = renderToString(
        <CommandDetailModal isOpen={true} command={mockPushbackCommand} onClose={() => {}} />,
      );

      expect(html.includes("⚠️ Validation Gate Pushback (Exit 137)")).toBe(true);
      expect(html.includes("8.9s")).toBe(true);
      expect(html.includes("o3-mini")).toBe(true);
      expect(html.includes("fatal error: runtime memory threshold exceeded (OOM exit 137)")).toBe(
        true,
      );
      expect(html.includes("No stdout stream recorded for this command.")).toBe(true);
    });

    test("handles tab navigation between Formatted Streams, Raw Record (JSON), Execution Telemetry, and Environment", () => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <CommandDetailModal isOpen={true} command={mockCommand} onClose={() => {}} />,
        );
      });

      let json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Formatted Streams");
      expect(json).toContain("Standard Output (stdout)");
      expect(json).toContain("Standard Error (stderr)");

      // Switch to Raw Record (JSON) tab
      const recordTab = renderer.root.findByProps({ "data-tab": "record" });
      act(() => {
        recordTab.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Raw JSON Stream Record");
      expect(json).toContain("commands/cmd-stream-inspector-01/record.json");
      expect(json).toContain("trusted_host_observed_v1");
      expect(json).toContain("cognitive_tokens");

      // Switch to Execution Telemetry tab
      const metaTab = renderer.root.findByProps({ "data-tab": "metadata" });
      act(() => {
        metaTab.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Command Execution ID");
      expect(json).toContain("1420 ms");
      expect(json).toContain("evidence/cmd-stream-inspector-01.json");

      // Switch to Environment tab
      const envTab = renderer.root.findByProps({ "data-tab": "environment" });
      act(() => {
        envTab.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Environment Variables");
      expect(json).toContain("NODE_ENV");
      expect(json).toContain("BUN_ENV");

      act(() => renderer.unmount());
    });

    test("handles interactive copy actions across all stream inspector tabs", async () => {
      const copiedTexts: string[] = [];
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (t: string) => {
              copiedTexts.push(t);
            },
          },
        },
        configurable: true,
        writable: true,
      });

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <CommandDetailModal isOpen={true} command={mockCommand} onClose={() => {}} />,
        );
      });

      // 1. Copy command line
      const argvBtn = renderer.root.findByProps({ "aria-label": "Copy command line" });
      await act(async () => {
        await argvBtn.props.onClick({ stopPropagation: () => {} });
      });

      // 2. Copy stdout
      const stdoutBtn = renderer.root.findByProps({ "aria-label": "Copy stdout snippet" });
      await act(async () => {
        await stdoutBtn.props.onClick({ stopPropagation: () => {} });
      });

      // 3. Copy stderr
      const stderrBtn = renderer.root.findByProps({ "aria-label": "Copy stderr snippet" });
      await act(async () => {
        await stderrBtn.props.onClick({ stopPropagation: () => {} });
      });

      // 4. Copy CWD
      const cwdBtn = renderer.root.findByProps({ "aria-label": "Copy working directory" });
      await act(async () => {
        await cwdBtn.props.onClick({ stopPropagation: () => {} });
      });

      // 5. Copy raw JSON payload from header
      const payloadBtn = renderer.root.findByProps({ "aria-label": "Copy Raw JSON Record" });
      await act(async () => {
        await payloadBtn.props.onClick({ stopPropagation: () => {} });
      });

      expect(copiedTexts).toContain("bun test src/components/NodeDetailDrawer");
      expect(copiedTexts.some((c) => c.includes("renders modal [12ms]"))).toBe(true);
      expect(copiedTexts).toContain("warn: minor timing jitter");
      expect(copiedTexts).toContain("/Users/dev/gvui");
      expect(
        copiedTexts.some(
          (c) => c.includes("cmd-stream-inspector-01") && c.includes("trusted_host_observed_v1"),
        ),
      ).toBe(true);

      // Switch to Raw Record tab and copy from there
      const recordTab = renderer.root.findByProps({ "data-tab": "record" });
      act(() => {
        recordTab.props.onClick();
      });
      const rawJsonBtn = renderer.root.findByProps({ "aria-label": "Copy Raw JSON" });
      await act(async () => {
        await rawJsonBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(
        copiedTexts.some((c) => c.includes("commands/cmd-stream-inspector-01/record.json")),
      ).toBe(true);

      // Switch to Environment tab and copy env
      const envTab = renderer.root.findByProps({ "data-tab": "environment" });
      act(() => {
        envTab.props.onClick();
      });
      const envBtn = renderer.root.findByProps({ "aria-label": "Copy Environment Variables" });
      await act(async () => {
        await envBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(copiedTexts.some((c) => c.includes("NODE_ENV") && c.includes("BUN_ENV"))).toBe(true);

      act(() => renderer.unmount());
    });

    test("handles close actions via close button, overlay click, and Escape key", () => {
      let closeCalls = 0;
      const onClose = () => {
        closeCalls++;
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <CommandDetailModal isOpen={true} command={mockCommand} onClose={onClose} />,
        );
      });

      // 1. Close button click
      const closeBtn = renderer.root.findByProps({ "aria-label": "Close dialog" });
      act(() => {
        closeBtn.props.onClick();
      });
      expect(closeCalls).toBe(1);

      // 2. Escape key on overlay
      const overlay = renderer.root.findByProps({ className: "drawer-lightbox-overlay" });
      act(() => {
        overlay.props.onKeyDown({ key: "Escape", stopPropagation: () => {} });
      });
      expect(closeCalls).toBe(2);

      // 3. Click on backdrop
      act(() => {
        overlay.props.onClick({ target: "overlay", currentTarget: "overlay" });
      });
      expect(closeCalls).toBe(3);

      act(() => renderer.unmount());
    });

    test("CommandsTab integrates inspect trigger button and opens CommandDetailModal interactively", () => {
      const cmdNode: GraphNodeData = {
        id: "node-cmd-inspect-flow",
        name: "Command Execution Node",
        metadata: {
          commands: [mockCommand, mockPushbackCommand],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<CommandsTab node={cmdNode} />);
      });

      let json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Inspect");
      expect(json).toContain("cmd-stream-inspector-01");
      expect(json).toContain("cmd-pushback-02");

      // Before clicking Inspect, modal is not open
      expect(json).not.toContain("Command Stream Inspector");

      // Find Inspect button for first command
      const inspectBtn = renderer.root.findByProps({
        "aria-label": "Inspect command cmd-stream-inspector-01",
      });
      expect(inspectBtn).toBeDefined();

      act(() => {
        inspectBtn.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Command Stream Inspector");
      expect(json).toContain("Formatted Streams");
      expect(json).toContain("Standard Output (stdout)");
      expect(json).toContain("Standard Error (stderr)");
      expect(json).toContain("commands/cmd-stream-inspector-01/record.json");

      // Close modal
      const closeBtn = renderer.root.findByProps({ "aria-label": "Close dialog" });
      act(() => {
        closeBtn.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).not.toContain("Command Stream Inspector");

      act(() => renderer.unmount());
    });

    test("supports pre-formed rawRecord object in command execution detail", () => {
      const preformedRecord = {
        id: "cmd-preformed",
        actor: "custom-audit-agent",
        fingerprint: "sha256-preformed-12345",
        assurance: "high_assurance_sandbox_v2",
        status: "succeeded",
        exit_code: 0,
        custom_field: "verified_payload",
      };

      const customCmd: ExtendedCommandExecutionDetail = {
        id: "cmd-preformed",
        argv: ["bun", "run", "audit"],
        cwd: "/app",
        exitCode: 0,
        durationMs: 950,
        startedAt: "2026-08-15T10:00:00.000Z",
        finishedAt: "2026-08-15T10:00:00.950Z",
        rawRecord: preformedRecord,
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <CommandDetailModal isOpen={true} command={customCmd} onClose={() => {}} />,
        );
      });

      const recordTab = renderer.root.findByProps({ "data-tab": "record" });
      act(() => {
        recordTab.props.onClick();
      });

      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("sha256-preformed-12345");
      expect(json).toContain("high_assurance_sandbox_v2");
      expect(json).toContain("verified_payload");

      act(() => renderer.unmount());
    });

    test("finding-01-command-stream-stress: robust handling of huge stdout/stderr buffers, keyboard dismissal (Escape), and full copy payload validation", async () => {
      const copiedPayloads: string[] = [];
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (t: string) => {
              copiedPayloads.push(t);
            },
          },
        },
        configurable: true,
        writable: true,
      });

      // 1. Generate huge stream buffer (5000 lines)
      const hugeLines: string[] = [];
      for (let i = 1; i <= 5000; i++) {
        hugeLines.push(
          `[2026-08-15 10:00:${String(i % 60).padStart(2, "0")}] TRACE step #${i}: verified invariant subagent_execution_digest_${i}`,
        );
      }
      const hugeStdout = hugeLines.join("\n");

      const stressCommand: ExtendedCommandExecutionDetail = {
        id: "cmd-stress-huge-stream",
        argv: ["bun", "test", "--stress", "all"],
        cwd: "/workspace/gvui",
        exitCode: 0,
        durationMs: 45000,
        startedAt: "2026-08-15T10:00:00.000Z",
        finishedAt: "2026-08-15T10:00:45.000Z",
        stdout: hugeStdout,
        stderr: "", // clean stderr
        memoryMb: 1024,
        hostModel: "claude-3-5-sonnet",
        thinkingLevel: "High",
        cognitiveTokens: 64000,
        repairAttempt: 2,
        environment: {
          NODE_ENV: "production",
          MAX_BUFFER_SIZE: "67108864",
        },
      };

      let closed = false;
      let keydownListener: ((e: KeyboardEvent) => void) | null = null;
      const originalWindow = globalThis.window;
      const mockWindow = {
        addEventListener: (event: string, fn: (e: unknown) => void) => {
          if (event === "keydown") keydownListener = fn as (e: KeyboardEvent) => void;
        },
        removeEventListener: () => {},
      };

      Object.defineProperty(globalThis, "window", {
        value: mockWindow,
        configurable: true,
        writable: true,
      });

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <CommandDetailModal
            isOpen={true}
            command={stressCommand}
            onClose={() => {
              closed = true;
            }}
          />,
        );
      });

      // Check huge buffer metrics & clean stderr
      let json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("5000 lines");
      expect(json).toContain("45s");
      expect(json).toContain("1024 MB");
      expect(json).toContain("No stderr stream recorded for this command (clean stream)");

      // Test window global Escape key listener
      expect(keydownListener).not.toBeNull();
      let stopped = false;
      keydownListener!({
        key: "Escape",
        stopPropagation: () => {
          stopped = true;
        },
      } as unknown as KeyboardEvent);
      expect(stopped).toBe(true);
      expect(closed).toBe(true);

      // Test Raw JSON tab format toggle (Pretty <-> Compact)
      const recordTab = renderer.root.findByProps({ "data-tab": "record" });
      act(() => {
        recordTab.props.onClick();
      });

      const toggleJsonBtn = renderer.root.findByProps({ "aria-label": "Toggle JSON format" });
      expect(toggleJsonBtn).toBeDefined();

      // Switch to compact JSON
      act(() => {
        toggleJsonBtn.props.onClick();
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Pretty");

      // Copy compact JSON
      const copyJsonBtn = renderer.root.findByProps({ "aria-label": "Copy Raw JSON" });
      await act(async () => {
        await copyJsonBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(
        copiedPayloads.some((p) => p.includes("cmd-stress-huge-stream") && !p.includes("\n  ")),
      ).toBe(true);

      // Switch back to pretty JSON
      act(() => {
        toggleJsonBtn.props.onClick();
      });
      await act(async () => {
        await copyJsonBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(
        copiedPayloads.some((p) => p.includes("cmd-stress-huge-stream") && p.includes("\n  ")),
      ).toBe(true);

      act(() => renderer.unmount());
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    });
  });

  describe("FilesTab touched files and code diffs", () => {
    test("renders assigned write scope, file modes, churn badges, and line-level diff viewer", () => {
      const filesNode: GraphNodeData = {
        id: "node-files-test",
        name: "Refactor Agent",
        metadata: {
          writeScope: ["src/components/NodeDetailDrawer/"],
        },
        files: [
          {
            path: "src/components/NodeDetailDrawer/OverviewTab.tsx",
            mode: "write",
            additions: 142,
            deletions: 38,
            diff: "@@ -1,5 +1,12 @@\n-import { OldMetric } from './old';\n+import { RichMetric } from './rich';\n+import { HostCard } from './host';\n const unchanged = true;",
          },
          {
            path: "src/components/NodeDetailDrawer/LightboxDialog.tsx",
            mode: "create",
            additions: 88,
            deletions: 0,
          },
        ],
      };

      const html = renderToString(<FilesTab node={filesNode} />);

      expect(html.includes("Assigned Write Scope")).toBe(true);
      expect(html.includes("src/components/NodeDetailDrawer/")).toBe(true);
      expect(html.includes("Touched Files") && html.includes("Diffs")).toBe(true);
      expect(html.includes("mode-write")).toBe(true);
      expect(html.includes("mode-create")).toBe(true);
      expect(html.includes("+142")).toBe(true);
      expect(html.includes("-38")).toBe(true);
      expect(html.includes("+88")).toBe(true);
      expect(html.includes("drawer-diff-viewer")).toBe(true);
      expect(html.includes("drawer-diff-line--del")).toBe(true);
      expect(html.includes("drawer-diff-line--add")).toBe(true);
      expect(html.includes("drawer-diff-line--hunk")).toBe(true);
      expect(html.includes("drawer-diff-line--context")).toBe(true);
      expect(html.includes("import { RichMetric }")).toBe(true);
    });

    test("renders standardized drawer-empty-state when no files exist", () => {
      const emptyNode: GraphNodeData = {
        id: "node-empty-files",
        name: "Empty Files Node",
      };
      const html = renderToString(<FilesTab node={emptyNode} />);
      expect(html.includes("drawer-empty-state")).toBe(true);
      expect(html.includes("No file modifications recorded for this node.")).toBe(true);
    });
  });

  describe("FindingsTab & ErrorInspector validation feedback, stack traces & remediations", () => {
    test("renders repair rounds, findings cards with severity and resolution badges", () => {
      const findingsNode: GraphNodeData = {
        id: "node-findings-test",
        name: "Validation Node",
        metadata: {
          repairRounds: 1,
          findings: [
            {
              id: "finding-1",
              severity: "critical",
              status: "resolved",
              observation: "Missing error fallback handler",
              remediation: "Add onError handler to image viewer",
              requirementId: "req-01",
            },
            {
              id: "finding-2",
              severity: "important",
              status: "open",
              observation: "Inconsistent empty state styling",
              remediation: "Use standardized .drawer-empty-state class",
            },
          ],
        },
      };

      const html = renderToString(<FindingsTab node={findingsNode} />);
      expect(html.includes("Repair History")).toBe(true);
      expect(html.includes("Repair Rounds")).toBe(true);
      expect(html.includes("Quality Findings") && html.includes("Pushbacks")).toBe(true);
      expect(html.includes("severity-critical")).toBe(true);
      expect(html.includes("Resolved")).toBe(true);
      expect(html.includes("Missing error fallback handler")).toBe(true);
      expect(html.includes("Add onError handler to image viewer")).toBe(true);
      expect(html.includes("severity-important")).toBe(true);
      expect(html.includes("Open")).toBe(true);
      expect(html.includes("Requirement:") && html.includes("req-01")).toBe(true);
    });

    test("renders standardized drawer-empty-state when no findings or repair rounds exist", () => {
      const emptyNode: GraphNodeData = {
        id: "node-empty-findings",
        name: "Clean Node",
        metadata: {
          repairRounds: 0,
          findings: [],
        },
      };

      const html = renderToString(<FindingsTab node={emptyNode} />);
      expect(html.includes("drawer-empty-state")).toBe(true);
      expect(
        html.includes("No validation findings or pushback cycles recorded for this node."),
      ).toBe(true);
    });

    test("renders completeness verification for critic node when no findings are present", () => {
      const criticNode: GraphNodeData = {
        id: "node-critic-verification",
        name: "Whole Run Critic",
        kind: "critic",
        metadata: {
          repairRounds: 0,
          findings: [],
        },
      };

      const html = renderToString(<FindingsTab node={criticNode} />);
      expect(html.includes("Completeness Verification")).toBe(true);
      expect(html.includes("Whole-Run Completeness Scope Audited")).toBe(true);
    });

    test("parseStackTrace helper parses V8, Bun, Python, and generic stack traces", () => {
      // 1. V8 style stack
      const v8Stack = `TypeError: Cannot read properties of undefined (reading 'split')
    at parsePayload (/Users/dev/gvui/src/parser.ts:42:15)
    at runExecution (/Users/dev/gvui/node_modules/bun-test/runner.js:120:5)
    at node:internal/process/task_queues:95:5`;

      const parsedV8 = parseStackTrace(v8Stack);
      expect(parsedV8.name).toBe("TypeError");
      expect(parsedV8.message).toBe("Cannot read properties of undefined (reading 'split')");
      expect(parsedV8.frames.length).toBe(3);
      expect(parsedV8.frames[0]?.functionName).toBe("parsePayload");
      expect(parsedV8.frames[0]?.fileName).toBe("parser.ts");
      expect(parsedV8.frames[0]?.lineNumber).toBe(42);
      expect(parsedV8.frames[0]?.columnNumber).toBe(15);
      expect(parsedV8.frames[0]?.isInternal).toBe(false);
      expect(parsedV8.frames[1]?.isInternal).toBe(true); // node_modules
      expect(parsedV8.frames[2]?.isInternal).toBe(true); // node:

      // 2. Bun / WebKit style stack
      const bunStack = `AssertionError: Expected 200 OK but received 500 Internal Server Error
validateResponse@/Users/dev/gvui/src/validator.ts:88:12
@/Users/dev/gvui/src/index.ts:10:4`;

      const parsedBun = parseStackTrace(bunStack);
      expect(parsedBun.name).toBe("AssertionError");
      expect(parsedBun.message).toContain("Expected 200 OK");
      expect(parsedBun.frames.length).toBe(2);
      expect(parsedBun.frames[0]?.functionName).toBe("validateResponse");
      expect(parsedBun.frames[0]?.lineNumber).toBe(88);
      expect(parsedBun.frames[0]?.columnNumber).toBe(12);

      // 3. Python traceback
      const pyStack = `Traceback (most recent call last):
  File "/workspace/engine/layout.py", line 105, in calculate_layout
  File "/workspace/engine/measure.py", line 55, in measure_bounds
ValueError: Invalid dimension matrix`;

      const parsedPy = parseStackTrace(pyStack);
      expect(parsedPy.name).toBe("Traceback (most recent call last)");
      expect(parsedPy.frames.length).toBe(2);
      expect(parsedPy.frames[0]?.functionName).toBe("calculate_layout");
      expect(parsedPy.frames[0]?.lineNumber).toBe(105);

      // 4. Empty / malformed stack
      const emptyParsed = parseStackTrace("", "DefaultErr", "Fallback msg");
      expect(emptyParsed.name).toBe("DefaultErr");
      expect(emptyParsed.message).toBe("Fallback msg");
      expect(emptyParsed.frames.length).toBe(0);
    });

    test("extractStructuredErrors, extractAuditQuotes, extractRemediationPatches normalize various metadata shapes", () => {
      const richNode: GraphNodeData = {
        id: "node-rich-inspector",
        name: "Rich Error Node",
        metadata: {
          error: {
            name: "ValidationError",
            message: "Schema validation failed on node output",
            stack:
              "ValidationError: Schema validation failed\n    at validate (/src/validate.ts:12:4)",
            phase: "post_execution",
            code: "ERR_SCHEMA_FAIL",
          },
          errors: [
            "SecondaryWarning: Cache miss resulted in degraded latency\n    at fetchCache (/src/cache.ts:30:2)",
          ],
          commands: [
            {
              id: "cmd-failed",
              argv: ["bun", "test", "src/engine"],
              cwd: "/repos/gvui",
              exitCode: 1,
              durationMs: 450,
              startedAt: "2026-08-15T10:00:00Z",
              finishedAt: "2026-08-15T10:00:01Z",
              stderrSnippet:
                "GateFailure: 2 tests failed in src/engine/layout.test.ts\n    at testSuite (/src/engine/layout.test.ts:40:10)",
            },
          ],
          adversarialQuotes: [
            {
              id: "quote-1",
              quote: "The component does not handle truncated multiline stack traces gracefully.",
              author: "Adversarial Gatekeeper",
              round: 1,
              requirementId: "req-inspector-01",
            },
          ],
          remediationPatches: [
            {
              id: "patch-1",
              title: "Fix multiline stack trace wrapping",
              explanation: "Wrapped stack container in overflow-x: auto with monospace styling.",
              filePath: "src/components/ErrorInspector.tsx",
              diff: '--- a/ErrorInspector.tsx\n+++ b/ErrorInspector.tsx\n@@ -10,3 +10,4 @@\n- <div className="stack">\n+ <div className="stack" style={{ overflowX: \'auto\' }}>',
              status: "applied",
              round: 2,
            },
          ],
          findings: [
            {
              id: "finding-embedded",
              severity: "critical",
              status: "open",
              observation: "Uncaught TypeError in stack frame parser",
              remediation: "Add null check before indexing stack regex match groups",
              adversarialQuote: "Regex parser throws on non-standard frame strings.",
              diff: "--- a/parser.ts\n+++ b/parser.ts\n@@ -5,2 +5,3 @@\n- const line = m[1];\n+ const line = m ? m[1] : '';",
              stackTrace:
                "TypeError: Cannot read properties of null (reading '1')\n    at parseLine (/src/parser.ts:5:10)",
              revalidationProof: {
                method: "bun test src/components/NodeDetailDrawer",
                evidence: ["All 92 tests passing including edge cases"],
              },
            } as PushbackFindingItem,
          ],
        },
      };

      const extractedErrors = extractStructuredErrors(richNode);
      expect(extractedErrors.length).toBeGreaterThanOrEqual(4);
      expect(extractedErrors.some((e) => e.name === "ValidationError")).toBe(true);
      expect(extractedErrors.some((e) => e.code === "ERR_SCHEMA_FAIL")).toBe(true);
      expect(extractedErrors.some((e) => e.phase === "post_execution")).toBe(true);
      expect(extractedErrors.some((e) => e.name.includes("CommandError"))).toBe(true);
      expect(extractedErrors.some((e) => e.name.includes("finding-embedded"))).toBe(true);

      const extractedQuotes = extractAuditQuotes(richNode);
      expect(extractedQuotes.length).toBe(2);
      expect(extractedQuotes.some((q) => q.quote.includes("The component does not handle"))).toBe(
        true,
      );
      expect(extractedQuotes.some((q) => q.quote.includes("Regex parser throws"))).toBe(true);

      const extractedPatches = extractRemediationPatches(richNode);
      expect(extractedPatches.length).toBe(2);
      expect(
        extractedPatches.some((p) => Boolean(p.title?.includes("Fix multiline stack trace"))),
      ).toBe(true);
      expect(extractedPatches.some((p) => Boolean(p.diff?.includes("ErrorInspector.tsx")))).toBe(
        true,
      );
    });

    test("StackTraceViewer renders structured frames, toggles vendor frames, and copies stack trace to clipboard", async () => {
      let writtenClipboard = "";
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (text: string) => {
              writtenClipboard = text;
              return true;
            },
          },
        },
        configurable: true,
        writable: true,
      });

      const structuredErr = parseStackTrace(
        `TypeError: Invalid prop supplied to Drawer\n    at renderDrawer (/src/drawer.tsx:50:20)\n    at node_modules/react-dom/index.js:100:10\n    at node:internal/process/task:10:5`,
        "TypeError",
        "Invalid prop supplied to Drawer",
      );

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<StackTraceViewer error={structuredErr} />);
      });

      let json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("TypeError");
      expect(json).toContain("Invalid prop supplied to Drawer");
      expect(json).toContain("renderDrawer");
      expect(json).toContain("drawer.tsx:50:20");

      // Verify vendor frame filtering toggle
      const toggleVendorBtn = renderer.root.findByProps({
        "aria-label": "Show all vendor frames",
      });
      expect(toggleVendorBtn).toBeDefined();

      act(() => {
        toggleVendorBtn.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("node_modules/react-dom/index.js");

      // Verify copy stack button
      const copyStackBtn = renderer.root.findByProps({
        "aria-label": "Copy Full Stack Trace",
      });
      expect(copyStackBtn).toBeDefined();

      await act(async () => {
        await copyStackBtn.props.onClick();
      });

      expect(writtenClipboard).toContain("TypeError: Invalid prop supplied to Drawer");
      expect(writtenClipboard).toContain("renderDrawer");

      // Verify copy message button
      const copyMsgBtn = renderer.root.findByProps({
        "aria-label": "Copy Error Message",
      });
      expect(copyMsgBtn).toBeDefined();

      await act(async () => {
        await copyMsgBtn.props.onClick();
      });

      expect(writtenClipboard).toBe("TypeError: Invalid prop supplied to Drawer");
    });

    test("AdversarialQuoteBox renders stylized quote and copies quote text to clipboard", async () => {
      let writtenClipboard = "";
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (text: string) => {
              writtenClipboard = text;
              return true;
            },
          },
        },
        configurable: true,
        writable: true,
      });

      const quoteItem = {
        id: "quote-adv-01",
        quote: "Remediation patch is missing hunk headers and line number alignment.",
        author: "Adversarial Reviewer",
        role: "Validator Agent",
        round: 2,
        requirementId: "req-patch-view",
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<AdversarialQuoteBox quote={quoteItem} />);
      });

      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Adversarial Audit Feedback");
      expect(json).toContain("Remediation patch is missing hunk headers");
      expect(json).toContain("Adversarial Reviewer");
      expect(json).toContain("Round 2");
      expect(json).toContain("req-patch-view");

      const copyBtn = renderer.root.findByProps({ "aria-label": "Copy Audit Quote" });
      expect(copyBtn).toBeDefined();

      await act(async () => {
        await copyBtn.props.onClick({ stopPropagation: () => {} });
      });

      expect(writtenClipboard).toContain("Remediation patch is missing hunk headers");
      expect(writtenClipboard).toContain("Adversarial Reviewer");
    });

    test("RemediationPatchViewer renders unified diffs and before/after snippet fallback with copy actions", async () => {
      let writtenClipboard = "";
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (text: string) => {
              writtenClipboard = text;
              return true;
            },
          },
        },
        configurable: true,
        writable: true,
      });

      const patchWithDiff = {
        id: "patch-diff-01",
        title: "Defensive Bounds Check Patch",
        explanation: "Add Math.max(0, width) to prevent negative canvas dimensions",
        diff: "--- a/measurer.ts\n+++ b/measurer.ts\n@@ -10,3 +10,3 @@\n- const w = rawWidth;\n+ const w = Math.max(0, rawWidth);",
        filePath: "src/engine/measurer.ts",
        status: "applied",
        round: 1,
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<RemediationPatchViewer patch={patchWithDiff} />);
      });

      let json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Defensive Bounds Check Patch");
      expect(json).toContain("Math.max(0, width)");
      expect(json).toContain("measurer.ts");
      expect(json).toContain("Round 1");
      expect(json).toContain("applied");

      const copyBtn = renderer.root.findByProps({ "aria-label": "Copy Remediation Patch" });
      expect(copyBtn).toBeDefined();

      await act(async () => {
        await copyBtn.props.onClick({ stopPropagation: () => {} });
      });

      expect(writtenClipboard).toContain("Math.max(0, rawWidth)");

      // Test Before/After Snippets fallback
      const patchWithSnippets = {
        id: "patch-snippets-02",
        title: "Code Snippet Remediation",
        explanation: "Replaced legacy function with arrow helper",
        beforeSnippet: "function oldHelper() { return false; }",
        afterSnippet: "const oldHelper = () => true;",
        status: "resolved",
      };

      let snippetRenderer!: ReactTestRenderer;
      act(() => {
        snippetRenderer = create(<RemediationPatchViewer patch={patchWithSnippets} />);
      });

      json = JSON.stringify(snippetRenderer.toJSON());
      expect(json).toContain("Before Remediation:");
      expect(json).toContain("function oldHelper()");
      expect(json).toContain("After Remediation:");
      expect(json).toContain("const oldHelper = () => true;");
    });

    test("FindingDetailCard renders severity, status, adversarial quote, diff, revalidation proof, and copy actions", async () => {
      let writtenClipboard = "";
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (text: string) => {
              writtenClipboard = text;
              return true;
            },
          },
        },
        configurable: true,
        writable: true,
      });

      const comprehensiveFinding = {
        id: "finding-card-test-01",
        severity: "critical" as const,
        status: "open" as const,
        observation: "Missing active error boundary in drawer tab container",
        remediation: "Wrap tab components in ErrorBoundary with custom fallback UI",
        requirementId: "req-error-boundary",
        adversarialQuote: "Uncaught tab render errors will crash entire application canvas.",
        remediationPatch: "--- a/Drawer.tsx\n+++ b/Drawer.tsx\n@@ -1,2 +1,3 @@\n+ <ErrorBoundary>",
        revalidationProof: {
          method: "bun test src/components/NodeDetailDrawer",
          evidence: ["Verified ErrorBoundary catches child render exceptions cleanly"],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <FindingDetailCard finding={comprehensiveFinding} defaultExpanded={true} />,
        );
      });

      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("severity-critical");
      expect(json).toContain("Open");
      expect(json).toContain("Missing active error boundary in drawer tab container");
      expect(json).toContain("Wrap tab components in ErrorBoundary");
      expect(json).toContain("Uncaught tab render errors will crash");
      expect(json).toContain("Revalidation Proof (bun test src/components/NodeDetailDrawer)");
      expect(json).toContain("Requirement: req-error-boundary");
      expect(json).toContain("finding-card-test-01");

      // Test copy observation
      const copyObsBtn = renderer.root.findByProps({
        "aria-label": "Copy observation for finding-card-test-01",
      });
      expect(copyObsBtn).toBeDefined();
      await act(async () => {
        await copyObsBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(writtenClipboard).toBe("Missing active error boundary in drawer tab container");

      // Test copy remediation
      const copyRemBtn = renderer.root.findByProps({
        "aria-label": "Copy remediation for finding-card-test-01",
      });
      expect(copyRemBtn).toBeDefined();
      await act(async () => {
        await copyRemBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(writtenClipboard).toBe("Wrap tab components in ErrorBoundary with custom fallback UI");
    });

    test("ErrorInspector interactive filtering, search, and metric cards", () => {
      const complexInspectorNode: GraphNodeData = {
        id: "node-filter-search-test",
        name: "Search Filter Node",
        metadata: {
          repairRounds: 2,
          findings: [
            {
              id: "finding-alpha",
              severity: "critical",
              status: "open",
              observation: "Alpha critical pushback observation",
              remediation: "Alpha remediation plan",
              requirementId: "req-alpha",
            },
            {
              id: "finding-beta",
              severity: "important",
              status: "resolved",
              observation: "Beta important observation about line heights",
              remediation: "Beta typography remediation",
              requirementId: "req-beta",
            },
            {
              id: "finding-gamma",
              severity: "suggestion",
              status: "open",
              observation: "Gamma suggestion on tooltip positioning",
              remediation: "Gamma anchor positioning remediation",
              requirementId: "req-gamma",
            },
          ],
          error: {
            name: "RuntimeError",
            message: "Encountered 2 pushback cycles before convergence",
            stack: "RuntimeError: Pushback\n    at run (/src/run.ts:10:5)",
          },
          adversarialQuotes: ["Adversarial round 1 rejected candidate draft."],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<ErrorInspector node={complexInspectorNode} />);
      });

      let json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Repair Rounds");
      expect(json).toContain("Findings Recorded");
      expect(json).toContain("Critical");
      expect(json).toContain("Open Issues");
      expect(json).toContain("Resolved");
      expect(json).toContain("Structured Error Stack Traces");
      expect(json).toContain("Adversarial Audit Quotes & Critic Feedback");
      expect(json).toContain("Alpha critical pushback observation");
      expect(json).toContain("Beta important observation");
      expect(json).toContain("Gamma suggestion on tooltip positioning");

      // Search filtering
      const searchInput = renderer.root.findByProps({ "aria-label": "Filter findings" });
      expect(searchInput).toBeDefined();

      act(() => {
        searchInput.props.onChange({ target: { value: "typography" } });
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Beta important observation");
      expect(json).not.toContain("Alpha critical pushback observation");
      expect(json).not.toContain("Gamma suggestion on tooltip positioning");

      // Clear search
      const clearSearchBtn = renderer.root.findByProps({ "aria-label": "Clear search" });
      expect(clearSearchBtn).toBeDefined();
      act(() => {
        clearSearchBtn.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Alpha critical pushback observation");
      expect(json).toContain("Beta important observation");

      // Search with 0 matches
      act(() => {
        searchInput.props.onChange({ target: { value: "nonexistent-query-string-xyz" } });
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("No findings matched the selected filters.");
    });

    test("StackTraceViewer long frame list expand/collapse and unformatted raw error fallback", async () => {
      // 1. Long stack trace with 10 frames
      const longStack = [
        "Error: Connection timeout during stream handshake",
        "    at step10 (/src/engine/step10.ts:10:1)",
        "    at step9 (/src/engine/step9.ts:9:1)",
        "    at step8 (/src/engine/step8.ts:8:1)",
        "    at step7 (/src/engine/step7.ts:7:1)",
        "    at step6 (/src/engine/step6.ts:6:1)",
        "    at step5 (/src/engine/step5.ts:5:1)",
        "    at step4 (/src/engine/step4.ts:4:1)",
        "    at step3 (/src/engine/step3.ts:3:1)",
        "    at step2 (/src/engine/step2.ts:2:1)",
        "    at step1 (/src/engine/step1.ts:1:1)",
      ].join("\n");

      const parsedLong = parseStackTrace(
        longStack,
        "ConnectionTimeoutError",
        "Connection timeout during stream handshake",
      );
      expect(parsedLong.frames.length).toBe(10);

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<StackTraceViewer error={parsedLong} defaultExpanded={true} />);
      });

      let json = JSON.stringify(renderer.toJSON());
      // Initially displays 5 frames + toggle button
      expect(json).toContain("step10");
      expect(json).toContain("step6");
      expect(json).toContain("+5 More Frames (10 total)");
      expect(json).not.toContain("step5");

      // Expand frame list
      const toggleFramesBtn = renderer.root.findByProps({ "aria-label": "Show 5 more frames" });
      expect(toggleFramesBtn).toBeDefined();
      act(() => {
        toggleFramesBtn.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("step5");
      expect(json).toContain("step1");
      expect(json).toContain("Collapse Frames");

      // Collapse frame list back
      act(() => {
        toggleFramesBtn.props.onClick();
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("+5 More Frames (10 total)");

      // 2. Unformatted raw error fallback
      const unformattedError: StructuredError = {
        id: "err-raw-unformatted",
        name: "Panic",
        message: "fatal: memory corruption at 0xdeadbeef",
        rawStack: "fatal: memory corruption at 0xdeadbeef\n[SIGSEGV: address not mapped]",
        frames: [],
      };

      let unformattedRenderer!: ReactTestRenderer;
      act(() => {
        unformattedRenderer = create(
          <StackTraceViewer error={unformattedError} defaultExpanded={true} />,
        );
      });

      const unformattedJson = JSON.stringify(unformattedRenderer.toJSON());
      expect(unformattedJson).toContain("Unformatted Raw Error Output");
      expect(unformattedJson).toContain("No call frames detected");
      expect(unformattedJson).toContain("fatal: memory corruption at 0xdeadbeef");
      expect(unformattedJson).toContain("[SIGSEGV: address not mapped]");
    });

    test("RemediationPatchViewer explicit line numbering for before and after snippets", () => {
      const snippetPatch = {
        id: "patch-snippets-test",
        title: "Fix Token Extraction Logic",
        explanation: "Replace slice with regex match to avoid index out of bounds",
        beforeSnippet: "const token = str.slice(0, 10);\nreturn token.trim();",
        afterSnippet:
          "const match = str.match(/token=([a-z0-9]+)/i);\nconst token = match ? match[1] : '';\nreturn token.trim();",
        status: "resolved",
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<RemediationPatchViewer patch={snippetPatch} />);
      });

      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Before Remediation:");
      expect(json).toContain("After Remediation:");
      expect(json).toContain("const token = str.slice(0, 10);");
      expect(json).toContain("const match = str.match(/token=([a-z0-9]+)/i);");
      expect(json).toContain("Fix Token Extraction Logic");
      expect(json).toContain("Replace slice with regex match to avoid index out of bounds");
    });
  });

  describe("copyToClipboard robust shared utility", () => {
    const originalNavigator = globalThis.navigator;
    const originalDocument = globalThis.document;

    afterEach(() => {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, "document", {
        value: originalDocument,
        configurable: true,
        writable: true,
      });
    });

    test("copies successfully via modern navigator.clipboard.writeText", async () => {
      let written = "";
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (text: string) => {
              written = text;
            },
          },
        },
        configurable: true,
        writable: true,
      });

      const res = await copyToClipboard("test clipboard payload");
      expect(res).toBe(true);
      expect(written).toBe("test clipboard payload");
    });

    test("falls back to document.execCommand('copy') when navigator.clipboard rejects", async () => {
      let execCommandCalledWith = "";
      let appendedValue = "";
      let removedChild = false;

      const mockTextarea = {
        value: "",
        style: {} as Record<string, string>,
        setAttribute: () => {},
        focus: () => {},
        select: () => {},
        setSelectionRange: () => {},
      };

      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async () => {
              throw new Error("Clipboard permission denied");
            },
          },
        },
        configurable: true,
        writable: true,
      });

      Object.defineProperty(globalThis, "document", {
        value: {
          createElement: (tag: string) => {
            if (tag === "textarea") return mockTextarea;
            return {};
          },
          body: {
            appendChild: (el: typeof mockTextarea) => {
              appendedValue = el.value;
            },
            removeChild: () => {
              removedChild = true;
            },
          },
          execCommand: (cmd: string) => {
            execCommandCalledWith = cmd;
            return true;
          },
        },
        configurable: true,
        writable: true,
      });

      const res = await copyToClipboard("fallback text payload");
      expect(res).toBe(true);
      expect(appendedValue).toBe("fallback text payload");
      expect(execCommandCalledWith).toBe("copy");
      expect(removedChild).toBe(true);
    });

    test("falls back to document.execCommand('copy') when navigator.clipboard is absent", async () => {
      let execCommandCalled = false;
      const mockTextarea = {
        value: "",
        style: {} as Record<string, string>,
        setAttribute: () => {},
        focus: () => {},
        select: () => {},
        setSelectionRange: () => {},
      };

      Object.defineProperty(globalThis, "navigator", {
        value: {},
        configurable: true,
        writable: true,
      });

      Object.defineProperty(globalThis, "document", {
        value: {
          createElement: () => mockTextarea,
          body: {
            appendChild: () => {},
            removeChild: () => {},
          },
          execCommand: (cmd: string) => {
            if (cmd === "copy") execCommandCalled = true;
            return true;
          },
        },
        configurable: true,
        writable: true,
      });

      const res = await copyToClipboard("no navigator clipboard");
      expect(res).toBe(true);
      expect(execCommandCalled).toBe(true);
    });

    test("returns false for empty or falsy text without throwing", async () => {
      const res1 = await copyToClipboard("");
      expect(res1).toBe(false);
    });

    test("returns false gracefully when both clipboard API and execCommand fail", async () => {
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async () => {
              throw new Error("Rejected");
            },
          },
        },
        configurable: true,
        writable: true,
      });

      Object.defineProperty(globalThis, "document", {
        value: {
          createElement: () => {
            throw new Error("DOM access failure");
          },
        },
        configurable: true,
        writable: true,
      });

      const res = await copyToClipboard("payload");
      expect(res).toBe(false);
    });
  });

  describe("LightboxDialog focus trapping & focus restoration", () => {
    const sampleAssets: MediaAsset[] = [
      {
        id: "asset-1",
        type: "image",
        url: "/img1.png",
        title: "Image 1",
      },
      {
        id: "asset-2",
        type: "image",
        url: "/img2.png",
        title: "Image 2",
      },
    ];

    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;

    afterEach(() => {
      Object.defineProperty(globalThis, "document", {
        value: originalDocument,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    });

    test("sets initial focus to close button and restores focus to previous element on unmount", async () => {
      let previousElementFocused = false;

      const mockPreviousElement = {
        focus: () => {
          previousElementFocused = true;
        },
      };

      const listeners: Record<string, ((e: Event) => void)[]> = {};

      const mockDocument = {
        activeElement: mockPreviousElement,
        body: {
          contains: (el: unknown) => el === mockPreviousElement,
        },
      };

      const mockWindow = {
        addEventListener: (event: string, fn: (e: Event) => void) => {
          listeners[event] = listeners[event] || [];
          listeners[event].push(fn);
        },
        removeEventListener: (event: string, fn: (e: Event) => void) => {
          if (listeners[event]) {
            listeners[event] = listeners[event].filter((cb) => cb !== fn);
          }
        },
      };

      Object.defineProperty(globalThis, "document", {
        value: mockDocument,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, "window", {
        value: mockWindow,
        configurable: true,
        writable: true,
      });

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <LightboxDialog
            isOpen={true}
            assets={sampleAssets}
            initialIndex={0}
            onClose={() => {}}
          />,
        );
      });

      // Allow setTimeout(..., 0) to run for initial focus
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Unmount to trigger focus restoration
      act(() => {
        renderer.unmount();
      });

      expect(previousElementFocused).toBe(true);
    });

    test("traps focus: loops from last focusable element to first on Tab, and first to last on Shift+Tab", () => {
      let firstFocused = false;
      let lastFocused = false;

      const firstBtn = {
        tagName: "BUTTON",
        focus: () => {
          firstFocused = true;
        },
      };
      const lastBtn = {
        tagName: "BUTTON",
        focus: () => {
          lastFocused = true;
        },
      };

      const focusables = [firstBtn, lastBtn];

      const mockOverlay = {
        querySelectorAll: () => focusables,
        contains: (el: unknown) => focusables.includes(el as typeof firstBtn),
      };

      let keydownListener: ((e: KeyboardEvent) => void) | null = null;
      const originalWindow = globalThis.window;
      const originalDocument = globalThis.document;

      const mockWindow = {
        addEventListener: (event: string, fn: (e: unknown) => void) => {
          if (event === "keydown") keydownListener = fn as (e: KeyboardEvent) => void;
        },
        removeEventListener: () => {},
        getComputedStyle: () => ({ display: "block", visibility: "visible" }),
      };

      Object.defineProperty(globalThis, "window", {
        value: mockWindow,
        configurable: true,
        writable: true,
      });

      let activeEl: unknown = lastBtn;
      Object.defineProperty(globalThis, "document", {
        value: {
          get activeElement() {
            return activeEl;
          },
          body: { contains: () => true },
          querySelector: (sel: string) => {
            if (sel.includes("lightbox")) return mockOverlay;
            return null;
          },
        },
        configurable: true,
        writable: true,
      });

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <LightboxDialog
            isOpen={true}
            assets={sampleAssets}
            initialIndex={0}
            onClose={() => {}}
          />,
        );
      });

      expect(keydownListener).not.toBeNull();

      // Simulate Tab on last element -> wraps to first
      let tabPrevented = false;
      activeEl = lastBtn;
      keydownListener!({
        key: "Tab",
        shiftKey: false,
        preventDefault: () => {
          tabPrevented = true;
        },
        stopPropagation: () => {},
      } as unknown as KeyboardEvent);

      expect(tabPrevented).toBe(true);
      expect(firstFocused).toBe(true);

      // Simulate Shift+Tab on first element -> wraps to last
      let shiftTabPrevented = false;
      activeEl = firstBtn;
      keydownListener!({
        key: "Tab",
        shiftKey: true,
        preventDefault: () => {
          shiftTabPrevented = true;
        },
        stopPropagation: () => {},
      } as unknown as KeyboardEvent);

      expect(shiftTabPrevented).toBe(true);
      expect(lastFocused).toBe(true);

      act(() => {
        renderer.unmount();
      });
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(globalThis, "document", {
        value: originalDocument,
        configurable: true,
        writable: true,
      });
    });

    test("handles Escape key to close dialog", () => {
      let closed = false;
      let keydownListener: ((e: KeyboardEvent) => void) | null = null;
      const originalWindow = globalThis.window;

      const mockWindow = {
        addEventListener: (event: string, fn: (e: unknown) => void) => {
          if (event === "keydown") keydownListener = fn as (e: KeyboardEvent) => void;
        },
        removeEventListener: () => {},
      };

      Object.defineProperty(globalThis, "window", {
        value: mockWindow,
        configurable: true,
        writable: true,
      });

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <LightboxDialog
            isOpen={true}
            assets={sampleAssets}
            initialIndex={0}
            onClose={() => {
              closed = true;
            }}
          />,
        );
      });

      expect(keydownListener).not.toBeNull();

      let stopped = false;
      keydownListener!({
        key: "Escape",
        stopPropagation: () => {
          stopped = true;
        },
      } as unknown as KeyboardEvent);

      expect(stopped).toBe(true);
      expect(closed).toBe(true);

      act(() => {
        renderer.unmount();
      });
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
        writable: true,
      });
    });
  });

  describe("Interactive copy triggers in drawer components", () => {
    const originalNavigator = globalThis.navigator;

    afterEach(() => {
      Object.defineProperty(globalThis, "navigator", {
        value: originalNavigator,
        configurable: true,
        writable: true,
      });
    });

    test("IoStreamItem copy button copies text and displays Copied! feedback", async () => {
      let copiedText = "";
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (t: string) => {
              copiedText = t;
            },
          },
        },
        configurable: true,
        writable: true,
      });

      const port: IoPort = {
        node: "node-worker",
        kind: "artifact",
        label: "Build Output Artifact",
        preview: "const result = 42;",
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <IoStreamItem
            port={port}
            peerName="Worker Agent"
            direction="out"
            defaultExpanded={true}
          />,
        );
      });

      const copyBtn = renderer.root.findByProps({ "aria-label": "Copy stream payload" });
      expect(copyBtn).toBeDefined();

      let stopped = false;
      await act(async () => {
        await copyBtn.props.onClick({
          stopPropagation: () => {
            stopped = true;
          },
        });
      });

      expect(stopped).toBe(true);
      expect(copiedText).toBe("const result = 42;");
      expect(JSON.stringify(renderer.toJSON())).toContain("Copied!");

      act(() => renderer.unmount());
    });

    test("CommandsTab copy buttons copy command lines and stdout snippets", async () => {
      const copiedTexts: string[] = [];
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (t: string) => {
              copiedTexts.push(t);
            },
          },
        },
        configurable: true,
        writable: true,
      });

      const cmdNode: GraphNodeData = {
        id: "node-exec-copy",
        name: "Executor Node",
        metadata: {
          commands: [
            {
              id: "cmd-unit",
              argv: ["bun", "test", "src/math"],
              cwd: "/workspace",
              exitCode: 0,
              durationMs: 450,
              startedAt: "2026-08-14T20:00:00.000Z",
              finishedAt: "2026-08-14T20:00:00.450Z",
              stdoutSnippet: "15 tests passed",
              stderrSnippet: "warn: deprecated option",
            },
          ],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<CommandsTab node={cmdNode} />);
      });

      const argvCopyBtn = renderer.root.findByProps({ "aria-label": "Copy command line" });
      await act(async () => {
        await argvCopyBtn.props.onClick({ stopPropagation: () => {} });
      });

      const stdoutCopyBtn = renderer.root.findByProps({ "aria-label": "Copy stdout snippet" });
      await act(async () => {
        await stdoutCopyBtn.props.onClick({ stopPropagation: () => {} });
      });

      const stderrCopyBtn = renderer.root.findByProps({ "aria-label": "Copy stderr snippet" });
      await act(async () => {
        await stderrCopyBtn.props.onClick({ stopPropagation: () => {} });
      });

      expect(copiedTexts).toContain("bun test src/math");
      expect(copiedTexts).toContain("15 tests passed");
      expect(copiedTexts).toContain("warn: deprecated option");

      act(() => renderer.unmount());
    });
  });

  describe("ProvenanceTimeline & RawProvenanceTab row provenance and execution timeline", () => {
    test("helper formatTokenPreview formats short hash preview or returns string safely", () => {
      expect(formatTokenPreview()).toBe("");
      expect(formatTokenPreview("")).toBe("");
      expect(formatTokenPreview("short-token")).toBe("short-token");
      expect(formatTokenPreview("1v9x_PDRWr_Dx9krMV3cYM_YIwMtlWQa5Nzc8MqpKKk")).toBe(
        "1v9x_PDR...qpKKk",
      );
    });

    test("helper formatTimestamp formats ISO timestamp or handles invalid values gracefully", () => {
      expect(formatTimestamp()).toBe("");
      expect(formatTimestamp("")).toBe("");
      const formatted = formatTimestamp("2026-08-15T09:48:57.000Z");
      expect(formatted.length).toBeGreaterThan(0);
      expect(formatTimestamp("invalid-date-string")).toBe("invalid-date-string");
    });

    test("helper describeProvenanceStatus categorizes status variants cleanly", () => {
      expect(describeProvenanceStatus("leased").variant).toBe("leased");
      expect(describeProvenanceStatus("validating").variant).toBe("validating");
      expect(describeProvenanceStatus("satisfied").variant).toBe("satisfied");
      expect(describeProvenanceStatus("rejected").variant).toBe("rejected");
      expect(describeProvenanceStatus("repaired").variant).toBe("repaired");
      expect(describeProvenanceStatus("running").variant).toBe("running");
      expect(describeProvenanceStatus("custom_state").variant).toBe("neutral");
      expect(describeProvenanceStatus(undefined).variant).toBe("neutral");
    });

    test("renders standardized drawer-empty-state when no provenance custody or events exist", () => {
      const emptyNode: GraphNodeData = {
        id: "node-empty-prov",
        name: "Empty Provenance Node",
      };

      const html = renderToString(<ProvenanceTimeline node={emptyNode} />);
      expect(html).toContain("drawer-empty-state");
      expect(html).toContain(
        "No provenance events or chain of custody records found for this node.",
      );
    });

    test("renders full chain of custody with actor ID, role, status, progression, token digest, remediations, command links, and resolution paths", () => {
      const nodeWithCustody: GraphNodeData = {
        id: "task-01-node",
        name: "Task 01 Implementer",
        status: "success",
        provenance: {
          chainOfCustody: [
            {
              actorId: "agent-impl-01",
              role: "implementer",
              status: "satisfied",
              leaseToken: "1v9x_PDRWr_Dx9krMV3cYM_YIwMtlWQa5Nzc8MqpKKk",
              validatorLeaseToken: "1v9x_PDRWr_Dx9krMV3cYM_YIwMtlWQa5Nzc8MqpKKk",
              attempt: 2,
              maxAttempts: 3,
              round: 1,
              timestamp: "2026-08-15T09:48:57.000Z",
              resolutionPath: [
                "Claimed",
                "Leased",
                "Gate Executed",
                "Adversarial Rejection",
                "Repaired",
                "Gate Satisfied",
              ],
              findings: [
                {
                  id: "finding-adv-01",
                  severity: "critical",
                  observation: "Empty timeline state crashed when events array is undefined",
                  remediation: "Add robust empty state fallback and check array bounds",
                  status: "resolved",
                  proof: {
                    method: "automated-gate-test",
                    evidence: [
                      "bun test src/components/NodeDetailDrawer",
                      "100% tests passed without exceptions",
                    ],
                  },
                },
              ],
              commands: [
                {
                  id: "cmd-gate-01",
                  argv: ["bun", "test", "src/components/NodeDetailDrawer"],
                  cwd: "/Users/onurseckinsenoglu/repos/gvui",
                  exitCode: 0,
                  durationMs: 420,
                  startedAt: "2026-08-15T09:49:00.000Z",
                  finishedAt: "2026-08-15T09:49:00.420Z",
                  stdoutSnippet: "61 pass\n0 fail",
                },
              ],
            },
          ],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<ProvenanceTimeline node={nodeWithCustody} />);
      });

      const json = JSON.stringify(renderer.toJSON());

      // Actor and roles
      expect(json).toContain("agent-impl-01");
      expect(json).toContain("implementer");
      expect(json).toContain("Satisfied");

      // Attempt progression
      expect(json).toContain("Attempt 2 of 3");
      expect(json).toContain("Repair Round #1");

      // Lease Token Digest (short preview by default)
      expect(json).toContain("1v9x_PDR...qpKKk");

      // Toggle full token
      const toggleTokenBtn = renderer.root.findByProps({
        "aria-label": "Toggle full lease token digest",
      });
      expect(toggleTokenBtn).toBeDefined();
      act(() => {
        toggleTokenBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(JSON.stringify(renderer.toJSON())).toContain(
        "1v9x_PDRWr_Dx9krMV3cYM_YIwMtlWQa5Nzc8MqpKKk",
      );

      // Toggle back to short preview
      act(() => {
        toggleTokenBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(JSON.stringify(renderer.toJSON())).toContain("1v9x_PDR...qpKKk");

      // Resolution Path
      expect(json).toContain("Resolution Path & Lifecycle Trajectory");
      expect(json).toContain("Claimed");
      expect(json).toContain("Adversarial Rejection");
      expect(json).toContain("Gate Satisfied");

      // Finding Remediations
      expect(json).toContain("finding-adv-01");
      expect(json).toContain("CRITICAL SEVERITY");
      expect(json).toContain("RESOLVED");
      expect(json).toContain("Empty timeline state crashed when events array is undefined");
      expect(json).toContain("Add robust empty state fallback and check array bounds");
      expect(json).toContain("automated-gate-test");
      expect(json).toContain("bun test src/components/NodeDetailDrawer");

      // Referenced Commands
      expect(json).toContain("Referenced Execution Commands (1)");
      expect(json).toContain("cmd-gate-01");
      expect(json).toContain("Exit 0");
      expect(json).toContain("420ms");

      // Expand referenced command inspection
      const cmdToggleBtn = renderer.root.findByProps({
        "aria-label": "Toggle command inspection for cmd-gate-01",
      });
      act(() => {
        cmdToggleBtn.props.onClick({ stopPropagation: () => {} });
      });
      const cmdJson = JSON.stringify(renderer.toJSON());
      expect(cmdJson).toContain("bun test src/components/NodeDetailDrawer");
      expect(cmdJson).toContain("/Users/onurseckinsenoglu/repos/gvui");
      expect(cmdJson).toContain("61 pass");

      act(() => renderer.unmount());
    });

    test("synthesizes chain of custody record from node metadata when raw provenance is not nested", () => {
      const metaNode: GraphNodeData = {
        id: "node-meta-synth",
        name: "Synthesized Custody Node",
        status: "running",
        metadata: {
          leaseAgent: "agent-impl-02",
          validatorLeaseToken: "token_abc_xyz_123456789",
          attempt: 1,
          repairRounds: 2,
          resolutionPath: "Claimed -> Running -> Satisfied",
          commands: [
            {
              id: "cmd-inline-1",
              argv: ["cargo", "test"],
              cwd: "/rust",
              exitCode: 1,
              durationMs: 1500,
              startedAt: "2026-08-15T09:49:00.000Z",
              finishedAt: "2026-08-15T09:49:01.500Z",
              stderrSnippet: "compilation error",
            },
          ],
        },
      };

      const html = renderToString(<ProvenanceTimeline node={metaNode} />);
      expect(html).toContain("agent-impl-02");
      expect(html).toContain("token_ab...56789");
      expect(html).toContain("Attempt #1");
      expect(html).toContain("Repair Round #2");
      expect(html).toContain("Claimed");
      expect(html).toContain("Running");
      expect(html).toContain("cmd-inline-1");
      expect(html).toContain("Exit 1");
    });

    test("renders chronological event timeline with status badges, timestamps, duration, expandable payloads, and status filters", () => {
      const timelineNode: GraphNodeData = {
        id: "node-timeline-test",
        name: "Timeline Test Node",
        provenance: {
          events: [
            {
              id: "ev-1",
              title: "Task Leased by Agent",
              status: "leased",
              timestamp: "2026-08-15T09:40:00.000Z",
              durationMs: 150,
              actorId: "agent-impl-01",
              role: "implementer",
              leaseToken: "1v9x_PDRWr_Dx9krMV3cYM_YIwMtlWQa5Nzc8MqpKKk",
              summary: "Task claimed and leased with 20 minute TTL",
              payload: { leaseDurationMinutes: 20, tokenDigest: "1v9x...KKk" },
            },
            {
              id: "ev-2",
              title: "Gate Validation Run",
              status: "validating",
              timestamp: "2026-08-15T09:41:00.000Z",
              durationMs: 650,
              commandRef: "cmd-gate-test",
              summary: "Automated gate check started across unit test suites",
            },
            {
              id: "ev-3",
              title: "Adversarial Gate Rejection",
              status: "rejected",
              timestamp: "2026-08-15T09:42:00.000Z",
              durationMs: 800,
              actorId: "validator-01",
              summary: "Validator found edge case in empty state handling",
              remediation: {
                id: "rem-1",
                severity: "important",
                observation: "Missing empty state fallback",
                remediation: "Implement standardized drawer-empty-state",
                status: "open",
              },
            },
            {
              id: "ev-4",
              title: "Repair Applied and Verified",
              status: "repaired",
              attempt: 2,
              round: 1,
              timestamp: "2026-08-15T09:43:00.000Z",
              durationMs: 300,
              summary: "Fixed edge cases and re-ran automated gate suite",
            },
            {
              id: "ev-5",
              title: "Task Satisfied & Signed Off",
              status: "satisfied",
              timestamp: "2026-08-15T09:44:00.000Z",
              durationMs: 120,
              summary: "All verification gates passed cleanly with 100% coverage",
              payload: "VERIFIED_CLEAN_SATISFACTION",
            },
          ],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<ProvenanceTimeline node={timelineNode} />);
      });

      let json = JSON.stringify(renderer.toJSON());

      // Chronological events rendering
      expect(json).toContain("Task Leased by Agent");
      expect(json).toContain("Gate Validation Run");
      expect(json).toContain("Adversarial Gate Rejection");
      expect(json).toContain("Repair Applied and Verified");
      expect(json).toContain("Task Satisfied & Signed Off");

      // Status badges
      expect(json).toContain("Leased");
      expect(json).toContain("Validating");
      expect(json).toContain("Rejected");
      expect(json).toContain("Repaired");
      expect(json).toContain("Satisfied");

      // Duration pills
      expect(json).toContain("150ms");
      expect(json).toContain("650ms");
      expect(json).toContain("800ms");
      expect(json).toContain("300ms");
      expect(json).toContain("120ms");

      // Expandable payload toggle
      const payloadToggleBtn = renderer.root.findByProps({
        "aria-label": "Toggle payload view for Task Leased by Agent",
      });
      expect(payloadToggleBtn).toBeDefined();

      // Before expanding, payload content is not rendered
      expect(json).not.toContain("leaseDurationMinutes");

      // Expand payload
      act(() => {
        payloadToggleBtn.props.onClick({ stopPropagation: () => {} });
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("leaseDurationMinutes");
      expect(json).toContain("20");

      // Interactive status filtering
      const filterToolbar = renderer.root.findByProps({
        "aria-label": "Event Status Filter",
      });
      expect(filterToolbar).toBeDefined();

      const filterButtons = filterToolbar.findAllByType("button");
      expect(filterButtons.length).toBeGreaterThan(1);

      // Filter by REJECTED
      const rejectedFilterBtn = filterButtons.find((b) =>
        String(b.props.children).toUpperCase().includes("REJECTED"),
      );
      expect(rejectedFilterBtn).toBeDefined();
      act(() => {
        rejectedFilterBtn!.props.onClick();
      });
      let filteredJson = JSON.stringify(renderer.toJSON());
      expect(filteredJson).toContain("Adversarial Gate Rejection");
      expect(filteredJson).not.toContain("Task Leased by Agent");
      expect(filteredJson).not.toContain("Task Satisfied & Signed Off");

      // Filter by All
      const allFilterBtn = filterButtons[0];
      expect(allFilterBtn).toBeDefined();
      act(() => {
        allFilterBtn.props.onClick();
      });
      filteredJson = JSON.stringify(renderer.toJSON());
      expect(filteredJson).toContain("Task Leased by Agent");
      expect(filteredJson).toContain("Task Satisfied & Signed Off");

      act(() => renderer.unmount());
    });

    test("interactive copy buttons in ProvenanceTimeline copy lease tokens, command lines, and payloads", async () => {
      const copiedTexts: string[] = [];
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (t: string) => {
              copiedTexts.push(t);
            },
          },
        },
        configurable: true,
        writable: true,
      });

      const interactiveNode: GraphNodeData = {
        id: "node-interactive-prov",
        name: "Interactive Provenance Node",
        provenance: {
          chainOfCustody: [
            {
              actorId: "agent-impl-01",
              leaseToken: "1v9x_PDRWr_Dx9krMV3cYM_YIwMtlWQa5Nzc8MqpKKk",
              commands: [
                {
                  id: "cmd-custody-copy",
                  argv: ["bun", "test", "src/components/NodeDetailDrawer"],
                  exitCode: 0,
                  durationMs: 400,
                  startedAt: "2026-08-15T09:49:00.000Z",
                  finishedAt: "2026-08-15T09:49:00.400Z",
                },
              ],
            },
          ],
          events: [
            {
              id: "ev-copy-test",
              title: "Payload Copy Event",
              status: "running",
              payload: { result: "pass", executionStep: 1 },
              leaseToken: "token_for_event_copy",
            },
          ],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<ProvenanceTimeline node={interactiveNode} />);
      });

      // 1. Copy custody lease token digest
      const custodyTokenCopyBtn = renderer.root.findByProps({
        "aria-label": "Copy lease token digest",
      });
      await act(async () => {
        await custodyTokenCopyBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(copiedTexts).toContain("1v9x_PDRWr_Dx9krMV3cYM_YIwMtlWQa5Nzc8MqpKKk");

      // 2. Copy command line
      const cmdCopyBtn = renderer.root.findByProps({ "aria-label": "Copy command line" });
      await act(async () => {
        await cmdCopyBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(copiedTexts).toContain("bun test src/components/NodeDetailDrawer");

      // 3. Copy event lease token
      const eventTokenCopyBtn = renderer.root.findByProps({
        "aria-label": "Copy event lease token",
      });
      await act(async () => {
        await eventTokenCopyBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(copiedTexts).toContain("token_for_event_copy");

      // 4. Copy event payload
      const eventPayloadCopyBtn = renderer.root.findByProps({
        "aria-label": "Copy event payload",
      });
      await act(async () => {
        await eventPayloadCopyBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(copiedTexts.some((t) => t.includes('"result": "pass"'))).toBe(true);

      act(() => renderer.unmount());
    });

    test("RawProvenanceTab renders ProvenanceTimeline, identifiers, and raw JSON payload with interactive copy button", async () => {
      const copiedTexts: string[] = [];
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: async (t: string) => {
              copiedTexts.push(t);
            },
          },
        },
        configurable: true,
        writable: true,
      });

      const fullNode: GraphNodeData = {
        id: "node-full-raw-prov",
        name: "Full Raw Provenance Test",
        kind: "agent",
        status: "success",
        step: 3,
        stepLabel: "Step 3 (Execute & Validate)",
        sectionId: "section-core",
        provenance: {
          chainOfCustody: [
            {
              actorId: "agent-impl-01",
              leaseToken: "1v9x_PDRWr_Dx9krMV3cYM_YIwMtlWQa5Nzc8MqpKKk",
              attempt: 1,
            },
          ],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<RawProvenanceTab node={fullNode} />);
      });

      const json = JSON.stringify(renderer.toJSON());

      // ProvenanceTimeline rendered
      expect(json).toContain("Chain of Custody & Validator Lease");
      expect(json).toContain("agent-impl-01");
      expect(json).toContain("1v9x_PDR...qpKKk");

      // Provenance Identifiers rendered
      expect(json).toContain("Provenance Identifiers");
      expect(json).toContain("Node ID");
      expect(json).toContain("node-full-raw-prov");
      expect(json).toContain("Step 3 (Execute & Validate)");
      expect(json).toContain("section-core");
      expect(json).toContain("agent");
      expect(json).toContain("success");

      // Raw Node Payload rendered
      expect(json).toContain("Raw Node Dataset Payload");
      expect(json).toContain("Full Raw Provenance Test");

      // Copy Raw Payload button
      const copyRawBtn = renderer.root.findByProps({
        "aria-label": "Copy raw JSON payload",
      });
      await act(async () => {
        await copyRawBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(copiedTexts.some((t) => t.includes('"id": "node-full-raw-prov"'))).toBe(true);

      act(() => renderer.unmount());
    });

    test("finding-01-edge-case-stress: robust handling of empty events, token digest edges, command link navigation, and filter notices", async () => {
      // 1. Edge case token preview formatting
      expect(formatTokenPreview(null)).toBe("");
      expect(formatTokenPreview(undefined)).toBe("");
      expect(formatTokenPreview("")).toBe("");
      expect(formatTokenPreview("   ")).toBe("");
      expect(formatTokenPreview("abc")).toBe("abc");
      expect(formatTokenPreview(1234567890123456 as unknown as string)).toBe("1234567890123456");
      expect(formatTokenPreview("12345678901234567890")).toBe("12345678...67890");

      // 2. Edge case timestamp formatting
      expect(formatTimestamp(null)).toBe("");
      expect(formatTimestamp(undefined)).toBe("");
      expect(formatTimestamp("")).toBe("");
      expect(formatTimestamp(0)).toBe("");

      // 3. Edge case empty events list with custody
      const emptyEventsNode: GraphNodeData = {
        id: "node-empty-events-stress",
        name: "Empty Events Stress Node",
        provenance: {
          chainOfCustody: [
            {
              actorId: "agent-impl-01",
              leaseToken: "1v9x_PDRWr_Dx9krMV3cYM_YIwMtlWQa5Nzc8MqpKKk",
              commands: [
                {
                  id: "cmd-no-argv",
                  cwd: "/workspace",
                  durationMs: 100,
                },
                {
                  id: "cmd-stderr-only",
                  argv: ["unknown-command"],
                  exitCode: 127,
                  stderrSnippet: "command not found: unknown-command",
                },
              ],
            },
          ],
          events: [],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<ProvenanceTimeline node={emptyEventsNode} />);
      });

      let json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Chain of Custody & Validator Lease");
      expect(json).toContain("cmd-no-argv");
      expect(json).toContain("cmd-stderr-only");
      expect(json).toContain("Exit 127");

      // Expand command with stderr only
      const stderrCmdBtn = renderer.root.findByProps({
        "aria-label": "Toggle command inspection for cmd-stderr-only",
      });
      act(() => {
        stderrCmdBtn.props.onClick({ stopPropagation: () => {} });
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("command not found: unknown-command");

      // 4. Edge case filter yields 0 matches
      const filterableNode: GraphNodeData = {
        id: "node-filter-stress",
        name: "Filterable Stress Node",
        provenance: {
          events: [
            {
              id: "ev-only-leased",
              title: "Only Leased Event",
              status: "leased",
            },
            {
              id: "ev-only-satisfied",
              title: "Only Satisfied Event",
              status: "satisfied",
            },
          ],
        },
      };

      act(() => {
        renderer = create(<ProvenanceTimeline node={filterableNode} />);
      });

      const filterToolbar = renderer.root.findByProps({
        "aria-label": "Event Status Filter",
      });
      const filterButtons = filterToolbar.findAllByType("button");
      const leasedBtn = filterButtons.find((b) =>
        String(b.props.children).toUpperCase().includes("LEASED"),
      );
      expect(leasedBtn).toBeDefined();

      act(() => {
        leasedBtn!.props.onClick();
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Only Leased Event");
      expect(json).not.toContain("Only Satisfied Event");

      act(() => renderer.unmount());
    });
  });

  describe("DiffViewer & DiffsTab Unified Diffs Aggregator", () => {
    const sampleDiff = `diff --git a/src/index.ts b/src/index.ts
index e69de29..b2b2b2b 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -10,6 +10,8 @@
 const alpha = 1;
-const deprecatedVal = 2;
+const modernVal = 2;
+const addedVal = 3;
 const beta = 4;
 const gamma = 5;`;

    describe("parseUnifiedDiff & calculateDiffStats helpers", () => {
      test("handles empty, null, or undefined diffs gracefully", () => {
        expect(parseUnifiedDiff(undefined)).toEqual([]);
        expect(parseUnifiedDiff("")).toEqual([]);
        expect(calculateDiffStats(undefined)).toEqual({
          additions: 0,
          deletions: 0,
          totalChanges: 0,
        });
        expect(calculateDiffStats("")).toEqual({ additions: 0, deletions: 0, totalChanges: 0 });
      });

      test("parses standard git diff with hunk headers, additions, deletions, headers, and context lines", () => {
        const parsed = parseUnifiedDiff(sampleDiff);
        expect(parsed.length).toBe(11);

        // Header lines
        expect(parsed[0].type).toBe("header");
        expect(parsed[0].text).toContain("diff --git");
        expect(parsed[1].type).toBe("header");
        expect(parsed[2].type).toBe("header");
        expect(parsed[3].type).toBe("header");

        // Hunk header line
        expect(parsed[4].type).toBe("hunk");
        expect(parsed[4].text).toContain("@@ -10,6 +10,8 @@");
        expect(parsed[4].oldLineNumber).toBeNull();
        expect(parsed[4].newLineNumber).toBeNull();

        // Context line
        expect(parsed[5].type).toBe("context");
        expect(parsed[5].text).toBe(" const alpha = 1;");
        expect(parsed[5].oldLineNumber).toBe(10);
        expect(parsed[5].newLineNumber).toBe(10);

        // Deletion line
        expect(parsed[6].type).toBe("del");
        expect(parsed[6].text).toBe("-const deprecatedVal = 2;");
        expect(parsed[6].oldLineNumber).toBe(11);
        expect(parsed[6].newLineNumber).toBeNull();

        // Addition lines
        expect(parsed[7].type).toBe("add");
        expect(parsed[7].text).toBe("+const modernVal = 2;");
        expect(parsed[7].oldLineNumber).toBeNull();
        expect(parsed[7].newLineNumber).toBe(11);

        expect(parsed[8].type).toBe("add");
        expect(parsed[8].text).toBe("+const addedVal = 3;");
        expect(parsed[8].oldLineNumber).toBeNull();
        expect(parsed[8].newLineNumber).toBe(12);

        // Context line after additions
        expect(parsed[9].type).toBe("context");
        expect(parsed[9].text).toBe(" const beta = 4;");
        expect(parsed[9].oldLineNumber).toBe(12);
        expect(parsed[9].newLineNumber).toBe(13);
      });

      test("calculateDiffStats accurately sums additions and deletions from string or parsed lines", () => {
        const stats = calculateDiffStats(sampleDiff);
        expect(stats.additions).toBe(2);
        expect(stats.deletions).toBe(1);
        expect(stats.totalChanges).toBe(3);
      });
    });

    describe("DiffViewer component rendering & interaction", () => {
      test("renders file header with mode badge, file path, line range, and churn badges", () => {
        const html = renderToString(
          <DiffViewer
            filePath="src/components/NodeDetailDrawer/DiffViewer.tsx"
            mode="write"
            additions={42}
            deletions={18}
            lines="10-35"
            diff={sampleDiff}
            round={2}
          />,
        );

        expect(html.includes("src/components/NodeDetailDrawer/DiffViewer.tsx")).toBe(true);
        expect(html.includes("mode-write")).toBe(true);
        expect(html.includes("+42")).toBe(true);
        expect(html.includes("-18")).toBe(true);
        expect(html.includes("Δ 60")).toBe(true);
        expect(html.includes(":10-35")).toBe(true);
        expect(html.includes("Round 2")).toBe(true);
        expect(html.includes("drawer-diff-viewer")).toBe(true);
        expect(html.includes("drawer-diff-line--add")).toBe(true);
        expect(html.includes("drawer-diff-line--del")).toBe(true);
        expect(html.includes("drawer-diff-line--hunk")).toBe(true);
        expect(html.includes("drawer-diff-line--context")).toBe(true);
        expect(html.includes("const modernVal = 2;")).toBe(true);
      });

      test("renders dual line numbers (old and new) and gutter indicators", () => {
        const html = renderToString(
          <DiffViewer
            filePath="src/test.ts"
            mode="write"
            diff={sampleDiff}
            showLineNumbers={true}
          />,
        );

        expect(html.includes("drawer-diff-lineno--old")).toBe(true);
        expect(html.includes("drawer-diff-lineno--new")).toBe(true);
        expect(html.includes("drawer-diff-gutter")).toBe(true);
      });

      test("toggles collapsible expand/collapse state and responds to keyboard Enter", () => {
        let renderer!: ReactTestRenderer;
        let toggledState: boolean | undefined;

        act(() => {
          renderer = create(
            <DiffViewer
              filePath="src/collapsible.ts"
              mode="create"
              diff={sampleDiff}
              defaultExpanded={true}
              onToggleExpand={(exp) => {
                toggledState = exp;
              }}
            />,
          );
        });

        const header = renderer.root.findByProps({
          "aria-label": "Toggle diff for src/collapsible.ts",
        });
        expect(header.props["aria-expanded"]).toBe(true);
        expect(JSON.stringify(renderer.toJSON())).toContain("drawer-diff-viewer");

        // Click to collapse
        act(() => {
          header.props.onClick();
        });
        expect(toggledState).toBe(false);
        expect(JSON.stringify(renderer.toJSON())).not.toContain("drawer-diff-viewer");

        // Press Enter to expand
        act(() => {
          header.props.onKeyDown({ key: "Enter", preventDefault: () => {} });
        });
        expect(toggledState).toBe(true);
        expect(JSON.stringify(renderer.toJSON())).toContain("drawer-diff-viewer");

        act(() => renderer.unmount());
      });

      test("copies file diff to clipboard with interactive Copied! feedback", async () => {
        const copiedTexts: string[] = [];
        Object.defineProperty(globalThis, "navigator", {
          value: {
            clipboard: {
              writeText: async (t: string) => {
                copiedTexts.push(t);
              },
            },
          },
          configurable: true,
          writable: true,
        });

        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(
            <DiffViewer
              filePath="src/copy-target.ts"
              mode="write"
              diff="@@ -1 +1 @@\n-old\n+new"
            />,
          );
        });

        const copyBtn = renderer.root.findByProps({
          "aria-label": "Copy diff for src/copy-target.ts",
        });
        expect(copyBtn).toBeDefined();

        await act(async () => {
          await copyBtn.props.onClick({ stopPropagation: () => {} });
        });

        expect(copiedTexts.some((t) => t.includes("-old") && t.includes("+new"))).toBe(true);
        expect(JSON.stringify(renderer.toJSON())).toContain("Copied!");

        act(() => renderer.unmount());
      });

      test("renders fallback notice when diff is empty or binary", () => {
        const html = renderToString(
          <DiffViewer
            filePath="src/assets/logo.png"
            mode="create"
            diff=""
            additions={0}
            deletions={0}
          />,
        );

        expect(html.includes("drawer-diff-empty-notice")).toBe(true);
        expect(html.includes("No line-level diff content recorded for this file.")).toBe(true);
      });
    });

    describe("DiffsTab multi-file diff aggregation & multi-round diff tracking", () => {
      const multiRoundNode: GraphNodeData = {
        id: "node-diffs-aggregator",
        name: "Diffs Aggregator Worker",
        kind: "agent",
        status: "running",
        metadata: {
          writeScope: ["src/components/NodeDetailDrawer/", "src/types/"],
          repairRounds: 2,
          rounds: [
            {
              round: 1,
              title: "Round 1: Initial Implementation",
              type: "submission",
              timestamp: "2026-08-15T09:40:00.000Z",
              summary: "Implemented base DiffsTab and DiffViewer layout",
              files: [
                {
                  path: "src/components/NodeDetailDrawer/DiffViewer.tsx",
                  mode: "create",
                  additions: 120,
                  deletions: 0,
                  diff: "@@ -0,0 +1,5 @@\n+export const DiffViewer = () => {};",
                },
                {
                  path: "src/components/NodeDetailDrawer/tabs/DiffsTab.tsx",
                  mode: "create",
                  additions: 150,
                  deletions: 0,
                  diff: "@@ -0,0 +1,5 @@\n+export const DiffsTab = () => {};",
                },
              ],
            },
            {
              round: 2,
              title: "Round 2: Repair Round (Finding Remediation)",
              type: "repair",
              timestamp: "2026-08-15T09:45:00.000Z",
              findingId: "finding-adv-01",
              summary: "Fixed multi-round tab filtering and file tree responsiveness",
              files: [
                {
                  path: "src/components/NodeDetailDrawer/tabs/DiffsTab.tsx",
                  mode: "write",
                  additions: 45,
                  deletions: 12,
                  diff: "@@ -1,5 +1,8 @@\n-const oldMode = false;\n+const newMode = true;\n+const repairApplied = true;",
                },
                {
                  path: "src/components/NodeDetailDrawer/NodeDetailDrawerTabs.css",
                  mode: "write",
                  additions: 80,
                  deletions: 5,
                  diff: "@@ -100,5 +100,10 @@\n+.drawer-diff-churn-bar { display: flex; }",
                },
              ],
            },
          ],
        },
      };

      test("renders assigned write scope with scope badges", () => {
        const html = renderToString(<DiffsTab node={multiRoundNode} />);
        expect(html.includes("Assigned Write Scope")).toBe(true);
        expect(html.includes("src/components/NodeDetailDrawer/")).toBe(true);
        expect(html.includes("src/types/")).toBe(true);
        expect(html.includes("mode-write")).toBe(true);
      });

      test("renders churn & telemetry summary with additions, deletions, net delta, and repair rounds", () => {
        const html = renderToString(<DiffsTab node={multiRoundNode} />);
        expect(html.includes("Files Changed")).toBe(true);
        expect(html.includes("Additions")).toBe(true);
        expect(html.includes("Deletions")).toBe(true);
        expect(html.includes("Net Delta")).toBe(true);
        expect(html.includes("Repair Rounds")).toBe(true);
        expect(html.includes("drawer-diff-churn-bar")).toBe(true);
        expect(html.includes("total lines")).toBe(true);
      });

      test("renders multi-round tracking selector pills and active round banner", () => {
        const html = renderToString(<DiffsTab node={multiRoundNode} />);
        expect(html.includes("Multi-Round Tracking")).toBe(true);
        expect(html.includes("2 rounds")).toBe(true);
        expect(html.includes("All Rounds Merged")).toBe(true);
        expect(html.includes("Round 1: Initial Implementation")).toBe(true);
        expect(html.includes("Round 2: Repair Round (Finding Remediation)")).toBe(true);
      });

      test("interactive switching between round pills updates visible files and round banner", () => {
        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<DiffsTab node={multiRoundNode} />);
        });

        let json = JSON.stringify(renderer.toJSON());
        // All rounds merged shows all 3 files
        expect(json).toContain("DiffViewer.tsx");
        expect(json).toContain("DiffsTab.tsx");
        expect(json).toContain("NodeDetailDrawerTabs.css");

        // Switch to Round 1
        const round1Btn = renderer.root.findByProps({ title: "Round 1: Initial Implementation" });
        act(() => {
          round1Btn.props.onClick();
        });
        json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("Round 1: Initial Implementation");
        expect(json).toContain("DiffViewer.tsx");
        expect(json).toContain("DiffsTab.tsx");
        expect(json).not.toContain("NodeDetailDrawerTabs.css");

        // Switch to Round 2 (Repair Round)
        const round2Btn = renderer.root.findByProps({
          title: "Round 2: Repair Round (Finding Remediation)",
        });
        act(() => {
          round2Btn.props.onClick();
        });
        json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("Round 2: Repair Round (Finding Remediation)");
        expect(json).toContain("finding-adv-01");
        expect(json).toContain("Fixed multi-round tab filtering");
        expect(json).toContain("NodeDetailDrawerTabs.css");
        expect(json).not.toContain("DiffViewer.tsx");

        act(() => renderer.unmount());
      });

      test("interactive search input filters displayed files in real-time and clear button resets query", () => {
        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<DiffsTab node={multiRoundNode} />);
        });

        const searchInput = renderer.root.findByProps({ "aria-label": "Filter files by path" });
        expect(searchInput).toBeDefined();

        // Search for 'css'
        act(() => {
          searchInput.props.onChange({ target: { value: "css" } });
        });
        let json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("NodeDetailDrawerTabs.css");
        expect(json).not.toContain("DiffViewer.tsx");

        // Clear search
        const clearBtn = renderer.root.findByProps({ "aria-label": "Clear file search" });
        act(() => {
          clearBtn.props.onClick();
        });
        json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("DiffViewer.tsx");
        expect(json).toContain("NodeDetailDrawerTabs.css");

        act(() => renderer.unmount());
      });

      test("interactive mode filter buttons filter files by mode (Modified, Created)", () => {
        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<DiffsTab node={multiRoundNode} />);
        });

        const modifiedBtn = renderer.root.findAll(
          (el) =>
            typeof el.props.className === "string" &&
            el.props.className.includes("drawer-mode-filter-btn") &&
            Array.isArray(el.props.children) &&
            el.props.children[0] === "Modified (",
        )[0];
        expect(modifiedBtn).toBeDefined();
        act(() => {
          modifiedBtn.props.onClick();
        });
        let json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("NodeDetailDrawerTabs.css");
        expect(json).not.toContain("DiffViewer.tsx");

        const createdBtn = renderer.root.findAll(
          (el) =>
            typeof el.props.className === "string" &&
            el.props.className.includes("drawer-mode-filter-btn") &&
            Array.isArray(el.props.children) &&
            el.props.children[0] === "Created (",
        )[0];
        expect(createdBtn).toBeDefined();
        act(() => {
          createdBtn.props.onClick();
        });
        json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("DiffViewer.tsx");
        expect(json).not.toContain("NodeDetailDrawerTabs.css");

        act(() => renderer.unmount());
      });

      test("collapsible file tree navigation can be toggled and renders file paths with churn", () => {
        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<DiffsTab node={multiRoundNode} />);
        });

        let json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("drawer-diff-tree-panel");
        expect(json).toContain("File Navigation");

        // Toggle file tree off
        const fileTreeToggleBtn = renderer.root.findByProps({ title: "Hide file tree" });
        act(() => {
          fileTreeToggleBtn.props.onClick();
        });
        json = JSON.stringify(renderer.toJSON());
        expect(json).not.toContain("drawer-diff-tree-panel");

        act(() => renderer.unmount());
      });

      test("global Collapse All / Expand All toggle controls all file cards simultaneously", () => {
        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<DiffsTab node={multiRoundNode} />);
        });

        const toggleAllBtn = renderer.root.findByProps({ "aria-label": "Collapse all files" });
        expect(toggleAllBtn).toBeDefined();

        // Collapse All
        act(() => {
          toggleAllBtn.props.onClick();
        });
        let json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("is-collapsed");

        // Expand All
        const expandAllBtn = renderer.root.findByProps({ "aria-label": "Expand all files" });
        act(() => {
          expandAllBtn.props.onClick();
        });
        json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("is-expanded");

        act(() => renderer.unmount());
      });

      test("Copy All Diffs copies concatenated unified patch to clipboard with Copied All feedback", async () => {
        const copiedTexts: string[] = [];
        Object.defineProperty(globalThis, "navigator", {
          value: {
            clipboard: {
              writeText: async (t: string) => {
                copiedTexts.push(t);
              },
            },
          },
          configurable: true,
          writable: true,
        });

        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<DiffsTab node={multiRoundNode} />);
        });

        const copyAllBtn = renderer.root.findByProps({ "aria-label": "Copy all diffs" });
        await act(async () => {
          await copyAllBtn.props.onClick();
        });

        expect(copiedTexts.length).toBe(1);
        expect(copiedTexts[0]).toContain(
          "diff --git a/src/components/NodeDetailDrawer/DiffViewer.tsx",
        );
        expect(copiedTexts[0]).toContain(
          "diff --git a/src/components/NodeDetailDrawer/tabs/DiffsTab.tsx",
        );
        expect(JSON.stringify(renderer.toJSON())).toContain("Copied All");

        act(() => renderer.unmount());
      });

      test("renders standardized drawer-empty-state when node has no file modifications or write scope", () => {
        const emptyNode: GraphNodeData = {
          id: "node-empty-diffs",
          name: "Empty Diffs Node",
        };
        const html = renderToString(<DiffsTab node={emptyNode} />);
        expect(html.includes("drawer-empty-state")).toBe(true);
        expect(html.includes("No file modifications recorded for this node.")).toBe(true);
      });

      test("renders empty filter notice when search query yields 0 matching files", () => {
        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<DiffsTab node={multiRoundNode} />);
        });

        const searchInput = renderer.root.findByProps({ "aria-label": "Filter files by path" });
        act(() => {
          searchInput.props.onChange({ target: { value: "non_existent_file_path_123" } });
        });

        const json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("No files match the filter");
        expect(json).toContain("non_existent_file_path_123");

        act(() => renderer.unmount());
      });

      test("normalizes multi-round diffs from submissions and remediations arrays in metadata", () => {
        const subRemNode: GraphNodeData = {
          id: "node-sub-rem-test",
          name: "Submission & Remediation Node",
          metadata: {
            submissions: [
              {
                round: 1,
                author: "agent-impl-03",
                summary: "Initial submission of task",
                diff: "@@ -1 +1 @@\n-before\n+after",
              },
            ],
            remediations: [
              {
                round: 2,
                findingId: "finding-02",
                remediation: "Addressed adversarial pushback on empty diff handling",
                diff: "@@ -1,2 +1,3 @@\n+added remediation line",
              },
            ],
          },
        };

        const html = renderToString(<DiffsTab node={subRemNode} />);
        expect(html.includes("Submission Round 1")).toBe(true);
        expect(html.includes("Remediation Round 2 (finding-02)")).toBe(true);
      });

      test("finding-03-diffs-stress: edge case handling for empty diff payloads, long file path truncation, and multi-round diff switching", async () => {
        // 1. Edge case: Extremely long deeply nested file path
        const longPath =
          "src/features/super/deeply/nested/directory/structure/and/very/long/component/name/UnifiedDiffViewerStressComponentWithExtraLongFileNameForOverflowTesting.tsx";

        const stressNode: GraphNodeData = {
          id: "node-diffs-stress-test",
          name: "Diffs Stress Test Node",
          metadata: {
            writeScope: [longPath],
            repairRounds: 3,
            rounds: [
              {
                round: 1,
                title: "Round 1: Initial Scaffolding",
                type: "submission",
                timestamp: "2026-08-15T09:30:00.000Z",
                summary: "Initial empty scaffold and long path file",
                files: [
                  {
                    path: longPath,
                    mode: "create",
                    additions: 250,
                    deletions: 0,
                    diff: "@@ -0,0 +1,5 @@\n+export const LongPathStress = true;",
                  },
                  {
                    path: "src/empty-payload.ts",
                    mode: "create",
                    additions: 0,
                    deletions: 0,
                    diff: "",
                  },
                ],
              },
              {
                round: 2,
                title: "Round 2: Repair Round 1",
                type: "repair",
                timestamp: "2026-08-15T09:35:00.000Z",
                findingId: "finding-adv-02",
                summary: "Fixed boundary condition in diff chunk parser",
                files: [
                  {
                    path: longPath,
                    mode: "write",
                    additions: 15,
                    deletions: 30,
                    diff: "@@ -1,5 +1,4 @@\n-const old = false;\n+const repaired = true;",
                  },
                ],
              },
              {
                round: 3,
                title: "Round 3: Final Resolution",
                type: "remediation",
                timestamp: "2026-08-15T09:40:00.000Z",
                findingId: "finding-adv-03",
                summary: "Final pass verification and clean signoff",
                files: [
                  {
                    path: "src/clean-signoff.ts",
                    mode: "create",
                    additions: 50,
                    deletions: 0,
                    diff: "@@ -0,0 +1,2 @@\n+export const SignedOff = true;",
                  },
                ],
              },
            ],
          },
        };

        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<DiffsTab node={stressNode} />);
        });

        let json = JSON.stringify(renderer.toJSON());

        // Multi-round selector rendered with 3 rounds + All Merged
        expect(json).toContain("Multi-Round Tracking");
        expect(json).toContain("3 rounds");
        expect(json).toContain("All Rounds Merged");
        expect(json).toContain("Round 1: Initial Scaffolding");
        expect(json).toContain("Round 2: Repair Round 1");
        expect(json).toContain("Round 3: Final Resolution");

        // Long path properly rendered and truncated with tooltip
        expect(json).toContain(longPath);
        expect(json).toContain("drawer-tree-path");

        // Empty diff payload rendered cleanly with notice
        expect(json).toContain("src/empty-payload.ts");
        expect(json).toContain("No line-level diff content recorded for this file.");

        // Switch to Round 2 (Repair Round with finding link)
        const round2Btn = renderer.root.findByProps({ title: "Round 2: Repair Round 1" });
        act(() => {
          round2Btn.props.onClick();
        });
        json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("Round 2: Repair Round 1");
        expect(json).toContain("finding-adv-02");
        expect(json).toContain("Fixed boundary condition in diff chunk parser");
        expect(json).toContain("+15");
        expect(json).toContain("-30");
        expect(json).not.toContain("src/clean-signoff.ts");

        // Switch to Round 3 (Remediation)
        const round3Btn = renderer.root.findByProps({ title: "Round 3: Final Resolution" });
        act(() => {
          round3Btn.props.onClick();
        });
        json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("Round 3: Final Resolution");
        expect(json).toContain("finding-adv-03");
        expect(json).toContain("src/clean-signoff.ts");
        expect(json).not.toContain("Fixed boundary condition");

        // Switch back to All Rounds Merged
        const allBtn = renderer.root.findAll(
          (el) =>
            typeof el.props.className === "string" &&
            el.props.className.includes("drawer-diff-round-pill") &&
            el.props.children?.[1]?.props?.children === "All Rounds Merged",
        )[0];
        expect(allBtn).toBeDefined();
        act(() => {
          allBtn.props.onClick();
        });
        json = JSON.stringify(renderer.toJSON());
        expect(json).toContain("src/clean-signoff.ts");
        expect(json).toContain("src/empty-payload.ts");

        // Copy empty diff test
        const emptyDiffCopyTarget: FileRef = { path: "src/no-diff.ts", diff: "", mode: "create" };
        let diffViewerRenderer!: ReactTestRenderer;
        act(() => {
          diffViewerRenderer = create(
            <DiffViewer file={emptyDiffCopyTarget} defaultExpanded={true} />,
          );
        });
        expect(JSON.stringify(diffViewerRenderer.toJSON())).toContain(
          "No line-level diff content recorded for this file.",
        );
        act(() => diffViewerRenderer.unmount());

        act(() => renderer.unmount());
      });
    });
  });

  describe("SubagentLineageTree & Hierarchical Execution Call Tree", () => {
    test("normalizeRole maps coordinator, implementer, validator, subagent, and tool roles with appropriate badges and styling", () => {
      const coordinator = normalizeRole("coordinator");
      expect(coordinator.label).toBe("COORDINATOR");
      expect(coordinator.roleType).toBe("coordinator");
      expect(coordinator.badgeClass).toContain("drawer-role-badge--coordinator");
      expect(coordinator.color).toBe("#818cf8");

      const orchestrator = normalizeRole("orchestrator");
      expect(orchestrator.label).toBe("COORDINATOR");
      expect(orchestrator.roleType).toBe("coordinator");

      const implementer = normalizeRole("implementer");
      expect(implementer.label).toBe("IMPLEMENTER");
      expect(implementer.roleType).toBe("implementer");
      expect(implementer.badgeClass).toContain("drawer-role-badge--implementer");
      expect(implementer.color).toBe("#c084fc");

      const builder = normalizeRole("builder");
      expect(builder.label).toBe("IMPLEMENTER");
      expect(builder.roleType).toBe("implementer");

      const validator = normalizeRole("validator");
      expect(validator.label).toBe("VALIDATOR");
      expect(validator.roleType).toBe("validator");
      expect(validator.badgeClass).toContain("drawer-role-badge--validator");
      expect(validator.color).toBe("#fbbf24");

      const critic = normalizeRole("critic");
      expect(critic.label).toBe("VALIDATOR");
      expect(critic.roleType).toBe("validator");

      const subagent = normalizeRole("subagent");
      expect(subagent.label).toBe("SUBAGENT");
      expect(subagent.roleType).toBe("subagent");
      expect(subagent.badgeClass).toContain("drawer-role-badge--subagent");
      expect(subagent.color).toBe("#38bdf8");

      const tool = normalizeRole("tool");
      expect(tool.label).toBe("TOOL");
      expect(tool.roleType).toBe("tool");
      expect(tool.badgeClass).toContain("drawer-role-badge--tool");

      const unknownRole = normalizeRole("custom-specialist");
      expect(unknownRole.label).toBe("CUSTOM-SPECIALIST");
      expect(unknownRole.roleType).toBe("other");
      expect(unknownRole.badgeClass).toContain("drawer-role-badge--other");
    });

    test("describeLineageStatus normalizes lifecycle statuses with colors and animated pulse", () => {
      const success = describeLineageStatus("success");
      expect(success.label).toBe("Success");
      expect(success.statusClass).toContain("is-success");
      expect(success.animated).toBe(false);

      const satisfied = describeLineageStatus("satisfied");
      expect(satisfied.label).toBe("Success");
      expect(satisfied.statusClass).toContain("is-success");

      const running = describeLineageStatus("running");
      expect(running.label).toBe("Running");
      expect(running.statusClass).toContain("is-running");
      expect(running.animated).toBe(true);

      const validating = describeLineageStatus("validating");
      expect(validating.label).toBe("Validating");
      expect(validating.statusClass).toContain("is-running");
      expect(validating.animated).toBe(true);

      const leased = describeLineageStatus("leased");
      expect(leased.label).toBe("Leased");
      expect(leased.statusClass).toContain("is-running");

      const error = describeLineageStatus("error");
      expect(error.label).toBe("Failed");
      expect(error.statusClass).toContain("is-error");
      expect(error.animated).toBe(false);

      const rejected = describeLineageStatus("rejected");
      expect(rejected.label).toBe("Rejected");
      expect(rejected.statusClass).toContain("is-error");

      const repaired = describeLineageStatus("repaired");
      expect(repaired.label).toBe("Repaired");
      expect(repaired.statusClass).toContain("is-warning");

      const pending = describeLineageStatus("pending");
      expect(pending.label).toBe("Pending");
      expect(pending.statusClass).toContain("is-pending");

      const skipped = describeLineageStatus("skipped");
      expect(skipped.label).toBe("Skipped");
      expect(skipped.statusClass).toContain("is-skipped");

      const fallback = describeLineageStatus(undefined);
      expect(fallback.label).toBe("READY");
      expect(fallback.statusClass).toContain("is-neutral");
    });

    test("extractLineageTree extracts nested subagent tree from metadata", () => {
      const nestedNode: GraphNodeData = {
        id: "coord-root",
        name: "Meta Coordinator",
        metadata: {
          subagentTree: [
            {
              id: "coord-root",
              nodeId: "coord-root",
              name: "Meta Coordinator",
              role: "coordinator",
              status: "running",
              model: "claude-3-5-sonnet",
              children: [
                {
                  id: "sub-lane-b",
                  nodeId: "node-lane-b",
                  name: "Lane B Subagent",
                  role: "subagent",
                  status: "running",
                  taskId: "task-02-lineage",
                  children: [
                    {
                      id: "impl-t02",
                      nodeId: "node-impl-t02",
                      name: "Implementer Agent (t02)",
                      role: "implementer",
                      status: "success",
                      durationMs: 14500,
                      tokens: 8400,
                      writeScope: ["src/components/SubagentLineageTree.tsx"],
                    },
                    {
                      id: "val-t02",
                      nodeId: "node-val-t02",
                      name: "Validator Agent (t02)",
                      role: "validator",
                      status: "success",
                      durationMs: 3200,
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      const extracted = extractLineageTree(nestedNode);
      expect(extracted.length).toBe(1);
      expect(extracted[0]?.name).toBe("Meta Coordinator");
      expect(extracted[0]?.role).toBe("coordinator");
      expect(extracted[0]?.children?.length).toBe(1);

      const subagent = extracted[0]?.children?.[0];
      expect(subagent?.name).toBe("Lane B Subagent");
      expect(subagent?.role).toBe("subagent");
      expect(subagent?.children?.length).toBe(2);

      const impl = subagent?.children?.[0];
      expect(impl?.name).toBe("Implementer Agent (t02)");
      expect(impl?.role).toBe("implementer");
      expect(impl?.status).toBe("success");
      expect(impl?.durationMs).toBe(14500);
      expect(impl?.tokens).toBe(8400);

      const val = subagent?.children?.[1];
      expect(val?.name).toBe("Validator Agent (t02)");
      expect(val?.role).toBe("validator");
      expect(val?.status).toBe("success");
    });

    test("extractLineageTree builds call tree from GraphDataset edges and nodes", () => {
      const rootNode: GraphNodeData = {
        id: "node-coord",
        name: "Root Coordinator",
        kind: "orchestrator",
        status: "running",
        model: "claude-3-5-sonnet",
      };

      const childSubagent: GraphNodeData = {
        id: "node-sub-1",
        name: "Worker Subagent 1",
        kind: "agent",
        status: "success",
        model: "gemini-1.5-pro",
      };

      const grandchildVal: GraphNodeData = {
        id: "node-val-1",
        name: "Adversarial Gatekeeper",
        kind: "critic",
        status: "success",
      };

      const sampleDataset: GraphDataset = {
        id: "dataset-test",
        title: "Test Hierarchy Dataset",
        nodes: [rootNode, childSubagent, grandchildVal],
        edges: [
          {
            id: "edge-1",
            source: "node-coord",
            target: "node-sub-1",
            kind: "spawn",
          },
          {
            id: "edge-2",
            source: "node-sub-1",
            target: "node-val-1",
            kind: "validation",
          },
        ],
      };

      const tree = extractLineageTree(rootNode, sampleDataset);
      expect(tree.length).toBe(1);
      expect(tree[0]?.id).toBe("node-coord");
      expect(tree[0]?.children?.length).toBe(1);
      expect(tree[0]?.children?.[0]?.id).toBe("node-sub-1");
      expect(tree[0]?.children?.[0]?.children?.length).toBe(1);
      expect(tree[0]?.children?.[0]?.children?.[0]?.id).toBe("node-val-1");
      expect(tree[0]?.children?.[0]?.children?.[0]?.role).toBe("critic");
    });

    test("extractLineageTree synthesizes hierarchy from provenance chain of custody", () => {
      const custodyNode: GraphNodeData = {
        id: "node-custody",
        name: "Custody Provenance Node",
        kind: "orchestrator",
        status: "success",
        provenance: {
          chainOfCustody: [
            {
              actorId: "gvui-impl-t02",
              role: "implementer",
              status: "repaired",
              leaseToken: "lease_token_impl_t02",
              durationMs: 8200,
            },
            {
              actorId: "gvui-val-t02",
              role: "validator",
              status: "satisfied",
              leaseToken: "lease_token_val_t02",
              durationMs: 2400,
            },
          ],
        },
      };

      const tree = extractLineageTree(custodyNode);
      expect(tree.length).toBe(1);
      expect(tree[0]?.id).toBe("node-custody");
      expect(tree[0]?.children?.length).toBe(2);
      expect(tree[0]?.children?.[0]?.name).toBe("gvui-impl-t02");
      expect(tree[0]?.children?.[0]?.role).toBe("implementer");
      expect(tree[0]?.children?.[0]?.status).toBe("repaired");
      expect(tree[0]?.children?.[1]?.name).toBe("gvui-val-t02");
      expect(tree[0]?.children?.[1]?.role).toBe("validator");
      expect(tree[0]?.children?.[1]?.status).toBe("satisfied");
    });

    test("calculateLineageMetrics accurately aggregates counts, roles, statuses, tokens, and duration", () => {
      const sampleTree: SubagentLineageNode[] = [
        {
          id: "c-1",
          name: "Coordinator",
          role: "coordinator",
          status: "running",
          tokens: 5000,
          durationMs: 12000,
          children: [
            {
              id: "s-1",
              name: "Subagent Lane A",
              role: "subagent",
              status: "running",
              tokens: 15000,
              durationMs: 45000,
              children: [
                {
                  id: "i-1",
                  name: "Implementer 1",
                  role: "implementer",
                  status: "success",
                  tokens: 8000,
                  durationMs: 25000,
                },
                {
                  id: "v-1",
                  name: "Validator 1",
                  role: "validator",
                  status: "error",
                  tokens: 2000,
                  durationMs: 5000,
                },
              ],
            },
            {
              id: "t-1",
              name: "Test Runner Tool",
              role: "tool",
              status: "success",
              tokens: 500,
              durationMs: 1500,
            },
          ],
        },
      ];

      const metrics = calculateLineageMetrics(sampleTree);
      expect(metrics.total).toBe(5);
      expect(metrics.coordinators).toBe(1);
      expect(metrics.subagents).toBe(1);
      expect(metrics.implementers).toBe(1);
      expect(metrics.validators).toBe(1);
      expect(metrics.tools).toBe(1);
      expect(metrics.successful).toBe(2);
      expect(metrics.running).toBe(2);
      expect(metrics.failed).toBe(1);
      expect(metrics.totalTokens).toBe(30500);
      expect(metrics.totalDurationMs).toBe(88500);
      expect(metrics.maxDepth).toBe(2);
    });

    test("flattenLineageTree respects branch expansion state and calculates depth and child counts", () => {
      const sampleTree: SubagentLineageNode[] = [
        {
          id: "root",
          name: "Root",
          role: "coordinator",
          children: [
            {
              id: "child-1",
              name: "Child 1",
              role: "subagent",
              children: [
                {
                  id: "grandchild-1",
                  name: "Grandchild 1",
                  role: "implementer",
                },
              ],
            },
            {
              id: "child-2",
              name: "Child 2",
              role: "subagent",
            },
          ],
        },
      ];

      const allIds = collectAllNodeIds(sampleTree);
      expect(allIds).toContain("root");
      expect(allIds).toContain("child-1");

      // 1. All expanded
      const expandedAll = new Set(["root", "child-1"]);
      const flatExpanded = flattenLineageTree(sampleTree, expandedAll);
      expect(flatExpanded.length).toBe(4);
      expect(flatExpanded[0]?.name).toBe("Root");
      expect(flatExpanded[0]?.depth).toBe(0);
      expect(flatExpanded[0]?.childCount).toBe(2);
      expect(flatExpanded[1]?.name).toBe("Child 1");
      expect(flatExpanded[1]?.depth).toBe(1);
      expect(flatExpanded[1]?.childCount).toBe(1);
      expect(flatExpanded[2]?.name).toBe("Grandchild 1");
      expect(flatExpanded[2]?.depth).toBe(2);
      expect(flatExpanded[3]?.name).toBe("Child 2");
      expect(flatExpanded[3]?.depth).toBe(1);

      // 2. Child-1 collapsed
      const collapsedChild = new Set(["root"]);
      const flatCollapsed = flattenLineageTree(sampleTree, collapsedChild);
      expect(flatCollapsed.length).toBe(3);
      expect(flatCollapsed.map((r) => r.name)).toEqual(["Root", "Child 1", "Child 2"]);

      // 3. Root collapsed
      const collapsedRoot = new Set<string>();
      const flatRootCollapsed = flattenLineageTree(sampleTree, collapsedRoot);
      expect(flatRootCollapsed.length).toBe(1);
      expect(flatRootCollapsed[0]?.name).toBe("Root");
    });

    test("SubagentLineageTree renders standardized empty state when node has no lineage data", () => {
      const emptyNode: GraphNodeData = {
        id: "node-no-lineage",
        name: "Isolated Node",
      };

      const html = renderToString(<SubagentLineageTree node={emptyNode} />);
      expect(html.includes("drawer-empty-state")).toBe(true);
      expect(
        html.includes("No subagent lineage or hierarchical call tree recorded for this node."),
      ).toBe(true);
    });

    test("SubagentLineageTree renders complete hierarchical call tree with role badges, status chips, and depth indentation", () => {
      const richHierarchyNode: GraphNodeData = {
        id: "coord-meta",
        name: "Meta Orchestrator Round 3",
        kind: "orchestrator",
        metadata: {
          subagentTree: [
            {
              id: "coord-meta",
              nodeId: "coord-meta",
              name: "Meta Orchestrator Round 3",
              role: "coordinator",
              status: "running",
              model: "claude-3-5-sonnet",
              tier: "l",
              tokens: 12500,
              durationMs: 65000,
              summary: "Orchestrates evolutionary lanes A through D",
              children: [
                {
                  id: "lane-b-subagent",
                  nodeId: "lane-b-node",
                  name: "Lane B: Lineage & Call Tree Subagent",
                  role: "subagent",
                  status: "running",
                  model: "gemini-1.5-pro",
                  tier: "m",
                  taskId: "task-02-gvui-subagent-lineage-call-tree",
                  summary: "Implements hierarchical call tree drawer component",
                  children: [
                    {
                      id: "impl-t02",
                      nodeId: "impl-t02-node",
                      name: "gvui-impl-t02",
                      role: "implementer",
                      status: "success",
                      model: "gemini-1.5-pro",
                      tier: "m",
                      durationMs: 18200,
                      tokens: 9500,
                      writeScope: [
                        "src/components/NodeDetailDrawer/tabs/SubagentLineageTree.tsx",
                        "src/components/NodeDetailDrawer/tabs/OverviewTab.tsx",
                      ],
                      summary: "Component implemented with full tree hierarchy and tests",
                    },
                    {
                      id: "val-t02",
                      nodeId: "val-t02-node",
                      name: "gvui-val-t02",
                      role: "validator",
                      status: "validating",
                      model: "claude-3-5-sonnet",
                      durationMs: 4200,
                      summary: "Executing adversarial gate validation and regression checks",
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <SubagentLineageTree node={richHierarchyNode} selectedNodeId="coord-meta" />,
        );
      });

      const json = JSON.stringify(renderer.toJSON());

      // 1. Total hierarchy count & section header
      expect(json).toContain("Subagent Lineage & Call Tree");
      expect(json).toContain("4 agents");

      // 2. Role Badges rendered
      expect(json).toContain("COORDINATOR");
      expect(json).toContain("SUBAGENT");
      expect(json).toContain("IMPLEMENTER");
      expect(json).toContain("VALIDATOR");
      expect(json).toContain("drawer-role-badge--coordinator");
      expect(json).toContain("drawer-role-badge--implementer");
      expect(json).toContain("drawer-role-badge--validator");
      expect(json).toContain("drawer-role-badge--subagent");

      // 3. Status chips rendered
      expect(json).toContain("Running");
      expect(json).toContain("Success");
      expect(json).toContain("Validating");
      expect(json).toContain("drawer-lineage-status is-success");
      expect(json).toContain("drawer-lineage-status is-running");

      // 4. Node names and identifiers rendered
      expect(json).toContain("Meta Orchestrator Round 3");
      expect(json).toContain("Lane B: Lineage & Call Tree Subagent");
      expect(json).toContain("gvui-impl-t02");
      expect(json).toContain("gvui-val-t02");

      // 5. Secondary metadata chips
      expect(json).toContain("task-02-gvui-subagent-lineage-call-tree");
      expect(json).toContain("claude-3-5-sonnet");
      expect(json).toContain("gemini-1.5-pro");
      expect(json).toContain("Tier L");
      expect(json).toContain("Tier M");
      expect(json).toContain("2 files");

      // 6. Current node indicator
      expect(json).toContain("(Current Node)");
      expect(json).toContain("is-selected-node");

      act(() => renderer.unmount());
    });

    test("interactive expand/collapse toggles update visible tree rows", () => {
      const treeNode: GraphNodeData = {
        id: "coord-test",
        name: "Coordinator",
        metadata: {
          subagentTree: [
            {
              id: "coord-test",
              name: "Coordinator",
              role: "coordinator",
              children: [
                {
                  id: "sub-1",
                  name: "Subagent Alpha",
                  role: "subagent",
                  children: [
                    {
                      id: "impl-1",
                      name: "Implementer Alpha",
                      role: "implementer",
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<SubagentLineageTree node={treeNode} />);
      });

      let json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Coordinator");
      expect(json).toContain("Subagent Alpha");
      expect(json).toContain("Implementer Alpha");

      // Collapse Subagent Alpha
      const toggleBtn = renderer.root.findByProps({ "aria-label": "Collapse Subagent Alpha" });
      act(() => {
        toggleBtn.props.onClick({ stopPropagation: () => {} });
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Coordinator");
      expect(json).toContain("Subagent Alpha");
      expect(json).not.toContain("Implementer Alpha");

      // Collapse All
      const collapseAllBtn = renderer.root.findByProps({ title: "Collapse All Branches" });
      act(() => {
        collapseAllBtn.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Coordinator");
      expect(json).not.toContain("Subagent Alpha");
      expect(json).not.toContain("Implementer Alpha");

      // Expand All
      const expandAllBtn = renderer.root.findByProps({ title: "Expand All Branches" });
      act(() => {
        expandAllBtn.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Coordinator");
      expect(json).toContain("Subagent Alpha");
      expect(json).toContain("Implementer Alpha");

      act(() => renderer.unmount());
    });

    test("interactive search input and role filter pills filter subagent tree in real time", () => {
      const searchNode: GraphNodeData = {
        id: "coord-search",
        name: "Searchable Coordinator",
        metadata: {
          subagentTree: [
            {
              id: "coord-search",
              name: "Searchable Coordinator",
              role: "coordinator",
              children: [
                {
                  id: "lane-alpha",
                  name: "Lane Alpha Subagent",
                  role: "subagent",
                  taskId: "task-01-command-inspector",
                },
                {
                  id: "lane-beta",
                  name: "Lane Beta Subagent",
                  role: "subagent",
                  taskId: "task-02-lineage-tree",
                  children: [
                    {
                      id: "impl-beta",
                      name: "Lane Beta Implementer",
                      role: "implementer",
                      model: "gemini-1.5-pro",
                    },
                    {
                      id: "val-beta",
                      name: "Lane Beta Validator",
                      role: "validator",
                      model: "claude-3-5-sonnet",
                    },
                  ],
                },
              ],
            },
          ],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<SubagentLineageTree node={searchNode} />);
      });

      // 1. Search filter by text query "task-02"
      const searchInput = renderer.root.findByProps({ "aria-label": "Filter subagents" });
      act(() => {
        searchInput.props.onChange({ target: { value: "task-02" } });
      });

      let json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Lane Beta Subagent");
      expect(json).not.toContain("Lane Alpha Subagent");

      // 2. Clear search button
      const clearBtn = renderer.root.findByProps({ "aria-label": "Clear search" });
      act(() => {
        clearBtn.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Lane Alpha Subagent");
      expect(json).toContain("Lane Beta Subagent");

      // 3. Filter by Validator role
      const valFilterBtn = renderer.root.findByProps({
        children: "Validators (1)",
      });
      act(() => {
        valFilterBtn.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Lane Beta Validator");
      expect(json).not.toContain("Lane Alpha Subagent");
      expect(json).not.toContain("Lane Beta Implementer");

      // 4. Reset to All Roles
      const allFilterBtn = renderer.root.findByProps({
        children: "All Roles (5)",
      });
      act(() => {
        allFilterBtn.props.onClick();
      });

      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Lane Alpha Subagent");
      expect(json).toContain("Lane Beta Implementer");
      expect(json).toContain("Lane Beta Validator");

      // 5. Query matching 0 results
      act(() => {
        searchInput.props.onChange({ target: { value: "nonexistent-specialist" } });
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("No subagent nodes match the current filter");
      expect(json).toContain("nonexistent-specialist");

      act(() => renderer.unmount());
    });

    test("clicking node button triggers onSelectNode callback or updates graph store selectedNodeId", () => {
      const selectedIds: string[] = [];
      const onSelect = (id: string) => {
        selectedIds.push(id);
      };

      const clickableNode: GraphNodeData = {
        id: "coord-click",
        name: "Clickable Coordinator",
        metadata: {
          subagentTree: [
            {
              id: "coord-click",
              nodeId: "target-coord-node",
              name: "Clickable Coordinator",
              role: "coordinator",
              children: [
                {
                  id: "sub-click",
                  nodeId: "target-sub-node",
                  name: "Clickable Subagent",
                  role: "subagent",
                },
              ],
            },
          ],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<SubagentLineageTree node={clickableNode} onSelectNode={onSelect} />);
      });

      const buttons = renderer.root.findAllByProps({ className: "drawer-lineage-name-btn" });
      expect(buttons.length).toBe(2);

      // Click subagent button
      act(() => {
        buttons[1]?.props.onClick();
      });
      expect(selectedIds).toContain("target-sub-node");

      // Click coordinator button
      act(() => {
        buttons[0]?.props.onClick();
      });
      expect(selectedIds).toContain("target-coord-node");

      act(() => renderer.unmount());
    });

    test("OverviewTab cleanly integrates SubagentLineageTree with metadata and onSelectNode handler", () => {
      const selectedIds: string[] = [];
      const handleSelectNode = (id: string) => {
        selectedIds.push(id);
      };

      const overviewTestNode: GraphNodeData = {
        id: "overview-node-1",
        name: "Overview Coordinator Node",
        kind: "orchestrator",
        status: "running",
        description: "Orchestrator managing multi-lane work",
        metrics: {
          tokensIn: 5000,
          tokensOut: 1200,
          durationMs: 45000,
        },
        metadata: {
          subagentTree: [
            {
              id: "overview-node-1",
              nodeId: "overview-node-1",
              name: "Overview Coordinator Node",
              role: "coordinator",
              status: "running",
              children: [
                {
                  id: "subagent-b",
                  nodeId: "subagent-b-id",
                  name: "Lane B Implementer",
                  role: "implementer",
                  status: "success",
                  taskId: "task-02-call-tree",
                  writeScope: ["src/components/SubagentLineageTree.tsx"],
                },
              ],
            },
          ],
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <OverviewTab
            node={overviewTestNode}
            inputs={[]}
            outputs={[]}
            nodeNamesById={new Map()}
            onSelectNode={handleSelectNode}
          />,
        );
      });

      const json = JSON.stringify(renderer.toJSON());

      // Overview execution metrics
      expect(json).toContain("Execution Metrics");
      expect(json).toContain("Tokens In");

      // Subagent Lineage section inside OverviewTab
      expect(json).toContain("Subagent Lineage & Call Tree");
      expect(json).toContain("Lane B Implementer");
      expect(json).toContain("IMPLEMENTER");
      expect(json).toContain("task-02-call-tree");

      // Click jump inside OverviewTab
      const jumpBtn = renderer.root.findAllByProps({
        title: "Select Lane B Implementer in graph",
      })[0];
      expect(jumpBtn).toBeDefined();
      act(() => {
        jumpBtn?.props.onClick();
      });
      expect(selectedIds).toContain("subagent-b-id");

      act(() => renderer.unmount());
    });

    test("finding-02-stress-lineage: robust handling of deep trees, cycles, malformed records, and missing fields", () => {
      // 1. Deep 5-level hierarchy
      const deepNode: GraphNodeData = {
        id: "lvl-0",
        name: "L0 Meta Coordinator",
        metadata: {
          subagentTree: {
            id: "lvl-0",
            name: "L0 Meta Coordinator",
            role: "coordinator",
            children: [
              {
                id: "lvl-1",
                name: "L1 Lane Coordinator",
                role: "coordinator",
                children: [
                  {
                    id: "lvl-2",
                    name: "L2 Subagent Dispatcher",
                    role: "subagent",
                    children: [
                      {
                        id: "lvl-3",
                        name: "L3 Worker Implementer",
                        role: "implementer",
                        children: [
                          {
                            id: "lvl-4",
                            name: "L4 Unit Validator",
                            role: "validator",
                            status: "success",
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      };

      const extractedDeep = extractLineageTree(deepNode);
      expect(extractedDeep.length).toBe(1);
      const metrics = calculateLineageMetrics(extractedDeep);
      expect(metrics.total).toBe(5);
      expect(metrics.maxDepth).toBe(4);

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<SubagentLineageTree node={deepNode} />);
      });

      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("L0 Meta Coordinator");
      expect(json).toContain("L4 Unit Validator");
      expect(json).toContain("5 agents");

      // 2. Malformed record with nulls / missing fields
      const malformedNode: GraphNodeData = {
        id: "malformed-node",
        name: "Malformed Node",
        metadata: {
          subagentTree: [
            null,
            { name: "Unnamed Agent with No Id" },
            { id: "agent-broken", children: [null, undefined, "not an object"] },
          ],
        },
      };

      const extractedMalformed = extractLineageTree(malformedNode);
      expect(extractedMalformed.length).toBe(2);

      let malformedRenderer!: ReactTestRenderer;
      act(() => {
        malformedRenderer = create(<SubagentLineageTree node={malformedNode} />);
      });
      expect(JSON.stringify(malformedRenderer.toJSON())).toContain("Unnamed Agent with No Id");
      act(() => malformedRenderer.unmount());

      act(() => renderer.unmount());
    });
  });

  describe("DependenciesTab & ImpactGraph Node Dependency & Blast Radius Inspector", () => {
    const mockDataset: GraphDataset = {
      id: "run-analysis-1",
      title: "Multi-Agent Workflow Run",
      nodes: [
        {
          id: "node-root",
          name: "Prompt Ingestion",
          kind: "input",
          status: "success",
          step: 1,
          metrics: { tokensIn: 100, tokensOut: 500, durationMs: 1000, costUsd: 0.01 },
        },
        {
          id: "node-plan",
          name: "Planner Decomposition",
          kind: "orchestrator",
          status: "success",
          step: 2,
          metrics: { tokensIn: 500, tokensOut: 1200, durationMs: 2500, costUsd: 0.05 },
        },
        {
          id: "node-impl-1",
          name: "Playback Controls Implementer",
          kind: "agent",
          status: "success",
          step: 3,
          metrics: { tokensIn: 1200, tokensOut: 3000, durationMs: 8000, costUsd: 0.12 },
        },
        {
          id: "node-impl-2",
          name: "Impact Inspector Implementer",
          kind: "agent",
          status: "running",
          step: 3,
          metrics: { tokensIn: 1500, tokensOut: 4000, durationMs: 12000, costUsd: 0.15 },
        },
        {
          id: "node-gate",
          name: "Quality Gate Validator",
          kind: "gate",
          status: "pending",
          step: 4,
          metrics: { tokensIn: 200, tokensOut: 400, durationMs: 1500, costUsd: 0.02 },
        },
        {
          id: "node-exit",
          name: "Run Complete Terminal",
          kind: "terminal",
          status: "pending",
          step: 5,
        },
      ],
      edges: [
        { id: "e1", source: "node-root", target: "node-plan", kind: "sequence" },
        {
          id: "e2",
          source: "node-plan",
          target: "node-impl-1",
          kind: "spawn",
          handoff: { kind: "decision", summary: "Task 1 scope", tokens: 250 },
        },
        {
          id: "e3",
          source: "node-plan",
          target: "node-impl-2",
          kind: "spawn",
          handoff: { kind: "decision", summary: "Task 2 scope", tokens: 300 },
        },
        { id: "e4", source: "node-impl-1", target: "node-gate", kind: "dependency" },
        { id: "e5", source: "node-impl-2", target: "node-gate", kind: "dependency" },
        { id: "e6", source: "node-gate", target: "node-exit", kind: "sequence" },
      ],
    };

    test("extractNodeFailureReason extracts command exit codes, audit observations, and status fallbacks", () => {
      const healthyNode: GraphNodeData = { id: "n1", name: "Healthy", status: "success" };
      expect(extractNodeFailureReason(healthyNode)).toBeUndefined();

      const failedCmdNode: GraphNodeData = {
        id: "n2",
        name: "Failed Cmd",
        status: "error",
        metadata: {
          commands: [
            {
              id: "cmd-1",
              argv: ["bun", "test"],
              cwd: "/app",
              exitCode: 1,
              durationMs: 100,
              startedAt: "2026-08-15T00:00:00Z",
              finishedAt: "2026-08-15T00:00:01Z",
              stderrSnippet: "SyntaxError: Unexpected token",
            },
          ],
        },
      };
      expect(extractNodeFailureReason(failedCmdNode)).toContain("Exit code 1");
      expect(extractNodeFailureReason(failedCmdNode)).toContain("SyntaxError");

      const findingNode: GraphNodeData = {
        id: "n3",
        name: "Finding Node",
        status: "warning",
        metadata: {
          findings: [
            {
              id: "find-1",
              status: "open",
              severity: "critical",
              observation: "Missing unit test coverage",
            },
          ],
        },
      };
      expect(extractNodeFailureReason(findingNode)).toContain("Missing unit test coverage");

      const rawErrorNode: GraphNodeData = { id: "n4", name: "Raw Err", status: "error" };
      expect(extractNodeFailureReason(rawErrorNode)).toBe("Node terminated with status error");

      const rawWarnNode: GraphNodeData = { id: "n5", name: "Raw Warn", status: "warning" };
      expect(extractNodeFailureReason(rawWarnNode)).toBe("Node produced validation warnings");
    });

    test("detectGraphCycles identifies direct and transitive cycles in directed graphs", () => {
      const acyclic = new Map<string, string[]>([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", []],
      ]);
      expect(detectGraphCycles(acyclic)).toEqual([]);

      const cyclic2 = new Map<string, string[]>([
        ["A", ["B"]],
        ["B", ["A"]],
      ]);
      const cycles2 = detectGraphCycles(cyclic2);
      expect(cycles2.length).toBeGreaterThanOrEqual(1);
      expect(cycles2[0]).toEqual(["A", "B", "A"]);

      const cyclic3 = new Map<string, string[]>([
        ["A", ["B"]],
        ["B", ["C"]],
        ["C", ["A"]],
      ]);
      const cycles3 = detectGraphCycles(cyclic3);
      expect(cycles3.length).toBeGreaterThanOrEqual(1);
      expect(cycles3[0]).toEqual(["A", "B", "C", "A"]);
    });

    test("calculateTopologicalLevels computes DAG depth, height, and critical path identification", () => {
      const forwardAdj = new Map<string, string[]>([
        ["node-root", ["node-plan"]],
        ["node-plan", ["node-impl-1", "node-impl-2"]],
        ["node-impl-1", ["node-gate"]],
        ["node-impl-2", ["node-gate"]],
        ["node-gate", ["node-exit"]],
        ["node-exit", []],
      ]);
      const backwardAdj = new Map<string, string[]>([
        ["node-root", []],
        ["node-plan", ["node-root"]],
        ["node-impl-1", ["node-plan"]],
        ["node-impl-2", ["node-plan"]],
        ["node-gate", ["node-impl-1", "node-impl-2"]],
        ["node-exit", ["node-gate"]],
      ]);

      const rootLevels = calculateTopologicalLevels(
        "node-root",
        mockDataset.nodes,
        forwardAdj,
        backwardAdj,
      );
      expect(rootLevels.depth).toBe(0);
      expect(rootLevels.height).toBe(4);

      const planLevels = calculateTopologicalLevels(
        "node-plan",
        mockDataset.nodes,
        forwardAdj,
        backwardAdj,
      );
      expect(planLevels.depth).toBe(1);
      expect(planLevels.height).toBe(3);

      const gateLevels = calculateTopologicalLevels(
        "node-gate",
        mockDataset.nodes,
        forwardAdj,
        backwardAdj,
      );
      expect(gateLevels.depth).toBe(3);
      expect(gateLevels.height).toBe(1);

      const exitLevels = calculateTopologicalLevels(
        "node-exit",
        mockDataset.nodes,
        forwardAdj,
        backwardAdj,
      );
      expect(exitLevels.depth).toBe(4);
      expect(exitLevels.height).toBe(0);
    });

    test("analyzeNodeDependencies accurately computes direct/transitive dependencies, metrics, and blast radius", () => {
      const planNode = mockDataset.nodes.find((n) => n.id === "node-plan")!;
      const analysis = analyzeNodeDependencies(planNode, mockDataset);

      // Direct prerequisites
      expect(analysis.directPrerequisites.length).toBe(1);
      expect(analysis.directPrerequisites[0].id).toBe("node-root");
      expect(analysis.directPrerequisites[0].hopDistance).toBe(-1);

      // Direct dependents
      expect(analysis.directDependents.length).toBe(2);
      expect(analysis.directDependents.map((d) => d.id)).toContain("node-impl-1");
      expect(analysis.directDependents.map((d) => d.id)).toContain("node-impl-2");

      // Transitive dependents (Blast radius: impl-1, impl-2, gate, exit = 4 nodes)
      expect(analysis.transitiveDependents.length).toBe(4);
      expect(analysis.blastRadius.totalAffectedNodes).toBe(4);
      expect(analysis.blastRadius.severity).toBe("high"); // Escalate to high because it contains gate/terminal

      // Aggregated tokens and duration in blast radius
      expect(analysis.blastRadius.affectedTokens).toBeGreaterThan(0);
      expect(analysis.blastRadius.affectedDurationMs).toBeGreaterThan(0);

      // Fan-in / Fan-out
      expect(analysis.fanIn).toBe(1);
      expect(analysis.fanOut).toBe(2);
      expect(analysis.hasCycle).toBe(false);
    });

    test("analyzeNodeDependencies builds root-cause blocker chain when upstream ancestors produce errors", () => {
      const failingDataset: GraphDataset = {
        id: "failing-run",
        title: "Failing Run",
        nodes: [
          {
            id: "root-fail",
            name: "Linter Gate",
            kind: "gate",
            status: "error",
            step: 1,
            metadata: {
              commands: [
                {
                  id: "cmd-lint-1",
                  argv: ["oxlint"],
                  cwd: "/app",
                  exitCode: 2,
                  durationMs: 50,
                  startedAt: "2026-08-15T00:00:00Z",
                  finishedAt: "2026-08-15T00:00:01Z",
                  stderrSnippet: "14 lint errors found",
                },
              ],
            },
          },
          {
            id: "intermediate",
            name: "Build Pipeline",
            kind: "tool",
            status: "warning",
            step: 2,
          },
          {
            id: "target-worker",
            name: "Unit Test Worker",
            kind: "agent",
            status: "pending",
            step: 3,
          },
        ],
        edges: [
          { id: "fe1", source: "root-fail", target: "intermediate" },
          { id: "fe2", source: "intermediate", target: "target-worker" },
        ],
      };

      const targetNode = failingDataset.nodes.find((n) => n.id === "target-worker")!;
      const analysis = analyzeNodeDependencies(targetNode, failingDataset);

      expect(analysis.hasBlocker).toBe(true);
      expect(analysis.blockerChain.length).toBe(3);
      expect(analysis.blockerChain[0].nodeId).toBe("root-fail");
      expect(analysis.blockerChain[0].isRootCause).toBe(true);
      expect(analysis.blockerChain[0].failureReason).toContain("Exit code 2");
      expect(analysis.blockerChain[2].nodeId).toBe("target-worker");
    });

    test("formatImpactReport generates clean markdown summary with metrics and blocker details", () => {
      const planNode = mockDataset.nodes.find((n) => n.id === "node-plan")!;
      const analysis = analyzeNodeDependencies(planNode, mockDataset);
      const markdown = formatImpactReport(analysis);

      expect(markdown).toContain("# Impact & Dependency Analysis: Planner Decomposition");
      expect(markdown).toContain("**Topological Depth:** 1");
      expect(markdown).toContain("**Direct Prerequisites:** 1");
      expect(markdown).toContain("**Direct Dependents:** 2");
      expect(markdown).toContain("**Transitive Blast Radius:** 4 nodes");
      expect(markdown).toContain("## Direct Prerequisites (Upstream)");
      expect(markdown).toContain("## Direct Dependents (Downstream)");
    });

    test("ImpactGraph renders 3-column DAG flow with prerequisites, focus node, and blast radius", () => {
      const selectedIds: string[] = [];
      const handleSelectNode = (id: string) => {
        selectedIds.push(id);
      };

      const planNode = mockDataset.nodes.find((n) => n.id === "node-plan")!;
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <ImpactGraph
            currentNode={planNode}
            dataset={mockDataset}
            onSelectNode={handleSelectNode}
          />,
        );
      });

      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Prerequisites");
      expect(json).toContain("Prompt Ingestion");
      expect(json).toContain("Focus Node");
      expect(json).toContain("Planner Decomposition");
      expect(json).toContain("Blast Radius");
      expect(json).toContain("Playback Controls Implementer");
      expect(json).toContain("Impact Inspector Implementer");

      // Interactive jump to prerequisite
      const prereqBtn = renderer.root.findAllByProps({
        title: "Jump to prerequisite: Prompt Ingestion (node-root)",
      })[0];
      expect(prereqBtn).toBeDefined();
      act(() => {
        prereqBtn?.props.onClick();
      });
      expect(selectedIds).toContain("node-root");

      // Interactive jump to dependent
      const depBtn = renderer.root.findAllByProps({
        title: "Jump to dependent: Playback Controls Implementer (node-impl-1)",
      })[0];
      expect(depBtn).toBeDefined();
      act(() => {
        depBtn?.props.onClick();
      });
      expect(selectedIds).toContain("node-impl-1");

      act(() => renderer.unmount());
    });

    test("ImpactGraph handles view mode toggle (Direct vs Transitive) and search filtering", () => {
      const planNode = mockDataset.nodes.find((n) => n.id === "node-plan")!;
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<ImpactGraph currentNode={planNode} dataset={mockDataset} />);
      });

      // Initially direct 1-hop view (2 dependents)
      let json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Direct (1-Hop)");
      expect(json).not.toContain("Run Complete Terminal");

      // Switch to Transitive view
      const transitiveBtn = renderer.root.findAllByProps({
        "aria-label": "Transitive Blast Radius View",
      })[0];
      expect(transitiveBtn).toBeDefined();
      act(() => {
        transitiveBtn?.props.onClick();
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Run Complete Terminal");
      expect(json).toContain("Quality Gate Validator");

      // Search filter
      const searchInput = renderer.root.findAllByProps({ placeholder: "Filter graph..." })[0];
      expect(searchInput).toBeDefined();
      act(() => {
        searchInput?.props.onChange({ target: { value: "Validator" } });
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Quality Gate Validator");
      expect(json).not.toContain("Playback Controls Implementer");

      // Clear filter
      const clearBtn = renderer.root.findAllByProps({ "aria-label": "Clear filter" })[0];
      expect(clearBtn).toBeDefined();
      act(() => {
        clearBtn?.props.onClick();
      });
      json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Playback Controls Implementer");

      act(() => renderer.unmount());
    });

    test("ImpactGraph renders standardized empty state for isolated nodes", () => {
      const isolatedNode: GraphNodeData = {
        id: "iso-node",
        name: "Isolated Island Node",
        kind: "agent",
        status: "pending",
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <ImpactGraph
            currentNode={isolatedNode}
            dataset={{ id: "empty", title: "E", nodes: [isolatedNode], edges: [] }}
          />,
        );
      });

      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain(
        "Isolated node with no upstream prerequisites or downstream dependents.",
      );
      act(() => renderer.unmount());
    });

    test("DependenciesTab renders KPI metric grid, blocker chain, interactive graph, and breakdown list", () => {
      const selectedIds: string[] = [];
      const handleSelectNode = (id: string) => {
        selectedIds.push(id);
      };

      const failingDataset: GraphDataset = {
        id: "failing-run-2",
        title: "Failing Run 2",
        nodes: [
          {
            id: "root-fail",
            name: "Linter Gate",
            kind: "gate",
            status: "error",
            step: 1,
            metadata: {
              commands: [
                {
                  id: "cmd-lint-2",
                  argv: ["oxlint"],
                  cwd: "/app",
                  exitCode: 2,
                  durationMs: 50,
                  startedAt: "2026-08-15T00:00:00Z",
                  finishedAt: "2026-08-15T00:00:01Z",
                  stderrSnippet: "Lint failure",
                },
              ],
            },
          },
          {
            id: "target-worker",
            name: "Unit Test Worker",
            kind: "agent",
            status: "pending",
            step: 2,
          },
        ],
        edges: [
          {
            id: "fe1",
            source: "root-fail",
            target: "target-worker",
            kind: "dependency",
            handoff: { kind: "artifact", summary: "Lint report" },
          },
        ],
      };

      const targetNode = failingDataset.nodes.find((n) => n.id === "target-worker")!;
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <DependenciesTab
            node={targetNode}
            dataset={failingDataset}
            onSelectNode={handleSelectNode}
          />,
        );
      });

      const json = JSON.stringify(renderer.toJSON());

      // KPI Metrics
      expect(json).toContain("Topological & Impact Metrics");
      expect(json).toContain("Topological Depth");
      expect(json).toContain("Topological Height");
      expect(json).toContain("Blast Radius");
      expect(json).toContain("Fan-In / Fan-Out");

      // Blocker Chain
      expect(json).toContain("Upstream Blocker Chain");
      expect(json).toContain("Upstream Failure Blocking Execution");
      expect(json).toContain("ROOT CAUSE");
      expect(json).toContain("Linter Gate");

      // Interactive jump in blocker chain
      const blockerBtn = renderer.root.findAllByProps({ "aria-label": "Jump to Linter Gate" })[0];
      expect(blockerBtn).toBeDefined();
      act(() => {
        blockerBtn?.props.onClick();
      });
      expect(selectedIds).toContain("root-fail");

      // Breakdown list
      expect(json).toContain("Dependency & Blast Radius Breakdown");
      expect(json).toContain("▲ PREREQUISITE");
      expect(json).toContain("1 hop upstream");
      expect(json).toContain("Data Handoff:");
      expect(json).toContain("Lint report");

      // Filter pills switching
      const allPills = renderer.root.findAllByProps({ type: "button" });
      const prereqFilterBtn = allPills.find((b) => {
        const text = Array.isArray(b.props.children)
          ? b.props.children.join("")
          : String(b.props.children ?? "");
        return text.includes("Prerequisites");
      });
      expect(prereqFilterBtn).toBeDefined();
      act(() => {
        prereqFilterBtn?.props.onClick();
      });

      // Search input in breakdown list
      const searchInput = renderer.root.findAllByProps({
        placeholder: "Search dependencies...",
      })[0];
      expect(searchInput).toBeDefined();
      act(() => {
        searchInput?.props.onChange({ target: { value: "NonExistent" } });
      });
      expect(JSON.stringify(renderer.toJSON())).toContain("No dependencies matching filter");

      act(() => renderer.unmount());
    });

    test("DependenciesTab copies markdown report to clipboard with interactive feedback", async () => {
      const planNode = mockDataset.nodes.find((n) => n.id === "node-plan")!;
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<DependenciesTab node={planNode} dataset={mockDataset} />);
      });

      const copyBtn = renderer.root.findAllByProps({
        title: "Copy markdown impact report to clipboard",
      })[0];
      expect(copyBtn).toBeDefined();
      await act(async () => {
        await copyBtn?.props.onClick();
      });

      // Verify copied feedback state
      expect(JSON.stringify(renderer.toJSON())).toContain("Copied!");
      act(() => renderer.unmount());
    });

    test("finding-04-impact-stress: handles deep chains, diamond topologies, circular dependencies, and isolated nodes", () => {
      // 1. Deep 10-node chain
      const chainNodes: GraphNodeData[] = Array.from({ length: 10 }, (_, i) => ({
        id: `chain-${i}`,
        name: `Chain Node ${i}`,
        kind: i === 0 ? "input" : i === 9 ? "terminal" : "agent",
        status: "success",
        step: i + 1,
        metrics: { tokensIn: 100 * (i + 1), tokensOut: 200 * (i + 1), durationMs: 1000 },
      }));
      const chainEdges: GraphEdgeData[] = Array.from({ length: 9 }, (_, i) => ({
        id: `ce-${i}`,
        source: `chain-${i}`,
        target: `chain-${i + 1}`,
      }));
      const chainDataset: GraphDataset = {
        id: "chain-ds",
        title: "Deep Chain",
        nodes: chainNodes,
        edges: chainEdges,
      };

      const middleNode = chainNodes[4]; // chain-4
      const chainAnalysis = analyzeNodeDependencies(middleNode, chainDataset);
      expect(chainAnalysis.topologicalDepth).toBe(4);
      expect(chainAnalysis.topologicalHeight).toBe(5);
      expect(chainAnalysis.directPrerequisites.length).toBe(1);
      expect(chainAnalysis.transitivePrerequisites.length).toBe(4);
      expect(chainAnalysis.directDependents.length).toBe(1);
      expect(chainAnalysis.transitiveDependents.length).toBe(5);
      expect(chainAnalysis.blastRadius.totalAffectedNodes).toBe(5);

      // 2. Circular dependency handling (A -> B -> C -> A)
      const cycleNodes: GraphNodeData[] = [
        { id: "cyc-A", name: "Cycle Node A", status: "running" },
        { id: "cyc-B", name: "Cycle Node B", status: "running" },
        { id: "cyc-C", name: "Cycle Node C", status: "running" },
      ];
      const cycleEdges: GraphEdgeData[] = [
        { id: "eAB", source: "cyc-A", target: "cyc-B" },
        { id: "eBC", source: "cyc-B", target: "cyc-C" },
        { id: "eCA", source: "cyc-C", target: "cyc-A" },
      ];
      const cycleDataset: GraphDataset = {
        id: "cyc-ds",
        title: "Cyclic",
        nodes: cycleNodes,
        edges: cycleEdges,
      };

      const cycAnalysis = analyzeNodeDependencies(cycleNodes[0], cycleDataset);
      expect(cycAnalysis.hasCycle).toBe(true);
      expect(cycAnalysis.cycles.length).toBeGreaterThan(0);

      let cycRenderer!: ReactTestRenderer;
      act(() => {
        cycRenderer = create(<DependenciesTab node={cycleNodes[0]} dataset={cycleDataset} />);
      });
      expect(JSON.stringify(cycRenderer.toJSON())).toContain("Circular Dependency Detected");
      act(() => cycRenderer.unmount());

      // 3. Diamond topology (Root -> B -> Join, Root -> C -> Join)
      const diamondNodes: GraphNodeData[] = [
        { id: "dia-root", name: "Diamond Root", kind: "orchestrator" },
        { id: "dia-b", name: "Branch B", kind: "agent" },
        { id: "dia-c", name: "Branch C", kind: "agent" },
        { id: "dia-join", name: "Diamond Join", kind: "join" },
      ];
      const diamondEdges: GraphEdgeData[] = [
        { id: "de1", source: "dia-root", target: "dia-b" },
        { id: "de2", source: "dia-root", target: "dia-c" },
        { id: "de3", source: "dia-b", target: "dia-join" },
        { id: "de4", source: "dia-c", target: "dia-join" },
      ];
      const diamondDataset: GraphDataset = {
        id: "dia-ds",
        title: "Diamond",
        nodes: diamondNodes,
        edges: diamondEdges,
      };

      const joinAnalysis = analyzeNodeDependencies(diamondNodes[3], diamondDataset);
      expect(joinAnalysis.fanIn).toBe(2);
      expect(joinAnalysis.directPrerequisites.length).toBe(2);
      expect(joinAnalysis.transitivePrerequisites.length).toBe(3); // b, c, root
      expect(joinAnalysis.topologicalDepth).toBe(2);

      // 4. Missing nodes / null dataset fallback
      const standaloneNode: GraphNodeData = {
        id: "standalone",
        name: "Standalone With Fallback Ports",
        io: {
          inputs: [{ node: "external-source", kind: "full-context", label: "Initial Prompt" }],
          outputs: [{ node: "external-target", kind: "artifact", label: "Generated Spec" }],
        },
      };
      const fallbackAnalysis = analyzeNodeDependencies(standaloneNode, null);
      expect(fallbackAnalysis.directPrerequisites.length).toBe(1);
      expect(fallbackAnalysis.directDependents.length).toBe(1);
      expect(fallbackAnalysis.directPrerequisites[0].id).toBe("external-source");
      expect(fallbackAnalysis.directDependents[0].id).toBe("external-target");
    });
  });

  describe("CostTab & Node Financial & Token Footprint Visualizer", () => {
    const costSampleDataset: GraphDataset = {
      id: "cost-graph-ds",
      title: "Cost Sample Graph",
      nodes: [
        {
          id: "node-frontier",
          name: "Frontier Architect",
          kind: "orchestrator",
          status: "success",
          model: "claude-3-opus",
          tier: "l",
          metrics: {
            tokens: {
              promptTokens: 25000,
              completionTokens: 5000,
              reasoningTokens: 3000,
              cacheCreationTokens: 10000,
              cacheReadTokens: 15000,
              totalTokens: 33000,
            },
            costUsd: 0.85,
            retries: 1,
            repairRounds: 1,
          },
          metadata: {
            hostAgent: {
              model: "claude-3-opus",
              tier: "l",
              thinkingLevel: "high",
              reasoningEffort: "high",
            },
          },
        },
        {
          id: "node-balanced",
          name: "Feature Coder",
          kind: "agent",
          status: "running",
          model: "claude-3-5-sonnet",
          tier: "m",
          metrics: {
            tokensIn: 8000,
            tokensOut: 2000,
            costUsd: 0.054,
          },
          metadata: {
            tokens: {
              reasoningTokens: 1200,
              cacheReadTokens: 4000,
            },
          },
        },
        {
          id: "node-light",
          name: "Linter Worker",
          kind: "tool",
          status: "success",
          model: "claude-3-haiku",
          tier: "s",
          metrics: {
            tokensIn: 1000,
            tokensOut: 100,
            costUsd: 0.00065,
          },
        },
      ],
      edges: [
        { id: "ce1", source: "node-frontier", target: "node-balanced" },
        { id: "ce2", source: "node-balanced", target: "node-light" },
      ],
    };

    test("formatDetailedUsd formats currency accurately across scales and precision modes", () => {
      expect(formatDetailedUsd(0)).toBe("$0.00");
      expect(formatDetailedUsd(-5)).toBe("$0.00");
      expect(formatDetailedUsd(Number.NaN)).toBe("$0.00");

      // Standard mode
      expect(formatDetailedUsd(125.5)).toBe("$125.50");
      expect(formatDetailedUsd(2.45)).toBe("$2.45");
      expect(formatDetailedUsd(0.045)).toBe("$0.045");
      expect(formatDetailedUsd(0.0024)).toBe("$0.0024");

      // High precision mode
      expect(formatDetailedUsd(1.23456, true)).toBe("$1.2346");
      expect(formatDetailedUsd(0.00045, true)).toBe("$0.00045");
      expect(formatDetailedUsd(150.25, true)).toBe("$150.25");
    });

    test("CostTab renders overview header with cost, model, tier, rank, and graph share", () => {
      const node = costSampleDataset.nodes[0];
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<CostTab node={node} dataset={costSampleDataset} />);
      });

      const root = renderer.root;
      const costAmount = root.findByProps({ "data-testid": "node-cost-usd" });
      expect(costAmount.props.children).toContain("$0.85");

      const totalTokens = root.findByProps({ "data-testid": "node-total-tokens" });
      expect(totalTokens.props.children).toBe("33k");

      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("claude-3-opus");
      expect(json).toContain("Tier:");
      expect(json).toContain("Graph Cost Rank:");
      expect(json).toContain("of 3");
      expect(json).toContain("Graph Share:");

      act(() => renderer.unmount());
    });

    test("CostTab renders granular token breakdown grid and segmented distribution track", () => {
      const node = costSampleDataset.nodes[0];
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<CostTab node={node} dataset={costSampleDataset} />);
      });

      const root = renderer.root;
      const promptMetric = root.findByProps({ "data-testid": "metric-prompt-tokens" });
      expect(promptMetric.findByProps({ className: "drawer-metric-value" }).props.children).toBe(
        "25,000",
      );

      const compMetric = root.findByProps({ "data-testid": "metric-completion-tokens" });
      expect(compMetric.findByProps({ className: "drawer-metric-value" }).props.children).toBe(
        "5,000",
      );

      const reasoningMetric = root.findByProps({ "data-testid": "metric-reasoning-tokens" });
      expect(reasoningMetric.findByProps({ className: "drawer-metric-value" }).props.children).toBe(
        "3,000",
      );

      const cacheReadMetric = root.findByProps({ "data-testid": "metric-cache-read-tokens" });
      expect(cacheReadMetric.findByProps({ className: "drawer-metric-value" }).props.children).toBe(
        "15,000",
      );

      const cacheWriteMetric = root.findByProps({ "data-testid": "metric-cache-write-tokens" });
      expect(
        cacheWriteMetric.findByProps({ className: "drawer-metric-value" }).props.children,
      ).toBe("10,000");

      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("Thinking Config:");
      expect(json).toContain("high");

      act(() => renderer.unmount());
    });

    test("CostTab renders financial analytics, cache savings, and repair impact multiplier", () => {
      const node = costSampleDataset.nodes[0];
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<CostTab node={node} dataset={costSampleDataset} />);
      });

      const root = renderer.root;
      const cacheHitRate = root.findByProps({ "data-testid": "node-cache-hit-rate" });
      expect(cacheHitRate.props.children.join("")).toContain("%");

      const cacheSavings = root.findByProps({ "data-testid": "node-cache-savings" });
      expect(cacheSavings.props.children).toContain("$");

      const repairImpact = root.findByProps({ "data-testid": "cost-repair-impact" });
      expect(repairImpact).toBeDefined();
      const json = JSON.stringify(renderer.toJSON());
      expect(json).toContain("repair rounds");
      expect(json).toContain("retries");

      act(() => renderer.unmount());
    });

    test("CostTab renders Model Tier Cost Comparison grid with current tier highlight", () => {
      const node = costSampleDataset.nodes[0];
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<CostTab node={node} dataset={costSampleDataset} />);
      });

      const root = renderer.root;
      const tierGrid = root.findByProps({ "data-testid": "tier-comparison-grid" });
      expect(tierGrid).toBeDefined();

      const currentTag = root.findByProps({ "data-testid": "current-tier-tag" });
      expect(currentTag.props.children).toBe("Current");

      const cardXS = root.findByProps({ "data-testid": "tier-comparison-card-xs" });
      const cardS = root.findByProps({ "data-testid": "tier-comparison-card-s" });
      const cardM = root.findByProps({ "data-testid": "tier-comparison-card-m" });
      const cardL = root.findByProps({ "data-testid": "tier-comparison-card-l" });
      expect(cardXS).toBeDefined();
      expect(cardS).toBeDefined();
      expect(cardM).toBeDefined();
      expect(cardL).toBeDefined();

      act(() => renderer.unmount());
    });

    test("CostTab interactive precision toggle and copy report button work seamlessly", async () => {
      let written = "";
      const originalNav = globalThis.navigator;
      Object.defineProperty(globalThis, "navigator", {
        value: {
          clipboard: {
            writeText: (text: string) => {
              written = text;
              return Promise.resolve();
            },
          },
        },
        configurable: true,
        writable: true,
      });

      const node = costSampleDataset.nodes[0];
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<CostTab node={node} dataset={costSampleDataset} />);
      });

      const root = renderer.root;

      // Precision toggle
      const toggleBtn = root.findByProps({ "aria-label": "Toggle currency precision" });
      expect(toggleBtn.props.children).toBe("2-dec");
      act(() => {
        toggleBtn.props.onClick();
      });
      expect(toggleBtn.props.children).toBe("4-dec");

      // Copy node report
      const copyBtn = root.findByProps({ "data-testid": "copy-node-cost-btn" });
      await act(async () => {
        await copyBtn.props.onClick();
      });

      expect(written).toContain("Node Cost & Token Footprint: Frontier Architect");
      expect(written).toContain("Model: claude-3-opus (Tier: L)");
      expect(written).toContain("Total Cost:");

      const span = copyBtn.findByType("span");
      expect(span.props.children).toBe("Copied");

      Object.defineProperty(globalThis, "navigator", {
        value: originalNav,
        configurable: true,
        writable: true,
      });

      act(() => renderer.unmount());
    });

    test("finding-03-cost-stress: robust handling of zero token nodes, undefined datasets, and extreme numbers", () => {
      const zeroNode: GraphNodeData = {
        id: "zero-node",
        name: "Zero Node",
        metrics: {
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<CostTab node={zeroNode} dataset={null} />);
      });

      const json = JSON.stringify(renderer.toJSON());
      expect(json).not.toContain("NaN");
      expect(json).toContain("$0.00");
      expect(json).toContain("Zero Node");

      // Node without metrics
      const emptyNode: GraphNodeData = {
        id: "empty-node",
        name: "Empty Node Without Metrics",
      };

      act(() => {
        renderer = create(<CostTab node={emptyNode} />);
      });
      const emptyJson = JSON.stringify(renderer.toJSON());
      expect(emptyJson).not.toContain("NaN");
      expect(emptyJson).toContain("$0.00");

      act(() => renderer.unmount());
    });

    test("finding-03-adversarial-cost-precision: sub-cent USD formatting precision ($0.0001) and nested reasoning fallbacks", () => {
      // Sub-cent formatting tests
      expect(formatDetailedUsd(0.0001)).toBe("$0.0001");
      expect(formatDetailedUsd(0.00012, true)).toBe("$0.00012");
      expect(formatDetailedUsd(0.00005, true)).toBe("$0.000050");
      expect(formatDetailedUsd(0.00005, false)).toBe("$0.00005");

      // Node with sub-cent cost and hostAgent thinkingTokens
      const subCentNode: GraphNodeData = {
        id: "sub-cent-1",
        name: "Sub Cent Node",
        metrics: {
          tokensIn: 50,
          tokensOut: 10,
          costUsd: 0.0001,
        },
        metadata: {
          hostAgent: {
            thinkingTokens: 120,
            model: "claude-3-5-haiku",
            tier: "s",
          },
        },
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(<CostTab node={subCentNode} dataset={null} />);
      });

      const root = renderer.root;
      const costAmount = root.findByProps({ "data-testid": "node-cost-usd" });
      expect(costAmount.props.children).toBe("$0.0001");

      const reasoningMetric = root.findByProps({ "data-testid": "metric-reasoning-tokens" });
      expect(reasoningMetric.findByProps({ className: "drawer-metric-value" }).props.children).toBe(
        "120",
      );

      act(() => renderer.unmount());
    });
  });
});
