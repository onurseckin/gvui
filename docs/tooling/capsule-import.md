# CLI Capsule Import Tool

## 1. Overview & Usage

GVUI includes an automated capsule ingestion utility (`scripts/import-capsule.ts`) that extracts graph execution trajectories and task hierarchies directly from agentic runs and long-running task capsules.

```bash
# Run capsule import via Bun CLI
bun run gvui:import --capsule <path-to-capsule-directory>

# Alternative direct script execution with custom output directory
bun scripts/import-capsule.ts --capsule .capsules/2026-08-17-run-id --output public/data/graphs
```

---

## 2. Ingestion & Transformation Pipeline

The import tool handles both compiled capsule summaries and raw active state logs:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Capsule Root Directory                             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │ Check for summary/graph.json      │
                     └─────────────────┬─────────────────┘
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
                 [ Found ]                     [ Not Found ]
                        │                             │
                        ▼                             ▼
             Load Full GraphDataset          Fallback to state.json:
             (Nodes, Edges, Metrics)         Reconstruct Task Graph from
                        │                    Tasks & Dependencies
                        │                             │
                        └──────────────┬──────────────┘
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │ Normalize & Validate GraphDataset │
                     └─────────────────┬─────────────────┘
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │ Write public/data/graphs/<id>.json│
                     │ Update manifest.json Index        │
                     └───────────────────────────────────┘
```

---

## 3. Data Extraction & Fallback Strategy

1. **Primary Ingestion Path (`summary/graph.json`)**:
   If the capsule has been finalized with `summary:export`, the high-fidelity `graph.json` file is loaded directly, preserving exact node kinds, execution states, port bindings, token metrics, and provenance records.

2. **Fallback Ingestion Path (`state.json`)**:
   If the capsule is active or incomplete, the import tool parses `state.json`, iterates through `state.tasks`, and synthesizes a valid `GraphDataset`:
   - Task `id` is mapped to node `id`.
   - Task `label` is mapped to node `name`.
   - Task `status` (`done`, `validating`, `leased`, `proposed`, `changes_requested`) is mapped to visual status (`success`, `running`, `pending`, `warning`).
   - Task `deps` are transformed into directed dependency edges.

3. **Manifest Integration**:
   The graph slug is appended to `public/data/graphs/manifest.json`, making it instantly selectable in the GVUI UI sidebar and command palette without server restarts.
