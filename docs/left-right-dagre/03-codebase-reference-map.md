# 03. Codebase Reference Map for Left-to-Right Dagre Engine

[← Back to Master Index](../README.md)

This document maps the **Left-to-Right Dagre Engine** to source code files in GVUI.

---

## 🗺️ Codebase Directory

| File Path | Core Functionality | Primary Exported Symbols |
| :--- | :--- | :--- |
| [`nodeDimensions.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/nodeDimensions.ts#L451-L465) | Dagre graph construction with `rankdir: "LR"` | `computeDagreLayout` |
| [`layoutDispatcher.ts`](file:///Users/onurseckinsenoglu/repos/gvui/src/engine/layout/layoutDispatcher.ts#L143-L144) | Layout mode dispatcher routing `"left-right"` | `computeGraphLayout` |

```typescript
// Code Snippet from layoutDispatcher.ts
case "left-right":
  return computeDagreLayout(dataset, "LR");
```
