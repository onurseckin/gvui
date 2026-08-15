import { afterEach, describe, expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describeNodeKind, describeNodeStatus } from "../../primitives/nodes/NodeCard/nodeKinds";
import type { GraphEdgeData, GraphNodeData, IoPort, MediaAsset } from "../../types/graphData";
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
import { CommandsTab } from "./tabs/CommandsTab";
import { FilesTab } from "./tabs/FilesTab";
import { FindingsTab } from "./tabs/FindingsTab";
import { IoTab } from "./tabs/IoTab";
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
      expect(html.includes("Reasoning")).toBe(true);
      expect(html.includes("8.4k")).toBe(true);
      expect(html.includes("drawer-metric--thinking")).toBe(true);
      expect(html.includes("Duration")).toBe(true);
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
      expect(html.includes("Effort: High")).toBe(true);
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
      expect(html.includes("Exit 0")).toBe(true);
      expect(html.includes("is-success")).toBe(true);
      expect(html.includes("Exit 1")).toBe(true);
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

  describe("FindingsTab validation feedback & reviews", () => {
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
    });

    test("handles Escape key to close dialog", () => {
      let closed = false;
      let keydownListener: ((e: KeyboardEvent) => void) | null = null;

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
});
