import type { FC } from "react";
import { IconCheck, IconX } from "@tabler/icons-react";
import { formatDuration } from "../../../primitives/nodes/NodeCard/nodeCardModel";
import type { CommandExecutionDetail, GraphNodeData } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";

interface CommandsTabProps {
  node: GraphNodeData;
}

export const CommandsTab: FC<CommandsTabProps> = ({ node }) => {
  const commands = (node.metadata?.commands ?? []) as CommandExecutionDetail[];

  if (commands.length === 0) {
    return (
      <div className="drawer-tab-content">
        <p className="drawer-prose" style={{ color: "#71717a", padding: "16px" }}>
          No command executions recorded for this node.
        </p>
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

          return (
            <div key={`${cmd.id}-${index}`} className="drawer-command-card">
              <div className="drawer-command-header">
                <span
                  className={`drawer-command-exit ${isSuccess ? "is-success" : "is-error"}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                >
                  {isSuccess ? <IconCheck size={12} /> : <IconX size={12} />}
                  Exit {cmd.exitCode}
                </span>
                <span
                  style={{
                    color: "#a1a1aa",
                    fontSize: "11px",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {formatDuration(cmd.durationMs)}
                </span>
              </div>
              <div className="drawer-command-argv">
                <code>$ {Array.isArray(cmd.argv) ? cmd.argv.join(" ") : String(cmd.argv)}</code>
              </div>
              {stdout ? (
                <div style={{ margin: "6px 0" }}>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#71717a",
                      textTransform: "uppercase",
                      marginBottom: "2px",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    stdout snippet:
                  </div>
                  <pre className="drawer-pre" style={{ maxHeight: "160px" }}>
                    {stdout}
                  </pre>
                </div>
              ) : null}
              {stderr ? (
                <div style={{ margin: "6px 0" }}>
                  <div
                    style={{
                      fontSize: "11px",
                      color: "#f87171",
                      textTransform: "uppercase",
                      marginBottom: "2px",
                      fontFamily: "var(--font-sans)",
                    }}
                  >
                    stderr snippet:
                  </div>
                  <pre className="drawer-pre" style={{ maxHeight: "160px", color: "#fca5a5" }}>
                    {stderr}
                  </pre>
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#71717a",
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                }}
              >
                <span>CWD: {cmd.cwd}</span>
                <code>{cmd.id}</code>
              </div>
            </div>
          );
        })}
      </DrawerSection>
    </div>
  );
};
