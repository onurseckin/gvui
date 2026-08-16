import type { FC } from "react";
import React, { useMemo, useState, useCallback } from "react";
import { IconCheck, IconCopy, IconRefresh, IconSparkles } from "@tabler/icons-react";
import type { GraphDataset, GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import {
  extractNodeTokenFootprint,
  TIER_PRICING,
  type ExtractedNodeTokens,
} from "../../Sidebar/TokenFootprintBreakdown";
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

export const CostTab: FC<CostTabProps> = React.memo(function CostTab({
  node,
  dataset,
  onSelectNode: _onSelectNode,
}) {
  const [copied, setCopied] = useState(false);
  const [highPrecision, setHighPrecision] = useState(false);

  const tokens = useMemo<ExtractedNodeTokens>(() => extractNodeTokenFootprint(node), [node]);

  // Graph-level context
  const graphAnalytics = useMemo(() => {
    if (!dataset || !dataset.nodes || dataset.nodes.length === 0) return null;
    let totalGraphCost = 0;
    let totalGraphTokens = 0;
    const nodeCosts: { id: string; cost: number }[] = [];

    for (const n of dataset.nodes) {
      const ext = extractNodeTokenFootprint(n);
      totalGraphCost += ext.costUsd;
      totalGraphTokens += ext.totalTokens;
      nodeCosts.push({ id: n.id, cost: ext.costUsd });
    }

    nodeCosts.sort((a, b) => b.cost - a.cost);
    const rank = nodeCosts.findIndex((item) => item.id === node.id) + 1;

    return {
      totalGraphCost,
      totalGraphTokens,
      rank: rank > 0 ? rank : null,
      totalNodes: dataset.nodes.length,
      costSharePercent: totalGraphCost > 0 ? (tokens.costUsd / totalGraphCost) * 100 : 0,
      tokenSharePercent: totalGraphTokens > 0 ? (tokens.totalTokens / totalGraphTokens) * 100 : 0,
    };
  }, [dataset, node.id, tokens.costUsd, tokens.totalTokens]);

  const currentPricing = TIER_PRICING[tokens.tier] ?? TIER_PRICING.m;

  const costBreakdown = useMemo(() => {
    const promptCost = (tokens.promptTokens * currentPricing.promptUsdPer1M) / 1_000_000;
    const completionCost =
      (tokens.completionTokens * currentPricing.completionUsdPer1M) / 1_000_000;
    const reasoningCost = (tokens.reasoningTokens * currentPricing.reasoningUsdPer1M) / 1_000_000;
    const cacheWriteCost =
      (tokens.cacheCreationTokens * currentPricing.cacheWriteUsdPer1M) / 1_000_000;
    const cacheReadCost = (tokens.cacheReadTokens * currentPricing.cacheReadUsdPer1M) / 1_000_000;

    const discountPerToken =
      Math.max(0, currentPricing.promptUsdPer1M - currentPricing.cacheReadUsdPer1M) / 1_000_000;
    const cacheSavingsUsd = tokens.cacheReadTokens * discountPerToken;

    const totalInputCandidate = tokens.promptTokens + tokens.cacheReadTokens;
    const cacheHitRatePercent =
      totalInputCandidate > 0 ? (tokens.cacheReadTokens / totalInputCandidate) * 100 : 0;

    const costPer1kTokens =
      tokens.totalTokens > 0 ? (tokens.costUsd / tokens.totalTokens) * 1000 : 0;

    return {
      promptCost,
      completionCost,
      reasoningCost,
      cacheWriteCost,
      cacheReadCost,
      cacheSavingsUsd,
      cacheHitRatePercent,
      costPer1kTokens,
    };
  }, [tokens, currentPricing]);

  // Model Tier Comparison simulation for this node
  const tierComparisons = useMemo(() => {
    return Object.entries(TIER_PRICING).map(([tierKey, pricing]) => {
      const simulatedCost =
        (tokens.promptTokens * pricing.promptUsdPer1M +
          tokens.completionTokens * pricing.completionUsdPer1M +
          tokens.reasoningTokens * pricing.reasoningUsdPer1M +
          tokens.cacheCreationTokens * pricing.cacheWriteUsdPer1M +
          tokens.cacheReadTokens * pricing.cacheReadUsdPer1M) /
        1_000_000;

      const isCurrentTier = tierKey === tokens.tier;
      const deltaUsd = simulatedCost - tokens.costUsd;
      const deltaPercent = tokens.costUsd > 0 ? (deltaUsd / tokens.costUsd) * 100 : 0;

      return {
        tier: tierKey,
        label: pricing.label,
        tierName: pricing.tierName,
        description: pricing.description,
        simulatedCost,
        isCurrentTier,
        deltaUsd,
        deltaPercent,
      };
    });
  }, [tokens]);

  const retries = typeof node.metrics?.retries === "number" ? node.metrics.retries : 0;
  const repairRounds =
    typeof node.metrics?.repairRounds === "number"
      ? node.metrics.repairRounds
      : typeof (node.metadata?.repairRounds as number | undefined) === "number"
        ? (node.metadata!.repairRounds as number)
        : 0;

  const reasoningEffort =
    (node.metadata?.hostAgent as { reasoningEffort?: string } | undefined)?.reasoningEffort ??
    (node.metadata?.reasoningEffort as string | undefined);
  const thinkingLevel =
    (node.metadata?.hostAgent as { thinkingLevel?: string } | undefined)?.thinkingLevel ??
    (node.metadata?.thinkingLevel as string | undefined);

  const handleCopySummary = useCallback(async () => {
    const summaryLines = [
      `Node Cost & Token Footprint: ${node.name} (${node.id})`,
      `Model: ${tokens.model} (Tier: ${tokens.tier.toUpperCase()})`,
      `Total Cost: ${formatDetailedUsd(tokens.costUsd, true)}`,
      `Total Tokens: ${tokens.totalTokens.toLocaleString()} (${formatTokens(tokens.totalTokens)})`,
      `  - Input / Prompt: ${tokens.promptTokens.toLocaleString()}`,
      `  - Output / Gen: ${tokens.completionTokens.toLocaleString()}`,
      `  - Reasoning / Thinking: ${tokens.reasoningTokens.toLocaleString()}`,
      `  - Cache Read: ${tokens.cacheReadTokens.toLocaleString()}`,
      `  - Cache Write: ${tokens.cacheCreationTokens.toLocaleString()}`,
      `Cache Hit Rate: ${costBreakdown.cacheHitRatePercent.toFixed(1)}%`,
      `Cache Savings: ${formatDetailedUsd(costBreakdown.cacheSavingsUsd, true)}`,
      `Cost / 1k Tokens: $${costBreakdown.costPer1kTokens.toFixed(4)}`,
    ];

    if (graphAnalytics) {
      summaryLines.push(
        `Graph Share: ${graphAnalytics.costSharePercent.toFixed(1)}% of total cost, ${graphAnalytics.tokenSharePercent.toFixed(1)}% of total tokens (Rank #${graphAnalytics.rank} of ${graphAnalytics.totalNodes})`,
      );
    }

    const success = await copyToClipboard(summaryLines.join("\n"));
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [node.name, node.id, tokens, costBreakdown, graphAnalytics]);

  const totalToks = tokens.totalTokens;
  const promptPct = totalToks > 0 ? (tokens.promptTokens / totalToks) * 100 : 0;
  const completionPct = totalToks > 0 ? (tokens.completionTokens / totalToks) * 100 : 0;
  const reasoningPct = totalToks > 0 ? (tokens.reasoningTokens / totalToks) * 100 : 0;
  const cachePct =
    totalToks > 0 ? ((tokens.cacheCreationTokens + tokens.cacheReadTokens) / totalToks) * 100 : 0;

  return (
    <div className="drawer-tab-content cost-tab-content" data-testid="cost-tab">
      {/* Node Cost Overview Header Card */}
      <div className="cost-overview-header" data-testid="cost-overview-header">
        <div className="cost-header-main">
          <div className="cost-hero-value-group">
            <span className="cost-hero-label">Node Execution Cost &bull; {node.name}</span>
            <div className="cost-hero-amount-row">
              <span className="cost-hero-amount" data-testid="node-cost-usd">
                {formatDetailedUsd(tokens.costUsd, highPrecision)}
              </span>
              <button
                type="button"
                className="cost-precision-toggle"
                onClick={() => setHighPrecision((prev) => !prev)}
                title="Toggle precision decimals"
                aria-label="Toggle currency precision"
              >
                {highPrecision ? "4-dec" : "2-dec"}
              </button>
            </div>
          </div>

          <div className="cost-header-actions">
            <button
              type="button"
              className="cost-copy-btn"
              onClick={handleCopySummary}
              title="Copy cost breakdown to clipboard"
              aria-label="Copy cost summary"
              data-testid="copy-node-cost-btn"
            >
              {copied ? <IconCheck size={14} color="#10b981" /> : <IconCopy size={14} />}
              <span>{copied ? "Copied" : "Copy Report"}</span>
            </button>
          </div>
        </div>

        <div className="cost-header-meta-chips">
          <div className="cost-meta-chip">
            <span className="chip-label">Model:</span>
            <span className="chip-value" title={tokens.model}>
              {tokens.model}
            </span>
          </div>

          <div className="cost-meta-chip">
            <span className="chip-label">Tier:</span>
            <span className={`model-tier-chip tier-${tokens.tier}`}>
              {tokens.tier.toUpperCase()}
            </span>
          </div>

          <div className="cost-meta-chip">
            <span className="chip-label">Tokens:</span>
            <span className="chip-value" data-testid="node-total-tokens">
              {formatTokens(tokens.totalTokens)}
            </span>
          </div>

          {typeof graphAnalytics?.rank === "number" ? (
            <div className="cost-meta-chip">
              <span className="chip-label">Graph Cost Rank:</span>
              <span className="chip-value text-accent">
                {`#${graphAnalytics.rank} of ${graphAnalytics.totalNodes}`}
              </span>
            </div>
          ) : null}

          {graphAnalytics ? (
            <div className="cost-meta-chip">
              <span className="chip-label">Graph Share:</span>
              <span className="chip-value">{`${graphAnalytics.costSharePercent.toFixed(1)}%`}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Section 1: Granular Token Breakdown */}
      <DrawerSection title="Token Footprint Breakdown" count={tokens.totalTokens}>
        {/* Segmented Distribution Bar */}
        <div
          className="cost-distribution-track"
          title={`Input: ${promptPct.toFixed(1)}%, Output: ${completionPct.toFixed(1)}%, Reasoning: ${reasoningPct.toFixed(1)}%, Cache: ${cachePct.toFixed(1)}%`}
        >
          {promptPct > 0 && (
            <div className="cost-bar-seg seg-prompt" style={{ width: `${promptPct}%` }} />
          )}
          {completionPct > 0 && (
            <div className="cost-bar-seg seg-completion" style={{ width: `${completionPct}%` }} />
          )}
          {reasoningPct > 0 && (
            <div className="cost-bar-seg seg-reasoning" style={{ width: `${reasoningPct}%` }} />
          )}
          {cachePct > 0 && (
            <div className="cost-bar-seg seg-cache" style={{ width: `${cachePct}%` }} />
          )}
        </div>

        {/* Token Metric Grid */}
        <div className="drawer-metric-grid cost-metrics-grid">
          <div className="drawer-metric" data-testid="metric-prompt-tokens">
            <div className="cost-metric-label-row">
              <span className="token-dot dot-prompt" />
              <span className="drawer-metric-label">Input / Prompt</span>
            </div>
            <span className="drawer-metric-value">{tokens.promptTokens.toLocaleString()}</span>
            <span className="cost-metric-subtext">
              {formatTokens(tokens.promptTokens)} ({promptPct.toFixed(1)}%)
            </span>
          </div>

          <div className="drawer-metric" data-testid="metric-completion-tokens">
            <div className="cost-metric-label-row">
              <span className="token-dot dot-completion" />
              <span className="drawer-metric-label">Output / Gen</span>
            </div>
            <span className="drawer-metric-value">{tokens.completionTokens.toLocaleString()}</span>
            <span className="cost-metric-subtext">
              {formatTokens(tokens.completionTokens)} ({completionPct.toFixed(1)}%)
            </span>
          </div>

          <div
            className={`drawer-metric ${tokens.reasoningTokens > 0 ? "drawer-metric--thinking" : ""}`}
            data-testid="metric-reasoning-tokens"
          >
            <div className="cost-metric-label-row">
              <span className="token-dot dot-reasoning" />
              <span className="drawer-metric-label">Reasoning</span>
            </div>
            <span className="drawer-metric-value">{tokens.reasoningTokens.toLocaleString()}</span>
            <span className="cost-metric-subtext">
              {tokens.reasoningTokens > 0
                ? `${formatTokens(tokens.reasoningTokens)} (${reasoningPct.toFixed(1)}%)`
                : "None"}
            </span>
          </div>

          <div className="drawer-metric" data-testid="metric-cache-read-tokens">
            <div className="cost-metric-label-row">
              <span className="token-dot dot-cache" />
              <span className="drawer-metric-label">Cache Read (Hit)</span>
            </div>
            <span className="drawer-metric-value">{tokens.cacheReadTokens.toLocaleString()}</span>
            <span className="cost-metric-subtext">{formatTokens(tokens.cacheReadTokens)}</span>
          </div>

          <div className="drawer-metric" data-testid="metric-cache-write-tokens">
            <div className="cost-metric-label-row">
              <span className="token-dot dot-cache-write" />
              <span className="drawer-metric-label">Cache Creation</span>
            </div>
            <span className="drawer-metric-value">
              {tokens.cacheCreationTokens.toLocaleString()}
            </span>
            <span className="cost-metric-subtext">{formatTokens(tokens.cacheCreationTokens)}</span>
          </div>
        </div>

        {(reasoningEffort || thinkingLevel) && (
          <div className="cost-thinking-info-banner">
            <IconSparkles size={14} className="thinking-icon" />
            <span>
              Thinking Config: <strong>{thinkingLevel || reasoningEffort}</strong> reasoning effort
            </span>
          </div>
        )}
      </DrawerSection>

      {/* Section 2: Financial Analytics & Efficiency */}
      <DrawerSection title="Financial Analytics & Cost Drivers">
        <div className="cost-analytics-cards">
          <div className="cost-detail-card">
            <span className="cost-detail-title">Cost Composition</span>
            <div className="cost-detail-table">
              <div className="cost-table-row">
                <span className="cost-row-label">Input / Prompt</span>
                <span className="cost-row-val">
                  {formatDetailedUsd(costBreakdown.promptCost, highPrecision)}
                </span>
              </div>
              <div className="cost-table-row">
                <span className="cost-row-label">Output / Completion</span>
                <span className="cost-row-val">
                  {formatDetailedUsd(costBreakdown.completionCost, highPrecision)}
                </span>
              </div>
              {tokens.reasoningTokens > 0 && (
                <div className="cost-table-row">
                  <span className="cost-row-label">Reasoning / Thinking</span>
                  <span className="cost-row-val">
                    {formatDetailedUsd(costBreakdown.reasoningCost, highPrecision)}
                  </span>
                </div>
              )}
              {tokens.cacheCreationTokens > 0 && (
                <div className="cost-table-row">
                  <span className="cost-row-label">Cache Creation</span>
                  <span className="cost-row-val">
                    {formatDetailedUsd(costBreakdown.cacheWriteCost, highPrecision)}
                  </span>
                </div>
              )}
              {tokens.cacheReadTokens > 0 && (
                <div className="cost-table-row">
                  <span className="cost-row-label">Cache Read</span>
                  <span className="cost-row-val">
                    {formatDetailedUsd(costBreakdown.cacheReadCost, highPrecision)}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="cost-detail-card">
            <span className="cost-detail-title">Efficiency & Savings</span>
            <div className="cost-detail-table">
              <div className="cost-table-row">
                <span className="cost-row-label">Cache Hit Rate</span>
                <span className="cost-row-val" data-testid="node-cache-hit-rate">
                  {costBreakdown.cacheHitRatePercent.toFixed(1)}%
                </span>
              </div>
              <div className="cost-table-row">
                <span className="cost-row-label">Cache Savings</span>
                <span className="cost-row-val text-emerald" data-testid="node-cache-savings">
                  {formatDetailedUsd(costBreakdown.cacheSavingsUsd, highPrecision)}
                </span>
              </div>
              <div className="cost-table-row">
                <span className="cost-row-label">Cost per 1k Tokens</span>
                <span className="cost-row-val">${costBreakdown.costPer1kTokens.toFixed(4)}</span>
              </div>
            </div>
          </div>
        </div>

        {(retries > 0 || repairRounds > 0) && (
          <div className="cost-repair-impact-card" data-testid="cost-repair-impact">
            <div className="repair-impact-header">
              <IconRefresh size={14} className="repair-icon" />
              <span className="repair-title">Repair & Retry Multiplier</span>
            </div>
            <p className="repair-desc">
              This node underwent {repairRounds > 0 ? `${repairRounds} repair rounds` : ""}
              {repairRounds > 0 && retries > 0 ? " and " : ""}
              {retries > 0 ? `${retries} retries` : ""}, multiplying token consumption by
              approximately <strong>{(1 + repairRounds + retries).toFixed(1)}x</strong>.
            </p>
          </div>
        )}
      </DrawerSection>

      {/* Section 3: Model Tier Cost Comparison for this Node */}
      <DrawerSection title="Model Tier Cost Comparison">
        <p className="tier-comparison-explainer">
          Estimated cost if this node&apos;s exact payload was processed by alternative model tiers:
        </p>

        <div className="tier-comparison-grid" data-testid="tier-comparison-grid">
          {tierComparisons.map((item) => {
            const isCheaper = item.deltaUsd < 0;
            return (
              <div
                key={item.tier}
                className={`tier-comp-card tier-${item.tier} ${item.isCurrentTier ? "is-current-tier" : ""}`}
                data-testid={`tier-comparison-card-${item.tier}`}
              >
                <div className="tier-comp-header">
                  <div className="tier-badge-wrap">
                    <span className={`model-tier-chip tier-${item.tier}`}>{item.tierName}</span>
                    <span className="tier-comp-name">{item.label}</span>
                  </div>
                  {item.isCurrentTier && (
                    <span className="current-tier-tag" data-testid="current-tier-tag">
                      Current
                    </span>
                  )}
                </div>

                <div className="tier-comp-price-row">
                  <span className="tier-comp-price">
                    {formatDetailedUsd(item.simulatedCost, highPrecision)}
                  </span>
                  {!item.isCurrentTier && (
                    <span
                      className={`tier-comp-delta ${isCheaper ? "delta-cheaper" : "delta-costlier"}`}
                    >
                      {isCheaper ? "" : "+"}
                      {item.deltaPercent.toFixed(0)}%
                    </span>
                  )}
                </div>

                <p className="tier-comp-desc">{item.description}</p>
              </div>
            );
          })}
        </div>
      </DrawerSection>
    </div>
  );
});

CostTab.displayName = "CostTab";
