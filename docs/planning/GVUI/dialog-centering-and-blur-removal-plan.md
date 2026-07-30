# Dialog Dead-Centering & Blur Overlay Removal Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove backdrop blur from `CommandPalette` and `DeveloperSettings` overlays, and enforce 100% dead-centered modal positioning using `position: fixed; top: 0; bottom: 0; left: 0; right: 0; margin: auto; z-index: 10000;`.

---

## Task Breakdown

### Task 1: Update `CommandPalette.css` & `DeveloperSettings.css`

**Files:**
- Modify: `src/components/CommandPalette/CommandPalette.css`
- Modify: `src/components/DeveloperSettings/DeveloperSettings.css`

- [ ] **Step 1: Remove `backdrop-filter: blur(12px)` and `-webkit-backdrop-filter` from `.command-palette-backdrop` and `.developer-settings-backdrop`**
- [ ] **Step 2: Set backdrop overlays to `background-color: rgba(0, 0, 0, 0.75); position: fixed; inset: 0; z-index: 9998;`**
- [ ] **Step 3: Set dialog popups (`.command-palette-dialog` & `.developer-settings-dialog`) to `position: fixed; top: 0; bottom: 0; left: 0; right: 0; margin: auto; z-index: 10000; width: 50vw; min-width: 540px; max-width: 880px; height: 60vh; max-height: 650px; min-height: 420px;`**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `fix: remove backdrop blur and enforce dead-centered fixed modal dialog positioning`
