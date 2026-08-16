import type { ChangeEvent, FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconChevronUp, IconSearch, IconX } from "@tabler/icons-react";
import {
  describeNodeKind,
  describeNodeStatus,
  resolveNodeStatus,
} from "../../primitives/nodes/NodeCard/nodeKinds";
import { useGraphStore, type FilterCategory } from "../../state/useGraphStore";
import type { PositionedNode } from "../../types/graphData";
import "./GraphSearchOverlay.css";

export interface GraphSearchOverlayProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSelectNode?: (nodeId: string) => void;
  className?: string;
  defaultExpanded?: boolean;
  defaultDropdownOpen?: boolean;
}

export type SearchCategoryFilter = "all" | "success" | "error" | "running" | "tools";

interface CategoryPillOption {
  key: SearchCategoryFilter;
  label: string;
  dotClass?: string;
}

const CATEGORY_OPTIONS: readonly CategoryPillOption[] = [
  { key: "all", label: "All" },
  { key: "success", label: "Success", dotClass: "dot-success" },
  { key: "error", label: "Error", dotClass: "dot-error" },
  { key: "running", label: "Running", dotClass: "dot-running" },
  { key: "tools", label: "Tools", dotClass: "dot-tools" },
];

export function isNodeSearchMatch(
  node: PositionedNode,
  query: string,
  category: SearchCategoryFilter = "all",
): boolean {
  // Category / Status filter
  if (category !== "all") {
    const status = resolveNodeStatus(node);
    if (category === "success" && status !== "success") return false;
    if (category === "error" && status !== "error") return false;
    if (category === "running" && status !== "running") return false;
    if (category === "tools") {
      if (!node.tools || node.tools.length === 0) return false;
    }
  }

  const q = query.trim();
  if (!q) return true;

  // Prepare regex matcher with safe fallback
  let regex: RegExp | null = null;
  try {
    regex = new RegExp(q, "i");
  } catch {
    regex = null;
  }

  const lowerQ = q.toLowerCase();
  const matchesText = (val?: string | null): boolean => {
    if (!val) return false;
    if (regex) {
      try {
        if (regex.test(val)) return true;
      } catch {
        // Safe regex execution fallback
      }
    }
    return val.toLowerCase().includes(lowerQ);
  };

  // 1. Match Label / Name / ID / Step / Description / Badges
  if (
    matchesText(node.name) ||
    matchesText(node.id) ||
    matchesText(node.stepLabel) ||
    matchesText(node.badge?.text) ||
    matchesText(node.description) ||
    Boolean(node.badges && node.badges.some((b) => matchesText(b.label)))
  ) {
    return true;
  }

  // 2. Match Archetype / Kind / Type / Model
  const kindDesc = describeNodeKind(node);
  if (
    matchesText(node.kind) ||
    matchesText(node.type) ||
    matchesText(kindDesc.label) ||
    matchesText(node.model)
  ) {
    return true;
  }

  // 3. Match Role / Agent / Host / Actor / Lease
  const role = node.metadata?.role ? String(node.metadata.role) : undefined;
  const leaseAgent = node.metadata?.leaseAgent ? String(node.metadata.leaseAgent) : undefined;
  const hostAgentName = node.hostAgent?.name ? String(node.hostAgent.name) : undefined;
  const hostAgentRole = node.hostAgent?.role ? String(node.hostAgent.role) : undefined;
  const actorId = node.provenance?.actorId ? String(node.provenance.actorId) : undefined;
  const group = node.group ? String(node.group) : undefined;
  if (
    matchesText(role) ||
    matchesText(leaseAgent) ||
    matchesText(hostAgentName) ||
    matchesText(hostAgentRole) ||
    matchesText(actorId) ||
    matchesText(group)
  ) {
    return true;
  }

  // 4. Match Status
  const status = node.status ? String(node.status) : undefined;
  const resolvedStatus = resolveNodeStatus(node);
  const statusDesc = describeNodeStatus(node).label;
  const rawStatus = node.metadata?.status ? String(node.metadata.status) : undefined;
  if (
    matchesText(status) ||
    matchesText(resolvedStatus) ||
    matchesText(statusDesc) ||
    matchesText(rawStatus)
  ) {
    return true;
  }

  return false;
}

export const GraphSearchOverlay: FC<GraphSearchOverlayProps> = memo(function GraphSearchOverlay({
  isOpen = true,
  onClose,
  onSelectNode,
  className = "",
  defaultExpanded = true,
  defaultDropdownOpen = false,
}) {
  const positionedNodes = useGraphStore((state) => state.positionedNodes);
  const storeSearchQuery = useGraphStore((state) => state.searchQuery);
  const storeActiveFilter = useGraphStore((state) => state.activeFilter);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);

  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
  const centerNodeOnCanvas = useGraphStore((state) => state.centerNodeOnCanvas);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);
  const setActiveFilter = useGraphStore((state) => state.setActiveFilter);

  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);
  const [localQuery, setLocalQuery] = useState<string>(storeSearchQuery);
  const [categoryFilter, setCategoryFilter] = useState<SearchCategoryFilter>(
    storeActiveFilter as SearchCategoryFilter,
  );
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(defaultDropdownOpen);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);

  // Sync external store query changes if any
  useEffect(() => {
    if (storeSearchQuery !== localQuery) {
      setLocalQuery(storeSearchQuery);
    }
  }, [storeSearchQuery]);

  // Compute matching nodes based on live query and category filter
  const matchingNodes = useMemo<PositionedNode[]>(() => {
    if (!positionedNodes || positionedNodes.length === 0) return [];
    return positionedNodes.filter((node) => isNodeSearchMatch(node, localQuery, categoryFilter));
  }, [positionedNodes, localQuery, categoryFilter]);

  // Reset highlighted index when matches or query changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [localQuery, categoryFilter]);

  // Scroll active option into view in listbox
  useEffect(() => {
    if (!isDropdownOpen || !listboxRef.current) return;
    const activeEl = listboxRef.current.children[highlightedIndex] as HTMLElement | undefined;
    if (activeEl && typeof activeEl.scrollIntoView === "function") {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [highlightedIndex, isDropdownOpen]);

  // Keyboard shortcut listener: Cmd/Ctrl+F, Cmd/Ctrl+K, or / opens & focuses overlay
  useEffect(() => {
    const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        Boolean(target?.isContentEditable);

      const isCmdF = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f";
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isSlash = !isInput && e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;

      if (isCmdF || isCmdK || isSlash) {
        e.preventDefault();
        setIsExpanded(true);
        setIsDropdownOpen(true);
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        }, 30);
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  const handleSelectNodeAction = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId);
      centerNodeOnCanvas(nodeId);
      onSelectNode?.(nodeId);
    },
    [setSelectedNodeId, centerNodeOnCanvas, onSelectNode],
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setLocalQuery(val);
      setSearchQuery(val);
      setIsDropdownOpen(true);
    },
    [setSearchQuery],
  );

  const handleClearQuery = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setLocalQuery("");
      setSearchQuery("");
      inputRef.current?.focus();
    },
    [setSearchQuery],
  );

  const handleCategorySelect = useCallback(
    (cat: SearchCategoryFilter) => {
      setCategoryFilter(cat);
      // Map to store filter category
      const storeCat: FilterCategory = cat === "running" ? "all" : (cat as FilterCategory);
      setActiveFilter(storeCat);
      setIsDropdownOpen(true);
    },
    [setActiveFilter],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (localQuery.length > 0) {
          setLocalQuery("");
          setSearchQuery("");
        } else {
          setIsDropdownOpen(false);
          inputRef.current?.blur();
          onClose?.();
        }
        return;
      }

      if (matchingNodes.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIsDropdownOpen(true);
        setHighlightedIndex((prev) => (prev + 1) % matchingNodes.length);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIsDropdownOpen(true);
        setHighlightedIndex((prev) => (prev <= 0 ? matchingNodes.length - 1 : prev - 1));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const targetNode = matchingNodes[highlightedIndex];
        if (targetNode) {
          handleSelectNodeAction(targetNode.id);
        }
      }
    },
    [localQuery, matchingNodes, highlightedIndex, handleSelectNodeAction, setSearchQuery, onClose],
  );

  const handleStopPropagation = useCallback((e: MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleToggleExpand = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((p) => !p);
  }, []);

  if (!isOpen) return null;

  if (!isExpanded) {
    return (
      <div
        className={`graph-search-overlay is-collapsed ${className}`}
        onMouseDown={handleStopPropagation}
        onClick={handleStopPropagation}
      >
        <button
          type="button"
          className="graph-search-trigger-btn"
          onClick={() => {
            setIsExpanded(true);
            setIsDropdownOpen(true);
            setTimeout(() => inputRef.current?.focus(), 30);
          }}
          aria-label="Open graph search"
          title="Search graph nodes (⌘F or /)"
        >
          <IconSearch size={14} className="graph-search-icon" />
          <span>Search</span>
          <kbd className="graph-search-kbd">⌘F</kbd>
        </button>
      </div>
    );
  }

  const isFilterActive = localQuery.trim().length > 0 || categoryFilter !== "all";
  const shouldShowDropdown = isDropdownOpen || isFilterActive || localQuery.trim().length > 0;

  return (
    <div
      role="search"
      aria-label="Canvas search and filter overlay"
      className={`graph-search-overlay${className ? ` ${className}` : ""}`}
      onMouseDown={handleStopPropagation}
      onClick={handleStopPropagation}
      onKeyDown={handleKeyDown}
    >
      <div className="graph-search-card">
        {/* Input Bar */}
        <div className="graph-search-input-row">
          <IconSearch size={16} className="graph-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="graph-search-input"
            value={localQuery}
            onChange={handleInputChange}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Search nodes by name, role, kind, status..."
            aria-autocomplete="list"
            aria-controls="graph-search-results-list"
            aria-expanded={shouldShowDropdown}
            aria-activedescendant={
              matchingNodes[highlightedIndex]
                ? `search-opt-${matchingNodes[highlightedIndex].id}`
                : undefined
            }
          />

          {localQuery ? (
            <button
              type="button"
              className="graph-search-btn-icon"
              onClick={handleClearQuery}
              aria-label="Clear search query"
              title="Clear search"
            >
              <IconX size={14} />
            </button>
          ) : (
            <kbd className="graph-search-kbd">⌘F</kbd>
          )}

          <span
            className="graph-search-badge-count"
            title={`${matchingNodes.length} matching nodes`}
          >
            {matchingNodes.length}
          </span>

          <button
            type="button"
            className="graph-search-btn-icon"
            onClick={handleToggleExpand}
            aria-label="Collapse search overlay"
            title="Collapse overlay"
          >
            <IconChevronUp size={14} />
          </button>
        </div>

        {/* Category Pills */}
        <div className="graph-search-categories" role="group" aria-label="Filter categories">
          {CATEGORY_OPTIONS.map((opt) => {
            const isActive = categoryFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                className={`graph-search-pill${isActive ? " is-active" : ""}`}
                onClick={() => handleCategorySelect(opt.key)}
                aria-pressed={isActive}
              >
                {opt.dotClass ? <span className={`graph-search-pill-dot ${opt.dotClass}`} /> : null}
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        {/* Results Listbox */}
        {shouldShowDropdown && (
          <div
            id="graph-search-results-list"
            ref={listboxRef}
            className="graph-search-results"
            role="listbox"
            aria-label="Search results"
          >
            {matchingNodes.length === 0 ? (
              <div className="graph-search-empty" role="status" aria-live="polite">
                No matching nodes found
              </div>
            ) : (
              matchingNodes.map((node, index) => {
                const isSelected = index === highlightedIndex;
                const isCanvasSelected = selectedNodeId === node.id;
                const kindDesc = describeNodeKind(node);
                const statusDesc = describeNodeStatus(node);
                const roleText =
                  node.metadata?.role ||
                  node.metadata?.leaseAgent ||
                  node.hostAgent?.name ||
                  node.hostAgent?.role ||
                  node.provenance?.actorId;

                const statusClass = `status-${resolveNodeStatus(node)}`;

                return (
                  <div
                    id={`search-opt-${node.id}`}
                    key={node.id}
                    role="option"
                    aria-selected={isSelected || isCanvasSelected}
                    className={`graph-search-item ${isSelected ? "is-selected" : ""}`}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => handleSelectNodeAction(node.id)}
                  >
                    <div className="graph-search-item-left">
                      <div
                        className="graph-search-item-icon-box"
                        style={{ color: kindDesc.accent }}
                      >
                        <kindDesc.IconComponent size={14} />
                      </div>
                      <div className="graph-search-item-info">
                        <span className="graph-search-item-name" title={node.name}>
                          {node.name}
                        </span>
                        <div className="graph-search-item-sub">
                          <span
                            style={{
                              color: kindDesc.accent,
                              fontWeight: 600,
                              fontSize: "10px",
                            }}
                          >
                            {kindDesc.label}
                          </span>
                          {roleText && (
                            <span className="graph-search-item-role">• {String(roleText)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="graph-search-item-right">
                      {typeof node.step === "number" && (
                        <span className="graph-search-step-tag">S{node.step}</span>
                      )}
                      <span className={`graph-search-status-badge ${statusClass}`}>
                        {statusDesc.label}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
});

GraphSearchOverlay.displayName = "GraphSearchOverlay";
