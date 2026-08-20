import type { FC } from "react";
import React, { useMemo } from "react";
import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import {
  readNodeTelemetry,
  UNKNOWN_LABEL,
  weakestEvidence,
  type EvidenceClass,
} from "../../state/graphSchema";
import { SidebarAccordion } from "./SidebarAccordion";
import { EvidenceChip } from "./EvidenceChip";

export interface SidebarModelBreakdownProps {
  dataset: GraphDataset | null;
  defaultExpanded?: boolean;
}

interface ModelItem {
  key: string;
  model: string | undefined;
  tier: string | undefined;
  count: number;
  evidence: EvidenceClass;
  isEstimated: boolean;
}

/**
 * The producer omits a model it never observed, so a node with no model is grouped under an explicit
 * unknown bucket. It is deliberately not a model name: "we were never told" has to be readable as
 * something other than a measurement.
 */
function buildModelItems(nodes: readonly GraphNodeData[]): ModelItem[] {
  const buckets = new Map<
    string,
    { model?: string; tier?: string; count: number; classes: EvidenceClass[]; estimated: boolean }
  >();

  for (const node of nodes) {
    const telemetry = readNodeTelemetry(node);
    const model = telemetry.model?.value;
    const key = model ?? UNKNOWN_LABEL;
    const bucket = buckets.get(key) ?? { count: 0, classes: [], estimated: false };

    bucket.count += 1;
    if (model !== undefined) bucket.model = model;
    if (bucket.tier === undefined && telemetry.modelTier !== undefined) {
      bucket.tier = telemetry.modelTier.value;
    }
    if (telemetry.model !== undefined) {
      bucket.classes.push(telemetry.model.evidence_class);
      bucket.estimated = bucket.estimated || telemetry.model.is_estimated === true;
    }
    buckets.set(key, bucket);
  }

  const items: ModelItem[] = [];
  for (const [key, bucket] of buckets.entries()) {
    items.push({
      key,
      model: bucket.model,
      tier: bucket.tier,
      count: bucket.count,
      evidence: weakestEvidence(bucket.classes) ?? "unknown",
      isEstimated: bucket.estimated,
    });
  }

  return items.sort((a, b) => {
    if (a.model === undefined && b.model !== undefined) return 1;
    if (b.model === undefined && a.model !== undefined) return -1;
    return b.count - a.count || (a.model ?? "").localeCompare(b.model ?? "");
  });
}

export const SidebarModelBreakdown: FC<SidebarModelBreakdownProps> = React.memo(
  function SidebarModelBreakdown({ dataset, defaultExpanded = true }) {
    const items = useMemo(() => buildModelItems(dataset?.nodes ?? []), [dataset]);

    const knownCount = items.filter((item) => item.model !== undefined).length;

    if (items.length === 0) {
      return (
        <div className="sidebar-section" data-testid="sidebar-model-breakdown">
          <div className="sidebar-section-header">
            <h4 className="sidebar-section-title">Model Attribution</h4>
          </div>
          <p className="sidebar-empty-state">No nodes to attribute</p>
        </div>
      );
    }

    return (
      <SidebarAccordion
        testId="sidebar-model-breakdown"
        title="Model Attribution"
        badge={`${knownCount} ${knownCount === 1 ? "model" : "models"}`}
        defaultExpanded={defaultExpanded}
      >
        <div className="sidebar-model-list">
          {items.map((item) => (
            <div
              key={item.key}
              className={`sidebar-model-item ${item.model === undefined ? "is-unknown" : ""}`}
              data-testid={`model-item-${item.key}`}
            >
              <div className="model-info">
                <span className="model-name" title={item.model ?? UNKNOWN_LABEL}>
                  {item.model ?? UNKNOWN_LABEL}
                </span>
                {item.tier ? (
                  <span className={`model-tier-chip tier-${item.tier}`}>{item.tier}</span>
                ) : null}
                {item.model === undefined ? null : (
                  <EvidenceChip evidence={item.evidence} isEstimated={item.isEstimated} />
                )}
              </div>
              <span className="model-count-badge" data-testid={`model-count-${item.key}`}>
                {item.count}
              </span>
            </div>
          ))}
        </div>
        {knownCount === 0 ? (
          <p className="sidebar-note" data-testid="model-breakdown-note">
            No node reported a model. The run never recorded one — this is not an empty measurement.
          </p>
        ) : null}
      </SidebarAccordion>
    );
  },
);

SidebarModelBreakdown.displayName = "SidebarModelBreakdown";
