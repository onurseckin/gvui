import React from "react";
import type { ShortcutBadgeProps } from "./CommandPalette.types";

const SYMBOL_MAP: Record<string, string> = {
  cmd: "⌘",
  command: "⌘",
  meta: "⌘",
  "⌘": "⌘",
  shift: "⇧",
  "⇧": "⇧",
  alt: "⌥",
  opt: "⌥",
  option: "⌥",
  "⌥": "⌥",
  ctrl: "⌃",
  control: "⌃",
  "⌃": "⌃",
  enter: "↵",
  return: "↵",
  "↵": "↵",
  esc: "Esc",
  escape: "Esc",
  tab: "⇥",
  "⇥": "⇥",
  backspace: "⌫",
  "⌫": "⌫",
  up: "↑",
  arrowup: "↑",
  "↑": "↑",
  down: "↓",
  arrowdown: "↓",
  "↓": "↓",
  left: "←",
  arrowleft: "←",
  "←": "←",
  right: "→",
  arrowright: "→",
  "→": "→",
};

export function normalizeKey(key: string): string {
  const trimmed = key.trim();
  const lower = trimmed.toLowerCase();
  if (SYMBOL_MAP[lower]) {
    return SYMBOL_MAP[lower];
  }
  if (trimmed.length === 1) {
    return trimmed.toUpperCase();
  }
  return trimmed;
}

export function parseShortcut(shortcut: string | string[]): string[] {
  if (Array.isArray(shortcut)) {
    return shortcut.map(normalizeKey);
  }

  const raw = shortcut.trim();
  if (!raw) return [];

  // If shortcut uses plus delimiter e.g. "Cmd+K" or "Shift+Cmd+E"
  if (raw.includes("+")) {
    return raw
      .split("+")
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
      .map(normalizeKey);
  }

  // If shortcut is a compact symbol combination e.g. "⇧⌘E" or "⌥C"
  const symbols = ["⇧", "⌘", "⌥", "⌃", "↵", "⇥", "⌫", "↑", "↓", "←", "→"];
  const tokens: string[] = [];
  let remaining = raw;

  while (remaining.length > 0) {
    let matchedSymbol = false;
    for (const sym of symbols) {
      if (remaining.startsWith(sym)) {
        tokens.push(sym);
        remaining = remaining.slice(sym.length);
        matchedSymbol = true;
        break;
      }
    }
    if (!matchedSymbol) {
      tokens.push(remaining);
      break;
    }
  }

  return tokens.map(normalizeKey);
}

export const ShortcutBadge: React.FC<ShortcutBadgeProps> = React.memo(function ShortcutBadge({
  shortcut,
  className = "",
  size = "md",
  ariaLabel,
}) {
  const keys = parseShortcut(shortcut);
  if (keys.length === 0) return null;

  const defaultAriaLabel = `Shortcut: ${keys.join(" plus ")}`;

  return (
    <div
      className={`command-shortcut-badge command-shortcut-badge--${size} ${className}`.trim()}
      aria-label={ariaLabel ?? defaultAriaLabel}
      role="group"
    >
      {keys.map((k, index) => (
        <kbd key={`${k}-${index}`} className="command-shortcut-key">
          {k}
        </kbd>
      ))}
    </div>
  );
});

export default ShortcutBadge;
