import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { CommandPalette } from "./components/CommandPalette";
import { CanvasToolbar } from "./components/Controls/CanvasToolbar";
import { SearchHeader } from "./components/Controls/SearchHeader";
import { DeveloperSettings } from "./components/DeveloperSettings";
import { Sidebar } from "./components/Sidebar";
import { GraphCanvas } from "./engine/GraphCanvas";
import { useGraphStore } from "./state/useGraphStore";
import type { GraphDataset } from "./types/graphData";
import { Button } from "./ui";
import { generateDatasetSignature, loadStoredViewport } from "./utils/fileStorage";
import "./index.css";

export const AppContent: FC = () => {
  const params = useParams({ strict: false }) as { fileId?: string };
  const fileIdFromRoute = params.fileId || "ai_agent_trace";
  const navigate = useNavigate();
  const searchParams = useSearch({ strict: false }) as { node?: string };
  const initialNodeId = searchParams.node ?? null;

  const currentFile = useGraphStore((state) => state.currentFile);
  const centerNodeOnCanvas = useGraphStore((state) => state.centerNodeOnCanvas);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isDeveloperSettingsOpen, setIsDeveloperSettingsOpen] = useState<boolean>(false);

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

  const handleClearStorage = useCallback(() => {
    useGraphStore.setState({ shouldAutoFit: true });
    if (currentFile) {
      void loadGraphFile(currentFile);
    }
  }, [currentFile, loadGraphFile]);

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

  const handleSelectSample = (selectedFileId: string) => {
    void navigate({
      to: "/graphs/$fileId",
      params: { fileId: selectedFileId },
    });
  };

  const handleCustomUpload = (dataset: GraphDataset) => {
    const fileId = dataset.id ? dataset.id.replace(/\.json$/, "") : "custom";
    const signature = generateDatasetSignature(dataset);
    const stored = loadStoredViewport(fileId, signature);

    if (stored) {
      const collapsedSet = new Set(stored.collapsedNodeIds ?? []);
      useGraphStore.setState({
        dataset,
        currentFile: fileId,
        zoomLevel: stored.zoomLevel,
        panOffset: stored.panOffset,
        selectedNodeId: stored.selectedNodeId,
        layoutMode: stored.layoutMode,
        collapsedNodeIds: collapsedSet,
        shouldAutoFit: false,
      });
    } else {
      useGraphStore.setState({
        dataset,
        currentFile: fileId,
        selectedNodeId: null,
        collapsedNodeIds: new Set<string>(),
        shouldAutoFit: true,
      });
    }
  };

  return (
    <div className="app-container">
      <header className="top-navbar-full">
        <div className="navbar-left">
          <Button
            variant="icon"
            size="sm"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="sidebar-toggle-btn"
            title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            ☰
          </Button>
          <span className="navbar-file-title">📄 {currentFile || fileIdFromRoute}</span>
        </div>
        <div className="navbar-right">
          <CanvasToolbar />
          <SearchHeader onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} />
        </div>
      </header>
      <div className="app-body">
        {isSidebarOpen && (
          <Sidebar
            currentFile={currentFile || fileIdFromRoute}
            onSelectSample={handleSelectSample}
            onCustomUpload={handleCustomUpload}
            onOpenDeveloperSettings={() => setIsDeveloperSettingsOpen(true)}
            onOpenGraphTesting={() => {
              void navigate({ to: "/testing" });
            }}
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
        onClose={() => setIsCommandPaletteOpen(false)}
        currentFile={currentFile || fileIdFromRoute}
        onNavigateNode={handleNavigateNode}
      />
      <DeveloperSettings
        isOpen={isDeveloperSettingsOpen}
        onClose={() => setIsDeveloperSettingsOpen(false)}
        onClearStorage={handleClearStorage}
      />
    </div>
  );
};

export default AppContent;
