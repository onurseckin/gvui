import type { FC } from "react";
import { useState, useMemo, useCallback } from "react";
import { IconBug, IconShieldCheck, IconCopy, IconCheck } from "@tabler/icons-react";
import {
  AnomalyEngine,
  filterAnomalies,
  formatAnomalySummary,
} from "../../engine/anomaly/AnomalyEngine";
import type { AnomalyCategory, AnomalySeverity } from "../../engine/anomaly/types";
import type { AnomalyFilterState, AnomalyInspectorProps } from "./types";
import { AnomalyHealthGauge } from "./AnomalyHealthGauge";
import { AnomalyCategoryDistribution } from "./AnomalyCategoryDistribution";
import { AnomalyFilterBar } from "./AnomalyFilterBar";
import { AnomalyCard } from "./AnomalyCard";
import { AnomalyRemediationPanel } from "./AnomalyRemediationPanel";
import "./AnomalyInspector.css";

const INITIAL_FILTER_STATE: AnomalyFilterState = {
  searchQuery: "",
  selectedSeverities: [],
  selectedCategories: [],
  selectedNodeId: null,
  autoFixableOnly: false,
};

export const AnomalyInspector: FC<AnomalyInspectorProps> = ({
  dataset,
  onSelectNode,
  onSelectEdge,
  onApplyQuickFix,
  className = "",
}) => {
  const [filters, setFilters] = useState<AnomalyFilterState>(INITIAL_FILTER_STATE);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<boolean>(false);

  const engine = useMemo(() => new AnomalyEngine(), []);

  // Run real-time detection on active dataset
  const report = useMemo(() => {
    return engine.analyze(dataset);
  }, [engine, dataset]);

  // Filter anomalies based on active UI state
  const displayedAnomalies = useMemo(() => {
    return filterAnomalies(report.anomalies, {
      searchQuery: filters.searchQuery,
      severities: filters.selectedSeverities.length > 0 ? filters.selectedSeverities : undefined,
      categories: filters.selectedCategories.length > 0 ? filters.selectedCategories : undefined,
      nodeId: filters.selectedNodeId || undefined,
      autoFixableOnly: filters.autoFixableOnly,
    });
  }, [report.anomalies, filters]);

  const handleToggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(displayedAnomalies.map((a) => a.id)));
  }, [displayedAnomalies]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleToggleSeverity = useCallback((sev: AnomalySeverity) => {
    setFilters((prev) => {
      const exists = prev.selectedSeverities.includes(sev);
      const next = exists
        ? prev.selectedSeverities.filter((s) => s !== sev)
        : [...prev.selectedSeverities, sev];
      return { ...prev, selectedSeverities: next };
    });
  }, []);

  const handleToggleCategory = useCallback((cat: AnomalyCategory) => {
    setFilters((prev) => {
      const exists = prev.selectedCategories.includes(cat);
      const next = exists
        ? prev.selectedCategories.filter((c) => c !== cat)
        : [...prev.selectedCategories, cat];
      return { ...prev, selectedCategories: next };
    });
  }, []);

  const handleToggleAutoFixable = useCallback(() => {
    setFilters((prev) => ({ ...prev, autoFixableOnly: !prev.autoFixableOnly }));
  }, []);

  const handleResetFilters = useCallback(() => {
    setFilters(INITIAL_FILTER_STATE);
  }, []);

  const handleApplyQuickFix = useCallback(
    (findingId: string) => {
      if (!dataset) return;
      const patched = engine.applyQuickFix(dataset, findingId);
      onApplyQuickFix?.(patched);
    },
    [dataset, engine, onApplyQuickFix],
  );

  const handleCopySummary = useCallback(() => {
    const summary = formatAnomalySummary(report);
    void navigator.clipboard?.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [report]);

  // Empty state: No dataset provided
  if (!dataset || !Array.isArray(dataset.nodes) || dataset.nodes.length === 0) {
    return (
      <div
        className={`gvui-anomaly-inspector empty-state-container ${className}`}
        data-testid="anomaly-inspector-empty-dataset"
      >
        <div className="inspector-empty-box">
          <IconBug size={48} className="empty-icon" />
          <h3 className="empty-title">No Active Graph Loaded</h3>
          <p className="empty-desc">
            Load an active orchestration graph dataset to evaluate real-time topology cycles, retry
            loops, token spikes, and distributed lock anomalies.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`gvui-anomaly-inspector ${className}`} data-testid="gvui-anomaly-inspector">
      {/* Top Header */}
      <div className="inspector-header">
        <div className="header-left-col">
          <div className="title-row">
            <IconBug size={22} className="header-title-icon" />
            <h2 className="header-title">Topology & Execution Defect Inspector</h2>
            <span className="dataset-tag">{dataset.title || dataset.id}</span>
          </div>
          <p className="header-desc">
            Real-time heuristic anomaly detection, circular dependency deadlock inspection, and
            automated defect remediation.
          </p>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="action-btn copy-summary-btn"
            onClick={handleCopySummary}
            data-testid="anomaly-copy-summary-btn"
            title="Copy audit findings summary to clipboard"
          >
            {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            <span>{copied ? "Copied Audit" : "Copy Summary"}</span>
          </button>
        </div>
      </div>

      {/* Top Overview Grid (Health Gauge + Category Distribution + Remediation) */}
      <div className="inspector-overview-grid">
        <AnomalyHealthGauge score={report.healthScore} report={report} />
        <AnomalyRemediationPanel
          report={report}
          onApplyQuickFix={handleApplyQuickFix}
          onSelectNode={onSelectNode}
        />
      </div>

      {/* Category Tabs */}
      <AnomalyCategoryDistribution
        categoryCounts={report.categoryCounts}
        selectedCategories={filters.selectedCategories}
        onToggleCategory={handleToggleCategory}
      />

      {/* Filter Bar */}
      <AnomalyFilterBar
        filters={filters}
        report={report}
        onSearchChange={(q) => setFilters((p) => ({ ...p, searchQuery: q }))}
        onToggleSeverity={handleToggleSeverity}
        onToggleCategory={handleToggleCategory}
        onToggleAutoFixable={handleToggleAutoFixable}
        onResetFilters={handleResetFilters}
      />

      {/* List Toolbar */}
      <div className="anomaly-list-toolbar">
        <span className="results-count">
          Showing {displayedAnomalies.length} of {report.totalAnomalies} defect
          {report.totalAnomalies === 1 ? "" : "s"}
        </span>
        {displayedAnomalies.length > 0 && (
          <div className="expand-controls">
            <button
              type="button"
              className="expand-ctrl-btn"
              onClick={handleExpandAll}
              data-testid="anomaly-expand-all-btn"
            >
              Expand All
            </button>
            <span className="divider">|</span>
            <button
              type="button"
              className="expand-ctrl-btn"
              onClick={handleCollapseAll}
              data-testid="anomaly-collapse-all-btn"
            >
              Collapse All
            </button>
          </div>
        )}
      </div>

      {/* Findings List */}
      <div className="anomaly-cards-list" data-testid="anomaly-cards-list">
        {report.totalAnomalies === 0 ? (
          <div className="inspector-clean-state" data-testid="anomaly-clean-state">
            <IconShieldCheck size={48} className="clean-icon" />
            <h3 className="clean-title">Graph Execution is 100% Healthy</h3>
            <p className="clean-desc">
              No circular dependencies, token explosions, runaway retry loops, or stranded locks
              detected in the current topology.
            </p>
          </div>
        ) : displayedAnomalies.length === 0 ? (
          <div className="inspector-filtered-empty" data-testid="anomaly-filtered-empty">
            <p className="filtered-empty-title">No defects match the selected filters.</p>
            <button type="button" className="reset-filters-action-btn" onClick={handleResetFilters}>
              Reset Filters
            </button>
          </div>
        ) : (
          displayedAnomalies.map((anomaly) => (
            <AnomalyCard
              key={anomaly.id}
              anomaly={anomaly}
              isExpanded={expandedIds.has(anomaly.id)}
              onToggleExpand={() => handleToggleExpand(anomaly.id)}
              onSelectNode={onSelectNode}
              onSelectEdge={onSelectEdge}
              onApplyQuickFix={handleApplyQuickFix}
            />
          ))
        )}
      </div>
    </div>
  );
};
