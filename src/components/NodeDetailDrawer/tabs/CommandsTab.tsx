import { IconCheck, IconClock, IconCopy, IconTerminal, IconX } from "@tabler/icons-react";
import type { FC, MouseEvent } from "react";
import { useState } from "react";
import type { CommandExecutionDetail, GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { copyToClipboard, formatDuration } from "../streamUtils";

interface CommandsTabProps {
  node: GraphNodeData;
}

/**
 * Command execution breakdown tab presenting CLI executions, exit code pills,
 * execution duration, working directory, and formatted stdout/stderr stream snippets.
 */
export const CommandsTab: FC<CommandsTabProps> = ({ node }) => {
  const commands = (node.metadata?.commands ?? []) as CommandExecutionDetail[];
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string, e: MouseEvent) => {
    e.stopPropagation();
    await copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (commands.length === 0) {
    return (
      <div className="drawer-tab-content">
        <div className="drawer-empty-state">No command executions recorded for this node.</div>
      </div>
    );
  }

  return (
    <div className="drawer-tab-content">
      <DrawerSection title="Executed Commands" count={commands.length}>
        {commands.map((cmd, index) => {
          const isSuccess = cmd.exitCode === 0;
          const stdout = cmd.stdoutSnippet ?? cmd.stdoutTail;
          const stderr = cmd.stderrSnippet ?? cmd.stderrTail;
          const cmdLine = Array.isArray(cmd.argv) ? cmd.argv.join(" ") : String(cmd.argv);

          return (
            <div key={`${cmd.id}-${index}`} className="drawer-command-card">
              <div className="drawer-command-header">
                <span className={`drawer-command-exit ${isSuccess ? "is-success" : "is-error"}`}>
                  {isSuccess ? <IconCheck size={12} /> : <IconX size={12} />}
                  {`Exit ${cmd.exitCode}`}
                </span>

                <div className="drawer-command-meta-right">
                  <span className="drawer-command-duration">
                    <IconClock
                      size={11}
                      style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}
                    />
                    {formatDuration(cmd.durationMs)}
                  </span>
                  <code className="drawer-command-id">{cmd.id}</code>
                </div>
              </div>

              <div className="drawer-command-argv">
                <span className="drawer-command-prompt">$</span>
                <code>{cmdLine}</code>
                <button
                  type="button"
                  className={`drawer-copy-btn ${copiedId === `argv-${cmd.id}` ? "is-copied" : ""}`}
                  onClick={(e) => handleCopy(cmdLine, `argv-${cmd.id}`, e)}
                  title="Copy command"
                  aria-label="Copy command line"
                >
                  {copiedId === `argv-${cmd.id}` ? <IconCheck size={11} /> : <IconCopy size={11} />}
                </button>
              </div>

              {stdout && (
                <div className="drawer-log-snippet drawer-log-snippet--stdout">
                  <div className="drawer-log-header">
                    <span className="drawer-log-label">
                      <IconTerminal
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}
                      />
                      stdout
                    </span>
                    <button
                      type="button"
                      className={`drawer-copy-btn ${copiedId === `stdout-${cmd.id}` ? "is-copied" : ""}`}
                      onClick={(e) => handleCopy(stdout, `stdout-${cmd.id}`, e)}
                      title="Copy stdout"
                      aria-label="Copy stdout snippet"
                    >
                      {copiedId === `stdout-${cmd.id}` ? (
                        <IconCheck size={11} />
                      ) : (
                        <IconCopy size={11} />
                      )}
                      <span>{copiedId === `stdout-${cmd.id}` ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                  <pre className="drawer-pre drawer-pre--stdout" style={{ maxHeight: "240px" }}>
                    {stdout}
                  </pre>
                </div>
              )}

              {stderr && (
                <div className="drawer-log-snippet drawer-log-snippet--stderr">
                  <div className="drawer-log-header">
                    <span className="drawer-log-label drawer-log-label--stderr">
                      <IconTerminal
                        size={11}
                        style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }}
                      />
                      stderr
                    </span>
                    <button
                      type="button"
                      className={`drawer-copy-btn ${copiedId === `stderr-${cmd.id}` ? "is-copied" : ""}`}
                      onClick={(e) => handleCopy(stderr, `stderr-${cmd.id}`, e)}
                      title="Copy stderr"
                      aria-label="Copy stderr snippet"
                    >
                      {copiedId === `stderr-${cmd.id}` ? (
                        <IconCheck size={11} />
                      ) : (
                        <IconCopy size={11} />
                      )}
                      <span>{copiedId === `stderr-${cmd.id}` ? "Copied!" : "Copy"}</span>
                    </button>
                  </div>
                  <pre className="drawer-pre drawer-pre--stderr" style={{ maxHeight: "240px" }}>
                    {stderr}
                  </pre>
                </div>
              )}

              <div className="drawer-command-footer">
                <span className="drawer-command-cwd">
                  CWD: <code>{cmd.cwd}</code>
                </span>
                {cmd.startedAt && (
                  <span className="drawer-command-time">
                    {new Date(cmd.startedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </DrawerSection>
    </div>
  );
};
