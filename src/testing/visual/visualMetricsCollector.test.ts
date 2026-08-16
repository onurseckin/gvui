import { describe, expect, it } from "bun:test";
import {
  calculateContrastRatio,
  calculateRelativeLuminance,
  compositeColor,
  compositeMultipleLayers,
  createBoundingBox,
  createEmptyViewportMetrics,
  createVisualMetricsReport,
  detectContainerOverflow,
  detectStackingCollisions,
  detectTextTruncation,
  detectViewportOverflow,
  evaluateContrastCompliance,
  hslToRgb,
  isLargeText,
  parseColor,
  toBoundingBox,
  computeBoundingBoxOverlap,
  type ElementWithBounds,
  type RgbColor,
  type TextElementMetrics,
  type ViewportBounds,
  type ViewportMetrics,
} from "./visualMetricsCollector";

describe("visualMetricsCollector Module", () => {
  describe("Geometry & Bounding Box Utilities", () => {
    it("creates normalized bounding boxes from standard coordinates", () => {
      const box = createBoundingBox(10, 20, 100, 50);
      expect(box.x).toBe(10);
      expect(box.y).toBe(20);
      expect(box.width).toBe(100);
      expect(box.height).toBe(50);
      expect(box.left).toBe(10);
      expect(box.top).toBe(20);
      expect(box.right).toBe(110);
      expect(box.bottom).toBe(70);
    });

    it("normalizes negative width and height safely", () => {
      const box = createBoundingBox(50, 60, -30, -20);
      expect(box.x).toBe(20);
      expect(box.y).toBe(40);
      expect(box.width).toBe(30);
      expect(box.height).toBe(20);
      expect(box.left).toBe(20);
      expect(box.top).toBe(40);
      expect(box.right).toBe(50);
      expect(box.bottom).toBe(60);
    });

    it("handles non-finite values (NaN, Infinity) gracefully", () => {
      const box = createBoundingBox(NaN, Infinity, 100, -Infinity);
      expect(box.x).toBe(0);
      expect(box.y).toBe(0);
      expect(box.width).toBe(100);
      expect(box.height).toBe(0);
      expect(box.right).toBe(100);
      expect(box.bottom).toBe(0);
    });

    it("converts DOMRect-like objects via toBoundingBox", () => {
      const domRect = { left: 15, top: 25, width: 80, height: 40 };
      const box = toBoundingBox(domRect);
      expect(box.left).toBe(15);
      expect(box.top).toBe(25);
      expect(box.right).toBe(95);
      expect(box.bottom).toBe(65);
    });

    it("detects no overlap for completely disjoint bounding boxes", () => {
      const boxA = createBoundingBox(0, 0, 50, 50);
      const boxB = createBoundingBox(100, 100, 50, 50);
      const result = computeBoundingBoxOverlap(boxA, boxB);
      expect(result.hasOverlap).toBe(false);
      expect(result.intersectionBox).toBeNull();
      expect(result.overlapArea).toBe(0);
      expect(result.overlapPercentageA).toBe(0);
      expect(result.overlapPercentageB).toBe(0);
    });

    it("detects no overlap for edge-adjacent bounding boxes", () => {
      const boxA = createBoundingBox(0, 0, 50, 50);
      const boxB = createBoundingBox(50, 0, 50, 50);
      const result = computeBoundingBoxOverlap(boxA, boxB);
      expect(result.hasOverlap).toBe(false);
      expect(result.intersectionBox).toBeNull();
    });

    it("computes exact overlap geometry and percentages for intersecting boxes", () => {
      const boxA = createBoundingBox(0, 0, 100, 100); // area: 10000
      const boxB = createBoundingBox(50, 50, 100, 100); // area: 10000
      const result = computeBoundingBoxOverlap(boxA, boxB);
      expect(result.hasOverlap).toBe(true);
      expect(result.overlapArea).toBe(2500);
      expect(result.overlapPercentageA).toBe(25);
      expect(result.overlapPercentageB).toBe(25);
      expect(result.intersectionBox?.left).toBe(50);
      expect(result.intersectionBox?.top).toBe(50);
      expect(result.intersectionBox?.right).toBe(100);
      expect(result.intersectionBox?.bottom).toBe(100);
    });

    it("handles full enclosure where box A is inside box B", () => {
      const boxA = createBoundingBox(20, 20, 40, 40); // area: 1600
      const boxB = createBoundingBox(0, 0, 100, 100); // area: 10000
      const result = computeBoundingBoxOverlap(boxA, boxB);
      expect(result.hasOverlap).toBe(true);
      expect(result.overlapArea).toBe(1600);
      expect(result.overlapPercentageA).toBe(100);
      expect(result.overlapPercentageB).toBe(16);
      expect(result.intersectionBox?.x).toBe(20);
      expect(result.intersectionBox?.y).toBe(20);
    });

    it("handles zero area bounding boxes safely (0x0, 0x50, 50x0)", () => {
      const zeroZero = createBoundingBox(0, 0, 0, 0);
      const zeroWidth = createBoundingBox(10, 10, 0, 50);
      const zeroHeight = createBoundingBox(10, 10, 50, 0);
      const normalBox = createBoundingBox(0, 0, 100, 100);

      expect(computeBoundingBoxOverlap(zeroZero, normalBox).hasOverlap).toBe(false);
      expect(computeBoundingBoxOverlap(zeroWidth, normalBox).hasOverlap).toBe(false);
      expect(computeBoundingBoxOverlap(zeroHeight, normalBox).hasOverlap).toBe(false);
      expect(computeBoundingBoxOverlap(zeroZero, zeroZero).hasOverlap).toBe(false);
    });
  });

  describe("Exhaustive Boundary: Negative Coordinates & Subpixel Arithmetic", () => {
    it("handles negative coordinate offsets and quadrants", () => {
      // Box spanning across negative into positive quadrant
      const boxA = createBoundingBox(-50, -50, 100, 100); // left: -50, right: 50, top: -50, bottom: 50
      const boxB = createBoundingBox(0, 0, 100, 100); // left: 0, right: 100, top: 0, bottom: 100
      // Intersection should be [0, 0] to [50, 50] (area: 2500)
      const result = computeBoundingBoxOverlap(boxA, boxB);
      expect(result.hasOverlap).toBe(true);
      expect(result.overlapArea).toBe(2500);
      expect(result.intersectionBox?.x).toBe(0);
      expect(result.intersectionBox?.y).toBe(0);
      expect(result.intersectionBox?.width).toBe(50);
      expect(result.intersectionBox?.height).toBe(50);
    });

    it("evaluates subpixel fractional overlaps with high precision", () => {
      const boxA = createBoundingBox(0.25, 0.5, 99.75, 49.5);
      const boxB = createBoundingBox(50.5, 25.25, 100, 50);
      const result = computeBoundingBoxOverlap(boxA, boxB);
      expect(result.hasOverlap).toBe(true);
      expect(result.intersectionBox?.left).toBe(50.5);
      expect(result.intersectionBox?.top).toBe(25.25);
      expect(result.intersectionBox?.right).toBe(100);
      expect(result.intersectionBox?.bottom).toBe(50);
      expect(result.overlapArea).toBeCloseTo((100 - 50.5) * (50 - 25.25), 2);
    });

    it("rejects sub-tolerance overlaps below arithmetic epsilon", () => {
      const boxA = createBoundingBox(0, 0, 50, 50);
      const boxB = createBoundingBox(49.99999, 0, 50, 50);
      const result = computeBoundingBoxOverlap(boxA, boxB, 0.001);
      expect(result.hasOverlap).toBe(false);
      expect(result.overlapArea).toBe(0);
    });
  });

  describe("Viewport Boundary Overflow Detection", () => {
    const viewport: ViewportBounds = { width: 1280, height: 800 };

    it("returns null when element is fully within viewport", () => {
      const box = createBoundingBox(100, 100, 200, 150);
      const violation = detectViewportOverflow(box, viewport, ".valid-card");
      expect(violation).toBeNull();
    });

    it("detects horizontal right overflow", () => {
      const box = createBoundingBox(1200, 100, 150, 100);
      const violation = detectViewportOverflow(box, viewport, ".wide-table");
      expect(violation).not.toBeNull();
      expect(violation?.overflowRight).toBe(70);
      expect(violation?.overflowX).toBe(70);
      expect(violation?.overflowY).toBe(0);
      expect(violation?.severity).toBe("error");
      expect(violation?.description).toContain("overflows viewport");
    });

    it("detects horizontal left overflow", () => {
      const box = createBoundingBox(-25, 50, 100, 100);
      const violation = detectViewportOverflow(box, viewport, ".negative-offset");
      expect(violation).not.toBeNull();
      expect(violation?.overflowLeft).toBe(25);
      expect(violation?.overflowX).toBe(25);
    });

    it("detects vertical bottom overflow", () => {
      const box = createBoundingBox(50, 750, 100, 100);
      const violation = detectViewportOverflow(box, viewport, ".footer-overflow");
      expect(violation).not.toBeNull();
      expect(violation?.overflowBottom).toBe(50);
      expect(violation?.overflowY).toBe(50);
    });

    it("detects vertical top overflow", () => {
      const box = createBoundingBox(50, -15, 100, 100);
      const violation = detectViewportOverflow(box, viewport, ".header-overflow");
      expect(violation).not.toBeNull();
      expect(violation?.overflowTop).toBe(15);
    });

    it("detects multi-edge simultaneous overflow", () => {
      const box = createBoundingBox(-10, -10, 1320, 850);
      const violation = detectViewportOverflow(box, viewport, ".fullscreen-leak");
      expect(violation).not.toBeNull();
      expect(violation?.overflowLeft).toBe(10);
      expect(violation?.overflowTop).toBe(10);
      expect(violation?.overflowRight).toBe(30);
      expect(violation?.overflowBottom).toBe(40);
      expect(violation?.overflowX).toBe(40);
      expect(violation?.overflowY).toBe(50);
    });

    it("respects tolerance parameter for subpixel offsets", () => {
      const box = createBoundingBox(0, 0, 1280.4, 800.3);
      const violation = detectViewportOverflow(box, viewport, ".subpixel-card", 1.0);
      expect(violation).toBeNull();
    });
  });

  describe("Deep Nested Containers & Container Overflow Analysis", () => {
    it("detects child element exceeding parent container bounds on right and bottom", () => {
      const container = createBoundingBox(100, 100, 400, 300);
      const child = createBoundingBox(150, 150, 450, 350); // right = 600 > 500 (100px), bottom = 500 > 400 (100px)

      const violation = detectContainerOverflow(child, container, ".overflowing-drawer-content");
      expect(violation).not.toBeNull();
      expect(violation?.overflowRight).toBe(100);
      expect(violation?.overflowBottom).toBe(100);
      expect(violation?.overflowX).toBe(100);
      expect(violation?.overflowY).toBe(100);
      expect(violation?.severity).toBe("error");
      expect(violation?.description).toContain("overflows container");
    });

    it("detects child element overflowing container on top and left", () => {
      const container = createBoundingBox(200, 200, 300, 300);
      const child = createBoundingBox(180, 150, 200, 200); // left = 180 < 200 (20px), top = 150 < 200 (50px)

      const violation = detectContainerOverflow(child, container, ".negative-child");
      expect(violation).not.toBeNull();
      expect(violation?.overflowLeft).toBe(20);
      expect(violation?.overflowTop).toBe(50);
      expect(violation?.overflowX).toBe(20);
      expect(violation?.overflowY).toBe(50);
    });

    it("returns null when child is completely enclosed within container", () => {
      const container = createBoundingBox(100, 100, 500, 500);
      const child = createBoundingBox(120, 120, 300, 300);

      const violation = detectContainerOverflow(child, container, ".nested-node");
      expect(violation).toBeNull();
    });
  });

  describe("Text Truncation, Line-Height & Multi-line Clipping Analysis", () => {
    it("returns null for text with sufficient space", () => {
      const metrics: TextElementMetrics = {
        selector: ".node-title",
        textSnippet: "Database Service",
        clientWidth: 200,
        scrollWidth: 150,
        clientHeight: 30,
        scrollHeight: 24,
      };
      const result = detectTextTruncation(metrics);
      expect(result).toBeNull();
    });

    it("detects horizontal text truncation with ellipsis active", () => {
      const metrics: TextElementMetrics = {
        selector: ".node-label-truncated",
        textSnippet: "Extremely long node title that exceeds maximum container width",
        clientWidth: 120,
        scrollWidth: 280,
        clientHeight: 20,
        scrollHeight: 20,
        cssTextOverflow: "ellipsis",
        cssOverflow: "hidden",
        cssWhiteSpace: "nowrap",
      };
      const result = detectTextTruncation(metrics);
      expect(result).not.toBeNull();
      expect(result?.deltaX).toBe(160);
      expect(result?.deltaY).toBe(0);
      expect(result?.isTruncatedWithEllipsis).toBe(true);
      expect(result?.isClippedWithoutEllipsis).toBe(false);
    });

    it("detects horizontal text clipping WITHOUT ellipsis as error", () => {
      const metrics: TextElementMetrics = {
        selector: ".bad-badge-text",
        textSnippet: "Critical Failure Alert",
        clientWidth: 50,
        scrollWidth: 120,
        clientHeight: 18,
        scrollHeight: 18,
        cssTextOverflow: "clip",
        cssOverflow: "hidden",
      };
      const result = detectTextTruncation(metrics);
      expect(result).not.toBeNull();
      expect(result?.deltaX).toBe(70);
      expect(result?.isTruncatedWithEllipsis).toBe(false);
      expect(result?.isClippedWithoutEllipsis).toBe(true);
      expect(result?.severity).toBe("error");
    });

    it("detects vertical text clipping due to tight line-height or max-height", () => {
      const metrics: TextElementMetrics = {
        selector: ".finding-description",
        textSnippet: "First line of text\nSecond line of text\nThird line of text",
        clientWidth: 300,
        scrollWidth: 300,
        clientHeight: 32,
        scrollHeight: 60,
        cssOverflow: "hidden",
      };
      const result = detectTextTruncation(metrics);
      expect(result).not.toBeNull();
      expect(result?.deltaY).toBe(28);
      expect(result?.isClippedWithoutEllipsis).toBe(true);
      expect(result?.severity).toBe("error");
    });

    it("handles multi-line text with emojis, special symbols, and long continuous tokens", () => {
      const metrics: TextElementMetrics = {
        selector: ".command-code-output",
        textSnippet:
          "🚀 Deploying cluster: /var/lib/super_long_path_without_any_whitespace_breaking_points_1234567890",
        clientWidth: 250,
        scrollWidth: 600,
        clientHeight: 40,
        scrollHeight: 120,
        cssOverflow: "hidden",
        cssTextOverflow: "clip",
      };
      const result = detectTextTruncation(metrics);
      expect(result).not.toBeNull();
      expect(result?.deltaX).toBe(350);
      expect(result?.deltaY).toBe(80);
      expect(result?.severity).toBe("error");
    });

    it("handles massive 10,000+ character strings safely without timeout or memory bloat", () => {
      const longText = "A".repeat(10000);
      const metrics: TextElementMetrics = {
        selector: ".large-log-viewer",
        textSnippet: longText,
        clientWidth: 500,
        scrollWidth: 500,
        clientHeight: 200,
        scrollHeight: 10000,
        cssOverflow: "hidden",
      };
      const result = detectTextTruncation(metrics);
      expect(result).not.toBeNull();
      expect(result?.deltaY).toBe(9800);
      expect(result?.isClippedWithoutEllipsis).toBe(true);
    });
  });

  describe("Color Parsing & Conversion", () => {
    it("parses 3-digit hex colors", () => {
      expect(parseColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1.0 });
      expect(parseColor("#000")).toEqual({ r: 0, g: 0, b: 0, a: 1.0 });
      expect(parseColor("#f00")).toEqual({ r: 255, g: 0, b: 0, a: 1.0 });
    });

    it("parses 4-digit hex colors with alpha", () => {
      const c = parseColor("#ff08");
      expect(c?.r).toBe(255);
      expect(c?.g).toBe(255);
      expect(c?.b).toBe(0);
      expect(Math.round((c?.a ?? 0) * 100) / 100).toBe(0.53);
    });

    it("parses 6-digit hex colors", () => {
      expect(parseColor("#3b82f6")).toEqual({ r: 59, g: 130, b: 246, a: 1.0 });
      expect(parseColor("#0f172a")).toEqual({ r: 15, g: 23, b: 42, a: 1.0 });
    });

    it("parses 8-digit hex colors with alpha", () => {
      const c = parseColor("#3b82f680");
      expect(c?.r).toBe(59);
      expect(c?.g).toBe(130);
      expect(c?.b).toBe(246);
      expect(Math.round((c?.a ?? 0) * 100) / 100).toBe(0.5);
    });

    it("parses rgb and rgba string formats", () => {
      expect(parseColor("rgb(255, 128, 0)")).toEqual({ r: 255, g: 128, b: 0, a: 1.0 });
      expect(parseColor("rgba(100, 150, 200, 0.75)")).toEqual({ r: 100, g: 150, b: 200, a: 0.75 });
      expect(parseColor("rgb(50 100 150 / 0.5)")).toEqual({ r: 50, g: 100, b: 150, a: 0.5 });
    });

    it("parses hsl and hsla strings", () => {
      const c = parseColor("hsl(0, 100%, 50%)");
      expect(c?.r).toBe(255);
      expect(c?.g).toBe(0);
      expect(c?.b).toBe(0);
      expect(c?.a).toBe(1.0);

      const semi = parseColor("hsla(240, 100%, 50%, 0.6)");
      expect(semi?.r).toBe(0);
      expect(semi?.g).toBe(0);
      expect(semi?.b).toBe(255);
      expect(semi?.a).toBe(0.6);
    });

    it("parses standard named colors", () => {
      expect(parseColor("white")).toEqual({ r: 255, g: 255, b: 255, a: 1.0 });
      expect(parseColor("black")).toEqual({ r: 0, g: 0, b: 0, a: 1.0 });
      expect(parseColor("transparent")).toEqual({ r: 0, g: 0, b: 0, a: 0.0 });
      expect(parseColor("slate")).toEqual({ r: 15, g: 23, b: 42, a: 1.0 });
    });

    it("returns null for invalid or non-color strings", () => {
      expect(parseColor("not-a-color")).toBeNull();
      expect(parseColor("")).toBeNull();
      expect(parseColor("rgb(invalid)")).toBeNull();
    });

    it("converts HSL to RGB across all hue segments", () => {
      expect(hslToRgb(60, 1, 0.5)).toEqual({ r: 255, g: 255, b: 0, a: 1.0 }); // Yellow
      expect(hslToRgb(120, 1, 0.5)).toEqual({ r: 0, g: 255, b: 0, a: 1.0 }); // Green
      expect(hslToRgb(180, 1, 0.5)).toEqual({ r: 0, g: 255, b: 255, a: 1.0 }); // Cyan
      expect(hslToRgb(240, 1, 0.5)).toEqual({ r: 0, g: 0, b: 255, a: 1.0 }); // Blue
      expect(hslToRgb(300, 1, 0.5)).toEqual({ r: 255, g: 0, b: 255, a: 1.0 }); // Magenta
    });
  });

  describe("Alpha Blending & Relative Luminance", () => {
    it("blends semi-transparent foreground over opaque background", () => {
      const fg: RgbColor = { r: 0, g: 0, b: 0, a: 0.5 };
      const bg: RgbColor = { r: 255, g: 255, b: 255, a: 1.0 };
      const blended = compositeColor(fg, bg);
      expect(blended.r).toBe(128);
      expect(blended.g).toBe(128);
      expect(blended.b).toBe(128);
      expect(blended.a).toBe(1.0);
    });

    it("returns foreground directly if alpha is 1.0", () => {
      const fg: RgbColor = { r: 100, g: 150, b: 200, a: 1.0 };
      const bg: RgbColor = { r: 255, g: 255, b: 255, a: 1.0 };
      expect(compositeColor(fg, bg)).toEqual(fg);
    });

    it("returns background directly if foreground alpha is 0.0", () => {
      const fg: RgbColor = { r: 100, g: 150, b: 200, a: 0.0 };
      const bg: RgbColor = { r: 255, g: 255, b: 255, a: 1.0 };
      expect(compositeColor(fg, bg)).toEqual(bg);
    });

    it("composites multiple stacked transparent layers over a base background", () => {
      // Base: #ffffff (white)
      // Layer 1: rgba(0, 0, 0, 0.5) -> creates rgb(128, 128, 128)
      // Layer 2: rgba(255, 0, 0, 0.5) -> composites red over grey -> rgb(192, 64, 64)
      const layers = ["rgba(0, 0, 0, 0.5)", "rgba(255, 0, 0, 0.5)"];
      const finalColor = compositeMultipleLayers(layers, { r: 255, g: 255, b: 255, a: 1.0 });

      expect(finalColor.r).toBe(192);
      expect(finalColor.g).toBe(64);
      expect(finalColor.b).toBe(64);
      expect(finalColor.a).toBe(1.0);
    });

    it("calculates relative luminance correctly for pure black and white", () => {
      const black: RgbColor = { r: 0, g: 0, b: 0, a: 1.0 };
      const white: RgbColor = { r: 255, g: 255, b: 255, a: 1.0 };
      expect(calculateRelativeLuminance(black)).toBe(0);
      expect(calculateRelativeLuminance(white)).toBe(1.0);
    });

    it("calculates relative luminance for intermediate sRGB colors", () => {
      const red: RgbColor = { r: 255, g: 0, b: 0, a: 1.0 };
      const green: RgbColor = { r: 0, g: 255, b: 0, a: 1.0 };
      const blue: RgbColor = { r: 0, g: 0, b: 255, a: 1.0 };

      const lumR = calculateRelativeLuminance(red);
      const lumG = calculateRelativeLuminance(green);
      const lumB = calculateRelativeLuminance(blue);

      expect(Math.round(lumR * 1000) / 1000).toBe(0.213);
      expect(Math.round(lumG * 1000) / 1000).toBe(0.715);
      expect(Math.round(lumB * 1000) / 1000).toBe(0.072);
    });
  });

  describe("WCAG AA Contrast Ratio & Compliance", () => {
    it("calculates maximum contrast 21:1 for black on white", () => {
      const ratio = calculateContrastRatio("#000000", "#ffffff");
      expect(ratio).toBe(21);
    });

    it("calculates minimum contrast 1:1 for identical colors", () => {
      const ratio = calculateContrastRatio("#3b82f6", "#3b82f6");
      expect(ratio).toBe(1);
    });

    it("correctly identifies large text threshold", () => {
      expect(isLargeText(24, "normal")).toBe(true);
      expect(isLargeText(24, 400)).toBe(true);
      expect(isLargeText(18.66, "bold")).toBe(true);
      expect(isLargeText(19, 700)).toBe(true);
      expect(isLargeText(18, "normal")).toBe(false);
      expect(isLargeText(16, "bold")).toBe(false);
    });

    it("evaluates normal text WCAG AA compliance (4.5:1 threshold)", () => {
      // #767676 on #ffffff is ~4.54:1 (Passes normal text)
      const pass = evaluateContrastCompliance("#767676", "#ffffff", { fontSizePx: 14 });
      expect(pass.passes).toBe(true);
      expect(pass.requiredRatio).toBe(4.5);
      expect(pass.violation).toBeNull();

      // #94a3b8 on #ffffff is ~2.42:1 (Fails normal text)
      const fail = evaluateContrastCompliance("#94a3b8", "#ffffff", {
        fontSizePx: 14,
        selector: ".subtle-label",
        textSnippet: "Optional meta",
      });
      expect(fail.passes).toBe(false);
      expect(fail.violation).not.toBeNull();
      expect(fail.violation?.requiredRatio).toBe(4.5);
      expect(fail.violation?.selector).toBe(".subtle-label");
      expect(fail.violation?.description).toContain("Insufficient WCAG AA contrast");
    });

    it("evaluates large text WCAG AA compliance (3.0:1 threshold)", () => {
      // #94a3b8 on #ffffff (~2.42:1) fails even for large text (< 3.0)
      const fail = evaluateContrastCompliance("#94a3b8", "#ffffff", {
        fontSizePx: 26,
        fontWeight: "bold",
      });
      expect(fail.passes).toBe(false);
      expect(fail.requiredRatio).toBe(3.0);

      // #888888 on #ffffff (~3.55:1) passes large text (>= 3.0) but fails normal text (< 4.5)
      const passLarge = evaluateContrastCompliance("#888888", "#ffffff", {
        fontSizePx: 24,
      });
      expect(passLarge.passes).toBe(true);
      expect(passLarge.requiredRatio).toBe(3.0);

      const failNormal = evaluateContrastCompliance("#888888", "#ffffff", {
        fontSizePx: 14,
      });
      expect(failNormal.passes).toBe(false);
      expect(failNormal.requiredRatio).toBe(4.5);
    });

    it("evaluates dark mode theme contrast against slate background (#0f172a)", () => {
      const darkBg = { r: 15, g: 23, b: 42, a: 1.0 }; // #0f172a

      // Crisp white text on dark background -> ~18:1 ratio (Passes)
      const passWhite = evaluateContrastCompliance("#f8fafc", "#0f172a", {
        baseBackground: darkBg,
      });
      expect(passWhite.passes).toBe(true);
      expect(passWhite.contrastRatio).toBeGreaterThan(15);

      // Very dark gray text on dark background -> ~1.4:1 ratio (Fails)
      const failDark = evaluateContrastCompliance("#1e293b", "#0f172a", {
        baseBackground: darkBg,
      });
      expect(failDark.passes).toBe(false);
    });

    it("handles semi-transparent foreground colors with canvas background blending", () => {
      // rgba(0, 0, 0, 0.7) on white is rgb(77, 77, 77) -> contrast ratio ~6.0:1 (Passes)
      const res = evaluateContrastCompliance("rgba(0, 0, 0, 0.7)", "#ffffff", {
        fontSizePx: 14,
      });
      expect(res.passes).toBe(true);
      expect(res.contrastRatio).toBeGreaterThan(4.5);
    });
  });

  describe("Stacking Collisions & Stacking Violations", () => {
    it("detects collision between overlapping interactive elements", () => {
      const elements: ElementWithBounds[] = [
        {
          selector: "button.submit-btn",
          bounds: createBoundingBox(100, 100, 120, 40),
          isInteractive: true,
        },
        {
          selector: "button.cancel-btn",
          bounds: createBoundingBox(150, 110, 120, 40),
          isInteractive: true,
        },
      ];

      const collisions = detectStackingCollisions(elements, 10);
      expect(collisions.length).toBe(1);
      expect(collisions[0].selectorA).toBe("button.submit-btn");
      expect(collisions[0].selectorB).toBe("button.cancel-btn");
      expect(collisions[0].severity).toBe("error");
      expect(collisions[0].overlapArea).toBeGreaterThan(10);
    });

    it("ignores non-overlapping elements", () => {
      const elements: ElementWithBounds[] = [
        {
          selector: "header.nav",
          bounds: createBoundingBox(0, 0, 1280, 60),
        },
        {
          selector: "main.content",
          bounds: createBoundingBox(0, 60, 1280, 740),
        },
      ];

      const collisions = detectStackingCollisions(elements);
      expect(collisions.length).toBe(0);
    });

    it("handles large arrays of 100+ elements with complex overlaps without degradation", () => {
      const elements: ElementWithBounds[] = [];
      for (let i = 0; i < 50; i++) {
        elements.push({
          selector: `.grid-item-${i}`,
          bounds: createBoundingBox(i * 10, i * 10, 80, 80),
          isInteractive: i % 2 === 0,
        });
      }

      const collisions = detectStackingCollisions(elements, 100);
      expect(collisions.length).toBeGreaterThan(0);
    });
  });

  describe("Report Synthesis & Scoring", () => {
    it("generates a perfect score report for passing metrics", () => {
      const desktopVp: ViewportMetrics = {
        viewport: { name: "desktop", width: 1280, height: 800 },
        totalElementsChecked: 45,
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

      const report = createVisualMetricsReport({
        viewports: { desktop: desktopVp },
        dataset: "pipeline-run-test",
        url: "http://localhost:5173",
      });

      expect(report.summary.passed).toBe(true);
      expect(report.summary.totalViolations).toBe(0);
      expect(report.summary.integrityScore).toBe(100);
      expect(report.summary.accessibilityScore).toBe(100);
      expect(report.dataset).toBe("pipeline-run-test");
    });

    it("accurately calculates violation counts and reduced scores when issues exist", () => {
      const box = createBoundingBox(1200, 100, 150, 100);
      const overflow = detectViewportOverflow(box, { width: 1280, height: 800 }, ".wide-card")!;
      const textViolation = detectTextTruncation({
        selector: ".badge",
        textSnippet: "Long text",
        clientWidth: 20,
        scrollWidth: 80,
        clientHeight: 15,
        scrollHeight: 15,
        cssTextOverflow: "clip",
        cssOverflow: "hidden",
      })!;
      const contrastViolation = evaluateContrastCompliance("#94a3b8", "#ffffff", {
        selector: ".dim-text",
        textSnippet: "Dimmed caption",
      }).violation!;

      const mobileVp: ViewportMetrics = {
        viewport: { name: "mobile", width: 375, height: 667 },
        totalElementsChecked: 30,
        totalViolations: 3,
        overflowCount: 1,
        clippingCount: 1,
        collisionCount: 0,
        contrastViolationCount: 1,
        passed: false,
        integrityScore: 85,
        accessibilityScore: 90,
        layoutOverflows: [overflow],
        textClippings: [textViolation],
        collisions: [],
        contrastIssues: [contrastViolation],
      };

      const report = createVisualMetricsReport({
        viewports: { mobile: mobileVp },
      });

      expect(report.summary.passed).toBe(false);
      expect(report.summary.overflowCount).toBe(1);
      expect(report.summary.clippingCount).toBe(1);
      expect(report.summary.contrastViolationCount).toBe(1);
      expect(report.summary.totalViolations).toBe(3);
      expect(report.layoutOverflows.length).toBe(1);
      expect(report.textClippings.length).toBe(1);
      expect(report.contrastIssues.length).toBe(1);
      expect(report.summary.integrityScore).toBeLessThan(100);
      expect(report.summary.accessibilityScore).toBeLessThan(100);
    });

    it("creates default empty viewport metrics helper", () => {
      const vp = createEmptyViewportMetrics({ name: "tablet", width: 768, height: 1024 });
      expect(vp.passed).toBe(true);
      expect(vp.viewport.name).toBe("tablet");
      expect(vp.totalViolations).toBe(0);
    });
  });
});
