import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { CanvasToolbar } from "./components/Controls/CanvasToolbar";
import { SearchHeader } from "./components/Controls/SearchHeader";
import { Sidebar } from "./components/Sidebar";
import { GraphCanvas } from "./engine/GraphCanvas";
import { useGraphStore } from "./state/useGraphStore";
import type { GraphDataset } from "./types/graphData";
import "./index.css";

export const App: FC = () => {
  const [currentFile, setCurrentFile] = useState<string>("ai_agent_trace.json");
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
      <Sidebar
        currentFile={currentFile}
        onSelectSample={handleSelectSample}
        onCustomUpload={handleCustomUpload}
      />
      <main className="app-main">
        <header className="top-controls-bar">
          <SearchHeader />
        </header>
        <div className="canvas-wrapper">
          <GraphCanvas />
          <CanvasToolbar />
        </div>
      </main>
    </div>
  );
};

export default App;
