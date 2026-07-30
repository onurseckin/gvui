import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { CanvasToolbar } from "./components/Controls/CanvasToolbar";
import { SearchHeader } from "./components/Controls/SearchHeader";
import { Sidebar } from "./components/Sidebar";
import { GraphCanvas } from "./engine/GraphCanvas";
import { useGraphStore } from "./state/useGraphStore";
import type { GraphDataset } from "./types/graphData";
import { Button } from "./ui";
import "./index.css";

export const App: FC = () => {
  const [currentFile, setCurrentFile] = useState<string>("ai_agent_trace.json");
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const setDataset = useGraphStore((state) => state.setDataset);
  const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);

  const loadGraphFile = useCallback(
    async (fileId: string, initialNodeId?: string | null) => {
      try {
        const res = await fetch(`/graphs/${fileId}`);
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = (await res.json()) as GraphDataset;
        setDataset(data);
        setCurrentFile(fileId);
        if (initialNodeId) {
          setSelectedNodeId(initialNodeId);
        }
      } catch (err) {
        console.error("Failed to load graph file:", err);
      }
    },
    [setDataset, setSelectedNodeId],
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
    setSelectedNodeId(null);
    void loadGraphFile(fileId);
  };

  const handleCustomUpload = (dataset: GraphDataset) => {
    setSelectedNodeId(null);
    setCurrentFile(dataset.id ? `${dataset.id}.json` : "custom.json");
    setDataset(dataset);
  };

  return (
    <div className="app-container">
      <header className="top-navbar-full">
        <div className="navbar-left">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="sidebar-toggle-btn"
            title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-label={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isSidebarOpen ? "☰" : "✕"}
          </Button>
          <h1 className="brand-title">GVUI</h1>
          <span className="navbar-file-title">📄 {currentFile}</span>
        </div>
        <div className="navbar-right">
          <CanvasToolbar />
          <SearchHeader />
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
    </div>
  );
};

export default App;
