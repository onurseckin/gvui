import type { FC } from "react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "../../ui/atoms/Button";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphDataset } from "../../types/graphData";
import type {
  CommandPaletteProps,
  CommandPaletteScope,
  SearchResultNode,
} from "./CommandPalette.types";
import { SAMPLE_GRAPHS } from "../Sidebar/sampleGraphs";
import "./CommandPalette.css";

// Derived from the single sidebar registry rather than duplicated. This list was a second,
// independent copy of the dataset ids; when the sample data was replaced it went stale and every
// entry prefetched a 404, which Vite serves as index.html — hence a JSON parse error per dataset
// on every page load.
const PRESET_FILES: string[] = SAMPLE_GRAPHS.map((sample) => sample.id);

interface CommandPaletteItemProps {
  node: SearchResultNode;
  index: number;
  isSelected: boolean;
  onSelect: (node: SearchResultNode) => void;
  onHover: (index: number) => void;
}

const CommandPaletteItem = React.memo<CommandPaletteItemProps>(function CommandPaletteItem({
  node,
  index,
  isSelected,
  onSelect,
  onHover,
}) {
  const handleClick = useCallback(() => {
    onSelect(node);
  }, [onSelect, node]);

  const handleMouseEnter = useCallback(() => {
    onHover(index);
  }, [onHover, index]);

  return (
    <div
      role="option"
      aria-selected={isSelected}
      className={`command-palette-item ${isSelected ? "command-palette-item--selected" : ""}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
    >
      <div className="command-palette-item-main">
        <span className="command-palette-item-name">{node.name}</span>
        {node.description && (
          <span className="command-palette-item-description">{node.description}</span>
        )}
      </div>
      <span className="command-palette-source-badge">{node.sourceFileName}</span>
    </div>
  );
});

export const CommandPalette: FC<CommandPaletteProps> = React.memo(function CommandPalette({
  isOpen,
  onClose,
  currentFile,
  onNavigateNode,
}) {
  const navigate = useNavigate();
  const [scope, setScope] = useState<CommandPaletteScope>("current");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [datasetCache, setDatasetCache] = useState<Map<string, GraphDataset>>(new Map());

  const activeDataset = useGraphStore((state) => state.dataset);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce input value changes to prevent main thread blocking during fast typing
  useEffect(() => {
    if (!searchQuery) {
      setDebouncedQuery("");
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 120);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Pre-fetch graph datasets
  useEffect(() => {
    let isMounted = true;
    const fetchPresetDatasets = async () => {
      const cache = new Map<string, GraphDataset>();
      for (const slug of PRESET_FILES) {
        try {
          const res = await fetch(`/data/graphs/${slug}.json`);
          if (res.ok) {
            const data = (await res.json()) as GraphDataset;
            cache.set(slug, data);
          }
        } catch (err) {
          console.error(`Failed to prefetch dataset ${slug}:`, err);
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
  }, []);

  // Reset state when opening modal & auto-focus search input
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setDebouncedQuery("");
      setSelectedIndex(0);
      setScope("current");
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Compute available SearchResultNodes depending on scope and loaded/active datasets
  const allAvailableNodes = useMemo<SearchResultNode[]>(() => {
    const nodes: SearchResultNode[] = [];
    const processedFiles = new Set<string>();
    const cleanCurrentFile = currentFile.replace(/\.json$/, "");

    if (scope === "current") {
      let currentNodes = activeDataset?.nodes ?? [];
      const isCurrentPreset = PRESET_FILES.includes(cleanCurrentFile);
      if (
        isCurrentPreset &&
        datasetCache.has(cleanCurrentFile) &&
        (!activeDataset ||
          (activeDataset.id !== cleanCurrentFile &&
            activeDataset.id !== currentFile &&
            `${activeDataset.id}.json` !== currentFile))
      ) {
        currentNodes = datasetCache.get(cleanCurrentFile)?.nodes ?? [];
      }
      for (const n of currentNodes) {
        nodes.push({
          ...n,
          fileId: cleanCurrentFile,
          sourceFileName: cleanCurrentFile,
        });
      }
    } else {
      // "All Files" scope
      for (const slug of PRESET_FILES) {
        let fileNodes = datasetCache.get(slug)?.nodes ?? [];
        if (
          activeDataset &&
          (activeDataset.id === slug ||
            activeDataset.id === `${slug}.json` ||
            cleanCurrentFile === slug)
        ) {
          fileNodes = activeDataset.nodes;
        }
        processedFiles.add(slug);
        for (const n of fileNodes) {
          nodes.push({
            ...n,
            fileId: slug,
            sourceFileName: slug,
          });
        }
      }
      if (activeDataset && !processedFiles.has(cleanCurrentFile)) {
        for (const n of activeDataset.nodes) {
          nodes.push({
            ...n,
            fileId: cleanCurrentFile,
            sourceFileName: cleanCurrentFile,
          });
        }
      }
    }
    return nodes;
  }, [scope, currentFile, activeDataset, datasetCache]);

  // Filter and sort nodes using debounced query
  const filteredResults = useMemo<SearchResultNode[]>(() => {
    const query = debouncedQuery.trim().toLowerCase();
    if (!query) {
      // When query is empty: Shows top 10 nodes ordered alphabetically by name
      const sorted = [...allAvailableNodes].sort((a, b) => a.name.localeCompare(b.name));
      return sorted.slice(0, 10);
    }
    // When query is typed: Filters nodes by name (case-insensitive) and orders alphabetically
    return allAvailableNodes
      .filter((node) => node.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allAvailableNodes, debouncedQuery]);

  // Reset selected index when query or scope changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [debouncedQuery, scope]);

  const handleSelectItem = useCallback(
    (node: SearchResultNode) => {
      onNavigateNode(node.fileId, node.id);
      void navigate({
        to: "/graphs/$fileId",
        params: { fileId: node.fileId },
        search: { node: node.id },
      });
      onClose();
    },
    [onNavigateNode, navigate, onClose],
  );

  const handleItemHover = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.altKey && (e.key.toLowerCase() === "c" || e.code === "KeyC")) {
        e.preventDefault();
        setScope("current");
        return;
      }
      if (e.altKey && (e.key.toLowerCase() === "a" || e.code === "KeyA")) {
        e.preventDefault();
        setScope("all");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredResults.length > 0 ? (prev + 1) % filteredResults.length : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          filteredResults.length > 0
            ? (prev - 1 + filteredResults.length) % filteredResults.length
            : 0,
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (filteredResults[selectedIndex]) {
          handleSelectItem(filteredResults[selectedIndex]);
        }
      }
    },
    [filteredResults, selectedIndex, handleSelectItem, onClose],
  );

  const handleClearQuery = useCallback(() => {
    setSearchQuery("");
  }, []);

  const handleSelectCurrentScope = useCallback(() => {
    setScope("current");
  }, []);

  const handleSelectAllScope = useCallback(() => {
    setScope("all");
  }, []);

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="command-palette-backdrop" />
        <Dialog.Popup className="command-palette-dialog" onKeyDown={handleKeyDown}>
          <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search graph nodes across current file or all graph datasets
          </Dialog.Description>

          <div className="command-palette-search-container">
            <svg
              className="command-palette-search-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              className="command-palette-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                scope === "current"
                  ? `Search nodes in ${currentFile}...`
                  : "Search nodes across all files..."
              }
              autoFocus
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="command-palette-search-clear"
                onClick={handleClearQuery}
                title="Clear search"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </Button>
            )}
          </div>

          <div className="command-palette-tabs" role="tablist">
            <Button
              variant={scope === "current" ? "outline" : "ghost"}
              size="sm"
              role="tab"
              aria-selected={scope === "current"}
              className="command-palette-tab"
              onClick={handleSelectCurrentScope}
            >
              <span>Current File</span>
              <kbd className="command-palette-key">⌥+C</kbd>
            </Button>
            <Button
              variant={scope === "all" ? "outline" : "ghost"}
              size="sm"
              role="tab"
              aria-selected={scope === "all"}
              className="command-palette-tab"
              onClick={handleSelectAllScope}
            >
              <span>All Files</span>
              <kbd className="command-palette-key">⌥+A</kbd>
            </Button>
          </div>

          <div className="command-palette-results" role="listbox">
            {filteredResults.length === 0 ? (
              <div className="command-palette-empty">No matching nodes found</div>
            ) : (
              filteredResults.map((node, index) => (
                <CommandPaletteItem
                  key={`${node.fileId}-${node.id}-${index}`}
                  node={node}
                  index={index}
                  isSelected={index === selectedIndex}
                  onSelect={handleSelectItem}
                  onHover={handleItemHover}
                />
              ))
            )}
          </div>

          <div className="command-palette-footer">
            <span className="command-palette-shortcut">
              <kbd className="command-palette-key">↑</kbd>
              <kbd className="command-palette-key">↓</kbd> navigate
            </span>
            <span className="command-palette-shortcut">
              <kbd className="command-palette-key">↵</kbd> select
            </span>
            <span className="command-palette-shortcut">
              <kbd className="command-palette-key">esc</kbd> close
            </span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
});

export default CommandPalette;
export type {
  CommandPaletteProps,
  CommandPaletteScope,
  SearchResultNode,
} from "./CommandPalette.types";
