import type { ChangeEvent, FC, FormEvent } from "react";
import { memo, useCallback, useMemo, useState } from "react";
import {
  IconBookmark,
  IconBookmarkPlus,
  IconBug,
  IconCheck,
  IconEye,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import type { BookmarkCategory, ReplayBookmark } from "./types";

export interface BookmarkListProps {
  bookmarks: readonly ReplayBookmark[];
  currentEventIndex: number;
  activeFilter?: BookmarkCategory | "all";
  onSelectFilter?: (category: BookmarkCategory | "all") => void;
  onJumpToBookmark: (eventIndex: number) => void;
  onAddBookmark?: (eventIndex: number, label: string, note?: string) => void;
  onRemoveBookmark?: (id: string) => void;
  className?: string;
}

export const BookmarkList: FC<BookmarkListProps> = memo(function BookmarkList({
  bookmarks,
  currentEventIndex,
  activeFilter = "all",
  onSelectFilter,
  onJumpToBookmark,
  onAddBookmark,
  onRemoveBookmark,
  className = "",
}) {
  const [internalFilter, setInternalFilter] = useState<BookmarkCategory | "all">(activeFilter);
  const currentCategory = onSelectFilter ? activeFilter : internalFilter;

  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [customLabel, setCustomLabel] = useState<string>("");
  const [customNote, setCustomNote] = useState<string>("");

  const handleFilterClick = useCallback(
    (cat: BookmarkCategory | "all") => {
      if (onSelectFilter) {
        onSelectFilter(cat);
      } else {
        setInternalFilter(cat);
      }
    },
    [onSelectFilter],
  );

  const filteredBookmarks = useMemo(() => {
    if (currentCategory === "all") return bookmarks;
    return bookmarks.filter((b) => b.category === currentCategory);
  }, [bookmarks, currentCategory]);

  const handleCreateBookmark = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!customLabel.trim() || !onAddBookmark) return;
      onAddBookmark(currentEventIndex, customLabel.trim(), customNote.trim() || undefined);
      setCustomLabel("");
      setCustomNote("");
      setIsAdding(false);
    },
    [customLabel, customNote, currentEventIndex, onAddBookmark],
  );

  return (
    <div className={`bookmark-list-pane ${className}`} data-testid="bookmark-list">
      <div className="bookmark-list-header">
        <div className="bookmark-list-title-row">
          <span
            style={{
              fontSize: "12px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Bookmarks ({filteredBookmarks.length})
          </span>
          {onAddBookmark && (
            <button
              type="button"
              className="history-replay-btn"
              style={{ padding: "3px 8px", fontSize: "11px" }}
              onClick={() => setIsAdding(!isAdding)}
              data-testid="btn-toggle-add-bookmark"
            >
              <IconBookmarkPlus size={13} /> {isAdding ? "Cancel" : "Add Bookmark"}
            </button>
          )}
        </div>

        {/* Category filter tabs */}
        <div className="bookmark-filter-tabs" role="tablist">
          <button
            type="button"
            className={`bookmark-filter-tab ${currentCategory === "all" ? "active" : ""}`}
            onClick={() => handleFilterClick("all")}
            role="tab"
            aria-selected={currentCategory === "all"}
            data-testid="filter-tab-all"
          >
            All
          </button>
          <button
            type="button"
            className={`bookmark-filter-tab ${currentCategory === "failure" ? "active" : ""}`}
            onClick={() => handleFilterClick("failure")}
            role="tab"
            aria-selected={currentCategory === "failure"}
            data-testid="filter-tab-failure"
          >
            Failures
          </button>
          <button
            type="button"
            className={`bookmark-filter-tab ${currentCategory === "critic" ? "active" : ""}`}
            onClick={() => handleFilterClick("critic")}
            role="tab"
            aria-selected={currentCategory === "critic"}
            data-testid="filter-tab-critic"
          >
            Critic
          </button>
          <button
            type="button"
            className={`bookmark-filter-tab ${currentCategory === "milestone" ? "active" : ""}`}
            onClick={() => handleFilterClick("milestone")}
            role="tab"
            aria-selected={currentCategory === "milestone"}
            data-testid="filter-tab-milestone"
          >
            Milestones
          </button>
          <button
            type="button"
            className={`bookmark-filter-tab ${currentCategory === "custom" ? "active" : ""}`}
            onClick={() => handleFilterClick("custom")}
            role="tab"
            aria-selected={currentCategory === "custom"}
            data-testid="filter-tab-custom"
          >
            Custom
          </button>
        </div>
      </div>

      {/* Add Custom Bookmark Form */}
      {isAdding && (
        <form
          onSubmit={handleCreateBookmark}
          style={{
            padding: "10px",
            background: "#18181b",
            borderBottom: "1px solid #27272a",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
          data-testid="add-bookmark-form"
        >
          <div style={{ fontSize: "11px", color: "#a1a1aa" }}>
            Bookmark Event at Index {currentEventIndex + 1}:
          </div>
          <input
            type="text"
            placeholder="Bookmark Label (e.g. Critical Bug Observation)"
            value={customLabel}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setCustomLabel(e.target.value)}
            style={{
              background: "#27272a",
              border: "1px solid #3f3f46",
              color: "#ffffff",
              borderRadius: "4px",
              padding: "6px 8px",
              fontSize: "12px",
            }}
            data-testid="input-bookmark-label"
            required
          />
          <input
            type="text"
            placeholder="Optional notes or context..."
            value={customNote}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setCustomNote(e.target.value)}
            style={{
              background: "#27272a",
              border: "1px solid #3f3f46",
              color: "#ffffff",
              borderRadius: "4px",
              padding: "6px 8px",
              fontSize: "12px",
            }}
            data-testid="input-bookmark-note"
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "6px" }}>
            <button
              type="submit"
              className="history-replay-btn history-replay-btn-primary"
              style={{ padding: "4px 10px", fontSize: "11px" }}
              data-testid="btn-save-bookmark"
            >
              <IconPlus size={12} /> Save
            </button>
          </div>
        </form>
      )}

      {/* Bookmarks List */}
      <div className="bookmark-items-container" data-testid="bookmark-items-container">
        {filteredBookmarks.length === 0 ? (
          <div style={{ padding: "16px", textAlign: "center", color: "#71717a", fontSize: "12px" }}>
            No {currentCategory !== "all" ? currentCategory : ""} bookmarks recorded.
          </div>
        ) : (
          filteredBookmarks.map((bm) => {
            const isCurrent = bm.eventIndex === currentEventIndex;
            return (
              <div
                key={bm.id}
                className={`bookmark-item-card cat-${bm.category} ${
                  isCurrent ? "current-active" : ""
                }`}
                onClick={() => onJumpToBookmark(bm.eventIndex)}
                data-testid={`bookmark-item-${bm.id}`}
              >
                <div className="bookmark-item-top">
                  <span className="bookmark-item-label">
                    {bm.category === "failure" && (
                      <IconBug size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
                    )}
                    {bm.category === "critic" && (
                      <IconEye size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
                    )}
                    {bm.category === "milestone" && (
                      <IconCheck size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
                    )}
                    {bm.category === "custom" && (
                      <IconBookmark size={12} style={{ marginRight: 4, verticalAlign: "middle" }} />
                    )}
                    {bm.label}
                  </span>
                  <span className="bookmark-item-seq">Seq #{bm.sequence}</span>
                </div>
                {bm.note && <div className="bookmark-item-note">{bm.note}</div>}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "2px",
                  }}
                >
                  <span style={{ fontSize: "10px", color: "#71717a" }}>
                    {bm.actor ? `by ${bm.actor}` : ""}
                  </span>
                  {onRemoveBookmark && bm.isCustom && (
                    <button
                      type="button"
                      className="history-replay-btn"
                      style={{ padding: "2px 5px", fontSize: "10px", color: "#f87171" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveBookmark(bm.id);
                      }}
                      title="Delete custom bookmark"
                      data-testid={`btn-delete-bookmark-${bm.id}`}
                    >
                      <IconTrash size={10} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
