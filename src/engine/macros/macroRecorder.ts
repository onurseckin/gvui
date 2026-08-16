import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import type {
  CollapseNodePayload,
  CreateEdgePayload,
  CreateNodePayload,
  CustomActionPayload,
  DelayPayload,
  DeleteEdgePayload,
  DeleteNodePayload,
  MacroActionType,
  MacroEvent,
  MacroScript,
  MacroStep,
  MoveNodePayload,
  ParameterDefinition,
  SelectNodePayload,
  SelectStepPayload,
  SetViewportPayload,
  TriggerLayoutPayload,
  UpdateEdgePayload,
  UpdateNodePayload,
} from "./types";

export interface RecorderOptions {
  coalesceThresholdMs?: number;
  captureSelection?: boolean;
  captureViewport?: boolean;
  name?: string;
  description?: string;
}

export type MacroRecorderListener = (event: MacroEvent, step: MacroStep) => void;

export class MacroRecorder {
  private recording: boolean = false;
  private paused: boolean = false;
  private startTime: number = 0;
  private pauseTime: number = 0;
  private totalPausedDuration: number = 0;
  private steps: MacroStep[] = [];
  private rawEvents: MacroEvent[] = [];
  private listeners: Set<MacroRecorderListener> = new Set();
  private options: Required<RecorderOptions>;
  private lastStepTimestamp: number = 0;
  private scriptMetadata: {
    name: string;
    description: string;
    category?: string;
    tags?: string[];
  } = {
    name: "Recorded Macro",
    description: "Macro recorded from canvas interactions",
  };

  public constructor(options?: RecorderOptions) {
    this.options = {
      coalesceThresholdMs: options?.coalesceThresholdMs ?? 300,
      captureSelection: options?.captureSelection ?? true,
      captureViewport: options?.captureViewport ?? true,
      name: options?.name ?? "Recorded Macro",
      description: options?.description ?? "Macro recorded from canvas interactions",
    };
  }

  public isRecording(): boolean {
    return this.recording;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public getStepsCount(): number {
    return this.steps.length;
  }

  public getSteps(): MacroStep[] {
    return [...this.steps];
  }

  public getRawEvents(): MacroEvent[] {
    return [...this.rawEvents];
  }

  public getDurationMs(): number {
    if (!this.recording) return 0;
    const now = this.paused ? this.pauseTime : Date.now();
    return Math.max(0, now - this.startTime - this.totalPausedDuration);
  }

  public startRecording(metadata?: {
    name?: string;
    description?: string;
    category?: string;
    tags?: string[];
  }): void {
    this.recording = true;
    this.paused = false;
    this.startTime = Date.now();
    this.pauseTime = 0;
    this.totalPausedDuration = 0;
    this.steps = [];
    this.rawEvents = [];
    this.lastStepTimestamp = this.startTime;
    if (metadata) {
      this.scriptMetadata = {
        name: metadata.name ?? "Recorded Macro",
        description: metadata.description ?? "Macro recorded from canvas interactions",
        category: metadata.category,
        tags: metadata.tags,
      };
    }
  }

  public pauseRecording(): void {
    if (!this.recording || this.paused) return;
    this.paused = true;
    this.pauseTime = Date.now();
  }

  public resumeRecording(): void {
    if (!this.recording || !this.paused) return;
    this.paused = false;
    this.totalPausedDuration += Date.now() - this.pauseTime;
    this.pauseTime = 0;
  }

  public stopRecording(): MacroScript {
    if (!this.recording) {
      return this.buildScript();
    }
    this.recording = false;
    this.paused = false;
    return this.buildScript();
  }

  public discardRecording(): void {
    this.recording = false;
    this.paused = false;
    this.steps = [];
    this.rawEvents = [];
    this.startTime = 0;
    this.pauseTime = 0;
    this.totalPausedDuration = 0;
  }

  public subscribe(listener: MacroRecorderListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public recordEvent(event: MacroEvent): MacroStep | null {
    if (!this.recording || this.paused) {
      return null;
    }

    this.rawEvents.push(event);
    const now = Date.now();
    const delayBeforeMs =
      this.steps.length === 0 ? 0 : Math.min(2000, Math.max(0, now - this.lastStepTimestamp));
    this.lastStepTimestamp = now;

    const step = this.convertEventToStep(event, delayBeforeMs);
    if (!step) {
      return null;
    }

    // Check if this step can be coalesced with the previous step
    const coalesced = this.tryCoalesceStep(step);
    const resultStep = coalesced ?? step;

    if (!coalesced) {
      this.steps.push(step);
    }

    for (const listener of this.listeners) {
      try {
        listener(event, resultStep);
      } catch (err) {
        console.error("MacroRecorder listener error:", err);
      }
    }

    return resultStep;
  }

  public recordNodeCreated(
    node: Partial<PositionedNode> & { id: string; name: string },
  ): MacroStep | null {
    const payload: CreateNodePayload = { node };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "create_node",
      targetId: node.id,
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordNodeDeleted(
    nodeId: string,
    previousNode?: PositionedNode,
    connectedEdges?: PositionedEdge[],
  ): MacroStep | null {
    const payload: DeleteNodePayload = { nodeId, previousNode, connectedEdges };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "delete_node",
      targetId: nodeId,
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordNodeMoved(
    nodeId: string,
    x: number,
    y: number,
    previousPosition?: { x: number; y: number },
  ): MacroStep | null {
    const payload: MoveNodePayload = { nodeId, x, y, previousPosition };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "move_node",
      targetId: nodeId,
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordNodeUpdated(
    nodeId: string,
    patch: Record<string, unknown>,
    previousProperties?: Record<string, unknown>,
  ): MacroStep | null {
    const payload: UpdateNodePayload = { nodeId, patch, previousProperties };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "update_node",
      targetId: nodeId,
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordEdgeCreated(
    edge: Partial<PositionedEdge> & { id: string; source: string; target: string },
  ): MacroStep | null {
    const payload: CreateEdgePayload = { edge };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "create_edge",
      targetId: edge.id,
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordEdgeDeleted(
    edgeId?: string,
    source?: string,
    target?: string,
    previousEdge?: PositionedEdge,
  ): MacroStep | null {
    const payload: DeleteEdgePayload = { edgeId, source, target, previousEdge };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "delete_edge",
      targetId: edgeId ?? `${source}->${target}`,
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordEdgeUpdated(
    edgeId: string,
    patch: Record<string, unknown>,
    previousProperties?: Record<string, unknown>,
  ): MacroStep | null {
    const payload: UpdateEdgePayload = { edgeId, patch, previousProperties };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "update_edge",
      targetId: edgeId,
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordNodeSelected(
    nodeId: string | null,
    previousSelectedNodeId?: string | null,
  ): MacroStep | null {
    if (!this.options.captureSelection) return null;
    const payload: SelectNodePayload = { nodeId, previousSelectedNodeId };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "select_node",
      targetId: nodeId ?? undefined,
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordStepSelected(
    step: number | null,
    previousSelectedStep?: number | null,
  ): MacroStep | null {
    if (!this.options.captureSelection) return null;
    const payload: SelectStepPayload = { step, previousSelectedStep };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "select_step",
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordLayoutTriggered(
    layoutMode: string,
    layoutConfig?: Record<string, unknown>,
    previousLayoutMode?: string,
  ): MacroStep | null {
    const payload: TriggerLayoutPayload = { layoutMode, layoutConfig, previousLayoutMode };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "trigger_layout",
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordViewportChanged(
    zoomLevel?: number,
    panOffset?: { x: number; y: number },
    previousZoomLevel?: number,
    previousPanOffset?: { x: number; y: number },
  ): MacroStep | null {
    if (!this.options.captureViewport) return null;
    const payload: SetViewportPayload = {
      zoomLevel,
      panOffset,
      previousZoomLevel,
      previousPanOffset,
    };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "set_viewport",
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordNodeCollapsed(
    nodeId: string,
    collapsed: boolean,
    previousCollapsed?: boolean,
  ): MacroStep | null {
    const payload: CollapseNodePayload = { nodeId, collapsed, previousCollapsed };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "collapse_node",
      targetId: nodeId,
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordDelay(durationMs: number): MacroStep | null {
    const payload: DelayPayload = { durationMs };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "delay",
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  public recordCustomAction(
    actionName: string,
    parameters?: Record<string, unknown>,
  ): MacroStep | null {
    const payload: CustomActionPayload = { actionName, parameters };
    return this.recordEvent({
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: "custom_action",
      payload: payload as unknown as Record<string, unknown>,
      timestamp: Date.now(),
    });
  }

  private convertEventToStep(event: MacroEvent, delayBeforeMs: number): MacroStep | null {
    const stepId = `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const baseStep: Omit<MacroStep, "type" | "label" | "payload"> = {
      id: stepId,
      enabled: true,
      delayBeforeMs,
      delayAfterMs: 0,
      timestamp: event.timestamp,
    };

    switch (event.type) {
      case "create_node": {
        const node = (event.payload.node as Partial<PositionedNode>) ?? {
          id: "unknown",
          name: "New Node",
        };
        return {
          ...baseStep,
          type: "create_node",
          label: `Create Node: ${node.name ?? node.id}`,
          description: `Add node "${node.id}" (${node.kind ?? "default"}) at (${node.x ?? 0}, ${node.y ?? 0})`,
          payload: { ...event.payload },
        };
      }
      case "delete_node": {
        const nodeId = String(event.payload.nodeId ?? "");
        return {
          ...baseStep,
          type: "delete_node",
          label: `Delete Node: ${nodeId}`,
          description: `Remove node "${nodeId}" and its incident edges`,
          payload: { ...event.payload },
        };
      }
      case "move_node": {
        const nodeId = String(event.payload.nodeId ?? "");
        const x = Number(event.payload.x ?? 0);
        const y = Number(event.payload.y ?? 0);
        return {
          ...baseStep,
          type: "move_node",
          label: `Move Node: ${nodeId}`,
          description: `Move node "${nodeId}" to (${Math.round(x)}, ${Math.round(y)})`,
          payload: { ...event.payload },
        };
      }
      case "update_node": {
        const nodeId = String(event.payload.nodeId ?? "");
        const patchKeys = Object.keys((event.payload.patch as Record<string, unknown>) ?? {}).join(
          ", ",
        );
        return {
          ...baseStep,
          type: "update_node",
          label: `Update Node: ${nodeId}`,
          description: `Update properties [${patchKeys}] on node "${nodeId}"`,
          payload: { ...event.payload },
        };
      }
      case "create_edge": {
        const edge = (event.payload.edge as Partial<PositionedEdge>) ?? {
          id: "unknown",
          source: "?",
          target: "?",
        };
        return {
          ...baseStep,
          type: "create_edge",
          label: `Connect: ${edge.source} → ${edge.target}`,
          description: `Create edge "${edge.id}" from "${edge.source}" to "${edge.target}"`,
          payload: { ...event.payload },
        };
      }
      case "delete_edge": {
        const edgeId = String(
          event.payload.edgeId ?? `${event.payload.source}->${event.payload.target}`,
        );
        return {
          ...baseStep,
          type: "delete_edge",
          label: `Delete Edge: ${edgeId}`,
          description: `Remove edge "${edgeId}"`,
          payload: { ...event.payload },
        };
      }
      case "update_edge": {
        const edgeId = String(event.payload.edgeId ?? "");
        return {
          ...baseStep,
          type: "update_edge",
          label: `Update Edge: ${edgeId}`,
          description: `Update properties on edge "${edgeId}"`,
          payload: { ...event.payload },
        };
      }
      case "select_node": {
        const nodeId = event.payload.nodeId ? String(event.payload.nodeId) : "None";
        return {
          ...baseStep,
          type: "select_node",
          label: `Select Node: ${nodeId}`,
          description: `Set selected node to "${nodeId}"`,
          payload: { ...event.payload },
        };
      }
      case "select_step": {
        const step =
          event.payload.step !== null && event.payload.step !== undefined
            ? String(event.payload.step)
            : "All";
        return {
          ...baseStep,
          type: "select_step",
          label: `Select Step: ${step}`,
          description: `Filter execution step to "${step}"`,
          payload: { ...event.payload },
        };
      }
      case "trigger_layout": {
        const mode = String(event.payload.layoutMode ?? "layered");
        return {
          ...baseStep,
          type: "trigger_layout",
          label: `Trigger Layout: ${mode}`,
          description: `Apply layout algorithm "${mode}" across graph`,
          payload: { ...event.payload },
        };
      }
      case "set_viewport": {
        const zoom =
          event.payload.zoomLevel !== undefined
            ? Number(event.payload.zoomLevel).toFixed(2)
            : "1.00";
        return {
          ...baseStep,
          type: "set_viewport",
          label: `Set Viewport: zoom ${zoom}x`,
          description: `Update canvas camera pan and zoom`,
          payload: { ...event.payload },
        };
      }
      case "collapse_node": {
        const nodeId = String(event.payload.nodeId ?? "");
        const collapsed = Boolean(event.payload.collapsed);
        return {
          ...baseStep,
          type: "collapse_node",
          label: `${collapsed ? "Collapse" : "Expand"} Node: ${nodeId}`,
          description: `${collapsed ? "Collapse" : "Expand"} subgraph under node "${nodeId}"`,
          payload: { ...event.payload },
        };
      }
      case "delay": {
        const ms = Number(event.payload.durationMs ?? 500);
        return {
          ...baseStep,
          type: "delay",
          label: `Wait: ${ms}ms`,
          description: `Pause playback for ${ms} milliseconds`,
          payload: { ...event.payload },
        };
      }
      case "custom_action": {
        const name = String(event.payload.actionName ?? "custom");
        return {
          ...baseStep,
          type: "custom_action",
          label: `Action: ${name}`,
          description: `Execute custom action "${name}"`,
          payload: { ...event.payload },
        };
      }
      default: {
        return {
          ...baseStep,
          type: (event.type as MacroActionType) || "custom_action",
          label: `Event: ${event.type}`,
          description: `Execute ${event.type}`,
          payload: { ...event.payload },
        };
      }
    }
  }

  private tryCoalesceStep(newStep: MacroStep): MacroStep | null {
    if (this.steps.length === 0) return null;
    const lastStep = this.steps[this.steps.length - 1];
    if (!lastStep) return null;

    const timeDiff = (newStep.timestamp ?? 0) - (lastStep.timestamp ?? 0);
    const isWithinThreshold = timeDiff <= this.options.coalesceThresholdMs;

    // Coalesce rapid move_node on the same nodeId
    if (
      lastStep.type === "move_node" &&
      newStep.type === "move_node" &&
      isWithinThreshold &&
      lastStep.payload.nodeId === newStep.payload.nodeId
    ) {
      const origPrevPos = lastStep.payload.previousPosition;
      lastStep.payload = {
        ...lastStep.payload,
        x: newStep.payload.x,
        y: newStep.payload.y,
        previousPosition: origPrevPos ?? newStep.payload.previousPosition,
      };
      lastStep.label = newStep.label;
      lastStep.description = newStep.description;
      lastStep.timestamp = newStep.timestamp;
      return lastStep;
    }

    // Coalesce rapid set_viewport
    if (lastStep.type === "set_viewport" && newStep.type === "set_viewport" && isWithinThreshold) {
      const origPrevZoom = lastStep.payload.previousZoomLevel;
      const origPrevPan = lastStep.payload.previousPanOffset;
      lastStep.payload = {
        ...lastStep.payload,
        zoomLevel: newStep.payload.zoomLevel ?? lastStep.payload.zoomLevel,
        panOffset: newStep.payload.panOffset ?? lastStep.payload.panOffset,
        previousZoomLevel: origPrevZoom ?? newStep.payload.previousZoomLevel,
        previousPanOffset: origPrevPan ?? newStep.payload.previousPanOffset,
      };
      lastStep.label = newStep.label;
      lastStep.description = newStep.description;
      lastStep.timestamp = newStep.timestamp;
      return lastStep;
    }

    // Coalesce rapid update_node on same nodeId
    if (
      lastStep.type === "update_node" &&
      newStep.type === "update_node" &&
      isWithinThreshold &&
      lastStep.payload.nodeId === newStep.payload.nodeId
    ) {
      const prevPatch = (lastStep.payload.patch as Record<string, unknown>) ?? {};
      const newPatch = (newStep.payload.patch as Record<string, unknown>) ?? {};
      const prevProps = (lastStep.payload.previousProperties as Record<string, unknown>) ?? {};
      const newProps = (newStep.payload.previousProperties as Record<string, unknown>) ?? {};

      lastStep.payload = {
        ...lastStep.payload,
        patch: { ...prevPatch, ...newPatch },
        previousProperties: { ...newProps, ...prevProps },
      };
      lastStep.timestamp = newStep.timestamp;
      return lastStep;
    }

    return null;
  }

  public buildScript(): MacroScript {
    const scriptId = `macro_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();

    return {
      id: scriptId,
      name: this.scriptMetadata.name,
      description: this.scriptMetadata.description,
      version: "1.0.0",
      category: this.scriptMetadata.category ?? "Custom",
      tags: this.scriptMetadata.tags ?? ["recorded"],
      parameters: [],
      steps: [...this.steps],
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  }
}

/**
 * Automatically parameterizes a macro script by identifying static IDs, names, or values
 * and substituting them with variable expressions like `{{paramName}}`.
 */
export function parameterizeScript(
  script: MacroScript,
  customRules?: Array<{
    search: string;
    paramName: string;
    defaultValue?: unknown;
    type?: ParameterDefinition["type"];
  }>,
): MacroScript {
  const parameters: ParameterDefinition[] = [...script.parameters];
  const existingParamNames = new Set(parameters.map((p) => p.name));

  // Collect candidate values to parameterize if none supplied
  const rules = customRules ?? [];
  if (rules.length === 0) {
    const nodeIds = new Set<string>();
    const nodeNames = new Set<string>();

    for (const step of script.steps) {
      if (step.type === "create_node" && step.payload.node) {
        const node = step.payload.node as Partial<PositionedNode>;
        if (node.id) nodeIds.add(node.id);
        if (node.name) nodeNames.add(node.name);
      }
    }

    let nodeCounter = 1;
    for (const id of nodeIds) {
      const pName = nodeIds.size === 1 ? "nodeId" : `nodeId${nodeCounter}`;
      rules.push({ search: id, paramName: pName, defaultValue: id, type: "nodeId" });
      nodeCounter++;
    }

    let nameCounter = 1;
    for (const name of nodeNames) {
      const pName = nodeNames.size === 1 ? "nodeName" : `nodeName${nameCounter}`;
      if (!rules.some((r) => r.search === name)) {
        rules.push({ search: name, paramName: pName, defaultValue: name, type: "string" });
      }
      nameCounter++;
    }
  }

  // Register parameters
  for (const rule of rules) {
    if (!existingParamNames.has(rule.paramName)) {
      parameters.push({
        name: rule.paramName,
        label: rule.paramName.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase()),
        description: `Parameter value for ${rule.search}`,
        type: rule.type ?? "string",
        defaultValue: rule.defaultValue ?? rule.search,
        required: false,
      });
      existingParamNames.add(rule.paramName);
    }
  }

  // Apply substitutions to deep copies of steps
  const updatedSteps = script.steps.map((step) => {
    let stepJson = JSON.stringify(step);
    for (const rule of rules) {
      if (rule.search) {
        const placeholder = `{{${rule.paramName}}}`;
        // Escape special regex chars
        const escaped = rule.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        stepJson = stepJson.replace(new RegExp(escaped, "g"), placeholder);
      }
    }
    const parsedStep = JSON.parse(stepJson) as MacroStep;
    return parsedStep;
  });

  return {
    ...script,
    parameters,
    steps: updatedSteps,
    updatedAt: new Date().toISOString(),
  };
}
