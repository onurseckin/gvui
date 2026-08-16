import { beforeEach, describe, expect, it } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { GraphGroupingLayer } from "../../engine/GraphCanvas/GraphGroupingLayer";
import { useGraphStore } from "../../state/useGraphStore";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import { useCanvasGroupingStore } from "./useCanvasGroupingStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceReactWarnings<T>(fn: () => T): T {
  const originalConsoleError = console.error;
  console.error = (message?: unknown, ...args: unknown[]) => {
    if (
      typeof message === "string" &&
      (message.includes("react-test-renderer is deprecated") ||
        message.includes("An update to") ||
        message.includes("was not wrapped in act") ||
        message.includes("The result of getSnapshot should be cached"))
    ) {
      return;
    }
    originalConsoleError(message, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = originalConsoleError;
  }
}

const testNodes: PositionedNode[] = [
  {
    id: "worker-1",
    name: "Worker 1",
    x: 100,
    y: 100,
    width: 150,
    height: 80,
  },
  {
    id: "worker-2",
    name: "Worker 2",
    x: 300,
    y: 120,
    width: 160,
    height: 90,
  },
  {
    id: "critic-1",
    name: "Critic Evaluator",
    x: 200,
    y: 350,
    width: 180,
    height: 80,
  },
];

const testEdges: PositionedEdge[] = [
  {
    id: "edge-1",
    source: "worker-1",
    target: "critic-1",
    path: "M 175 180 L 290 350",
  },
];

describe("GraphGroupingLayer Component & Canvas Rendering", () => {
  beforeEach(() => {
    act(() => {
      useCanvasGroupingStore.getState().clearAllGroups();
      useCanvasGroupingStore.getState().setIsGroupingLayerVisible(true);
      useGraphStore.getState().setPositionedGraph(testNodes, testEdges);
      useGraphStore.getState().setZoomLevel(1);
    });
  });

  it("returns null when no groups exist or layer is hidden", () => {
    silenceReactWarnings(() => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(GraphGroupingLayer, {
            positionedNodes: testNodes,
          }),
        );
      });
      expect(renderer.toJSON()).toBeNull();

      // Create a group
      act(() => {
        useCanvasGroupingStore.getState().createGroup({
          label: "Active Group",
          color: "blue",
          memberNodeIds: ["worker-1", "worker-2"],
        });
      });

      act(() => {
        renderer.update(
          createElement(GraphGroupingLayer, {
            positionedNodes: testNodes,
          }),
        );
      });
      expect(renderer.toJSON()).not.toBeNull();

      // Hide layer
      act(() => {
        useCanvasGroupingStore.getState().setIsGroupingLayerVisible(false);
      });

      act(() => {
        renderer.update(
          createElement(GraphGroupingLayer, {
            positionedNodes: testNodes,
          }),
        );
      });
      expect(renderer.toJSON()).toBeNull();
    });
  });

  it("renders SVG boundary paths and Region Headers for expanded groups", () => {
    silenceReactWarnings(() => {
      let selectedId: string | null = null;
      let group:
        | ReturnType<typeof useCanvasGroupingStore.getState.prototype.createGroup>
        | undefined;

      act(() => {
        group = useCanvasGroupingStore.getState().createGroup({
          id: "grp-test-expanded",
          label: "Processing Cluster",
          color: "emerald",
          memberNodeIds: ["worker-1", "worker-2"],
          shapeMode: "box",
        });
      });

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(GraphGroupingLayer, {
            positionedNodes: testNodes,
            onSelectGroup: (id) => {
              selectedId = id;
            },
          }),
        );
      });

      const root = renderer.root;

      // Find SVG path
      const path = root.find(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("group-boundary-path"),
      );
      expect(path).toBeDefined();
      expect(path.props.fill).toContain("rgba");

      // Find Region Header
      const headerTitle = root.find(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("group-header-title"),
      );
      expect(headerTitle.children).toContain("Processing Cluster");

      // Find Member count badge
      const badge = root.find(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("group-header-badge"),
      );
      expect(badge.children.map(String)).toContain("2");

      // Test click selection on path
      act(() => {
        path.props.onClick({ stopPropagation: () => {} });
      });
      expect(selectedId).toBe(group?.id ?? "");
      expect(useCanvasGroupingStore.getState().selectedGroupId).toBe(group?.id ?? "");
    });
  });

  it("renders Collapsed Summary Pill when group is collapsed and allows expanding", () => {
    silenceReactWarnings(() => {
      act(() => {
        useCanvasGroupingStore.getState().createGroup({
          id: "grp-collapsed",
          label: "Ingestion Pipeline",
          color: "purple",
          memberNodeIds: ["worker-1", "worker-2", "critic-1"],
          isCollapsed: true,
        });
      });

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(GraphGroupingLayer, {
            positionedNodes: testNodes,
          }),
        );
      });

      const root = renderer.root;

      // Collapsed summary pill should be present
      const pill = root.find(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("group-collapsed-pill"),
      );
      expect(pill).toBeDefined();
      const label = root.find(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("group-collapsed-label"),
      );
      expect(label.children).toContain("Ingestion Pipeline");
      const count = root.find(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("group-collapsed-count"),
      );
      expect(count.children.join("")).toContain("3 nodes");

      // Click expand button on pill
      const expandBtn = root.findByProps({ "aria-label": "Expand Group" });
      act(() => {
        expandBtn.props.onClick({ stopPropagation: () => {} });
      });

      expect(useCanvasGroupingStore.getState().groups[0].isCollapsed).toBe(false);
    });
  });

  it("handles hidden nodes and missing member nodes cleanly", () => {
    silenceReactWarnings(() => {
      act(() => {
        useCanvasGroupingStore.getState().createGroup({
          id: "grp-partial",
          label: "Partial Group",
          color: "amber",
          memberNodeIds: ["worker-1", "worker-2"],
        });
      });

      // Hide worker-1
      const hidden = new Set(["worker-1"]);
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(GraphGroupingLayer, {
            positionedNodes: testNodes,
            hiddenNodeIds: hidden,
          }),
        );
      });

      const root = renderer.root;
      const badge = root.find(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("group-header-badge"),
      );
      // Only 1 node visible
      expect(badge.children.map(String)).toContain("1");

      // Hide both nodes
      const allHidden = new Set(["worker-1", "worker-2"]);
      act(() => {
        renderer.update(
          createElement(GraphGroupingLayer, {
            positionedNodes: testNodes,
            hiddenNodeIds: allHidden,
          }),
        );
      });

      // Whole group is hidden
      expect(renderer.toJSON()).toBeNull();
    });
  });

  it("handles group drag & move interaction and updates store positions synchronously", () => {
    silenceReactWarnings(() => {
      let group:
        | ReturnType<typeof useCanvasGroupingStore.getState.prototype.createGroup>
        | undefined;
      act(() => {
        group = useCanvasGroupingStore.getState().createGroup({
          id: "grp-drag",
          label: "Draggable Group",
          color: "cyan",
          memberNodeIds: ["worker-1", "worker-2"],
        });
      });

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(GraphGroupingLayer, {
            positionedNodes: testNodes,
            zoomLevel: 1.0,
          }),
        );
      });

      const root = renderer.root;
      const header = root.find(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("group-region-header-container"),
      );

      // Simulate mouse down on header
      act(() => {
        header.props.onMouseDown({
          clientX: 100,
          clientY: 100,
          stopPropagation: () => {},
          preventDefault: () => {},
        });
      });

      expect(useCanvasGroupingStore.getState().isDraggingGroup).toBe(true);
      expect(useCanvasGroupingStore.getState().activeDragGroupId).toBe(group?.id ?? "");

      const target =
        typeof window !== "undefined"
          ? window
          : (globalThis as unknown as { dispatchEvent: (ev: Event) => boolean });

      // Dispatch mouse move event
      act(() => {
        const moveEvt = Object.assign(new Event("mousemove"), {
          clientX: 150, // +50px
          clientY: 130, // +30px
        });
        target.dispatchEvent(moveEvt);
      });

      // Verify member nodes shifted synchronously in graph store
      const updatedNodes = useGraphStore.getState().positionedNodes;
      const w1 = updatedNodes.find((n) => n.id === "worker-1");
      const w2 = updatedNodes.find((n) => n.id === "worker-2");
      const c1 = updatedNodes.find((n) => n.id === "critic-1");

      expect(w1?.x).toBe(150); // 100 + 50
      expect(w1?.y).toBe(130); // 100 + 30
      expect(w2?.x).toBe(350); // 300 + 50
      expect(w2?.y).toBe(150); // 120 + 30
      expect(c1?.x).toBe(200); // untouched

      // Dispatch mouse up
      act(() => {
        target.dispatchEvent(new Event("mouseup"));
      });

      expect(useCanvasGroupingStore.getState().isDraggingGroup).toBe(false);
      expect(useCanvasGroupingStore.getState().activeDragGroupId).toBeNull();
    });
  });

  it("respects locked groups and prevents dragging when locked", () => {
    silenceReactWarnings(() => {
      act(() => {
        useCanvasGroupingStore.getState().createGroup({
          id: "grp-locked",
          label: "Locked Group",
          color: "rose",
          memberNodeIds: ["worker-1"],
          isLocked: true,
        });
      });

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(GraphGroupingLayer, {
            positionedNodes: testNodes,
          }),
        );
      });

      const root = renderer.root;
      const header = root.find(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("group-region-header-container"),
      );

      // Attempt drag on locked group
      act(() => {
        header.props.onMouseDown({
          clientX: 100,
          clientY: 100,
          stopPropagation: () => {},
          preventDefault: () => {},
        });
      });

      // Should not start dragging
      expect(useCanvasGroupingStore.getState().isDraggingGroup).toBe(false);

      // Unlock group via header button
      const lockBtn = root.findByProps({ "aria-label": "Unlock Group" });
      act(() => {
        lockBtn.props.onClick({ stopPropagation: () => {} });
      });

      expect(useCanvasGroupingStore.getState().groups[0].isLocked).toBe(false);
    });
  });
});
