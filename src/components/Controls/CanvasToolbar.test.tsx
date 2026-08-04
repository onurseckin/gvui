import { describe, expect, it } from "bun:test";
import { createPanelDismissHandler } from "./panelDismiss";

/** Stand-in for a DOM element; the dismiss guard only reads attributes and walks parents, and
 * Bun's test runtime has no DOM to build real ones from. */
interface FakeElement {
  getAttribute(name: string): string | null;
  parentNode: FakeElement | null;
}

function element(
  attributes: Record<string, string> = {},
  parent: FakeElement | null = null,
): FakeElement {
  return {
    getAttribute: (name) => attributes[name] ?? null,
    parentNode: parent,
  };
}

/** Nothing above the popup/panel carries attributes, matching `document`/`window` in a real path. */
const ROOT_ENTRY: unknown = {};

interface DismissProbe {
  handle: (event: { target: unknown; composedPath?: () => readonly unknown[] }) => void;
  dismissals: () => number;
}

function probe(panel: FakeElement | null): DismissProbe {
  let count = 0;
  const handle = createPanelDismissHandler(
    () => panel,
    () => {
      count += 1;
    },
  );
  return { handle, dismissals: () => count };
}

describe("createPanelDismissHandler", () => {
  it("keeps the panel open when the click lands inside a portalled select popup", () => {
    const panel = element();
    // Mirrors the real tree: Positioner carries the marker, Popup carries role=listbox, and the
    // whole thing is portalled to <body> — never under `panel`.
    const positioner = element({ "data-gvui-portal": "select" });
    const popup = element({ role: "listbox" }, positioner);
    const option = element({ role: "option" }, popup);

    const { handle, dismissals } = probe(panel);
    handle({ target: option, composedPath: () => [option, popup, positioner, ROOT_ENTRY] });

    expect(dismissals()).toBe(0);
  });

  it("treats the explicit marker as sufficient without any ARIA role on the path", () => {
    const panel = element();
    const positioner = element({ "data-gvui-portal": "select" });
    const option = element({}, positioner);

    const { handle, dismissals } = probe(panel);
    handle({ target: option, composedPath: () => [option, positioner, ROOT_ENTRY] });

    expect(dismissals()).toBe(0);
  });

  it("keeps the panel open for Base UI's modal backdrop, a sibling of the positioner", () => {
    const panel = element();
    const portalContainer = element({ "data-gvui-portal": "select" });
    // While a popup is open this backdrop covers the panel itself, so treating it as outside would
    // close the panel on the next click anywhere in it.
    const backdrop = element({ role: "presentation" }, portalContainer);

    const { handle, dismissals } = probe(panel);
    handle({ target: backdrop, composedPath: () => [backdrop, portalContainer, ROOT_ENTRY] });

    expect(dismissals()).toBe(0);
  });

  it("closes on a genuine outside click", () => {
    const panel = element();
    const elsewhere = element({ id: "canvas" });

    const { handle, dismissals } = probe(panel);
    handle({ target: elsewhere, composedPath: () => [elsewhere, ROOT_ENTRY] });

    expect(dismissals()).toBe(1);
  });

  it("keeps the panel open for clicks on the panel's own subtree", () => {
    const panel = element();
    const slider = element({}, panel);

    const { handle, dismissals } = probe(panel);
    handle({ target: slider, composedPath: () => [slider, panel, ROOT_ENTRY] });

    expect(dismissals()).toBe(0);
  });

  it("falls back to the target's ancestors when composedPath is unavailable", () => {
    const panel = element();
    const positioner = element({ "data-gvui-portal": "select" });
    const option = element({ role: "option" }, positioner);

    const { handle, dismissals } = probe(panel);
    handle({ target: option });

    expect(dismissals()).toBe(0);
  });

  it("still closes via the ancestor fallback for an unrelated target", () => {
    const panel = element();
    const elsewhere = element({ id: "canvas" });

    const { handle, dismissals } = probe(panel);
    handle({ target: elsewhere });

    expect(dismissals()).toBe(1);
  });

  it("closes when the event carries an empty composedPath and no usable target", () => {
    const { handle, dismissals } = probe(element());
    handle({ target: null, composedPath: () => [] });

    expect(dismissals()).toBe(1);
  });
});
