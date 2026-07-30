import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { CommandPalette } from "./components/CommandPalette";
import { CanvasToolbar } from "./components/Controls/CanvasToolbar";
import { SearchHeader } from "./components/Controls/SearchHeader";
import { Sidebar } from "./components/Sidebar";
import { GraphCanvas } from "./engine/GraphCanvas";
import { useGraphStore } from "./state/useGraphStore";
import type { GraphDataset } from "./types/graphData";
import { Button } from "./ui";
import { generateDatasetSignature, loadStoredViewport } from "./utils/fileStorage";
import "./index.css";

export const App: FC = () => {
  const currentFile = useGraphStore((state) => state.currentFile);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const centerNodeOnCanvas = useGraphStore((state) => state.centerNodeOnCanvas);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);

  const loadGraphFile = useCallback(async (fileId: string, initialNodeId?: string | null) => {
    try {
      const res = await fetch(`/graphs/${fileId}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = (await res.json()) as GraphDataset;

      const signature = generateDatasetSignature(data);
      const stored = loadStoredViewport(fileId, signature);

      if (stored) {
        useGraphStore.setState({
          dataset: data,
          currentFile: fileId,
          zoomLevel: stored.zoomLevel,
          panOffset: stored.panOffset,
          selectedNodeId: initialNodeId ?? stored.selectedNodeId,
          layoutMode: stored.layoutMode,
          shouldAutoFit: false,
        });
      } else {
        useGraphStore.setState({
          dataset: data,
          currentFile: fileId,
          selectedNodeId: initialNodeId ?? null,
          shouldAutoFit: true,
        });
      }
    } catch (err) {
      console.error("Failed to load graph file:", err);
    }
  }, []);

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
    async (fileId: string, nodeId: string) => {
      if (fileId !== currentFile) {
        await loadGraphFile(fileId, nodeId);
      }
      centerNodeOnCanvas(nodeId);

      const params = new URLSearchParams(window.location.search);
      params.set("graph", fileId);
      params.set("node", nodeId);
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      window.history.replaceState({}, "", newUrl);

      setIsCommandPaletteOpen(false);
    },
    [currentFile, loadGraphFile, centerNodeOnCanvas],
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const graphParam = params.get("graph") || "ai_agent_trace.json";
    const nodeParam = params.get("node");
    void loadGraphFile(graphParam, nodeParam);
  }, [loadGraphFile]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (currentFile) params.set("graph", currentFile);
    if (selectedNodeId) params.set("node", selectedNodeId);

    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", newUrl);
  }, [currentFile, selectedNodeId]);

  const handleSelectSample = (fileId: string) => {
    void loadGraphFile(fileId);
  };

  const handleCustomUpload = (dataset: GraphDataset) => {
    const fileId = dataset.id ? `${dataset.id}.json` : "custom.json";
    const signature = generateDatasetSignature(dataset);
    const stored = loadStoredViewport(fileId, signature);

    if (stored) {
      useGraphStore.setState({
        dataset,
        currentFile: fileId,
        zoomLevel: stored.zoomLevel,
        panOffset: stored.panOffset,
        selectedNodeId: stored.selectedNodeId,
        layoutMode: stored.layoutMode,
        shouldAutoFit: false,
      });
    } else {
      useGraphStore.setState({
        dataset,
        currentFile: fileId,
        selectedNodeId: null,
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
          <span className="navbar-file-title">📄 {currentFile}</span>
        </div>
        <div className="navbar-right">
          <CanvasToolbar />
          <SearchHeader onOpenCommandPalette={() => setIsCommandPaletteOpen(true)} />
        </div>
      </header>
      <div className="app-body">
        {isSidebarOpen && (
          <Sidebar
            currentFile={currentFile}
            onSelectSample={handleSelectSample}
            onCustomUpload={handleCustomUpload}
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
        currentFile={currentFile}
        onNavigateNode={handleNavigateNode}
      />
    </div>
  );
};

export default App;
