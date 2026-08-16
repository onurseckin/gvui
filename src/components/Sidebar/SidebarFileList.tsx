import type { FC } from "react";
import React, { useCallback } from "react";
import { Button } from "../../ui";

interface FileListItemProps {
  fileId: string;
  isActive: boolean;
  onSelect: (fileId: string) => void;
}

const FileListItem = React.memo<FileListItemProps>(function FileListItem({
  fileId,
  isActive,
  onSelect,
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
        <span className="sample-label">{fileId}</span>
      </Button>
    </li>
  );
});

export interface SidebarFileListProps {
  files: readonly string[];
  currentFile: string;
  onSelectFile: (fileId: string) => void;
}

export const SidebarFileList: FC<SidebarFileListProps> = React.memo(function SidebarFileList({
  files,
  currentFile,
  onSelectFile,
}) {
  const cleanCurrentFile = currentFile.replace(/\.json$/, "");

  return (
    <div className="sidebar-section" data-testid="sidebar-files">
      <div className="sidebar-section-header">
        <h4 className="sidebar-section-title">Graph Files</h4>
        <span className="sidebar-section-badge" data-testid="sidebar-files-count">
          {files.length}
        </span>
      </div>
      {files.length === 0 ? (
        <p className="sidebar-empty-state">
          No graph files yet. Use the add-file button next to the sidebar toggle to load one.
        </p>
      ) : (
        <ul className="sample-list">
          {files.map((fileId) => {
            const isActive = currentFile === fileId || cleanCurrentFile === fileId;
            return (
              <FileListItem
                key={fileId}
                fileId={fileId}
                isActive={isActive}
                onSelect={onSelectFile}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
});

SidebarFileList.displayName = "SidebarFileList";
