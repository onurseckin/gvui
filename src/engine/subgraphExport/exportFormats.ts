import type { GraphDataset, GraphNodeData, NodeKind, NodeStatus } from "../../types/graphData";
import { serializeBookmarkPack } from "./bundlePack";
import type { BookmarkPackBundle, ExportConfig, ExportResult, ExtractedSubgraph } from "./types";

/**
 * Escapes characters for Graphviz DOT attribute values.
 */
export function dotEscape(value: unknown): string {
  const text = String(value ?? "");
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");
}

/**
 * Sanitizes an ID for Graphviz DOT identifiers.
 */
export function sanitizeDotId(rawId: string): string {
  const sanitized = String(rawId ?? "").replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[0-9]/.test(sanitized) ? `node_${sanitized}` : sanitized || "empty_node";
}

/**
 * Sanitizes an ID for Mermaid diagrams.
 */
export function sanitizeMermaidId(rawId: string): string {
  const sanitized = String(rawId ?? "").replace(/[^a-zA-Z0-9_]/g, "_");
  return /^[0-9]/.test(sanitized) ? `node_${sanitized}` : sanitized || "empty_node";
}

/**
 * Sanitizes text for Mermaid node and edge labels.
 * Strips/escapes quotes, brackets, parentheses, pipes, hashes, semicolons, HTML script tags, newlines.
 */
export function sanitizeMermaidText(value: unknown): string {
  const text = String(value ?? "");
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/[<>]/g, "")
    .replace(/\\/g, "/")
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
 * Wraps node label in appropriate Mermaid brackets depending on NodeKind.
 */
function wrapMermaidNodeShape(id: string, label: string, kind?: NodeKind): string {
  const cleanLabel = label || id || "Node";
  switch (kind) {
    case "orchestrator":
    case "critic":
      return `${id}[["${cleanLabel}"]]`;
    case "tool":
      return `${id}[("${cleanLabel}")]`;
    case "gate":
    case "router":
    case "join":
      return `${id}{"${cleanLabel}"}`;
    case "terminal":
      return `${id}(["${cleanLabel}"])`;
    case "input":
      return `${id}[/"${cleanLabel}"/]`;
    case "agent":
    default:
      return `${id}["${cleanLabel}"]`;
  }
}

/**
 * Returns status color for Graphviz DOT and SVG styling.
 */
function getStatusColor(status?: NodeStatus): { bg: string; border: string; font: string } {
  switch (status) {
    case "success":
      return { bg: "#064e3b", border: "#10b981", font: "#ecfdf5" };
    case "error":
      return { bg: "#7f1d1d", border: "#ef4444", font: "#fef2f2" };
    case "running":
      return { bg: "#164e63", border: "#06b6d4", font: "#ecfeff" };
    case "warning":
      return { bg: "#78350f", border: "#f59e0b", font: "#fffbeb" };
    case "cached":
      return { bg: "#4c1d95", border: "#8b5cf6", font: "#f5f3ff" };
    case "skipped":
      return { bg: "#1e293b", border: "#475569", font: "#94a3b8" };
    case "pending":
    default:
      return { bg: "#1e293b", border: "#64748b", font: "#f8fafc" };
  }
}

/**
 * Exports Bookmark Pack bundle to JSON string.
 */
export function exportToJsonBundle(
  pack: BookmarkPackBundle,
  options?: { pretty?: boolean },
): ExportResult {
  const pretty = options?.pretty !== false;
  const content = serializeBookmarkPack(pack, pretty);
  const baseName = pack.metadata?.id || "bookmark-pack";
  const filename = `${baseName}.json`;

  return {
    format: "json-bundle",
    filename,
    mimeType: "application/json",
    content,
    byteSize: new TextEncoder().encode(content).length,
  };
}

/**
 * Exports raw GraphDataset to JSON string.
 */
export function exportToGraphDatasetJson(
  dataset: GraphDataset,
  options?: { pretty?: boolean },
): ExportResult {
  const pretty = options?.pretty !== false;
  const content = JSON.stringify(dataset, null, pretty ? 2 : 0);
  const baseName = (dataset.id || "subgraph").toLowerCase().replace(/[^a-z0-9-_]+/g, "-");
  const filename = `${baseName}.dataset.json`;

  return {
    format: "graph-dataset",
    filename,
    mimeType: "application/json",
    content,
    byteSize: new TextEncoder().encode(content).length,
  };
}

/**
 * Exports Subgraph to Graphviz DOT format.
 */
export function exportToGraphvizDot(
  extracted: ExtractedSubgraph,
  options?: {
    rankdir?: "TB" | "LR" | "BT" | "RL";
    title?: string;
    includeBoundary?: boolean;
    theme?: "dark" | "light";
  },
): ExportResult {
  const { rankdir = "TB", title, includeBoundary = true } = options ?? {};
  const dataset = extracted.dataset;
  const graphTitle = title || dataset.title || "SubgraphExport";
  const sanitizedGraphName = graphTitle.replace(/[^a-zA-Z0-9_]/g, "_") || "Subgraph";

  const lines: string[] = [];
  lines.push(`digraph "${sanitizedGraphName}" {`);
  lines.push(`  graph [`);
  lines.push(`    label="${dotEscape(graphTitle)}",`);
  lines.push(`    labelloc="t",`);
  lines.push(`    fontsize=16,`);
  lines.push(`    fontcolor="#e2e8f0",`);
  lines.push(`    fontname="Inter, Helvetica, Arial, sans-serif",`);
  lines.push(`    bgcolor="#0b0f19",`);
  lines.push(`    rankdir="${rankdir}",`);
  lines.push(`    nodesep=0.6,`);
  lines.push(`    ranksep=0.8,`);
  lines.push(`    pad="0.5",`);
  lines.push(`    compound=true`);
  lines.push(`  ];`);
  lines.push(``);
  lines.push(`  node [`);
  lines.push(`    shape=box,`);
  lines.push(`    style="filled,rounded",`);
  lines.push(`    fontname="Inter, Helvetica, Arial, sans-serif",`);
  lines.push(`    fontsize=12,`);
  lines.push(`    fontcolor="#f8fafc",`);
  lines.push(`    color="#334155",`);
  lines.push(`    fillcolor="#1e293b",`);
  lines.push(`    penwidth=1.5,`);
  lines.push(`    margin="0.25,0.15"`);
  lines.push(`  ];`);
  lines.push(``);
  lines.push(`  edge [`);
  lines.push(`    fontname="Inter, Helvetica, Arial, sans-serif",`);
  lines.push(`    fontsize=10,`);
  lines.push(`    fontcolor="#94a3b8",`);
  lines.push(`    color="#64748b",`);
  lines.push(`    arrowsize=0.8,`);
  lines.push(`    penwidth=1.2`);
  lines.push(`  ];`);
  lines.push(``);

  // If dataset is completely empty
  if (dataset.nodes.length === 0) {
    lines.push(`  // Empty Subgraph`);
    lines.push(
      `  "empty_subgraph" [label="Empty Subgraph", style="filled,dashed", fillcolor="#1e293b", color="#475569", fontcolor="#94a3b8"];`,
    );
    lines.push(`}`);
    const content = lines.join("\n");
    const filename = `${sanitizedGraphName.toLowerCase()}.dot`;
    return {
      format: "dot",
      filename,
      mimeType: "text/vnd.graphviz",
      content,
      byteSize: new TextEncoder().encode(content).length,
    };
  }

  const clusteredNodeIds = new Set<string>();

  // Render clusters for sections
  if (dataset.sections && dataset.sections.length > 0) {
    for (let sIdx = 0; sIdx < dataset.sections.length; sIdx++) {
      const sec = dataset.sections[sIdx];
      const clusterId = `cluster_${sanitizeDotId(sec.id || `sec_${sIdx}`)}`;
      lines.push(`  subgraph "${clusterId}" {`);
      lines.push(`    label="${dotEscape(sec.title)}";`);
      lines.push(`    style="filled,dashed";`);
      lines.push(`    color="#3b82f6";`);
      lines.push(`    fillcolor="#0f172a88";`);
      lines.push(`    fontcolor="#60a5fa";`);
      lines.push(`    fontsize=13;`);
      lines.push(`    penwidth=1.2;`);

      for (const nid of sec.nodeIds) {
        clusteredNodeIds.add(nid);
        const node = dataset.nodes.find((n) => n.id === nid);
        if (node) {
          lines.push(formatDotNodeDeclaration(node));
        }
      }
      lines.push(`  }`);
      lines.push(``);
    }
  }

  // Render remaining top-level nodes
  for (const node of dataset.nodes) {
    if (!clusteredNodeIds.has(node.id)) {
      lines.push(formatDotNodeDeclaration(node));
    }
  }
  lines.push(``);

  // Render internal edges
  for (const edge of dataset.edges) {
    const src = sanitizeDotId(edge.source);
    const tgt = sanitizeDotId(edge.target);
    const label = edge.label || edge.condition || "";
    const attrs: string[] = [];

    if (label) {
      attrs.push(`label="${dotEscape(label)}"`);
    }

    if (edge.kind === "spawn" || edge.kind === "dispatch") {
      attrs.push(`style="dashed"`);
      attrs.push(`color="#38bdf8"`);
    } else if (edge.kind === "pushback" || edge.kind === "critic") {
      attrs.push(`style="dotted"`);
      attrs.push(`color="#f43f5e"`);
      attrs.push(`penwidth=1.8`);
    } else if (edge.kind === "handoff" || edge.kind === "data") {
      attrs.push(`color="#a855f7"`);
    }

    const attrStr = attrs.length > 0 ? ` [${attrs.join(", ")}]` : "";
    lines.push(`  "${src}" -> "${tgt}"${attrStr};`);
  }

  // Render boundary edges and stubs if enabled
  if (includeBoundary && extracted.boundaryEdges.length > 0) {
    lines.push(``);
    lines.push(`  // Boundary Crossings`);
    const externalNodesSeen = new Set<string>();

    for (const be of extracted.boundaryEdges) {
      const extId = sanitizeDotId(be.externalNodeId);
      if (!externalNodesSeen.has(extId)) {
        externalNodesSeen.add(extId);
        lines.push(
          `  "${extId}" [label="${dotEscape(
            be.externalNodeId,
          )}\\n(External)", style="filled,dashed", fillcolor="#1e1e2e", color="#64748b", fontcolor="#94a3b8"];`,
        );
      }

      const src = sanitizeDotId(be.edge.source);
      const tgt = sanitizeDotId(be.edge.target);
      const edgeLabel =
        be.edge.label ||
        be.edge.condition ||
        (be.boundaryType === "incoming" ? "inbound" : "outbound");
      lines.push(
        `  "${src}" -> "${tgt}" [label="${dotEscape(
          edgeLabel,
        )}", style="dashed", color="#94a3b8", arrowhead="open"];`,
      );
    }
  }

  lines.push(`}`);
  const content = lines.join("\n");
  const filename = `${sanitizedGraphName.toLowerCase()}.dot`;

  return {
    format: "dot",
    filename,
    mimeType: "text/vnd.graphviz",
    content,
    byteSize: new TextEncoder().encode(content).length,
  };
}

function formatDotNodeDeclaration(node: GraphNodeData): string {
  const dotId = sanitizeDotId(node.id);
  const colors = getStatusColor(node.status);
  const kindStr = node.kind ? ` [${node.kind}]` : "";
  const label = `${node.name || node.id}${kindStr}`;
  const desc = node.description ? `\\n${dotEscape(node.description.slice(0, 40))}` : "";

  return `  "${dotId}" [label="${dotEscape(
    label,
  )}${desc}", fillcolor="${colors.bg}", color="${colors.border}", fontcolor="${colors.font}"];`;
}

/**
 * Exports Subgraph to Mermaid flowchart format.
 */
export function exportToMermaid(
  extracted: ExtractedSubgraph,
  options?: {
    direction?: "TD" | "TB" | "LR" | "BT" | "RL";
    title?: string;
    includeBoundary?: boolean;
    includeStyles?: boolean;
  },
): ExportResult {
  const { direction = "TD", title, includeBoundary = true, includeStyles = true } = options ?? {};
  const dataset = extracted.dataset;

  const lines: string[] = [];
  lines.push(`flowchart ${direction}`);

  if (title || dataset.title) {
    lines.push(`  %% Title: ${sanitizeMermaidText(title || dataset.title)}`);
  }

  // Handle empty graph gracefully
  if (dataset.nodes.length === 0) {
    lines.push(`  empty_subgraph(["Empty Subgraph"])`);
    const content = lines.join("\n");
    const baseName = (title || dataset.title || "subgraph")
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-");
    return {
      format: "mermaid",
      filename: `${baseName}.mmd`,
      mimeType: "text/vnd.mermaid",
      content,
      byteSize: new TextEncoder().encode(content).length,
    };
  }

  const clusteredNodeIds = new Set<string>();

  // Render Subgraphs for sections
  if (dataset.sections && dataset.sections.length > 0) {
    for (let sIdx = 0; sIdx < dataset.sections.length; sIdx++) {
      const sec = dataset.sections[sIdx];
      const secId = sanitizeMermaidId(sec.id || `sec_${sIdx}`);
      lines.push(`  subgraph ${secId} ["${sanitizeMermaidText(sec.title)}"]`);

      for (const nid of sec.nodeIds) {
        clusteredNodeIds.add(nid);
        const node = dataset.nodes.find((n) => n.id === nid);
        if (node) {
          const mId = sanitizeMermaidId(node.id);
          const label = sanitizeMermaidText(node.name || node.id);
          lines.push(`    ${wrapMermaidNodeShape(mId, label, node.kind)}`);
        }
      }
      lines.push(`  end`);
    }
  }

  // Render top-level nodes
  for (const node of dataset.nodes) {
    if (!clusteredNodeIds.has(node.id)) {
      const mId = sanitizeMermaidId(node.id);
      const label = sanitizeMermaidText(node.name || node.id);
      lines.push(`  ${wrapMermaidNodeShape(mId, label, node.kind)}`);
    }
  }

  // Render internal edges
  for (const edge of dataset.edges) {
    const src = sanitizeMermaidId(edge.source);
    const tgt = sanitizeMermaidId(edge.target);
    const rawLabel = edge.label || edge.condition || "";
    const labelStr = rawLabel ? `|"${sanitizeMermaidText(rawLabel)}"|` : "";

    let connector = "-->";
    if (edge.kind === "spawn" || edge.kind === "dispatch") {
      connector = "-.->";
    } else if (edge.kind === "pushback" || edge.kind === "critic") {
      connector = "==>";
    }

    lines.push(`  ${src} ${connector}${labelStr} ${tgt}`);
  }

  // Render boundary edges if enabled
  if (includeBoundary && extracted.boundaryEdges.length > 0) {
    lines.push(`  %% Boundary Crossings`);
    const externalSeen = new Set<string>();

    for (const be of extracted.boundaryEdges) {
      const extId = sanitizeMermaidId(be.externalNodeId);
      if (!externalSeen.has(extId)) {
        externalSeen.add(extId);
        lines.push(`  ${extId}(["${sanitizeMermaidText(be.externalNodeId)} (Ext)"])`);
      }

      const src = sanitizeMermaidId(be.edge.source);
      const tgt = sanitizeMermaidId(be.edge.target);
      const label =
        be.edge.label ||
        be.edge.condition ||
        (be.boundaryType === "incoming" ? "inbound" : "outbound");
      lines.push(`  ${src} -.->|"${sanitizeMermaidText(label)}"| ${tgt}`);
    }
  }

  // Render styles and classes
  if (includeStyles) {
    lines.push(``);
    lines.push(
      `  classDef successNode fill:#064e3b,stroke:#10b981,color:#ecfdf5,stroke-width:2px;`,
    );
    lines.push(`  classDef errorNode fill:#7f1d1d,stroke:#ef4444,color:#fef2f2,stroke-width:2px;`);
    lines.push(
      `  classDef runningNode fill:#164e63,stroke:#06b6d4,color:#ecfeff,stroke-width:2px;`,
    );
    lines.push(
      `  classDef defaultNode fill:#1e293b,stroke:#64748b,color:#f8fafc,stroke-width:1.5px;`,
    );

    for (const node of dataset.nodes) {
      const mId = sanitizeMermaidId(node.id);
      if (node.status === "success") {
        lines.push(`  class ${mId} successNode;`);
      } else if (node.status === "error") {
        lines.push(`  class ${mId} errorNode;`);
      } else if (node.status === "running") {
        lines.push(`  class ${mId} runningNode;`);
      } else {
        lines.push(`  class ${mId} defaultNode;`);
      }
    }
  }

  const content = lines.join("\n");
  const baseName = (title || dataset.title || "subgraph")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-");
  const filename = `${baseName}.mmd`;

  return {
    format: "mermaid",
    filename,
    mimeType: "text/vnd.mermaid",
    content,
    byteSize: new TextEncoder().encode(content).length,
  };
}

/**
 * Formats a clean, executive Markdown report.
 */
export function exportToMarkdownReport(
  extracted: ExtractedSubgraph,
  pack: BookmarkPackBundle,
  config?: Partial<ExportConfig>,
): ExportResult {
  const { dataset, boundaryEdges, annotations, stats } = extracted;
  const meta = pack.metadata;
  const lines: string[] = [];

  lines.push(`# 📦 Subgraph Bookmark Pack: ${meta.title || "Unnamed Pack"}`);
  lines.push(``);
  if (meta.description) {
    lines.push(`> ${meta.description}`);
    lines.push(``);
  }

  // Metadata Table
  lines.push(`## 📋 Pack Metadata`);
  lines.push(``);
  lines.push(`| Property | Value |`);
  lines.push(`| :--- | :--- |`);
  lines.push(`| **Pack ID** | \`${meta.id || "unknown"}\` |`);
  lines.push(`| **Version** | \`v${meta.version || "1.0.0"}\` |`);
  lines.push(
    `| **Author** | ${meta.author?.name || "Architect"} ${meta.author?.role ? `(${meta.author.role})` : ""} |`,
  );
  lines.push(`| **Created** | ${meta.createdAt} |`);
  lines.push(`| **License** | ${meta.license || "MIT"} |`);
  if (meta.sourceGraphTitle) {
    lines.push(
      `| **Source Graph** | ${meta.sourceGraphTitle} (\`${meta.sourceGraphId || "unknown"}\`) |`,
    );
  }
  if (meta.tags && meta.tags.length > 0) {
    lines.push(`| **Tags** | ${meta.tags.map((t) => `\`${t}\``).join(" ")} |`);
  }
  lines.push(`| **Checksum** | \`${pack.checksum}\` |`);
  lines.push(``);

  // Subgraph Metrics & KPI Overview
  lines.push(`## 📊 Subgraph Metrics & Overview`);
  lines.push(``);
  lines.push(`| Metric | Count / Value |`);
  lines.push(`| :--- | :--- |`);
  lines.push(`| **Total Nodes** | **${stats.nodeCount}** |`);
  lines.push(`| **Internal Edges** | **${stats.internalEdgeCount}** |`);
  lines.push(`| **Boundary Inbound Edges** | ${stats.boundaryIncomingCount} |`);
  lines.push(`| **Boundary Outbound Edges** | ${stats.boundaryOutgoingCount} |`);
  lines.push(`| **Total Boundary Crossings** | **${stats.boundaryTotalCount}** |`);
  lines.push(`| **Bookmark Annotations** | **${stats.annotationCount}** |`);
  lines.push(`| **Graph Sections** | ${stats.sectionCount} |`);
  if (stats.totalTokens > 0) {
    lines.push(`| **Total Tokens** | ${stats.totalTokens.toLocaleString()} |`);
  }
  if (stats.totalDurationMs > 0) {
    lines.push(`| **Total Duration** | ${(stats.totalDurationMs / 1000).toFixed(2)}s |`);
  }
  if (stats.totalCostUsd > 0) {
    lines.push(`| **Estimated Cost** | $${stats.totalCostUsd.toFixed(4)} |`);
  }
  lines.push(``);

  // Embedded Mermaid Diagram
  if (config?.markdownIncludeMermaid !== false) {
    lines.push(`## 🗺️ Architecture Flowchart`);
    lines.push(``);
    lines.push("```mermaid");
    const mmd = exportToMermaid(extracted, {
      direction: config?.mermaidDirection || "TD",
      includeBoundary: true,
      includeStyles: true,
    });
    lines.push(mmd.content);
    lines.push("```");
    lines.push(``);
  }

  // Nodes Table
  if (config?.markdownIncludeTables !== false) {
    lines.push(`## 🧩 Extracted Nodes Inventory`);
    lines.push(``);
    if (dataset.nodes.length === 0) {
      lines.push(`_No nodes present in this subgraph._`);
      lines.push(``);
    } else {
      lines.push(`| Node ID | Name | Kind | Status | Duration | Tokens | Description |`);
      lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`);
      for (const node of dataset.nodes) {
        const dur = node.metrics?.durationMs !== undefined ? `${node.metrics.durationMs}ms` : "-";
        const tok =
          node.metrics?.tokensIn || node.metrics?.tokensOut
            ? `${(node.metrics.tokensIn ?? 0) + (node.metrics.tokensOut ?? 0)}`
            : "-";
        const desc = node.description ? node.description.replace(/\|/g, "\\|") : "-";
        lines.push(
          `| \`${node.id}\` | **${node.name || node.id}** | \`${node.kind || "agent"}\` | \`${
            node.status || "pending"
          }\` | ${dur} | ${tok} | ${desc} |`,
        );
      }
      lines.push(``);
    }

    // Internal Edges Table
    lines.push(`## 🔗 Internal Edge Connections`);
    lines.push(``);
    if (dataset.edges.length === 0) {
      lines.push(`_No internal edges present._`);
      lines.push(``);
    } else {
      lines.push(`| Edge ID | Source | Target | Kind | Label / Condition |`);
      lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
      for (const edge of dataset.edges) {
        const lbl = edge.label || edge.condition || "-";
        lines.push(
          `| \`${edge.id}\` | \`${edge.source}\` | \`${edge.target}\` | \`${edge.kind || "sequence"}\` | ${lbl} |`,
        );
      }
      lines.push(``);
    }

    // Boundary Crossings
    if (boundaryEdges.length > 0) {
      lines.push(`## ⚡ Boundary Crossing Edges`);
      lines.push(``);
      lines.push(`| Direction | Internal Node | External Node | Edge Kind | Condition / Label |`);
      lines.push(`| :--- | :--- | :--- | :--- | :--- |`);
      for (const be of boundaryEdges) {
        const dir = be.boundaryType === "incoming" ? "📥 Inbound" : "📤 Outbound";
        const lbl = be.edge.label || be.edge.condition || "-";
        lines.push(
          `| ${dir} | \`${be.internalNodeId}\` | \`${be.externalNodeId}\` | \`${be.edge.kind || "sequence"}\` | ${lbl} |`,
        );
      }
      lines.push(``);
    }
  }

  // Bookmark Annotations Catalog
  if (annotations.length > 0) {
    lines.push(`## 🔖 Bookmark Annotations Catalog (${annotations.length})`);
    lines.push(``);
    for (let i = 0; i < annotations.length; i++) {
      const ann = annotations[i];
      const title = ann.title || `Annotation #${i + 1}`;
      const targetStr = ann.nodeId
        ? `Node: \`${ann.nodeId}\``
        : `Canvas Point: (${ann.coordinates?.x ?? 0}, ${ann.coordinates?.y ?? 0})`;
      const priority = ann.priority ? `\`${ann.priority.toUpperCase()}\`` : "`INFO`";
      const category = ann.category ? `\`#${ann.category}\`` : "`#bookmark`";
      const author = `${ann.author?.name || "Architect"} (${ann.author?.role || "human"})`;

      lines.push(`### ${i + 1}. ${title}`);
      lines.push(`- **Target**: ${targetStr}`);
      lines.push(`- **Priority**: ${priority} | **Category**: ${category}`);
      lines.push(`- **Author**: ${author} | **Created**: ${ann.createdAt}`);
      if (ann.tags && ann.tags.length > 0) {
        lines.push(`- **Tags**: ${ann.tags.map((t) => `\`${t}\``).join(" ")}`);
      }
      lines.push(``);
      lines.push(ann.content);
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
  }

  lines.push(
    `_Report generated automatically by GVUI Subgraph Bookmark Pack Exporter on ${new Date().toISOString()}._`,
  );
  const content = lines.join("\n");
  const baseName = (meta.title || meta.id || "subgraph-report")
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-");
  const filename = `${baseName}.md`;

  return {
    format: "markdown",
    filename,
    mimeType: "text/markdown",
    content,
    byteSize: new TextEncoder().encode(content).length,
  };
}

/**
 * Universal Subgraph Export dispatcher.
 */
export function exportSubgraph(
  extracted: ExtractedSubgraph,
  pack: BookmarkPackBundle,
  config: ExportConfig,
): ExportResult {
  switch (config.format) {
    case "json-bundle":
      return exportToJsonBundle(pack, { pretty: config.prettyJson });
    case "graph-dataset":
      return exportToGraphDatasetJson(extracted.dataset, { pretty: config.prettyJson });
    case "markdown":
      return exportToMarkdownReport(extracted, pack, config);
    case "dot":
      return exportToGraphvizDot(extracted, {
        rankdir: config.dotRankdir,
        includeBoundary: config.boundaryEdgePolicy !== "none",
      });
    case "mermaid":
      return exportToMermaid(extracted, {
        direction: config.mermaidDirection,
        includeBoundary: config.boundaryEdgePolicy !== "none",
      });
    default:
      return exportToJsonBundle(pack, { pretty: config.prettyJson });
  }
}
