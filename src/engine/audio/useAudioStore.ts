import { create } from "zustand";
import { getAriaAnnouncer } from "./ariaAnnouncer";
import { getAudioSynthesizer } from "./audioSynthesizer";
import { getSoundscapeEngine } from "./soundscape";
import type {
  AriaAnnouncement,
  AriaVerbosity,
  AudioCueType,
  AudioLogEntry,
  GraphEdgeAudioContext,
  GraphNodeAudioContext,
  MusicalScale,
  ToneProfile,
} from "./types";

export interface AudioStoreState {
  masterVolume: number;
  isMuted: boolean;
  sonificationEnabled: boolean;
  spatialAudioEnabled: boolean;
  toneProfile: ToneProfile;
  musicalScale: MusicalScale;
  pitchScale: number;
  ariaEnabled: boolean;
  ariaVerbosity: AriaVerbosity;
  highContrastAudio: boolean;
  eventVolumeOverrides: Partial<Record<AudioCueType, number>>;
  audioEventLog: AudioLogEntry[];
  recentAnnouncements: AriaAnnouncement[];
  isSettingsDrawerOpen: boolean;
}

export interface AudioStoreActions {
  setMasterVolume: (vol: number) => void;
  toggleMute: () => void;
  setMuted: (isMuted: boolean) => void;
  setSonificationEnabled: (enabled: boolean) => void;
  setSpatialAudioEnabled: (enabled: boolean) => void;
  setToneProfile: (profile: ToneProfile) => void;
  setMusicalScale: (scale: MusicalScale) => void;
  setPitchScale: (scale: number) => void;
  setAriaEnabled: (enabled: boolean) => void;
  setAriaVerbosity: (verbosity: AriaVerbosity) => void;
  setHighContrastAudio: (enabled: boolean) => void;
  setEventVolumeOverride: (cue: AudioCueType, volume: number) => void;
  logAudioCue: (cue: {
    type: AudioCueType;
    volume?: number;
    frequency?: number;
    pan?: number;
    details?: string;
  }) => void;
  clearAudioLog: () => void;
  addAnnouncement: (announcement: AriaAnnouncement) => void;
  clearAnnouncements: () => void;
  setIsSettingsDrawerOpen: (isOpen: boolean) => void;
  toggleSettingsDrawer: () => void;
  resetToDefaults: () => void;
  triggerAudioCue: (
    cue: AudioCueType,
    nodeOrParams?: GraphNodeAudioContext | GraphEdgeAudioContext,
  ) => void;
}

export type AudioStore = AudioStoreState & AudioStoreActions;

const DEFAULT_STATE: AudioStoreState = {
  masterVolume: 0.7,
  isMuted: false,
  sonificationEnabled: true,
  spatialAudioEnabled: true,
  toneProfile: "harmonic-synthesizer",
  musicalScale: "pentatonic",
  pitchScale: 1.0,
  ariaEnabled: true,
  ariaVerbosity: "standard",
  highContrastAudio: false,
  eventVolumeOverrides: {},
  audioEventLog: [],
  recentAnnouncements: [],
  isSettingsDrawerOpen: false,
};

let logCounter = 0;

export const useAudioStore = create<AudioStore>((set, get) => {
  // Sync helper
  const syncWithEngines = (state: AudioStoreState) => {
    const synth = getAudioSynthesizer();
    synth.updateConfig({
      masterVolume: state.masterVolume,
      isMuted: state.isMuted,
      sonificationEnabled: state.sonificationEnabled,
      spatialAudioEnabled: state.spatialAudioEnabled,
      toneProfile: state.toneProfile,
      musicalScale: state.musicalScale,
      pitchScale: state.pitchScale,
      highContrastAudio: state.highContrastAudio,
    });

    const announcer = getAriaAnnouncer();
    announcer.updateConfig({
      enabled: state.ariaEnabled,
      verbosity: state.ariaVerbosity,
    });
  };

  // Wire soundscape & announcer callbacks to store
  const soundscape = getSoundscapeEngine();
  soundscape.onAudioCue((type, details) => {
    get().logAudioCue({ type, details });
  });

  const announcer = getAriaAnnouncer();
  announcer.onAnnouncement((announcement) => {
    get().addAnnouncement(announcement);
  });

  return {
    ...DEFAULT_STATE,

    setMasterVolume: (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol));
      set({ masterVolume: clamped });
      syncWithEngines({ ...get(), masterVolume: clamped });
    },

    toggleMute: () => {
      const newMuted = !get().isMuted;
      set({ isMuted: newMuted });
      syncWithEngines({ ...get(), isMuted: newMuted });
    },

    setMuted: (isMuted: boolean) => {
      set({ isMuted });
      syncWithEngines({ ...get(), isMuted });
    },

    setSonificationEnabled: (enabled: boolean) => {
      set({ sonificationEnabled: enabled });
      syncWithEngines({ ...get(), sonificationEnabled: enabled });
    },

    setSpatialAudioEnabled: (enabled: boolean) => {
      set({ spatialAudioEnabled: enabled });
      syncWithEngines({ ...get(), spatialAudioEnabled: enabled });
    },

    setToneProfile: (profile: ToneProfile) => {
      set({ toneProfile: profile });
      syncWithEngines({ ...get(), toneProfile: profile });
    },

    setMusicalScale: (scale: MusicalScale) => {
      set({ musicalScale: scale });
      syncWithEngines({ ...get(), musicalScale: scale });
    },

    setPitchScale: (scale: number) => {
      const clamped = Math.max(0.5, Math.min(2.0, scale));
      set({ pitchScale: clamped });
      syncWithEngines({ ...get(), pitchScale: clamped });
    },

    setAriaEnabled: (enabled: boolean) => {
      set({ ariaEnabled: enabled });
      syncWithEngines({ ...get(), ariaEnabled: enabled });
    },

    setAriaVerbosity: (verbosity: AriaVerbosity) => {
      set({ ariaVerbosity: verbosity });
      syncWithEngines({ ...get(), ariaVerbosity: verbosity });
    },

    setHighContrastAudio: (enabled: boolean) => {
      set({
        highContrastAudio: enabled,
        toneProfile: enabled ? "high-contrast-acoustic" : get().toneProfile,
      });
      syncWithEngines({
        ...get(),
        highContrastAudio: enabled,
        toneProfile: enabled ? "high-contrast-acoustic" : get().toneProfile,
      });
    },

    setEventVolumeOverride: (cue: AudioCueType, volume: number) => {
      const clamped = Math.max(0, Math.min(1, volume));
      set((state) => ({
        eventVolumeOverrides: {
          ...state.eventVolumeOverrides,
          [cue]: clamped,
        },
      }));
    },

    logAudioCue: (cue) => {
      const entry: AudioLogEntry = {
        id: `log_${++logCounter}`,
        type: cue.type,
        timestamp: Date.now(),
        volume: cue.volume ?? get().masterVolume,
        frequency: cue.frequency,
        pan: cue.pan,
        details: cue.details,
      };

      set((state) => {
        const updated = [entry, ...state.audioEventLog];
        return {
          audioEventLog: updated.slice(0, 50),
        };
      });
    },

    clearAudioLog: () => {
      set({ audioEventLog: [] });
    },

    addAnnouncement: (announcement: AriaAnnouncement) => {
      set((state) => {
        const updated = [announcement, ...state.recentAnnouncements];
        return {
          recentAnnouncements: updated.slice(0, 50),
        };
      });
    },

    clearAnnouncements: () => {
      set({ recentAnnouncements: [] });
      getAriaAnnouncer().clearAnnouncements();
    },

    setIsSettingsDrawerOpen: (isOpen: boolean) => {
      set({ isSettingsDrawerOpen: isOpen });
    },

    toggleSettingsDrawer: () => {
      set((state) => ({ isSettingsDrawerOpen: !state.isSettingsDrawerOpen }));
    },

    resetToDefaults: () => {
      set({ ...DEFAULT_STATE });
      syncWithEngines(DEFAULT_STATE);
    },

    triggerAudioCue: (
      cue: AudioCueType,
      nodeOrParams?: GraphNodeAudioContext | GraphEdgeAudioContext,
    ) => {
      const soundscape = getSoundscapeEngine();
      const node = nodeOrParams as GraphNodeAudioContext | undefined;
      const edge = nodeOrParams as GraphEdgeAudioContext | undefined;

      switch (cue) {
        case "node-select":
          soundscape.playNodeSelect(
            node || { id: "test-node", depth: 0, x: 0, y: 0, label: "Test Node" },
          );
          break;
        case "node-hover":
          soundscape.playNodeHover(node || { id: "test-node", depth: 0, x: 0, y: 0 });
          break;
        case "execution-start":
          soundscape.playExecutionStart(node);
          break;
        case "execution-complete":
          soundscape.playExecutionComplete(node);
          break;
        case "execution-error":
          soundscape.playExecutionError(
            node || { id: "error-node", errorMsg: "Sample pipeline failure" },
          );
          break;
        case "execution-warning":
          soundscape.playExecutionWarning(node);
          break;
        case "edge-traversal":
          soundscape.playEdgeTraversal(edge || { source: "node-A", target: "node-B" });
          break;
        case "layout-update":
          soundscape.playLayoutUpdate({ nodeCount: 12, depth: 4 });
          break;
        case "zoom-tick":
          soundscape.playZoomTick(1.2, "in");
          break;
        case "anomaly-alert":
          soundscape.playAnomalyAlert("high");
          break;
        case "boundary-hit":
          soundscape.playBoundaryHit("left");
          break;
        case "filter-toggle":
          soundscape.playFilterToggle(true);
          break;
        case "navigation-step":
          soundscape.playNavigationStep("forward", node);
          break;
      }
    },
  };
});
