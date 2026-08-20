import type { FC } from "react";
import React, { useCallback, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useGraphFilesStore } from "../../state/useGraphFilesStore";
import { useGraphStore } from "../../state/useGraphStore";
import type { FilterCategory } from "../../state/graphFilters";
import { Button } from "../../ui";
import { describeDatasetFacets } from "./datasetFacets";
import { SidebarFileList } from "./SidebarFileList";
import { SidebarFilterControls } from "./SidebarFilterControls";
import { SidebarModelBreakdown } from "./SidebarModelBreakdown";
import { SidebarNodeProperties } from "./SidebarNodeProperties";
import { SidebarNodeStatus } from "./SidebarNodeStatus";
import { SidebarReviewRounds } from "./SidebarReviewRounds";
import { SidebarRoleBreakdown } from "./SidebarRoleBreakdown";
import { SidebarSectionBreakdown } from "./SidebarSectionBreakdown";
import { SidebarTelemetry } from "./SidebarTelemetry";
import { SidebarVocabulary } from "./SidebarVocabulary";
import { TokenFootprintBreakdown } from "./TokenFootprintBreakdown";
import "./Sidebar.css";

export { describeDatasetFacets } from "./datasetFacets";
export type { DatasetFacets } from "./datasetFacets";
export { EvidenceChip } from "./EvidenceChip";
export { SidebarAccordion } from "./SidebarAccordion";
export { SidebarFileList } from "./SidebarFileList";
export { SidebarFilterControls } from "./SidebarFilterControls";
export { SidebarModelBreakdown } from "./SidebarModelBreakdown";
export { SidebarNodeProperties } from "./SidebarNodeProperties";
export { SidebarNodeStatus } from "./SidebarNodeStatus";
export { SidebarReviewRounds } from "./SidebarReviewRounds";
export { SidebarRoleBreakdown } from "./SidebarRoleBreakdown";
export { SidebarSectionBreakdown } from "./SidebarSectionBreakdown";
export { SidebarTelemetry } from "./SidebarTelemetry";
export { SidebarVocabulary } from "./SidebarVocabulary";
export { TokenFootprintBreakdown } from "./TokenFootprintBreakdown";

export interface SidebarProps {
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
  const dataset = useGraphStore((state) => state.dataset);
  const activeFilter = useGraphStore((state) => state.activeFilter);
  const setActiveFilter = useGraphStore((state) => state.setActiveFilter);

  // Each purpose-built breakdown is rendered only when this dataset has something behind it, so a
  // graph that uses none of the orchestration vocabulary reads as itself instead of as a run with
  // everything missing.
  const facets = useMemo(() => describeDatasetFacets(dataset), [dataset]);

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

  const handleFilterChange = useCallback(
    (filter: FilterCategory) => {
      setActiveFilter(filter);
    },
    [setActiveFilter],
  );

  return (
    <aside className="sidebar-container" data-testid="sidebar">
      <div className="sidebar-content">
        <SidebarFileList
          files={files}
          currentFile={currentFile}
          onSelectFile={handleSelectFile}
          dataset={dataset}
        />

        <SidebarTelemetry dataset={dataset} />

        <SidebarVocabulary dataset={dataset} />

        {facets.hasRoles ? <SidebarRoleBreakdown dataset={dataset} /> : null}

        {facets.hasRegions ? <SidebarSectionBreakdown dataset={dataset} /> : null}

        {facets.hasReviewActivity ? <SidebarReviewRounds dataset={dataset} /> : null}

        <SidebarNodeStatus dataset={dataset} />

        {facets.hasTokens ? <TokenFootprintBreakdown dataset={dataset} /> : null}

        {facets.hasModels ? <SidebarModelBreakdown dataset={dataset} /> : null}

        {facets.hasGenericFields ? <SidebarNodeProperties dataset={dataset} /> : null}

        <SidebarFilterControls
          dataset={dataset}
          activeFilter={activeFilter}
          onFilterChange={handleFilterChange}
        />
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
