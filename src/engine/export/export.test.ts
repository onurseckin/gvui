import { describe, expect, it } from "bun:test";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";
import { exportPositionedGraphToSvg, exportGraphToSvg, getEmbeddedSvgStyles } from "./svgExporter";
import { computePngDimensions, derivePngFilename, exportGraphAsPng } from "./pngExporter";
import { exportGraphToMermaid, sanitizeMermaidId, sanitizeMermaidText } from "./mermaidExporter";
import {
  exportGraphToSql,
  exportGraphToRelationalJson,
  exportGraphToSlq,
  generateSqlSchema,
  sqlEscape,
} from "./slqExporter";
import { exportGraphToHtmlBundle } from "./htmlBundleExporter";

const sampleDataset: GraphDataset = {
  id: "test-pipeline-alpha",
  title: "AI Swarm Optimization Pipeline",
  description: "End-to-end multi-agent coding and validation system",
  sections: [
    {
      id: "sec-orchestration",
      title: "Orchestration & Planning",
      nodeIds: ["coord-01", "router-01"],
    },
    {
      id: "sec-execution",
      title: "Worker Execution Core",
      nodeIds: ["agent-01", "tool-01", "gate-01"],
    },
  ],
  nodes: [
    {
      id: "coord-01",
      name: "Coordinator Task Leader",
      kind: "orchestrator",
      status: "running",
      step: 1,
      stepLabel: "Dispatch Stage",
      description: "Leads task delegation and work assignment",
      tier: "l",
      model: "gemini-1.5-pro",
      tools: [{ name: "task:claim", type: "custom" }],
      files: [{ path: "src/engine/export/index.ts", mode: "write" }],
      metrics: { tokensIn: 1200, tokensOut: 450, costUsd: 0.015, durationMs: 2500, retries: 0 },
      metadata: {
        findings: [
          {
            id: "find-01",
            severity: "important",
            observation: "Edge case in parser",
            status: "open",
          },
        ],
      },
      provenance: {
        events: [
          {
            id: "evt-01",
            actorId: "coord-01",
            role: "lead",
            status: "running",
            durationMs: 1200,
            timestamp: "2026-08-15T10:00:00Z",
          },
        ],
      },
    },
    {
      id: "router-01",
      name: "Intent Router",
      kind: "router",
      status: "success",
      step: 2,
      description: "Routes payload based on task classification",
    },
    {
      id: "agent-01",
      name: "Implementer Worker",
      kind: "agent",
      status: "success",
      step: 3,
      description: "Writes clean modular TypeScript implementations",
      tier: "m",
      model: "claude-3-5-sonnet",
      metrics: { tokensIn: 4500, tokensOut: 1800, costUsd: 0.045, durationMs: 5400, retries: 0 },
    },
    {
      id: "tool-01",
      name: "Bun Test Gate",
      kind: "tool",
      status: "success",
      step: 4,
      description: "Executes unit and integration test suite",
    },
    {
      id: "gate-01",
      name: "Validator Signoff Gate",
      kind: "gate",
      status: "success",
      step: 5,
      description: "Verifies test coverage, contracts, and lints",
    },
  ],
  edges: [
    {
      id: "e-coord-router",
      source: "coord-01",
      target: "router-01",
      kind: "sequence",
      label: "initiate",
    },
    {
      id: "e-router-agent",
      source: "router-01",
      target: "agent-01",
      kind: "spawn",
      label: "dispatch worker",
    },
    {
      id: "e-agent-tool",
      source: "agent-01",
      target: "tool-01",
      kind: "data",
      label: "run tests",
    },
    {
      id: "e-tool-gate",
      source: "tool-01",
      target: "gate-01",
      kind: "validation",
      label: "verify gate",
    },
  ],
};

const samplePositionedNodes: PositionedNode[] = [
  { ...sampleDataset.nodes[0], x: 50, y: 50, width: 260, height: 140 },
  { ...sampleDataset.nodes[1], x: 380, y: 50, width: 260, height: 140 },
  { ...sampleDataset.nodes[2], x: 50, y: 260, width: 260, height: 140 },
  { ...sampleDataset.nodes[3], x: 380, y: 260, width: 260, height: 140 },
  { ...sampleDataset.nodes[4], x: 710, y: 260, width: 260, height: 140 },
];

const samplePositionedEdges: PositionedEdge[] = [
  { ...sampleDataset.edges[0], path: "M 310 120 L 380 120", labelX: 345, labelY: 110 },
  { ...sampleDataset.edges[1], path: "M 180 190 L 180 260", labelX: 190, labelY: 225 },
  { ...sampleDataset.edges[2], path: "M 310 330 L 380 330", labelX: 345, labelY: 320 },
  { ...sampleDataset.edges[3], path: "M 640 330 L 710 330", labelX: 675, labelY: 320 },
];

describe("SVG Exporter", () => {
  it("generates well-formed SVG with defs, markers, styles, and nodes", () => {
    const svg = exportPositionedGraphToSvg(
      samplePositionedNodes,
      samplePositionedEdges,
      {
        theme: "dark",
        title: "Test Pipeline",
        includeAnnotations: true,
        includeMetrics: true,
      },
      sampleDataset.sections,
    );

    expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('class="gvui-svg-root"');
    expect(svg).toContain('id="node-coord-01"');
    expect(svg).toContain("Coordinator Task Leader");
    expect(svg).toContain("gvui-arrow-sequence");
    expect(svg).toContain("gvui-arrow-spawn");
    expect(svg).toContain("Test Pipeline");
    expect(svg).toContain("Orchestration &amp; Planning");
    expect(svg).toContain("1 Open Finding");
  });

  it("supports light and transparent themes with custom styling", () => {
    const lightSvg = exportGraphToSvg(
      sampleDataset,
      { theme: "light" },
      {
        nodes: samplePositionedNodes,
        edges: samplePositionedEdges,
      },
    );
    expect(lightSvg).toContain("background-color: #f8fafc");

    const transparentSvg = exportGraphToSvg(
      sampleDataset,
      { theme: "transparent" },
      {
        nodes: samplePositionedNodes,
        edges: samplePositionedEdges,
      },
    );
    expect(transparentSvg).toContain("background-color: transparent");
  });

  it("generates embedded styles with custom CSS injections", () => {
    const css = getEmbeddedSvgStyles("dark", ".custom-test-rule { fill: cyan; }");
    expect(css).toContain(".custom-test-rule { fill: cyan; }");
    expect(css).toContain(".node-card-bg");
  });
});

describe("PNG Exporter", () => {
  it("calculates raster dimensions accurately for 1x, 2x, and 4x scales", () => {
    const bounds = { minX: 0, minY: 0, maxX: 1000, maxY: 600 };
    const plan1x = computePngDimensions(bounds, 1, 40);
    expect(plan1x.pixelWidth).toBe(1080);
    expect(plan1x.pixelHeight).toBe(680);
    expect(plan1x.scale).toBe(1);
    expect(plan1x.isDownscaled).toBe(false);

    const plan2x = computePngDimensions(bounds, 2, 40);
    expect(plan2x.pixelWidth).toBe(2160);
    expect(plan2x.pixelHeight).toBe(1360);
    expect(plan2x.scale).toBe(2);

    const plan4x = computePngDimensions(bounds, 4, 40);
    expect(plan4x.pixelWidth).toBe(4320);
    expect(plan4x.pixelHeight).toBe(2720);
    expect(plan4x.scale).toBe(4);
  });

  it("downscales safely when exceeding maxPixels cap", () => {
    const giantBounds = { minX: 0, minY: 0, maxX: 10000, maxY: 10000 };
    const cappedPlan = computePngDimensions(giantBounds, 4, 40, 1_000_000);
    expect(cappedPlan.isDownscaled).toBe(true);
    expect(cappedPlan.pixelWidth * cappedPlan.pixelHeight).toBeLessThanOrEqual(1_100_000);
  });

  it("derives clean filenames with scale indicators", () => {
    expect(derivePngFilename("My Super Pipeline", 1)).toBe("my-super-pipeline.png");
    expect(derivePngFilename("My Super Pipeline", 2)).toBe("my-super-pipeline@2x.png");
    expect(derivePngFilename("My Super Pipeline", 4)).toBe("my-super-pipeline@4x.png");
  });

  it("exports graph as PNG data in test environment", async () => {
    const result = await exportGraphAsPng({
      nodes: samplePositionedNodes,
      edges: samplePositionedEdges,
      name: "Test Pipeline",
      scale: 2,
    });

    expect(result.fileName).toBe("test-pipeline@2x.png");
    expect(result.pixelWidth).toBeGreaterThan(0);
    expect(result.pixelHeight).toBeGreaterThan(0);
    expect(result.blob).toBeDefined();
    expect(result.dataUrl).toContain("data:image/png;base64");
  });
});

describe("Mermaid Exporter", () => {
  it("generates flowchart syntax with node shapes, subgraphs, and styles", () => {
    const mermaid = exportGraphToMermaid(sampleDataset, {
      direction: "TD",
      theme: "dark",
      includeStyles: true,
      includeSubgraphs: true,
      includeAnnotations: true,
      includeMetrics: true,
    });

    expect(mermaid).toContain("%%{init: {'theme': 'dark'}}%%");
    expect(mermaid).toContain("flowchart TD");
    expect(mermaid).toContain('subgraph sec_orchestration ["Orchestration & Planning"]');
    expect(mermaid).toContain('subgraph sec_execution ["Worker Execution Core"]');
    expect(mermaid).toContain('coord_01[["<b>Coordinator Task Leader</b>');
    expect(mermaid).toContain('tool_01[("<b>Bun Test Gate</b>');
    expect(mermaid).toContain('gate_01{"<b>Validator Signoff Gate</b>');
    expect(mermaid).toContain('coord_01 --|"initiate"|--> router_01');
    expect(mermaid).toContain('router_01 ==|"dispatch worker"|==> agent_01');
    expect(mermaid).toContain('agent_01 -.|\"run tests\"|.-> tool_01');
    expect(mermaid).toContain("classDef success");
    expect(mermaid).toContain("class coord_01 running;");
    expect(mermaid).toContain("class router_01,agent_01,tool_01,gate_01 success;");
  });

  it("sanitizes node IDs and labels properly", () => {
    expect(sanitizeMermaidId("123-node-invalid.test")).toBe("node_123_node_invalid_test");
    expect(sanitizeMermaidText('Hello [World] (Nested) "Quotes"')).toBe(
      "Hello World Nested 'Quotes'",
    );
  });

  it("supports horizontal LR layout direction", () => {
    const mermaidLR = exportGraphToMermaid(sampleDataset, { direction: "LR" });
    expect(mermaidLR).toContain("flowchart LR");
  });
});

describe("SLQ Exporter", () => {
  it("generates SQL DDL and DML for SQLite dialect", () => {
    const sql = exportGraphToSql(sampleDataset, {
      dialect: "sqlite",
      includeMetrics: true,
      includeAnnotations: true,
      includeProvenance: true,
    });

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS gvui_graphs");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS gvui_nodes");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS gvui_edges");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS gvui_node_metrics");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS gvui_annotations");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS gvui_provenance_events");
    expect(sql).toContain("INSERT INTO gvui_graphs");
    expect(sql).toContain("INSERT INTO gvui_nodes");
    expect(sql).toContain("'Coordinator Task Leader'");
    expect(sql).toContain("'test-pipeline-alpha'");
    expect(sql).toContain("'gemini-1.5-pro'");
    expect(sql).toContain("INSERT INTO gvui_edges");
    expect(sql).toContain("INSERT INTO gvui_node_metrics");
    expect(sql).toContain("INSERT INTO gvui_annotations");
    expect(sql).toContain("'find-01'");
  });

  it("generates SQL DDL for PostgreSQL and MySQL dialects", () => {
    const pgSql = generateSqlSchema("postgres", "test_");
    expect(pgSql).toContain("JSONB");
    expect(pgSql).toContain("DOUBLE PRECISION");

    const mySql = generateSqlSchema("mysql", "test_");
    expect(mySql).toContain("VARCHAR(128) PRIMARY KEY");
    expect(mySql).toContain("LONGTEXT");
  });

  it("escapes SQL values safely against injection and malformed quotes", () => {
    expect(sqlEscape("It's a test")).toBe("'It''s a test'");
    expect(sqlEscape(null)).toBe("NULL");
    expect(sqlEscape(undefined)).toBe("NULL");
    expect(sqlEscape(123.45)).toBe("123.45");
    expect(sqlEscape(true)).toBe("1");
    expect(sqlEscape({ key: "val's" })).toBe("'{\"key\":\"val''s\"}'");
  });

  it("exports relational JSON table structures", () => {
    const jsonStr = exportGraphToRelationalJson(sampleDataset);
    const parsed = JSON.parse(jsonStr) as {
      schemaVersion: string;
      tables: {
        nodes: Array<{ id: string; name: string }>;
        edges: Array<{ id: string; sourceId: string }>;
        metrics: Array<{ nodeId: string; costUsd: number }>;
        annotations: Array<{ id: string; observation: string }>;
      };
    };

    expect(parsed.schemaVersion).toBe("1.0.0");
    expect(parsed.tables.nodes).toHaveLength(5);
    expect(parsed.tables.edges).toHaveLength(4);
    expect(parsed.tables.metrics).toHaveLength(2);
    expect(parsed.tables.annotations).toHaveLength(1);
    expect(parsed.tables.annotations[0].id).toBe("find-01");
  });

  it("dispatches SLQ queries dynamically", () => {
    const sql = exportGraphToSlq(sampleDataset, { dialect: "sqlite" });
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS gvui_graphs");

    const json = exportGraphToSlq(sampleDataset, { dialect: "json-relational" });
    expect(json).toContain('"schemaVersion": "1.0.0"');
  });
});

describe("HTML Bundle Exporter", () => {
  it("produces a complete self-contained offline HTML document", () => {
    const html = exportGraphToHtmlBundle(
      sampleDataset,
      {
        theme: "dark",
        title: "Offline Swarm Viewer",
        includeViewer: true,
        includeDatasetJson: true,
        includeAnnotations: true,
      },
      {
        nodes: samplePositionedNodes,
        edges: samplePositionedEdges,
      },
    );

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>Offline Swarm Viewer - GVUI Standalone Offline Viewer</title>");
    expect(html).toContain('<span class="badge-offline">OFFLINE BUNDLE</span>');
    expect(html).toContain('id="canvas-container"');
    expect(html).toContain('id="detail-drawer"');
    expect(html).toContain('id="gvui-graph-data"');
    expect(html).toContain("test-pipeline-alpha");
    expect(html).toContain("function updateTransform()");
    expect(html).toContain("function fitView()");
    expect(html).toContain("function showNodeDetail(");
  });

  it("supports light theme bundle rendering", () => {
    const lightHtml = exportGraphToHtmlBundle(sampleDataset, { theme: "light" });
    expect(lightHtml).toContain("--bg-app: #f1f5f9");
  });

  it("safely escapes embedded JSON with </script> tags and prevents premature script termination", () => {
    const maliciousDataset: GraphDataset = {
      id: "xss-test-ds",
      title: "Malicious </script><script>alert('pwned')</script> Title",
      description: "Payload containing </script><script>console.log('xss')</script> attack",
      nodes: [
        {
          id: "node-xss",
          name: "Attacker </script> Node",
          description: "Dangerous </script><script>tag",
          kind: "agent",
          status: "running",
        },
      ],
      edges: [],
    };

    const html = exportGraphToHtmlBundle(maliciousDataset);
    expect(html).not.toContain("</script><script>alert");
    expect(html).toContain("\\u003c/script\\u003e");
  });
});

describe("Adversarial Robustness & Gauntlet Verification", () => {
  it("safely handles Mermaid edge labels containing pipes (|), hashes (#), and semicolons (;)", () => {
    const adversarialDataset: GraphDataset = {
      id: "pipe-test",
      title: "Pipe & Special Char Test",
      nodes: [
        {
          id: "n1",
          name: "Node with #1 and ; semi | pipe",
          description: "Desc with [bracket] and {brace} (paren)",
          kind: "orchestrator",
        },
        {
          id: "n2",
          name: 'Node with "quotes" and <tags>',
          kind: "agent",
        },
      ],
      edges: [
        {
          id: "e1",
          source: "n1",
          target: "n2",
          kind: "sequence",
          label: "A | B | C with #hash and ;semi",
        },
      ],
    };

    const mermaid = exportGraphToMermaid(adversarialDataset);
    expect(mermaid).toContain('n1 --|"A - B - C with hash and semi"|--> n2');
    expect(mermaid).toContain('n1[["<b>Node with 1 and semi - pipe</b>');
    expect(mermaid).toContain("<i>Desc with bracket and brace paren</i>");
    // Ensure raw unescaped pipe did not split label
    expect(mermaid).not.toContain('|""|');
    expect(mermaid).not.toContain("| |");
  });
});
