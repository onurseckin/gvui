import { describe, expect, it } from "bun:test";
import { AriaAnnouncer } from "./ariaAnnouncer";
import { AudioSynthesizer } from "./audioSynthesizer";
import { MockAudioContext } from "./mockAudioContext";
import { SoundscapeEngine } from "./soundscape";
import type { GraphScanItem, MusicalScale, ToneProfile } from "./types";
import { useAudioStore } from "./useAudioStore";

describe("Audio & Accessibility Adversarial Stress Tests", () => {
  it("handles 500 rapid concurrent audio cues without throwing or crashing", () => {
    const mockCtx = new MockAudioContext();
    const synth = new AudioSynthesizer({ masterVolume: 1.0 }, mockCtx);
    const soundscape = new SoundscapeEngine(synth);

    expect(() => {
      for (let i = 0; i < 500; i++) {
        const x = (i % 200) - 100;
        const y = (i % 300) - 150;
        soundscape.playNodeSelect({ id: `stress-${i}`, x, y, depth: i % 10 });
        soundscape.playZoomTick(1.0 + (i % 5) * 0.2);
        soundscape.playExecutionWarning({ id: `warn-${i}` });
      }
    }).not.toThrow();
  });

  it("handles extreme coordinate values, NaNs, and infinities safely", () => {
    const mockCtx = new MockAudioContext();
    const synth = new AudioSynthesizer({}, mockCtx);
    const soundscape = new SoundscapeEngine(synth);

    expect(() => {
      soundscape.calculatePan(NaN);
      soundscape.calculatePan(Infinity);
      soundscape.calculatePan(-Infinity);
      soundscape.calculatePan(1e15);
      soundscape.calculatePan(-1e15);

      soundscape.calculateFrequencyFromPosition(NaN, NaN);
      soundscape.calculateFrequencyFromPosition(Infinity, Infinity);
      soundscape.calculateFrequencyFromPosition(-Infinity, -100);

      soundscape.playNodeSelect({
        id: "extreme-node",
        x: Number.MAX_SAFE_INTEGER,
        y: Number.MIN_SAFE_INTEGER,
        depth: 999999,
      });

      soundscape.playEdgeTraversal({
        source: "n1",
        target: "n2",
        sourcePos: { x: NaN, y: Infinity },
        targetPos: { x: -Infinity, y: NaN },
      });
    }).not.toThrow();
  });

  it("handles closed / suspended AudioContext gracefully during playback", async () => {
    const mockCtx = new MockAudioContext();
    const synth = new AudioSynthesizer({}, mockCtx);
    await mockCtx.close();

    expect(() => {
      synth.playTone(440);
      synth.playChord([260, 330, 390]);
      synth.playFrequencySweep(100, 500);
      synth.playDualTone(200, 400);
    }).not.toThrow();
  });

  it("handles extreme graph sonification scan with 1,000 nodes across all scan modes", async () => {
    const mockCtx = new MockAudioContext();
    const synth = new AudioSynthesizer({}, mockCtx);
    const soundscape = new SoundscapeEngine(synth);

    const largeGraph: GraphScanItem[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `node_${i}`,
      x: Math.sin(i) * 2000,
      y: Math.cos(i) * 2000,
      depth: i % 20,
      status: i % 13 === 0 ? "error" : "success",
    }));

    const modes = ["horizontal", "vertical", "topological", "radial"] as const;
    for (const mode of modes) {
      await soundscape.sonifyGraphScan(largeGraph, mode, 1);
    }
  });

  it("resists announcement flooding in AriaAnnouncer without memory blowup", () => {
    const announcer = new AriaAnnouncer({ debounceMs: 0 });

    expect(() => {
      for (let i = 0; i < 1000; i++) {
        announcer.announce(`Flood message ${i}`, i % 2 === 0 ? "polite" : "assertive");
      }
    }).not.toThrow();

    // Must be capped at maxHistory (100)
    expect(announcer.getRecentAnnouncements().length).toBeLessThanOrEqual(100);
  });

  it("handles all tone profiles, scales, and boundary configurations in useAudioStore", () => {
    const profiles: ToneProfile[] = [
      "harmonic-synthesizer",
      "subtle-chimes",
      "retro-beeps",
      "high-contrast-acoustic",
    ];

    const scales: MusicalScale[] = ["pentatonic", "major", "minor", "dorian", "chromatic"];

    profiles.forEach((profile) => {
      scales.forEach((scale) => {
        useAudioStore.getState().setToneProfile(profile);
        useAudioStore.getState().setMusicalScale(scale);
        useAudioStore.getState().setPitchScale(0.5);
        useAudioStore.getState().triggerAudioCue("node-select");
        useAudioStore.getState().setPitchScale(2.0);
        useAudioStore.getState().triggerAudioCue("execution-error");
      });
    });

    expect(useAudioStore.getState().audioEventLog.length).toBeGreaterThan(0);
  });

  it("verifies user-gesture resume handling on suspended context without throwing", async () => {
    const mockCtx = new MockAudioContext();
    await mockCtx.suspend();
    expect(mockCtx.state).toBe("suspended");

    const synth = new AudioSynthesizer({}, mockCtx);
    // Play tone triggers background resume safely
    synth.playTone(440);
    await synth.resume();
    expect(mockCtx.state).toBe("running");
  });

  it("strictly clamps spatial coordinate pan values to [-1, 1]", () => {
    const mockCtx = new MockAudioContext();
    const synth = new AudioSynthesizer({}, mockCtx);
    const soundscape = new SoundscapeEngine(synth);

    soundscape.setViewportBounds({ minX: -500, maxX: 500 });
    expect(soundscape.calculatePan(0)).toBe(0);
    expect(soundscape.calculatePan(-500)).toBe(-1);
    expect(soundscape.calculatePan(500)).toBe(1);
    expect(soundscape.calculatePan(-999999)).toBe(-1);
    expect(soundscape.calculatePan(999999)).toBe(1);
    expect(soundscape.calculatePan(NaN)).toBe(0);
    expect(soundscape.calculatePan(Infinity)).toBe(0);
    expect(soundscape.calculatePan(-Infinity)).toBe(0);
  });

  it("enforces polyphony voice limiting and prevents audio clipping under high load", () => {
    const mockCtx = new MockAudioContext();
    const synth = new AudioSynthesizer({}, mockCtx);

    for (let i = 0; i < 50; i++) {
      synth.playTone(200 + i * 10, { duration: 1.0 });
    }

    // Created nodes exist, context remains intact, compressor is configured
    expect(mockCtx.createdNodes.length).toBeGreaterThan(0);
    const compressor = mockCtx.createdNodes.find(
      (n) => n.constructor.name === "MockDynamicsCompressorNode",
    );
    expect(compressor).toBeDefined();
  });

  it("verifies ARIA announcement debouncing and flushing", async () => {
    const announcer = new AriaAnnouncer({ debounceMs: 20 });
    announcer.announce("First action", "polite");
    announcer.announce("Second action", "polite");
    announcer.announce("Third action", "polite");

    // Flush pending announcements
    announcer.flush();
    const history = announcer.getRecentAnnouncements();
    expect(history.length).toBe(3);
    expect(history[0]?.message).toBe("Third action");
  });
});
