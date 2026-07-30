import type { FC } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { SearchInput } from "../../ui";
import "./Controls.css";

export const SearchHeader: FC = () => {
  const searchQuery = useGraphStore((state) => state.searchQuery);
  const setSearchQuery = useGraphStore((state) => state.setSearchQuery);

  return (
    <div className="search-header-container">
      <SearchInput
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onClear={() => setSearchQuery("")}
        placeholder="Search nodes..."
        fullWidth
      />
    </div>
  );
};

export default SearchHeader;
