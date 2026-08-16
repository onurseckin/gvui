import type {
  GraphDataset,
  GraphSection,
  PositionedEdge,
  PositionedNode,
} from "../../types/graphData";
import { describeNodeKind, describeNodeStatus } from "../../primitives/nodes/NodeCard/nodeKinds";
import {
  selectDescription,
  selectMetricsLine,
  selectModelChip,
  selectToolChips,
  selectFileChips,
} from "../../primitives/nodes/NodeCard/nodeCardModel";
import {
  EDGE_KIND_DESCRIPTORS,
  type SemanticEdgeKind,
} from "../../primitives/edges/GraphEdge/edgeKinds";
import { computeGraphBounds } from "../../utils/pngExporter";

export interface SvgExportOptions {
  theme?: "dark" | "light" | "transparent";
  padding?: number;
  includeAnnotations?: boolean;
  includeBadges?: boolean;
  includeMetrics?: boolean;
  embedCss?: boolean;
  customCss?: string;
  title?: string;
  scale?: number;
}

export const DEFAULT_SVG_PADDING = 40;

function escapeXml(value: unknown): string {
  const str = String(value ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Returns self-contained embedded CSS styles for SVG rendering.
 * Supports dark, light, and transparent background modes with matching typography and card aesthetics.
 */
export function getEmbeddedSvgStyles(
  theme: "dark" | "light" | "transparent" = "dark",
  customCss = "",
): string {
  const isDark = theme === "dark" || theme === "transparent";

  const bgColor = theme === "transparent" ? "transparent" : isDark ? "#0c0d12" : "#f8fafc";
  const cardBg = isDark ? "#14151c" : "#ffffff";
  const cardBorder = isDark ? "rgba(255, 255, 255, 0.12)" : "rgba(0, 0, 0, 0.12)";
  const textPrimary = isDark ? "#f8fafc" : "#0f172a";
  const textSecondary = isDark ? "#94a3b8" : "#64748b";
  const textMuted = isDark ? "#64748b" : "#94a3b8";
  const sectionBg = isDark ? "rgba(255, 255, 255, 0.02)" : "rgba(0, 0, 0, 0.02)";
  const sectionBorder = isDark ? "rgba(255, 255, 255, 0.07)" : "rgba(0, 0, 0, 0.07)";

  return `
    .gvui-svg-root {
      background-color: ${bgColor};
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .graph-title {
      font-size: 18px;
      font-weight: 700;
      fill: ${textPrimary};
      letter-spacing: -0.02em;
    }
    .section-rect {
      fill: ${sectionBg};
      stroke: ${sectionBorder};
      stroke-width: 1.5;
      stroke-dasharray: 4 4;
      rx: 12;
      ry: 12;
    }
    .section-label {
      font-size: 12px;
      font-weight: 600;
      fill: ${textSecondary};
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .edge-path {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .edge-badge-bg {
      fill: ${isDark ? "#1e2029" : "#f1f5f9"};
      stroke: ${isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.15)"};
      stroke-width: 1;
      rx: 4;
      ry: 4;
    }
    .edge-badge-text {
      font-size: 10px;
      font-weight: 600;
      fill: ${textSecondary};
      text-anchor: middle;
      dominant-baseline: central;
    }
    .node-card-bg {
      fill: ${cardBg};
      stroke: ${cardBorder};
      stroke-width: 1.5;
      rx: 8;
      ry: 8;
      filter: drop-shadow(0 4px 12px rgba(0, 0, 0, ${isDark ? "0.4" : "0.08"}));
    }
    .node-card-accent-bar {
      rx: 4;
      ry: 4;
    }
    .node-title {
      font-size: 13px;
      font-weight: 600;
      fill: ${textPrimary};
    }
    .node-kind-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .node-desc {
      font-size: 11px;
      fill: ${textSecondary};
    }
    .status-badge-bg {
      rx: 4;
      ry: 4;
    }
    .status-badge-text {
      font-size: 10px;
      font-weight: 600;
      fill: #ffffff;
      text-anchor: middle;
      dominant-baseline: central;
    }
    .chip-bg {
      fill: ${isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.05)"};
      stroke: ${isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.1)"};
      stroke-width: 1;
      rx: 4;
      ry: 4;
    }
    .chip-text {
      font-size: 10px;
      fill: ${textSecondary};
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .metrics-text {
      font-size: 10px;
      fill: ${textMuted};
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .annotation-banner {
      fill: ${isDark ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.1)"};
      stroke: ${isDark ? "rgba(239, 68, 68, 0.3)" : "rgba(239, 68, 68, 0.25)"};
      stroke-width: 1;
      rx: 4;
      ry: 4;
    }
    .annotation-text {
      font-size: 10px;
      fill: ${isDark ? "#fca5a5" : "#dc2626"};
      font-weight: 500;
    }
    ${customCss}
  `.trim();
}

/**
 * Builds SVG arrow marker definitions in `<defs>` for various edge kinds and themes.
 */
function buildMarkerDefs(): string {
  const markers = [
    { id: "gvui-arrow-default", color: "#64748b" },
    { id: "gvui-arrow-spawn", color: "#06b6d4" },
    { id: "gvui-arrow-sequence", color: "#3b82f6" },
    { id: "gvui-arrow-data", color: "#8b5cf6" },
    { id: "gvui-arrow-dependency", color: "#94a3b8" },
    { id: "gvui-arrow-loop", color: "#f59e0b" },
    { id: "gvui-arrow-gate", color: "#10b981" },
    { id: "gvui-arrow-critic", color: "#ec4899" },
  ];

  return markers
    .map(
      (m) => `
    <marker id="${m.id}" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto" markerUnits="strokeWidth">
      <path d="M 0 0 L 8 4 L 0 8 z" fill="${m.color}" />
    </marker>`,
    )
    .join("");
}

/**
 * Resolves arrow marker ID and stroke properties for an edge.
 */
function resolveEdgeStyle(edge: PositionedEdge): {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  markerEnd: string;
} {
  const semanticKind = (edge.kind ?? "sequence") as SemanticEdgeKind;
  const descriptor = EDGE_KIND_DESCRIPTORS[semanticKind];

  if (descriptor) {
    const markerId = `gvui-arrow-${descriptor.kind}`;
    return {
      stroke: descriptor.stroke,
      strokeWidth: descriptor.strokeWidth,
      strokeDasharray: descriptor.strokeDasharray,
      markerEnd: `url(#${markerId})`,
    };
  }

  return {
    stroke: "#64748b",
    strokeWidth: 1.5,
    markerEnd: "url(#gvui-arrow-default)",
  };
}

/**
 * Renders a single positioned node into SVG markup.
 */
function renderSvgNode(node: PositionedNode, options: SvgExportOptions): string {
  const kindDesc = describeNodeKind(node);
  const statusDesc = describeNodeStatus(node);

  const descArray = selectDescription(node);
  const description = descArray.length > 0 ? descArray[0] : null;

  const metricsArray = options.includeMetrics !== false ? selectMetricsLine(node) : [];
  const metricsLine = metricsArray.length > 0 ? metricsArray[0] : null;

  const modelChipArray = selectModelChip(node);
  const modelChip = modelChipArray.length > 0 ? modelChipArray[0] : null;

  const toolChips = selectToolChips(node).shown;
  const fileChips = selectFileChips(node).shown;

  const findings = node.metadata?.findings ?? [];
  const hasAnnotations = options.includeAnnotations !== false && findings.length > 0;

  const w = node.width || 260;
  const h = node.height || 140;

  let innerY = 16;
  const elements: string[] = [];

  // 1. Node base card
  elements.push(`<rect class="node-card-bg" x="0" y="0" width="${w}" height="${h}" />`);

  // 2. Left accent strip
  elements.push(
    `<rect class="node-card-accent-bar" x="2" y="2" width="4" height="${h - 4}" fill="${kindDesc.accent}" />`,
  );

  // 3. Kind descriptor & Status badge header
  elements.push(
    `<text class="node-kind-label" x="16" y="${innerY}" fill="${kindDesc.accent}">${escapeXml(kindDesc.label)}</text>`,
  );

  // Status badge pill on the right
  const statusBadgeWidth = Math.max(54, statusDesc.label.length * 6.5 + 12);
  const statusBadgeX = w - statusBadgeWidth - 14;
  elements.push(
    `<rect class="status-badge-bg" x="${statusBadgeX}" y="${innerY - 10}" width="${statusBadgeWidth}" height="18" fill="${statusDesc.color}" />`,
    `<text class="status-badge-text" x="${statusBadgeX + statusBadgeWidth / 2}" y="${innerY - 1}">${escapeXml(statusDesc.label)}</text>`,
  );

  innerY += 20;

  // 4. Node Title
  const titleText = escapeXml(node.name || node.id);
  elements.push(`<text class="node-title" x="16" y="${innerY}">${titleText}</text>`);

  innerY += 18;

  // 5. Description (truncated if too long)
  if (description) {
    const truncatedDesc = description.length > 60 ? `${description.slice(0, 57)}...` : description;
    elements.push(
      `<text class="node-desc" x="16" y="${innerY}">${escapeXml(truncatedDesc)}</text>`,
    );
    innerY += 16;
  }

  // 6. Model Chip / Tool Chips / File Chips
  const chips: string[] = [];
  if (modelChip) {
    chips.push(modelChip);
  }
  for (const tool of toolChips.slice(0, 2)) {
    chips.push(tool);
  }
  for (const file of fileChips.slice(0, 2)) {
    chips.push(file);
  }

  if (chips.length > 0) {
    let chipX = 16;
    for (const chip of chips) {
      const chipText = escapeXml(chip.length > 18 ? `${chip.slice(0, 16)}…` : chip);
      const chipWidth = Math.max(36, chipText.length * 6 + 12);
      if (chipX + chipWidth > w - 16) break;

      elements.push(
        `<rect class="chip-bg" x="${chipX}" y="${innerY - 9}" width="${chipWidth}" height="16" />`,
        `<text class="chip-text" x="${chipX + 6}" y="${innerY + 3}">${chipText}</text>`,
      );
      chipX += chipWidth + 6;
    }
    innerY += 20;
  }

  // 7. Metrics row
  if (metricsLine) {
    elements.push(
      `<text class="metrics-text" x="16" y="${innerY}">${escapeXml(metricsLine)}</text>`,
    );
    innerY += 16;
  }

  // 8. Annotations banner if present
  if (hasAnnotations) {
    const unres = findings.filter((f) => f.status === "open").length;
    const annotText =
      unres > 0
        ? `⚠ ${unres} Open Finding${unres > 1 ? "s" : ""}`
        : `✓ ${findings.length} Finding${findings.length > 1 ? "s" : ""} Resolved`;
    elements.push(
      `<rect class="annotation-banner" x="12" y="${h - 24}" width="${w - 24}" height="16" />`,
      `<text class="annotation-text" x="18" y="${h - 12}">${escapeXml(annotText)}</text>`,
    );
  }

  return `
    <g class="node-card" id="node-${escapeXml(node.id)}" transform="translate(${node.x}, ${node.y})">
      ${elements.join("\n      ")}
    </g>
  `.trim();
}

/**
 * Renders a positioned edge into SVG markup.
 */
function renderSvgEdge(edge: PositionedEdge): string {
  const style = resolveEdgeStyle(edge);
  const elements: string[] = [];

  const dashAttr = style.strokeDasharray ? ` stroke-dasharray="${style.strokeDasharray}"` : "";
  elements.push(
    `<path class="edge-path" d="${edge.path}" stroke="${style.stroke}" stroke-width="${style.strokeWidth}"${dashAttr} marker-end="${style.markerEnd}" />`,
  );

  // Label or badge
  if (edge.label || edge.condition) {
    const text = escapeXml(edge.label || edge.condition || "");
    const lx = edge.labelX ?? (edge.points && edge.points[0] ? edge.points[0].x : 0);
    const ly = edge.labelY ?? (edge.points && edge.points[0] ? edge.points[0].y : 0);
    const bw = Math.max(32, text.length * 6.5 + 12);
    const bh = 18;

    elements.push(
      `<g class="edge-badge" transform="translate(${lx - bw / 2}, ${ly - bh / 2})">
        <rect class="edge-badge-bg" width="${bw}" height="${bh}" />
        <text class="edge-badge-text" x="${bw / 2}" y="${bh / 2}">${text}</text>
      </g>`,
    );
  }

  return `
    <g class="graph-edge" id="edge-${escapeXml(edge.id)}">
      ${elements.join("\n      ")}
    </g>
  `.trim();
}

/**
 * Exports already positioned nodes and edges to a complete vector SVG string.
 */
export function exportPositionedGraphToSvg(
  nodes: readonly PositionedNode[],
  edges: readonly PositionedEdge[] = [],
  options: SvgExportOptions = {},
  sections: readonly GraphSection[] = [],
): string {
  const padding = options.padding ?? DEFAULT_SVG_PADDING;
  const theme = options.theme ?? "dark";
  const bounds = computeGraphBounds(nodes, edges);

  const minX = bounds.minX - padding;
  const minY = bounds.minY - padding - (options.title ? 40 : 0);
  const width = Math.max(bounds.maxX - bounds.minX + padding * 2, 200);
  const height = Math.max(bounds.maxY - bounds.minY + padding * 2 + (options.title ? 40 : 0), 120);

  const styleSheet =
    options.embedCss !== false ? getEmbeddedSvgStyles(theme, options.customCss) : "";

  const sectionElements = sections.map((sec) => {
    const secNodes = nodes.filter((n) => sec.nodeIds.includes(n.id));
    if (secNodes.length === 0) return "";
    const secBounds = computeGraphBounds(secNodes);
    const sx = secBounds.minX - 16;
    const sy = secBounds.minY - 28;
    const sw = secBounds.maxX - secBounds.minX + 32;
    const sh = secBounds.maxY - secBounds.minY + 44;

    return `
      <g class="graph-section" id="section-${escapeXml(sec.id)}">
        <rect class="section-rect" x="${sx}" y="${sy}" width="${sw}" height="${sh}" />
        <text class="section-label" x="${sx + 12}" y="${sy + 18}">${escapeXml(sec.title)}</text>
      </g>
    `.trim();
  });

  const edgeElements = edges.map(renderSvgEdge);
  const nodeElements = nodes.map((n) => renderSvgNode(n, options));

  const titleElement = options.title
    ? `<text class="graph-title" x="${bounds.minX}" y="${bounds.minY - 14}">${escapeXml(options.title)}</text>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}" class="gvui-svg-root">
  <defs>
    ${buildMarkerDefs()}
    ${styleSheet ? `<style>\n${styleSheet}\n  </style>` : ""}
  </defs>
  ${titleElement}
  <g class="graph-sections">
    ${sectionElements.filter(Boolean).join("\n    ")}
  </g>
  <g class="graph-edges">
    ${edgeElements.join("\n    ")}
  </g>
  <g class="graph-nodes">
    ${nodeElements.join("\n    ")}
  </g>
</svg>`.trim();
}

/**
 * Exports a GraphDataset to SVG. If positioned nodes/edges are supplied, uses them;
 * otherwise calculates fallback positions based on grid layout.
 */
export function exportGraphToSvg(
  dataset: GraphDataset,
  options: SvgExportOptions = {},
  positioned?: { nodes: PositionedNode[]; edges: PositionedEdge[] },
): string {
  let nodes: PositionedNode[];
  let edges: PositionedEdge[];

  if (positioned && positioned.nodes.length > 0) {
    nodes = positioned.nodes;
    edges = positioned.edges;
  } else {
    // Fallback: arrange in simple tiered grid
    nodes = dataset.nodes.map((n, idx) => ({
      ...n,
      x: (idx % 3) * 320,
      y: Math.floor(idx / 3) * 200,
      width: 260,
      height: 140,
    }));
    edges = dataset.edges.map((e) => {
      const src = nodes.find((n) => n.id === e.source);
      const tgt = nodes.find((n) => n.id === e.target);
      const x1 = (src?.x ?? 0) + 130;
      const y1 = (src?.y ?? 0) + 140;
      const x2 = (tgt?.x ?? 0) + 130;
      const y2 = tgt?.y ?? 0;
      return {
        ...e,
        path: `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`,
      };
    });
  }

  const title = options.title ?? dataset.title ?? dataset.id;
  return exportPositionedGraphToSvg(nodes, edges, { ...options, title }, dataset.sections);
}

/**
 * Triggers a client-side file download for an SVG string.
 */
export function downloadSvg(svgContent: string, filename = "graph-export.svg"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([svgContent], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
