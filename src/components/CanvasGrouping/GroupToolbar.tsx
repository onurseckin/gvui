import { IconBox, IconEye, IconEyeOff, IconPlus } from "@tabler/icons-react";
import type { FC } from "react";
import { useCallback } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { useCanvasGroupingStore } from "./useCanvasGroupingStore";

export interface GroupToolbarProps {
  onOpenCreateModal?: () => void;
}

export const GroupToolbar: FC<GroupToolbarProps> = ({ onOpenCreateModal }) => {
  const groups = useCanvasGroupingStore((s) => s.groups);
  const isLayerVisible = useCanvasGroupingStore((s) => s.isGroupingLayerVisible);
  const isDrawerOpen = useCanvasGroupingStore((s) => s.isDrawerOpen);
  const setIsLayerVisible = useCanvasGroupingStore((s) => s.setIsGroupingLayerVisible);
  const setIsDrawerOpen = useCanvasGroupingStore((s) => s.setIsDrawerOpen);
  const createGroupFromSelectedNodes = useCanvasGroupingStore(
    (s) => s.createGroupFromSelectedNodes,
  );

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);

  const handleToggleLayer = useCallback(() => {
    setIsLayerVisible(!isLayerVisible);
  }, [isLayerVisible, setIsLayerVisible]);

  const handleToggleDrawer = useCallback(() => {
    setIsDrawerOpen(!isDrawerOpen);
  }, [isDrawerOpen, setIsDrawerOpen]);

  const handleCreateFromSelected = useCallback(() => {
    if (selectedNodeId) {
      createGroupFromSelectedNodes([selectedNodeId]);
    } else if (onOpenCreateModal) {
      onOpenCreateModal();
    }
  }, [selectedNodeId, createGroupFromSelectedNodes, onOpenCreateModal]);

  return (
    <div className="group-toolbar-container">
      <button
        type="button"
        className={`group-toolbar-btn ${isDrawerOpen ? "is-active" : ""}`}
        onClick={handleToggleDrawer}
        title="Open Canvas Group Manager"
      >
        <IconBox size={16} />
        <span>Groups</span>
        {groups.length > 0 && <span className="group-toolbar-count-badge">{groups.length}</span>}
      </button>

      {selectedNodeId && (
        <button
          type="button"
          className="group-toolbar-btn"
          onClick={handleCreateFromSelected}
          title={`Create group around selected node (${selectedNodeId})`}
        >
          <IconPlus size={15} />
          <span>Group Node</span>
        </button>
      )}

      <button
        type="button"
        className="group-toolbar-btn"
        onClick={handleToggleLayer}
        title={isLayerVisible ? "Hide Group Boundaries" : "Show Group Boundaries"}
      >
        {isLayerVisible ? <IconEye size={15} /> : <IconEyeOff size={15} />}
      </button>
    </div>
  );
};
