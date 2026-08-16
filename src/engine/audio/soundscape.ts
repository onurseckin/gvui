import { AudioSynthesizer, getAudioSynthesizer } from "./audioSynthesizer";
import type {
  AudioCueType,
  GraphEdgeAudioContext,
  GraphNodeAudioContext,
  GraphScanItem,
  MusicalScale,
  SonificationScanMode,
  ViewportAudioBounds,
} from "./types";

// Standard Musical Frequencies (Hz)
export const NOTE_FREQUENCIES: Record<string, number> = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  F3: 174.61,
  Fs3: 185.0,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  Cs4: 277.18,
  D4: 293.66,
  Ds4: 311.13,
  E4: 329.63,
  F4: 349.23,
  Fs4: 369.99,
  G4: 392.0,
  Gs4: 415.3,
  A4: 440.0,
  As4: 466.16,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760.0,
  C7: 2093.0,
};

export const SCALE_FREQUENCIES: Record<MusicalScale, number[]> = {
  pentatonic: [
    NOTE_FREQUENCIES.C4,
    NOTE_FREQUENCIES.D4,
    NOTE_FREQUENCIES.E4,
    NOTE_FREQUENCIES.G4,
    NOTE_FREQUENCIES.A4,
    NOTE_FREQUENCIES.C5,
    NOTE_FREQUENCIES.D5,
    NOTE_FREQUENCIES.E5,
    NOTE_FREQUENCIES.G5,
    NOTE_FREQUENCIES.A5,
    NOTE_FREQUENCIES.C6,
    NOTE_FREQUENCIES.D6,
    NOTE_FREQUENCIES.E6,
    NOTE_FREQUENCIES.G6,
    NOTE_FREQUENCIES.A6,
  ],
  major: [
    NOTE_FREQUENCIES.C3,
    NOTE_FREQUENCIES.D3,
    NOTE_FREQUENCIES.E3,
    NOTE_FREQUENCIES.F3,
    NOTE_FREQUENCIES.G3,
    NOTE_FREQUENCIES.A3,
    NOTE_FREQUENCIES.B3,
    NOTE_FREQUENCIES.C4,
    NOTE_FREQUENCIES.D4,
    NOTE_FREQUENCIES.E4,
    NOTE_FREQUENCIES.F4,
    NOTE_FREQUENCIES.G4,
    NOTE_FREQUENCIES.A4,
    NOTE_FREQUENCIES.B4,
    NOTE_FREQUENCIES.C5,
    NOTE_FREQUENCIES.D5,
    NOTE_FREQUENCIES.E5,
    NOTE_FREQUENCIES.F5,
    NOTE_FREQUENCIES.G5,
    NOTE_FREQUENCIES.A5,
    NOTE_FREQUENCIES.B5,
    NOTE_FREQUENCIES.C6,
  ],
  minor: [
    NOTE_FREQUENCIES.C3,
    NOTE_FREQUENCIES.D3,
    NOTE_FREQUENCIES.Ds3 ?? 155.56,
    NOTE_FREQUENCIES.F3,
    NOTE_FREQUENCIES.G3,
    NOTE_FREQUENCIES.Gs3 ?? 207.65,
    NOTE_FREQUENCIES.As3 ?? 233.08,
    NOTE_FREQUENCIES.C4,
    NOTE_FREQUENCIES.D4,
    NOTE_FREQUENCIES.Ds4,
    NOTE_FREQUENCIES.F4,
    NOTE_FREQUENCIES.G4,
    NOTE_FREQUENCIES.Gs4,
    NOTE_FREQUENCIES.As4,
    NOTE_FREQUENCIES.C5,
  ],
  dorian: [
    NOTE_FREQUENCIES.C4,
    NOTE_FREQUENCIES.D4,
    NOTE_FREQUENCIES.Ds4,
    NOTE_FREQUENCIES.F4,
    NOTE_FREQUENCIES.G4,
    NOTE_FREQUENCIES.A4,
    NOTE_FREQUENCIES.As4,
    NOTE_FREQUENCIES.C5,
    NOTE_FREQUENCIES.D5,
    NOTE_FREQUENCIES.E5,
  ],
  chromatic: [
    NOTE_FREQUENCIES.C4,
    NOTE_FREQUENCIES.Cs4,
    NOTE_FREQUENCIES.D4,
    NOTE_FREQUENCIES.Ds4,
    NOTE_FREQUENCIES.E4,
    NOTE_FREQUENCIES.F4,
    NOTE_FREQUENCIES.Fs4,
    NOTE_FREQUENCIES.G4,
    NOTE_FREQUENCIES.Gs4,
    NOTE_FREQUENCIES.A4,
    NOTE_FREQUENCIES.As4,
    NOTE_FREQUENCIES.B4,
    NOTE_FREQUENCIES.C5,
    NOTE_FREQUENCIES.D5,
    NOTE_FREQUENCIES.E5,
    NOTE_FREQUENCIES.F5,
    NOTE_FREQUENCIES.G5,
  ],
};

export const DAG_DEPTH_CHORDS: Array<number[]> = [
  // Depth 0: C Major Triad (Root/Input)
  [NOTE_FREQUENCIES.C4, NOTE_FREQUENCIES.E4, NOTE_FREQUENCIES.G4],
  // Depth 1: D Minor / G Inversion (Orchestrator/Fan-out)
  [NOTE_FREQUENCIES.D4, NOTE_FREQUENCIES.F4, NOTE_FREQUENCIES.A4],
  // Depth 2: E Minor / Cmaj7
  [NOTE_FREQUENCIES.E4, NOTE_FREQUENCIES.G4, NOTE_FREQUENCIES.B4],
  // Depth 3: F Major (Execution Layer)
  [NOTE_FREQUENCIES.F4, NOTE_FREQUENCIES.A4, NOTE_FREQUENCIES.C5],
  // Depth 4: G Major Dominant (Verification / Router)
  [NOTE_FREQUENCIES.G4, NOTE_FREQUENCIES.B4, NOTE_FREQUENCIES.D5],
  // Depth 5: A Minor (Aggregation)
  [NOTE_FREQUENCIES.A4, NOTE_FREQUENCIES.C5, NOTE_FREQUENCIES.E5],
  // Depth 6+: C Major Octave Triad (Terminal / Success)
  [NOTE_FREQUENCIES.C5, NOTE_FREQUENCIES.E5, NOTE_FREQUENCIES.G5],
];

export class SoundscapeEngine {
  private synth: AudioSynthesizer;
  private viewportBounds: ViewportAudioBounds = {
    minX: -1000,
    maxX: 1000,
    minY: -1000,
    maxY: 1000,
    zoom: 1.0,
  };
  private onAudioCueCallback?: (type: AudioCueType, details?: string) => void;

  constructor(synth?: AudioSynthesizer) {
    this.synth = synth || getAudioSynthesizer();
  }

  public setSynthesizer(synth: AudioSynthesizer): void {
    this.synth = synth;
  }

  public setViewportBounds(bounds: Partial<ViewportAudioBounds>): void {
    this.viewportBounds = { ...this.viewportBounds, ...bounds };
  }

  public getViewportBounds(): ViewportAudioBounds {
    return { ...this.viewportBounds };
  }

  public onAudioCue(callback: (type: AudioCueType, details?: string) => void): void {
    this.onAudioCueCallback = callback;
  }

  private notifyCue(type: AudioCueType, details?: string): void {
    if (this.onAudioCueCallback) {
      try {
        this.onAudioCueCallback(type, details);
      } catch {
        // Callback safety
      }
    }
  }

  public calculatePan(x?: number): number {
    if (x === undefined || !Number.isFinite(x)) return 0;
    const { minX, maxX } = this.viewportBounds;
    const lo = Number.isFinite(minX) ? minX : -1000;
    const hi = Number.isFinite(maxX) ? maxX : 1000;
    const effectiveLo = Math.min(lo, hi);
    const effectiveHi = Math.max(lo, hi);
    const width = Math.max(1, effectiveHi - effectiveLo);
    const normalized = (x - effectiveLo) / width; // 0 to 1
    const pan = normalized * 2 - 1; // -1 to 1
    return Math.max(-1, Math.min(1, Number.isFinite(pan) ? pan : 0));
  }

  public calculateFrequencyFromPosition(
    y?: number,
    depth = 0,
    scale: MusicalScale = "pentatonic",
  ): number {
    const scaleNotes = SCALE_FREQUENCIES[scale] || SCALE_FREQUENCIES.pentatonic;
    if (y !== undefined && Number.isFinite(y)) {
      const { minY, maxY } = this.viewportBounds;
      const lo = Number.isFinite(minY) ? minY : -1000;
      const hi = Number.isFinite(maxY) ? maxY : 1000;
      const effectiveLo = Math.min(lo, hi);
      const effectiveHi = Math.max(lo, hi);
      const height = Math.max(1, effectiveHi - effectiveLo);
      // Invert Y: higher on screen = higher pitch
      const normalizedY = 1 - Math.max(0, Math.min(1, (y - effectiveLo) / height));
      const noteIndex = Math.min(
        scaleNotes.length - 1,
        Math.max(0, Math.floor(normalizedY * scaleNotes.length)),
      );
      return scaleNotes[noteIndex];
    }
    const safeDepth = Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 0;
    const depthIndex = safeDepth % scaleNotes.length;
    return scaleNotes[depthIndex];
  }

  public getChordForDepth(depth: number): number[] {
    const safeDepth = Math.max(0, Math.floor(depth));
    const chordIndex = Math.min(DAG_DEPTH_CHORDS.length - 1, safeDepth);
    return DAG_DEPTH_CHORDS[chordIndex];
  }

  // --- Graph Audio Cues ---

  public playNodeSelect(node: GraphNodeAudioContext): void {
    const pan = this.calculatePan(node.x);
    const depth = node.depth ?? 0;
    const freq = this.calculateFrequencyFromPosition(
      node.y,
      depth,
      this.synth.getConfig().musicalScale,
    );

    if (node.status === "error") {
      this.synth.playTone(NOTE_FREQUENCIES.Cs4, {
        pan,
        volume: 0.9,
        duration: 0.25,
        type: "sawtooth",
      });
      this.synth.playTone(NOTE_FREQUENCIES.Fs3, {
        pan,
        volume: 0.9,
        duration: 0.25,
        type: "sawtooth",
        delay: 0.05,
      });
    } else {
      const chord = this.getChordForDepth(depth);
      this.synth.playTone(freq, {
        pan,
        volume: 0.85,
        duration: 0.18,
        envelope: { attackTime: 0.005, decayTime: 0.08, sustainLevel: 0.3, releaseTime: 0.1 },
      });
      // Harmonic overtone
      if (chord[1]) {
        this.synth.playTone(chord[1], {
          pan: Math.min(1, pan + 0.1),
          volume: 0.45,
          duration: 0.15,
          delay: 0.02,
        });
      }
    }
    this.notifyCue("node-select", `Selected node: ${node.label || node.id}`);
  }

  public playNodeHover(node: GraphNodeAudioContext): void {
    const pan = this.calculatePan(node.x);
    const freq = this.calculateFrequencyFromPosition(
      node.y,
      node.depth ?? 0,
      this.synth.getConfig().musicalScale,
    );
    this.synth.playTone(freq * 1.5, {
      pan,
      volume: 0.25,
      duration: 0.06,
      envelope: { attackTime: 0.002, decayTime: 0.03, sustainLevel: 0.1, releaseTime: 0.03 },
    });
    this.notifyCue("node-hover", `Hovered node: ${node.label || node.id}`);
  }

  public playExecutionStart(node?: GraphNodeAudioContext): void {
    const pan = node?.x !== undefined ? this.calculatePan(node.x) : 0;
    const depth = node?.depth ?? 0;
    const chord = this.getChordForDepth(depth);

    // Rising arpeggio for start
    this.synth.playArpeggio(chord, 35, {
      pan,
      volume: 0.75,
      duration: 0.18,
      type: "triangle",
    });
    this.notifyCue("execution-start", `Execution started: ${node?.label || node?.id || "Graph"}`);
  }

  public playExecutionComplete(node?: GraphNodeAudioContext): void {
    const pan = node?.x !== undefined ? this.calculatePan(node.x) : 0;
    const depth = node?.depth ?? 0;
    const chord = this.getChordForDepth(depth);

    // Major resolving chime
    this.synth.playChord([...chord, chord[0] * 2], {
      pan,
      volume: 0.9,
      duration: 0.45,
      envelope: { attackTime: 0.01, decayTime: 0.15, sustainLevel: 0.4, releaseTime: 0.3 },
    });
    this.notifyCue(
      "execution-complete",
      `Execution complete: ${node?.label || node?.id || "Graph"}`,
    );
  }

  public playExecutionError(node?: GraphNodeAudioContext): void {
    const pan = node?.x !== undefined ? this.calculatePan(node.x) : 0;
    // Discordant tritone drop
    this.synth.playFrequencySweep(520, 180, 0.35, {
      pan,
      volume: 0.95,
      type: "sawtooth",
    });
    this.synth.playTone(NOTE_FREQUENCIES.Fs3, {
      pan,
      volume: 0.8,
      duration: 0.4,
      type: "sawtooth",
      delay: 0.05,
    });
    this.notifyCue(
      "execution-error",
      `Execution error: ${node?.label || node?.id || "Graph"}${node?.errorMsg ? `: ${node.errorMsg}` : ""}`,
    );
  }

  public playExecutionWarning(node?: GraphNodeAudioContext): void {
    const pan = node?.x !== undefined ? this.calculatePan(node.x) : 0;
    // Fast double pulse
    this.synth.playTone(NOTE_FREQUENCIES.As4, { pan, volume: 0.7, duration: 0.08 });
    this.synth.playTone(NOTE_FREQUENCIES.B4, { pan, volume: 0.7, duration: 0.1, delay: 0.1 });
    this.notifyCue("execution-warning", `Warning: ${node?.label || node?.id || "Graph"}`);
  }

  public playEdgeTraversal(edge: GraphEdgeAudioContext): void {
    const startPan = edge.sourcePos ? this.calculatePan(edge.sourcePos.x) : -0.5;
    const endPan = edge.targetPos ? this.calculatePan(edge.targetPos.x) : 0.5;
    const startFreq = edge.sourcePos ? this.calculateFrequencyFromPosition(edge.sourcePos.y) : 330;
    const endFreq = edge.targetPos ? this.calculateFrequencyFromPosition(edge.targetPos.y) : 440;

    // Pulse sweep traversing source to target
    this.synth.playTone(startFreq, {
      pan: startPan,
      volume: 0.6,
      duration: 0.12,
      envelope: { attackTime: 0.005, decayTime: 0.06, sustainLevel: 0.2, releaseTime: 0.05 },
    });
    this.synth.playTone(endFreq, {
      pan: endPan,
      volume: 0.7,
      duration: 0.15,
      delay: 0.08,
      envelope: { attackTime: 0.005, decayTime: 0.08, sustainLevel: 0.2, releaseTime: 0.06 },
    });
    this.notifyCue("edge-traversal", `Edge traversed: ${edge.source} -> ${edge.target}`);
  }

  public playLayoutUpdate(metrics?: { nodeCount?: number; depth?: number }): void {
    const count = metrics?.nodeCount ?? 5;
    const notes = [
      NOTE_FREQUENCIES.C4,
      NOTE_FREQUENCIES.E4,
      NOTE_FREQUENCIES.G4,
      NOTE_FREQUENCIES.C5,
    ];
    this.synth.playArpeggio(notes, 40, {
      volume: 0.6,
      duration: 0.25,
      pan: 0,
    });
    this.notifyCue("layout-update", `Layout recalculated (${count} nodes)`);
  }

  public playZoomTick(zoomLevel: number, direction: "in" | "out" = "in"): void {
    const clampedZoom = Math.max(0.1, Math.min(5.0, zoomLevel));
    const baseFreq = direction === "in" ? 600 : 400;
    const freq = baseFreq * Math.pow(clampedZoom, 0.4);

    this.synth.playTone(freq, {
      volume: 0.2,
      duration: 0.04,
      pan: 0,
      envelope: { attackTime: 0.001, decayTime: 0.02, sustainLevel: 0.05, releaseTime: 0.02 },
      type: "triangle",
    });
    this.notifyCue("zoom-tick", `Zoom ${direction}: ${zoomLevel.toFixed(2)}x`);
  }

  public playAnomalyAlert(severity: "low" | "medium" | "high" | "critical" = "high"): void {
    const config = {
      low: { freq: 440, count: 1, interval: 0.1 },
      medium: { freq: 587.33, count: 2, interval: 0.12 },
      high: { freq: 783.99, count: 3, interval: 0.1 },
      critical: { freq: 1046.5, count: 4, interval: 0.08 },
    }[severity];

    for (let i = 0; i < config.count; i++) {
      this.synth.playTone(config.freq, {
        volume: 0.85,
        duration: 0.08,
        delay: i * config.interval,
        type: severity === "critical" ? "sawtooth" : "square",
        envelope: { attackTime: 0.002, decayTime: 0.04, sustainLevel: 0.5, releaseTime: 0.04 },
      });
    }
    this.notifyCue("anomaly-alert", `Anomaly detected (${severity} severity)`);
  }

  public playBoundaryHit(direction: "left" | "right" | "top" | "bottom"): void {
    const pan = direction === "left" ? -0.9 : direction === "right" ? 0.9 : 0;
    const freq = direction === "top" ? 220 : 130;

    this.synth.playTone(freq, {
      pan,
      volume: 0.5,
      duration: 0.12,
      type: "triangle",
      envelope: { attackTime: 0.002, decayTime: 0.08, sustainLevel: 0.1, releaseTime: 0.04 },
    });
    this.notifyCue("boundary-hit", `Canvas boundary reached: ${direction}`);
  }

  public playFilterToggle(enabled: boolean): void {
    const freq = enabled ? 880 : 440;
    this.synth.playTone(freq, {
      volume: 0.4,
      duration: 0.07,
      envelope: { attackTime: 0.002, decayTime: 0.04, sustainLevel: 0.2, releaseTime: 0.03 },
    });
    this.notifyCue("filter-toggle", `Filter ${enabled ? "activated" : "deactivated"}`);
  }

  public playNavigationStep(direction: string, node?: GraphNodeAudioContext): void {
    const pan = node?.x !== undefined ? this.calculatePan(node.x) : 0;
    const freq = node
      ? this.calculateFrequencyFromPosition(node.y, node.depth ?? 0)
      : NOTE_FREQUENCIES.E4;

    this.synth.playTone(freq, {
      pan,
      volume: 0.5,
      duration: 0.1,
      envelope: { attackTime: 0.003, decayTime: 0.05, sustainLevel: 0.2, releaseTime: 0.04 },
    });
    this.notifyCue(
      "navigation-step",
      `Navigated ${direction} to ${node?.label || node?.id || "node"}`,
    );
  }

  // --- Topological / Spatial Graph Sonification Scan ---
  public async sonifyGraphScan(
    nodes: GraphScanItem[],
    mode: SonificationScanMode = "topological",
    speedMs = 60,
  ): Promise<void> {
    if (!nodes || nodes.length === 0) return;

    const sortedNodes = [...nodes];
    if (mode === "horizontal") {
      sortedNodes.sort((a, b) => a.x - b.x);
    } else if (mode === "vertical") {
      sortedNodes.sort((a, b) => a.y - b.y);
    } else if (mode === "topological") {
      sortedNodes.sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.x - b.x;
      });
    } else if (mode === "radial") {
      const centerX = nodes.reduce((sum, n) => sum + n.x, 0) / nodes.length;
      const centerY = nodes.reduce((sum, n) => sum + n.y, 0) / nodes.length;
      sortedNodes.sort((a, b) => {
        const distA = Math.hypot(a.x - centerX, a.y - centerY);
        const distB = Math.hypot(b.x - centerX, b.y - centerY);
        return distA - distB;
      });
    }

    sortedNodes.forEach((node, idx) => {
      const delaySec = (idx * speedMs) / 1000;
      const pan = this.calculatePan(node.x);
      const freq = this.calculateFrequencyFromPosition(node.y, node.depth);

      if (node.status === "error") {
        this.synth.playTone(NOTE_FREQUENCIES.Fs3, {
          pan,
          volume: 0.8,
          duration: 0.14,
          type: "sawtooth",
          delay: delaySec,
        });
      } else {
        this.synth.playTone(freq, {
          pan,
          volume: 0.6,
          duration: 0.12,
          delay: delaySec,
          envelope: { attackTime: 0.005, decayTime: 0.06, sustainLevel: 0.2, releaseTime: 0.05 },
        });
      }
    });

    this.notifyCue(
      "layout-update",
      `Graph sonification scan completed (${sortedNodes.length} nodes, mode: ${mode})`,
    );
  }
}

let defaultSoundscapeInstance: SoundscapeEngine | null = null;

export function getSoundscapeEngine(): SoundscapeEngine {
  if (!defaultSoundscapeInstance) {
    defaultSoundscapeInstance = new SoundscapeEngine();
  }
  return defaultSoundscapeInstance;
}
