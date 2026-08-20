import type { FC } from "react";
import React, { useMemo } from "react";
import type { GraphDataset } from "../../types/graphData";
import { indexGenericFields, summarizeValue } from "../OpenSchema";
import { SidebarAccordion } from "./SidebarAccordion";

export interface SidebarNodePropertiesProps {
  dataset: GraphDataset | null;
  defaultExpanded?: boolean;
}

/**
 * The fields this graph's nodes carry that no purpose-built view claims. It is how someone opening
 * an unfamiliar graph finds out what is actually in it, and it is the index for the node drawer's
 * Properties tab, where each of these is rendered in full.
 */
export const SidebarNodeProperties: FC<SidebarNodePropertiesProps> = React.memo(
  function SidebarNodeProperties({ dataset, defaultExpanded = true }) {
    const entries = useMemo(() => indexGenericFields(dataset?.nodes ?? []), [dataset]);

    if (entries.length === 0) {
      return (
        <div className="sidebar-section" data-testid="sidebar-node-properties">
          <div className="sidebar-section-header">
            <h4 className="sidebar-section-title">Other Node Fields</h4>
          </div>
          <p className="sidebar-empty-state" data-testid="node-properties-empty">
            Every field these nodes carry has a dedicated view
          </p>
        </div>
      );
    }

    return (
      <SidebarAccordion
        testId="sidebar-node-properties"
        title="Other Node Fields"
        badge={`${entries.length} ${entries.length === 1 ? "field" : "fields"}`}
        defaultExpanded={defaultExpanded}
      >
        <ul className="sidebar-property-list">
          {entries.map((entry) => (
            <li
              key={`${entry.scope}-${entry.key}`}
              className="sidebar-property-item"
              data-testid={`node-property-${entry.key}`}
            >
              <span className="sidebar-property-key" title={`${entry.scope}.${entry.key}`}>
                {entry.key}
              </span>
              <span className="sidebar-property-shape">{summarizeValue(entry.sample)}</span>
              <span
                className="sidebar-property-count"
                data-testid={`node-property-count-${entry.key}`}
              >
                {entry.nodeCount}
              </span>
            </li>
          ))}
        </ul>
        <p className="sidebar-note">Open a node to see these expanded under Properties.</p>
      </SidebarAccordion>
    );
  },
);

SidebarNodeProperties.displayName = "SidebarNodeProperties";
