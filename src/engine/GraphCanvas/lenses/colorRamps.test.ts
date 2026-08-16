import { describe, expect, it } from "bun:test";
import {
  clamp,
  evaluateColorRamp,
  generateGlowStyle,
  hslToRgb,
  interpolateRgb,
  normalizeValue,
  parseColor,
  parseHexColor,
  parseHslString,
  parseRgbString,
  PRESET_COLOR_RAMPS,
  resolveColorStops,
  rgbaString,
  rgbToHex,
} from "./colorRamps";
import type { ColorStop, RgbColor } from "./types";

describe("colorRamps Module", () => {
  describe("clamp()", () => {
    it("clamps values within [min, max]", () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it("handles NaN safely", () => {
      expect(clamp(Number.NaN, 0, 10)).toBe(0);
    });
  });

  describe("Color Parsing & Conversion", () => {
    it("parses 3-digit hex colors", () => {
      const rgb = parseHexColor("#f00");
      expect(rgb).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    });

    it("parses 4-digit hex colors with alpha", () => {
      const rgb = parseHexColor("#f008");
      expect(rgb).toBeDefined();
      expect(rgb?.r).toBe(255);
      expect(rgb?.g).toBe(0);
      expect(rgb?.b).toBe(0);
      expect(rgb?.a).toBeCloseTo(0.533, 2);
    });

    it("parses 6-digit hex colors", () => {
      const rgb = parseHexColor("#3b82f6");
      expect(rgb).toEqual({ r: 59, g: 130, b: 246, a: 1 });
    });

    it("parses 8-digit hex colors", () => {
      const rgb = parseHexColor("#3b82f680");
      expect(rgb).toBeDefined();
      expect(rgb?.r).toBe(59);
      expect(rgb?.g).toBe(130);
      expect(rgb?.b).toBe(246);
      expect(rgb?.a).toBeCloseTo(0.501, 2);
    });

    it("returns null for invalid hex format", () => {
      expect(parseHexColor("invalid")).toBeNull();
      expect(parseHexColor("#12345")).toBeNull();
    });

    it("parses rgb and rgba strings", () => {
      expect(parseRgbString("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
      expect(parseRgbString("rgba(100, 150, 200, 0.75)")).toEqual({
        r: 100,
        g: 150,
        b: 200,
        a: 0.75,
      });
      expect(parseRgbString("invalid")).toBeNull();
    });

    it("parses hsl and hsla strings", () => {
      const rgb1 = parseHslString("hsl(0, 100%, 50%)");
      expect(rgb1).toEqual({ r: 255, g: 0, b: 0, a: 1 });

      const rgb2 = parseHslString("hsla(120, 100%, 50%, 0.5)");
      expect(rgb2).toEqual({ r: 0, g: 255, b: 0, a: 0.5 });

      const rgb3 = parseHslString("hsl(240, 100%, 50%)");
      expect(rgb3).toEqual({ r: 0, g: 0, b: 255, a: 1 });

      expect(parseHslString("invalid")).toBeNull();
    });

    it("converts HslColor to RgbColor across all hue segments", () => {
      expect(hslToRgb({ h: 60, s: 100, l: 50 })).toEqual({ r: 255, g: 255, b: 0, a: 1 });
      expect(hslToRgb({ h: 180, s: 100, l: 50 })).toEqual({ r: 0, g: 255, b: 255, a: 1 });
      expect(hslToRgb({ h: 300, s: 100, l: 50 })).toEqual({ r: 255, g: 0, b: 255, a: 1 });
    });

    it("generic parseColor handles various formats and fallbacks", () => {
      expect(parseColor("#00ff00")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
      expect(parseColor("rgb(0, 0, 255)")).toEqual({ r: 0, g: 0, b: 255, a: 1 });
      expect(parseColor("hsl(0, 100%, 50%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
      expect(parseColor("unrecognized")).toEqual({ r: 100, g: 116, b: 139, a: 1 });
    });

    it("converts rgb to hex and formats rgba strings", () => {
      expect(rgbToHex({ r: 255, g: 255, b: 255 })).toBe("#ffffff");
      expect(rgbToHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
      expect(rgbaString("#ff0000", 0.5)).toBe("rgba(255, 0, 0, 0.500)");
      expect(rgbaString({ r: 0, g: 128, b: 255, a: 0.8 })).toBe("rgba(0, 128, 255, 0.800)");
    });
  });

  describe("Color Interpolation & Multi-stop Evaluation", () => {
    it("interpolates between two colors", () => {
      const c1: RgbColor = { r: 0, g: 0, b: 0, a: 1 };
      const c2: RgbColor = { r: 100, g: 200, b: 50, a: 0.5 };
      const mid = interpolateRgb(c1, c2, 0.5);
      expect(mid).toEqual({ r: 50, g: 100, b: 25, a: 0.75 });
    });

    it("evaluates a multi-stop color ramp at various positions", () => {
      const stops: ColorStop[] = [
        { stop: 0.0, color: "#000000" },
        { stop: 0.5, color: "#808080" },
        { stop: 1.0, color: "#ffffff" },
      ];

      expect(evaluateColorRamp(stops, 0.0)).toBe("#000000");
      expect(evaluateColorRamp(stops, 0.5)).toBe("#808080");
      expect(evaluateColorRamp(stops, 1.0)).toBe("#ffffff");
      expect(evaluateColorRamp(stops, -1.0)).toBe("#000000");
      expect(evaluateColorRamp(stops, 2.0)).toBe("#ffffff");
    });

    it("supports invert flag in evaluateColorRamp", () => {
      const stops: ColorStop[] = [
        { stop: 0.0, color: "#000000" },
        { stop: 1.0, color: "#ffffff" },
      ];
      expect(evaluateColorRamp(stops, 0.0, true)).toBe("#ffffff");
      expect(evaluateColorRamp(stops, 1.0, true)).toBe("#000000");
    });

    it("resolves built-in preset color stops correctly", () => {
      expect(resolveColorStops("viridis")).toBe(PRESET_COLOR_RAMPS.viridis);
      expect(resolveColorStops("inferno")).toBe(PRESET_COLOR_RAMPS.inferno);
      expect(resolveColorStops("risk-alert")).toBe(PRESET_COLOR_RAMPS["risk-alert"]);
      expect(resolveColorStops("cyber-heat")).toBe(PRESET_COLOR_RAMPS["cyber-heat"]);

      const custom: ColorStop[] = [
        { stop: 0, color: "#111111" },
        { stop: 1, color: "#222222" },
      ];
      expect(resolveColorStops("custom", custom)).toEqual(custom);
    });
  });

  describe("Normalization & Scaling Transformations", () => {
    it("handles linear scaling", () => {
      expect(normalizeValue(50, 0, 100, "linear")).toBe(0.5);
      expect(normalizeValue(0, 0, 100, "linear")).toBe(0.0);
      expect(normalizeValue(100, 0, 100, "linear")).toBe(1.0);
      expect(normalizeValue(150, 0, 100, "linear")).toBe(1.0); // Clamped
    });

    it("handles logarithmic scaling", () => {
      const min = 0;
      const max = 1000;
      const midVal = 100;
      const normMid = normalizeValue(midVal, min, max, "log");
      expect(normMid).toBeGreaterThan(0.5); // Log curve compresses top end
      expect(normalizeValue(0, min, max, "log")).toBe(0);
      expect(normalizeValue(1000, min, max, "log")).toBe(1);
    });

    it("handles square root scaling", () => {
      const min = 0;
      const max = 100;
      expect(normalizeValue(25, min, max, "sqrt")).toBe(0.5);
      expect(normalizeValue(0, min, max, "sqrt")).toBe(0);
      expect(normalizeValue(100, min, max, "sqrt")).toBe(1);
    });

    it("handles quantile scaling with sorted domains", () => {
      const domain = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
      const rankVal = normalizeValue(50, 10, 100, "quantile", domain);
      expect(rankVal).toBeCloseTo(0.5, 1);
    });

    it("gracefully handles invalid min >= max or non-finite inputs", () => {
      expect(normalizeValue(50, 100, 50, "linear")).toBe(0.5);
      expect(normalizeValue(Number.NaN, 0, 100, "linear")).toBe(0);
      expect(normalizeValue(Number.POSITIVE_INFINITY, 0, 100, "linear")).toBe(0);
    });
  });

  describe("Glow Style Generation", () => {
    it("generates CSS multi-layer box-shadow strings", () => {
      const glow = generateGlowStyle("#3b82f6", 0.8, 14);
      expect(glow).toContain("rgba(59, 130, 246");
      expect(glow).toContain("14px");
      expect(glow).toContain("28px");
    });
  });
});
