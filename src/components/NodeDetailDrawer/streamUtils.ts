import type { GraphEdgeData, IoPort } from "../../types/graphData";

/**
 * Format raw byte size into human-readable representation.
 * Enforces strict finite number validation.
 */
export function formatBytes(bytes: number): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || Number.isNaN(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format token count into compact notation (e.g. 840, 12.4k, 1.2M).
 * Enforces strict finite number validation.
 */
export function formatTokens(value: number): string {
  if (typeof value !== "number" || !Number.isFinite(value) || Number.isNaN(value) || value <= 0) {
    return "0";
  }
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) {
    const thousands = value / 1000;
    return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`;
  }
  const millions = value / 1_000_000;
  return `${millions < 10 ? millions.toFixed(1) : Math.round(millions)}M`;
}

/**
 * Format duration in milliseconds into human-readable timing (e.g. 450ms, 2.3s, 3m 12s).
 * Enforces strict finite number validation.
 */
export function formatDuration(ms: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms) || Number.isNaN(ms) || ms <= 0) {
    return "0ms";
  }
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Format cost in USD to appropriate precision.
 * Enforces strict finite number validation.
 */
export function formatCost(usd: number): string {
  if (typeof usd !== "number" || !Number.isFinite(usd) || Number.isNaN(usd) || usd <= 0) {
    return "$0";
  }
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

/**
 * Calculate UTF-8 byte length for payload string.
 */
export function getByteLength(str: string): number {
  if (!str) return 0;
  return new TextEncoder().encode(str).length;
}

/**
 * Robust clipboard copy utility that attempts navigator.clipboard.writeText
 * and falls back to an off-screen textarea with document.execCommand('copy')
 * if navigator.clipboard is unavailable, throws, or rejects (e.g. in insecure contexts or headless environments).
 * Returns a Promise<boolean> indicating whether the copy succeeded.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  // 1. Try modern navigator.clipboard.writeText
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy execCommand fallback
    }
  }

  // 2. Fallback to document.execCommand('copy') with off-screen textarea
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      // Prevent scrolling to bottom of page in some browsers
      textarea.style.position = "fixed";
      textarea.style.top = "0";
      textarea.style.left = "0";
      textarea.style.width = "2em";
      textarea.style.height = "2em";
      textarea.style.padding = "0";
      textarea.style.border = "none";
      textarea.style.outline = "none";
      textarea.style.boxShadow = "none";
      textarea.style.background = "transparent";
      textarea.setAttribute("readonly", "");
      textarea.setAttribute("aria-hidden", "true");
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      textarea.setSelectionRange(0, textarea.value.length);

      const successful = document.execCommand("copy");
      document.body.removeChild(textarea);
      return Boolean(successful);
    } catch {
      return false;
    }
  }

  return false;
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
