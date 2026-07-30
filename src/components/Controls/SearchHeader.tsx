import type { FC, MouseEvent } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { SearchInput } from "../../ui";
import "./Controls.css";

export interface SearchHeaderProps {
  onOpenCommandPalette?: () => void;
}

export const SearchHeader: FC<SearchHeaderProps> = ({ onOpenCommandPalette }) => {
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);

  const handleClick = (e: MouseEvent<HTMLInputElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenCommandPalette?.();
  };

  return (
    <div className="search-header-container">
      <SearchInput
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onClear={() => setSearchQuery("")}
        onClick={handleClick}
        readOnly
        placeholder="Search nodes..."
        fullWidth
      />
    </div>
  );
};

export default SearchHeader;
