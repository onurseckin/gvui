import type { CSSProperties, FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useState } from "react";
import {
  IconBookmark,
  IconCheck,
  IconEdit,
  IconMapPin,
  IconNote,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { AnnotationColor, CanvasAnnotation } from "./types";
import { AuthorBadge } from "./AuthorBadge";
import { MarkdownRenderer } from "./MarkdownRenderer";

export interface AnnotationPinProps {
  annotation: CanvasAnnotation;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onToggleResolve?: (id: string) => void;
  style?: CSSProperties;
  className?: string;
}

export function getColorTheme(color: AnnotationColor) {
  switch (color) {
    case "blue":
      return {
        accent: "#38bdf8",
        bg: "rgba(14, 165, 233, 0.18)",
        border: "#0284c7",
        glow: "rgba(56, 189, 248, 0.4)",
        text: "#e0f2fe",
      };
    case "green":
      return {
        accent: "#34d399",
        bg: "rgba(16, 185, 129, 0.18)",
        border: "#059669",
        glow: "rgba(52, 211, 153, 0.4)",
        text: "#d1fae5",
      };
    case "rose":
      return {
        accent: "#fb7185",
        bg: "rgba(244, 63, 94, 0.18)",
        border: "#e11d48",
        glow: "rgba(251, 113, 133, 0.4)",
        text: "#ffe4e6",
      };
    case "purple":
      return {
        accent: "#c084fc",
        bg: "rgba(168, 85, 247, 0.18)",
        border: "#9333ea",
        glow: "rgba(192, 132, 252, 0.4)",
        text: "#f3e8ff",
      };
    case "amber":
      return {
        accent: "#fbbf24",
        bg: "rgba(245, 158, 11, 0.18)",
        border: "#d97706",
        glow: "rgba(251, 191, 36, 0.4)",
        text: "#fef3c7",
      };
    case "cyan":
      return {
        accent: "#22d3ee",
        bg: "rgba(6, 182, 212, 0.18)",
        border: "#0891b2",
        glow: "rgba(34, 211, 238, 0.4)",
        text: "#cffafe",
      };
    case "gray":
      return {
        accent: "#94a3b8",
        bg: "rgba(100, 116, 139, 0.18)",
        border: "#64748b",
        glow: "rgba(148, 163, 184, 0.4)",
        text: "#f1f5f9",
      };
    case "yellow":
    default:
      return {
        accent: "#facc15",
        bg: "rgba(234, 179, 8, 0.18)",
        border: "#ca8a04",
        glow: "rgba(250, 204, 21, 0.4)",
        text: "#fef9c3",
      };
  }
}

export const AnnotationPin: FC<AnnotationPinProps> = memo(function AnnotationPin({
  annotation,
  isSelected = false,
  onSelect,
  onEdit,
  onDelete,
  onToggleResolve,
  style,
  className = "",
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [showPopover, setShowPopover] = useState(false);

  const theme = getColorTheme(annotation.color);
  const isBookmark = annotation.type === "bookmark";
  const isPin = annotation.type === "pin";
  const isResolved = Boolean(annotation.isResolved);

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setShowPopover((prev) => !prev);
    onSelect?.(annotation.id);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      e.stopPropagation();
      setShowPopover((prev) => !prev);
      onSelect?.(annotation.id);
    } else if (e.key === "Escape") {
      setShowPopover(false);
    }
  };

  const handleResolveClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onToggleResolve?.(annotation.id);
  };

  const handleEditClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onEdit?.(annotation.id);
  };

  const handleDeleteClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onDelete?.(annotation.id);
  };

  const IconComp = isBookmark ? IconBookmark : isPin ? IconMapPin : IconNote;

  const pinClassName = [
    "canvas-annotation-pin",
    `type-${annotation.type}`,
    `color-${annotation.color}`,
    isSelected && "is-selected",
    isResolved && "is-resolved",
    (isHovered || showPopover) && "is-active",
    annotation.priority === "critical" && "is-critical",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={pinClassName}
      style={
        {
          ...style,
          "--pin-accent": theme.accent,
          "--pin-bg": theme.bg,
          "--pin-border": theme.border,
          "--pin-glow": theme.glow,
        } as CSSProperties
      }
      role="button"
      tabIndex={0}
      aria-label={`${annotation.type.toUpperCase()}: ${annotation.title || annotation.content.slice(0, 30)}`}
      aria-expanded={showPopover}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="pin-marker">
        <IconComp size={16} color={theme.accent} />
        {isResolved && (
          <span className="pin-resolved-indicator" title="Resolved">
            <IconCheck size={10} color="#10b981" />
          </span>
        )}
        {annotation.title && <span className="pin-title-label">{annotation.title}</span>}
      </div>

      {(showPopover || isSelected) && (
        <div
          className="pin-popover"
          role="dialog"
          aria-label={annotation.title || "Annotation details"}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="pin-popover-header">
            <AuthorBadge
              author={annotation.author}
              createdAt={annotation.createdAt}
              updatedAt={annotation.updatedAt}
              size="sm"
            />
            <button
              type="button"
              className="pin-popover-close"
              onClick={() => setShowPopover(false)}
              aria-label="Close popover"
            >
              <IconX size={12} />
            </button>
          </div>

          {annotation.title && <h4 className="pin-popover-title">{annotation.title}</h4>}

          <div className="pin-popover-body">
            <MarkdownRenderer content={annotation.content} allowTaskToggle={false} />
          </div>

          {annotation.tags && annotation.tags.length > 0 && (
            <div className="pin-popover-tags">
              {annotation.tags.map((t, idx) => (
                <span key={idx} className="pin-tag-chip">
                  #{t}
                </span>
              ))}
            </div>
          )}

          <div className="pin-popover-actions">
            {onToggleResolve && (
              <button
                type="button"
                className={`popover-btn resolve-btn ${isResolved ? "is-resolved" : ""}`}
                onClick={handleResolveClick}
                title={isResolved ? "Mark as open" : "Mark as resolved"}
              >
                <IconCheck size={13} />
                <span>{isResolved ? "Resolved" : "Resolve"}</span>
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                className="popover-btn edit-btn"
                onClick={handleEditClick}
                title="Edit annotation"
              >
                <IconEdit size={13} />
                <span>Edit</span>
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="popover-btn delete-btn"
                onClick={handleDeleteClick}
                title="Delete annotation"
              >
                <IconTrash size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

AnnotationPin.displayName = "AnnotationPin";
