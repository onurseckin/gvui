import { describe, expect, test } from "bun:test";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG } from "./config";
import type { NormalizedEdge } from "./types";
import { measureBadgeRect, measureBadgeRects } from "./badgeMeasurement";

describe("badgeMeasurement", () => {
  describe("measureBadgeRect", () => {
    test("returns zero rect for empty non-cycle label", () => {
      const rect = measureBadgeRect("", DEFAULT_CUSTOM_LAYOUT_CONFIG, false);
      expect(rect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    test("returns zero rect for whitespace-only non-cycle label", () => {
      const rect = measureBadgeRect("   ", DEFAULT_CUSTOM_LAYOUT_CONFIG, false);
      expect(rect).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    test("returns badge rect for cycle-only edge without label", () => {
      const rect = measureBadgeRect("", DEFAULT_CUSTOM_LAYOUT_CONFIG, true);
      expect(rect.height).toBe(28);
      expect(rect.width).toBe(60);
      expect(rect.x).toBe(0);
      expect(rect.y).toBe(0);
    });

    test("enforces minimum width of 60 for short labels", () => {
      const rect = measureBadgeRect("in", DEFAULT_CUSTOM_LAYOUT_CONFIG);
      expect(rect.height).toBe(28);
      expect(rect.width).toBe(60);
    });

    test("grows width deterministically for longer labels", () => {
      const label = "processing-request-payload";
      const rect = measureBadgeRect(label, DEFAULT_CUSTOM_LAYOUT_CONFIG);
      const expectedWidth = label.length * 7 + 24;
      expect(rect.height).toBe(28);
      expect(rect.width).toBe(expectedWidth);
      expect(rect.width).toBeGreaterThan(60);
    });

    test("includes cycle icon prefix in width for cycle edges with label", () => {
      const label = "retry";
      const rect = measureBadgeRect(label, DEFAULT_CUSTOM_LAYOUT_CONFIG, true);
      // "↺ retry" has length 7 -> 7 * 7 + 24 = 73
      const expectedWidth = 7 * 7 + 24;
      expect(rect.height).toBe(28);
      expect(rect.width).toBe(expectedWidth);
    });
  });

  describe("measureBadgeRects", () => {
    test("returns Map of Rects only for edges with badges", () => {
      const edges: NormalizedEdge[] = [
        { id: "e1", source: "n1", target: "n2", label: "success" },
        { id: "e2", source: "n2", target: "n3" },
        { id: "e3", source: "n3", target: "n1", isCycle: true },
        { id: "e4", source: "n3", target: "n4", label: "   " },
      ];

      const rectMap = measureBadgeRects(edges, DEFAULT_CUSTOM_LAYOUT_CONFIG);

      expect(rectMap.size).toBe(2);
      expect(rectMap.has("e1")).toBe(true);
      expect(rectMap.has("e2")).toBe(false);
      expect(rectMap.has("e3")).toBe(true);
      expect(rectMap.has("e4")).toBe(false);

      const e1Rect = rectMap.get("e1");
      expect(e1Rect).toBeDefined();
      if (e1Rect) {
        expect(e1Rect.width).toBe(7 * 7 + 24);
        expect(e1Rect.height).toBe(28);
      }

      const e3Rect = rectMap.get("e3");
      expect(e3Rect).toBeDefined();
      if (e3Rect) {
        expect(e3Rect.width).toBe(60);
        expect(e3Rect.height).toBe(28);
      }
    });

    test("returns empty Map when no edges have badges", () => {
      const edges: NormalizedEdge[] = [
        { id: "e1", source: "n1", target: "n2" },
        { id: "e2", source: "n2", target: "n3", label: "" },
      ];

      const rectMap = measureBadgeRects(edges, DEFAULT_CUSTOM_LAYOUT_CONFIG);
      expect(rectMap.size).toBe(0);
    });
  });
});
