/**
 * Headless Playwright Visual Test Harness.
 *
 * Provides headless Chromium automation for:
 * 1. Multi-viewport testing matrix (desktop: 1280x800, tablet: 768x1024, mobile: 375x667, wide-desktop: 1920x1080).
 * 2. Layout stabilization (font readiness, frame synchronization, transition settling).
 * 3. Deterministic screenshot capture with in-place overwriting.
 * 4. In-browser DOM telemetry extraction and VisualMetricsReport generation.
 */

import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import {
  createBoundingBox,
  createVisualMetricsReport,
  detectStackingCollisions,
  detectTextTruncation,
  detectViewportOverflow,
  evaluateContrastCompliance,
  type ContrastViolation,
  type ElementWithBounds,
  type OverflowViolation,
  type StackingViolation,
  type TextClippingViolation,
  type ViewportBounds,
  type ViewportMetrics,
  type VisualMetricsReport,
} from "./visualMetricsCollector";

export interface ViewportConfig {
  readonly name: "desktop" | "tablet" | "mobile" | "wide-desktop" | string;
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor?: number;
  readonly isMobile?: boolean;
  readonly hasTouch?: boolean;
}

export const STANDARD_VIEWPORTS: ReadonlyArray<ViewportConfig> = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 667, isMobile: true, hasTouch: true },
  { name: "wide-desktop", width: 1920, height: 1080 },
] as const;

export interface LaunchHarnessOptions {
  readonly headless?: boolean;
  readonly baseUrl?: string;
  readonly defaultViewport?: ViewportConfig;
  readonly colorScheme?: "dark" | "light" | "no-preference";
}

export interface VisualHarnessSession {
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
}

export interface CaptureScreenshotOptions {
  readonly outputDir: string;
  readonly filename?: string;
  readonly taskId?: string;
  readonly phase?: string;
  readonly component?: string;
  readonly viewportName?: string;
  readonly fullPage?: boolean;
  readonly overwrite?: boolean;
}

export interface CapturedScreenshotRecord {
  readonly filename: string;
  readonly filepath: string;
  readonly width: number;
  readonly height: number;
  readonly viewport: string;
  readonly component: string;
  readonly sizeBytes: number;
  readonly timestamp: string;
}

/**
 * Builds deterministic screenshot filename following the specification:
 * `${taskId}-${phase}-${component}-${viewport.name}.png` or `${viewport.name}-${component}.png`.
 */
export function buildDeterministicScreenshotFilename(options: {
  readonly filename?: string;
  readonly taskId?: string;
  readonly phase?: string;
  readonly component?: string;
  readonly viewportName?: string;
}): string {
  if (options.filename) {
    return options.filename.endsWith(".png") ? options.filename : `${options.filename}.png`;
  }

  const vp = options.viewportName ?? "desktop";
  const comp = options.component ?? "canvas";

  if (options.taskId && options.phase) {
    return `${options.taskId}-${options.phase}-${comp}-${vp}.png`;
  }

  if (options.taskId) {
    return `${options.taskId}-${comp}-${vp}.png`;
  }

  return `${vp}-${comp}.png`;
}

/**
 * Launches headless Playwright Chromium harness.
 */
export async function launchVisualHarness(
  options: LaunchHarnessOptions = {},
): Promise<VisualHarnessSession> {
  const headless = options.headless ?? true;
  const baseUrl = options.baseUrl ?? "http://localhost:5173";
  const defaultViewport = options.defaultViewport ?? STANDARD_VIEWPORTS[0];

  const browser = await chromium.launch({
    headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
    ],
  });

  const context = await browser.newContext({
    viewport: {
      width: defaultViewport.width,
      height: defaultViewport.height,
    },
    colorScheme: options.colorScheme ?? "dark",
    deviceScaleFactor: defaultViewport.deviceScaleFactor ?? 1,
    hasTouch: defaultViewport.hasTouch ?? false,
    isMobile: defaultViewport.isMobile ?? false,
  });

  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    baseUrl,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}

/**
 * Updates the page viewport and settles layout across all breakpoints.
 */
export async function setViewport(page: Page, viewport: ViewportConfig | string): Promise<void> {
  const resolvedVp =
    typeof viewport === "string"
      ? (STANDARD_VIEWPORTS.find((v) => v.name === viewport) ?? {
          name: viewport,
          width: 1280,
          height: 800,
        })
      : viewport;

  await page.setViewportSize({
    width: resolvedVp.width,
    height: resolvedVp.height,
  });

  await waitForLayoutStabilization(page);
}

/**
 * Waits for complete font loading, requestAnimationFrame cycles, and transition stabilization.
 */
export async function waitForLayoutStabilization(
  page: Page,
  options?: { readonly timeoutMs?: number },
): Promise<void> {
  const timeout = options?.timeoutMs ?? 2000;

  try {
    // 1. Wait for web fonts
    await page.evaluate(async (maxWait) => {
      if (document.fonts?.ready) {
        await Promise.race([
          document.fonts.ready,
          new Promise((resolve) => setTimeout(resolve, maxWait)),
        ]);
      }
    }, timeout);

    // 2. Wait for double requestAnimationFrame cycle
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }),
    );

    // 3. Short idle buffer for CSS transitions
    await page.waitForTimeout(50);
  } catch {
    // Non-fatal if page closed or evaluating during navigation
  }
}

/**
 * Captures screenshot deterministically and overwrites existing destination cleanly.
 */
export async function captureVisualScreenshot(
  page: Page,
  options: CaptureScreenshotOptions,
): Promise<CapturedScreenshotRecord> {
  const filename = buildDeterministicScreenshotFilename(options);
  const outDir = resolve(options.outputDir);

  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const filepath = join(outDir, filename);
  await waitForLayoutStabilization(page);

  await page.screenshot({
    path: filepath,
    fullPage: options.fullPage ?? false,
    animations: "disabled",
  });

  const vpSize = page.viewportSize() ?? { width: 1280, height: 800 };
  const stat = statSync(filepath);

  return {
    filename,
    filepath,
    width: vpSize.width,
    height: vpSize.height,
    viewport: options.viewportName ?? "desktop",
    component: options.component ?? "canvas",
    sizeBytes: stat.size,
    timestamp: new Date().toISOString(),
  };
}

interface RawElementMetricsPayload {
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
  readonly bgColor: string;
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

    const findEffectiveBackground = (el: Element): string => {
      let curr: Element | null = el;
      while (curr) {
        const style = window.getComputedStyle(curr);
        const bg = style.backgroundColor;
        if (bg && bg !== "transparent" && bg !== "rgba(0, 0, 0, 0)") {
          return bg;
        }
        curr = curr.parentElement;
      }
      return "rgb(15, 23, 42)"; // Default slate-900 canvas
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
        bgColor: findEffectiveBackground(el),
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
      const contrastRes = evaluateContrastCompliance(item.fgColor, item.bgColor, {
        fontSizePx: item.fontSizePx,
        fontWeight: item.fontWeight,
        selector: item.selector,
        textSnippet: item.textSnippet,
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

/**
 * Runs a multi-viewport visual capture and audit suite for a target URL.
 */
export async function runVisualAuditSuite(options: {
  readonly baseUrl?: string;
  readonly outputDir: string;
  readonly reportPath?: string;
  readonly viewports?: readonly ViewportConfig[];
  readonly taskId?: string;
}): Promise<{
  readonly report: VisualMetricsReport;
  readonly screenshots: readonly CapturedScreenshotRecord[];
}> {
  const harness = await launchVisualHarness({
    baseUrl: options.baseUrl,
  });

  const viewports = options.viewports ?? STANDARD_VIEWPORTS;
  const screenshots: CapturedScreenshotRecord[] = [];
  const viewportMetricsMap: Record<string, ViewportMetrics> = {};

  try {
    for (const vp of viewports) {
      await setViewport(harness.page, vp);
      await harness.page.goto(harness.baseUrl, { waitUntil: "domcontentloaded" });
      await waitForLayoutStabilization(harness.page);

      // Collect metrics
      const metrics = await collectVisualMetricsFromPage(harness.page, vp);
      viewportMetricsMap[vp.name] = metrics;

      // Capture screenshot
      const shot = await captureVisualScreenshot(harness.page, {
        outputDir: options.outputDir,
        taskId: options.taskId,
        phase: "canvas",
        component: "overview",
        viewportName: vp.name,
      });
      screenshots.push(shot);
    }
  } finally {
    await harness.close();
  }

  const report = createVisualMetricsReport({
    viewports: viewportMetricsMap,
    url: harness.baseUrl,
  });

  if (options.reportPath) {
    const reportFile = resolve(options.reportPath);
    const reportDir = dirname(reportFile);
    if (!existsSync(reportDir)) {
      mkdirSync(reportDir, { recursive: true });
    }
    writeFileSync(reportFile, JSON.stringify(report, null, 2), "utf-8");
  }

  return { report, screenshots };
}
