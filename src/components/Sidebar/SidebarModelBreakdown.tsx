import type { FC } from "react";
import React, { useMemo } from "react";
import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import { resolveModelTier } from "../../primitives/nodes/NodeCard/nodeKinds";

export interface SidebarModelBreakdownProps {
  dataset: GraphDataset | null;
}

interface ModelItem {
  model: string;
  count: number;
  tier?: string;
}

function resolveNodeModel(node: GraphNodeData): { name: string; tier?: string } {
  const directModel = node.model?.trim();
  if (directModel) {
    return { name: directModel, tier: resolveModelTier(node) };
  }

  const harnessModel = node.harnessModel?.trim();
  if (harnessModel) {
    return { name: harnessModel, tier: resolveModelTier({ ...node, model: harnessModel }) };
  }

  const metaModel = (node.metadata?.model as string | undefined)?.trim();
  if (metaModel) {
    return { name: metaModel, tier: resolveModelTier({ ...node, model: metaModel }) };
  }

  const hostAgentModel =
    (node.metadata?.hostAgent as { model?: string } | undefined)?.model?.trim() ??
    (node.hostAgent as { model?: string } | undefined)?.model?.trim();
  if (hostAgentModel) {
    return { name: hostAgentModel, tier: resolveModelTier({ ...node, model: hostAgentModel }) };
  }

  return { name: "Unspecified" };
}

export const SidebarModelBreakdown: FC<SidebarModelBreakdownProps> = React.memo(
  function SidebarModelBreakdown({ dataset }) {
    const models = useMemo(() => {
      if (!dataset || !dataset.nodes || dataset.nodes.length === 0) {
        return [];
      }

      const countMap = new Map<string, number>();
      const tierMap = new Map<string, string | undefined>();

      for (const node of dataset.nodes) {
        const { name, tier } = resolveNodeModel(node);
        countMap.set(name, (countMap.get(name) ?? 0) + 1);
        if (tier && !tierMap.has(name)) {
          tierMap.set(name, tier);
        }
      }

      const items: ModelItem[] = [];
      for (const [model, count] of countMap.entries()) {
        items.push({
          model,
          count,
          tier: tierMap.get(model),
        });
      }

      return items.sort((a, b) => {
        // Place Unspecified at the end if counts are equal, else sort by count descending
        if (a.model === "Unspecified" && b.model !== "Unspecified") return 1;
        if (b.model === "Unspecified" && a.model !== "Unspecified") return -1;
        return b.count - a.count || a.model.localeCompare(b.model);
      });
    }, [dataset]);

    if (models.length === 0) {
      return (
        <div className="sidebar-section" data-testid="sidebar-model-breakdown">
          <h4 className="sidebar-section-title">Model Breakdown</h4>
          <p className="sidebar-empty-state">No model telemetry available</p>
        </div>
      );
    }

    return (
      <div className="sidebar-section" data-testid="sidebar-model-breakdown">
        <h4 className="sidebar-section-title">Model Breakdown</h4>
        <div className="sidebar-model-list">
          {models.map((item) => (
            <div
              key={item.model}
              className="sidebar-model-item"
              data-testid={`model-item-${item.model}`}
            >
              <div className="model-info">
                <span className="model-name" title={item.model}>
                  {item.model}
                </span>
                {item.tier ? (
                  <span className={`model-tier-chip tier-${item.tier}`}>{item.tier}</span>
                ) : null}
              </div>
              <span className="model-count-badge" data-testid={`model-count-${item.model}`}>
                {item.count}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  },
);

SidebarModelBreakdown.displayName = "SidebarModelBreakdown";
