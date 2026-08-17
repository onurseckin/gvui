# Screenshot Ingestion & Visual Capture Pipeline

## 1. Overview

The GVUI Visual Capture & Ingestion Pipeline (`scripts/visual-capture.ts`, `scripts/screenshot-ingestion.ts`) provides automated, deterministic end-to-end visual regression testing and asset generation using Playwright.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Visual Capture Orchestrator                           │
│                      (`scripts/visual-capture.ts`)                          │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │ Playwright Multi-Viewport Harness │
                     │  - Desktop: 1280x800              │
                     │  - Tablet: 768x1024               │
                     │  - Mobile: 375x667                │
                     │  - Wide-Desktop: 1920x1080        │
                     └─────────────────┬─────────────────┘
                                       │
                        ┌──────────────┴──────────────┐
                        ▼                             ▼
                 [ Canvas Views ]              [ Drawer Tabs & Modals ]
                        │                             │
                        ▼                             ▼
             Deterministic Screenshot       Interactive Tab Traversal &
             Capture Matrix                 Lightbox Zoom Audits
                        │                             │
                        └──────────────┬──────────────┘
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │ Screenshot Ingestion Pipeline     │
                     │ (`scripts/screenshot-ingestion.ts`)│
                     └─────────────────┬─────────────────┘
                                       │
                                       ▼
                     `reports/screenshots/catalog.json`
                     `reports/visual-report.json`
```

---

## 2. Standard Viewports Matrix

Visual capture systematically tests four standardized viewport configurations (`KNOWN_VIEWPORTS`):

| Viewport Name  | Dimensions (W × H) | Target Device Class                 |
| -------------- | ------------------ | ----------------------------------- |
| `wide-desktop` | 1920 × 1080 px     | Large high-resolution monitors      |
| `desktop`      | 1280 × 800 px      | Standard laptops and workspaces     |
| `tablet`       | 768 × 1024 px      | iPad / Tablet vertical orientations |
| `mobile`       | 375 × 667 px       | iPhone / Mobile viewports           |

---

## 3. Multi-Phase Automated Interaction Script

`scripts/visual-capture.ts` drives headless browser interaction across four distinct test phases:

1. **Phase 1 — Sidebar Navigation**: Selects and switches between available graph datasets.
2. **Phase 2 — Canvas Viewport Stabilization**: Triggers layout calculations, verifies SVG rendering, and executes keyboard reset (`'R'`).
3. **Phase 3 — Node Drawer Traversal**: Clicks targeted nodes, verifies header styling, and cycles through all drawer tabs (`Overview`, `Cost`, `Dependencies`, `Assets`, `Diffs`, `Executions`, `Findings`, `Provenance`).
4. **Phase 4 — Modals & Dialogs**: Opens Command Palette (`Cmd+K`), tests search filtering, opens Lightbox zoom dialog, and verifies focus trapping.

---

## 4. Screenshot Ingestion & Catalog Manifest

When screenshots are saved to disk, `scripts/screenshot-ingestion.ts` scans the output directories, parses filename tokens into structured records, and emits `ScreenshotCatalogManifest`:

```typescript
export interface ScreenshotCatalogManifest {
  version: string;
  dataset: string;
  generatedAt: string;
  viewports: Array<{ name: string; width: number; height: number }>;
  screenshots: VisualAuditScreenshotRecord[];
  totalScreenshots: number;
}
```

This manifest is indexed by the Node Detail Drawer (`AssetsTab.tsx`) and the test reporting engine to render visual regression galleries.
