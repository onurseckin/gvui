import { beforeEach, describe, expect, it } from "bun:test";
import { useAudioStore } from "./useAudioStore";

describe("useAudioStore Zustand Store", () => {
  beforeEach(() => {
    useAudioStore.getState().resetToDefaults();
  });

  it("has correct initial default state", () => {
    const state = useAudioStore.getState();
    expect(state.masterVolume).toBe(0.7);
    expect(state.isMuted).toBe(false);
    expect(state.sonificationEnabled).toBe(true);
    expect(state.spatialAudioEnabled).toBe(true);
    expect(state.toneProfile).toBe("harmonic-synthesizer");
    expect(state.musicalScale).toBe("pentatonic");
    expect(state.pitchScale).toBe(1.0);
    expect(state.ariaEnabled).toBe(true);
    expect(state.ariaVerbosity).toBe("standard");
    expect(state.highContrastAudio).toBe(false);
  });

  it("updates master volume and clamps values", () => {
    const { setMasterVolume } = useAudioStore.getState();
    setMasterVolume(0.4);
    expect(useAudioStore.getState().masterVolume).toBe(0.4);

    setMasterVolume(1.8);
    expect(useAudioStore.getState().masterVolume).toBe(1.0);

    setMasterVolume(-0.2);
    expect(useAudioStore.getState().masterVolume).toBe(0.0);
  });

  it("toggles and sets mute state", () => {
    const { toggleMute, setMuted } = useAudioStore.getState();
    toggleMute();
    expect(useAudioStore.getState().isMuted).toBe(true);
    toggleMute();
    expect(useAudioStore.getState().isMuted).toBe(false);

    setMuted(true);
    expect(useAudioStore.getState().isMuted).toBe(true);
  });

  it("updates tone profiles and scale settings", () => {
    const { setToneProfile, setMusicalScale, setPitchScale } = useAudioStore.getState();
    setToneProfile("subtle-chimes");
    expect(useAudioStore.getState().toneProfile).toBe("subtle-chimes");

    setMusicalScale("dorian");
    expect(useAudioStore.getState().musicalScale).toBe("dorian");

    setPitchScale(1.4);
    expect(useAudioStore.getState().pitchScale).toBe(1.4);
  });

  it("handles high contrast audio toggle", () => {
    const { setHighContrastAudio } = useAudioStore.getState();
    setHighContrastAudio(true);
    expect(useAudioStore.getState().highContrastAudio).toBe(true);
    expect(useAudioStore.getState().toneProfile).toBe("high-contrast-acoustic");
  });

  it("logs audio cues and manages max history size", () => {
    const { logAudioCue, clearAudioLog } = useAudioStore.getState();
    logAudioCue({ type: "node-select", details: "Node Alpha selected" });
    expect(useAudioStore.getState().audioEventLog.length).toBe(1);
    expect(useAudioStore.getState().audioEventLog[0].type).toBe("node-select");

    for (let i = 0; i < 60; i++) {
      logAudioCue({ type: "zoom-tick" });
    }
    expect(useAudioStore.getState().audioEventLog.length).toBe(50); // Capped at 50

    clearAudioLog();
    expect(useAudioStore.getState().audioEventLog.length).toBe(0);
  });

  it("logs announcements and manages feed", () => {
    const { addAnnouncement, clearAnnouncements } = useAudioStore.getState();
    addAnnouncement({
      id: "a1",
      message: "Test announcement",
      politeness: "polite",
      timestamp: Date.now(),
    });
    expect(useAudioStore.getState().recentAnnouncements.length).toBe(1);

    clearAnnouncements();
    expect(useAudioStore.getState().recentAnnouncements.length).toBe(0);
  });

  it("handles settings drawer open/close and toggle", () => {
    const { setIsSettingsDrawerOpen, toggleSettingsDrawer } = useAudioStore.getState();
    setIsSettingsDrawerOpen(true);
    expect(useAudioStore.getState().isSettingsDrawerOpen).toBe(true);

    toggleSettingsDrawer();
    expect(useAudioStore.getState().isSettingsDrawerOpen).toBe(false);
  });

  it("triggers audio cues via store helper", () => {
    const { triggerAudioCue } = useAudioStore.getState();
    triggerAudioCue("node-select", { id: "n1", label: "Node 1", depth: 0, x: 0, y: 0 });
    triggerAudioCue("execution-start");
    triggerAudioCue("execution-complete");
    triggerAudioCue("execution-error");
    triggerAudioCue("edge-traversal");
    triggerAudioCue("layout-update");
    triggerAudioCue("zoom-tick");
    triggerAudioCue("anomaly-alert");
    triggerAudioCue("boundary-hit");
    triggerAudioCue("filter-toggle");
    triggerAudioCue("navigation-step");

    expect(useAudioStore.getState().audioEventLog.length).toBeGreaterThan(0);
  });
});
