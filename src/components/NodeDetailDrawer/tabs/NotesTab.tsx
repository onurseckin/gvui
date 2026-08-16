import type { FC, MouseEvent } from "react";
import { memo, useMemo, useState } from "react";
import {
  IconBold,
  IconCheck,
  IconChecklist,
  IconCode,
  IconCopy,
  IconEye,
  IconItalic,
  IconList,
  IconNote,
  IconPlus,
  IconQuote,
  IconSearch,
  IconX,
} from "@tabler/icons-react";
import {
  type AnnotationAuthorRole,
  type AnnotationCategory,
  type AnnotationColor,
  type AnnotationPriority,
  type CreateAnnotationInput,
  MarkdownRenderer,
  StickyNoteCard,
  useAnnotationStore,
  useNodeAnnotations,
} from "../../CanvasAnnotations";
import type { GraphNodeData } from "../../../types/graphData";

export interface NotesTabProps {
  node: GraphNodeData;
  onSelectNode?: (nodeId: string) => void;
}

const AVAILABLE_ROLES: AnnotationAuthorRole[] = ["human", "validator", "agent", "critic", "system"];

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

const AVAILABLE_CATEGORIES: AnnotationCategory[] = [
  "note",
  "review",
  "bug",
  "question",
  "todo",
  "info",
  "performance",
  "security",
];

export const NotesTab: FC<NotesTabProps> = memo(function NotesTab({ node }) {
  const nodeAnnotations = useNodeAnnotations(node.id);
  const addAnnotation = useAnnotationStore((state) => state.addAnnotation);
  const updateAnnotation = useAnnotationStore((state) => state.updateAnnotation);
  const deleteAnnotation = useAnnotationStore((state) => state.deleteAnnotation);
  const toggleResolveAnnotation = useAnnotationStore((state) => state.toggleResolveAnnotation);
  const toggleCollapseAnnotation = useAnnotationStore((state) => state.toggleCollapseAnnotation);
  const togglePinAnnotation = useAnnotationStore((state) => state.togglePinAnnotation);

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);

  // Composer Form State
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [authorName, setAuthorName] = useState("User");
  const [authorRole, setAuthorRole] = useState<AnnotationAuthorRole>("human");
  const [color, setColor] = useState<AnnotationColor>("yellow");
  const [category, setCategory] = useState<AnnotationCategory>("note");
  const [priority, setPriority] = useState<AnnotationPriority>("medium");
  const [tagsInput, setTagsInput] = useState("");
  const [isPreviewActive, setIsPreviewActive] = useState(false);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "resolved">("all");
  const [copiedAll, setCopiedAll] = useState(false);

  const filteredNotes = useMemo(() => {
    return nodeAnnotations.filter((ann) => {
      if (statusFilter === "open" && ann.isResolved) return false;
      if (statusFilter === "resolved" && !ann.isResolved) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = (ann.title ?? "").toLowerCase().includes(q);
        const matchContent = ann.content.toLowerCase().includes(q);
        const matchAuthor = ann.author.name.toLowerCase().includes(q);
        const matchTags = (ann.tags ?? []).some((t) => t.toLowerCase().includes(q));
        if (!matchTitle && !matchContent && !matchAuthor && !matchTags) return false;
      }

      return true;
    });
  }, [nodeAnnotations, statusFilter, searchQuery]);

  const resetComposer = () => {
    setTitle("");
    setContent("");
    setAuthorName("User");
    setAuthorRole("human");
    setColor("yellow");
    setCategory("note");
    setPriority("medium");
    setTagsInput("");
    setIsPreviewActive(false);
    setEditingAnnotationId(null);
    setIsComposerOpen(false);
  };

  const handleOpenComposer = () => {
    resetComposer();
    setIsComposerOpen(true);
  };

  const handleEditNote = (id: string) => {
    const target = nodeAnnotations.find((n) => n.id === id);
    if (!target) return;
    setTitle(target.title ?? "");
    setContent(target.content);
    setAuthorName(target.author.name);
    setAuthorRole(target.author.role);
    setColor(target.color);
    setCategory(target.category ?? "note");
    setPriority(target.priority ?? "medium");
    setTagsInput(target.tags?.join(", ") ?? "");
    setEditingAnnotationId(id);
    setIsComposerOpen(true);
  };

  const handleInsertSnippet = (prefix: string, suffix = "") => {
    setContent((prev) => `${prev}${prefix}${suffix}`);
  };

  const handleSaveComposer = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!content.trim()) return;

    const parsedTags = tagsInput
      .split(",")
      .map((t) => t.trim().replace(/^#/, ""))
      .filter(Boolean);

    if (editingAnnotationId) {
      updateAnnotation(editingAnnotationId, {
        title: title.trim() || undefined,
        content: content.trim(),
        author: { name: authorName.trim() || "User", role: authorRole },
        color,
        category,
        priority,
        tags: parsedTags,
      });
    } else {
      const payload: CreateAnnotationInput = {
        nodeId: node.id,
        title: title.trim() || undefined,
        content: content.trim(),
        type: "sticky",
        author: { name: authorName.trim() || "User", role: authorRole },
        color,
        category,
        priority,
        tags: parsedTags,
      };
      addAnnotation(payload);
    }

    resetComposer();
  };

  const handleCopyAllNotes = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (nodeAnnotations.length === 0) return;

    const lines: string[] = [`# Notes for Node: \`${node.name}\` (${node.id})\n`];
    for (const ann of nodeAnnotations) {
      const statusMark = ann.isResolved ? "[RESOLVED]" : "[OPEN]";
      const noteTitle = ann.title ? `**${ann.title}**` : `*(Note)*`;
      lines.push(`## ${statusMark} ${noteTitle}`);
      lines.push(
        `- **Author:** ${ann.author.name} (${ann.author.role}) | **Priority:** ${ann.priority ?? "medium"}`,
      );
      lines.push(`- **Date:** ${ann.createdAt}`);
      if (ann.tags && ann.tags.length > 0) {
        lines.push(`- **Tags:** ${ann.tags.map((t) => `\`#${t}\``).join(", ")}`);
      }
      lines.push("\n```markdown");
      lines.push(ann.content);
      lines.push("```\n");
    }

    const report = lines.join("\n");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(report).catch(() => {});
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const handleUpdateNoteContent = (id: string, newContent: string) => {
    updateAnnotation(id, { content: newContent });
  };

  return (
    <div className="notes-tab-container">
      {/* Header */}
      <header className="notes-tab-header">
        <div className="notes-tab-title-group">
          <IconNote size={16} color="#38bdf8" />
          <h3 className="notes-tab-title">Node Notes & Annotations</h3>
          <span className="notes-tab-count-badge">{nodeAnnotations.length}</span>
        </div>

        <div className="notes-tab-controls">
          {nodeAnnotations.length > 0 && (
            <button
              type="button"
              className="action-btn copy-all-btn"
              onClick={handleCopyAllNotes}
              title="Copy all notes for this node as markdown"
              aria-label="Copy all notes"
            >
              {copiedAll ? <IconCheck size={13} color="#10b981" /> : <IconCopy size={13} />}
              <span>{copiedAll ? "Copied" : "Copy Markdown"}</span>
            </button>
          )}

          {!isComposerOpen && (
            <button
              type="button"
              className="action-btn primary-new-btn"
              onClick={handleOpenComposer}
            >
              <IconPlus size={14} />
              <span>Add Note</span>
            </button>
          )}
        </div>
      </header>

      {/* Inline Composer Form */}
      {isComposerOpen && (
        <div className="notes-tab-composer" role="region" aria-label="Note Composer">
          <div className="modal-form-row form-row-split">
            <div className="modal-field">
              <label htmlFor="notes-composer-title" className="modal-label">
                Note Title
              </label>
              <input
                id="notes-composer-title"
                type="text"
                className="modal-input"
                placeholder="e.g. Code Review Checklist, Bug finding..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="modal-field">
              <label className="modal-label">Color</label>
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

          <div className="modal-form-row form-row-triplet">
            <div className="modal-field">
              <label htmlFor="notes-author-name" className="modal-label">
                Author
              </label>
              <input
                id="notes-author-name"
                type="text"
                className="modal-input"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
              />
            </div>

            <div className="modal-field">
              <label htmlFor="notes-author-role" className="modal-label">
                Role
              </label>
              <select
                id="notes-author-role"
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

            <div className="modal-field">
              <label htmlFor="notes-category" className="modal-label">
                Category
              </label>
              <select
                id="notes-category"
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
          </div>

          <div className="modal-field">
            <label htmlFor="notes-tags" className="modal-label">
              Tags (comma separated)
            </label>
            <input
              id="notes-tags"
              type="text"
              className="modal-input"
              placeholder="e.g. bug, blocker, pass"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
            />
          </div>

          {/* Markdown Content & Toolbar */}
          <div className="modal-field">
            <div className="content-toolbar">
              <label htmlFor="notes-composer-content" className="modal-label">
                Markdown Content <span className="required-mark">*</span>
              </label>
              <div className="toolbar-buttons">
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => handleInsertSnippet("**", "**")}
                  title="Bold"
                >
                  <IconBold size={12} />
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => handleInsertSnippet("*", "*")}
                  title="Italic"
                >
                  <IconItalic size={12} />
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => handleInsertSnippet("`", "`")}
                  title="Code"
                >
                  <IconCode size={12} />
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => handleInsertSnippet("- ")}
                  title="List"
                >
                  <IconList size={12} />
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => handleInsertSnippet("- [ ] ")}
                  title="Task List"
                >
                  <IconChecklist size={12} />
                </button>
                <button
                  type="button"
                  className="toolbar-btn"
                  onClick={() => handleInsertSnippet("> ")}
                  title="Quote"
                >
                  <IconQuote size={12} />
                </button>
                <button
                  type="button"
                  className={`toolbar-btn preview-toggle-btn ${isPreviewActive ? "is-active" : ""}`}
                  onClick={() => setIsPreviewActive((prev) => !prev)}
                >
                  <IconEye size={12} />
                  <span>{isPreviewActive ? "Edit" : "Preview"}</span>
                </button>
              </div>
            </div>

            {isPreviewActive ? (
              <div className="modal-preview-box">
                <MarkdownRenderer content={content || "*Empty note*"} />
              </div>
            ) : (
              <textarea
                id="notes-composer-content"
                className="modal-textarea"
                rows={4}
                placeholder="Type your markdown notes, review findings, or checklist..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />
            )}
          </div>

          <div className="sticky-inline-actions">
            <button type="button" className="sticky-btn cancel-btn" onClick={resetComposer}>
              <IconX size={12} />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              className="sticky-btn save-btn"
              disabled={!content.trim()}
              onClick={handleSaveComposer}
            >
              <IconCheck size={12} />
              <span>{editingAnnotationId ? "Update Note" : "Save Note"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Filter / Search within Node Notes */}
      {nodeAnnotations.length > 0 && (
        <div className="filter-select-group" style={{ marginBottom: 6 }}>
          <div className="search-input-wrapper" style={{ width: 180 }}>
            <IconSearch size={13} className="search-icon" />
            <input
              type="text"
              className="annotation-search-input"
              placeholder="Filter notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="filter-dropdown"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "open" | "resolved")}
            aria-label="Filter status"
          >
            <option value="all">All ({nodeAnnotations.length})</option>
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      )}

      {/* Notes List */}
      {filteredNotes.length > 0 ? (
        <div className="notes-tab-list">
          {filteredNotes.map((ann) => (
            <StickyNoteCard
              key={ann.id}
              annotation={ann}
              onEdit={handleEditNote}
              onDelete={deleteAnnotation}
              onToggleResolve={toggleResolveAnnotation}
              onToggleCollapse={toggleCollapseAnnotation}
              onTogglePin={togglePinAnnotation}
              onUpdateContent={handleUpdateNoteContent}
              style={{ width: "100%" }}
            />
          ))}
        </div>
      ) : (
        <div className="notes-tab-empty">
          <IconNote size={32} className="empty-icon" />
          <h4 className="empty-heading">No notes on this node yet</h4>
          <p className="empty-desc">
            Attach markdown review notes, inspection checklists, or callout pins to collaborate.
          </p>
          {!isComposerOpen && (
            <button
              type="button"
              className="action-btn primary-new-btn"
              onClick={handleOpenComposer}
            >
              <IconPlus size={14} />
              <span>Create Note</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
});

NotesTab.displayName = "NotesTab";
export default NotesTab;
