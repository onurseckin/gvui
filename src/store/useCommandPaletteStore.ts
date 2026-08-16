import { create } from "zustand";
import type {
  CommandCategory,
  SearchScope,
} from "../components/CommandPalette/CommandPalette.types";

export interface CommandPaletteState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  activeCategory: CommandCategory;
  recentSearches: string[];
}

export interface CommandPaletteActions {
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (index: number | ((prev: number) => number)) => void;
  setActiveCategory: (category: CommandCategory) => void;
  setScope: (scope: SearchScope) => void;
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  resetPalette: () => void;
}

export type CommandPaletteStore = CommandPaletteState & CommandPaletteActions;

export const INITIAL_COMMAND_PALETTE_STATE: CommandPaletteState = {
  isOpen: false,
  query: "",
  selectedIndex: 0,
  activeCategory: "current",
  recentSearches: [],
};

const MAX_RECENT_SEARCHES = 10;

export const useCommandPaletteStore = create<CommandPaletteStore>((set, get) => ({
  ...INITIAL_COMMAND_PALETTE_STATE,

  openPalette: () => {
    set({
      isOpen: true,
      query: "",
      selectedIndex: 0,
    });
  },

  closePalette: () => {
    set({
      isOpen: false,
      query: "",
      selectedIndex: 0,
    });
  },

  togglePalette: () => {
    const isCurrentlyOpen = get().isOpen;
    if (isCurrentlyOpen) {
      get().closePalette();
    } else {
      get().openPalette();
    }
  },

  setQuery: (query: string) => {
    set({
      query,
      selectedIndex: 0,
    });
  },

  setSelectedIndex: (updater: number | ((prev: number) => number)) => {
    set((state) => ({
      selectedIndex: typeof updater === "function" ? updater(state.selectedIndex) : updater,
    }));
  },

  setActiveCategory: (category: CommandCategory) => {
    set({
      activeCategory: category,
      selectedIndex: 0,
    });
  },

  setScope: (scope: SearchScope) => {
    set({
      activeCategory: scope,
      selectedIndex: 0,
    });
  },

  addRecentSearch: (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }
    set((state) => {
      const filtered = state.recentSearches.filter(
        (s) => s.toLowerCase() !== trimmed.toLowerCase(),
      );
      return {
        recentSearches: [trimmed, ...filtered].slice(0, MAX_RECENT_SEARCHES),
      };
    });
  },

  removeRecentSearch: (query: string) => {
    set((state) => ({
      recentSearches: state.recentSearches.filter((s) => s !== query),
    }));
  },

  clearRecentSearches: () => {
    set({ recentSearches: [] });
  },

  resetPalette: () => {
    set({
      ...INITIAL_COMMAND_PALETTE_STATE,
    });
  },
}));
