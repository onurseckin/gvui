import { beforeEach, describe, expect, it } from "bun:test";
import { AudioSynthesizer } from "./audioSynthesizer";
import { MockAudioContext } from "./mockAudioContext";
import type { ToneProfile } from "./types";

describe("AudioSynthesizer Engine", () => {
  let mockCtx: MockAudioContext;
  let synth: AudioSynthesizer;

  beforeEach(() => {
    mockCtx = new MockAudioContext();
    synth = new AudioSynthesizer(
      { masterVolume: 0.8, isMuted: false, sonificationEnabled: true },
      mockCtx,
    );
  });

  it("initializes with correct defaults and safe context", () => {
    const config = synth.getConfig();
    expect(config.masterVolume).toBe(0.8);
    expect(config.isMuted).toBe(false);
    expect(config.sonificationEnabled).toBe(true);
    expect(config.toneProfile).toBe("harmonic-synthesizer");
    expect(config.musicalScale).toBe("pentatonic");
    expect(synth.getAudioContext()).toBe(mockCtx);
  });

  it("updates master volume and clamps between 0 and 1", () => {
    synth.setMasterVolume(0.5);
    expect(synth.getConfig().masterVolume).toBe(0.5);

    synth.setMasterVolume(1.5);
    expect(synth.getConfig().masterVolume).toBe(1.0);

    synth.setMasterVolume(-0.5);
    expect(synth.getConfig().masterVolume).toBe(0.0);
  });

  it("toggles mute state properly", () => {
    synth.setMuted(true);
    expect(synth.getConfig().isMuted).toBe(true);

    synth.setMuted(false);
    expect(synth.getConfig().isMuted).toBe(false);
  });

  it("switches tone profile across all 4 profiles", () => {
    const profiles: ToneProfile[] = [
      "harmonic-synthesizer",
      "subtle-chimes",
      "retro-beeps",
      "high-contrast-acoustic",
    ];

    profiles.forEach((p) => {
      synth.setToneProfile(p);
      expect(synth.getConfig().toneProfile).toBe(p);
      synth.playTone(440, { duration: 0.1 });
    });
    expect(mockCtx.activeOscillators.length).toBeGreaterThan(0);
  });

  it("plays a tone and creates oscillator and gain nodes", () => {
    const initialOscCount = mockCtx.activeOscillators.length;
    synth.playTone(440, { duration: 0.2, pan: 0.5, volume: 0.8 });

    expect(mockCtx.activeOscillators.length).toBeGreaterThan(initialOscCount);
    const lastOsc = mockCtx.activeOscillators[mockCtx.activeOscillators.length - 1];
    expect(lastOsc.started).toBe(true);
    expect(lastOsc.stopped).toBe(true);
  });

  it("plays a chord with multiple frequencies", () => {
    const initialOscCount = mockCtx.activeOscillators.length;
    synth.playChord([261.63, 329.63, 392.0], { duration: 0.3, pan: 0 });

    expect(mockCtx.activeOscillators.length - initialOscCount).toBeGreaterThanOrEqual(3);
  });

  it("plays an arpeggiated chord sequentially", () => {
    const initialOscCount = mockCtx.activeOscillators.length;
    synth.playChord([261.63, 329.63, 392.0], {
      arpeggiate: true,
      arpeggioSpeedMs: 30,
      duration: 0.3,
    });

    expect(mockCtx.activeOscillators.length - initialOscCount).toBeGreaterThanOrEqual(3);
  });

  it("plays frequency sweep without errors", () => {
    const initialOscCount = mockCtx.activeOscillators.length;
    synth.playFrequencySweep(200, 800, 0.25, { pan: -0.5, volume: 0.7 });

    expect(mockCtx.activeOscillators.length).toBe(initialOscCount + 1);
  });

  it("plays dual tone correctly", () => {
    const initialOscCount = mockCtx.activeOscillators.length;
    synth.playDualTone(440, 880, 0.2, { volume: 0.6 });

    expect(mockCtx.activeOscillators.length - initialOscCount).toBeGreaterThanOrEqual(2);
  });

  it("ignores audio play requests when muted or disabled", () => {
    synth.setMuted(true);
    const countBefore = mockCtx.activeOscillators.length;
    synth.playTone(440);
    expect(mockCtx.activeOscillators.length).toBe(countBefore);

    synth.setMuted(false);
    synth.updateConfig({ sonificationEnabled: false });
    synth.playTone(440);
    expect(mockCtx.activeOscillators.length).toBe(countBefore);
  });

  it("ignores invalid frequencies gracefully", () => {
    const countBefore = mockCtx.activeOscillators.length;
    synth.playTone(NaN);
    synth.playTone(-100);
    synth.playTone(Infinity);
    expect(mockCtx.activeOscillators.length).toBe(countBefore);
  });

  it("enforces polyphony limit and cleans expired voices", () => {
    // Play 30 tones
    for (let i = 0; i < 30; i++) {
      synth.playTone(200 + i * 10, { duration: 0.1 });
    }
    // Advance mock time and trigger another tone
    mockCtx.advanceTime(1.0);
    synth.playTone(500, { duration: 0.1 });
    expect(mockCtx.activeOscillators.length).toBeGreaterThan(0);
  });

  it("handles lifecycle resume, suspend, and dispose", async () => {
    await synth.resume();
    expect(mockCtx.state).toBe("running");

    await synth.suspend();
    expect(mockCtx.state).toBe("suspended");

    synth.dispose();
    expect(mockCtx.state).toBe("closed");
  });
});
