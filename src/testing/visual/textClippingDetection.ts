/**
 * Text truncation and clipping analysis: detects overflowing, ellipsis-truncated, or silently
 * clipped text content by comparing an element's scroll box to its client box.
 */

export interface TextClippingViolation {
  readonly selector: string;
  readonly textSnippet: string;
  readonly clientWidth: number;
  readonly scrollWidth: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly isTruncatedWithEllipsis: boolean;
  readonly isClippedWithoutEllipsis: boolean;
  readonly cssOverflow: string;
  readonly cssTextOverflow: string;
  readonly cssWhiteSpace: string;
  readonly severity: "error" | "warning";
  readonly description: string;
}

export interface TextElementMetrics {
  readonly selector: string;
  readonly textSnippet: string;
  readonly clientWidth: number;
  readonly scrollWidth: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly cssOverflow?: string;
  readonly cssTextOverflow?: string;
  readonly cssWhiteSpace?: string;
  readonly cssLineClamp?: string;
  readonly cssLineHeight?: string;
}

/**
 * Analyzes whether text within an element is truncated, clipped, or overflowing its bounds.
 */
export function detectTextTruncation(
  metrics: TextElementMetrics,
  tolerance = 1.0,
): TextClippingViolation | null {
  const deltaX = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const deltaY = Math.max(0, metrics.scrollHeight - metrics.clientHeight);

  const cssOverflow = metrics.cssOverflow ?? "visible";
  const cssTextOverflow = metrics.cssTextOverflow ?? "clip";
  const cssWhiteSpace = metrics.cssWhiteSpace ?? "normal";

  const hasEllipsis = cssTextOverflow.includes("ellipsis");
  const isHorizontalOverflow = deltaX > tolerance;
  const isVerticalOverflow = deltaY > tolerance;

  if (!isHorizontalOverflow && !isVerticalOverflow) {
    return null;
  }

  const isTruncatedWithEllipsis = hasEllipsis && isHorizontalOverflow;
  const isClippedWithoutEllipsis = !hasEllipsis && (isHorizontalOverflow || isVerticalOverflow);

  const severity: "error" | "warning" =
    isClippedWithoutEllipsis && (deltaX > 8 || deltaY > 8) ? "error" : "warning";

  const descParts: string[] = [];
  if (isHorizontalOverflow) {
    descParts.push(
      `horizontal scrollWidth (${metrics.scrollWidth}px) > clientWidth (${metrics.clientWidth}px)`,
    );
  }
  if (isVerticalOverflow) {
    descParts.push(
      `vertical scrollHeight (${metrics.scrollHeight}px) > clientHeight (${metrics.clientHeight}px)`,
    );
  }

  return {
    selector: metrics.selector,
    textSnippet: metrics.textSnippet,
    clientWidth: metrics.clientWidth,
    scrollWidth: metrics.scrollWidth,
    clientHeight: metrics.clientHeight,
    scrollHeight: metrics.scrollHeight,
    deltaX,
    deltaY,
    isTruncatedWithEllipsis,
    isClippedWithoutEllipsis,
    cssOverflow,
    cssTextOverflow,
    cssWhiteSpace,
    severity,
    description: `Text element '${metrics.selector}' is clipped/truncated: ${descParts.join(", ")}${hasEllipsis ? " (ellipsis active)" : " (no ellipsis)"}`,
  };
}
