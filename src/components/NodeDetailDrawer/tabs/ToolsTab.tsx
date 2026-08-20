import { IconTool } from "@tabler/icons-react";
import type { FC } from "react";
import { memo, useMemo } from "react";
import { describeToolCategory } from "../../OpenSchema/vocabulary";
import type { GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { describeEvidence, EvidenceChip } from "../EvidenceChip";
import { readTools, type ToolRow } from "../nodeSchema";

export interface ToolsTabProps {
  node: GraphNodeData;
}

function groupKey(row: ToolRow): string {
  return row.evidenceClass ?? "unlabelled";
}

/**
 * The generic kind of tool, read through the open vocabulary: a preset category, this dataset's own
 * word, or an honest statement that nobody filed the tool under one.
 */
const ToolCategoryChip: FC<{ category?: string }> = ({ category }) => {
  const described = describeToolCategory(category);
  return (
    <span
      className={`tool-row-category ${described.recognized ? "is-preset" : "is-open"}`}
      data-testid="tool-row-category"
      data-recorded={described.recorded ? "yes" : "no"}
      style={{ color: described.accent }}
      title={described.recorded ? undefined : "No category was recorded for this tool"}
    >
      {described.label}
    </span>
  );
};

/**
 * The tools this node's agent was granted or reported using. A tool the host reported and a tool an
 * agent merely claimed are grouped apart, because they are not the same kind of fact.
 */
export const ToolsTab: FC<ToolsTabProps> = memo(function ToolsTab({ node }) {
  const tools = useMemo(() => readTools(node), [node]);

  const groups = useMemo(() => {
    const map = new Map<string, ToolRow[]>();
    for (const row of tools) {
      const key = groupKey(row);
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    return Array.from(map.entries());
  }, [tools]);

  if (tools.length === 0) {
    return (
      <div className="drawer-tab-content" data-testid="tools-tab">
        <div className="drawer-empty-state">No tool usage was recorded for this node.</div>
      </div>
    );
  }

  return (
    <div className="drawer-tab-content" data-testid="tools-tab">
      <DrawerSection title="Tools Used" count={tools.length}>
        {groups.map(([key, rows]) => {
          const descriptor = describeEvidence(rows[0]?.evidenceClass);
          return (
            <div key={key} className="tool-group" data-testid={`tool-group-${key}`}>
              <div className="tool-group-head">
                <span className={descriptor.className} title={descriptor.title}>
                  {descriptor.label}
                </span>
                <span className="tool-group-count">{`${rows.length} tool${rows.length === 1 ? "" : "s"}`}</span>
              </div>
              <ul className="tool-row-list">
                {rows.map((row) => (
                  <li key={row.name} className={`tool-row tool-row--${key}`} data-testid="tool-row">
                    <span className="tool-row-name">
                      <IconTool size={12} />
                      {row.name}
                    </span>
                    <span className="tool-row-meta">
                      <ToolCategoryChip category={row.category} />
                      {row.extras.map((extra) => (
                        <span
                          key={extra.key}
                          className="tool-row-extra"
                          data-testid="tool-row-extra"
                        >{`${extra.key}: ${extra.value}`}</span>
                      ))}
                      {row.type ? <span className="tool-row-type">{row.type}</span> : null}
                      {row.firstReportedAt ? (
                        <span className="tool-row-time">{`first seen ${row.firstReportedAt}`}</span>
                      ) : null}
                      <EvidenceChip evidenceClass={row.evidenceClass} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </DrawerSection>
    </div>
  );
});
