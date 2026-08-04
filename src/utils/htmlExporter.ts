import { resolveCustomLayoutConfig, type CustomLayoutConfig } from "../engine/layout/custom/config";
import { buildEdgePath } from "../engine/layout/custom/edgePath";
import { computeGraphLayout } from "../engine/layout/layoutDispatcher";
import type { LayoutMode } from "../state/useGraphStore";
import type { GraphDataset, GraphNodeData, NodeBadge, NodeTool } from "../types/graphData";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function deriveStatusVariant(node: GraphNodeData): string {
  const statusBadge = node.badges?.find((b) => b.variant);
  if (statusBadge?.variant) {
    return statusBadge.variant;
  }
  const statusStr = String(node.metadata?.status ?? "").toLowerCase();
  if (statusStr.includes("complete") || statusStr.includes("success")) {
    return "success";
  }
  if (statusStr.includes("error") || statusStr.includes("fail")) {
    return "error";
  }
  if (statusStr.includes("running") || statusStr.includes("pending")) {
    return "amber";
  }
  return "info";
}

function resolveToolIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("grep") || lower.includes("search") || lower.includes("find")) {
    return "🔧";
  }
  if (
    lower.includes("script") ||
    lower.includes(".sh") ||
    lower.includes("bash") ||
    lower.includes("exec")
  ) {
    return "📜";
  }
  if (lower.includes("read") || lower.includes("write") || lower.includes("file")) {
    return "📁";
  }
  if (lower.includes("http") || lower.includes("fetch") || lower.includes("web")) {
    return "🌐";
  }
  return "🛠️";
}

function generateNodeHtml(node: GraphNodeData, x: number, y: number, width: number): string {
  const statusVariant = deriveStatusVariant(node);
  const escapedName = escapeHtml(node.name);
  const escapedType = node.type ? escapeHtml(node.type) : null;
  const escapedDesc = node.description ? escapeHtml(node.description) : null;

  let badgesHtml = "";
  if (node.badges && node.badges.length > 0) {
    const badgeItems = node.badges
      .map((b: NodeBadge) => {
        const v = b.variant ?? "gray";
        return `<span class="node-card-badge-pill badge-${v}">${escapeHtml(b.label)}</span>`;
      })
      .join("");
    badgesHtml = `<div class="node-card-badges">${badgeItems}</div>`;
  }

  let toolsHtml = "";
  if (node.tools && node.tools.length > 0) {
    const toolItems = node.tools
      .map((t: NodeTool) => {
        const icon = resolveToolIcon(t.name);
        return `<span class="node-card-tool-chip"><span class="tool-icon">${icon}</span><code class="tool-name">${escapeHtml(t.name)}</code></span>`;
      })
      .join("");
    toolsHtml = `<div class="node-card-tools">${toolItems}</div>`;
  }

  const contextRows: Array<{ key: string; value: string }> = [];
  if (node.context?.repoPath) {
    contextRows.push({ key: "Repo Path", value: String(node.context.repoPath) });
  }
  if (node.context) {
    for (const [k, v] of Object.entries(node.context)) {
      if (k === "repoPath" || k === "previousOutputs") continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        contextRows.push({ key: k, value: String(v) });
      }
    }
  }
  if (node.metadata) {
    const skippedKeys = new Set(["prompt", "logs", "payload", "rawPayload", "status"]);
    for (const [k, v] of Object.entries(node.metadata)) {
      if (skippedKeys.has(k)) continue;
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        contextRows.push({ key: k, value: String(v) });
      }
    }
  }

  let contextHtml = "";
  if (contextRows.length > 0) {
    const rowsStr = contextRows
      .map(
        (r) =>
          `<div class="node-card-context-row"><span class="context-key">${escapeHtml(r.key)}:</span><span class="context-value" title="${escapeHtml(r.value)}">${escapeHtml(r.value)}</span></div>`,
      )
      .join("");
    contextHtml = `<div class="node-card-context">${rowsStr}</div>`;
  }

  let detailsHtml = "";
  const prompt = typeof node.metadata?.prompt === "string" ? node.metadata.prompt : null;
  const logs = typeof node.metadata?.logs === "string" ? node.metadata.logs : null;
  const hasPayload = Boolean(node.metadata && Object.keys(node.metadata).length > 0);

  if (prompt || logs || hasPayload) {
    const parts: string[] = [];
    if (prompt) parts.push(`--- PROMPT ---\n${prompt}`);
    if (logs) parts.push(`--- LOGS ---\n${logs}`);
    if (hasPayload && node.metadata)
      parts.push(`--- PAYLOAD ---\n${JSON.stringify(node.metadata, null, 2)}`);
    const content = escapeHtml(parts.join("\n\n"));
    detailsHtml = `
      <details class="node-card-details-disclosure">
        <summary class="node-card-details-toggle">► Raw Payload / Logs</summary>
        <pre class="node-card-details-content"><code>${content}</code></pre>
      </details>
    `;
  }

  return `
    <div
      class="node-card status-${statusVariant}"
      data-node-id="${escapeHtml(node.id)}"
      style="position: absolute; transform: translate(${x}px, ${y}px); width: ${width}px;"
    >
      <header class="node-card-header">
        <div class="node-card-header-main">
          <span class="node-card-status-dot status-${statusVariant}" title="Status: ${statusVariant}"></span>
          <h3 class="node-card-title">${escapedName}</h3>
          ${escapedType ? `<span class="node-card-type-tag">${escapedType}</span>` : ""}
        </div>
      </header>
      ${escapedDesc ? `<p class="node-card-description">${escapedDesc}</p>` : ""}
      ${badgesHtml}
      ${toolsHtml}
      ${contextHtml}
      ${detailsHtml}
    </div>
  `;
}

export interface ExportGraphAsHTMLOptions {
  /** Defaults to `"layered"` — the v2 name for the old `"top-down"` mode this used to hardcode. */
  mode?: LayoutMode | string;
  /** The live editor config, so the export matches whatever the user has tuned on-screen. */
  configPartial?: Partial<CustomLayoutConfig>;
}

export async function exportGraphAsHTML(
  dataset: GraphDataset,
  options?: ExportGraphAsHTMLOptions,
): Promise<void> {
  if (!dataset) return;

  const mode = options?.mode ?? "layered";
  const config = resolveCustomLayoutConfig(options?.configPartial);
  const { nodes, edges } = await computeGraphLayout(dataset, mode, options?.configPartial);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    minX = Math.min(minX, node.x);
    maxX = Math.max(maxX, node.x + node.width);
    minY = Math.min(minY, node.y);
    maxY = Math.max(maxY, node.y + node.height);
  }

  const padding = 80;
  const offsetX = padding - (minX < padding ? minX : 0);
  const offsetY = padding - (minY < padding ? minY : 0);

  const stageWidth = Math.max(1200, maxX + offsetX + padding);
  const stageHeight = Math.max(800, maxY + offsetY + padding);

  const nodesHtml = nodes
    .map((node) => generateNodeHtml(node, node.x + offsetX, node.y + offsetY, node.width))
    .join("\n");

  const edgesSvg = edges
    .map((edge) => {
      const markerId = edge.isCycle ? "url(#edge-arrowhead-cycle)" : "url(#edge-arrowhead)";
      const labelX = (edge.labelX ?? 0) + offsetX;
      const labelY = (edge.labelY ?? 0) + offsetY;

      // Rebuilt from the routed waypoints rather than trusting `edge.path` verbatim: GraphCanvas's
      // own edge-style pass (see `custom/edgePath.ts`) re-derives `path` from `points` on every
      // render because `cornerRadius`/`edgeStyle` are pure client-side rendering decisions, not
      // part of the layout. Doing the same here is what makes a corner-rounding tweak the user made
      // on-screen actually show up in the exported file.
      const path =
        edge.points && edge.points.length > 0
          ? buildEdgePath(edge.points, config.edgeStyle, config.cornerRadius)
          : edge.path;

      let badgeOverlayHtml = "";
      if (edge.label || edge.isCycle) {
        const displayText = edge.isCycle
          ? edge.label
            ? `↺ ${escapeHtml(edge.label)}`
            : "↺"
          : escapeHtml(edge.label ?? "");
        const labelLen = edge.isCycle
          ? edge.label
            ? edge.label.length + 2
            : 1
          : (edge.label ?? "").length;
        const width = Math.max(60, labelLen * 7 + 24);
        const height = 28;
        badgeOverlayHtml = `
          <g transform="translate(${labelX}, ${labelY})" class="edge-badge-group ${edge.isCycle ? "cycle" : ""}">
            <rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="14" ry="14" fill="#0f172a" stroke="#1e293b" class="edge-badge-rect ${edge.isCycle ? "cycle" : ""}" />
            <text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="11" font-family="var(--font-mono)" font-weight="600" class="edge-badge-text">${displayText}</text>
          </g>
        `;
      }

      return `
        <g class="graph-edge-group" data-edge-id="${escapeHtml(edge.id)}" data-source="${escapeHtml(edge.source)}" data-target="${escapeHtml(edge.target)}">
          <path d="${path}" class="edge-backdrop" />
          <path d="${path}" class="graph-edge-path ${edge.isCycle ? "cycle" : ""}" marker-end="${edge.directed !== false ? markerId : ""}" />
          ${badgeOverlayHtml}
        </g>
      `;
    })
    .join("\n");

  const exportDate = new Date().toLocaleString();
  const graphTitle = escapeHtml(dataset.title || dataset.id);
  const graphId = escapeHtml(dataset.id);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${graphTitle} - GVUI Standalone Export</title>
  <style>
    :root {
      --sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --mono: ui-monospace, SFMono-Regular, Consolas, monospace;
      --bg-app: #080b11;
      --bg-header: #0f172a;
      --bg-canvas: #090d16;
      --bg-card: #131b2e;
      --text-color: #cbd5e1;
      --text-heading: #ffffff;
      --text-muted: #64748b;
      --border-color: #1e2638;
      --accent-color: #6366f1;
      --accent-bg: rgba(99, 102, 241, 0.15);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: var(--sans);
      background-color: var(--bg-app);
      color: var(--text-color);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: auto;
      overflow-y: auto;
    }

    .export-header {
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      background-color: var(--bg-header);
      border-bottom: 1px solid var(--border-color);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      backdrop-filter: blur(8px);
    }

    .export-title-group {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .export-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--text-heading);
    }

    .export-badge {
      font-size: 12px;
      padding: 2px 8px;
      border-radius: 9999px;
      background-color: var(--accent-bg);
      color: var(--accent-color);
      font-weight: 500;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }

    .export-meta {
      font-size: 12px;
      color: var(--text-muted);
    }

    .export-canvas-container {
      position: relative;
      flex: 1;
      min-width: ${stageWidth}px;
      min-height: ${stageHeight}px;
      background-color: var(--bg-canvas);
      background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
      background-size: 24px 24px;
      overflow: visible;
    }

    .graph-transform-stage {
      position: absolute;
      top: 0;
      left: 0;
      width: ${stageWidth}px;
      height: ${stageHeight}px;
    }

    .graph-svg-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      pointer-events: none;
    }

    .graph-svg-layer g {
      pointer-events: auto;
    }

    .graph-edge-group {
      cursor: pointer;
    }

    .edge-backdrop {
      fill: none;
      stroke: transparent;
      stroke-width: 16px;
    }

    .graph-edge-path {
      fill: none;
      stroke: var(--border-color, #9ca3af);
      stroke-width: 2px;
      transition: stroke 0.2s ease, stroke-width 0.2s ease;
    }

    .graph-edge-group:hover .graph-edge-path,
    .graph-edge-group.selected .graph-edge-path {
      stroke: #aa3bff;
      stroke-width: 3px;
    }

    .graph-edge-path.cycle {
      stroke: #f59e0b;
      stroke-dasharray: 6 4;
    }

    .edge-badge-foreign-object {
      overflow: visible;
      pointer-events: none;
    }

    .edge-badge-overlay {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: 9999px;
      background-color: #0e131f;
      border: 1px solid var(--border-color);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      font-size: 11px;
      font-weight: 500;
      color: var(--text-color);
      margin: 0 auto;
    }

    .edge-badge-overlay.cycle {
      border-color: rgba(245, 158, 11, 0.4);
      background-color: rgba(245, 158, 11, 0.1);
      color: #f59e0b;
    }

    .node-card {
      box-sizing: border-box;
      background-color: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      cursor: pointer;
      user-select: none;
    }

    .node-card:hover,
    .node-card.selected {
      border-color: #aa3bff;
      box-shadow: 0 0 12px rgba(170, 59, 255, 0.3);
    }

    .node-card.status-success { border-left: 4px solid #22c55e; }
    .node-card.status-error { border-left: 4px solid #ef4444; }
    .node-card.status-amber { border-left: 4px solid #f59e0b; }
    .node-card.status-info { border-left: 4px solid #3b82f6; }
    .node-card.status-gray { border-left: 4px solid #9ca3af; }

    .node-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .node-card-header-main {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .node-card-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .node-card-status-dot.status-success { background-color: #22c55e; box-shadow: 0 0 6px rgba(34, 197, 94, 0.5); }
    .node-card-status-dot.status-error { background-color: #ef4444; box-shadow: 0 0 6px rgba(239, 68, 68, 0.5); }
    .node-card-status-dot.status-amber { background-color: #f59e0b; box-shadow: 0 0 6px rgba(245, 158, 11, 0.5); }
    .node-card-status-dot.status-info { background-color: #3b82f6; box-shadow: 0 0 6px rgba(59, 130, 246, 0.5); }

    .node-card-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .node-card-type-tag {
      font-size: 10px;
      font-weight: 500;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 4px;
      background-color: #1e293b;
      color: #94a3b8;
    }

    .node-card-description {
      font-size: 12px;
      color: var(--text-color);
      line-height: 1.4;
    }

    .node-card-badges,
    .node-card-tools {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .node-card-badge-pill {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 9999px;
      font-weight: 500;
    }
    .node-card-badge-pill.badge-success { background-color: rgba(34, 197, 94, 0.15); color: #4ade80; }
    .node-card-badge-pill.badge-error { background-color: rgba(239, 68, 68, 0.15); color: #f87171; }
    .node-card-badge-pill.badge-amber { background-color: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .node-card-badge-pill.badge-info { background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .node-card-badge-pill.badge-gray { background-color: #1e293b; color: #94a3b8; }

    .node-card-tool-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      padding: 2px 6px;
      border-radius: 6px;
      background-color: #1e293b;
      border: 1px solid var(--border-color);
    }
    .node-card-tool-chip .tool-name { font-family: var(--mono); font-size: 11px; color: #cbd5e1; }

    .node-card-context {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 11px;
      color: #94a3b8;
    }
    .node-card-context-row { display: flex; align-items: center; gap: 6px; overflow: hidden; }
    .node-card-context-row .context-key { font-weight: 500; flex-shrink: 0; }
    .node-card-context-row .context-value { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--mono); color: #cbd5e1; }

    .node-card-details-disclosure {
      margin-top: 4px;
    }
    .node-card-details-toggle {
      font-size: 11px;
      font-weight: 500;
      color: #94a3b8;
      cursor: pointer;
      user-select: none;
      padding: 4px 0;
    }
    .node-card-details-toggle:hover { color: #ffffff; }
    .node-card-details-content {
      margin-top: 4px;
      padding: 8px;
      background-color: #0b1120;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      font-size: 11px;
      font-family: var(--mono);
      max-height: 140px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      color: #cbd5e1;
    }
  </style>
</head>
<body>
  <header class="export-header">
    <div class="export-title-group">
      <span class="export-title">${graphTitle}</span>
      <span class="export-badge">Standalone HTML Export</span>
    </div>
    <div class="export-meta">
      <span>${nodes.length} Nodes</span> • <span>${edges.length} Edges</span> • Exported ${exportDate}
    </div>
  </header>

  <div class="export-canvas-container">
    <div class="graph-transform-stage">
      <svg class="graph-svg-layer">
        <defs>
          <marker id="edge-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#9ca3af" />
          </marker>
          <marker id="edge-arrowhead-cycle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
          </marker>
        </defs>
        <g transform="translate(${offsetX}, ${offsetY})">
          ${edgesSvg}
        </g>
      </svg>
      <div class="graph-html-layer">
        ${nodesHtml}
      </div>
    </div>
  </div>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const cards = document.querySelectorAll('.node-card');
      const edgeGroups = document.querySelectorAll('.graph-edge-group');

      cards.forEach((card) => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('details')) return;
          const nodeId = card.getAttribute('data-node-id');
          const isAlreadySelected = card.classList.contains('selected');

          cards.forEach((c) => c.classList.remove('selected'));
          edgeGroups.forEach((eg) => eg.classList.remove('selected'));

          if (!isAlreadySelected && nodeId) {
            card.classList.add('selected');
            edgeGroups.forEach((eg) => {
              const src = eg.getAttribute('data-source');
              const tgt = eg.getAttribute('data-target');
              if (src === nodeId || tgt === nodeId) {
                eg.classList.add('selected');
              }
            });
          }
        });
      });
    });
  </script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gvui-export-${graphId}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
