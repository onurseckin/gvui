import type { FC } from "react";
import type { FindingDetail, GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";

interface FindingsTabProps {
  node: GraphNodeData;
}

export const FindingsTab: FC<FindingsTabProps> = ({ node }) => {
  const findings = (node.metadata?.findings ?? []) as FindingDetail[];

  if (findings.length === 0) {
    return (
      <div className="drawer-tab-content">
        <p className="drawer-prose" style={{ color: "#71717a", padding: "16px" }}>
          No validation findings or review issues recorded for this node.
        </p>
      </div>
    );
  }

  return (
    <div className="drawer-tab-content">
      <DrawerSection title="Validation Findings" count={findings.length}>
        {findings.map((f, index) => (
          <div key={`${f.id}-${index}`} className={`drawer-finding-card severity-${f.severity}`}>
            <div className="drawer-finding-header">
              <span className={`drawer-finding-severity ${f.severity}`}>{f.severity}</span>
              <span
                style={{ fontSize: "11px", color: f.status === "resolved" ? "#34d399" : "#fb923c" }}
              >
                {f.status === "resolved" ? "✅ Resolved" : "⚠️ Open"}
              </span>
            </div>
            <p className="drawer-prose" style={{ margin: "6px 0", color: "#fafafa" }}>
              {f.observation}
            </p>
            {f.remediation ? (
              <p
                className="drawer-prose"
                style={{ margin: "4px 0", color: "#a1a1aa", fontSize: "11.5px" }}
              >
                <strong>Remediation:</strong> {f.remediation}
              </p>
            ) : null}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                color: "#71717a",
                fontSize: "10.5px",
                marginTop: "6px",
              }}
            >
              {f.requirementId ? <span>Requirement: {f.requirementId}</span> : <span />}
              <code>{f.id}</code>
            </div>
          </div>
        ))}
      </DrawerSection>
    </div>
  );
};
