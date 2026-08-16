/**
 * Visual Shell Command AST & Pipeline Stage Inspector Component.
 * 100% Zero-any type-safe implementation.
 */

import { useState, type FC } from "react";
import { parseCommandLine } from "../../engine/sandbox/commandParser";
import { useCommandSandboxStore } from "./useCommandSandboxStore";

export interface CommandAstViewerProps {
  className?: string;
}

export const CommandAstViewer: FC<CommandAstViewerProps> = ({ className = "" }) => {
  const recordedTrace = useCommandSandboxStore((state) => state.recordedTrace);
  const rawCommand = recordedTrace?.command ?? "";
  const [viewJson, setViewJson] = useState<boolean>(false);

  const parsed = parseCommandLine(rawCommand, recordedTrace?.env);

  return (
    <div className={`command-ast-viewer ${className}`}>
      <div className="ast-header">
        <div className="ast-title-group">
          <h3>Command Pipeline & AST Breakdown</h3>
          <span className="ast-subtitle">
            Parsed syntax tree representing pipeline stages, operators, flags, environment
            variables, and redirects.
          </span>
        </div>

        <div className="ast-view-toggle">
          <button
            type="button"
            className={`ast-toggle-btn ${!viewJson ? "active" : ""}`}
            onClick={() => setViewJson(false)}
          >
            Visual Tree
          </button>
          <button
            type="button"
            className={`ast-toggle-btn ${viewJson ? "active" : ""}`}
            onClick={() => setViewJson(true)}
          >
            Raw AST JSON
          </button>
        </div>
      </div>

      {parsed.hasErrors && (
        <div className="ast-errors-box">
          <h4>Syntax Errors:</h4>
          <ul>
            {parsed.errors.map((err, idx) => (
              <li key={`err-${idx}`}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {viewJson ? (
        <pre className="ast-raw-json">{JSON.stringify(parsed, null, 2)}</pre>
      ) : (
        <div className="ast-stages-list">
          {parsed.stages.map((stage, sIdx) => (
            <div key={stage.id} className="ast-stage-card">
              <div className="stage-card-header">
                <div className="stage-num-badge">Stage {sIdx + 1}</div>
                <div className="stage-raw-cmd">{stage.raw}</div>
                {stage.operator && (
                  <div className={`stage-operator-badge op-${stage.operator}`}>
                    {stage.operator.toUpperCase()}
                  </div>
                )}
              </div>

              <div className="stage-commands-container">
                {stage.commands.map((cmd) => (
                  <div key={cmd.id} className="command-node-card">
                    <div className="cmd-header-row">
                      <span className="cmd-name-badge">⚡ {cmd.command}</span>
                      {cmd.isBackground && <span className="bg-badge">& (Background)</span>}
                    </div>

                    {/* Environment variables */}
                    {Object.keys(cmd.envVars).length > 0 && (
                      <div className="cmd-section">
                        <span className="section-title">Environment Variables:</span>
                        <div className="env-tags">
                          {Object.entries(cmd.envVars).map(([k, v]) => (
                            <span key={`env-${k}`} className="env-tag">
                              {k}={v}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Flags */}
                    {Object.keys(cmd.flags).length > 0 && (
                      <div className="cmd-section">
                        <span className="section-title">Flags & Options:</span>
                        <div className="flag-tags">
                          {Object.entries(cmd.flags).map(([k, v]) => (
                            <span key={`flag-${k}`} className="flag-tag">
                              {k.length === 1 ? `-${k}` : `--${k}`}
                              {typeof v === "string" ? `=${v}` : ""}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Positional Arguments */}
                    {cmd.args.length > 0 && (
                      <div className="cmd-section">
                        <span className="section-title">Arguments:</span>
                        <div className="arg-tags">
                          {cmd.args.map((arg, aIdx) => (
                            <span key={`arg-${aIdx}`} className="arg-tag">
                              {arg}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Redirections */}
                    {cmd.redirects.length > 0 && (
                      <div className="cmd-section">
                        <span className="section-title">Redirections:</span>
                        <div className="redirect-tags">
                          {cmd.redirects.map((r, rIdx) => (
                            <span key={`r-${rIdx}`} className="redirect-tag">
                              {r.type === "out" && ">"}
                              {r.type === "append" && ">>"}
                              {r.type === "in" && "<"}
                              {r.type === "err" && "2>"}
                              {r.type === "err_merge" && "2>&1"}
                              {r.type === "all" && "&>"} {r.target}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
