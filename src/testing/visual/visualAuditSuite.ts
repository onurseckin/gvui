/**
 * Top-level entry point that runs a full multi-viewport visual capture and audit suite for a
 * target URL: launches a session, sweeps every configured viewport capturing a screenshot and
 * collecting DOM metrics for each, then synthesizes the results into one VisualMetricsReport.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  launchVisualHarness,
  setViewport,
  STANDARD_VIEWPORTS,
  waitForLayoutStabilization,
  type ViewportConfig,
} from "./visualHarnessSession";
import { captureVisualScreenshot, type CapturedScreenshotRecord } from "./visualScreenshotCapture";
import { collectVisualMetricsFromPage } from "./domMetricsCollection";
import {
  createVisualMetricsReport,
  type ViewportMetrics,
  type VisualMetricsReport,
} from "./visualMetricsReport";

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
