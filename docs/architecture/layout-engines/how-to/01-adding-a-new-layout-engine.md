# How-To: Add a New Layout Engine to GVUI

This guide explains how to implement and register a new layout engine mode in GVUI.

---

## 📋 Problem Statement
You want to add a 6th layout mode (e.g. `"bipartite-grid"`) to GVUI.

---

## 🛠️ Step-by-Step Recipe

### Step 1: Update the `LayoutMode` Union Type

Open `src/state/useGraphStore.ts` and add your mode string:

```typescript
export type LayoutMode =
  | "top-down"
  | "top-down-dagre"
  | "left-right"
  | "force"
  | "radial"
  | "bipartite-grid";
```

---

### Step 2: Implement the Layout Engine Function

Add your engine function to `src/engine/layout/layoutDispatcher.ts`:

```typescript
export function computeBipartiteGridData(dataset: GraphDataset): { nodes: PositionedNode[]; edges: PositionedEdge[] } {
  // 1. Calculate node dimensions
  // 2. Compute node positions
  // 3. Compute edge paths & badge labels
  return { nodes, edges };
}
```

---

### Step 3: Register Mode in `layoutDispatcher.ts`

Add your mode case to `computeGraphLayout`:

```typescript
case "bipartite-grid":
  return computeBipartiteGridData(dataset);
```

---

### Step 4: Add Dropdown Option in `LayoutSelectDropdown`

Open `src/ui/molecules/LayoutSelectDropdown/index.tsx` and add the dropdown menu option:

```tsx
<option value="bipartite-grid">Bipartite Grid (Custom Grid Layout)</option>
```

---

### Step 5: Verify via Unit Tests

Add a unit test in `src/engine/layout/layoutDispatcher.test.ts`:

```typescript
it("computes bipartite grid layout cleanly", () => {
  const result = computeGraphLayout(sampleDataset, "bipartite-grid");
  expect(result.nodes.length).toBe(sampleDataset.nodes.length);
});
```

Run test suite: `bun test src/engine/layout/layoutDispatcher.test.ts`.
