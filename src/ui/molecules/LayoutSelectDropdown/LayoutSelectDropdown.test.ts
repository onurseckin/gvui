import { describe, expect, it } from "bun:test";
import {
  DIRECTION_DESCRIPTORS,
  LAYOUT_MODE_DESCRIPTORS,
  describeLayoutMode,
} from "./LayoutSelectDropdown.types";
import { normalizeLayoutMode, type LayoutMode } from "../../../state/useGraphStore";
import type { Direction } from "../../../engine/layout/custom/config";

const ALL_MODES: LayoutMode[] = ["layered", "radial"];
const ALL_DIRECTIONS: Direction[] = ["top-down", "bottom-up", "left-right", "right-left"];

describe("LAYOUT_MODE_DESCRIPTORS", () => {
  it("offers exactly the two engines the pipeline ships", () => {
    expect(LAYOUT_MODE_DESCRIPTORS.map((d) => d.value)).toEqual(ALL_MODES);
  });

  it("puts the default engine first, since menu order is preference order", () => {
    expect(LAYOUT_MODE_DESCRIPTORS[0].value).toBe(normalizeLayoutMode("anything-unknown"));
  });

  it("describes every option in one line", () => {
    for (const descriptor of LAYOUT_MODE_DESCRIPTORS) {
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(descriptor.description.length).toBeGreaterThan(0);
      expect(descriptor.description).not.toContain("\n");
      expect(describeLayoutMode(descriptor.value)).toBe(descriptor.description);
    }
  });

  it("names no direction, because direction is a separate control", () => {
    const labels = LAYOUT_MODE_DESCRIPTORS.map((d) => d.label.toLowerCase()).join(" ");
    for (const direction of ALL_DIRECTIONS) {
      expect(labels).not.toContain(direction);
    }
  });
});

describe("DIRECTION_DESCRIPTORS", () => {
  it("offers all four flow directions, in reading order", () => {
    expect(DIRECTION_DESCRIPTORS.map((d) => d.value)).toEqual(ALL_DIRECTIONS);
  });

  it("describes every direction in one line", () => {
    for (const descriptor of DIRECTION_DESCRIPTORS) {
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(descriptor.description.length).toBeGreaterThan(0);
      expect(descriptor.description).not.toContain("\n");
    }
  });
});
