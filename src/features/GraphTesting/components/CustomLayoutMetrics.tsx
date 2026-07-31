import type { FC } from "react";
import { hasBadge } from "../../../engine/layout/custom/badgeMeasurement";
import { buildLayoutScore } from "../../../engine/layout/custom/layoutObjective";
import type { CustomLayoutResult, NormalizedEdge } from "../../../engine/layout/custom/types";

interface CustomLayoutMetricsProps {
  layoutResult: CustomLayoutResult;
  normalizedEdges?: NormalizedEdge[];
}

export const CustomLayoutMetrics: FC<CustomLayoutMetricsProps> = ({
  layoutResult,
  normalizedEdges,
}) => {
  const validation = layoutResult?.validation || {
    isValid: false,
    diagnostics: [],
    metrics: {
      nodeNodeOverlaps: 0,
      edgeNodePenetrations: 0,
      sharedEdgeSegmentLength: 0,
      badgeNodeOverlaps: 0,
      badgeBadgeOverlaps: 0,
      badgeUnrelatedEdgeOverlaps: 0,
      crossingCount: 0,
      bendCount: 0,
      totalLength: 0,
      directionDeviationPenalty: 0,
      portSideReusePenalty: 0,
      totalArea: 0,
    },
  };
  const metrics = validation.metrics || {
    crossingCount: 0,
    bendCount: 0,
    totalLength: 0,
    totalArea: 0,
  };
  const isValid = validation.isValid;
  const status = layoutResult?.status || "invalid_hard_failure";
  const stats = layoutResult?.optimizationStats;

  const score = layoutResult ? buildLayoutScore(layoutResult, validation) : null;

  const getStatusBadge = () => {
    if (status === "success" && isValid) {
      return <span className="status-badge status-valid">✅ Valid</span>;
    }
    if (status === "unresolved_soft_conflicts") {
      return <span className="status-badge status-warning">⚠️ Soft Conflicts</span>;
    }
    return <span className="status-badge status-invalid">❌ Invalid</span>;
  };

  const nodeCount = (layoutResult?.nodes || []).length;
  const edgeCount = (layoutResult?.edges || []).length;
  const diagnostics = validation.diagnostics || [];

  const totalEdgesCount = normalizedEdges ? normalizedEdges.length : edgeCount;
  const validRoutedEdgesCount = (layoutResult?.edges || []).filter(
    (e) => e.points && e.points.length >= 2,
  ).length;
  const missingRouteDiagnosticsCount = diagnostics.filter((d) => d.code === "MISSING_ROUTE").length;
  const unresolvedRoutes =
    metrics.unresolvedRouteCount ??
    Math.max(missingRouteDiagnosticsCount, totalEdgesCount - validRoutedEdgesCount);

  const expectedBadgesCount = normalizedEdges
    ? normalizedEdges.filter((e) => hasBadge(e.label, e.isCycle)).length
    : (layoutResult?.badges || []).length;
  const unresolvedBadges =
    metrics.unresolvedBadgeCount ??
    Math.max(0, expectedBadgesCount - (layoutResult?.badges || []).length);

  const ordinaryLeaderCount = metrics.ordinaryLeaderCount ?? score?.ordinaryLeaderCount;
  const feedbackLeaderCount = metrics.feedbackLeaderCount ?? score?.feedbackLeaderCount;
  const totalLeaderLength = metrics.totalLeaderLength ?? score?.totalLeaderLength;
  const hairpinCount = metrics.hairpinCount ?? score?.hairpinCount;
  const portSideImbalance = metrics.portSideImbalance ?? score?.portSideImbalance;

  return (
    <div className="custom-layout-metrics-panel">
      <div className="metrics-header">
        <span className="metrics-title">📊 Engine Metrics & Status</span>
        {getStatusBadge()}
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Nodes</span>
          <span className="metric-value">{nodeCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Edges</span>
          <span className="metric-value">{edgeCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Crossings</span>
          <span className={`metric-value ${metrics.crossingCount > 0 ? "has-conflicts" : ""}`}>
            {metrics.crossingCount}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Bends</span>
          <span className="metric-value">{metrics.bendCount}</span>
        </div>
        {typeof hairpinCount === "number" && (
          <div className="metric-card">
            <span className="metric-label">Hairpins</span>
            <span className={`metric-value ${hairpinCount > 0 ? "has-conflicts" : ""}`}>
              {hairpinCount}
            </span>
          </div>
        )}
        {typeof ordinaryLeaderCount === "number" && (
          <div className="metric-card">
            <span className="metric-label">Ordinary Leaders</span>
            <span className="metric-value">{ordinaryLeaderCount}</span>
          </div>
        )}
        {typeof feedbackLeaderCount === "number" && (
          <div className="metric-card">
            <span className="metric-label">Feedback Leaders</span>
            <span className="metric-value">{feedbackLeaderCount}</span>
          </div>
        )}
        {typeof totalLeaderLength === "number" && (
          <div className="metric-card">
            <span className="metric-label">Leader Length</span>
            <span className="metric-value">{Math.round(totalLeaderLength)}px</span>
          </div>
        )}
        {typeof portSideImbalance === "number" && (
          <div className="metric-card">
            <span className="metric-label">Port Imbalance</span>
            <span className="metric-value">{portSideImbalance}</span>
          </div>
        )}
        <div className="metric-card">
          <span className="metric-label">Unresolved Routes</span>
          <span className={`metric-value ${unresolvedRoutes > 0 ? "has-conflicts" : ""}`}>
            {unresolvedRoutes}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Unresolved Badges</span>
          <span className={`metric-value ${unresolvedBadges > 0 ? "has-conflicts" : ""}`}>
            {unresolvedBadges}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total Edge Length</span>
          <span className="metric-value">{Math.round(metrics.totalLength)}px</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total Bounding Area</span>
          <span className="metric-value">{Math.round(metrics.totalArea).toLocaleString()} px²</span>
        </div>
      </div>

      {score && (
        <div className="metrics-score-summary" style={{ marginTop: "12px" }}>
          <div className="diagnostics-title" style={{ color: "#a855f7", marginBottom: "8px" }}>
            🎯 Aesthetic Score Summary
          </div>
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Hard Errors</span>
              <span className={`metric-value ${score.hardErrorCount > 0 ? "has-conflicts" : ""}`}>
                {score.hardErrorCount}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Node Overlaps</span>
              <span className={`metric-value ${score.nodeNodeOverlaps > 0 ? "has-conflicts" : ""}`}>
                {score.nodeNodeOverlaps}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Edge Penetrations</span>
              <span
                className={`metric-value ${score.edgeNodePenetrations > 0 ? "has-conflicts" : ""}`}
              >
                {score.edgeNodePenetrations}
              </span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Badge Overlaps</span>
              <span
                className={`metric-value ${
                  score.badgeNodeOverlaps +
                    score.badgeBadgeOverlaps +
                    score.badgeUnrelatedEdgeOverlaps >
                  0
                    ? "has-conflicts"
                    : ""
                }`}
              >
                {score.badgeNodeOverlaps +
                  score.badgeBadgeOverlaps +
                  score.badgeUnrelatedEdgeOverlaps}
              </span>
            </div>
          </div>
        </div>
      )}

      {stats && (
        <div className="optimization-stats-section" style={{ marginTop: "12px" }}>
          <div className="diagnostics-title" style={{ color: "#38bdf8", marginBottom: "8px" }}>
            ⚙️ Optimization Stats
          </div>
          <div className="metrics-grid">
            <div className="metric-card">
              <span className="metric-label">Global Passes</span>
              <span className="metric-value">{stats.globalPasses}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Evaluated Port States</span>
              <span className="metric-value">{stats.evaluatedPortStates}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Spacing Expansions</span>
              <span className="metric-value">{stats.spacingExpansions}</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Stop Reason</span>
              <span className="metric-value" style={{ fontSize: "0.85rem" }}>
                {stats.stopReason ??
                  (stats.repeatedStateStop ? "repeated-logical-state" : "pass-limit")}
              </span>
            </div>
          </div>
        </div>
      )}

      {diagnostics.length > 0 && (
        <div className="metrics-diagnostics">
          <div className="diagnostics-title">⚠️ Diagnostics ({diagnostics.length})</div>
          <ul className="diagnostics-list">
            {diagnostics.slice(0, 5).map((diag, idx) => (
              <li key={`${diag.code}-${idx}`} className={`diag-item diag-${diag.severity}`}>
                <span className="diag-code">[{diag.code}]</span> {diag.message}
              </li>
            ))}
            {diagnostics.length > 5 && (
              <li className="diag-more">...and {diagnostics.length - 5} more issues</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
