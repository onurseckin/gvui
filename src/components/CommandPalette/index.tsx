import type { FC, KeyboardEvent, ReactNode } from "react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { IconCube, IconSearch, IconSparkles, IconX } from "@tabler/icons-react";
import { useGraphStore } from "../../state/useGraphStore";
import { useGraphFilesStore } from "../../state/useGraphFilesStore";
import { useCommandPaletteStore } from "../../store/useCommandPaletteStore";
import type { GraphDataset } from "../../types/graphData";
import { fuzzySearchItems, highlightMatches } from "./fuzzySearch";
import type { CommandPaletteProps, SearchResultItem, SearchScope } from "./CommandPalette.types";
import "./CommandPalette.css";

const SCOPES: Array<{ key: SearchScope; label: string }> = [
  { key: "current", label: "Current Graph Nodes" },
  { key: "all", label: "All Nodes Across Graphs" },
];

export function getOptionId(itemId: string): string {
  return `command-item-${itemId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function getNodeKindIcon(kind?: string): ReactNode {
  switch (kind) {
    case "orchestrator":
      return <IconSparkles size={16} />;
    case "agent":
      return <IconCube size={16} />;
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
}

const CommandPaletteItemRow: FC<CommandPaletteItemProps> = React.memo(
  function CommandPaletteItemRow({ item, index, isSelected, onSelect, onHover }) {
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
          <div className="command-palette-item-icon">{getNodeKindIcon(item.nodeKind)}</div>
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
          {item.fileId && <span className="command-palette-source-badge">{item.fileId}</span>}
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
  placeholder,
  className = "",
  maxResults = 50,
  defaultCategory,
  defaultScope,
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

  const openPalette = useCommandPaletteStore((s) => s.openPalette);
  const closePalette = useCommandPaletteStore((s) => s.closePalette);
  const setStoreQuery = useCommandPaletteStore((s) => s.setQuery);
  const setStoreSelectedIndex = useCommandPaletteStore((s) => s.setSelectedIndex);
  const setStoreActiveCategory = useCommandPaletteStore((s) => s.setActiveCategory);
  const addRecentSearch = useCommandPaletteStore((s) => s.addRecentSearch);

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
  const centerNodeOnCanvas = useGraphStore((state) => state.centerNodeOnCanvas);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);

  // Set default category / scope if provided
  useEffect(() => {
    const targetScope = defaultScope ?? defaultCategory;
    if (targetScope && (targetScope === "current" || targetScope === "all")) {
      setStoreActiveCategory(targetScope);
    }
  }, [defaultCategory, defaultScope, setStoreActiveCategory]);

  // Global Cmd+K / Ctrl+K listener with unmount cleanup
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

  // Prepare searchable items for current graph and all graphs
  const cleanCurrentFile = useMemo(() => currentFile.replace(/\.json$/, ""), [currentFile]);

  const currentGraphItems = useMemo<SearchResultItem[]>(() => {
    const items: SearchResultItem[] = [];
    const currentNodes = activeDataset?.nodes ?? [];
    for (const node of currentNodes) {
      const itemKey = `${cleanCurrentFile}-${node.id}`;
      items.push({
        id: itemKey,
        title: node.name,
        description: node.description || `Node in ${cleanCurrentFile || "graph"}`,
        category: "current",
        score: 0,
        matches: [],
        nodeId: node.id,
        fileId: cleanCurrentFile,
        sourceFileName: cleanCurrentFile,
        nodeStatus: node.status,
        nodeKind: node.kind,
      });
    }
    return items;
  }, [activeDataset, cleanCurrentFile]);

  const allGraphItems = useMemo<SearchResultItem[]>(() => {
    const items: SearchResultItem[] = [...currentGraphItems];
    const processedKeys = new Set(currentGraphItems.map((i) => i.id));

    for (const [slug, ds] of datasetCache.entries()) {
      if (slug === cleanCurrentFile) continue;
      for (const node of ds.nodes) {
        const itemKey = `${slug}-${node.id}`;
        if (!processedKeys.has(itemKey)) {
          processedKeys.add(itemKey);
          items.push({
            id: itemKey,
            title: node.name,
            description: node.description || `Node in ${slug}`,
            category: "all",
            score: 0,
            matches: [],
            nodeId: node.id,
            fileId: slug,
            sourceFileName: slug,
            nodeStatus: node.status,
            nodeKind: node.kind,
          });
        }
      }
    }

    return items;
  }, [currentGraphItems, datasetCache, cleanCurrentFile]);

  // Compute match counts for the 2 scopes
  const scopeCounts = useMemo<Record<SearchScope, number>>(() => {
    const trimmed = storeQuery.trim();
    if (!trimmed) {
      return {
        current: currentGraphItems.length,
        all: allGraphItems.length,
      };
    }

    const currentMatches = fuzzySearchItems(currentGraphItems, trimmed);
    const allMatches = fuzzySearchItems(allGraphItems, trimmed);

    return {
      current: currentMatches.length,
      all: allMatches.length,
    };
  }, [currentGraphItems, allGraphItems, storeQuery]);

  // Filtered and scored results based on active scope and query
  const filteredResults = useMemo<SearchResultItem[]>(() => {
    const trimmed = storeQuery.trim();
    const candidates = storeActiveCategory === "all" ? allGraphItems : currentGraphItems;

    if (!trimmed) {
      return candidates.slice(0, maxResults);
    }

    const scored = fuzzySearchItems(candidates, trimmed);
    return scored.slice(0, maxResults).map((res) => ({
      ...res.item,
      score: res.score,
      matches: res.titleMatches,
      descriptionMatches: res.descriptionMatches,
    }));
  }, [currentGraphItems, allGraphItems, storeActiveCategory, storeQuery, maxResults]);

  // Clamp effective selected index
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

  // Execute selection
  const handleSelectItem = useCallback(
    (item: SearchResultItem) => {
      const trimmed = storeQuery.trim();
      if (trimmed) {
        addRecentSearch(trimmed);
      }

      const targetFile = item.fileId || cleanCurrentFile;
      if (onNavigateNode) {
        onNavigateNode(targetFile, item.nodeId);
      }

      if (targetFile === cleanCurrentFile) {
        setSelectedNodeId(item.nodeId);
        centerNodeOnCanvas(item.nodeId);
      } else if (routerNavigate) {
        try {
          void routerNavigate({
            to: "/graphs/$fileId",
            params: { fileId: targetFile },
            search: { node: item.nodeId },
          });
        } catch {
          // Router context not available in tests
        }
      }

      handleClose();
    },
    [
      storeQuery,
      addRecentSearch,
      cleanCurrentFile,
      onNavigateNode,
      setSelectedNodeId,
      centerNodeOnCanvas,
      routerNavigate,
      handleClose,
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
        const nextScope: SearchScope = storeActiveCategory === "current" ? "all" : "current";
        setStoreActiveCategory(nextScope);
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
          handleSelectItem(filteredResults[effectiveSelectedIndex]);
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
          Node Search
        </h2>
        <p id="command-palette-desc" className="sr-only">
          Search graph nodes across the current graph or all graphs
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
              (storeActiveCategory === "current"
                ? "Search nodes in current graph..."
                : "Search nodes across all graphs...")
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

        {/* Dual Scope Tabs Bar */}
        <div className="command-palette-tabs" role="tablist" aria-label="Search scopes">
          {SCOPES.map((scope) => {
            const isActive = storeActiveCategory === scope.key;
            const count = scopeCounts[scope.key];
            return (
              <button
                key={scope.key}
                type="button"
                role="tab"
                id={`tab-${scope.key}`}
                aria-selected={isActive}
                aria-controls="command-palette-listbox"
                className={`command-palette-tab ${isActive ? "command-palette-tab--active" : ""}`}
                onClick={() => setStoreActiveCategory(scope.key)}
              >
                <span>{scope.label}</span>
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
          aria-label="Node search results"
        >
          {filteredResults.length === 0 ? (
            <div className="command-palette-empty" role="status">
              <div className="command-palette-empty-title">No matching nodes found</div>
              <div className="command-palette-empty-subtitle">
                Try searching for a node name, description, role, or kind.
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
              <kbd className="command-palette-key">⇥</kbd> toggle scope
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
  CommandCategory,
  CommandPaletteProps,
  CommandPaletteScope,
  SearchResultItem,
  SearchResultNode,
  SearchScope,
  ShortcutBadgeProps,
} from "./CommandPalette.types";
export { ShortcutBadge } from "./ShortcutBadge";
export { fuzzyMatch, fuzzySearchItems, highlightMatches } from "./fuzzySearch";
