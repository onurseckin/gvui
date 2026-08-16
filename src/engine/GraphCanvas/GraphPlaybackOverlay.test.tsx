import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { GraphPlaybackOverlay } from "./GraphPlaybackOverlay";
import { computePlaybackHighlights } from "./playbackHighlights";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceDeprecationWarnings<T>(fn: () => T): T {
  const origError = console.error;
  console.error = (msg?: unknown, ...args: unknown[]) => {
    if (typeof msg === "string") {
      if (
        msg.includes("react-test-renderer is deprecated") ||
        msg.includes("not wrapped in act") ||
        msg.includes("inside a test was not wrapped in act") ||
        msg.includes("When testing, code that causes React state updates")
      ) {
        return;
      }
    }
    origError(msg, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = origError;
  }
}

const mockNodes: PositionedNode[] = [
  {
    id: "n-start",
    name: "Pipeline Initiator",
    step: 1,
    stepLabel: "Step 1: Init",
    status: "success",
    x: 0,
    y: 0,
    width: 150,
    height: 60,
  },
  {
    id: "n-process",
    name: "Async Worker",
    step: 2,
    stepLabel: "Step 2: Processing",
    status: "running",
    x: 200,
    y: 0,
    width: 150,
    height: 60,
  },
  {
    id: "n-gate",
    name: "Security Gate",
    step: 3,
    stepLabel: "Step 3: Verification",
    status: "error",
    x: 400,
    y: 0,
    width: 150,
    height: 60,
  },
];

const mockEdges: PositionedEdge[] = [
  {
    id: "e-1-2",
    source: "n-start",
    target: "n-process",
    path: "M 0 0 L 200 0",
    stepNumber: 1,
  },
  {
    id: "e-2-3",
    source: "n-process",
    target: "n-gate",
    path: "M 200 0 L 400 0",
    stepNumber: 2,
  },
];

const mockDataset: GraphDataset = {
  id: "hud-test-dataset",
  title: "Multi-Phase Execution Graph",
  nodes: mockNodes,
  edges: mockEdges,
};

describe("GraphPlaybackOverlay & Playback Highlights Tests", () => {
  const initialStoreState = useGraphStore.getState();

  beforeEach(() => {
    useGraphStore.setState(initialStoreState);
    useGraphStore.setState({ dataset: mockDataset, selectedStep: null });
  });

  afterEach(() => {
    useGraphStore.setState(initialStoreState);
  });

  describe("computePlaybackHighlights", () => {
    it("returns all nodes/edges as active when selectedStep is null (Overview) and cancels edge pulsing", () => {
      const highlights = computePlaybackHighlights(mockNodes, mockEdges, null);
      expect(highlights.activeNodeIds.size).toBe(3);
      expect(highlights.activeEdgeIds.size).toBe(2);
      expect(highlights.pulsingEdgeIds.size).toBe(0); // cancelled on overview
      expect(highlights.completedNodeIds.size).toBe(0);
      expect(highlights.pendingNodeIds.size).toBe(0);
    });

    it("classifies nodes as active, completed, or pending according to current step", () => {
      // At Step 2:
      // n-start (step 1) -> completed
      // n-process (step 2) -> active
      // n-gate (step 3) -> pending
      const highlights = computePlaybackHighlights(mockNodes, mockEdges, 2, true);
      expect(highlights.activeNodeIds.has("n-process")).toBe(true);
      expect(highlights.activeNodeIds.has("n-start")).toBe(false);
      expect(highlights.completedNodeIds.has("n-start")).toBe(true);
      expect(highlights.pendingNodeIds.has("n-gate")).toBe(true);

      // Edge e-2-3 has stepNumber: 2 -> active and pulsing
      expect(highlights.activeEdgeIds.has("e-2-3")).toBe(true);
      expect(highlights.pulsingEdgeIds.has("e-2-3")).toBe(true);
    });

    it("cancels edge pulsing when isPulsingActive is false (e.g. paused / stationary)", () => {
      const pausedHighlights = computePlaybackHighlights(mockNodes, mockEdges, 2, false);
      expect(pausedHighlights.activeNodeIds.has("n-process")).toBe(true);
      expect(pausedHighlights.activeEdgeIds.has("e-2-3")).toBe(true);
      expect(pausedHighlights.pulsingEdgeIds.size).toBe(0); // Cancelled when pulsing is inactive
    });
  });

  describe("GraphPlaybackOverlay Component", () => {
    it("returns null if dataset has no steps", () => {
      let renderer: ReactTestRenderer | null = null;
      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(<GraphPlaybackOverlay datasetOverride={null} />);
        });
      });
      expect((renderer as ReactTestRenderer | null)?.toJSON()).toBeNull();
    });

    it("renders HUD overlay in expanded mode by default", () => {
      let renderer: ReactTestRenderer | null = null;
      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(<GraphPlaybackOverlay datasetOverride={mockDataset} />);
        });
      });

      const root = renderer!.root;
      const hud = root.findByProps({ "aria-label": "Time-Travel Playback HUD" });
      expect(hud).toBeDefined();

      const titleText = root.findByProps({ children: "All Steps Overview" });
      expect(titleText).toBeDefined();
    });

    it("can collapse to compact mode and re-expand", () => {
      let renderer: ReactTestRenderer | null = null;
      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(
            <GraphPlaybackOverlay datasetOverride={mockDataset} defaultExpanded={true} />,
          );
        });
      });

      const root = renderer!.root;

      // Click collapse button
      const collapseBtn = root.findByProps({ "aria-label": "Collapse HUD" });
      act(() => {
        collapseBtn.props.onClick();
      });

      // Check compact mode is rendered
      const expandBtn = root.findByProps({ "aria-label": "Expand Playback HUD" });
      expect(expandBtn).toBeDefined();

      // Re-expand
      act(() => {
        expandBtn.props.onClick();
      });
      expect(root.findByProps({ "aria-label": "Collapse HUD" })).toBeDefined();
    });

    it("handles Step Forward, Backward, and Speed Cycling in HUD", () => {
      let renderer: ReactTestRenderer | null = null;
      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(<GraphPlaybackOverlay datasetOverride={mockDataset} />);
        });
      });

      const root = renderer!.root;

      // Step Forward (starts at step 1)
      const forwardBtn = root.findByProps({ "aria-label": "Step Forward" });
      act(() => {
        forwardBtn.props.onClick();
      });
      expect(useGraphStore.getState().selectedStep).toBe(1);

      // Step Forward again (step 2)
      act(() => {
        forwardBtn.props.onClick();
      });
      expect(useGraphStore.getState().selectedStep).toBe(2);

      // Step Backward (step 1)
      const backBtn = root.findByProps({ "aria-label": "Step Backward" });
      act(() => {
        backBtn.props.onClick();
      });
      expect(useGraphStore.getState().selectedStep).toBe(1);

      // Speed cycle (1x -> 2x)
      const speedBtn = root.findByProps({ "aria-label": "Playback Speed: 1x" });
      act(() => {
        speedBtn.props.onClick();
      });
      expect(root.findByProps({ "aria-label": "Playback Speed: 2x" })).toBeDefined();
    });

    it("renders active node buttons when a step is selected and responds to clicks", () => {
      let selectedNodeId: string | null = null;
      let renderer: ReactTestRenderer | null = null;

      useGraphStore.setState({ selectedStep: 2 });

      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(
            <GraphPlaybackOverlay
              datasetOverride={mockDataset}
              onSelectNode={(id) => {
                selectedNodeId = id;
              }}
            />,
          );
        });
      });

      const root = renderer!.root;
      const nodeBtn = root.findByProps({ title: "Center on Async Worker" });
      expect(nodeBtn).toBeDefined();

      act(() => {
        nodeBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(selectedNodeId).toBe("n-process");
    });
  });
});
