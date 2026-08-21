/**
 * In-browser DOM telemetry extraction: walks the rendered page, pulls layout/text/color metrics
 * for each visible element, and runs them through the audit engine to build one viewport's
 * ViewportMetrics.
 */

import type { Page } from "playwright";
import {
  createBoundingBox,
  detectViewportOverflow,
  type OverflowViolation,
  type ViewportBounds,
} from "./boundingBoxGeometry";
import { detectTextTruncation, type TextClippingViolation } from "./textClippingDetection";
import {
  evaluateContrastCompliance,
  resolveEffectiveBackground,
  type ContrastViolation,
} from "./colorContrastAnalysis";
import {
  detectStackingCollisions,
  type ElementWithBounds,
  type StackingViolation,
} from "./stackingCollisionDetection";
import type { ViewportMetrics } from "./visualMetricsReport";
import type { ViewportConfig } from "./visualHarnessSession";

// Exported so tests can construct fixtures matching exactly what the in-page `evaluate` callback
// below produces, without duplicating (and risking drift from) this shape.
export interface RawElementMetricsPayload {
  readonly selector: string;
  readonly textSnippet: string;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
  readonly clientWidth: number;
  readonly scrollWidth: number;
  readonly clientHeight: number;
  readonly scrollHeight: number;
  readonly fgColor: string;
  // Raw ancestor `background-color` values, nearest-first (the element's own background at index
  // 0). Compositing them into one opaque backdrop happens on the Node side via
  // `resolveEffectiveBackground` — see that function's doc comment for why the in-page walk must
  // not flatten this itself.
  readonly bgLayers: readonly string[];
  readonly fontSizePx: number;
  readonly fontWeight: string;
  readonly cssOverflow: string;
  readonly cssTextOverflow: string;
  readonly cssWhiteSpace: string;
  readonly isInteractive: boolean;
}

/**
 * Injects DOM evaluation into the page to extract layout, text, and color metrics.
 */
export async function collectVisualMetricsFromPage(
  page: Page,
  viewport: ViewportConfig,
): Promise<ViewportMetrics> {
  const vpBounds: ViewportBounds = {
    width: viewport.width,
    height: viewport.height,
  };

  const rawElements = await page.evaluate((): RawElementMetricsPayload[] => {
    const results: RawElementMetricsPayload[] = [];
    const elements = document.querySelectorAll(
      "header, nav, main, aside, section, article, .app-container, .navbar-left, .navbar-right, .sidebar-container, .drawer-container, .command-palette-overlay, .command-palette-modal, .lightbox-dialog, button, a, input, [role='button'], [role='tab'], h1, h2, h3, h4, p, span, .node-card, .edge-badge",
    );

    const isVisible = (el: Element): boolean => {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const getSelector = (el: Element): string => {
      if (el.id) return `#${el.id}`;
      const tag = el.tagName.toLowerCase();
      const cls = Array.from(el.classList).slice(0, 2).join(".");
      return cls ? `${tag}.${cls}` : tag;
    };

    // Collects every ancestor's raw `background-color`, nearest-first, including `el`'s own.
    // Deliberately does NOT stop at the first non-transparent value or attempt to composite here —
    // a badge painted with a translucent background over a dark canvas needs the WHOLE chain to
    // resolve to the right opaque color, not just the nearest layer taken verbatim. The actual
    // compositing runs on the Node side (`resolveEffectiveBackground`), which can share the pure
    // alpha-blending math already used for contrast checks instead of duplicating it in-page.
    const collectBackgroundLayers = (el: Element): string[] => {
      const layers: string[] = [];
      let curr: Element | null = el;
      while (curr) {
        layers.push(window.getComputedStyle(curr).backgroundColor);
        curr = curr.parentElement;
      }
      return layers;
    };

    for (let i = 0; i < elements.length && i < 150; i++) {
      const el = elements[i];
      if (!isVisible(el)) continue;

      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const text = el.textContent?.trim().slice(0, 50) ?? "";

      const interactive =
        el.tagName === "BUTTON" ||
        el.tagName === "A" ||
        el.tagName === "INPUT" ||
        el.getAttribute("role") === "button" ||
        el.getAttribute("role") === "tab" ||
        style.cursor === "pointer";

      results.push({
        selector: getSelector(el),
        textSnippet: text,
        bounds: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        },
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
        fgColor: style.color,
        bgLayers: collectBackgroundLayers(el),
        fontSizePx: parseFloat(style.fontSize) || 14,
        fontWeight: style.fontWeight || "400",
        cssOverflow: style.overflow,
        cssTextOverflow: style.textOverflow,
        cssWhiteSpace: style.whiteSpace,
        isInteractive: interactive,
      });
    }

    return results;
  });

  const overflows: OverflowViolation[] = [];
  const clippings: TextClippingViolation[] = [];
  const contrasts: ContrastViolation[] = [];
  const elementsWithBounds: ElementWithBounds[] = [];

  for (const item of rawElements) {
    const box = createBoundingBox(
      item.bounds.x,
      item.bounds.y,
      item.bounds.width,
      item.bounds.height,
    );

    // 1. Viewport overflow check
    const overflow = detectViewportOverflow(box, vpBounds, item.selector);
    if (overflow) {
      overflows.push(overflow);
    }

    // 2. Text clipping check
    if (item.textSnippet.length > 0) {
      const clipping = detectTextTruncation({
        selector: item.selector,
        textSnippet: item.textSnippet,
        clientWidth: item.clientWidth,
        scrollWidth: item.scrollWidth,
        clientHeight: item.clientHeight,
        scrollHeight: item.scrollHeight,
        cssOverflow: item.cssOverflow,
        cssTextOverflow: item.cssTextOverflow,
        cssWhiteSpace: item.cssWhiteSpace,
      });
      if (clipping) {
        clippings.push(clipping);
      }
    }

    // 3. Contrast check
    if (item.textSnippet.length > 0) {
      // The composited ancestor chain IS the true backdrop, so it doubles as both the background
      // being checked and the base a translucent foreground would blend against — passing it as
      // `baseBackground` too is what stops that blend from silently defaulting to opaque white.
      const effectiveBackground = resolveEffectiveBackground(item.bgLayers);
      const contrastRes = evaluateContrastCompliance(item.fgColor, effectiveBackground, {
        fontSizePx: item.fontSizePx,
        fontWeight: item.fontWeight,
        selector: item.selector,
        textSnippet: item.textSnippet,
        baseBackground: effectiveBackground,
      });
      if (contrastRes.violation) {
        contrasts.push(contrastRes.violation);
      }
    }

    elementsWithBounds.push({
      selector: item.selector,
      bounds: box,
      isInteractive: item.isInteractive,
    });
  }

  // 4. Stacking collisions
  const collisions: StackingViolation[] = detectStackingCollisions(
    elementsWithBounds.filter((e) => e.isInteractive),
    20,
  );

  const totalElementsChecked = rawElements.length;
  const overflowCount = overflows.length;
  const clippingCount = clippings.length;
  const collisionCount = collisions.length;
  const contrastViolationCount = contrasts.length;
  const totalViolations = overflowCount + clippingCount + collisionCount + contrastViolationCount;

  const integrityScore = Math.max(
    0,
    Math.min(100, Math.round(100 - (overflowCount * 10 + clippingCount * 5 + collisionCount * 15))),
  );
  const accessibilityScore = Math.max(
    0,
    Math.min(100, Math.round(100 - contrastViolationCount * 10)),
  );

  return {
    viewport: {
      name: viewport.name,
      width: viewport.width,
      height: viewport.height,
    },
    totalElementsChecked,
    totalViolations,
    overflowCount,
    clippingCount,
    collisionCount,
    contrastViolationCount,
    passed: totalViolations === 0,
    integrityScore,
    accessibilityScore,
    layoutOverflows: overflows,
    textClippings: clippings,
    collisions,
    contrastIssues: contrasts,
  };
}
