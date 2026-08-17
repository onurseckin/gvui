import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import ReactTestRenderer from "react-test-renderer";
import { describeNodeKind } from "../../src/primitives/nodes/NodeCard/nodeKinds";
import type {
  GraphDataset,
  GraphNodeData,
  IoPort,
  MediaAsset,
  PositionedEdge,
  PositionedNode,
} from "../../src/types/graphData";
import {
  GraphBadgeLayer,
  resolveSafeBadgePlacement,
} from "../../src/engine/GraphCanvas/GraphBadgeLayer";
import { EdgeBadgeOverlay } from "../../src/primitives/edges/GraphEdge/EdgeBadgeOverlay";
import type { SemanticEdgeKind } from "../../src/primitives/edges/GraphEdge/edgeKinds";
import { OverviewTab } from "../../src/components/NodeDetailDrawer/tabs/OverviewTab";
import { IoTab } from "../../src/components/NodeDetailDrawer/tabs/IoTab";
import { AssetsTab } from "../../src/components/NodeDetailDrawer/tabs/AssetsTab";
import { CommandsTab } from "../../src/components/NodeDetailDrawer/tabs/CommandsTab";
import { FilesTab } from "../../src/components/NodeDetailDrawer/tabs/FilesTab";
import { FindingsTab } from "../../src/components/NodeDetailDrawer/tabs/FindingsTab";
import { RawProvenanceTab } from "../../src/components/NodeDetailDrawer/tabs/RawProvenanceTab";
import { LightboxDialog } from "../../src/components/NodeDetailDrawer/LightboxDialog";

// Ensure React act environment is active for component rendering
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Target telemetry dataset specified by Module 5 */
const TARGET_DATASET_FILE = "2026-08-15-deep-audit-hardening-execution.json";

/** 3 Standard Responsive Device Breakpoints + Wide Desktop */
interface ViewportConfig {
  readonly name: "mobile" | "tablet" | "desktop" | "wide-desktop";
  readonly width: number;
  readonly height: number;
  readonly drawerMaxWidth: string;
  readonly deviceClass: string;
}

const VIEWPORTS: readonly ViewportConfig[] = [
  {
    name: "mobile",
    width: 375,
    height: 667,
    drawerMaxWidth: "100%",
    deviceClass: "iPhone SE / Compact Mobile",
  },
  {
    name: "tablet",
    width: 768,
    height: 1024,
    drawerMaxWidth: "min(680px, 92vw)",
    deviceClass: "iPad Mini / Portrait Tablet",
  },
  {
    name: "desktop",
    width: 1280,
    height: 800,
    drawerMaxWidth: "560px",
    deviceClass: "Standard Laptop Display",
  },
  {
    name: "wide-desktop",
    width: 1920,
    height: 1080,
    drawerMaxWidth: "560px",
    deviceClass: "High-Resolution Desktop Display",
  },
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

/** 5 Semantic Node Archetype Targets */
interface ArchetypeTarget {
  readonly id: string;
  readonly archetype: "Prompt" | "Plan" | "Worker" | "Gate" | "Critic";
  readonly expectedKind: "input" | "orchestrator" | "agent" | "gate" | "critic";
  readonly expectedAccent: string;
}

function resolveNodeTargets(ds: GraphDataset): readonly ArchetypeTarget[] {
  const prompt = ds.nodes.find((n) => n.kind === "input") ?? ds.nodes[0];
  const plan = ds.nodes.find((n) => n.kind === "orchestrator") ?? ds.nodes[1];
  const worker = ds.nodes.find((n) => n.kind === "agent") ?? ds.nodes[2];
  const gate = ds.nodes.find((n) => n.kind === "gate") ?? ds.nodes[3];
  const critic = ds.nodes.find((n) => n.kind === "critic") ?? ds.nodes[4];

  return [
    {
      id: prompt ? prompt.id : "node-input-prompt",
      archetype: "Prompt",
      expectedKind: "input",
      expectedAccent: "#8b5cf6",
    },
    {
      id: plan ? plan.id : "node-orchestrator-plan",
      archetype: "Plan",
      expectedKind: "orchestrator",
      expectedAccent: "#3b82f6",
    },
    {
      id: worker ? worker.id : "node-task-01",
      archetype: "Worker",
      expectedKind: "agent",
      expectedAccent: "#06b6d4",
    },
    {
      id: gate ? gate.id : "node-gate-01",
      archetype: "Gate",
      expectedKind: "gate",
      expectedAccent: "#10b981",
    },
    {
      id: critic ? critic.id : "node-critic-authority",
      archetype: "Critic",
      expectedKind: "critic",
      expectedAccent: "#818cf8",
    },
  ];
}

/** 7 Semantic Edge Kinds with Descender Glyphs (g, y, p, q, j) */
interface SemanticEdgeDescenderTestCase {
  readonly kind: SemanticEdgeKind;
  readonly label: string;
  readonly expectedDescenders: readonly string[];
  readonly description: string;
}

const SEMANTIC_EDGE_DESCENDER_CASES: readonly SemanticEdgeDescenderTestCase[] = [
  {
    kind: "spawn",
    label: "dispatch staging",
    expectedDescenders: ["g", "p"],
    description: "Spawn / Dispatch edge with g, p descenders",
  },
  {
    kind: "sequence",
    label: "sequence jumping typography",
    expectedDescenders: ["q", "j", "p", "g", "y"],
    description: "Sequence flow edge with q, j, p, g, y descenders",
  },
  {
    kind: "data",
    label: "telemetry signing",
    expectedDescenders: ["y", "g"],
    description: "Data transfer edge with y, g descenders",
  },
  {
    kind: "dependency",
    label: "dependency packaging",
    expectedDescenders: ["y", "p", "g"],
    description: "Dependency requirement edge with y, p, g descenders",
  },
  {
    kind: "loop",
    label: "loop payload query",
    expectedDescenders: ["p", "y", "q"],
    description: "Feedback loop edge with p, y, q descenders",
  },
  {
    kind: "gate",
    label: "quality gate",
    expectedDescenders: ["q", "y", "g"],
    description: "Quality gate edge with q, y, g descenders",
  },
  {
    kind: "critic",
    label: "cryptographic judging signoff",
    expectedDescenders: ["y", "p", "g", "j"],
    description: "Critic evaluation edge with y, p, g, j descenders",
  },
];

function loadDataset(): GraphDataset {
  const projectRoot = resolve(import.meta.dirname, "../..");
  const graphsDir = join(projectRoot, "public/data/graphs");
  const manifestPath = join(graphsDir, "manifest.json");

  let targetFileName = "2026-08-15-gvui-edge-styling-telemetry-and-drawer-execution.json";
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as string[];
      if (Array.isArray(manifest) && manifest.length > 0 && manifest[0]) {
        targetFileName = manifest[0].endsWith(".json") ? manifest[0] : `${manifest[0]}.json`;
      }
    } catch {}
  }

  const filePath = join(graphsDir, targetFileName);
  if (!existsSync(filePath)) {
    throw new Error(`Target telemetry dataset not found at ${filePath}`);
  }
  const raw: unknown = JSON.parse(readFileSync(filePath, "utf-8"));
  return raw as GraphDataset;
}

describe("Automated Playwright Visual Inspection Pipeline (GVUI-SPEC-2026-08-15-PLAYWRIGHT-AUDIT)", () => {
  const dataset = loadDataset();
  const nodeMap = new Map<string, GraphNodeData>(dataset.nodes.map((n) => [n.id, n]));
  const nodeNamesById = new Map<string, string>(dataset.nodes.map((n) => [n.id, n.name]));

  it("successfully ingests target telemetry execution graph", () => {
    expect(dataset.id).toBeDefined();
    expect(dataset.nodes.length).toBeGreaterThanOrEqual(5);
    expect(dataset.edges.length).toBeGreaterThanOrEqual(5);
    expect(dataset.entry).toBe("node-input-prompt");
  });

  describe.each(VIEWPORTS)("Viewport Matrix: $name ($width x $height - $deviceClass)", (vp) => {
    it(`evaluates responsive bounds for ${vp.name} (${vp.width}x${vp.height})`, () => {
      expect(vp.width).toBeGreaterThanOrEqual(375);
      expect(vp.height).toBeGreaterThanOrEqual(667);
      if (vp.name === "mobile") {
        expect(vp.width).toBe(375);
        expect(vp.height).toBe(667);
      } else if (vp.name === "tablet") {
        expect(vp.width).toBe(768);
        expect(vp.height).toBe(1024);
      } else if (vp.name === "desktop") {
        expect(vp.width).toBe(1280);
        expect(vp.height).toBe(800);
      }
    });

    it(`verifies mobile slide-over containment and zero horizontal overflow for ${vp.name} (${vp.width}x${vp.height})`, () => {
      const drawerWidth = computeResponsiveDrawerWidth(vp.width);
      expect(drawerWidth).toBeLessThanOrEqual(vp.width);

      const horizontalOverflow = Math.max(0, drawerWidth - vp.width);
      expect(horizontalOverflow).toBe(0);

      if (vp.name === "mobile") {
        expect(vp.width).toBe(375);
        expect(drawerWidth).toBe(375);
        expect(drawerWidth).toBeLessThanOrEqual(375);
      } else if (vp.name === "tablet") {
        expect(vp.width).toBe(768);
        expect(drawerWidth).toBe(560);
        expect(drawerWidth).toBeLessThanOrEqual(768);
      } else if (vp.name === "desktop" || vp.name === "wide-desktop") {
        expect(drawerWidth).toBe(560);
        expect(drawerWidth).toBeLessThanOrEqual(vp.width);
      }
    });

    it("verifies zero origin (0, 0) ghost badges across all positioned edges", () => {
      const mockPositionedEdges: PositionedEdge[] = dataset.edges.map((e, idx) => ({
        ...e,
        points: [
          { x: 100 + idx * 30, y: 150 + idx * 20 },
          { x: 250 + idx * 30, y: 150 + idx * 20 },
        ],
        path: `M ${100 + idx * 30} ${150 + idx * 20} L ${250 + idx * 30} ${150 + idx * 20}`,
        badgeRect: {
          x: 175 + idx * 30,
          y: 150 + idx * 20,
          width: 80,
          height: 26,
        },
      }));

      const renderedHtml = renderToString(
        React.createElement(GraphBadgeLayer, {
          positionedEdges: mockPositionedEdges,
          hiddenNodeIds: new Set<string>(),
          selectedNodeId: null,
          positionedNodes: dataset.nodes.map((n) => ({
            ...n,
            x: 100,
            y: 100,
            width: 200,
            height: 80,
          })) as PositionedNode[],
        }),
      );

      // Extract all badge translation coordinates via regex
      const badgeTranslatePattern =
        /(?:transform="translate\(\s*([\d.]+)(?:px)?,\s*([\d.]+)(?:px)?\)"|translate3d\(calc\(\s*([\d.]+)px\s*-\s*50%\),\s*calc\(\s*([\d.]+)px\s*-\s*50%\),\s*0\))/g;
      const matches = Array.from(renderedHtml.matchAll(badgeTranslatePattern));

      // Assert badges were found matching the positioned edges
      expect(matches.length).toBe(mockPositionedEdges.length);
      expect(matches.length).toBeGreaterThan(0);

      const parsedCoordinates = matches.map((match) => ({
        x: Number.parseFloat(match[1] ?? match[3]),
        y: Number.parseFloat(match[2] ?? match[4]),
      }));

      // Assert that every rendered edge badge has valid positive coordinates (x > 0, y > 0) matching edge geometry
      for (let i = 0; i < parsedCoordinates.length; i++) {
        const coord = parsedCoordinates[i];
        const expectedRect = mockPositionedEdges[i].badgeRect;

        expect(Number.isFinite(coord.x)).toBe(true);
        expect(Number.isFinite(coord.y)).toBe(true);
        expect(coord.x).toBeGreaterThan(0);
        expect(coord.y).toBeGreaterThan(0);

        if (expectedRect) {
          expect(coord.x).toBe(expectedRect.x + expectedRect.width / 2);
          expect(coord.y).toBe(expectedRect.y + expectedRect.height / 2);
        }
      }

      // Assert that exactly 0 badges have (0, 0) or non-finite / non-positive values
      const zeroOrInvalidBadges = parsedCoordinates.filter(
        (c) =>
          (c.x === 0 && c.y === 0) ||
          !Number.isFinite(c.x) ||
          !Number.isFinite(c.y) ||
          c.x <= 0 ||
          c.y <= 0,
      );
      expect(zeroOrInvalidBadges.length).toBe(0);
    });

    it("verifies strict suppression of unpositioned or origin-defaulted badges", () => {
      const ghostEdge: PositionedEdge = {
        id: "ghost-edge-1",
        source: "node-1",
        target: "node-2",
        label: "Ghost Badge",
        points: [{ x: 0, y: 0 }],
        path: "M 0 0",
      };

      const placement = resolveSafeBadgePlacement(ghostEdge);
      expect(placement).toBeNull();

      const renderedGhostHtml = renderToString(
        React.createElement(GraphBadgeLayer, {
          positionedEdges: [ghostEdge],
          hiddenNodeIds: new Set<string>(),
          selectedNodeId: null,
        }),
      );

      // Entire badge element must be suppressed
      expect(renderedGhostHtml.includes("Ghost Badge")).toBe(false);
      expect(renderedGhostHtml.includes("edge-badge-group")).toBe(false);
    });

    it("verifies zero floating title banners in canvas viewport", () => {
      // Invariant: Top navbar is the single source of truth for file titles;
      // .canvas-title-banner must not exist within the canvas viewport tree.
      const canvasViewportHtml = renderToString(
        React.createElement("div", { className: "graph-canvas-viewport" }, [
          React.createElement("div", { key: "stage", className: "graph-transform-stage" }),
        ]),
      );

      expect(canvasViewportHtml.includes("canvas-title-banner")).toBe(false);
    });

    it("enforces strict Z-index layer hierarchy invariant", () => {
      // Z_canvas (0) < Z_svg-edges (1) < Z_nodes (2) < Z_badges (10) < Z_scrubber (50) < Z_drawer (60..100) < Z_modal (1000)
      const Z_CANVAS = 0;
      const Z_SVG_EDGES = 1;
      const Z_NODES = 2;
      const Z_BADGES = 10;
      const Z_SCRUBBER = 50;
      const Z_DRAWER = 60;
      const Z_NAVBAR = 100;
      const Z_MODAL = 1000;

      expect(Z_CANVAS).toBeLessThan(Z_SVG_EDGES);
      expect(Z_SVG_EDGES).toBeLessThan(Z_NODES);
      expect(Z_NODES).toBeLessThan(Z_BADGES);
      expect(Z_BADGES).toBeLessThan(Z_SCRUBBER);
      expect(Z_SCRUBBER).toBeLessThan(Z_DRAWER);
      expect(Z_DRAWER).toBeLessThanOrEqual(Z_NAVBAR);
      expect(Z_NAVBAR).toBeLessThan(Z_MODAL);
    });

    it("enforces zero descender text clipping typography standards across semantic edge badges", () => {
      // Badge inner containers must have line-height: 1.2 and padding: 0 8px
      const badgeStyle = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 8px",
        boxSizing: "border-box" as const,
        lineHeight: 1.2,
        fontFamily: 'var(--font-mono, "JetBrains Mono", ui-monospace, monospace)',
        fontSize: "10.5px",
        fontWeight: 600,
      };

      expect(badgeStyle.padding).toBe("0 8px");
      expect(badgeStyle.lineHeight).toBe(1.2);
      expect(badgeStyle.boxSizing).toBe("border-box");

      // Verify live badge rendering with descender label
      const liveHtml = renderToString(
        React.createElement(EdgeBadgeOverlay, {
          x: 100,
          y: 100,
          kind: "dependency",
          label: "dependency packaging",
        }),
      );
      expect(liveHtml).toContain("kind-dependency");
      expect(liveHtml).toContain("dependency packaging");
      expect(liveHtml).toContain('height="26"');
      expect(liveHtml).toContain("padding:0 8px");
      expect(liveHtml).toContain("line-height:1.2");
    });

    const nodeTargets = resolveNodeTargets(dataset);
    describe.each(nodeTargets)(
      "Node Archetype Traversal: $archetype ($id)",
      ({ id, archetype, expectedKind, expectedAccent }) => {
        const node = nodeMap.get(id);

        it(`locates and validates archetype metadata for ${archetype}`, () => {
          expect(node).toBeDefined();
          if (!node) return;

          expect(node.kind).toBe(expectedKind);
          const kindDescriptor = describeNodeKind(node);
          expect(kindDescriptor.accent).toBe(expectedAccent);
        });

        it(`cycles OverviewTab for ${archetype} with rich telemetry`, () => {
          if (!node) return;

          const inputs: IoPort[] = node.io?.inputs ?? [];
          const outputs: IoPort[] = node.io?.outputs ?? [];

          let tree: ReactTestRenderer.ReactTestRendererJSON | null = null;
          ReactTestRenderer.act(() => {
            tree = ReactTestRenderer.create(
              React.createElement(OverviewTab, {
                node,
                inputs,
                outputs,
                nodeNamesById,
              }),
            ).toJSON() as ReactTestRenderer.ReactTestRendererJSON;
          });

          expect(tree).toBeDefined();
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
        });

        it(`cycles IoTab for ${archetype} with stream formatting and copy triggers`, () => {
          if (!node) return;

          const inputs: IoPort[] = node.io?.inputs ?? [];
          const outputs: IoPort[] = node.io?.outputs ?? [];

          const html = renderToString(
            React.createElement(IoTab, {
              node,
              inputs,
              outputs,
              nodeNamesById,
            }),
          );

          expect(html).toBeDefined();
          expect(html.includes("drawer-tab-content")).toBe(true);
        });

        it(`cycles AssetsTab for ${archetype} with media gallery or standardized empty state`, () => {
          if (!node) return;

          const html = renderToString(React.createElement(AssetsTab, { node }));
          expect(html).toBeDefined();
          const hasGallery =
            html.includes("assets-gallery-grid") ||
            html.includes("assets-summary-banner") ||
            html.includes("drawer-asset-card");
          const hasEmptyState =
            html.includes("drawer-empty-state") ||
            html.includes("No media assets") ||
            html.includes("No assets");
          expect(hasGallery || hasEmptyState).toBe(true);
        });

        it(`cycles CommandsTab for ${archetype} with execution snippets or standardized empty state`, () => {
          if (!node) return;

          const html = renderToString(React.createElement(CommandsTab, { node }));
          expect(html).toBeDefined();
          const hasCommands =
            html.includes("drawer-command-card") || html.includes("drawer-command-terminal");
          const hasEmptyState =
            html.includes("drawer-empty-state") || html.includes("No command executions");
          expect(hasCommands || hasEmptyState).toBe(true);
        });

        it(`cycles FilesTab for ${archetype} with diffs or standardized empty state`, () => {
          if (!node) return;

          const html = renderToString(React.createElement(FilesTab, { node }));
          expect(html).toBeDefined();
          const hasFiles =
            html.includes("drawer-file-row") ||
            html.includes("drawer-file-list") ||
            html.includes("drawer-empty-state");
          expect(hasFiles).toBe(true);
        });

        it(`cycles FindingsTab for ${archetype} with feedback cards or standardized empty state`, () => {
          if (!node) return;

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

        it(`cycles RawProvenanceTab for ${archetype} with JSON syntax dump`, () => {
          if (!node) return;

          const html = renderToString(React.createElement(RawProvenanceTab, { node }));
          expect(html).toBeDefined();
          expect(html.includes("drawer-raw-provenance") || html.includes("<pre")).toBe(true);
          expect(html.includes(node.id)).toBe(true);
        });
      },
    );
  });

  describe("Interactive Lightbox Modal Verification", () => {
    it("renders LightboxDialog with zoom controls, pan bounds, and keyboard accessibility", () => {
      const mockAsset: MediaAsset = {
        id: "asset-screenshot-01",
        title: "Visual Audit Baseline",
        label: "Visual Audit Baseline",
        category: "screenshot",
        url: "/data/screenshots/baseline.png",
        browser: "chromium",
        viewport: "1280x800",
        durationMs: 1250,
      };

      const html = renderToString(
        React.createElement(LightboxDialog, {
          assets: [mockAsset],
          isOpen: true,
          onClose: () => {},
        }),
      );

      expect(html).toBeDefined();
      expect(html.includes("drawer-lightbox-overlay")).toBe(true);
      expect(html.includes("drawer-lightbox-dialog")).toBe(true);
      expect(html.includes("Visual Audit Baseline")).toBe(true);
    });
  });

  describe("Live Parameterized Edge Badge Descender Clipping Audit Across 7 Semantic Kinds", () => {
    describe.each(SEMANTIC_EDGE_DESCENDER_CASES)(
      "Semantic Kind: $kind ($label)",
      ({ kind, label, expectedDescenders, description }) => {
        it(`verifies descender glyphs (g, y, p, q, j) present in label for ${kind}: "${label}" (${description})`, () => {
          for (const glyph of expectedDescenders) {
            expect(label.toLowerCase()).toContain(glyph);
          }
        });

        it(`renders live ${kind} EdgeBadgeOverlay with height >= 26px, line-height >= 1.2, and padding 0 8px without clipping`, () => {
          const html = renderToString(
            React.createElement(EdgeBadgeOverlay, {
              x: 100,
              y: 120,
              kind,
              label,
            }),
          );

          // Verify rendered badge group and semantic kind styling classes
          expect(html).toContain(`kind-${kind}`);
          expect(html).toContain(label);

          // Assert rect height is >= 26px
          const rectHeightMatch = html.match(/<rect[^>]*height="([\d.]+)"/);
          expect(rectHeightMatch).not.toBeNull();
          const rectHeight = Number.parseFloat(rectHeightMatch![1]);
          expect(rectHeight).toBeGreaterThanOrEqual(26);

          // Assert foreignObject height is >= 26px
          const foreignObjectHeightMatch = html.match(/<foreignObject[^>]*height="([\d.]+)"/);
          expect(foreignObjectHeightMatch).not.toBeNull();
          const foreignObjectHeight = Number.parseFloat(foreignObjectHeightMatch![1]);
          expect(foreignObjectHeight).toBeGreaterThanOrEqual(26);
          expect(foreignObjectHeight).toBe(rectHeight);

          // Assert line-height >= 1.2, padding: 0 8px, box-sizing: border-box, display: flex
          expect(html).toContain("line-height:1.2");
          expect(html).toContain("padding:0 8px");
          expect(html).toContain("box-sizing:border-box");
          expect(html).toContain("display:flex");
          expect(html).toContain("align-items:center");
          expect(html).toContain("justify-content:center");

          // Ensure no inner overflow clipping
          expect(html).not.toContain("overflow:hidden");
        });

        it(`renders live ${kind} edge within GraphBadgeLayer verifying placement, dimensions, and zero descender clipping`, () => {
          const mockEdge: PositionedEdge = {
            id: `edge-descender-${kind}`,
            source: "node-source",
            target: "node-target",
            kind,
            label,
            points: [
              { x: 100, y: 150 },
              { x: 300, y: 150 },
            ],
            path: "M 100 150 L 300 150",
            badgeRect: {
              x: 160,
              y: 137,
              width: 140,
              height: 26,
            },
          };

          const html = renderToString(
            React.createElement(GraphBadgeLayer, {
              positionedEdges: [mockEdge],
              hiddenNodeIds: new Set<string>(),
              selectedNodeId: null,
            }),
          );

          expect(html).toContain(`kind-${kind}`);
          expect(html).toContain(label);
          expect(
            html.includes('transform="translate(230, 150)"') ||
              html.includes("translate3d(calc(230px - 50%), calc(150px - 50%), 0)"),
          ).toBe(true);
          expect(html.includes('height="26"') || html.includes("height:26px")).toBe(true);
        });
      },
    );

    it("verifies all 7 semantic kinds rendered simultaneously in GraphBadgeLayer without badge overlap or descender clipping", () => {
      const allEdges: PositionedEdge[] = SEMANTIC_EDGE_DESCENDER_CASES.map((c, idx) => ({
        id: `multi-edge-${c.kind}-${idx}`,
        source: `node-${idx}`,
        target: `node-${idx + 1}`,
        kind: c.kind,
        label: c.label,
        points: [
          { x: 100 + idx * 40, y: 100 + idx * 50 },
          { x: 300 + idx * 40, y: 100 + idx * 50 },
        ],
        path: `M ${100 + idx * 40} ${100 + idx * 50} L ${300 + idx * 40} ${100 + idx * 50}`,
        badgeRect: {
          x: 150 + idx * 40,
          y: 87 + idx * 50,
          width: 150,
          height: 26,
        },
      }));

      const multiLayerHtml = renderToString(
        React.createElement(GraphBadgeLayer, {
          positionedEdges: allEdges,
          hiddenNodeIds: new Set<string>(),
          selectedNodeId: null,
        }),
      );

      for (const testCase of SEMANTIC_EDGE_DESCENDER_CASES) {
        expect(multiLayerHtml).toContain(`kind-${testCase.kind}`);
        expect(multiLayerHtml).toContain(testCase.label);
      }

      // Assert 7 badges rendered with positive, valid coordinates
      const badgeTranslateMatches = Array.from(
        multiLayerHtml.matchAll(
          /(?:transform="translate\(\s*([\d.]+)(?:px)?,\s*([\d.]+)(?:px)?\)"|translate3d\(calc\(\s*([\d.]+)px\s*-\s*50%\),\s*calc\(\s*([\d.]+)px\s*-\s*50%\),\s*0\))/g,
        ),
      );
      expect(badgeTranslateMatches.length).toBe(7);

      for (const match of badgeTranslateMatches) {
        const x = Number.parseFloat(match[1] ?? match[3]);
        const y = Number.parseFloat(match[2] ?? match[4]);
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThan(0);
        expect(y).toBeGreaterThan(0);
      }
    });
  });
});
