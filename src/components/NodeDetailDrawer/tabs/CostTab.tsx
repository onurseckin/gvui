import { IconAlertTriangle, IconCheck, IconCopy, IconSearch } from "@tabler/icons-react";
import type { FC } from "react";
import React, { useCallback, useMemo, useState } from "react";
import type { GraphDataset, GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { EvidenceChip, UnknownValue } from "../EvidenceChip";
import { readTelemetry, readTokenFootprint, type TokenFootprint } from "../nodeSchema";
import { copyToClipboard, formatTokens } from "../streamUtils";

export interface CostTabProps {
  node: GraphNodeData;
  dataset?: GraphDataset | null;
  onSelectNode?: (nodeId: string) => void;
}

export function formatDetailedUsd(usd: number, highPrecision = false): string {
  if (typeof usd !== "number" || !Number.isFinite(usd) || Number.isNaN(usd) || usd <= 0) {
    return "$0.00";
  }
  if (highPrecision) {
    if (usd >= 100) return `$${usd.toFixed(2)}`;
    if (usd >= 1) return `$${usd.toFixed(4)}`;
    if (usd >= 0.0001) return `$${usd.toFixed(5)}`;
    return `$${usd.toFixed(6)}`;
  }
  if (usd >= 100) return `$${usd.toFixed(2)}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  if (usd >= 0.01) return `$${usd.toFixed(3)}`;
  if (usd >= 0.0001) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(5)}`;
}

interface TokenSlice {
  key: string;
  testId: string;
  label: string;
  dotClass: string;
  segmentClass: string;
  value?: number;
}

function tokenSlices(footprint: TokenFootprint): TokenSlice[] {
  return [
    {
      key: "prompt",
      testId: "metric-prompt-tokens",
      label: "Input / Prompt",
      dotClass: "dot-prompt",
      segmentClass: "seg-prompt",
      value: footprint.inputTokens,
    },
    {
      key: "completion",
      testId: "metric-completion-tokens",
      label: "Output / Gen",
      dotClass: "dot-completion",
      segmentClass: "seg-completion",
      value: footprint.outputTokens,
    },
    {
      key: "reasoning",
      testId: "metric-reasoning-tokens",
      label: "Reasoning",
      dotClass: "dot-reasoning",
      segmentClass: "seg-reasoning",
      value: footprint.reasoningTokens,
    },
    {
      key: "cache-read",
      testId: "metric-cache-read-tokens",
      label: "Cache Read (Hit)",
      dotClass: "dot-cache",
      segmentClass: "seg-cache",
      value: footprint.cacheReadTokens,
    },
    {
      key: "cache-write",
      testId: "metric-cache-write-tokens",
      label: "Cache Creation",
      dotClass: "dot-cache-write",
      segmentClass: "seg-cache",
      value: footprint.cacheCreationTokens,
    },
  ];
}

/**
 * Token and cost view. Nothing here is priced: a dollar figure appears only when the run recorded
 * one, because a cost computed from a price list is a guess wearing a measurement's clothes.
 */
export const CostTab: FC<CostTabProps> = React.memo(function CostTab({
  node,
  dataset,
  onSelectNode: _onSelectNode,
}) {
  const [copied, setCopied] = useState(false);
  const [highPrecision, setHighPrecision] = useState(false);

  const footprint = useMemo(() => readTokenFootprint(node), [node]);
  const telemetry = useMemo(() => readTelemetry(node), [node]);
  const slices = useMemo(() => tokenSlices(footprint), [footprint]);

  const graphAnalytics = useMemo(() => {
    const nodes = dataset?.nodes ?? [];
    if (nodes.length === 0) return null;

    let totalTokens = 0;
    let tokenReporters = 0;
    let totalCost = 0;
    let costReporters = 0;
    const costs: Array<{ id: string; cost: number }> = [];

    for (const candidate of nodes) {
      const other = readTokenFootprint(candidate);
      if (other.totalTokens !== undefined) {
        totalTokens += other.totalTokens;
        tokenReporters += 1;
      }
      if (other.costUsd !== undefined) {
        totalCost += other.costUsd;
        costReporters += 1;
        costs.push({ id: candidate.id, cost: other.costUsd });
      }
    }

    costs.sort((left, right) => right.cost - left.cost);
    const rank = costs.findIndex((entry) => entry.id === node.id) + 1;

    return {
      totalTokens,
      tokenReporters,
      totalCost,
      costReporters,
      rank: rank > 0 ? rank : null,
      totalNodes: nodes.length,
      tokenSharePercent:
        totalTokens > 0 && footprint.totalTokens !== undefined
          ? (footprint.totalTokens / totalTokens) * 100
          : null,
      costSharePercent:
        totalCost > 0 && footprint.costUsd !== undefined
          ? (footprint.costUsd / totalCost) * 100
          : null,
    };
  }, [dataset, node.id, footprint.totalTokens, footprint.costUsd]);

  // A round nobody recorded is not a round of zero: the producer writes these counters explicitly,
  // so their absence means the run never reported them and the view has to say exactly that.
  const repairRounds = useMemo<number | undefined>(() => {
    const fromMetadata = node.metadata?.repairRounds;
    if (typeof fromMetadata === "number") return fromMetadata;
    return typeof node.metrics?.repairRounds === "number" ? node.metrics.repairRounds : undefined;
  }, [node]);

  const probeRounds = useMemo<number | undefined>(() => {
    const value = node.metadata?.probeRounds;
    return typeof value === "number" ? value : undefined;
  }, [node]);

  const handleCopySummary = useCallback(async () => {
    const lines = [
      `Node Token Footprint: ${node.name} (${node.id})`,
      `Provider: ${telemetry.provider?.value ?? "unknown"}`,
      `Model: ${telemetry.model?.value ?? "unknown"}`,
      `Tier: ${telemetry.modelTier?.value ?? "unknown"}`,
      `Cost: ${footprint.costUsd === undefined ? "not recorded" : formatDetailedUsd(footprint.costUsd, true)}`,
      `Total Tokens: ${footprint.totalTokens === undefined ? "unknown" : footprint.totalTokens.toLocaleString()}${footprint.isEstimated ? " (estimated)" : ""}`,
    ];
    for (const slice of slices) {
      lines.push(
        `  - ${slice.label}: ${slice.value === undefined ? "unknown" : slice.value.toLocaleString()}`,
      );
    }
    const success = await copyToClipboard(lines.join("\n"));
    if (!success) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [node.name, node.id, telemetry, footprint, slices]);

  const totalForBar = slices.reduce((sum, slice) => sum + (slice.value ?? 0), 0);

  return (
    <div className="drawer-tab-content cost-tab-content" data-testid="cost-tab">
      <div className="cost-overview-header" data-testid="cost-overview-header">
        <div className="cost-header-main">
          <div className="cost-hero-value-group">
            <span className="cost-hero-label">Recorded Cost &bull; {node.name}</span>
            <div className="cost-hero-amount-row">
              <span className="cost-hero-amount" data-testid="node-cost-usd">
                {footprint.costUsd === undefined ? (
                  <span className="cost-not-recorded" data-testid="cost-not-recorded">
                    no cost recorded
                  </span>
                ) : (
                  formatDetailedUsd(footprint.costUsd, highPrecision)
                )}
              </span>
              {footprint.costUsd !== undefined ? (
                <button
                  type="button"
                  className="cost-precision-toggle"
                  onClick={() => setHighPrecision((prev) => !prev)}
                  title="Toggle precision decimals"
                  aria-label="Toggle currency precision"
                >
                  {highPrecision ? "4-dec" : "2-dec"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="cost-header-actions">
            <button
              type="button"
              className="cost-copy-btn"
              onClick={handleCopySummary}
              title="Copy token footprint to clipboard"
              aria-label="Copy token summary"
              data-testid="copy-node-cost-btn"
            >
              {copied ? <IconCheck size={14} color="#10b981" /> : <IconCopy size={14} />}
              <span>{copied ? "Copied" : "Copy Report"}</span>
            </button>
          </div>
        </div>

        <div className="cost-header-meta-chips">
          <div className="cost-meta-chip">
            <span className="chip-label">Provider:</span>
            {telemetry.provider ? (
              <span className="chip-value" data-testid="node-provider">
                {telemetry.provider.value}
              </span>
            ) : (
              <UnknownValue what="Provider" />
            )}
            {telemetry.provider ? (
              <EvidenceChip
                evidenceClass={telemetry.provider.evidenceClass}
                isEstimated={telemetry.provider.isEstimated}
              />
            ) : null}
          </div>

          <div className="cost-meta-chip">
            <span className="chip-label">Model:</span>
            {telemetry.model ? (
              <span className="chip-value" title={telemetry.model.value}>
                {telemetry.model.value}
              </span>
            ) : (
              <UnknownValue what="Model" />
            )}
            {telemetry.model ? (
              <EvidenceChip
                evidenceClass={telemetry.model.evidenceClass}
                isEstimated={telemetry.model.isEstimated}
              />
            ) : null}
          </div>

          <div className="cost-meta-chip">
            <span className="chip-label">Tier:</span>
            {telemetry.modelTier ? (
              <span className={`model-tier-chip tier-${telemetry.modelTier.value.toLowerCase()}`}>
                {telemetry.modelTier.value.toUpperCase()}
              </span>
            ) : (
              <UnknownValue what="Tier" />
            )}
          </div>

          <div className="cost-meta-chip">
            <span className="chip-label">Context Window:</span>
            {telemetry.contextWindow ? (
              <span className="chip-value" data-testid="node-context-window">
                {formatTokens(telemetry.contextWindow.value)}
              </span>
            ) : (
              <UnknownValue what="Context window" />
            )}
            {telemetry.contextWindow ? (
              <EvidenceChip
                evidenceClass={telemetry.contextWindow.evidenceClass}
                isEstimated={telemetry.contextWindow.isEstimated}
              />
            ) : null}
          </div>

          <div className="cost-meta-chip">
            <span className="chip-label">Tokens:</span>
            <span className="chip-value" data-testid="node-total-tokens">
              {footprint.totalTokens === undefined ? (
                <UnknownValue what="Token count" />
              ) : (
                formatTokens(footprint.totalTokens)
              )}
            </span>
            {footprint.totalTokens !== undefined ? (
              <EvidenceChip
                evidenceClass={footprint.evidenceClass}
                isEstimated={footprint.isEstimated}
              />
            ) : null}
          </div>

          {graphAnalytics?.tokenSharePercent !== null &&
          graphAnalytics?.tokenSharePercent !== undefined ? (
            <div className="cost-meta-chip">
              <span className="chip-label">Token Share:</span>
              <span className="chip-value">
                {`${graphAnalytics.tokenSharePercent.toFixed(1)}% of ${graphAnalytics.tokenReporters} reporting nodes`}
              </span>
            </div>
          ) : null}

          {graphAnalytics?.rank !== null && graphAnalytics?.rank !== undefined ? (
            <div className="cost-meta-chip">
              <span className="chip-label">Cost Rank:</span>
              <span className="chip-value text-accent">
                {`#${graphAnalytics.rank} of ${graphAnalytics.costReporters} nodes reporting cost`}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      <DrawerSection title="Token Footprint Breakdown">
        {totalForBar > 0 ? (
          <div className="cost-distribution-track">
            {slices
              .filter((slice) => (slice.value ?? 0) > 0)
              .map((slice) => (
                <div
                  key={slice.key}
                  className={`cost-bar-seg ${slice.segmentClass}`}
                  style={{ width: `${((slice.value ?? 0) / totalForBar) * 100}%` }}
                />
              ))}
          </div>
        ) : null}

        <div className="drawer-metric-grid cost-metrics-grid">
          {slices.map((slice) => (
            <div key={slice.key} className="drawer-metric" data-testid={slice.testId}>
              <div className="cost-metric-label-row">
                <span className={`token-dot ${slice.dotClass}`} />
                <span className="drawer-metric-label">{slice.label}</span>
              </div>
              <span className="drawer-metric-value">
                {slice.value === undefined ? (
                  <UnknownValue what={slice.label} />
                ) : (
                  slice.value.toLocaleString()
                )}
              </span>
              <span className="cost-metric-subtext">
                {slice.value === undefined
                  ? "never reported"
                  : `${formatTokens(slice.value)}${totalForBar > 0 ? ` (${((slice.value / totalForBar) * 100).toFixed(1)}%)` : ""}`}
              </span>
            </div>
          ))}
        </div>

        {footprint.isEstimated ? (
          <p className="cost-estimate-banner" data-testid="cost-estimate-banner">
            These counts are an estimate the run derived, not a host-reported measurement.
          </p>
        ) : null}
      </DrawerSection>

      {footprint.otherCounters.length > 0 ? (
        <DrawerSection title="Other Counters Reported" count={footprint.otherCounters.length}>
          <div className="drawer-metric-grid">
            {footprint.otherCounters.map((counter) => (
              <div className="drawer-metric" data-testid="other-counter" key={counter.name}>
                <span className="drawer-metric-label">{counter.name}</span>
                <span className="drawer-metric-value">
                  {formatTokens(counter.value)}
                  <EvidenceChip
                    evidenceClass={counter.evidenceClass}
                    isEstimated={counter.isEstimated}
                  />
                </span>
              </div>
            ))}
          </div>
        </DrawerSection>
      ) : null}

      <DrawerSection title="Rounds Recorded">
        <div className="drawer-metric-grid">
          <div className="drawer-metric" data-testid="metric-probe-rounds">
            <div className="cost-metric-label-row">
              <IconSearch size={11} />
              <span className="drawer-metric-label">Probe Rounds</span>
            </div>
            <span className="drawer-metric-value">
              {probeRounds === undefined ? <UnknownValue what="Probe rounds" /> : probeRounds}
            </span>
            <span className="cost-metric-subtext">
              {probeRounds === undefined
                ? "never recorded for this node"
                : "proof demanded, no defect asserted"}
            </span>
          </div>
          <div
            className={`drawer-metric ${repairRounds !== undefined && repairRounds > 0 ? "drawer-metric--warn" : ""}`}
            data-testid="metric-repair-rounds"
          >
            <div className="cost-metric-label-row">
              <IconAlertTriangle size={11} />
              <span className="drawer-metric-label">Repair Rounds</span>
            </div>
            <span className="drawer-metric-value">
              {repairRounds === undefined ? <UnknownValue what="Repair rounds" /> : repairRounds}
            </span>
            <span className="cost-metric-subtext">
              {repairRounds === undefined
                ? "never recorded for this node"
                : "defects sent back for repair"}
            </span>
          </div>
        </div>
      </DrawerSection>
    </div>
  );
});

CostTab.displayName = "CostTab";
