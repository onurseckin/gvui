import { describe, expect, it } from "bun:test";
import { computeCustomLayoutAsync } from "../layout/custom/customLayoutWorkerClient";

describe("GraphCanvas WebWorker Async Offloading", () => {
  it("exports computeCustomLayoutAsync for non-blocking background execution", () => {
    expect(typeof computeCustomLayoutAsync).toBe("function");
  });
});
