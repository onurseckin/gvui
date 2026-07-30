# Developer Settings Refresh Button & Recursive Subtree Collapse Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a header refresh button (`🔄 Refresh`) and live event listener to Developer Settings for instant local storage updates, and enforce 100% recursive downstream subtree node collection for collapsed nodes.

---

## Task Breakdown

### Task 1: Add Header Refresh Button & Live Event Listener to `DeveloperSettings`

**Files:**

- Modify: `src/components/DeveloperSettings/index.tsx`
- Modify: `src/components/DeveloperSettings/DeveloperSettings.css`

- [ ] **Step 1: In `DeveloperSettings/index.tsx`, add a Refresh icon button in the header (`.developer-settings-header-actions`)**
- [ ] **Step 2: Add window `storage` event listener & `refreshStorage()` function so local storage live-updates**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 4: Commit:** `feat: add refresh button and live event listener to Developer Settings`

---

### Task 2: Ensure 100% Recursive Subtree Collapse Collection

**Files:**

- Modify: `src/engine/GraphCanvas/index.tsx`

- [ ] **Step 1: Audit BFS graph traversal in `hiddenNodeIds` to ensure all recursive downstream descendant nodes in the entire subtree are collected**
- [ ] **Step 2: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 3: Commit:** `fix: enforce recursive downstream subtree collapse node collection`
