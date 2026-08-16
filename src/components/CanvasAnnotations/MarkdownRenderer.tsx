import type { FC, MouseEvent } from "react";
import { memo, useMemo, useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import {
  parseMarkdownBlocks,
  sanitizeMarkdownHref,
  type MarkdownBlockToken,
  type MarkdownInlineToken,
} from "./markdownUtils";

export interface MarkdownRendererProps {
  content: string;
  className?: string;
  onToggleTask?: (taskIndex: number) => void;
  allowTaskToggle?: boolean;
}

const InlineTokensRenderer: FC<{ tokens: MarkdownInlineToken[] }> = memo(
  function InlineTokensRenderer({ tokens }) {
    return (
      <>
        {tokens.map((tok, idx) => {
          switch (tok.type) {
            case "bold":
              return (
                <strong key={idx} className="md-bold">
                  {tok.content}
                </strong>
              );
            case "italic":
              return (
                <em key={idx} className="md-italic">
                  {tok.content}
                </em>
              );
            case "strikethrough":
              return (
                <del key={idx} className="md-strike">
                  {tok.content}
                </del>
              );
            case "code":
              return (
                <code key={idx} className="md-inline-code">
                  {tok.content}
                </code>
              );
            case "link": {
              const safeHref = sanitizeMarkdownHref(tok.href);
              return (
                <a
                  key={idx}
                  href={safeHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="md-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {tok.content}
                </a>
              );
            }
            case "tag":
              return (
                <span key={idx} className="md-tag-chip">
                  {tok.content}
                </span>
              );
            case "mention":
              return (
                <span key={idx} className="md-mention-chip">
                  {tok.content}
                </span>
              );
            case "text":
            default:
              return <span key={idx}>{tok.content}</span>;
          }
        })}
      </>
    );
  },
);

const CodeBlockRenderer: FC<{ language: string; code: string }> = memo(function CodeBlockRenderer({
  language,
  code,
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="md-codeblock-wrapper">
      <div className="md-codeblock-header">
        <span className="md-codeblock-lang">{language || "plaintext"}</span>
        <button
          type="button"
          className="md-codeblock-copy-btn"
          onClick={handleCopy}
          title="Copy code snippet"
          aria-label="Copy code snippet"
        >
          {copied ? <IconCheck size={12} color="#10b981" /> : <IconCopy size={12} />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="md-codeblock-pre">
        <code className="md-codeblock-code">{code}</code>
      </pre>
    </div>
  );
});

export const MarkdownRenderer: FC<MarkdownRendererProps> = memo(function MarkdownRenderer({
  content,
  className = "",
  onToggleTask,
  allowTaskToggle = true,
}) {
  const blocks: MarkdownBlockToken[] = useMemo(() => {
    return parseMarkdownBlocks(content);
  }, [content]);

  if (!content || !content.trim()) {
    return <div className={`markdown-body is-empty ${className}`} />;
  }

  return (
    <div className={`markdown-body ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "heading": {
            const HeadingTag = `h${block.level}` as const;
            return (
              <HeadingTag key={idx} className={`md-h${block.level}`}>
                <InlineTokensRenderer tokens={block.inlines} />
              </HeadingTag>
            );
          }
          case "paragraph":
            return (
              <p key={idx} className="md-p">
                <InlineTokensRenderer tokens={block.inlines} />
              </p>
            );
          case "blockquote":
            return (
              <blockquote key={idx} className="md-blockquote">
                <InlineTokensRenderer tokens={block.inlines} />
              </blockquote>
            );
          case "codeblock":
            return <CodeBlockRenderer key={idx} language={block.language} code={block.code} />;
          case "unordered-list":
            return (
              <ul key={idx} className="md-ul">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="md-li">
                    <InlineTokensRenderer tokens={item.inlines} />
                  </li>
                ))}
              </ul>
            );
          case "ordered-list":
            return (
              <ol key={idx} className="md-ol">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="md-li">
                    <InlineTokensRenderer tokens={item.inlines} />
                  </li>
                ))}
              </ol>
            );
          case "task-list":
            return (
              <ul key={idx} className="md-task-list">
                {block.items.map((item) => (
                  <li
                    key={item.index}
                    className={`md-task-item ${item.checked ? "is-checked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={!allowTaskToggle || !onToggleTask}
                      onChange={(e) => {
                        e.stopPropagation();
                        if (allowTaskToggle && onToggleTask) {
                          onToggleTask(item.index);
                        }
                      }}
                      className="md-task-checkbox"
                      aria-label={`Task: ${item.text}`}
                    />
                    <span className="md-task-text">
                      <InlineTokensRenderer tokens={item.inlines} />
                    </span>
                  </li>
                ))}
              </ul>
            );
          case "hr":
            return <hr key={idx} className="md-hr" />;
          case "table":
            return (
              <div key={idx} className="md-table-container">
                <table className="md-table">
                  {block.headers.length > 0 && (
                    <thead>
                      <tr>
                        {block.headers.map((h, hIdx) => (
                          <th key={hIdx}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
});

MarkdownRenderer.displayName = "MarkdownRenderer";
