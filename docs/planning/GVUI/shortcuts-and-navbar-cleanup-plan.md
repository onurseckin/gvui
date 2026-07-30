# Keyboard Shortcuts (F/R) & Top Navbar Clean Up Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register global `F` (Fit View) and `R` (Reset View) hotkeys, remove `GVUI` text label and divider from top navbar, and update navbar button icons (`+`, `-`, `🎯`, `↺`, `☰`) to pure white (`#ffffff`) with consistent larger icon sizing.

---

## Task Breakdown

### Task 1: Register Keyboard Shortcuts (`F` for Fit View, `R` for Reset View)

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/components/Controls/CanvasToolbar.tsx`

- [ ] **Step 1: Add global keydown listener in `App.tsx` or `CanvasToolbar.tsx` for `KeyF` and `KeyR`**
  - Check `!event.target` is input / textarea / contenteditable and `!isCommandPaletteOpen` before firing.
  - `F` key calls `fitView()` calculation or resets bounds.
  - `R` key calls `resetViewport()`.
- [ ] **Step 2: Add keyboard shortcut tooltips or title attributes (`Fit View (F)`, `Reset View (R)`)**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `feat: add F and R keyboard shortcuts for canvas fit and reset view`

---

### Task 2: Top Navbar Icon Styling & Remove GVUI Title/Divider

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Modify: `src/components/Controls/Controls.css`
- Modify: `src/ui/atoms/Button/Button.css`

- [ ] **Step 1: Remove `GVUI` brand title `<h1 className="brand-title">` and vertical divider in `App.tsx`**
- [ ] **Step 2: Standardize top navbar toggle button (`☰`) and canvas control buttons (`+`, `-`, `🎯`, `↺`) to pure white (`#ffffff`) with 18px icon size**
- [ ] **Step 3: Update `index.css` and `Controls.css` for clean 36px height navbar icon buttons**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `refactor: clean up navbar title/divider and update button icons to white 18px`
