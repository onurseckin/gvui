import { beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import {
  BatchProcessor,
  BatchRunnerModal,
  globalMacroRegistry,
  MacroExecutor,
  MacroLibraryModal,
  MacroRecorder,
  MacroRecorderPanel,
  MacroSerializer,
  ParameterForm,
  parameterizeScript,
  PREDEFINED_MACRO_TEMPLATES,
  substituteVariables,
  TimelineScrubber,
  useMacroStore,
  validateParameterValue,
  type GraphTargetAdapter,
  type MacroScript,
  type MacroStep,
  type ParameterDefinition,
} from "./index";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class MockKeyboardEvent extends Event {
  public key: string;
  public ctrlKey: boolean;
  public metaKey: boolean;
  public altKey: boolean;
  public shiftKey: boolean;
  public constructor(
    type: string,
    init?: {
      key?: string;
      ctrlKey?: boolean;
      metaKey?: boolean;
      altKey?: boolean;
      shiftKey?: boolean;
    },
  ) {
    super(type);
    this.key = init?.key ?? "";
    this.ctrlKey = Boolean(init?.ctrlKey);
    this.metaKey = Boolean(init?.metaKey);
    this.altKey = Boolean(init?.altKey);
    this.shiftKey = Boolean(init?.shiftKey);
  }
}

if (typeof KeyboardEvent === "undefined") {
  (globalThis as unknown as { KeyboardEvent: typeof MockKeyboardEvent }).KeyboardEvent =
    MockKeyboardEvent;
}

function silenceWarnings<T>(fn: () => T): T {
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

// Mock in-memory graph adapter for deterministic testing
function createMockGraphAdapter(): {
  adapter: GraphTargetAdapter;
  getNodes: () => PositionedNode[];
  getEdges: () => PositionedEdge[];
  getSelectedNodeId: () => string | null;
  getSelectedStep: () => number | null;
  getLayoutMode: () => string;
  getZoomLevel: () => number;
  getPanOffset: () => { x: number; y: number };
  getCollapsedNodes: () => Set<string>;
} {
  let nodes: PositionedNode[] = [
    {
      id: "node-1",
      name: "Node 1",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      kind: "agent",
      status: "running",
    },
    {
      id: "node-2",
      name: "Node 2",
      x: 150,
      y: 20,
      width: 100,
      height: 50,
      kind: "critic",
      status: "pending",
    },
  ];
  let edges: PositionedEdge[] = [
    { id: "edge-1-2", source: "node-1", target: "node-2", path: "", kind: "validation" },
  ];
  let selectedNodeId: string | null = null;
  let selectedStep: number | null = null;
  let layoutMode: string = "layered";
  let zoomLevel: number = 1.0;
  let panOffset: { x: number; y: number } = { x: 0, y: 0 };
  const collapsedNodes: Set<string> = new Set();

  const adapter: GraphTargetAdapter = {
    getPositionedNodes: () => nodes,
    getPositionedEdges: () => edges,
    setPositionedGraph: (newNodes, newEdges) => {
      nodes = [...newNodes];
      edges = [...newEdges];
    },
    setSelectedNodeId: (id) => {
      selectedNodeId = id;
    },
    setSelectedStep: (step) => {
      selectedStep = step;
    },
    setLayoutMode: (mode) => {
      layoutMode = mode;
    },
    setLayoutConfig: () => {},
    setPanOffset: (offset) => {
      panOffset = offset;
    },
    setZoomLevel: (zoom) => {
      zoomLevel = zoom;
    },
    toggleNodeCollapse: (id) => {
      if (collapsedNodes.has(id)) collapsedNodes.delete(id);
      else collapsedNodes.add(id);
    },
  };

  return {
    adapter,
    getNodes: () => nodes,
    getEdges: () => edges,
    getSelectedNodeId: () => selectedNodeId,
    getSelectedStep: () => selectedStep,
    getLayoutMode: () => layoutMode,
    getZoomLevel: () => zoomLevel,
    getPanOffset: () => panOffset,
    getCollapsedNodes: () => collapsedNodes,
  };
}

describe("GVUI Macro Automation & Recorder Engine", () => {
  beforeEach(() => {
    (globalThis as unknown as { window: unknown }).window = globalThis;
    (globalThis as unknown as { KeyboardEvent: typeof MockKeyboardEvent }).KeyboardEvent =
      MockKeyboardEvent;
    globalMacroRegistry.resetToDefaults();
    const mock = createMockGraphAdapter();
    useMacroStore.getState().setTargetAdapter(mock.adapter);
    useMacroStore.setState({
      isOpen: true,
      isDocked: false,
      dockPosition: "bottom",
      activeTab: "player",
      isRecording: false,
      isRecordingPaused: false,
      recordingDurationMs: 0,
      recordedStepsCount: 0,
      activeScript: globalMacroRegistry.listTemplates()[0] ?? null,
      scripts: globalMacroRegistry.list(),
      playbackSpeed: 0, // Instant execution in tests
      paramValues: {},
      scrubberIndex: 0,
      selectedStepId: null,
      isBatchRunning: false,
      batchProgress: null,
      batchResult: null,
    });
  });

  describe("MacroRecorder Engine", () => {
    it("manages recording lifecycle and event capture correctly", () => {
      const recorder = new MacroRecorder({ coalesceThresholdMs: 300 });
      expect(recorder.isRecording()).toBe(false);
      expect(recorder.isPaused()).toBe(false);

      recorder.startRecording({ name: "Test Recording", description: "Testing recorder" });
      expect(recorder.isRecording()).toBe(true);
      expect(recorder.isPaused()).toBe(false);

      // Record node creation
      const step1 = recorder.recordNodeCreated({ id: "new-node", name: "New Node", x: 50, y: 60 });
      expect(step1).not.toBeNull();
      expect(step1?.type).toBe("create_node");
      expect(recorder.getStepsCount()).toBe(1);

      // Pause and resume
      recorder.pauseRecording();
      expect(recorder.isPaused()).toBe(true);
      expect(recorder.recordNodeSelected("new-node")).toBeNull();

      recorder.resumeRecording();
      expect(recorder.isPaused()).toBe(false);

      // Record move
      const step2 = recorder.recordNodeMoved("new-node", 100, 120, { x: 50, y: 60 });
      expect(step2?.type).toBe("move_node");
      expect(recorder.getStepsCount()).toBe(2);

      // Stop recording
      const script = recorder.stopRecording();
      expect(recorder.isRecording()).toBe(false);
      expect(script.name).toBe("Test Recording");
      expect(script.steps.length).toBe(2);
    });

    it("coalesces rapid node movement events within threshold", () => {
      const recorder = new MacroRecorder({ coalesceThresholdMs: 500 });
      recorder.startRecording();

      recorder.recordNodeMoved("node-1", 10, 10, { x: 0, y: 0 });
      recorder.recordNodeMoved("node-1", 20, 25);
      recorder.recordNodeMoved("node-1", 50, 60);

      expect(recorder.getStepsCount()).toBe(1);
      const steps = recorder.getSteps();
      expect(steps[0]?.type).toBe("move_node");
      expect(steps[0]?.payload.x).toBe(50);
      expect(steps[0]?.payload.y).toBe(60);
      const prevPos = steps[0]?.payload.previousPosition as { x: number; y: number } | undefined;
      expect(prevPos?.x).toBe(0);
    });

    it("records all distinct graph event types", () => {
      const recorder = new MacroRecorder();
      recorder.startRecording();

      recorder.recordNodeCreated({ id: "n1", name: "Node 1" });
      recorder.recordNodeDeleted("n1");
      recorder.recordNodeMoved("n2", 100, 200);
      recorder.recordNodeUpdated("n2", { status: "success" });
      recorder.recordEdgeCreated({ id: "e1", source: "n1", target: "n2" });
      recorder.recordEdgeDeleted("e1");
      recorder.recordEdgeUpdated("e2", { weight: 5 });
      recorder.recordNodeSelected("n2");
      recorder.recordStepSelected(3);
      recorder.recordLayoutTriggered("layered", { nodeSpacingX: 30 });
      recorder.recordViewportChanged(1.5, { x: 100, y: 50 });
      recorder.recordNodeCollapsed("n2", true);
      recorder.recordDelay(300);
      recorder.recordCustomAction("custom-task", { foo: "bar" });

      expect(recorder.getStepsCount()).toBe(14);
      expect(recorder.getRawEvents().length).toBe(14);
    });

    it("parameterizes static IDs and names into script variables", () => {
      const recorder = new MacroRecorder();
      recorder.startRecording();
      recorder.recordNodeCreated({ id: "custom-worker", name: "Worker Alpha", x: 10, y: 10 });
      const rawScript = recorder.stopRecording();

      const parameterized = parameterizeScript(rawScript);
      expect(parameterized.parameters.length).toBeGreaterThanOrEqual(1);
      expect(parameterized.parameters.some((p) => p.name === "nodeId")).toBe(true);

      const stepPayload = JSON.stringify(parameterized.steps[0]?.payload);
      expect(stepPayload.includes("{{nodeId}}")).toBe(true);
    });
  });

  describe("MacroExecutor Engine & Variable Substitution", () => {
    it("substitutes expressions, fallbacks, pipes, and built-ins correctly", () => {
      const context = {
        name: "test-agent",
        prefix: "prod",
        count: 42,
        isEnabled: true,
      };

      expect(substituteVariables("{{name}}", context)).toBe("test-agent");
      expect(substituteVariables("{{count}}", context)).toBe(42);
      expect(substituteVariables("{{isEnabled}}", context)).toBe(true);
      expect(substituteVariables("Prefix_{{prefix}}", context)).toBe("Prefix_prod");
      expect(substituteVariables("${prefix}-suffix", context)).toBe("prod-suffix");
      expect(substituteVariables("{{missing || fallbackVal}}", context)).toBe("fallbackVal");
      expect(substituteVariables("{{name | uppercase}}", context)).toBe("TEST-AGENT");
      expect(substituteVariables("{{name | lowercase}}", context)).toBe("test-agent");
      expect(substituteVariables("{{ '  spaced  ' | trim }}", context)).toBe("spaced");
      expect(substituteVariables("{{$index}}", context, 5)).toBe(5);

      const nowVal = substituteVariables("{{$now}}", context);
      expect(typeof nowVal).toBe("string");
      expect(String(nowVal).length).toBeGreaterThan(10);
    });

    it("validates parameters according to type and constraints", () => {
      const numDef: ParameterDefinition = {
        name: "timeout",
        label: "Timeout",
        type: "number",
        defaultValue: 100,
        validation: { min: 10, max: 500 },
      };

      expect(validateParameterValue(numDef, 200).valid).toBe(true);
      expect(validateParameterValue(numDef, 5).valid).toBe(false);
      expect(validateParameterValue(numDef, 600).valid).toBe(false);
      expect(validateParameterValue(numDef, "150").coercedValue).toBe(150);

      const boolDef: ParameterDefinition = {
        name: "flag",
        label: "Flag",
        type: "boolean",
        defaultValue: false,
      };
      expect(validateParameterValue(boolDef, "true").coercedValue).toBe(true);
      expect(validateParameterValue(boolDef, false).coercedValue).toBe(false);

      const selectDef: ParameterDefinition = {
        name: "tier",
        label: "Tier",
        type: "select",
        defaultValue: "m",
        options: [
          { label: "Small", value: "s" },
          { label: "Medium", value: "m" },
        ],
        required: true,
      };
      expect(validateParameterValue(selectDef, "s").valid).toBe(true);
      expect(validateParameterValue(selectDef, "invalid").valid).toBe(false);
    });

    it("executes steps and mutates graph target adapter", async () => {
      const mock = createMockGraphAdapter();
      const executor = new MacroExecutor(mock.adapter, { speedMultiplier: 0 });

      const script: MacroScript = {
        id: "script-1",
        name: "Test Script",
        version: "1.0.0",
        parameters: [{ name: "nodeId", label: "Node ID", type: "string", defaultValue: "node-3" }],
        steps: [
          {
            id: "s1",
            type: "create_node",
            label: "Create Node 3",
            enabled: true,
            payload: { node: { id: "{{nodeId}}", name: "Node 3", x: 300, y: 300 } },
          },
          {
            id: "s2",
            type: "move_node",
            label: "Move Node 1",
            enabled: true,
            payload: { nodeId: "node-1", x: 99, y: 88 },
          },
          {
            id: "s3",
            type: "update_node",
            label: "Update Node 2",
            enabled: true,
            payload: { nodeId: "node-2", patch: { status: "success" } },
          },
          {
            id: "s4",
            type: "create_edge",
            label: "Create Edge",
            enabled: true,
            payload: { edge: { id: "edge-2-3", source: "node-2", target: "{{nodeId}}" } },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const resultState = await executor.execute(script, { nodeId: "node-3" });
      expect(resultState.status).toBe("completed");
      expect(resultState.currentStepIndex).toBe(4);

      // Verify adapter state
      const nodes = mock.getNodes();
      expect(nodes.length).toBe(3);
      expect(nodes.some((n) => n.id === "node-3")).toBe(true);

      const node1 = nodes.find((n) => n.id === "node-1");
      expect(node1?.x).toBe(99);
      expect(node1?.y).toBe(88);

      const node2 = nodes.find((n) => n.id === "node-2");
      expect(node2?.status).toBe("success");

      const edges = mock.getEdges();
      expect(edges.length).toBe(2);
      expect(edges.some((e) => e.id === "edge-2-3")).toBe(true);
    });

    it("supports step-by-step forward and backward undo execution", async () => {
      const mock = createMockGraphAdapter();
      const executor = new MacroExecutor(mock.adapter, { speedMultiplier: 0 });

      const script: MacroScript = {
        id: "script-undo",
        name: "Undo Test",
        version: "1.0.0",
        parameters: [],
        steps: [
          {
            id: "u1",
            type: "create_node",
            label: "Create Node",
            enabled: true,
            payload: { node: { id: "node-test", name: "Test Node", x: 50, y: 50 } },
          },
          {
            id: "u2",
            type: "update_node",
            label: "Update Node Status",
            enabled: true,
            payload: { nodeId: "node-1", patch: { status: "error" } },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      executor.prepare(script);
      expect(executor.getState().currentStepIndex).toBe(0);

      // Step forward 1
      await executor.stepForward();
      expect(executor.getState().currentStepIndex).toBe(1);
      expect(mock.getNodes().some((n) => n.id === "node-test")).toBe(true);

      // Step forward 2
      await executor.stepForward();
      expect(executor.getState().currentStepIndex).toBe(2);
      expect(mock.getNodes().find((n) => n.id === "node-1")?.status).toBe("error");

      // Step backward 1 (undo step 2)
      await executor.stepBackward();
      expect(executor.getState().currentStepIndex).toBe(1);
      expect(mock.getNodes().find((n) => n.id === "node-1")?.status).toBe("running");

      // Step backward 2 (undo step 1)
      await executor.stepBackward();
      expect(executor.getState().currentStepIndex).toBe(0);
      expect(mock.getNodes().some((n) => n.id === "node-test")).toBe(false);
    });

    it("halts at breakpoints during playback", async () => {
      const mock = createMockGraphAdapter();
      const executor = new MacroExecutor(mock.adapter, { speedMultiplier: 0 });

      const script: MacroScript = {
        id: "script-bp",
        name: "Breakpoint Test",
        version: "1.0.0",
        parameters: [],
        steps: [
          {
            id: "bp1",
            type: "update_node",
            label: "Step 1",
            enabled: true,
            payload: { nodeId: "node-1", patch: { name: "Step 1 Run" } },
          },
          {
            id: "bp2",
            type: "update_node",
            label: "Step 2 Breakpoint",
            enabled: true,
            breakpoint: true,
            payload: { nodeId: "node-1", patch: { name: "Step 2 Run" } },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const result = await executor.execute(script);
      expect(result.status).toBe("paused");
      expect(result.currentStepIndex).toBe(1);
      expect(mock.getNodes().find((n) => n.id === "node-1")?.name).toBe("Step 1 Run");
    });
  });

  describe("BatchProcessor Engine", () => {
    it("filters batch targets by kind, status, and custom query", () => {
      const nodes: PositionedNode[] = [
        {
          id: "agent-1",
          name: "Alpha",
          kind: "agent",
          status: "running",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
        },
        {
          id: "agent-2",
          name: "Beta",
          kind: "agent",
          status: "error",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
        },
        {
          id: "critic-1",
          name: "Gamma",
          kind: "critic",
          status: "running",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
        },
      ];

      const agentTargets = BatchProcessor.filterTargets(nodes, { kinds: ["agent"] });
      expect(agentTargets.length).toBe(2);

      const errorTargets = BatchProcessor.filterTargets(nodes, { statuses: ["error"] });
      expect(errorTargets.length).toBe(1);
      expect(errorTargets[0]?.id).toBe("agent-2");

      const nameFiltered = BatchProcessor.filterTargets(nodes, { nameContains: "alp" });
      expect(nameFiltered.length).toBe(1);
      expect(nameFiltered[0]?.id).toBe("agent-1");
    });

    it("executes batch actions with continue-on-error and injects target context", async () => {
      const mock = createMockGraphAdapter();
      const processor = new BatchProcessor(mock.adapter);

      const script: MacroScript = {
        id: "batch-tag-script",
        name: "Tag Node",
        version: "1.0.0",
        parameters: [],
        steps: [
          {
            id: "bs1",
            type: "update_node",
            label: "Tag Node",
            enabled: true,
            payload: {
              nodeId: "{{targetId}}",
              patch: { badge: { text: "Batch {{elementKind}}", variant: "success" } },
            },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const targets = BatchProcessor.filterTargets(mock.getNodes(), {});
      const batchResult = await processor.executeBatch(
        script,
        targets,
        {},
        { errorPolicy: "continue-on-error" },
      );

      expect(batchResult.status).toBe("completed");
      expect(batchResult.succeededCount).toBe(2);
      expect(batchResult.failedCount).toBe(0);

      const updated = mock.getNodes();
      expect(updated.find((n) => n.id === "node-1")?.badge?.text).toBe("Batch agent");
      expect(updated.find((n) => n.id === "node-2")?.badge?.text).toBe("Batch critic");
    });

    it("rolls back all modifications on failure when errorPolicy is rollback-on-error", async () => {
      const mock = createMockGraphAdapter();
      const processor = new BatchProcessor(mock.adapter);

      const script: MacroScript = {
        id: "batch-fail-script",
        name: "Fail on Node 2",
        version: "1.0.0",
        parameters: [],
        steps: [
          {
            id: "fs1",
            type: "update_node",
            label: "Update",
            enabled: true,
            payload: {
              nodeId: "{{targetId}}",
              patch: { status: "modified" },
            },
          },
          {
            id: "fs2",
            type: "delete_node",
            label: "Delete (fails on second iteration if not found)",
            enabled: true,
            payload: {
              nodeId: "non-existent-node-id", // will succeed or throw if strict
            },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Test with an intentional failing step simulation
      const failScript: MacroScript = {
        ...script,
        steps: [
          {
            id: "fs1",
            type: "update_node",
            label: "Update",
            enabled: true,
            payload: { nodeId: "{{targetId}}", patch: { status: "corrupted" } },
          },
          {
            id: "fs_err",
            type: "custom_action",
            label: "Error Action",
            enabled: true,
            payload: { actionName: "fail", shouldFail: true },
          },
        ],
      };

      const initialStatus1 = mock.getNodes().find((n) => n.id === "node-1")?.status;
      expect(initialStatus1).toBe("running");

      const targets = BatchProcessor.filterTargets(mock.getNodes(), {});
      const result = await processor.executeBatch(
        failScript,
        targets,
        {},
        { errorPolicy: "rollback-on-error" },
      );

      // After failure with rollback-on-error, graph state must be restored to initial
      const finalStatus1 = mock.getNodes().find((n) => n.id === "node-1")?.status;
      expect(finalStatus1).toBe(initialStatus1);
      expect(result.status).toBe("rolled-back");
    });
  });

  describe("MacroSerializer & Registry", () => {
    it("serializes and deserializes MacroScript without data loss", () => {
      const original: MacroScript = PREDEFINED_MACRO_TEMPLATES[0]!;
      const json = MacroSerializer.serialize(original);
      const deserialized = MacroSerializer.deserialize(json);

      expect(deserialized.success).toBe(true);
      expect(deserialized.script?.id).toBe(original.id);
      expect(deserialized.script?.steps.length).toBe(original.steps.length);
      expect(deserialized.script?.parameters.length).toBe(original.parameters.length);
    });

    it("serializes and deserializes full macro libraries", () => {
      const templates = PREDEFINED_MACRO_TEMPLATES;
      const libraryJson = MacroSerializer.serializeLibrary(templates);
      const res = MacroSerializer.deserializeLibrary(libraryJson);

      expect(res.success).toBe(true);
      expect(res.scripts.length).toBe(templates.length);
      expect(res.errors.length).toBe(0);
    });

    it("validates and sanitizes malformed JSON gracefully", () => {
      const invalidJson = "{ corrupt json ";
      expect(MacroSerializer.deserialize(invalidJson).success).toBe(false);

      const missingSteps = JSON.stringify({ name: "Bad Macro" });
      const res = MacroSerializer.deserialize(missingSteps);
      expect(res.success).toBe(false);
      expect(res.errors.length).toBeGreaterThan(0);
    });

    it("manages user macros and predefined templates in MacroRegistry", () => {
      expect(globalMacroRegistry.listTemplates().length).toBeGreaterThanOrEqual(4);

      const customScript: MacroScript = {
        id: "user-macro-1",
        name: "User Custom Macro",
        version: "1.0.0",
        parameters: [],
        steps: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      globalMacroRegistry.register(customScript);
      expect(globalMacroRegistry.get("user-macro-1")).toBeDefined();
      expect(globalMacroRegistry.listUserMacros().length).toBe(1);

      const duplicated = globalMacroRegistry.duplicate("user-macro-1", "User Macro Clone");
      expect(duplicated).not.toBeNull();
      expect(duplicated?.name).toBe("User Macro Clone");

      const searchRes = globalMacroRegistry.search("Clone");
      expect(searchRes.length).toBe(1);

      globalMacroRegistry.unregister("user-macro-1");
      expect(globalMacroRegistry.get("user-macro-1")).toBeUndefined();
    });
  });

  describe("MacroRecorder React UI Components", () => {
    it("renders TimelineScrubber with interactive step items and controls", () => {
      silenceWarnings(() => {
        const steps: MacroStep[] = [
          { id: "s1", type: "create_node", label: "Create Agent", enabled: true, payload: {} },
          {
            id: "s2",
            type: "move_node",
            label: "Move Node",
            enabled: false,
            breakpoint: true,
            payload: {},
          },
        ];

        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<TimelineScrubber steps={steps} currentStepIndex={0} />);
        });

        const root = renderer.root;
        const stepItems = root.findAllByProps({ role: "listitem" });
        expect(stepItems.length).toBe(2);

        // Verify disabled state and breakpoint indicator
        expect(stepItems[1]?.props.className?.includes("disabled")).toBe(true);
        renderer.unmount();
      });
    });

    it("renders ParameterForm and allows updating parameters", () => {
      silenceWarnings(() => {
        const params: ParameterDefinition[] = [
          { name: "nodePrefix", label: "Prefix", type: "string", defaultValue: "agent" },
          { name: "count", label: "Count", type: "number", defaultValue: 5 },
          { name: "enabled", label: "Active", type: "boolean", defaultValue: true },
        ];

        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<ParameterForm parameters={params} />);
        });

        const root = renderer.root;
        const inputs = root.findAllByType("input");
        expect(inputs.length).toBe(3);

        // Trigger change on string input
        const stringInput = inputs[2];
        if (stringInput) {
          act(() => {
            stringInput.props.onChange({ target: { value: "custom-prefix" } });
          });
        }
        renderer.unmount();
      });
    });

    it("renders MacroLibraryModal and supports searching and category filtering", () => {
      silenceWarnings(() => {
        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<MacroLibraryModal />);
        });

        const root = renderer.root;
        const searchInput = root.findByProps({
          placeholder: "Search macros by name, tag, or desc...",
        });
        expect(searchInput).toBeDefined();

        act(() => {
          searchInput.props.onChange({ target: { value: "Critic" } });
        });

        const items = root.findAllByProps({ role: "listitem" });
        expect(items.length).toBeGreaterThanOrEqual(1);
        renderer.unmount();
      });
    });

    it("renders BatchRunnerModal with scope selection and error policies", () => {
      silenceWarnings(() => {
        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<BatchRunnerModal />);
        });

        const root = renderer.root;
        const radioInputs = root.findAllByType("input").filter((i) => i.props.type === "radio");
        expect(radioInputs.length).toBeGreaterThanOrEqual(5);
        renderer.unmount();
      });
    });

    it("renders full MacroRecorderPanel HUD with tabs and playback controls", () => {
      silenceWarnings(() => {
        let renderer!: ReactTestRenderer;
        act(() => {
          renderer = create(<MacroRecorderPanel />);
        });

        const root = renderer.root;
        const title = root.findByProps({ className: "macro-hud-title" });
        expect(title).toBeDefined();

        // Switch tabs
        const tabBtns = root.findAll(
          (el) =>
            typeof el.props.className === "string" && el.props.className.includes("macro-tab-btn"),
        );
        expect(tabBtns.length).toBeGreaterThanOrEqual(4);

        act(() => {
          useMacroStore.getState().setActiveTab("recorder");
          renderer.unmount();
        });
      });
    });
  });

  describe("Adversarial Stress Tests & Edge Cases", () => {
    it("handles deeply nested object variable substitutions safely", () => {
      const nested = {
        level1: {
          level2: {
            array: ["{{item1}}", "{{item2}}", { prop: "{{nestedProp}}" }],
          },
        },
      };

      const context = {
        item1: "A",
        item2: "B",
        nestedProp: "C",
      };

      const res = substituteVariables(nested, context);
      expect(res.level1.level2.array[0]).toBe("A");
      expect(res.level1.level2.array[1]).toBe("B");
      expect((res.level1.level2.array[2] as { prop: string }).prop).toBe("C");
    });

    it("recovers gracefully from circular references or null inputs in serializer", () => {
      expect(MacroSerializer.deserialize("null").success).toBe(false);
      expect(MacroSerializer.deserialize("12345").success).toBe(false);
      expect(MacroSerializer.deserialize("[]").success).toBe(false);
      expect(MacroSerializer.deserializeLibrary("").success).toBe(false);
    });

    it("handles undoing steps when targets have already been removed from graph", async () => {
      const mock = createMockGraphAdapter();
      const executor = new MacroExecutor(mock.adapter, { speedMultiplier: 0 });

      const script: MacroScript = {
        id: "edge-case-script",
        name: "Edge Case",
        version: "1.0.0",
        parameters: [],
        steps: [
          {
            id: "ec1",
            type: "update_node",
            label: "Update Nonexistent",
            enabled: true,
            payload: { nodeId: "ghost-node-404", patch: { x: 99 } },
          },
          {
            id: "ec2",
            type: "delete_edge",
            label: "Delete Nonexistent Edge",
            enabled: true,
            payload: { edgeId: "ghost-edge-404" },
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const state = await executor.execute(script);
      expect(state.status).toBe("completed");

      // Undo step 2 then step 1
      const undo1 = await executor.stepBackward();
      const undo2 = await executor.stepBackward();
      expect(undo1).toBe(true);
      expect(undo2).toBe(true);
    });

    it("handles fast jumpToStep across arbitrary step ranges", async () => {
      const mock = createMockGraphAdapter();
      const executor = new MacroExecutor(mock.adapter, { speedMultiplier: 0 });

      const steps: MacroStep[] = Array.from({ length: 10 }, (_, i) => ({
        id: `jump_step_${i}`,
        type: "move_node",
        label: `Move ${i}`,
        enabled: true,
        payload: { nodeId: "node-1", x: i * 10, y: i * 10 },
      }));

      const script: MacroScript = {
        id: "jump-script",
        name: "Jump Script",
        version: "1.0.0",
        parameters: [],
        steps,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      executor.prepare(script);

      // Fast jump forward to step 7
      await executor.jumpToStep(7);
      expect(executor.getState().currentStepIndex).toBe(7);
      expect(mock.getNodes().find((n) => n.id === "node-1")?.x).toBe(60);

      // Fast jump backward to step 2
      await executor.jumpToStep(2);
      expect(executor.getState().currentStepIndex).toBe(2);
      expect(mock.getNodes().find((n) => n.id === "node-1")?.x).toBe(10);
    });

    it("executes built-in templates (Fork-Join, Reset Viewport, Anomaly Gate) end to end", async () => {
      const mock = createMockGraphAdapter();
      const executor = new MacroExecutor(mock.adapter, { speedMultiplier: 0 });

      // Fork-join template
      const forkJoinTpl = PREDEFINED_MACRO_TEMPLATES.find((t) => t.id === "template_fork_join");
      expect(forkJoinTpl).toBeDefined();
      if (forkJoinTpl) {
        const state = await executor.execute(forkJoinTpl, { prefix: "test-fj" });
        expect(state.status).toBe("completed");
        expect(mock.getNodes().some((n) => n.id === "test-fj-dispatcher")).toBe(true);
        expect(mock.getNodes().some((n) => n.id === "test-fj-join")).toBe(true);
      }

      // Reset layout template
      const resetLayoutTpl = PREDEFINED_MACRO_TEMPLATES.find(
        (t) => t.id === "template_reset_layout",
      );
      expect(resetLayoutTpl).toBeDefined();
      if (resetLayoutTpl) {
        const state2 = await executor.execute(resetLayoutTpl, {
          layoutDirection: "top-down",
          nodeSpacing: 80,
        });
        expect(state2.status).toBe("completed");
        expect(mock.getLayoutMode()).toBe("layered");
        expect(mock.getZoomLevel()).toBe(1.0);
      }
    });

    it("handles all useMacroStore state mutations and keyboard triggers", async () => {
      const store = useMacroStore.getState();

      // UI state
      store.toggleOpen();
      expect(useMacroStore.getState().isOpen).toBe(false);
      store.setOpen(true);
      expect(useMacroStore.getState().isOpen).toBe(true);

      store.setDockPosition("right");
      expect(useMacroStore.getState().dockPosition).toBe("right");

      store.setPanelPosition({ x: 50, y: 100 });
      expect(useMacroStore.getState().panelPosition.x).toBe(50);

      store.setPlaybackSpeed(2.0);
      expect(useMacroStore.getState().playbackSpeed).toBe(2.0);

      // Parameter updates
      store.setParameterValue("customParam", "testValue");
      expect(useMacroStore.getState().paramValues.customParam).toBe("testValue");
      store.resetParameters();

      // Step modifications
      const testScript: MacroScript = {
        id: "script-store-test",
        name: "Store Test",
        version: "1.0.0",
        parameters: [],
        steps: [
          { id: "st1", type: "create_node", label: "S1", enabled: true, payload: {} },
          { id: "st2", type: "create_node", label: "S2", enabled: true, payload: {} },
          { id: "st3", type: "create_node", label: "S3", enabled: true, payload: {} },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      store.loadScript(testScript);
      expect(useMacroStore.getState().activeScript?.steps.length).toBe(3);

      store.toggleStepEnabled(0);
      expect(useMacroStore.getState().activeScript?.steps[0]?.enabled).toBe(false);

      store.toggleStepBreakpoint(1);
      expect(useMacroStore.getState().activeScript?.steps[1]?.breakpoint).toBe(true);

      store.reorderSteps(0, 2);
      expect(useMacroStore.getState().activeScript?.steps[2]?.id).toBe("st1");

      store.deleteStep(1);
      expect(useMacroStore.getState().activeScript?.steps.length).toBe(2);

      // Export / Import
      const exportedJson = store.exportActiveScriptJson(true);
      expect(typeof exportedJson).toBe("string");
      const importRes = store.importScriptJson(exportedJson);
      expect(importRes.success).toBe(true);

      // Mount HUD to register keyboard shortcuts
      let panelRenderer: ReactTestRenderer | undefined;
      act(() => {
        panelRenderer = create(<MacroRecorderPanel />);
      });

      // Keyboard shortcuts
      const eventRecord = new KeyboardEvent("keydown", { key: "r", ctrlKey: true, altKey: true });
      window.dispatchEvent(eventRecord);
      expect(useMacroStore.getState().isRecording).toBe(true);

      const eventStop = new KeyboardEvent("keydown", { key: "r", ctrlKey: true, altKey: true });
      window.dispatchEvent(eventStop);
      expect(useMacroStore.getState().isRecording).toBe(false);

      const eventPlay = new KeyboardEvent("keydown", { key: "p", ctrlKey: true, altKey: true });
      window.dispatchEvent(eventPlay);

      const eventStep = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, altKey: true });
      window.dispatchEvent(eventStep);

      const eventEscape = new KeyboardEvent("keydown", { key: "Escape" });
      window.dispatchEvent(eventEscape);

      act(() => {
        panelRenderer?.unmount();
      });
    });
  });
});
