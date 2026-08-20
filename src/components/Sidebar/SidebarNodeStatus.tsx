import type { FC } from "react";
import React, { useMemo } from "react";
import type { GraphDataset, NodeStatus } from "../../types/graphData";
import { UNKNOWN_LABEL } from "../../state/graphSchema";
import { describeOpenStatus, NEUTRAL_ACCENT } from "../OpenSchema";
import { SidebarAccordion } from "./SidebarAccordion";

export interface SidebarNodeStatusProps {
  dataset: GraphDataset | null;
  defaultExpanded?: boolean;
}

interface StatusItem {
  status: string;
  label: string;
  color: string;
  count: number;
  /** False for a status outside the preset vocabulary, which keeps its own name and accent. */
  recognized: boolean;
}

const ORDERED_STATUSES: readonly NodeStatus[] = [
  "running",
  "success",
  "error",
  "warning",
  "pending",
  "skipped",
  "cached",
];

export const SidebarNodeStatus: FC<SidebarNodeStatusProps> = React.memo(function SidebarNodeStatus({
  dataset,
  defaultExpanded = true,
}) {
  const statusItems = useMemo(() => {
    if (!dataset || !dataset.nodes || dataset.nodes.length === 0) {
      return [];
    }

    // A node whose status the run never recorded is NOT pending. Pending is a claim about where the
    // node sits in the lifecycle; absence is a claim about our records. They get separate buckets.
    // A status outside the preset vocabulary gets a bucket of its own rather than being dropped.
    const countMap = new Map<string, number>();
    let unknownCount = 0;
    for (const node of dataset.nodes) {
      const described = describeOpenStatus(node);
      if (!described.recorded || described.raw === undefined) {
        unknownCount += 1;
        continue;
      }
      countMap.set(described.raw, (countMap.get(described.raw) ?? 0) + 1);
    }

    const items: StatusItem[] = [];
    const emit = (status: string, count: number) => {
      const described = describeOpenStatus({ status });
      items.push({
        status,
        label: described.label,
        color: described.color,
        count,
        recognized: described.recognized,
      });
    };

    for (const status of ORDERED_STATUSES) {
      const count = countMap.get(status) ?? 0;
      if (count > 0) emit(status, count);
    }
    for (const [status, count] of countMap.entries()) {
      if (!ORDERED_STATUSES.includes(status as NodeStatus)) emit(status, count);
    }
    if (unknownCount > 0) {
      items.push({
        status: "unknown",
        label: UNKNOWN_LABEL,
        color: NEUTRAL_ACCENT,
        count: unknownCount,
        recognized: false,
      });
    }

    return items;
  }, [dataset]);

  if (statusItems.length === 0) {
    return (
      <div className="sidebar-section" data-testid="sidebar-node-status">
        <div className="sidebar-section-header">
          <h4 className="sidebar-section-title">Active Nodes</h4>
        </div>
        <p className="sidebar-empty-state">No active nodes</p>
      </div>
    );
  }

  const totalNodes = statusItems.reduce((acc, item) => acc + item.count, 0);

  return (
    <SidebarAccordion
      testId="sidebar-node-status"
      title="Node Status"
      badge={`${totalNodes} total`}
      defaultExpanded={defaultExpanded}
    >
      <div className="sidebar-status-list">
        {statusItems.map((item) => (
          <div
            key={item.status}
            className={`sidebar-status-item status-${item.status} ${
              item.status === "unknown" ? "is-unknown" : ""
            }`}
            data-testid={`status-item-${item.status}`}
            title={item.recognized || item.status === "unknown" ? undefined : item.status}
          >
            <span
              className={`status-dot dot-${item.status}`}
              style={
                item.recognized || item.status === "unknown"
                  ? undefined
                  : { background: item.color }
              }
            />
            <span className="status-label">{item.label}</span>
            <span className="status-count" data-testid={`status-count-${item.status}`}>
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </SidebarAccordion>
  );
});

SidebarNodeStatus.displayName = "SidebarNodeStatus";
