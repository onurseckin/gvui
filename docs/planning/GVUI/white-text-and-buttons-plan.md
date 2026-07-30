# Pure White High-Contrast Typography & Navbar Buttons Refinement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all muted gray text across the application in favor of 100% high-contrast pure white (`#ffffff`), update Fit/Reset buttons with right-aligned keyboard shortcut badges (`F`/`R`), refine icon-only buttons (`+`, `-`, `☰`) to have large 20px white icon glyphs inside standard containers, and set JSON filename text to pure white.

---

## Task Breakdown

### Task 1: Eliminate Muted Text System-Wide & Set Pure White Palette

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/utilities.css`
- Modify: `src/index.css`

- [ ] **Step 1: Set `--text-primary`, `--text-heading`, `--text-muted`, and `--text-dimmed` to `#ffffff` in `tokens.css`**
- [ ] **Step 2: Update all badge status text tokens to high-contrast bright colors on dark carbon surfaces**
- [ ] **Step 3: Update `index.css` so `.navbar-file-title` is pure white (`#ffffff`)**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 5: Commit:** `style: eliminate all muted gray text system-wide in favor of pure white high contrast`

---

### Task 2: Refine Navbar Buttons, Hotkey Badges (`F`/`R`), & Large Hamburger Icon

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Controls/CanvasToolbar.tsx`
- Modify: `src/components/Controls/Controls.css`
- Modify: `src/ui/atoms/Button/Button.css`

- [ ] **Step 1: Update `CanvasToolbar.tsx` Fit and Reset buttons:**
  - Remove leading emojis (`🎯`, `↺`).
  - Text label on left: `"Fit"`, `"Reset"`.
  - Right-aligned shortcut badge inside button: `<kbd className="toolbar-kbd">F</kbd>` and `<kbd className="toolbar-kbd">R</kbd>`.
- [ ] **Step 2: Revert text button font sizes to standard 13px (`Fit`, `Reset`, `Layout`, `Export HTML`)**
- [ ] **Step 3: Update icon-only buttons (`+`, `-`, and sidebar hamburger `☰`):**
  - Keep standard compact button container.
  - Set icon glyph font-size to 20px pure white (`#ffffff`).
  - Ensure hamburger icon `☰` is used consistently for both expanded and collapsed states.
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `refactor: refine navbar button sizing, add F and R hotkey badges, and enlarge icon glyphs`
