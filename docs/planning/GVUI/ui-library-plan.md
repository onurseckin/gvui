# Atomic UI Library & Base UI Component Refactoring Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a modular Atomic UI Component Library in `src/ui/` powered by Base UI (`@base-ui-components/react`) and refactor all app controls, sidebar, and toolbars to consume these atomic components.

**Architecture:** Base UI unstyled headless primitives wrapped in custom Atomic Design layers (`src/ui/atoms/`, `src/ui/molecules/`) with co-located types, styles, and zero-any type safety.

**Tech Stack:** `@base-ui-components/react`, React 19, TypeScript 7, Bun, Vite, Oxlint, Oxfmt.

---

## Task Breakdown

### Task 1: UI Atoms (`Button`, `Input`, `Select`, `Badge`)

**Files:**
- Create: `src/ui/atoms/Button/Button.types.ts`
- Create: `src/ui/atoms/Button/Button.css`
- Create: `src/ui/atoms/Button/index.tsx`
- Create: `src/ui/atoms/Input/Input.types.ts`
- Create: `src/ui/atoms/Input/Input.css`
- Create: `src/ui/atoms/Input/index.tsx`
- Create: `src/ui/atoms/Select/Select.types.ts`
- Create: `src/ui/atoms/Select/Select.css`
- Create: `src/ui/atoms/Select/index.tsx`
- Create: `src/ui/atoms/Badge/Badge.types.ts`
- Create: `src/ui/atoms/Badge/Badge.css`
- Create: `src/ui/atoms/Badge/index.tsx`
- Create: `src/ui/index.ts`

- [ ] **Step 1: Create `Button` atom wrapping Base UI `Button`**
- [ ] **Step 2: Create `Input` atom wrapping Base UI `Input`**
- [ ] **Step 3: Create `Select` atom wrapping Base UI `Select`**
- [ ] **Step 4: Create `Badge` status atom**
- [ ] **Step 5: Export barrel in `src/ui/index.ts`**
- [ ] **Step 6: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 7: Commit:** `feat: create Base UI powered atomic component library (Button, Input, Select, Badge)`

---

### Task 2: UI Molecules (`SearchInput`, `FileUploadButton`, `LayoutSelectDropdown`)

**Files:**
- Create: `src/ui/molecules/SearchInput/SearchInput.types.ts`
- Create: `src/ui/molecules/SearchInput/SearchInput.css`
- Create: `src/ui/molecules/SearchInput/index.tsx`
- Create: `src/ui/molecules/FileUploadButton/index.tsx`
- Create: `src/ui/molecules/LayoutSelectDropdown/index.tsx`

- [ ] **Step 1: Create `SearchInput` molecule combining Input atom, icon, clear button, and `Cmd+F` listener**
- [ ] **Step 2: Create `FileUploadButton` molecule combining Button atom and file input**
- [ ] **Step 3: Create `LayoutSelectDropdown` molecule wrapping Select atom for graph layout modes**
- [ ] **Step 4: Update barrel export `src/ui/index.ts`**
- [ ] **Step 5: Run `bun run typecheck && bun run lint && bun run format`**
- [ ] **Step 6: Commit:** `feat: add SearchInput, FileUploadButton, and LayoutSelectDropdown molecules`

---

### Task 3: Refactor Sidebar & Controls to Consume Atomic UI Components

**Files:**
- Modify: `src/components/Sidebar/index.tsx`
- Modify: `src/components/Controls/SearchHeader.tsx`
- Modify: `src/components/Controls/CanvasToolbar.tsx`

- [ ] **Step 1: Refactor `Sidebar` to use `Button` and `FileUploadButton`**
- [ ] **Step 2: Refactor `SearchHeader` to use `SearchInput` molecule**
- [ ] **Step 3: Refactor `CanvasToolbar` to use `Button` atom and `LayoutSelectDropdown` molecule**
- [ ] **Step 4: Run `bun run typecheck && bun run lint && bun run format:check && bun run build:local`**
- [ ] **Step 5: Commit:** `refactor: integrate atomic UI component library across Sidebar, SearchHeader, and CanvasToolbar`
