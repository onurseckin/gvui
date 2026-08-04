import { resolveCustomLayoutConfig, type CustomLayoutConfig } from "../engine/layout/custom/config";
import { buildEdgePath } from "../engine/layout/custom/edgePath";
import { computeGraphLayout } from "../engine/layout/layoutDispatcher";
import type { LayoutMode } from "../state/useGraphStore";
import type {
  GraphDataset,
  GraphNodeData,
  NodeBadge,
  NodeTool,
  PositionedEdge,
  PositionedNode,
} from "../types/graphData";
import {
  computeFitTransform,
  computeGraphBounds,
  deriveExportFilename,
  triggerDownload,
  GRAPH_EXPORT_PADDING,
} from "./pngExporter";

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

/** Mirrors `NodeCardTools`' icon rules so a chip carries the same glyph it does on screen. */
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

function generateNodeHtml(node: PositionedNode): string {
  const statusVariant = deriveStatusVariant(node);
  const escapedName = escapeHtml(node.name);
  const escapedType = node.type ? escapeHtml(node.type) : null;

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

  // Same flattening rules as `NodeCardContext`: repo path first, then scalar context entries, then
  // scalar metadata minus the long-form keys that belong in the disclosure below.
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
    detailsHtml = `<details class="node-card-details"><summary class="node-card-details-toggle">Raw Payload / Logs</summary><pre class="node-card-details-content"><code>${content}</code></pre></details>`;
  }

  return `<div class="graph-node-wrapper" style="transform: translate(${node.x}px, ${node.y}px); width: ${node.width}px; height: ${node.height}px;">
      <div class="node-card status-${statusVariant}" data-node-id="${escapeHtml(node.id)}" style="width: ${node.width}px; height: ${node.height}px;">
        <header class="node-card-header">
          <div class="node-card-header-main">
            <span class="node-card-status-dot status-${statusVariant}" title="Status: ${statusVariant}"></span>
            <h3 class="node-card-title">${escapedName}</h3>
            ${escapedType ? `<span class="node-card-type-tag">${escapedType}</span>` : ""}
          </div>
        </header>
        ${badgesHtml}
        ${toolsHtml}
        ${contextHtml}
        ${detailsHtml}
      </div>
    </div>`;
}

/**
 * Mirrors `EdgeBadgeOverlay`, leader lines included: the layout engine may place a badge away from
 * its edge (`beside-edge`/`above-edge`), and without the dashed connector such a badge reads as
 * belonging to whatever it happens to sit next to.
 */
function generateEdgeBadgeSvg(edge: PositionedEdge): string {
  const hasLabel = Boolean(edge.label && edge.label.trim().length > 0);
  if (!hasLabel && !edge.isCycle) return "";

  const displayText = edge.isCycle
    ? hasLabel
      ? `CYCLE (${edge.label ?? ""})`
      : "CYCLE"
    : (edge.label ?? "");

  const width = edge.badgeRect ? edge.badgeRect.width : Math.max(60, displayText.length * 8 + 24);
  const height = edge.badgeRect ? edge.badgeRect.height : 28;
  const renderX = edge.badgeRect ? edge.badgeRect.x + edge.badgeRect.width / 2 : (edge.labelX ?? 0);
  const renderY = edge.badgeRect
    ? edge.badgeRect.y + edge.badgeRect.height / 2
    : (edge.labelY ?? 0);

  const hasLeaderPoints = Boolean(edge.leaderPoints && edge.leaderPoints.length >= 2);
  const anchor =
    edge.anchorPoint ?? (hasLeaderPoints && edge.leaderPoints ? edge.leaderPoints[0] : undefined);
  const anchorIsOutsideBadge =
    anchor !== undefined &&
    (anchor.x < renderX - width / 2 ||
      anchor.x > renderX + width / 2 ||
      anchor.y < renderY - height / 2 ||
      anchor.y > renderY + height / 2);

  let leaderHtml = "";
  if (anchorIsOutsideBadge && hasLeaderPoints && edge.leaderPoints) {
    const d = edge.leaderPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    leaderHtml = `<path d="${d}" stroke="#38bdf8" stroke-width="1" stroke-dasharray="3,3" fill="none" transform="translate(${-renderX}, ${-renderY})" />`;
  } else if (anchorIsOutsideBadge && edge.anchorPoint) {
    leaderHtml = `<line x1="${edge.anchorPoint.x - renderX}" y1="${edge.anchorPoint.y - renderY}" x2="0" y2="0" stroke="#38bdf8" stroke-width="1" stroke-dasharray="3,3" />`;
  }

  const cycleClass = edge.isCycle ? " cycle" : "";
  return `<g transform="translate(${renderX}, ${renderY})" class="edge-badge-group${cycleClass}" data-source="${escapeHtml(edge.source)}" data-target="${escapeHtml(edge.target)}">
        ${leaderHtml}
        <rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="14" ry="14" class="edge-badge-rect${cycleClass}" />
        <text x="0" y="0" text-anchor="middle" dominant-baseline="central" class="edge-badge-text">${escapeHtml(displayText)}</text>
      </g>`;
}

function generateEdgeSvg(edge: PositionedEdge, config: CustomLayoutConfig): string {
  // Rebuilt from the routed waypoints rather than trusting `edge.path` verbatim: GraphCanvas's own
  // edge-style pass (see `custom/edgePath.ts`) re-derives `path` from `points` on every render
  // because `cornerRadius`/`edgeStyle` are pure client-side rendering decisions, not part of the
  // layout. Doing the same here is what makes a corner-rounding tweak the user made on-screen
  // actually show up in the exported file.
  const path =
    edge.points && edge.points.length > 0
      ? buildEdgePath(edge.points, config.edgeStyle, config.cornerRadius)
      : edge.path;

  const marker = edge.isCycle ? "url(#edge-arrowhead-cycle)" : "url(#edge-arrowhead)";
  const markerAttr = edge.directed !== false ? ` marker-end="${marker}"` : "";

  return `<g class="graph-edge-group" data-edge-id="${escapeHtml(edge.id)}" data-source="${escapeHtml(edge.source)}" data-target="${escapeHtml(edge.target)}">
        <path d="${path}" class="edge-backdrop" />
        <path d="${path}" class="graph-edge-path${edge.isCycle ? " cycle" : ""}"${markerAttr} />
      </g>`;
}

/**
 * The exported page's whole runtime: initial fit, pan, wheel/pinch zoom, refit on resize, and node
 * selection. Written as an ES5-flavoured IIFE with no template literals so it can be embedded in
 * the generator's own template literal without escaping, and so the file opens in anything.
 */
const VIEWER_SCRIPT = `
  (function () {
    var MIN_ZOOM = 0.02;
    var MAX_ZOOM = 4;
    var DRAG_THRESHOLD_PX = 4;

    var viewport = document.getElementById('gv-viewport');
    var stage = document.getElementById('gv-stage');
    var zoomLabel = document.getElementById('gv-zoom');

    var scale = GV_INITIAL.scale;
    var tx = GV_INITIAL.translateX;
    var ty = GV_INITIAL.translateY;
    // Once the reader has framed the graph themselves, a resize must not throw that framing away.
    var userAdjusted = false;
    var lastViewportSize = null;

    function apply() {
      stage.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')';
      zoomLabel.textContent = Math.round(scale * 100) + '%';
    }

    function viewportSize() {
      var rect = viewport.getBoundingClientRect();
      return { width: rect.width, height: rect.height, left: rect.left, top: rect.top };
    }

    function fit() {
      var size = viewportSize();
      var contentWidth = GV_BOUNDS.maxX - GV_BOUNDS.minX + GV_PADDING * 2;
      var contentHeight = GV_BOUNDS.maxY - GV_BOUNDS.minY + GV_PADDING * 2;
      var next = Math.min(size.width / contentWidth, size.height / contentHeight);
      if (!isFinite(next) || next <= 0) next = 1;
      scale = Math.min(Math.max(next, MIN_ZOOM), 1);
      tx = size.width / 2 - ((GV_BOUNDS.minX + GV_BOUNDS.maxX) / 2) * scale;
      ty = size.height / 2 - ((GV_BOUNDS.minY + GV_BOUNDS.maxY) / 2) * scale;
      userAdjusted = false;
      lastViewportSize = size;
      apply();
    }

    function zoomAround(clientX, clientY, factor) {
      var size = viewportSize();
      var px = clientX - size.left;
      var py = clientY - size.top;
      var next = Math.min(Math.max(scale * factor, MIN_ZOOM), MAX_ZOOM);
      if (next === scale) return;
      // Hold the graph point under the pointer still while the scale changes around it.
      tx = px - ((px - tx) / scale) * next;
      ty = py - ((py - ty) / scale) * next;
      scale = next;
      userAdjusted = true;
      lastViewportSize = size;
      apply();
    }

    function zoomCentre(factor) {
      var size = viewportSize();
      zoomAround(size.left + size.width / 2, size.top + size.height / 2, factor);
    }

    viewport.addEventListener(
      'wheel',
      function (event) {
        event.preventDefault();
        zoomAround(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
      },
      { passive: false }
    );

    var dragging = false;
    var dragStartX = 0;
    var dragStartY = 0;
    var dragMoved = 0;

    viewport.addEventListener('mousedown', function (event) {
      if (event.button !== 0) return;
      if (event.target.closest && event.target.closest('details, summary, button, a')) return;
      dragging = true;
      dragMoved = 0;
      dragStartX = event.clientX - tx;
      dragStartY = event.clientY - ty;
      viewport.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', function (event) {
      if (!dragging) return;
      var nextX = event.clientX - dragStartX;
      var nextY = event.clientY - dragStartY;
      dragMoved += Math.abs(nextX - tx) + Math.abs(nextY - ty);
      tx = nextX;
      ty = nextY;
      userAdjusted = true;
      apply();
    });

    window.addEventListener('mouseup', function () {
      dragging = false;
      viewport.classList.remove('is-dragging');
    });

    var pinchDistance = 0;

    function touchList(event) {
      var list = [];
      for (var i = 0; i < event.touches.length; i++) list.push(event.touches[i]);
      return list;
    }

    viewport.addEventListener(
      'touchstart',
      function (event) {
        var touches = touchList(event);
        if (touches.length === 1) {
          dragging = true;
          dragStartX = touches[0].clientX - tx;
          dragStartY = touches[0].clientY - ty;
        } else if (touches.length === 2) {
          dragging = false;
          pinchDistance = Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
          );
        }
      },
      { passive: true }
    );

    viewport.addEventListener(
      'touchmove',
      function (event) {
        var touches = touchList(event);
        if (touches.length === 1 && dragging) {
          event.preventDefault();
          tx = touches[0].clientX - dragStartX;
          ty = touches[0].clientY - dragStartY;
          userAdjusted = true;
          apply();
        } else if (touches.length === 2) {
          event.preventDefault();
          var distance = Math.hypot(
            touches[0].clientX - touches[1].clientX,
            touches[0].clientY - touches[1].clientY
          );
          if (pinchDistance > 0 && distance > 0) {
            zoomAround(
              (touches[0].clientX + touches[1].clientX) / 2,
              (touches[0].clientY + touches[1].clientY) / 2,
              distance / pinchDistance
            );
          }
          pinchDistance = distance;
        }
      },
      { passive: false }
    );

    viewport.addEventListener('touchend', function () {
      dragging = false;
      pinchDistance = 0;
    });

    window.addEventListener('resize', function () {
      var size = viewportSize();
      if (!userAdjusted) {
        fit();
        return;
      }
      // Manual framing survives a resize by keeping whatever was in the middle in the middle.
      if (lastViewportSize) {
        tx += (size.width - lastViewportSize.width) / 2;
        ty += (size.height - lastViewportSize.height) / 2;
      }
      lastViewportSize = size;
      apply();
    });

    var cards = document.querySelectorAll('.node-card');
    var edgeGroups = document.querySelectorAll('.graph-edge-group');
    var badgeGroups = document.querySelectorAll('.edge-badge-group');

    function clearSelection() {
      for (var i = 0; i < cards.length; i++) cards[i].classList.remove('selected');
      for (var j = 0; j < edgeGroups.length; j++) edgeGroups[j].classList.remove('selected');
      for (var k = 0; k < badgeGroups.length; k++) badgeGroups[k].classList.remove('selected');
    }

    function highlightIncident(nodeId) {
      function mark(list) {
        for (var i = 0; i < list.length; i++) {
          var source = list[i].getAttribute('data-source');
          var target = list[i].getAttribute('data-target');
          if (source === nodeId || target === nodeId) list[i].classList.add('selected');
        }
      }
      mark(edgeGroups);
      mark(badgeGroups);
    }

    for (var c = 0; c < cards.length; c++) {
      (function (card) {
        card.addEventListener('click', function (event) {
          if (dragMoved > DRAG_THRESHOLD_PX) return;
          if (event.target.closest && event.target.closest('details')) return;
          var wasSelected = card.classList.contains('selected');
          clearSelection();
          if (!wasSelected) {
            card.classList.add('selected');
            highlightIncident(card.getAttribute('data-node-id'));
          }
        });
      })(cards[c]);
    }

    document.getElementById('gv-fit').addEventListener('click', fit);
    document.getElementById('gv-zoom-in').addEventListener('click', function () {
      zoomCentre(1.2);
    });
    document.getElementById('gv-zoom-out').addEventListener('click', function () {
      zoomCentre(1 / 1.2);
    });

    window.addEventListener('keydown', function (event) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'f' || event.key === 'F') fit();
      else if (event.key === '+' || event.key === '=') zoomCentre(1.2);
      else if (event.key === '-' || event.key === '_') zoomCentre(1 / 1.2);
      else if (event.key === 'Escape') clearSelection();
    });

    fit();
  })();
`;

function buildViewerCss(): string {
  return `
    :root {
      --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      --bg-app: #0a0a0a;
      --bg-header: #121212;
      --bg-canvas: #050505;
      --bg-card: #18181b;
      --bg-hover: #27272a;
      --border-card: #27272a;
      --border-subtle: #18181b;
      --accent-color: #818cf8;
      --radius-sm: 4px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --radius-pill: 9999px;
      --shadow-card: 0 10px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.6);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body { height: 100%; }

    body {
      font-family: var(--font-sans);
      background-color: var(--bg-app);
      color: #ffffff;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }

    .gv-header {
      flex: 0 0 auto;
      background-color: var(--bg-header);
      border-bottom: 1px solid var(--border-card);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .gv-title-group { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .gv-title { font-size: 15px; font-weight: 700; }
    .gv-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: var(--radius-pill);
      background-color: rgba(129, 140, 248, 0.15);
      border: 1px solid rgba(129, 140, 248, 0.35);
      color: var(--accent-color);
      font-weight: 600;
      white-space: nowrap;
    }
    .gv-meta { font-size: 12px; color: #a1a1aa; font-family: var(--font-mono); }

    .gv-actions { display: flex; align-items: center; gap: 6px; }
    .gv-btn {
      height: 30px;
      min-width: 30px;
      padding: 0 10px;
      background-color: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: var(--radius-sm);
      color: #ffffff;
      font-size: 13px;
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease;
    }
    .gv-btn:hover { background-color: var(--bg-hover); border-color: var(--accent-color); }
    .gv-btn:focus-visible { outline: 2px solid var(--accent-color); outline-offset: 2px; }
    .gv-zoom {
      font-size: 12px;
      font-weight: 600;
      font-family: var(--font-mono);
      min-width: 46px;
      text-align: center;
    }

    .gv-viewport {
      position: relative;
      flex: 1 1 auto;
      overflow: hidden;
      background-color: var(--bg-canvas);
      background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
      background-size: 24px 24px;
      cursor: grab;
      user-select: none;
      touch-action: none;
    }
    .gv-viewport.is-dragging { cursor: grabbing; }

    /* A zero-sized origin marker: every layer inside draws in graph coordinates and overflows it,
       so the single transform on this element is the only viewport maths in the file. */
    .graph-transform-stage {
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      transform-origin: 0 0;
    }

    .graph-svg-layer, .graph-svg-badge-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 1px;
      height: 1px;
      overflow: visible;
      pointer-events: none;
      shape-rendering: geometricPrecision;
    }
    .graph-svg-badge-layer { z-index: 10; }
    .graph-svg-layer g, .graph-svg-badge-layer g { pointer-events: auto; }

    .graph-html-layer { position: absolute; top: 0; left: 0; width: 0; height: 0; }
    .graph-node-wrapper { position: absolute; top: 0; left: 0; transform-origin: 0 0; }

    .graph-edge-group { cursor: pointer; }
    .edge-backdrop { fill: none; stroke: transparent; stroke-width: 16px; }
    .graph-edge-path {
      fill: none;
      stroke: #52525b;
      stroke-width: 2px;
      vector-effect: non-scaling-stroke;
      transition: stroke 0.2s ease, stroke-width 0.2s ease;
    }
    .graph-edge-group:hover .graph-edge-path,
    .graph-edge-group.selected .graph-edge-path {
      stroke: var(--accent-color);
      stroke-width: 3px;
    }
    .graph-edge-path.cycle { stroke: #fbbf24; stroke-dasharray: 6 4; }

    .edge-badge-group { cursor: default; user-select: none; }
    .edge-badge-rect {
      fill: #09090b;
      stroke: #3f3f46;
      stroke-width: 1.5px;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.9));
    }
    .edge-badge-group.selected .edge-badge-rect { stroke: var(--accent-color); }
    .edge-badge-rect.cycle { stroke: #f59e0b; stroke-width: 2px; }
    .edge-badge-text {
      fill: #ffffff;
      font-size: 11px;
      font-family: var(--font-mono);
      font-weight: 600;
      pointer-events: none;
    }
    .edge-badge-group.cycle .edge-badge-text { fill: #fbbf24; font-weight: 700; }

    .node-card {
      box-sizing: border-box;
      background-color: var(--bg-card);
      border: 1px solid var(--border-card);
      border-radius: var(--radius-lg);
      padding: 10px;
      box-shadow: var(--shadow-card);
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: background-color 0.2s ease, border-color 0.2s ease;
      cursor: pointer;
      user-select: none;
      position: relative;
      overflow: hidden;
      color: #ffffff;
    }
    .node-card:hover { background-color: var(--bg-hover); }
    .node-card.selected {
      outline: 2px solid var(--accent-color);
      outline-offset: 2px;
      border-color: var(--accent-color);
      box-shadow: 0 0 0 2px var(--accent-color), 0 0 15px rgba(129, 140, 248, 0.4);
    }

    /* The card height is the height the layout engine reserved, so it is clipped exactly as on
       screen — except while the payload disclosure is open, where clipping would hide the very
       thing the reader just asked to see. */
    .node-card:has(details[open]) {
      height: auto !important;
      overflow: visible;
      z-index: 20;
    }

    .node-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      background-color: var(--bg-header);
      margin: -10px -10px 0 -10px;
      padding: 8px 10px;
      border-bottom: 1px solid var(--border-card);
    }
    .node-card-header-main { display: flex; align-items: center; gap: 8px; min-width: 0; }

    .node-card-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .node-card-status-dot.status-success { background-color: #34d399; box-shadow: 0 0 8px rgba(52, 211, 153, 0.6); }
    .node-card-status-dot.status-error { background-color: #f87171; box-shadow: 0 0 8px rgba(248, 113, 113, 0.6); }
    .node-card-status-dot.status-amber { background-color: #fbbf24; box-shadow: 0 0 8px rgba(251, 191, 36, 0.6); }
    .node-card-status-dot.status-info { background-color: #38bdf8; box-shadow: 0 0 8px rgba(56, 189, 248, 0.6); }
    .node-card-status-dot.status-gray { background-color: #94a3b8; }

    .node-card-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .node-card-type-tag {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      background-color: var(--bg-hover);
      color: #e2e8f0;
      font-family: var(--font-mono);
      border: 1px solid var(--border-subtle);
    }

    .node-card-badges, .node-card-tools { display: flex; flex-wrap: wrap; gap: 4px; }

    .node-card-badge-pill {
      font-size: 11px;
      padding: 3px 9px;
      border-radius: var(--radius-pill);
      font-weight: 600;
      font-family: var(--font-mono);
      line-height: 1.3;
    }
    .node-card-badge-pill.badge-success { background-color: rgba(6, 78, 59, 0.5); border: 1px solid #059669; color: #34d399; }
    .node-card-badge-pill.badge-error { background-color: rgba(127, 29, 29, 0.5); border: 1px solid #dc2626; color: #f87171; }
    .node-card-badge-pill.badge-amber { background-color: rgba(120, 53, 15, 0.5); border: 1px solid #d97706; color: #fbbf24; }
    .node-card-badge-pill.badge-info { background-color: rgba(30, 58, 138, 0.5); border: 1px solid #0284c7; color: #38bdf8; }
    .node-card-badge-pill.badge-gray { background-color: rgba(30, 41, 59, 0.7); border: 1px solid #475569; color: #ffffff; }

    .node-card-tool-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: var(--radius-sm);
      background-color: rgba(88, 28, 135, 0.45);
      border: 1px solid #7e22ce;
      color: #e9d5ff;
      font-family: var(--font-mono);
      font-weight: 600;
    }

    .node-card-context { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #cbd5e1; }
    .node-card-context-row { display: flex; align-items: flex-start; gap: 6px; }
    .node-card-context-row .context-key { font-weight: 600; flex-shrink: 0; color: #94a3b8; }
    .node-card-context-row .context-value { font-family: var(--font-mono); color: #ffffff; word-break: break-word; }

    .node-card-details { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
    .node-card-details-toggle {
      font-size: 11px;
      font-weight: 600;
      color: #94a3b8;
      cursor: pointer;
      padding: 4px 0;
      list-style: none;
    }
    .node-card-details-toggle::-webkit-details-marker { display: none; }
    .node-card-details-toggle::before { content: "\\25BA "; }
    .node-card-details[open] .node-card-details-toggle::before { content: "\\25BC "; }
    .node-card-details-toggle:hover { color: #ffffff; }
    .node-card-details-content {
      margin: 0;
      padding: 8px 10px;
      background-color: var(--bg-header);
      border: 1px solid var(--border-card);
      border-radius: var(--radius-sm);
      font-size: 11px;
      font-family: var(--font-mono);
      color: #ffffff;
      max-height: 240px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
  `;
}

export interface ExportGraphAsHTMLOptions {
  /** Defaults to `"layered"` — the v2 name for the old `"top-down"` mode this used to hardcode. */
  mode?: LayoutMode | string;
  /** The live editor config, so the export matches whatever the user has tuned on-screen. */
  configPartial?: Partial<CustomLayoutConfig>;
  /**
   * Already-positioned graph to export. Supplying it skips a redundant layout pass and — more
   * importantly — guarantees the file matches the geometry on screen rather than a fresh
   * computation that could differ if the config drifted between the two calls.
   */
  positioned?: { nodes: PositionedNode[]; edges: PositionedEdge[] };
  /** Viewport the initial fit transform targets. Defaults to the exporting window. */
  targetViewport?: { width: number; height: number };
}

/**
 * Writes a single self-contained HTML file: inline CSS, inline geometry, inline viewer script, no
 * network requests of any kind. It opens with the whole graph fit to the reader's window and
 * supports drag-to-pan, wheel/pinch zoom, and a Fit button that reframes for the current size.
 */
export async function exportGraphAsHTML(
  dataset: GraphDataset,
  options?: ExportGraphAsHTMLOptions,
): Promise<void> {
  if (!dataset) return;

  const mode = options?.mode ?? "layered";
  const config = resolveCustomLayoutConfig(options?.configPartial);
  const { nodes, edges } =
    options?.positioned ?? (await computeGraphLayout(dataset, mode, options?.configPartial));

  const bounds = computeGraphBounds(nodes, edges);
  const target = options?.targetViewport ?? {
    width: typeof window === "undefined" ? 1600 : Math.max(window.innerWidth, 320),
    // The exported header is ~52px; subtracting it makes the baked-in transform match what the
    // reader sees before the script's own fit pass runs.
    height: typeof window === "undefined" ? 900 : Math.max(window.innerHeight - 52, 240),
  };
  const initial = computeFitTransform(bounds, target, GRAPH_EXPORT_PADDING);

  const nodesHtml = nodes.map((node) => generateNodeHtml(node)).join("\n");
  const edgesSvg = edges.map((edge) => generateEdgeSvg(edge, config)).join("\n");
  const badgesSvg = edges.map((edge) => generateEdgeBadgeSvg(edge)).join("\n");

  const exportDate = new Date().toLocaleString();
  const graphTitle = escapeHtml(dataset.title || dataset.id);

  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${graphTitle} - GVUI Standalone Export</title>
  <style>${buildViewerCss()}</style>
</head>
<body>
  <header class="gv-header">
    <div class="gv-title-group">
      <span class="gv-title">${graphTitle}</span>
      <span class="gv-badge">Standalone Export</span>
    </div>
    <div class="gv-meta">${nodes.length} ${nodes.length === 1 ? "node" : "nodes"} • ${edges.length} ${edges.length === 1 ? "edge" : "edges"} • ${escapeHtml(exportDate)}</div>
    <div class="gv-actions">
      <button type="button" class="gv-btn" id="gv-zoom-out" title="Zoom out">−</button>
      <span class="gv-zoom" id="gv-zoom">100%</span>
      <button type="button" class="gv-btn" id="gv-zoom-in" title="Zoom in">+</button>
      <button type="button" class="gv-btn" id="gv-fit" title="Fit the whole graph (F)">Fit</button>
    </div>
  </header>

  <main class="gv-viewport" id="gv-viewport">
    <div class="graph-transform-stage" id="gv-stage" style="transform: translate(${initial.translateX}px, ${initial.translateY}px) scale(${initial.scale});">
      <svg class="graph-svg-layer">
        <defs>
          <marker id="edge-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#9ca3af" />
          </marker>
          <marker id="edge-arrowhead-cycle" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
          </marker>
        </defs>
        ${edgesSvg}
      </svg>

      <div class="graph-html-layer">
        ${nodesHtml}
      </div>

      <svg class="graph-svg-badge-layer">
        ${badgesSvg}
      </svg>
    </div>
  </main>

  <script>
    var GV_BOUNDS = ${JSON.stringify(bounds)};
    var GV_PADDING = ${GRAPH_EXPORT_PADDING};
    var GV_INITIAL = ${JSON.stringify(initial)};
${VIEWER_SCRIPT}
  </script>
</body>
</html>`;

  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8;" });
  triggerDownload(blob, deriveExportFilename(dataset.title || dataset.id, "html"));
}
