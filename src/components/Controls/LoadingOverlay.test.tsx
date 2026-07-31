import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { create, act } from "react-test-renderer";
import { LoadingOverlay } from "./LoadingOverlay";

// Tell React 19 test utilities that act(...) environment is enabled
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LoadingOverlay Component", () => {
  it("renders minimalist loading overlay with detail text", () => {
    const html = renderToString(
      <LoadingOverlay
        percent={65}
        stageText="Stage 3 of 5"
        detail="Computing A* orthogonal routes..."
      />
    );

    expect(html.includes("loading-overlay-backdrop")).toBe(true);
    expect(html.includes("Computing A* orthogonal routes...")).toBe(true);
    expect(html.includes("loading-overlay-card")).toBe(false);
    expect(html.includes("Topology")).toBe(false);
    expect(html.includes("✓")).toBe(false);
  });

  it("falls back to stageText when detail is empty", () => {
    const html = renderToString(
      <LoadingOverlay
        percent={50}
        stageText="Processing layout..."
        detail=""
      />
    );

    expect(html.includes("Processing layout...")).toBe(true);
    expect(html.includes("loading-overlay-card")).toBe(false);
  });

  it("queues rapid message updates sequentially via FIFO queue without skipping steps", async () => {
    let component!: ReturnType<typeof create>;
    await act(async () => {
      component = create(
        <LoadingOverlay percent={10} detail="Step 1: Parsing" />
      );
    });

    const seenActiveTexts: string[] = [];
    const getActiveStepText = () => {
      const activeItem = component.root.findByProps({ className: "loading-step-item is-active" });
      const textElem = activeItem.findByProps({ className: "loading-overlay-text" });
      return String(textElem.children[0]);
    };

    seenActiveTexts.push(getActiveStepText());

    // Send rapid burst of messages
    await act(async () => {
      component.update(<LoadingOverlay percent={20} detail="Step 2: Structuring" />);
    });
    await act(async () => {
      component.update(<LoadingOverlay percent={30} detail="Step 3: Routing" />);
    });
    await act(async () => {
      component.update(<LoadingOverlay percent={40} detail="Step 4: Rendering" />);
    });

    // Sample the displayed active text over intervals
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 35));
      });
      const current = getActiveStepText();
      if (seenActiveTexts[seenActiveTexts.length - 1] !== current) {
        seenActiveTexts.push(current);
      }
    }

    expect(seenActiveTexts).toEqual([
      "Step 1: Parsing",
      "Step 2: Structuring",
      "Step 3: Routing",
      "Step 4: Rendering",
    ]);
  });

  it("renders status circle indicators (green is-completed, yellow is-active, dark stroke is-upcoming)", () => {
    const steps = [
      { id: "1", label: "Step 1: Complete", status: "completed" as const },
      { id: "2", label: "Step 2: Running", status: "active" as const },
      { id: "3", label: "Step 3: Queued", status: "upcoming" as const },
    ];

    const html = renderToString(<LoadingOverlay percent={50} steps={steps} />);

    expect(html.includes("step-status-icon is-completed")).toBe(true);
    expect(html.includes("step-status-icon is-active")).toBe(true);
    expect(html.includes("step-status-icon is-upcoming")).toBe(true);
    expect(html.includes("Step 1: Complete")).toBe(true);
    expect(html.includes("Step 2: Running")).toBe(true);
    expect(html.includes("Step 3: Queued")).toBe(true);
  });

  it("maintains a maximum 5-step rolling window when total steps exceed 5", () => {
    const steps = [
      { id: "1", label: "Step 1", status: "completed" as const },
      { id: "2", label: "Step 2", status: "completed" as const },
      { id: "3", label: "Step 3", status: "completed" as const },
      { id: "4", label: "Step 4", status: "completed" as const },
      { id: "5", label: "Step 5", status: "active" as const },
      { id: "6", label: "Step 6", status: "upcoming" as const },
      { id: "7", label: "Step 7", status: "upcoming" as const },
    ];

    const html = renderToString(<LoadingOverlay percent={70} steps={steps} />);

    // Step 1 and Step 2 should have scrolled up out of view
    expect(html.includes("Step 1")).toBe(false);
    expect(html.includes("Step 2")).toBe(false);
    // Steps 3 to 7 (5 items) should be in the window
    expect(html.includes("Step 3")).toBe(true);
    expect(html.includes("Step 4")).toBe(true);
    expect(html.includes("Step 5")).toBe(true);
    expect(html.includes("Step 6")).toBe(true);
    expect(html.includes("Step 7")).toBe(true);
  });
});
