import type { FC } from "react";
import React, { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { GraphDataset } from "../../types/graphData";
import { Button, FileUploadButton } from "../../ui";
import { SAMPLE_GRAPHS } from "./sampleGraphs";
import type { SampleGraph } from "./sampleGraphs";
import "./Sidebar.css";


interface SampleListItemProps {
  sample: SampleGraph;
  isActive: boolean;
  onSelect: (fileId: string) => void;
}

const SampleListItem = React.memo<SampleListItemProps>(function SampleListItem({
  sample,
  isActive,
  onSelect,
}) {
  const handleClick = useCallback(() => {
    onSelect(sample.id);
  }, [onSelect, sample.id]);

  return (
    <li>
      <Button
        variant={isActive ? "primary" : "ghost"}
        className={`sample-btn ${isActive ? "active" : ""}`}
        onClick={handleClick}
      >
        <span className="sample-icon">{sample.icon}</span>
        <span className="sample-label">{sample.name}</span>
      </Button>
    </li>
  );
});

interface SidebarProps {
  currentFile: string;
  onSelectSample: (fileId: string) => void;
  onCustomUpload: (dataset: GraphDataset) => void;
  onOpenDeveloperSettings?: () => void;
  onOpenGraphTesting?: () => void;
}

export const Sidebar: FC<SidebarProps> = React.memo(function Sidebar({
  currentFile,
  onSelectSample,
  onCustomUpload,
  onOpenDeveloperSettings,
  onOpenGraphTesting,
}) {
  const navigate = useNavigate();

  const handleSelectSample = useCallback(
    (fileId: string) => {
      onSelectSample(fileId);
      void navigate({
        to: "/graphs/$fileId",
        params: { fileId },
      });
    },
    [onSelectSample, navigate],
  );

  const handleOpenGraphTesting = useCallback(() => {
    onOpenGraphTesting?.();
    void navigate({ to: "/testing" });
  }, [onOpenGraphTesting, navigate]);

  const cleanCurrentFile = useMemo(() => currentFile.replace(/\.json$/, ""), [currentFile]);

  return (
    <aside className="sidebar-container">
      <div className="sidebar-content">
        <div className="sidebar-section">
          <h3 className="sidebar-section-title">Sample Datasets</h3>
          <ul className="sample-list">
            {SAMPLE_GRAPHS.map((sample) => {
              const isActive = currentFile === sample.id || cleanCurrentFile === sample.id;
              return (
                <SampleListItem
                  key={sample.id}
                  sample={sample}
                  isActive={isActive}
                  onSelect={handleSelectSample}
                />
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
        <Button
          variant="ghost"
          className="sidebar-settings-btn"
          onClick={() => onOpenDeveloperSettings?.()}
        >
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
});

export default Sidebar;
