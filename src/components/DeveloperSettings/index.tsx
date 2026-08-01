import type { ReactNode } from "react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog } from "@base-ui-components/react/dialog";
import { useGraphStore } from "../../state/useGraphStore";
import { Button } from "../../ui/atoms/Button";
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
  function DeveloperSettings({ isOpen, onClose, onClearStorage }) {
    const [activeTab, setActiveTab] = useState<DeveloperSettingsTab>("local-storage");
    const [storageData, setStorageData] = useState<Record<string, unknown>>({});
    const [clearedToast, setClearedToast] = useState<boolean>(false);

    // Granular selector for current file in Zustand store
    const currentFile = useGraphStore((state) => state.currentFile);

    const refreshStorageData = useCallback(() => {
      setStorageData(getStorageData());
    }, []);

    useEffect(() => {
      if (isOpen) {
        refreshStorageData();
        setClearedToast(false);
        setActiveTab("local-storage");

        const handleStorageChange = () => {
          refreshStorageData();
        };
        window.addEventListener("storage", handleStorageChange);

        return () => {
          window.removeEventListener("storage", handleStorageChange);
        };
      }
    }, [isOpen, currentFile, refreshStorageData]);

    const handleClearLocalStorage = useCallback(() => {
      localStorage.clear();
      refreshStorageData();
      setClearedToast(true);
      onClearStorage?.();
    }, [refreshStorageData, onClearStorage]);

    const handleSelectLocalStorageTab = useCallback(() => {
      setActiveTab("local-storage");
    }, []);

    const formattedJson = useMemo(() => JSON.stringify(storageData, null, 2), [storageData]);
    const keyCount = useMemo(() => Object.keys(storageData).length, [storageData]);
    const colorizedJson = useMemo(() => renderColorizedJson(formattedJson), [formattedJson]);

    return (
      <Dialog.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="developer-settings-backdrop" />
          <Dialog.Popup className="developer-settings-dialog">
            <div className="developer-settings-header">
              <div className="developer-settings-header-content">
                <Dialog.Title className="developer-settings-title">
                  <svg
                    className="developer-settings-title-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Developer Settings
                </Dialog.Title>
                <Dialog.Description className="developer-settings-description">
                  Inspect application state and manage local storage entries
                </Dialog.Description>
              </div>
              <div className="developer-settings-header-actions">
                <Button
                  variant="outline"
                  size="sm"
                  className="developer-settings-refresh-btn"
                  onClick={refreshStorageData}
                  title="Refresh Local Storage"
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
                <Dialog.Close render={<Button variant="ghost" size="sm" aria-label="Close" />}>
                  <svg
                    viewBox="0 0 24 24"
                    width="16"
                    height="16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </Dialog.Close>
              </div>
            </div>

            <div className="developer-settings-tabs" role="tablist">
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
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    );
  },
);

export default DeveloperSettings;
export type { DeveloperSettingsProps, DeveloperSettingsTab } from "./DeveloperSettings.types";

