import type { CenterForceOptions, Force, SimulationNode } from "../types";

export interface CenterForce extends Force {
  x: (x?: number) => CenterForce | number;
  y: (y?: number) => CenterForce | number;
  strength: (str?: number) => CenterForce | number;
}

export function forceCenter(
  x: number = 0,
  y: number = 0,
  options: CenterForceOptions = {},
): CenterForce {
  let nodes: SimulationNode[] = [];
  let cx = x;
  let cy = y;
  let strengthVal = options.strength ?? 1;

  function initialize(n: SimulationNode[]): void {
    nodes = n;
  }

  function apply(_alpha: number): void {
    const n = nodes.length;
    if (n === 0) return;

    let sx = 0;
    let sy = 0;

    for (const node of nodes) {
      sx += node.x;
      sy += node.y;
    }

    sx = (sx / n - cx) * strengthVal;
    sy = (sy / n - cy) * strengthVal;

    for (const node of nodes) {
      node.x -= sx;
      node.y -= sy;
    }
  }

  const forceObj: CenterForce = {
    name: "center",
    initialize,
    apply,
    x(newX?: number): CenterForce | number {
      if (newX === undefined) return cx;
      cx = newX;
      return forceObj;
    },
    y(newY?: number): CenterForce | number {
      if (newY === undefined) return cy;
      cy = newY;
      return forceObj;
    },
    strength(str?: number): CenterForce | number {
      if (str === undefined) return strengthVal;
      strengthVal = str;
      return forceObj;
    },
  };

  return forceObj;
}
