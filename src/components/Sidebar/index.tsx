import type { FC } from "react";
import type { GraphDataset } from "../../types/graphData";
import { Button, FileUploadButton } from "../../ui";
import "./Sidebar.css";

const SAMPLE_GRAPHS = [
  { id: "ai_agent_trace.json", name: "AI Agent Trace", icon: "🤖" },
  { id: "decision_tree.json", name: "Decision Tree", icon: "🌲" },
  { id: "cyclic_mesh.json", name: "Cyclic Mesh", icon: "🔄" },
];

interface SidebarProps {
  currentFile: string;
  onSelectSample: (fileId: string) => void;
  onCustomUpload: (dataset: GraphDataset) => void;
}

export const Sidebar: FC<SidebarProps> = ({ currentFile, onSelectSample, onCustomUpload }) => {
  return (
    <aside className="sidebar-container">
      <div className="sidebar-header">
        <h2 className="sidebar-title">GVUI</h2>
      </div>

      <div className="sidebar-section">
        <h3 className="sidebar-section-title">Sample Datasets</h3>
        <ul className="sample-list">
          {SAMPLE_GRAPHS.map((sample) => (
            <li key={sample.id}>
              <Button
                variant={currentFile === sample.id ? "primary" : "ghost"}
                className={`sample-btn ${currentFile === sample.id ? "active" : ""}`}
                onClick={() => onSelectSample(sample.id)}
              >
                <span className="sample-icon">{sample.icon}</span>
                <span className="sample-label">{sample.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-section">
        <h3 className="sidebar-section-title">Custom Graph</h3>
        <FileUploadButton onFileUpload={onCustomUpload} style={{ width: "100%" }} />
      </div>
    </aside>
  );
};

export default Sidebar;
