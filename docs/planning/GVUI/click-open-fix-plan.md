# Fix Command Palette SearchInput Click-Close Bug Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where clicking the top navbar `SearchInput` immediately opens and closes the Command Palette modal pop-up.

---

## Task Breakdown

### Task 1: Refactor `SearchHeader.tsx` Click Handler & Event Bubbling Prevention

**Files:**
- Modify: `src/components/Controls/SearchHeader.tsx`
- Modify: `src/ui/molecules/SearchInput/index.tsx`

- [ ] **Step 1: In `SearchHeader.tsx`, wrap `SearchInput` click handler with `e.preventDefault()` and `e.stopPropagation()`**
- [ ] **Step 2: Set `readOnly` on the navbar `SearchInput` so focusing it acts purely as a Command Palette trigger without event collision**
- [ ] **Step 3: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 4: Commit:** `fix: prevent event collision when clicking SearchInput to open CommandPalette`
