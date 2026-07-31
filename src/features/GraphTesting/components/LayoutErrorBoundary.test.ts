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
});
