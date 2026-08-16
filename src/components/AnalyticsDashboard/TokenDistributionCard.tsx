import type { FC } from "react";
import { useState } from "react";
import { IconCoins } from "@tabler/icons-react";
import type { TokenDistributionMetrics } from "../../store/useAnalyticsStore";
import { formatCost, formatTokens } from "../../primitives/nodes/NodeCard/nodeCardModel";

export interface TokenDistributionCardProps {
  distribution: TokenDistributionMetrics;
}

export const TokenDistributionCard: FC<TokenDistributionCardProps> = ({ distribution }) => {
  const {
    totalCacheReadTokens,
    totalTokens,
    totalCostUsd,
    cacheSavingsUsd,
    cacheEfficiencyPercent,
    byModel,
    byRole,
    byTier,
  } = distribution;

  const [activeTab, setActiveTab] = useState<"models" | "roles" | "tiers">("models");

  return (
    <div className="analytics-card" data-testid="token-distribution-card">
      <div className="analytics-card-header">
        <h3 className="analytics-card-title">
          <IconCoins size={18} color="#38bdf8" />
          Token Footprint & Cost Distribution
        </h3>
        <span className="analytics-card-badge">
          {formatTokens(totalTokens)} tok · {formatCost(totalCostUsd)}
        </span>
      </div>

      <div className="analytics-card-content">
        {/* Token Role Bar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div className="token-role-bar">
            {byRole.map((r) => (
              <div
                key={`role-${r.role}`}
                className={`token-role-segment ${r.role}`}
                style={{ width: `${r.percentage}%` }}
                title={`${r.label}: ${formatTokens(r.tokens)} (${r.percentage.toFixed(1)}%)`}
              />
            ))}
          </div>

          <div className="velocity-legend" style={{ fontSize: 10 }}>
            {byRole.map((r) => {
              const colors: Record<string, string> = {
                prompt: "#38bdf8",
                completion: "#34d399",
                reasoning: "#a855f7",
                cacheWrite: "#f59e0b",
                cacheRead: "#06b6d4",
              };
              return (
                <div key={`legend-${r.role}`} className="velocity-legend-item">
                  <span
                    className="velocity-legend-dot"
                    style={{ backgroundColor: colors[r.role] }}
                  />
                  <span>
                    {r.label} ({r.percentage.toFixed(0)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cache Savings Banner */}
        {totalCacheReadTokens > 0 && (
          <div
            style={{
              backgroundColor: "rgba(6, 182, 212, 0.1)",
              border: "1px solid #0891b2",
              borderRadius: 4,
              padding: "6px 10px",
              fontSize: 11,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ color: "#a5f3fc" }}>
              ⚡ Prompt Cache Efficiency: {cacheEfficiencyPercent.toFixed(1)}%
            </span>
            <span style={{ color: "#67e8f9", fontWeight: 700 }}>
              Saved ~{formatCost(cacheSavingsUsd)}
            </span>
          </div>
        )}

        {/* View Switcher Tabs */}
        <div
          style={{ display: "flex", gap: 6, borderBottom: "1px solid #27272a", paddingBottom: 6 }}
        >
          <button
            type="button"
            className={`analytics-filter-pill ${activeTab === "models" ? "active" : ""}`}
            onClick={() => setActiveTab("models")}
          >
            By Model ({byModel.length})
          </button>
          <button
            type="button"
            className={`analytics-filter-pill ${activeTab === "roles" ? "active" : ""}`}
            onClick={() => setActiveTab("roles")}
          >
            By Role
          </button>
          <button
            type="button"
            className={`analytics-filter-pill ${activeTab === "tiers" ? "active" : ""}`}
            onClick={() => setActiveTab("tiers")}
          >
            Tier Simulation
          </button>
        </div>

        {/* Table 1: By Model */}
        {activeTab === "models" && (
          <table className="token-models-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Tier</th>
                <th>Nodes</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {byModel.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", color: "#71717a" }}>
                    No model telemetry recorded
                  </td>
                </tr>
              ) : (
                byModel.map((m) => (
                  <tr key={`model-${m.model}`}>
                    <td style={{ fontWeight: 600 }}>{m.model}</td>
                    <td>
                      <span className={`tier-badge ${m.tier}`}>{m.tier}</span>
                    </td>
                    <td>{m.nodeCount}</td>
                    <td>{formatTokens(m.totalTokens)}</td>
                    <td>{formatCost(m.costUsd)}</td>
                    <td>{m.percentageOfTokens.toFixed(1)}%</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* Table 2: By Role */}
        {activeTab === "roles" && (
          <table className="token-models-table">
            <thead>
              <tr>
                <th>Token Category</th>
                <th>Token Count</th>
                <th>Percentage</th>
                <th>Est Cost</th>
              </tr>
            </thead>
            <tbody>
              {byRole.map((r) => (
                <tr key={`role-row-${r.role}`}>
                  <td style={{ fontWeight: 600 }}>{r.label}</td>
                  <td>{r.tokens.toLocaleString()}</td>
                  <td>{r.percentage.toFixed(1)}%</td>
                  <td>{formatCost(r.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Table 3: By Tier Simulation */}
        {activeTab === "tiers" && (
          <div>
            <table className="token-models-table">
              <thead>
                <tr>
                  <th>Model Tier</th>
                  <th>Simulated Total Cost</th>
                  <th>Variance vs Actual</th>
                </tr>
              </thead>
              <tbody>
                {byTier.map((t) => {
                  const diff = t.simulatedCostUsd - totalCostUsd;
                  return (
                    <tr key={`tier-sim-${t.tier}`}>
                      <td>
                        <span className={`tier-badge ${t.tier}`} style={{ marginRight: 6 }}>
                          {t.tierName}
                        </span>
                        <span>{t.label}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatCost(t.simulatedCostUsd)}</td>
                      <td style={{ color: diff <= 0 ? "#10b981" : "#f59e0b" }}>
                        {diff <= 0 ? "-" : "+"}
                        {formatCost(Math.abs(diff))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
