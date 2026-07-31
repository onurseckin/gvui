import type { CustomLayoutConfig } from "./config";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG } from "./config";
import type { NormalizedEdge, Rect } from "./types";

const MIN_BADGE_WIDTH = 60;
const BADGE_HEIGHT = 28;
const CHAR_WIDTH = 7;
const HORIZONTAL_PADDING = 24;

export function hasBadge(label?: string, isCycle = false): boolean {
  const hasLabelText = Boolean(label && label.trim().length > 0);
  return hasLabelText || isCycle;
}

export function getBadgeDisplayText(label?: string, isCycle = false): string | null {
  if (!hasBadge(label, isCycle)) {
    return null;
  }
  const trimmedLabel = label ? label.trim() : "";
  if (isCycle) {
    return trimmedLabel ? `↺ ${trimmedLabel}` : "↺";
  }
  return trimmedLabel;
}

export function measureBadgeRect(
  label: string,
  _config: CustomLayoutConfig = DEFAULT_CUSTOM_LAYOUT_CONFIG,
  isCycle = false
): Rect {
  const displayText = getBadgeDisplayText(label, isCycle);
  if (!displayText) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const width = Math.max(MIN_BADGE_WIDTH, displayText.length * CHAR_WIDTH + HORIZONTAL_PADDING);
  const height = BADGE_HEIGHT;

  return {
    x: 0,
    y: 0,
    width,
    height,
  };
}

export function measureBadgeRects(
  edges: NormalizedEdge[],
  config: CustomLayoutConfig = DEFAULT_CUSTOM_LAYOUT_CONFIG
): Map<string, Rect> {
  const result = new Map<string, Rect>();

  for (const edge of edges) {
    if (hasBadge(edge.label, edge.isCycle)) {
      const rect = measureBadgeRect(edge.label ?? "", config, edge.isCycle);
      result.set(edge.id, rect);
    }
  }

  return result;
}
