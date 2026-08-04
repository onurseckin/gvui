/**
 * Declarative description of what a node card puts on screen, in the same order the DOM does.
 *
 * v1 computed node size with hand-rolled arithmetic (`node.name.length * 11 + 90`, a per-section
 * pile of magic constants). It was wrong for any non-monospace font and drifted silently every
 * time the card gained a row. Here the rows are data: the measurer walks them, so adding a row to
 * `NodeCard` means adding one entry below and nothing else.
 *
 * Constants are read off `src/primitives/nodes/NodeCard/NodeCard.css`.
 */
import type { GraphNodeData } from "../../../types/graphData";
import { FONT_KEYS } from "./types";

/**
 * `wrap` — prose: each selected string is wrapped independently and stacks vertically.
 * `flow` — pills: items sit side by side and wrap onto further lines when they run out of room.
 */
export type NodeRowKind = "wrap" | "flow";

export interface NodeRowSegment {
  fontKey: string;
  /** Non-text px around each item: pill padding + border, plus any leading icon and its gap. */
  itemChrome: number;
  select(node: GraphNodeData): string[];
}

export interface NodeRowSpec {
  id: string;
  kind: NodeRowKind;
  segments: NodeRowSegment[];
  /** Vertical advance of one line of this row, including its share of intra-row gap. */
  lineHeight: number;
  /** Hard cap on lines. Bounds the tallest a single row can make a card. */
  maxLines: number;
  /** Horizontal gap between `flow` items. Unused by `wrap`. */
  itemGap: number;
  /** Chrome that never wraps and always reserves width (status dot, collapse button). */
  fixedChrome: number;
  /**
   * Rows painted inside the card header contribute *width* but not *height*: `headerHeight`
   * already covers them, so counting them again would double-count the header band.
   */
  inHeader?: boolean;
}

export interface NodeTemplate {
  /** `.node-card` padding. Applied on both sides horizontally, bottom only vertically. */
  padding: number;
  /** `.node-card-header` band: vertical padding + title line + bottom border. */
  headerHeight: number;
  /** `.node-card` flex `gap`, charged once per visible body row. */
  rowGap: number;
  rows: readonly NodeRowSpec[];
}

function nonEmpty(value: string | undefined): string[] {
  const trimmed = value?.trim();
  return trimmed ? [trimmed] : [];
}

function selectModel(node: GraphNodeData): string[] {
  const parts = [node.model, node.harnessModel].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  return parts.length > 0 ? [parts.join(" · ")] : [];
}

/**
 * Mirrors `NodeCardContext`, which flattens context and metadata into `key: value` rows and skips
 * non-scalar values. Long-form metadata (`prompt`, `logs`, ...) lives in a collapsed `<details>`
 * and must not inflate the resting size of the card.
 */
const SKIPPED_METADATA_KEYS = new Set(["prompt", "logs", "payload", "rawPayload", "status"]);

function selectContext(node: GraphNodeData): string[] {
  const rows: string[] = [];
  const context = node.context;

  if (context) {
    if (context.repoPath) {
      rows.push(`Repo Path: ${context.repoPath}`);
    }
    for (const [key, value] of Object.entries(context)) {
      if (key === "repoPath" || key === "previousOutputs") continue;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        rows.push(`${key}: ${String(value)}`);
      }
    }
  }

  if (node.metadata) {
    for (const [key, value] of Object.entries(node.metadata)) {
      if (SKIPPED_METADATA_KEYS.has(key)) continue;
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        rows.push(`${key}: ${String(value)}`);
      }
    }
  }

  return rows;
}

export const DEFAULT_NODE_TEMPLATE: Readonly<NodeTemplate> = Object.freeze({
  padding: 10,
  headerHeight: 34,
  rowGap: 8,
  rows: Object.freeze([
    {
      id: "name",
      kind: "flow",
      // 8px status dot + 8px gap + 26px collapse button + 8px gap to the title block.
      fixedChrome: 50,
      itemGap: 8,
      lineHeight: 18,
      maxLines: 1,
      inHeader: true,
      segments: [
        { fontKey: FONT_KEYS.nodeTitle, itemChrome: 0, select: (n) => nonEmpty(n.name) },
        { fontKey: FONT_KEYS.nodeTypeTag, itemChrome: 14, select: (n) => nonEmpty(n.type) },
      ],
    },
    {
      id: "description",
      kind: "wrap",
      fixedChrome: 0,
      itemGap: 0,
      lineHeight: 15,
      maxLines: 3,
      segments: [
        { fontKey: FONT_KEYS.nodeBody, itemChrome: 0, select: (n) => nonEmpty(n.description) },
      ],
    },
    {
      id: "badges",
      kind: "flow",
      fixedChrome: 0,
      itemGap: 4,
      lineHeight: 22,
      maxLines: 3,
      segments: [
        {
          fontKey: FONT_KEYS.nodeChip,
          // 9px horizontal padding + 1px border, both sides.
          itemChrome: 20,
          select: (n) => (n.badges ?? []).map((b) => b.label ?? ""),
        },
      ],
    },
    {
      id: "tools",
      kind: "flow",
      fixedChrome: 0,
      itemGap: 4,
      lineHeight: 22,
      maxLines: 3,
      segments: [
        {
          fontKey: FONT_KEYS.nodeChip,
          // 8px padding + 1px border both sides, plus a 12px icon and its 4px gap.
          itemChrome: 34,
          select: (n) => (n.tools ?? []).map((t) => t.name ?? ""),
        },
      ],
    },
    {
      id: "model",
      kind: "wrap",
      fixedChrome: 0,
      itemGap: 0,
      lineHeight: 16,
      maxLines: 1,
      segments: [{ fontKey: FONT_KEYS.nodeBody, itemChrome: 0, select: selectModel }],
    },
    {
      id: "context",
      kind: "wrap",
      fixedChrome: 0,
      itemGap: 0,
      lineHeight: 15,
      maxLines: 4,
      segments: [{ fontKey: FONT_KEYS.nodeBody, itemChrome: 0, select: selectContext }],
    },
  ] satisfies NodeRowSpec[]),
});
