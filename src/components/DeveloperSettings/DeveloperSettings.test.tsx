import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { sqliteDb } from "../../utils/sqliteDb";
import { DeveloperSettings } from "./index";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = globalThis;
}
if (typeof document === "undefined") {
  const dummyEl = {
    setAttribute: () => {},
    removeAttribute: () => {},
    appendChild: () => {},
    removeChild: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    style: {},
    contains: () => false,
  };
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => dummyEl,
    createComment: () => dummyEl,
    createTextNode: () => dummyEl,
    body: dummyEl,
    documentElement: dummyEl,
    addEventListener: () => {},
    removeEventListener: () => {},
    activeElement: null,
  };
}

const store = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
  key: (index: number) => Array.from(store.keys())[index] ?? null,
  get length() {
    return store.size;
  },
};
Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

describe("DeveloperSettings Component", () => {
  beforeEach(() => {
    sqliteDb.clearDatabase();
    store.clear();
  });

  it("stores and clears database layout records for DeveloperSettings viewer", () => {
    sqliteDb.saveGraphLayout("sig-test", "top-down", [], []);
    const layout = sqliteDb.getGraphLayout("sig-test", "top-down");

    expect(layout).not.toBeNull();
    expect(layout?.file_signature).toBe("sig-test");

    sqliteDb.clearDatabase();
    expect(sqliteDb.getGraphLayout("sig-test", "top-down")).toBeNull();
  });

  it("renders null or dialog when open/closed", () => {
    const handleClose = mock(() => {});
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(DeveloperSettings, {
          isOpen: false,
          onClose: handleClose,
        }),
      );
    });

    expect(renderer.toJSON()).toBeNull();

    act(() => {
      renderer.update(
        createElement(DeveloperSettings, {
          isOpen: true,
          onClose: handleClose,
        }),
      );
    });

    const jsonStr = JSON.stringify(renderer.toJSON());
    expect(jsonStr).toContain("Developer Settings");
    expect(jsonStr).toContain("Database Viewer");
    expect(jsonStr).toContain("Local Storage");
  });

  it("allows switching tabs between Database Viewer and Local Storage", () => {
    store.set("test-key", JSON.stringify({ foo: "bar" }));
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(DeveloperSettings, {
          isOpen: true,
          onClose: () => {},
        }),
      );
    });

    let jsonStr = JSON.stringify(renderer.toJSON());
    expect(jsonStr).toContain("Database Viewer");
    expect(jsonStr).toContain("graph_layouts");

    // Find tab buttons
    const buttons = renderer.root.findAllByType("button");
    const localStorageTab = buttons.find((btn) => btn.children.includes("Local Storage"));
    expect(localStorageTab).toBeDefined();

    act(() => {
      localStorageTab?.props.onClick();
    });

    jsonStr = JSON.stringify(renderer.toJSON());
    expect(jsonStr).toContain("Stored Entries");
    expect(jsonStr).toContain("test-key");
    expect(jsonStr).toContain("Clear Local Storage");
  });

  it("clears database rows and local storage when clear buttons are clicked", () => {
    sqliteDb.saveGraphLayout("sig-test-1", "top-down", [], []);
    store.set("test-key-2", JSON.stringify({ a: 1 }));

    const handleClearStorage = mock(() => {});
    let renderer!: ReactTestRenderer;

    act(() => {
      renderer = create(
        createElement(DeveloperSettings, {
          isOpen: true,
          onClose: () => {},
          onClearStorage: handleClearStorage,
        }),
      );
    });

    // Currently on Database Viewer tab
    const buttons = renderer.root.findAllByType("button");
    const clearDbBtn = buttons.find((btn) => btn.children.includes("Clear Database"));
    expect(clearDbBtn).toBeDefined();

    act(() => {
      clearDbBtn?.props.onClick();
    });

    expect(sqliteDb.getGraphLayout("sig-test-1", "top-down")).toBeNull();

    // Switch to Local Storage tab
    const localStorageTab = renderer.root
      .findAllByType("button")
      .find((btn) => btn.children.includes("Local Storage"));

    act(() => {
      localStorageTab?.props.onClick();
    });

    const clearLsBtn = renderer.root
      .findAllByType("button")
      .find((btn) => btn.children.includes("Clear Local Storage"));

    act(() => {
      clearLsBtn?.props.onClick();
    });

    expect(store.size).toBe(0);
    expect(handleClearStorage).toHaveBeenCalled();
  });
});
