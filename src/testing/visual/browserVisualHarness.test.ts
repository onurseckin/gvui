import { describe, expect, it } from "bun:test";
import type { Page } from "playwright";
import {
  collectVisualMetricsFromPage,
  type RawElementMetricsPayload,
} from "./domMetricsCollection";
import {
  resetDocumentScrollPosition,
  waitForLayoutStabilization,
  type ViewportConfig,
} from "./visualHarnessSession";

// Playwright's real `Page` is a huge interface; every function under test here only ever calls
// `.evaluate` (and, for waitForLayoutStabilization, `.waitForTimeout`). Bridging that gap with a
// single documented `as unknown as Page` cast keeps this harness testable without a real browser.
type EvaluateFn = (...args: never[]) => unknown;

function createRecordingPageStub(): {
  readonly page: Page;
  readonly evaluateCalls: EvaluateFn[];
  readonly waitForTimeoutCalls: number[];
} {
  const evaluateCalls: EvaluateFn[] = [];
  const waitForTimeoutCalls: number[] = [];
  const stub = {
    evaluate: async (fn: EvaluateFn) => {
      evaluateCalls.push(fn);
      return undefined;
    },
    waitForTimeout: async (ms: number) => {
      waitForTimeoutCalls.push(ms);
    },
  };
  return { page: stub as unknown as Page, evaluateCalls, waitForTimeoutCalls };
}

function createRawElementsPageStub(raw: readonly RawElementMetricsPayload[]): Page {
  const stub = {
    evaluate: async () => raw,
  };
  return stub as unknown as Page;
}

describe("browserVisualHarness Module", () => {
  describe("resetDocumentScrollPosition", () => {
    it("asks the page to pin window/document scroll back to the origin", async () => {
      const { page, evaluateCalls } = createRecordingPageStub();

      await resetDocumentScrollPosition(page);

      expect(evaluateCalls).toHaveLength(1);

      // Execute the captured callback for real against a fabricated DOM-ish global, proving it
      // actually zeroes scroll state rather than merely asserting *some* evaluate call happened.
      // `overflow: hidden` on html/body/#root does not auto-clamp a stray scroll offset back to
      // zero the way `overflow: auto` does, so this reset is what stands in for that clamp.
      const scrollToArgs: number[][] = [];
      const fakeDocumentElement = { scrollLeft: 131, scrollTop: 7 };
      const fakeBody = { scrollLeft: 131, scrollTop: 7 };
      const globalScope = globalThis as unknown as {
        window?: unknown;
        document?: unknown;
      };
      const originalWindow = globalScope.window;
      const originalDocument = globalScope.document;
      globalScope.window = { scrollTo: (x: number, y: number) => scrollToArgs.push([x, y]) };
      globalScope.document = { documentElement: fakeDocumentElement, body: fakeBody };

      try {
        await evaluateCalls[0]();
      } finally {
        globalScope.window = originalWindow;
        globalScope.document = originalDocument;
      }

      expect(scrollToArgs).toEqual([[0, 0]]);
      expect(fakeDocumentElement).toEqual({ scrollLeft: 0, scrollTop: 0 });
      expect(fakeBody).toEqual({ scrollLeft: 0, scrollTop: 0 });
    });

    it("is non-fatal when the page evaluate call rejects", async () => {
      const stub = {
        evaluate: async () => {
          throw new Error("page closed");
        },
      };
      const result = await resetDocumentScrollPosition(stub as unknown as Page);
      expect(result).toBeUndefined();
    });
  });

  describe("waitForLayoutStabilization", () => {
    it("resets scroll position as part of every stabilization pass", async () => {
      const { page, evaluateCalls, waitForTimeoutCalls } = createRecordingPageStub();

      await waitForLayoutStabilization(page, { timeoutMs: 0 });

      // 1. font-readiness wait, 2. double-rAF wait, 3. resetDocumentScrollPosition's own evaluate.
      expect(evaluateCalls).toHaveLength(3);
      expect(waitForTimeoutCalls).toEqual([50]);
    });
  });

  describe("collectVisualMetricsFromPage", () => {
    const viewport: ViewportConfig = { name: "desktop", width: 1280, height: 800 };

    function buildRawElement(
      overrides: Partial<RawElementMetricsPayload>,
    ): RawElementMetricsPayload {
      return {
        selector: ".fixture",
        textSnippet: "Status: OK",
        bounds: { x: 10, y: 10, width: 100, height: 20, top: 10, right: 110, bottom: 30, left: 10 },
        clientWidth: 100,
        scrollWidth: 100,
        clientHeight: 20,
        scrollHeight: 20,
        fgColor: "rgb(148, 163, 184)",
        bgLayers: [],
        fontSizePx: 14,
        fontWeight: "400",
        cssOverflow: "visible",
        cssTextOverflow: "clip",
        cssWhiteSpace: "normal",
        isInteractive: false,
        ...overrides,
      };
    }

    it("checks contrast against the composited ancestor chain, not the nearest translucent layer against white", async () => {
      // Ground truth, verified directly against the exported pure functions before writing this
      // assertion (per B33 — look, don't infer): compositing
      // ["rgba(30, 41, 59, 0.9)", "rgba(0, 0, 0, 0)", "rgb(15, 23, 42)"] resolves to opaque
      // rgb(29, 39, 57), against which rgb(148, 163, 184) text is 5.84:1 (passes 4.5:1). Taking
      // the nearest translucent layer verbatim and compositing it against a default white
      // `baseBackground` — the exact old bug — instead yields 4.2:1 (fails). Same DOM state, two
      // different verdicts; this proves the fix, not just that the code runs.
      const raw = [
        buildRawElement({
          selector: ".dark-badge",
          bgLayers: ["rgba(30, 41, 59, 0.9)", "rgba(0, 0, 0, 0)", "rgb(15, 23, 42)"],
        }),
      ];

      const metrics = await collectVisualMetricsFromPage(createRawElementsPageStub(raw), viewport);

      expect(metrics.contrastIssues).toHaveLength(0);
    });

    it("still flags contrast against a background that stays under-contrast once fully composited", async () => {
      const raw = [
        buildRawElement({
          selector: ".low-contrast-badge",
          fgColor: "rgb(100, 100, 100)",
          bgLayers: ["rgb(120, 120, 120)"],
        }),
      ];

      const metrics = await collectVisualMetricsFromPage(createRawElementsPageStub(raw), viewport);

      expect(metrics.contrastIssues).toHaveLength(1);
      expect(metrics.contrastIssues[0].selector).toBe(".low-contrast-badge");
    });
  });
});
