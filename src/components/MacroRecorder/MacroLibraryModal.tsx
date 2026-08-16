import React, { useState } from "react";
import type { MacroScript } from "../../engine/macros/types";
import { useMacroStore } from "./useMacroStore";

export const MacroLibraryModal: React.FC = () => {
  const scripts = useMacroStore((s) => s.scripts);
  const activeScript = useMacroStore((s) => s.activeScript);
  const loadScript = useMacroStore((s) => s.loadScript);
  const deleteScript = useMacroStore((s) => s.deleteScript);
  const duplicateScript = useMacroStore((s) => s.duplicateScript);
  const searchFilter = useMacroStore((s) => s.searchFilter);
  const setSearchFilter = useMacroStore((s) => s.setSearchFilter);
  const categoryFilter = useMacroStore((s) => s.categoryFilter);
  const setCategoryFilter = useMacroStore((s) => s.setCategoryFilter);
  const importScriptJson = useMacroStore((s) => s.importScriptJson);
  const exportActiveScriptJson = useMacroStore((s) => s.exportActiveScriptJson);

  const [importJsonText, setImportJsonText] = useState("");
  const [showImportArea, setShowImportArea] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState(false);

  const categories = Array.from(new Set(scripts.map((s) => s.category ?? "General")));

  const filteredScripts = scripts.filter((s) => {
    if (categoryFilter !== "all" && (s.category ?? "General") !== categoryFilter) {
      return false;
    }
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    const matchName = s.name.toLowerCase().includes(q);
    const matchDesc = (s.description ?? "").toLowerCase().includes(q);
    const matchTags = s.tags?.some((t) => t.toLowerCase().includes(q)) ?? false;
    return matchName || matchDesc || matchTags;
  });

  const handleImport = () => {
    setImportError(null);
    if (!importJsonText.trim()) return;
    const res = importScriptJson(importJsonText);
    if (res.success) {
      setImportJsonText("");
      setShowImportArea(false);
    } else {
      setImportError(res.errors.join("; "));
    }
  };

  const handleExportClipboard = () => {
    const json = exportActiveScriptJson(true);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(json);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2000);
    }
  };

  return (
    <div className="macro-library-container">
      {/* Top Search & Filter */}
      <div className="macro-library-search">
        <input
          type="text"
          className="macro-param-input"
          placeholder="Search macros by name, tag, or desc..."
          value={searchFilter}
          onChange={(e) => setSearchFilter(e.target.value)}
        />
        <select
          className="macro-speed-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Import / Export Controls */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          <button
            type="button"
            className="macro-ctrl-btn"
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={() => setShowImportArea(!showImportArea)}
          >
            {showImportArea ? "Cancel Import" : "📥 Import JSON"}
          </button>
          <button
            type="button"
            className="macro-ctrl-btn"
            style={{ fontSize: "11px", padding: "4px 8px" }}
            onClick={handleExportClipboard}
          >
            {copiedNotification ? "✓ Copied!" : "📋 Export JSON"}
          </button>
        </div>
        <span style={{ fontSize: "11px", color: "#a1a1aa" }}>{filteredScripts.length} Macros</span>
      </div>

      {/* Import JSON Area */}
      {showImportArea && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            background: "#121214",
            padding: "8px",
            borderRadius: "6px",
          }}
        >
          <textarea
            className="macro-param-input"
            rows={4}
            placeholder="Paste Macro JSON string here..."
            value={importJsonText}
            onChange={(e) => setImportJsonText(e.target.value)}
            style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "11px" }}
          />
          {importError && <div style={{ color: "#ef4444", fontSize: "11px" }}>{importError}</div>}
          <button
            type="button"
            className="macro-ctrl-btn primary"
            style={{ alignSelf: "flex-end", fontSize: "11px", padding: "4px 10px" }}
            onClick={handleImport}
          >
            Import Macro
          </button>
        </div>
      )}

      {/* Script Cards List */}
      <div className="macro-library-cards" role="list">
        {filteredScripts.map((script: MacroScript) => {
          const isActive = activeScript?.id === script.id;

          return (
            <div key={script.id} className="macro-library-item" role="listitem">
              <div className="macro-library-item-header">
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span className="macro-library-item-title">{script.name}</span>
                  {isActive && <span className="macro-badge success">Active</span>}
                </div>
                <span className="macro-badge">{script.category ?? "General"}</span>
              </div>

              {script.description && (
                <div className="macro-library-item-desc">{script.description}</div>
              )}

              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "10px", color: "#a1a1aa" }}>
                  {script.steps.length} steps
                </span>
                {script.parameters.length > 0 && (
                  <span style={{ fontSize: "10px", color: "#818cf8" }}>
                    • {script.parameters.length} params
                  </span>
                )}
                {script.tags?.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: "9px",
                      background: "#27272a",
                      color: "#c7d2fe",
                      padding: "1px 4px",
                      borderRadius: "3px",
                    }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>

              <div className="macro-library-item-footer">
                <div style={{ display: "flex", gap: "4px" }}>
                  <button
                    type="button"
                    className="macro-ctrl-btn primary"
                    style={{ fontSize: "11px", padding: "3px 8px" }}
                    onClick={() => loadScript(script)}
                  >
                    {isActive ? "Reload" : "Load"}
                  </button>
                  <button
                    type="button"
                    className="macro-ctrl-btn"
                    style={{ fontSize: "11px", padding: "3px 8px" }}
                    onClick={() => duplicateScript(script.id)}
                  >
                    Duplicate
                  </button>
                </div>

                <button
                  type="button"
                  className="macro-icon-btn"
                  title="Delete Macro"
                  aria-label={`Delete ${script.name}`}
                  onClick={() => deleteScript(script.id)}
                  style={{ color: "#ef4444" }}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
