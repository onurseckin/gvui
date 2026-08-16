import { IconCheck, IconPolygon, IconRectangle, IconX } from "@tabler/icons-react";
import type { FC } from "react";
import { useCallback, useState } from "react";
import {
  GROUP_THEME_PALETTES,
  type CanvasGroup,
  type CreateGroupInput,
  type GroupColorPalette,
  type GroupShapeMode,
} from "./types";
import { useCanvasGroupingStore } from "./useCanvasGroupingStore";

export interface GroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupToEdit?: CanvasGroup | null;
  initialMemberNodeIds?: string[];
}

const PALETTE_KEYS: GroupColorPalette[] = [
  "blue",
  "emerald",
  "amber",
  "purple",
  "rose",
  "cyan",
  "slate",
  "indigo",
  "teal",
  "orange",
];

export const GroupModal: FC<GroupModalProps> = ({
  isOpen,
  onClose,
  groupToEdit,
  initialMemberNodeIds,
}) => {
  const createGroup = useCanvasGroupingStore((s) => s.createGroup);
  const updateGroup = useCanvasGroupingStore((s) => s.updateGroup);

  const [label, setLabel] = useState<string>(groupToEdit?.label ?? "");
  const [description, setDescription] = useState<string>(groupToEdit?.description ?? "");
  const [color, setColor] = useState<GroupColorPalette>(groupToEdit?.color ?? "blue");
  const [shapeMode, setShapeMode] = useState<GroupShapeMode>(groupToEdit?.shapeMode ?? "box");
  const [padding, setPadding] = useState<number>(groupToEdit?.padding ?? 24);
  const [cornerRadius, setCornerRadius] = useState<number>(groupToEdit?.cornerRadius ?? 12);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const finalLabel = label.trim() || (groupToEdit ? groupToEdit.label : "New Functional Group");

      if (groupToEdit) {
        updateGroup(groupToEdit.id, {
          label: finalLabel,
          description: description.trim() || undefined,
          color,
          shapeMode,
          padding,
          cornerRadius,
        });
      } else {
        const input: CreateGroupInput = {
          label: finalLabel,
          description: description.trim() || undefined,
          color,
          shapeMode,
          padding,
          cornerRadius,
          memberNodeIds: initialMemberNodeIds ?? [],
        };
        createGroup(input);
      }
      onClose();
    },
    [
      label,
      description,
      color,
      shapeMode,
      padding,
      cornerRadius,
      groupToEdit,
      initialMemberNodeIds,
      updateGroup,
      createGroup,
      onClose,
    ],
  );

  if (!isOpen) return null;

  return (
    <div className="group-modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="group-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="group-modal-header">
          <h3 className="group-modal-title">
            {groupToEdit ? "Edit Region Group" : "Create Functional Boundary Group"}
          </h3>
          <button
            type="button"
            className="group-drawer-close-btn"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <IconX size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="group-modal-body">
            <div className="group-form-group">
              <label htmlFor="group-name-input" className="group-form-label">
                Region Name / Title *
              </label>
              <input
                id="group-name-input"
                type="text"
                className="group-form-input"
                placeholder="e.g. Ingestion Pipeline, Evaluator Core"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                autoFocus
              />
            </div>

            <div className="group-form-group">
              <label htmlFor="group-desc-input" className="group-form-label">
                Description (Optional)
              </label>
              <textarea
                id="group-desc-input"
                className="group-form-textarea"
                rows={2}
                placeholder="Functional summary of member nodes in this boundary..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="group-form-group">
              <label className="group-form-label">Theme Color Palette</label>
              <div className="group-palette-selector">
                {PALETTE_KEYS.map((paletteKey) => {
                  const theme = GROUP_THEME_PALETTES[paletteKey];
                  const isSelected = color === paletteKey;
                  return (
                    <button
                      type="button"
                      key={paletteKey}
                      className={`group-palette-option ${isSelected ? "is-active" : ""}`}
                      onClick={() => setColor(paletteKey)}
                    >
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          backgroundColor: theme.accent,
                        }}
                      />
                      <span>{theme.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="group-form-group">
              <label className="group-form-label">Boundary Shape</label>
              <div className="group-shape-options">
                <button
                  type="button"
                  className={`group-shape-option ${shapeMode === "box" ? "is-active" : ""}`}
                  onClick={() => setShapeMode("box")}
                >
                  <IconRectangle size={16} />
                  <span>Bounding Box</span>
                </button>
                <button
                  type="button"
                  className={`group-shape-option ${shapeMode === "hull" ? "is-active" : ""}`}
                  onClick={() => setShapeMode("hull")}
                >
                  <IconPolygon size={16} />
                  <span>2D Convex Hull</span>
                </button>
              </div>
            </div>

            <div className="group-form-group">
              <label htmlFor="group-padding-slider" className="group-form-label">
                Boundary Padding ({padding}px)
              </label>
              <div className="group-slider-row">
                <input
                  id="group-padding-slider"
                  type="range"
                  min={8}
                  max={80}
                  step={4}
                  className="group-slider"
                  value={padding}
                  onChange={(e) => setPadding(Number(e.target.value))}
                />
                <span className="group-slider-val">{padding}px</span>
              </div>
            </div>

            <div className="group-form-group">
              <label htmlFor="group-radius-slider" className="group-form-label">
                Corner Radius ({cornerRadius}px)
              </label>
              <div className="group-slider-row">
                <input
                  id="group-radius-slider"
                  type="range"
                  min={0}
                  max={32}
                  step={2}
                  className="group-slider"
                  value={cornerRadius}
                  onChange={(e) => setCornerRadius(Number(e.target.value))}
                />
                <span className="group-slider-val">{cornerRadius}px</span>
              </div>
            </div>
          </div>

          <div className="group-modal-footer">
            <button type="button" className="group-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="group-btn-primary">
              <IconCheck size={16} />
              <span>{groupToEdit ? "Save Changes" : "Create Group"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
