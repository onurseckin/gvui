import type { ColorRampPreset, ColorStop, HslColor, RgbColor, ScaleType } from "./types";

// ============================================================================
// Built-in Scientific & Visual Color Palettes (0.0 -> 1.0)
// ============================================================================

export const PRESET_COLOR_RAMPS: Readonly<Record<ColorRampPreset, readonly ColorStop[]>> =
  Object.freeze({
    // Viridis: Perceptually uniform, colorblind safe (deep purple -> blue -> teal -> green -> yellow)
    viridis: Object.freeze([
      { stop: 0.0, color: "#440154" },
      { stop: 0.25, color: "#3b528b" },
      { stop: 0.5, color: "#21908c" },
      { stop: 0.75, color: "#5dc863" },
      { stop: 1.0, color: "#fde725" },
    ]),

    // Plasma: High contrast (deep blue -> purple -> magenta -> orange -> yellow)
    plasma: Object.freeze([
      { stop: 0.0, color: "#0d0887" },
      { stop: 0.25, color: "#6a00a8" },
      { stop: 0.5, color: "#b12a90" },
      { stop: 0.75, color: "#e16462" },
      { stop: 1.0, color: "#fca636" },
    ]),

    // Inferno: Black -> deep purple -> fiery red -> gold -> pale yellow
    inferno: Object.freeze([
      { stop: 0.0, color: "#000004" },
      { stop: 0.25, color: "#420a68" },
      { stop: 0.5, color: "#932667" },
      { stop: 0.75, color: "#dd513a" },
      { stop: 1.0, color: "#fca50a" },
    ]),

    // Magma: Dark violet -> hot pink -> light peach -> off-white
    magma: Object.freeze([
      { stop: 0.0, color: "#000004" },
      { stop: 0.25, color: "#3b0f70" },
      { stop: 0.5, color: "#8c2981" },
      { stop: 0.75, color: "#de4968" },
      { stop: 1.0, color: "#fe9f6d" },
    ]),

    // Turbo: Smooth, perceptually corrected rainbow
    turbo: Object.freeze([
      { stop: 0.0, color: "#30123b" },
      { stop: 0.2, color: "#4145ab" },
      { stop: 0.4, color: "#297ff0" },
      { stop: 0.6, color: "#46f884" },
      { stop: 0.8, color: "#fed036" },
      { stop: 1.0, color: "#7a0403" },
    ]),

    // Cividis: Optimized specifically for color-vision deficiency
    cividis: Object.freeze([
      { stop: 0.0, color: "#00204d" },
      { stop: 0.25, color: "#2c466e" },
      { stop: 0.5, color: "#5b6d76" },
      { stop: 0.75, color: "#949673" },
      { stop: 1.0, color: "#ffe945" },
    ]),

    // Reds: Subtle rose to deep crimson
    reds: Object.freeze([
      { stop: 0.0, color: "#fee5d9" },
      { stop: 0.33, color: "#fcae91" },
      { stop: 0.66, color: "#fb6a4a" },
      { stop: 1.0, color: "#cb181d" },
    ]),

    // Amber: Soft gold to deep radiant amber
    amber: Object.freeze([
      { stop: 0.0, color: "#fffbeb" },
      { stop: 0.33, color: "#fde68a" },
      { stop: 0.66, color: "#f59e0b" },
      { stop: 1.0, color: "#b45309" },
    ]),

    // Emerald: Soft mint to rich deep emerald
    emerald: Object.freeze([
      { stop: 0.0, color: "#ecfdf5" },
      { stop: 0.33, color: "#6ee7b7" },
      { stop: 0.66, color: "#10b981" },
      { stop: 1.0, color: "#047857" },
    ]),

    // Risk-Alert: Safe (emerald) -> Caution (amber) -> High (crimson) -> Extreme (neon magenta)
    "risk-alert": Object.freeze([
      { stop: 0.0, color: "#10b981" }, // Emerald 500
      { stop: 0.35, color: "#f59e0b" }, // Amber 500
      { stop: 0.7, color: "#ef4444" }, // Red 500
      { stop: 1.0, color: "#ec4899" }, // Magenta 500
    ]),

    // Cyber-Heat: Futuristic dark blue -> neon cyan -> vivid magenta -> bright yellow
    "cyber-heat": Object.freeze([
      { stop: 0.0, color: "#020617" }, // Slate 950
      { stop: 0.3, color: "#06b6d4" }, // Cyan 500
      { stop: 0.7, color: "#d946ef" }, // Fuchsia 500
      { stop: 1.0, color: "#facc15" }, // Yellow 400
    ]),

    // CoolWarm: Diverging cool blue -> neutral gray -> warm red
    coolwarm: Object.freeze([
      { stop: 0.0, color: "#3b82f6" },
      { stop: 0.5, color: "#e2e8f0" },
      { stop: 1.0, color: "#ef4444" },
    ]),

    // Spectral: Diverging rainbow
    spectral: Object.freeze([
      { stop: 0.0, color: "#9e0142" },
      { stop: 0.25, color: "#f46d43" },
      { stop: 0.5, color: "#fee08b" },
      { stop: 0.75, color: "#66c2a5" },
      { stop: 1.0, color: "#5e4fa2" },
    ]),

    // Custom fallback
    custom: Object.freeze([
      { stop: 0.0, color: "#3b82f6" },
      { stop: 1.0, color: "#ef4444" },
    ]),
  });

// ============================================================================
// Color Parsing & Conversion Utilities
// ============================================================================

/**
 * Clamps a number between min and max.
 */
export function clamp(val: number, min: number, max: number): number {
  if (Number.isNaN(val)) return min;
  return Math.min(Math.max(val, min), max);
}

/**
 * Parses Hex (#RGB, #RGBA, #RRGGBB, #RRGGBBAA) into an RgbColor object.
 */
export function parseHexColor(hex: string): RgbColor | null {
  const cleanHex = hex.trim().replace(/^#/, "");

  if (cleanHex.length === 3) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b, a: 1 };
  }

  if (cleanHex.length === 4) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    const a = parseInt(cleanHex[3] + cleanHex[3], 16) / 255;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) return null;
    return { r, g, b, a };
  }

  if (cleanHex.length === 6) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b, a: 1 };
  }

  if (cleanHex.length === 8) {
    const r = parseInt(cleanHex.substring(0, 2), 16);
    const g = parseInt(cleanHex.substring(2, 4), 16);
    const b = parseInt(cleanHex.substring(4, 6), 16);
    const a = parseInt(cleanHex.substring(6, 8), 16) / 255;
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b) || Number.isNaN(a)) return null;
    return { r, g, b, a };
  }

  return null;
}

/**
 * Parses RGB / RGBA strings like `rgb(255, 0, 128)` or `rgba(255, 0, 128, 0.8)`.
 */
export function parseRgbString(str: string): RgbColor | null {
  const match = str
    .trim()
    .match(
      /^rgba?\s*\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)(?:\s*,\s*(-?[\d.]+))?\s*\)$/i,
    );
  if (!match) return null;

  const r = clamp(parseFloat(match[1]), 0, 255);
  const g = clamp(parseFloat(match[2]), 0, 255);
  const b = clamp(parseFloat(match[3]), 0, 255);
  const a = match[4] !== undefined ? clamp(parseFloat(match[4]), 0, 1) : 1;

  return { r, g, b, a };
}

/**
 * Parses HSL / HSLA strings like `hsl(210, 80%, 50%)` or `hsla(210, 80%, 50%, 0.5)`.
 */
export function parseHslString(str: string): RgbColor | null {
  const match = str
    .trim()
    .match(
      /^hsla?\s*\(\s*(-?[\d.]+)(?:deg)?\s*,\s*(-?[\d.]+)%\s*,\s*(-?[\d.]+)%(?:\s*,\s*(-?[\d.]+))?\s*\)$/i,
    );
  if (!match) return null;

  const h = ((parseFloat(match[1]) % 360) + 360) % 360;
  const s = clamp(parseFloat(match[2]), 0, 100) / 100;
  const l = clamp(parseFloat(match[3]), 0, 100) / 100;
  const a = match[4] !== undefined ? clamp(parseFloat(match[4]), 0, 1) : 1;

  return hslToRgb({ h, s: s * 100, l: l * 100, a });
}

/**
 * Converts HslColor to RgbColor.
 */
export function hslToRgb(hsl: HslColor): RgbColor {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;
  const a = hsl.a !== undefined ? clamp(hsl.a, 0, 1) : 1;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (h >= 0 && h < 60) {
    rPrime = c;
    gPrime = x;
  } else if (h >= 60 && h < 120) {
    rPrime = x;
    gPrime = c;
  } else if (h >= 120 && h < 180) {
    gPrime = c;
    bPrime = x;
  } else if (h >= 180 && h < 240) {
    gPrime = x;
    bPrime = c;
  } else if (h >= 240 && h < 300) {
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
 * Generic color parser supporting Hex, RGB, RGBA, and HSL.
 */
export function parseColor(colorStr: string): RgbColor {
  const str = colorStr.trim();
  if (str.startsWith("#")) {
    const hex = parseHexColor(str);
    if (hex) return hex;
  }
  if (str.startsWith("rgb")) {
    const rgb = parseRgbString(str);
    if (rgb) return rgb;
  }
  if (str.startsWith("hsl")) {
    const hsl = parseHslString(str);
    if (hsl) return hsl;
  }
  // Fallback to default neutral
  return { r: 100, g: 116, b: 139, a: 1 }; // Slate 500
}

/**
 * Converts RgbColor to CSS hex string `#RRGGBB`.
 */
export function rgbToHex(rgb: RgbColor): string {
  const r = Math.round(clamp(rgb.r, 0, 255))
    .toString(16)
    .padStart(2, "0");
  const g = Math.round(clamp(rgb.g, 0, 255))
    .toString(16)
    .padStart(2, "0");
  const b = Math.round(clamp(rgb.b, 0, 255))
    .toString(16)
    .padStart(2, "0");
  return `#${r}${g}${b}`;
}

/**
 * Formats RgbColor to `rgba(r, g, b, alpha)`.
 */
export function rgbaString(color: string | RgbColor, alphaOverride?: number): string {
  const rgb = typeof color === "string" ? parseColor(color) : color;
  const a = alphaOverride !== undefined ? clamp(alphaOverride, 0, 1) : (rgb.a ?? 1);
  return `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${a.toFixed(3)})`;
}

// ============================================================================
// Multi-Stop Color Interpolation (Lerp with sRGB Gamma correction)
// ============================================================================

/**
 * Linear interpolation between two values.
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Interpolates between two RGB colors.
 */
export function interpolateRgb(c1: RgbColor, c2: RgbColor, t: number): RgbColor {
  const factor = clamp(t, 0, 1);
  return {
    r: Math.round(lerp(c1.r, c2.r, factor)),
    g: Math.round(lerp(c1.g, c2.g, factor)),
    b: Math.round(lerp(c1.b, c2.b, factor)),
    a: lerp(c1.a ?? 1, c2.a ?? 1, factor),
  };
}

/**
 * Evaluates a multi-stop color ramp at a normalized position `t` (0.0 to 1.0).
 */
export function evaluateColorRamp(
  stops: readonly ColorStop[],
  t: number,
  invert: boolean = false,
): string {
  if (!stops || stops.length === 0) {
    return "#3b82f6";
  }

  const factor = invert ? 1 - clamp(t, 0, 1) : clamp(t, 0, 1);

  if (stops.length === 1) {
    return stops[0].color;
  }

  // Sort stops by stop percentage
  const sorted = [...stops].sort((a, b) => a.stop - b.stop);

  // If t is below the first stop or above the last stop
  if (factor <= sorted[0].stop) return sorted[0].color;
  if (factor >= sorted[sorted.length - 1].stop) return sorted[sorted.length - 1].color;

  // Find the two stops surrounding factor
  for (let i = 0; i < sorted.length - 1; i++) {
    const s1 = sorted[i];
    const s2 = sorted[i + 1];
    if (factor >= s1.stop && factor <= s2.stop) {
      const span = s2.stop - s1.stop;
      const localT = span === 0 ? 0 : (factor - s1.stop) / span;
      const c1 = parseColor(s1.color);
      const c2 = parseColor(s2.color);
      const mixed = interpolateRgb(c1, c2, localT);
      return rgbToHex(mixed);
    }
  }

  return sorted[sorted.length - 1].color;
}

/**
 * Resolves the color stops for a preset or custom palette.
 */
export function resolveColorStops(
  preset: ColorRampPreset,
  customStops?: readonly ColorStop[],
): readonly ColorStop[] {
  if (preset === "custom" && customStops && customStops.length > 0) {
    return customStops;
  }
  return PRESET_COLOR_RAMPS[preset] ?? PRESET_COLOR_RAMPS.viridis;
}

// ============================================================================
// Normalization & Scale Transformers
// ============================================================================

/**
 * Normalizes a raw value into [0.0, 1.0] based on ScaleType.
 */
export function normalizeValue(
  value: number,
  min: number,
  max: number,
  scale: ScaleType = "linear",
  sortedDomain?: readonly number[],
): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  if (max <= min) return 0.5;

  const clampedVal = clamp(value, min, max);

  switch (scale) {
    case "linear": {
      return (clampedVal - min) / (max - min);
    }
    case "log": {
      // Shift so min maps cleanly: log(val - min + 1) / log(max - min + 1)
      const range = max - min;
      const shifted = clampedVal - min;
      const logRange = Math.log10(range + 1);
      if (logRange === 0) return 0;
      return clamp(Math.log10(shifted + 1) / logRange, 0, 1);
    }
    case "sqrt": {
      const range = max - min;
      const shifted = clampedVal - min;
      const sqrtRange = Math.sqrt(range);
      if (sqrtRange === 0) return 0;
      return clamp(Math.sqrt(shifted) / sqrtRange, 0, 1);
    }
    case "quantile": {
      if (!sortedDomain || sortedDomain.length === 0) {
        return (clampedVal - min) / (max - min);
      }
      // Binary search count of elements <= clampedVal (Empirical CDF)
      let low = 0;
      let high = sortedDomain.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        if (sortedDomain[mid] <= clampedVal) {
          low = mid + 1;
        } else {
          high = mid - 1;
        }
      }
      return clamp(low / sortedDomain.length, 0, 1);
    }
    default:
      return (clampedVal - min) / (max - min);
  }
}

/**
 * Formats a CSS drop-shadow or box-shadow glow string for canvas nodes/edges.
 */
export function generateGlowStyle(
  color: string,
  intensity: number = 0.8,
  blurRadiusPx: number = 14,
): string {
  const alpha1 = clamp(intensity * 0.7, 0, 1);
  const alpha2 = clamp(intensity * 0.35, 0, 1);
  const c1 = rgbaString(color, alpha1);
  const c2 = rgbaString(color, alpha2);
  return `0 0 ${blurRadiusPx}px ${c1}, 0 0 ${blurRadiusPx * 2}px ${c2}`;
}
