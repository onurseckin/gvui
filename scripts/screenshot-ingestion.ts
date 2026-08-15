import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface VisualAuditScreenshotRecord {
  id: string;
  viewport: "mobile" | "tablet" | "desktop" | "wide-desktop";
  width: number;
  height: number;
  archetype: string;
  tab: string;
  filename: string;
  path: string;
  timestamp: string;
  sizeBytes?: number;
}

export type VisualScreenshotRecord = VisualAuditScreenshotRecord;

export interface ScreenshotCatalogManifest {
  version: string;
  dataset: string;
  generatedAt: string;
  viewports: Array<{ name: string; width: number; height: number }>;
  screenshots: VisualAuditScreenshotRecord[];
  totalScreenshots: number;
}

export const KNOWN_VIEWPORTS: ReadonlyArray<{
  readonly name: "wide-desktop" | "desktop" | "tablet" | "mobile";
  readonly width: number;
  readonly height: number;
}> = [
  { name: "wide-desktop", width: 1920, height: 1080 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 667 },
];

/**
 * Parses screenshot filename into viewport metadata, archetype, and tab tokens.
 * Matches compound prefixes like 'wide-desktop' before splitting remaining tokens.
 */
export function parseScreenshotFilename(filename: string): {
  viewport: "wide-desktop" | "desktop" | "tablet" | "mobile";
  width: number;
  height: number;
  archetype: string;
  tab: string;
} {
  const stem = filename.replace(/\.[^.]+$/, "");
  const matchedVp = KNOWN_VIEWPORTS.find((v) => stem === v.name || stem.startsWith(`${v.name}-`));

  const vpName = matchedVp ? matchedVp.name : "desktop";
  const vpConfig = matchedVp ?? { name: "desktop" as const, width: 1280, height: 800 };

  const remainder =
    matchedVp && stem.startsWith(`${matchedVp.name}-`)
      ? stem.slice(matchedVp.name.length + 1)
      : stem === matchedVp?.name
        ? ""
        : stem;

  const remainderParts = remainder.length > 0 ? remainder.split("-") : [];
  const archetype = remainderParts.length > 0 ? remainderParts[0] : "unknown";
  const tab = remainderParts.length > 1 ? remainderParts.slice(1).join("-") : "canvas";

  return {
    viewport: vpName,
    width: vpConfig.width,
    height: vpConfig.height,
    archetype,
    tab,
  };
}

/**
 * Generates a structured Markdown summary of screenshot evidence records,
 * including summary metrics, catalog matrix table, and viewport gallery breakdown.
 */
export function generateScreenshotMarkdownSummary(records: VisualScreenshotRecord[]): string {
  if (!records || records.length === 0) {
    return [
      "# Visual Screenshot Audit Evidence Report",
      "",
      "No visual audit screenshots recorded.",
      "",
    ].join("\n");
  }

  const viewports = Array.from(new Set(records.map((r) => r.viewport)));
  const archetypes = Array.from(new Set(records.map((r) => r.archetype)));
  const tabs = Array.from(new Set(records.map((r) => r.tab)));
  const totalSizeBytes = records.reduce((acc, r) => acc + (r.sizeBytes ?? 0), 0);
  const totalSizeKb = (totalSizeBytes / 1024).toFixed(1);

  const lines: string[] = [
    "# Visual Screenshot Audit Evidence Report",
    "",
    `**Total Screenshots Captured**: ${records.length}  `,
    `**Viewports Evaluated**: ${viewports.join(", ")} (${viewports.length} total)  `,
    `**Archetypes Covered**: ${archetypes.join(", ")} (${archetypes.length} total)  `,
    `**Drawer Tabs Verified**: ${tabs.join(", ")} (${tabs.length} total)  `,
    `**Total Evidence Size**: ${totalSizeKb} KB  `,
    "",
    "## Screenshot Catalog Matrix",
    "",
    "| Viewport | Archetype | Tab | Filename | Dimensions | Size (KB) |",
    "| :--- | :--- | :--- | :--- | :--- | :--- |",
  ];

  for (const record of records) {
    const sizeKb = record.sizeBytes ? (record.sizeBytes / 1024).toFixed(1) : "0.0";
    lines.push(
      `| \`${record.viewport}\` | \`${record.archetype}\` | \`${record.tab}\` | \`${record.filename}\` | ${record.width}x${record.height} | ${sizeKb} KB |`,
    );
  }

  lines.push("");
  lines.push("## Viewport Evidence Gallery");
  lines.push("");

  for (const vp of viewports) {
    const vpRecords = records.filter((r) => r.viewport === vp);
    lines.push(
      `### Viewport: \`${vp}\` (${vpRecords[0]?.width ?? 0}x${vpRecords[0]?.height ?? 0})`,
    );
    lines.push("");
    for (const r of vpRecords) {
      lines.push(`- **Archetype**: \`${r.archetype}\` | **Tab**: \`${r.tab}\``);
      lines.push(`  - File: \`${r.filename}\``);
      lines.push(`  - Path: \`${r.path}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Exports visual screenshot audit evidence records to a formatted Markdown report file.
 */
export function exportScreenshotEvidenceReport(
  records: VisualScreenshotRecord[],
  outputPath?: string,
): string {
  const markdown = generateScreenshotMarkdownSummary(records);
  const targetPath =
    outputPath ?? resolve(process.cwd(), "test-results/visual/screenshot-evidence-report.md");

  const targetDir = dirname(targetPath);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  writeFileSync(targetPath, markdown, "utf-8");
  return markdown;
}

/**
 * Discovers, catalogs, and ingests visual audit screenshots into a structured manifest
 * and Markdown evidence report for consumption by the long-task harness summary pipeline.
 */
export function catalogVisualScreenshots(
  resultsDir: string = resolve(process.cwd(), "test-results/visual"),
  dataset: string = "2026-08-15-deep-audit-hardening-execution",
): ScreenshotCatalogManifest {
  if (!existsSync(resultsDir)) {
    mkdirSync(resultsDir, { recursive: true });
  }

  const files = existsSync(resultsDir)
    ? readdirSync(resultsDir).filter(
        (f) => f.endsWith(".png") || f.endsWith(".jpg") || f.endsWith(".webp"),
      )
    : [];

  const viewports: Array<{
    name: "mobile" | "tablet" | "desktop" | "wide-desktop";
    width: number;
    height: number;
  }> = [
    { name: "mobile", width: 375, height: 667 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1280, height: 800 },
    { name: "wide-desktop", width: 1920, height: 1080 },
  ];

  const screenshots: VisualAuditScreenshotRecord[] = files.map((filename) => {
    const fullPath = join(resultsDir, filename);
    const parsed = parseScreenshotFilename(filename);

    let sizeBytes = 0;
    try {
      const stat = readFileSync(fullPath);
      sizeBytes = stat.byteLength;
    } catch {
      // Ignore read error
    }

    return {
      id: `screenshot-${filename.replace(/\.[^.]+$/, "")}`,
      viewport: parsed.viewport,
      width: parsed.width,
      height: parsed.height,
      archetype: parsed.archetype,
      tab: parsed.tab,
      filename,
      path: fullPath,
      timestamp: new Date().toISOString(),
      sizeBytes,
    };
  });

  const manifest: ScreenshotCatalogManifest = {
    version: "1.0.0",
    dataset,
    generatedAt: new Date().toISOString(),
    viewports,
    screenshots,
    totalScreenshots: screenshots.length,
  };

  const manifestPath = join(resultsDir, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  const reportPath = join(resultsDir, "screenshot-evidence-report.md");
  exportScreenshotEvidenceReport(screenshots, reportPath);

  return manifest;
}

if (import.meta.main) {
  const manifest = catalogVisualScreenshots();
  process.stdout.write(
    `Cataloged ${manifest.totalScreenshots} screenshots in test-results/visual (manifest: test-results/visual/manifest.json)\n`,
  );
}
