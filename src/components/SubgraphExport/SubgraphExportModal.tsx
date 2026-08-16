import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import type { CanvasAnnotation } from "../CanvasAnnotations/types";
import { useGraphStore } from "../../state/useGraphStore";
import { createBookmarkPack } from "../../engine/subgraphExport/bundlePack";
import { exportSubgraph } from "../../engine/subgraphExport/exportFormats";
import { extractSubgraph } from "../../engine/subgraphExport/extractSubgraph";
import type {
  ClosureDirection,
  ExportConfig,
  ExportFormatType,
  ExportResult,
  SelectionMode,
} from "../../engine/subgraphExport/types";
import { BookmarkPackList } from "./BookmarkPackList";
import { ExportConfigForm } from "./ExportConfigForm";
import { SubgraphPreviewCanvas } from "./SubgraphPreviewCanvas";
import type { SubgraphExportModalProps, SubgraphModalTab } from "./types";
import "./SubgraphExport.css";

export const SubgraphExportModal: React.FC<SubgraphExportModalProps> = ({
  isOpen,
  onClose,
  dataset: propDataset,
  positionedNodes: propNodes,
  selectedNodeIds: propSelectedNodeIds,
  annotations: propAnnotations,
  lassoPolygon: propPolygon,
  defaultFormat = "json-bundle",
  defaultMode = "selection",
  onExportSuccess,
}) => {
  const storeDataset = useGraphStore((state) => state.dataset);
  const storeNodes = useGraphStore((state) => state.positionedNodes);
  const storeSelectedNodeId = useGraphStore((state) => state.selectedNodeId);

  const dataset = propDataset ?? storeDataset;
  const nodes = propNodes ?? storeNodes;

  // Derive selection mode and seed nodes
  const effectiveSelectedIds = useMemo(() => {
    if (propSelectedNodeIds) {
      if (propSelectedNodeIds instanceof Set) {
        return Array.from(propSelectedNodeIds);
      }
      return propSelectedNodeIds;
    }
    if (storeSelectedNodeId) {
      return [storeSelectedNodeId];
    }
    return [];
  }, [propSelectedNodeIds, storeSelectedNodeId]);

  const [activeTab, setActiveTab] = useState<SubgraphModalTab>("preview");
  const [activeMode, setActiveMode] = useState<SelectionMode>(defaultMode);
  const [closureDirection, setClosureDirection] = useState<ClosureDirection>("downstream");
  const [closureDepth, setClosureDepth] = useState<number>(2);
  const [customBookmarks, setCustomBookmarks] = useState<CanvasAnnotation[]>(propAnnotations || []);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [copyTimer, setCopyTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Configuration State
  const [config, setConfig] = useState<ExportConfig>({
    format: defaultFormat,
    packMetadata: {
      title: dataset?.title ? `${dataset.title} Subgraph` : "AI Pipeline Subgraph Pack",
      description: dataset?.description || "Extracted subgraph component",
      version: "1.0.0",
      author: {
        name: "GVUI Architect",
        role: "human",
      },
      tags: ["subgraph", "export", "architecture"],
      license: "MIT",
    },
    boundaryEdgePolicy: "outgoing",
    includeAnnotations: true,
    includeMetrics: true,
    mermaidDirection: "TD",
    dotRankdir: "TB",
    markdownIncludeTables: true,
    markdownIncludeMermaid: true,
    prettyJson: true,
  });

  const titleId = useId();

  // Reset or initialize state when opening modal
  useEffect(() => {
    if (isOpen) {
      setIsCopied(false);
      setActiveTab("preview");
      if (propAnnotations) {
        setCustomBookmarks(propAnnotations);
      }
      if (effectiveSelectedIds.length === 0 && defaultMode === "selection") {
        setActiveMode("all");
      } else {
        setActiveMode(defaultMode);
      }
    }
  }, [isOpen, defaultMode, propAnnotations, effectiveSelectedIds.length]);

  // Clean up copy timer on unmount
  useEffect(() => {
    return () => {
      if (copyTimer) clearTimeout(copyTimer);
    };
  }, [copyTimer]);

  // Handle global Escape key
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

  // Compute Subgraph Extraction
  const extracted = useMemo(() => {
    if (!dataset) {
      return {
        dataset: {
          id: "empty",
          title: "Empty Subgraph",
          nodes: [],
          edges: [],
        },
        boundaryEdges: [],
        annotations: [],
        positionedNodes: [],
        nodeIds: new Set<string>(),
        stats: {
          nodeCount: 0,
          internalEdgeCount: 0,
          boundaryIncomingCount: 0,
          boundaryOutgoingCount: 0,
          boundaryTotalCount: 0,
          annotationCount: 0,
          sectionCount: 0,
          totalTokens: 0,
          totalDurationMs: 0,
          totalCostUsd: 0,
        },
      };
    }

    return extractSubgraph({
      dataset,
      positionedNodes: nodes,
      mode: activeMode,
      selectedNodeIds: effectiveSelectedIds,
      lassoPolygon: propPolygon,
      closureOptions: {
        direction: closureDirection,
        maxDepth: closureDepth,
        includeRootNodes: true,
      },
      boundaryEdgePolicy: config.boundaryEdgePolicy,
      includeAnnotations: config.includeAnnotations,
      annotations: customBookmarks,
    });
  }, [
    dataset,
    nodes,
    activeMode,
    effectiveSelectedIds,
    propPolygon,
    closureDirection,
    closureDepth,
    config.boundaryEdgePolicy,
    config.includeAnnotations,
    customBookmarks,
  ]);

  // Compute Bookmark Pack Bundle
  const bundle = useMemo(() => {
    return createBookmarkPack(extracted, config.packMetadata, customBookmarks);
  }, [extracted, config.packMetadata, customBookmarks]);

  // Compute Active Export Result
  const exportResult: ExportResult = useMemo(() => {
    return exportSubgraph(extracted, bundle, config);
  }, [extracted, bundle, config]);

  // Copy Content Handler
  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(exportResult.content);
      }
      setIsCopied(true);
      if (copyTimer) clearTimeout(copyTimer);
      const timer = setTimeout(() => setIsCopied(false), 2500);
      setCopyTimer(timer);
      if (onExportSuccess) {
        onExportSuccess(exportResult);
      }
    } catch {
      // Fallback
      setIsCopied(true);
    }
  }, [exportResult, copyTimer, onExportSuccess]);

  // Download Handler
  const handleDownload = useCallback(() => {
    try {
      const blob = new Blob([exportResult.content], { type: exportResult.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportResult.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      if (onExportSuccess) {
        onExportSuccess(exportResult);
      }
    } catch {
      // Handled silently
    }
  }, [exportResult, onExportSuccess]);

  if (!isOpen) return null;

  return (
    <div
      className="subgraph-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="subgraph-modal-container">
        {/* Header */}
        <div className="subgraph-modal-header">
          <div className="subgraph-modal-title-wrap">
            <div className="subgraph-modal-icon">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
                <path d="M10 7h4M7 10v4M17 10v4M10 17h4" />
              </svg>
            </div>
            <div>
              <h2 id={titleId} className="subgraph-modal-title">
                Export Subgraph & Bookmark Pack
              </h2>
              <p className="subgraph-modal-subtitle">
                Package selected components, closure neighborhoods, annotations, and boundary
                crossings.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="subgraph-modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Mode Selector Bar */}
        <div className="subgraph-modal-modebar">
          <div className="subgraph-mode-pills">
            <button
              type="button"
              className={`subgraph-mode-pill ${activeMode === "selection" ? "active" : ""}`}
              onClick={() => setActiveMode("selection")}
            >
              Selection ({effectiveSelectedIds.length})
            </button>
            <button
              type="button"
              className={`subgraph-mode-pill ${activeMode === "closure" ? "active" : ""}`}
              onClick={() => setActiveMode("closure")}
            >
              Transitive Closure
            </button>
            <button
              type="button"
              className={`subgraph-mode-pill ${activeMode === "polygon" ? "active" : ""}`}
              onClick={() => setActiveMode("polygon")}
            >
              Lasso Polygon
            </button>
            <button
              type="button"
              className={`subgraph-mode-pill ${activeMode === "all" ? "active" : ""}`}
              onClick={() => setActiveMode("all")}
            >
              Full Graph ({dataset?.nodes.length || 0})
            </button>
          </div>

          <div style={{ fontSize: "0.8125rem", color: "#a1a1aa" }}>
            Included Nodes:{" "}
            <strong style={{ color: "#38bdf8" }}>{extracted.stats.nodeCount}</strong>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="subgraph-modal-tabs">
          <button
            type="button"
            className={`subgraph-tab-btn ${activeTab === "preview" ? "active" : ""}`}
            onClick={() => setActiveTab("preview")}
          >
            🔍 Preview & Stats
          </button>
          <button
            type="button"
            className={`subgraph-tab-btn ${activeTab === "metadata" ? "active" : ""}`}
            onClick={() => setActiveTab("metadata")}
          >
            ⚙️ Pack Metadata
          </button>
          <button
            type="button"
            className={`subgraph-tab-btn ${activeTab === "bookmarks" ? "active" : ""}`}
            onClick={() => setActiveTab("bookmarks")}
          >
            🔖 Bookmarks ({customBookmarks.length})
          </button>
          <button
            type="button"
            className={`subgraph-tab-btn ${activeTab === "code" ? "active" : ""}`}
            onClick={() => setActiveTab("code")}
          >
            💻 Output & Code ({exportResult.format})
          </button>
        </div>

        {/* Body Content */}
        <div className="subgraph-modal-body">
          {/* Tab 1: Preview & Stats */}
          {activeTab === "preview" && (
            <>
              <div className="subgraph-stats-row">
                <div className="subgraph-stat-card">
                  <span className="subgraph-stat-label">Nodes</span>
                  <span className="subgraph-stat-value accent-blue">
                    {extracted.stats.nodeCount}
                  </span>
                </div>
                <div className="subgraph-stat-card">
                  <span className="subgraph-stat-label">Internal Edges</span>
                  <span className="subgraph-stat-value accent-emerald">
                    {extracted.stats.internalEdgeCount}
                  </span>
                </div>
                <div className="subgraph-stat-card">
                  <span className="subgraph-stat-label">Boundary In/Out</span>
                  <span className="subgraph-stat-value accent-amber">
                    {extracted.stats.boundaryIncomingCount} /{" "}
                    {extracted.stats.boundaryOutgoingCount}
                  </span>
                </div>
                <div className="subgraph-stat-card">
                  <span className="subgraph-stat-label">Bookmarks</span>
                  <span className="subgraph-stat-value accent-purple">
                    {extracted.stats.annotationCount}
                  </span>
                </div>
                <div className="subgraph-stat-card">
                  <span className="subgraph-stat-label">Duration</span>
                  <span className="subgraph-stat-value">
                    {(extracted.stats.totalDurationMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <div className="subgraph-stat-card">
                  <span className="subgraph-stat-label">Tokens</span>
                  <span className="subgraph-stat-value">
                    {extracted.stats.totalTokens.toLocaleString()}
                  </span>
                </div>
              </div>

              <SubgraphPreviewCanvas
                extracted={extracted}
                showBoundaryEdges={config.boundaryEdgePolicy !== "none"}
                showBookmarks={config.includeAnnotations}
              />
            </>
          )}

          {/* Tab 2: Pack Metadata & Config */}
          {activeTab === "metadata" && (
            <ExportConfigForm
              config={config}
              onChange={setConfig}
              mode={activeMode}
              onModeChange={setActiveMode}
              closureDirection={closureDirection}
              onClosureDirectionChange={setClosureDirection}
              closureDepth={closureDepth}
              onClosureDepthChange={setClosureDepth}
              selectedCount={effectiveSelectedIds.length}
              totalNodeCount={dataset?.nodes.length || 0}
            />
          )}

          {/* Tab 3: Bookmarks List */}
          {activeTab === "bookmarks" && (
            <BookmarkPackList
              bookmarks={customBookmarks}
              nodes={extracted.dataset.nodes.map((n) => ({ id: n.id, name: n.name }))}
              onBookmarksChange={setCustomBookmarks}
            />
          )}

          {/* Tab 4: Output & Code View */}
          {activeTab === "code" && (
            <div className="subgraph-code-container">
              <div className="subgraph-code-header">
                <span className="subgraph-code-info">
                  {exportResult.filename} • {(exportResult.byteSize / 1024).toFixed(2)} KB •{" "}
                  {exportResult.mimeType}
                </span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="subgraph-btn-action subgraph-btn-secondary"
                  style={{ padding: "4px 10px", fontSize: "0.75rem" }}
                >
                  {isCopied ? "✓ Copied" : "Copy Code"}
                </button>
              </div>
              <pre className="subgraph-code-pre">{exportResult.content}</pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="subgraph-modal-footer">
          <div className="subgraph-format-selector">
            <span style={{ fontSize: "0.8125rem", color: "#a1a1aa", marginRight: "4px" }}>
              Format:
            </span>
            {(
              ["json-bundle", "markdown", "dot", "mermaid", "graph-dataset"] as ExportFormatType[]
            ).map((fmt) => (
              <button
                key={fmt}
                type="button"
                className={`subgraph-mode-pill ${config.format === fmt ? "active" : ""}`}
                onClick={() => setConfig({ ...config, format: fmt })}
              >
                {fmt === "json-bundle"
                  ? "JSON Pack"
                  : fmt === "markdown"
                    ? "Markdown"
                    : fmt === "dot"
                      ? "Graphviz"
                      : fmt === "mermaid"
                        ? "Mermaid"
                        : "Dataset"}
              </button>
            ))}
          </div>

          <div className="subgraph-footer-actions">
            <button
              type="button"
              className="subgraph-btn-action subgraph-btn-secondary"
              onClick={handleCopy}
            >
              {isCopied ? "✓ Copied!" : "📋 Copy to Clipboard"}
            </button>
            <button
              type="button"
              className="subgraph-btn-action subgraph-btn-primary"
              onClick={handleDownload}
            >
              ⬇️ Download {exportResult.filename}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
