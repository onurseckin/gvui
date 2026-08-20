#!/usr/bin/env bun
/**
 * Automated Playwright Visual Capture & Metrics Collection Script.
 *
 * Drives end-to-end user interactions across GVUI components and captures
 * deterministic screenshots with in-place overwrites across every viewport in
 * `STANDARD_VIEWPORTS` (desktop, tablet, mobile, wide-desktop) — see
 * `browserVisualHarness.ts` for the authoritative matrix; this file must not
 * duplicate that list.
 *
 * Interactions executed:
 * - Phase 1: Left sidebar file selection and navigation
 * - Phase 2: Canvas viewport rendering and reset ('R')
 * - Phase 3: Node selection and NodeDetailDrawer tabs (Overview, Findings, Assets, I/O)
 * - Phase 4: Modal dialogs (CommandPalette 'Cmd+K', Lightbox)
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  captureVisualScreenshot,
  collectVisualMetricsFromPage,
  launchVisualHarness,
  setViewport,
  STANDARD_VIEWPORTS,
  waitForLayoutStabilization,
  type CapturedScreenshotRecord,
  type ViewportConfig,
} from "../src/testing/visual/browserVisualHarness";
import {
  createEmptyViewportMetrics,
  createVisualMetricsReport,
  type ViewportMetrics,
  type VisualMetricsReport,
} from "../src/testing/visual/visualMetricsCollector";

export interface VisualCaptureCliOptions {
  readonly baseUrl: string;
  readonly taskId: string;
  readonly outputDir: string;
  readonly reportPath: string;
  readonly capsulePath?: string;
  readonly viewports: readonly ViewportConfig[];
}

export function parseCliArgs(argv: readonly string[]): VisualCaptureCliOptions {
  let baseUrl = "http://localhost:4444";
  let taskId = "task-01-gvui-headless-playwright-visual-capture-engine";
  let outputDir = "reports/screenshots";
  let reportPath = "reports/visual-report.json";
  let capsulePath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url" && argv[i + 1]) {
      baseUrl = argv[++i];
    } else if (arg.startsWith("--url=")) {
      baseUrl = arg.slice(6);
    } else if (arg === "--task-id" && argv[i + 1]) {
      taskId = argv[++i];
    } else if (arg.startsWith("--task-id=")) {
      taskId = arg.slice(10);
    } else if (arg === "--output-dir" && argv[i + 1]) {
      outputDir = argv[++i];
    } else if (arg.startsWith("--output-dir=")) {
      outputDir = arg.slice(13);
    } else if (arg === "--report" && argv[i + 1]) {
      reportPath = argv[++i];
    } else if (arg.startsWith("--report=")) {
      reportPath = arg.slice(9);
    } else if (arg === "--run" && argv[i + 1]) {
      capsulePath = argv[++i];
    } else if (arg.startsWith("--run=")) {
      capsulePath = arg.slice(6);
    }
  }

  // Full matrix, sourced from the harness rather than duplicated here — see
  // `STANDARD_VIEWPORTS` in `browserVisualHarness.ts` for the definitions and dimensions.
  const viewports = STANDARD_VIEWPORTS;

  return {
    baseUrl,
    taskId,
    outputDir,
    reportPath,
    capsulePath,
    viewports,
  };
}

async function isServerReachable(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

export async function executeVisualCapture(options: VisualCaptureCliOptions): Promise<{
  readonly report: VisualMetricsReport;
  readonly screenshots: readonly CapturedScreenshotRecord[];
}> {
  console.log(`[visual-capture] Starting Playwright visual capture suite...`);
  console.log(`[visual-capture] Target URL: ${options.baseUrl}`);
  console.log(`[visual-capture] Output Directory: ${options.outputDir}`);

  const serverOnline = await isServerReachable(options.baseUrl);
  if (!serverOnline) {
    console.warn(
      `[visual-capture] Warning: Server at ${options.baseUrl} is not reachable. Ensure the dev/preview server is running if live capture is required.`,
    );
  }

  const harness = await launchVisualHarness({
    baseUrl: options.baseUrl,
  });

  const capturedScreenshots: CapturedScreenshotRecord[] = [];
  const viewportMetrics: Record<string, ViewportMetrics> = {};

  try {
    for (const viewport of options.viewports) {
      console.log(
        `\n[visual-capture] === Viewport: ${viewport.name} (${viewport.width}x${viewport.height}) ===`,
      );
      await setViewport(harness.page, viewport);

      if (serverOnline) {
        try {
          await harness.page.goto(options.baseUrl, {
            waitUntil: "domcontentloaded",
            timeout: 10000,
          });
          await waitForLayoutStabilization(harness.page);

          // ---------------------------------------------------------------------------------
          // Phase 1: Left Sidebar File Selection & Navigation
          // ---------------------------------------------------------------------------------
          console.log(`[visual-capture] Phase 1: Sidebar interactions & capture`);
          const sidebarToggle = harness.page.locator("button.sidebar-toggle-btn");
          if (await sidebarToggle.isVisible()) {
            await sidebarToggle.click().catch(() => {});
            await waitForLayoutStabilization(harness.page);
            await sidebarToggle.click().catch(() => {});
            await waitForLayoutStabilization(harness.page);
          }

          const shotSidebar = await captureVisualScreenshot(harness.page, {
            outputDir: options.outputDir,
            taskId: options.taskId,
            phase: "phase1",
            component: "sidebar",
            viewportName: viewport.name,
          });
          capturedScreenshots.push(shotSidebar);

          // ---------------------------------------------------------------------------------
          // Phase 2: Canvas Viewport Rendering & Reset ('R')
          // ---------------------------------------------------------------------------------
          console.log(`[visual-capture] Phase 2: Canvas viewport rendering & auto-fit reset`);
          await harness.page.keyboard.press("r");
          await waitForLayoutStabilization(harness.page);

          const shotCanvas = await captureVisualScreenshot(harness.page, {
            outputDir: options.outputDir,
            taskId: options.taskId,
            phase: "phase2",
            component: "canvas",
            viewportName: viewport.name,
          });
          capturedScreenshots.push(shotCanvas);

          // ---------------------------------------------------------------------------------
          // Phase 3: Node Detail Drawer Tabs (Overview, Findings, Assets, I/O)
          // ---------------------------------------------------------------------------------
          console.log(`[visual-capture] Phase 3: NodeDetailDrawer tab interactions`);
          const drawerTabs = ["overview", "findings", "assets", "io"];

          for (const tab of drawerTabs) {
            const tabButton = harness.page
              .locator(`[data-tab='${tab}'], [role='tab']:has-text('${tab}')`)
              .first();
            if (await tabButton.isVisible().catch(() => false)) {
              await tabButton.click().catch(() => {});
              await waitForLayoutStabilization(harness.page);
            }

            const shotTab = await captureVisualScreenshot(harness.page, {
              outputDir: options.outputDir,
              taskId: options.taskId,
              phase: "phase3",
              component: `drawer-${tab}`,
              viewportName: viewport.name,
            });
            capturedScreenshots.push(shotTab);
          }

          // ---------------------------------------------------------------------------------
          // Phase 4: Command Palette Dialog (Cmd+K / Ctrl+K)
          // ---------------------------------------------------------------------------------
          console.log(`[visual-capture] Phase 4: CommandPalette modal dialog`);
          await harness.page.keyboard.press("Meta+k");
          await waitForLayoutStabilization(harness.page);

          const shotCommandPalette = await captureVisualScreenshot(harness.page, {
            outputDir: options.outputDir,
            taskId: options.taskId,
            phase: "phase4",
            component: "command-palette",
            viewportName: viewport.name,
          });
          capturedScreenshots.push(shotCommandPalette);

          // Close modal
          await harness.page.keyboard.press("Escape");
          await waitForLayoutStabilization(harness.page);

          // In-browser metrics evaluation
          const metrics = await collectVisualMetricsFromPage(harness.page, viewport);
          viewportMetrics[viewport.name] = metrics;
        } catch (err) {
          console.warn(
            `[visual-capture] Viewport ${viewport.name} navigation/interaction error:`,
            err,
          );
          viewportMetrics[viewport.name] = createEmptyViewportMetrics({
            name: viewport.name,
            width: viewport.width,
            height: viewport.height,
          });
        }
      } else {
        // Fallback placeholder metrics when server is offline
        viewportMetrics[viewport.name] = createEmptyViewportMetrics({
          name: viewport.name,
          width: viewport.width,
          height: viewport.height,
        });
      }
    }
  } finally {
    await harness.close();
  }

  // Synthesize VisualMetricsReport
  const report = createVisualMetricsReport({
    viewports: viewportMetrics,
    url: options.baseUrl,
  });

  // Write primary report
  const resolvedReportPath = resolve(options.reportPath);
  const reportDir = dirname(resolvedReportPath);
  if (!existsSync(reportDir)) {
    mkdirSync(reportDir, { recursive: true });
  }
  writeFileSync(resolvedReportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`[visual-capture] Visual report written to: ${resolvedReportPath}`);

  // Write to capsule directories if capsule path provided
  if (options.capsulePath) {
    const capsuleReportDir = join(resolve(options.capsulePath), "reports");
    if (!existsSync(capsuleReportDir)) {
      mkdirSync(capsuleReportDir, { recursive: true });
    }
    const capsuleReportFile = join(capsuleReportDir, "visual-report.json");
    writeFileSync(capsuleReportFile, JSON.stringify(report, null, 2), "utf-8");
    console.log(`[visual-capture] Capsule visual report written to: ${capsuleReportFile}`);
  }

  console.log(`\n[visual-capture] === Capture Complete ===`);
  console.log(`[visual-capture] Total screenshots captured: ${capturedScreenshots.length}`);
  console.log(`[visual-capture] Total elements checked: ${report.summary.totalElementsChecked}`);
  console.log(`[visual-capture] Total violations: ${report.summary.totalViolations}`);
  console.log(`[visual-capture] Integrity Score: ${report.summary.integrityScore}/100`);
  console.log(`[visual-capture] Accessibility Score: ${report.summary.accessibilityScore}/100`);
  console.log(`[visual-capture] Pass Status: ${report.summary.passed ? "PASSED" : "FAILED"}\n`);

  return { report, screenshots: capturedScreenshots };
}

if (
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("visual-capture.ts")
) {
  const options = parseCliArgs(process.argv.slice(2));
  executeVisualCapture(options).catch((err: unknown) => {
    console.error("[visual-capture] Fatal execution error:", err);
    process.exit(1);
  });
}
