import { useCallback, useEffect, useMemo, useState, type FC } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconCode,
  IconCoins,
  IconCopy,
  IconDownload,
  IconFileText,
  IconGauge,
  IconMoon,
  IconPrinter,
  IconSun,
  IconX,
} from "@tabler/icons-react";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphDataset } from "../../types/graphData";
import { buildExecutiveReportData } from "../../engine/reporting/metricsAggregator";
import {
  downloadReportHtml,
  downloadReportJson,
  downloadReportMarkdown,
  generateExecutiveReportHtml,
  generateExecutiveReportJson,
  generateExecutiveReportMarkdown,
  printReportPdf,
} from "../../engine/reporting/formatters";
import type { ExecutiveReportConfig, ReportExportFormat } from "../../engine/reporting/types";
import { ScorecardView } from "./ScorecardView";
import { BlastRadiusMatrixView } from "./BlastRadiusMatrixView";
import { TokenAttributionChartView } from "./TokenAttributionChartView";
import "./ExecutiveReport.css";

export interface ExecutiveReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset?: GraphDataset | null;
  defaultFormat?: ReportExportFormat;
  onExportSuccess?: (format: ReportExportFormat) => void;
}

export type PreviewTab = "scorecards" | "blast-radius" | "token-attribution" | "raw-code";

export const ExecutiveReportModal: FC<ExecutiveReportModalProps> = ({
  isOpen,
  onClose,
  dataset: propDataset,
  defaultFormat = "pdf",
  onExportSuccess,
}) => {
  const storeDataset = useGraphStore((state) => state.dataset);
  const dataset = propDataset ?? storeDataset;

  const [activeFormat, setActiveFormat] = useState<ReportExportFormat>(defaultFormat);
  const [activeTab, setActiveTab] = useState<PreviewTab>("scorecards");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [copied, setCopied] = useState<boolean>(false);
  const [customNotes, setCustomNotes] = useState<string>("");

  const [includeScorecard, setIncludeScorecard] = useState<boolean>(true);
  const [includeBlastRadius, setIncludeBlastRadius] = useState<boolean>(true);
  const [includeTokenAttribution, setIncludeTokenAttribution] = useState<boolean>(true);
  const [includeFindings, setIncludeFindings] = useState<boolean>(true);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const reportConfig: ExecutiveReportConfig = useMemo(
    () => ({
      theme,
      customNotes: customNotes.trim().length > 0 ? customNotes : undefined,
      includeScorecard,
      includeBlastRadius,
      includeTokenAttribution,
      includeFindings,
      format: activeFormat,
    }),
    [
      theme,
      customNotes,
      includeScorecard,
      includeBlastRadius,
      includeTokenAttribution,
      includeFindings,
      activeFormat,
    ],
  );

  const reportData = useMemo(() => {
    return buildExecutiveReportData(dataset, reportConfig);
  }, [dataset, reportConfig]);

  const rawCodeOutput = useMemo(() => {
    switch (activeFormat) {
      case "markdown":
        return generateExecutiveReportMarkdown(reportData, reportConfig);
      case "json":
        return generateExecutiveReportJson(reportData, reportConfig);
      case "html":
      case "pdf":
      default:
        return generateExecutiveReportHtml(reportData, reportConfig);
    }
  }, [activeFormat, reportData, reportConfig]);

  const handleCopy = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(rawCodeOutput);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        onExportSuccess?.(activeFormat);
      } catch {
        // clipboard fallback
      }
    }
  }, [rawCodeOutput, onExportSuccess, activeFormat]);

  const handleDownload = useCallback(() => {
    switch (activeFormat) {
      case "markdown":
        downloadReportMarkdown(reportData);
        break;
      case "json":
        downloadReportJson(reportData);
        break;
      case "pdf":
        printReportPdf(reportData);
        break;
      case "html":
      default:
        downloadReportHtml(reportData);
        break;
    }
    onExportSuccess?.(activeFormat);
  }, [activeFormat, reportData, onExportSuccess]);

  const handlePrint = useCallback(() => {
    printReportPdf(reportData);
    onExportSuccess?.("pdf");
  }, [reportData, onExportSuccess]);

  if (!isOpen) return null;

  return (
    <div
      className="exec-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exec-modal-title"
      data-testid="executive-report-modal"
    >
      <div className={`exec-modal-container theme-${theme}`}>
        {/* Header */}
        <header className="exec-modal-header">
          <div className="exec-header-title-group">
            <h2 id="exec-modal-title" className="exec-modal-title">
              <IconFileText size={20} />
              Executive Architecture &amp; Incident Report Exporter
            </h2>
            <span className="exec-confidential-tag">Executive Confidential</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              type="button"
              className="exec-close-btn"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
              aria-label="Toggle Theme"
            >
              {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
            </button>
            <button
              type="button"
              className="exec-close-btn"
              onClick={onClose}
              title="Close Modal"
              aria-label="Close Modal"
            >
              <IconX size={18} />
            </button>
          </div>
        </header>

        {/* Modal Body */}
        <div className="exec-modal-body">
          {/* Sidebar Configuration Controls */}
          <aside className="exec-sidebar">
            {/* Format Selection */}
            <div className="exec-sidebar-group">
              <div className="exec-group-label">Export Format</div>
              <div className="exec-format-tabs" role="tablist" aria-label="Export format">
                <button
                  type="button"
                  data-testid="tab-format-pdf"
                  className={`exec-format-tab ${activeFormat === "pdf" ? "active" : ""}`}
                  onClick={() => setActiveFormat("pdf")}
                  role="tab"
                  aria-selected={activeFormat === "pdf"}
                >
                  <IconPrinter size={15} />
                  PDF / Print
                </button>
                <button
                  type="button"
                  data-testid="tab-format-html"
                  className={`exec-format-tab ${activeFormat === "html" ? "active" : ""}`}
                  onClick={() => setActiveFormat("html")}
                  role="tab"
                  aria-selected={activeFormat === "html"}
                >
                  <IconFileText size={15} />
                  HTML
                </button>
                <button
                  type="button"
                  data-testid="tab-format-markdown"
                  className={`exec-format-tab ${activeFormat === "markdown" ? "active" : ""}`}
                  onClick={() => setActiveFormat("markdown")}
                  role="tab"
                  aria-selected={activeFormat === "markdown"}
                >
                  <IconCode size={15} />
                  Markdown
                </button>
                <button
                  type="button"
                  data-testid="tab-format-json"
                  className={`exec-format-tab ${activeFormat === "json" ? "active" : ""}`}
                  onClick={() => setActiveFormat("json")}
                  role="tab"
                  aria-selected={activeFormat === "json"}
                >
                  <IconCode size={15} />
                  JSON
                </button>
              </div>
            </div>

            {/* Sections Toggle */}
            <div className="exec-sidebar-group">
              <div className="exec-group-label">Report Sections</div>
              <label className="exec-toggle-item">
                <input
                  type="checkbox"
                  data-testid="toggle-section-scorecards"
                  checked={includeScorecard}
                  onChange={(e) => setIncludeScorecard(e.target.checked)}
                />
                <span>KPI &amp; Health Scorecards</span>
              </label>

              <label className="exec-toggle-item">
                <input
                  type="checkbox"
                  data-testid="toggle-section-blast-radius"
                  checked={includeBlastRadius}
                  onChange={(e) => setIncludeBlastRadius(e.target.checked)}
                />
                <span>Blast Radius &amp; Risk Matrix</span>
              </label>

              <label className="exec-toggle-item">
                <input
                  type="checkbox"
                  data-testid="toggle-section-token-attribution"
                  checked={includeTokenAttribution}
                  onChange={(e) => setIncludeTokenAttribution(e.target.checked)}
                />
                <span>Token &amp; Cost Attribution</span>
              </label>

              <label className="exec-toggle-item">
                <input
                  type="checkbox"
                  data-testid="toggle-section-findings"
                  checked={includeFindings}
                  onChange={(e) => setIncludeFindings(e.target.checked)}
                />
                <span>Audit Findings &amp; Evidence</span>
              </label>
            </div>

            {/* Executive Notes */}
            <div className="exec-sidebar-group">
              <div className="exec-group-label">Executive Notes / Remarks</div>
              <textarea
                className="exec-textarea"
                placeholder="Add high-level commentary or context for stakeholders..."
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                aria-label="Executive Remarks"
              />
            </div>

            {/* Action Buttons */}
            <div className="exec-actions-stack">
              {activeFormat === "pdf" ? (
                <button
                  type="button"
                  className="exec-btn exec-btn-primary"
                  onClick={handlePrint}
                  data-testid="exec-print-btn"
                >
                  <IconPrinter size={16} />
                  Print / Save as PDF
                </button>
              ) : (
                <button
                  type="button"
                  className="exec-btn exec-btn-primary"
                  onClick={handleDownload}
                  data-testid="exec-download-btn"
                >
                  <IconDownload size={16} />
                  Download {activeFormat.toUpperCase()}
                </button>
              )}

              <button
                type="button"
                className="exec-btn exec-btn-secondary"
                onClick={handleCopy}
                data-testid="exec-copy-btn"
              >
                {copied ? <IconCheck size={16} color="#22c55e" /> : <IconCopy size={16} />}
                {copied ? "Copied to Clipboard!" : "Copy Raw Export"}
              </button>
            </div>
          </aside>

          {/* Main Content Preview Area */}
          <main className="exec-content-pane">
            {/* View Switcher Toolbar */}
            <div className="exec-preview-toolbar">
              <div className="exec-view-tabs" role="tablist">
                <button
                  type="button"
                  data-testid="tab-view-scorecards"
                  className={`exec-view-tab ${activeTab === "scorecards" ? "active" : ""}`}
                  onClick={() => setActiveTab("scorecards")}
                >
                  <IconGauge size={14} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                  Scorecards
                </button>
                <button
                  type="button"
                  data-testid="tab-view-blast-radius"
                  className={`exec-view-tab ${activeTab === "blast-radius" ? "active" : ""}`}
                  onClick={() => setActiveTab("blast-radius")}
                >
                  <IconAlertTriangle
                    size={14}
                    style={{ marginRight: "4px", verticalAlign: "middle" }}
                  />
                  Blast Radius Matrix
                </button>
                <button
                  type="button"
                  data-testid="tab-view-token-attribution"
                  className={`exec-view-tab ${activeTab === "token-attribution" ? "active" : ""}`}
                  onClick={() => setActiveTab("token-attribution")}
                >
                  <IconCoins size={14} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                  Token Attribution
                </button>
                <button
                  type="button"
                  data-testid="tab-view-raw-code"
                  className={`exec-view-tab ${activeTab === "raw-code" ? "active" : ""}`}
                  onClick={() => setActiveTab("raw-code")}
                >
                  <IconCode size={14} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                  Raw {activeFormat.toUpperCase()} Code
                </button>
              </div>

              <div style={{ fontSize: "12px", color: "var(--text-secondary, #a1a1aa)" }}>
                Pipeline: <strong>{reportData.datasetTitle}</strong>
              </div>
            </div>

            {/* Preview Panel Scroll Container */}
            <div className="exec-preview-scroll" data-testid="exec-preview-scroll">
              {activeTab === "scorecards" && <ScorecardView kpi={reportData.kpi} theme={theme} />}
              {activeTab === "blast-radius" && (
                <BlastRadiusMatrixView matrix={reportData.blastRadius} theme={theme} />
              )}
              {activeTab === "token-attribution" && (
                <TokenAttributionChartView
                  attribution={reportData.tokenAttribution}
                  theme={theme}
                />
              )}
              {activeTab === "raw-code" && (
                <pre className="exec-code-pre" data-testid="exec-code-preview">
                  <code>{rawCodeOutput}</code>
                </pre>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
