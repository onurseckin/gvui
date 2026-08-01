import type { FC, MouseEvent } from "react";
import { memo, useCallback, useState } from "react";

export interface NodeCardDetailsProps {
  details?: Record<string, unknown>;
  prompt?: string;
  logs?: string;
}

export const NodeCardDetails: FC<NodeCardDetailsProps> = memo(({ details, prompt, logs }) => {
  const [isOpen, setIsOpen] = useState(false);

  const hasPayload = Boolean(details && Object.keys(details).length > 0);

  const handleToggleOpen = useCallback((e: MouseEvent<HTMLButtonElement>): void => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  }, []);

  if (!prompt && !logs && !hasPayload) {
    return null;
  }

  const formatContent = (): string => {
    const parts: string[] = [];
    if (prompt) {
      parts.push(`--- PROMPT ---\n${prompt}`);
    }
    if (logs) {
      parts.push(`--- LOGS ---\n${logs}`);
    }
    if (hasPayload && details) {
      parts.push(`--- PAYLOAD ---\n${JSON.stringify(details, null, 2)}`);
    }
    return parts.join("\n\n");
  };

  return (
    <div className="node-card-details">
      <button
        type="button"
        className="node-card-details-toggle"
        onClick={handleToggleOpen}
        aria-expanded={isOpen}
      >
        <span className="toggle-icon">{isOpen ? "▼" : "►"}</span>
        <span>Raw Payload / Logs</span>
      </button>
      {isOpen ? (
        <pre className="node-card-details-content">
          <code>{formatContent()}</code>
        </pre>
      ) : null}
    </div>
  );
});

NodeCardDetails.displayName = "NodeCardDetails";
