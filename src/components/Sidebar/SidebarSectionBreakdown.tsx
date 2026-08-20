import type { FC } from "react";
import React, { useMemo } from "react";
import type { GraphDataset } from "../../types/graphData";
import { readSections, UNKNOWN_LABEL, type SectionView } from "../../state/graphSchema";
import { SidebarAccordion } from "./SidebarAccordion";

export interface SidebarSectionBreakdownProps {
  dataset: GraphDataset | null;
  defaultExpanded?: boolean;
}

interface SectionBreakdown {
  sections: SectionView[];
  ungroupedCount: number;
}

/**
 * A region is a part of the canvas that belongs together — a branch excursion in an orchestration
 * run, a theme in an idea map. A reason is owed only where one region hangs off another node, so a
 * plain grouping is not asked for one.
 */
function buildSectionBreakdown(dataset: GraphDataset | null): SectionBreakdown {
  const sections = readSections(dataset);
  const grouped = new Set<string>();
  for (const section of sections) {
    for (const nodeId of section.nodeIds) grouped.add(nodeId);
  }
  const ungroupedCount = (dataset?.nodes ?? []).filter((node) => !grouped.has(node.id)).length;
  return { sections, ungroupedCount };
}

export const SidebarSectionBreakdown: FC<SidebarSectionBreakdownProps> = React.memo(
  function SidebarSectionBreakdown({ dataset, defaultExpanded = true }) {
    const breakdown = useMemo(() => buildSectionBreakdown(dataset), [dataset]);

    if (breakdown.sections.length === 0) {
      return (
        <div className="sidebar-section" data-testid="sidebar-section-breakdown">
          <div className="sidebar-section-header">
            <h4 className="sidebar-section-title">Regions</h4>
          </div>
          <p className="sidebar-empty-state" data-testid="section-breakdown-empty">
            No regions recorded
          </p>
        </div>
      );
    }

    return (
      <SidebarAccordion
        testId="sidebar-section-breakdown"
        title="Regions"
        badge={`${breakdown.sections.length} ${breakdown.sections.length === 1 ? "region" : "regions"}`}
        defaultExpanded={defaultExpanded}
      >
        <div className="sidebar-section-list">
          {breakdown.sections.map((section) => (
            <div
              key={section.id}
              className="sidebar-region-item"
              data-testid={`region-item-${section.id}`}
            >
              <div className="sidebar-region-header">
                <span className="sidebar-region-title" title={section.title}>
                  {section.title}
                </span>
                <span className="sidebar-region-count" data-testid={`region-count-${section.id}`}>
                  {section.nodeIds.length}
                </span>
              </div>
              {section.status ? (
                <div className="sidebar-region-meta">
                  <span className={`sidebar-region-status status-${section.status}`}>
                    {section.status}
                  </span>
                </div>
              ) : null}
              {section.reason !== undefined || section.parentNodeId !== undefined ? (
                <p className="sidebar-region-reason" data-testid={`region-reason-${section.id}`}>
                  {section.reason ?? `Reason ${UNKNOWN_LABEL} — the run recorded none.`}
                </p>
              ) : section.description ? (
                <p
                  className="sidebar-region-reason"
                  data-testid={`region-description-${section.id}`}
                >
                  {section.description}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        {breakdown.ungroupedCount > 0 ? (
          <p className="sidebar-note" data-testid="section-ungrouped-note">
            {breakdown.ungroupedCount} node{breakdown.ungroupedCount === 1 ? "" : "s"} outside every
            region.
          </p>
        ) : null}
      </SidebarAccordion>
    );
  },
);

SidebarSectionBreakdown.displayName = "SidebarSectionBreakdown";
