# Top Navbar Full-Width Layout, Search Cmd+K & Controls Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Overhaul the top header layout so the navbar spans 100% full width across the top, relocate all floating canvas controls into the navbar on the right side, update `SearchInput` to `#000000` background with `Cmd+K` (`⌘ + K`) white shortcut indicator, and add a sidebar collapse/expand toggle button.

---

## Task Breakdown

### Task 1: SearchInput & SearchHeader Refactoring (`Cmd+K`, `#000000` bg, White Icons & Shortcut)

**Files:**

- Modify: `src/ui/molecules/SearchInput/SearchInput.types.ts`
- Modify: `src/ui/molecules/SearchInput/SearchInput.css`
- Modify: `src/ui/molecules/SearchInput/index.tsx`
- Modify: `src/components/Controls/SearchHeader.tsx`

- [ ] **Step 1: Update `SearchInput/index.tsx` hotkey listener to `Cmd+K` / `Ctrl+K`**
- [ ] **Step 2: Update shortcut visualizer to display `⌘ + K` with pure white color (`#ffffff`) and matching 12px icon size**
- [ ] **Step 3: Update `SearchInput.css` to use `#000000` background, `#ffffff` search icon, and `#ffffff` input text**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 5: Commit:** `feat: update SearchInput to Cmd+K, pure black background, and white icons`

---

### Task 2: Top Navbar Layout Overhaul & Sidebar Collapse Toggle

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar/index.tsx`
- Modify: `src/components/Sidebar/Sidebar.css`
- Modify: `src/components/Controls/SearchHeader.tsx`
- Modify: `src/components/Controls/CanvasToolbar.tsx`
- Modify: `src/components/Controls/Controls.css`
- Modify: `src/index.css`

- [ ] **Step 1: Update `App.tsx` layout so Top Navbar spans full width across top (`100%`), with Sidebar and Canvas underneath**
- [ ] **Step 2: Remove sidebar title (`GVUI` header and divider) from `Sidebar/index.tsx`**
- [ ] **Step 3: Add sidebar toggle button (hamburger icon `☰` / `✕`) on far left of Top Navbar in `App.tsx`**
- [ ] **Step 4: Add state `isSidebarOpen` defaulting to `true` in `App.tsx` to handle expand/collapse transitions**
- [ ] **Step 5: Integrate active JSON filename indicator (`📄 ${currentFile}`) in Top Navbar center**
- [ ] **Step 6: Move Canvas Controls (Zoom In/Out, Fit, Reset, Layout Select, Export HTML) into Top Navbar to the left of `SearchInput`**
- [ ] **Step 7: Position `SearchInput` (`Cmd+K`) as the most right-aligned element on Top Navbar**
- [ ] **Step 8: Remove bottom-right floating canvas toolbar container**
- [ ] **Step 9: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 10: Commit:** `refactor: overhaul top navbar layout, relocate canvas controls, and add sidebar toggle`
