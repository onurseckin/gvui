import { create } from "zustand";
import type {
  ActionCategory,
  CommandAction,
  CommandCategory,
} from "../components/CommandPalette/CommandPalette.types";

export interface CommandPaletteState {
  isOpen: boolean;
  query: string;
  selectedIndex: number;
  activeCategory: CommandCategory;
  actionRegistry: Map<string, CommandAction>;
  recentSearches: string[];
  favoriteActions: string[];
}

export interface CommandPaletteActions {
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setQuery: (query: string) => void;
  setSelectedIndex: (index: number | ((prev: number) => number)) => void;
  setActiveCategory: (category: CommandCategory) => void;
  registerAction: (action: CommandAction) => void;
  registerActions: (actions: CommandAction[]) => void;
  unregisterAction: (id: string) => void;
  executeAction: (id: string) => Promise<void> | void;
  getAllActions: () => CommandAction[];
  getAction: (id: string) => CommandAction | undefined;
  getActionsByCategory: (category: ActionCategory | CommandCategory) => CommandAction[];
  addRecentSearch: (query: string) => void;
  removeRecentSearch: (query: string) => void;
  clearRecentSearches: () => void;
  toggleFavoriteAction: (id: string) => void;
  resetPalette: () => void;
}

export type CommandPaletteStore = CommandPaletteState & CommandPaletteActions;

export const INITIAL_COMMAND_PALETTE_STATE: CommandPaletteState = {
  isOpen: false,
  query: "",
  selectedIndex: 0,
  activeCategory: "all",
  actionRegistry: new Map<string, CommandAction>(),
  recentSearches: [],
  favoriteActions: [],
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

  registerAction: (action: CommandAction) => {
    set((state) => {
      const nextRegistry = new Map(state.actionRegistry);
      nextRegistry.set(action.id, action);
      return { actionRegistry: nextRegistry };
    });
  },

  registerActions: (actions: CommandAction[]) => {
    set((state) => {
      const nextRegistry = new Map(state.actionRegistry);
      for (const action of actions) {
        nextRegistry.set(action.id, action);
      }
      return { actionRegistry: nextRegistry };
    });
  },

  unregisterAction: (id: string) => {
    set((state) => {
      if (!state.actionRegistry.has(id)) {
        return state;
      }
      const nextRegistry = new Map(state.actionRegistry);
      nextRegistry.delete(id);
      return { actionRegistry: nextRegistry };
    });
  },

  executeAction: async (id: string) => {
    const action = get().actionRegistry.get(id);
    if (!action || action.disabled) {
      return;
    }
    const currentQuery = get().query.trim();
    if (currentQuery) {
      get().addRecentSearch(currentQuery);
    }
    get().closePalette();
    await action.handler();
  },

  getAllActions: () => {
    return Array.from(get().actionRegistry.values());
  },

  getAction: (id: string) => {
    return get().actionRegistry.get(id);
  },

  getActionsByCategory: (category: ActionCategory | CommandCategory) => {
    const all = Array.from(get().actionRegistry.values());
    if (category === "all") {
      return all;
    }
    return all.filter((action) => action.category === category);
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

  toggleFavoriteAction: (id: string) => {
    set((state) => {
      const exists = state.favoriteActions.includes(id);
      const favoriteActions = exists
        ? state.favoriteActions.filter((favId) => favId !== id)
        : [...state.favoriteActions, id];
      return { favoriteActions };
    });
  },

  resetPalette: () => {
    set({
      ...INITIAL_COMMAND_PALETTE_STATE,
      actionRegistry: new Map<string, CommandAction>(),
    });
  },
}));
