import { beforeEach, describe, expect, it } from "bun:test";
import { getAriaAnnouncer, getAudioSynthesizer, getSoundscapeEngine, useAudioStore } from "./index";

describe("Audio & Accessibility Subsystem Full Integration", () => {
  beforeEach(() => {
    useAudioStore.getState().resetToDefaults();
    getAriaAnnouncer().clearAnnouncements();
    useAudioStore.getState().clearAudioLog();
  });

  it("coordinates graph node selection across synthesizer, soundscape, store, and ARIA announcer", () => {
    const announcer = getAriaAnnouncer();
    const soundscape = getSoundscapeEngine();

    const node = {
      id: "agent_orchestrator",
      label: "Master Orchestrator",
      kind: "orchestrator",
      status: "running",
      depth: 0,
      x: 0,
      y: -200,
    };

    // Trigger node select
    soundscape.playNodeSelect(node);
    announcer.announceNode(node, "Selected");

    const recentAnnouncements = announcer.getRecentAnnouncements();
    expect(recentAnnouncements.length).toBeGreaterThan(0);
    expect(recentAnnouncements[0].message).toContain("Master Orchestrator");

    const eventLog = useAudioStore.getState().audioEventLog;
    expect(eventLog.length).toBeGreaterThan(0);
    expect(eventLog[0].type).toBe("node-select");
  });

  it("coordinates edge traversal events with spatial panning and narrator updates", () => {
    const soundscape = getSoundscapeEngine();
    const announcer = getAriaAnnouncer();

    const edge = {
      id: "edge-1",
      source: "Node Alpha",
      target: "Node Beta",
      kind: "handoff",
      sourcePos: { x: -300, y: 0 },
      targetPos: { x: 300, y: 0 },
    };

    soundscape.playEdgeTraversal(edge);
    announcer.announceEdge(edge);

    expect(useAudioStore.getState().audioEventLog.length).toBeGreaterThan(0);
    expect(useAudioStore.getState().audioEventLog[0].type).toBe("edge-traversal");

    const announcements = announcer.getRecentAnnouncements();
    expect(announcements.length).toBeGreaterThan(0);
    expect(announcements[0].message).toContain("Node Alpha");
    expect(announcements[0].message).toContain("Node Beta");
  });

  it("coordinates pipeline execution failure with discordant tone and assertive alert", () => {
    const soundscape = getSoundscapeEngine();
    const announcer = getAriaAnnouncer();

    soundscape.playExecutionError({
      id: "err_node",
      label: "Data Transformer",
      errorMsg: "Invalid schema payload",
    });

    announcer.announceExecution("Data Transformer", "error", 450, "Invalid schema payload");

    expect(useAudioStore.getState().audioEventLog[0].type).toBe("execution-error");
    const announcements = announcer.getRecentAnnouncements();
    expect(announcements[0].politeness).toBe("assertive");
    expect(announcements[0].message).toContain("Invalid schema payload");
  });

  it("syncs store volume and tone profile changes to active synthesizer configuration", () => {
    const store = useAudioStore.getState();
    const synth = getAudioSynthesizer();

    store.setMasterVolume(0.35);
    expect(synth.getConfig().masterVolume).toBe(0.35);

    store.setToneProfile("retro-beeps");
    expect(synth.getConfig().toneProfile).toBe("retro-beeps");

    store.setMusicalScale("dorian");
    expect(synth.getConfig().musicalScale).toBe("dorian");

    store.setMuted(true);
    expect(synth.getConfig().isMuted).toBe(true);
  });

  it("coordinates full graph overview narration and topological sweep sonification", async () => {
    const soundscape = getSoundscapeEngine();
    const announcer = getAriaAnnouncer();

    announcer.announceGraphOverview(10, 15, 3, { success: 8, running: 1, error: 1 });
    expect(announcer.getRecentAnnouncements()[0].message).toContain("10 nodes");
    expect(announcer.getRecentAnnouncements()[0].message).toContain("15 connections");

    const nodes = [
      { id: "1", x: -200, y: 0, depth: 0, label: "Root" },
      { id: "2", x: 0, y: 0, depth: 1, label: "Mid" },
      { id: "3", x: 200, y: 0, depth: 2, label: "End" },
    ];

    await soundscape.sonifyGraphScan(nodes, "topological", 10);
    expect(useAudioStore.getState().audioEventLog[0].type).toBe("layout-update");
  });
});
