/**
 * Visual Metrics Collector & Layout Invariant Audit Engine.
 *
 * Provides pure, zero-dependency mathematical and DOM algorithms for:
 * 1. Bounding box overlaps, intersection geometry, and stacking collision detection.
 * 2. Viewport boundary overflows and scroll container clipping leaks.
 * 3. Text truncation, ellipsis overflow, and tight line-height clipping.
 * 4. WCAG AA color contrast calculation with relative luminance linearization and alpha blending.
 * 5. Structured VisualMetricsReport generation for visual-report.json.
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

export interface RgbColor {
  readonly r: number; // 0 - 255
  readonly g: number; // 0 - 255
  readonly b: number; // 0 - 255
  readonly a: number; // 0.0 - 1.0
}

export interface OverlapResult {
  readonly hasOverlap: boolean;
  readonly intersectionBox: BoundingBox | null;
  readonly overlapArea: number;
  readonly overlapPercentageA: number; // 0 - 100%
  readonly overlapPercentageB: number; // 0 - 100%
}

export interface StackingViolation {
  readonly selectorA: string;
  readonly selectorB: string;
  readonly boxA: BoundingBox;
  readonly boxB: BoundingBox;
  readonly intersectionBox: BoundingBox;
  readonly overlapArea: number;
  readonly overlapRatioA: number;
  readonly overlapRatioB: number;
  readonly severity: "error" | "warning";
  readonly description: string;
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

export interface ContrastViolation {
  readonly selector: string;
  readonly textSnippet: string;
  readonly foregroundColor: string;
  readonly backgroundColor: string;
  readonly parsedForeground: RgbColor;
  readonly parsedBackground: RgbColor;
  readonly contrastRatio: number;
  readonly requiredRatio: number;
  readonly fontSizePx: number;
  readonly fontWeight: string | number;
  readonly isLargeText: boolean;
  readonly severity: "error" | "warning";
  readonly description: string;
}

export interface ViewportMetrics {
  readonly viewport: {
    readonly name: string;
    readonly width: number;
    readonly height: number;
  };
  readonly totalElementsChecked: number;
  readonly totalViolations: number;
  readonly overflowCount: number;
  readonly clippingCount: number;
  readonly collisionCount: number;
  readonly contrastViolationCount: number;
  readonly passed: boolean;
  readonly integrityScore: number; // 0 - 100
  readonly accessibilityScore: number; // 0 - 100
  readonly layoutOverflows: readonly OverflowViolation[];
  readonly textClippings: readonly TextClippingViolation[];
  readonly collisions: readonly StackingViolation[];
  readonly contrastIssues: readonly ContrastViolation[];
}

export interface VisualMetricsReport {
  readonly version: string;
  readonly timestamp: string;
  readonly dataset?: string;
  readonly url?: string;
  readonly summary: {
    readonly totalElementsChecked: number;
    readonly totalViolations: number;
    readonly overflowCount: number;
    readonly clippingCount: number;
    readonly collisionCount: number;
    readonly contrastViolationCount: number;
    readonly passed: boolean;
    readonly integrityScore: number;
    readonly accessibilityScore: number;
  };
  readonly viewports: Record<string, ViewportMetrics>;
  readonly layoutOverflows: readonly OverflowViolation[];
  readonly textClippings: readonly TextClippingViolation[];
  readonly collisions: readonly StackingViolation[];
  readonly contrastIssues: readonly ContrastViolation[];
}

// -------------------------------------------------------------------------------------------------
// 1. Geometry & Bounding Box Utilities
// -------------------------------------------------------------------------------------------------

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

// -------------------------------------------------------------------------------------------------
// 2. Text Truncation & Clipping Analysis
// -------------------------------------------------------------------------------------------------

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

// -------------------------------------------------------------------------------------------------
// 3. Color Parsing, Relative Luminance & WCAG Contrast Calculation
// -------------------------------------------------------------------------------------------------

const NAMED_COLORS: Readonly<Record<string, RgbColor>> = {
  white: { r: 255, g: 255, b: 255, a: 1.0 },
  black: { r: 0, g: 0, b: 0, a: 1.0 },
  transparent: { r: 0, g: 0, b: 0, a: 0.0 },
  red: { r: 255, g: 0, b: 0, a: 1.0 },
  green: { r: 0, g: 128, b: 0, a: 1.0 },
  blue: { r: 0, g: 0, b: 255, a: 1.0 },
  yellow: { r: 255, g: 255, b: 0, a: 1.0 },
  cyan: { r: 0, g: 255, b: 255, a: 1.0 },
  magenta: { r: 255, g: 0, b: 255, a: 1.0 },
  gray: { r: 128, g: 128, b: 128, a: 1.0 },
  grey: { r: 128, g: 128, b: 128, a: 1.0 },
  lightgray: { r: 211, g: 211, b: 211, a: 1.0 },
  darkgray: { r: 169, g: 169, b: 169, a: 1.0 },
  slate: { r: 15, g: 23, b: 42, a: 1.0 },
};

/**
 * Parses any CSS color string (hex, rgb/rgba, hsl/hsla, named) into an RgbColor object.
 * Returns null if the color string is unparseable.
 */
export function parseColor(colorStr: string): RgbColor | null {
  if (!colorStr || typeof colorStr !== "string") return null;
  const s = colorStr.trim().toLowerCase();

  if (s in NAMED_COLORS) {
    return NAMED_COLORS[s];
  }

  // Hex: #rgb, #rgba, #rrggbb, #rrggbbaa
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return { r, g, b, a: 1.0 };
      }
    } else if (hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = parseInt(hex[3] + hex[3], 16) / 255;
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b) && !Number.isNaN(a)) {
        return { r, g, b, a };
      }
    } else if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
        return { r, g, b, a: 1.0 };
      }
    } else if (hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = parseInt(hex.slice(6, 8), 16) / 255;
      if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b) && !Number.isNaN(a)) {
        return { r, g, b, a };
      }
    }
    return null;
  }

  // rgb / rgba: rgb(255, 255, 255), rgba(0, 0, 0, 0.5), rgb(255 255 255 / 0.5)
  if (s.startsWith("rgb")) {
    const match = s.match(/rgba?\s*\(([^)]+)\)/);
    if (!match) return null;
    const body = match[1].replace(/,/g, " ").replace(/\//g, " ");
    const parts = body
      .trim()
      .split(/\s+/)
      .map((v) => {
        if (v.endsWith("%")) return (parseFloat(v) / 100) * 255;
        return parseFloat(v);
      });

    if (parts.length >= 3) {
      const r = Math.min(255, Math.max(0, Math.round(parts[0])));
      const g = Math.min(255, Math.max(0, Math.round(parts[1])));
      const b = Math.min(255, Math.max(0, Math.round(parts[2])));
      let a = 1.0;
      if (parts.length >= 4) {
        const rawA =
          match[1].includes("/") || match[1].includes(",")
            ? parseFloat(match[1].split(/[/,]/).pop()?.trim() ?? "1")
            : parts[3];
        a = match[1].endsWith("%") ? rawA / 100 : rawA;
        if (Number.isNaN(a)) a = 1.0;
        a = Math.min(1.0, Math.max(0.0, a));
      }
      return { r, g, b, a };
    }
    return null;
  }

  // hsl / hsla: hsl(200, 50%, 50%), hsla(200, 50%, 50%, 0.8)
  if (s.startsWith("hsl")) {
    const match = s.match(/hsla?\s*\(([^)]+)\)/);
    if (!match) return null;
    const rawArgs = match[1].replace(/,/g, " ").replace(/\//g, " ").trim().split(/\s+/);
    if (rawArgs.length >= 3) {
      const h = parseFloat(rawArgs[0]);
      const sVal = parseFloat(rawArgs[1]) / 100;
      const lVal = parseFloat(rawArgs[2]) / 100;
      let a = 1.0;
      if (rawArgs.length >= 4) {
        a = rawArgs[3].endsWith("%") ? parseFloat(rawArgs[3]) / 100 : parseFloat(rawArgs[3]);
        if (Number.isNaN(a)) a = 1.0;
        a = Math.min(1.0, Math.max(0.0, a));
      }
      return hslToRgb(h, sVal, lVal, a);
    }
    return null;
  }

  return null;
}

/**
 * Converts HSL values to an RgbColor object.
 */
export function hslToRgb(h: number, s: number, l: number, a = 1.0): RgbColor {
  const normH = ((h % 360) + 360) % 360;
  const normS = Math.min(1, Math.max(0, s));
  const normL = Math.min(1, Math.max(0, l));

  const c = (1 - Math.abs(2 * normL - 1)) * normS;
  const x = c * (1 - Math.abs(((normH / 60) % 2) - 1));
  const m = normL - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (normH < 60) {
    rPrime = c;
    gPrime = x;
  } else if (normH < 120) {
    rPrime = x;
    gPrime = c;
  } else if (normH < 180) {
    gPrime = c;
    bPrime = x;
  } else if (normH < 240) {
    gPrime = x;
    bPrime = c;
  } else if (normH < 300) {
    rPrime = x;
    bPrime = c;
  } else {
    rPrime = c;
    bPrime = x;
  }

  return {
    r: Math.round((rPrime + m) * 255),
    g: Math.round((gPrime + m) * 255),
    b: Math.round((bPrime + m) * 255),
    a,
  };
}

/**
 * Composites a foreground color with alpha transparency over an opaque background color.
 */
export function compositeColor(
  foreground: RgbColor,
  background: RgbColor = { r: 255, g: 255, b: 255, a: 1.0 },
): RgbColor {
  const alpha = foreground.a;
  if (alpha >= 1.0) {
    return { r: foreground.r, g: foreground.g, b: foreground.b, a: 1.0 };
  }
  if (alpha <= 0.0) {
    return background;
  }

  const bgAlpha = background.a;
  const outA = alpha + bgAlpha * (1.0 - alpha);
  const safeOutA = outA > 0 ? outA : 1.0;

  const r = Math.round((foreground.r * alpha + background.r * bgAlpha * (1.0 - alpha)) / safeOutA);
  const g = Math.round((foreground.g * alpha + background.g * bgAlpha * (1.0 - alpha)) / safeOutA);
  const b = Math.round((foreground.b * alpha + background.b * bgAlpha * (1.0 - alpha)) / safeOutA);

  return {
    r: Math.min(255, Math.max(0, r)),
    g: Math.min(255, Math.max(0, g)),
    b: Math.min(255, Math.max(0, b)),
    a: Math.min(1.0, Math.max(0.0, outA)),
  };
}

/**
 * Composites multiple stacked color layers (bottom to top) over a base background.
 */
export function compositeMultipleLayers(
  layers: readonly (RgbColor | string)[],
  baseBackground: RgbColor = { r: 255, g: 255, b: 255, a: 1.0 },
): RgbColor {
  let currentBg = baseBackground;
  for (const layer of layers) {
    const parsed = typeof layer === "string" ? parseColor(layer) : layer;
    if (parsed) {
      currentBg = compositeColor(parsed, currentBg);
    }
  }
  return currentBg;
}

/**
 * Calculates the WCAG relative luminance of an sRGB color.
 * L = 0.2126 * Rlin + 0.7152 * Glin + 0.0722 * Blin
 */
export function calculateRelativeLuminance(color: RgbColor): number {
  const normalizeChannel = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };

  const linR = normalizeChannel(color.r);
  const linG = normalizeChannel(color.g);
  const linB = normalizeChannel(color.b);

  const L = 0.2126 * linR + 0.7152 * linG + 0.0722 * linB;
  return Math.min(1.0, Math.max(0.0, L));
}

/**
 * Computes the WCAG contrast ratio between two colors (range: 1:1 to 21:1).
 */
export function calculateContrastRatio(
  colorA: RgbColor | string,
  colorB: RgbColor | string,
  baseBackground: RgbColor = { r: 255, g: 255, b: 255, a: 1.0 },
): number {
  const parsedA = typeof colorA === "string" ? parseColor(colorA) : colorA;
  const parsedB = typeof colorB === "string" ? parseColor(colorB) : colorB;

  const validA = parsedA ?? { r: 0, g: 0, b: 0, a: 1.0 };
  const validB = parsedB ?? { r: 255, g: 255, b: 255, a: 1.0 };

  // Composite semi-transparent layers over base background
  const finalA = validA.a < 1.0 ? compositeColor(validA, baseBackground) : validA;
  const finalB = validB.a < 1.0 ? compositeColor(validB, baseBackground) : validB;

  const lumA = calculateRelativeLuminance(finalA);
  const lumB = calculateRelativeLuminance(finalB);

  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);

  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Number(ratio.toFixed(2));
}

/**
 * Determines whether text qualifies as WCAG 'large text' (>= 24px regular or >= 18.66px bold).
 */
export function isLargeText(fontSizePx: number, fontWeight: string | number): boolean {
  let numericWeight = 400;
  if (typeof fontWeight === "number") {
    numericWeight = fontWeight;
  } else if (typeof fontWeight === "string") {
    const s = fontWeight.toLowerCase().trim();
    if (s === "bold" || s === "bolder") numericWeight = 700;
    else if (s === "normal" || s === "lighter") numericWeight = 400;
    else {
      const parsed = parseInt(s, 10);
      if (!Number.isNaN(parsed)) numericWeight = parsed;
    }
  }

  const isBold = numericWeight >= 700;
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && isBold);
}

/**
 * Evaluates WCAG AA contrast compliance for foreground and background colors.
 */
export function evaluateContrastCompliance(
  foreground: string | RgbColor,
  background: string | RgbColor,
  options?: {
    readonly fontSizePx?: number;
    readonly fontWeight?: string | number;
    readonly selector?: string;
    readonly textSnippet?: string;
    readonly baseBackground?: RgbColor;
  },
): {
  readonly passes: boolean;
  readonly contrastRatio: number;
  readonly requiredRatio: number;
  readonly isLarge: boolean;
  readonly violation: ContrastViolation | null;
} {
  const fontSizePx = options?.fontSizePx ?? 14;
  const fontWeight = options?.fontWeight ?? 400;
  const isLarge = isLargeText(fontSizePx, fontWeight);
  const requiredRatio = isLarge ? 3.0 : 4.5;

  const baseBg = options?.baseBackground ?? { r: 255, g: 255, b: 255, a: 1.0 };
  const contrastRatio = calculateContrastRatio(foreground, background, baseBg);
  const passes = contrastRatio >= requiredRatio;

  const parsedFg =
    typeof foreground === "string"
      ? (parseColor(foreground) ?? { r: 0, g: 0, b: 0, a: 1.0 })
      : foreground;
  const parsedBg =
    typeof background === "string"
      ? (parseColor(background) ?? { r: 255, g: 255, b: 255, a: 1.0 })
      : background;

  let violation: ContrastViolation | null = null;
  if (!passes) {
    const severity: "error" | "warning" = contrastRatio < requiredRatio * 0.7 ? "error" : "warning";
    const selector = options?.selector ?? "text-node";
    const textSnippet = options?.textSnippet ?? "";
    const fgStr =
      typeof foreground === "string"
        ? foreground
        : `rgba(${parsedFg.r},${parsedFg.g},${parsedFg.b},${parsedFg.a})`;
    const bgStr =
      typeof background === "string"
        ? background
        : `rgba(${parsedBg.r},${parsedBg.g},${parsedBg.b},${parsedBg.a})`;

    violation = {
      selector,
      textSnippet,
      foregroundColor: fgStr,
      backgroundColor: bgStr,
      parsedForeground: parsedFg,
      parsedBackground: parsedBg,
      contrastRatio,
      requiredRatio,
      fontSizePx,
      fontWeight,
      isLargeText: isLarge,
      severity,
      description: `Insufficient WCAG AA contrast for '${selector}' (${contrastRatio}:1 < required ${requiredRatio}:1). Text: "${textSnippet.slice(0, 30)}"`,
    };
  }

  return {
    passes,
    contrastRatio,
    requiredRatio,
    isLarge,
    violation,
  };
}

// -------------------------------------------------------------------------------------------------
// 4. Stacking & Interactive Collision Detection
// -------------------------------------------------------------------------------------------------

export interface ElementWithBounds {
  readonly selector: string;
  readonly bounds: BoundingBox;
  readonly zIndex?: number;
  readonly isInteractive?: boolean;
}

/**
 * Detects unintended overlapping bounding boxes among sibling / interactive elements.
 */
export function detectStackingCollisions(
  elements: readonly ElementWithBounds[],
  overlapAreaThreshold = 50,
): StackingViolation[] {
  const violations: StackingViolation[] = [];

  for (let i = 0; i < elements.length; i++) {
    const elA = elements[i];
    for (let j = i + 1; j < elements.length; j++) {
      const elB = elements[j];

      const overlap = computeBoundingBoxOverlap(elA.bounds, elB.bounds);
      if (
        overlap.hasOverlap &&
        overlap.overlapArea >= overlapAreaThreshold &&
        overlap.intersectionBox
      ) {
        const severity: "error" | "warning" =
          elA.isInteractive && elB.isInteractive ? "error" : "warning";

        violations.push({
          selectorA: elA.selector,
          selectorB: elB.selector,
          boxA: elA.bounds,
          boxB: elB.bounds,
          intersectionBox: overlap.intersectionBox,
          overlapArea: overlap.overlapArea,
          overlapRatioA: overlap.overlapPercentageA,
          overlapRatioB: overlap.overlapPercentageB,
          severity,
          description: `Collision detected between '${elA.selector}' and '${elB.selector}' (overlap: ${overlap.overlapArea.toFixed(1)}px², ${overlap.overlapPercentageA.toFixed(1)}% of A)`,
        });
      }
    }
  }

  return violations;
}

// -------------------------------------------------------------------------------------------------
// 5. Report Synthesis & Scoring
// -------------------------------------------------------------------------------------------------

/**
 * Synthesizes individual viewport metrics into a unified VisualMetricsReport.
 */
export function createVisualMetricsReport(params: {
  readonly viewports: Record<string, ViewportMetrics>;
  readonly dataset?: string;
  readonly url?: string;
  readonly timestamp?: string;
}): VisualMetricsReport {
  const allOverflows: OverflowViolation[] = [];
  const allClippings: TextClippingViolation[] = [];
  const allCollisions: StackingViolation[] = [];
  const allContrasts: ContrastViolation[] = [];

  let totalElementsChecked = 0;

  for (const vpMetrics of Object.values(params.viewports)) {
    totalElementsChecked += vpMetrics.totalElementsChecked;
    allOverflows.push(...vpMetrics.layoutOverflows);
    allClippings.push(...vpMetrics.textClippings);
    allCollisions.push(...vpMetrics.collisions);
    allContrasts.push(...vpMetrics.contrastIssues);
  }

  const overflowCount = allOverflows.length;
  const clippingCount = allClippings.length;
  const collisionCount = allCollisions.length;
  const contrastViolationCount = allContrasts.length;
  const totalViolations = overflowCount + clippingCount + collisionCount + contrastViolationCount;

  // Score integrity: deductions for layout overflow, clipping, collisions
  const integrityScore = Math.max(
    0,
    Math.min(100, Math.round(100 - (overflowCount * 10 + clippingCount * 5 + collisionCount * 15))),
  );

  // Score accessibility: deductions for contrast violations
  const accessibilityScore = Math.max(
    0,
    Math.min(100, Math.round(100 - contrastViolationCount * 10)),
  );

  const passed = totalViolations === 0;

  return {
    version: "1.0.0",
    timestamp: params.timestamp ?? new Date().toISOString(),
    dataset: params.dataset,
    url: params.url,
    summary: {
      totalElementsChecked,
      totalViolations,
      overflowCount,
      clippingCount,
      collisionCount,
      contrastViolationCount,
      passed,
      integrityScore,
      accessibilityScore,
    },
    viewports: params.viewports,
    layoutOverflows: allOverflows,
    textClippings: allClippings,
    collisions: allCollisions,
    contrastIssues: allContrasts,
  };
}

/**
 * Creates empty/passing ViewportMetrics for a specific viewport.
 */
export function createEmptyViewportMetrics(viewport: {
  name: string;
  width: number;
  height: number;
}): ViewportMetrics {
  return {
    viewport,
    totalElementsChecked: 0,
    totalViolations: 0,
    overflowCount: 0,
    clippingCount: 0,
    collisionCount: 0,
    contrastViolationCount: 0,
    passed: true,
    integrityScore: 100,
    accessibilityScore: 100,
    layoutOverflows: [],
    textClippings: [],
    collisions: [],
    contrastIssues: [],
  };
}
