import { useMemo } from "react";
import { getActiveStepEdges } from "../../components/PlaybackControls";
import type { PositionedEdge, PositionedNode } from "../../types/graphData";

export interface PlaybackHighlightState {
  activeNodeIds: Set<string>;
  activeEdgeIds: Set<string>;
  pulsingEdgeIds: Set<string>;
  completedNodeIds: Set<string>;
  pendingNodeIds: Set<string>;
}

/**
 * Calculates node and edge highlight states for the given time-travel step.
 * When selectedStep is null, or isPulsingActive is false, pulsingEdgeIds is cleared.
 */
export function computePlaybackHighlights(
  nodes: PositionedNode[],
  edges: PositionedEdge[],
  selectedStep: number | null,
  isPulsingActive = true,
): PlaybackHighlightState {
  const activeNodeIds = new Set<string>();
  const activeEdgeIds = new Set<string>();
  const pulsingEdgeIds = new Set<string>();
  const completedNodeIds = new Set<string>();
  const pendingNodeIds = new Set<string>();

  if (selectedStep === null) {
    for (const node of nodes) {
      activeNodeIds.add(node.id);
    }
    for (const edge of edges) {
      activeEdgeIds.add(edge.id);
    }
    return {
      activeNodeIds,
      activeEdgeIds,
      pulsingEdgeIds,
      completedNodeIds,
      pendingNodeIds,
    };
  }

  // Nodes classification based on step
  for (const node of nodes) {
    if (typeof node.step === "number") {
      if (node.step === selectedStep) {
        activeNodeIds.add(node.id);
      } else if (node.step < selectedStep) {
        completedNodeIds.add(node.id);
      } else {
        pendingNodeIds.add(node.id);
      }
    } else {
      activeNodeIds.add(node.id);
    }
  }

  // Active edges for current step
  const activeEdges = getActiveStepEdges(edges, selectedStep);
  for (const edge of activeEdges) {
    activeEdgeIds.add(edge.id);
    if (isPulsingActive) {
      pulsingEdgeIds.add(edge.id);
    }
  }

  // If no explicit edge steps, include edges connecting active nodes
  for (const edge of edges) {
    if (activeNodeIds.has(edge.source) && activeNodeIds.has(edge.target)) {
      activeEdgeIds.add(edge.id);
      if (isPulsingActive) {
        pulsingEdgeIds.add(edge.id);
      }
    }
  }

  return {
    activeNodeIds,
    activeEdgeIds,
    pulsingEdgeIds,
    completedNodeIds,
    pendingNodeIds,
  };
}

/**
 * Hook to compute real-time playback highlight and pulsing states.
 */
export function usePlaybackHighlights(
  nodes: PositionedNode[],
  edges: PositionedEdge[],
  selectedStep: number | null,
  isPulsingActive = true,
): PlaybackHighlightState {
  return useMemo(
    () => computePlaybackHighlights(nodes, edges, selectedStep, isPulsingActive),
    [nodes, edges, selectedStep, isPulsingActive],
  );
}
