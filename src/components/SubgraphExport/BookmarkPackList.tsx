import React, { useState } from "react";
import type {
  AnnotationCategory,
  AnnotationColor,
  AnnotationPriority,
  CanvasAnnotation,
} from "../CanvasAnnotations/types";
import type { BookmarkPackListProps } from "./types";

export const BookmarkPackList: React.FC<BookmarkPackListProps> = ({
  bookmarks,
  nodes,
  onBookmarksChange,
  className = "",
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

  // New Bookmark form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newAuthorName, setNewAuthorName] = useState("Architect");
  const [newNodeId, setNewNodeId] = useState<string>(nodes[0]?.id || "");
  const [newPriority, setNewPriority] = useState<AnnotationPriority>("medium");
  const [newCategory, setNewCategory] = useState<AnnotationCategory>("review");

  const filteredBookmarks = bookmarks.filter((b) => {
    const matchesSearch =
      searchQuery.trim() === "" ||
      (b.title && b.title.toLowerCase().includes(searchQuery.toLowerCase())) ||
      b.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (b.tags && b.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesPriority = filterPriority === "all" || b.priority === filterPriority;
    const matchesCategory = filterCategory === "all" || b.category === filterCategory;

    return matchesSearch && matchesPriority && matchesCategory;
  });

  const handleAddBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContent.trim()) return;

    const now = new Date().toISOString();
    const colorMap: Record<AnnotationPriority, AnnotationColor> = {
      critical: "rose",
      high: "amber",
      medium: "blue",
      low: "green",
      info: "cyan",
    };

    const newBookmark: CanvasAnnotation = {
      id: `ann-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type: "bookmark",
      title: newTitle.trim() || undefined,
      content: newContent.trim(),
      nodeId: newNodeId || undefined,
      author: {
        name: newAuthorName.trim() || "Architect",
        role: "human",
      },
      priority: newPriority,
      category: newCategory,
      color: colorMap[newPriority] || "blue",
      createdAt: now,
      updatedAt: now,
    };

    onBookmarksChange([...bookmarks, newBookmark]);
    setNewTitle("");
    setNewContent("");
    setShowAddForm(false);
  };

  const handleDeleteBookmark = (id: string) => {
    onBookmarksChange(bookmarks.filter((b) => b.id !== id));
  };

  return (
    <div className={`subgraph-bookmarks-catalog ${className}`}>
      {/* Search & Filter Header */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "12px",
        }}
      >
        <input
          type="text"
          placeholder="Search bookmarks by title, content, tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="subgraph-form-input"
          style={{ flex: 1, minWidth: "180px" }}
        />
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="subgraph-form-select"
        >
          <option value="all">All Priorities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="subgraph-form-select"
        >
          <option value="all">All Categories</option>
          <option value="review">Review</option>
          <option value="bug">Bug</option>
          <option value="todo">Todo</option>
          <option value="security">Security</option>
          <option value="bookmark">Bookmark</option>
          <option value="note">Note</option>
        </select>
        <button
          type="button"
          className="subgraph-btn-action subgraph-btn-secondary"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? "Cancel" : "+ Add Bookmark"}
        </button>
      </div>

      {/* Add Bookmark Quick Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddBookmark}
          style={{
            backgroundColor: "#121214",
            border: "1px solid #3b82f6",
            borderRadius: "8px",
            padding: "12px",
            marginBottom: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "#60a5fa" }}>
            Add New Bookmark Annotation
          </div>
          <div className="subgraph-form-grid">
            <div className="subgraph-form-group">
              <label className="subgraph-form-label">Title (Optional)</label>
              <input
                type="text"
                placeholder="Key Decision / Investigation"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="subgraph-form-input"
              />
            </div>
            <div className="subgraph-form-group">
              <label className="subgraph-form-label">Author Name</label>
              <input
                type="text"
                placeholder="Author Name"
                value={newAuthorName}
                onChange={(e) => setNewAuthorName(e.target.value)}
                className="subgraph-form-input"
              />
            </div>
            <div className="subgraph-form-group">
              <label className="subgraph-form-label">Target Subgraph Node</label>
              <select
                value={newNodeId}
                onChange={(e) => setNewNodeId(e.target.value)}
                className="subgraph-form-select"
              >
                <option value="">Canvas Position (Unattached)</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.id})
                  </option>
                ))}
              </select>
            </div>
            <div className="subgraph-form-group">
              <label className="subgraph-form-label">Priority</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as AnnotationPriority)}
                className="subgraph-form-select"
              >
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div className="subgraph-form-group">
              <label className="subgraph-form-label">Category</label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as AnnotationCategory)}
                className="subgraph-form-select"
              >
                <option value="review">Review</option>
                <option value="bug">Bug</option>
                <option value="todo">Todo</option>
                <option value="security">Security</option>
                <option value="bookmark">Bookmark</option>
                <option value="note">Note</option>
              </select>
            </div>
            <div className="subgraph-form-group full-width">
              <label className="subgraph-form-label">Content / Annotation Note</label>
              <textarea
                required
                placeholder="Write your markdown note or findings..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="subgraph-form-textarea"
                rows={2}
              />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button
              type="button"
              className="subgraph-btn-action subgraph-btn-secondary"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </button>
            <button type="submit" className="subgraph-btn-action subgraph-btn-primary">
              Save Bookmark
            </button>
          </div>
        </form>
      )}

      {/* Bookmarks List */}
      <div className="subgraph-bookmarks-list">
        {filteredBookmarks.length === 0 ? (
          <div
            style={{
              padding: "24px",
              textAlign: "center",
              color: "#71717a",
              backgroundColor: "#18181b",
              borderRadius: "8px",
              border: "1px dashed #27272a",
            }}
          >
            No bookmark annotations match the selected filters.
          </div>
        ) : (
          filteredBookmarks.map((b) => {
            const priorityClass = b.priority || "info";
            const targetNode = nodes.find((n) => n.id === b.nodeId);

            return (
              <div key={b.id} className="subgraph-bookmark-card">
                <div className="subgraph-bookmark-header">
                  <div className="subgraph-bookmark-title">
                    {b.title || `Annotation ${b.id.slice(0, 8)}`}
                  </div>
                  <div className="subgraph-bookmark-badges">
                    <span className={`subgraph-badge ${priorityClass}`}>
                      {b.priority?.toUpperCase() || "INFO"}
                    </span>
                    {b.category && <span className="subgraph-badge info">#{b.category}</span>}
                    <button
                      type="button"
                      onClick={() => handleDeleteBookmark(b.id)}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#ef4444",
                        cursor: "pointer",
                        fontSize: "0.8125rem",
                        padding: "2px 4px",
                      }}
                      title="Remove bookmark from pack"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="subgraph-bookmark-content">{b.content}</div>

                <div className="subgraph-bookmark-footer">
                  <div>
                    {targetNode ? (
                      <span>
                        Attached to: <strong>{targetNode.name}</strong> (<code>{b.nodeId}</code>)
                      </span>
                    ) : (
                      <span>Canvas coordinate annotation</span>
                    )}
                  </div>
                  <div>
                    By: <strong>{b.author.name}</strong>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
