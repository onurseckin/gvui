import type { FC } from "react";
import React, { useMemo } from "react";
import type { GraphDataset, NodeStatus } from "../../types/graphData";
import { describeNodeStatus } from "../../primitives/nodes/NodeCard/nodeKinds";

export interface SidebarNodeStatusProps {
  dataset: GraphDataset | null;
}

interface StatusItem {
  status: NodeStatus;
  label: string;
  count: number;
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
}) {
  const statusItems = useMemo(() => {
    if (!dataset || !dataset.nodes || dataset.nodes.length === 0) {
      return [];
    }

    const countMap = new Map<NodeStatus, number>();
    for (const node of dataset.nodes) {
      const status = node.status ?? "pending";
      countMap.set(status, (countMap.get(status) ?? 0) + 1);
    }

    const items: StatusItem[] = [];
    for (const status of ORDERED_STATUSES) {
      const count = countMap.get(status) ?? 0;
      if (count > 0) {
        const desc = describeNodeStatus({ id: "mock", name: "mock", status });
        items.push({
          status,
          label: desc.label,
          count,
        });
      }
    }

    return items;
  }, [dataset]);

  if (statusItems.length === 0) {
    return (
      <div className="sidebar-section" data-testid="sidebar-node-status">
        <h4 className="sidebar-section-title">Active Nodes</h4>
        <p className="sidebar-empty-state">No active nodes</p>
      </div>
    );
  }

  return (
    <div className="sidebar-section" data-testid="sidebar-node-status">
      <h4 className="sidebar-section-title">Node Status</h4>
      <div className="sidebar-status-list">
        {statusItems.map((item) => (
          <div
            key={item.status}
            className={`sidebar-status-item status-${item.status}`}
            data-testid={`status-item-${item.status}`}
          >
            <span className={`status-dot dot-${item.status}`} />
            <span className="status-label">{item.label}</span>
            <span className="status-count" data-testid={`status-count-${item.status}`}>
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

SidebarNodeStatus.displayName = "SidebarNodeStatus";
