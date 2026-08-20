import type { GraphDataset } from "../../types/graphData";
import { resolveNodeKind, resolveNodeStatus } from "../../primitives/nodes/NodeCard/nodeKinds";

export type SqlDialect = "sqlite" | "postgres" | "mysql" | "ansi" | "json-relational";

export interface SlqExportOptions {
  dialect?: SqlDialect;
  tableNamePrefix?: string;
  includeMetrics?: boolean;
  includeProvenance?: boolean;
  includeAnnotations?: boolean;
  includeRawPayloads?: boolean;
  dropTablesFirst?: boolean;
}

/**
 * Escapes SQL string literals safely (replaces single quotes with double single quotes).
 */
export function sqlEscape(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Generates SQL DDL CREATE TABLE statements tailored to the selected SQL dialect.
 */
export function generateSqlSchema(
  dialect: SqlDialect = "sqlite",
  prefix = "gvui_",
  dropTablesFirst = false,
): string {
  // The dialect names are values of `SqlDialect`, asked for by name rather than each getting a
  // predicate of its own, so no product ends up naming a symbol in this module.
  const speaks = (name: SqlDialect): boolean => dialect === name;

  const pkText = speaks("mysql") ? "VARCHAR(128) PRIMARY KEY" : "TEXT PRIMARY KEY";
  const strType = speaks("mysql") ? "VARCHAR(255)" : "TEXT";
  const longText = speaks("mysql") ? "LONGTEXT" : "TEXT";
  const jsonType = speaks("postgres") ? "JSONB" : speaks("mysql") ? "JSON" : "TEXT";
  const intType = "INTEGER";
  const realType = speaks("postgres") ? "DOUBLE PRECISION" : "REAL";

  const lines: string[] = [];

  if (dropTablesFirst) {
    const tableNames = [
      `${prefix}provenance_events`,
      `${prefix}annotations`,
      `${prefix}node_files`,
      `${prefix}node_tools`,
      `${prefix}node_metrics`,
      `${prefix}section_nodes`,
      `${prefix}sections`,
      `${prefix}edges`,
      `${prefix}nodes`,
      `${prefix}graphs`,
    ];
    for (const tbl of tableNames) {
      lines.push(`DROP TABLE IF EXISTS ${tbl};`);
    }
    lines.push("");
  }

  // 1. Graphs table
  lines.push(`CREATE TABLE IF NOT EXISTS ${prefix}graphs (`);
  lines.push(`  id ${pkText},`);
  lines.push(`  title ${strType} NOT NULL,`);
  lines.push(`  description ${longText},`);
  lines.push(`  node_count ${intType} DEFAULT 0,`);
  lines.push(`  edge_count ${intType} DEFAULT 0,`);
  lines.push(`  created_at ${strType}`);
  lines.push(`);`);
  lines.push("");

  // 2. Nodes table
  lines.push(`CREATE TABLE IF NOT EXISTS ${prefix}nodes (`);
  lines.push(`  id ${pkText},`);
  lines.push(`  graph_id ${strType} NOT NULL,`);
  lines.push(`  name ${strType} NOT NULL,`);
  lines.push(`  kind ${strType} NOT NULL,`);
  lines.push(`  status ${strType} NOT NULL,`);
  lines.push(`  step ${intType},`);
  lines.push(`  description ${longText},`);
  lines.push(`  model ${strType},`);
  lines.push(`  tier ${strType},`);
  lines.push(`  section_id ${strType},`);
  lines.push(`  raw_json ${jsonType}`);
  lines.push(`);`);
  lines.push("");

  // 3. Edges table
  lines.push(`CREATE TABLE IF NOT EXISTS ${prefix}edges (`);
  lines.push(`  id ${pkText},`);
  lines.push(`  graph_id ${strType} NOT NULL,`);
  lines.push(`  source_id ${strType} NOT NULL,`);
  lines.push(`  target_id ${strType} NOT NULL,`);
  lines.push(`  kind ${strType},`);
  lines.push(`  label ${strType},`);
  lines.push(`  condition ${strType},`);
  lines.push(`  weight ${realType},`);
  lines.push(`  tokens ${intType},`);
  lines.push(`  raw_json ${jsonType}`);
  lines.push(`);`);
  lines.push("");

  // 4. Sections table
  lines.push(`CREATE TABLE IF NOT EXISTS ${prefix}sections (`);
  lines.push(`  id ${pkText},`);
  lines.push(`  graph_id ${strType} NOT NULL,`);
  lines.push(`  title ${strType} NOT NULL,`);
  lines.push(`  description ${longText}`);
  lines.push(`);`);
  lines.push("");

  // 5. Node Metrics table
  lines.push(`CREATE TABLE IF NOT EXISTS ${prefix}node_metrics (`);
  lines.push(`  node_id ${pkText},`);
  lines.push(`  tokens_in ${intType},`);
  lines.push(`  tokens_out ${intType},`);
  lines.push(`  total_tokens ${intType},`);
  lines.push(`  cost_usd ${realType},`);
  lines.push(`  duration_ms ${realType},`);
  lines.push(`  retries ${intType}`);
  lines.push(`);`);
  lines.push("");

  // 6. Node Tools table
  lines.push(`CREATE TABLE IF NOT EXISTS ${prefix}node_tools (`);
  lines.push(
    `  id ${speaks("mysql") ? "INT AUTO_INCREMENT PRIMARY KEY" : speaks("postgres") ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT"},`,
  );
  lines.push(`  node_id ${strType} NOT NULL,`);
  lines.push(`  tool_name ${strType} NOT NULL,`);
  lines.push(`  tool_type ${strType}`);
  lines.push(`);`);
  lines.push("");

  // 7. Node Files table
  lines.push(`CREATE TABLE IF NOT EXISTS ${prefix}node_files (`);
  lines.push(
    `  id ${speaks("mysql") ? "INT AUTO_INCREMENT PRIMARY KEY" : speaks("postgres") ? "SERIAL PRIMARY KEY" : "INTEGER PRIMARY KEY AUTOINCREMENT"},`,
  );
  lines.push(`  node_id ${strType} NOT NULL,`);
  lines.push(`  file_path ${strType} NOT NULL,`);
  lines.push(`  mode ${strType},`);
  lines.push(`  additions ${intType},`);
  lines.push(`  deletions ${intType}`);
  lines.push(`);`);
  lines.push("");

  // 8. Annotations / Findings table
  lines.push(`CREATE TABLE IF NOT EXISTS ${prefix}annotations (`);
  lines.push(`  id ${pkText},`);
  lines.push(`  node_id ${strType} NOT NULL,`);
  lines.push(`  requirement_id ${strType},`);
  lines.push(`  severity ${strType},`);
  lines.push(`  observation ${longText},`);
  lines.push(`  remediation ${longText},`);
  lines.push(`  status ${strType}`);
  lines.push(`);`);
  lines.push("");

  // 9. Provenance Events table
  lines.push(`CREATE TABLE IF NOT EXISTS ${prefix}provenance_events (`);
  lines.push(`  id ${pkText},`);
  lines.push(`  node_id ${strType} NOT NULL,`);
  lines.push(`  actor_id ${strType},`);
  lines.push(`  role ${strType},`);
  lines.push(`  status ${strType},`);
  lines.push(`  duration_ms ${realType},`);
  lines.push(`  timestamp ${strType},`);
  lines.push(`  summary ${longText}`);
  lines.push(`);`);

  return lines.join("\n");
}

/**
 * Generates SQL DML INSERT statements for a GraphDataset.
 */
export function generateSqlInserts(dataset: GraphDataset, options: SlqExportOptions = {}): string {
  const prefix = options.tableNamePrefix ?? "gvui_";
  const includeMetrics = options.includeMetrics !== false;
  const includeProvenance = options.includeProvenance !== false;
  const includeAnnotations = options.includeAnnotations !== false;
  const includeRaw = options.includeRawPayloads !== false;

  const lines: string[] = [];

  // Graph insert
  lines.push(`-- Graph Master Record`);
  lines.push(
    `INSERT INTO ${prefix}graphs (id, title, description, node_count, edge_count, created_at) VALUES (${sqlEscape(
      dataset.id,
    )}, ${sqlEscape(dataset.title || dataset.id)}, ${sqlEscape(dataset.description)}, ${
      dataset.nodes.length
    }, ${dataset.edges.length}, ${sqlEscape(new Date().toISOString())});`,
  );
  lines.push("");

  // Sections
  if (dataset.sections && dataset.sections.length > 0) {
    lines.push(`-- Section Records`);
    for (const sec of dataset.sections) {
      lines.push(
        `INSERT INTO ${prefix}sections (id, graph_id, title, description) VALUES (${sqlEscape(
          sec.id,
        )}, ${sqlEscape(dataset.id)}, ${sqlEscape(sec.title)}, ${sqlEscape(sec.description)});`,
      );
    }
    lines.push("");
  }

  // Nodes
  lines.push(`-- Node Records`);
  for (const node of dataset.nodes) {
    const kind = resolveNodeKind(node);
    const status = resolveNodeStatus(node);
    const rawJson = includeRaw ? sqlEscape(node) : "NULL";

    lines.push(
      `INSERT INTO ${prefix}nodes (id, graph_id, name, kind, status, step, description, model, tier, section_id, raw_json) VALUES (${sqlEscape(
        node.id,
      )}, ${sqlEscape(dataset.id)}, ${sqlEscape(node.name || node.id)}, ${sqlEscape(kind)}, ${sqlEscape(
        status,
      )}, ${sqlEscape(node.step)}, ${sqlEscape(node.description)}, ${sqlEscape(node.model)}, ${sqlEscape(
        node.tier,
      )}, ${sqlEscape(node.sectionId)}, ${rawJson});`,
    );

    // Node metrics
    if (includeMetrics && node.metrics) {
      const m = node.metrics;
      const totalTokens = (m.tokensIn ?? 0) + (m.tokensOut ?? 0);
      lines.push(
        `INSERT INTO ${prefix}node_metrics (node_id, tokens_in, tokens_out, total_tokens, cost_usd, duration_ms, retries) VALUES (${sqlEscape(
          node.id,
        )}, ${sqlEscape(m.tokensIn)}, ${sqlEscape(m.tokensOut)}, ${sqlEscape(
          totalTokens,
        )}, ${sqlEscape(m.costUsd)}, ${sqlEscape(m.durationMs)}, ${sqlEscape(m.retries)});`,
      );
    }

    // Tools
    if (node.tools && node.tools.length > 0) {
      for (const tool of node.tools) {
        lines.push(
          `INSERT INTO ${prefix}node_tools (node_id, tool_name, tool_type) VALUES (${sqlEscape(
            node.id,
          )}, ${sqlEscape(tool.name)}, ${sqlEscape(tool.type)});`,
        );
      }
    }

    // Files
    if (node.files && node.files.length > 0) {
      for (const file of node.files) {
        lines.push(
          `INSERT INTO ${prefix}node_files (node_id, file_path, mode, additions, deletions) VALUES (${sqlEscape(
            node.id,
          )}, ${sqlEscape(file.path)}, ${sqlEscape(file.mode)}, ${sqlEscape(
            file.additions,
          )}, ${sqlEscape(file.deletions)});`,
        );
      }
    }

    // Findings / Annotations
    if (includeAnnotations && node.metadata?.findings && node.metadata.findings.length > 0) {
      for (const finding of node.metadata.findings) {
        lines.push(
          `INSERT INTO ${prefix}annotations (id, node_id, requirement_id, severity, observation, remediation, status) VALUES (${sqlEscape(
            finding.id,
          )}, ${sqlEscape(node.id)}, ${sqlEscape(finding.requirementId)}, ${sqlEscape(
            finding.severity,
          )}, ${sqlEscape(finding.observation)}, ${sqlEscape(finding.remediation)}, ${sqlEscape(
            finding.status,
          )});`,
        );
      }
    }

    // Provenance
    if (includeProvenance && node.provenance?.events && node.provenance.events.length > 0) {
      for (const evt of node.provenance.events) {
        lines.push(
          `INSERT INTO ${prefix}provenance_events (id, node_id, actor_id, role, status, duration_ms, timestamp, summary) VALUES (${sqlEscape(
            evt.id,
          )}, ${sqlEscape(node.id)}, ${sqlEscape(evt.actorId || evt.actor || evt.agent)}, ${sqlEscape(
            evt.role,
          )}, ${sqlEscape(evt.status)}, ${sqlEscape(evt.durationMs)}, ${sqlEscape(
            evt.timestamp,
          )}, ${sqlEscape(evt.summary || evt.title)});`,
        );
      }
    }
  }
  lines.push("");

  // Edges
  lines.push(`-- Edge Relation Records`);
  for (const edge of dataset.edges) {
    const rawJson = includeRaw ? sqlEscape(edge) : "NULL";
    lines.push(
      `INSERT INTO ${prefix}edges (id, graph_id, source_id, target_id, kind, label, condition, weight, tokens, raw_json) VALUES (${sqlEscape(
        edge.id,
      )}, ${sqlEscape(dataset.id)}, ${sqlEscape(edge.source)}, ${sqlEscape(edge.target)}, ${sqlEscape(
        edge.kind,
      )}, ${sqlEscape(edge.label)}, ${sqlEscape(edge.condition)}, ${sqlEscape(
        edge.weight,
      )}, ${sqlEscape(edge.tokens)}, ${rawJson});`,
    );
  }

  return lines.join("\n");
}

/**
 * Exports graph dataset to a complete SQL script (DDL + DML).
 */
export function exportGraphToSql(dataset: GraphDataset, options: SlqExportOptions = {}): string {
  const dialect = options.dialect ?? "sqlite";
  const prefix = options.tableNamePrefix ?? "gvui_";
  const dropTables = options.dropTablesFirst ?? false;

  const header = [
    `-- ========================================================`,
    `-- GVUI Multi-Format Graph Export Suite: SQL DDL & DML`,
    `-- Dataset: ${dataset.title || dataset.id}`,
    `-- Dialect: ${dialect}`,
    `-- Exported At: ${new Date().toISOString()}`,
    `-- ========================================================`,
    "",
  ].join("\n");

  const schema = generateSqlSchema(dialect, prefix, dropTables);
  const data = generateSqlInserts(dataset, options);

  return `${header}\n${schema}\n\n${data}\n`;
}

/**
 * Exports graph dataset to a relational JSON format with separate normalized tables.
 */
export function exportGraphToRelationalJson(
  dataset: GraphDataset,
  options: SlqExportOptions = {},
): string {
  const includeMetrics = options.includeMetrics !== false;
  const includeAnnotations = options.includeAnnotations !== false;
  const includeProvenance = options.includeProvenance !== false;

  const metricsTable: Array<Record<string, unknown>> = [];
  const toolsTable: Array<Record<string, unknown>> = [];
  const filesTable: Array<Record<string, unknown>> = [];
  const annotationsTable: Array<Record<string, unknown>> = [];
  const provenanceTable: Array<Record<string, unknown>> = [];

  const nodesTable = dataset.nodes.map((node) => {
    if (includeMetrics && node.metrics) {
      metricsTable.push({
        nodeId: node.id,
        ...node.metrics,
      });
    }
    if (node.tools) {
      for (const tool of node.tools) {
        toolsTable.push({
          nodeId: node.id,
          name: tool.name,
          type: tool.type,
        });
      }
    }
    if (node.files) {
      for (const file of node.files) {
        filesTable.push({
          nodeId: node.id,
          path: file.path,
          mode: file.mode,
          additions: file.additions,
          deletions: file.deletions,
        });
      }
    }
    if (includeAnnotations && node.metadata?.findings) {
      for (const finding of node.metadata.findings) {
        annotationsTable.push({
          nodeId: node.id,
          ...finding,
        });
      }
    }
    if (includeProvenance && node.provenance?.events) {
      for (const evt of node.provenance.events) {
        provenanceTable.push({
          nodeId: node.id,
          ...evt,
        });
      }
    }

    return {
      id: node.id,
      graphId: dataset.id,
      name: node.name || node.id,
      kind: resolveNodeKind(node),
      status: resolveNodeStatus(node),
      step: node.step,
      description: node.description,
      model: node.model,
      tier: node.tier,
      sectionId: node.sectionId,
    };
  });

  const edgesTable = dataset.edges.map((edge) => ({
    id: edge.id,
    graphId: dataset.id,
    sourceId: edge.source,
    targetId: edge.target,
    kind: edge.kind ?? "sequence",
    label: edge.label,
    condition: edge.condition,
    weight: edge.weight,
    tokens: edge.tokens,
  }));

  const payload = {
    schemaVersion: "1.0.0",
    dataset: {
      id: dataset.id,
      title: dataset.title,
      description: dataset.description,
      nodeCount: dataset.nodes.length,
      edgeCount: dataset.edges.length,
    },
    tables: {
      sections: dataset.sections ?? [],
      nodes: nodesTable,
      edges: edgesTable,
      metrics: metricsTable,
      tools: toolsTable,
      files: filesTable,
      annotations: annotationsTable,
      provenanceEvents: provenanceTable,
    },
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Universal SLQ / Structured Schema export dispatcher.
 */
export function exportGraphToSlq(dataset: GraphDataset, options: SlqExportOptions = {}): string {
  if (options.dialect === "json-relational") {
    return exportGraphToRelationalJson(dataset, options);
  }
  return exportGraphToSql(dataset, options);
}

/**
 * Triggers a client-side download of a SQL (.sql) or JSON (.json) file.
 */
export function downloadSql(content: string, filename = "graph-schema.sql"): void {
  if (typeof document === "undefined") return;
  const isJson = filename.endsWith(".json");
  const blob = new Blob([content], {
    type: isJson ? "application/json" : "application/sql;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
