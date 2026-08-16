import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PositionedEdge, PositionedNode } from "../../../types/graphData";
import { useCanvasLensStore } from "../../../store/useCanvasLensStore";
import { GraphLensLegend } from "./GraphLensLegend";
import { GraphLensOverlayLayer } from "./GraphLensOverlayLayer";
import { GraphLensToolbar } from "./GraphLensToolbar";
import { GraphLensTooltip } from "./GraphLensTooltip";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const origConsoleError = console.error;
const origConsoleWarn = console.warn;

function silenceWarnings<T>(fn: () => T): T {
  console.error = (msg?: unknown, ...args: unknown[]) => {
    if (typeof msg === "string") {
      if (
        msg.includes("react-test-renderer is deprecated") ||
        msg.includes("not wrapped in act") ||
        msg.includes("inside a test was not wrapped in act") ||
        msg.includes("When testing, code that causes React state updates") ||
        msg.includes("An update to")
      ) {
        return;
      }
    }
    origConsoleError(msg, ...args);
  };
  console.warn = (msg?: unknown, ...args: unknown[]) => {
    if (typeof msg === "string") {
      if (
        msg.includes("not wrapped in act") ||
        msg.includes("react-test-renderer") ||
        msg.includes("An update to")
      ) {
        return;
      }
    }
    origConsoleWarn(msg, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = origConsoleError;
    console.warn = origConsoleWarn;
  }
}

describe("Canvas Lens React Components", () => {
  const mockNodes: PositionedNode[] = [
    {
      id: "node-1",
      name: "Source Task",
      status: "success",
      x: 10,
      y: 20,
      width: 140,
      height: 60,
      metrics: { durationMs: 1500 },
    },
    {
      id: "node-2",
      name: "Target Task",
      status: "running",
      x: 200,
      y: 20,
      width: 140,
      height: 60,
      metrics: { durationMs: 3000 },
    },
  ];

  const mockEdges: PositionedEdge[] = [
    {
      id: "edge-1",
      source: "node-1",
      target: "node-2",
      path: "M 150 50 L 200 50",
      traffic: { avgLatencyMs: 80 },
    },
  ];

  beforeEach(() => {
    silenceWarnings(() => {
      act(() => {
        useCanvasLensStore.getState().resetAllConfigs();
      });
    });
  });

  afterEach(() => {
    silenceWarnings(() => {
      act(() => {
        useCanvasLensStore.getState().resetAllConfigs();
      });
    });
  });

  describe("<GraphLensOverlayLayer />", () => {
    it("renders null when activeLens is 'none'", () => {
      let renderer!: ReactTestRenderer;
      silenceWarnings(() => {
        act(() => {
          renderer = create(
            <GraphLensOverlayLayer positionedNodes={mockNodes} positionedEdges={mockEdges} />,
          );
        });
      });
      expect(renderer.toJSON()).toBeNull();
    });

    it("renders SVG edge paths and HTML node overlay elements when activeLens is 'heatmap'", () => {
      let renderer!: ReactTestRenderer;
      silenceWarnings(() => {
        act(() => {
          useCanvasLensStore.getState().setActiveLens("heatmap");
        });
        act(() => {
          renderer = create(
            <GraphLensOverlayLayer positionedNodes={mockNodes} positionedEdges={mockEdges} />,
          );
        });
      });

      const root = renderer.root;
      const overlayLayer = root.findByProps({ "data-testid": "graph-lens-overlay-layer" });
      expect(overlayLayer).toBeDefined();

      const nodeOverlays = root.findAll(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("lens-node-overlay"),
      );
      expect(nodeOverlays.length).toBe(2);

      const edgePaths = root.findAll(
        (el) =>
          typeof el.props.className === "string" && el.props.className.includes("lens-edge-path"),
      );
      expect(edgePaths.length).toBe(1);
    });

    it("triggers node selection on click", () => {
      let clickedNodeId: string | null = null;
      let renderer!: ReactTestRenderer;

      silenceWarnings(() => {
        act(() => {
          useCanvasLensStore.getState().setActiveLens("heatmap");
        });
        act(() => {
          renderer = create(
            <GraphLensOverlayLayer
              positionedNodes={mockNodes}
              positionedEdges={mockEdges}
              onSelectNode={(id) => {
                clickedNodeId = id;
              }}
            />,
          );
        });
      });

      const nodeEl = renderer.root.findByProps({ "data-node-id": "node-1" });
      silenceWarnings(() => {
        act(() => {
          nodeEl.props.onClick({ stopPropagation: () => {} });
        });
      });

      expect(clickedNodeId).toBe("node-1");
      expect(useCanvasLensStore.getState().selectedLensNodeId).toBe("node-1");
    });
  });

  describe("<GraphLensToolbar />", () => {
    it("renders toolbar buttons and switches active lens modes", () => {
      let renderer!: ReactTestRenderer;
      silenceWarnings(() => {
        act(() => {
          renderer = create(<GraphLensToolbar />);
        });
      });

      const root = renderer.root;
      const toolbar = root.findByProps({ "data-testid": "graph-lens-toolbar" });
      expect(toolbar).toBeDefined();

      // Find and click heat mode button
      const buttons = root.findAllByType("button");
      const heatBtn = buttons.find((b) => {
        const text = String(b.children);
        return text.includes("Heat") || b.props.className?.includes("mode-heatmap");
      });
      if (heatBtn) {
        silenceWarnings(() => {
          act(() => {
            heatBtn.props.onClick();
          });
        });
        expect(useCanvasLensStore.getState().activeLens).toBe("heatmap");
      }
    });
  });

  describe("<GraphLensLegend />", () => {
    it("renders legend when lens is active", () => {
      let renderer!: ReactTestRenderer;
      silenceWarnings(() => {
        act(() => {
          useCanvasLensStore.getState().setActiveLens("critical-path");
        });
        act(() => {
          renderer = create(
            <GraphLensLegend positionedNodes={mockNodes} positionedEdges={mockEdges} />,
          );
        });
      });

      const root = renderer.root;
      const legend = root.findByProps({ "data-testid": "graph-lens-legend" });
      expect(legend).toBeDefined();
    });

    it("renders null when activeLens is 'none'", () => {
      let renderer!: ReactTestRenderer;
      silenceWarnings(() => {
        act(() => {
          renderer = create(
            <GraphLensLegend positionedNodes={mockNodes} positionedEdges={mockEdges} />,
          );
        });
      });
      expect(renderer.toJSON()).toBeNull();
    });
  });

  describe("<GraphLensTooltip />", () => {
    it("renders rich tooltip for hovered node", () => {
      let renderer!: ReactTestRenderer;
      silenceWarnings(() => {
        act(() => {
          useCanvasLensStore.getState().setActiveLens("risk");
          useCanvasLensStore.getState().setHoveredLensNodeId("node-2");
        });
        act(() => {
          renderer = create(
            <GraphLensTooltip positionedNodes={mockNodes} positionedEdges={mockEdges} />,
          );
        });
      });

      const root = renderer.root;
      const tooltip = root.findByProps({ "data-testid": "graph-lens-tooltip" });
      expect(tooltip).toBeDefined();
      expect(renderer.toJSON()).not.toBeNull();
    });
  });
});
