← [Docs Home](../README.md) | **Tooling Index** | [Features →](../features/README.md)

# GVUI Developer Tooling & Scripts

This section documents the command-line interfaces, testing frameworks, and automation scripts supporting GVUI.

| Tool / Pipeline                                         | Description                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Layout Audit Framework](./layout-audit.md)             | Exhaustive 280-run matrix regression test asserting 8 zero-tolerance geometric invariants and budgets.       |
| [Screenshot & Visual Capture](./screenshot-pipeline.md) | Playwright headless harness driving multi-viewport captures, drawer traversal, and visual catalogs.          |
| [CLI Capsule Import](./capsule-import.md)               | Ingests orchestrator task capsules (`summary/graph.json` or `state.json`) directly into GVUI graph datasets. |

---

## Command Quick Reference

```bash
# Layout Audit & Testing
bun run audit             # Run 280-run layout audit gate
bun run test              # Run Rust tests + Bun unit tests + layout audit

# Visual Regression & Capture
bun run test:visual       # Launch Playwright visual capture harness

# Ingestion & Development
bun run gvui:import --capsule <path>  # Import long-running task capsule
bun run dev:host                      # Start local Vite dev server with WASM engine
```

---

← [Docs Home](../README.md) | [Engine Index](../engine/README.md) | [Concepts](../concepts/README.md) | [Modes](../modes/README.md)
