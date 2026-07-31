# Tutorial: Rendering Your First Custom Graph in GVUI

Welcome! This tutorial will guide you through creating and rendering your first custom graph layout using the GVUI graph visualization engine.

---

## 🎯 What You Will Learn
- How graph datasets are formatted in GVUI (`GraphDataset` interface).
- How to select a layout engine mode (`LayoutMode`).
- How to trigger layout computations asynchronously.

---

## 🛠️ Step 1: Define Your Graph Dataset

Create a JSON or TypeScript dataset containing `nodes` and `edges`:

```typescript
import type { GraphDataset } from "../types/graph";

export const sampleDataset: GraphDataset = {
  nodes: [
    { id: "api-gateway", label: "API Gateway" },
    { id: "auth-service", label: "Auth Service" },
    { id: "user-service", label: "User Service" },
  ],
  edges: [
    { id: "e1", source: "api-gateway", target: "auth-service", label: "1. /login" },
    { id: "e2", source: "auth-service", target: "user-service", label: "2. validate session" },
    { id: "e3", source: "user-service", target: "auth-service", label: "↺ verifies permissions" },
  ],
};
```

---

## 🛠️ Step 2: Choose a Layout Mode

Select from one of GVUI's 5 layout modes:
1. `"top-down"`: Custom State-Space Engine (Optimal for dense graphs with edge badges).
2. `"top-down-dagre"`: Top-Down Dagre Ranked Engine.
3. `"left-right"`: Left-to-Right Dagre Engine.
4. `"force"`: Organic Force-Directed Physics Engine.
5. `"radial"`: Concentric Radial Balance Engine.

---

## 🛠️ Step 3: Dispatch the Layout Calculation

Use `computeGraphLayoutAsync` to calculate node positions and edge routes:

```typescript
import { computeGraphLayoutAsync } from "../engine/layout/customLayoutAdapter";

async function renderGraph() {
  const result = await computeGraphLayoutAsync(sampleDataset, "top-down", {
    onProgress: (progress) => {
      console.log(`[${progress.percent}%] ${progress.detail}`);
    },
  });

  console.log("Positioned Nodes:", result.nodes);
  console.log("Routed Edges:", result.edges);
}

renderGraph();
```

🎉 Congratulations! You have successfully rendered your first graph with GVUI!
