import type { FC } from "react";
import React, { useMemo } from "react";
import type { GraphDataset } from "../../types/graphData";
import { summarizeReviewActivity } from "../../state/graphSchema";
import { SidebarAccordion } from "./SidebarAccordion";

export interface SidebarReviewRoundsProps {
  dataset: GraphDataset | null;
  defaultExpanded?: boolean;
}

/**
 * Probes and pushbacks are counted and coloured apart on purpose. A probe demands proof and costs
 * the implementer nothing; a pushback asserts a defect. A task that passed after a probe is not a
 * task in trouble, and the sidebar must not imply that it is.
 */
export const SidebarReviewRounds: FC<SidebarReviewRoundsProps> = React.memo(
  function SidebarReviewRounds({ dataset, defaultExpanded = true }) {
    const activity = useMemo(() => summarizeReviewActivity(dataset), [dataset]);

    if (!activity.hasRecord) {
      return (
        <div className="sidebar-section" data-testid="sidebar-review-rounds">
          <div className="sidebar-section-header">
            <h4 className="sidebar-section-title">Review Activity</h4>
          </div>
          <p className="sidebar-empty-state" data-testid="review-rounds-empty">
            No review activity recorded
          </p>
        </div>
      );
    }

    const probeTotal = Math.max(activity.probeRounds, activity.probeEdges);
    const pushbackTotal = Math.max(activity.pushbackRounds, activity.pushbackEdges);

    return (
      <SidebarAccordion
        testId="sidebar-review-rounds"
        title="Review Activity"
        badge={`${probeTotal} probe · ${pushbackTotal} pushback`}
        defaultExpanded={defaultExpanded}
      >
        <div className="sidebar-review-grid">
          <div className="sidebar-review-card review-probe" data-testid="review-card-probe">
            <span className="sidebar-review-label">Adversarial probes</span>
            <span className="sidebar-review-value" data-testid="review-probe-rounds">
              {probeTotal}
            </span>
            <span className="sidebar-review-sub" data-testid="review-probe-detail">
              {activity.probeDemands} proof demand{activity.probeDemands === 1 ? "" : "s"} ·{" "}
              {activity.nodesProbed} node{activity.nodesProbed === 1 ? "" : "s"}
            </span>
            <p className="sidebar-review-note">
              Demands proof. Does not consume the repair budget.
            </p>
          </div>

          <div className="sidebar-review-card review-pushback" data-testid="review-card-pushback">
            <span className="sidebar-review-label">Pushbacks</span>
            <span className="sidebar-review-value" data-testid="review-pushback-rounds">
              {pushbackTotal}
            </span>
            <span className="sidebar-review-sub" data-testid="review-pushback-detail">
              {activity.defects} defect{activity.defects === 1 ? "" : "s"} ·{" "}
              {activity.nodesPushedBack} node{activity.nodesPushedBack === 1 ? "" : "s"}
            </span>
            <p className="sidebar-review-note">Asserts a defect. Consumes a repair round.</p>
          </div>
        </div>
      </SidebarAccordion>
    );
  },
);

SidebarReviewRounds.displayName = "SidebarReviewRounds";
