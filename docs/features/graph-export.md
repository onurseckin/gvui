# Graph Export Pipeline

## 1. Overview

GVUI features a multi-format graph export subsystem (`src/engine/export/`) capable of transforming interactive graph states into production-ready standalone artifacts. All exports preserve visual styling, node archetypes, status highlights, edge routing geometry, and metadata.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            GVUI Export Pipeline                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ Available Export Formats:                                                   │
│ 1. Standalone SVG (`svgExporter.ts`)                                        │
│ 2. High-Resolution PNG (`pngExporter.ts`)                                   │
│ 3. Mermaid Flowchart (`mermaidExporter.ts`)                                 │
│ 4. Relational SQL DDL & DML (`slqExporter.ts`)                              │
│ 5. Self-Contained HTML Bundle (`htmlBundleExporter.ts`)                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Supported Export Formats

### 2.1. Standalone SVG (`svgExporter.ts`)

- **Characteristics**: Pure XML-based vector graphics, infinitely scalable.
- **Embedded Assets**: Inline CSS stylesheet, font definitions, gradient definitions, marker arrowheads, node cards, and edge polylines with badge overlays.
- **Metadata**: Embedded RDF / XML metadata containing graph identifier, node count, edge count, and layout timestamp.

### 2.2. High-Resolution PNG (`pngExporter.ts`)

- **Characteristics**: Rasterized image output suitable for documentation, presentations, and tickets.
- **Configuration**:
  - DPI scaling factor (1x, 2x, 4x retina).
  - Background options: Dark theme, Light theme, or Transparent.
  - Automatic padding and margin calculation.

### 2.3. Mermaid Flowchart (`mermaidExporter.ts`)

- **Characteristics**: Markdown-compatible text diagram syntax.
- **Syntax Mapping**:
  - `flowchart TD` (for top-down) or `flowchart LR` (for left-right).
  - Node shapes mapped by archetype (e.g. `agent[Name]`, `tool((Tool))`, `evaluator{Review}`).
  - Edge styles (`-->` for solid, `-.->` for dotted, `==>` for thick).
  - CSS class definitions (`classDef success`, `classDef error`, `classDef running`).

### 2.4. Relational SQL Export (`slqExporter.ts`)

- **Characteristics**: Generates full schema DDL and bulk INSERT statements.
- **Supported Dialects**:
  - `sqlite`: SQLite 3 DDL with standard table constraints.
  - `postgres`: PostgreSQL schema with JSONB columns.
  - `mysql`: MySQL schema with InnoDB engine and LongText/JSON types.
  - `ansi`: Portable ANSI SQL DDL.
  - `json-relational`: Relational entity mapping in structured JSON.
- **Tables Created**:
  - `gvui_graphs`: Graph ID, title, mode, execution timestamp.
  - `gvui_nodes`: Node IDs, names, archetypes, ranks, coordinates, dimensions.
  - `gvui_edges`: Edge IDs, source/target pairs, routing polylines, badge data.
  - `gvui_node_metrics`: Tokens, costs, durations, cache statistics.
  - `gvui_annotations`: Canvas sticky notes, user callouts, bounding boxes.
  - `gvui_provenance_events`: Immutable audit logs and execution records.

### 2.5. Standalone Interactive HTML Bundle (`htmlBundleExporter.ts`)

- **Characteristics**: Single, self-contained HTML file containing zero external network dependencies.
- **Components Inlined**:
  - Embedded SVG renderer and canvas interaction scripts (pan, zoom, node click).
  - Embedded dataset payload (JSON).
  - Complete CSS styling for dark and light modes.
- **Use Case**: Offline graph sharing, CI/CD visual reports, and email attachments.
