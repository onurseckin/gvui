import { beforeEach, describe, expect, it } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { GraphNodeData, PositionedNode } from "../../types/graphData";
import { AnnotationEditorModal } from "./AnnotationEditorModal";
import { AnnotationFilterBar } from "./AnnotationFilterBar";
import { AnnotationPin } from "./AnnotationPin";
import { AuthorBadge, describeAuthorRole, formatAnnotationTime } from "./AuthorBadge";
import { MarkdownRenderer } from "./MarkdownRenderer";
import {
  parseInlineMarkdown,
  parseMarkdownBlocks,
  sanitizeMarkdownHref,
  toggleMarkdownCheckbox,
} from "./markdownUtils";
import { StickyNoteCard } from "./StickyNoteCard";
import type { CanvasAnnotation, CreateAnnotationInput } from "./types";
import { filterAnnotations, useAnnotationStore } from "./useAnnotationStore";
import {
  GraphAnnotationLayer,
  resolveAnnotationPlacement,
} from "../../engine/GraphCanvas/GraphAnnotationLayer";
import { NotesTab } from "../NodeDetailDrawer/tabs/NotesTab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function silenceReactTestRendererDeprecationWarning<T>(fn: () => T): T {
  const originalConsoleError = console.error;
  console.error = (message?: unknown, ...args: unknown[]) => {
    if (
      typeof message === "string" &&
      (message.includes("react-test-renderer is deprecated") ||
        message.includes("An update to Root inside a test was not wrapped in act") ||
        message.includes("An update to AnnotationFilterBar") ||
        message.includes("An update to GraphAnnotationLayer") ||
        message.includes("The result of getSnapshot should be cached"))
    ) {
      return;
    }
    originalConsoleError(message, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = originalConsoleError;
  }
}

describe("Markdown Parsing, Rendering & Link Sanitization Utilities", () => {
  it("parses inline markdown tokens correctly", () => {
    const text =
      "Hello **bold** *italic* ~~strike~~ `code` [link](https://example.com) @agent #bug";
    const tokens = parseInlineMarkdown(text);

    expect(tokens.some((t) => t.type === "bold" && t.content === "bold")).toBe(true);
    expect(tokens.some((t) => t.type === "italic" && t.content === "italic")).toBe(true);
    expect(tokens.some((t) => t.type === "strikethrough" && t.content === "strike")).toBe(true);
    expect(tokens.some((t) => t.type === "code" && t.content === "code")).toBe(true);
    expect(
      tokens.some(
        (t) => t.type === "link" && t.content === "link" && t.href === "https://example.com",
      ),
    ).toBe(true);
    expect(tokens.some((t) => t.type === "mention" && t.content === "@agent")).toBe(true);
    expect(tokens.some((t) => t.type === "tag" && t.content === "#bug")).toBe(true);
  });

  it("sanitizes dangerous markdown link hrefs to protect against XSS", () => {
    // Dangerous protocols
    expect(sanitizeMarkdownHref("javascript:alert(1)")).toBe("#");
    expect(sanitizeMarkdownHref("JAVASCRIPT:alert(1)")).toBe("#");
    expect(sanitizeMarkdownHref("  javascript:void(0)  ")).toBe("#");
    expect(sanitizeMarkdownHref("vbscript:msgbox(1)")).toBe("#");
    expect(sanitizeMarkdownHref("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBe(
      "#",
    );
    expect(sanitizeMarkdownHref("file:///etc/passwd")).toBe("#");

    // Safe protocols & paths
    expect(sanitizeMarkdownHref("https://example.com/spec")).toBe("https://example.com/spec");
    expect(sanitizeMarkdownHref("http://localhost:3000")).toBe("http://localhost:3000");
    expect(sanitizeMarkdownHref("mailto:developer@example.com")).toBe(
      "mailto:developer@example.com",
    );
    expect(sanitizeMarkdownHref("#section-anchors")).toBe("#section-anchors");
    expect(sanitizeMarkdownHref("/api/reports/1")).toBe("/api/reports/1");
    expect(sanitizeMarkdownHref("./relative/path")).toBe("./relative/path");
  });

  it("parses multiline markdown block tokens correctly including tables and code blocks", () => {
    const raw = `# Heading 1
## Heading 2
> Blockquote text
\`\`\`typescript
const x = 42;
\`\`\`
- Unordered item 1
- Unordered item 2
1. Ordered item 1
2. Ordered item 2
- [ ] Task incomplete
- [x] Task completed
---
| Col1 | Col2 |
|---|---|
| Val1 | Val2 |
Regular paragraph here.`;

    const blocks = parseMarkdownBlocks(raw);
    expect(blocks.some((b) => b.type === "heading" && b.level === 1)).toBe(true);
    expect(blocks.some((b) => b.type === "heading" && b.level === 2)).toBe(true);
    expect(blocks.some((b) => b.type === "blockquote")).toBe(true);
    expect(
      blocks.some(
        (b) =>
          b.type === "codeblock" && b.language === "typescript" && b.code.includes("const x = 42;"),
      ),
    ).toBe(true);
    expect(blocks.some((b) => b.type === "unordered-list" && b.items.length === 2)).toBe(true);
    expect(blocks.some((b) => b.type === "ordered-list" && b.items.length === 2)).toBe(true);
    expect(blocks.some((b) => b.type === "task-list" && b.items.length === 2)).toBe(true);
    expect(blocks.some((b) => b.type === "hr")).toBe(true);
    expect(blocks.some((b) => b.type === "table" && b.headers.includes("Col1"))).toBe(true);
    expect(blocks.some((b) => b.type === "paragraph")).toBe(true);
  });

  it("handles unclosed codeblock without throwing errors or infinite loops", () => {
    const unclosed = "```typescript\nconst open = true;\nconsole.log(open);";
    const blocks = parseMarkdownBlocks(unclosed);
    expect(blocks.length).toBe(1);
    expect(blocks[0].type).toBe("codeblock");
    if (blocks[0].type === "codeblock") {
      expect(blocks[0].code).toContain("const open = true;");
    }
  });

  it("handles empty or whitespace raw markdown", () => {
    expect(parseMarkdownBlocks("")).toEqual([]);
    expect(parseMarkdownBlocks("   \n\n  ")).toEqual([]);
  });

  it("toggles task list checkboxes accurately by index", () => {
    const md = "- [ ] First task\n- [x] Second task\n- [ ] Third task";
    const toggled0 = toggleMarkdownCheckbox(md, 0);
    expect(toggled0).toContain("- [x] First task");

    const toggled1 = toggleMarkdownCheckbox(md, 1);
    expect(toggled1).toContain("- [ ] Second task");
  });

  it("renders MarkdownRenderer with react-test-renderer and enforces sanitized href attributes", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      let renderer!: ReactTestRenderer;
      let taskToggled: number | null = null;

      act(() => {
        renderer = create(
          createElement(MarkdownRenderer, {
            content:
              "## Subtitle\n- [ ] Checklist item\n[Safe Link](https://example.com)\n[Dangerous Link](javascript:alert(document.cookie))",
            onToggleTask: (idx) => {
              taskToggled = idx;
            },
          }),
        );
      });

      const root = renderer.root;
      const h2 = root.findByProps({ className: "md-h2" });
      expect(h2).toBeDefined();

      const checkbox = root.findByProps({ className: "md-task-checkbox" });
      expect(checkbox).toBeDefined();

      act(() => {
        checkbox.props.onChange({ stopPropagation: () => {} });
      });
      expect(taskToggled).toBe(0);

      // Check link sanitization in rendered DOM
      const links = root.findAllByProps({ className: "md-link" });
      expect(links.length).toBe(2);
      expect(links[0].props.href).toBe("https://example.com");
      expect(links[1].props.href).toBe("#");
    });
  });
});

describe("AuthorBadge & Formatting", () => {
  it("describes each author role with distinct accent and icon", () => {
    const human = describeAuthorRole("human");
    expect(human.label).toBe("Human");
    expect(human.accent).toBe("#6366f1");

    const validator = describeAuthorRole("validator");
    expect(validator.label).toBe("Validator");
    expect(validator.accent).toBe("#10b981");

    const agent = describeAuthorRole("agent");
    expect(agent.label).toBe("Agent");
    expect(agent.accent).toBe("#a855f7");

    const critic = describeAuthorRole("critic");
    expect(critic.label).toBe("Critic");

    const system = describeAuthorRole("system");
    expect(system.label).toBe("System");
  });

  it("formats relative timestamps correctly", () => {
    const now = new Date().toISOString();
    expect(formatAnnotationTime(now)).toBe("just now");

    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(formatAnnotationTime(tenMinsAgo)).toBe("10m ago");

    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    expect(formatAnnotationTime(twoHoursAgo)).toBe("2h ago");
  });

  it("renders AuthorBadge component with role pill and timestamp", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(AuthorBadge, {
            author: { name: "Agent Claude", role: "agent" },
            createdAt: new Date().toISOString(),
          }),
        );
      });

      const root = renderer.root;
      const pill = root.findByProps({ className: "author-role-pill" });
      expect(pill).toBeDefined();
      expect(pill.props.style.color).toBe("#a855f7");
    });
  });
});

describe("Zustand useAnnotationStore & Actions", () => {
  beforeEach(() => {
    act(() => {
      useAnnotationStore.getState().clearAllAnnotations();
      useAnnotationStore.getState().resetFilterState();
    });
  });

  it("adds, updates, toggles, and deletes annotations with input sanitization", () => {
    const store = useAnnotationStore.getState();

    // 1. Add Annotation with tag cleanup
    const created = store.addAnnotation({
      title: "  Initial Check  ",
      content: "  Verify database constraints.  ",
      type: "sticky",
      nodeId: "node-db-migrator",
      author: { name: "  Lead Validator  ", role: "validator" },
      color: "green",
      category: "review",
      priority: "high",
      tags: ["#db", "  #p1  ", ""],
      coordinates: { x: 100, y: 200 },
    });

    expect(created.id).toBeDefined();
    expect(created.title).toBe("Initial Check");
    expect(created.content).toBe("Verify database constraints.");
    expect(created.author.name).toBe("Lead Validator");
    expect(created.tags).toEqual(["db", "p1"]);
    expect(useAnnotationStore.getState().annotations.length).toBe(1);

    // 2. Update Annotation
    store.updateAnnotation(created.id, {
      title: "Updated Check Title",
      content: "All migrations verified cleanly.",
      color: "blue",
    });

    const updated = useAnnotationStore.getState().annotations.find((a) => a.id === created.id);
    expect(updated?.title).toBe("Updated Check Title");
    expect(updated?.color).toBe("blue");

    // 3. Rapid sequential toggles
    store.toggleResolveAnnotation(created.id);
    expect(useAnnotationStore.getState().annotations[0].isResolved).toBe(true);
    store.toggleResolveAnnotation(created.id);
    expect(useAnnotationStore.getState().annotations[0].isResolved).toBe(false);
    store.toggleResolveAnnotation(created.id);
    expect(useAnnotationStore.getState().annotations[0].isResolved).toBe(true);

    // 4. Toggle Collapse & Pin
    store.toggleCollapseAnnotation(created.id);
    expect(useAnnotationStore.getState().annotations[0].isCollapsed).toBe(true);
    store.togglePinAnnotation(created.id);
    expect(useAnnotationStore.getState().annotations[0].isPinned).toBe(true);

    // 5. Delete Annotation
    store.deleteAnnotation(created.id);
    expect(useAnnotationStore.getState().annotations.length).toBe(0);
  });

  it("filters annotations by search query, author role, type, category, status, and tags", () => {
    const store = useAnnotationStore.getState();

    const ann1 = store.addAnnotation({
      title: "Security Issue in Auth",
      content: "OAuth token leakage discovered.",
      type: "sticky",
      author: { name: "Security Bot", role: "critic" },
      category: "security",
      priority: "critical",
      tags: ["security", "auth"],
    });

    const ann2 = store.addAnnotation({
      title: "Performance Benchmark",
      content: "Latency reduced to 4ms.",
      type: "pin",
      author: { name: "Alice", role: "human" },
      category: "performance",
      priority: "low",
      isResolved: true,
      tags: ["perf"],
    });

    const all = useAnnotationStore.getState().annotations;
    const visibility = {
      isLayerVisible: true,
      showPins: true,
      showStickies: true,
      showBookmarks: true,
      showResolved: true,
    };

    // Filter by role
    const criticOnly = filterAnnotations(
      all,
      { ...store.filterState, authorRole: "critic" },
      visibility,
    );
    expect(criticOnly.length).toBe(1);
    expect(criticOnly[0].id).toBe(ann1.id);

    // Filter by type
    const pinsOnly = filterAnnotations(all, { ...store.filterState, type: "pin" }, visibility);
    expect(pinsOnly.length).toBe(1);
    expect(pinsOnly[0].id).toBe(ann2.id);

    // Filter by search query
    const searchMatch = filterAnnotations(
      all,
      { ...store.filterState, searchQuery: "OAuth token" },
      visibility,
    );
    expect(searchMatch.length).toBe(1);
    expect(searchMatch[0].id).toBe(ann1.id);

    // Filter by status open vs resolved
    const openOnly = filterAnnotations(all, { ...store.filterState, status: "open" }, visibility);
    expect(openOnly.length).toBe(1);
    expect(openOnly[0].id).toBe(ann1.id);

    const resolvedOnly = filterAnnotations(
      all,
      { ...store.filterState, status: "resolved" },
      visibility,
    );
    expect(resolvedOnly.length).toBe(1);
    expect(resolvedOnly[0].id).toBe(ann2.id);
  });

  it("exports annotations report as Markdown and JSON", () => {
    const store = useAnnotationStore.getState();
    store.addAnnotation({
      title: "Graph Partition Note",
      content: "Partition size: 4 nodes.",
      type: "sticky",
      nodeId: "node-executor",
      author: { name: "Validator Bot", role: "validator" },
      tags: ["review"],
    });
    store.addAnnotation({
      title: "Canvas Sticky Point",
      content: "Global coordinate note.",
      type: "pin",
      coordinates: { x: 500, y: 300 },
      author: { name: "Human Lead", role: "human" },
    });

    const markdown = store.exportAsMarkdown();
    expect(markdown).toContain("# Canvas Annotations Report");
    expect(markdown).toContain("Node: `node-executor`");
    expect(markdown).toContain("Canvas Global Annotations");

    const jsonStr = store.exportAsJson();
    const parsed = JSON.parse(jsonStr) as CanvasAnnotation[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
  });
});

describe("AnnotationPin Component", () => {
  beforeEach(() => {
    act(() => {
      useAnnotationStore.getState().clearAllAnnotations();
      useAnnotationStore.getState().resetFilterState();
    });
  });

  it("renders callout pin and triggers interactive callbacks", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      let selectedId: string | null = null;
      let editId: string | null = null;
      let deleteId: string | null = null;
      let resolveId: string | null = null;

      const annotation: CanvasAnnotation = {
        id: "ann-pin-1",
        type: "pin",
        title: "Pin Callout",
        content: "Detailed markdown inside pin.",
        author: { name: "Bob", role: "human" },
        color: "blue",
        category: "bug",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(AnnotationPin, {
            annotation,
            onSelect: (id) => {
              selectedId = id;
            },
            onEdit: (id) => {
              editId = id;
            },
            onDelete: (id) => {
              deleteId = id;
            },
            onToggleResolve: (id) => {
              resolveId = id;
            },
          }),
        );
      });

      const pinElements = renderer.root.findAll(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("canvas-annotation-pin"),
      );
      expect(pinElements.length).toBeGreaterThan(0);

      // Click to open popover
      act(() => {
        pinElements[0].props.onClick({ stopPropagation: () => {} });
      });
      expect(selectedId).toBe("ann-pin-1");

      // Verify popover rendered
      const popover = renderer.root.findByProps({ className: "pin-popover" });
      expect(popover).toBeDefined();

      const resolveBtn = renderer.root.findAll(
        (el) =>
          typeof el.props.className === "string" && el.props.className.includes("resolve-btn"),
      )[0];
      act(() => {
        resolveBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(resolveId).toBe("ann-pin-1");

      const editBtn = renderer.root.findAll(
        (el) => typeof el.props.className === "string" && el.props.className.includes("edit-btn"),
      )[0];
      act(() => {
        editBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(editId).toBe("ann-pin-1");

      const deleteBtn = renderer.root.findAll(
        (el) => typeof el.props.className === "string" && el.props.className.includes("delete-btn"),
      )[0];
      act(() => {
        deleteBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(deleteId).toBe("ann-pin-1");
    });
  });
});

describe("StickyNoteCard Component", () => {
  beforeEach(() => {
    act(() => {
      useAnnotationStore.getState().clearAllAnnotations();
      useAnnotationStore.getState().resetFilterState();
    });
  });

  it("renders sticky note card with rich markdown, inline edit, and collapse", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      let toggledCollapse = false;
      let toggledPin = false;
      let updatedContent: string | null = null;

      const annotation: CanvasAnnotation = {
        id: "ann-sticky-1",
        type: "sticky",
        title: "Implementation Checklist",
        content: "- [ ] Step 1\n- [x] Step 2",
        author: { name: "Agent Architect", role: "agent" },
        color: "yellow",
        category: "todo",
        priority: "high",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        tags: ["milestone"],
      };

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(StickyNoteCard, {
            annotation,
            onToggleCollapse: () => {
              toggledCollapse = true;
            },
            onTogglePin: () => {
              toggledPin = true;
            },
            onUpdateContent: (_id, c) => {
              updatedContent = c;
            },
          }),
        );
      });

      const cards = renderer.root.findAll(
        (el) =>
          typeof el.props.className === "string" &&
          el.props.className.includes("canvas-sticky-note-card"),
      );
      expect(cards.length).toBeGreaterThan(0);

      // Check collapse button
      const collapseBtn = renderer.root.findByProps({ title: "Collapse note" });
      act(() => {
        collapseBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(toggledCollapse).toBe(true);

      // Check pin button
      const pinBtn = renderer.root.findByProps({ title: "Pin note to canvas" });
      act(() => {
        pinBtn.props.onClick({ stopPropagation: () => {} });
      });
      expect(toggledPin).toBe(true);

      // Check interactive task checkbox toggle
      const checkbox = renderer.root.findAllByProps({ className: "md-task-checkbox" })[0];
      act(() => {
        checkbox.props.onChange({ stopPropagation: () => {} });
      });
      expect(updatedContent).toContain("- [x] Step 1");
    });
  });
});

describe("AnnotationEditorModal Component", () => {
  beforeEach(() => {
    act(() => {
      useAnnotationStore.getState().clearAllAnnotations();
      useAnnotationStore.getState().resetFilterState();
    });
  });

  it("allows setting form fields and submitting new annotation", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      let savedData: CreateAnnotationInput | null = null;
      let closed = false;

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(AnnotationEditorModal, {
            isOpen: true,
            onClose: () => {
              closed = true;
            },
            onSave: (data) => {
              savedData = data;
            },
            defaultNodeId: "node-123",
          }),
        );
      });

      const titleInput = renderer.root.findByProps({ id: "annotation-title-input" });
      act(() => {
        titleInput.props.onChange({ target: { value: "Review Finding Title" } });
      });

      const contentTextarea = renderer.root.findByProps({ id: "annotation-content-textarea" });
      act(() => {
        contentTextarea.props.onChange({
          target: { value: "Found potential edge case in parser." },
        });
      });

      const saveBtn = renderer.root.findAll(
        (el) => typeof el.props.className === "string" && el.props.className.includes("save-btn"),
      )[0];
      act(() => {
        saveBtn.props.onClick({ preventDefault: () => {} });
      });

      expect(savedData !== null).toBe(true);
      if (savedData) {
        expect((savedData as CreateAnnotationInput).title).toBe("Review Finding Title");
        expect((savedData as CreateAnnotationInput).content).toBe(
          "Found potential edge case in parser.",
        );
        expect((savedData as CreateAnnotationInput).nodeId).toBe("node-123");
      }
      expect(closed).toBe(true);
    });
  });
});

describe("AnnotationFilterBar Component", () => {
  beforeEach(() => {
    act(() => {
      useAnnotationStore.getState().clearAllAnnotations();
      useAnnotationStore.getState().resetFilterState();
    });
  });

  it("renders search input, filter dropdowns, and triggers new annotation", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      let triggeredNew = false;

      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(AnnotationFilterBar, {
            onNewAnnotation: () => {
              triggeredNew = true;
            },
          }),
        );
      });

      const searchInput = renderer.root.findByProps({ className: "annotation-search-input" });
      act(() => {
        searchInput.props.onChange({ target: { value: "refactor" } });
      });
      expect(useAnnotationStore.getState().filterState.searchQuery).toBe("refactor");

      const newBtn = renderer.root.findAll(
        (el) =>
          typeof el.props.className === "string" && el.props.className.includes("primary-new-btn"),
      )[0];
      act(() => {
        newBtn.props.onClick();
      });
      expect(triggeredNew).toBe(true);
    });
  });
});

describe("GraphAnnotationLayer Component & Coordinate Resolver", () => {
  beforeEach(() => {
    act(() => {
      useAnnotationStore.getState().clearAllAnnotations();
      useAnnotationStore.getState().resetFilterState();
    });
  });

  it("resolves node coordinates, explicit coordinates, fallbacks, and handles edge cases", () => {
    const nodeMap = new Map<string, PositionedNode>([
      [
        "node-1",
        {
          id: "node-1",
          name: "Planner",
          kind: "agent",
          status: "success",
          x: 200,
          y: 150,
          width: 160,
          height: 80,
        },
      ],
    ]);

    // 1. Attached to valid existing node
    const annNode: CanvasAnnotation = {
      id: "a1",
      type: "sticky",
      nodeId: "node-1",
      content: "Test note on node",
      author: { name: "Agent", role: "agent" },
      color: "yellow",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const resolvedNode = resolveAnnotationPlacement(annNode, nodeMap);
    expect(resolvedNode).not.toBeNull();
    expect(resolvedNode?.renderX).toBe(280); // 200 + 160/2
    expect(resolvedNode?.renderY).toBe(242); // 150 + 80 + 12 (sticky offset)

    // 2. Attached to global canvas coordinates (explicit 0,0 is completely valid!)
    const annOriginCoords: CanvasAnnotation = {
      id: "a2-origin",
      type: "pin",
      coordinates: { x: 0, y: 0 },
      content: "Origin coordinate pin",
      author: { name: "User", role: "human" },
      color: "blue",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const resolvedOrigin = resolveAnnotationPlacement(annOriginCoords, nodeMap);
    expect(resolvedOrigin).not.toBeNull();
    expect(resolvedOrigin?.renderX).toBe(0);
    expect(resolvedOrigin?.renderY).toBe(0);

    // 3. Fallback when nodeId is deleted/non-existent but explicit coordinates exist
    const annMissingNodeWithCoords: CanvasAnnotation = {
      id: "a-fallback",
      type: "pin",
      nodeId: "non-existent-node-id",
      coordinates: { x: 350, y: 220 },
      content: "Fallback to coordinates",
      author: { name: "Validator", role: "validator" },
      color: "green",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const resolvedFallback = resolveAnnotationPlacement(annMissingNodeWithCoords, nodeMap);
    expect(resolvedFallback).not.toBeNull();
    expect(resolvedFallback?.renderX).toBe(350);
    expect(resolvedFallback?.renderY).toBe(220);

    // 4. Truly unanchored annotation (non-existent nodeId and no coordinates) returns null
    const annUnanchored: CanvasAnnotation = {
      id: "a-unanchored",
      type: "pin",
      nodeId: "non-existent-node-id",
      content: "Unanchored ghost pin",
      author: { name: "System", role: "system" },
      color: "gray",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(resolveAnnotationPlacement(annUnanchored, nodeMap)).toBeNull();

    // 5. Non-finite coordinates return null
    const annNonFinite: CanvasAnnotation = {
      id: "a-non-finite",
      type: "pin",
      coordinates: { x: Number.NaN, y: Number.POSITIVE_INFINITY },
      content: "Corrupted coordinates",
      author: { name: "System", role: "system" },
      color: "gray",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(resolveAnnotationPlacement(annNonFinite, nodeMap)).toBeNull();

    // 6. Hidden node suppression
    expect(resolveAnnotationPlacement(annNode, nodeMap, new Set(["node-1"]))).toBeNull();
  });

  it("renders GraphAnnotationLayer within hardware-accelerated layer with translate3d", () => {
    act(() => {
      useAnnotationStore.getState().clearAllAnnotations();
      useAnnotationStore.getState().resetFilterState();
      useAnnotationStore.getState().addAnnotation({
        id: "ann-live-1",
        type: "pin",
        nodeId: "node-live",
        content: "Live Pin Annotation",
        author: { name: "Validator", role: "validator" },
        color: "green",
      });
    });

    const positionedNodes: PositionedNode[] = [
      {
        id: "node-live",
        name: "Test Node",
        kind: "agent",
        status: "success",
        x: 300,
        y: 200,
        width: 140,
        height: 60,
      },
    ];

    silenceReactTestRendererDeprecationWarning(() => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(GraphAnnotationLayer, {
            positionedNodes,
          }),
        );
      });

      const layer = renderer.root.findByProps({ className: "graph-annotation-layer" });
      expect(layer).toBeDefined();
      expect(layer.props.style.pointerEvents).toBe("none");
      expect(layer.props.style.zIndex).toBe(15);
    });
  });
});

describe("NotesTab Component in NodeDetailDrawer", () => {
  beforeEach(() => {
    act(() => {
      useAnnotationStore.getState().clearAllAnnotations();
      useAnnotationStore.getState().resetFilterState();
    });
  });

  it("renders empty state when no notes are attached to node, opens composer, and saves note", () => {
    const mockNode: GraphNodeData = {
      id: "node-target-notes",
      name: "Validator Signoff",
      kind: "critic",
      status: "running",
    };

    silenceReactTestRendererDeprecationWarning(() => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(NotesTab, {
            node: mockNode,
          }),
        );
      });

      // Check empty state
      const emptyHeading = renderer.root.findByProps({ className: "empty-heading" });
      expect(emptyHeading.children[0]).toBe("No notes on this node yet");

      // Open composer
      const openBtn = renderer.root.findAll(
        (el) =>
          typeof el.props.className === "string" && el.props.className.includes("primary-new-btn"),
      )[0];
      expect(openBtn).toBeDefined();
      act(() => {
        openBtn.props.onClick();
      });

      const composer = renderer.root.findByProps({ className: "notes-tab-composer" });
      expect(composer).toBeDefined();

      const textarea = renderer.root.findByProps({ id: "notes-composer-content" });
      act(() => {
        textarea.props.onChange({
          target: { value: "Adversarial review findings: 0 defects detected." },
        });
      });

      const saveBtn = renderer.root.findAll(
        (el) => typeof el.props.className === "string" && el.props.className.includes("save-btn"),
      )[0];
      act(() => {
        saveBtn.props.onClick({ preventDefault: () => {} });
      });

      // Verify note is stored and rendered
      const stored = useAnnotationStore.getState().annotations;
      expect(stored.length).toBe(1);
      expect(stored[0].nodeId).toBe("node-target-notes");
      expect(stored[0].content).toContain("Adversarial review findings");
    });
  });

  it("allows copying all notes to clipboard in clean Markdown format", () => {
    const mockNode: GraphNodeData = {
      id: "node-copy-target",
      name: "Planner Decomposition",
      kind: "orchestrator",
      status: "success",
    };

    act(() => {
      useAnnotationStore.getState().addAnnotation({
        nodeId: "node-copy-target",
        title: "Plan Summary",
        content: "Decomposed into 4 parallel tasks.",
        author: { name: "Orchestrator", role: "agent" },
        color: "purple",
      });
    });

    let clipboardText = "";
    Object.assign(navigator, {
      clipboard: {
        writeText: async (text: string) => {
          clipboardText = text;
          return Promise.resolve();
        },
      },
    });

    silenceReactTestRendererDeprecationWarning(() => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          createElement(NotesTab, {
            node: mockNode,
          }),
        );
      });

      const copyBtn = renderer.root.findAll(
        (el) =>
          typeof el.props.className === "string" && el.props.className.includes("copy-all-btn"),
      )[0];
      expect(copyBtn).toBeDefined();
      act(() => {
        copyBtn.props.onClick({ stopPropagation: () => {} });
      });

      expect(clipboardText).toContain(
        "# Notes for Node: `Planner Decomposition` (node-copy-target)",
      );
      expect(clipboardText).toContain("Plan Summary");
      expect(clipboardText).toContain("Decomposed into 4 parallel tasks.");
    });
  });
});
