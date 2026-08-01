import type { FC } from "react";
import { memo } from "react";
import type { NodeBadge } from "../../../types/graphData";

export interface NodeCardBadgesProps {
  badges?: NodeBadge[];
}

export const NodeCardBadges: FC<NodeCardBadgesProps> = memo(({ badges }) => {
  if (!badges || badges.length === 0) {
    return null;
  }

  return (
    <div className="node-card-badges">
      {badges.map((badge, index) => {
        const variant = badge.variant ?? "gray";
        return (
          <span key={`${badge.label}-${index}`} className={`node-card-badge-pill badge-${variant}`}>
            {badge.label}
          </span>
        );
      })}
    </div>
  );
});

NodeCardBadges.displayName = "NodeCardBadges";
