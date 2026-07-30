# Carbon Gray & Black Dark Mode Theme Revamp Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the entire GVUI application theme from navy/blue slate to a sleek, high-contrast **Carbon Gray & Deep Black** dark mode (`#0a0a0a`, `#121212`, `#1e1e1e`, `#262626`).

**Architecture:** Update CSS design tokens in `src/styles/tokens.css` and `src/styles/utilities.css`, then align node cards, sidebar, canvas, edges, and atomic UI library components (`Button`, `Input`, `Select`, `Badge`) to the carbon palette.

**Tech Stack:** React 19, CSS Variables & Design Tokens, Bun, Oxlint, Oxfmt.

---

## Task Breakdown

### Task 1: Overhaul Central CSS Design Tokens & Utility Classes

**Files:**

- Modify: `src/styles/tokens.css`
- Modify: `src/styles/utilities.css`

- [ ] **Step 1: Replace navy/slate tokens in `tokens.css` with Carbon Gray & Deep OLED Black tokens**
  - Canvas: `#050505`
  - App background: `#0a0a0a`
  - Headers / Sidebar: `#121212`
  - Cards & Input: `#1a1a1a`
  - Hover: `#262626`
  - Borders: `#27272a` / `#3f3f46`
  - Text Primary: `#ffffff`
  - Text Secondary: `#a1a1aa`
  - Accent: `#818cf8` / `#e4e4e7`
- [ ] **Step 2: Update utility classes in `utilities.css` for carbon dark mode**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `style: overhaul CSS design tokens to carbon gray and deep black theme`

---

### Task 2: Align Atomic UI Component Library to Carbon Palette

**Files:**

- Modify: `src/ui/atoms/Button/Button.css`
- Modify: `src/ui/atoms/Input/Input.css`
- Modify: `src/ui/atoms/Select/Select.css`
- Modify: `src/ui/atoms/Badge/Badge.css`
- Modify: `src/ui/molecules/SearchInput/SearchInput.css`

- [ ] **Step 1: Update `Button.css`, `Input.css`, `Select.css`, `Badge.css` to use Carbon tokens**
- [ ] **Step 2: Update `SearchInput.css` styling**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `style: update atomic UI components to carbon gray and black theme`

---

### Task 3: Align Canvas, Graph Edges, Node Cards & Sidebar to Carbon Theme

**Files:**

- Modify: `src/engine/GraphCanvas/GraphCanvas.css`
- Modify: `src/primitives/nodes/NodeCard/NodeCard.css`
- Modify: `src/primitives/edges/GraphEdge/GraphEdge.css`
- Modify: `src/primitives/edges/GraphEdge/EdgeBadgeOverlay.tsx`
- Modify: `src/components/Sidebar/Sidebar.css`
- Modify: `src/components/Controls/Controls.css`

- [ ] **Step 1: Update canvas grid dots (`rgba(255, 255, 255, 0.05)`) and dark background (`#050505`)**
- [ ] **Step 2: Update SVG edge stroke colors (`#52525b` default, `#818cf8` selected) and SVG badge rects (`#18181b` fill, `#27272a` stroke)**
- [ ] **Step 3: Update `NodeCard.css`, `Sidebar.css`, and `Controls.css` to carbon aesthetic**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `style: align graph canvas, node cards, edges, and sidebar to carbon theme`
