import { resolveCustomLayoutConfig, type CustomLayoutConfig } from "../engine/layout/custom/config";
import { buildEdgePath } from "../engine/layout/custom/edgePath";
import { computeGraphLayout } from "../engine/layout/layoutDispatcher";
import {
  classifyTool,
  formatFileChipLabel,
  formatOverflowLabel,
  MAX_DESCRIPTION_LINES,
  selectDescription,
  selectFileRefs,
  selectMetricsLine,
  selectModelChip,
  selectToolChips,
  type ToolIconKind,
} from "../primitives/nodes/NodeCard/nodeCardModel";
import {
  describeNodeKind,
  describeNodeStatus,
  resolveModelTier,
  resolveNodeKind,
  resolveNodeStatus,
} from "../primitives/nodes/NodeCard/nodeKinds";
import type { LayoutMode } from "../state/useGraphStore";
import type {
  FileMode,
  GraphDataset,
  GraphNodeData,
  NodeKind,
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

/*
 * Card glyphs as raw SVG markup.
 *
 * These mirror `nodeKinds.tsx` (kind icons) and `NodeCardTools.tsx` / `NodeCardFiles.tsx` (chip
 * icons) path for path. The duplication is deliberate and is the *only* thing duplicated: those
 * modules store their icons as React nodes, and a standalone file needs strings, so the two
 * consumers genuinely need different representations of the same drawing. Everything that could
 * silently disagree — which chips survive the caps, how a tool name maps to a glyph, how a file
 * path or a metrics line is formatted — is imported from `nodeCardModel`, so the export and the
 * canvas can never show a different set of chips.
 *
 * Typed by the schema unions on purpose: adding a `NodeKind` or a `FileMode` breaks this build
 * until its glyph exists here too.
 */
const KIND_ICON_MARKUP: Readonly<Record<NodeKind, string>> = Object.freeze({
  orchestrator:
    '<circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="19" r="2.5" /><circle cx="19" cy="19" r="2.5" /><path d="M12 7.5v3.5M12 11H5v5.5M12 11h7v5.5" />',
  agent: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />',
  router: '<path d="M12 3v6M12 9l-6 6v6M12 9l6 6v6" />',
  join: '<path d="M12 21v-6M12 15L6 9V3M12 15l6-6V3" />',
  gate: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" />',
  terminal: '<path d="M4 21V4M4 4h13l-2.5 4L17 12H4" />',
  input:
    '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="M10 17l5-5-5-5M15 12H3" />',
  critic:
    '<circle cx="12" cy="12" r="9" /><path d="M9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 0 0 5 0" />',
});

const TOOL_ICON_MARKUP: Readonly<Record<ToolIconKind, string>> = Object.freeze({
  search: '<circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />',
  shell: '<path d="M4 17l6-5-6-5M12 19h8" />',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />',
  web: '<circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18-2.5-2.7-2.5-15.3 0-18z" />',
  generic: '<circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" />',
});

const FILE_ICON_MARKUP: Readonly<Record<FileMode, string>> = Object.freeze({
  read: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />',
  write: '<path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />',
  attach:
    '<path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />',
});

/** The expanded chevron. A static export has no collapse state, so only this half is ever drawn. */
const CHEVRON_DOWN_MARKUP = '<path d="M6 9l6 6 6-6" />';

const DEFAULT_FILE_MODE: FileMode = "read";

interface IconOptions {
  size: number;
  stroke: string;
  className?: string;
  strokeWidth?: number;
}

function renderIcon(markup: string, options: IconOptions): string {
  const classAttr = options.className ? ` class="${options.className}"` : "";
  return `<svg${classAttr} viewBox="0 0 24 24" width="${options.size}" height="${options.size}" fill="none" stroke="${options.stroke}" stroke-width="${options.strokeWidth ?? 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${markup}</svg>`;
}

function renderChipIcon(markup: string): string {
  return renderIcon(markup, { className: "node-chip-icon", size: 12, stroke: "currentColor" });
}

/** The `+N` chip both rows share once their cap is exceeded. */
function renderOverflowChip(overflow: number): string {
  if (overflow <= 0) return "";
  return `<span class="node-chip node-chip--overflow" title="${overflow} more"><span class="node-chip-label">${escapeHtml(formatOverflowLabel(overflow))}</span></span>`;
}

/** Mirrors `NodeCardHeader`: `[status] [kind] [type] … [step] [badge] [model] [collapse]`. */
function generateNodeHeaderHtml(node: GraphNodeData): string {
  const kind = describeNodeKind(node);
  const status = describeNodeStatus(node);
  const tier = resolveModelTier(node);
  const [model] = selectModelChip(node);

  const dotClass = `node-card-status-dot${status.animated ? " is-animated" : ""}`;
  const statusDot = `<span class="${dotClass}" style="color: ${status.color};" title="Status: ${escapeHtml(status.label)}"></span>`;
  const kindIcon = renderIcon(KIND_ICON_MARKUP[resolveNodeKind(node)], {
    className: "node-card-kind-icon",
    size: 14,
    stroke: kind.accent,
  });
  const typeTag = node.type
    ? `<span class="node-card-type-tag">${escapeHtml(node.type)}</span>`
    : "";

  const stepBadge =
    node.step !== undefined
      ? `<span class="node-card-step-badge" title="Execution Step ${node.step}">Step ${node.step}</span>`
      : "";
  const statusBadge = node.badge
    ? `<span class="node-card-badge-chip variant-${node.badge.variant ?? "info"}">${escapeHtml(node.badge.text)}</span>`
    : "";

  const modelTitle = node.harnessModel ? `${model} · harness: ${node.harnessModel}` : (model ?? "");
  const modelChip = model
    ? `<span class="node-card-model-chip${tier ? ` tier-${tier}` : ""}" title="${escapeHtml(modelTitle)}">${escapeHtml(model)}</span>`
    : "";
  // A span, not a button: the export is a static snapshot, so the chevron is here for visual parity
  // with the canvas and must not look or behave like something the reader can press.
  const collapseGlyph = `<span class="node-card-toggle-btn" aria-hidden="true">${renderIcon(
    CHEVRON_DOWN_MARKUP,
    { size: 12, stroke: "currentColor", strokeWidth: 2.5 },
  )}</span>`;

  return `<header class="node-card-header">
          <div class="node-card-header-main">${statusDot}${kindIcon}${typeTag}</div>
          <div class="node-card-header-aside">${stepBadge}${statusBadge}${modelChip}${collapseGlyph}</div>
        </header>`;
}

function generateTitleHtml(node: GraphNodeData): string {
  if (!node.name) return "";
  return `<h3 class="node-card-title" title="${escapeHtml(node.name)}">${escapeHtml(node.name)}</h3>`;
}

function generateDescriptionHtml(node: GraphNodeData): string {
  const [description] = selectDescription(node);
  if (!description) return "";
  return `<p class="node-card-description" style="-webkit-line-clamp: ${MAX_DESCRIPTION_LINES};" title="${escapeHtml(description)}">${escapeHtml(description)}</p>`;
}

function generateToolsHtml(node: GraphNodeData): string {
  const { shown, overflow } = selectToolChips(node);
  if (shown.length === 0) return "";

  const chips = shown
    .map(
      (name) =>
        `<span class="node-chip node-chip--tool" title="${escapeHtml(name)}">${renderChipIcon(TOOL_ICON_MARKUP[classifyTool(name)])}<span class="node-chip-label">${escapeHtml(name)}</span></span>`,
    )
    .join("");

  return `<div class="node-card-chip-row">${chips}${renderOverflowChip(overflow)}</div>`;
}

function generateFilesHtml(node: GraphNodeData): string {
  const { shown, overflow } = selectFileRefs(node);
  if (shown.length === 0) return "";

  const chips = shown
    .map((file) => {
      const mode = file.mode ?? DEFAULT_FILE_MODE;
      const title = `${mode}: ${file.path}${file.lines ? `:${file.lines}` : ""}`;
      return `<span class="node-chip node-chip--file node-chip--file-${mode}" title="${escapeHtml(title)}">${renderChipIcon(FILE_ICON_MARKUP[mode])}<span class="node-chip-label">${escapeHtml(formatFileChipLabel(file))}</span></span>`;
    })
    .join("");

  return `<div class="node-card-chip-row">${chips}${renderOverflowChip(overflow)}</div>`;
}

function generateMetricsHtml(node: GraphNodeData): string {
  const [line] = selectMetricsLine(node);
  if (!line) return "";
  const hasRetries = typeof node.metrics?.retries === "number" && node.metrics.retries > 0;
  return `<div class="node-card-metrics${hasRetries ? " has-retries" : ""}" title="${escapeHtml(line)}">${escapeHtml(line)}</div>`;
}

/**
 * One card, mirroring `NodeCard`'s DOM exactly.
 *
 * Only what the canvas draws is emitted: identity, one clamped line of purpose, the capped chip
 * rows, and the metrics footer. The long-form fields (`prompt`, `output`, `logs`, `io`, raw
 * metadata) are drawer-only in the app and have no place in a static file either — an export is a
 * picture of the graph, not a dump of it, and the card's height here is the height the layout
 * engine reserved for exactly this content.
 */
function generateNodeHtml(node: PositionedNode): string {
  const kind = describeNodeKind(node);
  const bodyHtml = [
    generateTitleHtml(node),
    generateDescriptionHtml(node),
    generateToolsHtml(node),
    generateFilesHtml(node),
    generateMetricsHtml(node),
  ]
    .filter(Boolean)
    .join("");

  return `<div class="graph-node-wrapper" style="transform: translate(${node.x}px, ${node.y}px); width: ${node.width}px; height: ${node.height}px;">
      <div class="node-card kind-${resolveNodeKind(node)} status-${resolveNodeStatus(node)}" data-node-id="${escapeHtml(node.id)}" style="width: ${node.width}px; height: ${node.height}px; --node-kind-accent: ${kind.accent};">
        ${generateNodeHeaderHtml(node)}
        <div class="node-card-body">${bodyHtml}</div>
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
      if (event.target.closest && event.target.closest('button, a')) return;
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
        card.addEventListener('click', function () {
          if (dragMoved > DRAG_THRESHOLD_PX) return;
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
      --accent-color: #818cf8;
      --radius-sm: 4px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --radius-pill: 9999px;
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

    /* ------------------------------------------------------------------------------------------
     * Node card. Mirrors src/primitives/nodes/NodeCard/NodeCard.css — same greys, same spacing,
     * same accent mechanics — so an export is indistinguishable from the canvas it came from.
     * Text uses the explicit grey ramp (#fafafa / #a1a1aa / #71717a) rather than the all-white
     * chrome colour above: a card needs title, prose, and metrics at visibly different weights or
     * it reads as one flat block.
     * ---------------------------------------------------------------------------------------- */

    .node-card {
      --node-kind-accent: #a78bfa;

      box-sizing: border-box;
      background-color: #161619;
      border: 1px solid #27272a;
      border-radius: var(--radius-lg);
      padding: 10px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.6), 0 8px 24px -12px rgba(0, 0, 0, 0.8);
      display: flex;
      flex-direction: column;
      transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
      cursor: pointer;
      user-select: none;
      position: relative;
      /* The card height is the height the layout engine reserved, so it clips exactly as on screen. */
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: geometricPrecision;
    }

    /* Kind accent. Absolutely positioned rather than a border-left so it takes no part in the box
       model — a 3px border would eat 3px of the width the measurer already committed to. */
    .node-card::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 3px;
      background-color: var(--node-kind-accent);
      z-index: 2;
    }

    .node-card:hover { background-color: #1b1b1f; border-color: #3f3f46; }
    .node-card.selected {
      border-color: var(--node-kind-accent);
      box-shadow: 0 0 0 1px var(--node-kind-accent), 0 8px 28px -10px rgba(0, 0, 0, 0.9);
    }

    /* A failed node earns a tint; nothing else does. */
    .node-card.status-error { border-color: rgba(248, 113, 113, 0.45); }
    .node-card.status-skipped { opacity: 0.55; }

    .node-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      background-color: #101013;
      margin: -10px -10px 0 -10px;
      padding: 8px 10px;
      border-bottom: 1px solid #232327;
      position: relative;
      z-index: 1;
      min-height: 35px;
      box-sizing: border-box;
    }
    .node-card-header-main {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      min-height: 18px;
      flex: 0 1 auto;
    }
    .node-card-header-aside {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 1;
      min-width: 0;
      justify-content: flex-end;
    }

    /* The dot paints itself and its glow from currentColor, so the inline colour drives both. */
    .node-card-status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
      background-color: currentColor;
      box-shadow: 0 0 7px currentColor;
    }
    .node-card-status-dot.is-animated { animation: node-status-pulse 1.4s ease-in-out infinite; }

    @keyframes node-status-pulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 7px currentColor; }
      50% { opacity: 0.45; box-shadow: 0 0 2px currentColor; }
    }

    .node-card-kind-icon { flex-shrink: 0; display: block; }

    .node-card-title {
      margin: 0;
      width: 100%;
      font-size: 13px;
      font-weight: 600;
      line-height: 18px;
      color: #fafafa;
      letter-spacing: -0.01em;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      box-sizing: border-box;
    }

    .node-card-type-tag {
      font-size: 10px;
      font-weight: 600;
      line-height: 14px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0 6px;
      border-radius: var(--radius-sm);
      background-color: rgba(255, 255, 255, 0.06);
      color: #a1a1aa;
      font-family: var(--font-mono);
      flex-shrink: 1;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .node-card-step-badge {
      font-size: 10px;
      font-weight: 700;
      line-height: 14px;
      padding: 1px 6px;
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.18);
      border: 1px solid rgba(59, 130, 246, 0.4);
      color: #93c5fd;
      font-family: var(--font-mono);
      letter-spacing: 0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-shrink: 1;
      min-width: 0;
      max-width: 100%;
    }

    .node-card-badge-chip {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
      font-family: var(--font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #e4e4e7;
      flex-shrink: 1;
      min-width: 0;
      max-width: 100%;
    }
    .node-card-badge-chip.variant-info {
      background: rgba(6, 182, 212, 0.12);
      border-color: rgba(6, 182, 212, 0.3);
      color: #67e8f9;
    }
    .node-card-badge-chip.variant-warning {
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.3);
      color: #fcd34d;
    }
    .node-card-badge-chip.variant-success {
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(16, 185, 129, 0.3);
      color: #6ee7b7;
    }

    .node-card-model-chip {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 600;
      line-height: 16px;
      padding: 0 6px;
      border-radius: var(--radius-sm);
      background-color: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #d4d4d8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex-shrink: 1;
      min-width: 0;
      max-width: 100%;
    }
    /* Tier, not model name, drives weight — so a graph keeps ranking correctly when models are
       renamed or swapped for custom ones. Larger tier reads heavier. */
    .node-card-model-chip.tier-l {
      background-color: rgba(129, 140, 248, 0.16);
      border-color: rgba(129, 140, 248, 0.45);
      color: #c7d2fe;
    }
    .node-card-model-chip.tier-m {
      background-color: rgba(167, 139, 250, 0.12);
      border-color: rgba(167, 139, 250, 0.32);
      color: #ddd6fe;
    }
    .node-card-model-chip.tier-s,
    .node-card-model-chip.tier-xs {
      background-color: rgba(255, 255, 255, 0.04);
      border-color: rgba(255, 255, 255, 0.1);
      color: #a1a1aa;
    }

    /* Inert in a static export: drawn for parity with the canvas, never pressable. */
    .node-card-toggle-btn {
      color: #71717a;
      padding: 3px;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .node-card-body { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; min-height: 0; }

    .node-card-description {
      margin: 0;
      font-size: 11px;
      line-height: 15px;
      color: #a1a1aa;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .node-card-chip-row { display: flex; flex-wrap: wrap; gap: 4px; }

    .node-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      height: 18px;
      padding: 0 8px;
      border-radius: var(--radius-sm);
      border: 1px solid rgba(255, 255, 255, 0.09);
      background-color: rgba(255, 255, 255, 0.04);
      color: #d4d4d8;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 600;
      line-height: 18px;
      max-width: 100%;
      box-sizing: border-box;
    }
    .node-chip-icon { flex-shrink: 0; color: #71717a; display: block; }
    .node-chip-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Writes are the thing you scan a trace for, so they get the only tinted chip on the card. */
    .node-chip--file-write {
      background-color: rgba(251, 191, 36, 0.1);
      border-color: rgba(251, 191, 36, 0.28);
      color: #fcd34d;
    }
    .node-chip--file-write .node-chip-icon { color: #fbbf24; }

    .node-chip--overflow {
      background-color: transparent;
      border-style: dashed;
      border-color: rgba(255, 255, 255, 0.16);
      color: #71717a;
    }

    .node-card-metrics {
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 500;
      line-height: 14px;
      color: #71717a;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .node-card-metrics.has-retries { color: #d97706; }
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
