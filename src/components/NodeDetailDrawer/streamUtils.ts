import type { GraphEdgeData, IoPort } from "../../types/graphData";

/**
 * Format raw byte size into human-readable representation.
 */
export function formatBytes(bytes: number): string {
  if (bytes <= 0 || Number.isNaN(bytes)) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Calculate UTF-8 byte length for payload string.
 */
export function getByteLength(str: string): number {
  if (!str) return 0;
  return new TextEncoder().encode(str).length;
}

/**
 * Convert graph edge data into an IoPort stream without generic boilerplate labels.
 * Strips repeating "(handoff)" and default placeholders in favor of descriptive peer names.
 */
export function edgeToPort(edge: GraphEdgeData, direction: "in" | "out"): IoPort {
  const peerNode = direction === "in" ? edge.source : edge.target;
  const defaultLabel = direction === "in" ? `Input from ${peerNode}` : `Output to ${peerNode}`;

  let label = edge.handoff?.summary || edge.condition || edge.label || "";
  if (!label || label === "(handoff)" || label.toLowerCase() === "summary") {
    label = defaultLabel;
  }

  return {
    node: peerNode,
    kind: edge.handoff?.kind ?? "summary",
    label,
    tokens: edge.handoff?.tokens,
  };
}
