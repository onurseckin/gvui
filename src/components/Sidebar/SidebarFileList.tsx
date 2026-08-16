import type { FC } from "react";
import React, { useCallback, useMemo, useState } from "react";
import type { GraphDataset } from "../../types/graphData";
import { Button } from "../../ui";

interface FileListItemProps {
  fileId: string;
  isActive: boolean;
  onSelect: (fileId: string) => void;
  nodeCount?: number;
}

const FileListItem = React.memo<FileListItemProps>(function FileListItem({
  fileId,
  isActive,
  onSelect,
  nodeCount,
}) {
  const handleClick = useCallback(() => {
    onSelect(fileId);
  }, [onSelect, fileId]);

  return (
    <li>
      <Button
        variant={isActive ? "primary" : "ghost"}
        className={`sample-btn ${isActive ? "active" : ""}`}
        title={fileId}
        onClick={handleClick}
        aria-current={isActive ? "true" : undefined}
        data-testid={`file-item-${fileId}`}
      >
        <span className="sample-file-icon" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </span>
        <span className="sample-label">{fileId}</span>
        {isActive && typeof nodeCount === "number" && nodeCount > 0 && (
          <span className="file-active-badge" data-testid="active-file-node-count">
            {nodeCount} {nodeCount === 1 ? "node" : "nodes"}
          </span>
        )}
      </Button>
    </li>
  );
});

export interface SidebarFileListProps {
  files: readonly string[];
  currentFile: string;
  onSelectFile: (fileId: string) => void;
  dataset?: GraphDataset | null;
}

export const SidebarFileList: FC<SidebarFileListProps> = React.memo(function SidebarFileList({
  files,
  currentFile,
  onSelectFile,
  dataset,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const cleanCurrentFile = currentFile.replace(/\.json$/, "");

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.toLowerCase().includes(q));
  }, [files, searchQuery]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
  }, []);

  return (
    <div className="sidebar-section sidebar-file-list-section" data-testid="sidebar-files">
      <div className="sidebar-section-header">
        <h4 className="sidebar-section-title">Graph Files</h4>
        <span className="sidebar-section-badge" data-testid="sidebar-files-count">
          {searchQuery.trim() ? filteredFiles.length : files.length}
        </span>
      </div>

      {files.length > 0 && (
        <div className="sidebar-file-search">
          <svg
            className="sidebar-file-search-icon"
            viewBox="0 0 24 24"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="sidebar-file-search-input"
            data-testid="sidebar-file-search-input"
            placeholder="Filter runs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Filter graph files"
          />
          {searchQuery && (
            <button
              type="button"
              className="sidebar-file-search-clear"
              data-testid="sidebar-file-search-clear"
              onClick={handleClearSearch}
              title="Clear search"
              aria-label="Clear file filter"
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      )}

      {files.length === 0 ? (
        <p className="sidebar-empty-state">
          No graph files yet. Use the add-file button next to the sidebar toggle to load one.
        </p>
      ) : filteredFiles.length === 0 ? (
        <p className="sidebar-empty-state" data-testid="sidebar-file-empty-search">
          No matching graph files found.
        </p>
      ) : (
        <ul className="sample-list">
          {filteredFiles.map((fileId) => {
            const isActive = currentFile === fileId || cleanCurrentFile === fileId;
            const nodeCount = isActive && dataset ? dataset.nodes?.length : undefined;
            return (
              <FileListItem
                key={fileId}
                fileId={fileId}
                isActive={isActive}
                onSelect={onSelectFile}
                nodeCount={nodeCount}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
});

SidebarFileList.displayName = "SidebarFileList";
