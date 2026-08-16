import React, { useState } from "react";
import {
  getAriaAnnouncer,
  getSoundscapeEngine,
  useAudioStore,
  type AriaVerbosity,
  type AudioCueType,
  type MusicalScale,
  type ToneProfile,
} from "../../engine/audio";
import type { AccessibilitySettingsProps, AccessibilityTab } from "./AccessibilitySettings.types";
import "./AccessibilitySettings.css";

const TONE_PROFILES: Array<{ id: ToneProfile; label: string; desc: string }> = [
  {
    id: "harmonic-synthesizer",
    label: "Harmonic Synthesizer",
    desc: "Rich multi-oscillator additive saw/sine warm tones",
  },
  {
    id: "subtle-chimes",
    label: "Subtle Chimes",
    desc: "Acoustic bell-like metallic chime decays",
  },
  {
    id: "retro-beeps",
    label: "Retro Beeps",
    desc: "8-bit chiptune square & triangle wave blips",
  },
  {
    id: "high-contrast-acoustic",
    label: "High Contrast Acoustic Cues",
    desc: "High clarity harmonic pulses for screen reader & low vision",
  },
];

const MUSICAL_SCALES: Array<{ id: MusicalScale; label: string }> = [
  { id: "pentatonic", label: "Pentatonic (Harmonious)" },
  { id: "major", label: "Major (Bright)" },
  { id: "minor", label: "Minor (Deep)" },
  { id: "dorian", label: "Dorian (Modal)" },
  { id: "chromatic", label: "Chromatic (All 12 Notes)" },
];

const SOUNDBOARD_CUES: Array<{ id: AudioCueType; label: string; tag: string }> = [
  { id: "node-select", label: "Node Select", tag: "Selection" },
  { id: "node-hover", label: "Node Hover", tag: "Focus" },
  { id: "execution-start", label: "Execution Start", tag: "Pipeline" },
  { id: "execution-complete", label: "Execution Done", tag: "Pipeline" },
  { id: "execution-error", label: "Execution Error", tag: "Alert" },
  { id: "execution-warning", label: "Execution Warning", tag: "Warning" },
  { id: "edge-traversal", label: "Edge Traversal", tag: "Flow" },
  { id: "layout-update", label: "Layout Update", tag: "Canvas" },
  { id: "zoom-tick", label: "Zoom Tick", tag: "Canvas" },
  { id: "anomaly-alert", label: "Anomaly Alert", tag: "Security" },
  { id: "boundary-hit", label: "Boundary Bump", tag: "Canvas" },
  { id: "filter-toggle", label: "Filter Toggle", tag: "UI" },
  { id: "navigation-step", label: "Nav Step", tag: "Keyboard" },
];

export const AccessibilitySettingsPanel: React.FC<AccessibilitySettingsProps> = ({
  className = "",
  isOpen = true,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<AccessibilityTab>("audio");
  const [testAriaText, setTestAriaText] = useState(
    "Pipeline node Agent-Alpha finished processing successfully.",
  );

  const {
    masterVolume,
    isMuted,
    sonificationEnabled,
    spatialAudioEnabled,
    toneProfile,
    musicalScale,
    pitchScale,
    ariaEnabled,
    ariaVerbosity,
    highContrastAudio,
    audioEventLog,
    recentAnnouncements,
    setMasterVolume,
    toggleMute,
    setSonificationEnabled,
    setSpatialAudioEnabled,
    setToneProfile,
    setMusicalScale,
    setPitchScale,
    setAriaEnabled,
    setAriaVerbosity,
    setHighContrastAudio,
    clearAudioLog,
    clearAnnouncements,
    resetToDefaults,
    triggerAudioCue,
  } = useAudioStore();

  if (!isOpen) return null;

  const handleTestAnnouncement = () => {
    const announcer = getAriaAnnouncer();
    announcer.announce(testAriaText, "polite", "manual-test");
  };

  const handleRunSonificationScan = () => {
    const soundscape = getSoundscapeEngine();
    const demoNodes = [
      { id: "node-1", x: -400, y: -200, depth: 0, label: "Input Orchestrator" },
      { id: "node-2", x: -200, y: -100, depth: 1, label: "Router Agent" },
      { id: "node-3", x: 0, y: 0, depth: 2, label: "Execution Worker A" },
      { id: "node-4", x: 0, y: 150, depth: 2, label: "Execution Worker B" },
      { id: "node-5", x: 200, y: 50, depth: 3, label: "Validation Gate" },
      { id: "node-6", x: 400, y: 0, depth: 4, label: "Terminal Output" },
    ];
    void soundscape.sonifyGraphScan(demoNodes, "topological", 80);
  };

  return (
    <div
      className={`gvui-accessibility-panel ${className}`}
      role="dialog"
      aria-label="Accessibility and Sonification Settings"
    >
      {/* Header */}
      <div className="gvui-accessibility-header">
        <div className="gvui-accessibility-title-group">
          <h2>Accessibility & Sonification</h2>
          <div className="gvui-accessibility-live-badge">
            <span className="gvui-accessibility-live-dot" />
            <span>Active</span>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            className="gvui-accessibility-reset-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="gvui-accessibility-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "audio"}
          className={`gvui-accessibility-tab-btn ${activeTab === "audio" ? "active" : ""}`}
          onClick={() => setActiveTab("audio")}
        >
          Audio & Pitch
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "soundboard"}
          className={`gvui-accessibility-tab-btn ${activeTab === "soundboard" ? "active" : ""}`}
          onClick={() => setActiveTab("soundboard")}
        >
          Soundboard Cues
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "aria"}
          className={`gvui-accessibility-tab-btn ${activeTab === "aria" ? "active" : ""}`}
          onClick={() => setActiveTab("aria")}
        >
          Screen Reader ARIA
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "activity"}
          className={`gvui-accessibility-tab-btn ${activeTab === "activity" ? "active" : ""}`}
          onClick={() => setActiveTab("activity")}
        >
          Live Activity ({audioEventLog.length})
        </button>
      </div>

      {/* Tab Panels */}
      <div className="gvui-accessibility-content">
        {activeTab === "audio" && (
          <>
            <section className="gvui-accessibility-section">
              <h3 className="gvui-accessibility-section-title">Master Output</h3>
              <div className="gvui-accessibility-card">
                <div className="gvui-accessibility-row">
                  <div className="gvui-accessibility-label-group">
                    <span className="gvui-accessibility-label">Sonification Audio</span>
                    <span className="gvui-accessibility-desc">
                      Enable canvas acoustic soundscape
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`gvui-accessibility-toggle-btn ${sonificationEnabled ? "active" : ""}`}
                    onClick={() => setSonificationEnabled(!sonificationEnabled)}
                  >
                    {sonificationEnabled ? "Enabled" : "Disabled"}
                  </button>
                </div>

                <div className="gvui-accessibility-row">
                  <div className="gvui-accessibility-label-group">
                    <span className="gvui-accessibility-label">Master Volume</span>
                    <span className="gvui-accessibility-desc">
                      {isMuted ? "Audio Muted" : "Synthesizer output gain"}
                    </span>
                  </div>
                  <div className="gvui-accessibility-slider-container">
                    <button
                      type="button"
                      className={`gvui-accessibility-toggle-btn ${isMuted ? "active" : ""}`}
                      onClick={toggleMute}
                    >
                      {isMuted ? "Unmute" : "Mute"}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={isMuted ? 0 : masterVolume}
                      onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                      disabled={isMuted || !sonificationEnabled}
                      className="gvui-accessibility-slider"
                      aria-label="Master volume"
                    />
                    <span className="gvui-accessibility-value">
                      {isMuted ? "0%" : `${Math.round(masterVolume * 100)}%`}
                    </span>
                  </div>
                </div>

                <div className="gvui-accessibility-row">
                  <div className="gvui-accessibility-label-group">
                    <span className="gvui-accessibility-label">Spatial Stereo Panning</span>
                    <span className="gvui-accessibility-desc">
                      Pan audio cues matching node canvas position
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`gvui-accessibility-toggle-btn ${spatialAudioEnabled ? "active" : ""}`}
                    onClick={() => setSpatialAudioEnabled(!spatialAudioEnabled)}
                  >
                    {spatialAudioEnabled ? "Spatial ON" : "Stereo Centered"}
                  </button>
                </div>

                <div className="gvui-accessibility-row">
                  <div className="gvui-accessibility-label-group">
                    <span className="gvui-accessibility-label">High Contrast Auditory Mode</span>
                    <span className="gvui-accessibility-desc">
                      Amplified harmonic overtones for assistive clarity
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`gvui-accessibility-toggle-btn ${highContrastAudio ? "active" : ""}`}
                    onClick={() => setHighContrastAudio(!highContrastAudio)}
                  >
                    {highContrastAudio ? "Active" : "Standard"}
                  </button>
                </div>
              </div>
            </section>

            <section className="gvui-accessibility-section">
              <h3 className="gvui-accessibility-section-title">Tone Profile & Harmonic Tuning</h3>
              <div className="gvui-accessibility-card">
                <div className="gvui-accessibility-label-group">
                  <span className="gvui-accessibility-label">Synthesizer Tone Profile</span>
                </div>
                <div className="gvui-accessibility-grid">
                  {TONE_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className={`gvui-accessibility-cue-btn ${toneProfile === profile.id ? "active" : ""}`}
                      onClick={() => {
                        setToneProfile(profile.id);
                        triggerAudioCue("node-select");
                      }}
                    >
                      <span>{profile.label}</span>
                      <span className="gvui-accessibility-cue-btn-tag">{profile.id}</span>
                    </button>
                  ))}
                </div>

                <div className="gvui-accessibility-row">
                  <div className="gvui-accessibility-label-group">
                    <span className="gvui-accessibility-label">Musical Scale</span>
                    <span className="gvui-accessibility-desc">Depth-to-pitch harmonic mapping</span>
                  </div>
                  <select
                    value={musicalScale}
                    onChange={(e) => setMusicalScale(e.target.value as MusicalScale)}
                    className="gvui-accessibility-toggle-btn"
                    aria-label="Musical Scale"
                  >
                    {MUSICAL_SCALES.map((scale) => (
                      <option key={scale.id} value={scale.id}>
                        {scale.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="gvui-accessibility-row">
                  <div className="gvui-accessibility-label-group">
                    <span className="gvui-accessibility-label">Pitch Scale Multiplier</span>
                    <span className="gvui-accessibility-desc">
                      Shift base acoustic frequency range
                    </span>
                  </div>
                  <div className="gvui-accessibility-slider-container">
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={pitchScale}
                      onChange={(e) => setPitchScale(parseFloat(e.target.value))}
                      className="gvui-accessibility-slider"
                      aria-label="Pitch scale"
                    />
                    <span className="gvui-accessibility-value">{pitchScale.toFixed(2)}x</span>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === "soundboard" && (
          <section className="gvui-accessibility-section">
            <div className="gvui-accessibility-row">
              <h3 className="gvui-accessibility-section-title">Soundscape Event Cues</h3>
              <button
                type="button"
                className="gvui-accessibility-toggle-btn active"
                onClick={handleRunSonificationScan}
              >
                ▶ Run Topological Graph Scan
              </button>
            </div>
            <div className="gvui-accessibility-grid">
              {SOUNDBOARD_CUES.map((cue) => (
                <button
                  key={cue.id}
                  type="button"
                  className="gvui-accessibility-cue-btn"
                  onClick={() => triggerAudioCue(cue.id)}
                >
                  <span>{cue.label}</span>
                  <span className="gvui-accessibility-cue-btn-tag">{cue.tag}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {activeTab === "aria" && (
          <>
            <section className="gvui-accessibility-section">
              <h3 className="gvui-accessibility-section-title">Screen Reader Configuration</h3>
              <div className="gvui-accessibility-card">
                <div className="gvui-accessibility-row">
                  <div className="gvui-accessibility-label-group">
                    <span className="gvui-accessibility-label">ARIA Live Region Narrator</span>
                    <span className="gvui-accessibility-desc">
                      Broadcast graph updates to screen readers
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`gvui-accessibility-toggle-btn ${ariaEnabled ? "active" : ""}`}
                    onClick={() => setAriaEnabled(!ariaEnabled)}
                  >
                    {ariaEnabled ? "Narrator Active" : "Narrator Off"}
                  </button>
                </div>

                <div className="gvui-accessibility-row">
                  <div className="gvui-accessibility-label-group">
                    <span className="gvui-accessibility-label">Narration Verbosity</span>
                    <span className="gvui-accessibility-desc">
                      Level of detail in live region announcements
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: "6px" }}>
                    {(["minimal", "standard", "verbose"] as AriaVerbosity[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`gvui-accessibility-toggle-btn ${ariaVerbosity === v ? "active" : ""}`}
                        onClick={() => setAriaVerbosity(v)}
                      >
                        {v.charAt(0).toUpperCase() + v.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="gvui-accessibility-row" style={{ marginTop: "8px" }}>
                  <input
                    type="text"
                    value={testAriaText}
                    onChange={(e) => setTestAriaText(e.target.value)}
                    placeholder="Enter test announcement text..."
                    className="gvui-accessibility-slider"
                    style={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #334155",
                      color: "#f8fafc",
                      padding: "6px 10px",
                      borderRadius: "6px",
                    }}
                    aria-label="Test announcement text"
                  />
                  <button
                    type="button"
                    className="gvui-accessibility-toggle-btn active"
                    onClick={handleTestAnnouncement}
                  >
                    Announce
                  </button>
                </div>
              </div>
            </section>

            <section className="gvui-accessibility-section">
              <div className="gvui-accessibility-row">
                <h3 className="gvui-accessibility-section-title">
                  Recent Announcements ({recentAnnouncements.length})
                </h3>
                {recentAnnouncements.length > 0 && (
                  <button
                    type="button"
                    className="gvui-accessibility-reset-btn"
                    onClick={clearAnnouncements}
                  >
                    Clear Feed
                  </button>
                )}
              </div>
              <div className="gvui-accessibility-log-list">
                {recentAnnouncements.length === 0 ? (
                  <div className="gvui-accessibility-empty">No announcements yet</div>
                ) : (
                  recentAnnouncements.map((item) => (
                    <div key={item.id} className="gvui-accessibility-log-item">
                      <div>
                        <span className="gvui-accessibility-log-type">[{item.politeness}]</span>{" "}
                        <span>{item.message}</span>
                      </div>
                      <span className="gvui-accessibility-log-time">
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}

        {activeTab === "activity" && (
          <section className="gvui-accessibility-section">
            <div className="gvui-accessibility-row">
              <h3 className="gvui-accessibility-section-title">
                Auditory Event Log ({audioEventLog.length})
              </h3>
              {audioEventLog.length > 0 && (
                <button
                  type="button"
                  className="gvui-accessibility-reset-btn"
                  onClick={clearAudioLog}
                >
                  Clear Log
                </button>
              )}
            </div>
            <div className="gvui-accessibility-log-list">
              {audioEventLog.length === 0 ? (
                <div className="gvui-accessibility-empty">No audio events triggered yet</div>
              ) : (
                audioEventLog.map((log) => (
                  <div key={log.id} className="gvui-accessibility-log-item">
                    <div>
                      <span className="gvui-accessibility-log-type">{log.type}</span>
                      {log.details && (
                        <span style={{ marginLeft: "8px", color: "#cbd5e1" }}>{log.details}</span>
                      )}
                    </div>
                    <span className="gvui-accessibility-log-time">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        )}
      </div>

      {/* Footer */}
      <div className="gvui-accessibility-footer">
        <button type="button" className="gvui-accessibility-reset-btn" onClick={resetToDefaults}>
          Reset to Defaults
        </button>
        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
          GVUI Accessible Soundscape Engine v1.0
        </span>
      </div>
    </div>
  );
};
