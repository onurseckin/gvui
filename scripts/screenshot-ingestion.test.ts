import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  catalogVisualScreenshots,
  exportScreenshotEvidenceReport,
  generateScreenshotMarkdownSummary,
  parseScreenshotFilename,
  type VisualScreenshotRecord,
} from "./screenshot-ingestion";

describe("Screenshot Ingestion and Filename Parsing", () => {
  describe("parseScreenshotFilename", () => {
    it("correctly parses compound 'wide-desktop' prefix without splitting into 'wide'", () => {
      const result = parseScreenshotFilename("wide-desktop-worker-overview.png");
      expect(result.viewport).toBe("wide-desktop");
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.archetype).toBe("worker");
      expect(result.tab).toBe("overview");
    });

    it("correctly parses 'wide-desktop' with multi-token tabs", () => {
      const result = parseScreenshotFilename("wide-desktop-critic-raw-provenance.webp");
      expect(result.viewport).toBe("wide-desktop");
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.archetype).toBe("critic");
      expect(result.tab).toBe("raw-provenance");
    });

    it("correctly parses 'desktop' prefix", () => {
      const result = parseScreenshotFilename("desktop-gate-findings.png");
      expect(result.viewport).toBe("desktop");
      expect(result.width).toBe(1280);
      expect(result.height).toBe(800);
      expect(result.archetype).toBe("gate");
      expect(result.tab).toBe("findings");
    });

    it("correctly parses 'tablet' prefix", () => {
      const result = parseScreenshotFilename("tablet-plan-io.jpg");
      expect(result.viewport).toBe("tablet");
      expect(result.width).toBe(768);
      expect(result.height).toBe(1024);
      expect(result.archetype).toBe("plan");
      expect(result.tab).toBe("io");
    });

    it("correctly parses 'mobile' prefix", () => {
      const result = parseScreenshotFilename("mobile-prompt-overview.png");
      expect(result.viewport).toBe("mobile");
      expect(result.width).toBe(375);
      expect(result.height).toBe(667);
      expect(result.archetype).toBe("prompt");
      expect(result.tab).toBe("overview");
    });

    it("handles viewport prefix only with default canvas tab", () => {
      const result = parseScreenshotFilename("wide-desktop.png");
      expect(result.viewport).toBe("wide-desktop");
      expect(result.archetype).toBe("unknown");
      expect(result.tab).toBe("canvas");
    });

    it("handles viewport prefix with archetype only", () => {
      const result = parseScreenshotFilename("wide-desktop-worker.png");
      expect(result.viewport).toBe("wide-desktop");
      expect(result.archetype).toBe("worker");
      expect(result.tab).toBe("canvas");
    });

    it("falls back gracefully for unknown prefixes to desktop default", () => {
      const result = parseScreenshotFilename("custom-benchmark-graph.png");
      expect(result.viewport).toBe("desktop");
      expect(result.width).toBe(1280);
      expect(result.height).toBe(800);
      expect(result.archetype).toBe("custom");
      expect(result.tab).toBe("benchmark-graph");
    });
  });

  describe("catalogVisualScreenshots", () => {
    const tmpDir = join(process.cwd(), "test-results/tmp-ingestion-test");

    it("scans directory and produces valid manifest and markdown report with parsed metadata", () => {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
      mkdirSync(tmpDir, { recursive: true });

      writeFileSync(
        join(tmpDir, "wide-desktop-worker-overview.png"),
        Buffer.from("dummy-png-data"),
      );
      writeFileSync(join(tmpDir, "mobile-prompt-io.png"), Buffer.from("dummy-png-data-2"));

      const manifest = catalogVisualScreenshots(tmpDir, "test-dataset");

      expect(manifest.version).toBe("1.0.0");
      expect(manifest.dataset).toBe("test-dataset");
      expect(manifest.totalScreenshots).toBe(2);
      expect(manifest.screenshots).toHaveLength(2);

      const wide = manifest.screenshots.find(
        (s) => s.filename === "wide-desktop-worker-overview.png",
      );
      expect(wide).toBeDefined();
      expect(wide?.viewport).toBe("wide-desktop");
      expect(wide?.width).toBe(1920);
      expect(wide?.height).toBe(1080);
      expect(wide?.archetype).toBe("worker");
      expect(wide?.tab).toBe("overview");

      const mobile = manifest.screenshots.find((s) => s.filename === "mobile-prompt-io.png");
      expect(mobile).toBeDefined();
      expect(mobile?.viewport).toBe("mobile");
      expect(mobile?.width).toBe(375);
      expect(mobile?.height).toBe(667);
      expect(mobile?.archetype).toBe("prompt");
      expect(mobile?.tab).toBe("io");

      // Verify report was written
      const reportPath = join(tmpDir, "screenshot-evidence-report.md");
      expect(existsSync(reportPath)).toBe(true);
      const reportContent = readFileSync(reportPath, "utf-8");
      expect(reportContent).toContain("# Visual Screenshot Audit Evidence Report");
      expect(reportContent).toContain("wide-desktop");
      expect(reportContent).toContain("mobile");

      rmSync(tmpDir, { recursive: true, force: true });
    });
  });

  describe("generateScreenshotMarkdownSummary", () => {
    it("handles empty record list gracefully", () => {
      const summary = generateScreenshotMarkdownSummary([]);
      expect(summary).toContain("# Visual Screenshot Audit Evidence Report");
      expect(summary).toContain("No visual audit screenshots recorded.");
    });

    it("formats screenshot records into structured markdown tables and viewport galleries", () => {
      const mockRecords: VisualScreenshotRecord[] = [
        {
          id: "screenshot-desktop-worker-overview",
          viewport: "desktop",
          width: 1280,
          height: 800,
          archetype: "worker",
          tab: "overview",
          filename: "desktop-worker-overview.png",
          path: "/test-results/visual/desktop-worker-overview.png",
          timestamp: "2026-08-15T07:00:00.000Z",
          sizeBytes: 24576,
        },
        {
          id: "screenshot-mobile-gate-findings",
          viewport: "mobile",
          width: 375,
          height: 667,
          archetype: "gate",
          tab: "findings",
          filename: "mobile-gate-findings.png",
          path: "/test-results/visual/mobile-gate-findings.png",
          timestamp: "2026-08-15T07:00:00.000Z",
          sizeBytes: 12288,
        },
      ];

      const markdown = generateScreenshotMarkdownSummary(mockRecords);
      expect(markdown).toContain("# Visual Screenshot Audit Evidence Report");
      expect(markdown).toContain("**Total Screenshots Captured**: 2");
      expect(markdown).toContain("desktop, mobile");
      expect(markdown).toContain("worker, gate");
      expect(markdown).toContain("overview, findings");
      expect(markdown).toContain("## Screenshot Catalog Matrix");
      expect(markdown).toContain(
        "| Viewport | Archetype | Tab | Filename | Dimensions | Size (KB) |",
      );
      expect(markdown).toContain(
        "| `desktop` | `worker` | `overview` | `desktop-worker-overview.png` | 1280x800 | 24.0 KB |",
      );
      expect(markdown).toContain(
        "| `mobile` | `gate` | `findings` | `mobile-gate-findings.png` | 375x667 | 12.0 KB |",
      );
      expect(markdown).toContain("## Viewport Evidence Gallery");
      expect(markdown).toContain("### Viewport: `desktop` (1280x800)");
      expect(markdown).toContain("### Viewport: `mobile` (375x667)");
    });
  });

  describe("exportScreenshotEvidenceReport", () => {
    const exportTmpDir = join(process.cwd(), "test-results/tmp-export-test");
    const exportFile = join(exportTmpDir, "evidence-summary.md");

    it("writes markdown evidence report to specified output path", () => {
      if (existsSync(exportTmpDir)) {
        rmSync(exportTmpDir, { recursive: true, force: true });
      }

      const mockRecords: VisualScreenshotRecord[] = [
        {
          id: "screenshot-tablet-critic-assets",
          viewport: "tablet",
          width: 768,
          height: 1024,
          archetype: "critic",
          tab: "assets",
          filename: "tablet-critic-assets.png",
          path: "/test-results/visual/tablet-critic-assets.png",
          timestamp: "2026-08-15T07:00:00.000Z",
          sizeBytes: 16384,
        },
      ];

      const returnedMarkdown = exportScreenshotEvidenceReport(mockRecords, exportFile);
      expect(existsSync(exportFile)).toBe(true);

      const fileContent = readFileSync(exportFile, "utf-8");
      expect(fileContent).toBe(returnedMarkdown);
      expect(fileContent).toContain("tablet-critic-assets.png");
      expect(fileContent).toContain("768x1024");

      rmSync(exportTmpDir, { recursive: true, force: true });
    });
  });
});
