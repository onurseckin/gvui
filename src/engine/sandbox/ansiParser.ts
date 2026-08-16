/**
 * ANSI Color & Terminal Escape Sequence Parser.
 * Converts raw terminal stream text into structured styled spans and lines.
 * 100% Zero-any type-safe implementation.
 */

import type { AnsiLine, AnsiSpan, AnsiStyle, OutputStreamType, ParsedAnsiResult } from "./types";

// Standard 8 ANSI colors (Index 0 - 7)
const STANDARD_COLORS: readonly string[] = [
  "#18181b", // 0: Black
  "#ef4444", // 1: Red
  "#10b981", // 2: Green
  "#f59e0b", // 3: Yellow
  "#3b82f6", // 4: Blue
  "#8b5cf6", // 5: Magenta
  "#06b6d4", // 6: Cyan
  "#f4f4f5", // 7: White
];

// Bright 8 ANSI colors (Index 8 - 15)
const BRIGHT_COLORS: readonly string[] = [
  "#71717a", // 8: Bright Black (Gray)
  "#f87171", // 9: Bright Red
  "#34d399", // 10: Bright Green
  "#fbbf24", // 11: Bright Yellow
  "#60a5fa", // 12: Bright Blue
  "#a78bfa", // 13: Bright Magenta
  "#22d3ee", // 14: Bright Cyan
  "#ffffff", // 15: Bright White
];

const ESC = String.fromCharCode(27);
const ANSI_CSI_REGEX = new RegExp(`${ESC}\\[[0-9;?]*[a-zA-Z]`, "g");
const ANSI_OSC_REGEX = new RegExp(`${ESC}\\([a-zA-Z]`, "g");

/**
 * Maps 256-color palette index to hex color string.
 */
export function get256Color(index: number): string {
  if (index < 0 || index > 255) return "#ffffff";
  if (index < 8) return STANDARD_COLORS[index] ?? "#18181b";
  if (index < 16) return BRIGHT_COLORS[index - 8] ?? "#71717a";

  // 6x6x6 color cube (16-231)
  if (index <= 231) {
    const cubeIndex = index - 16;
    const r = Math.floor(cubeIndex / 36);
    const g = Math.floor((cubeIndex % 36) / 6);
    const b = cubeIndex % 6;
    const toVal = (c: number) => (c === 0 ? 0 : 55 + c * 40);
    const rv = toVal(r).toString(16).padStart(2, "0");
    const gv = toVal(g).toString(16).padStart(2, "0");
    const bv = toVal(b).toString(16).padStart(2, "0");
    return `#${rv}${gv}${bv}`;
  }

  // Grayscale ramp (232-255)
  const grayVal = 8 + (index - 232) * 10;
  const hex = grayVal.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

/**
 * Strips all ANSI escape codes and control characters from text.
 */
export function stripAnsi(input: string): string {
  return input
    .replace(ANSI_CSI_REGEX, "")
    .replace(ANSI_OSC_REGEX, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/**
 * Formats RGB values into a CSS color string.
 */
export function formatRgbColor(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `rgb(${clamp(r)}, ${clamp(g)}, ${clamp(b)})`;
}

/**
 * Clones an AnsiStyle object cleanly.
 */
export function cloneStyle(style: AnsiStyle): AnsiStyle {
  return { ...style };
}

/**
 * Applies SGR (Select Graphic Rendition) parameters to current terminal style.
 */
function applySgrCodes(codes: number[], currentStyle: AnsiStyle): AnsiStyle {
  const style = cloneStyle(currentStyle);
  let i = 0;

  if (codes.length === 0) {
    return {};
  }

  while (i < codes.length) {
    const code = codes[i] ?? 0;

    if (code === 0) {
      // Reset all styles
      return {};
    } else if (code === 1) {
      style.bold = true;
    } else if (code === 2) {
      style.dim = true;
    } else if (code === 3) {
      style.italic = true;
    } else if (code === 4) {
      style.underline = true;
    } else if (code === 5 || code === 6) {
      style.blink = true;
    } else if (code === 7) {
      style.inverse = true;
    } else if (code === 8) {
      style.hidden = true;
    } else if (code === 9) {
      style.strikethrough = true;
    } else if (code === 21) {
      style.bold = false;
    } else if (code === 22) {
      style.bold = false;
      style.dim = false;
    } else if (code === 23) {
      style.italic = false;
    } else if (code === 24) {
      style.underline = false;
    } else if (code === 25) {
      style.blink = false;
    } else if (code === 27) {
      style.inverse = false;
    } else if (code === 28) {
      style.hidden = false;
    } else if (code === 29) {
      style.strikethrough = false;
    } else if (code >= 30 && code <= 37) {
      // Standard FG colors
      style.color = STANDARD_COLORS[code - 30];
    } else if (code === 38) {
      // Extended FG color
      const mode = codes[i + 1];
      if (mode === 5 && i + 2 < codes.length) {
        // 256-color: 38;5;n
        const colorIdx = codes[i + 2] ?? 0;
        style.color = get256Color(colorIdx);
        i += 2;
      } else if (mode === 2 && i + 4 < codes.length) {
        // TrueColor RGB: 38;2;r;g;b
        const r = codes[i + 2] ?? 0;
        const g = codes[i + 3] ?? 0;
        const b = codes[i + 4] ?? 0;
        style.color = formatRgbColor(r, g, b);
        i += 4;
      }
    } else if (code === 39) {
      // Default FG
      delete style.color;
    } else if (code >= 40 && code <= 47) {
      // Standard BG colors
      style.bgColor = STANDARD_COLORS[code - 40];
    } else if (code === 48) {
      // Extended BG color
      const mode = codes[i + 1];
      if (mode === 5 && i + 2 < codes.length) {
        // 256-color BG: 48;5;n
        const colorIdx = codes[i + 2] ?? 0;
        style.bgColor = get256Color(colorIdx);
        i += 2;
      } else if (mode === 2 && i + 4 < codes.length) {
        // TrueColor RGB BG: 48;2;r;g;b
        const r = codes[i + 2] ?? 0;
        const g = codes[i + 3] ?? 0;
        const b = codes[i + 4] ?? 0;
        style.bgColor = formatRgbColor(r, g, b);
        i += 4;
      }
    } else if (code === 49) {
      // Default BG
      delete style.bgColor;
    } else if (code >= 90 && code <= 97) {
      // Bright FG colors
      style.color = BRIGHT_COLORS[code - 90];
    } else if (code >= 100 && code <= 107) {
      // Bright BG colors
      style.bgColor = BRIGHT_COLORS[code - 100];
    }

    i++;
  }

  return style;
}

/**
 * Parses raw ANSI text stream into lines containing styled spans.
 */
export function parseAnsi(
  text: string,
  stream: OutputStreamType = "stdout",
  timestampMs?: number,
): ParsedAnsiResult {
  if (!text) {
    return {
      lines: [],
      plainText: "",
      hasAnsi: false,
      totalAnsiCodes: 0,
    };
  }

  let totalAnsiCodes = 0;
  let hasAnsi = false;

  // Normalize line breaks
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rawLines = normalized.split("\n");

  // If text ends with a trailing newline, pop the empty trailing element
  if (rawLines.length > 1 && rawLines[rawLines.length - 1] === "" && normalized.endsWith("\n")) {
    rawLines.pop();
  }

  const ansiLines: AnsiLine[] = [];
  let currentStyle: AnsiStyle = {};

  // Regex matching ANSI escape sequences: ESC [ ... m or other command sequences
  const ansiPattern = new RegExp(`${ESC}\\[([0-9;]*)([a-zA-Z])`, "g");

  for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
    const rawLine = rawLines[lineIdx] ?? "";
    const spans: AnsiSpan[] = [];
    let lastIndex = 0;

    ansiPattern.lastIndex = 0;
    let match: RegExpExecArray | null = ansiPattern.exec(rawLine);

    while (match !== null) {
      hasAnsi = true;
      totalAnsiCodes++;

      const matchIndex = match.index;
      const fullMatch = match[0];
      const params = match[1] ?? "";
      const command = match[2] ?? "";

      // Push text span preceding the ANSI code
      if (matchIndex > lastIndex) {
        const textChunk = rawLine.substring(lastIndex, matchIndex);
        if (textChunk.length > 0) {
          spans.push({
            text: textChunk,
            style: cloneStyle(currentStyle),
          });
        }
      }

      if (command === "m") {
        // SGR code
        const codes = params
          .split(";")
          .filter((p) => p.trim() !== "")
          .map((p) => parseInt(p, 10))
          .filter((n) => !isNaN(n));

        if (codes.length === 0) {
          codes.push(0); // \u001b[m is equivalent to \u001b[0m
        }

        currentStyle = applySgrCodes(codes, currentStyle);
      }

      lastIndex = matchIndex + fullMatch.length;
      match = ansiPattern.exec(rawLine);
    }

    // Remaining trailing text after last code
    if (lastIndex < rawLine.length) {
      const textChunk = rawLine.substring(lastIndex);
      if (textChunk.length > 0) {
        spans.push({
          text: textChunk,
          style: cloneStyle(currentStyle),
        });
      }
    }

    // If the line was empty, provide an empty span
    if (spans.length === 0) {
      spans.push({
        text: "",
        style: cloneStyle(currentStyle),
      });
    }

    ansiLines.push({
      lineNumber: lineIdx + 1,
      spans,
      rawText: rawLine,
      plainText: stripAnsi(rawLine),
      stream,
      timestampMs,
    });
  }

  const plainText = stripAnsi(normalized);

  return {
    lines: ansiLines,
    plainText,
    hasAnsi,
    totalAnsiCodes,
  };
}
