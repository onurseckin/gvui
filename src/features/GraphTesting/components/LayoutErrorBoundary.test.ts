import { describe, expect, it } from "bun:test";
import { LayoutErrorBoundary } from "./LayoutErrorBoundary";

describe("LayoutErrorBoundary", () => {
  it("instantiates error boundary with clean default state", () => {
    const boundary = new LayoutErrorBoundary({ children: null });
    expect(boundary.state.hasError).toBe(false);
    expect(boundary.state.error).toBe(null);
  });

  it("updates derived state when error occurs", () => {
    const err = new Error("Simulated Layout Error");
    const derived = LayoutErrorBoundary.getDerivedStateFromError(err);
    expect(derived.hasError).toBe(true);
    expect(derived.error).toBe(err);
  });

  it("keeps its fallback latched while retry starts and resets only after a new result arrives", () => {
    const error = new Error("Simulated Layout Error");
    const failedState = {
      hasError: true,
      error,
      failedResultGeneration: 4,
    };

    expect(
      LayoutErrorBoundary.getDerivedStateFromProps(
        { children: null, resultGeneration: 4 },
        failedState,
      ),
    ).toBe(null);
    expect(
      LayoutErrorBoundary.getDerivedStateFromProps(
        { children: null, resultGeneration: 5 },
        failedState,
      ),
    ).toEqual({ hasError: false, error: null, failedResultGeneration: null });
  });
});
