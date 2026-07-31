import type { FC } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { GraphDataset } from "../../types/graphData";
import { Button, FileUploadButton } from "../../ui";
import "./Sidebar.css";

const SAMPLE_GRAPHS = [
  { id: "ai_agent_trace", name: "AI Agent Trace", icon: "🤖" },
  { id: "decision_tree", name: "Decision Tree", icon: "🌲" },
  { id: "cyclic_mesh", name: "Cyclic Mesh", icon: "🔄" },
  { id: "distributed_saga_workflow", name: "Saga Workflow", icon: "⚡" },
  { id: "kubernetes_cluster_topology", name: "K8s Topology", icon: "☸️" },
];

interface SidebarProps {
  currentFile: string;
  onSelectSample: (fileId: string) => void;
  onCustomUpload: (dataset: GraphDataset) => void;
  onOpenDeveloperSettings?: () => void;
  onOpenGraphTesting?: () => void;
}

export const Sidebar: FC<SidebarProps> = ({
  currentFile,
  onSelectSample,
  onCustomUpload,
  onOpenDeveloperSettings,
  onOpenGraphTesting,
}) => {
  const navigate = useNavigate();

  const handleSelectSample = (fileId: string) => {
    onSelectSample(fileId);
    void navigate({
      to: "/graphs/$fileId",
      params: { fileId },
    });
  };

  const handleOpenGraphTesting = () => {
    onOpenGraphTesting?.();
    void navigate({ to: "/testing" });
  };

  return (
    <aside className="sidebar-container">
      <div className="sidebar-content">
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Sample Datasets</h3>
          <ul className="sample-list">
            {SAMPLE_GRAPHS.map((sample) => {
              const isActive =
                currentFile === sample.id || currentFile.replace(/\.json$/, "") === sample.id;
              return (
                <li key={sample.id}>
                  <Button
                    variant={isActive ? "primary" : "ghost"}
                    className={`sample-btn ${isActive ? "active" : ""}`}
                    onClick={() => handleSelectSample(sample.id)}
                  >
                    <span className="sample-icon">{sample.icon}</span>
                    <span className="sample-label">{sample.name}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Custom Graph</h3>
          <FileUploadButton onFileUpload={onCustomUpload} style={{ width: "100%" }} />
        </div>
      </div>

      <div className="sidebar-footer">
        <Button variant="ghost" className="sidebar-settings-btn" onClick={onOpenDeveloperSettings}>
          ⚙️ Developer Settings
        </Button>
        <Button
          variant="ghost"
          className="sidebar-settings-btn"
          onClick={handleOpenGraphTesting}
          style={{ marginTop: "6px" }}
        >
          🧪 Graph Testing
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;
