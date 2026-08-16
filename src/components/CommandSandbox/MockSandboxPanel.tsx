/**
 * Mock Sandbox & Command Rerun Simulation Panel Component.
 * Enables live command editing, environment variable overrides, VFS file edits, and simulated executions.
 * 100% Zero-any type-safe implementation.
 */

import { useState, type FC, type FormEvent } from "react";
import { parseAnsi } from "../../engine/sandbox/ansiParser";
import { TerminalDisplay } from "./TerminalDisplay";
import { useCommandSandboxStore } from "./useCommandSandboxStore";

export interface MockSandboxPanelProps {
  className?: string;
}

export const MockSandboxPanel: FC<MockSandboxPanelProps> = ({ className = "" }) => {
  const sandboxCommand = useCommandSandboxStore((state) => state.sandboxCommand);
  const sandboxEnvOverrides = useCommandSandboxStore((state) => state.sandboxEnvOverrides);
  const mockConfig = useCommandSandboxStore((state) => state.mockConfig);
  const sandboxRunResult = useCommandSandboxStore((state) => state.sandboxRunResult);
  const isSimulating = useCommandSandboxStore((state) => state.isSimulating);
  const selectedVfsFile = useCommandSandboxStore((state) => state.selectedVfsFile);

  const setSandboxCommand = useCommandSandboxStore((state) => state.setSandboxCommand);
  const setSandboxEnvOverride = useCommandSandboxStore((state) => state.setSandboxEnvOverride);
  const removeSandboxEnvOverride = useCommandSandboxStore(
    (state) => state.removeSandboxEnvOverride,
  );
  const selectVfsFile = useCommandSandboxStore((state) => state.selectVfsFile);
  const updateVirtualFile = useCommandSandboxStore((state) => state.updateVirtualFile);
  const deleteVirtualFile = useCommandSandboxStore((state) => state.deleteVirtualFile);
  const runMockSimulation = useCommandSandboxStore((state) => state.runMockSimulation);

  // Local state for adding env var
  const [newEnvKey, setNewEnvKey] = useState<string>("");
  const [newEnvVal, setNewEnvVal] = useState<string>("");

  // Local state for editing VFS file
  const [editedFileContent, setEditedFileContent] = useState<string>("");
  const [newFilePath, setNewFilePath] = useState<string>("");

  const handleAddEnv = (e: FormEvent) => {
    e.preventDefault();
    if (!newEnvKey.trim()) return;
    setSandboxEnvOverride(newEnvKey.trim(), newEnvVal);
    setNewEnvKey("");
    setNewEnvVal("");
  };

  const handleSelectFile = (path: string) => {
    selectVfsFile(path);
    const content = mockConfig.vfs[path]?.content ?? "";
    setEditedFileContent(content);
  };

  const handleSaveFile = () => {
    if (!selectedVfsFile) return;
    updateVirtualFile(selectedVfsFile, editedFileContent);
  };

  const handleCreateFile = (e: FormEvent) => {
    e.preventDefault();
    if (!newFilePath.trim()) return;
    const formattedPath = newFilePath.startsWith("/") ? newFilePath : `/workspace/${newFilePath}`;
    updateVirtualFile(formattedPath, "");
    selectVfsFile(formattedPath);
    setEditedFileContent("");
    setNewFilePath("");
  };

  const vfsFiles = Object.keys(mockConfig.vfs).sort();

  // Combine stdout + stderr for rerun terminal display
  const rerunOutputText = sandboxRunResult
    ? `${sandboxRunResult.stdout}${sandboxRunResult.stderr}`
    : "";
  const rerunAnsi = parseAnsi(rerunOutputText);

  return (
    <div className={`mock-sandbox-panel ${className}`}>
      {/* Command Input Bar */}
      <div className="sandbox-command-section">
        <div className="section-title">
          <h3>Command Execution Testbed</h3>
          <span className="section-desc">
            Edit shell command, tweak environment overrides, or modify virtual files, then run the
            sandbox.
          </span>
        </div>

        <div className="command-input-row">
          <div className="command-input-prefix">$</div>
          <input
            type="text"
            value={sandboxCommand}
            onChange={(e) => setSandboxCommand(e.target.value)}
            placeholder="e.g. echo 'Hello' | grep Hello"
            className="sandbox-cmd-input"
            aria-label="Sandbox shell command"
          />
          <button
            type="button"
            className="rerun-btn"
            onClick={runMockSimulation}
            disabled={isSimulating}
          >
            {isSimulating ? "Running..." : "▶ Rerun in Sandbox"}
          </button>
        </div>

        {/* Quick Presets */}
        <div className="quick-presets">
          <span className="presets-label">Presets:</span>
          <button
            type="button"
            className="preset-tag"
            onClick={() =>
              setSandboxCommand("echo -e '\\033[32m[PASS]\\033[0m All systems normal' && true")
            }
          >
            Colored Echo
          </button>
          <button
            type="button"
            className="preset-tag"
            onClick={() => setSandboxCommand("cat package.json | grep name")}
          >
            Cat & Grep
          </button>
          <button
            type="button"
            className="preset-tag"
            onClick={() => setSandboxCommand("ls -la /workspace")}
          >
            List VFS
          </button>
          <button
            type="button"
            className="preset-tag"
            onClick={() => setSandboxCommand("bun test src/engine/sandbox")}
          >
            Run Test Suite
          </button>
          <button
            type="button"
            className="preset-tag"
            onClick={() => setSandboxCommand("echo 'Simulating error' >&2 && false")}
          >
            Failure Simulation
          </button>
        </div>
      </div>

      {/* Grid: Left (Environment & VFS), Right (Rerun Output) */}
      <div className="sandbox-grid">
        {/* Left Column: Environment & Virtual File System */}
        <div className="sandbox-config-column">
          {/* Environment Variables Overrides */}
          <div className="config-card env-card">
            <h4>Environment Variables Overrides</h4>
            <form onSubmit={handleAddEnv} className="add-env-form">
              <input
                type="text"
                placeholder="KEY (e.g. NODE_ENV)"
                value={newEnvKey}
                onChange={(e) => setNewEnvKey(e.target.value)}
                className="env-key-input"
              />
              <input
                type="text"
                placeholder="VALUE (e.g. production)"
                value={newEnvVal}
                onChange={(e) => setNewEnvVal(e.target.value)}
                className="env-val-input"
              />
              <button type="submit" className="add-env-btn">
                Add
              </button>
            </form>

            <div className="env-overrides-list">
              {Object.keys(sandboxEnvOverrides).length === 0 ? (
                <div className="empty-env-hint">No custom environment overrides configured.</div>
              ) : (
                Object.entries(sandboxEnvOverrides).map(([k, v]) => (
                  <div key={`env-${k}`} className="env-row">
                    <span className="env-k">{k}</span>
                    <span className="env-eq">=</span>
                    <span className="env-v">{v}</span>
                    <button
                      type="button"
                      className="remove-env-btn"
                      onClick={() => removeSandboxEnvOverride(k)}
                      title={`Remove ${k}`}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Virtual File System Explorer */}
          <div className="config-card vfs-card">
            <h4>Virtual File System (In-Memory)</h4>
            <form onSubmit={handleCreateFile} className="add-vfs-form">
              <input
                type="text"
                placeholder="New file path (e.g. data/config.json)"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                className="vfs-path-input"
              />
              <button type="submit" className="add-vfs-btn">
                + New
              </button>
            </form>

            <div className="vfs-file-chips">
              {vfsFiles.map((path) => (
                <button
                  key={path}
                  type="button"
                  className={`vfs-chip ${selectedVfsFile === path ? "active" : ""}`}
                  onClick={() => handleSelectFile(path)}
                >
                  📄 {path.replace("/workspace/", "")}
                </button>
              ))}
            </div>

            {selectedVfsFile && (
              <div className="vfs-editor-area">
                <div className="vfs-editor-header">
                  <span className="vfs-editor-filename">{selectedVfsFile}</span>
                  <div className="vfs-editor-actions">
                    <button type="button" className="vfs-save-btn" onClick={handleSaveFile}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="vfs-delete-btn"
                      onClick={() => deleteVirtualFile(selectedVfsFile)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <textarea
                  value={editedFileContent}
                  onChange={(e) => setEditedFileContent(e.target.value)}
                  className="vfs-textarea"
                  rows={6}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Execution Results & Terminal */}
        <div className="sandbox-results-column">
          <div className="results-header">
            <h4>Sandbox Simulation Output</h4>
            {sandboxRunResult && (
              <div className="run-result-meta">
                <span
                  className={`status-badge ${
                    sandboxRunResult.status === "success" ? "success" : "error"
                  }`}
                >
                  {sandboxRunResult.status.toUpperCase()} (Exit {sandboxRunResult.exitCode})
                </span>
                <span className="duration-badge">⏱ {sandboxRunResult.executionTimeMs}ms</span>
                <span className="stages-badge">⚡ {sandboxRunResult.stages.length} stages</span>
              </div>
            )}
          </div>

          <TerminalDisplay
            lines={rerunAnsi.lines}
            emptyMessage="Run a command to see sandbox execution output"
            maxHeight="440px"
          />

          {sandboxRunResult && sandboxRunResult.stages.length > 0 && (
            <div className="stages-breakdown-list">
              <h5>Stage Execution Log:</h5>
              {sandboxRunResult.stages.map((stg) => (
                <div key={`stage-${stg.stageIndex}`} className="stage-log-item">
                  <span className="stage-num">#{stg.stageIndex + 1}</span>
                  <code className="stage-cmd">{stg.command}</code>
                  <span className={`stage-exit ${stg.exitCode === 0 ? "pass" : "fail"}`}>
                    exit {stg.exitCode}
                  </span>
                  <span className="stage-dur">{stg.durationMs}ms</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
