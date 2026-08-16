import { create } from "zustand";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../types/graphData";
import {
  computeDynamicLayout,
  createDynamicLayoutSimulation,
  clearDynamicLayoutCache,
  type DynamicLayoutOptions,
  type DynamicLayoutResult,
  type LayoutAlgorithm,
} from "../engine/layout/dynamicLayoutEngine";
import type { ForceSimulation } from "../engine/layout/force";

export interface SimulationParameters {
  charge: number;
  linkDistance: number;
  linkStrength: number;
  centerForce: number;
  alphaDecay: number;
  velocityDecay: number;
  collisionRadius: number;
  nodePadding: number;
  theta: number;
  rankSeparation: number;
  nodeSeparation: number;
  maxIterations: number;
  energyThreshold: number;
  randomSeed: number;
  edgeStyle: "straight" | "orthogonal" | "rounded" | "octilinear" | "spline";
  cornerRadius: number;
  columns?: number;
}

export const DEFAULT_SIMULATION_PARAMETERS: SimulationParameters = {
  charge: -350,
  linkDistance: 120,
  linkStrength: 0.7,
  centerForce: 0.08,
  alphaDecay: 0.0228,
  velocityDecay: 0.6,
  collisionRadius: 50,
  nodePadding: 24,
  theta: 0.8,
  rankSeparation: 120,
  nodeSeparation: 60,
  maxIterations: 300,
  energyThreshold: 1e-4,
  randomSeed: 42,
  edgeStyle: "rounded",
  cornerRadius: 8,
};

export interface LayoutState {
  algorithm: LayoutAlgorithm;
  parameters: SimulationParameters;
  isRunning: boolean;
  isConverged: boolean;
  currentIteration: number;
  alpha: number;
  energy: number;
  activeSimulation: ForceSimulation | null;
  lastLayoutResult: DynamicLayoutResult | null;
}

export interface LayoutActions {
  setAlgorithm: (algorithm: LayoutAlgorithm | string) => void;
  updateParameters: (parameters: Partial<SimulationParameters>) => void;
  resetParameters: () => void;
  startSimulation: (
    dataset: GraphDataset,
    onTick?: (nodes: PositionedNode[], edges: PositionedEdge[]) => void,
    onConverge?: (result: DynamicLayoutResult) => void,
  ) => void;
  stepSimulation: (
    dataset: GraphDataset,
    steps?: number,
    onStep?: (nodes: PositionedNode[], edges: PositionedEdge[]) => void,
  ) => void;
  stopSimulation: () => void;
  resetSimulation: () => void;
  computeLayout: (
    dataset: GraphDataset,
    options?: Partial<DynamicLayoutOptions>,
  ) => Promise<DynamicLayoutResult>;
  clearCache: () => void;
  registerOnConverge: (callback: (result: DynamicLayoutResult) => void) => () => void;
  getPositions: () => { nodes: PositionedNode[]; edges: PositionedEdge[] } | null;
}

export type LayoutStore = LayoutState & LayoutActions;

const convergeListeners = new Set<(result: DynamicLayoutResult) => void>();

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  algorithm: "hybrid-force-dag",
  parameters: { ...DEFAULT_SIMULATION_PARAMETERS },
  isRunning: false,
  isConverged: false,
  currentIteration: 0,
  alpha: 0,
  energy: 0,
  activeSimulation: null,
  lastLayoutResult: null,

  setAlgorithm: (algorithm) => {
    set({ algorithm: algorithm as LayoutAlgorithm });
  },

  updateParameters: (partialParams) => {
    set((state) => ({
      parameters: {
        ...state.parameters,
        ...partialParams,
      },
    }));
  },

  resetParameters: () => {
    set({ parameters: { ...DEFAULT_SIMULATION_PARAMETERS } });
  },

  computeLayout: async (dataset, options = {}) => {
    const currentParams = get().parameters;
    const currentAlg = get().algorithm;

    const mergedOptions: DynamicLayoutOptions = {
      algorithm: currentAlg,
      ...currentParams,
      ...options,
    };

    set({ isRunning: true, isConverged: false });

    try {
      const result = await computeDynamicLayout(dataset, mergedOptions);
      set({
        lastLayoutResult: result,
        isRunning: false,
        isConverged: true,
        currentIteration: result.iterations ?? currentParams.maxIterations,
        alpha: 0,
        energy: 0,
      });

      // Notify registered converge listeners
      for (const listener of convergeListeners) {
        listener(result);
      }

      return result;
    } catch (err) {
      set({ isRunning: false });
      throw err;
    }
  },

  startSimulation: (dataset, onTick, onConverge) => {
    const state = get();
    // Stop any running simulation
    if (state.activeSimulation) {
      state.activeSimulation.stop();
    }

    const params = state.parameters;
    const sim = createDynamicLayoutSimulation(dataset, {
      ...params,
      algorithm: state.algorithm,
    });

    set({
      activeSimulation: sim,
      isRunning: true,
      isConverged: false,
      currentIteration: 0,
      alpha: 1.0,
      energy: 0,
    });

    sim.on("tick", (event) => {
      set({
        alpha: event.alpha,
        energy: event.energy,
        currentIteration: event.iteration,
        isConverged: event.isConverged,
      });

      if (onTick) {
        const simNodes = sim.nodes() as Array<{
          id: string;
          x: number;
          y: number;
          width?: number;
          height?: number;
        }>;
        const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

        const positionedNodes: PositionedNode[] = dataset.nodes.map((n) => {
          const sn = nodeMap.get(n.id) ?? { x: 0, y: 0, width: 120, height: 60 };
          return { ...n, x: sn.x, y: sn.y, width: sn.width ?? 120, height: sn.height ?? 60 };
        });

        const positionedEdges: PositionedEdge[] = dataset.edges.map((e) => {
          const src = nodeMap.get(e.source) ?? { x: 0, y: 0 };
          const tgt = nodeMap.get(e.target) ?? { x: 0, y: 0 };
          return {
            ...e,
            path: `M ${src.x} ${src.y} L ${tgt.x} ${tgt.y}`,
            points: [
              { x: src.x, y: src.y },
              { x: tgt.x, y: tgt.y },
            ],
            labelX: (src.x + tgt.x) * 0.5,
            labelY: (src.y + tgt.y) * 0.5,
          };
        });

        onTick(positionedNodes, positionedEdges);
      }
    });

    sim.on("end", (event) => {
      set({
        isRunning: false,
        isConverged: true,
        alpha: 0,
        energy: event.energy,
        currentIteration: event.iteration,
      });

      const simNodes = sim.nodes() as Array<{
        id: string;
        x: number;
        y: number;
        width?: number;
        height?: number;
      }>;
      const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

      const positionedNodes: PositionedNode[] = dataset.nodes.map((n) => {
        const sn = nodeMap.get(n.id) ?? { x: 0, y: 0, width: 120, height: 60 };
        return { ...n, x: sn.x, y: sn.y, width: sn.width ?? 120, height: sn.height ?? 60 };
      });

      const positionedEdges: PositionedEdge[] = dataset.edges.map((e) => {
        const src = nodeMap.get(e.source) ?? { x: 0, y: 0 };
        const tgt = nodeMap.get(e.target) ?? { x: 0, y: 0 };
        return {
          ...e,
          path: `M ${src.x} ${src.y} L ${tgt.x} ${tgt.y}`,
          points: [
            { x: src.x, y: src.y },
            { x: tgt.x, y: tgt.y },
          ],
          labelX: (src.x + tgt.x) * 0.5,
          labelY: (src.y + tgt.y) * 0.5,
        };
      });

      const res: DynamicLayoutResult = {
        nodes: positionedNodes,
        edges: positionedEdges,
        algorithm: state.algorithm,
        iterations: event.iteration,
        converged: true,
      };

      set({ lastLayoutResult: res });

      if (onConverge) onConverge(res);
      for (const listener of convergeListeners) {
        listener(res);
      }
    });

    // Run simulation
    sim.run(params.maxIterations);
  },

  stepSimulation: (dataset, steps = 1, onStep) => {
    let sim = get().activeSimulation;
    if (!sim) {
      const params = get().parameters;
      sim = createDynamicLayoutSimulation(dataset, {
        ...params,
        algorithm: get().algorithm,
      });
      set({ activeSimulation: sim });
    }

    sim.step(steps);
    const isConverged = sim.isConverged();

    set({
      isRunning: !isConverged,
      isConverged,
      currentIteration: sim.iteration(),
      alpha: typeof sim.alpha() === "number" ? (sim.alpha() as number) : 0,
      energy: sim.energy(),
    });

    if (onStep) {
      const simNodes = sim.nodes() as Array<{
        id: string;
        x: number;
        y: number;
        width?: number;
        height?: number;
      }>;
      const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

      const positionedNodes: PositionedNode[] = dataset.nodes.map((n) => {
        const sn = nodeMap.get(n.id) ?? { x: 0, y: 0, width: 120, height: 60 };
        return { ...n, x: sn.x, y: sn.y, width: sn.width ?? 120, height: sn.height ?? 60 };
      });

      const positionedEdges: PositionedEdge[] = dataset.edges.map((e) => {
        const src = nodeMap.get(e.source) ?? { x: 0, y: 0 };
        const tgt = nodeMap.get(e.target) ?? { x: 0, y: 0 };
        return {
          ...e,
          path: `M ${src.x} ${src.y} L ${tgt.x} ${tgt.y}`,
          points: [
            { x: src.x, y: src.y },
            { x: tgt.x, y: tgt.y },
          ],
          labelX: (src.x + tgt.x) * 0.5,
          labelY: (src.y + tgt.y) * 0.5,
        };
      });

      onStep(positionedNodes, positionedEdges);
    }
  },

  stopSimulation: () => {
    const sim = get().activeSimulation;
    if (sim) {
      sim.stop();
    }
    set({ isRunning: false, isConverged: true, alpha: 0 });
  },

  resetSimulation: () => {
    const sim = get().activeSimulation;
    if (sim) {
      sim.restart();
    }
    set({
      isRunning: false,
      isConverged: false,
      currentIteration: 0,
      alpha: 1.0,
      energy: 0,
    });
  },

  registerOnConverge: (callback) => {
    convergeListeners.add(callback);
    return () => {
      convergeListeners.delete(callback);
    };
  },

  clearCache: () => {
    clearDynamicLayoutCache();
  },

  getPositions: () => {
    const res = get().lastLayoutResult;
    if (!res) return null;
    return { nodes: res.nodes, edges: res.edges };
  },
}));
