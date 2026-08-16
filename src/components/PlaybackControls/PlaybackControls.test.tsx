import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  calculateStepProgress,
  extractPlaybackSteps,
  getActiveStepEdges,
  getActiveStepNodes,
  getNextStep,
  getPreviousStep,
  getStepStatusBreakdown,
  isEdgeActiveInStep,
  isNodeActiveInStep,
  PlaybackControls,
  SPEED_OPTIONS,
  type PlaybackStepInfo,
} from "./index";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphDataset } from "../../types/graphData";

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

const mockDataset: GraphDataset = {
  id: "test-execution-graph",
  title: "Execution Trajectory: Multi-Agent Compiler Pipeline",
  nodes: [
    {
      id: "node-1",
      name: "Orchestrator Leased",
      step: 1,
      stepLabel: "Step 1: Orchestration Lease",
      status: "success",
      kind: "orchestrator",
      badges: [{ label: "Orchestrator", variant: "success" }],
    },
    {
      id: "node-2",
      name: "Feature Implementation",
      step: 2,
      stepLabel: "Step 2: Core Implementation",
      status: "running",
      kind: "agent",
      badges: [{ label: "Implementer", variant: "info" }],
    },
    {
      id: "node-3",
      name: "Adversarial Gatekeeper",
      step: 3,
      stepLabel: "Step 3: Validation Gate",
      status: "error",
      kind: "gate",
      badges: [{ label: "Validator", variant: "error" }],
    },
    {
      id: "node-4",
      name: "Secondary Reviewer",
      step: 3,
      stepLabel: "Step 3: Validation Gate",
      status: "pending",
      kind: "critic",
    },
    {
      id: "node-5",
      name: "Final Deployment",
      step: 4,
      stepLabel: "Step 4: Production Release",
      status: "pending",
      kind: "terminal",
    },
  ],
  edges: [
    {
      id: "edge-1-2",
      source: "node-1",
      target: "node-2",
      stepNumber: 1,
      kind: "dispatch",
    },
    {
      id: "edge-2-3",
      source: "node-2",
      target: "node-3",
      stepNumber: 2,
      kind: "validation",
      traffic: {
        activeSteps: [2, 3],
      },
    },
    {
      id: "edge-3-4",
      source: "node-3",
      target: "node-4",
      stepNumber: 3,
      kind: "sequence",
      exchanges: [
        {
          id: "ex-1",
          step: 3,
          type: "rejection",
        },
      ],
    },
    {
      id: "edge-4-5",
      source: "node-4",
      target: "node-5",
      stepNumber: 4,
      kind: "signoff",
    },
  ],
};

describe("PlaybackControls Unit & Integration Tests", () => {
  const initialStoreState = useGraphStore.getState();

  beforeEach(() => {
    useGraphStore.setState(initialStoreState);
    useGraphStore.setState({ dataset: mockDataset, selectedStep: null });
  });

  afterEach(() => {
    useGraphStore.setState(initialStoreState);
  });

  describe("extractPlaybackSteps", () => {
    it("returns empty array for null or empty datasets", () => {
      expect(extractPlaybackSteps(null)).toEqual([]);
      expect(extractPlaybackSteps({ id: "empty", title: "Empty", nodes: [], edges: [] })).toEqual(
        [],
      );
    });

    it("extracts unique steps sorted in ascending order with node counts and labels", () => {
      const steps = extractPlaybackSteps(mockDataset);
      expect(steps.length).toBe(4);
      expect(steps[0].step).toBe(1);
      expect(steps[0].label).toBe("Step 1: Orchestration Lease");
      expect(steps[0].nodeCount).toBe(1);
      expect(steps[0].nodeIds).toEqual(["node-1"]);
      expect(steps[0].activeStatus).toBe("success");

      expect(steps[1].step).toBe(2);
      expect(steps[1].label).toBe("Step 2: Core Implementation");
      expect(steps[1].nodeCount).toBe(1);
      expect(steps[1].activeStatus).toBe("running");

      expect(steps[2].step).toBe(3);
      expect(steps[2].label).toBe("Step 3: Validation Gate");
      expect(steps[2].nodeCount).toBe(2);
      expect(steps[2].nodeIds).toEqual(["node-3", "node-4"]);
      expect(steps[2].activeStatus).toBe("error");

      expect(steps[3].step).toBe(4);
      expect(steps[3].label).toBe("Step 4: Production Release");
      expect(steps[3].nodeCount).toBe(1);
    });

    it("handles edge steps when edge has step not on any node", () => {
      const datasetWithEdgeStep: GraphDataset = {
        id: "edge-step-graph",
        title: "Edge Step Graph",
        nodes: [{ id: "n1", name: "Node 1", step: 1 }],
        edges: [
          {
            id: "e1",
            source: "n1",
            target: "n1",
            stepNumber: 99,
            container: { stepBadge: "Step 99: Final Edge" },
          },
        ],
      };
      const steps = extractPlaybackSteps(datasetWithEdgeStep);
      expect(steps.length).toBe(2);
      expect(steps[0].step).toBe(1);
      expect(steps[1].step).toBe(99);
      expect(steps[1].label).toBe("Step 99: Final Edge");
    });
  });

  describe("getStepStatusBreakdown", () => {
    it("counts success, error, running, pending, skipped nodes correctly", () => {
      const breakdown = getStepStatusBreakdown(mockDataset.nodes);
      expect(breakdown.total).toBe(5);
      expect(breakdown.success).toBe(1);
      expect(breakdown.running).toBe(1);
      expect(breakdown.error).toBe(1);
      expect(breakdown.pending).toBe(2);
      expect(breakdown.skipped).toBe(0);
    });

    it("handles skipped and badge error nodes correctly", () => {
      const testNodes = [
        { id: "a", name: "A", status: "skipped" as const },
        { id: "b", name: "B", badges: [{ label: "fail", variant: "error" as const }] },
        { id: "c", name: "C", metadata: { status: "completed" } },
      ];
      const breakdown = getStepStatusBreakdown(testNodes);
      expect(breakdown.skipped).toBe(1);
      expect(breakdown.error).toBe(1);
      expect(breakdown.success).toBe(1);
    });
  });

  describe("getActiveStepNodes & isNodeActiveInStep", () => {
    it("returns all nodes when step is null", () => {
      const active = getActiveStepNodes(mockDataset.nodes, null);
      expect(active.length).toBe(5);
    });

    it("returns only nodes matching the specific step number", () => {
      const step3Nodes = getActiveStepNodes(mockDataset.nodes, 3);
      expect(step3Nodes.length).toBe(2);
      expect(step3Nodes.map((n) => n.id)).toEqual(["node-3", "node-4"]);

      expect(isNodeActiveInStep(mockDataset.nodes[0], 1)).toBe(true);
      expect(isNodeActiveInStep(mockDataset.nodes[0], 2)).toBe(false);
      expect(isNodeActiveInStep(mockDataset.nodes[0], null)).toBe(true);
    });
  });

  describe("getActiveStepEdges & isEdgeActiveInStep", () => {
    it("returns all edges when step is null", () => {
      const active = getActiveStepEdges(mockDataset.edges, null);
      expect(active.length).toBe(4);
    });

    it("matches edges by stepNumber, traffic.activeSteps, or exchanges[].step", () => {
      const step1Edges = getActiveStepEdges(mockDataset.edges, 1);
      expect(step1Edges.map((e) => e.id)).toEqual(["edge-1-2"]);

      const step2Edges = getActiveStepEdges(mockDataset.edges, 2);
      expect(step2Edges.map((e) => e.id)).toEqual(["edge-2-3"]);

      const step3Edges = getActiveStepEdges(mockDataset.edges, 3);
      // edge-2-3 (has activeSteps: [2, 3]) and edge-3-4 (stepNumber: 3, exchange step: 3)
      expect(step3Edges.map((e) => e.id)).toContain("edge-2-3");
      expect(step3Edges.map((e) => e.id)).toContain("edge-3-4");

      expect(isEdgeActiveInStep(mockDataset.edges[0], 1)).toBe(true);
      expect(isEdgeActiveInStep(mockDataset.edges[0], 4)).toBe(false);
      expect(isEdgeActiveInStep(mockDataset.edges[0], null)).toBe(true);
    });
  });

  describe("calculateStepProgress", () => {
    const steps: PlaybackStepInfo[] = extractPlaybackSteps(mockDataset);

    it("returns 100% when step is null or overview", () => {
      expect(calculateStepProgress(null, steps)).toBe(100);
    });

    it("computes proportional percentage across discrete steps", () => {
      expect(calculateStepProgress(1, steps)).toBe(0);
      expect(calculateStepProgress(2, steps)).toBe(33);
      expect(calculateStepProgress(3, steps)).toBe(67);
      expect(calculateStepProgress(4, steps)).toBe(100);
    });

    it("handles single-step dataset safely", () => {
      const singleStep: PlaybackStepInfo[] = [
        {
          step: 1,
          label: "Only Step",
          nodeCount: 1,
          nodeIds: ["n1"],
          statusBreakdown: { success: 1, error: 0, running: 0, pending: 0, skipped: 0, total: 1 },
          activeStatus: "success",
        },
      ];
      expect(calculateStepProgress(1, singleStep)).toBe(100);
    });
  });

  describe("getNextStep & getPreviousStep Edge Cases", () => {
    const steps = extractPlaybackSteps(mockDataset);

    it("advances sequentially from step 1 to N", () => {
      expect(getNextStep(null, steps)).toBe(1);
      expect(getNextStep(1, steps)).toBe(2);
      expect(getNextStep(2, steps)).toBe(3);
      expect(getNextStep(3, steps)).toBe(4);
      expect(getNextStep(4, steps, false)).toBeNull();
      expect(getNextStep(4, steps, true)).toBe(1); // loop mode
    });

    it("rewinds sequentially from step N to 1", () => {
      expect(getPreviousStep(null, steps)).toBe(4);
      expect(getPreviousStep(4, steps)).toBe(3);
      expect(getPreviousStep(3, steps)).toBe(2);
      expect(getPreviousStep(2, steps)).toBe(1);
      expect(getPreviousStep(1, steps)).toBe(1); // stops at beginning
    });

    it("handles non-contiguous steps safely (e.g. 10, 50, 100)", () => {
      const nonContiguous: PlaybackStepInfo[] = [
        {
          step: 10,
          label: "Step 10",
          nodeCount: 1,
          nodeIds: ["n1"],
          statusBreakdown: { success: 1, error: 0, running: 0, pending: 0, skipped: 0, total: 1 },
          activeStatus: "success",
        },
        {
          step: 50,
          label: "Step 50",
          nodeCount: 1,
          nodeIds: ["n2"],
          statusBreakdown: { success: 1, error: 0, running: 0, pending: 0, skipped: 0, total: 1 },
          activeStatus: "success",
        },
        {
          step: 100,
          label: "Step 100",
          nodeCount: 1,
          nodeIds: ["n3"],
          statusBreakdown: { success: 1, error: 0, running: 0, pending: 0, skipped: 0, total: 1 },
          activeStatus: "success",
        },
      ];

      expect(getNextStep(10, nonContiguous)).toBe(50);
      expect(getNextStep(50, nonContiguous)).toBe(100);
      expect(getNextStep(100, nonContiguous, false)).toBeNull();
      expect(getNextStep(100, nonContiguous, true)).toBe(10);

      // Out-of-range recovery
      expect(getNextStep(5, nonContiguous)).toBe(10);
      expect(getNextStep(30, nonContiguous)).toBe(50);
      expect(getPreviousStep(200, nonContiguous)).toBe(100);
      expect(getPreviousStep(70, nonContiguous)).toBe(50);
      expect(getPreviousStep(5, nonContiguous)).toBe(10);
    });

    it("handles empty step lists safely", () => {
      expect(getNextStep(null, [])).toBeNull();
      expect(getPreviousStep(null, [])).toBeNull();
    });
  });

  describe("PlaybackControls Component Rendering & User Interactions", () => {
    it("returns null when dataset has no steps", () => {
      let renderer: ReactTestRenderer | null = null;
      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(<PlaybackControls datasetOverride={null} />);
        });
      });
      expect((renderer as ReactTestRenderer | null)?.toJSON()).toBeNull();
    });

    it("renders full scrubber toolbar with speed selector options 0.5x, 1x, 2x, 5x", () => {
      let renderer: ReactTestRenderer | null = null;
      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(<PlaybackControls datasetOverride={mockDataset} />);
        });
      });

      const root = renderer!.root;
      expect(root.findByProps({ "aria-label": "Time-Travel Execution Scrubber" })).toBeDefined();

      // Check speed pills for 0.5x, 1x, 2x, 5x
      const speedPills = root.findAllByProps({ role: "radio" });
      expect(speedPills.length).toBe(4);
      expect(speedPills[0].props.children).toBe("0.5x");
      expect(speedPills[1].props.children).toBe("1x");
      expect(speedPills[2].props.children).toBe("2x");
      expect(speedPills[3].props.children).toBe("5x");

      // Verify SPEED_OPTIONS constant
      expect(SPEED_OPTIONS).toEqual([0.5, 1, 2, 5]);
    });

    it("handles Step Forward, Step Backward, Jump Start, Jump End", () => {
      let stepChanged: number | null = null;
      let renderer: ReactTestRenderer | null = null;

      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(
            <PlaybackControls
              datasetOverride={mockDataset}
              onStepChange={(s) => {
                stepChanged = s;
              }}
            />,
          );
        });
      });

      const root = renderer!.root;

      // Jump to start (Step 1)
      const btnJumpStart = root.findByProps({ "aria-label": "Jump to Start" });
      act(() => {
        btnJumpStart.props.onClick();
      });
      expect(useGraphStore.getState().selectedStep).toBe(1);
      expect(stepChanged).toBe(1);

      // Step Forward (Step 2)
      const btnNext = root.findByProps({ "aria-label": "Next Step" });
      act(() => {
        btnNext.props.onClick();
      });
      expect(useGraphStore.getState().selectedStep).toBe(2);
      expect(stepChanged).toBe(2);

      // Step Backward (Step 1)
      const btnPrev = root.findByProps({ "aria-label": "Previous Step" });
      act(() => {
        btnPrev.props.onClick();
      });
      expect(useGraphStore.getState().selectedStep).toBe(1);
      expect(stepChanged).toBe(1);

      // Jump to End (Step 4)
      const btnJumpEnd = root.findByProps({ "aria-label": "Jump to End" });
      act(() => {
        btnJumpEnd.props.onClick();
      });
      expect(useGraphStore.getState().selectedStep).toBe(4);
      expect(stepChanged).toBe(4);
    });

    it("handles Play / Pause toggle and Playback callbacks", () => {
      let playState: boolean | undefined;
      let renderer: ReactTestRenderer | null = null;

      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(
            <PlaybackControls
              datasetOverride={mockDataset}
              onPlayStateChange={(p) => {
                playState = p;
              }}
            />,
          );
        });
      });

      const root = renderer!.root;
      const btnPlayPause = root.findByProps({ "aria-label": "Start Playback" });

      // Start playback
      act(() => {
        btnPlayPause.props.onClick();
      });
      expect(playState).toBe(true);

      // Pause playback
      const btnPause = root.findByProps({ "aria-label": "Pause Playback" });
      act(() => {
        btnPause.props.onClick();
      });
      expect(playState).toBe(false);
    });

    it("handles direct speed selection (0.5x, 1x, 2x, 5x)", () => {
      let currentSpeed: number | null = null;
      let renderer: ReactTestRenderer | null = null;

      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(
            <PlaybackControls
              datasetOverride={mockDataset}
              onSpeedChange={(spd) => {
                currentSpeed = spd;
              }}
            />,
          );
        });
      });

      const root = renderer!.root;
      const pill5x = root.findByProps({ "aria-label": "5x Speed" });
      act(() => {
        pill5x.props.onClick();
      });
      expect(currentSpeed).toBe(5);

      const pillHalfX = root.findByProps({ "aria-label": "0.5x Speed" });
      act(() => {
        pillHalfX.props.onClick();
      });
      expect(currentSpeed).toBe(0.5);
    });

    it("handles clicking step pills and all-steps overview button", () => {
      let renderer: ReactTestRenderer | null = null;

      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(<PlaybackControls datasetOverride={mockDataset} />);
        });
      });

      const root = renderer!.root;
      const step3Pill = root.findByProps({ "aria-label": "Step 3: Step 3: Validation Gate" });
      act(() => {
        step3Pill.props.onClick();
      });
      expect(useGraphStore.getState().selectedStep).toBe(3);

      const allStepsPill = root.findByProps({ "aria-label": "Show All Steps Overview" });
      act(() => {
        allStepsPill.props.onClick();
      });
      expect(useGraphStore.getState().selectedStep).toBeNull();
    });

    it("handles timeline range input slider change and clamp protection", () => {
      let renderer: ReactTestRenderer | null = null;

      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(<PlaybackControls datasetOverride={mockDataset} />);
        });
      });

      const root = renderer!.root;
      const slider = root.findByProps({ "aria-label": "Timeline Scrubber" });

      // Seek to step index 1 (Step 2)
      act(() => {
        slider.props.onChange({ target: { value: "1" } });
      });
      expect(useGraphStore.getState().selectedStep).toBe(2);

      // Seek to out-of-range high index (clamps to Step 4)
      act(() => {
        slider.props.onChange({ target: { value: "99" } });
      });
      expect(useGraphStore.getState().selectedStep).toBe(4);

      // Seek to -1 (All Steps)
      act(() => {
        slider.props.onChange({ target: { value: "-1" } });
      });
      expect(useGraphStore.getState().selectedStep).toBeNull();
    });

    it("handles Loop mode toggling", () => {
      let renderer: ReactTestRenderer | null = null;

      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(<PlaybackControls datasetOverride={mockDataset} />);
        });
      });

      const root = renderer!.root;
      const btnLoop = root.findByProps({ "aria-label": "Enable Loop" });
      expect(btnLoop.props["aria-pressed"]).toBe(false);

      act(() => {
        btnLoop.props.onClick();
      });

      const btnLoopActive = root.findByProps({ "aria-label": "Disable Loop" });
      expect(btnLoopActive.props["aria-pressed"]).toBe(true);
    });

    it("handles Keyboard shortcuts (Space, P, ArrowRight, K, ArrowLeft, J, Home, End, Escape, 1..4, L)", () => {
      let renderer: ReactTestRenderer | null = null;

      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(<PlaybackControls datasetOverride={mockDataset} />);
        });
      });

      const root = renderer!.root;
      const wrapper = root.findByProps({ role: "region" });

      // Space: Toggle Play
      act(() => {
        wrapper.props.onKeyDown({ key: " ", code: "Space", preventDefault: () => {} });
      });
      // P key: Pause
      act(() => {
        wrapper.props.onKeyDown({ key: "p", preventDefault: () => {} });
      });

      // ArrowRight: Step Forward
      act(() => {
        wrapper.props.onKeyDown({ key: "ArrowRight", preventDefault: () => {} });
      });
      expect(useGraphStore.getState().selectedStep).toBe(2);

      // K key: Step Forward
      act(() => {
        wrapper.props.onKeyDown({ key: "k", preventDefault: () => {} });
      });
      expect(useGraphStore.getState().selectedStep).toBe(3);

      // ArrowLeft: Step Backward
      act(() => {
        wrapper.props.onKeyDown({ key: "ArrowLeft", preventDefault: () => {} });
      });
      expect(useGraphStore.getState().selectedStep).toBe(2);

      // J key: Step Backward
      act(() => {
        wrapper.props.onKeyDown({ key: "j", preventDefault: () => {} });
      });
      expect(useGraphStore.getState().selectedStep).toBe(1);

      // End: Jump to End
      act(() => {
        wrapper.props.onKeyDown({ key: "End", preventDefault: () => {} });
      });
      expect(useGraphStore.getState().selectedStep).toBe(4);

      // Home: Jump to Start
      act(() => {
        wrapper.props.onKeyDown({ key: "Home", preventDefault: () => {} });
      });
      expect(useGraphStore.getState().selectedStep).toBe(1);

      // Escape: Reset to All
      act(() => {
        wrapper.props.onKeyDown({ key: "Escape", preventDefault: () => {} });
      });
      expect(useGraphStore.getState().selectedStep).toBeNull();

      // Number keys 1..4 for speed selection
      act(() => {
        wrapper.props.onKeyDown({ key: "4", preventDefault: () => {} });
      });
      const speedPills = root.findAllByProps({ role: "radio" });
      expect(speedPills[3].props["aria-checked"]).toBe(true);

      // L key for loop toggle
      act(() => {
        wrapper.props.onKeyDown({ key: "l", preventDefault: () => {} });
      });
      expect(root.findByProps({ "aria-label": "Disable Loop" })).toBeDefined();
    });

    it("renders active step stats card with active node buttons", () => {
      let selectedNodeId: string | null = null;
      let renderer: ReactTestRenderer | null = null;

      // Set selected step to 3
      useGraphStore.setState({ selectedStep: 3 });

      silenceDeprecationWarnings(() => {
        act(() => {
          renderer = create(
            <PlaybackControls
              datasetOverride={mockDataset}
              onSelectNode={(id) => {
                selectedNodeId = id;
              }}
            />,
          );
        });
      });

      const root = renderer!.root;
      const summaryText = root.findByProps({ title: "Step 3: Validation Gate" });
      expect(summaryText).toBeDefined();

      const activeNodeBtn = root.findByProps({ title: "Center on Adversarial Gatekeeper" });
      act(() => {
        activeNodeBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(selectedNodeId).toBe("node-3");
    });
  });
});
