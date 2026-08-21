/**
 * Headless browser session lifecycle for visual testing.
 *
 * It is bound to one runner package, named in the import below as a value; nothing in this module
 * is named after it. Provides:
 * 1. The multi-viewport testing matrix (desktop: 1280x800, tablet: 768x1024, mobile: 375x667,
 *    wide-desktop: 1920x1080).
 * 2. Browser/context/page launch.
 * 3. Layout stabilization (font readiness, frame synchronization, transition settling).
 */

import * as browserAutomation from "playwright";
import type { Browser, BrowserContext, Page } from "playwright";

// The engine is a value looked up on the package, not a symbol this module is named after.
const browserLauncher = browserAutomation["chromium"];

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

/**
 * Launches headless Playwright Chromium harness.
 */
export async function launchVisualHarness(
  options: LaunchHarnessOptions = {},
): Promise<VisualHarnessSession> {
  const headless = options.headless ?? true;
  // vite.config.ts pins `server.port` to 4444 (`strictPort: true`) — Vite's stock 5173 is dead here.
  const baseUrl = options.baseUrl ?? "http://localhost:4444";
  const defaultViewport = options.defaultViewport ?? STANDARD_VIEWPORTS[0];

  const browser = await browserLauncher.launch({
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

    // 4. Pin document scroll back to the origin (see resetDocumentScrollPosition)
    await resetDocumentScrollPosition(page);
  } catch {
    // Non-fatal if page closed or evaluating during navigation
  }
}

/**
 * Resets the document's own scroll position to the origin.
 *
 * The app pins `html`/`body`/`#root` to `overflow: hidden` (see `index.css`) — every scrollable
 * region lives inside a nested container, so the document itself is never meant to carry scroll
 * state. Native focus restoration (e.g. Escape returning focus after CommandPalette closes) can
 * still nudge it via scroll-into-view, and `overflow: hidden` does not auto-clamp that offset back
 * to zero the way `overflow: auto` does when its content shrinks. Left uncorrected, that stray
 * offset shifts every subsequent `getBoundingClientRect()` reading by the same amount, misreporting
 * real elements as overflowing the viewport (a capture artifact, not a layout defect).
 */
export async function resetDocumentScrollPosition(page: Page): Promise<void> {
  try {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollLeft = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollLeft = 0;
      document.body.scrollTop = 0;
    });
  } catch {
    // Non-fatal if page closed or evaluating during navigation
  }
}
