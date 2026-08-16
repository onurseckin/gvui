import React, { useCallback, useEffect, useId, useMemo, useRef, useState, type FC } from "react";
import {
  IconCheck,
  IconCopy,
  IconDownload,
  IconPhoto,
  IconVector,
  IconX,
} from "@tabler/icons-react";
import { useGraphStore } from "../../state/useGraphStore";
import { Button } from "../../ui/atoms/Button";
import {
  downloadSvg,
  exportGraphToSvg,
  exportPositionedGraphToSvg,
} from "../../engine/export/svgExporter";
import {
  computePngDimensions,
  downloadPng,
  exportGraphAsPng,
} from "../../engine/export/pngExporter";
import { downloadMermaid, exportGraphToMermaid } from "../../engine/export/mermaidExporter";
import { downloadSql, exportGraphToSlq, type SqlDialect } from "../../engine/export/slqExporter";
import {
  downloadHtmlBundle,
  exportGraphToHtmlBundle,
} from "../../engine/export/htmlBundleExporter";
import { computeGraphBounds } from "../../utils/pngExporter";
import { EXPORT_FORMATS, type ExportFormat, type ExportModalProps } from "./ExportModal.types";
import "./ExportModal.css";

export const ExportModal: FC<ExportModalProps> = ({
  isOpen,
  onClose,
  dataset: propDataset,
  positionedNodes: propNodes,
  positionedEdges: propEdges,
  defaultFormat = "svg",
  onExportSuccess,
}) => {
  const storeDataset = useGraphStore((state) => state.dataset);
  const storeNodes = useGraphStore((state) => state.positionedNodes);
  const storeEdges = useGraphStore((state) => state.positionedEdges);

  const dataset = propDataset ?? storeDataset;
  const nodes = propNodes ?? storeNodes;
  const edges = propEdges ?? storeEdges;

  const [activeFormat, setActiveFormat] = useState<ExportFormat>(defaultFormat);
  const [theme, setTheme] = useState<"dark" | "light" | "transparent">("dark");
  const [scale, setScale] = useState<1 | 2 | 4>(2);
  const [sqlDialect, setSqlDialect] = useState<SqlDialect>("sqlite");
  const [mermaidDirection, setMermaidDirection] = useState<"TD" | "TB" | "LR" | "BT" | "RL">("TD");
  const [includeAnnotations, setIncludeAnnotations] = useState<boolean>(true);
  const [includeMetrics, setIncludeMetrics] = useState<boolean>(true);
  const [includeSubgraphs, setIncludeSubgraphs] = useState<boolean>(true);
  const [customFilename, setCustomFilename] = useState<string>("");
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<"visual" | "code">("visual");

  const titleId = useId();
  const descId = useId();
  const tablistRef = useRef<HTMLDivElement>(null);

  // Initialize format & filename when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveFormat(defaultFormat);
      setIsCopied(false);
      setIsExporting(false);
      const baseName = dataset?.title || dataset?.id || "graph";
      const cleanName = baseName.toLowerCase().replace(/[^a-z0-9-_]+/g, "-");
      setCustomFilename(cleanName);
    }
  }, [isOpen, defaultFormat, dataset]);

  // Global Escape key listener
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  // Compute live SVG output
  const svgOutput = useMemo<string>(() => {
    if (!dataset && nodes.length === 0) return "";
    const effectiveDataset = dataset ?? {
      id: "graph",
      title: "Graph Export",
      nodes: nodes,
      edges: edges,
    };
    if (nodes.length > 0) {
      return exportPositionedGraphToSvg(
        nodes,
        edges,
        {
          theme,
          title: effectiveDataset.title || effectiveDataset.id,
          includeAnnotations,
          includeMetrics,
        },
        includeSubgraphs ? effectiveDataset.sections : [],
      );
    }
    return exportGraphToSvg(effectiveDataset, {
      theme,
      includeAnnotations,
      includeMetrics,
    });
  }, [dataset, nodes, edges, theme, includeAnnotations, includeMetrics, includeSubgraphs]);

  // Compute live Mermaid output
  const mermaidOutput = useMemo<string>(() => {
    if (!dataset && nodes.length === 0) return "";
    const effectiveDataset = dataset ?? {
      id: "graph",
      title: "Graph Export",
      nodes: nodes,
      edges: edges,
    };
    return exportGraphToMermaid(effectiveDataset, {
      direction: mermaidDirection,
      theme: theme === "light" ? "default" : "dark",
      includeStyles: true,
      includeSubgraphs,
      includeAnnotations,
      includeMetrics,
    });
  }, [
    dataset,
    nodes,
    edges,
    mermaidDirection,
    theme,
    includeSubgraphs,
    includeAnnotations,
    includeMetrics,
  ]);

  // Compute live SLQ / SQL output
  const slqOutput = useMemo<string>(() => {
    if (!dataset && nodes.length === 0) return "";
    const effectiveDataset = dataset ?? {
      id: "graph",
      title: "Graph Export",
      nodes: nodes,
      edges: edges,
    };
    return exportGraphToSlq(effectiveDataset, {
      dialect: sqlDialect,
      includeMetrics,
      includeAnnotations,
      includeProvenance: true,
    });
  }, [dataset, nodes, edges, sqlDialect, includeMetrics, includeAnnotations]);

  // Compute live HTML bundle output
  const htmlOutput = useMemo<string>(() => {
    if (!dataset && nodes.length === 0) return "";
    const effectiveDataset = dataset ?? {
      id: "graph",
      title: "Graph Export",
      nodes: nodes,
      edges: edges,
    };
    return exportGraphToHtmlBundle(
      effectiveDataset,
      {
        theme: theme === "light" ? "light" : "dark",
        title: effectiveDataset.title || effectiveDataset.id,
        includeAnnotations,
        includeDatasetJson: true,
        includeViewer: true,
      },
      nodes.length > 0 ? { nodes, edges } : undefined,
    );
  }, [dataset, nodes, edges, theme, includeAnnotations]);

  // Compute PNG Raster dimensions
  const pngDimensions = useMemo(() => {
    const bounds = computeGraphBounds(nodes, edges);
    return computePngDimensions(bounds, scale, 40);
  }, [nodes, edges, scale]);

  // Handle format tab keyboard navigation
  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        const nextIndex = (index + 1) % EXPORT_FORMATS.length;
        setActiveFormat(EXPORT_FORMATS[nextIndex].id);
        const tabs = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        tabs?.[nextIndex]?.focus();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const prevIndex = (index - 1 + EXPORT_FORMATS.length) % EXPORT_FORMATS.length;
        setActiveFormat(EXPORT_FORMATS[prevIndex].id);
        const tabs = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        tabs?.[prevIndex]?.focus();
      }
    },
    [],
  );

  // Handle Copy to Clipboard
  const handleCopyToClipboard = useCallback(async () => {
    try {
      let contentToCopy = "";
      if (activeFormat === "svg") {
        contentToCopy = svgOutput;
      } else if (activeFormat === "mermaid") {
        contentToCopy = mermaidOutput;
      } else if (activeFormat === "slq") {
        contentToCopy = slqOutput;
      } else if (activeFormat === "html") {
        contentToCopy = htmlOutput;
      } else if (activeFormat === "png") {
        const pngResult = await exportGraphAsPng({
          nodes,
          edges,
          name: customFilename,
          scale,
          theme,
          includeAnnotations,
          includeMetrics,
        });
        contentToCopy = pngResult.dataUrl ?? "";
      }

      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(contentToCopy);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error("Failed to copy export to clipboard:", err);
    }
  }, [
    activeFormat,
    svgOutput,
    mermaidOutput,
    slqOutput,
    htmlOutput,
    nodes,
    edges,
    customFilename,
    scale,
    theme,
    includeAnnotations,
    includeMetrics,
  ]);

  // Handle File Download Trigger
  const handleDownload = useCallback(async () => {
    setIsExporting(true);
    const baseName = customFilename || dataset?.title || dataset?.id || "graph";

    try {
      if (activeFormat === "svg") {
        downloadSvg(svgOutput, `${baseName}.svg`);
      } else if (activeFormat === "png") {
        const pngResult = await exportGraphAsPng({
          nodes,
          edges,
          name: baseName,
          scale,
          theme,
          includeAnnotations,
          includeMetrics,
        });
        if (pngResult.blob) {
          downloadPng(pngResult.blob, pngResult.fileName);
        } else if (pngResult.dataUrl) {
          downloadPng(pngResult.dataUrl, pngResult.fileName);
        }
      } else if (activeFormat === "mermaid") {
        downloadMermaid(mermaidOutput, `${baseName}.mmd`);
      } else if (activeFormat === "slq") {
        const ext = sqlDialect === "json-relational" ? ".json" : ".sql";
        downloadSql(slqOutput, `${baseName}${ext}`);
      } else if (activeFormat === "html") {
        downloadHtmlBundle(htmlOutput, `${baseName}.html`);
      }

      if (onExportSuccess) {
        onExportSuccess(activeFormat, baseName);
      }
    } catch (err) {
      console.error("Export download failed:", err);
    } finally {
      setIsExporting(false);
    }
  }, [
    activeFormat,
    customFilename,
    dataset,
    svgOutput,
    nodes,
    edges,
    scale,
    theme,
    includeAnnotations,
    includeMetrics,
    mermaidOutput,
    sqlDialect,
    slqOutput,
    htmlOutput,
    onExportSuccess,
  ]);

  if (!isOpen) return null;

  const currentFormatMeta = EXPORT_FORMATS.find((f) => f.id === activeFormat) ?? EXPORT_FORMATS[0];

  return (
    <div
      className="export-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="export-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        {/* Header */}
        <div className="export-modal-header">
          <div className="export-modal-title-group">
            <h2 id={titleId} className="export-modal-title">
              Export Graph
            </h2>
            {dataset && (
              <span className="export-modal-dataset-badge">{dataset.title || dataset.id}</span>
            )}
          </div>
          <button
            type="button"
            className="export-modal-close-btn"
            onClick={onClose}
            aria-label="Close export dialog"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Format Tabs List */}
        <div
          className="export-modal-tablist"
          role="tablist"
          aria-label="Export Formats"
          ref={tablistRef}
        >
          {EXPORT_FORMATS.map((fmt, idx) => {
            const isSelected = activeFormat === fmt.id;
            return (
              <button
                key={fmt.id}
                type="button"
                role="tab"
                id={`tab-${fmt.id}`}
                aria-selected={isSelected}
                aria-controls={`panel-${fmt.id}`}
                tabIndex={isSelected ? 0 : -1}
                className={`export-modal-tab ${isSelected ? "export-modal-tab--active" : ""}`}
                onClick={() => setActiveFormat(fmt.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
              >
                <span>{fmt.label}</span>
                <span className="export-tab-badge">{fmt.badge}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Main Body (Split View: Options & Preview) */}
        <div className="export-modal-body" id={descId}>
          {/* Left Options Panel */}
          <div className="export-options-panel">
            <div className="export-options-section">
              <span className="export-options-label">Format Details</span>
              <p className="export-format-description">{currentFormatMeta.description}</p>
            </div>

            {/* Theme Selector (SVG, PNG, HTML) */}
            {(activeFormat === "svg" || activeFormat === "png" || activeFormat === "html") && (
              <div className="export-options-section">
                <span className="export-options-label">Theme / Canvas</span>
                <div className="export-segmented-control">
                  <button
                    type="button"
                    className={`export-segment-btn ${
                      theme === "dark" ? "export-segment-btn--active" : ""
                    }`}
                    onClick={() => setTheme("dark")}
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    className={`export-segment-btn ${
                      theme === "light" ? "export-segment-btn--active" : ""
                    }`}
                    onClick={() => setTheme("light")}
                  >
                    Light
                  </button>
                  {activeFormat !== "html" && (
                    <button
                      type="button"
                      className={`export-segment-btn ${
                        theme === "transparent" ? "export-segment-btn--active" : ""
                      }`}
                      onClick={() => setTheme("transparent")}
                    >
                      Transparent
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Resolution Scale (PNG / SVG) */}
            {(activeFormat === "png" || activeFormat === "svg") && (
              <div className="export-options-section">
                <span className="export-options-label">Resolution Scale</span>
                <div className="export-segmented-control">
                  <button
                    type="button"
                    className={`export-segment-btn ${
                      scale === 1 ? "export-segment-btn--active" : ""
                    }`}
                    onClick={() => setScale(1)}
                  >
                    1x (Standard)
                  </button>
                  <button
                    type="button"
                    className={`export-segment-btn ${
                      scale === 2 ? "export-segment-btn--active" : ""
                    }`}
                    onClick={() => setScale(2)}
                  >
                    2x (Retina)
                  </button>
                  <button
                    type="button"
                    className={`export-segment-btn ${
                      scale === 4 ? "export-segment-btn--active" : ""
                    }`}
                    onClick={() => setScale(4)}
                  >
                    4x (Ultra HD)
                  </button>
                </div>
              </div>
            )}

            {/* SQL Dialect Selector (SLQ) */}
            {activeFormat === "slq" && (
              <div className="export-options-section">
                <span className="export-options-label">SQL Dialect</span>
                <select
                  className="export-select-control"
                  value={sqlDialect}
                  onChange={(e) => setSqlDialect(e.target.value as SqlDialect)}
                >
                  <option value="sqlite">SQLite (DDL + Inserts)</option>
                  <option value="postgres">PostgreSQL (JSONB / PG DDL)</option>
                  <option value="mysql">MySQL (InnoDB / LongText)</option>
                  <option value="json-relational">Relational Tables (JSON Schema)</option>
                </select>
              </div>
            )}

            {/* Mermaid Direction (Mermaid) */}
            {activeFormat === "mermaid" && (
              <div className="export-options-section">
                <span className="export-options-label">Flowchart Direction</span>
                <div className="export-segmented-control">
                  <button
                    type="button"
                    className={`export-segment-btn ${
                      mermaidDirection === "TD" ? "export-segment-btn--active" : ""
                    }`}
                    onClick={() => setMermaidDirection("TD")}
                  >
                    Top-Down
                  </button>
                  <button
                    type="button"
                    className={`export-segment-btn ${
                      mermaidDirection === "LR" ? "export-segment-btn--active" : ""
                    }`}
                    onClick={() => setMermaidDirection("LR")}
                  >
                    Left-Right
                  </button>
                </div>
              </div>
            )}

            {/* Data Inclusions Toggles */}
            <div className="export-options-section">
              <span className="export-options-label">Inclusions</span>
              <label className="export-toggle-item">
                <span>Include Annotations & Findings</span>
                <input
                  type="checkbox"
                  checked={includeAnnotations}
                  onChange={(e) => setIncludeAnnotations(e.target.checked)}
                />
              </label>
              <label className="export-toggle-item">
                <span>Include Execution Metrics & Tokens</span>
                <input
                  type="checkbox"
                  checked={includeMetrics}
                  onChange={(e) => setIncludeMetrics(e.target.checked)}
                />
              </label>
              {(activeFormat === "mermaid" || activeFormat === "svg" || activeFormat === "slq") && (
                <label className="export-toggle-item">
                  <span>Include Subgraphs & Sections</span>
                  <input
                    type="checkbox"
                    checked={includeSubgraphs}
                    onChange={(e) => setIncludeSubgraphs(e.target.checked)}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Right Live Preview Panel */}
          <div
            className="export-preview-panel"
            role="tabpanel"
            id={`panel-${activeFormat}`}
            aria-labelledby={`tab-${activeFormat}`}
          >
            <div className="export-preview-header">
              <span className="export-preview-title">
                {activeFormat === "svg" && <IconVector size={14} />}
                {activeFormat === "png" && <IconPhoto size={14} />}
                Live Preview
              </span>

              <div className="export-preview-view-modes">
                {activeFormat === "svg" && (
                  <div className="export-segmented-control">
                    <button
                      type="button"
                      className={`export-segment-btn ${
                        viewMode === "visual" ? "export-segment-btn--active" : ""
                      }`}
                      onClick={() => setViewMode("visual")}
                    >
                      Visual
                    </button>
                    <button
                      type="button"
                      className={`export-segment-btn ${
                        viewMode === "code" ? "export-segment-btn--active" : ""
                      }`}
                      onClick={() => setViewMode("code")}
                    >
                      XML
                    </button>
                  </div>
                )}

                {activeFormat === "png" && (
                  <span className="export-preview-stats">
                    {pngDimensions.pixelWidth} &times; {pngDimensions.pixelHeight} px &bull; {scale}
                    x Scale
                  </span>
                )}

                {activeFormat === "slq" && (
                  <span className="export-preview-stats">
                    {dataset?.nodes.length ?? 0} Nodes &bull; {dataset?.edges.length ?? 0} Edges
                  </span>
                )}
              </div>
            </div>

            <div className="export-preview-content">
              {/* SVG Visual or Code View */}
              {activeFormat === "svg" && (
                <>
                  {viewMode === "visual" ? (
                    <div
                      className="export-preview-svg-container"
                      dangerouslySetInnerHTML={{ __html: svgOutput }}
                    />
                  ) : (
                    <pre className="export-preview-code-viewer">{svgOutput}</pre>
                  )}
                </>
              )}

              {/* PNG Raster Preview */}
              {activeFormat === "png" && (
                <div className="export-preview-png-container">
                  <div className="export-preview-png-box">
                    <IconPhoto size={36} color="var(--accent-color)" />
                    <strong style={{ fontSize: 13, color: "#ffffff" }}>
                      Raster Output Preview
                    </strong>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>
                      Dimensions: {pngDimensions.pixelWidth} &times; {pngDimensions.pixelHeight} px
                    </span>
                    <span style={{ fontSize: 11, color: "#64748b" }}>
                      Estimated memory footprint: ~
                      {Math.round(
                        (pngDimensions.pixelWidth * pngDimensions.pixelHeight * 4) / 1024 / 1024,
                      )}{" "}
                      MB
                    </span>
                  </div>
                </div>
              )}

              {/* Mermaid Code View */}
              {activeFormat === "mermaid" && (
                <pre className="export-preview-code-viewer">{mermaidOutput}</pre>
              )}

              {/* SLQ / SQL Code View */}
              {activeFormat === "slq" && (
                <pre className="export-preview-code-viewer">{slqOutput}</pre>
              )}

              {/* HTML Bundle Summary View */}
              {activeFormat === "html" && (
                <div className="export-preview-html-card">
                  <h3 style={{ fontSize: 14, color: "#ffffff" }}>
                    Standalone Offline Interactive Viewer
                  </h3>
                  <p style={{ fontSize: 12, color: "#94a3b8" }}>
                    Produces a single portable HTML file embedding graph geometry, pan/zoom canvas
                    interaction, live search, and a slide-out node inspector drawer.
                  </p>
                  <ul className="export-checklist">
                    <li>
                      <IconCheck size={14} className="export-check-icon" />
                      <span>Zero external dependencies / 100% offline</span>
                    </li>
                    <li>
                      <IconCheck size={14} className="export-check-icon" />
                      <span>Interactive pan, zoom, fit & search overlay</span>
                    </li>
                    <li>
                      <IconCheck size={14} className="export-check-icon" />
                      <span>Click-to-inspect node details drawer with metadata & findings</span>
                    </li>
                    <li>
                      <IconCheck size={14} className="export-check-icon" />
                      <span>Embedded JSON dataset with one-click export</span>
                    </li>
                  </ul>
                </div>
              )}

              {/* Copied Toast Banner */}
              {isCopied && (
                <div className="export-toast-banner" role="status">
                  <IconCheck size={14} />
                  <span>Copied to Clipboard!</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="export-modal-footer">
          <div className="export-filename-wrapper">
            <label htmlFor="export-filename" className="export-filename-label">
              Filename:
            </label>
            <input
              id="export-filename"
              type="text"
              className="export-filename-input"
              value={customFilename}
              onChange={(e) => setCustomFilename(e.target.value)}
              placeholder="filename"
            />
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {activeFormat === "slq" && sqlDialect === "json-relational"
                ? ".json"
                : currentFormatMeta.extension}
            </span>
          </div>

          <div className="export-modal-actions">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyToClipboard}
              title="Copy export content to clipboard"
            >
              <IconCopy size={14} style={{ marginRight: 4 }} />
              {isCopied ? "Copied!" : "Copy"}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleDownload}
              disabled={isExporting}
              title="Download file"
            >
              <IconDownload size={14} style={{ marginRight: 4 }} />
              {isExporting ? "Exporting…" : "Download"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExportModal;
