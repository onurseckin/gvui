import type { CSSProperties, FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useState } from "react";
import {
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconEdit,
  IconPin,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import type { AnnotationPriority, CanvasAnnotation } from "./types";
import { AuthorBadge } from "./AuthorBadge";
import { getColorTheme } from "./AnnotationPin";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { toggleMarkdownCheckbox } from "./markdownUtils";

export interface StickyNoteCardProps {
  annotation: CanvasAnnotation;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onToggleResolve?: (id: string) => void;
  onToggleCollapse?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onUpdateContent?: (id: string, newContent: string) => void;
  style?: CSSProperties;
  className?: string;
}

function getPriorityBadge(priority?: AnnotationPriority) {
  switch (priority) {
    case "critical":
      return { label: "Critical", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)" };
    case "high":
      return { label: "High", color: "#f97316", bg: "rgba(249, 115, 22, 0.15)" };
    case "low":
      return { label: "Low", color: "#94a3b8", bg: "rgba(148, 163, 184, 0.15)" };
    case "info":
      return { label: "Info", color: "#06b6d4", bg: "rgba(6, 182, 212, 0.15)" };
    case "medium":
    default:
      return { label: "Medium", color: "#eab308", bg: "rgba(234, 179, 8, 0.15)" };
  }
}

export const StickyNoteCard: FC<StickyNoteCardProps> = memo(function StickyNoteCard({
  annotation,
  isSelected = false,
  onSelect,
  onEdit,
  onDelete,
  onToggleResolve,
  onToggleCollapse,
  onTogglePin,
  onUpdateContent,
  style,
  className = "",
}) {
  const [isEditingInline, setIsEditingInline] = useState(false);
  const [editContent, setEditContent] = useState(annotation.content);

  const theme = getColorTheme(annotation.color);
  const priorityInfo = getPriorityBadge(annotation.priority);
  const isCollapsed = Boolean(annotation.isCollapsed);
  const isResolved = Boolean(annotation.isResolved);
  const isPinned = Boolean(annotation.isPinned);

  const handleCardClick = (e: MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    onSelect?.(annotation.id);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === "Enter" || e.key === " ") && !isEditingInline) {
      if (
        (e.target as HTMLElement).tagName !== "BUTTON" &&
        (e.target as HTMLElement).tagName !== "INPUT" &&
        (e.target as HTMLElement).tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        onSelect?.(annotation.id);
      }
    }
  };

  const handleToggleTask = (taskIndex: number) => {
    const updated = toggleMarkdownCheckbox(annotation.content, taskIndex);
    onUpdateContent?.(annotation.id, updated);
  };

  const handleSaveInlineEdit = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onUpdateContent?.(annotation.id, editContent);
    setIsEditingInline(false);
  };

  const handleCancelInlineEdit = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setEditContent(annotation.content);
    setIsEditingInline(false);
  };

  const cardClassName = [
    "canvas-sticky-note-card",
    `color-${annotation.color}`,
    isSelected && "is-selected",
    isCollapsed && "is-collapsed",
    isResolved && "is-resolved",
    isPinned && "is-pinned",
    annotation.priority === "critical" && "is-critical",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cardClassName}
      style={
        {
          ...style,
          "--card-accent": theme.accent,
          "--card-bg": theme.bg,
          "--card-border": theme.border,
          "--card-glow": theme.glow,
        } as CSSProperties
      }
      role="article"
      tabIndex={0}
      aria-label={`Sticky Note: ${annotation.title || annotation.content.slice(0, 25)}`}
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
    >
      <div className="sticky-note-header">
        <div className="sticky-header-left">
          <AuthorBadge
            author={annotation.author}
            createdAt={annotation.createdAt}
            updatedAt={annotation.updatedAt}
            size="sm"
          />
          {annotation.priority && (
            <span
              className="sticky-priority-pill"
              style={{ color: priorityInfo.color, backgroundColor: priorityInfo.bg }}
            >
              {priorityInfo.label}
            </span>
          )}
          {annotation.category && (
            <span className="sticky-category-tag">#{annotation.category}</span>
          )}
        </div>

        <div className="sticky-header-actions">
          {onToggleResolve && (
            <button
              type="button"
              className={`sticky-action-btn resolve-btn ${isResolved ? "is-resolved" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleResolve(annotation.id);
              }}
              title={isResolved ? "Mark as open" : "Mark as resolved"}
              aria-label={isResolved ? "Mark as open" : "Mark as resolved"}
            >
              <IconCheck size={13} />
            </button>
          )}
          {onTogglePin && (
            <button
              type="button"
              className={`sticky-action-btn pin-btn ${isPinned ? "is-pinned" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin(annotation.id);
              }}
              title={isPinned ? "Unpin note" : "Pin note to canvas"}
              aria-label={isPinned ? "Unpin note" : "Pin note to canvas"}
            >
              <IconPin size={13} />
            </button>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              className="sticky-action-btn collapse-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse(annotation.id);
              }}
              title={isCollapsed ? "Expand note" : "Collapse note"}
              aria-label={isCollapsed ? "Expand note" : "Collapse note"}
            >
              {isCollapsed ? <IconChevronDown size={13} /> : <IconChevronUp size={13} />}
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className="sticky-action-btn edit-btn"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(annotation.id);
              }}
              title="Edit note"
              aria-label="Edit note"
            >
              <IconEdit size={13} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="sticky-action-btn delete-btn"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(annotation.id);
              }}
              title="Delete note"
              aria-label="Delete note"
            >
              <IconTrash size={13} />
            </button>
          )}
        </div>
      </div>

      {annotation.title && (
        <h4 className={`sticky-note-title ${isResolved ? "is-resolved-title" : ""}`}>
          {annotation.title}
        </h4>
      )}

      {isCollapsed ? (
        <div className="sticky-collapsed-preview">
          <span className="sticky-excerpt">
            {annotation.content.replace(/[#*`~>-]/g, "").slice(0, 70)}...
          </span>
        </div>
      ) : isEditingInline ? (
        <div className="sticky-inline-editor" onClick={(e) => e.stopPropagation()}>
          <textarea
            className="sticky-inline-textarea"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={4}
            placeholder="Markdown content..."
            autoFocus
          />
          <div className="sticky-inline-actions">
            <button type="button" className="sticky-btn save-btn" onClick={handleSaveInlineEdit}>
              <IconCheck size={12} />
              <span>Save</span>
            </button>
            <button
              type="button"
              className="sticky-btn cancel-btn"
              onClick={handleCancelInlineEdit}
            >
              <IconX size={12} />
              <span>Cancel</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="sticky-note-body">
          <MarkdownRenderer
            content={annotation.content}
            onToggleTask={handleToggleTask}
            allowTaskToggle={Boolean(onUpdateContent)}
          />
          {annotation.tags && annotation.tags.length > 0 && (
            <div className="sticky-tags-list">
              {annotation.tags.map((tag, idx) => (
                <span key={idx} className="sticky-tag-chip">
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

StickyNoteCard.displayName = "StickyNoteCard";
