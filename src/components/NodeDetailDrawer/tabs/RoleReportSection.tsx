import type { FC } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { UnknownValue } from "../EvidenceChip";
import { readAssets, readBrowserTests, readScripts } from "../nodeSchema";
import {
  describeValidatorDomain,
  readPlanValidatorReview,
  readValidatorDomain,
  type PlanFindingRow,
} from "../roleReportSchema";

const PLAN_FINDING_SEVERITY_COLOR: Readonly<Record<string, string>> = {
  critical: "#f87171",
  important: "#fbbf24",
  minor: "#a1a1aa",
};

/**
 * A plan-level finding rendered on its own terms: id, the invariant it names (when the validator
 * named one), severity, observation and remediation. It never borrows the task-finding card, which
 * expects a requirement id, an evidence array and a status this shape does not carry.
 */
const PlanFindingCard: FC<{ finding: PlanFindingRow }> = ({ finding }) => {
  const color = PLAN_FINDING_SEVERITY_COLOR[finding.severity ?? ""] ?? "#a1a1aa";
  return (
    <div
      className="drawer-plan-finding"
      style={{
        border: "1px solid #27272a",
        borderRadius: 6,
        padding: 10,
        marginBottom: 8,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <code style={{ fontSize: 11, color: "#a1a1aa", fontFamily: "var(--font-mono)" }}>
          {finding.id}
        </code>
        {finding.severity ? (
          <span
            style={{
              fontSize: 10.5,
              color,
              border: `1px solid ${color}`,
              borderRadius: 3,
              padding: "1px 5px",
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            {finding.severity}
          </span>
        ) : null}
        {finding.invariant ? <span className="drawer-chip">{finding.invariant}</span> : null}
      </div>
      <p className="drawer-prose" style={{ marginTop: 6 }}>
        {finding.observation ?? <UnknownValue what="Observation" />}
      </p>
      {finding.remediation ? (
        <p className="drawer-prose" style={{ color: "#a1a1aa", marginTop: 4 }}>
          Remediation: {finding.remediation}
        </p>
      ) : null}
    </div>
  );
};

/**
 * The plan-validator's own report: graph revision, verdict, the four mandatory questions answered
 * in writing every round, and any plan-shaped findings — never the task-review layout, because a
 * plan review judges the decomposition, not a diff.
 */
const PlanValidatorReport: FC<{ node: GraphNodeData }> = ({ node }) => {
  const review = readPlanValidatorReview(node);
  if (!review) return null;
  return (
    <>
      <DrawerSection title="Plan Validation">
        <ul className="drawer-kv-list">
          {review.graphRevision !== undefined ? (
            <li className="drawer-kv-row">
              <span className="drawer-kv-key">Graph revision</span>
              <span className="drawer-kv-value">{review.graphRevision}</span>
            </li>
          ) : null}
          <li className="drawer-kv-row">
            <span className="drawer-kv-key">Verdict</span>
            <span className="drawer-kv-value">
              {review.verdict ?? <UnknownValue what="Verdict" />}
            </span>
          </li>
        </ul>
        {review.answers.map((answer) => (
          <div key={answer.label} style={{ marginTop: 10 }}>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: 0.4,
                color: "#a1a1aa",
              }}
            >
              {answer.label}
            </div>
            <p className="drawer-prose">
              {answer.text ?? <UnknownValue what={`${answer.label} answer`} />}
            </p>
          </div>
        ))}
      </DrawerSection>
      {review.findings.length > 0 ? (
        <DrawerSection title="Plan Findings" count={review.findings.length}>
          {review.findings.map((finding) => (
            <PlanFindingCard key={finding.id} finding={finding} />
          ))}
        </DrawerSection>
      ) : null}
    </>
  );
};

/**
 * The domain validator's report: which of the five standing checklist domains this run drew, in the
 * role contract's own framing, plus the one evidence signal that domain's role contract actually
 * asks it to produce — a gate command's exit code, a screenshot count, a severity floor — read off
 * data this node already carries rather than a duplicate copy invented for this section.
 */
const DomainValidatorReport: FC<{ node: GraphNodeData }> = ({ node }) => {
  const domain = readValidatorDomain(node);
  const profile = describeValidatorDomain(domain);
  if (!domain || !profile) return null;

  const findings = node.metadata?.findings ?? [];
  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  const screenshotCount = readAssets(node).filter((asset) => asset.type === "image").length;
  const browserRunCount = readBrowserTests(node).length;
  const scripts = readScripts(node);
  const failingScripts = scripts.filter(
    (script) => script.exitCode !== null && script.exitCode !== 0,
  ).length;

  return (
    <DrawerSection title={`${profile.title} Validation`}>
      <p className="drawer-prose">{profile.tagline}</p>
      <ul className="drawer-kv-list">
        {domain === "ui-design" ? (
          <>
            <li className="drawer-kv-row">
              <span className="drawer-kv-key">Screenshots recorded</span>
              <span className="drawer-kv-value">
                {screenshotCount > 0 ? (
                  screenshotCount
                ) : (
                  <UnknownValue what="Screenshot evidence" />
                )}
              </span>
            </li>
            <li className="drawer-kv-row">
              <span className="drawer-kv-key">Browser runs recorded</span>
              <span className="drawer-kv-value">
                {browserRunCount > 0 ? (
                  browserRunCount
                ) : (
                  <UnknownValue what="Browser run evidence" />
                )}
              </span>
            </li>
          </>
        ) : null}
        {domain === "code-quality" ? (
          <li className="drawer-kv-row">
            <span className="drawer-kv-key">Gate commands recorded</span>
            <span className="drawer-kv-value">
              {scripts.length > 0 ? (
                `${scripts.length} (${failingScripts} failing)`
              ) : (
                <UnknownValue what="Gate command evidence" />
              )}
            </span>
          </li>
        ) : null}
        {domain === "security" ? (
          <li className="drawer-kv-row">
            <span className="drawer-kv-key">Findings by severity</span>
            <span className="drawer-kv-value">
              {findings.length > 0 ? (
                `${criticalCount} critical of ${findings.length} total`
              ) : (
                <UnknownValue what="Security finding evidence" />
              )}
            </span>
          </li>
        ) : null}
      </ul>
    </DrawerSection>
  );
};

export interface RoleReportSectionProps {
  node: GraphNodeData;
}

/**
 * What this node's role actually produced, before the generic findings inspector below it. A
 * plan-validator and a domain validator check different things with different evidence, so each
 * gets its own report shape here rather than one shared summary neither fits.
 */
export const RoleReportSection: FC<RoleReportSectionProps> = ({ node }) => {
  return (
    <>
      <PlanValidatorReport node={node} />
      <DomainValidatorReport node={node} />
    </>
  );
};
