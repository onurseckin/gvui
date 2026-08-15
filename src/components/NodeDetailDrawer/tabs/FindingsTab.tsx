import { IconAlertTriangle, IconCheck, IconShieldCheck } from "@tabler/icons-react";
import type { FC } from "react";
import type { FindingDetail, GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";

interface FindingsTabProps {
  node: GraphNodeData;
}

export const FindingsTab: FC<FindingsTabProps> = ({ node }) => {
  const findings = (node.metadata?.findings ?? []) as FindingDetail[];
  const repairRounds = (node.metadata?.repairRounds as number | undefined) ?? 0;

  if (findings.length === 0 && repairRounds === 0 && node.kind !== "critic") {
    return (
      <div className="drawer-tab-content">
        <p className="drawer-prose" style={{ color: "#71717a", padding: "16px" }}>
          No validation findings or pushback cycles recorded for this node.
        </p>
      </div>
    );
  }

  return (
    <div className="drawer-tab-content">
      {repairRounds > 0 ? (
        <DrawerSection title="Repair History">
          <div className="drawer-metric-grid" style={{ marginBottom: "12px" }}>
            <div className="drawer-metric drawer-metric--warn">
              <span className="drawer-metric-label">Repair Rounds</span>
              <span className="drawer-metric-value">{repairRounds}</span>
            </div>
            <div className="drawer-metric">
              <span className="drawer-metric-label">Findings Recorded</span>
              <span className="drawer-metric-value">{findings.length}</span>
            </div>
          </div>
        </DrawerSection>
      ) : null}

      {findings.length > 0 ? (
        <DrawerSection title="Quality Findings & Pushbacks" count={findings.length}>
          {findings.map((f, index) => (
            <div key={`${f.id}-${index}`} className={`drawer-finding-card severity-${f.severity}`}>
              <div className="drawer-finding-header">
                <span className={`drawer-finding-severity ${f.severity}`}>{f.severity}</span>
                <span
                  style={{
                    fontSize: "11px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                    fontFamily: "var(--font-sans)",
                    color: f.status === "resolved" ? "#34d399" : "#fb923c",
                  }}
                >
                  {f.status === "resolved" ? (
                    <>
                      <IconCheck size={12} />
                      <span>Resolved</span>
                    </>
                  ) : (
                    <>
                      <IconAlertTriangle size={12} />
                      <span>Open</span>
                    </>
                  )}
                </span>
              </div>
              <p className="drawer-prose" style={{ margin: "6px 0", color: "#fafafa" }}>
                {f.observation}
              </p>
              {f.remediation ? (
                <p
                  className="drawer-prose"
                  style={{
                    margin: "4px 0",
                    color: "#a1a1aa",
                    fontSize: "11px",
                  }}
                >
                  <strong>Remediation:</strong> {f.remediation}
                </p>
              ) : null}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#71717a",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  marginTop: "6px",
                }}
              >
                {f.requirementId ? <span>Requirement: {f.requirementId}</span> : <span />}
                <code>{f.id}</code>
              </div>
            </div>
          ))}
        </DrawerSection>
      ) : null}

      {node.kind === "critic" ? (
        <DrawerSection title="Completeness Verification">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#34d399",
              fontSize: "12px",
              fontFamily: "var(--font-sans)",
            }}
          >
            <IconShieldCheck size={16} />
            <span>Whole-Run Completeness Scope Audited</span>
          </div>
        </DrawerSection>
      ) : null}
    </div>
  );
};
