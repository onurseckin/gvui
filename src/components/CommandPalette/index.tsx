import type { FC } from "react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { Button } from "../../ui/atoms/Button";
import { useGraphStore } from "../../state/useGraphStore";
import type { GraphDataset } from "../../types/graphData";
import type {
  CommandPaletteProps,
  CommandPaletteScope,
  SearchResultNode,
} from "./CommandPalette.types";
import "./CommandPalette.css";

const PRESET_FILES = [
  "ai_agent_trace.json",
  "decision_tree.json",
  "cyclic_mesh.json",
  "distributed_saga_workflow.json",
  "kubernetes_cluster_topology.json",
];

export const CommandPalette: FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  currentFile,
  onNavigateNode,
}) => {
  const [scope, setScope] = useState<CommandPaletteScope>("current");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [datasetCache, setDatasetCache] = useState<Map<string, GraphDataset>>(new Map());

  const activeDataset = useGraphStore((state) => state.dataset);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pre-fetch graph datasets
  useEffect(() => {
    let isMounted = true;
    const fetchPresetDatasets = async () => {
      const cache = new Map<string, GraphDataset>();
      for (const fileId of PRESET_FILES) {
        try {
          const res = await fetch(`/graphs/${fileId}`);
          if (res.ok) {
            const data = (await res.json()) as GraphDataset;
            cache.set(fileId, data);
          }
        } catch (err) {
          console.error(`Failed to prefetch dataset ${fileId}:`, err);
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

    if (scope === "current") {
      let currentNodes = activeDataset?.nodes ?? [];
      const isCurrentPreset = PRESET_FILES.includes(currentFile);
      if (
        isCurrentPreset &&
        datasetCache.has(currentFile) &&
        (!activeDataset ||
          (activeDataset.id !== currentFile && `${activeDataset.id}.json` !== currentFile))
      ) {
        currentNodes = datasetCache.get(currentFile)?.nodes ?? [];
      }
      for (const n of currentNodes) {
        nodes.push({
          ...n,
          fileId: currentFile,
          sourceFileName: currentFile,
        });
      }
    } else {
      // "All Files" scope
      for (const fileId of PRESET_FILES) {
        let fileNodes = datasetCache.get(fileId)?.nodes ?? [];
        if (
          activeDataset &&
          (activeDataset.id === fileId || `${activeDataset.id}.json` === fileId)
        ) {
          fileNodes = activeDataset.nodes;
        }
        processedFiles.add(fileId);
        for (const n of fileNodes) {
          nodes.push({
            ...n,
            fileId,
            sourceFileName: fileId,
          });
        }
      }
      if (activeDataset && !processedFiles.has(currentFile)) {
        for (const n of activeDataset.nodes) {
          nodes.push({
            ...n,
            fileId: currentFile,
            sourceFileName: currentFile,
          });
        }
      }
    }
    return nodes;
  }, [scope, currentFile, activeDataset, datasetCache]);

  // Filter and sort nodes alphabetically
  const filteredResults = useMemo<SearchResultNode[]>(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      // When query is empty: Shows top 10 nodes ordered alphabetically by name
      const sorted = [...allAvailableNodes].sort((a, b) => a.name.localeCompare(b.name));
      return sorted.slice(0, 10);
    }
    // When query is typed: Filters nodes by name (case-insensitive) and orders alphabetically
    return allAvailableNodes
      .filter((node) => node.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allAvailableNodes, searchQuery]);

  // Reset selected index when query or scope changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery, scope]);

  const handleSelectItem = useCallback(
    (node: SearchResultNode) => {
      onNavigateNode(node.fileId, node.id);
      onClose();
    },
    [onNavigateNode, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
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
  };

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
                onClick={() => setSearchQuery("")}
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
              onClick={() => setScope("current")}
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
              onClick={() => setScope("all")}
            >
              <span>All Files</span>
              <kbd className="command-palette-key">⌥+A</kbd>
            </Button>
          </div>

          <div className="command-palette-results" role="listbox">
            {filteredResults.length === 0 ? (
              <div className="command-palette-empty">No matching nodes found</div>
            ) : (
              filteredResults.map((node, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <div
                    key={`${node.fileId}-${node.id}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    className={`command-palette-item ${isSelected ? "command-palette-item--selected" : ""}`}
                    onClick={() => handleSelectItem(node)}
                    onMouseEnter={() => setSelectedIndex(index)}
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
              })
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
};

export default CommandPalette;
export type {
  CommandPaletteProps,
  CommandPaletteScope,
  SearchResultNode,
} from "./CommandPalette.types";
