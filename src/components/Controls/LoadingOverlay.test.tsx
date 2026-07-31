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

    const seenTexts: string[] = [];
    const getDisplayedText = () => {
      const textElem = component.root.findByProps({ className: "loading-overlay-text" });
      return String(textElem.children[0]);
    };

    seenTexts.push(getDisplayedText());

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

    // Sample the displayed text every 25ms over 150ms
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
      const current = getDisplayedText();
      if (seenTexts[seenTexts.length - 1] !== current) {
        seenTexts.push(current);
      }
    }

    // Verify all micro-steps were displayed in FIFO sequence without skipping any
    expect(seenTexts).toEqual([
      "Step 1: Parsing",
      "Step 2: Structuring",
      "Step 3: Routing",
      "Step 4: Rendering",
    ]);
  });

});




