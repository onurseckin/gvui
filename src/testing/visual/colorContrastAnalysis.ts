/**
 * Color parsing, relative luminance, and WCAG AA contrast calculation.
 *
 * Parses any CSS color string (hex, rgb/rgba, hsl/hsla, named) into an RgbColor, composites
 * alpha-transparent layers over an opaque backdrop, and evaluates WCAG AA contrast compliance.
 */

export interface RgbColor {
  readonly r: number; // 0 - 255
  readonly g: number; // 0 - 255
  readonly b: number; // 0 - 255
  readonly a: number; // 0.0 - 1.0
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
 * Resolves the true opaque backdrop behind an element from its ancestor background chain.
 *
 * `layers` must be ordered nearest-ancestor-first (the element's own background at index 0,
 * its parent's next, and so on) — the natural order produced by walking `parentElement`. Each
 * layer is painted over everything behind it, so they are composited furthest-first here.
 * Fully-transparent layers (unparseable, or alpha 0 — e.g. an unset `background-color`) are
 * skipped rather than treated as opaque black. `fallback` is the base a real page never fails to
 * paint (its own canvas), used only when no ancestor contributes any color at all.
 */
export function resolveEffectiveBackground(
  layers: readonly string[],
  fallback: RgbColor = { r: 15, g: 23, b: 42, a: 1.0 }, // slate-900 canvas default
): RgbColor {
  const opaqueLayers: RgbColor[] = [];
  for (const raw of layers) {
    const parsed = parseColor(raw);
    if (parsed && parsed.a > 0) {
      opaqueLayers.push(parsed);
    }
  }
  opaqueLayers.reverse(); // furthest ancestor first, so compositeMultipleLayers paints nearest last
  return compositeMultipleLayers(opaqueLayers, fallback);
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
