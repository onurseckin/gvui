import type { FC } from "react";
import type { FilterCategory } from "../../state/useGraphStore";
import { useGraphStore } from "../../state/useGraphStore";
import "./Controls.css";

interface FilterOption {
  id: FilterCategory;
  label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: "all", label: "All" },
  { id: "success", label: "🟢 Success" },
  { id: "error", label: "🔴 Errors Only" },
  { id: "tools", label: "🔧 Tools Only" },
];

export const FilterChips: FC = () => {
  const activeFilter = useGraphStore((state) => state.activeFilter);
  const setActiveFilter = useGraphStore((state) => state.setActiveFilter);

  return (
    <div className="filter-chips-container">
      {FILTER_OPTIONS.map((chip) => (
        <button
          key={chip.id}
          type="button"
          className={`filter-chip ${activeFilter === chip.id ? "active" : ""}`}
          onClick={() => setActiveFilter(chip.id)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
};

export default FilterChips;
