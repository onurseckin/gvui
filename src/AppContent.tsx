import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { CommandPalette } from "./components/CommandPalette";
import { CanvasToolbar } from "./components/Controls/CanvasToolbar";
import { SearchHeader } from "./components/Controls/SearchHeader";
import { UploadGraphButton } from "./components/Controls/UploadGraphButton";
import { Sidebar } from "./components/Sidebar";
import { GraphCanvas } from "./engine/GraphCanvas";
import { useGraphFilesStore } from "./state/useGraphFilesStore";
import { useCurrentFile, useGraphStore } from "./state/useGraphStore";
import type { GraphDataset } from "./types/graphData";
import { Button } from "./ui";
import { generateDatasetSignature, loadStoredViewport } from "./utils/fileStorage";
import "./index.css";

export const AppContent: FC = () => {
  const params = useParams({ strict: false }) as { fileId?: string };
  const fileIdFromRoute = params.fileId || "welcome";
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as { node?: string };
  const initialNodeId = searchParams.node ?? null;

  const currentFile = useCurrentFile();
  const centerNodeOnCanvas = useGraphStore((state) => state.centerNodeOnCanvas);
  const fetchInitialFiles = useGraphFilesStore((state) => state.fetchInitial);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadGraphFile = useCallback(async (fileId: string, nodeId?: string | null) => {
    try {
      const filename = fileId.endsWith(".json") ? fileId : `${fileId}.json`;
      const res = await fetch(`/data/graphs/${filename}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = (await res.json()) as GraphDataset;

      const signature = generateDatasetSignature(data);
      const stored = loadStoredViewport(fileId, signature);

      if (stored) {
        const collapsedSet = new Set(stored.collapsedNodeIds ?? []);
        useGraphStore.setState({
          dataset: data,
          currentFile: fileId,
          zoomLevel: stored.zoomLevel,
          panOffset: stored.panOffset,
          selectedNodeId: nodeId ?? stored.selectedNodeId,
          layoutMode: stored.layoutMode,
          collapsedNodeIds: collapsedSet,
          shouldAutoFit: false,
        });
      } else {
        useGraphStore.setState({
          dataset: data,
          currentFile: fileId,
          selectedNodeId: nodeId ?? null,
          collapsedNodeIds: new Set<string>(),
          shouldAutoFit: true,
        });
      }
    } catch (err) {
      console.error("Failed to load graph file:", err);
    }
  }, []);

  useEffect(() => {
    void fetchInitialFiles();
  }, [fetchInitialFiles]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleNavigateNode = useCallback(
    async (targetFileId: string, nodeId: string) => {
      if (targetFileId !== currentFile) {
        await loadGraphFile(targetFileId, nodeId);
        void navigate({
          to: "/graphs/$fileId",
          params: { fileId: targetFileId },
          search: { node: nodeId },
        });
      } else {
        centerNodeOnCanvas(nodeId);
        void navigate({
          to: "/graphs/$fileId",
          params: { fileId: targetFileId },
          search: { node: nodeId },
          replace: true,
        });
      }
      setIsCommandPaletteOpen(false);
    },
    [currentFile, loadGraphFile, centerNodeOnCanvas, navigate],
  );

  useEffect(() => {
    void loadGraphFile(fileIdFromRoute, initialNodeId);
  }, [fileIdFromRoute, initialNodeId, loadGraphFile]);

  const handleSelectSample = useCallback(
    (selectedFileId: string) => {
      void navigate({
        to: "/graphs/$fileId",
        params: { fileId: selectedFileId },
      });
    },
    [navigate],
  );

  const handleOpenSettings = useCallback(() => {
    void navigate({ to: "/testing" });
  }, [navigate]);

  const handleGraphFileUploaded = useCallback(
    (fileId: string) => {
      void navigate({ to: "/graphs/$fileId", params: { fileId } });
    },
    [navigate],
  );

  const handleGraphFileUploadError = useCallback((message: string) => {
    setUploadError(message);
    setTimeout(() => setUploadError(null), 5000);
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(true);
  }, []);

  const handleCloseCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div className="app-container">
      <header className="top-navbar-full">
        <div className="navbar-left">
          <Button
            variant="icon"
            size="sm"
            onClick={handleToggleSidebar}
            className="sidebar-toggle-btn"
            title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            ☰
          </Button>
          <UploadGraphButton
            onUploaded={handleGraphFileUploaded}
            onError={handleGraphFileUploadError}
          />
          <span className="navbar-file-title">📄 {currentFile || fileIdFromRoute}</span>
          {uploadError && <span className="navbar-upload-error">{uploadError}</span>}
        </div>
        <div className="navbar-right">
          <CanvasToolbar />
          <SearchHeader onOpenCommandPalette={handleOpenCommandPalette} />
        </div>
      </header>
      <div className="app-body">
        {isSidebarOpen && (
          <Sidebar
            currentFile={currentFile || fileIdFromRoute}
            onSelectSample={handleSelectSample}
            onOpenSettings={handleOpenSettings}
          />
        )}
        <main className="app-main">
          <div className="canvas-wrapper">
            <GraphCanvas />
          </div>
        </main>
      </div>
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={handleCloseCommandPalette}
        currentFile={currentFile || fileIdFromRoute}
        onNavigateNode={handleNavigateNode}
      />
    </div>
  );
};

export default AppContent;
