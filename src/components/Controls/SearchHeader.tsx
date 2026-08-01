import type { FC, MouseEvent, ChangeEvent } from "react";
import React, { useCallback } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { SearchInput } from "../../ui";
import "./Controls.css";

export interface SearchHeaderProps {
  onOpenCommandPalette?: () => void;
}

export const SearchHeader: FC<SearchHeaderProps> = React.memo(function SearchHeader({
  onOpenCommandPalette,
}) {
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLInputElement>) => {
      e.preventDefault();
      e.stopPropagation();
      onOpenCommandPalette?.();
    },
    [onOpenCommandPalette],
  );

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery],
  );

  const handleClear = useCallback(() => {
    setSearchQuery("");
  }, [setSearchQuery]);

  return (
    <div className="search-header-container">
      <SearchInput
        value={searchQuery}
        onChange={handleChange}
        onClear={handleClear}
        onClick={handleClick}
        readOnly
        placeholder="Search nodes..."
        fullWidth
      />
    </div>
  );
});

export default SearchHeader;
