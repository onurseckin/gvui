import React, { useEffect, useRef, useState } from "react";
import { BatchRunnerModal } from "./BatchRunnerModal";
import { MacroLibraryModal } from "./MacroLibraryModal";
import { ParameterForm } from "./ParameterForm";
import { TimelineScrubber } from "./TimelineScrubber";
import { useMacroStore } from "./useMacroStore";
import "./MacroRecorder.css";

export const MacroRecorderPanel: React.FC = () => {
  const isOpen = useMacroStore((s) => s.isOpen);
  const setOpen = useMacroStore((s) => s.setOpen);
  const dockPosition = useMacroStore((s) => s.dockPosition);
  const setDockPosition = useMacroStore((s) => s.setDockPosition);
  const panelPosition = useMacroStore((s) => s.panelPosition);
  const setPanelPosition = useMacroStore((s) => s.setPanelPosition);
  const activeTab = useMacroStore((s) => s.activeTab);
  const setActiveTab = useMacroStore((s) => s.setActiveTab);

  // Recording
  const isRecording = useMacroStore((s) => s.isRecording);
  const isRecordingPaused = useMacroStore((s) => s.isRecordingPaused);
  const recordedStepsCount = useMacroStore((s) => s.recordedStepsCount);
  const recordingDurationMs = useMacroStore((s) => s.recordingDurationMs);
  const startRecording = useMacroStore((s) => s.startRecording);
  const pauseRecording = useMacroStore((s) => s.pauseRecording);
  const resumeRecording = useMacroStore((s) => s.resumeRecording);
  const stopRecording = useMacroStore((s) => s.stopRecording);
  const discardRecording = useMacroStore((s) => s.discardRecording);

  // Playback
  const activeScript = useMacroStore((s) => s.activeScript);
  const executionState = useMacroStore((s) => s.executionState);
  const playbackSpeed = useMacroStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useMacroStore((s) => s.setPlaybackSpeed);
  const play = useMacroStore((s) => s.play);
  const pause = useMacroStore((s) => s.pause);
  const resume = useMacroStore((s) => s.resume);
  const stepForward = useMacroStore((s) => s.stepForward);
  const stepBackward = useMacroStore((s) => s.stepBackward);
  const resetPlayback = useMacroStore((s) => s.resetPlayback);

  const [isMinimized, setIsMinimized] = useState(false);
  const [autoParam, setAutoParam] = useState(true);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Hotkey: Ctrl+Alt+R / Cmd+Alt+R => Record Toggle
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        if (useMacroStore.getState().isRecording) {
          useMacroStore.getState().stopRecording(true);
        } else {
          useMacroStore.getState().setOpen(true);
          useMacroStore.getState().startRecording();
        }
      }

      // Hotkey: Ctrl+Alt+P / Cmd+Alt+P => Playback Toggle
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        useMacroStore.getState().setOpen(true);
        const status = useMacroStore.getState().executionState.status;
        if (status === "running") {
          useMacroStore.getState().pause();
        } else if (status === "paused") {
          void useMacroStore.getState().resume();
        } else {
          void useMacroStore.getState().play();
        }
      }

      // Hotkey: Ctrl+Alt+S / Cmd+Alt+S => Step Forward
      if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        useMacroStore.getState().setOpen(true);
        void useMacroStore.getState().stepForward();
      }

      // Hotkey: Escape => Close or Pause
      if (e.key === "Escape" && useMacroStore.getState().isOpen) {
        if (useMacroStore.getState().executionState.status === "running") {
          useMacroStore.getState().pause();
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, []);

  // Dragging handler in floating mode
  const handleMouseDown = (e: React.MouseEvent) => {
    if (dockPosition !== "floating") return;
    setDragStart({ x: e.clientX - panelPosition.x, y: e.clientY - panelPosition.y });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStart) return;
      setPanelPosition({
        x: Math.max(10, Math.min(window.innerWidth - 300, e.clientX - dragStart.x)),
        y: Math.max(10, Math.min(window.innerHeight - 100, e.clientY - dragStart.y)),
      });
    };

    const handleMouseUp = () => {
      setDragStart(null);
    };

    if (dragStart) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragStart, panelPosition, setPanelPosition]);

  if (!isOpen) {
    return (
      <button
        type="button"
        className="macro-ctrl-btn primary"
        style={{
          position: "fixed",
          bottom: "16px",
          right: "16px",
          zIndex: 999,
          boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
        onClick={() => setOpen(true)}
        aria-label="Open Macro Automation HUD"
      >
        <span>⚡ Macro Engine</span>
        {isRecording && <span className="macro-recording-pulse" />}
      </button>
    );
  }

  const durationSec = Math.floor(recordingDurationMs / 1000);
  const formattedDuration = `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`;
  const totalSteps = activeScript?.steps.length ?? 0;
  const currentStep = executionState.currentStepIndex;
  const progressPct = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  const getDockClassName = () => {
    if (dockPosition === "bottom") return "docked-bottom";
    if (dockPosition === "right") return "docked-right";
    return "floating";
  };

  const stylePosition: React.CSSProperties =
    dockPosition === "floating"
      ? { left: `${panelPosition.x}px`, top: `${panelPosition.y}px` }
      : {};

  return (
    <aside
      ref={panelRef}
      className={`macro-recorder-hud ${getDockClassName()}`}
      style={stylePosition}
      aria-label="Macro Automation & Recorder"
    >
      {/* Header */}
      <header className="macro-hud-header" onMouseDown={handleMouseDown}>
        <div className="macro-title-group">
          {isRecording && <span className="macro-recording-pulse" />}
          <h2 className="macro-hud-title">⚡ Macro Engine</h2>
          {isRecording ? (
            <span className="macro-badge recording">
              REC {formattedDuration} ({recordedStepsCount} steps)
            </span>
          ) : executionState.status === "running" ? (
            <span className="macro-badge success">PLAYING {progressPct}%</span>
          ) : executionState.status === "paused" ? (
            <span className="macro-badge">PAUSED</span>
          ) : null}
        </div>

        <div className="macro-header-actions" onMouseDown={(e) => e.stopPropagation()}>
          {/* Dock toggle */}
          <button
            type="button"
            className="macro-icon-btn"
            title={`Dock: ${dockPosition}`}
            onClick={() => {
              if (dockPosition === "floating") setDockPosition("bottom");
              else if (dockPosition === "bottom") setDockPosition("right");
              else setDockPosition("floating");
            }}
          >
            {dockPosition === "floating" ? "⬚" : dockPosition === "bottom" ? "⬓" : "◧"}
          </button>

          {/* Minimize toggle */}
          <button
            type="button"
            className="macro-icon-btn"
            title={isMinimized ? "Expand" : "Minimize"}
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? "□" : "—"}
          </button>

          {/* Close */}
          <button
            type="button"
            className="macro-icon-btn"
            title="Close Panel"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>
      </header>

      {!isMinimized && (
        <>
          {/* Tab Navigation */}
          <nav className="macro-hud-tabs">
            <button
              type="button"
              className={`macro-tab-btn ${activeTab === "player" ? "active" : ""}`}
              onClick={() => setActiveTab("player")}
            >
              Playback
            </button>
            <button
              type="button"
              className={`macro-tab-btn ${activeTab === "recorder" ? "active" : ""}`}
              onClick={() => setActiveTab("recorder")}
            >
              {isRecording ? "🔴 Recording" : "Record"}
            </button>
            <button
              type="button"
              className={`macro-tab-btn ${activeTab === "params" ? "active" : ""}`}
              onClick={() => setActiveTab("params")}
            >
              Parameters ({activeScript?.parameters.length ?? 0})
            </button>
            <button
              type="button"
              className={`macro-tab-btn ${activeTab === "batch" ? "active" : ""}`}
              onClick={() => setActiveTab("batch")}
            >
              Batch Runner
            </button>
            <button
              type="button"
              className={`macro-tab-btn ${activeTab === "library" ? "active" : ""}`}
              onClick={() => setActiveTab("library")}
            >
              Library
            </button>
          </nav>

          {/* Body Content */}
          <main className="macro-hud-body">
            {activeTab === "player" && (
              <>
                {/* Script Title Header */}
                <div
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
                >
                  <div>
                    <strong style={{ fontSize: "13px", color: "#ffffff" }}>
                      {activeScript?.name ?? "No script selected"}
                    </strong>
                    {activeScript?.description && (
                      <p style={{ fontSize: "11px", color: "#a1a1aa", margin: "2px 0 0 0" }}>
                        {activeScript.description}
                      </p>
                    )}
                  </div>
                  {activeScript && (
                    <span className="macro-badge">{activeScript.category ?? "Macro"}</span>
                  )}
                </div>

                {/* Playback Controls Bar */}
                <div className="macro-playback-bar">
                  <div className="macro-controls-group">
                    {/* Step backward / Undo */}
                    <button
                      type="button"
                      className="macro-ctrl-btn"
                      title="Step Backward (Undo)"
                      disabled={
                        executionState.undoStack.length === 0 || executionState.status === "running"
                      }
                      onClick={() => void stepBackward()}
                    >
                      ⏮ Undo
                    </button>

                    {/* Play / Pause / Resume */}
                    {executionState.status === "running" ? (
                      <button
                        type="button"
                        className="macro-ctrl-btn danger"
                        title="Pause Execution"
                        onClick={pause}
                      >
                        ⏸ Pause
                      </button>
                    ) : executionState.status === "paused" ? (
                      <button
                        type="button"
                        className="macro-ctrl-btn primary"
                        title="Resume Execution"
                        onClick={() => void resume()}
                      >
                        ▶ Resume
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="macro-ctrl-btn primary"
                        title="Play Macro"
                        disabled={!activeScript || activeScript.steps.length === 0}
                        onClick={() => void play()}
                      >
                        ▶ Play
                      </button>
                    )}

                    {/* Step forward */}
                    <button
                      type="button"
                      className="macro-ctrl-btn"
                      title="Step Forward"
                      disabled={
                        !activeScript ||
                        currentStep >= totalSteps ||
                        executionState.status === "running"
                      }
                      onClick={() => void stepForward()}
                    >
                      Step ⏭
                    </button>

                    {/* Reset */}
                    <button
                      type="button"
                      className="macro-ctrl-btn"
                      title="Reset and rollback macro changes"
                      disabled={
                        executionState.currentStepIndex === 0 &&
                        executionState.undoStack.length === 0
                      }
                      onClick={() => void resetPlayback()}
                    >
                      ↺ Reset
                    </button>
                  </div>

                  {/* Speed Selector */}
                  <select
                    className="macro-speed-select"
                    value={String(playbackSpeed)}
                    onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                    title="Playback Speed"
                  >
                    <option value="0.25">0.25x</option>
                    <option value="0.5">0.5x</option>
                    <option value="1">1.0x</option>
                    <option value="2">2.0x</option>
                    <option value="5">5.0x</option>
                    <option value="10">10x</option>
                    <option value="0">Instant</option>
                  </select>
                </div>

                {/* Progress Bar */}
                <div className="macro-progress-container">
                  <div className="macro-progress-bar-bg">
                    <div className="macro-progress-bar-fill" style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="macro-progress-text">
                    <span>
                      Step {currentStep} of {totalSteps}
                    </span>
                    <span>{progressPct}%</span>
                  </div>
                </div>

                {/* Timeline Scrubber */}
                <TimelineScrubber
                  steps={activeScript?.steps ?? []}
                  currentStepIndex={executionState.currentStepIndex}
                />

                {/* Execution Logs Drawer */}
                {executionState.logs.length > 0 && (
                  <div className="macro-logs-view">
                    {executionState.logs.map((log, idx) => (
                      <div key={idx} className={`macro-log-entry ${log.level}`}>
                        <span>[{log.level.toUpperCase()}]</span>
                        <span>{log.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "recorder" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div
                  style={{
                    background: "#1f1f23",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #27272a",
                  }}
                >
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#ffffff" }}>
                    Canvas Interaction Event Capture
                  </span>
                  <p style={{ fontSize: "11px", color: "#a1a1aa", margin: "4px 0 8px 0" }}>
                    Record node creations, edge connections, movement dragging, property changes,
                    and layout invocations.
                  </p>

                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    {!isRecording ? (
                      <button
                        type="button"
                        className="macro-ctrl-btn primary"
                        onClick={() => startRecording()}
                      >
                        🔴 Start Recording
                      </button>
                    ) : (
                      <>
                        {isRecordingPaused ? (
                          <button
                            type="button"
                            className="macro-ctrl-btn primary"
                            onClick={resumeRecording}
                          >
                            ▶ Resume
                          </button>
                        ) : (
                          <button type="button" className="macro-ctrl-btn" onClick={pauseRecording}>
                            ⏸ Pause
                          </button>
                        )}
                        <button
                          type="button"
                          className="macro-ctrl-btn danger"
                          onClick={() => stopRecording(autoParam)}
                        >
                          ⏹ Stop & Save
                        </button>
                        <button type="button" className="macro-ctrl-btn" onClick={discardRecording}>
                          ✕ Discard
                        </button>
                      </>
                    )}
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginTop: "10px",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={autoParam}
                      onChange={(e) => setAutoParam(e.target.checked)}
                    />
                    <span>Auto-Parameterize Static IDs and Names on Save</span>
                  </label>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "11px",
                    color: "#a1a1aa",
                  }}
                >
                  <span>
                    Recorded Steps: <strong>{recordedStepsCount}</strong>
                  </span>
                  <span>
                    Duration: <strong>{formattedDuration}</strong>
                  </span>
                </div>
              </div>
            )}

            {activeTab === "params" && (
              <ParameterForm parameters={activeScript?.parameters ?? []} />
            )}

            {activeTab === "batch" && <BatchRunnerModal />}

            {activeTab === "library" && <MacroLibraryModal />}
          </main>

          {/* Footer with Hotkeys */}
          <footer className="macro-hud-footer">
            <div style={{ display: "flex", gap: "8px" }}>
              <span>
                <kbd className="macro-hotkey-kbd">Ctrl+Alt+R</kbd> Record
              </span>
              <span>
                <kbd className="macro-hotkey-kbd">Ctrl+Alt+P</kbd> Play
              </span>
              <span>
                <kbd className="macro-hotkey-kbd">Ctrl+Alt+S</kbd> Step
              </span>
            </div>
            <span>v1.0.0</span>
          </footer>
        </>
      )}
    </aside>
  );
};
