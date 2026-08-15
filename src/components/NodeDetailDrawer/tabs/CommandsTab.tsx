import type { FC } from "react";
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
          return (
            <div key={`${cmd.id}-${index}`} className="drawer-command-card">
              <div className="drawer-command-header">
                <span className={`drawer-command-exit ${isSuccess ? "is-success" : "is-error"}`}>
                  Exit {cmd.exitCode}
                </span>
                <span style={{ color: "#a1a1aa", fontSize: "11px" }}>
                  {formatDuration(cmd.durationMs)}
                </span>
              </div>
              <div className="drawer-command-argv">
                <code>$ {Array.isArray(cmd.argv) ? cmd.argv.join(" ") : String(cmd.argv)}</code>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  color: "#71717a",
                  fontSize: "10.5px",
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
