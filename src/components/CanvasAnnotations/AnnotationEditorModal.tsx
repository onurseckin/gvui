import type { FC, KeyboardEvent, MouseEvent } from "react";
import { memo, useEffect, useState } from "react";
import {
  IconBold,
  IconChecklist,
  IconCode,
  IconDeviceFloppy,
  IconEye,
  IconItalic,
  IconList,
  IconQuote,
  IconX,
} from "@tabler/icons-react";
import type {
  AnnotationAuthorRole,
  AnnotationCategory,
  AnnotationColor,
  AnnotationPriority,
  AnnotationType,
  CanvasAnnotation,
  CreateAnnotationInput,
} from "./types";
import { MarkdownRenderer } from "./MarkdownRenderer";

export interface AnnotationEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateAnnotationInput) => void;
  initialData?: Partial<CanvasAnnotation>;
  nodeIds?: string[];
  defaultNodeId?: string;
  defaultCoordinates?: { x: number; y: number };
}

const AVAILABLE_COLORS: AnnotationColor[] = [
  "yellow",
  "blue",
  "green",
  "rose",
  "purple",
  "amber",
  "cyan",
  "gray",
];

const AVAILABLE_ROLES: AnnotationAuthorRole[] = ["human", "validator", "agent", "critic", "system"];

const AVAILABLE_CATEGORIES: AnnotationCategory[] = [
  "note",
  "review",
  "bug",
  "question",
  "todo",
  "info",
  "performance",
  "security",
  "bookmark",
];

const AVAILABLE_PRIORITIES: AnnotationPriority[] = ["critical", "high", "medium", "low", "info"];

export const AnnotationEditorModal: FC<AnnotationEditorModalProps> = memo(
  function AnnotationEditorModal({
    isOpen,
    onClose,
    onSave,
    initialData,
    nodeIds = [],
    defaultNodeId,
    defaultCoordinates,
  }) {
    const [title, setTitle] = useState(initialData?.title ?? "");
    const [content, setContent] = useState(initialData?.content ?? "");
    const [type, setType] = useState<AnnotationType>(initialData?.type ?? "sticky");
    const [color, setColor] = useState<AnnotationColor>(initialData?.color ?? "yellow");
    const [category, setCategory] = useState<AnnotationCategory>(initialData?.category ?? "note");
    const [priority, setPriority] = useState<AnnotationPriority>(initialData?.priority ?? "medium");
    const [authorName, setAuthorName] = useState(initialData?.author?.name ?? "User");
    const [authorRole, setAuthorRole] = useState<AnnotationAuthorRole>(
      initialData?.author?.role ?? "human",
    );
    const [nodeId, setNodeId] = useState<string>(initialData?.nodeId ?? defaultNodeId ?? "");
    const [tagsInput, setTagsInput] = useState<string>(initialData?.tags?.join(", ") ?? "");
    const [isPreviewActive, setIsPreviewActive] = useState<boolean>(false);

    useEffect(() => {
      if (isOpen) {
        setTitle(initialData?.title ?? "");
        setContent(initialData?.content ?? "");
        setType(initialData?.type ?? "sticky");
        setColor(
          initialData?.color ??
            (initialData?.type === "bookmark"
              ? "rose"
              : initialData?.type === "pin"
                ? "blue"
                : "yellow"),
        );
        setCategory(initialData?.category ?? "note");
        setPriority(initialData?.priority ?? "medium");
        setAuthorName(initialData?.author?.name ?? "User");
        setAuthorRole(initialData?.author?.role ?? "human");
        setNodeId(initialData?.nodeId ?? defaultNodeId ?? "");
        setTagsInput(initialData?.tags?.join(", ") ?? "");
        setIsPreviewActive(false);
      }
    }, [isOpen, initialData, defaultNodeId]);

    useEffect(() => {
      if (!isOpen) return;
      const handleKeyDown = (e: globalThis.KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      if (typeof window !== "undefined") {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
      }
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleInsertMarkdownSnippet = (prefix: string, suffix = "") => {
      if (typeof document === "undefined") {
        setContent((prev) => `${prev}${prefix}${suffix}`);
        return;
      }
      const textarea = document.getElementById(
        "annotation-content-textarea",
      ) as HTMLTextAreaElement | null;
      if (!textarea) {
        setContent((prev) => `${prev}${prefix}${suffix}`);
        return;
      }
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = content.substring(start, end);
      const replacement = `${prefix}${selected || "text"}${suffix}`;
      const updated = content.substring(0, start) + replacement + content.substring(end);
      setContent(updated);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(
          start + prefix.length,
          start + prefix.length + (selected.length || 4),
        );
      }, 50);
    };

    const handleFormSubmit = (e?: MouseEvent<HTMLButtonElement>) => {
      e?.preventDefault();
      if (!content.trim()) return;

      const parsedTags = tagsInput
        .split(",")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);

      const payload: CreateAnnotationInput = {
        title: title.trim() || undefined,
        content: content.trim(),
        type,
        color,
        category,
        priority,
        author: {
          name: authorName.trim() || "User",
          role: authorRole,
        },
        nodeId: nodeId.trim() || undefined,
        coordinates: initialData?.coordinates ?? (nodeId.trim() ? undefined : defaultCoordinates),
        tags: parsedTags,
        isResolved: initialData?.isResolved ?? false,
        isCollapsed: initialData?.isCollapsed ?? false,
        isPinned: initialData?.isPinned ?? false,
      };

      onSave(payload);
      onClose();
    };

    const handleModalKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleFormSubmit();
      }
    };

    return (
      <div
        className="annotation-modal-backdrop"
        onClick={onClose}
        onKeyDown={handleModalKeyDown}
        role="presentation"
      >
        <div
          className="annotation-modal-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={initialData?.id ? "Edit Annotation" : "Create New Annotation"}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="annotation-modal-header">
            <h3 className="annotation-modal-title">
              {initialData?.id ? "Edit Annotation" : "Create New Annotation"}
            </h3>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close modal"
            >
              <IconX size={16} />
            </button>
          </header>

          <div className="annotation-modal-body">
            {/* Type & Color Row */}
            <div className="modal-form-row form-row-split">
              <div className="modal-field">
                <label className="modal-label">Type</label>
                <div className="type-toggle-group">
                  <button
                    type="button"
                    className={`type-toggle-btn ${type === "sticky" ? "is-active" : ""}`}
                    onClick={() => setType("sticky")}
                  >
                    Sticky Note
                  </button>
                  <button
                    type="button"
                    className={`type-toggle-btn ${type === "pin" ? "is-active" : ""}`}
                    onClick={() => setType("pin")}
                  >
                    Callout Pin
                  </button>
                  <button
                    type="button"
                    className={`type-toggle-btn ${type === "bookmark" ? "is-active" : ""}`}
                    onClick={() => setType("bookmark")}
                  >
                    Review Bookmark
                  </button>
                </div>
              </div>

              <div className="modal-field">
                <label className="modal-label">Color Theme</label>
                <div className="color-picker-group">
                  {AVAILABLE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-swatch color-${c} ${color === c ? "is-selected" : ""}`}
                      onClick={() => setColor(c)}
                      title={`Color: ${c}`}
                      aria-label={`Color: ${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Title & Target Node Row */}
            <div className="modal-form-row form-row-split">
              <div className="modal-field">
                <label htmlFor="annotation-title-input" className="modal-label">
                  Title (Optional)
                </label>
                <input
                  id="annotation-title-input"
                  type="text"
                  className="modal-input"
                  placeholder="e.g. Architecture Note, Validation Blocker..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="annotation-node-select" className="modal-label">
                  Attach to Node (Optional)
                </label>
                {nodeIds.length > 0 ? (
                  <select
                    id="annotation-node-select"
                    className="modal-select"
                    value={nodeId}
                    onChange={(e) => setNodeId(e.target.value)}
                  >
                    <option value="">(Canvas Global / None)</option>
                    {nodeIds.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="annotation-node-select"
                    type="text"
                    className="modal-input"
                    placeholder="Node ID or leave blank for canvas"
                    value={nodeId}
                    onChange={(e) => setNodeId(e.target.value)}
                  />
                )}
              </div>
            </div>

            {/* Author Row */}
            <div className="modal-form-row form-row-split">
              <div className="modal-field">
                <label htmlFor="annotation-author-name" className="modal-label">
                  Author Name
                </label>
                <input
                  id="annotation-author-name"
                  type="text"
                  className="modal-input"
                  placeholder="Your Name / Agent Handle"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="annotation-author-role" className="modal-label">
                  Author Role
                </label>
                <select
                  id="annotation-author-role"
                  className="modal-select"
                  value={authorRole}
                  onChange={(e) => setAuthorRole(e.target.value as AnnotationAuthorRole)}
                >
                  {AVAILABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Category, Priority & Tags */}
            <div className="modal-form-row form-row-triplet">
              <div className="modal-field">
                <label htmlFor="annotation-category-select" className="modal-label">
                  Category
                </label>
                <select
                  id="annotation-category-select"
                  className="modal-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as AnnotationCategory)}
                >
                  {AVAILABLE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-field">
                <label htmlFor="annotation-priority-select" className="modal-label">
                  Priority
                </label>
                <select
                  id="annotation-priority-select"
                  className="modal-select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as AnnotationPriority)}
                >
                  {AVAILABLE_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div className="modal-field">
                <label htmlFor="annotation-tags-input" className="modal-label">
                  Tags (comma separated)
                </label>
                <input
                  id="annotation-tags-input"
                  type="text"
                  className="modal-input"
                  placeholder="e.g. bug, blocker, review-round-2"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                />
              </div>
            </div>

            {/* Markdown Content Area */}
            <div className="modal-field content-field">
              <div className="content-toolbar">
                <label htmlFor="annotation-content-textarea" className="modal-label">
                  Markdown Content <span className="required-mark">*</span>
                </label>
                <div className="toolbar-buttons">
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => handleInsertMarkdownSnippet("**", "**")}
                    title="Bold (**text**)"
                  >
                    <IconBold size={13} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => handleInsertMarkdownSnippet("*", "*")}
                    title="Italic (*text*)"
                  >
                    <IconItalic size={13} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => handleInsertMarkdownSnippet("`", "`")}
                    title="Inline Code (`code`)"
                  >
                    <IconCode size={13} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => handleInsertMarkdownSnippet("- ")}
                    title="Bullet List (- item)"
                  >
                    <IconList size={13} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => handleInsertMarkdownSnippet("- [ ] ")}
                    title="Task List (- [ ] task)"
                  >
                    <IconChecklist size={13} />
                  </button>
                  <button
                    type="button"
                    className="toolbar-btn"
                    onClick={() => handleInsertMarkdownSnippet("> ")}
                    title="Blockquote (> quote)"
                  >
                    <IconQuote size={13} />
                  </button>
                  <button
                    type="button"
                    className={`toolbar-btn preview-toggle-btn ${isPreviewActive ? "is-active" : ""}`}
                    onClick={() => setIsPreviewActive((prev) => !prev)}
                    title="Toggle Live Preview"
                  >
                    <IconEye size={13} />
                    <span>{isPreviewActive ? "Edit" : "Preview"}</span>
                  </button>
                </div>
              </div>

              {isPreviewActive ? (
                <div className="modal-preview-box">
                  <MarkdownRenderer content={content || "*No content entered yet.*"} />
                </div>
              ) : (
                <textarea
                  id="annotation-content-textarea"
                  className="modal-textarea"
                  rows={6}
                  placeholder="Write your markdown note, checklist, or callout here..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                />
              )}
            </div>
          </div>

          <footer className="annotation-modal-footer">
            <span className="shortcut-hint">Tip: Press Cmd/Ctrl+Enter to save</span>
            <div className="footer-actions">
              <button type="button" className="modal-btn cancel-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="modal-btn save-btn"
                disabled={!content.trim()}
                onClick={handleFormSubmit}
              >
                <IconDeviceFloppy size={14} />
                <span>{initialData?.id ? "Save Changes" : "Create Annotation"}</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    );
  },
);

AnnotationEditorModal.displayName = "AnnotationEditorModal";
