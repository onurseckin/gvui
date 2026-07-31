# How-To: Debug Edge Badge Overlaps and Spacing Demands

This guide explains how to diagnose and inspect edge badge clearance issues in GVUI layout engines.

---

## 📋 Problem Statement
An edge badge overlaps an adjacent node card or edge path, or a node gap is not expanding as expected.

---

## 🛠️ Step-by-Step Recipe

### Step 1: Run the Sample Datasets Quality Gate Test

Run the dedicated dataset validator:

```bash
bun test src/engine/layout/custom/sampleDatasetsValidation.test.ts
```

If zero overlap assertions fail, the test suite output will pinpoint the exact node IDs and badge labels.

---

### Step 2: Inspect Spacing Demands in `badgePlacement.ts`

Set a breakpoint or log statement inside `placeEdgeBadges` in `src/engine/layout/custom/badgePlacement.ts#L480-L498`:

```typescript
console.log("Spacing Request Emitted:", {
  edgeId: edge.id,
  badgeWidth,
  requiredGap: requiredSameRankBadgeGap(badgeWidth),
});
```

---

### Step 3: Verify Effective Overrides in `spacingDemand.ts`

Inspect the returned override map in `src/engine/layout/custom/spacingDemand.ts`:

```typescript
const overrides = resolveEffectiveSpacingOverrides(requests, layout, config);
console.log("Resolved Spacing Overrides:", overrides);
```

Ensure `overrides.nodeGapByRank` contains the expanded gap value (e.g. 238px).
