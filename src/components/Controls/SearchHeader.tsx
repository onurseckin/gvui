import type { FC } from "react";
import { useEffect, useRef } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import "./Controls.css";

export const SearchHeader: FC = () => {
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="search-header-container">
      <div className="search-input-wrapper">
        <span className="search-icon">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search nodes (Cmd+F)..."
          className="search-input"
        />
        {searchQuery && (
          <button
            type="button"
            className="search-clear-btn"
            onClick={() => setSearchQuery("")}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
};

export default SearchHeader;
