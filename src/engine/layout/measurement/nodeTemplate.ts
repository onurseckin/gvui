/**
 * Declarative description of what a node card puts on screen, in the same order the DOM does.
 *
 * v1 computed node size with hand-rolled arithmetic (`node.name.length * 11 + 90`, a per-section
 * pile of magic constants). It was wrong for any non-monospace font and drifted silently every
 * time the card gained a row. Here the rows are data: the measurer walks them, so adding a row to
 * `NodeCard` means adding one entry below and nothing else.
 *
 * The `select` functions are *imported from the card's own model* rather than reimplemented. That
 * is deliberate and load-bearing: this file once measured a `description` row and a `model` row
 * that `NodeCard` had stopped rendering, so every node in every graph reserved height for content
 * nobody could see. Two hand-maintained lists of fields will drift; one shared list cannot.
 *
 * Geometry constants are read off `src/primitives/nodes/NodeCard/NodeCard.css`.
 */
import {
  MAX_DESCRIPTION_LINES,
  formatOverflowLabel,
  selectDescription,
  selectFileChips,
  selectMetricsLine,
  selectModelChip,
  selectToolChips,
} from "../../../primitives/nodes/NodeCard/nodeCardModel";
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
  /** Chrome that never wraps and always reserves width (status dot, kind icon, collapse button). */
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

/** A capped chip row renders its overflow counter as one extra, narrower pill. */
function selectToolOverflow(node: GraphNodeData): string[] {
  const { overflow } = selectToolChips(node);
  return overflow > 0 ? [formatOverflowLabel(overflow)] : [];
}

function selectFileOverflow(node: GraphNodeData): string[] {
  const { overflow } = selectFileChips(node);
  return overflow > 0 ? [formatOverflowLabel(overflow)] : [];
}

/** `.node-chip`: 8px padding and a 1px border per side, plus a 12px icon and its 4px gap. */
const CHIP_CHROME_WITH_ICON = 34;
/** The `+N` pill carries no icon. */
const CHIP_CHROME_BARE = 18;

export const DEFAULT_NODE_TEMPLATE: Readonly<NodeTemplate> = Object.freeze({
  padding: 10,
  // 8px top padding + an 18px title line + 8px bottom padding + a 1px bottom border.
  headerHeight: 35,
  rowGap: 8,
  rows: Object.freeze([
    {
      id: "identity",
      kind: "flow",
      // 8px status dot + 6px gap + 14px kind icon + 6px gap, then 8px header gap + 6px aside gap
      // + an 18px collapse button on the right.
      fixedChrome: 66,
      itemGap: 6,
      lineHeight: 18,
      maxLines: 1,
      inHeader: true,
      segments: [
        { fontKey: FONT_KEYS.nodeTitle, itemChrome: 0, select: (n) => [n.name].filter(Boolean) },
        {
          fontKey: FONT_KEYS.nodeTypeTag,
          itemChrome: 12,
          select: (n) => (n.type ? [n.type] : []),
        },
        { fontKey: FONT_KEYS.nodeTypeTag, itemChrome: 14, select: selectModelChip },
      ],
    },
    {
      id: "description",
      kind: "wrap",
      fixedChrome: 0,
      itemGap: 0,
      lineHeight: 15,
      maxLines: MAX_DESCRIPTION_LINES,
      segments: [{ fontKey: FONT_KEYS.nodeBody, itemChrome: 0, select: selectDescription }],
    },
    {
      id: "tools",
      kind: "flow",
      fixedChrome: 0,
      itemGap: 4,
      // An 18px chip plus the 4px gap to the row below it.
      lineHeight: 22,
      maxLines: 2,
      segments: [
        {
          fontKey: FONT_KEYS.nodeChip,
          itemChrome: CHIP_CHROME_WITH_ICON,
          select: (n) => selectToolChips(n).shown,
        },
        {
          fontKey: FONT_KEYS.nodeChip,
          itemChrome: CHIP_CHROME_BARE,
          select: selectToolOverflow,
        },
      ],
    },
    {
      id: "files",
      kind: "flow",
      fixedChrome: 0,
      itemGap: 4,
      lineHeight: 22,
      maxLines: 2,
      segments: [
        {
          fontKey: FONT_KEYS.nodeChip,
          itemChrome: CHIP_CHROME_WITH_ICON,
          select: (n) => selectFileChips(n).shown,
        },
        {
          fontKey: FONT_KEYS.nodeChip,
          itemChrome: CHIP_CHROME_BARE,
          select: selectFileOverflow,
        },
      ],
    },
    {
      id: "metrics",
      kind: "wrap",
      fixedChrome: 0,
      itemGap: 0,
      lineHeight: 14,
      maxLines: 1,
      segments: [{ fontKey: FONT_KEYS.nodeMetrics, itemChrome: 0, select: selectMetricsLine }],
    },
  ] satisfies NodeRowSpec[]),
});
