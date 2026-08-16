export type ToneProfile =
  | "harmonic-synthesizer"
  | "subtle-chimes"
  | "retro-beeps"
  | "high-contrast-acoustic";

export type MusicalScale = "pentatonic" | "major" | "minor" | "dorian" | "chromatic";

export type AudioCueType =
  | "node-select"
  | "node-hover"
  | "execution-start"
  | "execution-complete"
  | "execution-error"
  | "execution-warning"
  | "edge-traversal"
  | "layout-update"
  | "zoom-tick"
  | "anomaly-alert"
  | "boundary-hit"
  | "filter-toggle"
  | "navigation-step";

export type AriaVerbosity = "minimal" | "standard" | "verbose";

export type AriaPoliteness = "polite" | "assertive" | "off";

export interface AriaAnnouncement {
  id: string;
  message: string;
  politeness: AriaPoliteness;
  timestamp: number;
  category?: string;
}

export interface AudioLogEntry {
  id: string;
  type: AudioCueType;
  timestamp: number;
  volume: number;
  frequency?: number;
  pan?: number;
  details?: string;
}

export interface EnvelopeOptions {
  attackTime?: number;
  decayTime?: number;
  sustainLevel?: number;
  releaseTime?: number;
  peakGain?: number;
}

export interface PlayToneOptions {
  duration?: number;
  type?: OscillatorType;
  pan?: number;
  volume?: number;
  pitchShift?: number;
  envelope?: EnvelopeOptions;
  filterFreq?: number;
  filterType?: BiquadFilterType;
  filterQ?: number;
  detune?: number;
  delay?: number;
}

export interface PlayChordOptions {
  duration?: number;
  pan?: number;
  volume?: number;
  type?: OscillatorType;
  envelope?: EnvelopeOptions;
  arpeggiate?: boolean;
  arpeggioSpeedMs?: number;
  filterFreq?: number;
}

export interface GraphNodeAudioContext {
  id: string;
  label?: string;
  x?: number;
  y?: number;
  depth?: number;
  kind?: string;
  status?: string;
  inputCount?: number;
  outputCount?: number;
  tokens?: number;
  durationMs?: number;
  errorMsg?: string;
}

export interface GraphEdgeAudioContext {
  id?: string;
  source: string;
  target: string;
  kind?: string;
  sourcePos?: { x: number; y: number };
  targetPos?: { x: number; y: number };
}

export interface ViewportAudioBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  zoom?: number;
}

export type SonificationScanMode = "horizontal" | "vertical" | "topological" | "radial";

export interface GraphScanItem {
  id: string;
  x: number;
  y: number;
  depth: number;
  status?: string;
  kind?: string;
  label?: string;
}

export interface AudioEngineConfig {
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
  viewportBounds?: ViewportAudioBounds;
}
