import type { FC, MouseEvent } from "react";
import { memo, useState } from "react";
import {
  IconBookmark,
  IconCheck,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconMapPin,
  IconNote,
  IconPlus,
  IconSearch,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import type { AnnotationAuthorRole, AnnotationType, CanvasAnnotation } from "./types";
import { useAnnotationStore } from "./useAnnotationStore";

export interface AnnotationFilterBarProps {
  onNewAnnotation?: () => void;
  className?: string;
}

export const AnnotationFilterBar: FC<AnnotationFilterBarProps> = memo(function AnnotationFilterBar({
  onNewAnnotation,
  className = "",
}) {
  const filterState = useAnnotationStore((state) => state.filterState);
  const isLayerVisible = useAnnotationStore((state) => state.isLayerVisible);
  const showPins = useAnnotationStore((state) => state.showPins);
  const showStickies = useAnnotationStore((state) => state.showStickies);
  const showBookmarks = useAnnotationStore((state) => state.showBookmarks);
  const showResolved = useAnnotationStore((state) => state.showResolved);

  const setFilterState = useAnnotationStore((state) => state.setFilterState);
  const resetFilterState = useAnnotationStore((state) => state.resetFilterState);
  const setLayerVisible = useAnnotationStore((state) => state.setLayerVisible);
  const setShowPins = useAnnotationStore((state) => state.setShowPins);
  const setShowStickies = useAnnotationStore((state) => state.setShowStickies);
  const setShowBookmarks = useAnnotationStore((state) => state.setShowBookmarks);
  const setShowResolved = useAnnotationStore((state) => state.setShowResolved);
  const exportAsMarkdown = useAnnotationStore((state) => state.exportAsMarkdown);
  const exportAsJson = useAnnotationStore((state) => state.exportAsJson);
  const importAnnotations = useAnnotationStore((state) => state.importAnnotations);

  const [copiedReport, setCopiedReport] = useState(false);

  const hasActiveFilters =
    Boolean(filterState.searchQuery.trim()) ||
    filterState.authorRole !== "all" ||
    filterState.type !== "all" ||
    filterState.status !== "all" ||
    filterState.category !== "all" ||
    Boolean(filterState.nodeId);

  const handleCopyMarkdown = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const report = exportAsMarkdown();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(report).catch(() => {});
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    }
  };

  const handleExportJson = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const jsonStr = exportAsJson();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gvui-annotations-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string) as CanvasAnnotation[];
        if (Array.isArray(parsed)) {
          importAnnotations(parsed);
        }
      } catch {
        // invalid json
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className={`annotation-filter-bar ${className}`}>
      <div className="filter-bar-left">
        <div className="search-input-wrapper">
          <IconSearch size={14} className="search-icon" />
          <input
            type="text"
            className="annotation-search-input"
            placeholder="Search notes, author, tags, nodes..."
            value={filterState.searchQuery}
            onChange={(e) => setFilterState({ searchQuery: e.target.value })}
          />
          {filterState.searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setFilterState({ searchQuery: "" })}
              aria-label="Clear search"
            >
              <IconX size={12} />
            </button>
          )}
        </div>

        <div className="filter-select-group">
          {/* Author Role Filter */}
          <select
            className="filter-dropdown"
            value={filterState.authorRole}
            onChange={(e) =>
              setFilterState({
                authorRole: e.target.value as "all" | AnnotationAuthorRole,
              })
            }
            aria-label="Filter by author role"
          >
            <option value="all">Role: All</option>
            <option value="human">Human</option>
            <option value="validator">Validator</option>
            <option value="agent">Agent</option>
            <option value="critic">Critic</option>
            <option value="system">System</option>
          </select>

          {/* Type Filter */}
          <select
            className="filter-dropdown"
            value={filterState.type}
            onChange={(e) =>
              setFilterState({
                type: e.target.value as "all" | AnnotationType,
              })
            }
            aria-label="Filter by annotation type"
          >
            <option value="all">Type: All</option>
            <option value="sticky">Sticky Notes</option>
            <option value="pin">Pins</option>
            <option value="bookmark">Bookmarks</option>
          </select>

          {/* Status Filter */}
          <select
            className="filter-dropdown"
            value={filterState.status}
            onChange={(e) =>
              setFilterState({
                status: e.target.value as "all" | "open" | "resolved",
              })
            }
            aria-label="Filter by status"
          >
            <option value="all">Status: All</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>

          {hasActiveFilters && (
            <button
              type="button"
              className="filter-reset-btn"
              onClick={resetFilterState}
              title="Reset all filters"
            >
              <IconX size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      <div className="filter-bar-right">
        {/* Toggles */}
        <div className="visibility-toggles-group">
          <button
            type="button"
            className={`toggle-icon-btn ${showStickies ? "is-active" : ""}`}
            onClick={() => setShowStickies(!showStickies)}
            title={showStickies ? "Hide Sticky Notes" : "Show Sticky Notes"}
            aria-label="Toggle sticky notes"
          >
            <IconNote size={14} />
          </button>
          <button
            type="button"
            className={`toggle-icon-btn ${showPins ? "is-active" : ""}`}
            onClick={() => setShowPins(!showPins)}
            title={showPins ? "Hide Callout Pins" : "Show Callout Pins"}
            aria-label="Toggle callout pins"
          >
            <IconMapPin size={14} />
          </button>
          <button
            type="button"
            className={`toggle-icon-btn ${showBookmarks ? "is-active" : ""}`}
            onClick={() => setShowBookmarks(!showBookmarks)}
            title={showBookmarks ? "Hide Bookmarks" : "Show Bookmarks"}
            aria-label="Toggle review bookmarks"
          >
            <IconBookmark size={14} />
          </button>
          <button
            type="button"
            className={`toggle-icon-btn ${showResolved ? "is-active" : ""}`}
            onClick={() => setShowResolved(!showResolved)}
            title={showResolved ? "Hide Resolved" : "Show Resolved"}
            aria-label="Toggle resolved annotations"
          >
            <IconCheck size={14} />
          </button>
          <button
            type="button"
            className={`toggle-icon-btn layer-toggle ${isLayerVisible ? "is-active" : ""}`}
            onClick={() => setLayerVisible(!isLayerVisible)}
            title={isLayerVisible ? "Hide Annotation Layer" : "Show Annotation Layer"}
            aria-label="Toggle all annotations layer"
          >
            {isLayerVisible ? <IconEye size={14} /> : <IconEyeOff size={14} />}
          </button>
        </div>

        {/* Action buttons */}
        <div className="action-buttons-group">
          <button
            type="button"
            className="action-btn copy-markdown-btn"
            onClick={handleCopyMarkdown}
            title="Copy markdown annotations report"
          >
            {copiedReport ? <IconCheck size={13} color="#10b981" /> : <IconFileText size={13} />}
            <span>{copiedReport ? "Copied" : "Markdown"}</span>
          </button>

          <button
            type="button"
            className="action-btn download-btn"
            onClick={handleExportJson}
            title="Export Annotations JSON"
          >
            <IconDownload size={13} />
            <span>Export</span>
          </button>

          <label className="action-btn upload-btn" title="Import Annotations JSON">
            <IconUpload size={13} />
            <span>Import</span>
            <input
              type="file"
              accept=".json"
              style={{ display: "none" }}
              onChange={handleImportJson}
            />
          </label>

          {onNewAnnotation && (
            <button type="button" className="action-btn primary-new-btn" onClick={onNewAnnotation}>
              <IconPlus size={14} />
              <span>Add Note</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
});

AnnotationFilterBar.displayName = "AnnotationFilterBar";
