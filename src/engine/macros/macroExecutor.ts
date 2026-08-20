import type { PositionedEdge, PositionedNode } from "../../types/graphData";
import type {
  CollapseNodePayload,
  CreateEdgePayload,
  CreateNodePayload,
  CustomActionPayload,
  DelayPayload,
  DeleteEdgePayload,
  DeleteNodePayload,
  GraphTargetAdapter,
  MacroExecutionError,
  MacroExecutionLog,
  MacroExecutionState,
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
  VariableContext,
} from "./types";

export interface ExecutorOptions {
  speedMultiplier?: number;
  initialVariables?: VariableContext;
  onStepStart?: (stepIndex: number, step: MacroStep) => void;
  onStepComplete?: (stepIndex: number, step: MacroStep, inverse?: MacroStep) => void;
  onError?: (error: MacroExecutionError) => void;
  onStateChange?: (state: MacroExecutionState) => void;
  onFinish?: (state: MacroExecutionState) => void;
}

/**
 * Resolves template variables within strings, numbers, objects, and arrays.
 * Handles `{{var}}`, `${var}`, default fallbacks `{{var || default}}`,
 * built-ins (`{{$now}}`, `{{$randomId}}`, `{{$index}}`), and string filters (`uppercase`, `lowercase`, `trim`).
 */
export function substituteVariables<T>(
  input: T,
  context: VariableContext,
  currentStepIndex: number = 0,
): T {
  if (input === null || input === undefined) {
    return input;
  }

  if (typeof input === "string") {
    return substituteString(input, context, currentStepIndex) as unknown as T;
  }

  if (Array.isArray(input)) {
    return input.map((item) =>
      substituteVariables(item, context, currentStepIndex),
    ) as unknown as T;
  }

  if (typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      result[key] = substituteVariables(value, context, currentStepIndex);
    }
    return result as unknown as T;
  }

  return input;
}

function evaluateExpression(
  expr: string,
  context: VariableContext,
  currentStepIndex: number,
): unknown {
  const trimmed = expr.trim();

  // Built-in special variables
  if (trimmed === "$now") {
    return new Date().toISOString();
  }
  if (trimmed === "$timestamp") {
    return Date.now();
  }
  if (trimmed === "$randomId") {
    return `id_${Math.random().toString(36).slice(2, 9)}`;
  }
  if (trimmed === "$index") {
    return currentStepIndex;
  }

  // Handle pipe transformations: e.g. "name | uppercase" or "name | trim"
  const pipeParts = trimmed.split(/(?<!\|)\|(?!\|)/).map((p) => p.trim());
  const varPart = pipeParts[0] ?? "";
  const pipes = pipeParts.slice(1);

  // Handle fallback operator: e.g. "prefix || defaultVal"
  let rawValue: unknown;
  if (varPart.includes("||")) {
    const [primary, fallback] = varPart.split("||").map((s) => s.trim());
    const val = context[primary ?? ""];
    rawValue =
      val !== undefined && val !== null && val !== "" ? val : fallback?.replace(/^['"]|['"]$/g, "");
  } else if (
    (varPart.startsWith("'") && varPart.endsWith("'") && varPart.length >= 2) ||
    (varPart.startsWith('"') && varPart.endsWith('"') && varPart.length >= 2)
  ) {
    rawValue = varPart.slice(1, -1);
  } else {
    rawValue = context[varPart];
  }

  if (rawValue === undefined) {
    // Return original expression if not found in context
    return undefined;
  }

  // Apply pipes
  let finalValue = rawValue;
  for (const pipe of pipes) {
    if (typeof finalValue === "string") {
      if (pipe === "uppercase") {
        finalValue = finalValue.toUpperCase();
      } else if (pipe === "lowercase") {
        finalValue = finalValue.toLowerCase();
      } else if (pipe === "trim") {
        finalValue = finalValue.trim();
      }
    }
  }

  return finalValue;
}

function substituteString(
  str: string,
  context: VariableContext,
  currentStepIndex: number,
): unknown {
  // Check if string is EXACTLY a single expression like `{{var}}` or `${var}`
  const exactMatch = str.match(/^(\{\{([^{}]+)\}\}|\$\{([^}]+)\})$/);
  if (exactMatch) {
    const expr = exactMatch[2] ?? exactMatch[3] ?? "";
    const resolved = evaluateExpression(expr, context, currentStepIndex);
    if (resolved !== undefined) {
      return resolved;
    }
  }

  // Otherwise perform string interpolation
  let result = str;

  // Replace {{expr}}
  result = result.replace(/\{\{([^{}]+)\}\}/g, (_match, expr: string) => {
    const val = evaluateExpression(expr, context, currentStepIndex);
    return val !== undefined ? String(val) : _match;
  });

  // Replace ${expr}
  result = result.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    const val = evaluateExpression(expr, context, currentStepIndex);
    return val !== undefined ? String(val) : _match;
  });

  return result;
}

export function validateParameterValue(
  def: ParameterDefinition,
  value: unknown,
): { valid: boolean; error?: string; coercedValue?: unknown } {
  if (value === undefined || value === null || value === "") {
    if (def.required) {
      return { valid: false, error: `Parameter "${def.name}" is required.` };
    }
    return { valid: true, coercedValue: def.defaultValue };
  }

  let coerced = value;

  switch (def.type) {
    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      if (isNaN(num)) {
        return { valid: false, error: `Parameter "${def.name}" must be a valid number.` };
      }
      if (def.validation?.min !== undefined && num < def.validation.min) {
        return { valid: false, error: `Parameter "${def.name}" must be >= ${def.validation.min}.` };
      }
      if (def.validation?.max !== undefined && num > def.validation.max) {
        return { valid: false, error: `Parameter "${def.name}" must be <= ${def.validation.max}.` };
      }
      coerced = num;
      break;
    }
    case "boolean": {
      coerced =
        typeof value === "boolean" ? value : String(value).toLowerCase() === "true" || value === 1;
      break;
    }
    case "string":
    case "nodeId":
    case "edgeId": {
      coerced = String(value);
      if (def.validation?.pattern) {
        try {
          const reg = new RegExp(def.validation.pattern);
          if (!reg.test(String(coerced))) {
            return {
              valid: false,
              error: `Parameter "${def.name}" does not match pattern ${def.validation.pattern}.`,
            };
          }
        } catch {
          // Ignore invalid regex
        }
      }
      break;
    }
    case "json": {
      if (typeof value === "string") {
        try {
          coerced = JSON.parse(value);
        } catch {
          return { valid: false, error: `Parameter "${def.name}" must be valid JSON.` };
        }
      }
      break;
    }
    case "select": {
      if (def.options && def.options.length > 0) {
        const match = def.options.some(
          (opt) => opt.value === value || String(opt.value) === String(value),
        );
        if (!match && def.required) {
          return { valid: false, error: `Parameter "${def.name}" value is not a valid option.` };
        }
      }
      break;
    }
  }

  return { valid: true, coercedValue: coerced };
}

export class MacroExecutor {
  private target: GraphTargetAdapter;
  private script: MacroScript | null = null;
  private state: MacroExecutionState;
  private options: Required<ExecutorOptions>;
  private abortController: AbortController | null = null;
  private isStepping: boolean = false;

  public constructor(target: GraphTargetAdapter, options?: ExecutorOptions) {
    this.target = target;
    this.options = {
      speedMultiplier: options?.speedMultiplier ?? 1.0,
      initialVariables: options?.initialVariables ?? {},
      onStepStart: options?.onStepStart ?? (() => {}),
      onStepComplete: options?.onStepComplete ?? (() => {}),
      onError: options?.onError ?? (() => {}),
      onStateChange: options?.onStateChange ?? (() => {}),
      onFinish: options?.onFinish ?? (() => {}),
    };

    this.state = this.createInitialState("", {});
  }

  public getState(): MacroExecutionState {
    return { ...this.state };
  }

  public getScript(): MacroScript | null {
    return this.script;
  }

  public setSpeed(speed: number): void {
    this.state.playbackSpeed = Math.max(0, speed);
    this.notifyState();
  }

  public setVariables(vars: VariableContext): void {
    this.state.variables = { ...this.state.variables, ...vars };
    this.notifyState();
  }

  public prepare(
    script: MacroScript,
    initialVariables?: VariableContext,
  ): { valid: boolean; errors: string[] } {
    this.script = script;
    const errors: string[] = [];
    const resolvedVars: VariableContext = { ...this.options.initialVariables, ...initialVariables };

    // Validate parameters
    for (const def of script.parameters) {
      const val = resolvedVars[def.name] ?? def.defaultValue;
      const res = validateParameterValue(def, val);
      if (!res.valid) {
        errors.push(res.error ?? `Invalid value for parameter ${def.name}`);
      } else {
        resolvedVars[def.name] = res.coercedValue;
      }
    }

    this.state = this.createInitialState(script.id, resolvedVars);
    this.notifyState();

    return { valid: errors.length === 0, errors };
  }

  public async execute(
    script?: MacroScript,
    initialVariables?: VariableContext,
  ): Promise<MacroExecutionState> {
    if (script) {
      const prep = this.prepare(script, initialVariables);
      if (!prep.valid) {
        this.state.status = "error";
        for (const err of prep.errors) {
          this.log("error", `Parameter validation error: ${err}`);
        }
        this.notifyState();
        this.options.onFinish(this.state);
        return this.state;
      }
    }

    if (!this.script) {
      throw new Error("No MacroScript loaded to execute");
    }

    this.abortController = new AbortController();
    this.state.status = "running";
    this.state.startedAt = Date.now();
    this.notifyState();

    try {
      while (this.state.currentStepIndex < this.script.steps.length) {
        if (this.abortController.signal.aborted) {
          this.state.status = "aborted";
          break;
        }

        if ((this.state.status as MacroExecutionState["status"]) === "paused") {
          break;
        }

        const step = this.script.steps[this.state.currentStepIndex];
        if (!step) {
          break;
        }

        // Check for breakpoint (unless we are manually stepping)
        if (step.breakpoint && !this.isStepping && this.state.status === "running") {
          this.state.status = "paused";
          this.log(
            "info",
            `Paused at breakpoint on step ${this.state.currentStepIndex + 1}: ${step.label}`,
            step.id,
          );
          this.notifyState();
          break;
        }

        const stepSuccess = await this.executeStep(step, this.state.currentStepIndex);
        if (!stepSuccess && !step.continueOnError) {
          this.state.status = "error";
          break;
        }

        this.state.currentStepIndex++;
        this.updateProgress();
        this.notifyState();

        // Delay between steps unless speed is instantaneous
        if (this.state.playbackSpeed > 0 && Number.isFinite(this.state.playbackSpeed)) {
          const delayMs = Math.round(
            (step.delayAfterMs ?? (step.delayBeforeMs ? 50 : 200)) / this.state.playbackSpeed,
          );
          if (delayMs > 0) {
            await this.sleep(delayMs);
          }
        }
      }

      if (
        this.state.currentStepIndex >= (this.script?.steps.length ?? 0) &&
        this.state.status === "running"
      ) {
        this.state.status = "completed";
        this.state.completedAt = Date.now();
        this.state.elapsedMs =
          this.state.completedAt - (this.state.startedAt ?? this.state.completedAt);
        this.log("info", `Macro execution completed successfully in ${this.state.elapsedMs}ms`);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.state.status = "error";
      this.log("error", `Unexpected execution error: ${errorMsg}`);
    } finally {
      this.notifyState();
      this.options.onFinish(this.state);
    }

    return this.state;
  }

  public async stepForward(): Promise<boolean> {
    if (!this.script) return false;
    if (this.state.currentStepIndex >= this.script.steps.length) return false;

    const step = this.script.steps[this.state.currentStepIndex];
    if (!step) return false;

    this.isStepping = true;
    this.state.status = "running";
    this.notifyState();

    try {
      const success = await this.executeStep(step, this.state.currentStepIndex);
      this.state.currentStepIndex++;
      this.updateProgress();
      if (this.state.currentStepIndex >= this.script.steps.length) {
        this.state.status = "completed";
      } else {
        this.state.status = "paused";
      }
      return success;
    } finally {
      this.isStepping = false;
      this.notifyState();
    }
  }

  public async stepBackward(): Promise<boolean> {
    if (this.state.undoStack.length === 0 || this.state.currentStepIndex === 0) {
      return false;
    }

    const lastUndo = this.state.undoStack.pop();
    if (!lastUndo) return false;

    this.isStepping = true;
    this.state.status = "running";
    this.notifyState();

    try {
      await this.applyStepAction(lastUndo.inverseStep);
      this.state.currentStepIndex = Math.max(0, this.state.currentStepIndex - 1);
      this.updateProgress();
      this.state.status = "paused";
      this.log("info", `Reversed step: ${lastUndo.inverseStep.label}`, lastUndo.stepId);
      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.log("error", `Error reversing step: ${errorMsg}`, lastUndo.stepId);
      return false;
    } finally {
      this.isStepping = false;
      this.notifyState();
    }
  }

  public pause(): void {
    if (this.state.status === "running") {
      this.state.status = "paused";
      this.notifyState();
    }
  }

  public resume(): Promise<MacroExecutionState> {
    if (this.state.status === "paused") {
      return this.execute();
    }
    return Promise.resolve(this.state);
  }

  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.state.status = "aborted";
    this.notifyState();
  }

  public async jumpToStep(targetIndex: number): Promise<void> {
    if (!this.script) return;
    const clampedIndex = Math.max(0, Math.min(targetIndex, this.script.steps.length));

    // If target is ahead, execute forward
    while (this.state.currentStepIndex < clampedIndex) {
      const step = this.script.steps[this.state.currentStepIndex];
      if (!step) break;
      await this.executeStep(step, this.state.currentStepIndex);
      this.state.currentStepIndex++;
      this.updateProgress();
    }

    // If target is behind, undo backward
    while (this.state.currentStepIndex > clampedIndex && this.state.undoStack.length > 0) {
      await this.stepBackward();
    }

    this.notifyState();
  }

  public async reset(): Promise<void> {
    this.abort();
    // Roll back all recorded undo steps
    while (this.state.undoStack.length > 0) {
      const undoRecord = this.state.undoStack.pop();
      if (undoRecord) {
        try {
          await this.applyStepAction(undoRecord.inverseStep);
        } catch {
          // ignore
        }
      }
    }

    if (this.script) {
      this.state = this.createInitialState(this.script.id, this.state.variables);
    }
    this.notifyState();
  }

  private async executeStep(step: MacroStep, stepIndex: number): Promise<boolean> {
    if (!step.enabled) {
      this.log("info", `Skipped disabled step: ${step.label}`, step.id);
      return true;
    }

    this.options.onStepStart(stepIndex, step);
    this.log("info", `Executing: ${step.label}`, step.id);

    try {
      // Substitute variables in payload
      const resolvedPayload = substituteVariables(step.payload, this.state.variables, stepIndex);
      const resolvedStep: MacroStep = { ...step, payload: resolvedPayload };

      // Generate inverse step for undo
      const inverse = this.computeInverseStep(resolvedStep);

      // Execute action on target
      await this.applyStepAction(resolvedStep);

      if (inverse) {
        this.state.undoStack.push({
          stepIndex,
          stepId: step.id,
          inverseStep: inverse,
        });
      }

      this.options.onStepComplete(stepIndex, resolvedStep, inverse ?? undefined);
      return true;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const executionError: MacroExecutionError = {
        stepIndex,
        stepId: step.id,
        error: errorMsg,
        timestamp: Date.now(),
        stack: err instanceof Error ? err.stack : undefined,
      };
      this.state.errors.push(executionError);
      this.log("error", `Step failed: ${errorMsg}`, step.id);
      this.options.onError(executionError);
      return false;
    }
  }

  private computeInverseStep(step: MacroStep): MacroStep | null {
    const inverseId = `inv_${step.id}`;

    switch (step.type) {
      case "create_node": {
        const payload = step.payload as unknown as CreateNodePayload;
        const nodeId = payload.node?.id;
        if (!nodeId) return null;
        return {
          id: inverseId,
          type: "delete_node",
          label: `Undo Create Node: ${nodeId}`,
          payload: { nodeId } as unknown as Record<string, unknown>,
          enabled: true,
        };
      }
      case "delete_node": {
        const payload = step.payload as unknown as DeleteNodePayload;
        const nodes = this.target.getPositionedNodes();
        const existingNode = nodes.find((n) => n.id === payload.nodeId) ??
          payload.previousNode ?? {
            id: payload.nodeId,
            name: payload.nodeId,
            x: 0,
            y: 0,
            width: 120,
            height: 60,
            kind: "agent",
            status: "pending",
          };
        const edges = this.target.getPositionedEdges();
        const connected = edges.filter(
          (e) => e.source === payload.nodeId || e.target === payload.nodeId,
        );

        return {
          id: inverseId,
          type: "create_node",
          label: `Undo Delete Node: ${payload.nodeId}`,
          payload: {
            node: existingNode,
            restoreEdges: payload.connectedEdges ?? connected,
          } as unknown as Record<string, unknown>,
          enabled: true,
        };
      }
      case "move_node": {
        const payload = step.payload as unknown as MoveNodePayload;
        const nodes = this.target.getPositionedNodes();
        const currentNode = nodes.find((n) => n.id === payload.nodeId);
        const prevX = payload.previousPosition?.x ?? currentNode?.x ?? payload.x;
        const prevY = payload.previousPosition?.y ?? currentNode?.y ?? payload.y;

        return {
          id: inverseId,
          type: "move_node",
          label: `Undo Move Node: ${payload.nodeId}`,
          payload: {
            nodeId: payload.nodeId,
            x: prevX,
            y: prevY,
          } as unknown as Record<string, unknown>,
          enabled: true,
        };
      }
      case "update_node": {
        const payload = step.payload as unknown as UpdateNodePayload;
        const nodes = this.target.getPositionedNodes();
        const currentNode = nodes.find((n) => n.id === payload.nodeId);
        const patchKeys = Object.keys(payload.patch ?? {});
        const prevProps: Record<string, unknown> = { ...payload.previousProperties };

        if (currentNode) {
          for (const key of patchKeys) {
            if (prevProps[key] === undefined && key in currentNode) {
              prevProps[key] = (currentNode as unknown as Record<string, unknown>)[key];
            }
          }
        }

        return {
          id: inverseId,
          type: "update_node",
          label: `Undo Update Node: ${payload.nodeId}`,
          payload: {
            nodeId: payload.nodeId,
            patch: prevProps,
          } as unknown as Record<string, unknown>,
          enabled: true,
        };
      }
      case "create_edge": {
        const payload = step.payload as unknown as CreateEdgePayload;
        const edgeId = payload.edge?.id;
        if (!edgeId) return null;
        return {
          id: inverseId,
          type: "delete_edge",
          label: `Undo Connect Edge: ${edgeId}`,
          payload: { edgeId } as unknown as Record<string, unknown>,
          enabled: true,
        };
      }
      case "delete_edge": {
        const payload = step.payload as unknown as DeleteEdgePayload;
        const edges = this.target.getPositionedEdges();
        const existing = edges.find(
          (e) =>
            e.id === payload.edgeId || (e.source === payload.source && e.target === payload.target),
        ) ??
          payload.previousEdge ?? {
            id: payload.edgeId ?? `edge-${payload.source ?? "s"}-${payload.target ?? "t"}`,
            source: payload.source ?? "source",
            target: payload.target ?? "target",
            path: "",
            kind: "dependency",
          };
        return {
          id: inverseId,
          type: "create_edge",
          label: `Undo Delete Edge: ${existing.id}`,
          payload: { edge: existing } as unknown as Record<string, unknown>,
          enabled: true,
        };
      }
      case "update_edge": {
        const payload = step.payload as unknown as UpdateEdgePayload;
        const edges = this.target.getPositionedEdges();
        const currentEdge = edges.find((e) => e.id === payload.edgeId);
        const patchKeys = Object.keys(payload.patch ?? {});
        const prevProps: Record<string, unknown> = { ...payload.previousProperties };

        if (currentEdge) {
          for (const key of patchKeys) {
            if (prevProps[key] === undefined && key in currentEdge) {
              prevProps[key] = (currentEdge as unknown as Record<string, unknown>)[key];
            }
          }
        }

        return {
          id: inverseId,
          type: "update_edge",
          label: `Undo Update Edge: ${payload.edgeId}`,
          payload: {
            edgeId: payload.edgeId,
            patch: prevProps,
          } as unknown as Record<string, unknown>,
          enabled: true,
        };
      }
      case "select_node": {
        const payload = step.payload as unknown as SelectNodePayload;
        return {
          id: inverseId,
          type: "select_node",
          label: `Undo Select Node`,
          payload: { nodeId: payload.previousSelectedNodeId ?? null } as unknown as Record<
            string,
            unknown
          >,
          enabled: true,
        };
      }
      case "select_step": {
        const payload = step.payload as unknown as SelectStepPayload;
        return {
          id: inverseId,
          type: "select_step",
          label: `Undo Select Step`,
          payload: { step: payload.previousSelectedStep ?? null } as unknown as Record<
            string,
            unknown
          >,
          enabled: true,
        };
      }
      case "trigger_layout": {
        const payload = step.payload as unknown as TriggerLayoutPayload;
        return {
          id: inverseId,
          type: "trigger_layout",
          label: `Undo Trigger Layout`,
          payload: { layoutMode: payload.previousLayoutMode ?? "layered" } as unknown as Record<
            string,
            unknown
          >,
          enabled: true,
        };
      }
      case "set_viewport": {
        const payload = step.payload as unknown as SetViewportPayload;
        return {
          id: inverseId,
          type: "set_viewport",
          label: `Undo Set Viewport`,
          payload: {
            zoomLevel: payload.previousZoomLevel ?? 1,
            panOffset: payload.previousPanOffset ?? { x: 0, y: 0 },
          } as unknown as Record<string, unknown>,
          enabled: true,
        };
      }
      case "collapse_node": {
        const payload = step.payload as unknown as CollapseNodePayload;
        return {
          id: inverseId,
          type: "collapse_node",
          label: `Undo Collapse Node: ${payload.nodeId}`,
          payload: {
            nodeId: payload.nodeId,
            collapsed: !payload.collapsed,
          } as unknown as Record<string, unknown>,
          enabled: true,
        };
      }
      default:
        return null;
    }
  }

  private async applyStepAction(step: MacroStep): Promise<void> {
    const nodes = [...this.target.getPositionedNodes()];
    const edges = [...this.target.getPositionedEdges()];

    switch (step.type) {
      case "create_node": {
        const payload = step.payload as unknown as CreateNodePayload & {
          restoreEdges?: PositionedEdge[];
        };
        const baseNode = payload.node;
        // kind and status are open vocabulary and optional on GraphNodeData; the spread already
        // carries whatever the recorded step declared, and a step that declared neither leaves
        // both undefined rather than putting words like "agent" or "pending" in the node's mouth.
        const newNode: PositionedNode = {
          ...baseNode,
          id: String(baseNode.id),
          name: String(baseNode.name ?? baseNode.id),
          x: Number(baseNode.x ?? 0),
          y: Number(baseNode.y ?? 0),
          width: Number(baseNode.width ?? 180),
          height: Number(baseNode.height ?? 80),
        };

        // Remove if node with same ID exists already
        const filteredNodes = nodes.filter((n) => n.id !== newNode.id);
        filteredNodes.push(newNode);

        let updatedEdges = edges;
        if (payload.restoreEdges && Array.isArray(payload.restoreEdges)) {
          for (const edge of payload.restoreEdges) {
            if (!updatedEdges.some((e) => e.id === edge.id)) {
              updatedEdges.push(edge);
            }
          }
        }

        this.target.setPositionedGraph(filteredNodes, updatedEdges);
        break;
      }
      case "delete_node": {
        const payload = step.payload as unknown as DeleteNodePayload;
        const targetId = String(payload.nodeId);
        const filteredNodes = nodes.filter((n) => n.id !== targetId);
        const filteredEdges = edges.filter((e) => e.source !== targetId && e.target !== targetId);
        this.target.setPositionedGraph(filteredNodes, filteredEdges);
        break;
      }
      case "move_node": {
        const payload = step.payload as unknown as MoveNodePayload;
        const targetId = String(payload.nodeId);
        const updatedNodes = nodes.map((n) => {
          if (n.id === targetId) {
            const newX = payload.relative
              ? n.x + Number(payload.dx ?? payload.x)
              : Number(payload.x);
            const newY = payload.relative
              ? n.y + Number(payload.dy ?? payload.y)
              : Number(payload.y);
            return { ...n, x: newX, y: newY };
          }
          return n;
        });
        this.target.setPositionedGraph(updatedNodes, edges);
        break;
      }
      case "update_node": {
        const payload = step.payload as unknown as UpdateNodePayload;
        const targetId = String(payload.nodeId);
        const patch = payload.patch ?? {};
        const updatedNodes = nodes.map((n) => {
          if (n.id === targetId) {
            return { ...n, ...patch };
          }
          return n;
        });
        this.target.setPositionedGraph(updatedNodes, edges);
        break;
      }
      case "create_edge": {
        const payload = step.payload as unknown as CreateEdgePayload;
        const baseEdge = payload.edge;
        const newEdge: PositionedEdge = {
          ...baseEdge,
          id: String(baseEdge.id),
          source: String(baseEdge.source),
          target: String(baseEdge.target),
          path: baseEdge.path ?? "",
          kind: baseEdge.kind ?? "dependency",
        };
        const filteredEdges = edges.filter((e) => e.id !== newEdge.id);
        filteredEdges.push(newEdge);
        this.target.setPositionedGraph(nodes, filteredEdges);
        break;
      }
      case "delete_edge": {
        const payload = step.payload as unknown as DeleteEdgePayload;
        const filteredEdges = edges.filter((e) => {
          if (payload.edgeId && e.id === payload.edgeId) return false;
          if (
            payload.source &&
            payload.target &&
            e.source === payload.source &&
            e.target === payload.target
          )
            return false;
          return true;
        });
        this.target.setPositionedGraph(nodes, filteredEdges);
        break;
      }
      case "update_edge": {
        const payload = step.payload as unknown as UpdateEdgePayload;
        const targetId = String(payload.edgeId);
        const patch = payload.patch ?? {};
        const updatedEdges = edges.map((e) => {
          if (e.id === targetId) {
            return { ...e, ...patch };
          }
          return e;
        });
        this.target.setPositionedGraph(nodes, updatedEdges);
        break;
      }
      case "select_node": {
        const payload = step.payload as unknown as SelectNodePayload;
        if (this.target.setSelectedNodeId) {
          this.target.setSelectedNodeId(payload.nodeId !== undefined ? payload.nodeId : null);
        }
        break;
      }
      case "select_step": {
        const payload = step.payload as unknown as SelectStepPayload;
        if (this.target.setSelectedStep) {
          this.target.setSelectedStep(payload.step !== undefined ? payload.step : null);
        }
        break;
      }
      case "trigger_layout": {
        const payload = step.payload as unknown as TriggerLayoutPayload;
        if (payload.layoutMode && this.target.setLayoutMode) {
          this.target.setLayoutMode(payload.layoutMode);
        }
        if (payload.layoutConfig && this.target.setLayoutConfig) {
          this.target.setLayoutConfig(payload.layoutConfig);
        }
        break;
      }
      case "set_viewport": {
        const payload = step.payload as unknown as SetViewportPayload;
        if (payload.zoomLevel !== undefined && this.target.setZoomLevel) {
          this.target.setZoomLevel(payload.zoomLevel);
        }
        if (payload.panOffset && this.target.setPanOffset) {
          this.target.setPanOffset(payload.panOffset);
        }
        break;
      }
      case "collapse_node": {
        const payload = step.payload as unknown as CollapseNodePayload;
        if (this.target.toggleNodeCollapse) {
          this.target.toggleNodeCollapse(payload.nodeId);
        }
        break;
      }
      case "delay": {
        const payload = step.payload as unknown as DelayPayload;
        const ms = Number(payload.durationMs ?? 0);
        if (ms > 0 && this.state.playbackSpeed > 0 && Number.isFinite(this.state.playbackSpeed)) {
          await this.sleep(Math.round(ms / this.state.playbackSpeed));
        }
        break;
      }
      case "custom_action": {
        const payload = step.payload as unknown as CustomActionPayload & { shouldFail?: boolean };
        if (payload.actionName === "fail" || payload.shouldFail || payload.parameters?.shouldFail) {
          throw new Error(`Custom action "${payload.actionName}" failed.`);
        }
        this.log("info", `Custom action "${payload.actionName}" executed`, step.id);
        break;
      }
      case "batch_action": {
        const subSteps = (step.payload.steps as MacroStep[]) ?? [];
        for (let i = 0; i < subSteps.length; i++) {
          const subStep = subSteps[i];
          if (subStep) {
            await this.executeStep(subStep, i);
          }
        }
        break;
      }
    }
  }

  private updateProgress(): void {
    const total = this.script?.steps.length ?? 0;
    this.state.totalSteps = total;
    this.state.progress =
      total > 0 ? Math.min(1, Math.max(0, this.state.currentStepIndex / total)) : 0;
  }

  private log(level: "info" | "warn" | "error", message: string, stepId?: string): void {
    const entry: MacroExecutionLog = {
      stepIndex: this.state.currentStepIndex,
      stepId,
      message,
      timestamp: Date.now(),
      level,
    };
    this.state.logs.push(entry);
  }

  private notifyState(): void {
    this.options.onStateChange(this.getState());
  }

  private createInitialState(scriptId: string, variables: VariableContext): MacroExecutionState {
    return {
      scriptId,
      status: "idle",
      currentStepIndex: 0,
      totalSteps: this.script?.steps.length ?? 0,
      progress: 0,
      playbackSpeed: this.options.speedMultiplier,
      variables,
      errors: [],
      logs: [],
      elapsedMs: 0,
      undoStack: [],
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
