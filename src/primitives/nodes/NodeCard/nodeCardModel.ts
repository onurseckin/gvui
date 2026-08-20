/**
 * The single source of truth for *what text a node card puts on screen*.
 *
 * Both the React card and the layout measurer read their content through these selectors. That
 * shared dependency is the point: the previous card measured a `description` row and a `model` row
 * that the DOM never rendered, so every node was sized for content nobody could see. Two lists of
 * fields maintained by hand will always drift — one list cannot.
 *
 * Pure data only, no JSX: `nodeTemplate.ts` runs inside the layout pipeline, which has no React.
 */
import type { FileRef, GraphNodeData } from "../../../types/graphData";
import { UNKNOWN_LABEL } from "../../../state/graphSchema";

/**
 * Chip caps. A card is a fixed box in a laid-out graph, so an unbounded chip list would either
 * overflow it or force the layout engine to reserve a tall box for the worst case. Overflow
 * collapses into a `+N` chip that opens the drawer instead.
 */
export const MAX_TOOL_CHIPS = 4;
export const MAX_FILE_CHIPS = 3;

/** Lines of prose the card shows before the rest is drawer-only. */
export const MAX_DESCRIPTION_LINES = 4;

export interface ChipSelection {
  shown: string[];
  overflow: number;
}

function takeWithOverflow(labels: string[], max: number): ChipSelection {
  const cleaned = labels.map((label) => label.trim()).filter((label) => label.length > 0);
  if (cleaned.length <= max) {
    return { shown: cleaned, overflow: 0 };
  }
  return { shown: cleaned.slice(0, max), overflow: cleaned.length - max };
}

export function formatOverflowLabel(overflow: number): string {
  return `+${overflow}`;
}

export function selectToolChips(node: GraphNodeData): ChipSelection {
  return takeWithOverflow(
    (node.tools ?? []).map((tool) => tool.name ?? ""),
    MAX_TOOL_CHIPS,
  );
}

/**
 * Which glyph family a tool name belongs to.
 *
 * The classification lives here rather than beside the icons because it has two consumers that
 * cannot share markup: the React chip renders an inline SVG, the standalone HTML exporter emits a
 * string. Sharing the *name matching* keeps the one part that can silently disagree in one place.
 */
export type ToolIconKind = "search" | "shell" | "file" | "web" | "generic";

export function classifyTool(name: string): ToolIconKind {
  const lower = name.toLowerCase();
  if (lower.includes("grep") || lower.includes("search") || lower.includes("find")) return "search";
  if (
    lower.includes("bash") ||
    lower.includes("shell") ||
    lower.includes("exec") ||
    lower.includes("script") ||
    lower.includes(".sh")
  ) {
    return "shell";
  }
  if (
    lower.includes("read") ||
    lower.includes("write") ||
    lower.includes("edit") ||
    lower.includes("file") ||
    lower.includes("glob")
  ) {
    return "file";
  }
  if (
    lower.includes("http") ||
    lower.includes("fetch") ||
    lower.includes("web") ||
    lower.includes("url") ||
    lower.includes("browser")
  ) {
    return "web";
  }
  return "generic";
}

/** `src/auth/login.ts:12-40` renders as `login.ts:12-40` — the basename carries the meaning. */
export function formatFileChipLabel(file: FileRef): string {
  const path = file.path ?? "";
  const base = path.split("/").filter(Boolean).pop() ?? path;
  return file.lines ? `${base}:${file.lines}` : base;
}

export interface FileChipSelection {
  shown: FileRef[];
  overflow: number;
}

/**
 * The refs the card renders. `selectFileChips` derives its labels from this rather than filtering
 * separately, so the measured strings and the drawn chips cannot disagree about which files made
 * the cut.
 */
export function selectFileRefs(node: GraphNodeData): FileChipSelection {
  const usable = (node.files ?? []).filter((file) => (file.path ?? "").trim().length > 0);
  if (usable.length <= MAX_FILE_CHIPS) {
    return { shown: usable, overflow: 0 };
  }
  return { shown: usable.slice(0, MAX_FILE_CHIPS), overflow: usable.length - MAX_FILE_CHIPS };
}

export function selectFileChips(node: GraphNodeData): ChipSelection {
  const { shown, overflow } = selectFileRefs(node);
  return { shown: shown.map(formatFileChipLabel), overflow };
}

export function selectDescription(node: GraphNodeData): string[] {
  const trimmed = node.description?.trim();
  return trimmed ? [trimmed] : [];
}

/**
 * The header's model chip: the reported model name and nothing else. The header is the card's
 * tightest row, so the tier, the evidence class and the token counts stay in the drawer.
 */
export function selectModelChip(node: GraphNodeData): string[] {
  const trimmed = node.telemetry?.model?.value?.trim();
  return trimmed ? [trimmed] : [];
}

export function formatTokens(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0";
  if (value < 1000) return String(Math.round(value));
  if (value < 1_000_000) {
    const thousands = value / 1000;
    return `${thousands < 10 ? thousands.toFixed(1) : Math.round(thousands)}k`;
  }
  const millions = value / 1_000_000;
  return `${millions < 10 ? millions.toFixed(1) : Math.round(millions)}M`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) {
    const seconds = ms / 1000;
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function formatCost(usd: number): string {
  if (!Number.isFinite(usd) || usd < 0) return "$0";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(4)}`;
}

/** Dollars the run actually recorded. An absent figure says so instead of showing $0. */
export function formatRecordedCost(usd: number | undefined): string {
  return usd === undefined ? UNKNOWN_LABEL : formatCost(usd);
}

/**
 * The one-line footer: `↓12.4k ↑840 · 2.3s · $0.041 · ↻2`.
 *
 * Returns an empty list when a node carries no metrics at all, which is the normal case for a plan
 * that has not run yet — the row then costs nothing in either the DOM or the measured height.
 */
export function selectMetricsLine(node: GraphNodeData): string[] {
  const metrics = node.metrics;
  if (!metrics) return [];

  const segments: string[] = [];

  const tokenParts: string[] = [];
  if (typeof metrics.tokensIn === "number") tokenParts.push(`↓${formatTokens(metrics.tokensIn)}`);
  if (typeof metrics.tokensOut === "number") tokenParts.push(`↑${formatTokens(metrics.tokensOut)}`);
  if (tokenParts.length > 0) segments.push(tokenParts.join(" "));

  if (typeof metrics.durationMs === "number") segments.push(formatDuration(metrics.durationMs));
  if (typeof metrics.costUsd === "number") segments.push(formatCost(metrics.costUsd));
  if (typeof metrics.retries === "number" && metrics.retries > 0) {
    segments.push(`↻${metrics.retries}`);
  }

  return segments.length > 0 ? [segments.join("  ·  ")] : [];
}
