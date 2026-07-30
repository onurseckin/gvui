import type { FC } from "react";
import type { NodeTool } from "../../../types/graphData";

export interface NodeCardToolsProps {
  tools?: NodeTool[];
}

function resolveToolIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("grep") || lower.includes("search") || lower.includes("find")) {
    return "🔧";
  }
  if (
    lower.includes("script") ||
    lower.includes(".sh") ||
    lower.includes("bash") ||
    lower.includes("exec")
  ) {
    return "📜";
  }
  if (lower.includes("read") || lower.includes("write") || lower.includes("file")) {
    return "📁";
  }
  if (lower.includes("http") || lower.includes("fetch") || lower.includes("web")) {
    return "🌐";
  }
  return "🛠️";
}

export const NodeCardTools: FC<NodeCardToolsProps> = ({ tools }) => {
  if (!tools || tools.length === 0) {
    return null;
  }

  return (
    <div className="node-card-tools">
      {tools.map((tool, index) => {
        const icon = resolveToolIcon(tool.name);
        return (
          <span key={`${tool.name}-${index}`} className="node-card-tool-chip">
            <span className="tool-icon">{icon}</span>
            <code className="tool-name">{tool.name}</code>
          </span>
        );
      })}
    </div>
  );
};
