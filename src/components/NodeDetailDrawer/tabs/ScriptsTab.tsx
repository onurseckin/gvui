import { IconCheck, IconClock, IconCopy, IconFileText, IconTerminal } from "@tabler/icons-react";
import type { FC, MouseEvent } from "react";
import { memo, useMemo, useState } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { EvidenceChip, UnknownValue } from "../EvidenceChip";
import { readScripts, type ScriptRow } from "../nodeSchema";
import { copyToClipboard, formatDuration } from "../streamUtils";
import { CommandsTab } from "./CommandsTab";

export interface ScriptsTabProps {
  node: GraphNodeData;
}

function exitDescriptor(row: ScriptRow): { className: string; text: string } | undefined {
  if (row.exitCode === null) return undefined;
  return row.exitCode === 0
    ? { className: "drawer-command-exit is-success", text: "exit 0" }
    : { className: "drawer-command-exit is-error", text: `exit ${row.exitCode}` };
}

const LogTail: FC<{ label: string; text?: string; variant: "stdout" | "stderr" }> = ({
  label,
  text,
  variant,
}) => (
  <div className={`drawer-log-snippet drawer-log-snippet--${variant}`}>
    <div className="drawer-log-header">
      <span
        className={`drawer-log-label ${variant === "stderr" ? "drawer-log-label--stderr" : ""}`}
      >
        <IconTerminal size={11} />
        {label}
      </span>
    </div>
    {text ? (
      <pre className={`drawer-pre drawer-pre--${variant}`} style={{ maxHeight: "220px" }}>
        {text}
      </pre>
    ) : (
      <p className="script-absent-line">
        {`no ${label} recorded`} <UnknownValue what={label} />
      </p>
    )}
  </div>
);

/**
 * Every command the harness itself ran for this node: the real argv, the real exit code, the real
 * duration and the tail of the real log file it wrote.
 */
export const ScriptsTab: FC<ScriptsTabProps> = memo(function ScriptsTab({ node }) {
  const scripts = useMemo(() => readScripts(node), [node]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (text: string, id: string, event: MouseEvent) => {
    event.stopPropagation();
    const copied = await copyToClipboard(text);
    if (!copied) return;
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (scripts.length === 0) {
    return (
      <div className="drawer-tab-content" data-testid="scripts-tab">
        <div className="drawer-empty-state">No scripts were recorded for this node.</div>
      </div>
    );
  }

  // A dataset written before `node.scripts` existed keeps its own richer command renderer, so the
  // same executions are never presented twice in one drawer.
  if (scripts[0]?.source === "legacy") return <CommandsTab node={node} />;

  return (
    <div className="drawer-tab-content" data-testid="scripts-tab">
      <DrawerSection title="Scripts Run" count={scripts.length}>
        {scripts.map((script) => {
          const commandLine = script.argv.join(" ");
          const exit = exitDescriptor(script);
          return (
            <div key={script.id} className="drawer-command-card" data-testid="script-card">
              <div className="drawer-command-header">
                {exit ? (
                  <span className={exit.className}>{exit.text}</span>
                ) : (
                  <span className="drawer-command-exit is-unknown">
                    exit code <UnknownValue what="exit code" />
                  </span>
                )}

                <div className="drawer-command-meta-right">
                  <span className="drawer-command-duration">
                    <IconClock size={11} />
                    {script.durationMs !== undefined ? (
                      formatDuration(script.durationMs)
                    ) : (
                      <UnknownValue what="duration" />
                    )}
                  </span>
                  <EvidenceChip evidenceClass={script.evidenceClass} />
                  <code className="drawer-command-id">{script.id}</code>
                </div>
              </div>

              <div className="drawer-command-argv">
                <span className="drawer-command-prompt">$</span>
                <code>{commandLine}</code>
                <button
                  type="button"
                  className={`drawer-copy-btn ${copiedId === script.id ? "is-copied" : ""}`}
                  onClick={(event) => handleCopy(commandLine, script.id, event)}
                  title="Copy command"
                  aria-label={`Copy command ${script.id}`}
                >
                  {copiedId === script.id ? <IconCheck size={11} /> : <IconCopy size={11} />}
                </button>
              </div>

              <div className="script-attribute-row">
                {script.actor ? <span>{`actor: ${script.actor}`}</span> : null}
                {script.gateId ? <span>{`gate: ${script.gateId}`}</span> : null}
                {script.status ? <span>{`status: ${script.status}`}</span> : null}
                {script.startedAt ? <span>{`started: ${script.startedAt}`}</span> : null}
              </div>

              <div className="script-log-path">
                <IconFileText size={11} />
                {script.logPath ? (
                  <code>{script.logPath}</code>
                ) : (
                  <span>
                    log path <UnknownValue what="log path" />
                  </span>
                )}
              </div>

              <LogTail label="stdout" text={script.stdoutTail} variant="stdout" />
              <LogTail label="stderr" text={script.stderrTail} variant="stderr" />

              <div className="drawer-command-footer">
                <span className="drawer-command-cwd">
                  CWD:{" "}
                  {script.cwd ? (
                    <code>{script.cwd}</code>
                  ) : (
                    <UnknownValue what="working directory" />
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </DrawerSection>
    </div>
  );
});
