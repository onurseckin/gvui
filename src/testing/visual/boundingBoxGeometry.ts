/**
 * Bounding box geometry: normalization, intersection, and viewport/container overflow detection.
 *
 * Pure, zero-dependency math shared by every other visual-audit module — collision detection and
 * report synthesis both build on the `BoundingBox` shape and `computeBoundingBoxOverlap` defined here.
 */

export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ViewportBounds {
  readonly width: number;
  readonly height: number;
}

export interface OverlapResult {
  readonly hasOverlap: boolean;
  readonly intersectionBox: BoundingBox | null;
  readonly overlapArea: number;
  readonly overlapPercentageA: number; // 0 - 100%
  readonly overlapPercentageB: number; // 0 - 100%
}

export interface OverflowViolation {
  readonly selector: string;
  readonly elementBounds: BoundingBox;
  readonly viewportBounds: ViewportBounds;
  readonly overflowLeft: number;
  readonly overflowRight: number;
  readonly overflowTop: number;
  readonly overflowBottom: number;
  readonly overflowX: number;
  readonly overflowY: number;
  readonly severity: "error" | "warning";
  readonly description: string;
}

/**
 * Creates a normalized BoundingBox object from coordinates and dimensions.
 * Handles negative dimensions and non-finite numbers safely.
 */
export function createBoundingBox(
  x: number,
  y: number,
  width: number,
  height: number,
): BoundingBox {
  const safeX = Number.isFinite(x) ? x : 0;
  const safeY = Number.isFinite(y) ? y : 0;
  const rawW = Number.isFinite(width) ? width : 0;
  const rawH = Number.isFinite(height) ? height : 0;

  const normalizedX = rawW < 0 ? safeX + rawW : safeX;
  const normalizedY = rawH < 0 ? safeY + rawH : safeY;
  const normalizedW = Math.abs(rawW);
  const normalizedH = Math.abs(rawH);

  return {
    x: normalizedX,
    y: normalizedY,
    width: normalizedW,
    height: normalizedH,
    top: normalizedY,
    left: normalizedX,
    right: normalizedX + normalizedW,
    bottom: normalizedY + normalizedH,
  };
}

/**
 * Converts a DOMRect or standard rectangle object into a normalized BoundingBox.
 */
export function toBoundingBox(rect: {
  x?: number;
  y?: number;
  top?: number;
  left?: number;
  width: number;
  height: number;
}): BoundingBox {
  const x = rect.left ?? rect.x ?? 0;
  const y = rect.top ?? rect.y ?? 0;
  return createBoundingBox(x, y, rect.width, rect.height);
}

/**
 * Computes overlap and intersection geometry between two bounding boxes.
 */
export function computeBoundingBoxOverlap(
  rectA: BoundingBox,
  rectB: BoundingBox,
  tolerance = 0.001,
): OverlapResult {
  const areaA = rectA.width * rectA.height;
  const areaB = rectB.width * rectB.height;

  if (areaA <= tolerance || areaB <= tolerance) {
    return {
      hasOverlap: false,
      intersectionBox: null,
      overlapArea: 0,
      overlapPercentageA: 0,
      overlapPercentageB: 0,
    };
  }

  const intLeft = Math.max(rectA.left, rectB.left);
  const intTop = Math.max(rectA.top, rectB.top);
  const intRight = Math.min(rectA.right, rectB.right);
  const intBottom = Math.min(rectA.bottom, rectB.bottom);

  const intWidth = intRight - intLeft;
  const intHeight = intBottom - intTop;

  if (intWidth <= tolerance || intHeight <= tolerance) {
    return {
      hasOverlap: false,
      intersectionBox: null,
      overlapArea: 0,
      overlapPercentageA: 0,
      overlapPercentageB: 0,
    };
  }

  const overlapArea = intWidth * intHeight;
  const intersectionBox = createBoundingBox(intLeft, intTop, intWidth, intHeight);
  const overlapPercentageA = Math.min(100, (overlapArea / areaA) * 100);
  const overlapPercentageB = Math.min(100, (overlapArea / areaB) * 100);

  return {
    hasOverlap: true,
    intersectionBox,
    overlapArea,
    overlapPercentageA,
    overlapPercentageB,
  };
}

/**
 * Detects whether an element bounding box exceeds the viewport boundaries.
 */
export function detectViewportOverflow(
  elementRect: BoundingBox,
  viewport: ViewportBounds,
  selector = "element",
  tolerance = 1.0,
): OverflowViolation | null {
  const overflowLeft = Math.max(0, -elementRect.left);
  const overflowTop = Math.max(0, -elementRect.top);
  const overflowRight = Math.max(0, elementRect.right - viewport.width);
  const overflowBottom = Math.max(0, elementRect.bottom - viewport.height);

  const overflowX = overflowLeft + overflowRight;
  const overflowY = overflowTop + overflowBottom;

  if (overflowX <= tolerance && overflowY <= tolerance) {
    return null;
  }

  const severity: "error" | "warning" = overflowX > 15 || overflowY > 15 ? "error" : "warning";

  const parts: string[] = [];
  if (overflowLeft > tolerance) parts.push(`left by ${overflowLeft.toFixed(1)}px`);
  if (overflowRight > tolerance) parts.push(`right by ${overflowRight.toFixed(1)}px`);
  if (overflowTop > tolerance) parts.push(`top by ${overflowTop.toFixed(1)}px`);
  if (overflowBottom > tolerance) parts.push(`bottom by ${overflowBottom.toFixed(1)}px`);

  return {
    selector,
    elementBounds: elementRect,
    viewportBounds: viewport,
    overflowLeft,
    overflowRight,
    overflowTop,
    overflowBottom,
    overflowX,
    overflowY,
    severity,
    description: `Element '${selector}' overflows viewport (${viewport.width}x${viewport.height}) on ${parts.join(", ")}`,
  };
}

/**
 * Detects whether a child element overflows its parent container bounds.
 */
export function detectContainerOverflow(
  childRect: BoundingBox,
  containerRect: BoundingBox,
  selector = "child-element",
  tolerance = 1.0,
): OverflowViolation | null {
  const overflowLeft = Math.max(0, containerRect.left - childRect.left);
  const overflowTop = Math.max(0, containerRect.top - childRect.top);
  const overflowRight = Math.max(0, childRect.right - containerRect.right);
  const overflowBottom = Math.max(0, childRect.bottom - containerRect.bottom);

  const overflowX = overflowLeft + overflowRight;
  const overflowY = overflowTop + overflowBottom;

  if (overflowX <= tolerance && overflowY <= tolerance) {
    return null;
  }

  const severity: "error" | "warning" = overflowX > 15 || overflowY > 15 ? "error" : "warning";

  const parts: string[] = [];
  if (overflowLeft > tolerance) parts.push(`left by ${overflowLeft.toFixed(1)}px`);
  if (overflowRight > tolerance) parts.push(`right by ${overflowRight.toFixed(1)}px`);
  if (overflowTop > tolerance) parts.push(`top by ${overflowTop.toFixed(1)}px`);
  if (overflowBottom > tolerance) parts.push(`bottom by ${overflowBottom.toFixed(1)}px`);

  return {
    selector,
    elementBounds: childRect,
    viewportBounds: { width: containerRect.width, height: containerRect.height },
    overflowLeft,
    overflowRight,
    overflowTop,
    overflowBottom,
    overflowX,
    overflowY,
    severity,
    description: `Child '${selector}' overflows container (${containerRect.width}x${containerRect.height}) on ${parts.join(", ")}`,
  };
}
