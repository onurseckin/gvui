/**
 * Deterministic screenshot capture with in-place overwriting for the visual test harness.
 */

import { existsSync, mkdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Page } from "playwright";
import { waitForLayoutStabilization } from "./visualHarnessSession";

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
