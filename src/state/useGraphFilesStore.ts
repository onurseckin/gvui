import { create } from "zustand";
import { fetchManifest, refreshGraphFiles, uploadGraphFile } from "../api/graphFilesApi";

function sorted(files: string[]): string[] {
  return [...files].sort((a, b) => a.localeCompare(b));
}

export interface GraphFilesState {
  files: string[];
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  fetchInitial: () => Promise<void>;
  refresh: () => Promise<void>;
  addFile: (filename: string, content: string) => Promise<string>;
}

/**
 * Single source of truth for "what graph files exist in `public/data/graphs`", shared by the
 * sidebar list, the navbar upload button, and the command palette's "All Files" scope. Backed by
 * `manifest.json` (works everywhere) with an opt-in live re-scan via the dev-only `/api/graphs`
 * route — see `src/api/graphFilesApi.ts`.
 */
export const useGraphFilesStore = create<GraphFilesState>()((set) => ({
  files: [],
  isLoading: false,
  isRefreshing: false,
  error: null,

  fetchInitial: async () => {
    set({ isLoading: true });
    const files = await fetchManifest();
    set({ files: sorted(files), isLoading: false });
  },

  refresh: async () => {
    set({ isRefreshing: true, error: null });
    try {
      const files = await refreshGraphFiles();
      set({ files: sorted(files), isRefreshing: false });
    } catch (err) {
      set({
        isRefreshing: false,
        error: err instanceof Error ? err.message : "Refresh failed.",
      });
    }
  },

  addFile: async (filename, content) => {
    const { files, id } = await uploadGraphFile(filename, content);
    set({ files: sorted(files), error: null });
    return id;
  },
}));

export const useGraphFileList = () => useGraphFilesStore((state) => state.files);
