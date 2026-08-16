import { create } from "zustand";
import { useGraphStore } from "../../state/useGraphStore";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import { BatchProcessor } from "../../engine/macros/batchProcessor";
import { MacroExecutor } from "../../engine/macros/macroExecutor";
import { MacroRecorder, parameterizeScript } from "../../engine/macros/macroRecorder";
import { globalMacroRegistry } from "../../engine/macros/macroRegistry";
import { MacroSerializer } from "../../engine/macros/macroSerializer";
import type {
  BatchElementTarget,
  BatchExecutionResult,
  BatchProcessorOptions,
  GraphTargetAdapter,
  MacroEvent,
  MacroExecutionState,
  MacroScript,
  MacroStep,
} from "../../engine/macros/types";

export type MacroPanelTab = "player" | "recorder" | "library" | "batch" | "params";
export type DockPosition = "bottom" | "right" | "floating";

export interface MacroStoreState {
  isOpen: boolean;
  isDocked: boolean;
  dockPosition: DockPosition;
  panelPosition: { x: number; y: number };
  activeTab: MacroPanelTab;

  // Recording State
  isRecording: boolean;
  isRecordingPaused: boolean;
  recordingDurationMs: number;
  recordedStepsCount: number;

  // Active Script & Library
  activeScript: MacroScript | null;
  scripts: MacroScript[];
  searchFilter: string;
  categoryFilter: string;

  // Execution & Playback State
  executionState: MacroExecutionState;
  playbackSpeed: number;
  paramValues: Record<string, unknown>;
  scrubberIndex: number;
  selectedStepId: string | null;

  // Batch Execution State
  isBatchRunning: boolean;
  batchProgress: { completed: number; total: number; currentItem?: string } | null;
  batchResult: BatchExecutionResult | null;
}

export interface MacroStoreActions {
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
  setIsDocked: (docked: boolean) => void;
  setDockPosition: (pos: DockPosition) => void;
  setPanelPosition: (pos: { x: number; y: number }) => void;
  setActiveTab: (tab: MacroPanelTab) => void;

  // Recorder Actions
  startRecording: (meta?: { name?: string; description?: string; category?: string }) => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: (autoParameterize?: boolean) => MacroScript;
  discardRecording: () => void;
  recordEvent: (event: MacroEvent) => MacroStep | null;

  // Library & Script Actions
  loadScript: (script: MacroScript) => void;
  saveCurrentScript: (script?: MacroScript) => void;
  deleteScript: (scriptId: string) => void;
  duplicateScript: (scriptId: string) => MacroScript | null;
  setSearchFilter: (search: string) => void;
  setCategoryFilter: (category: string) => void;

  // Parameter Actions
  setParameterValue: (paramName: string, value: unknown) => void;
  resetParameters: () => void;

  // Playback Actions
  setPlaybackSpeed: (speed: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  abort: () => void;
  stepForward: () => Promise<boolean>;
  stepBackward: () => Promise<boolean>;
  jumpToStep: (index: number) => Promise<void>;
  resetPlayback: () => Promise<void>;

  // Step Modification
  toggleStepEnabled: (stepIndex: number) => void;
  toggleStepBreakpoint: (stepIndex: number) => void;
  deleteStep: (stepIndex: number) => void;
  reorderSteps: (fromIndex: number, toIndex: number) => void;

  // Batch Processing Actions
  runBatch: (
    targets: BatchElementTarget[],
    options?: BatchProcessorOptions,
  ) => Promise<BatchExecutionResult | null>;
  abortBatch: () => void;

  // Serialization Actions
  exportActiveScriptJson: (pretty?: boolean) => string;
  importScriptJson: (jsonString: string) => { success: boolean; errors: string[] };

  // Custom Target Adapter
  setTargetAdapter: (adapter: GraphTargetAdapter) => void;
  getTargetAdapter: () => GraphTargetAdapter;
}

export type MacroStore = MacroStoreState & MacroStoreActions;

// Default Graph Target Adapter wired to central useGraphStore
function createDefaultGraphAdapter(): GraphTargetAdapter {
  return {
    getPositionedNodes: () => useGraphStore.getState().positionedNodes,
    getPositionedEdges: () => useGraphStore.getState().positionedEdges,
    setPositionedGraph: (nodes: PositionedNode[], edges: PositionedEdge[]) => {
      useGraphStore.getState().setPositionedGraph(nodes, edges);
    },
    setSelectedNodeId: (nodeId: string | null) => {
      useGraphStore.getState().setSelectedNodeId(nodeId);
    },
    setSelectedStep: (step: number | null) => {
      useGraphStore.getState().setSelectedStep(step);
    },
    setLayoutMode: (mode: string) => {
      useGraphStore.getState().setLayoutMode(mode);
    },
    setLayoutConfig: (config: Record<string, unknown>) => {
      useGraphStore.getState().setLayoutConfig(config);
    },
    setPanOffset: (offset: { x: number; y: number }) => {
      useGraphStore.getState().setPanOffset(offset);
    },
    setZoomLevel: (zoom: number) => {
      useGraphStore.getState().setZoomLevel(zoom);
    },
    toggleNodeCollapse: (nodeId: string) => {
      useGraphStore.getState().toggleNodeCollapse(nodeId);
    },
    centerNodeOnCanvas: (nodeId: string) => {
      useGraphStore.getState().centerNodeOnCanvas(nodeId);
    },
  };
}

let activeTargetAdapter: GraphTargetAdapter = createDefaultGraphAdapter();
let activeRecorder: MacroRecorder = new MacroRecorder();
let activeExecutor: MacroExecutor | null = null;
let activeBatchProcessor: BatchProcessor | null = null;

const initialExecutionState: MacroExecutionState = {
  scriptId: "",
  status: "idle",
  currentStepIndex: 0,
  totalSteps: 0,
  progress: 0,
  playbackSpeed: 1.0,
  variables: {},
  errors: [],
  logs: [],
  elapsedMs: 0,
  undoStack: [],
};

export const useMacroStore = create<MacroStore>()((set, get) => ({
  isOpen: false,
  isDocked: false,
  dockPosition: "bottom",
  panelPosition: { x: 24, y: 80 },
  activeTab: "player",

  isRecording: false,
  isRecordingPaused: false,
  recordingDurationMs: 0,
  recordedStepsCount: 0,

  activeScript: globalMacroRegistry.listTemplates()[0] ?? null,
  scripts: globalMacroRegistry.list(),
  searchFilter: "",
  categoryFilter: "all",

  executionState: { ...initialExecutionState },
  playbackSpeed: 1.0,
  paramValues: {},
  scrubberIndex: 0,
  selectedStepId: null,

  isBatchRunning: false,
  batchProgress: null,
  batchResult: null,

  setOpen: (isOpen) => set({ isOpen }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  setIsDocked: (isDocked) => set({ isDocked }),
  setDockPosition: (dockPosition) => set({ dockPosition }),
  setPanelPosition: (panelPosition) => set({ panelPosition }),
  setActiveTab: (activeTab) => set({ activeTab }),

  setTargetAdapter: (adapter) => {
    activeTargetAdapter = adapter;
  },
  getTargetAdapter: () => activeTargetAdapter,

  startRecording: (meta) => {
    activeRecorder = new MacroRecorder();
    activeRecorder.startRecording(meta);
    set({
      isRecording: true,
      isRecordingPaused: false,
      recordingDurationMs: 0,
      recordedStepsCount: 0,
      activeTab: "recorder",
    });
  },

  pauseRecording: () => {
    activeRecorder.pauseRecording();
    set({ isRecordingPaused: true });
  },

  resumeRecording: () => {
    activeRecorder.resumeRecording();
    set({ isRecordingPaused: false });
  },

  stopRecording: (autoParameterize = true) => {
    const rawScript = activeRecorder.stopRecording();
    const finalScript = autoParameterize ? parameterizeScript(rawScript) : rawScript;
    globalMacroRegistry.register(finalScript);

    set({
      isRecording: false,
      isRecordingPaused: false,
      recordingDurationMs: activeRecorder.getDurationMs(),
      recordedStepsCount: finalScript.steps.length,
      activeScript: finalScript,
      scripts: globalMacroRegistry.list(),
      activeTab: "player",
    });

    get().loadScript(finalScript);
    return finalScript;
  },

  discardRecording: () => {
    activeRecorder.discardRecording();
    set({
      isRecording: false,
      isRecordingPaused: false,
      recordingDurationMs: 0,
      recordedStepsCount: 0,
    });
  },

  recordEvent: (event) => {
    if (!activeRecorder.isRecording()) return null;
    const step = activeRecorder.recordEvent(event);
    if (step) {
      set({
        recordedStepsCount: activeRecorder.getStepsCount(),
        recordingDurationMs: activeRecorder.getDurationMs(),
      });
    }
    return step;
  },

  loadScript: (script) => {
    const initialParams: Record<string, unknown> = {};
    for (const p of script.parameters) {
      initialParams[p.name] = p.defaultValue;
    }

    activeExecutor = new MacroExecutor(activeTargetAdapter, {
      speedMultiplier: get().playbackSpeed,
      initialVariables: initialParams,
      onStateChange: (state) => {
        set({
          executionState: state,
          scrubberIndex: state.currentStepIndex,
        });
      },
    });

    activeExecutor.prepare(script, initialParams);

    set({
      activeScript: script,
      paramValues: initialParams,
      scrubberIndex: 0,
      selectedStepId: script.steps[0]?.id ?? null,
      executionState: activeExecutor.getState(),
    });
  },

  saveCurrentScript: (script) => {
    const toSave = script ?? get().activeScript;
    if (!toSave) return;
    globalMacroRegistry.register(toSave);
    set({
      activeScript: toSave,
      scripts: globalMacroRegistry.list(),
    });
  },

  deleteScript: (scriptId) => {
    globalMacroRegistry.unregister(scriptId);
    const remaining = globalMacroRegistry.list();
    set({
      scripts: remaining,
      activeScript:
        get().activeScript?.id === scriptId ? (remaining[0] ?? null) : get().activeScript,
    });
  },

  duplicateScript: (scriptId) => {
    const duplicated = globalMacroRegistry.duplicate(scriptId);
    if (duplicated) {
      set({
        scripts: globalMacroRegistry.list(),
        activeScript: duplicated,
      });
    }
    return duplicated;
  },

  setSearchFilter: (searchFilter) => set({ searchFilter }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),

  setParameterValue: (paramName, value) => {
    const nextParams = { ...get().paramValues, [paramName]: value };
    set({ paramValues: nextParams });
    if (activeExecutor && get().activeScript) {
      activeExecutor.setVariables(nextParams);
    }
  },

  resetParameters: () => {
    const script = get().activeScript;
    if (!script) return;
    const initialParams: Record<string, unknown> = {};
    for (const p of script.parameters) {
      initialParams[p.name] = p.defaultValue;
    }
    set({ paramValues: initialParams });
    if (activeExecutor) {
      activeExecutor.setVariables(initialParams);
    }
  },

  setPlaybackSpeed: (playbackSpeed) => {
    set({ playbackSpeed });
    if (activeExecutor) {
      activeExecutor.setSpeed(playbackSpeed);
    }
  },

  play: async () => {
    const script = get().activeScript;
    if (!script) return;

    if (!activeExecutor || activeExecutor.getScript()?.id !== script.id) {
      activeExecutor = new MacroExecutor(activeTargetAdapter, {
        speedMultiplier: get().playbackSpeed,
        initialVariables: get().paramValues,
        onStateChange: (state) => {
          set({
            executionState: state,
            scrubberIndex: state.currentStepIndex,
          });
        },
      });
    }

    await activeExecutor.execute(script, get().paramValues);
    set({ executionState: activeExecutor.getState() });
  },

  pause: () => {
    if (activeExecutor) {
      activeExecutor.pause();
      set({ executionState: activeExecutor.getState() });
    }
  },

  resume: async () => {
    if (activeExecutor) {
      await activeExecutor.resume();
      set({ executionState: activeExecutor.getState() });
    }
  },

  abort: () => {
    if (activeExecutor) {
      activeExecutor.abort();
      set({ executionState: activeExecutor.getState() });
    }
  },

  stepForward: async () => {
    const script = get().activeScript;
    if (!script) return false;

    if (!activeExecutor) {
      get().loadScript(script);
    }

    if (activeExecutor) {
      const res = await activeExecutor.stepForward();
      set({
        executionState: activeExecutor.getState(),
        scrubberIndex: activeExecutor.getState().currentStepIndex,
      });
      return res;
    }
    return false;
  },

  stepBackward: async () => {
    if (activeExecutor) {
      const res = await activeExecutor.stepBackward();
      set({
        executionState: activeExecutor.getState(),
        scrubberIndex: activeExecutor.getState().currentStepIndex,
      });
      return res;
    }
    return false;
  },

  jumpToStep: async (index) => {
    if (activeExecutor) {
      await activeExecutor.jumpToStep(index);
      set({
        executionState: activeExecutor.getState(),
        scrubberIndex: activeExecutor.getState().currentStepIndex,
      });
    }
  },

  resetPlayback: async () => {
    if (activeExecutor) {
      await activeExecutor.reset();
      set({
        executionState: activeExecutor.getState(),
        scrubberIndex: 0,
      });
    }
  },

  toggleStepEnabled: (stepIndex) => {
    const script = get().activeScript;
    if (!script || !script.steps[stepIndex]) return;

    const updatedSteps = [...script.steps];
    const targetStep = updatedSteps[stepIndex];
    if (targetStep) {
      updatedSteps[stepIndex] = { ...targetStep, enabled: !targetStep.enabled };
      const updatedScript = { ...script, steps: updatedSteps, updatedAt: new Date().toISOString() };
      get().saveCurrentScript(updatedScript);
    }
  },

  toggleStepBreakpoint: (stepIndex) => {
    const script = get().activeScript;
    if (!script || !script.steps[stepIndex]) return;

    const updatedSteps = [...script.steps];
    const targetStep = updatedSteps[stepIndex];
    if (targetStep) {
      updatedSteps[stepIndex] = { ...targetStep, breakpoint: !targetStep.breakpoint };
      const updatedScript = { ...script, steps: updatedSteps, updatedAt: new Date().toISOString() };
      get().saveCurrentScript(updatedScript);
    }
  },

  deleteStep: (stepIndex) => {
    const script = get().activeScript;
    if (!script) return;

    const updatedSteps = script.steps.filter((_, i) => i !== stepIndex);
    const updatedScript = { ...script, steps: updatedSteps, updatedAt: new Date().toISOString() };
    get().saveCurrentScript(updatedScript);
    get().loadScript(updatedScript);
  },

  reorderSteps: (fromIndex, toIndex) => {
    const script = get().activeScript;
    if (!script) return;
    if (
      fromIndex < 0 ||
      fromIndex >= script.steps.length ||
      toIndex < 0 ||
      toIndex >= script.steps.length
    )
      return;

    const updatedSteps = [...script.steps];
    const [moved] = updatedSteps.splice(fromIndex, 1);
    if (moved) {
      updatedSteps.splice(toIndex, 0, moved);
      const updatedScript = { ...script, steps: updatedSteps, updatedAt: new Date().toISOString() };
      get().saveCurrentScript(updatedScript);
      get().loadScript(updatedScript);
    }
  },

  runBatch: async (targets, options) => {
    const script = get().activeScript;
    if (!script) return null;

    activeBatchProcessor = new BatchProcessor(activeTargetAdapter);
    set({ isBatchRunning: true, batchProgress: { completed: 0, total: targets.length } });

    try {
      const result = await activeBatchProcessor.executeBatch(script, targets, get().paramValues, {
        ...options,
        onProgress: (progress) => set({ batchProgress: progress }),
      });
      set({ batchResult: result, isBatchRunning: false });
      return result;
    } catch {
      set({ isBatchRunning: false });
      return null;
    }
  },

  abortBatch: () => {
    if (activeBatchProcessor) {
      activeBatchProcessor.abort();
    }
    set({ isBatchRunning: false });
  },

  exportActiveScriptJson: (pretty = true) => {
    const script = get().activeScript;
    if (!script) return "{}";
    return MacroSerializer.serialize(script, pretty);
  },

  importScriptJson: (jsonString) => {
    const res = MacroSerializer.deserialize(jsonString);
    if (res.success && res.script) {
      globalMacroRegistry.register(res.script);
      set({
        scripts: globalMacroRegistry.list(),
        activeScript: res.script,
      });
      get().loadScript(res.script);
      return { success: true, errors: [] };
    }
    return { success: false, errors: res.errors };
  },
}));
