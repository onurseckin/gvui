import type { FC } from "react";
import React, { useMemo, useState, useCallback } from "react";
import { IconBrain, IconCheck, IconCopy, IconDatabase } from "@tabler/icons-react";
import type { GraphDataset, GraphNodeData } from "../../types/graphData";
import { formatCost, formatTokens } from "../../primitives/nodes/NodeCard/nodeCardModel";
import {
  aggregateRecordedCost,
  evidenceLabel,
  readNodeTelemetry,
  readNodeTokenDetail,
  resolveNodeRole,
  roleGroupOf,
  ROLE_GROUP_LABELS,
  ROLE_GROUPS,
  UNKNOWN_LABEL,
  weakestEvidence,
  type EvidenceClass,
  type RoleGroup,
} from "../../state/graphSchema";
import { copyToClipboard } from "../NodeDetailDrawer/streamUtils";
import { SidebarAccordion } from "./SidebarAccordion";
import { EvidenceChip } from "./EvidenceChip";

export interface ExtractedNodeTokens {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  /** False when the node reported no counts at all, so the zeros above mean absence, not usage. */
  reported: boolean;
  costUsd: number;
  /** False when nothing recorded a cost. There is no rate card here to fill the gap with. */
  costRecorded: boolean;
  model: string | undefined;
  tier: string | undefined;
  evidence: EvidenceClass | undefined;
  isEstimated: boolean;
}

export function extractNodeTokenFootprint(node: GraphNodeData): ExtractedNodeTokens {
  const telemetry = readNodeTelemetry(node);
  const detail = readNodeTokenDetail(node);
  const classes: EvidenceClass[] = [];

  const promptTokens = telemetry.tokensIn?.value ?? 0;
  const completionTokens = telemetry.tokensOut?.value ?? 0;
  if (telemetry.tokensIn !== undefined) classes.push(telemetry.tokensIn.evidence_class);
  if (telemetry.tokensOut !== undefined) classes.push(telemetry.tokensOut.evidence_class);

  const reported =
    telemetry.tokensIn !== undefined ||
    telemetry.tokensOut !== undefined ||
    detail.total !== undefined ||
    detail.reasoning !== undefined;

  const reasoningTokens = detail.reasoning ?? 0;
  const cacheReadTokens = detail.cacheRead ?? 0;
  const cacheCreationTokens = detail.cacheWrite ?? 0;
  const totalTokens = detail.total ?? promptTokens + completionTokens + reasoningTokens;

  const metrics = node.metrics;
  const metadataCost = node.metadata?.costUsd;
  const recordedCost =
    typeof metrics?.costUsd === "number" && Number.isFinite(metrics.costUsd)
      ? metrics.costUsd
      : typeof metadataCost === "number" && Number.isFinite(metadataCost)
        ? metadataCost
        : undefined;

  return {
    promptTokens,
    completionTokens,
    reasoningTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens: reported ? totalTokens : 0,
    reported,
    costUsd: recordedCost ?? 0,
    costRecorded: recordedCost !== undefined,
    model: telemetry.model?.value,
    tier: telemetry.modelTier?.value,
    evidence: weakestEvidence(classes),
    isEstimated:
      telemetry.tokensIn?.is_estimated === true || telemetry.tokensOut?.is_estimated === true,
  };
}

export interface RoleTokenShare {
  group: RoleGroup | "unroled";
  label: string;
  totalTokens: number;
  reportingNodes: number;
}

export interface GraphTokenFootprintAnalytics {
  nodesCount: number;
  reportingNodes: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalReasoningTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  /** Absent when no node recorded a cost, which is not the same as a cost of zero. */
  recordedCostUsd: number | undefined;
  costReportingNodes: number;
  evidence: EvidenceClass | undefined;
  hasEstimates: boolean;
  roleShares: RoleTokenShare[];
}

export function calculateGraphTokenFootprint(
  dataset: GraphDataset | null,
): GraphTokenFootprintAnalytics | null {
  if (!dataset || !dataset.nodes || dataset.nodes.length === 0) return null;

  const classes: EvidenceClass[] = [];
  const roleTotals = new Map<RoleGroup | "unroled", { tokens: number; nodes: number }>();

  let totalTokens = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalReasoningTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  let reportingNodes = 0;
  let hasEstimates = false;

  for (const node of dataset.nodes) {
    const extracted = extractNodeTokenFootprint(node);
    if (!extracted.reported) continue;

    reportingNodes += 1;
    totalPromptTokens += extracted.promptTokens;
    totalCompletionTokens += extracted.completionTokens;
    totalReasoningTokens += extracted.reasoningTokens;
    totalCacheCreationTokens += extracted.cacheCreationTokens;
    totalCacheReadTokens += extracted.cacheReadTokens;
    totalTokens += extracted.totalTokens;
    hasEstimates = hasEstimates || extracted.isEstimated;
    if (extracted.evidence !== undefined) classes.push(extracted.evidence);

    const resolved = resolveNodeRole(node);
    const key: RoleGroup | "unroled" =
      resolved === undefined ? "unroled" : roleGroupOf(resolved.role);
    const bucket = roleTotals.get(key) ?? { tokens: 0, nodes: 0 };
    bucket.tokens += extracted.totalTokens;
    bucket.nodes += 1;
    roleTotals.set(key, bucket);
  }

  const roleShares: RoleTokenShare[] = [];
  for (const group of ROLE_GROUPS) {
    const bucket = roleTotals.get(group);
    if (bucket === undefined) continue;
    roleShares.push({
      group,
      label: ROLE_GROUP_LABELS[group],
      totalTokens: bucket.tokens,
      reportingNodes: bucket.nodes,
    });
  }
  const unroled = roleTotals.get("unroled");
  if (unroled !== undefined) {
    roleShares.push({
      group: "unroled",
      label: UNKNOWN_LABEL,
      totalTokens: unroled.tokens,
      reportingNodes: unroled.nodes,
    });
  }

  const cost = aggregateRecordedCost(dataset);

  return {
    nodesCount: dataset.nodes.length,
    reportingNodes,
    totalTokens,
    totalPromptTokens,
    totalCompletionTokens,
    totalReasoningTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    recordedCostUsd: cost?.total,
    costReportingNodes: cost?.reportingNodes ?? 0,
    evidence: weakestEvidence(classes),
    hasEstimates,
    roleShares,
  };
}

export interface TokenFootprintBreakdownProps {
  dataset: GraphDataset | null;
  defaultExpanded?: boolean;
}

/**
 * Graph-level token accounting. It aggregates only over nodes that actually reported counts and
 * carries the weakest evidence class of everything it summed, so a total built from unverified
 * numbers cannot be mistaken for a host-reported one.
 */
export const TokenFootprintBreakdown: FC<TokenFootprintBreakdownProps> = React.memo(
  function TokenFootprintBreakdown({ dataset, defaultExpanded = true }) {
    const [copied, setCopied] = useState(false);
    const analytics = useMemo(() => calculateGraphTokenFootprint(dataset), [dataset]);

    const handleCopySummary = useCallback(async () => {
      if (!analytics) return;
      const lines = [
        "Graph token footprint",
        `Reporting nodes: ${analytics.reportingNodes} of ${analytics.nodesCount}`,
        `Total tokens: ${analytics.totalTokens.toLocaleString()}`,
        `  - Input: ${analytics.totalPromptTokens.toLocaleString()}`,
        `  - Output: ${analytics.totalCompletionTokens.toLocaleString()}`,
        `  - Reasoning: ${analytics.totalReasoningTokens.toLocaleString()}`,
        `  - Cache read: ${analytics.totalCacheReadTokens.toLocaleString()}`,
        `  - Cache write: ${analytics.totalCacheCreationTokens.toLocaleString()}`,
        `Recorded cost: ${
          analytics.recordedCostUsd === undefined
            ? UNKNOWN_LABEL
            : formatCost(analytics.recordedCostUsd)
        }`,
        `Evidence: ${
          analytics.evidence === undefined ? UNKNOWN_LABEL : evidenceLabel(analytics.evidence)
        }${analytics.hasEstimates ? " (contains estimates)" : ""}`,
      ];
      if (await copyToClipboard(lines.join("\n"))) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }, [analytics]);

    if (!analytics) {
      return (
        <div className="sidebar-section" data-testid="token-footprint-breakdown">
          <div className="sidebar-section-header">
            <h4 className="sidebar-section-title">Token Footprint</h4>
          </div>
          <p className="sidebar-empty-state">No graph loaded</p>
        </div>
      );
    }

    if (analytics.reportingNodes === 0) {
      return (
        <div className="sidebar-section" data-testid="token-footprint-breakdown">
          <div className="sidebar-section-header">
            <h4 className="sidebar-section-title">Token Footprint</h4>
            <span className="sidebar-section-badge">{UNKNOWN_LABEL}</span>
          </div>
          <p className="sidebar-empty-state" data-testid="token-footprint-unreported">
            No node reported token usage. This run has no token data — not zero tokens.
          </p>
        </div>
      );
    }

    const {
      totalTokens,
      totalPromptTokens,
      totalCompletionTokens,
      totalReasoningTokens,
      totalCacheCreationTokens,
      totalCacheReadTokens,
      recordedCostUsd,
    } = analytics;

    const share = (value: number) => (totalTokens > 0 ? (value / totalTokens) * 100 : 0);
    const promptPct = share(totalPromptTokens);
    const completionPct = share(totalCompletionTokens);
    const reasoningPct = share(totalReasoningTokens);

    return (
      <SidebarAccordion
        testId="token-footprint-breakdown"
        title="Token Footprint"
        badge={formatTokens(totalTokens)}
        defaultExpanded={defaultExpanded}
      >
        <div className="token-coverage-row">
          <span className="token-coverage-text" data-testid="token-footprint-coverage">
            {analytics.reportingNodes} of {analytics.nodesCount} nodes reported usage
          </span>
          {analytics.evidence === undefined ? null : (
            <EvidenceChip evidence={analytics.evidence} isEstimated={analytics.hasEstimates} />
          )}
          <button
            type="button"
            className="token-copy-btn"
            onClick={() => void handleCopySummary()}
            title="Copy token summary to clipboard"
            aria-label="Copy token footprint summary"
            data-testid="copy-token-summary-btn"
          >
            {copied ? <IconCheck size={12} color="#10b981" /> : <IconCopy size={12} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>

        <div className="token-distribution-bar">
          {promptPct > 0 && (
            <div className="token-bar-segment segment-prompt" style={{ width: `${promptPct}%` }} />
          )}
          {completionPct > 0 && (
            <div
              className="token-bar-segment segment-completion"
              style={{ width: `${completionPct}%` }}
            />
          )}
          {reasoningPct > 0 && (
            <div
              className="token-bar-segment segment-reasoning"
              style={{ width: `${reasoningPct}%` }}
            />
          )}
        </div>

        <div className="token-detail-list">
          <div className="token-detail-row">
            <div className="token-detail-label-group">
              <span className="token-dot dot-prompt" />
              <span className="token-detail-name">Input</span>
            </div>
            <span className="token-detail-val" data-testid="token-footprint-input-tokens">
              {formatTokens(totalPromptTokens)}
            </span>
          </div>

          <div className="token-detail-row">
            <div className="token-detail-label-group">
              <span className="token-dot dot-completion" />
              <span className="token-detail-name">Output</span>
            </div>
            <span className="token-detail-val" data-testid="token-footprint-output-tokens">
              {formatTokens(totalCompletionTokens)}
            </span>
          </div>

          {totalReasoningTokens > 0 && (
            <div className="token-detail-row">
              <div className="token-detail-label-group">
                <span className="token-dot dot-reasoning" />
                <span className="token-detail-name">
                  <IconBrain size={11} className="inline-icon" /> Reasoning
                </span>
              </div>
              <span className="token-detail-val" data-testid="token-footprint-reasoning-tokens">
                {formatTokens(totalReasoningTokens)}
              </span>
            </div>
          )}

          {totalCacheReadTokens + totalCacheCreationTokens > 0 && (
            <div className="token-detail-row">
              <div className="token-detail-label-group">
                <span className="token-dot dot-cache" />
                <span className="token-detail-name">
                  <IconDatabase size={11} className="inline-icon" /> Cache
                </span>
              </div>
              <span className="token-detail-val" data-testid="token-footprint-cache-tokens">
                {formatTokens(totalCacheReadTokens + totalCacheCreationTokens)}
              </span>
            </div>
          )}

          <div className={`token-detail-row ${recordedCostUsd === undefined ? "is-unknown" : ""}`}>
            <div className="token-detail-label-group">
              <span className="token-detail-name">Recorded cost</span>
            </div>
            <span className="token-detail-val" data-testid="token-footprint-total-cost">
              {recordedCostUsd === undefined ? UNKNOWN_LABEL : formatCost(recordedCostUsd)}
            </span>
          </div>
        </div>

        <div className="token-role-list" data-testid="token-role-shares">
          {analytics.roleShares.map((entry) => (
            <div
              key={entry.group}
              className="token-role-row"
              data-testid={`token-role-${entry.group}`}
            >
              <span className="token-role-label">{entry.label}</span>
              <span className="token-role-bar-track">
                <span
                  className={`token-role-bar-fill role-${entry.group}`}
                  style={{ width: `${Math.min(100, share(entry.totalTokens))}%` }}
                />
              </span>
              <span className="token-role-value">{formatTokens(entry.totalTokens)}</span>
            </div>
          ))}
        </div>
      </SidebarAccordion>
    );
  },
);

TokenFootprintBreakdown.displayName = "TokenFootprintBreakdown";
