import type { FC } from "react";
import type {
  CustomLayoutResult,
  NormalizedEdge,
  OptimizationStats,
  PhaseTimings,
} from "../../../engine/layout/custom/types";

/**
 * v2 report surface: metrics are measured, not searched (see
 * docs/planning/layout-engine-v2/04-config-and-quality.md §3). `normalizedEdges` is accepted only
 * for prop compatibility with existing callers — v2's `LayoutMetrics` already carries
 * `unresolvedRouteCount`/`unresolvedBadgeCount` computed engine-side, so this component no longer
 * derives them from the input graph.
 */
interface CustomLayoutMetricsProps {
  layoutResult: CustomLayoutResult;
  normalizedEdges?: NormalizedEdge[];
}

/** Phase order for the timings breakdown, matching Rust's `PhaseTimings` field order. */
const TIMING_PHASES: { key: keyof PhaseTimings; label: string }[] = [
  { key: "ingest", label: "Ingest" },
  { key: "structure", label: "Structure" },
  { key: "rank", label: "Rank" },
  { key: "layer", label: "Layer" },
  { key: "order", label: "Order" },
  { key: "demand", label: "Demand" },
  { key: "coordinates", label: "Coords" },
  { key: "route", label: "Route" },
  { key: "emit", label: "Emit" },
];

/** Distinct-ish bar colors per phase, cycled; purely decorative, carries no semantics. */
const TIMING_BAR_COLORS = [
  "#38bdf8",
  "#818cf8",
  "#c084fc",
  "#f472b6",
  "#fb923c",
  "#facc15",
  "#4ade80",
  "#2dd4bf",
  "#60a5fa",
];

/**
 * `straightChainRatio` below this reads as a structural warning, not just "a bit lower than
 * ideal" — see the metric's own doc comment on the Rust side for why it's the best single proxy
 * for "looks designed".
 */
const STRAIGHT_CHAIN_RATIO_WARNING_THRESHOLD = 0.9;

/**
 * `geometricCrossings` is expected to exceed `crossings` somewhat (lane routing crosses where a
 * vertical run meets another edge's horizontal run in the same channel, which the combinatorial
 * Phase 5 count does not model). A small, stable excess is normal; only a large ratio means lane
 * ordering is fighting the topology (see 04-config-and-quality.md §3b).
 */
const GEOMETRIC_CROSSINGS_EXCESS_RATIO_WARNING = 2;

function geometricCrossingsExcessIsLarge(crossings: number, geometricCrossings: number): boolean {
  if (crossings <= 0) return geometricCrossings > 0;
  return geometricCrossings / crossings > GEOMETRIC_CROSSINGS_EXCESS_RATIO_WARNING;
}

function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function formatMs(ms: number): string {
  return ms < 10 ? `${ms.toFixed(2)}ms` : `${Math.round(ms)}ms`;
}

const DEFAULT_TIMINGS: PhaseTimings = {
  ingest: 0,
  structure: 0,
  rank: 0,
  layer: 0,
  order: 0,
  demand: 0,
  coordinates: 0,
  route: 0,
  emit: 0,
  total: 0,
};

const DEFAULT_OPTIMIZATION_STATS: OptimizationStats = {
  globalPasses: 0,
  evaluatedPortStates: 0,
  spacingExpansions: 0,
  durationMs: 0,
  stopReason: "ok",
  timings: DEFAULT_TIMINGS,
};

export const CustomLayoutMetrics: FC<CustomLayoutMetricsProps> = ({ layoutResult }) => {
  const validation = layoutResult?.validation;
  const metrics = validation?.metrics;
  const isValid = validation?.isValid ?? false;
  const status = layoutResult?.status ?? "invalid_hard_failure";
  const stats = layoutResult?.optimizationStats ?? DEFAULT_OPTIMIZATION_STATS;
  const diagnostics = validation?.diagnostics ?? [];

  const getStatusBadge = () => {
    if (status === "success" && isValid) {
      return <span className="status-badge status-valid">✅ Valid</span>;
    }
    if (status === "unresolved_soft_conflicts") {
      return <span className="status-badge status-warning">⚠️ Soft Conflicts</span>;
    }
    return <span className="status-badge status-invalid">❌ Invalid</span>;
  };

  if (!metrics) {
    return (
      <div className="custom-layout-metrics-panel">
        <div className="metrics-header">
          <span className="metrics-title">📊 Engine Metrics & Status</span>
          {getStatusBadge()}
        </div>
        <div className="metrics-diagnostics">No layout result yet.</div>
      </div>
    );
  }

  const constraintViolations =
    metrics.nodeNodeOverlaps +
    metrics.edgeNodePenetrations +
    metrics.badgeNodeOverlaps +
    metrics.badgeBadgeOverlaps +
    metrics.unresolvedRouteCount +
    metrics.unresolvedBadgeCount;

  const straightChainWarning = metrics.straightChainRatio < STRAIGHT_CHAIN_RATIO_WARNING_THRESHOLD;
  const leaderWarning = metrics.leaderCount > 0;

  const timings = stats.timings ?? DEFAULT_TIMINGS;
  const totalTiming = timings.total > 0 ? timings.total : TIMING_PHASES.reduce(
    (sum, phase) => sum + timings[phase.key],
    0,
  );

  return (
    <div className="custom-layout-metrics-panel">
      <div className="metrics-header">
        <span className="metrics-title">📊 Engine Metrics & Status</span>
        {getStatusBadge()}
      </div>

      {/* Primary row: the numbers that actually describe layout quality. */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Crossings</span>
          <span className={`metric-value ${metrics.crossings > 0 ? "has-conflicts" : ""}`}>
            {metrics.crossings}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Geometric Crossings</span>
          <span
            className={`metric-value ${
              geometricCrossingsExcessIsLarge(metrics.crossings, metrics.geometricCrossings)
                ? "has-conflicts"
                : ""
            }`}
            title="Expected to exceed `crossings` somewhat (lane routing has crossings the combinatorial count doesn't model). A large ratio means lane ordering is fighting the topology."
          >
            {metrics.geometricCrossings}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Bends</span>
          <span className="metric-value">{metrics.bendCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Straight Chain Ratio</span>
          <span
            className="metric-value"
            style={straightChainWarning ? { color: "#fbbf24" } : undefined}
            title="Fraction of dummy chains that are perfectly straight — the best single proxy for &quot;looks designed&quot;. A drop is an early warning, not a tuning knob."
          >
            {formatPercent(metrics.straightChainRatio)}
            {straightChainWarning && " ⚠"}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Leaders</span>
          <span
            className="metric-value"
            style={leaderWarning ? { color: "#fbbf24" } : undefined}
            title="Badges that needed a leader line. Should be ~0; nonzero means a label's reserved area was defeated upstream."
          >
            {metrics.leaderCount}
            {leaderWarning && " ⚠"}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Max Lane Depth</span>
          <span className="metric-value">{metrics.laneDepthMax}</span>
        </div>
      </div>

      {/* Secondary row: graph shape and drawing footprint. */}
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-label">Nodes</span>
          <span className="metric-value">{metrics.nodeCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Edges</span>
          <span className="metric-value">{metrics.edgeCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Ranks</span>
          <span className="metric-value">{metrics.rankCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Dummies</span>
          <span className="metric-value">{metrics.dummyCount}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Area</span>
          <span className="metric-value">{Math.round(metrics.area).toLocaleString()} px²</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Aspect Ratio</span>
          <span className="metric-value">{metrics.aspectRatio.toFixed(2)}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Total Length</span>
          <span className="metric-value">{Math.round(metrics.totalLength)}px</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Labels Truncated</span>
          <span className={`metric-value ${metrics.labelsTruncated > 0 ? "has-conflicts" : ""}`}>
            {metrics.labelsTruncated}
          </span>
        </div>
      </div>

      {/* Constraint row: v2 guarantees these by construction, so nonzero is a bug report. */}
      <div>
        <div className="diagnostics-title" style={{ color: "#a1a1aa" }}>
          🔒 Constraints ({constraintViolations === 0 ? "all hold" : `${constraintViolations} violated`})
        </div>
        <div className="metrics-grid">
          <div className="metric-card">
            <span className="metric-label">Node-Node Overlaps</span>
            <span
              className="metric-value"
              style={metrics.nodeNodeOverlaps > 0 ? { color: "#f87171" } : undefined}
            >
              {metrics.nodeNodeOverlaps}
            </span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Edge-Node Penetrations</span>
            <span
              className="metric-value"
              style={metrics.edgeNodePenetrations > 0 ? { color: "#f87171" } : undefined}
            >
              {metrics.edgeNodePenetrations}
            </span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Badge-Node Overlaps</span>
            <span
              className="metric-value"
              style={metrics.badgeNodeOverlaps > 0 ? { color: "#f87171" } : undefined}
            >
              {metrics.badgeNodeOverlaps}
            </span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Badge-Badge Overlaps</span>
            <span
              className="metric-value"
              style={metrics.badgeBadgeOverlaps > 0 ? { color: "#f87171" } : undefined}
            >
              {metrics.badgeBadgeOverlaps}
            </span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Unresolved Routes</span>
            <span
              className="metric-value"
              style={metrics.unresolvedRouteCount > 0 ? { color: "#f87171" } : undefined}
            >
              {metrics.unresolvedRouteCount}
            </span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Unresolved Badges</span>
            <span
              className="metric-value"
              style={metrics.unresolvedBadgeCount > 0 ? { color: "#f87171" } : undefined}
            >
              {metrics.unresolvedBadgeCount}
            </span>
          </div>
        </div>
        {constraintViolations > 0 && (
          <div className="metrics-diagnostics" style={{ marginTop: "6px" }}>
            Any nonzero value above is a <strong>bug</strong>, not a tuning opportunity — v2
            guarantees these constraints by construction (see 04-config-and-quality.md §3a).
          </div>
        )}
      </div>

      {/* Timings row: per-phase bar breakdown of optimizationStats.timings. */}
      <div>
        <div className="diagnostics-title" style={{ color: "#a1a1aa" }}>
          ⏱️ Phase Timings ({formatMs(timings.total)} total, {stats.stopReason})
        </div>
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "10px",
            borderRadius: "4px",
            overflow: "hidden",
            border: "1px solid #27272a",
          }}
        >
          {TIMING_PHASES.map((phase, idx) => {
            const value = timings[phase.key];
            const widthPct = totalTiming > 0 ? (value / totalTiming) * 100 : 0;
            return (
              <div
                key={phase.key}
                title={`${phase.label}: ${formatMs(value)}`}
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: TIMING_BAR_COLORS[idx % TIMING_BAR_COLORS.length],
                  minWidth: value > 0 ? "1px" : 0,
                }}
              />
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            marginTop: "6px",
            fontSize: "0.72rem",
            color: "#a1a1aa",
          }}
        >
          {TIMING_PHASES.map((phase, idx) => (
            <span key={phase.key} style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "2px",
                  backgroundColor: TIMING_BAR_COLORS[idx % TIMING_BAR_COLORS.length],
                  display: "inline-block",
                }}
              />
              {phase.label} {formatMs(timings[phase.key])}
            </span>
          ))}
        </div>
      </div>

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
