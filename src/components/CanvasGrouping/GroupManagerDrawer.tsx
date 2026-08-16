import {
  IconBox,
  IconChevronDown,
  IconChevronUp,
  IconDownload,
  IconEdit,
  IconLock,
  IconLockOpen,
  IconPlus,
  IconTrash,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import type { FC } from "react";
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { GROUP_THEME_PALETTES, type CanvasGroup, type GroupColorPalette } from "./types";
import { useCanvasGroupingStore, useFilteredGroups } from "./useCanvasGroupingStore";

export interface GroupManagerDrawerProps {
  onEditGroup?: (group: CanvasGroup) => void;
  onCreateGroup?: () => void;
}

const PALETTE_OPTIONS: Array<{ key: "all" | GroupColorPalette; label: string; color: string }> = [
  { key: "all", label: "All", color: "#ffffff" },
  { key: "blue", label: "Blue", color: GROUP_THEME_PALETTES.blue.accent },
  { key: "emerald", label: "Emerald", color: GROUP_THEME_PALETTES.emerald.accent },
  { key: "amber", label: "Amber", color: GROUP_THEME_PALETTES.amber.accent },
  { key: "purple", label: "Purple", color: GROUP_THEME_PALETTES.purple.accent },
  { key: "rose", label: "Rose", color: GROUP_THEME_PALETTES.rose.accent },
  { key: "cyan", label: "Cyan", color: GROUP_THEME_PALETTES.cyan.accent },
  { key: "slate", label: "Slate", color: GROUP_THEME_PALETTES.slate.accent },
];

export const GroupManagerDrawer: FC<GroupManagerDrawerProps> = ({ onEditGroup, onCreateGroup }) => {
  const isDrawerOpen = useCanvasGroupingStore((s) => s.isDrawerOpen);
  const setIsDrawerOpen = useCanvasGroupingStore((s) => s.setIsDrawerOpen);
  const filterState = useCanvasGroupingStore((s) => s.filterState);
  const setFilterState = useCanvasGroupingStore((s) => s.setFilterState);
  const selectedGroupId = useCanvasGroupingStore((s) => s.selectedGroupId);
  const setSelectedGroupId = useCanvasGroupingStore((s) => s.setSelectedGroupId);
  const toggleCollapse = useCanvasGroupingStore((s) => s.toggleGroupCollapse);
  const toggleLock = useCanvasGroupingStore((s) => s.toggleGroupLock);
  const deleteGroup = useCanvasGroupingStore((s) => s.deleteGroup);
  const removeNodesFromGroup = useCanvasGroupingStore((s) => s.removeNodesFromGroup);
  const addNodesToGroup = useCanvasGroupingStore((s) => s.addNodesToGroup);
  const exportGroupsJson = useCanvasGroupingStore((s) => s.exportGroupsJson);
  const importGroupsJson = useCanvasGroupingStore((s) => s.importGroupsJson);
  const clearAllGroups = useCanvasGroupingStore((s) => s.clearAllGroups);

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useGraphStore((s) => s.setSelectedNodeId);

  const filteredGroups = useFilteredGroups();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputId = useId();
  const [importError, setImportError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setIsDrawerOpen(false);
  }, [setIsDrawerOpen]);

  const handleExport = useCallback(() => {
    const json = exportGroupsJson();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gvui-canvas-groups-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportGroupsJson]);

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        const content = evt.target?.result;
        if (typeof content === "string") {
          const success = importGroupsJson(content);
          if (success) {
            setImportError(null);
          } else {
            setImportError("Invalid groups JSON file format.");
          }
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [importGroupsJson],
  );

  const renderedGroups = useMemo(() => {
    if (filteredGroups.length === 0) {
      return (
        <div
          style={{ textAlign: "center", padding: "32px 16px", color: "#71717a", fontSize: "13px" }}
        >
          <IconBox size={32} style={{ margin: "0 auto 8px auto", opacity: 0.4 }} />
          <p>No canvas groups found.</p>
          <p style={{ fontSize: "11px", marginTop: "4px" }}>
            Select nodes and click &ldquo;Create Group&rdquo; to group functional zones.
          </p>
        </div>
      );
    }

    return filteredGroups.map((group) => {
      const theme = GROUP_THEME_PALETTES[group.color] ?? GROUP_THEME_PALETTES.blue;
      const isSelected = selectedGroupId === group.id;
      const isSelectedNodeInGroup = selectedNodeId
        ? group.memberNodeIds.includes(selectedNodeId)
        : false;

      return (
        <div
          key={group.id}
          className={`group-card ${isSelected ? "is-selected" : ""}`}
          onClick={() => setSelectedGroupId(group.id)}
        >
          <div className="group-card-top">
            <div className="group-card-title-row">
              <div className="group-header-color-dot" style={{ backgroundColor: theme.accent }} />
              <span className="group-card-title">{group.label}</span>
              <span
                className="group-header-badge"
                style={{ backgroundColor: theme.badgeBg, color: theme.badgeText }}
              >
                {group.memberNodeIds.length} {group.memberNodeIds.length === 1 ? "node" : "nodes"}
              </span>
            </div>

            <div className="group-card-actions">
              <button
                type="button"
                className={`group-card-btn ${group.isLocked ? "is-active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLock(group.id);
                }}
                title={group.isLocked ? "Unlock Group Position" : "Lock Group Position"}
                aria-label={group.isLocked ? "Unlock Group" : "Lock Group"}
              >
                {group.isLocked ? <IconLock size={15} /> : <IconLockOpen size={15} />}
              </button>

              <button
                type="button"
                className="group-card-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapse(group.id);
                }}
                title={group.isCollapsed ? "Expand Group" : "Collapse Group"}
                aria-label={group.isCollapsed ? "Expand Group" : "Collapse Group"}
              >
                {group.isCollapsed ? <IconChevronDown size={15} /> : <IconChevronUp size={15} />}
              </button>

              {onEditGroup && (
                <button
                  type="button"
                  className="group-card-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditGroup(group);
                  }}
                  title="Edit Group Settings"
                  aria-label="Edit Group"
                >
                  <IconEdit size={15} />
                </button>
              )}

              <button
                type="button"
                className="group-card-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteGroup(group.id);
                }}
                title="Delete Group"
                aria-label="Delete Group"
              >
                <IconTrash size={15} />
              </button>
            </div>
          </div>

          {group.description && <p className="group-card-description">{group.description}</p>}

          <div className="group-card-members-section">
            <div className="group-card-members-header">
              Member Nodes ({group.memberNodeIds.length})
            </div>
            <div className="group-card-member-chips">
              {group.memberNodeIds.map((nodeId) => (
                <span
                  key={nodeId}
                  className="group-member-chip"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedNodeId(nodeId);
                  }}
                  style={{ cursor: "pointer" }}
                >
                  <span>{nodeId}</span>
                  <button
                    type="button"
                    className="group-member-remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeNodesFromGroup(group.id, [nodeId]);
                    }}
                    title={`Remove ${nodeId} from group`}
                    aria-label={`Remove ${nodeId}`}
                  >
                    <IconX size={12} />
                  </button>
                </span>
              ))}

              {selectedNodeId && !isSelectedNodeInGroup && (
                <button
                  type="button"
                  className="group-member-chip"
                  style={{
                    backgroundColor: "rgba(99, 102, 241, 0.2)",
                    color: "#a5b4fc",
                    border: "1px dashed #6366f1",
                    cursor: "pointer",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    addNodesToGroup(group.id, [selectedNodeId]);
                  }}
                >
                  <IconPlus size={12} />
                  <span>Add {selectedNodeId}</span>
                </button>
              )}
            </div>
          </div>

          <div className="group-card-footer">
            <span>Shape: {group.shapeMode === "hull" ? "Convex Hull" : "Box"}</span>
            <span>Padding: {group.padding ?? 24}px</span>
          </div>
        </div>
      );
    });
  }, [
    filteredGroups,
    selectedGroupId,
    selectedNodeId,
    setSelectedGroupId,
    setSelectedNodeId,
    toggleLock,
    toggleCollapse,
    onEditGroup,
    deleteGroup,
    removeNodesFromGroup,
    addNodesToGroup,
  ]);

  if (!isDrawerOpen) return null;

  return (
    <div className="group-manager-drawer-backdrop" onClick={handleClose}>
      <aside
        className="group-manager-drawer"
        aria-label="Canvas Groups Manager"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="group-drawer-header">
          <div className="group-drawer-title-area">
            <IconBox size={20} color="#818cf8" />
            <h2 className="group-drawer-title">Canvas Groups</h2>
          </div>
          <button
            type="button"
            className="group-drawer-close-btn"
            onClick={handleClose}
            aria-label="Close group drawer"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="group-drawer-toolbar">
          <input
            type="text"
            className="group-search-input"
            placeholder="Search groups or node IDs..."
            value={filterState.searchQuery}
            onChange={(e) => setFilterState({ searchQuery: e.target.value })}
          />

          <div className="group-filter-palette-pills">
            {PALETTE_OPTIONS.map((opt) => {
              const isActive = filterState.color === opt.key;
              return (
                <button
                  type="button"
                  key={opt.key}
                  className={`group-color-pill ${isActive ? "is-active" : ""}`}
                  style={{
                    backgroundColor: opt.key === "all" ? "#3f3f46" : opt.color,
                  }}
                  onClick={() => setFilterState({ color: opt.key })}
                  title={`Filter by ${opt.label}`}
                  aria-label={`Filter by ${opt.label}`}
                />
              );
            })}
          </div>

          {importError && <div style={{ color: "#ef4444", fontSize: "12px" }}>{importError}</div>}
        </div>

        <div className="group-drawer-list">{renderedGroups}</div>

        <div className="group-drawer-footer">
          <div style={{ display: "flex", gap: "6px" }}>
            <button
              type="button"
              className="group-btn-secondary"
              onClick={handleExport}
              title="Export Groups as JSON"
            >
              <IconDownload size={15} />
              <span>Export</span>
            </button>

            <button
              type="button"
              className="group-btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              title="Import Groups JSON"
            >
              <IconUpload size={15} />
              <span>Import</span>
            </button>

            <input
              id={importInputId}
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              style={{ display: "none" }}
              aria-label="Upload groups JSON file"
              onChange={handleImportFile}
            />

            {filteredGroups.length > 0 && (
              <button
                type="button"
                className="group-btn-secondary"
                onClick={() => {
                  if (confirm("Are you sure you want to delete all canvas groups?")) {
                    clearAllGroups();
                  }
                }}
                title="Clear all canvas groups"
              >
                <IconTrash size={15} />
              </button>
            )}
          </div>

          {onCreateGroup && (
            <button type="button" className="group-btn-primary" onClick={onCreateGroup}>
              <IconPlus size={16} />
              <span>New Group</span>
            </button>
          )}
        </div>
      </aside>
    </div>
  );
};
