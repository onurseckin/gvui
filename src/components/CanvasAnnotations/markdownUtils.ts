export interface MarkdownInlineToken {
  type: "text" | "bold" | "italic" | "strikethrough" | "code" | "link" | "tag" | "mention";
  content: string;
  href?: string;
}

export type MarkdownBlockToken =
  | { type: "heading"; level: 1 | 2 | 3 | 4; text: string; inlines: MarkdownInlineToken[] }
  | { type: "paragraph"; text: string; inlines: MarkdownInlineToken[] }
  | { type: "blockquote"; text: string; inlines: MarkdownInlineToken[] }
  | { type: "codeblock"; language: string; code: string }
  | { type: "unordered-list"; items: Array<{ text: string; inlines: MarkdownInlineToken[] }> }
  | { type: "ordered-list"; items: Array<{ text: string; inlines: MarkdownInlineToken[] }> }
  | {
      type: "task-list";
      items: Array<{
        checked: boolean;
        text: string;
        inlines: MarkdownInlineToken[];
        index: number;
      }>;
    }
  | { type: "hr" }
  | {
      type: "table";
      headers: string[];
      rows: string[][];
    };

/**
 * Sanitizes markdown link href against dangerous protocols (javascript:, vbscript:, data:, etc.).
 * Allows safe protocols (http:, https:, mailto:, relative paths, and anchors).
 */
export function sanitizeMarkdownHref(rawHref?: string): string {
  if (!rawHref) return "#";
  const trimmed = rawHref.trim();
  if (!trimmed) return "#";

  // Check for dangerous javascript: / vbscript: / data: pseudo-protocols
  const normalizedLower = trimmed.toLowerCase().replace(/[\x00-\x20]/g, "");
  if (
    normalizedLower.startsWith("javascript:") ||
    normalizedLower.startsWith("vbscript:") ||
    normalizedLower.startsWith("data:") ||
    normalizedLower.startsWith("file:")
  ) {
    return "#";
  }

  // Safe relative paths or anchors
  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return trimmed;
  }

  // Safe standard protocols
  if (/^(https?|mailto):/i.test(trimmed)) {
    return trimmed;
  }

  return "#";
}

/**
 * Tokenizes inline Markdown syntax into structured tokens.
 */
export function parseInlineMarkdown(text: string): MarkdownInlineToken[] {
  const tokens: MarkdownInlineToken[] = [];
  let remaining = text;

  // Regex patterns for inline formatting
  const inlineRegex =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(~~[^~]+~~)|(\[[^\]]+\]\([^)]+\))|(@[a-zA-Z0-9_-]+)|(#[a-zA-Z0-9_-]+)/;

  while (remaining.length > 0) {
    const match = inlineRegex.exec(remaining);
    if (!match || match.index === undefined) {
      if (remaining.length > 0) {
        tokens.push({ type: "text", content: remaining });
      }
      break;
    }

    // Push preceding plain text
    if (match.index > 0) {
      tokens.push({ type: "text", content: remaining.slice(0, match.index) });
    }

    const matchedStr = match[0];
    if (matchedStr.startsWith("`") && matchedStr.endsWith("`")) {
      tokens.push({ type: "code", content: matchedStr.slice(1, -1) });
    } else if (
      (matchedStr.startsWith("**") && matchedStr.endsWith("**")) ||
      (matchedStr.startsWith("__") && matchedStr.endsWith("__"))
    ) {
      tokens.push({ type: "bold", content: matchedStr.slice(2, -2) });
    } else if (
      (matchedStr.startsWith("*") && matchedStr.endsWith("*")) ||
      (matchedStr.startsWith("_") && matchedStr.endsWith("_"))
    ) {
      tokens.push({ type: "italic", content: matchedStr.slice(1, -1) });
    } else if (matchedStr.startsWith("~~") && matchedStr.endsWith("~~")) {
      tokens.push({ type: "strikethrough", content: matchedStr.slice(2, -2) });
    } else if (
      matchedStr.startsWith("[") &&
      matchedStr.includes("](") &&
      matchedStr.endsWith(")")
    ) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(matchedStr);
      if (linkMatch) {
        tokens.push({
          type: "link",
          content: linkMatch[1],
          href: sanitizeMarkdownHref(linkMatch[2]),
        });
      } else {
        tokens.push({ type: "text", content: matchedStr });
      }
    } else if (matchedStr.startsWith("@")) {
      tokens.push({ type: "mention", content: matchedStr });
    } else if (matchedStr.startsWith("#")) {
      tokens.push({ type: "tag", content: matchedStr });
    } else {
      tokens.push({ type: "text", content: matchedStr });
    }

    remaining = remaining.slice(match.index + matchedStr.length);
  }

  return tokens;
}

/**
 * Parses multiline Markdown string into structured block tokens.
 */
export function parseMarkdownBlocks(rawMarkdown: string): MarkdownBlockToken[] {
  if (!rawMarkdown || !rawMarkdown.trim()) {
    return [];
  }

  const lines = rawMarkdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlockToken[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^(---|___|\*\*\*)$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Code Block (handles closed and unclosed code blocks safely)
    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) {
        i++; // skip closing ```
      }
      blocks.push({
        type: "codeblock",
        language: language || "text",
        code: codeLines.join("\n"),
      });
      continue;
    }

    // Headings
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4;
      const text = headingMatch[2];
      blocks.push({
        type: "heading",
        level,
        text,
        inlines: parseInlineMarkdown(text),
      });
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i++;
      }
      const quoteText = quoteLines.join("\n");
      blocks.push({
        type: "blockquote",
        text: quoteText,
        inlines: parseInlineMarkdown(quoteText),
      });
      continue;
    }

    // Task List Checkboxes
    if (/^-\s+\[([ xX])\]\s+(.+)$/.test(trimmed)) {
      const taskItems: Array<{
        checked: boolean;
        text: string;
        inlines: MarkdownInlineToken[];
        index: number;
      }> = [];
      let taskIndex = 0;
      while (i < lines.length && /^-\s+\[([ xX])\]\s+(.+)$/.test(lines[i].trim())) {
        const itemMatch = /^-\s+\[([ xX])\]\s+(.+)$/.exec(lines[i].trim());
        if (itemMatch) {
          const checked = itemMatch[1].toLowerCase() === "x";
          const text = itemMatch[2];
          taskItems.push({
            checked,
            text,
            inlines: parseInlineMarkdown(text),
            index: taskIndex++,
          });
        }
        i++;
      }
      blocks.push({
        type: "task-list",
        items: taskItems,
      });
      continue;
    }

    // Unordered List
    if (/^[-*+]\s+(.+)$/.test(trimmed)) {
      const listItems: Array<{ text: string; inlines: MarkdownInlineToken[] }> = [];
      while (
        i < lines.length &&
        /^[-*+]\s+(.+)$/.test(lines[i].trim()) &&
        !/^-\s+\[([ xX])\]/.test(lines[i].trim())
      ) {
        const itemMatch = /^[-*+]\s+(.+)$/.exec(lines[i].trim());
        if (itemMatch) {
          const text = itemMatch[1];
          listItems.push({ text, inlines: parseInlineMarkdown(text) });
        }
        i++;
      }
      blocks.push({
        type: "unordered-list",
        items: listItems,
      });
      continue;
    }

    // Ordered List
    if (/^\d+\.\s+(.+)$/.test(trimmed)) {
      const listItems: Array<{ text: string; inlines: MarkdownInlineToken[] }> = [];
      while (i < lines.length && /^\d+\.\s+(.+)$/.test(lines[i].trim())) {
        const itemMatch = /^\d+\.\s+(.+)$/.exec(lines[i].trim());
        if (itemMatch) {
          const text = itemMatch[1];
          listItems.push({ text, inlines: parseInlineMarkdown(text) });
        }
        i++;
      }
      blocks.push({
        type: "ordered-list",
        items: listItems,
      });
      continue;
    }

    // Table
    if (
      trimmed.startsWith("|") &&
      trimmed.endsWith("|") &&
      i + 1 < lines.length &&
      lines[i + 1].includes("|") &&
      /^[|\s-:]+$/.test(lines[i + 1].trim())
    ) {
      const headers = trimmed
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim());
      i += 2; // skip header and separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|")) {
        const rowCells = lines[i]
          .trim()
          .slice(1, -1)
          .split("|")
          .map((cell) => cell.trim());
        rows.push(rowCells);
        i++;
      }
      blocks.push({
        type: "table",
        headers,
        rows,
      });
      continue;
    }

    // Regular Paragraph
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].trim().startsWith("#") &&
      !lines[i].trim().startsWith(">") &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(---|___|\*\*\*)$/.test(lines[i].trim()) &&
      !(lines[i].trim().startsWith("|") && lines[i].trim().endsWith("|"))
    ) {
      paragraphLines.push(lines[i].trim());
      i++;
    }
    const paraText = paragraphLines.join(" ");
    if (paraText) {
      blocks.push({
        type: "paragraph",
        text: paraText,
        inlines: parseInlineMarkdown(paraText),
      });
    }
  }

  return blocks;
}

/**
 * Toggles a checkbox state inside a raw markdown string by task index.
 */
export function toggleMarkdownCheckbox(rawMarkdown: string, targetTaskIndex: number): string {
  const lines = rawMarkdown.replace(/\r\n/g, "\n").split("\n");
  let currentTaskIndex = 0;

  const modifiedLines = lines.map((line) => {
    const taskMatch = /^(\s*-\s+\[)([ xX])(\]\s+.+)$/.exec(line);
    if (taskMatch) {
      if (currentTaskIndex === targetTaskIndex) {
        const isCurrentlyChecked = taskMatch[2].toLowerCase() === "x";
        const newCheck = isCurrentlyChecked ? " " : "x";
        currentTaskIndex++;
        return `${taskMatch[1]}${newCheck}${taskMatch[3]}`;
      }
      currentTaskIndex++;
    }
    return line;
  });

  return modifiedLines.join("\n");
}
