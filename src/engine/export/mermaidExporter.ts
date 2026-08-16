import type {
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  NodeKind,
  NodeStatus,
} from "../../types/graphData";
import { resolveNodeKind, resolveNodeStatus } from "../../primitives/nodes/NodeCard/nodeKinds";
import {
  selectDescription,
  selectMetricsLine,
} from "../../primitives/nodes/NodeCard/nodeCardModel";

export interface MermaidExportOptions {
  direction?: "TD" | "TB" | "LR" | "BT" | "RL";
  includeStyles?: boolean;
  includeSubgraphs?: boolean;
  includeAnnotations?: boolean;
  includeMetrics?: boolean;
  includeDescriptions?: boolean;
  theme?: "dark" | "default" | "forest" | "neutral" | "base";
  title?: string;
}

/**
 * Sanitizes an ID string so it is valid in Mermaid syntax without breaking tokenization.
 */
export function sanitizeMermaidId(rawId: string): string {
  const sanitized = String(rawId ?? "").replace(/[^a-zA-Z0-9_]/g, "_");
  // Mermaid IDs cannot start with a digit
  return /^[0-9]/.test(sanitized) ? `node_${sanitized}` : sanitized;
}

/**
 * Sanitizes text to be placed inside Mermaid node labels.
 * Handles quotes, brackets, pipes, hashes, semicolons, and newlines safely.
 */
export function sanitizeMermaidText(value: unknown): string {
  const text = String(value ?? "");
  return text
    .replace(/"/g, "'")
    .replace(/[[\]{}()]/g, "")
    .replace(/\|/g, " - ")
    .replace(/#/g, " ")
    .replace(/;/g, " ")
    .replace(/[\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Sanitizes edge label text specifically to avoid premature closure of |"..."| syntax.
 */
export function sanitizeMermaidEdgeLabel(value: unknown): string {
  const text = String(value ?? "");
  return text
    .replace(/"/g, "'")
    .replace(/\|/g, " - ")
    .replace(/#/g, " ")
    .replace(/;/g, " ")
    .replace(/[\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generates Mermaid node shape brackets around the label based on NodeKind.
 */
function wrapNodeShape(id: string, label: string, kind: NodeKind): string {
  switch (kind) {
    case "orchestrator":
    case "critic":
      // Subroutine shape [[ ... ]]
      return `${id}[["${label}"]]`;
    case "tool":
      // Cylinder shape [( ... )]
      return `${id}[("${label}")]`;
    case "gate":
    case "router":
    case "join":
      // Rhombus / Diamond shape { ... }
      return `${id}{"${label}"}`;
    case "terminal":
      // Stadium shape ([ ... ])
      return `${id}(["${label}"])`;
    case "input":
      // Parallelogram [/ ... /]
      return `${id}[/"${label}"/]`;
    case "agent":
    default:
      // Standard rectangle [ ... ]
      return `${id}["${label}"]`;
  }
}

/**
 * Maps edge kind to Mermaid connector syntax.
 */
function formatMermaidEdge(edge: GraphEdgeData, sourceId: string, targetId: string): string {
  const rawLabel = edge.label || edge.condition || "";
  const label = rawLabel ? `|"${sanitizeMermaidEdgeLabel(rawLabel)}"|` : "";

  const kind = edge.kind ?? "sequence";
  switch (kind) {
    case "spawn":
    case "dispatch":
      // Thick arrow ==>
      return `${sourceId} ==${label}==> ${targetId}`;
    case "data":
    case "dependency":
      // Dotted arrow -.->
      return `${sourceId} -.${label}.-> ${targetId}`;
    case "loop":
    case "pushback": {
      // Dotted or labeled loop
      const edgeLabel = label || '|"loop"|';
      return `${sourceId} -.${edgeLabel}.-> ${targetId}`;
    }
    case "gate":
    case "validation":
    case "signoff": {
      const edgeLabel = label || '|"gate"|';
      return `${sourceId} --${edgeLabel}--> ${targetId}`;
    }
    case "sequence":
    default:
      return `${sourceId} --${label}--> ${targetId}`;
  }
}

/**
 * Returns classDef styling declarations for Mermaid nodes.
 */
function getMermaidClassDefs(): string {
  return `
    classDef success fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ffffff;
    classDef running fill:#1e3a8a,stroke:#3b82f6,stroke-width:2px,color:#ffffff;
    classDef error fill:#7f1d1d,stroke:#ef4444,stroke-width:2px,color:#ffffff;
    classDef warning fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#ffffff;
    classDef pending fill:#27272a,stroke:#52525b,stroke-width:1.5px,color:#d4d4d8;
    classDef cached fill:#312e81,stroke:#6366f1,stroke-width:1.5px,color:#e0e7ff;
    classDef skipped fill:#18181b,stroke:#3f3f46,stroke-dasharray: 4 4,color:#71717a;
  `.trim();
}

/**
 * Builds a formatted Mermaid flowchart string from a GraphDataset.
 */
export function exportGraphToMermaid(
  dataset: GraphDataset,
  options: MermaidExportOptions = {},
): string {
  const direction = options.direction ?? "TD";
  const theme = options.theme ?? "dark";
  const includeStyles = options.includeStyles !== false;
  const includeSubgraphs = options.includeSubgraphs !== false;
  const includeAnnotations = options.includeAnnotations !== false;
  const includeMetrics = options.includeMetrics !== false;
  const includeDescriptions = options.includeDescriptions !== false;

  const lines: string[] = [];

  // Theme config header
  lines.push(`%%{init: {'theme': '${theme}'}}%%`);
  lines.push(`flowchart ${direction}`);

  const statusGroups: Record<NodeStatus, string[]> = {
    pending: [],
    running: [],
    success: [],
    error: [],
    warning: [],
    skipped: [],
    cached: [],
  };

  const nodeMap = new Map<string, GraphNodeData>();
  for (const node of dataset.nodes) {
    nodeMap.set(node.id, node);
  }

  // Helper to build node label content
  const buildNodeContent = (node: GraphNodeData): string => {
    const sId = sanitizeMermaidId(node.id);
    const kind = resolveNodeKind(node);
    const status = resolveNodeStatus(node);
    statusGroups[status]?.push(sId);

    const parts: string[] = [`<b>${sanitizeMermaidText(node.name || node.id)}</b>`];

    if (includeDescriptions) {
      const descArray = selectDescription(node);
      if (descArray.length > 0 && descArray[0]) {
        const desc = descArray[0];
        const shortDesc = desc.length > 50 ? `${desc.slice(0, 47)}...` : desc;
        parts.push(`<i>${sanitizeMermaidText(shortDesc)}</i>`);
      }
    }

    if (includeMetrics) {
      const metricsArray = selectMetricsLine(node);
      if (metricsArray.length > 0 && metricsArray[0]) {
        parts.push(`<code>${sanitizeMermaidText(metricsArray[0])}</code>`);
      }
    }

    if (includeAnnotations && node.metadata?.findings && node.metadata.findings.length > 0) {
      const openCount = node.metadata.findings.filter((f) => f.status === "open").length;
      if (openCount > 0) {
        parts.push(`⚠ ${openCount} Open Finding${openCount > 1 ? "s" : ""}`);
      }
    }

    const fullLabel = parts.join("<br/>");
    return wrapNodeShape(sId, fullLabel, kind);
  };

  // Group nodes by sections if subgraphs enabled
  const placedNodeIds = new Set<string>();

  if (includeSubgraphs && dataset.sections && dataset.sections.length > 0) {
    for (const section of dataset.sections) {
      const sectionId = sanitizeMermaidId(section.id || section.title);
      const title = sanitizeMermaidText(section.title || section.id);
      lines.push(`  subgraph ${sectionId} ["${title}"]`);

      for (const nid of section.nodeIds) {
        const node = nodeMap.get(nid);
        if (node) {
          lines.push(`    ${buildNodeContent(node)}`);
          placedNodeIds.add(nid);
        }
      }
      lines.push("  end");
    }
  }

  // Standalone nodes not in any section
  for (const node of dataset.nodes) {
    if (!placedNodeIds.has(node.id)) {
      lines.push(`  ${buildNodeContent(node)}`);
    }
  }

  lines.push("");

  // Edges
  for (const edge of dataset.edges) {
    const sSource = sanitizeMermaidId(edge.source);
    const sTarget = sanitizeMermaidId(edge.target);
    lines.push(`  ${formatMermaidEdge(edge, sSource, sTarget)}`);
  }

  // Class assignment & styling
  if (includeStyles) {
    lines.push("");
    lines.push(`  ${getMermaidClassDefs()}`);
    lines.push("");
    for (const [status, ids] of Object.entries(statusGroups)) {
      if (ids.length > 0) {
        lines.push(`  class ${ids.join(",")} ${status};`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Triggers a client-side download of a Mermaid file (.mmd).
 */
export function downloadMermaid(content: string, filename = "graph.mmd"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    filename.endsWith(".mmd") || filename.endsWith(".mermaid") ? filename : `${filename}.mmd`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
