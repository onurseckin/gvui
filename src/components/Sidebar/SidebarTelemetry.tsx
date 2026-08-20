import type { FC } from "react";
import React, { useMemo } from "react";
import type { GraphDataset } from "../../types/graphData";
import { formatCost, formatDuration } from "../../primitives/nodes/NodeCard/nodeCardModel";
import {
  aggregateRecordedCost,
  aggregateRecordedDuration,
  readSections,
  UNKNOWN_LABEL,
} from "../../state/graphSchema";
import { SidebarAccordion } from "./SidebarAccordion";

export interface SidebarTelemetryProps {
  dataset: GraphDataset | null;
  defaultExpanded?: boolean;
}

interface RunShape {
  nodesCount: number;
  edgesCount: number;
  regionsCount: number;
  durationMs: number | undefined;
  durationNodes: number;
  costUsd: number | undefined;
  costNodes: number;
}

function describeRun(dataset: GraphDataset | null): RunShape | null {
  if (!dataset || !dataset.nodes || dataset.nodes.length === 0) return null;

  const duration = aggregateRecordedDuration(dataset);
  const cost = aggregateRecordedCost(dataset);

  return {
    nodesCount: dataset.nodes.length,
    edgesCount: dataset.edges?.length ?? 0,
    regionsCount: readSections(dataset).length,
    durationMs: duration?.total,
    durationNodes: duration?.reportingNodes ?? 0,
    costUsd: cost?.total,
    costNodes: cost?.reportingNodes ?? 0,
  };
}

/**
 * The shape of the run at a glance. Duration and cost are summed only over the nodes that recorded
 * one; a run that recorded neither shows "unknown" rather than a zero that reads like a measurement.
 */
export const SidebarTelemetry: FC<SidebarTelemetryProps> = React.memo(function SidebarTelemetry({
  dataset,
  defaultExpanded = true,
}) {
  const run = useMemo(() => describeRun(dataset), [dataset]);

  if (!run) {
    return (
      <div className="sidebar-section" data-testid="sidebar-telemetry">
        <div className="sidebar-section-header">
          <h4 className="sidebar-section-title">Run Shape</h4>
        </div>
        <p className="sidebar-empty-state">No graph loaded</p>
      </div>
    );
  }

  return (
    <SidebarAccordion
      testId="sidebar-telemetry"
      title="Run Shape"
      badge={`${run.nodesCount} nodes • ${run.edgesCount} edges`}
      defaultExpanded={defaultExpanded}
    >
      <div className="sidebar-telemetry-grid">
        <div className="telemetry-card">
          <span className="telemetry-label">Nodes</span>
          <span className="telemetry-value" data-testid="telemetry-nodes-count">
            {run.nodesCount}
          </span>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Edges</span>
          <span className="telemetry-value" data-testid="telemetry-edges-count">
            {run.edgesCount}
          </span>
        </div>
        <div className="telemetry-card">
          <span className="telemetry-label">Regions</span>
          <span className="telemetry-value" data-testid="telemetry-regions-count">
            {run.regionsCount}
          </span>
        </div>
        <div className={`telemetry-card ${run.durationMs === undefined ? "is-unknown" : ""}`}>
          <span className="telemetry-label">Duration</span>
          <span className="telemetry-value" data-testid="telemetry-duration">
            {run.durationMs === undefined ? UNKNOWN_LABEL : formatDuration(run.durationMs)}
          </span>
          {run.durationMs === undefined ? null : (
            <span className="telemetry-coverage" data-testid="telemetry-duration-coverage">
              {run.durationNodes}/{run.nodesCount} nodes
            </span>
          )}
        </div>
        <div className={`telemetry-card ${run.costUsd === undefined ? "is-unknown" : ""}`}>
          <span className="telemetry-label">Recorded cost</span>
          <span className="telemetry-value" data-testid="telemetry-cost">
            {run.costUsd === undefined ? UNKNOWN_LABEL : formatCost(run.costUsd)}
          </span>
          {run.costUsd === undefined ? null : (
            <span className="telemetry-coverage" data-testid="telemetry-cost-coverage">
              {run.costNodes}/{run.nodesCount} nodes
            </span>
          )}
        </div>
      </div>
      {run.costUsd === undefined ? (
        <p className="sidebar-note" data-testid="telemetry-cost-note">
          No node recorded a cost. Nothing here is priced from a rate card.
        </p>
      ) : null}
    </SidebarAccordion>
  );
});

SidebarTelemetry.displayName = "SidebarTelemetry";
