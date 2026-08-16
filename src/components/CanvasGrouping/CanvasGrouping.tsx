import type { FC } from "react";
import { useCallback, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import "./CanvasGrouping.css";
import { GroupManagerDrawer } from "./GroupManagerDrawer";
import { GroupModal } from "./GroupModal";
import type { CanvasGroup } from "./types";
import { useCanvasGroupingStore } from "./useCanvasGroupingStore";

export const CanvasGrouping: FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [groupToEdit, setGroupToEdit] = useState<CanvasGroup | null>(null);

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const activeEditingGroupId = useCanvasGroupingStore((s) => s.activeEditingGroupId);
  const setActiveEditingGroupId = useCanvasGroupingStore((s) => s.setActiveEditingGroupId);
  const groups = useCanvasGroupingStore((s) => s.groups);

  const handleOpenCreateModal = useCallback(() => {
    setGroupToEdit(null);
    setIsModalOpen(true);
  }, []);

  const handleOpenEditModal = useCallback((group: CanvasGroup) => {
    setGroupToEdit(group);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setGroupToEdit(null);
    setActiveEditingGroupId(null);
  }, [setActiveEditingGroupId]);

  // Synchronize when store sets activeEditingGroupId
  if (activeEditingGroupId && !isModalOpen) {
    const target = groups.find((g) => g.id === activeEditingGroupId);
    if (target) {
      setGroupToEdit(target);
      setIsModalOpen(true);
    }
  }

  const initialMemberNodeIds = selectedNodeId ? [selectedNodeId] : [];

  return (
    <>
      <GroupManagerDrawer onCreateGroup={handleOpenCreateModal} onEditGroup={handleOpenEditModal} />
      <GroupModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        groupToEdit={groupToEdit}
        initialMemberNodeIds={groupToEdit ? undefined : initialMemberNodeIds}
      />
    </>
  );
};

export default CanvasGrouping;
