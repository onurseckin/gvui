import type { ReactNode } from "react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useGraphStore } from "../../state/useGraphStore";
import { Button } from "../../ui/atoms/Button";
import type { TableName } from "../../utils/sqliteDb";
import { TABLE_METADATA, sqliteDb } from "../../utils/sqliteDb";
import type { DeveloperSettingsProps, DeveloperSettingsTab } from "./DeveloperSettings.types";
import "./DeveloperSettings.css";

const getStorageData = (): Record<string, unknown> => {
  const data: Record<string, unknown> = {};
  if (typeof window === "undefined" || !window.localStorage) {
    return data;
  }
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key !== null) {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        try {
          data[key] = JSON.parse(raw) as unknown;
        } catch {
          data[key] = raw;
        }
      }
    }
  }
  return data;
};

const renderColorizedJson = (jsonStr: string): ReactNode[] => {
  const tokenRegex =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  const elements: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(jsonStr)) !== null) {
    const matchIndex = match.index;
    if (matchIndex > lastIndex) {
      elements.push(jsonStr.substring(lastIndex, matchIndex));
    }

    const token = match[0];
    if (token.startsWith('"')) {
      if (token.endsWith(":")) {
        const keyText = token.slice(0, -1);
        elements.push(
          <span key={`key-${matchIndex}`} className="json-key">
            {keyText}
          </span>,
          ":",
        );
      } else {
        elements.push(
          <span key={`str-${matchIndex}`} className="json-string">
            {token}
          </span>,
        );
      }
    } else if (token === "true" || token === "false") {
      elements.push(
        <span key={`bool-${matchIndex}`} className="json-boolean">
          {token}
        </span>,
      );
    } else if (token === "null") {
      elements.push(
        <span key={`null-${matchIndex}`} className="json-null">
          {token}
        </span>,
      );
    } else {
      elements.push(
        <span key={`num-${matchIndex}`} className="json-number">
          {token}
        </span>,
      );
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < jsonStr.length) {
    elements.push(jsonStr.substring(lastIndex));
  }

  return elements;
};

export const DeveloperSettings: React.FC<DeveloperSettingsProps> = React.memo(
  function DeveloperSettings({ className = "" }) {
    const [activeTab, setActiveTab] = useState<DeveloperSettingsTab>("database");
    const [storageData, setStorageData] = useState<Record<string, unknown>>({});
    const [clearedToast, setClearedToast] = useState<boolean>(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    // Database Viewer State
    const selectedTable: TableName = "graph_layouts";
    const [dbRows, setDbRows] = useState<Record<string, unknown>[]>([]);
    const [editingRowKey, setEditingRowKey] = useState<string | null>(null);
    const [editingRowJson, setEditingRowJson] = useState<string>("");
    const [jsonParseError, setJsonParseError] = useState<string | null>(null);

    // Granular selector for current file in Zustand store
    const currentFile = useGraphStore((state) => state.currentFile);

    const refreshStorageData = useCallback(() => {
      setStorageData(getStorageData());
    }, []);

    const refreshDbData = useCallback(() => {
      sqliteDb.reloadFromStorage();
      const rows = sqliteDb.getTableRows<Record<string, unknown>>(selectedTable);
      setDbRows(rows);
    }, [selectedTable]);

    useEffect(() => {
      refreshStorageData();
      refreshDbData();
      setClearedToast(false);
      setToastMessage(null);
      setEditingRowKey(null);
      setJsonParseError(null);
      setActiveTab("database");

      const handleStorageChange = () => {
        refreshStorageData();
        refreshDbData();
      };
      window.addEventListener("storage", handleStorageChange);

      return () => {
        window.removeEventListener("storage", handleStorageChange);
      };
    }, [currentFile, refreshStorageData, refreshDbData]);

    const showToast = useCallback((msg: string) => {
      setToastMessage(msg);
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }, []);

    const handleClearLocalStorage = useCallback(() => {
      localStorage.clear();
      refreshStorageData();
      refreshDbData();
      setClearedToast(true);
      showToast("Cleared Local Storage");
    }, [refreshStorageData, refreshDbData, showToast]);

    const handleSelectLocalStorageTab = useCallback(() => {
      setActiveTab("local-storage");
    }, []);

    const handleSelectDatabaseTab = useCallback(() => {
      setActiveTab("database");
      refreshDbData();
    }, [refreshDbData]);

    const handleDeleteRow = useCallback(
      (primaryKeyValue: string) => {
        const deleted = sqliteDb.deleteRow(selectedTable, primaryKeyValue);
        if (deleted) {
          refreshDbData();
          showToast(`Deleted row '${primaryKeyValue}' from ${selectedTable}`);
          if (editingRowKey === primaryKeyValue) {
            setEditingRowKey(null);
          }
        }
      },
      [selectedTable, refreshDbData, showToast, editingRowKey],
    );

    const handleEditRow = useCallback(
      (row: Record<string, unknown>) => {
        const primaryKeyName = TABLE_METADATA[selectedTable].primaryKey;
        const pkVal = String(row[primaryKeyName] ?? "");
        setEditingRowKey(pkVal);
        setEditingRowJson(JSON.stringify(row, null, 2));
        setJsonParseError(null);
      },
      [selectedTable],
    );

    const handleSaveRowJson = useCallback(() => {
      try {
        const parsed = JSON.parse(editingRowJson) as unknown;
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setJsonParseError("JSON content must be a valid JSON object.");
          return;
        }

        const primaryKeyName = TABLE_METADATA[selectedTable].primaryKey;
        const rowObj = parsed as Record<string, unknown>;
        if (!rowObj[primaryKeyName]) {
          setJsonParseError(
            `Object is missing required primary key field '${primaryKeyName}'.`,
          );
          return;
        }

        sqliteDb.upsertRow(selectedTable, rowObj);
        refreshDbData();
        showToast(`Saved row '${String(rowObj[primaryKeyName])}' in ${selectedTable}`);
        setEditingRowKey(null);
        setJsonParseError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setJsonParseError(`Invalid JSON syntax: ${msg}`);
      }
    }, [editingRowJson, selectedTable, refreshDbData, showToast]);

    const handleClearTable = useCallback(() => {
      sqliteDb.clearTable(selectedTable);
      refreshDbData();
      showToast(`Cleared table '${selectedTable}'`);
    }, [selectedTable, refreshDbData, showToast]);

    const handleClearDatabase = useCallback(() => {
      sqliteDb.clearDatabase();
      refreshDbData();
      refreshStorageData();
      showToast("Cleared SQLite Database");
    }, [refreshDbData, refreshStorageData, showToast]);

    const formattedJson = useMemo(() => JSON.stringify(storageData, null, 2), [storageData]);
    const keyCount = useMemo(() => Object.keys(storageData).length, [storageData]);
    const colorizedJson = useMemo(() => renderColorizedJson(formattedJson), [formattedJson]);

    const currentTableMeta = useMemo(() => TABLE_METADATA[selectedTable], [selectedTable]);

    return (
      <div className={`developer-settings-panel ${className}`.trim()}>
        <div className="developer-settings-header">
          <div className="developer-settings-header-content">
            <p className="developer-settings-description">
              Inspect application state, SQLite database tables, and local storage entries
            </p>
          </div>
          <div className="developer-settings-header-actions">
            <Button
              variant="outline"
              size="sm"
              className="developer-settings-refresh-btn"
              onClick={() => {
                refreshStorageData();
                refreshDbData();
              }}
              title="Refresh Data"
            >
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6" />
                <path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8M2.5 16l1.2 1.2a10 10 0 0 0 18.8-4.2" />
              </svg>
              <span>Refresh</span>
            </Button>
          </div>
        </div>

            <div className="developer-settings-tabs" role="tablist">
              <Button
                variant={activeTab === "database" ? "outline" : "ghost"}
                size="sm"
                role="tab"
                aria-selected={activeTab === "database"}
                className="developer-settings-tab"
                onClick={handleSelectDatabaseTab}
              >
                Database Viewer
              </Button>
              <Button
                variant={activeTab === "local-storage" ? "outline" : "ghost"}
                size="sm"
                role="tab"
                aria-selected={activeTab === "local-storage"}
                className="developer-settings-tab"
                onClick={handleSelectLocalStorageTab}
              >
                Local Storage
              </Button>
            </div>

            <div className="developer-settings-body">
              {toastMessage && (
                <div className="developer-settings-toast">
                  <svg
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{toastMessage}</span>
                </div>
              )}

              {activeTab === "database" && (
                <div className="db-viewer-container">
                  <div className="developer-settings-toolbar">
                    <div className="developer-settings-info">
                      <span>Table: </span>
                      <strong className="db-table-name">{selectedTable}</strong>
                      <span className="developer-settings-count-badge">
                        {dbRows.length} {dbRows.length === 1 ? "row" : "rows"}
                      </span>
                      <span className="db-pk-badge">PK: {currentTableMeta.primaryKey}</span>
                    </div>

                    <div className="db-toolbar-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        className="db-action-btn"
                        onClick={handleClearTable}
                        disabled={dbRows.length === 0}
                      >
                        Clear Table
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="developer-settings-clear-btn"
                        onClick={handleClearDatabase}
                      >
                        Clear Database
                      </Button>
                    </div>
                  </div>

                  {editingRowKey !== null && (
                    <div className="db-json-editor-card">
                      <div className="db-json-editor-header">
                        <span>
                          Editing Row (PK: <code>{editingRowKey}</code>)
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingRowKey(null);
                            setJsonParseError(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>

                      {jsonParseError && (
                        <div className="db-error-banner">
                          <svg
                            viewBox="0 0 24 24"
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                          <span>{jsonParseError}</span>
                        </div>
                      )}

                      <textarea
                        className="db-json-textarea"
                        value={editingRowJson}
                        onChange={(e) => setEditingRowJson(e.target.value)}
                        rows={10}
                        spellCheck={false}
                      />

                      <div className="db-json-editor-actions">
                        <Button variant="outline" size="sm" onClick={handleSaveRowJson}>
                          Save Row Changes
                        </Button>
                      </div>
                    </div>
                  )}

                  <div className="db-table-wrapper">
                    {dbRows.length === 0 ? (
                      <div className="db-empty-state">
                        <span>No rows found in table `{selectedTable}`.</span>
                      </div>
                    ) : (
                      <table className="db-data-table">
                        <thead>
                          <tr>
                            <th className="db-th db-th-actions-left">Actions</th>
                            {currentTableMeta.columns.map((col) => (
                              <th key={col} className="db-th">
                                {col} {col === currentTableMeta.primaryKey && "(PK)"}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dbRows.map((row) => {
                            const pkVal = String(row[currentTableMeta.primaryKey] ?? "");
                            return (
                              <tr key={pkVal} className="db-tr">
                                <td className="db-td db-td-actions-left">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="db-row-icon-btn db-row-edit-icon"
                                    onClick={() => handleEditRow(row)}
                                    title="Edit JSON"
                                    aria-label="Edit JSON"
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      width="14"
                                      height="14"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="db-row-icon-btn db-row-delete-icon"
                                    onClick={() => handleDeleteRow(pkVal)}
                                    title="Delete row"
                                    aria-label="Delete row"
                                  >
                                    <svg
                                      viewBox="0 0 24 24"
                                      width="14"
                                      height="14"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <polyline points="3 6 5 6 21 6" />
                                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                      <line x1="10" y1="11" x2="10" y2="17" />
                                      <line x1="14" y1="11" x2="14" y2="17" />
                                    </svg>
                                  </Button>
                                </td>
                                {currentTableMeta.columns.map((col) => {
                                  const val = row[col];
                                  let displayVal = "";
                                  if (typeof val === "object" && val !== null) {
                                    displayVal = JSON.stringify(val);
                                  } else {
                                    displayVal = String(val ?? "");
                                  }
                                  return (
                                    <td key={col} className="db-td" title={displayVal}>
                                      {displayVal.length > 50
                                        ? `${displayVal.substring(0, 50)}...`
                                        : displayVal}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "local-storage" && (
                <>
                  <div className="developer-settings-toolbar">
                    <div className="developer-settings-info">
                      <span>Stored Entries</span>
                      <span className="developer-settings-count-badge">
                        {keyCount} {keyCount === 1 ? "item" : "items"}
                      </span>
                      {clearedToast && (
                        <span className="developer-settings-cleared-toast">
                          <svg
                            viewBox="0 0 24 24"
                            width="14"
                            height="14"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Cleared
                        </span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="developer-settings-clear-btn"
                      onClick={handleClearLocalStorage}
                      disabled={keyCount === 0}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                      Clear Local Storage
                    </Button>
                  </div>

                  <div className="developer-settings-json-container">
                    <pre className="developer-settings-json-code">
                      <code>{colorizedJson}</code>
                    </pre>
                  </div>
                </>
              )}
            </div>
          </div>
    );
  },
);

export default DeveloperSettings;
export type { DeveloperSettingsProps, DeveloperSettingsTab } from "./DeveloperSettings.types";
