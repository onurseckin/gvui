import { describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";
import { CircularProgressLoader } from "./CircularProgressLoader";

describe("CircularProgressLoader Component", () => {
  it("renders SVG radial ring with percentage and gradient", () => {
    const html = renderToString(<CircularProgressLoader percent={45} size={120} strokeWidth={8} />);
    expect(html).toContain("45%");
    expect(html).toContain("svg");
    expect(html).toContain("circle");
    expect(html).toContain("loaderGradient");
  });
});
