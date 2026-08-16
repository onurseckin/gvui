import type {
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  PositionedEdge,
  PositionedNode,
} from "../../types/graphData";

export type PlaybackSpeed = 0.5 | 1 | 2 | 5;

export const SPEED_OPTIONS: readonly PlaybackSpeed[] = [0.5, 1, 2, 5];

export interface StepStatusBreakdown {
  success: number;
  error: number;
  running: number;
  pending: number;
  skipped: number;
  total: number;
}

export interface PlaybackStepInfo {
  step: number;
  label: string;
  nodeCount: number;
  nodeIds: string[];
  statusBreakdown: StepStatusBreakdown;
  activeStatus: "success" | "error" | "running" | "neutral";
  summary?: string;
}

/**
 * Calculates status counts (success, error, running, pending, skipped, total) for nodes.
 */
export function getStepStatusBreakdown(
  nodes: (PositionedNode | GraphNodeData)[],
): StepStatusBreakdown {
  const breakdown: StepStatusBreakdown = {
    success: 0,
    error: 0,
    running: 0,
    pending: 0,
    skipped: 0,
    total: nodes.length,
  };

  for (const node of nodes) {
    const status = (node.status ?? "").toLowerCase();
    const metaStatus = String(node.metadata?.status ?? "").toLowerCase();
    const isError =
      status === "error" ||
      metaStatus.includes("error") ||
      metaStatus.includes("fail") ||
      node.badges?.some((b) => b.variant === "error");
    const isSuccess =
      status === "success" ||
      metaStatus.includes("complete") ||
      metaStatus.includes("success") ||
      node.badges?.some((b) => b.variant === "success");
    const isRunning =
      status === "running" ||
      metaStatus.includes("running") ||
      metaStatus.includes("active") ||
      metaStatus.includes("leased");

    if (isError) {
      breakdown.error++;
    } else if (isRunning) {
      breakdown.running++;
    } else if (isSuccess) {
      breakdown.success++;
    } else if (status === "skipped" || metaStatus.includes("skip")) {
      breakdown.skipped++;
    } else {
      breakdown.pending++;
    }
  }

  return breakdown;
}

/**
 * Extracts and sorts discrete step metadata from a graph dataset.
 */
export function extractPlaybackSteps(dataset: GraphDataset | null): PlaybackStepInfo[] {
  if (!dataset?.nodes || dataset.nodes.length === 0) {
    return [];
  }

  const stepMap = new Map<
    number,
    {
      label: string;
      nodeIds: string[];
      nodes: GraphNodeData[];
    }
  >();

  for (const node of dataset.nodes) {
    if (typeof node.step === "number" && !Number.isNaN(node.step)) {
      const stepNum = node.step;
      const existing = stepMap.get(stepNum);
      const nodeLabel = node.stepLabel ?? `Step ${stepNum}`;

      if (existing) {
        existing.nodeIds.push(node.id);
        existing.nodes.push(node);
        // If existing label is generic, prefer a more specific one
        if (existing.label === `Step ${stepNum}` && node.stepLabel) {
          existing.label = node.stepLabel;
        }
      } else {
        stepMap.set(stepNum, {
          label: nodeLabel,
          nodeIds: [node.id],
          nodes: [node],
        });
      }
    }
  }

  // Also check edge step numbers if present
  if (dataset.edges) {
    for (const edge of dataset.edges) {
      const edgeStepNum =
        typeof edge.stepNumber === "number"
          ? edge.stepNumber
          : typeof edge.stepNumber === "string" && /^\d+$/.test(edge.stepNumber)
            ? Number.parseInt(edge.stepNumber, 10)
            : null;

      if (edgeStepNum !== null && !stepMap.has(edgeStepNum)) {
        stepMap.set(edgeStepNum, {
          label: edge.container?.stepBadge ?? `Step ${edgeStepNum}`,
          nodeIds: [],
          nodes: [],
        });
      }
    }
  }

  const sortedEntries = Array.from(stepMap.entries()).sort(([a], [b]) => a - b);

  return sortedEntries.map(([step, info]) => {
    const breakdown = getStepStatusBreakdown(info.nodes);
    let activeStatus: "success" | "error" | "running" | "neutral" = "neutral";

    if (breakdown.error > 0) {
      activeStatus = "error";
    } else if (breakdown.running > 0) {
      activeStatus = "running";
    } else if (breakdown.success > 0) {
      activeStatus = "success";
    }

    return {
      step,
      label: info.label,
      nodeCount: info.nodes.length,
      nodeIds: info.nodeIds,
      statusBreakdown: breakdown,
      activeStatus,
      summary: info.nodes.map((n) => n.name).join(", "),
    };
  });
}

/**
 * Returns nodes active in the given step. When step is null, returns all nodes.
 */
export function getActiveStepNodes<T extends GraphNodeData | PositionedNode>(
  nodes: T[],
  step: number | null,
): T[] {
  if (step === null) return nodes;
  return nodes.filter((n) => n.step === step);
}

/**
 * Checks if a specific node is active in the given step.
 */
export function isNodeActiveInStep(
  node: GraphNodeData | PositionedNode,
  step: number | null,
): boolean {
  if (step === null) return true;
  return node.step === step;
}

/**
 * Returns edges active in the given step.
 */
export function getActiveStepEdges<T extends GraphEdgeData | PositionedEdge>(
  edges: T[],
  step: number | null,
): T[] {
  if (step === null) return edges;

  return edges.filter((edge) => {
    const edgeStepNum =
      typeof edge.stepNumber === "number"
        ? edge.stepNumber
        : typeof edge.stepNumber === "string" && /^\d+$/.test(edge.stepNumber)
          ? Number.parseInt(edge.stepNumber, 10)
          : null;

    if (edgeStepNum === step) return true;

    if (edge.traffic?.activeSteps) {
      for (const s of edge.traffic.activeSteps) {
        if (s === step || String(s) === String(step)) return true;
      }
    }

    if (edge.exchanges) {
      for (const ex of edge.exchanges) {
        if (
          ex.step === step ||
          ex.stepNumber === step ||
          String(ex.step) === String(step) ||
          String(ex.stepNumber) === String(step)
        ) {
          return true;
        }
      }
    }

    return false;
  });
}

/**
 * Checks if a specific edge is active in the given step.
 */
export function isEdgeActiveInStep(
  edge: GraphEdgeData | PositionedEdge,
  step: number | null,
): boolean {
  if (step === null) return true;
  return getActiveStepEdges([edge], step).length > 0;
}

/**
 * Calculates step progress from 0% to 100%.
 */
export function calculateStepProgress(
  currentStep: number | null,
  steps: PlaybackStepInfo[],
): number {
  if (steps.length <= 1 || currentStep === null) {
    return 100;
  }
  const currentIndex = steps.findIndex((s) => s.step === currentStep);
  if (currentIndex < 0) return 0;
  return Math.round((currentIndex / (steps.length - 1)) * 100);
}

/**
 * Computes next step in playback sequence with strict boundary and out-of-range protection.
 */
export function getNextStep(
  currentStep: number | null,
  steps: PlaybackStepInfo[],
  loop = false,
): number | null {
  if (steps.length === 0) return null;
  if (currentStep === null) return steps[0].step;

  const currentIndex = steps.findIndex((s) => s.step === currentStep);
  if (currentIndex < 0) {
    // If current step is less than min step, snap to first step
    if (currentStep < steps[0].step) return steps[0].step;
    // If current step is greater than max step, loop or return null
    if (currentStep > steps[steps.length - 1].step) return loop ? steps[0].step : null;
    // Otherwise find closest step greater than currentStep
    const nextIdx = steps.findIndex((s) => s.step > currentStep);
    return nextIdx >= 0 ? steps[nextIdx].step : loop ? steps[0].step : null;
  }

  if (currentIndex < steps.length - 1) {
    return steps[currentIndex + 1].step;
  }

  return loop ? steps[0].step : null;
}

/**
 * Computes previous step in playback sequence with strict boundary and out-of-range protection.
 */
export function getPreviousStep(
  currentStep: number | null,
  steps: PlaybackStepInfo[],
): number | null {
  if (steps.length === 0) return null;
  if (currentStep === null) return steps[steps.length - 1].step;

  const currentIndex = steps.findIndex((s) => s.step === currentStep);
  if (currentIndex < 0) {
    // If current step is greater than max, snap to last step
    if (currentStep > steps[steps.length - 1].step) return steps[steps.length - 1].step;
    // If current step is less than min, snap to first step
    if (currentStep < steps[0].step) return steps[0].step;
    // Otherwise find closest step less than currentStep
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].step < currentStep) return steps[i].step;
    }
    return steps[0].step;
  }

  if (currentIndex <= 0) return steps[0].step;

  return steps[currentIndex - 1].step;
}
