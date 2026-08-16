import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";
import { exportPositionedGraphToSvg, type SvgExportOptions } from "./svgExporter";

export interface HtmlBundleExportOptions {
  title?: string;
  theme?: "dark" | "light";
  includeViewer?: boolean;
  includeDatasetJson?: boolean;
  includeAnnotations?: boolean;
  includePlayback?: boolean;
  padding?: number;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Returns complete inline CSS stylesheet for the standalone HTML viewer bundle.
 */
function getBundleStyles(isDark: boolean): string {
  const bgApp = isDark ? "#090a0f" : "#f1f5f9";
  const bgHeader = isDark ? "#121318" : "#ffffff";
  const bgCard = isDark ? "#14151c" : "#ffffff";
  const textPrimary = isDark ? "#f8fafc" : "#0f172a";
  const textSecondary = isDark ? "#94a3b8" : "#64748b";
  const border = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)";
  const accent = "#3b82f6";

  return `
    :root {
      --bg-app: ${bgApp};
      --bg-header: ${bgHeader};
      --bg-card: ${bgCard};
      --text-primary: ${textPrimary};
      --text-secondary: ${textSecondary};
      --border: ${border};
      --accent: ${accent};
      --font: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: var(--bg-app);
      color: var(--text-primary);
      font-family: var(--font);
      user-select: none;
    }
    #app {
      display: flex;
      flex-direction: column;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
    }
    header {
      height: 48px;
      padding: 0 16px;
      background-color: var(--bg-header);
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 10;
      flex-shrink: 0;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge-offline {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      background-color: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #10b981;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .graph-title-header {
      font-size: 14px;
      font-weight: 600;
    }
    .header-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      height: 30px;
      padding: 0 10px;
      font-size: 12px;
      font-weight: 500;
      border-radius: 6px;
      border: 1px solid var(--border);
      background-color: rgba(255, 255, 255, 0.04);
      color: var(--text-primary);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn:hover {
      background-color: rgba(255, 255, 255, 0.1);
      border-color: var(--accent);
    }
    .btn-primary {
      background-color: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }
    .btn-primary:hover {
      background-color: #2563eb;
    }
    .search-input {
      height: 30px;
      padding: 0 10px;
      font-size: 12px;
      border-radius: 6px;
      border: 1px solid var(--border);
      background-color: rgba(0, 0, 0, 0.2);
      color: var(--text-primary);
      outline: none;
      width: 160px;
      transition: width 0.2s ease;
    }
    .search-input:focus {
      width: 220px;
      border-color: var(--accent);
    }
    .main-viewport {
      flex: 1;
      position: relative;
      overflow: hidden;
      cursor: grab;
    }
    .main-viewport:active {
      cursor: grabbing;
    }
    #canvas-container {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
      will-change: transform;
    }
    /* Floating Canvas Toolbar */
    .floating-toolbar {
      position: absolute;
      bottom: 20px;
      left: 20px;
      display: flex;
      align-items: center;
      gap: 6px;
      background-color: var(--bg-header);
      padding: 6px 8px;
      border-radius: 8px;
      border: 1px solid var(--border);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
      z-index: 5;
    }
    .zoom-level-text {
      font-size: 11px;
      font-family: var(--font-mono);
      min-width: 44px;
      text-align: center;
      color: var(--text-secondary);
    }
    /* Node Detail Drawer */
    #detail-drawer {
      position: absolute;
      top: 48px;
      right: 0;
      bottom: 0;
      width: 380px;
      background-color: var(--bg-card);
      border-left: 1px solid var(--border);
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      transform: translateX(100%);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 20;
    }
    #detail-drawer.open {
      transform: translateX(0);
    }
    .drawer-header {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .drawer-title {
      font-size: 14px;
      font-weight: 600;
    }
    .drawer-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      user-select: text;
    }
    .drawer-section {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .drawer-section-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .drawer-json-viewer {
      background-color: #050505;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      font-family: var(--font-mono);
      font-size: 11px;
      color: #93c5fd;
      overflow-x: auto;
      max-height: 240px;
    }
    /* Node Highlighting & Search Filter */
    .node-card {
      cursor: pointer;
      transition: opacity 0.2s ease, filter 0.2s ease;
    }
    .node-card:hover {
      filter: brightness(1.15);
    }
    .node-card.selected .node-card-bg {
      stroke: var(--accent);
      stroke-width: 2.5;
    }
    .node-dimmed {
      opacity: 0.2;
    }
    .node-highlighted {
      filter: drop-shadow(0 0 10px var(--accent));
    }
  `.trim();
}

/**
 * Returns the interactive standalone JavaScript viewer code.
 */
function getBundleScript(): string {
  return `
    (function() {
      var rawDataEl = document.getElementById('gvui-graph-data');
      var dataset = rawDataEl ? JSON.parse(rawDataEl.textContent || '{}') : {};
      
      var state = {
        zoom: 1,
        panX: 0,
        panY: 0,
        isDragging: false,
        dragStartX: 0,
        dragStartY: 0,
        selectedNodeId: null,
        searchQuery: ''
      };

      var container = document.getElementById('canvas-container');
      var viewport = document.getElementById('viewport');
      var zoomText = document.getElementById('zoom-val');
      var drawer = document.getElementById('detail-drawer');
      var drawerContent = document.getElementById('drawer-content');
      var drawerNodeTitle = document.getElementById('drawer-node-title');
      var closeDrawerBtn = document.getElementById('btn-close-drawer');
      var searchInput = document.getElementById('search-input');
      var exportJsonBtn = document.getElementById('btn-export-json');

      function updateTransform() {
        if (!container) return;
        container.style.transform = 'translate(' + state.panX + 'px, ' + state.panY + 'px) scale(' + state.zoom + ')';
        if (zoomText) zoomText.textContent = Math.round(state.zoom * 100) + '%';
      }

      function zoom(factor, clientX, clientY) {
        var prevZoom = state.zoom;
        var newZoom = Math.min(Math.max(prevZoom * factor, 0.15), 4.0);
        if (clientX !== undefined && clientY !== undefined && viewport) {
          var rect = viewport.getBoundingClientRect();
          var mouseX = clientX - rect.left;
          var mouseY = clientY - rect.top;
          state.panX = mouseX - (mouseX - state.panX) * (newZoom / prevZoom);
          state.panY = mouseY - (mouseY - state.panY) * (newZoom / prevZoom);
        }
        state.zoom = newZoom;
        updateTransform();
      }

      function fitView() {
        var svg = container ? container.querySelector('svg') : null;
        if (!svg || !viewport) return;
        var viewBox = svg.viewBox.baseVal;
        var vw = viewport.clientWidth;
        var vh = viewport.clientHeight;
        var scale = Math.min((vw - 80) / viewBox.width, (vh - 80) / viewBox.height, 1.5);
        scale = Math.max(scale, 0.2);
        state.zoom = scale;
        state.panX = (vw - viewBox.width * scale) / 2 - viewBox.x * scale;
        state.panY = (vh - viewBox.height * scale) / 2 - viewBox.y * scale;
        updateTransform();
      }

      function resetView() {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        updateTransform();
      }

      // Viewport Pan/Zoom events
      if (viewport) {
        viewport.addEventListener('wheel', function(e) {
          e.preventDefault();
          var factor = e.deltaY < 0 ? 1.15 : 0.85;
          zoom(factor, e.clientX, e.clientY);
        }, { passive: false });

        viewport.addEventListener('mousedown', function(e) {
          if (e.target.closest && e.target.closest('.node-card')) return;
          state.isDragging = true;
          state.dragStartX = e.clientX - state.panX;
          state.dragStartY = e.clientY - state.panY;
        });

        window.addEventListener('mousemove', function(e) {
          if (!state.isDragging) return;
          state.panX = e.clientX - state.dragStartX;
          state.panY = e.clientY - state.dragStartY;
          updateTransform();
        });

        window.addEventListener('mouseup', function() {
          state.isDragging = false;
        });
      }

      // Zoom Controls
      var btnZoomIn = document.getElementById('btn-zoom-in');
      var btnZoomOut = document.getElementById('btn-zoom-out');
      var btnFit = document.getElementById('btn-fit');
      var btnReset = document.getElementById('btn-reset');

      if (btnZoomIn) btnZoomIn.addEventListener('click', function() { zoom(1.2); });
      if (btnZoomOut) btnZoomOut.addEventListener('click', function() { zoom(0.8); });
      if (btnFit) btnFit.addEventListener('click', fitView);
      if (btnReset) btnReset.addEventListener('click', resetView);

      // Node Selection & Detail Drawer
      function showNodeDetail(nodeId) {
        state.selectedNodeId = nodeId;
        var nodeCards = document.querySelectorAll('.node-card');
        nodeCards.forEach(function(card) {
          if (card.id === 'node-' + nodeId) {
            card.classList.add('selected');
          } else {
            card.classList.remove('selected');
          }
        });

        var nodeData = (dataset.nodes || []).find(function(n) { return n.id === nodeId; });
        if (!nodeData) return;

        if (drawerNodeTitle) drawerNodeTitle.textContent = nodeData.name || nodeData.id;
        if (drawerContent) {
          var html = [];
          html.push('<div class="drawer-section"><span class="drawer-section-title">Kind & Status</span><p style="font-size:12px; color:var(--text-secondary);">' + (nodeData.kind || 'agent') + ' &bull; ' + (nodeData.status || 'pending') + '</p></div>');
          if (nodeData.description) {
            html.push('<div class="drawer-section"><span class="drawer-section-title">Description</span><p style="font-size:12px; line-height:1.5;">' + nodeData.description + '</p></div>');
          }
          if (nodeData.tools && nodeData.tools.length > 0) {
            var tools = nodeData.tools.map(function(t) { return t.name; }).join(', ');
            html.push('<div class="drawer-section"><span class="drawer-section-title">Tools</span><p style="font-size:12px; font-family:var(--font-mono);">' + tools + '</p></div>');
          }
          if (nodeData.files && nodeData.files.length > 0) {
            var files = nodeData.files.map(function(f) { return f.path; }).join('<br/>');
            html.push('<div class="drawer-section"><span class="drawer-section-title">Files</span><p style="font-size:11px; font-family:var(--font-mono); line-height:1.4;">' + files + '</p></div>');
          }
          if (nodeData.metadata && nodeData.metadata.findings) {
            var findings = nodeData.metadata.findings.map(function(f) { return '<li><strong>[' + f.severity + ']</strong> ' + f.observation + '</li>'; }).join('');
            html.push('<div class="drawer-section"><span class="drawer-section-title">Findings & Audit</span><ul style="font-size:11px; padding-left:16px; line-height:1.4;">' + findings + '</ul></div>');
          }
          html.push('<div class="drawer-section"><span class="drawer-section-title">Raw Node Payload</span><pre class="drawer-json-viewer">' + JSON.stringify(nodeData, null, 2) + '</pre></div>');
          drawerContent.innerHTML = html.join('');
        }

        if (drawer) drawer.classList.add('open');
      }

      function closeDrawer() {
        if (drawer) drawer.classList.remove('open');
        state.selectedNodeId = null;
        var nodeCards = document.querySelectorAll('.node-card');
        nodeCards.forEach(function(card) { card.classList.remove('selected'); });
      }

      if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', closeDrawer);

      // Node Card Click Listeners
      var nodeCards = document.querySelectorAll('.node-card');
      nodeCards.forEach(function(card) {
        card.addEventListener('click', function(e) {
          e.stopPropagation();
          var id = card.id.replace(/^node-/, '');
          showNodeDetail(id);
        });
      });

      // Search & Highlight
      if (searchInput) {
        searchInput.addEventListener('input', function(e) {
          var q = (e.target.value || '').trim().toLowerCase();
          state.searchQuery = q;
          nodeCards.forEach(function(card) {
            var id = card.id.replace(/^node-/, '');
            var nodeData = (dataset.nodes || []).find(function(n) { return n.id === id; });
            if (!q) {
              card.classList.remove('node-dimmed', 'node-highlighted');
              return;
            }
            var matches = (nodeData && (nodeData.name || '').toLowerCase().includes(q)) || id.toLowerCase().includes(q);
            if (matches) {
              card.classList.add('node-highlighted');
              card.classList.remove('node-dimmed');
            } else {
              card.classList.add('node-dimmed');
              card.classList.remove('node-highlighted');
            }
          });
        });
      }

      // Export Embedded JSON
      if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', function() {
          var blob = new Blob([JSON.stringify(dataset, null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = (dataset.title || dataset.id || 'graph') + '.json';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        });
      }

      // Initial auto fit on load
      setTimeout(fitView, 50);
    })();
  `.trim();
}

/**
 * Exports a GraphDataset to a self-contained, standalone, offline HTML bundle.
 */
export function exportGraphToHtmlBundle(
  dataset: GraphDataset,
  options: HtmlBundleExportOptions = {},
  positioned?: { nodes: PositionedNode[]; edges: PositionedEdge[] },
): string {
  const isDark = options.theme !== "light";
  const title = options.title ?? dataset.title ?? dataset.id ?? "GVUI Graph Export";
  const includeJson = options.includeDatasetJson !== false;

  const svgOptions: SvgExportOptions = {
    theme: isDark ? "dark" : "light",
    padding: options.padding ?? 60,
    includeAnnotations: options.includeAnnotations !== false,
  };

  const svgMarkup = exportPositionedGraphToSvg(
    positioned?.nodes ??
      dataset.nodes.map((n, idx) => ({
        ...n,
        x: (idx % 3) * 320,
        y: Math.floor(idx / 3) * 200,
        width: 260,
        height: 140,
      })),
    positioned?.edges ?? [],
    svgOptions,
    dataset.sections,
  );

  const escapedTitle = escapeHtml(title);
  const styles = getBundleStyles(isDark);
  const script = getBundleScript();
  const jsonContent = includeJson
    ? JSON.stringify(dataset).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")
    : "{}";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapedTitle} - GVUI Standalone Offline Viewer</title>
  <style>
${styles}
  </style>
</head>
<body>
  <div id="app">
    <header>
      <div class="header-left">
        <span class="badge-offline">OFFLINE BUNDLE</span>
        <span class="graph-title-header">${escapedTitle}</span>
      </div>
      <div class="header-controls">
        <input type="text" id="search-input" class="search-input" placeholder="Search nodes..." />
        <button type="button" id="btn-export-json" class="btn">Export JSON</button>
      </div>
    </header>
    <main class="main-viewport" id="viewport">
      <div id="canvas-container">
        ${svgMarkup}
      </div>
      <div class="floating-toolbar">
        <button type="button" id="btn-zoom-in" class="btn" title="Zoom In">+</button>
        <span id="zoom-val" class="zoom-level-text">100%</span>
        <button type="button" id="btn-zoom-out" class="btn" title="Zoom Out">-</button>
        <button type="button" id="btn-fit" class="btn btn-primary" title="Fit View">Fit</button>
        <button type="button" id="btn-reset" class="btn" title="Reset View">Reset</button>
      </div>
      <aside id="detail-drawer">
        <div class="drawer-header">
          <span class="drawer-title" id="drawer-node-title">Node Details</span>
          <button type="button" id="btn-close-drawer" class="btn" style="padding:0 6px;">&times;</button>
        </div>
        <div class="drawer-body" id="drawer-content">
          <!-- Populated dynamically by JS -->
        </div>
      </aside>
    </main>
  </div>
  <script type="application/json" id="gvui-graph-data">
${jsonContent}
  </script>
  <script>
${script}
  </script>
</body>
</html>`.trim();
}

/**
 * Triggers a client-side download of an HTML bundle (.html).
 */
export function downloadHtmlBundle(htmlContent: string, filename = "graph-bundle.html"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".html") ? filename : `${filename}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
