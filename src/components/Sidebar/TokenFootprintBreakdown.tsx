import type { FC } from "react";
import React, { useMemo, useState, useCallback } from "react";
import {
  IconBrain,
  IconCoins,
  IconCopy,
  IconCheck,
  IconDatabase,
  IconLayersLinked,
  IconPercentage,
  IconPigMoney,
} from "@tabler/icons-react";
import type { GraphDataset, GraphNodeData, ModelTier } from "../../types/graphData";
import { formatCost, formatTokens } from "../../primitives/nodes/NodeCard/nodeCardModel";
import { resolveModelTier } from "../../primitives/nodes/NodeCard/nodeKinds";
import { copyToClipboard } from "../NodeDetailDrawer/streamUtils";

export interface ModelTierPricing {
  promptUsdPer1M: number;
  completionUsdPer1M: number;
  reasoningUsdPer1M: number;
  cacheWriteUsdPer1M: number;
  cacheReadUsdPer1M: number;
  label: string;
  tierName: string;
  description: string;
}

export const TIER_PRICING: Record<string, ModelTierPricing> = {
  xs: {
    tierName: "XS",
    label: "Tier XS (Ultra-Light)",
    description: "Gemini 1.5/2.0 Flash-Lite, Claude 3 Haiku",
    promptUsdPer1M: 0.15,
    completionUsdPer1M: 0.6,
    reasoningUsdPer1M: 0.6,
    cacheWriteUsdPer1M: 0.1875,
    cacheReadUsdPer1M: 0.0375,
  },
  s: {
    tierName: "S",
    label: "Tier S (Balanced)",
    description: "Gemini 2.0 Flash, GPT-4o-mini, Claude 3.5 Haiku",
    promptUsdPer1M: 0.5,
    completionUsdPer1M: 1.5,
    reasoningUsdPer1M: 1.5,
    cacheWriteUsdPer1M: 0.625,
    cacheReadUsdPer1M: 0.125,
  },
  m: {
    tierName: "M",
    label: "Tier M (Advanced)",
    description: "Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro",
    promptUsdPer1M: 3.0,
    completionUsdPer1M: 15.0,
    reasoningUsdPer1M: 15.0,
    cacheWriteUsdPer1M: 3.75,
    cacheReadUsdPer1M: 0.3,
  },
  l: {
    tierName: "L",
    label: "Tier L (Frontier / Reasoning)",
    description: "Claude 3 Opus, OpenAI o1/o3, Gemini 2.0 Pro",
    promptUsdPer1M: 15.0,
    completionUsdPer1M: 75.0,
    reasoningUsdPer1M: 75.0,
    cacheWriteUsdPer1M: 18.75,
    cacheReadUsdPer1M: 1.5,
  },
};

export interface ExtractedNodeTokens {
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
  costUsd: number;
  tier: string;
  model: string;
}

export function extractNodeTokenFootprint(node: GraphNodeData): ExtractedNodeTokens {
  const metrics = node.metrics;
  const meta = node.metadata;

  const rawTokenObj = (metrics?.tokens ?? meta?.tokens) as Record<string, unknown> | undefined;

  let promptTokens = 0;
  if (typeof rawTokenObj?.promptTokens === "number" && Number.isFinite(rawTokenObj.promptTokens)) {
    promptTokens = Math.max(0, rawTokenObj.promptTokens);
  } else if (
    typeof rawTokenObj?.inputTokens === "number" &&
    Number.isFinite(rawTokenObj.inputTokens)
  ) {
    promptTokens = Math.max(0, rawTokenObj.inputTokens);
  } else if (typeof metrics?.tokensIn === "number" && Number.isFinite(metrics.tokensIn)) {
    promptTokens = Math.max(0, metrics.tokensIn);
  } else if (typeof meta?.tokensIn === "number" && Number.isFinite(meta.tokensIn)) {
    promptTokens = Math.max(0, meta.tokensIn);
  }

  let completionTokens = 0;
  if (
    typeof rawTokenObj?.completionTokens === "number" &&
    Number.isFinite(rawTokenObj.completionTokens)
  ) {
    completionTokens = Math.max(0, rawTokenObj.completionTokens);
  } else if (
    typeof rawTokenObj?.outputTokens === "number" &&
    Number.isFinite(rawTokenObj.outputTokens)
  ) {
    completionTokens = Math.max(0, rawTokenObj.outputTokens);
  } else if (typeof metrics?.tokensOut === "number" && Number.isFinite(metrics.tokensOut)) {
    completionTokens = Math.max(0, metrics.tokensOut);
  } else if (typeof meta?.tokensOut === "number" && Number.isFinite(meta.tokensOut)) {
    completionTokens = Math.max(0, meta.tokensOut);
  }

  let reasoningTokens = 0;
  const hostAgentObj = (meta?.hostAgent ?? node.hostAgent) as Record<string, unknown> | undefined;
  if (
    typeof rawTokenObj?.reasoningTokens === "number" &&
    Number.isFinite(rawTokenObj.reasoningTokens)
  ) {
    reasoningTokens = Math.max(0, rawTokenObj.reasoningTokens);
  } else if (
    typeof rawTokenObj?.cognitiveTokens === "number" &&
    Number.isFinite(rawTokenObj.cognitiveTokens)
  ) {
    reasoningTokens = Math.max(0, rawTokenObj.cognitiveTokens);
  } else if (
    typeof rawTokenObj?.thinkingTokens === "number" &&
    Number.isFinite(rawTokenObj.thinkingTokens)
  ) {
    reasoningTokens = Math.max(0, rawTokenObj.thinkingTokens);
  } else if (
    typeof (metrics as Record<string, unknown> | undefined)?.reasoningTokens === "number" &&
    Number.isFinite((metrics as Record<string, unknown>).reasoningTokens)
  ) {
    reasoningTokens = Math.max(0, (metrics as Record<string, unknown>).reasoningTokens as number);
  } else if (
    typeof (metrics as Record<string, unknown> | undefined)?.cognitiveTokens === "number" &&
    Number.isFinite((metrics as Record<string, unknown>).cognitiveTokens)
  ) {
    reasoningTokens = Math.max(0, (metrics as Record<string, unknown>).cognitiveTokens as number);
  } else if (
    typeof (metrics as Record<string, unknown> | undefined)?.thinkingTokens === "number" &&
    Number.isFinite((metrics as Record<string, unknown>).thinkingTokens)
  ) {
    reasoningTokens = Math.max(0, (metrics as Record<string, unknown>).thinkingTokens as number);
  } else if (
    typeof (meta as Record<string, unknown> | undefined)?.reasoningTokens === "number" &&
    Number.isFinite((meta as Record<string, unknown>).reasoningTokens)
  ) {
    reasoningTokens = Math.max(0, (meta as Record<string, unknown>).reasoningTokens as number);
  } else if (
    typeof (meta as Record<string, unknown> | undefined)?.cognitiveTokens === "number" &&
    Number.isFinite((meta as Record<string, unknown>).cognitiveTokens)
  ) {
    reasoningTokens = Math.max(0, (meta as Record<string, unknown>).cognitiveTokens as number);
  } else if (
    typeof (meta as Record<string, unknown> | undefined)?.thinkingTokens === "number" &&
    Number.isFinite((meta as Record<string, unknown>).thinkingTokens)
  ) {
    reasoningTokens = Math.max(0, (meta as Record<string, unknown>).thinkingTokens as number);
  } else if (
    typeof hostAgentObj?.reasoningTokens === "number" &&
    Number.isFinite(hostAgentObj.reasoningTokens)
  ) {
    reasoningTokens = Math.max(0, hostAgentObj.reasoningTokens as number);
  } else if (
    typeof hostAgentObj?.cognitiveTokens === "number" &&
    Number.isFinite(hostAgentObj.cognitiveTokens)
  ) {
    reasoningTokens = Math.max(0, hostAgentObj.cognitiveTokens as number);
  } else if (
    typeof hostAgentObj?.thinkingTokens === "number" &&
    Number.isFinite(hostAgentObj.thinkingTokens)
  ) {
    reasoningTokens = Math.max(0, hostAgentObj.thinkingTokens as number);
  }

  let cacheCreationTokens = 0;
  if (
    typeof rawTokenObj?.cacheCreationTokens === "number" &&
    Number.isFinite(rawTokenObj.cacheCreationTokens)
  ) {
    cacheCreationTokens = Math.max(0, rawTokenObj.cacheCreationTokens);
  } else if (
    typeof rawTokenObj?.cacheWriteTokens === "number" &&
    Number.isFinite(rawTokenObj.cacheWriteTokens)
  ) {
    cacheCreationTokens = Math.max(0, rawTokenObj.cacheWriteTokens);
  }

  let cacheReadTokens = 0;
  if (
    typeof rawTokenObj?.cacheReadTokens === "number" &&
    Number.isFinite(rawTokenObj.cacheReadTokens)
  ) {
    cacheReadTokens = Math.max(0, rawTokenObj.cacheReadTokens);
  } else if (
    typeof rawTokenObj?.cacheHitTokens === "number" &&
    Number.isFinite(rawTokenObj.cacheHitTokens)
  ) {
    cacheReadTokens = Math.max(0, rawTokenObj.cacheHitTokens);
  }

  let totalTokens = 0;
  if (typeof rawTokenObj?.totalTokens === "number" && Number.isFinite(rawTokenObj.totalTokens)) {
    totalTokens = Math.max(0, rawTokenObj.totalTokens);
  } else {
    totalTokens = promptTokens + completionTokens + reasoningTokens;
  }

  let costUsd = 0;
  if (typeof metrics?.costUsd === "number" && Number.isFinite(metrics.costUsd)) {
    costUsd = Math.max(0, metrics.costUsd);
  } else if (typeof meta?.costUsd === "number" && Number.isFinite(meta.costUsd)) {
    costUsd = Math.max(0, meta.costUsd);
  }

  const model =
    node.model?.trim() ||
    node.harnessModel?.trim() ||
    (typeof meta?.model === "string" ? meta.model.trim() : "") ||
    (typeof (meta?.hostAgent as { model?: string } | undefined)?.model === "string"
      ? (meta?.hostAgent as { model?: string }).model!.trim()
      : "") ||
    (typeof (node.hostAgent as { model?: string } | undefined)?.model === "string"
      ? (node.hostAgent as { model?: string }).model!.trim()
      : "") ||
    "Unspecified";

  let tier = resolveModelTier(node) || node.tier;
  if (!tier && typeof (meta?.hostAgent as { tier?: string } | undefined)?.tier === "string") {
    tier = (meta?.hostAgent as { tier?: string }).tier as ModelTier;
  }
  if (!tier && typeof (node.hostAgent as { tier?: string } | undefined)?.tier === "string") {
    tier = (node.hostAgent as { tier?: string }).tier as ModelTier;
  }
  if (!tier) {
    const lowerModel = model.toLowerCase();
    if (
      lowerModel.includes("opus") ||
      lowerModel.includes("o1") ||
      lowerModel.includes("o3") ||
      lowerModel.includes("pro-2")
    ) {
      tier = "l";
    } else if (
      lowerModel.includes("sonnet") ||
      lowerModel.includes("gpt-4o") ||
      lowerModel.includes("gpt-4")
    ) {
      tier = "m";
    } else if (
      lowerModel.includes("haiku") ||
      lowerModel.includes("flash") ||
      lowerModel.includes("mini")
    ) {
      tier = "s";
    } else if (lowerModel.includes("flash-lite") || lowerModel.includes("haiku-3")) {
      tier = "xs";
    }
  }

  const normalizedTier = tier ? String(tier).toLowerCase() : "unspecified";

  if (costUsd === 0 && totalTokens > 0 && TIER_PRICING[normalizedTier]) {
    const pricing = TIER_PRICING[normalizedTier];
    costUsd =
      (promptTokens * pricing.promptUsdPer1M +
        completionTokens * pricing.completionUsdPer1M +
        reasoningTokens * pricing.reasoningUsdPer1M +
        cacheCreationTokens * pricing.cacheWriteUsdPer1M +
        cacheReadTokens * pricing.cacheReadUsdPer1M) /
      1_000_000;
  }

  return {
    promptTokens,
    completionTokens,
    reasoningTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens,
    costUsd,
    tier: normalizedTier,
    model,
  };
}

export interface TierAggregatedStats {
  tier: string;
  tierLabel: string;
  nodeCount: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  cacheTokens: number;
  totalTokens: number;
  costUsd: number;
  costSharePercent: number;
  tokenSharePercent: number;
}

export interface TierSimulationResult {
  tier: string;
  label: string;
  simulatedCostUsd: number;
  deltaUsd: number;
  deltaPercent: number;
}

export interface GraphTokenFootprintAnalytics {
  nodesCount: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalReasoningTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalCostUsd: number;
  cacheHitRatePercent: number;
  cacheCostSavingsUsd: number;
  avgCostPerNode: number;
  costPer1kTokens: number;
  reasoningSharePercent: number;
  tierBreakdown: TierAggregatedStats[];
  tierSimulations: TierSimulationResult[];
}

export function calculateGraphTokenFootprint(
  dataset: GraphDataset | null,
): GraphTokenFootprintAnalytics | null {
  if (!dataset || !dataset.nodes || dataset.nodes.length === 0) {
    return null;
  }

  let totalTokens = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalReasoningTokens = 0;
  let totalCacheCreationTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCostUsd = 0;
  let cacheCostSavingsUsd = 0;

  const tierMap = new Map<
    string,
    {
      count: number;
      prompt: number;
      completion: number;
      reasoning: number;
      cache: number;
      total: number;
      cost: number;
    }
  >();

  for (const node of dataset.nodes) {
    const extracted = extractNodeTokenFootprint(node);

    totalPromptTokens += extracted.promptTokens;
    totalCompletionTokens += extracted.completionTokens;
    totalReasoningTokens += extracted.reasoningTokens;
    totalCacheCreationTokens += extracted.cacheCreationTokens;
    totalCacheReadTokens += extracted.cacheReadTokens;
    totalTokens += extracted.totalTokens;
    totalCostUsd += extracted.costUsd;

    const pricing = TIER_PRICING[extracted.tier] ?? TIER_PRICING.m;
    if (extracted.cacheReadTokens > 0) {
      const discountPerToken =
        Math.max(0, pricing.promptUsdPer1M - pricing.cacheReadUsdPer1M) / 1_000_000;
      cacheCostSavingsUsd += extracted.cacheReadTokens * discountPerToken;
    }

    const currentTierData = tierMap.get(extracted.tier) ?? {
      count: 0,
      prompt: 0,
      completion: 0,
      reasoning: 0,
      cache: 0,
      total: 0,
      cost: 0,
    };
    currentTierData.count += 1;
    currentTierData.prompt += extracted.promptTokens;
    currentTierData.completion += extracted.completionTokens;
    currentTierData.reasoning += extracted.reasoningTokens;
    currentTierData.cache += extracted.cacheCreationTokens + extracted.cacheReadTokens;
    currentTierData.total += extracted.totalTokens;
    currentTierData.cost += extracted.costUsd;
    tierMap.set(extracted.tier, currentTierData);
  }

  const nodesCount = dataset.nodes.length;
  const totalInputCandidate = totalPromptTokens + totalCacheReadTokens;
  const cacheHitRatePercent =
    totalInputCandidate > 0 ? (totalCacheReadTokens / totalInputCandidate) * 100 : 0;
  const avgCostPerNode = nodesCount > 0 ? totalCostUsd / nodesCount : 0;
  const costPer1kTokens = totalTokens > 0 ? (totalCostUsd / totalTokens) * 1000 : 0;
  const reasoningSharePercent = totalTokens > 0 ? (totalReasoningTokens / totalTokens) * 100 : 0;

  const tierOrder = ["xs", "s", "m", "l", "unspecified"];
  const tierBreakdown: TierAggregatedStats[] = [];

  for (const t of tierOrder) {
    const data = tierMap.get(t);
    if (!data) continue;
    const tierPricing = TIER_PRICING[t];
    tierBreakdown.push({
      tier: t,
      tierLabel: tierPricing?.tierName ?? (t === "unspecified" ? "Custom" : t.toUpperCase()),
      nodeCount: data.count,
      promptTokens: data.prompt,
      completionTokens: data.completion,
      reasoningTokens: data.reasoning,
      cacheTokens: data.cache,
      totalTokens: data.total,
      costUsd: data.cost,
      costSharePercent: totalCostUsd > 0 ? (data.cost / totalCostUsd) * 100 : 0,
      tokenSharePercent: totalTokens > 0 ? (data.total / totalTokens) * 100 : 0,
    });
  }

  for (const [t, data] of tierMap.entries()) {
    if (!tierOrder.includes(t)) {
      tierBreakdown.push({
        tier: t,
        tierLabel: t.toUpperCase(),
        nodeCount: data.count,
        promptTokens: data.prompt,
        completionTokens: data.completion,
        reasoningTokens: data.reasoning,
        cacheTokens: data.cache,
        totalTokens: data.total,
        costUsd: data.cost,
        costSharePercent: totalCostUsd > 0 ? (data.cost / totalCostUsd) * 100 : 0,
        tokenSharePercent: totalTokens > 0 ? (data.total / totalTokens) * 100 : 0,
      });
    }
  }

  const tierSimulations: TierSimulationResult[] = Object.entries(TIER_PRICING).map(
    ([tierKey, pricing]) => {
      const simulatedCost =
        (totalPromptTokens * pricing.promptUsdPer1M +
          totalCompletionTokens * pricing.completionUsdPer1M +
          totalReasoningTokens * pricing.reasoningUsdPer1M +
          totalCacheCreationTokens * pricing.cacheWriteUsdPer1M +
          totalCacheReadTokens * pricing.cacheReadUsdPer1M) /
        1_000_000;
      const deltaUsd = simulatedCost - totalCostUsd;
      const deltaPercent = totalCostUsd > 0 ? (deltaUsd / totalCostUsd) * 100 : 0;
      return {
        tier: tierKey,
        label: pricing.label,
        simulatedCostUsd: simulatedCost,
        deltaUsd,
        deltaPercent,
      };
    },
  );

  return {
    nodesCount,
    totalTokens,
    totalPromptTokens,
    totalCompletionTokens,
    totalReasoningTokens,
    totalCacheCreationTokens,
    totalCacheReadTokens,
    totalCostUsd,
    cacheHitRatePercent,
    cacheCostSavingsUsd,
    avgCostPerNode,
    costPer1kTokens,
    reasoningSharePercent,
    tierBreakdown,
    tierSimulations,
  };
}

export type BreakdownViewMode = "tokens" | "tiers" | "cache" | "simulation";

export interface TokenFootprintBreakdownProps {
  dataset: GraphDataset | null;
  onFilterTier?: (tier: string) => void;
}

export const TokenFootprintBreakdown: FC<TokenFootprintBreakdownProps> = React.memo(
  function TokenFootprintBreakdown({ dataset, onFilterTier }) {
    const [viewMode, setViewMode] = useState<BreakdownViewMode>("tokens");
    const [copied, setCopied] = useState(false);

    const analytics = useMemo(() => calculateGraphTokenFootprint(dataset), [dataset]);

    const handleCopySummary = useCallback(async () => {
      if (!analytics) return;
      const summaryText = [
        `Graph Cost & Token Footprint Summary`,
        `Total Cost: ${formatCost(analytics.totalCostUsd)}`,
        `Total Tokens: ${analytics.totalTokens.toLocaleString()} (${formatTokens(analytics.totalTokens)})`,
        `  - Prompt Tokens: ${analytics.totalPromptTokens.toLocaleString()}`,
        `  - Completion Tokens: ${analytics.totalCompletionTokens.toLocaleString()}`,
        `  - Reasoning Tokens: ${analytics.totalReasoningTokens.toLocaleString()}`,
        `  - Cache Read: ${analytics.totalCacheReadTokens.toLocaleString()}`,
        `  - Cache Write: ${analytics.totalCacheCreationTokens.toLocaleString()}`,
        `Cache Hit Rate: ${analytics.cacheHitRatePercent.toFixed(1)}%`,
        `Cache Savings: ${formatCost(analytics.cacheCostSavingsUsd)}`,
        `Tier Distribution:`,
        ...analytics.tierBreakdown.map(
          (t) =>
            `  - Tier ${t.tierLabel}: ${t.nodeCount} nodes | ${formatTokens(t.totalTokens)} tokens | ${formatCost(t.costUsd)} (${t.costSharePercent.toFixed(1)}%)`,
        ),
      ].join("\n");

      const success = await copyToClipboard(summaryText);
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }, [analytics]);

    if (!analytics || analytics.nodesCount === 0) {
      return (
        <div className="sidebar-section" data-testid="token-footprint-breakdown">
          <div className="sidebar-section-header">
            <h4 className="sidebar-section-title">Token Footprint & Cost</h4>
          </div>
          <p className="sidebar-empty-state">No token or financial analytics available</p>
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
      totalCostUsd,
      cacheHitRatePercent,
      cacheCostSavingsUsd,
      tierBreakdown,
      tierSimulations,
    } = analytics;

    const promptPct = totalTokens > 0 ? (totalPromptTokens / totalTokens) * 100 : 0;
    const completionPct = totalTokens > 0 ? (totalCompletionTokens / totalTokens) * 100 : 0;
    const reasoningPct = totalTokens > 0 ? (totalReasoningTokens / totalTokens) * 100 : 0;
    const cachePct =
      totalTokens > 0 ? ((totalCacheCreationTokens + totalCacheReadTokens) / totalTokens) * 100 : 0;

    return (
      <div
        className="sidebar-section token-footprint-section"
        data-testid="token-footprint-breakdown"
      >
        <div className="sidebar-section-header">
          <div className="token-footprint-title-row">
            <h4 className="sidebar-section-title">Token Footprint & Cost</h4>
            <button
              type="button"
              className="token-copy-btn"
              onClick={handleCopySummary}
              title="Copy token summary to clipboard"
              aria-label="Copy token footprint summary"
              data-testid="copy-token-summary-btn"
            >
              {copied ? <IconCheck size={12} color="#10b981" /> : <IconCopy size={12} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        {/* High-level Total Metrics Grid */}
        <div className="token-summary-cards">
          <div className="token-card token-card--cost">
            <div className="token-card-header">
              <IconCoins size={12} className="token-card-icon" />
              <span className="token-card-label">Total Cost</span>
            </div>
            <span className="token-card-value" data-testid="token-footprint-total-cost">
              {formatCost(totalCostUsd)}
            </span>
          </div>

          <div className="token-card token-card--tokens">
            <div className="token-card-header">
              <IconLayersLinked size={12} className="token-card-icon" />
              <span className="token-card-label">Total Tokens</span>
            </div>
            <span className="token-card-value" data-testid="token-footprint-total-tokens">
              {formatTokens(totalTokens)}
            </span>
          </div>
        </div>

        {/* View Switcher Pills */}
        <nav className="token-view-nav" aria-label="Token Breakdown Views">
          <button
            type="button"
            className={`token-view-btn ${viewMode === "tokens" ? "active" : ""}`}
            onClick={() => setViewMode("tokens")}
            data-testid="token-view-tab-tokens"
          >
            Tokens
          </button>
          <button
            type="button"
            className={`token-view-btn ${viewMode === "tiers" ? "active" : ""}`}
            onClick={() => setViewMode("tiers")}
            data-testid="token-view-tab-tiers"
          >
            Tiers
          </button>
          <button
            type="button"
            className={`token-view-btn ${viewMode === "cache" ? "active" : ""}`}
            onClick={() => setViewMode("cache")}
            data-testid="token-view-tab-cache"
          >
            Cache
          </button>
          <button
            type="button"
            className={`token-view-btn ${viewMode === "simulation" ? "active" : ""}`}
            onClick={() => setViewMode("simulation")}
            data-testid="token-view-tab-simulation"
          >
            Compare
          </button>
        </nav>

        {/* View 1: Detailed Token Composition */}
        {viewMode === "tokens" && (
          <div className="token-view-panel" data-testid="token-view-tokens">
            {/* Visual multi-segment distribution bar */}
            <div
              className="token-distribution-bar"
              title={`Input: ${promptPct.toFixed(1)}%, Output: ${completionPct.toFixed(1)}%, Reasoning: ${reasoningPct.toFixed(1)}%, Cache: ${cachePct.toFixed(1)}%`}
            >
              {promptPct > 0 && (
                <div
                  className="token-bar-segment segment-prompt"
                  style={{ width: `${promptPct}%` }}
                />
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
              {cachePct > 0 && (
                <div
                  className="token-bar-segment segment-cache"
                  style={{ width: `${cachePct}%` }}
                />
              )}
            </div>

            <div className="token-detail-list">
              <div className="token-detail-row">
                <div className="token-detail-label-group">
                  <span className="token-dot dot-prompt" />
                  <span className="token-detail-name">Input / Prompt</span>
                </div>
                <div className="token-detail-val-group">
                  <span className="token-detail-val" data-testid="token-footprint-input-tokens">
                    {formatTokens(totalPromptTokens)}
                  </span>
                  <span className="token-detail-pct">{promptPct.toFixed(1)}%</span>
                </div>
              </div>

              <div className="token-detail-row">
                <div className="token-detail-label-group">
                  <span className="token-dot dot-completion" />
                  <span className="token-detail-name">Output / Gen</span>
                </div>
                <div className="token-detail-val-group">
                  <span className="token-detail-val" data-testid="token-footprint-output-tokens">
                    {formatTokens(totalCompletionTokens)}
                  </span>
                  <span className="token-detail-pct">{completionPct.toFixed(1)}%</span>
                </div>
              </div>

              {totalReasoningTokens > 0 && (
                <div className="token-detail-row">
                  <div className="token-detail-label-group">
                    <span className="token-dot dot-reasoning" />
                    <span className="token-detail-name">
                      <IconBrain size={11} className="inline-icon" /> Reasoning
                    </span>
                  </div>
                  <div className="token-detail-val-group">
                    <span
                      className="token-detail-val"
                      data-testid="token-footprint-reasoning-tokens"
                    >
                      {formatTokens(totalReasoningTokens)}
                    </span>
                    <span className="token-detail-pct">{reasoningPct.toFixed(1)}%</span>
                  </div>
                </div>
              )}

              {(totalCacheReadTokens > 0 || totalCacheCreationTokens > 0) && (
                <div className="token-detail-row">
                  <div className="token-detail-label-group">
                    <span className="token-dot dot-cache" />
                    <span className="token-detail-name">
                      <IconDatabase size={11} className="inline-icon" /> Cache Read/Write
                    </span>
                  </div>
                  <div className="token-detail-val-group">
                    <span className="token-detail-val" data-testid="token-footprint-cache-tokens">
                      {formatTokens(totalCacheReadTokens + totalCacheCreationTokens)}
                    </span>
                    <span className="token-detail-pct">{cachePct.toFixed(1)}%</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* View 2: Model Tier Distribution */}
        {viewMode === "tiers" && (
          <div className="token-view-panel" data-testid="token-view-tiers">
            <div className="tier-breakdown-list">
              {tierBreakdown.map((item) => (
                <div
                  key={item.tier}
                  className={`tier-breakdown-card tier-${item.tier}`}
                  data-testid={`tier-row-${item.tier}`}
                  onClick={() => onFilterTier?.(item.tier)}
                  role={onFilterTier ? "button" : undefined}
                  tabIndex={onFilterTier ? 0 : undefined}
                >
                  <div className="tier-card-top">
                    <div className="tier-badge-group">
                      <span className={`model-tier-chip tier-${item.tier}`}>{item.tierLabel}</span>
                      <span className="tier-node-count">
                        {item.nodeCount} {item.nodeCount === 1 ? "node" : "nodes"}
                      </span>
                    </div>
                    <span className="tier-cost-badge">{formatCost(item.costUsd)}</span>
                  </div>

                  <div className="tier-metrics-row">
                    <span className="tier-tokens-text">
                      {formatTokens(item.totalTokens)} tokens
                    </span>
                    <span className="tier-share-text">
                      {item.costSharePercent.toFixed(1)}% of cost
                    </span>
                  </div>

                  {/* Relative bar */}
                  <div className="tier-progress-track">
                    <div
                      className={`tier-progress-fill tier-fill-${item.tier}`}
                      style={{ width: `${Math.min(100, item.costSharePercent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* View 3: Cache Hit & Savings */}
        {viewMode === "cache" && (
          <div className="token-view-panel" data-testid="token-view-cache">
            <div className="cache-stats-grid">
              <div className="cache-metric-card">
                <div className="cache-metric-header">
                  <IconPercentage size={12} className="cache-icon" />
                  <span className="cache-metric-label">Cache Hit Rate</span>
                </div>
                <span className="cache-metric-value" data-testid="token-footprint-cache-hit-rate">
                  {cacheHitRatePercent.toFixed(1)}%
                </span>
              </div>

              <div className="cache-metric-card cache-metric-card--savings">
                <div className="cache-metric-header">
                  <IconPigMoney size={12} className="cache-icon-savings" />
                  <span className="cache-metric-label">Est. Cost Saved</span>
                </div>
                <span
                  className="cache-metric-value text-emerald"
                  data-testid="token-footprint-cache-savings"
                >
                  {formatCost(cacheCostSavingsUsd)}
                </span>
              </div>
            </div>

            <div className="cache-detail-rows">
              <div className="cache-row">
                <span className="cache-row-label">Cache Read (Hits)</span>
                <span className="cache-row-val" data-testid="token-footprint-cache-read-tokens">
                  {formatTokens(totalCacheReadTokens)} ({totalCacheReadTokens.toLocaleString()})
                </span>
              </div>
              <div className="cache-row">
                <span className="cache-row-label">Cache Creation (Writes)</span>
                <span className="cache-row-val" data-testid="token-footprint-cache-write-tokens">
                  {formatTokens(totalCacheCreationTokens)} (
                  {totalCacheCreationTokens.toLocaleString()})
                </span>
              </div>
              <div className="cache-row">
                <span className="cache-row-label">Cost per 1k Tokens</span>
                <span className="cache-row-val">${analytics.costPer1kTokens.toFixed(4)}</span>
              </div>
            </div>
          </div>
        )}

        {/* View 4: Model Tier Comparison Simulation */}
        {viewMode === "simulation" && (
          <div className="token-view-panel" data-testid="token-view-simulation">
            <p className="simulation-explainer">
              Simulated total cost if entire graph was executed across different model tiers:
            </p>
            <div className="simulation-list">
              <div className="simulation-row simulation-row--actual">
                <div className="simulation-info">
                  <span className="simulation-tier-tag">Observed</span>
                  <span className="simulation-desc">Actual Execution Cost</span>
                </div>
                <span className="simulation-cost simulation-cost--actual">
                  {formatCost(totalCostUsd)}
                </span>
              </div>

              {tierSimulations.map((sim) => {
                const isCheaper = sim.deltaUsd < 0;
                const isSame = Math.abs(sim.deltaUsd) < 0.0001;
                return (
                  <div
                    key={sim.tier}
                    className="simulation-row"
                    data-testid={`sim-tier-${sim.tier}`}
                  >
                    <div className="simulation-info">
                      <span className={`model-tier-chip tier-${sim.tier}`}>
                        {sim.tier.toUpperCase()}
                      </span>
                      <span className="simulation-desc">{sim.label}</span>
                    </div>
                    <div className="simulation-pricing">
                      <span className="simulation-cost">{formatCost(sim.simulatedCostUsd)}</span>
                      {!isSame && (
                        <span
                          className={`simulation-delta ${isCheaper ? "delta-savings" : "delta-increase"}`}
                        >
                          {isCheaper ? "" : "+"}
                          {sim.deltaPercent.toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  },
);

TokenFootprintBreakdown.displayName = "TokenFootprintBreakdown";
