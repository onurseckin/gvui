import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer, type ReactTestInstance } from "react-test-renderer";
import { EngineOptionsPanel } from "./EngineOptionsPanel";
import { useGraphStore } from "../../../state/useGraphStore";
import { DEFAULT_CUSTOM_LAYOUT_CONFIG } from "../../../engine/layout/custom/config";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Every commit the store made to `layoutConfig` since the current test started. */
let configWrites = 0;
let stopWatching: () => void = () => {};
let renderer: ReactTestRenderer | null = null;

beforeEach(() => {
  useGraphStore.setState({ layoutConfig: { ...DEFAULT_CUSTOM_LAYOUT_CONFIG } });
  configWrites = 0;
  stopWatching = useGraphStore.subscribe((state, prev) => {
    if (state.layoutConfig !== prev.layoutConfig) configWrites += 1;
  });
});

afterEach(() => {
  stopWatching();
  if (renderer) {
    const mounted = renderer;
    act(() => mounted.unmount());
    renderer = null;
  }
});

function renderPanel(): ReactTestRenderer {
  let created!: ReactTestRenderer;
  act(() => {
    created = create(createElement(EngineOptionsPanel, {}));
  });
  renderer = created;
  return created;
}

/** The range input of a numeric field, re-queried so it reflects the latest render. */
function slider(tree: ReactTestRenderer, key: string): ReactTestInstance {
  return tree.root.find((node) => node.type === "input" && node.props.id === `engine-cfg-${key}`);
}

function stagedValue(tree: ReactTestRenderer, key: string): unknown {
  return slider(tree, key).props.value;
}

function dragSlider(tree: ReactTestRenderer, key: string, value: number): void {
  const control = slider(tree, key);
  act(() => {
    control.props.onChange({ target: { value: String(value) } });
  });
}

function byClass(tree: ReactTestRenderer, type: string, className: string): ReactTestInstance {
  return tree.root.find(
    (node) =>
      node.type === type &&
      typeof node.props.className === "string" &&
      node.props.className.split(" ").includes(className),
  );
}

function applyButton(tree: ReactTestRenderer): ReactTestInstance {
  return byClass(tree, "button", "apply-options-btn");
}

function click(instance: ReactTestInstance): void {
  act(() => {
    instance.props.onClick();
  });
}

function unappliedBadges(tree: ReactTestRenderer): ReactTestInstance[] {
  return tree.root.findAll(
    (node) => node.type === "span" && node.props.className === "unapplied-badge",
  );
}

describe("EngineOptionsPanel staged edits", () => {
  it("keeps an edited control out of the store until Apply", () => {
    const tree = renderPanel();
    dragSlider(tree, "nodeGap", 120);

    expect(stagedValue(tree, "nodeGap")).toBe(120);
    expect(useGraphStore.getState().layoutConfig.nodeGap).toBe(
      DEFAULT_CUSTOM_LAYOUT_CONFIG.nodeGap,
    );
    expect(configWrites).toBe(0);
  });

  it("commits every staged field in a single store write", () => {
    const tree = renderPanel();
    dragSlider(tree, "nodeGap", 120);
    dragSlider(tree, "rankGap", 100);

    click(applyButton(tree));

    expect(configWrites).toBe(1);
    expect(useGraphStore.getState().layoutConfig).toEqual({
      ...DEFAULT_CUSTOM_LAYOUT_CONFIG,
      nodeGap: 120,
      rankGap: 100,
    });
  });

  it("disables Apply until something is staged, and again once it is applied", () => {
    const tree = renderPanel();
    expect(applyButton(tree).props.disabled).toBe(true);
    expect(unappliedBadges(tree)).toHaveLength(0);

    dragSlider(tree, "nodeGap", 120);
    expect(applyButton(tree).props.disabled).toBe(false);
    expect(unappliedBadges(tree)).toHaveLength(1);
    expect(JSON.stringify(tree.toJSON())).toContain("Apply 1 change");

    click(applyButton(tree));
    expect(applyButton(tree).props.disabled).toBe(true);
    expect(unappliedBadges(tree)).toHaveLength(0);
  });

  it("counts the staged fields that differ from the applied config", () => {
    const tree = renderPanel();
    dragSlider(tree, "nodeGap", 120);
    dragSlider(tree, "rankGap", 100);

    expect(JSON.stringify(tree.toJSON())).toContain("Apply 2 changes");

    dragSlider(tree, "nodeGap", DEFAULT_CUSTOM_LAYOUT_CONFIG.nodeGap);
    expect(JSON.stringify(tree.toJSON())).toContain("Apply 1 change");
  });

  it("re-seeds from an outside write while the panel is clean", () => {
    const tree = renderPanel();

    act(() => {
      useGraphStore.getState().setLayoutConfig({ nodeGap: 200 });
    });

    expect(stagedValue(tree, "nodeGap")).toBe(200);
    expect(applyButton(tree).props.disabled).toBe(true);
  });

  it("never discards in-progress edits when an outside write lands", () => {
    const tree = renderPanel();
    dragSlider(tree, "rankGap", 100);

    act(() => {
      useGraphStore.getState().setLayoutConfig({ nodeGap: 200 });
    });

    expect(stagedValue(tree, "rankGap")).toBe(100);
    // The outside `nodeGap` is not adopted either: the staged copy is one object, and taking half
    // of it would apply a config the user never saw.
    expect(stagedValue(tree, "nodeGap")).toBe(DEFAULT_CUSTOM_LAYOUT_CONFIG.nodeGap);
    expect(JSON.stringify(tree.toJSON())).toContain("Apply 2 changes");
  });

  it("stages the defaults on Reset and only writes them on Apply", () => {
    const tree = renderPanel();
    act(() => {
      useGraphStore.getState().setLayoutConfig({ nodeGap: 200 });
    });
    expect(configWrites).toBe(1);

    click(byClass(tree, "button", "reset-options-btn"));

    expect(stagedValue(tree, "nodeGap")).toBe(DEFAULT_CUSTOM_LAYOUT_CONFIG.nodeGap);
    expect(useGraphStore.getState().layoutConfig.nodeGap).toBe(200);
    expect(configWrites).toBe(1);

    click(applyButton(tree));

    expect(useGraphStore.getState().layoutConfig).toEqual({ ...DEFAULT_CUSTOM_LAYOUT_CONFIG });
    expect(configWrites).toBe(2);
  });
});
