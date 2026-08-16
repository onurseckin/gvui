import { describe, expect, it } from "bun:test";
import { useLayoutStore, DEFAULT_SIMULATION_PARAMETERS } from "./useLayoutStore";
import type { GraphDataset } from "../types/graphData";

const sampleDataset: GraphDataset = {
  id: "store-test-ds",
  title: "Store Test Dataset",
  nodes: [
    { id: "A", name: "Node A" },
    { id: "B", name: "Node B" },
  ],
  edges: [{ id: "e1", source: "A", target: "B" }],
};

describe("useLayoutStore Zustand Store", () => {
  it("initializes with default state and parameters", () => {
    const state = useLayoutStore.getState();
    expect(state.algorithm).toBe("hybrid-force-dag");
    expect(state.parameters.charge).toBe(DEFAULT_SIMULATION_PARAMETERS.charge);
    expect(state.parameters.linkDistance).toBe(DEFAULT_SIMULATION_PARAMETERS.linkDistance);
    expect(state.isRunning).toBe(false);
  });

  it("updates and resets algorithm selection", () => {
    const store = useLayoutStore.getState();
    store.setAlgorithm("force");
    expect(useLayoutStore.getState().algorithm).toBe("force");

    store.setAlgorithm("dag-sugiyama");
    expect(useLayoutStore.getState().algorithm).toBe("dag-sugiyama");
  });

  it("updates parameters and resets to defaults", () => {
    const store = useLayoutStore.getState();
    store.updateParameters({ charge: -600, linkDistance: 200 });

    expect(useLayoutStore.getState().parameters.charge).toBe(-600);
    expect(useLayoutStore.getState().parameters.linkDistance).toBe(200);

    store.resetParameters();
    expect(useLayoutStore.getState().parameters.charge).toBe(DEFAULT_SIMULATION_PARAMETERS.charge);
  });

  it("computes layout asynchronously and updates lastLayoutResult", async () => {
    const store = useLayoutStore.getState();
    let convergedCalled = false;

    const unsub = store.registerOnConverge(() => {
      convergedCalled = true;
    });

    const result = await store.computeLayout(sampleDataset, { algorithm: "grid" });
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);

    expect(useLayoutStore.getState().lastLayoutResult).toBe(result);
    expect(useLayoutStore.getState().isConverged).toBe(true);
    expect(useLayoutStore.getState().isRunning).toBe(false);
    expect(convergedCalled).toBe(true);

    const positions = store.getPositions();
    expect(positions?.nodes).toHaveLength(2);

    unsub();
  });

  it("steps simulation interactively", () => {
    const store = useLayoutStore.getState();
    store.setAlgorithm("force");

    let stepReceived = false;
    store.stepSimulation(sampleDataset, 5, (nodes, edges) => {
      stepReceived = true;
      expect(nodes).toHaveLength(2);
      expect(edges).toHaveLength(1);
    });

    expect(stepReceived).toBe(true);
    expect(useLayoutStore.getState().currentIteration).toBe(5);

    store.stopSimulation();
    expect(useLayoutStore.getState().isRunning).toBe(false);

    store.resetSimulation();
    expect(useLayoutStore.getState().currentIteration).toBe(0);
  });

  it("clears layout cache safely", () => {
    const store = useLayoutStore.getState();
    expect(() => store.clearCache()).not.toThrow();
  });
});
