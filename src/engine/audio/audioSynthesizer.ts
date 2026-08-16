import {
  createSafeAudioContext,
  safeConnect,
  type SafeAudioContext,
  type SafeAudioNode,
  type SafeBiquadFilterNode,
  type SafeDynamicsCompressorNode,
  type SafeGainNode,
  type SafeOscillatorNode,
  type SafeStereoPannerNode,
} from "./mockAudioContext";
import type {
  AudioEngineConfig,
  EnvelopeOptions,
  PlayChordOptions,
  PlayToneOptions,
  ToneProfile,
} from "./types";

export interface ActiveVoice {
  id: string;
  oscillators: SafeOscillatorNode[];
  gainNode: SafeGainNode;
  pannerNode?: SafeStereoPannerNode;
  filterNode?: SafeBiquadFilterNode;
  stopTime: number;
}

const DEFAULT_CONFIG: AudioEngineConfig = {
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
};

export class AudioSynthesizer {
  private ctx: SafeAudioContext | null = null;
  private masterGain: SafeGainNode | null = null;
  private compressor: SafeDynamicsCompressorNode | null = null;
  private config: AudioEngineConfig;
  private activeVoices: Map<string, ActiveVoice> = new Map();
  private maxPolyphony = 16;
  private voiceCounter = 0;
  private isInitialized = false;
  private boundUnlockHandler: (() => void) | null = null;

  constructor(initialConfig?: Partial<AudioEngineConfig>, customContext?: SafeAudioContext) {
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
    if (customContext) {
      this.ctx = customContext;
      this.initNodes();
    }
    this.setupUserGestureUnlock();
  }

  public getConfig(): AudioEngineConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<AudioEngineConfig>): void {
    this.config = { ...this.config, ...updates };
    if (this.masterGain && this.ctx) {
      const targetGain =
        this.config.isMuted || !this.config.sonificationEnabled
          ? 0
          : Math.max(0, Math.min(1, this.config.masterVolume));
      this.masterGain.gain.setValueAtTime(targetGain, this.ctx.currentTime);
    }
  }

  public getAudioContext(): SafeAudioContext {
    if (!this.ctx) {
      this.ctx = createSafeAudioContext();
      this.initNodes();
      this.setupUserGestureUnlock();
    }
    return this.ctx;
  }

  private setupUserGestureUnlock(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    if (this.boundUnlockHandler) return;

    const unlock = () => {
      if (this.ctx && this.ctx.state === ("suspended" as AudioContextState)) {
        this.ctx.resume().catch(() => {
          // Ignored if browser blocks resume outside active gesture
        });
      }
      this.removeUserGestureUnlock();
    };

    this.boundUnlockHandler = unlock;
    const events = ["pointerdown", "touchstart", "keydown", "click"];
    events.forEach((evt) => {
      document.addEventListener(evt, unlock, { once: true, passive: true });
    });
  }

  private removeUserGestureUnlock(): void {
    if (typeof document === "undefined" || !this.boundUnlockHandler) return;
    const events = ["pointerdown", "touchstart", "keydown", "click"];
    events.forEach((evt) => {
      document.removeEventListener(evt, this.boundUnlockHandler as EventListener);
    });
    this.boundUnlockHandler = null;
  }

  private initNodes(): void {
    if (!this.ctx || this.isInitialized) return;
    try {
      this.masterGain = this.ctx.createGain();
      this.compressor = this.ctx.createDynamicsCompressor();

      // Configure anti-clipping dynamics compressor
      this.compressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
      this.compressor.knee.setValueAtTime(30, this.ctx.currentTime);
      this.compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressor.release.setValueAtTime(0.25, this.ctx.currentTime);

      const initialVolume =
        this.config.isMuted || !this.config.sonificationEnabled
          ? 0
          : Math.max(0, Math.min(1, this.config.masterVolume));

      this.masterGain.gain.setValueAtTime(initialVolume, this.ctx.currentTime);
      safeConnect(this.compressor, this.masterGain);
      safeConnect(this.masterGain, this.ctx.destination);
      this.isInitialized = true;
    } catch {
      // AudioContext initialization fallback
    }
  }

  public async resume(): Promise<void> {
    const ctx = this.getAudioContext();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // Ignored if gesture required
      }
    }
  }

  public async suspend(): Promise<void> {
    if (this.ctx && this.ctx.state === "running") {
      try {
        await this.ctx.suspend();
      } catch {
        // Suspension fallback
      }
    }
  }

  public setMasterVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.updateConfig({ masterVolume: clamped });
  }

  public setMuted(isMuted: boolean): void {
    this.updateConfig({ isMuted });
  }

  public setToneProfile(profile: ToneProfile): void {
    this.updateConfig({ toneProfile: profile });
  }

  public setSpatialAudioEnabled(enabled: boolean): void {
    this.updateConfig({ spatialAudioEnabled: enabled });
  }

  private cleanOldVoices(currentTime: number): void {
    for (const [id, voice] of this.activeVoices.entries()) {
      if (voice.stopTime <= currentTime) {
        this.disposeVoice(id);
      }
    }
  }

  private enforcePolyphonyLimit(): void {
    while (this.activeVoices.size >= this.maxPolyphony) {
      const oldestKey = this.activeVoices.keys().next().value;
      if (oldestKey !== undefined) {
        this.disposeVoice(oldestKey);
      } else {
        break;
      }
    }
  }

  private disposeVoice(id: string): void {
    const voice = this.activeVoices.get(id);
    if (!voice) return;
    try {
      voice.oscillators.forEach((osc) => {
        try {
          osc.stop();
          osc.disconnect();
        } catch {
          // already stopped
        }
      });
      voice.gainNode.disconnect();
      voice.pannerNode?.disconnect();
      voice.filterNode?.disconnect();
    } catch {
      // Disconnection fallback
    }
    this.activeVoices.delete(id);
  }

  private applyEnvelope(
    gainParam: {
      setValueAtTime: (v: number, t: number) => unknown;
      linearRampToValueAtTime: (v: number, t: number) => unknown;
      exponentialRampToValueAtTime: (v: number, t: number) => unknown;
    },
    startTime: number,
    duration: number,
    envelope?: EnvelopeOptions,
    peakVolume = 1.0,
  ): number {
    const attack = Math.max(0.002, envelope?.attackTime ?? 0.02);
    const decay = Math.max(0.01, envelope?.decayTime ?? 0.08);
    const sustain = Math.max(0.0001, Math.min(1, envelope?.sustainLevel ?? 0.4));
    const release = Math.max(0.02, envelope?.releaseTime ?? 0.1);
    const peak = Math.max(0.0001, Math.min(1, (envelope?.peakGain ?? 1.0) * peakVolume));

    const attackEnd = startTime + attack;
    const decayEnd = attackEnd + decay;
    const sustainEnd = Math.max(decayEnd, startTime + duration - release);
    const stopTime = sustainEnd + release;

    gainParam.setValueAtTime(0.0001, startTime);
    gainParam.linearRampToValueAtTime(peak, attackEnd);
    gainParam.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), decayEnd);
    if (sustainEnd > decayEnd) {
      gainParam.setValueAtTime(Math.max(0.0001, peak * sustain), sustainEnd);
    }
    gainParam.exponentialRampToValueAtTime(0.0001, stopTime);

    return stopTime;
  }

  public playTone(frequency: number, options?: PlayToneOptions): void {
    if (!this.config.sonificationEnabled || this.config.isMuted) return;
    if (!Number.isFinite(frequency) || frequency <= 0) return;

    const ctx = this.getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {
        // User gesture resume fallback
      });
    }

    this.cleanOldVoices(ctx.currentTime);
    this.enforcePolyphonyLimit();

    const startTime = ctx.currentTime + (options?.delay ?? 0);
    const duration = Math.max(0.03, options?.duration ?? 0.2);
    const polyphonyHeadroom = Math.min(
      1.0,
      1.0 / Math.sqrt(Math.max(1, this.activeVoices.size + 1)),
    );
    const volumeMultiplier = Math.max(0, Math.min(1, options?.volume ?? 1.0)) * polyphonyHeadroom;
    const pitchShift = options?.pitchShift ?? 0;
    const finalFreq = Math.max(20, Math.min(20000, frequency * Math.pow(2, pitchShift / 12)));

    const voiceGain = ctx.createGain();
    let currentOutNode: SafeAudioNode = voiceGain;

    // Filter
    let filterNode: SafeBiquadFilterNode | undefined;
    if (options?.filterFreq || this.config.toneProfile === "harmonic-synthesizer") {
      filterNode = ctx.createBiquadFilter();
      filterNode.type = options?.filterType ?? "lowpass";
      filterNode.frequency.setValueAtTime(
        options?.filterFreq ?? (this.config.toneProfile === "harmonic-synthesizer" ? 3200 : 8000),
        startTime,
      );
      filterNode.Q.setValueAtTime(options?.filterQ ?? 1.5, startTime);
      safeConnect(voiceGain, filterNode);
      currentOutNode = filterNode;
    }

    // Spatial Panning with strict [-1, 1] clamping
    let pannerNode: SafeStereoPannerNode | undefined;
    if (this.config.spatialAudioEnabled && typeof ctx.createStereoPanner === "function") {
      const rawPan = options?.pan;
      const panValue = Number.isFinite(rawPan) ? Math.max(-1, Math.min(1, rawPan as number)) : 0;
      pannerNode = ctx.createStereoPanner();
      pannerNode.pan.setValueAtTime(panValue, startTime);
      safeConnect(currentOutNode, pannerNode);
      currentOutNode = pannerNode;
    }

    // Connect to destination / compressor
    if (this.compressor) {
      safeConnect(currentOutNode, this.compressor);
    } else if (this.masterGain) {
      safeConnect(currentOutNode, this.masterGain);
    } else {
      safeConnect(currentOutNode, ctx.destination);
    }

    const oscs: SafeOscillatorNode[] = [];
    const profile = this.config.toneProfile;

    if (profile === "subtle-chimes") {
      // Metallic chime partials
      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(finalFreq, startTime);
      safeConnect(osc1, voiceGain);
      oscs.push(osc1);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(finalFreq * 2.76, startTime);
      safeConnect(osc2, voiceGain);
      oscs.push(osc2);
    } else if (profile === "retro-beeps") {
      // 8-bit chiptune square/triangle
      const osc = ctx.createOscillator();
      osc.type = options?.type ?? "square";
      osc.frequency.setValueAtTime(finalFreq, startTime);
      safeConnect(osc, voiceGain);
      oscs.push(osc);
    } else if (profile === "high-contrast-acoustic") {
      // Sharp, distinct dual wave with high contrast
      const osc1 = ctx.createOscillator();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(finalFreq, startTime);
      safeConnect(osc1, voiceGain);
      oscs.push(osc1);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(finalFreq * 2, startTime);
      safeConnect(osc2, voiceGain);
      oscs.push(osc2);
    } else {
      // Harmonic Synthesizer: warm detuned saw + sub sine
      const osc1 = ctx.createOscillator();
      osc1.type = options?.type ?? "sawtooth";
      osc1.frequency.setValueAtTime(finalFreq, startTime);
      osc1.detune.setValueAtTime(options?.detune ?? -4, startTime);
      safeConnect(osc1, voiceGain);
      oscs.push(osc1);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(finalFreq, startTime);
      osc2.detune.setValueAtTime(options?.detune ?? 4, startTime);
      safeConnect(osc2, voiceGain);
      oscs.push(osc2);
    }

    const defaultEnvelopes: Record<ToneProfile, EnvelopeOptions> = {
      "harmonic-synthesizer": {
        attackTime: 0.02,
        decayTime: 0.1,
        sustainLevel: 0.5,
        releaseTime: 0.15,
      },
      "subtle-chimes": { attackTime: 0.005, decayTime: 0.25, sustainLevel: 0.1, releaseTime: 0.3 },
      "retro-beeps": { attackTime: 0.002, decayTime: 0.04, sustainLevel: 0.6, releaseTime: 0.05 },
      "high-contrast-acoustic": {
        attackTime: 0.003,
        decayTime: 0.06,
        sustainLevel: 0.7,
        releaseTime: 0.08,
      },
    };

    const chosenEnvelope = options?.envelope ?? defaultEnvelopes[profile];
    const stopTime = this.applyEnvelope(
      voiceGain.gain,
      startTime,
      duration,
      chosenEnvelope,
      volumeMultiplier,
    );

    oscs.forEach((osc) => {
      osc.start(startTime);
      osc.stop(stopTime);
    });

    const voiceId = `voice_${++this.voiceCounter}`;
    this.activeVoices.set(voiceId, {
      id: voiceId,
      oscillators: oscs,
      gainNode: voiceGain,
      pannerNode,
      filterNode,
      stopTime,
    });
  }

  public playChord(frequencies: number[], options?: PlayChordOptions): void {
    if (!this.config.sonificationEnabled || this.config.isMuted) return;
    if (!frequencies || frequencies.length === 0) return;

    const basePan = options?.pan ?? 0;
    const duration = options?.duration ?? 0.4;
    const volume = (options?.volume ?? 1.0) / Math.max(1, Math.sqrt(frequencies.length));

    if (options?.arpeggiate) {
      const stepMs = options.arpeggioSpeedMs ?? 40;
      frequencies.forEach((freq, idx) => {
        this.playTone(freq, {
          duration: duration - (idx * stepMs) / 1000,
          volume,
          type: options.type,
          pan: basePan,
          envelope: options.envelope,
          filterFreq: options.filterFreq,
          delay: (idx * stepMs) / 1000,
        });
      });
    } else {
      frequencies.forEach((freq, idx) => {
        // Slight pan spread for stereo width
        const spreadPan = Math.max(
          -1,
          Math.min(1, basePan + (idx - (frequencies.length - 1) / 2) * 0.15),
        );
        this.playTone(freq, {
          duration,
          volume,
          type: options?.type,
          pan: spreadPan,
          envelope: options?.envelope,
          filterFreq: options?.filterFreq,
        });
      });
    }
  }

  public playArpeggio(frequencies: number[], stepDurationMs = 50, options?: PlayToneOptions): void {
    if (!this.config.sonificationEnabled || this.config.isMuted) return;
    frequencies.forEach((freq, idx) => {
      this.playTone(freq, {
        ...options,
        delay: (options?.delay ?? 0) + (idx * stepDurationMs) / 1000,
        duration: options?.duration ?? 0.15,
      });
    });
  }

  public playFrequencySweep(
    startFreq: number,
    endFreq: number,
    duration = 0.25,
    options?: PlayToneOptions,
  ): void {
    if (!this.config.sonificationEnabled || this.config.isMuted) return;
    const ctx = this.getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {
        // User gesture resume fallback
      });
    }

    const startTime = ctx.currentTime + (options?.delay ?? 0);
    const stopTime = startTime + duration;

    const osc = ctx.createOscillator();
    osc.type = options?.type ?? (this.config.toneProfile === "retro-beeps" ? "square" : "sine");
    osc.frequency.setValueAtTime(Math.max(20, startFreq), startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), stopTime);

    const gain = ctx.createGain();
    const peak = options?.volume ?? 0.8;
    this.applyEnvelope(
      gain.gain,
      startTime,
      duration,
      options?.envelope ?? {
        attackTime: 0.01,
        decayTime: duration * 0.5,
        sustainLevel: 0.3,
        releaseTime: 0.05,
      },
      peak,
    );

    let currentOut: SafeAudioNode = gain;
    let panner: SafeStereoPannerNode | undefined;
    if (this.config.spatialAudioEnabled && typeof ctx.createStereoPanner === "function") {
      const rawPan = options?.pan;
      const panValue = Number.isFinite(rawPan) ? Math.max(-1, Math.min(1, rawPan as number)) : 0;
      panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(panValue, startTime);
      safeConnect(currentOut, panner);
      currentOut = panner;
    }

    if (this.masterGain) {
      safeConnect(currentOut, this.masterGain);
    } else {
      safeConnect(currentOut, ctx.destination);
    }

    safeConnect(osc, gain);
    osc.start(startTime);
    osc.stop(stopTime);

    const voiceId = `voice_sweep_${++this.voiceCounter}`;
    this.activeVoices.set(voiceId, {
      id: voiceId,
      oscillators: [osc],
      gainNode: gain,
      pannerNode: panner,
      stopTime,
    });
  }

  public playDualTone(
    freq1: number,
    freq2: number,
    duration = 0.2,
    options?: PlayToneOptions,
  ): void {
    const halfVol = (options?.volume ?? 1.0) * 0.7;
    this.playTone(freq1, { ...options, duration, volume: halfVol });
    this.playTone(freq2, { ...options, duration, volume: halfVol });
  }

  public dispose(): void {
    this.removeUserGestureUnlock();
    for (const id of Array.from(this.activeVoices.keys())) {
      this.disposeVoice(id);
    }
    if (this.ctx && this.ctx.state !== "closed") {
      void this.ctx.close();
    }
    this.ctx = null;
    this.masterGain = null;
    this.compressor = null;
    this.isInitialized = false;
  }
}

let defaultSynthesizerInstance: AudioSynthesizer | null = null;

export function getAudioSynthesizer(): AudioSynthesizer {
  if (!defaultSynthesizerInstance) {
    defaultSynthesizerInstance = new AudioSynthesizer();
  }
  return defaultSynthesizerInstance;
}
