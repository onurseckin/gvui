import {
  IconArrowRight,
  IconClock,
  IconCoins,
  IconFlame,
  IconLayersLinked,
  IconLink,
  IconRoute,
} from "@tabler/icons-react";
import type { FC } from "react";
import { memo } from "react";
import { formatTokens } from "../../../primitives/nodes/NodeCard/nodeCardModel";
import type { GraphEdgeData } from "../../../types/graphData";

export interface EdgeOverviewTabProps {
  edge: GraphEdgeData;
  sourceName?: string;
  targetName?: string;
  onNavigateNode?: (nodeId: string) => void;
}

export const EdgeOverviewTab: FC<EdgeOverviewTabProps> = memo(function EdgeOverviewTab({
  edge,
  sourceName = "Source Node",
  targetName = "Target Node",
  onNavigateNode,
}) {
  const traffic = edge.traffic;
  const handoff = edge.handoff;
  const isHighTraffic = Boolean(
    edge.isHighTraffic || (traffic && (traffic.volume ?? 0) > 1) || edge.isCycle,
  );

  return (
    <div className="edge-drawer-tab-content">
      <section className="edge-drawer-section">
        <h4 className="edge-drawer-section-title">Connection Routing</h4>
        <div className="edge-routing-card">
          <div className="edge-routing-endpoint">
            <span className="edge-endpoint-label">Source Node</span>
            <button
              type="button"
              className="edge-node-link-btn"
              onClick={() => onNavigateNode?.(edge.source)}
              title={`Jump to ${sourceName}`}
            >
              <span className="edge-node-name">{sourceName}</span>
              <code className="edge-node-id">{edge.source}</code>
            </button>
          </div>

          <div className="edge-routing-arrow">
            <IconArrowRight size={20} />
            {edge.kind && <span className={`edge-kind-pill kind-${edge.kind}`}>{edge.kind}</span>}
          </div>

          <div className="edge-routing-endpoint">
            <span className="edge-endpoint-label">Target Node</span>
            <button
              type="button"
              className="edge-node-link-btn"
              onClick={() => onNavigateNode?.(edge.target)}
              title={`Jump to ${targetName}`}
            >
              <span className="edge-node-name">{targetName}</span>
              <code className="edge-node-id">{edge.target}</code>
            </button>
          </div>
        </div>
      </section>

      {handoff && (
        <section className="edge-drawer-section">
          <h4 className="edge-drawer-section-title">Handoff Contract</h4>
          <div className="edge-handoff-card">
            <div className="edge-handoff-header">
              <span className="edge-handoff-kind-chip">{handoff.kind || "data"}</span>
              {handoff.summary && <span className="edge-handoff-summary">{handoff.summary}</span>}
            </div>
            {handoff.preview && (
              <pre className="edge-pre edge-handoff-preview">
                <code>{handoff.preview}</code>
              </pre>
            )}
            {typeof handoff.tokens === "number" && (
              <div className="edge-handoff-meta">
                <span className="edge-metric-label">
                  <IconCoins size={12} /> Handoff Payload Tokens:
                </span>
                <span className="edge-metric-value">{formatTokens(handoff.tokens)}</span>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="edge-drawer-section">
        <h4 className="edge-drawer-section-title">Edge Properties &amp; Bundle Metrics</h4>
        <div className="edge-metric-grid">
          <div className="edge-metric-card">
            <span className="edge-metric-label">
              <IconRoute size={13} /> Edge Semantic Type
            </span>
            <span className="edge-metric-value">{edge.kind ?? "sequence"}</span>
          </div>

          {edge.isCycle && (
            <div className="edge-metric-card edge-metric--warn">
              <span className="edge-metric-label">
                <IconFlame size={13} /> Feedback Loop / Cycle
              </span>
              <span className="edge-metric-value">Active Pushback</span>
            </div>
          )}

          {isHighTraffic && (
            <div className="edge-metric-card edge-metric--highlight">
              <span className="edge-metric-label">
                <IconLayersLinked size={13} /> Traffic Density
              </span>
              <span className="edge-metric-value">High Traffic Channel</span>
            </div>
          )}

          {edge.bundleCount !== undefined && edge.bundleCount > 1 && (
            <div className="edge-metric-card">
              <span className="edge-metric-label">
                <IconLink size={13} /> Bundle Lane
              </span>
              <span className="edge-metric-value">
                {`${(edge.bundleIndex ?? 0) + 1} of ${edge.bundleCount}`}
              </span>
            </div>
          )}

          {edge.stepNumber !== undefined && (
            <div className="edge-metric-card">
              <span className="edge-metric-label">
                <IconClock size={13} /> Workflow Step
              </span>
              <span className="edge-metric-value">{`Step ${edge.stepNumber}`}</span>
            </div>
          )}

          {edge.tokens !== undefined && (
            <div className="edge-metric-card">
              <span className="edge-metric-label">
                <IconCoins size={13} /> Channel Tokens
              </span>
              <span className="edge-metric-value">{formatTokens(edge.tokens)}</span>
            </div>
          )}
        </div>
      </section>

      {edge.description && (
        <section className="edge-drawer-section">
          <h4 className="edge-drawer-section-title">Description</h4>
          <p className="edge-prose">{edge.description}</p>
        </section>
      )}
    </div>
  );
});

EdgeOverviewTab.displayName = "EdgeOverviewTab";
