import type { FC } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { ErrorInspector } from "./ErrorInspector";
import { RoleReportSection } from "./RoleReportSection";

export interface FindingsTabProps {
  node: GraphNodeData;
}

/**
 * Findings & Pushback tab: this node's own role report — a plan-validator's four answers, a domain
 * validator's checklist framing — ahead of ErrorInspector's generic quality findings, repair rounds,
 * adversarial audit quotes, structured error stack traces, and before/after remediation patches.
 */
export const FindingsTab: FC<FindingsTabProps> = ({ node }) => {
  return (
    <div className="drawer-tab-content">
      <RoleReportSection node={node} />
      <ErrorInspector node={node} />
    </div>
  );
};
