# Developer Settings Modal & Local Storage Inspector Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Developer Settings gear icon at the bottom of the sidebar that opens a centered Base UI Dialog modal featuring a colorized Local Storage viewer and a "Clear Local Storage" action.

---

## Task Breakdown

### Task 1: Create `DeveloperSettings` Modal Component

**Files:**
- Create: `src/components/DeveloperSettings/DeveloperSettings.types.ts`
- Create: `src/components/DeveloperSettings/DeveloperSettings.css`
- Create: `src/components/DeveloperSettings/index.tsx`

- [ ] **Step 1: Define `DeveloperSettingsProps` interface and state types**
- [ ] **Step 2: Build Base UI Dialog modal with tab list ("Local Storage" active by default)**
- [ ] **Step 3: Render formatted, colorized JSON view of current `localStorage` key-value contents**
- [ ] **Step 4: Implement "Clear Local Storage" action button (`localStorage.clear()`, state refresh, notification)**
- [ ] **Step 5: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 6: Commit:** `feat: create DeveloperSettings modal with Local Storage inspector and clear action`

---

### Task 2: Integrate Developer Settings Gear Button in Sidebar & App

**Files:**
- Modify: `src/components/Sidebar/index.tsx`
- Modify: `src/components/Sidebar/Sidebar.css`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add bottom footer in `Sidebar` with gear button (`⚙️ Settings`)**
- [ ] **Step 2: Connect gear button click in `App.tsx` to open `DeveloperSettings` modal**
- [ ] **Step 3: When Local Storage is cleared, trigger dynamic `Fit View` for current graph**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `feat: integrate DeveloperSettings gear icon button in sidebar footer`
