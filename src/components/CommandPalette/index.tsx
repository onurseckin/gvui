import type { FC, KeyboardEvent, MouseEvent, ReactNode } from "react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  IconCompass,
  IconCpu,
  IconDownload,
  IconLayout,
  IconSearch,
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconX,
} from "@tabler/icons-react";
import { useGraphStore } from "../../state/useGraphStore";
import { useGraphFilesStore } from "../../state/useGraphFilesStore";
import { useCommandPaletteStore } from "../../store/useCommandPaletteStore";
import type { GraphDataset } from "../../types/graphData";
import { createDefaultActions } from "./ActionRegistry";
import { fuzzySearchItems, highlightMatches } from "./fuzzySearch";
import { ShortcutBadge } from "./ShortcutBadge";
import type {
  CommandCategory,
  CommandPaletteProps,
  SearchResultItem,
} from "./CommandPalette.types";
import "./CommandPalette.css";

const CATEGORIES: CommandCategory[] = ["all", "actions", "nodes", "navigation", "layout", "export"];

export function getOptionId(itemId: string): string {
  return `command-item-${itemId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function getCategoryIcon(category: CommandCategory | string): ReactNode {
  switch (category) {
    case "navigation":
      return <IconCompass size={16} />;
    case "layout":
      return <IconLayout size={16} />;
    case "actions":
      return <IconCpu size={16} />;
    case "export":
      return <IconDownload size={16} />;
    case "nodes":
      return <IconSparkles size={16} />;
    default:
      return <IconSearch size={16} />;
  }
}

interface HighlightedTextProps {
  text: string;
  indices?: number[];
  className?: string;
}

const HighlightedText: FC<HighlightedTextProps> = React.memo(function HighlightedText({
  text,
  indices = [],
  className = "command-palette-highlight",
}) {
  const segments = useMemo(() => highlightMatches(text, indices), [text, indices]);

  return (
    <span>
      {segments.map((segment, idx) =>
        segment.isMatch ? (
          <mark key={idx} className={className}>
            {segment.text}
          </mark>
        ) : (
          <span key={idx}>{segment.text}</span>
        ),
      )}
    </span>
  );
});

interface CommandPaletteItemProps {
  item: SearchResultItem;
  index: number;
  isSelected: boolean;
  onSelect: (item: SearchResultItem) => void;
  onHover: (index: number) => void;
  onToggleFavorite?: (id: string, e: MouseEvent) => void;
}

const CommandPaletteItemRow: FC<CommandPaletteItemProps> = React.memo(
  function CommandPaletteItemRow({ item, index, isSelected, onSelect, onHover, onToggleFavorite }) {
    const itemRef = useRef<HTMLDivElement>(null);
    const optionId = getOptionId(item.id);

    useEffect(() => {
      if (isSelected && itemRef.current) {
        if (typeof itemRef.current.scrollIntoView === "function") {
          itemRef.current.scrollIntoView({ block: "nearest" });
        }
      }
    }, [isSelected]);

    const handleClick = useCallback(() => {
      onSelect(item);
    }, [onSelect, item]);

    const handleMouseEnter = useCallback(() => {
      onHover(index);
    }, [onHover, index]);

    const handleFavoriteClick = useCallback(
      (e: MouseEvent) => {
        e.stopPropagation();
        onToggleFavorite?.(item.id, e);
      },
      [onToggleFavorite, item.id],
    );

    return (
      <div
        ref={itemRef}
        id={optionId}
        role="option"
        aria-selected={isSelected}
        className={`command-palette-item ${isSelected ? "command-palette-item--selected" : ""}`}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
      >
        <div className="command-palette-item-left">
          <div className="command-palette-item-icon">
            {typeof item.icon === "string" ? (
              <span>{item.icon}</span>
            ) : item.icon ? (
              item.icon
            ) : (
              getCategoryIcon(item.category)
            )}
          </div>
          <div className="command-palette-item-main">
            <div className="command-palette-item-title">
              <HighlightedText text={item.title} indices={item.matches} />
            </div>
            {item.description && (
              <div className="command-palette-item-description">
                <HighlightedText text={item.description} indices={item.descriptionMatches} />
              </div>
            )}
          </div>
        </div>

        <div className="command-palette-item-right">
          {item.nodeKind && (
            <span className="command-palette-badge command-palette-badge--category">
              {item.nodeKind}
            </span>
          )}
          {item.nodeStatus && (
            <span
              className={`command-palette-badge command-palette-badge--status command-palette-badge--status-${item.nodeStatus}`}
            >
              {item.nodeStatus}
            </span>
          )}
          {item.fileId && !item.nodeKind && (
            <span className="command-palette-source-badge">{item.fileId}</span>
          )}
          {item.category && item.type === "action" && (
            <span className="command-palette-badge command-palette-badge--category">
              {item.category}
            </span>
          )}
          {item.shortcut && <ShortcutBadge shortcut={item.shortcut} size="sm" />}
          {item.type === "action" && onToggleFavorite && (
            <button
              type="button"
              className="command-palette-search-clear"
              title={item.isFavorite ? "Remove favorite" : "Add to favorites"}
              onClick={handleFavoriteClick}
              aria-label={item.isFavorite ? "Remove favorite" : "Add to favorites"}
            >
              {item.isFavorite ? (
                <IconStarFilled size={14} style={{ color: "#facc15" }} />
              ) : (
                <IconStar size={14} style={{ opacity: 0.4 }} />
              )}
            </button>
          )}
        </div>
      </div>
    );
  },
);

export const CommandPalette: FC<CommandPaletteProps> = React.memo(function CommandPalette({
  isOpen: propsIsOpen,
  onClose: propsOnClose,
  currentFile = "",
  onNavigateNode,
  actions: customActions,
  placeholder,
  className = "",
  maxResults = 50,
  defaultCategory = "all",
}) {
  let routerNavigate: ReturnType<typeof useNavigate> | null = null;
  try {
    routerNavigate = useNavigate();
  } catch {
    routerNavigate = null;
  }

  const inputRef = useRef<HTMLInputElement>(null);

  // Zustand Store
  const storeIsOpen = useCommandPaletteStore((s) => s.isOpen);
  const storeQuery = useCommandPaletteStore((s) => s.query);
  const storeSelectedIndex = useCommandPaletteStore((s) => s.selectedIndex);
  const storeActiveCategory = useCommandPaletteStore((s) => s.activeCategory);
  const storeFavoriteActions = useCommandPaletteStore((s) => s.favoriteActions);
  const actionRegistry = useCommandPaletteStore((s) => s.actionRegistry);

  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const closePalette = useCommandPaletteStore((s) => s.closePalette);
  const setStoreQuery = useCommandPaletteStore((s) => s.setQuery);
  const setStoreSelectedIndex = useCommandPaletteStore((s) => s.setSelectedIndex);
  const setStoreActiveCategory = useCommandPaletteStore((s) => s.setActiveCategory);
  const registerActions = useCommandPaletteStore((s) => s.registerActions);
  const toggleFavoriteAction = useCommandPaletteStore((s) => s.toggleFavoriteAction);
  const addRecentSearch = useCommandPaletteStore((s) => s.addRecentSearch);
  const executeStoreAction = useCommandPaletteStore((s) => s.executeAction);

  // Effective state (controlled vs store)
  const isControlled = typeof propsIsOpen === "boolean";
  const isOpen = isControlled ? propsIsOpen : storeIsOpen;

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const propsOnCloseRef = useRef(propsOnClose);
  propsOnCloseRef.current = propsOnClose;

  const [datasetCache, setDatasetCache] = useState<Map<string, GraphDataset>>(new Map());
  const activeDataset = useGraphStore((state) => state.dataset);
  const presetFiles = useGraphFilesStore((state) => state.files);

  // Initialize built-in default actions on mount
  useEffect(() => {
    const defaultActions = createDefaultActions({
      onNavigateNode,
      onClose: () => {
        if (propsOnCloseRef.current) propsOnCloseRef.current();
        closePalette();
      },
      currentFile,
    });
    registerActions(defaultActions);
  }, [registerActions, onNavigateNode, closePalette, currentFile]);

  // Merge custom actions if passed
  useEffect(() => {
    if (customActions && customActions.length > 0) {
      registerActions(customActions);
    }
  }, [customActions, registerActions]);

  // Set default category if provided
  useEffect(() => {
    if (defaultCategory && defaultCategory !== "all") {
      setStoreActiveCategory(defaultCategory);
    }
  }, [defaultCategory, setStoreActiveCategory]);

  // Global Cmd+K / Ctrl+K listener with strict unmount cleanup and ref synchronization
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (isOpenRef.current) {
          if (propsOnCloseRef.current) propsOnCloseRef.current();
          closePalette();
        } else {
          openPalette();
        }
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [openPalette, closePalette]);

  // Pre-fetch graph datasets for cross-file node searching in browser environment
  useEffect(() => {
    let isMounted = true;
    const fetchPresetDatasets = async () => {
      if (typeof window === "undefined" || !window.location || !window.location.origin) {
        return;
      }
      const cache = new Map<string, GraphDataset>();
      for (const slug of presetFiles) {
        try {
          const res = await fetch(`/data/graphs/${slug}.json`);
          if (res.ok) {
            const data = (await res.json()) as GraphDataset;
            cache.set(slug, data);
          }
        } catch {
          // Gracefully skip in offline or test environments
        }
      }
      if (isMounted) {
        setDatasetCache(cache);
      }
    };
    void fetchPresetDatasets();
    return () => {
      isMounted = false;
    };
  }, [presetFiles]);

  // Focus search input on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    if (propsOnClose) {
      propsOnClose();
    }
    closePalette();
  }, [propsOnClose, closePalette]);

  // Prepare all searchable items
  const allSearchableItems = useMemo<SearchResultItem[]>(() => {
    const items: SearchResultItem[] = [];

    // 1. Actions from registry
    for (const action of actionRegistry.values()) {
      const isFav = storeFavoriteActions.includes(action.id);
      items.push({
        id: action.id,
        title: action.title,
        description: action.description,
        category: action.category,
        type: action.category as "action" | "navigation" | "layout" | "export",
        score: 0,
        matches: [],
        shortcut: action.shortcut,
        icon: action.icon,
        action,
        handler: action.handler,
        isFavorite: isFav,
      });
    }

    // 2. Nodes from active dataset & cached datasets
    const processedNodes = new Set<string>();
    const cleanCurrentFile = currentFile.replace(/\.json$/, "");

    const currentNodes = activeDataset?.nodes ?? [];
    for (const node of currentNodes) {
      const itemKey = `${cleanCurrentFile}-${node.id}`;
      if (!processedNodes.has(itemKey)) {
        processedNodes.add(itemKey);
        items.push({
          id: itemKey,
          title: node.name,
          description: node.description || `Node in ${cleanCurrentFile || "graph"}`,
          category: "nodes",
          type: "node",
          score: 0,
          matches: [],
          nodeId: node.id,
          fileId: cleanCurrentFile,
          nodeStatus: node.status,
          nodeKind: node.kind,
        });
      }
    }

    // Include other preset dataset nodes
    for (const [slug, ds] of datasetCache.entries()) {
      if (slug === cleanCurrentFile) continue;
      for (const node of ds.nodes) {
        const itemKey = `${slug}-${node.id}`;
        if (!processedNodes.has(itemKey)) {
          processedNodes.add(itemKey);
          items.push({
            id: itemKey,
            title: node.name,
            description: node.description || `Node in ${slug}`,
            category: "nodes",
            type: "node",
            score: 0,
            matches: [],
            nodeId: node.id,
            fileId: slug,
            nodeStatus: node.status,
            nodeKind: node.kind,
          });
        }
      }
    }

    return items;
  }, [actionRegistry, storeFavoriteActions, currentFile, activeDataset, datasetCache]);

  // Compute category counts
  const categoryCounts = useMemo<Record<CommandCategory, number>>(() => {
    const counts: Record<CommandCategory, number> = {
      all: 0,
      actions: 0,
      nodes: 0,
      navigation: 0,
      layout: 0,
      export: 0,
    };

    const trimmed = storeQuery.trim();

    if (!trimmed) {
      for (const item of allSearchableItems) {
        counts.all++;
        if (item.category && counts[item.category as CommandCategory] !== undefined) {
          counts[item.category as CommandCategory]++;
        }
      }
      return counts;
    }

    // Filtered counts
    const scored = fuzzySearchItems(allSearchableItems, trimmed);
    for (const res of scored) {
      counts.all++;
      if (res.item.category && counts[res.item.category as CommandCategory] !== undefined) {
        counts[res.item.category as CommandCategory]++;
      }
    }

    return counts;
  }, [allSearchableItems, storeQuery]);

  // Filtered and scored results based on query and active category
  const filteredResults = useMemo<SearchResultItem[]>(() => {
    const trimmed = storeQuery.trim();
    let candidates = allSearchableItems;

    if (storeActiveCategory !== "all") {
      candidates = candidates.filter((item) => item.category === storeActiveCategory);
    }

    if (!trimmed) {
      const favorites = candidates.filter((i) => i.isFavorite);
      const nonFavorites = candidates.filter((i) => !i.isFavorite);
      return [...favorites, ...nonFavorites].slice(0, maxResults);
    }

    const scored = fuzzySearchItems(candidates, trimmed);
    return scored.slice(0, maxResults).map((res) => ({
      ...res.item,
      score: res.score,
      matches: res.titleMatches,
      descriptionMatches: res.descriptionMatches,
    }));
  }, [allSearchableItems, storeActiveCategory, storeQuery, maxResults]);

  // Clamp effective selected index to prevent out-of-bounds selection when filtering narrows the list
  const effectiveSelectedIndex = useMemo(() => {
    if (filteredResults.length === 0) return 0;
    return Math.min(Math.max(0, storeSelectedIndex), filteredResults.length - 1);
  }, [filteredResults.length, storeSelectedIndex]);

  // Synchronize store selectedIndex whenever filteredResults bounds change
  useEffect(() => {
    if (filteredResults.length > 0 && storeSelectedIndex >= filteredResults.length) {
      setStoreSelectedIndex(filteredResults.length - 1);
    } else if (filteredResults.length === 0 && storeSelectedIndex !== 0) {
      setStoreSelectedIndex(0);
    }
  }, [filteredResults.length, storeSelectedIndex, setStoreSelectedIndex]);

  // Execute or Navigate Item
  const handleSelectItem = useCallback(
    async (item: SearchResultItem) => {
      const trimmed = storeQuery.trim();
      if (trimmed) {
        addRecentSearch(trimmed);
      }

      if (item.type === "node" && item.nodeId) {
        const targetFile = item.fileId || currentFile;
        if (onNavigateNode) {
          onNavigateNode(targetFile, item.nodeId);
        }
        try {
          if (routerNavigate) {
            void routerNavigate({
              to: "/graphs/$fileId",
              params: { fileId: targetFile },
              search: { node: item.nodeId },
            });
          }
        } catch {
          // Router context not available in tests
        }
        handleClose();
        return;
      }

      if (item.action) {
        handleClose();
        if (actionRegistry.has(item.action.id)) {
          await executeStoreAction(item.action.id);
        } else if (item.action.handler) {
          await item.action.handler();
        }
        return;
      }

      if (item.handler) {
        handleClose();
        await item.handler();
        return;
      }

      handleClose();
    },
    [
      storeQuery,
      addRecentSearch,
      currentFile,
      onNavigateNode,
      routerNavigate,
      handleClose,
      actionRegistry,
      executeStoreAction,
    ],
  );

  const handleHoverItem = useCallback(
    (index: number) => {
      setStoreSelectedIndex(index);
    },
    [setStoreSelectedIndex],
  );

  // Keyboard navigation inside dialog
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Tab") {
        e.preventDefault();
        const currentIndex = CATEGORIES.indexOf(storeActiveCategory);
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + CATEGORIES.length) % CATEGORIES.length
          : (currentIndex + 1) % CATEGORIES.length;
        setStoreActiveCategory(CATEGORIES[nextIndex]);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (storeQuery) {
          setStoreQuery("");
        } else {
          handleClose();
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setStoreSelectedIndex((prev) =>
          filteredResults.length > 0 ? (prev + 1) % filteredResults.length : 0,
        );
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setStoreSelectedIndex((prev) =>
          filteredResults.length > 0
            ? (prev - 1 + filteredResults.length) % filteredResults.length
            : 0,
        );
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (filteredResults.length > 0 && filteredResults[effectiveSelectedIndex]) {
          void handleSelectItem(filteredResults[effectiveSelectedIndex]);
        }
      }
    },
    [
      storeActiveCategory,
      setStoreActiveCategory,
      storeQuery,
      setStoreQuery,
      handleClose,
      filteredResults,
      effectiveSelectedIndex,
      setStoreSelectedIndex,
      handleSelectItem,
    ],
  );

  const handleClearQuery = useCallback(() => {
    setStoreQuery("");
    inputRef.current?.focus();
  }, [setStoreQuery]);

  const selectedItem = filteredResults[effectiveSelectedIndex] ?? null;
  const activeDescendantId =
    isOpen && filteredResults.length > 0 && selectedItem ? getOptionId(selectedItem.id) : undefined;

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="command-palette-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className={`command-palette-dialog ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        aria-describedby="command-palette-desc"
        onKeyDown={handleKeyDown}
      >
        <h2 id="command-palette-title" className="sr-only">
          Command Palette and Quick Actions
        </h2>
        <p id="command-palette-desc" className="sr-only">
          Search graph actions, nodes, layouts, navigation, and export commands
        </p>

        {/* Search Header Input Area */}
        <div className="command-palette-search-container">
          <IconSearch className="command-palette-search-icon" size={20} />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
            aria-controls="command-palette-listbox"
            aria-activedescendant={activeDescendantId}
            className="command-palette-search-input"
            value={storeQuery}
            onChange={(e) => setStoreQuery(e.target.value)}
            placeholder={
              placeholder ??
              (storeActiveCategory === "all"
                ? "Type a command or search nodes (e.g. 'Reset View', 'Layout', 'Export')..."
                : `Search in ${storeActiveCategory}...`)
            }
            autoFocus
          />
          {storeQuery && (
            <button
              type="button"
              className="command-palette-search-clear"
              onClick={handleClearQuery}
              aria-label="Clear search query"
            >
              <IconX size={16} />
            </button>
          )}
        </div>

        {/* Category Filter Tabs Bar */}
        <div className="command-palette-tabs" role="tablist" aria-label="Command categories">
          {CATEGORIES.map((cat) => {
            const isActive = storeActiveCategory === cat;
            const count = categoryCounts[cat];
            return (
              <button
                key={cat}
                type="button"
                role="tab"
                id={`tab-${cat}`}
                aria-selected={isActive}
                aria-controls="command-palette-listbox"
                className={`command-palette-tab ${isActive ? "command-palette-tab--active" : ""}`}
                onClick={() => setStoreActiveCategory(cat)}
              >
                <span style={{ textTransform: "capitalize" }}>{cat}</span>
                <span className="command-palette-tab-count">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Results Listbox */}
        <div
          id="command-palette-listbox"
          className="command-palette-results"
          role="listbox"
          aria-label="Command suggestions"
        >
          {filteredResults.length === 0 ? (
            <div className="command-palette-empty" role="status">
              <div className="command-palette-empty-title">No matching commands or nodes found</div>
              <div className="command-palette-empty-subtitle">
                Try searching for layout modes, export formats, or quick navigation commands.
              </div>
              <div className="command-palette-recommendations">
                <button
                  type="button"
                  className="command-palette-rec-chip"
                  onClick={() => setStoreQuery("Reset View")}
                >
                  Reset View
                </button>
                <button
                  type="button"
                  className="command-palette-rec-chip"
                  onClick={() => setStoreQuery("Layout")}
                >
                  Switch Layout
                </button>
                <button
                  type="button"
                  className="command-palette-rec-chip"
                  onClick={() => setStoreQuery("Export")}
                >
                  Export Options
                </button>
              </div>
            </div>
          ) : (
            filteredResults.map((item, index) => (
              <CommandPaletteItemRow
                key={item.id}
                item={item}
                index={index}
                isSelected={index === effectiveSelectedIndex}
                onSelect={handleSelectItem}
                onHover={handleHoverItem}
                onToggleFavorite={toggleFavoriteAction}
              />
            ))
          )}
        </div>

        {/* Footer Keyboard Hints */}
        <div className="command-palette-footer">
          <div className="command-palette-footer-left">
            <span className="command-palette-shortcut">
              <kbd className="command-palette-key">↑</kbd>
              <kbd className="command-palette-key">↓</kbd> navigate
            </span>
            <span className="command-palette-shortcut">
              <kbd className="command-palette-key">↵</kbd> select
            </span>
            <span className="command-palette-shortcut">
              <kbd className="command-palette-key">⇥</kbd> filter
            </span>
          </div>
          <div className="command-palette-footer-right">
            <span className="command-palette-shortcut">
              <kbd className="command-palette-key">esc</kbd> close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default CommandPalette;
export type {
  ActionCategory,
  ActionHandler,
  CommandAction,
  CommandCategory,
  CommandPaletteProps,
  CommandPaletteScope,
  SearchResultItem,
  SearchResultNode,
  ShortcutBadgeProps,
} from "./CommandPalette.types";
export { ShortcutBadge } from "./ShortcutBadge";
export { fuzzyMatch, fuzzySearchItems, highlightMatches } from "./fuzzySearch";
export { createDefaultActions, registerDefaultActions } from "./ActionRegistry";
