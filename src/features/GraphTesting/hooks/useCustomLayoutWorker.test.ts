import { describe, expect, it } from "bun:test";
import {
  getCurrentLayoutError,
  getCurrentLayoutResult,
  type LayoutErrorSnapshot,
  type LayoutResultSnapshot,
} from "./useCustomLayoutWorker";

describe("useCustomLayoutWorker snapshot pairing", () => {
  it("does not expose a preserved result for a different scenario input", () => {
    const snapshot: LayoutResultSnapshot = {
      inputKey: "scenario-20",
      result: { nodes: [], edges: [], badges: [], crossings: [], validation: {} } as never,
      generation: "scenario-20:0",
    };

    expect(getCurrentLayoutResult(snapshot, "scenario-19")).toBe(null);
  });

  it("keeps a preserved result available for a same-input retry", () => {
    const result = { nodes: [], edges: [], badges: [], crossings: [], validation: {} } as never;
    const snapshot: LayoutResultSnapshot = {
      inputKey: "scenario-20",
      result,
      generation: "scenario-20:0",
    };

    expect(getCurrentLayoutResult(snapshot, "scenario-20")).toBe(result);
  });

  it("does not surface a prior scenario's failure for the newly selected scenario", () => {
    const snapshot: LayoutErrorSnapshot = {
      inputKey: "scenario-20",
      error: new Error("worker failed"),
    };

    expect(getCurrentLayoutError(snapshot, "scenario-19")).toBe(null);
  });
});
