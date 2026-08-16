import type { Force, RankConstraintOptions, SimulationNode } from "../types";

export interface PositionForce extends Force {
  target: (
    val?: number | ((node: SimulationNode) => number),
  ) => PositionForce | ((node: SimulationNode) => number);
  strength: (
    str?: number | ((node: SimulationNode) => number),
  ) => PositionForce | ((node: SimulationNode) => number);
}

export function forceX(
  target?: number | ((node: SimulationNode) => number),
  strength?: number | ((node: SimulationNode) => number),
): PositionForce {
  let nodes: SimulationNode[] = [];
  let targets: number[] = [];
  let strengths: number[] = [];

  let targetFn: (node: SimulationNode) => number =
    typeof target === "function" ? target : typeof target === "number" ? () => target : () => 0;

  let strengthFn: (node: SimulationNode) => number =
    typeof strength === "function"
      ? strength
      : typeof strength === "number"
        ? () => strength
        : () => 0.1;

  function initialize(n: SimulationNode[]): void {
    nodes = n;
    targets = new Array(nodes.length);
    strengths = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      targets[i] = targetFn(node);
      strengths[i] = strengthFn(node);
    }
  }

  function apply(alpha: number): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      const targetX = targets[i] ?? 0;
      const str = strengths[i] ?? 0.1;
      node.vx += (targetX - node.x) * str * alpha;
    }
  }

  const forceObj: PositionForce = {
    name: "x",
    initialize,
    apply,
    target(
      t?: number | ((node: SimulationNode) => number),
    ): PositionForce | ((node: SimulationNode) => number) {
      if (t === undefined) return targetFn;
      targetFn = typeof t === "function" ? t : () => t;
      return forceObj;
    },
    strength(
      s?: number | ((node: SimulationNode) => number),
    ): PositionForce | ((node: SimulationNode) => number) {
      if (s === undefined) return strengthFn;
      strengthFn = typeof s === "function" ? s : () => s;
      return forceObj;
    },
  };

  return forceObj;
}

export function forceY(
  target?: number | ((node: SimulationNode) => number),
  strength?: number | ((node: SimulationNode) => number),
): PositionForce {
  let nodes: SimulationNode[] = [];
  let targets: number[] = [];
  let strengths: number[] = [];

  let targetFn: (node: SimulationNode) => number =
    typeof target === "function" ? target : typeof target === "number" ? () => target : () => 0;

  let strengthFn: (node: SimulationNode) => number =
    typeof strength === "function"
      ? strength
      : typeof strength === "number"
        ? () => strength
        : () => 0.1;

  function initialize(n: SimulationNode[]): void {
    nodes = n;
    targets = new Array(nodes.length);
    strengths = new Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      targets[i] = targetFn(node);
      strengths[i] = strengthFn(node);
    }
  }

  function apply(alpha: number): void {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      const targetY = targets[i] ?? 0;
      const str = strengths[i] ?? 0.1;
      node.vy += (targetY - node.y) * str * alpha;
    }
  }

  const forceObj: PositionForce = {
    name: "y",
    initialize,
    apply,
    target(
      t?: number | ((node: SimulationNode) => number),
    ): PositionForce | ((node: SimulationNode) => number) {
      if (t === undefined) return targetFn;
      targetFn = typeof t === "function" ? t : () => t;
      return forceObj;
    },
    strength(
      s?: number | ((node: SimulationNode) => number),
    ): PositionForce | ((node: SimulationNode) => number) {
      if (s === undefined) return strengthFn;
      strengthFn = typeof s === "function" ? s : () => s;
      return forceObj;
    },
  };

  return forceObj;
}

export interface RankForce extends Force {
  rankSeparation: (sep?: number) => RankForce | number;
  strength: (str?: number) => RankForce | number;
  axis: (ax?: "x" | "y") => RankForce | "x" | "y";
}

export function forceRank(options: RankConstraintOptions = {}): RankForce {
  let nodes: SimulationNode[] = [];
  let rankSeparationVal = options.rankSeparation ?? 120;
  let strengthVal = options.strength ?? 0.5;
  let axisVal = options.axis ?? "y";

  function initialize(n: SimulationNode[]): void {
    nodes = n;
  }

  function apply(alpha: number): void {
    for (const node of nodes) {
      if (node.rank === undefined) continue;
      const targetCoord = node.rank * rankSeparationVal;

      if (axisVal === "y") {
        const delta = targetCoord - node.y;
        node.vy += delta * strengthVal * alpha;
      } else {
        const delta = targetCoord - node.x;
        node.vx += delta * strengthVal * alpha;
      }
    }
  }

  const forceObj: RankForce = {
    name: "rank",
    initialize,
    apply,
    rankSeparation(sep?: number): RankForce | number {
      if (sep === undefined) return rankSeparationVal;
      rankSeparationVal = sep;
      return forceObj;
    },
    strength(str?: number): RankForce | number {
      if (str === undefined) return strengthVal;
      strengthVal = str;
      return forceObj;
    },
    axis(ax?: "x" | "y"): RankForce | "x" | "y" {
      if (ax === undefined) return axisVal;
      axisVal = ax;
      return forceObj;
    },
  };

  return forceObj;
}
