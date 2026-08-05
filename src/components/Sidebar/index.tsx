import type { FC } from "react";
import React, { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useGraphFilesStore } from "../../state/useGraphFilesStore";
import { Button } from "../../ui";
import "./Sidebar.css";

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
      >
        <span className="sample-label">{fileId}</span>
      </Button>
    </li>
  );
});

interface SidebarProps {
  currentFile: string;
  onSelectSample: (fileId: string) => void;
  onOpenSettings?: () => void;
}

export const Sidebar: FC<SidebarProps> = React.memo(function Sidebar({
  currentFile,
  onSelectSample,
  onOpenSettings,
}) {
  const navigate = useNavigate();
  const files = useGraphFilesStore((state) => state.files);
  const isRefreshing = useGraphFilesStore((state) => state.isRefreshing);
  const refreshError = useGraphFilesStore((state) => state.error);
  const refreshFiles = useGraphFilesStore((state) => state.refresh);

  const handleSelectFile = useCallback(
    (fileId: string) => {
      onSelectSample(fileId);
      void navigate({
        to: "/graphs/$fileId",
        params: { fileId },
      });
    },
    [onSelectSample, navigate],
  );

  const handleOpenSettings = useCallback(() => {
    onOpenSettings?.();
    void navigate({ to: "/testing" });
  }, [onOpenSettings, navigate]);

  const handleRefresh = useCallback(() => {
    void refreshFiles();
  }, [refreshFiles]);

  const cleanCurrentFile = useMemo(() => currentFile.replace(/\.json$/, ""), [currentFile]);

  return (
    <aside className="sidebar-container">
      <div className="sidebar-content">
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
                  onSelect={handleSelectFile}
                />
              );
            })}
          </ul>
        )}
      </div>

      <div className="sidebar-footer">
        <Button
          variant="icon"
          size="sm"
          className="sidebar-footer-icon-btn"
          onClick={handleOpenSettings}
          title="Developer Settings & Graph Testing"
          aria-label="Developer Settings & Graph Testing"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </Button>

        <Button
          variant="icon"
          size="sm"
          className="sidebar-footer-icon-btn"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="Refresh graph file list"
          aria-label="Refresh graph file list"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isRefreshing ? "sidebar-refresh-icon-spinning" : ""}
          >
            <path d="M21.5 2v6h-6M2.5 22v-6h6" />
            <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M2.5 16l1.2 1.2a10 10 0 0 0 18.8-4.2" />
          </svg>
        </Button>
      </div>
      {refreshError && <p className="sidebar-refresh-error">{refreshError}</p>}
    </aside>
  );
});

export default Sidebar;
