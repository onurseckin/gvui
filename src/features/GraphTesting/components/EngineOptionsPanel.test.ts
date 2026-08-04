import { describe, expect, it } from "bun:test";
import { SETTINGS_GROUPS } from "./EngineOptionsPanel.fields";
import {
  DEFAULT_CUSTOM_LAYOUT_CONFIG,
  type CustomLayoutConfig,
} from "../../../engine/layout/custom/config";

const ALL_FIELDS = SETTINGS_GROUPS.flatMap((group) => group.fields);

describe("Settings panel field catalogue", () => {
  it("gives every CustomLayoutConfig field a control", () => {
    // The whole point of the panel: "full control over different aspects of the output". A field
    // the engine reads but the panel never renders is a knob the user cannot reach.
    const covered = ALL_FIELDS.map((field) => field.key).sort();
    const declared = Object.keys(DEFAULT_CUSTOM_LAYOUT_CONFIG).sort();
    expect(covered).toEqual(declared);
  });

  it("renders each field exactly once, so no two controls fight over one value", () => {
    const keys = ALL_FIELDS.map((field) => field.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses a stable group id per section", () => {
    const ids = SETTINGS_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["layout", "edges", "labels", "algorithms", "radial", "budgets"]);
  });

  it("gives every control a one-line explanation of what turning it up does", () => {
    for (const field of ALL_FIELDS) {
      expect(field.label.length).toBeGreaterThan(0);
      expect(field.help.length).toBeGreaterThan(0);
    }
  });

  it("keeps every numeric slider's range wide enough to hold the engine default", () => {
    // A slider whose default sits outside its own [min, max] silently rewrites the config the
    // first time it is touched.
    for (const field of ALL_FIELDS) {
      if (field.kind !== "number") continue;
      const value = DEFAULT_CUSTOM_LAYOUT_CONFIG[field.key];
      expect(field.min).toBeLessThanOrEqual(value);
      expect(field.max).toBeGreaterThanOrEqual(value);
      expect(field.min).toBeLessThan(field.max);
      expect(field.step).toBeGreaterThan(0);
    }
  });

  it("offers the current value of every enum field as one of its options", () => {
    for (const field of ALL_FIELDS) {
      if (field.kind !== "enum") continue;
      const current: CustomLayoutConfig[typeof field.key] = DEFAULT_CUSTOM_LAYOUT_CONFIG[field.key];
      const values: string[] = field.options.map((option) => option.value);
      expect(values).toContain(current);
    }
  });

  it("puts direction in the Layout group, where flow direction is now the first decision", () => {
    const layout = SETTINGS_GROUPS.find((group) => group.id === "layout");
    expect(layout?.fields[0]?.key).toBe("direction");
  });

  it("offers octilinear as an edge style", () => {
    const edgeStyle = ALL_FIELDS.find((field) => field.key === "edgeStyle");
    expect(edgeStyle?.kind).toBe("enum");
    if (edgeStyle?.kind !== "enum") return;
    const values: string[] = edgeStyle.options.map((option) => option.value);
    expect(values).toEqual(["orthogonal", "rounded", "spline", "octilinear", "straight"]);
  });
});
