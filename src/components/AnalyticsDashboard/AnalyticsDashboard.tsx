import type { FC } from "react";
import { useEffect, useState, useCallback } from "react";
import {
  IconChartBar,
  IconGauge,
  IconFlame,
  IconCoins,
  IconRefresh,
  IconBug,
  IconGitCommit,
  IconCopy,
  IconCheck,
} from "@tabler/icons-react";
import type { GraphDataset } from "../../types/graphData";
import { useGraphStore } from "../../state/useGraphStore";
import { useAnalyticsStore } from "../../store/useAnalyticsStore";
import {
  formatDuration,
  formatRecordedCost,
  formatTokens,
} from "../../primitives/nodes/NodeCard/nodeCardModel";
import { RunVelocityCard } from "./RunVelocityCard";
import { ConcurrencyHeatmapCard } from "./ConcurrencyHeatmapCard";
import { TokenDistributionCard } from "./TokenDistributionCard";
import { RepairCycleHistogramCard } from "./RepairCycleHistogramCard";
import { ErrorTaxonomyCard } from "./ErrorTaxonomyCard";
import { CriticalPathCard } from "./CriticalPathCard";
import { AnalyticsFilterBar } from "./AnalyticsFilterBar";
import "./AnalyticsDashboard.css";

export interface AnalyticsDashboardProps {
  dataset?: GraphDataset | null;
  onSelectNode?: (nodeId: string) => void;
  className?: string;
}

export const AnalyticsDashboard: FC<AnalyticsDashboardProps> = ({
  dataset: propDataset,
  onSelectNode,
  className = "",
}) => {
  const storeDataset = useGraphStore((state) => state.dataset);
  const activeDataset = propDataset !== undefined ? propDataset : storeDataset;

  const datasetInStore = useAnalyticsStore((state) => state.dataset);
  const setDataset = useAnalyticsStore((state) => state.setDataset);
  const filters = useAnalyticsStore((state) => state.filters);
  const setSearchQuery = useAnalyticsStore((state) => state.setSearchQuery);
  const setNodeStatus = useAnalyticsStore((state) => state.setNodeStatus);
  const setModelTier = useAnalyticsStore((state) => state.setModelTier);
  const resetFilters = useAnalyticsStore((state) => state.resetFilters);
  const activeTab = useAnalyticsStore((state) => state.activeTab);
  const setActiveTab = useAnalyticsStore((state) => state.setActiveTab);
  const filteredMetrics = useAnalyticsStore((state) => state.filteredMetrics);

  const [copied, setCopied] = useState<boolean>(false);

  // Synchronize incoming dataset with analytics store
  useEffect(() => {
    if (activeDataset !== datasetInStore) {
      setDataset(activeDataset);
    }
  }, [activeDataset, datasetInStore, setDataset]);

  const metrics = filteredMetrics;

  const handleCopySummary = useCallback(() => {
    const summaryLines = [
      `=== GVUI EXEC TELEMETRY SUMMARY ===`,
      `Dataset: ${activeDataset?.title ?? activeDataset?.id ?? "Untitled"}`,
      `Total Tasks: ${metrics.totalNodes} (${metrics.completedNodes} completed, ${metrics.successRate.toFixed(1)}% success)`,
      `Wall Clock: ${formatDuration(metrics.runVelocity.totalWallClockMs)} | Cognitive Think: ${formatDuration(metrics.runVelocity.totalCognitiveMs)}`,
      `Run Velocity: ${metrics.runVelocity.nodesPerMinute.toFixed(1)} nodes/min | Peak Concurrency: ${metrics.concurrency.peakConcurrency}`,
      `Total Tokens: ${formatTokens(metrics.tokenDistribution.totalTokens)} | Recorded Cost: ${formatRecordedCost(metrics.tokenDistribution.totalCostUsd)}`,
      `Repair Cycles: ${metrics.repairCycles.totalRepairs} (1st-pass rate: ${metrics.repairCycles.firstPassSuccessRate.toFixed(1)}%)`,
      `Critical Path: ${formatDuration(metrics.criticalPath.totalCriticalPathDurationMs)} (${metrics.criticalPath.pathNodes.length} nodes)`,
      `Failure Taxonomy: ${metrics.errorTaxonomy.totalErrors} issues across ${metrics.errorTaxonomy.errorNodeCount} nodes`,
    ];
    void navigator.clipboard?.writeText(summaryLines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [activeDataset, metrics]);

  if (!activeDataset || !Array.isArray(activeDataset.nodes) || activeDataset.nodes.length === 0) {
    return (
      <div className={`gvui-analytics-dashboard ${className}`} data-testid="analytics-empty-state">
        <div className="analytics-empty-state">
          <IconChartBar size={48} className="analytics-empty-icon" />
          <h2 className="analytics-empty-title">No Graph Telemetry Data</h2>
          <p className="analytics-empty-desc">
            Load an active orchestration graph or execution capsule to view real-time performance,
            velocity, token consumption, and bottleneck analytics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`gvui-analytics-dashboard ${className}`} data-testid="gvui-analytics-dashboard">
      {/* Header */}
      <div className="analytics-header">
        <div className="analytics-header-title-group">
          <h1 className="analytics-title">
            <IconChartBar size={24} color="#818cf8" />
            Executive Telemetry Analytics
          </h1>
          <p className="analytics-subtitle">
            Deep performance diagnostics, concurrency heatmaps, and critical-path breakdown for{" "}
            <strong>{activeDataset.title ?? activeDataset.id}</strong>
          </p>
        </div>

        <div className="analytics-header-actions">
          <button
            type="button"
            className="analytics-action-btn"
            onClick={handleCopySummary}
            data-testid="analytics-copy-summary-btn"
          >
            {copied ? <IconCheck size={14} color="#10b981" /> : <IconCopy size={14} />}
            <span>{copied ? "Copied Telemetry!" : "Export Summary"}</span>
          </button>
        </div>
      </div>

      {/* Executive KPI Grid Banner */}
      <div className="analytics-kpi-grid" data-testid="analytics-kpi-grid">
        <div className="analytics-kpi-card">
          <div className="analytics-kpi-header">
            <span>Wall Duration</span>
            <IconGauge size={14} color="#818cf8" />
          </div>
          <div className="analytics-kpi-value">
            {formatDuration(metrics.runVelocity.totalWallClockMs)}
          </div>
          <div className="analytics-kpi-subtext">
            Cognitive: {formatDuration(metrics.runVelocity.totalCognitiveMs)} (
            {metrics.runVelocity.cognitivePercentage.toFixed(0)}%)
          </div>
        </div>

        <div className="analytics-kpi-card kpi-success">
          <div className="analytics-kpi-header">
            <span>Success Rate</span>
            <IconCheck size={14} color="#10b981" />
          </div>
          <div className="analytics-kpi-value">{metrics.successRate.toFixed(1)}%</div>
          <div className="analytics-kpi-subtext">
            {metrics.successNodes} of {metrics.completedNodes} completed tasks
          </div>
        </div>

        <div className="analytics-kpi-card kpi-cyan">
          <div className="analytics-kpi-header">
            <span>Total Tokens</span>
            <IconCoins size={14} color="#06b6d4" />
          </div>
          <div className="analytics-kpi-value">
            {formatTokens(metrics.tokenDistribution.totalTokens)}
          </div>
          <div className="analytics-kpi-subtext">
            Recorded Cost: {formatRecordedCost(metrics.tokenDistribution.totalCostUsd)}
          </div>
        </div>

        <div className="analytics-kpi-card kpi-warning">
          <div className="analytics-kpi-header">
            <span>Peak Concurrency</span>
            <IconFlame size={14} color="#f59e0b" />
          </div>
          <div className="analytics-kpi-value">{metrics.concurrency.peakConcurrency}x</div>
          <div className="analytics-kpi-subtext">
            Avg: {metrics.concurrency.averageConcurrency.toFixed(1)} concurrent tasks
          </div>
        </div>

        <div className="analytics-kpi-card">
          <div className="analytics-kpi-header">
            <span>Critical Path</span>
            <IconGitCommit size={14} color="#6366f1" />
          </div>
          <div className="analytics-kpi-value">
            {formatDuration(metrics.criticalPath.totalCriticalPathDurationMs)}
          </div>
          <div className="analytics-kpi-subtext">
            {metrics.criticalPath.pathNodes.length} sequential bottleneck nodes
          </div>
        </div>

        <div className="analytics-kpi-card kpi-error">
          <div className="analytics-kpi-header">
            <span>Repair Iterations</span>
            <IconRefresh size={14} color="#ef4444" />
          </div>
          <div className="analytics-kpi-value">{metrics.repairCycles.totalRepairs}</div>
          <div className="analytics-kpi-subtext">
            1st-Pass: {metrics.repairCycles.firstPassSuccessRate.toFixed(1)}% clean
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="analytics-tab-bar" data-testid="analytics-tab-bar">
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
          data-testid="tab-overview"
        >
          <IconChartBar size={15} />
          <span>Executive Overview</span>
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === "velocity" ? "active" : ""}`}
          onClick={() => setActiveTab("velocity")}
          data-testid="tab-velocity"
        >
          <IconGauge size={15} />
          <span>Run Velocity</span>
          <span className="analytics-tab-badge">
            {metrics.runVelocity.nodesPerMinute.toFixed(1)} n/m
          </span>
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === "concurrency" ? "active" : ""}`}
          onClick={() => setActiveTab("concurrency")}
          data-testid="tab-concurrency"
        >
          <IconFlame size={15} />
          <span>Concurrency Heatmap</span>
          <span className="analytics-tab-badge">{metrics.concurrency.peakConcurrency}x</span>
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === "tokens" ? "active" : ""}`}
          onClick={() => setActiveTab("tokens")}
          data-testid="tab-tokens"
        >
          <IconCoins size={15} />
          <span>Token Distributions</span>
          <span className="analytics-tab-badge">
            {formatTokens(metrics.tokenDistribution.totalTokens)}
          </span>
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === "repairs" ? "active" : ""}`}
          onClick={() => setActiveTab("repairs")}
          data-testid="tab-repairs"
        >
          <IconRefresh size={15} />
          <span>Repair Cycles</span>
          <span className="analytics-tab-badge">{metrics.repairCycles.totalRepairs}</span>
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === "errors" ? "active" : ""}`}
          onClick={() => setActiveTab("errors")}
          data-testid="tab-errors"
        >
          <IconBug size={15} />
          <span>Error Taxonomy</span>
          <span
            className="analytics-tab-badge"
            style={{
              backgroundColor: metrics.errorTaxonomy.totalErrors > 0 ? "#7f1d1d" : "#3f3f46",
            }}
          >
            {metrics.errorTaxonomy.totalErrors}
          </span>
        </button>
        <button
          type="button"
          className={`analytics-tab-btn ${activeTab === "bottlenecks" ? "active" : ""}`}
          onClick={() => setActiveTab("bottlenecks")}
          data-testid="tab-bottlenecks"
        >
          <IconGitCommit size={15} />
          <span>Critical Path</span>
          <span className="analytics-tab-badge">{metrics.criticalPath.pathNodes.length} nodes</span>
        </button>
      </div>

      {/* Filter Bar */}
      <AnalyticsFilterBar
        filters={filters}
        onSearchChange={setSearchQuery}
        onStatusChange={setNodeStatus}
        onTierChange={setModelTier}
        onResetFilters={resetFilters}
      />

      {/* Dashboard View Routing */}
      {activeTab === "overview" && (
        <div className="analytics-cards-grid" data-testid="analytics-overview-grid">
          <RunVelocityCard velocity={metrics.runVelocity} completedNodes={metrics.completedNodes} />
          <ConcurrencyHeatmapCard concurrency={metrics.concurrency} />
          <TokenDistributionCard distribution={metrics.tokenDistribution} />
          <RepairCycleHistogramCard
            repairCycles={metrics.repairCycles}
            totalNodes={metrics.totalNodes}
          />
          <ErrorTaxonomyCard
            errorTaxonomy={metrics.errorTaxonomy}
            totalNodes={metrics.totalNodes}
          />
          <CriticalPathCard criticalPath={metrics.criticalPath} onSelectNode={onSelectNode} />
        </div>
      )}

      {activeTab === "velocity" && (
        <div style={{ maxWidth: 900 }}>
          <RunVelocityCard velocity={metrics.runVelocity} completedNodes={metrics.completedNodes} />
        </div>
      )}

      {activeTab === "concurrency" && (
        <div style={{ maxWidth: 900 }}>
          <ConcurrencyHeatmapCard concurrency={metrics.concurrency} />
        </div>
      )}

      {activeTab === "tokens" && (
        <div style={{ maxWidth: 900 }}>
          <TokenDistributionCard distribution={metrics.tokenDistribution} />
        </div>
      )}

      {activeTab === "repairs" && (
        <div style={{ maxWidth: 900 }}>
          <RepairCycleHistogramCard
            repairCycles={metrics.repairCycles}
            totalNodes={metrics.totalNodes}
          />
        </div>
      )}

      {activeTab === "errors" && (
        <div style={{ maxWidth: 900 }}>
          <ErrorTaxonomyCard
            errorTaxonomy={metrics.errorTaxonomy}
            totalNodes={metrics.totalNodes}
          />
        </div>
      )}

      {activeTab === "bottlenecks" && (
        <div style={{ maxWidth: 900 }}>
          <CriticalPathCard criticalPath={metrics.criticalPath} onSelectNode={onSelectNode} />
        </div>
      )}
    </div>
  );
};
