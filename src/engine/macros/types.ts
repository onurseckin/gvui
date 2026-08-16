import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";

export type MacroActionType =
  | "create_node"
  | "delete_node"
  | "move_node"
  | "update_node"
  | "create_edge"
  | "delete_edge"
  | "update_edge"
  | "select_node"
  | "select_step"
  | "trigger_layout"
  | "set_viewport"
  | "collapse_node"
  | "custom_action"
  | "delay"
  | "batch_action";

export interface CreateNodePayload {
  node: Partial<PositionedNode> & { id: string; name: string };
  [key: string]: unknown;
}

export interface DeleteNodePayload {
  nodeId: string;
  previousNode?: PositionedNode;
  connectedEdges?: PositionedEdge[];
  [key: string]: unknown;
}

export interface MoveNodePayload {
  nodeId: string;
  x: number;
  y: number;
  dx?: number;
  dy?: number;
  relative?: boolean;
  previousPosition?: { x: number; y: number };
  [key: string]: unknown;
}

export interface UpdateNodePayload {
  nodeId: string;
  patch: Record<string, unknown>;
  previousProperties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CreateEdgePayload {
  edge: Partial<PositionedEdge> & { id: string; source: string; target: string };
  [key: string]: unknown;
}

export interface DeleteEdgePayload {
  edgeId?: string;
  source?: string;
  target?: string;
  previousEdge?: PositionedEdge;
  [key: string]: unknown;
}

export interface UpdateEdgePayload {
  edgeId: string;
  patch: Record<string, unknown>;
  previousProperties?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SelectNodePayload {
  nodeId: string | null;
  previousSelectedNodeId?: string | null;
  [key: string]: unknown;
}

export interface SelectStepPayload {
  step: number | null;
  previousSelectedStep?: number | null;
  [key: string]: unknown;
}

export interface TriggerLayoutPayload {
  layoutMode?: "layered" | "radial" | string;
  layoutConfig?: Record<string, unknown>;
  previousLayoutMode?: string;
  [key: string]: unknown;
}

export interface SetViewportPayload {
  zoomLevel?: number;
  panOffset?: { x: number; y: number };
  previousZoomLevel?: number;
  previousPanOffset?: { x: number; y: number };
  [key: string]: unknown;
}

export interface CollapseNodePayload {
  nodeId: string;
  collapsed?: boolean;
  previousCollapsed?: boolean;
  [key: string]: unknown;
}

export interface DelayPayload {
  durationMs: number;
  [key: string]: unknown;
}

export interface CustomActionPayload {
  actionName: string;
  parameters?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BatchActionPayload {
  steps: MacroStep[];
  concurrency?: number;
  [key: string]: unknown;
}

export interface MacroStep {
  id: string;
  type: MacroActionType;
  label: string;
  description?: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  delayBeforeMs?: number;
  delayAfterMs?: number;
  timeoutMs?: number;
  retryCount?: number;
  continueOnError?: boolean;
  breakpoint?: boolean;
  timestamp?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export type ParameterType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "select"
  | "nodeId"
  | "edgeId";

export interface ParameterOption {
  label: string;
  value: unknown;
}

export interface ParameterValidation {
  min?: number;
  max?: number;
  pattern?: string;
  customValidator?: string;
}

export interface ParameterDefinition {
  name: string;
  label: string;
  description?: string;
  type: ParameterType;
  defaultValue: unknown;
  required?: boolean;
  options?: ParameterOption[];
  validation?: ParameterValidation;
}

export type VariableContext = Record<string, unknown>;

export type MacroTriggerType = "manual" | "hotkey" | "event" | "schedule" | "hook";

export interface MacroTrigger {
  type: MacroTriggerType;
  hotkey?: string;
  eventPattern?: string;
  condition?: string;
}

export interface MacroScript {
  id: string;
  name: string;
  description?: string;
  version: string;
  author?: string;
  tags?: string[];
  category?: string;
  parameters: ParameterDefinition[];
  steps: MacroStep[];
  triggers?: MacroTrigger[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export type MacroExecutionStatus =
  | "idle"
  | "running"
  | "paused"
  | "completed"
  | "error"
  | "aborted";

export interface MacroExecutionLog {
  stepIndex: number;
  stepId?: string;
  message: string;
  timestamp: number;
  level: "info" | "warn" | "error";
}

export interface MacroExecutionError {
  stepIndex: number;
  stepId: string;
  error: string;
  timestamp: number;
  stack?: string;
}

export interface InverseStepRecord {
  stepIndex: number;
  stepId: string;
  inverseStep: MacroStep;
}

export interface MacroExecutionState {
  scriptId: string;
  status: MacroExecutionStatus;
  currentStepIndex: number;
  totalSteps: number;
  progress: number;
  playbackSpeed: number;
  variables: VariableContext;
  errors: MacroExecutionError[];
  logs: MacroExecutionLog[];
  startedAt?: number;
  completedAt?: number;
  elapsedMs: number;
  undoStack: InverseStepRecord[];
}

export interface MacroEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: number;
  targetId?: string;
}

export type BatchErrorPolicy = "stop-on-error" | "continue-on-error" | "rollback-on-error";
export type BatchConcurrencyMode = "sequential" | "parallel";

export interface BatchElementTarget {
  id: string;
  name?: string;
  kind?: string;
  status?: string;
  data?: Record<string, unknown>;
}

export interface BatchItemResult {
  elementId: string;
  elementName?: string;
  success: boolean;
  error?: string;
  durationMs: number;
  logs: MacroExecutionLog[];
  executedSteps: number;
}

export interface BatchExecutionResult {
  batchId: string;
  scriptId: string;
  totalElements: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  status: "completed" | "failed" | "rolled-back" | "aborted";
  durationMs: number;
  results: BatchItemResult[];
  errors: Array<{ elementId: string; error: string }>;
}

export interface BatchProcessorOptions {
  errorPolicy?: BatchErrorPolicy;
  concurrencyMode?: BatchConcurrencyMode;
  concurrencyLimit?: number;
  speedMultiplier?: number;
  onProgress?: (progress: { completed: number; total: number; currentItem?: string }) => void;
  onItemComplete?: (result: BatchItemResult) => void;
}

export interface GraphTargetAdapter {
  getDataset?: () => GraphDataset | null;
  setDataset?: (dataset: GraphDataset | null) => void;
  getPositionedNodes: () => PositionedNode[];
  getPositionedEdges: () => PositionedEdge[];
  setPositionedGraph: (nodes: PositionedNode[], edges: PositionedEdge[]) => void;
  setSelectedNodeId?: (nodeId: string | null) => void;
  setSelectedStep?: (step: number | null) => void;
  setLayoutMode?: (mode: string) => void;
  setLayoutConfig?: (config: Record<string, unknown>) => void;
  setPanOffset?: (offset: { x: number; y: number }) => void;
  setZoomLevel?: (zoom: number) => void;
  toggleNodeCollapse?: (nodeId: string) => void;
  centerNodeOnCanvas?: (nodeId: string) => void;
}
