import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import {
  CommandPalette,
  createDefaultActions,
  fuzzyMatch,
  fuzzySearchItems,
  highlightMatches,
  registerDefaultActions,
  ShortcutBadge,
} from "./index";
import { parseShortcut } from "./ShortcutBadge";
import type { CommandAction } from "./CommandPalette.types";
import { useCommandPaletteStore } from "../../store/useCommandPaletteStore";
import { useGraphStore } from "../../state/useGraphStore";
import { useGraphFilesStore } from "../../state/useGraphFilesStore";
import type { GraphDataset, PositionedNode } from "../../types/graphData";

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Mock scrollIntoView in test environment
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

function silenceReactTestRendererDeprecationWarning<T>(fn: () => T): T {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  console.error = (message?: unknown, ...args: unknown[]) => {
    if (
      typeof message === "string" &&
      (message.includes("react-test-renderer is deprecated") ||
        message.includes("useRouter must be used inside a <RouterProvider>"))
    ) {
      return;
    }
    originalConsoleError(message, ...args);
  };
  console.warn = (message?: unknown, ...args: unknown[]) => {
    if (
      typeof message === "string" &&
      message.includes("useRouter must be used inside a <RouterProvider>")
    ) {
      return;
    }
    originalConsoleWarn(message, ...args);
  };
  try {
    return fn();
  } finally {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  }
}

const mockNodes: PositionedNode[] = [
  {
    id: "node-coordinator-1",
    name: "Master Coordinator",
    kind: "orchestrator",
    status: "running",
    step: 1,
    description: "Orchestrates multi-agent pipelines",
    x: 0,
    y: 0,
    width: 150,
    height: 60,
  },
  {
    id: "node-implementer-2",
    name: "Command Palette Implementer",
    kind: "agent",
    status: "success",
    step: 2,
    description: "Implements fuzzy search HUD and keyboard navigation",
    x: 200,
    y: 0,
    width: 150,
    height: 60,
  },
  {
    id: "node-validator-3",
    name: "Adversarial Gate",
    kind: "gate",
    status: "error",
    step: 3,
    description: "Validates AST invariance and test coverage",
    x: 400,
    y: 0,
    width: 150,
    height: 60,
  },
];

const mockDataset: GraphDataset = {
  id: "test-graph",
  title: "Test Graph",
  nodes: mockNodes,
  edges: [
    { id: "e1-2", source: "node-coordinator-1", target: "node-implementer-2", kind: "sequence" },
    { id: "e2-3", source: "node-implementer-2", target: "node-validator-3", kind: "sequence" },
  ],
};

describe("fuzzySearch Matching Logic", () => {
  it("matches exact strings with highest score", () => {
    const exact = fuzzyMatch("Reset Viewport", "Reset Viewport");
    const prefix = fuzzyMatch("Reset Viewport", "Reset");
    const subsequence = fuzzyMatch("Reset Viewport", "rvp");

    expect(exact.matches).toBe(true);
    expect(prefix.matches).toBe(true);
    expect(subsequence.matches).toBe(true);
    expect(exact.score).toBeGreaterThan(prefix.score);
    expect(prefix.score).toBeGreaterThan(subsequence.score);
    expect(exact.indices.length).toBe("Reset Viewport".length);
  });

  it("matches prefixes at word boundaries", () => {
    const res = fuzzyMatch("Reset Viewport", "View");
    expect(res.matches).toBe(true);
    expect(res.indices).toEqual([6, 7, 8, 9]);
    expect(res.score).toBeGreaterThan(600);
  });

  it("matches acronyms across word boundaries", () => {
    const res = fuzzyMatch("Reset Viewport", "rv");
    expect(res.matches).toBe(true);
    expect(res.indices).toEqual([0, 6]);
    expect(res.score).toBeGreaterThan(500);

    const res2 = fuzzyMatch("Toggle Minimap", "tm");
    expect(res2.matches).toBe(true);
    expect(res2.indices).toEqual([0, 7]);
  });

  it("matches subsequence with consecutive character bonuses", () => {
    const res = fuzzyMatch("Export Canvas as PNG", "exp png");
    expect(res.matches).toBe(true);
    expect(res.indices).toEqual([0, 1, 2, 6, 17, 18, 19]);
  });

  it("handles non-matches and empty strings gracefully", () => {
    expect(fuzzyMatch("Reset Viewport", "xyz123").matches).toBe(false);
    expect(fuzzyMatch("Reset Viewport", "").matches).toBe(true);
    expect(fuzzyMatch("", "test").matches).toBe(false);
    expect(fuzzyMatch("", "").matches).toBe(true);
  });

  it("splits text into highlight segments correctly", () => {
    const segments = highlightMatches("Reset View", [0, 6]);
    expect(segments).toEqual([
      { text: "R", isMatch: true },
      { text: "eset ", isMatch: false },
      { text: "V", isMatch: true },
      { text: "iew", isMatch: false },
    ]);

    const noMatches = highlightMatches("Hello World", []);
    expect(noMatches).toEqual([{ text: "Hello World", isMatch: false }]);
  });

  it("ranks search items with fuzzySearchItems by score and keyword matches", () => {
    const items = [
      { id: "1", title: "Zoom In", description: "Increase canvas scale", keywords: ["magnify"] },
      { id: "2", title: "Zoom Out", description: "Decrease canvas scale", keywords: ["shrink"] },
      { id: "3", title: "Reset Viewport", description: "Reset canvas center" },
    ];

    const results = fuzzySearchItems(items, "zoom");
    expect(results.length).toBe(2);
    expect(results[0].item.title).toContain("Zoom");

    const kwResults = fuzzySearchItems(items, "magnify");
    expect(kwResults.length).toBe(1);
    expect(kwResults[0].item.id).toBe("1");
  });
});

describe("ShortcutBadge Component & Parser", () => {
  it("parses combined shortcut strings and modifiers", () => {
    expect(parseShortcut("Cmd+K")).toEqual(["⌘", "K"]);
    expect(parseShortcut("Shift+Cmd+E")).toEqual(["⇧", "⌘", "E"]);
    expect(parseShortcut("Alt+C")).toEqual(["⌥", "C"]);
    expect(parseShortcut("Ctrl+Z")).toEqual(["⌃", "Z"]);
    expect(parseShortcut("Escape")).toEqual(["Esc"]);
    expect(parseShortcut("Enter")).toEqual(["↵"]);
    expect(parseShortcut("⇧⌘E")).toEqual(["⇧", "⌘", "E"]);
    expect(parseShortcut(["⌘", "0"])).toEqual(["⌘", "0"]);
    expect(parseShortcut("")).toEqual([]);
  });

  it("renders shortcut keys in kbd elements with accessible labels", () => {
    let renderer: ReactTestRenderer | null = null;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<ShortcutBadge shortcut="Shift+Cmd+E" size="sm" />);
      });
    });

    const root = renderer!.root;
    const badge = root.findByProps({ role: "group" });
    expect(badge.props.className).toContain("command-shortcut-badge--sm");
    expect(badge.props["aria-label"]).toBe("Shortcut: ⇧ plus ⌘ plus E");

    const kbds = root.findAllByType("kbd");
    expect(kbds.length).toBe(3);
    expect(kbds[0].props.children).toBe("⇧");
    expect(kbds[1].props.children).toBe("⌘");
    expect(kbds[2].props.children).toBe("E");
  });

  it("renders null for empty shortcuts", () => {
    let renderer: ReactTestRenderer | null = null;
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<ShortcutBadge shortcut="" />);
      });
    });

    expect(renderer!.toJSON()).toBeNull();
  });
});

describe("ActionRegistry & Default Actions", () => {
  it("creates default actions spanning all categories", () => {
    const actions = createDefaultActions();
    expect(actions.length).toBeGreaterThanOrEqual(15);

    const categories = new Set(actions.map((a) => a.category));
    expect(categories.has("navigation")).toBe(true);
    expect(categories.has("layout")).toBe(true);
    expect(categories.has("actions")).toBe(true);
    expect(categories.has("export")).toBe(true);

    const resetAction = actions.find((a) => a.id === "nav-reset-view");
    expect(resetAction).toBeDefined();
    expect(resetAction?.shortcut).toBe("⌘0");
  });

  it("invokes context handlers when actions execute", () => {
    let exportedFormat = "";
    let minimapToggled = false;
    let selfHealingTriggered = false;

    const actions = createDefaultActions({
      onExport: (fmt) => {
        exportedFormat = fmt;
      },
      onToggleMinimap: () => {
        minimapToggled = true;
      },
      onTriggerSelfHealing: () => {
        selfHealingTriggered = true;
      },
    });

    const exportPng = actions.find((a) => a.id === "export-png");
    exportPng?.handler();
    expect(exportedFormat).toBe("png");

    const minimap = actions.find((a) => a.id === "action-toggle-minimap");
    minimap?.handler();
    expect(minimapToggled).toBe(true);

    const heal = actions.find((a) => a.id === "action-trigger-self-healing");
    heal?.handler();
    expect(selfHealingTriggered).toBe(true);
  });

  it("registers default actions into the store", () => {
    useCommandPaletteStore.getState().resetPalette();
    registerDefaultActions(useCommandPaletteStore.getState());

    const all = useCommandPaletteStore.getState().getAllActions();
    expect(all.length).toBeGreaterThanOrEqual(15);
  });
});

describe("useCommandPaletteStore Zustand Store", () => {
  beforeEach(() => {
    useCommandPaletteStore.getState().resetPalette();
  });

  it("manages open, close, and toggle state", () => {
    const store = useCommandPaletteStore.getState();
    expect(store.isOpen).toBe(false);

    store.openPalette();
    expect(useCommandPaletteStore.getState().isOpen).toBe(true);

    store.closePalette();
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);

    store.togglePalette();
    expect(useCommandPaletteStore.getState().isOpen).toBe(true);

    store.togglePalette();
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it("updates query, selectedIndex, and activeCategory", () => {
    const store = useCommandPaletteStore.getState();
    store.setQuery("layout");
    expect(useCommandPaletteStore.getState().query).toBe("layout");

    store.setSelectedIndex(3);
    expect(useCommandPaletteStore.getState().selectedIndex).toBe(3);

    store.setSelectedIndex((prev) => prev + 1);
    expect(useCommandPaletteStore.getState().selectedIndex).toBe(4);

    store.setActiveCategory("export");
    expect(useCommandPaletteStore.getState().activeCategory).toBe("export");
    expect(useCommandPaletteStore.getState().selectedIndex).toBe(0);
  });

  it("registers, unregisters, and executes actions", async () => {
    let executed = false;
    const testAction: CommandAction = {
      id: "custom-test-action",
      title: "Custom Action",
      category: "actions",
      handler: () => {
        executed = true;
      },
    };

    useCommandPaletteStore.getState().registerAction(testAction);
    expect(useCommandPaletteStore.getState().getAction("custom-test-action")).toBeDefined();
    expect(useCommandPaletteStore.getState().getAllActions().length).toBe(1);

    useCommandPaletteStore.getState().setQuery("custom");
    await useCommandPaletteStore.getState().executeAction("custom-test-action");

    expect(executed).toBe(true);
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
    expect(useCommandPaletteStore.getState().recentSearches).toContain("custom");

    useCommandPaletteStore.getState().unregisterAction("custom-test-action");
    expect(useCommandPaletteStore.getState().getAction("custom-test-action")).toBeUndefined();
  });

  it("handles recent searches and favorite actions", () => {
    const store = useCommandPaletteStore.getState();
    store.addRecentSearch("query-1");
    store.addRecentSearch("query-2");
    store.addRecentSearch("query-1"); // duplicates bubble to top

    expect(useCommandPaletteStore.getState().recentSearches).toEqual(["query-1", "query-2"]);

    store.removeRecentSearch("query-2");
    expect(useCommandPaletteStore.getState().recentSearches).toEqual(["query-1"]);

    store.clearRecentSearches();
    expect(useCommandPaletteStore.getState().recentSearches).toEqual([]);

    store.toggleFavoriteAction("nav-reset-view");
    expect(useCommandPaletteStore.getState().favoriteActions).toContain("nav-reset-view");

    store.toggleFavoriteAction("nav-reset-view");
    expect(useCommandPaletteStore.getState().favoriteActions).not.toContain("nav-reset-view");
  });

  it("filters actions by category", () => {
    const store = useCommandPaletteStore.getState();
    store.registerActions([
      { id: "a1", title: "A1", category: "layout", handler: () => {} },
      { id: "a2", title: "A2", category: "export", handler: () => {} },
      { id: "a3", title: "A3", category: "layout", handler: () => {} },
    ]);

    expect(store.getActionsByCategory("layout").length).toBe(2);
    expect(store.getActionsByCategory("export").length).toBe(1);
    expect(store.getActionsByCategory("all").length).toBe(3);
  });
});

describe("CommandPalette Component Integration & ARIA", () => {
  let renderer: ReactTestRenderer | null = null;

  beforeEach(() => {
    useCommandPaletteStore.getState().resetPalette();
    useGraphStore.setState({
      dataset: mockDataset,
      currentFile: "test-graph",
      positionedNodes: mockNodes,
    });
    useGraphFilesStore.setState({
      files: ["test-graph"],
    });
  });

  afterEach(() => {
    if (renderer) {
      silenceReactTestRendererDeprecationWarning(() => {
        act(() => {
          renderer?.unmount();
        });
      });
      renderer = null;
    }
  });

  it("renders accessible combobox, listbox, category tabs, and search input", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <CommandPalette isOpen={true} onClose={() => {}} currentFile="test-graph" />,
        );
      });
    });

    const root = renderer!.root;
    const input = root.findByProps({ role: "combobox" });
    expect(input).toBeDefined();
    expect(input.props["aria-expanded"]).toBe(true);
    expect(input.props["aria-autocomplete"]).toBe("list");
    expect(input.props["aria-controls"]).toBe("command-palette-listbox");

    const listbox = root.findByProps({ role: "listbox", id: "command-palette-listbox" });
    expect(listbox).toBeDefined();

    const tablist = root.findByProps({ role: "tablist" });
    expect(tablist).toBeDefined();

    const tabs = tablist.findAllByProps({ role: "tab" });
    expect(tabs.length).toBe(6); // all, actions, nodes, navigation, layout, export
  });

  it("filters search results when typing query into combobox", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <CommandPalette isOpen={true} onClose={() => {}} currentFile="test-graph" />,
        );
      });
    });

    const root = renderer!.root;
    const input = root.findByProps({ role: "combobox" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        input.props.onChange({ target: { value: "Force-Directed" } });
      });
    });

    expect(useCommandPaletteStore.getState().query).toBe("Force-Directed");

    const options = root.findAllByProps({ role: "option" });
    expect(options.length).toBeGreaterThanOrEqual(1);

    const titleText = options[0].findByProps({ className: "command-palette-item-title" });
    expect(titleText).toBeDefined();
  });

  it("navigates options via keyboard ArrowDown, ArrowUp, and selects on Enter", () => {
    let navigatedFile = "";
    let navigatedNode = "";

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <CommandPalette
            isOpen={true}
            onClose={() => {}}
            currentFile="test-graph"
            onNavigateNode={(f, n) => {
              navigatedFile = f;
              navigatedNode = n;
            }}
          />,
        );
      });
    });

    const root = renderer!.root;
    const dialog = root.findByProps({ className: "command-palette-dialog" });

    // Switch to nodes category to test node jump
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        useCommandPaletteStore.getState().setActiveCategory("nodes");
      });
    });

    let options = root.findAllByProps({ role: "option" });
    expect(options.length).toBe(3);

    // Arrow down to item 1
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        dialog.props.onKeyDown({
          key: "ArrowDown",
          preventDefault: () => {},
        });
      });
    });

    expect(useCommandPaletteStore.getState().selectedIndex).toBe(1);

    // Press Enter to select
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        dialog.props.onKeyDown({
          key: "Enter",
          preventDefault: () => {},
        });
      });
    });

    expect(navigatedFile).toBe("test-graph");
    expect(navigatedNode).toBe("node-implementer-2");
  });

  it("cycles category filters with Tab and Shift+Tab keys", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <CommandPalette isOpen={true} onClose={() => {}} currentFile="test-graph" />,
        );
      });
    });

    const root = renderer!.root;
    const dialog = root.findByProps({ className: "command-palette-dialog" });

    expect(useCommandPaletteStore.getState().activeCategory).toBe("all");

    // Press Tab
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        dialog.props.onKeyDown({
          key: "Tab",
          shiftKey: false,
          preventDefault: () => {},
        });
      });
    });
    expect(useCommandPaletteStore.getState().activeCategory).toBe("actions");

    // Press Shift+Tab
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        dialog.props.onKeyDown({
          key: "Tab",
          shiftKey: true,
          preventDefault: () => {},
        });
      });
    });
    expect(useCommandPaletteStore.getState().activeCategory).toBe("all");
  });

  it("clears query on Escape if non-empty, and closes on Escape if empty", () => {
    let closed = false;

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <CommandPalette
            isOpen={true}
            onClose={() => {
              closed = true;
            }}
            currentFile="test-graph"
          />,
        );
      });
    });

    const root = renderer!.root;
    const dialog = root.findByProps({ className: "command-palette-dialog" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        useCommandPaletteStore.getState().setQuery("test query");
      });
    });

    // Escape once: clears query
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        dialog.props.onKeyDown({
          key: "Escape",
          preventDefault: () => {},
        });
      });
    });
    expect(useCommandPaletteStore.getState().query).toBe("");
    expect(closed).toBe(false);

    // Escape again: closes palette
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        dialog.props.onKeyDown({
          key: "Escape",
          preventDefault: () => {},
        });
      });
    });
    expect(closed).toBe(true);
  });

  it("toggles global Cmd+K / Ctrl+K keyboard shortcut", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<CommandPalette currentFile="test-graph" />);
      });
    });

    expect(useCommandPaletteStore.getState().isOpen).toBe(false);

    // Trigger window Cmd+K
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        const event = new Event("keydown", { bubbles: true });
        Object.assign(event, { key: "k", metaKey: true });
        window.dispatchEvent(event);
      });
    });

    expect(useCommandPaletteStore.getState().isOpen).toBe(true);

    // Trigger window Cmd+K again to close
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        const event = new Event("keydown", { bubbles: true });
        Object.assign(event, { key: "k", metaKey: true });
        window.dispatchEvent(event);
      });
    });

    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it("renders empty state with recommendations when zero matches are found", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <CommandPalette isOpen={true} onClose={() => {}} currentFile="test-graph" />,
        );
      });
    });

    const root = renderer!.root;
    const input = root.findByProps({ role: "combobox" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        input.props.onChange({ target: { value: "nonexistent_term_404" } });
      });
    });

    const empty = root.findByProps({ role: "status" });
    expect(empty).toBeDefined();

    const recChips = root.findAllByProps({ className: "command-palette-rec-chip" });
    expect(recChips.length).toBe(3);

    // Click recommendation chip
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        recChips[0].props.onClick();
      });
    });

    expect(useCommandPaletteStore.getState().query).toBe("Reset View");
  });

  it("clears query when clicking the clear (X) button", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <CommandPalette isOpen={true} onClose={() => {}} currentFile="test-graph" />,
        );
      });
    });

    const root = renderer!.root;
    const input = root.findByProps({ role: "combobox" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        input.props.onChange({ target: { value: "zoom" } });
      });
    });

    const clearBtn = root.findByProps({ "aria-label": "Clear search query" });
    expect(clearBtn).toBeDefined();

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        clearBtn.props.onClick();
      });
    });

    expect(useCommandPaletteStore.getState().query).toBe("");
  });

  it("allows switching categories via tab button clicks", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <CommandPalette isOpen={true} onClose={() => {}} currentFile="test-graph" />,
        );
      });
    });

    const root = renderer!.root;
    const layoutTab = root.findByProps({ id: "tab-layout" });

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        layoutTab.props.onClick();
      });
    });

    expect(useCommandPaletteStore.getState().activeCategory).toBe("layout");

    const options = root.findAllByProps({ role: "option" });
    expect(options.length).toBeGreaterThanOrEqual(4);
  });

  it("properly cleans up global Cmd+K window event listener on unmount", () => {
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);

    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(<CommandPalette currentFile="test-graph" />);
      });
    });

    // Unmount component
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer?.unmount();
        renderer = null;
      });
    });

    // Fire Cmd+K after unmount
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        const event = new Event("keydown", { bubbles: true });
        Object.assign(event, { key: "k", metaKey: true });
        window.dispatchEvent(event);
      });
    });

    // Should remain closed because listener was cleanly removed
    expect(useCommandPaletteStore.getState().isOpen).toBe(false);
  });

  it("clamps selectedIndex when search query narrows result list to prevent out-of-bounds", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <CommandPalette isOpen={true} onClose={() => {}} currentFile="test-graph" />,
        );
      });
    });

    const root = renderer!.root;
    const input = root.findByProps({ role: "combobox" });

    // Artificially set a high selectedIndex
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        useCommandPaletteStore.getState().setSelectedIndex(10);
      });
    });

    // Narrow down to a query that has only 1 match (e.g. "Adversarial Gate")
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        input.props.onChange({ target: { value: "Adversarial Gate" } });
      });
    });

    const options = root.findAllByProps({ role: "option" });
    expect(options.length).toBe(1);

    // selectedIndex in store and effective render must be clamped to 0
    expect(useCommandPaletteStore.getState().selectedIndex).toBe(0);
    expect(options[0].props["aria-selected"]).toBe(true);
  });

  it("correctly syncs aria-activedescendant with the active option ID and omits when empty", () => {
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        renderer = create(
          <CommandPalette isOpen={true} onClose={() => {}} currentFile="test-graph" />,
        );
      });
    });

    const root = renderer!.root;
    const input = root.findByProps({ role: "combobox" });
    const dialog = root.findByProps({ className: "command-palette-dialog" });

    let options = root.findAllByProps({ role: "option" });
    expect(options.length).toBeGreaterThan(1);

    // 1. Initial active descendant must match the first option's ID
    const initialActiveId = input.props["aria-activedescendant"];
    expect(initialActiveId).toBeDefined();
    expect(initialActiveId).toBe(options[0].props.id);
    expect(options[0].props["aria-selected"]).toBe(true);

    // 2. Navigate down with ArrowDown and check aria-activedescendant updates
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        dialog.props.onKeyDown({
          key: "ArrowDown",
          preventDefault: () => {},
        });
      });
    });

    options = root.findAllByProps({ role: "option" });
    const secondActiveId = input.props["aria-activedescendant"];
    expect(secondActiveId).toBe(options[1].props.id);
    expect(options[1].props["aria-selected"]).toBe(true);
    expect(options[0].props["aria-selected"]).toBe(false);

    // 3. When query has no matches, aria-activedescendant must be undefined
    silenceReactTestRendererDeprecationWarning(() => {
      act(() => {
        input.props.onChange({ target: { value: "completely_unmatched_query_xyz" } });
      });
    });

    expect(input.props["aria-activedescendant"]).toBeUndefined();
  });
});
