/**
 * High-performance Dark Mode Terminal Display Component with ANSI styling.
 * 100% Zero-any type-safe implementation.
 */

import React, { useEffect, useRef, type CSSProperties, type FC } from "react";
import type { AnsiLine, AnsiSpan } from "../../engine/sandbox/types";

export interface TerminalDisplayProps {
  lines: AnsiLine[];
  searchQuery?: string;
  autoScroll?: boolean;
  maxHeight?: string | number;
  showLineNumbers?: boolean;
  className?: string;
  emptyMessage?: string;
}

/**
 * Converts AnsiSpan styling attributes to React CSSProperties.
 */
function getSpanStyle(span: AnsiSpan): CSSProperties {
  const s = span.style;
  const style: CSSProperties = {};

  if (s.color) style.color = s.color;
  if (s.bgColor) style.backgroundColor = s.bgColor;
  if (s.bold) style.fontWeight = "bold";
  if (s.italic) style.fontStyle = "italic";
  if (s.dim) style.opacity = 0.6;

  const textDec: string[] = [];
  if (s.underline) textDec.push("underline");
  if (s.strikethrough) textDec.push("line-through");
  if (textDec.length > 0) {
    style.textDecoration = textDec.join(" ");
  }

  if (s.inverse) {
    // Invert colors
    const fg = s.color || "#ffffff";
    const bg = s.bgColor || "#000000";
    style.color = bg;
    style.backgroundColor = fg;
  }

  return style;
}

export const TerminalDisplay: FC<TerminalDisplayProps> = ({
  lines,
  searchQuery = "",
  autoScroll = true,
  maxHeight = "520px",
  showLineNumbers = true,
  className = "",
  emptyMessage = "No output available",
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, autoScroll]);

  const handleCopy = () => {
    const raw = lines.map((l) => l.plainText).join("\n");
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(raw);
    }
  };

  const renderSpanWithSearch = (span: AnsiSpan, key: string) => {
    const spanStyle = getSpanStyle(span);
    if (!searchQuery.trim()) {
      return (
        <span key={key} style={spanStyle}>
          {span.text}
        </span>
      );
    }

    const query = searchQuery.toLowerCase();
    const text = span.text;
    const lowerText = text.toLowerCase();

    if (!lowerText.includes(query)) {
      return (
        <span key={key} style={spanStyle}>
          {text}
        </span>
      );
    }

    const elements: React.ReactNode[] = [];
    let lastIdx = 0;
    let matchIdx = lowerText.indexOf(query, lastIdx);

    while (matchIdx !== -1) {
      if (matchIdx > lastIdx) {
        elements.push(
          <span key={`${key}-text-${lastIdx}`} style={spanStyle}>
            {text.substring(lastIdx, matchIdx)}
          </span>,
        );
      }
      elements.push(
        <mark
          key={`${key}-mark-${matchIdx}`}
          className="terminal-search-highlight"
          style={{
            ...spanStyle,
            backgroundColor: "#fbbf24",
            color: "#000000",
            fontWeight: "bold",
            borderRadius: "2px",
            padding: "0 1px",
          }}
        >
          {text.substring(matchIdx, matchIdx + query.length)}
        </mark>,
      );
      lastIdx = matchIdx + query.length;
      matchIdx = lowerText.indexOf(query, lastIdx);
    }

    if (lastIdx < text.length) {
      elements.push(
        <span key={`${key}-tail-${lastIdx}`} style={spanStyle}>
          {text.substring(lastIdx)}
        </span>,
      );
    }

    return <React.Fragment key={key}>{elements}</React.Fragment>;
  };

  return (
    <div className={`terminal-display-wrapper ${className}`} style={{ maxHeight }}>
      <div className="terminal-display-header">
        <div className="terminal-dots">
          <span className="dot red" />
          <span className="dot yellow" />
          <span className="dot green" />
          <span className="terminal-title">Terminal Stream Output</span>
        </div>
        <div className="terminal-header-actions">
          <span className="terminal-lines-count">{lines.length} lines</span>
          <button
            type="button"
            className="terminal-copy-btn"
            onClick={handleCopy}
            title="Copy terminal plain text"
            aria-label="Copy terminal plain text"
          >
            Copy
          </button>
        </div>
      </div>

      <div ref={containerRef} className="terminal-scroll-area" data-testid="terminal-scroll-area">
        {lines.length === 0 ? (
          <div className="terminal-empty-state">{emptyMessage}</div>
        ) : (
          lines.map((line, lIdx) => (
            <div
              key={`line-${line.lineNumber}-${lIdx}`}
              className={`terminal-line stream-${line.stream}`}
            >
              {showLineNumbers && (
                <span className="terminal-gutter">
                  <span className="line-num">{line.lineNumber}</span>
                  <span className={`stream-tag stream-tag-${line.stream}`}>
                    {line.stream === "stderr"
                      ? "ERR"
                      : line.stream === "stdout"
                        ? "OUT"
                        : line.stream === "stdin"
                          ? "IN"
                          : "SYS"}
                  </span>
                </span>
              )}
              <span className="terminal-line-content">
                {line.spans.map((span, sIdx) => renderSpanWithSearch(span, `s-${lIdx}-${sIdx}`))}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
