import React, { useMemo, useRef } from "react";
import {
  IconActivity,
  IconDownload,
  IconPalette,
  IconSearch,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import {
  createFlamegraphStore,
  useFlamegraphStore,
  type FlamegraphStore,
} from "../../store/useFlamegraphStore";
import type {
  ColorScheme,
  FlamegraphNode,
  ProfileSpan,
  SpanCategory,
  SpanStatus,
  SpanTier,
} from "./types";
import { FlamegraphSpanBar } from "./FlamegraphSpanBar";
import { FlamegraphScrubber } from "./FlamegraphScrubber";
import { FlamegraphMetricsSummary } from "./FlamegraphMetricsSummary";
import { FlamegraphDetailDrawer } from "./FlamegraphDetailDrawer";
import { computeFlamegraphLayout, formatDuration } from "./flamegraphEngine";
import "./Flamegraph.css";

export interface FlamegraphViewProps {
  customStore?: FlamegraphStore | ReturnType<typeof createFlamegraphStore>;
  className?: string;
  onSelectSpan?: (span: ProfileSpan) => void;
  title?: string;
}

export const FlamegraphView: React.FC<FlamegraphViewProps> = ({
  customStore,
  className = "",
  onSelectSpan,
  title = "Token & Latency Flamegraph Profiler",
}) => {
  const globalStore = useFlamegraphStore();
  const customStoreHookResult = typeof customStore === "function" ? customStore() : undefined;
  const store =
    customStoreHookResult ?? (customStore as FlamegraphStore | undefined) ?? globalStore;

  const {
    spans,
    viewport,
    timelineBounds,
    zoom,
    panOffsetPct,
    selectedSpanId,
    hoveredSpanId,
    colorScheme,
    filterOptions,
    isDrawerOpen,
    setSelectedSpanId,
    setHoveredSpanId,
    setSearchQuery,
    setTierFilter,
    setStatusFilter,
    setCategoryFilter,
    setAgentFilter,
    setColorScheme,
    setViewport,
    zoomIn,
    zoomOut,
    resetZoom,
    resetScrubber,
    setIsDrawerOpen,
    clearSpans,
    exportProfileJson,
    importProfileJson,
    getSpanById,
    getAncestry,
    getChildren,
  } = store;

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute Layout
  const layout = useMemo(() => {
    return computeFlamegraphLayout(spans, {
      viewport,
      zoom,
      panOffsetPct,
      colorScheme,
      filterOptions,
    });
  }, [spans, viewport, zoom, panOffsetPct, colorScheme, filterOptions]);

  // Group nodes by depth
  const depthRows = useMemo(() => {
    const rows: Map<number, FlamegraphNode[]> = new Map();
    for (const node of layout.nodes) {
      if (!rows.has(node.depth)) {
        rows.set(node.depth, []);
      }
      rows.get(node.depth)?.push(node);
    }
    return Array.from(rows.entries()).sort(([a], [b]) => a - b);
  }, [layout.nodes]);

  const selectedSpan = useMemo(() => {
    if (!selectedSpanId) return null;
    return getSpanById(selectedSpanId) ?? null;
  }, [selectedSpanId, getSpanById]);

  const selectedNode = useMemo(() => {
    if (!selectedSpanId) return undefined;
    return layout.nodes.find((n) => n.id === selectedSpanId);
  }, [selectedSpanId, layout.nodes]);

  const selectedAncestry = useMemo(() => {
    if (!selectedSpanId) return [];
    return getAncestry(selectedSpanId);
  }, [selectedSpanId, getAncestry]);

  const selectedChildren = useMemo(() => {
    if (!selectedSpanId) return [];
    return getChildren(selectedSpanId);
  }, [selectedSpanId, getChildren]);

  const handleSpanClick = (id: string) => {
    setSelectedSpanId(id);
    const span = getSpanById(id);
    if (span && onSelectSpan) {
      onSelectSpan(span);
    }
  };

  const handleExport = () => {
    const jsonStr = exportProfileJson();
    if (typeof document !== "undefined") {
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flamegraph-profile-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === "string") {
        importProfileJson(content);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Distinct agent IDs for filter dropdown
  const uniqueAgents = useMemo(() => {
    const set = new Set<string>();
    for (const s of spans) {
      if (s.agentId) set.add(s.agentId);
    }
    return Array.from(set).sort();
  }, [spans]);

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (filterOptions.searchQuery.trim()) count++;
    if (filterOptions.tierFilter !== "all") count++;
    if (filterOptions.statusFilter !== "all") count++;
    if (filterOptions.categoryFilter !== "all") count++;
    if (filterOptions.agentFilter !== "all") count++;
    return count;
  }, [filterOptions]);

  const totalTimeDuration = Math.max(1, viewport.end - viewport.start);

  return (
    <div className={`gvui-flamegraph-profiler ${className}`} data-testid="gvui-flamegraph-profiler">
      {/* Top Toolbar */}
      <header className="flamegraph-toolbar">
        <div className="toolbar-left">
          <div className="profiler-title-group">
            <IconActivity size={20} className="profiler-icon" />
            <h1 className="profiler-title">{title}</h1>
            <span className="span-count-badge" data-testid="total-span-badge">
              {spans.length} spans
            </span>
          </div>

          {/* Search Box */}
          <div className="search-box-wrapper">
            <IconSearch size={14} className="search-box-icon" />
            <input
              type="text"
              placeholder="Search spans, agents, tags..."
              value={filterOptions.searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flamegraph-search-input"
              data-testid="flamegraph-search-input"
            />
            {filterOptions.searchQuery && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearchQuery("")}
                aria-label="Clear Search"
              >
                <IconX size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="toolbar-right">
          {/* Tier Filter */}
          <select
            value={filterOptions.tierFilter}
            onChange={(e) => setTierFilter(e.target.value as SpanTier | "all")}
            className="gvui-select filter-select"
            aria-label="Filter by Tier"
            data-testid="tier-filter-select"
          >
            <option value="all">All Tiers</option>
            <option value="root">Root</option>
            <option value="coordinator">Coordinator</option>
            <option value="subagent">Subagent</option>
            <option value="worker">Worker</option>
            <option value="tool">Tool</option>
            <option value="gate">Gate</option>
            <option value="system">System</option>
          </select>

          {/* Status Filter */}
          <select
            value={filterOptions.statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as SpanStatus | "all")}
            className="gvui-select filter-select"
            aria-label="Filter by Status"
            data-testid="status-filter-select"
          >
            <option value="all">All Statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
            <option value="running">Running</option>
            <option value="pending">Pending</option>
            <option value="cancelled">Cancelled</option>
          </select>

          {/* Category Filter */}
          <select
            value={filterOptions.categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as SpanCategory | "all")}
            className="gvui-select filter-select"
            aria-label="Filter by Category"
            data-testid="category-filter-select"
          >
            <option value="all">All Categories</option>
            <option value="agent_cascade">Agent Cascade</option>
            <option value="llm_call">LLM Call</option>
            <option value="tool_execution">Tool Execution</option>
            <option value="task_lease">Task Lease</option>
            <option value="validator_gate">Validator Gate</option>
            <option value="custom">Custom</option>
          </select>

          {/* Agent Filter */}
          {uniqueAgents.length > 0 && (
            <select
              value={filterOptions.agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="gvui-select filter-select"
              aria-label="Filter by Agent"
              data-testid="agent-filter-select"
            >
              <option value="all">All Agents ({uniqueAgents.length})</option>
              {uniqueAgents.map((agent) => (
                <option key={agent} value={agent}>
                  {agent}
                </option>
              ))}
            </select>
          )}

          {/* Color Scheme Picker */}
          <div className="color-scheme-selector">
            <IconPalette size={14} className="scheme-icon" />
            <select
              value={colorScheme}
              onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
              className="gvui-select scheme-select"
              aria-label="Color Scheme"
              data-testid="color-scheme-select"
            >
              <option value="tier">Color by Tier</option>
              <option value="agent">Color by Agent</option>
              <option value="status">Color by Status</option>
              <option value="tokens">Color by Tokens (Heatmap)</option>
              <option value="latency">Color by Latency (Heatmap)</option>
            </select>
          </div>

          {/* Export / Import Actions */}
          <button
            type="button"
            className="gvui-btn-secondary toolbar-btn"
            onClick={handleExport}
            title="Export Profile JSON"
            data-testid="export-profile-btn"
          >
            <IconDownload size={14} />
            <span>Export</span>
          </button>

          <label
            className="gvui-btn-secondary toolbar-btn file-upload-label"
            title="Import Profile JSON"
          >
            <IconUpload size={14} />
            <span>Import</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFile}
              style={{ display: "none" }}
              data-testid="import-profile-file-input"
            />
          </label>

          {spans.length > 0 && (
            <button
              type="button"
              className="gvui-btn-icon toolbar-btn-clear"
              onClick={clearSpans}
              title="Clear Spans"
              aria-label="Clear Spans"
              data-testid="clear-spans-btn"
            >
              <IconTrash size={14} />
            </button>
          )}
        </div>
      </header>

      {/* Metrics Summary Strip */}
      <FlamegraphMetricsSummary metrics={layout.metrics} activeFilterCount={activeFiltersCount} />

      {/* Scrubber Timeline Bar */}
      <FlamegraphScrubber
        timelineBounds={timelineBounds}
        viewport={viewport}
        spans={spans}
        zoom={zoom}
        onRangeChange={setViewport}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        onResetScrubber={resetScrubber}
      />

      {/* Main Flamegraph Canvas Area */}
      <main className="flamegraph-main-content">
        <div className="flamegraph-canvas-container" data-testid="flamegraph-canvas">
          {/* Time scale ruler */}
          <div className="flamegraph-time-ruler">
            <div className="time-tick-mark" style={{ left: "0%" }}>
              <span>+{formatDuration(0)}</span>
            </div>
            <div className="time-tick-mark" style={{ left: "25%" }}>
              <span>+{formatDuration(totalTimeDuration * 0.25)}</span>
            </div>
            <div className="time-tick-mark" style={{ left: "50%" }}>
              <span>+{formatDuration(totalTimeDuration * 0.5)}</span>
            </div>
            <div className="time-tick-mark" style={{ left: "75%" }}>
              <span>+{formatDuration(totalTimeDuration * 0.75)}</span>
            </div>
            <div className="time-tick-mark" style={{ left: "100%" }}>
              <span>+{formatDuration(totalTimeDuration)}</span>
            </div>
          </div>

          {/* Flamegraph Waterfall Rows */}
          {depthRows.length === 0 ? (
            <div className="flamegraph-empty-state" data-testid="flamegraph-empty-state">
              <p className="empty-state-title">No Spans to Display</p>
              <p className="empty-state-subtitle">
                {spans.length === 0
                  ? "Load a profile run JSON or wait for agent execution events to trace cascades."
                  : "No spans match your current filter query. Try clearing filters or search."}
              </p>
            </div>
          ) : (
            <div className="flamegraph-tree-rows" data-testid="flamegraph-tree-rows">
              {depthRows.map(([depth, nodes]) => (
                <div
                  key={depth}
                  className="flamegraph-depth-row"
                  data-depth={depth}
                  data-testid={`flamegraph-row-depth-${depth}`}
                >
                  <div className="depth-label">D{depth}</div>
                  <div className="depth-track">
                    {nodes.map((node) => (
                      <FlamegraphSpanBar
                        key={node.id}
                        node={node}
                        isSelected={selectedSpanId === node.id}
                        isHovered={hoveredSpanId === node.id}
                        onSelect={handleSpanClick}
                        onHover={setHoveredSpanId}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Side Detail Drawer */}
        <FlamegraphDetailDrawer
          span={selectedSpan}
          node={selectedNode}
          ancestry={selectedAncestry}
          childSpans={selectedChildren}
          isOpen={isDrawerOpen && selectedSpan !== null}
          onClose={() => setIsDrawerOpen(false)}
          onSelectSpan={handleSpanClick}
        />
      </main>
    </div>
  );
};
