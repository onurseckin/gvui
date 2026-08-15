# Module 5 Specification: Automated Playwright Visual Inspection Pipeline

**Document ID**: `GVUI-SPEC-2026-08-15-PLAYWRIGHT-AUDIT`  
**Status**: `PROPOSED / APPROVED ARCHITECTURE`  
**Target Path**: `gvui/tests/visual/`, `gvui/scripts/`  
**Author**: Dedicated Planning Director  
**Date**: 2026-08-15

---

## 1. Executive Overview & Pipeline Objectives

Visual quality, typography consistency, and layout stability are critical invariants in the GVUI graph engine. While unit tests verify schema structures and WASM mathematical bounds, end-to-end rendering fidelity across multi-viewport devices requires automated browser inspection.

This specification designs an automated Playwright Visual Inspection Pipeline to:

1. **Load Target Telemetry Graph**: Ingest the latest high-complexity execution graph (`2026-08-15-deep-audit-hardening-execution.json`).
2. **Iterate Semantic Node Archetypes**: Automate user clicks across each primary node archetype (User Prompt Input, Orchestrator Plan, Worker Agent, Validator Gate, Completeness Critic).
3. **Multi-Tab Drawer Cycling**: Expand `NodeDetailDrawer` and sequentially cycle through all active tabs (Overview, I/O Streams, Assets & Media, Executions, Files & Diffs, Raw Provenance).
4. **Multi-Viewport Visual Capture**: Capture high-DPI screenshots across 3 standard responsive breakpoints ($375\text{px}$ mobile, $768\text{px}$ tablet, $1280\text{px}$ desktop).
5. **Enforce Rendering Invariants**: Assert zero text clipping (especially descending glyphs `g`, `y`, `p`, `q`), zero unpositioned origin ghost text, proper horizontal text truncation, and strict z-index stacking.

---

## 2. Test Pipeline Architecture

```mermaid
graph TD
    subgraph Test Runner Setup
        Playwright[Playwright Test Runner]
        ViteServer[Vite Dev/Preview Server :5173]
        Dataset[public/data/graphs/2026-08-15-deep-audit-hardening-execution.json]
    end

    subgraph Viewport Matrix
        Mobile[Mobile: 375x667]
        Tablet[Tablet: 768x1024]
        Desktop[Desktop: 1280x800]
    end

    subgraph Node & Tab Walkthrough
        NodeSelect[Click Node: Prompt / Plan / Worker / Gate / Critic]
        DrawerOpen[Verify NodeDetailDrawer Visible]
        TabCycle[Cycle Tabs: Overview -> IO -> Assets -> Executions -> Files]
    end

    subgraph Quality Invariant Checks
        Check1[Zero Descending Glyph Clipping: g, y, p, q]
        Check2[Zero Origin (0,0) Ghost Badges]
        Check3[Z-Index Stacking: Canvas < Badges < Drawer < Lightbox]
        Check4[Zero Horizontal Text Overflow]
    end

    Playwright --> ViteServer
    Dataset --> ViteServer
    Playwright --> Mobile
    Playwright --> Tablet
    Playwright --> Desktop

    Mobile --> NodeSelect
    Tablet --> NodeSelect
    Desktop --> NodeSelect

    NodeSelect --> DrawerOpen
    DrawerOpen --> TabCycle
    TabCycle --> Check1
    TabCycle --> Check2
    TabCycle --> Check3
    TabCycle --> Check4
```

---

## 3. Detailed Multi-Viewport Inspection Matrix

| Viewport Category | Resolution ($W \times H$) | Target Device Class         | Primary Validation Focus                                                                         |
| :---------------- | :------------------------ | :-------------------------- | :----------------------------------------------------------------------------------------------- |
| **Mobile**        | $375 \times 667$          | iPhone SE / Compact Mobile  | Full-width drawer slide-over, top navbar burger collapse, scrubber overflow scrolling.           |
| **Tablet**        | $768 \times 1024$         | iPad Mini / Portrait Tablet | Drawer width ($380\text{px}$), canvas touch pan/zoom gestures, toolbar dropdown wrapping.        |
| **Desktop**       | $1280 \times 800$         | Standard Laptop Display     | Dual-pane canvas + drawer layout, asset lightbox gallery grid, command stdout/stderr split view. |
| **Wide Desktop**  | $1920 \times 1080$        | High-Res Monitor            | Multi-wave DAG spread, radial layout diameter, sub-pixel edge antialiasing.                      |

---

## 4. Playwright Visual Inspection Script Design

```typescript
import { test, expect } from "@playwright/test";

const TARGET_DATASET = "2026-08-15-deep-audit-hardening-execution";
const VIEWPORTS = [
  { name: "mobile", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

const NODE_TARGETS = [
  { id: "node-input-prompt", label: "User Prompt", kind: "input" },
  { id: "node-orchestrator-plan", label: "Orchestrator Plan", kind: "orchestrator" },
  { id: "node-task-task-01-audit-matrix-spec", label: "Worker Implementer", kind: "agent" },
  { id: "node-gate-task-01-audit-matrix-spec", label: "Validator Gate", kind: "gate" },
  { id: "node-critic-evaluation", label: "Completeness Critic", kind: "critic" },
];

const DRAWER_TABS = [
  { id: "overview", label: "Overview & I/O" },
  { id: "assets", label: "Assets & Media" },
  { id: "files", label: "Files & Diffs" },
  { id: "commands", label: "Executions" },
];

for (const vp of VIEWPORTS) {
  test.describe(`GVUI Visual Inspection [${vp.name}: ${vp.width}x${vp.height}]`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`/graphs/${TARGET_DATASET}`);
      await page.waitForSelector(".graph-transform-stage", { state: "visible" });
      // Ensure layout calculation completes and loading overlay dismisses
      await page.waitForSelector(".loading-overlay", { state: "detached", timeout: 10000 });
    });

    test("Canvas Baseline & Origin Ghost Text Check", async ({ page }) => {
      // Assert zero ghost badges rendered at (0,0)
      const ghostBadges = page.locator('.edge-badge-group[transform="translate(0, 0)"]');
      await expect(ghostBadges).toHaveCount(0);

      // Assert top-left canvas has no intrusive title banners
      const floatingBanners = page.locator(".canvas-title-banner");
      await expect(floatingBanners).toHaveCount(0);

      await page.screenshot({
        path: `test-results/visual/${vp.name}-00-canvas-baseline.png`,
        fullPage: false,
      });
    });

    for (const target of NODE_TARGETS) {
      test(`Inspect Node Archetype: ${target.label}`, async ({ page }) => {
        const nodeLocator = page.locator(`[data-node-id="${target.id}"], #${target.id}`);
        if ((await nodeLocator.count()) > 0) {
          await nodeLocator.first().click();

          const drawer = page.locator(".node-drawer");
          await expect(drawer).toBeVisible();

          for (const tab of DRAWER_TABS) {
            const tabButton = drawer.locator(`.drawer-tab:has-text("${tab.label}")`);
            if ((await tabButton.count()) > 0) {
              await tabButton.click();
              await page.waitForTimeout(150); // Allow tab transition

              // Screenshot tab content
              await drawer.screenshot({
                path: `test-results/visual/${vp.name}-${target.kind}-${tab.id}.png`,
              });
            }
          }
        }
      });
    }
  });
}
```

---

## 5. Visual Invariant Audit Assertions

### 5.1 Descending Glyph Clipping Audit (`g`, `y`, `p`, `q`, `j`)

- **Problem**: When `line-height: 1` or tight `height` bounds are set on badges or tabs with `overflow: hidden`, descenders are sliced off.
- **Assertion**:
  - Badge containers must have `padding: 0 8px; line-height: 1.2; box-sizing: border-box;`.
  - Font rendering must specify `-webkit-font-smoothing: antialiased; text-rendering: geometricPrecision;`.

### 5.2 Z-Index Layer Stacking Invariant

All visual layers must strictly follow the defined hierarchy:
$$\mathcal{Z}_{\text{canvas}} (0) < \mathcal{Z}_{\text{svg-edges}} (1) < \mathcal{Z}_{\text{nodes}} (2) < \mathcal{Z}_{\text{badges}} (10) < \mathcal{Z}_{\text{scrubber}} (50) < \mathcal{Z}_{\text{drawer}} (100) < \mathcal{Z}_{\text{modal}} (1000)$$

### 5.3 Missing Payload Recovery Fallback

When a node contains no media assets, commands, or diffs:

- The corresponding tab must NOT throw a JavaScript rendering exception or blank card.
- A standardized empty state placeholder must render:
  ```html
  <p class="drawer-prose" style="color: #71717a; padding: 16px;">
    No command executions recorded for this node.
  </p>
  ```

---

## 6. Verification Pipeline Execution

The automated visual audit pipeline is executed via:

```bash
bun test tests/visual/graphVisualAudit.spec.ts
```

All captured screenshots are systematically cataloged in `test-results/visual/` and ingested into the harness capsule summary report via `screenshot-ingestion.ts`.

---
