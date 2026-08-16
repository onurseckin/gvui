import { beforeEach, describe, expect, it } from "bun:test";
import { AudioSynthesizer } from "./audioSynthesizer";
import { MockAudioContext } from "./mockAudioContext";
import { SoundscapeEngine } from "./soundscape";
import type { AudioCueType, MusicalScale } from "./types";

describe("SoundscapeEngine", () => {
  let mockCtx: MockAudioContext;
  let synth: AudioSynthesizer;
  let soundscape: SoundscapeEngine;
  let lastCue: { type: AudioCueType; details?: string } | null = null;

  beforeEach(() => {
    mockCtx = new MockAudioContext();
    synth = new AudioSynthesizer({ masterVolume: 0.7 }, mockCtx);
    soundscape = new SoundscapeEngine(synth);
    lastCue = null;
    soundscape.onAudioCue((type, details) => {
      lastCue = { type, details };
    });
  });

  it("calculates stereo panning correctly from canvas X coordinate", () => {
    soundscape.setViewportBounds({ minX: -500, maxX: 500 });

    expect(soundscape.calculatePan(0)).toBeCloseTo(0, 2);
    expect(soundscape.calculatePan(-500)).toBeCloseTo(-1, 2);
    expect(soundscape.calculatePan(500)).toBeCloseTo(1, 2);
    expect(soundscape.calculatePan(-250)).toBeCloseTo(-0.5, 2);
    expect(soundscape.calculatePan(250)).toBeCloseTo(0.5, 2);

    // Clamping beyond bounds
    expect(soundscape.calculatePan(-1000)).toBe(-1);
    expect(soundscape.calculatePan(1000)).toBe(1);

    // Undefined / NaN
    expect(soundscape.calculatePan(undefined)).toBe(0);
    expect(soundscape.calculatePan(NaN)).toBe(0);
  });

  it("calculates pitch frequency from Y position and DAG depth across scales", () => {
    soundscape.setViewportBounds({ minY: -500, maxY: 500 });
    const scales: MusicalScale[] = ["pentatonic", "major", "minor", "dorian", "chromatic"];

    scales.forEach((scale) => {
      const freqTop = soundscape.calculateFrequencyFromPosition(-450, 0, scale);
      const freqBottom = soundscape.calculateFrequencyFromPosition(450, 0, scale);
      expect(freqTop).toBeGreaterThanOrEqual(freqBottom); // Higher position = higher pitch
    });

    // When Y is undefined, uses depth
    const freqDepth0 = soundscape.calculateFrequencyFromPosition(undefined, 0, "pentatonic");
    const freqDepth2 = soundscape.calculateFrequencyFromPosition(undefined, 2, "pentatonic");
    expect(freqDepth0).toBeGreaterThan(0);
    expect(freqDepth2).toBeGreaterThan(0);
  });

  it("retrieves harmonic chord progressions based on DAG depth", () => {
    const chord0 = soundscape.getChordForDepth(0);
    const chord1 = soundscape.getChordForDepth(1);
    const chord4 = soundscape.getChordForDepth(4);

    expect(chord0.length).toBeGreaterThanOrEqual(3);
    expect(chord1.length).toBeGreaterThanOrEqual(3);
    expect(chord4.length).toBeGreaterThanOrEqual(3);
  });

  it("triggers node-select audio cue for normal and error nodes", () => {
    soundscape.playNodeSelect({ id: "n1", label: "Agent Node", x: 100, y: -50, depth: 1 });
    expect(lastCue?.type).toBe("node-select");
    expect(lastCue?.details).toContain("Agent Node");

    soundscape.playNodeSelect({ id: "n-err", status: "error", x: -200, y: 100 });
    expect(lastCue?.type).toBe("node-select");
  });

  it("triggers node-hover audio cue", () => {
    soundscape.playNodeHover({ id: "hover-node", label: "Hover Node", x: 50, y: 50 });
    expect(lastCue?.type).toBe("node-hover");
    expect(lastCue?.details).toContain("Hover Node");
  });

  it("triggers execution lifecycle cues: start, complete, error, warning", () => {
    soundscape.playExecutionStart({ id: "exec-node", label: "Exec Start", depth: 0 });
    expect(lastCue?.type).toBe("execution-start");

    soundscape.playExecutionComplete({ id: "exec-node", label: "Exec Complete", depth: 2 });
    expect(lastCue?.type).toBe("execution-complete");

    soundscape.playExecutionError({
      id: "exec-node",
      label: "Exec Error",
      errorMsg: "Out of memory",
    });
    expect(lastCue?.type).toBe("execution-error");
    expect(lastCue?.details).toContain("Out of memory");

    soundscape.playExecutionWarning({ id: "exec-node", label: "Exec Warn" });
    expect(lastCue?.type).toBe("execution-warning");
  });

  it("triggers edge-traversal audio cue with spatial travel", () => {
    soundscape.playEdgeTraversal({
      source: "node-A",
      target: "node-B",
      sourcePos: { x: -300, y: -100 },
      targetPos: { x: 300, y: 100 },
    });
    expect(lastCue?.type).toBe("edge-traversal");
    expect(lastCue?.details).toContain("node-A -> node-B");
  });

  it("triggers layout update and zoom tick cues", () => {
    soundscape.playLayoutUpdate({ nodeCount: 15, depth: 3 });
    expect(lastCue?.type).toBe("layout-update");

    soundscape.playZoomTick(1.5, "in");
    expect(lastCue?.type).toBe("zoom-tick");
    expect(lastCue?.details).toContain("1.50x");

    soundscape.playZoomTick(0.8, "out");
    expect(lastCue?.type).toBe("zoom-tick");
  });

  it("triggers anomaly alerts with varying severities", () => {
    (["low", "medium", "high", "critical"] as const).forEach((sev) => {
      soundscape.playAnomalyAlert(sev);
      expect(lastCue?.type).toBe("anomaly-alert");
      expect(lastCue?.details).toContain(sev);
    });
  });

  it("triggers boundary hit and filter toggle cues", () => {
    (["left", "right", "top", "bottom"] as const).forEach((dir) => {
      soundscape.playBoundaryHit(dir);
      expect(lastCue?.type).toBe("boundary-hit");
      expect(lastCue?.details).toContain(dir);
    });

    soundscape.playFilterToggle(true);
    expect(lastCue?.type).toBe("filter-toggle");
    soundscape.playFilterToggle(false);
    expect(lastCue?.type).toBe("filter-toggle");
  });

  it("triggers navigation step cues", () => {
    soundscape.playNavigationStep("down", { id: "n3", label: "Worker 3", x: 0, y: 200, depth: 2 });
    expect(lastCue?.type).toBe("navigation-step");
    expect(lastCue?.details).toContain("down");
    expect(lastCue?.details).toContain("Worker 3");
  });

  it("executes topological and directional graph scans", async () => {
    const nodes = [
      { id: "1", x: 200, y: 100, depth: 2 },
      { id: "2", x: -100, y: -200, depth: 0 },
      { id: "3", x: 0, y: 0, depth: 1 },
      { id: "4", x: -50, y: 50, depth: 1, status: "error" },
    ];

    await soundscape.sonifyGraphScan(nodes, "topological", 10);
    expect(lastCue?.type).toBe("layout-update");

    await soundscape.sonifyGraphScan(nodes, "horizontal", 10);
    await soundscape.sonifyGraphScan(nodes, "vertical", 10);
    await soundscape.sonifyGraphScan(nodes, "radial", 10);
  });
});
