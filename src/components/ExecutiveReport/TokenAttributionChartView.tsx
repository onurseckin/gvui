import type { FC } from "react";
import type { TokenAttribution } from "../../engine/reporting/types";

export interface TokenAttributionChartViewProps {
  attribution: TokenAttribution;
  theme?: "dark" | "light";
}

function formatUsd(cost: number): string {
  if (cost < 0.01 && cost > 0) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

export const TokenAttributionChartView: FC<TokenAttributionChartViewProps> = ({ attribution }) => {
  return (
    <div className="token-attribution-view-wrapper">
      {/* Summary KPI row */}
      <div className="scorecard-summary-grid" style={{ marginBottom: "16px" }}>
        <div className="kpi-card">
          <div className="kpi-card-header">Total Token Volume</div>
          <div className="kpi-card-value color-accent">
            {attribution.totalTokens.toLocaleString()}
          </div>
          <div className="kpi-card-sub">Across all pipeline operations</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">Estimated API Cost</div>
          <div className="kpi-card-value color-success">{formatUsd(attribution.totalCostUsd)}</div>
          <div className="kpi-card-sub">LLM inference expenditure</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">Model Diversity</div>
          <div className="kpi-card-value">{attribution.byModel.length} Models</div>
          <div className="kpi-card-sub">{attribution.byTier.length} active compute tiers</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-card-header">Cluster Partitions</div>
          <div className="kpi-card-value">{attribution.bySection.length} Sections</div>
          <div className="kpi-card-sub">Pipeline execution groupings</div>
        </div>
      </div>

      {/* Distribution Charts Grid */}
      <div className="token-chart-grid">
        {/* By Model */}
        <div className="token-chart-card">
          <div className="token-chart-title">Token Distribution by Model</div>
          {attribution.byModel.length === 0 ? (
            <div style={{ color: "#888", fontSize: "12px" }}>No model data available</div>
          ) : (
            attribution.byModel.map((item) => (
              <div className="token-bar-row" key={item.category}>
                <div className="token-bar-header">
                  <span>
                    <strong>{item.category}</strong> ({item.nodeCount} nodes)
                  </span>
                  <span>
                    {item.tokens.toLocaleString()} tok &bull; {formatUsd(item.costUsd)} (
                    {item.percentage}%)
                  </span>
                </div>
                <div className="token-bar-track">
                  <div
                    className="token-bar-fill"
                    style={{ width: `${Math.max(2, Math.min(100, item.percentage))}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* By Section */}
        <div className="token-chart-card">
          <div className="token-chart-title">Token Distribution by Section</div>
          {attribution.bySection.length === 0 ? (
            <div style={{ color: "#888", fontSize: "12px" }}>No section data available</div>
          ) : (
            attribution.bySection.map((item) => (
              <div className="token-bar-row" key={item.category}>
                <div className="token-bar-header">
                  <span>
                    <strong>{item.category}</strong> ({item.nodeCount} nodes)
                  </span>
                  <span>
                    {item.tokens.toLocaleString()} tok &bull; {formatUsd(item.costUsd)} (
                    {item.percentage}%)
                  </span>
                </div>
                <div className="token-bar-track">
                  <div
                    className="token-bar-fill"
                    style={{
                      width: `${Math.max(2, Math.min(100, item.percentage))}%`,
                      background: "linear-gradient(90deg, #10b981, #34d399)",
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Node Token Breakdown Table */}
      <div className="data-table-container">
        <table className="blast-table" data-testid="token-attribution-table">
          <thead>
            <tr>
              <th>Node Name</th>
              <th>Model / Tier</th>
              <th>Prompt In</th>
              <th>Completion Out</th>
              <th>Reasoning</th>
              <th>Total Tokens</th>
              <th>Cost (USD)</th>
              <th>Share (%)</th>
            </tr>
          </thead>
          <tbody>
            {attribution.byNode.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: "center", padding: "20px", color: "#888" }}>
                  No node token data available.
                </td>
              </tr>
            ) : (
              attribution.byNode.map((node) => (
                <tr key={node.nodeId}>
                  <td>
                    <strong>{node.nodeName}</strong>
                    <div style={{ fontSize: "10px", color: "#71717a" }}>{node.nodeId}</div>
                  </td>
                  <td>
                    {node.model || "standard"}{" "}
                    <span style={{ fontSize: "10px", color: "#a1a1aa" }}>({node.tier || "M"})</span>
                  </td>
                  <td>{node.tokensIn.toLocaleString()}</td>
                  <td>{node.tokensOut.toLocaleString()}</td>
                  <td>{node.reasoningTokens.toLocaleString()}</td>
                  <td>
                    <strong>{node.totalTokens.toLocaleString()}</strong>
                  </td>
                  <td>{formatUsd(node.costUsd)}</td>
                  <td>
                    <strong>{node.tokenPercentage}%</strong>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
