import type { FC } from "react";
import {
  IconTopologyStarRing3,
  IconCpu,
  IconCoin,
  IconGauge,
  IconShieldSearch,
} from "@tabler/icons-react";
import type { AnomalyCategory } from "../../engine/anomaly/types";
import type { AnomalyCategoryDistributionProps } from "./types";

interface CategoryMeta {
  key: AnomalyCategory;
  label: string;
  Icon: typeof IconTopologyStarRing3;
}

const CATEGORIES: CategoryMeta[] = [
  { key: "topology", label: "Topology", Icon: IconTopologyStarRing3 },
  { key: "execution", label: "Execution", Icon: IconCpu },
  { key: "resource", label: "Tokens & Cost", Icon: IconCoin },
  { key: "performance", label: "Latency", Icon: IconGauge },
  { key: "quality", label: "Contract & Audit", Icon: IconShieldSearch },
];

export const AnomalyCategoryDistribution: FC<AnomalyCategoryDistributionProps> = ({
  categoryCounts,
  selectedCategories,
  onToggleCategory,
}) => {
  return (
    <div className="gvui-anomaly-category-distribution" data-testid="anomaly-category-distribution">
      <div className="category-chips-row">
        {CATEGORIES.map(({ key, label, Icon }) => {
          const count = categoryCounts[key] || 0;
          const isSelected = selectedCategories.includes(key);

          return (
            <button
              key={key}
              type="button"
              className={`category-chip ${isSelected ? "active" : ""} ${count > 0 ? "has-anomalies" : ""}`}
              onClick={() => onToggleCategory(key)}
              title={`Filter by ${label} (${count} anomalies)`}
              data-testid={`category-chip-${key}`}
            >
              <Icon size={16} className="category-chip-icon" />
              <span className="category-chip-label">{label}</span>
              <span className="category-chip-count">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
