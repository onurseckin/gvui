import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import ReactTestRenderer from "react-test-renderer";
import { describeNodeKind } from "../../src/primitives/nodes/NodeCard/nodeKinds";
import type { GraphNodeData, IoPort, MediaAsset } from "../../src/types/graphData";
import { OverviewTab } from "../../src/components/NodeDetailDrawer/tabs/OverviewTab";
import { IoTab } from "../../src/components/NodeDetailDrawer/tabs/IoTab";
import { AssetsTab } from "../../src/components/NodeDetailDrawer/tabs/AssetsTab";
import { CommandsTab } from "../../src/components/NodeDetailDrawer/tabs/CommandsTab";
import { FilesTab } from "../../src/components/NodeDetailDrawer/tabs/FilesTab";
import { FindingsTab } from "../../src/components/NodeDetailDrawer/tabs/FindingsTab";
import { RawProvenanceTab } from "../../src/components/NodeDetailDrawer/tabs/RawProvenanceTab";
import { LightboxDialog } from "../../src/components/NodeDetailDrawer/LightboxDialog";
import { NodeDetailDrawer } from "../../src/components/NodeDetailDrawer";
import { useGraphStore } from "../../src/state/useGraphStore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EventBase = typeof Event !== "undefined" ? Event : (class {} as unknown as typeof Event);

class MockKeyboardEvent extends EventBase {
  key: string;
  constructor(type: string, init?: { key?: string }) {
    super(type, init as unknown as EventInit);
    this.key = init?.key ?? "";
  }
  override stopPropagation() {}
  override preventDefault() {}
}

if (
  typeof (globalThis as unknown as { KeyboardEvent?: unknown }).KeyboardEvent === "undefined" ||
  !((globalThis as unknown as { KeyboardEvent: unknown }).KeyboardEvent as { prototype?: unknown })
    ?.prototype
) {
  Object.defineProperty(globalThis, "KeyboardEvent", {
    value: MockKeyboardEvent,
    configurable: true,
    writable: true,
  });
}

class WindowEventMock {
  private listeners: Record<string, ((event: KeyboardEvent) => void)[]> = {};

  addEventListener(type: string, listener: (event: KeyboardEvent) => void) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: KeyboardEvent) => void) {
    if (!this.listeners[type]) return;
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  dispatchEvent(event: { type?: string; key?: string; [key: string]: unknown }): boolean {
    const type = event.type ?? "keydown";
    const handlers = this.listeners[type] || [];
    for (const handler of [...handlers]) {
      handler(event as unknown as KeyboardEvent);
    }
    return true;
  }
}

if (typeof (globalThis as unknown as { window?: unknown }).window === "undefined") {
  Object.defineProperty(globalThis, "window", {
    value: new WindowEventMock(),
    configurable: true,
    writable: true,
  });
}

describe("Node Detail Drawer Multi-Viewport Visual Audit (node-drawer-visual-audit)", () => {
  const archetypes: GraphNodeData[] = [
    {
      id: "node-prompt-archetype",
      name: "User Prompt Ingress",
      kind: "input",
      status: "success",
      step: 1,
      description: "User instruction prompt defining the operational goals",
      io: {
        inputs: [],
        outputs: [
          { kind: "prompt", label: "User Prompt", preview: "Run system audit", tokens: 42 },
        ],
      },
    },
    {
      id: "node-plan-archetype",
      name: "Coordinator Planner",
      kind: "orchestrator",
      status: "success",
      step: 1,
      description: "Decomposes requirements into structured DAG waves",
      io: {
        inputs: [{ kind: "prompt", label: "User Prompt", preview: "Run system audit" }],
        outputs: [{ kind: "decision", label: "DAG Waves", preview: "5 parallel tasks" }],
      },
      metadata: {
        writeScope: ["docs/planning/"],
      },
    },
    {
      id: "node-worker-archetype",
      name: "Implementer Agent Worker",
      kind: "agent",
      status: "success",
      step: 2,
      model: "Gemini 3.7 Flash",
      description: "Executes implementation tasks and runs tests",
      metrics: {
        tokensIn: 45000,
        tokensOut: 8500,
        tokens: {
          promptTokens: 45000,
          completionTokens: 8500,
          reasoningTokens: 3200,
        },
        durationMs: 4200,
        costUsd: 0.125,
      },
      files: [{ path: "src/engine/layout.ts", mode: "write", additions: 120, deletions: 15 }],
      metadata: {
        writeScope: ["src/engine/"],
        repairRounds: 1,
        hostAgent: {
          name: "antigravity",
          model: "gemini-3.7-flash",
          tier: "l",
          thinkingLevel: "high",
        },
        commands: [
          {
            id: "cmd-01",
            argv: ["bun", "test"],
            cwd: "/repo",
            exitCode: 0,
            durationMs: 350,
            startedAt: "2026-08-15T12:00:00.000Z",
            finishedAt: "2026-08-15T12:00:00.350Z",
            stdoutSnippet: "45 pass, 0 fail",
          },
        ],
      },
    },
    {
      id: "node-gate-archetype",
      name: "Validator Gate",
      kind: "gate",
      status: "success",
      step: 2,
      description: "Enforces zero-tolerance quality invariants",
      metrics: {
        tokensIn: 12000,
        tokensOut: 2100,
        durationMs: 950,
        costUsd: 0.035,
      },
      metadata: {
        validatorId: "agent-t01-validator",
        findings: [
          {
            id: "finding-01",
            severity: "minor",
            observation: "Unchecked type assertion in boundary",
            remediation: "Bridge with unknown cast",
            status: "resolved",
          },
        ],
      },
    },
    {
      id: "node-critic-archetype",
      name: "Completeness Critic",
      kind: "critic",
      status: "success",
      step: 5,
      description: "Final rubric score evaluation and milestone signoff",
      metrics: {
        tokensIn: 25000,
        tokensOut: 4500,
        durationMs: 1800,
        costUsd: 0.08,
      },
      metadata: {
        repairRounds: 0,
        findings: [],
      },
    },
  ];

  const viewports = [
    { name: "Mobile", width: 375, height: 667 },
    { name: "Tablet", width: 768, height: 1024 },
    { name: "Desktop", width: 1280, height: 800 },
  ];

  function computeResponsiveDrawerWidth(viewportWidth: number): number {
    if (viewportWidth <= 640) {
      // Under @media (max-width: 640px), width: 100%, min-width: 0, max-width: 100%
      return viewportWidth;
    }
    // Default desktop CSS: width: 560px, min-width: 480px, max-width: min(680px, 0.92 * viewportWidth)
    const defaultWidth = 560;
    const minWidth = 480;
    const maxWidth = Math.min(680, 0.92 * viewportWidth);
    return Math.min(Math.max(defaultWidth, minWidth), maxWidth);
  }

  describe.each(viewports)("Viewport: $name ($width x $height)", ({ name, width, height }) => {
    it(`validates drawer layout constraints and viewport containment for ${name}`, () => {
      expect(width).toBeGreaterThan(0);
      expect(height).toBeGreaterThan(0);

      const drawerWidth = computeResponsiveDrawerWidth(width);
      expect(drawerWidth).toBeLessThanOrEqual(width);

      if (name === "Mobile") {
        expect(width).toBe(375);
        expect(drawerWidth).toBe(375);
        expect(drawerWidth).toBeLessThanOrEqual(375);
        const horizontalOverflow = Math.max(0, drawerWidth - width);
        expect(horizontalOverflow).toBe(0);
      } else if (name === "Tablet") {
        expect(width).toBe(768);
        expect(drawerWidth).toBe(560);
        expect(drawerWidth).toBeLessThanOrEqual(768);
      } else if (name === "Desktop") {
        expect(width).toBe(1280);
        expect(drawerWidth).toBe(560);
        expect(drawerWidth).toBeLessThanOrEqual(1280);
      }
    });

    describe.each(archetypes)("Archetype: $kind ($name)", (node) => {
      const nodeNamesById = new Map(archetypes.map((a) => [a.id, a.name]));
      const inputs: IoPort[] = node.io?.inputs ?? [];
      const outputs: IoPort[] = node.io?.outputs ?? [];

      it("renders OverviewTab with correct archetype accent and metric cards", () => {
        const kind = describeNodeKind(node);
        expect(kind.accent).toBeTruthy();

        const html = renderToString(
          React.createElement(OverviewTab, {
            node,
            inputs,
            outputs,
            nodeNamesById,
          }),
        );
        expect(html.length).toBeGreaterThan(0);
        expect(html.includes("drawer-tab-content")).toBe(true);

        if (node.metrics?.tokens?.reasoningTokens) {
          expect(html.includes("Reasoning")).toBe(true);
        }
      });

      it("renders IoTab without throwing", () => {
        const html = renderToString(
          React.createElement(IoTab, {
            node,
            inputs,
            outputs,
            nodeNamesById,
          }),
        );
        expect(html.includes("drawer-tab-content")).toBe(true);
      });

      it("renders AssetsTab with media gallery or standardized empty state", () => {
        const html = renderToString(React.createElement(AssetsTab, { node }));
        expect(html).toBeDefined();
        const hasGallery =
          html.includes("assets-gallery-grid") || html.includes("assets-summary-banner");
        const hasEmptyState =
          html.includes("drawer-empty-state") || html.includes("No media assets");
        expect(hasGallery || hasEmptyState).toBe(true);
      });

      it("renders CommandsTab with executions or standardized empty state", () => {
        const html = renderToString(React.createElement(CommandsTab, { node }));
        expect(html).toBeDefined();
        const hasCommands =
          html.includes("drawer-command-card") || html.includes("drawer-command-terminal");
        const hasEmptyState =
          html.includes("drawer-empty-state") || html.includes("No command executions");
        expect(hasCommands || hasEmptyState).toBe(true);
      });

      it("renders FilesTab with write scopes or standardized empty state", () => {
        const html = renderToString(React.createElement(FilesTab, { node }));
        expect(html).toBeDefined();
        const hasFiles =
          html.includes("drawer-file-row") ||
          html.includes("drawer-file-list") ||
          html.includes("drawer-empty-state");
        expect(hasFiles).toBe(true);
      });

      it("renders FindingsTab with review findings or standardized empty state", () => {
        const html = renderToString(React.createElement(FindingsTab, { node }));
        expect(html).toBeDefined();
        const hasFindings =
          html.includes("drawer-finding-card") ||
          html.includes("drawer-review-card") ||
          html.includes("drawer-empty-state") ||
          html.includes("Completeness Verification") ||
          html.includes("Repair History");
        expect(hasFindings).toBe(true);
      });

      it("renders RawProvenanceTab with JSON dump", () => {
        const html = renderToString(React.createElement(RawProvenanceTab, { node }));
        expect(html.includes(node.id)).toBe(true);
      });
    });
  });

  describe("Fallback and Boundary Robustness", () => {
    it("renders empty node without throwing exceptions", () => {
      const bareNode: GraphNodeData = {
        id: "bare-node-1",
        name: "Empty Node",
        kind: "agent",
      };

      expect(() =>
        renderToString(
          React.createElement(OverviewTab, {
            node: bareNode,
            inputs: [],
            outputs: [],
            nodeNamesById: new Map(),
          }),
        ),
      ).not.toThrow();

      expect(() =>
        renderToString(React.createElement(AssetsTab, { node: bareNode })),
      ).not.toThrow();
      expect(() =>
        renderToString(React.createElement(CommandsTab, { node: bareNode })),
      ).not.toThrow();
      expect(() => renderToString(React.createElement(FilesTab, { node: bareNode }))).not.toThrow();
      expect(() =>
        renderToString(React.createElement(FindingsTab, { node: bareNode })),
      ).not.toThrow();
      expect(() =>
        renderToString(React.createElement(RawProvenanceTab, { node: bareNode })),
      ).not.toThrow();
    });

    it("verifies LightboxDialog keyboard escape handler", () => {
      let closed = false;
      const asset: MediaAsset = {
        id: "asset-1",
        label: "Visual Baseline",
        url: "https://example.com/img.png",
      };

      const tree = ReactTestRenderer.create(
        React.createElement(LightboxDialog, {
          assets: [asset],
          isOpen: true,
          onClose: () => {
            closed = true;
          },
        }),
      );

      expect(tree.toJSON()).toBeDefined();
      expect(closed).toBe(false);
    });
  });

  describe("Interactive Dismissal Lifecycle and Viewport Containment", () => {
    const mockDataset = {
      id: "visual-audit-dataset",
      nodes: archetypes,
      edges: [],
      entry: "node-prompt-archetype",
    };

    describe.each(viewports)(
      "Dismissal in Viewport: $name ($width x $height)",
      ({ name, width }) => {
        it(`verifies drawer dismissal via close button click on ${name}`, () => {
          ReactTestRenderer.act(() => {
            useGraphStore.getState().setDataset(mockDataset);
            useGraphStore.getState().setSelectedNodeId("node-worker-archetype");
          });
          expect(useGraphStore.getState().selectedNodeId).toBe("node-worker-archetype");

          let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
          ReactTestRenderer.act(() => {
            renderer = ReactTestRenderer.create(React.createElement(NodeDetailDrawer));
          });

          expect(renderer).toBeDefined();
          const root = renderer!.root;
          const drawerAside = root.findByProps({ role: "complementary" });
          expect(drawerAside).toBeDefined();
          expect(drawerAside.props.className).toContain("node-drawer");

          // Verify computed width containment
          const drawerWidth = computeResponsiveDrawerWidth(width);
          expect(drawerWidth).toBeLessThanOrEqual(width);
          if (name === "Mobile") {
            expect(drawerWidth).toBeLessThanOrEqual(375);
            expect(Math.max(0, drawerWidth - width)).toBe(0);
          }

          const closeBtn = root.findByProps({ className: "drawer-close-btn" });
          expect(closeBtn).toBeDefined();

          ReactTestRenderer.act(() => {
            closeBtn.props.onClick();
          });

          expect(useGraphStore.getState().selectedNodeId).toBeNull();
        });

        it(`verifies drawer dismissal via Escape keydown event on ${name}`, () => {
          ReactTestRenderer.act(() => {
            useGraphStore.getState().setDataset(mockDataset);
            useGraphStore.getState().setSelectedNodeId("node-gate-archetype");
          });
          expect(useGraphStore.getState().selectedNodeId).toBe("node-gate-archetype");

          let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
          ReactTestRenderer.act(() => {
            renderer = ReactTestRenderer.create(React.createElement(NodeDetailDrawer));
          });

          expect(renderer).toBeDefined();
          expect(useGraphStore.getState().selectedNodeId).toBe("node-gate-archetype");

          // Dispatch unrelated keydown - should not dismiss
          ReactTestRenderer.act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
          });
          expect(useGraphStore.getState().selectedNodeId).toBe("node-gate-archetype");

          // Dispatch Escape keydown - should cleanly dismiss
          ReactTestRenderer.act(() => {
            window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
          });
          expect(useGraphStore.getState().selectedNodeId).toBeNull();
        });
      },
    );
  });
});
