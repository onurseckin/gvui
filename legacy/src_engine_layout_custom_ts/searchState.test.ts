import { describe, expect, it } from "bun:test";
import { cloneSearchState, computeStateHash, createInitialSearchState } from "./searchState";

describe("searchState", () => {
  it("creates initial search state and computes deterministic hash", () => {
    const state = createInitialSearchState();
    expect(state.sideAssignments.size).toBe(0);
    const hash = computeStateHash(state);
    expect(typeof hash).toBe("string");
  });

  it("clones search state cleanly without mutating original", () => {
    const state = createInitialSearchState();
    state.sideAssignments.set("e1", { srcSide: "bottom", tgtSide: "top" });
    state.portOrders["A:bottom"] = ["e1:src"];

    const cloned = cloneSearchState(state);
    cloned.sideAssignments.set("e2", { srcSide: "right", tgtSide: "left" });
    cloned.portOrders["A:bottom"].push("e2:src");

    expect(state.sideAssignments.size).toBe(1);
    expect(cloned.sideAssignments.size).toBe(2);
    expect(state.portOrders["A:bottom"].length).toBe(1);
    expect(cloned.portOrders["A:bottom"].length).toBe(2);
  });
});
