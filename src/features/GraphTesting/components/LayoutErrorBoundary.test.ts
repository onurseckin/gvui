import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { LayoutErrorBoundary } from "./LayoutErrorBoundary";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function ThrowingLayout({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("render failed");
  }
  return createElement("span", null, "Recovered layout");
}

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

  it("renders fallback through retry and recovers only for a newly delivered result", () => {
    let retryCalls = 0;
    let renderer!: ReactTestRenderer;
    const renderBoundary = (resultGeneration: string, shouldThrow: boolean) =>
      createElement(
        LayoutErrorBoundary,
        {
          resultGeneration,
          onRetry: () => {
            retryCalls += 1;
          },
        },
        createElement(ThrowingLayout, { shouldThrow }),
      );

    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      act(() => {
        renderer = create(renderBoundary("result-0", true));
      });
    } finally {
      console.error = originalConsoleError;
    }

    expect(JSON.stringify(renderer.toJSON())).toContain("Layout Rendering Error");

    act(() => {
      renderer.root.findByType("button").props.onClick();
    });
    expect(retryCalls).toBe(1);

    act(() => {
      renderer.update(renderBoundary("result-0", false));
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Layout Rendering Error");

    act(() => {
      renderer.update(renderBoundary("result-1", false));
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("Recovered layout");

    act(() => renderer.unmount());
  });
});
