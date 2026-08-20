import type { ExecutiveReportConfig, ExecutiveReportData, RiskLevel } from "./types";
import { UNKNOWN_LABEL } from "../../state/graphSchema";

/**
 * Escapes HTML characters to prevent XSS injection in generated reports.
 */
export function escapeHtml(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Formats a number with comma separators.
 */
function formatNumber(num: number): string {
  return Number(num).toLocaleString();
}

/**
 * Formats USD currency.
 */
/** Recorded dollars. An absent figure says so rather than rendering a confident $0.00. */
export function formatUsd(cost: number | undefined): string {
  if (cost === undefined) return UNKNOWN_LABEL;
  if (cost < 0.01 && cost > 0) {
    return `$${cost.toFixed(4)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Formats duration in milliseconds into a readable human string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * Generates an executive-ready standalone HTML document with embedded CSS and print styles.
 */
export function generateExecutiveReportHtml(
  reportData: ExecutiveReportData,
  overrideConfig?: Partial<ExecutiveReportConfig>,
): string {
  const config = { ...reportData.config, ...overrideConfig };
  const { kpi, blastRadius, tokenAttribution, findings, datasetTitle, datasetId } = reportData;
  const isDark = config.theme !== "light";

  const themeStyles = isDark
    ? `
      :root {
        --bg-body: #0d1117;
        --bg-card: #161b22;
        --bg-card-alt: #21262d;
        --border-color: #30363d;
        --text-primary: #f0f6fc;
        --text-secondary: #8b949e;
        --text-muted: #6e7681;
        --accent: #58a6ff;
        --accent-glow: rgba(88, 166, 255, 0.15);
        --danger: #f85149;
        --danger-bg: rgba(248, 81, 73, 0.15);
        --warning: #d29922;
        --warning-bg: rgba(210, 153, 34, 0.15);
        --success: #3fb950;
        --success-bg: rgba(63, 185, 80, 0.15);
      }
    `
    : `
      :root {
        --bg-body: #f6f8fa;
        --bg-card: #ffffff;
        --bg-card-alt: #f3f4f6;
        --border-color: #d0d7de;
        --text-primary: #1f2328;
        --text-secondary: #57606a;
        --text-muted: #8c959f;
        --accent: #0969da;
        --accent-glow: rgba(9, 105, 218, 0.1);
        --danger: #cf222e;
        --danger-bg: #ffebe9;
        --warning: #9a6700;
        --warning-bg: #fff8c5;
        --success: #1a7f37;
        --success-bg: #dafbe1;
      }
    `;

  const getRiskBadgeClass = (risk: RiskLevel) => {
    switch (risk) {
      case "critical":
        return "badge-risk-critical";
      case "high":
        return "badge-risk-high";
      case "medium":
        return "badge-risk-medium";
      default:
        return "badge-risk-low";
    }
  };

  const getHealthColorClass = (score: number) => {
    if (score >= 85) return "color-success";
    if (score >= 65) return "color-warning";
    return "color-danger";
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(config.title || "Executive Pipeline Report")}</title>
  <style>
    ${themeStyles}

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: var(--bg-body);
      color: var(--text-primary);
      line-height: 1.5;
      padding: 24px;
      font-size: 14px;
    }

    .report-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid var(--border-color);
      padding-bottom: 20px;
      margin-bottom: 24px;
    }

    .header-titles h1 {
      font-size: 24px;
      font-weight: 700;
      color: var(--text-primary);
      letter-spacing: -0.02em;
      margin-bottom: 4px;
    }

    .header-titles .subtitle {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .header-meta {
      text-align: right;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .header-meta .confidential-badge {
      display: inline-block;
      padding: 4px 8px;
      border-radius: 4px;
      background: var(--danger-bg);
      color: var(--danger);
      font-weight: 700;
      font-size: 11px;
      letter-spacing: 0.05em;
      margin-bottom: 6px;
      border: 1px solid var(--danger);
    }

    .print-actions {
      margin-bottom: 20px;
      display: flex;
      gap: 12px;
    }

    .btn-action {
      background: var(--accent);
      color: #ffffff;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .btn-action:hover {
      opacity: 0.9;
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin-top: 32px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-left: 4px solid var(--accent);
      padding-left: 10px;
    }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .metric-card {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      break-inside: avoid;
    }

    .metric-card .card-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-secondary);
      margin-bottom: 6px;
    }

    .metric-card .card-value {
      font-size: 26px;
      font-weight: 700;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .metric-card .card-subtext {
      font-size: 12px;
      color: var(--text-muted);
    }

    .color-success { color: var(--success) !important; }
    .color-warning { color: var(--warning) !important; }
    .color-danger { color: var(--danger) !important; }
    .color-accent { color: var(--accent) !important; }

    .data-table-container {
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow-x: auto;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      break-inside: avoid;
    }

    table.data-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }

    table.data-table th {
      background-color: var(--bg-card-alt);
      color: var(--text-secondary);
      font-weight: 600;
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-color);
      white-space: nowrap;
    }

    table.data-table td {
      padding: 10px 14px;
      border-bottom: 1px solid var(--border-color);
      color: var(--text-primary);
    }

    table.data-table tr:last-child td {
      border-bottom: none;
    }

    table.data-table tr:hover {
      background-color: var(--bg-card-alt);
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    .badge-risk-critical {
      background-color: var(--danger-bg);
      color: var(--danger);
      border: 1px solid var(--danger);
    }

    .badge-risk-high {
      background-color: #ff990022;
      color: #ff9900;
      border: 1px solid #ff9900;
    }

    .badge-risk-medium {
      background-color: var(--warning-bg);
      color: var(--warning);
      border: 1px solid var(--warning);
    }

    .badge-risk-low {
      background-color: var(--success-bg);
      color: var(--success);
      border: 1px solid var(--success);
    }

    .custom-notes-box {
      background-color: var(--bg-card);
      border-left: 4px solid var(--accent);
      border-top: 1px solid var(--border-color);
      border-right: 1px solid var(--border-color);
      border-bottom: 1px solid var(--border-color);
      border-radius: 6px;
      padding: 14px 18px;
      margin-bottom: 24px;
      font-size: 13px;
      color: var(--text-primary);
    }

    .progress-bar-container {
      width: 100%;
      height: 8px;
      background-color: var(--bg-card-alt);
      border-radius: 4px;
      overflow: hidden;
      margin-top: 4px;
    }

    .progress-bar-fill {
      height: 100%;
      background-color: var(--accent);
      border-radius: 4px;
    }

    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid var(--border-color);
      text-align: center;
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Print Stylesheet for High-Quality PDF Export */
    @media print {
      body {
        background-color: #ffffff !important;
        color: #000000 !important;
        padding: 0;
        font-size: 11pt;
      }

      .print-actions {
        display: none !important;
      }

      .report-container {
        max-width: 100%;
        margin: 0;
      }

      .metric-card,
      .data-table-container,
      .custom-notes-box {
        background-color: #ffffff !important;
        border: 1px solid #cccccc !important;
        color: #000000 !important;
        box-shadow: none !important;
        break-inside: avoid;
        page-break-inside: avoid;
      }

      table.data-table th {
        background-color: #f0f0f0 !important;
        color: #000000 !important;
      }

      table.data-table td {
        color: #000000 !important;
      }

      .badge-risk-critical {
        background-color: #ffebe9 !important;
        color: #cf222e !important;
        border: 1px solid #cf222e !important;
      }

      .badge-risk-high {
        background-color: #fff8c5 !important;
        color: #9a6700 !important;
        border: 1px solid #9a6700 !important;
      }

      .badge-risk-medium {
        background-color: #fff8c5 !important;
        color: #9a6700 !important;
      }

      .badge-risk-low {
        background-color: #dafbe1 !important;
        color: #1a7f37 !important;
      }

      @page {
        size: A4 portrait;
        margin: 12mm 10mm 12mm 10mm;
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="print-actions">
      <button class="btn-action" onclick="window.print()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 6 2 18 2 18 9"></polyline>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
          <rect x="6" y="14" width="12" height="8"></rect>
        </svg>
        Print / Save as PDF
      </button>
    </div>

    <header class="report-header">
      <div class="header-titles">
        <h1>${escapeHtml(config.title || "Executive Pipeline & Incident Report")}</h1>
        <div class="subtitle">${escapeHtml(config.subtitle || `Pipeline ID: ${datasetId}`)}</div>
      </div>
      <div class="header-meta">
        <div class="confidential-badge">CONFIDENTIAL // ARCHITECTURE AUDIT</div>
        <div><strong>Dataset:</strong> ${escapeHtml(datasetTitle)}</div>
        <div><strong>Generated:</strong> ${escapeHtml(reportData.generatedAt)}</div>
        <div><strong>Author:</strong> ${escapeHtml(config.generatedBy || "GVUI Platform")}</div>
      </div>
    </header>

    ${
      config.customNotes
        ? `
    <div class="custom-notes-box">
      <strong>Executive Context / Remarks:</strong>
      <p style="margin-top: 4px;">${escapeHtml(config.customNotes)}</p>
    </div>
    `
        : ""
    }

    ${
      config.includeScorecard
        ? `
    <section>
      <h2 class="section-title">
        Executive KPI Scorecard
        <span class="badge ${getRiskBadgeClass(kpi.healthScore >= 85 ? "low" : kpi.healthScore >= 60 ? "medium" : "critical")}">
          Health Score: ${kpi.healthScore}/100
        </span>
      </h2>
      <div class="card-grid">
        <div class="metric-card">
          <div class="card-label">System Health</div>
          <div class="card-value ${getHealthColorClass(kpi.healthScore)}">${kpi.healthScore}%</div>
          <div class="card-subtext">${kpi.failureRate === 0 ? "Zero Active Faults" : `${kpi.failureRate}% Failure Rate`}</div>
        </div>

        <div class="metric-card">
          <div class="card-label">Topology Scale</div>
          <div class="card-value color-accent">${formatNumber(kpi.totalNodes)} Nodes</div>
          <div class="card-subtext">${formatNumber(kpi.totalEdges)} Dependency Edges</div>
        </div>

        <div class="metric-card">
          <div class="card-label">MTTR (Mean Recovery)</div>
          <div class="card-value">${formatDuration(kpi.mttrMs)}</div>
          <div class="card-subtext">Efficiency: ${kpi.recoveryEfficiency}% (${kpi.totalRepairRounds} repairs)</div>
        </div>

        <div class="metric-card">
          <div class="card-label">Total Token Volume</div>
          <div class="card-value">${formatNumber(kpi.totalTokens)}</div>
          <div class="card-subtext">Cost: ${formatUsd(kpi.totalCostUsd)} (${formatNumber(kpi.reasoningTokens)} reasoning)</div>
        </div>

        <div class="metric-card">
          <div class="card-label">Execution Velocity</div>
          <div class="card-value">${formatDuration(kpi.totalDurationMs)}</div>
          <div class="card-subtext">${kpi.throughputNodesPerSec} nodes / sec throughput</div>
        </div>

        <div class="metric-card">
          <div class="card-label">Critical Path Span</div>
          <div class="card-value">${formatDuration(kpi.criticalPathDurationMs)}</div>
          <div class="card-subtext">${kpi.criticalPathNodeCount} Sequential Bottleneck Nodes</div>
        </div>
      </div>
    </section>
    `
        : ""
    }

    ${
      config.includeBlastRadius
        ? `
    <section>
      <h2 class="section-title">
        Downstream Failure Blast Radius &amp; Risk Matrix
        <span class="badge ${blastRadius.criticalCount > 0 ? "badge-risk-critical" : "badge-risk-low"}">
          Fragility Index: ${blastRadius.overallFragilityIndex}/100
        </span>
      </h2>
      <div class="card-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 16px;">
        <div class="metric-card" style="padding: 10px;">
          <div class="card-label">Critical Risk Nodes</div>
          <div class="card-value color-danger">${blastRadius.criticalCount}</div>
        </div>
        <div class="metric-card" style="padding: 10px;">
          <div class="card-label">High Risk Nodes</div>
          <div class="card-value color-warning">${blastRadius.highCount}</div>
        </div>
        <div class="metric-card" style="padding: 10px;">
          <div class="card-label">Medium Risk Nodes</div>
          <div class="card-value">${blastRadius.mediumCount}</div>
        </div>
        <div class="metric-card" style="padding: 10px;">
          <div class="card-label">Low Risk Nodes</div>
          <div class="card-value color-success">${blastRadius.lowCount}</div>
        </div>
      </div>

      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Node Name / ID</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Direct / Transitive Reach</th>
              <th>Max Depth</th>
              <th>Blast Score</th>
              <th>Risk Level</th>
              <th>Cost at Risk</th>
              <th>Remediation Action</th>
            </tr>
          </thead>
          <tbody>
            ${
              blastRadius.items.length === 0
                ? `<tr><td colspan="9" style="text-align: center; color: var(--text-muted);">No nodes present in dataset.</td></tr>`
                : blastRadius.items
                    .slice(0, 15)
                    .map(
                      (item) => `
              <tr>
                <td><strong>${escapeHtml(item.nodeName)}</strong><br><small style="color: var(--text-muted);">${escapeHtml(item.nodeId)}</small></td>
                <td>${escapeHtml(item.kind || UNKNOWN_LABEL)}</td>
                <td>${escapeHtml(item.status || UNKNOWN_LABEL)}</td>
                <td>${item.directDownstreamCount} direct &rarr; ${item.transitiveDownstreamCount} total</td>
                <td>${item.maxCascadeDepth} hops</td>
                <td><strong>${item.blastRadiusScore}</strong>/100</td>
                <td><span class="badge ${getRiskBadgeClass(item.riskLevel)}">${item.riskLevel}</span></td>
                <td>${formatUsd(item.estimatedCostAtRiskUsd)}</td>
                <td style="font-size: 12px;">${escapeHtml(item.remediationRecommendation)}</td>
              </tr>
            `,
                    )
                    .join("")
            }
          </tbody>
        </table>
      </div>
    </section>
    `
        : ""
    }

    ${
      config.includeTokenAttribution
        ? `
    <section>
      <h2 class="section-title">Token Consumption &amp; Cost Attribution</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Model / Engine</th>
                <th>Node Count</th>
                <th>Total Tokens</th>
                <th>Cost (USD)</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              ${
                tokenAttribution.byModel.length === 0
                  ? `<tr><td colspan="5" style="text-align:center;">No model data</td></tr>`
                  : tokenAttribution.byModel
                      .map(
                        (m) => `
                <tr>
                  <td><strong>${escapeHtml(m.category)}</strong></td>
                  <td>${m.nodeCount}</td>
                  <td>${formatNumber(m.tokens)}</td>
                  <td>${formatUsd(m.costUsd)}</td>
                  <td>${m.percentage}%</td>
                </tr>
              `,
                      )
                      .join("")
              }
            </tbody>
          </table>
        </div>

        <div class="data-table-container">
          <table class="data-table">
            <thead>
              <tr>
                <th>Pipeline Section / Cluster</th>
                <th>Nodes</th>
                <th>Tokens</th>
                <th>Cost (USD)</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              ${
                tokenAttribution.bySection.length === 0
                  ? `<tr><td colspan="5" style="text-align:center;">No section data</td></tr>`
                  : tokenAttribution.bySection
                      .map(
                        (s) => `
                <tr>
                  <td><strong>${escapeHtml(s.category)}</strong></td>
                  <td>${s.nodeCount}</td>
                  <td>${formatNumber(s.tokens)}</td>
                  <td>${formatUsd(s.costUsd)}</td>
                  <td>${s.percentage}%</td>
                </tr>
              `,
                      )
                      .join("")
              }
            </tbody>
          </table>
        </div>
      </div>
    </section>
    `
        : ""
    }

    ${
      config.includeFindings && findings.length > 0
        ? `
    <section>
      <h2 class="section-title">Audit Findings &amp; Incident Evidence</h2>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Node</th>
              <th>Severity</th>
              <th>Observation</th>
              <th>Remediation</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${findings
              .map(
                (f) => `
              <tr>
                <td><code>${escapeHtml(f.id)}</code></td>
                <td><strong>${escapeHtml(f.nodeName)}</strong></td>
                <td><span class="badge ${f.severity === "critical" ? "badge-risk-critical" : f.severity === "important" ? "badge-risk-high" : "badge-risk-medium"}">${f.severity}</span></td>
                <td>${escapeHtml(f.observation)}</td>
                <td>${escapeHtml(f.remediation || "N/A")}</td>
                <td><span class="badge ${f.status === "resolved" ? "badge-risk-low" : "badge-risk-critical"}">${f.status}</span></td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </section>
    `
        : ""
    }

    <footer class="footer">
      Generated automatically by GVUI Executive Intelligence Suite &bull; Export format: Standalone HTML / PDF Print Ready
    </footer>
  </div>
</body>
</html>`;
}

/**
 * Generates an executive-level GitHub-flavored Markdown report.
 */
export function generateExecutiveReportMarkdown(
  reportData: ExecutiveReportData,
  overrideConfig?: Partial<ExecutiveReportConfig>,
): string {
  const config = { ...reportData.config, ...overrideConfig };
  const { kpi, blastRadius, tokenAttribution, findings, datasetTitle, datasetId } = reportData;

  const lines: string[] = [];

  lines.push(`# ${config.title || "Executive Pipeline & Incident Report"}`);
  lines.push(
    `> **Pipeline:** ${datasetTitle} (\`${datasetId}\`) | **Generated:** ${reportData.generatedAt} | **Author:** ${config.generatedBy || "GVUI Platform"}`,
  );
  lines.push("");

  if (config.customNotes) {
    lines.push("### Executive Context & Notes");
    lines.push(config.customNotes);
    lines.push("");
  }

  if (config.includeScorecard) {
    lines.push("## Executive KPI Scorecard");
    lines.push("");
    lines.push("| Metric | Value | Reference Detail |");
    lines.push("| :--- | :--- | :--- |");
    lines.push(
      `| **System Health Score** | **${kpi.healthScore}/100** | ${kpi.failureRate === 0 ? "Zero Active Faults" : `${kpi.failureRate}% Failure Rate`} |`,
    );
    lines.push(
      `| **Topology Scale** | ${formatNumber(kpi.totalNodes)} Nodes / ${formatNumber(kpi.totalEdges)} Edges | ${kpi.successCount} Success, ${kpi.failureCount} Failed |`,
    );
    lines.push(
      `| **MTTR (Mean Time to Recovery)** | ${formatDuration(kpi.mttrMs)} | ${kpi.recoveryEfficiency}% Recovery Efficiency (${kpi.totalRepairRounds} repairs) |`,
    );
    lines.push(
      `| **Token & Cost Volume** | ${formatNumber(kpi.totalTokens)} Tokens | ${formatUsd(kpi.totalCostUsd)} USD (${formatNumber(kpi.reasoningTokens)} reasoning) |`,
    );
    lines.push(
      `| **Execution Duration** | ${formatDuration(kpi.totalDurationMs)} | ${kpi.throughputNodesPerSec} nodes / sec throughput |`,
    );
    lines.push(
      `| **Critical Path Latency** | ${formatDuration(kpi.criticalPathDurationMs)} | ${kpi.criticalPathNodeCount} Sequential Bottleneck Nodes |`,
    );
    lines.push("");
  }

  if (config.includeBlastRadius) {
    lines.push("## Failure Blast Radius & Downstream Risk Matrix");
    lines.push(`- **Overall Fragility Index:** ${blastRadius.overallFragilityIndex}/100`);
    lines.push(
      `- **Risk Distribution:** ${blastRadius.criticalCount} Critical | ${blastRadius.highCount} High | ${blastRadius.mediumCount} Medium | ${blastRadius.lowCount} Low`,
    );
    lines.push("");
    lines.push(
      "| Node ID | Name | Kind | Reach (Direct / Transitive) | Depth | Blast Score | Risk Level | Est. Cost at Risk | Remediation |",
    );
    lines.push("| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |");

    const topItems = blastRadius.items.slice(0, 15);
    for (const item of topItems) {
      lines.push(
        `| \`${item.nodeId}\` | ${item.nodeName} | ${item.kind || UNKNOWN_LABEL} | ${item.directDownstreamCount} / ${item.transitiveDownstreamCount} | ${item.maxCascadeDepth} | ${item.blastRadiusScore}/100 | **${item.riskLevel.toUpperCase()}** | ${formatUsd(item.estimatedCostAtRiskUsd)} | ${item.remediationRecommendation} |`,
      );
    }
    lines.push("");
  }

  if (config.includeTokenAttribution) {
    lines.push("## Token & Cost Attribution");
    lines.push("");
    lines.push("### Model Breakdown");
    lines.push("| Model | Node Count | Total Tokens | Cost (USD) | Share (%) |");
    lines.push("| :--- | :--- | :--- | :--- | :--- |");
    for (const m of tokenAttribution.byModel) {
      lines.push(
        `| ${m.category} | ${m.nodeCount} | ${formatNumber(m.tokens)} | ${formatUsd(m.costUsd)} | ${m.percentage}% |`,
      );
    }
    lines.push("");

    lines.push("### Section Breakdown");
    lines.push("| Section / Cluster | Nodes | Tokens | Cost (USD) | Share (%) |");
    lines.push("| :--- | :--- | :--- | :--- | :--- |");
    for (const s of tokenAttribution.bySection) {
      lines.push(
        `| ${s.category} | ${s.nodeCount} | ${formatNumber(s.tokens)} | ${formatUsd(s.costUsd)} | ${s.percentage}% |`,
      );
    }
    lines.push("");
  }

  if (config.includeFindings && findings.length > 0) {
    lines.push("## Audit Findings & Observations");
    lines.push("| ID | Node | Severity | Observation | Status |");
    lines.push("| :--- | :--- | :--- | :--- | :--- |");
    for (const f of findings) {
      lines.push(
        `| \`${f.id}\` | ${f.nodeName} | **${f.severity.toUpperCase()}** | ${f.observation} | ${f.status.toUpperCase()} |`,
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Report generated by GVUI Executive Intelligence Engine.*");

  return lines.join("\n");
}

/**
 * Generates a structured JSON string representation of the report.
 */
export function generateExecutiveReportJson(
  reportData: ExecutiveReportData,
  overrideConfig?: Partial<ExecutiveReportConfig>,
): string {
  const merged: ExecutiveReportData = {
    ...reportData,
    config: {
      ...reportData.config,
      ...overrideConfig,
    },
  };
  return JSON.stringify(merged, null, 2);
}

/**
 * Utility for triggering file downloads in the browser environment.
 */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function downloadReportHtml(reportData: ExecutiveReportData, filename?: string): void {
  const name = filename || `executive-report-${reportData.datasetId || "pipeline"}.html`;
  const content = generateExecutiveReportHtml(reportData);
  downloadFile(content, name, "text/html;charset=utf-8");
}

export function downloadReportMarkdown(reportData: ExecutiveReportData, filename?: string): void {
  const name = filename || `executive-report-${reportData.datasetId || "pipeline"}.md`;
  const content = generateExecutiveReportMarkdown(reportData);
  downloadFile(content, name, "text/markdown;charset=utf-8");
}

export function downloadReportJson(reportData: ExecutiveReportData, filename?: string): void {
  const name = filename || `executive-report-${reportData.datasetId || "pipeline"}.json`;
  const content = generateExecutiveReportJson(reportData);
  downloadFile(content, name, "application/json;charset=utf-8");
}

/**
 * Opens a print dialog for PDF export via browser window.
 */
export function printReportPdf(reportData: ExecutiveReportData): void {
  if (typeof window === "undefined") {
    return;
  }
  const html = generateExecutiveReportHtml(reportData, { theme: "light" });
  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  }
}
