import { Quadtree, type QuadtreeNode } from "../quadtree";
import type { BarnesHutOptions, Force, SimulationNode } from "../types";

export interface ManyBodyForce extends Force {
  theta: (theta?: number) => ManyBodyForce | number;
  charge: (
    charge?: number | ((node: SimulationNode) => number),
  ) => ManyBodyForce | ((node: SimulationNode) => number);
  distanceMin: (dist?: number) => ManyBodyForce | number;
  distanceMax: (dist?: number) => ManyBodyForce | number;
}

export function forceManyBody(options: BarnesHutOptions = {}): ManyBodyForce {
  let nodes: SimulationNode[] = [];
  let thetaVal = options.theta ?? 0.8;
  let theta2 = thetaVal * thetaVal;
  let chargeFn: (node: SimulationNode) => number =
    typeof options.charge === "function"
      ? options.charge
      : typeof options.charge === "number"
        ? () => options.charge as number
        : (n) => n.charge ?? -300;
  let distanceMin2 = (options.distanceMin ?? 1) * (options.distanceMin ?? 1);
  let distanceMax2 = (options.distanceMax ?? Infinity) * (options.distanceMax ?? Infinity);
  let distanceMin = options.distanceMin ?? 1;
  let distanceMax = options.distanceMax ?? Infinity;
  let tree: Quadtree | null = null;
  let randomFn: () => number = Math.random;

  function apply(alpha: number): void {
    if (nodes.length === 0) return;
    tree = new Quadtree(nodes, chargeFn);

    for (const node of nodes) {
      const q = chargeFn(node);
      if (Math.abs(q) < 1e-6) continue;

      tree.visit((quadNode: QuadtreeNode) => {
        if (quadNode.mass <= 0) return true;

        let dx = quadNode.cx - node.x;
        let dy = quadNode.cy - node.y;
        let d2 = dx * dx + dy * dy;

        // If at the exact same location, add a tiny non-zero jitter to separate them
        if (d2 < 1e-9) {
          dx = (randomFn() - 0.5) * 1e-3;
          dy = (randomFn() - 0.5) * 1e-3;
          d2 = dx * dx + dy * dy;
        }

        const width = quadNode.x1 - quadNode.x0;
        const isFarEnough = (width * width) / d2 < theta2;

        if (isFarEnough || quadNode.type === "leaf") {
          if (quadNode.type === "leaf") {
            for (const other of quadNode.nodes) {
              if (other === node) continue;

              let ldx = other.x - node.x;
              let ldy = other.y - node.y;
              let ld2 = ldx * ldx + ldy * ldy;

              if (ld2 < 1e-9) {
                ldx = (randomFn() - 0.5) * 1e-3;
                ldy = (randomFn() - 0.5) * 1e-3;
                ld2 = ldx * ldx + ldy * ldy;
              }

              if (ld2 > distanceMax2) continue;
              if (ld2 < distanceMin2) ld2 = Math.sqrt(distanceMin2 * ld2);

              const otherCharge = chargeFn(other);
              const force = (otherCharge * alpha) / ld2;
              const dist = Math.sqrt(ld2);
              if (dist > 0) {
                node.vx += (ldx / dist) * force;
                node.vy += (ldy / dist) * force;
              }
            }
          } else {
            // Internal node Barnes-Hut approximation
            if (d2 <= distanceMax2) {
              if (d2 < distanceMin2) d2 = Math.sqrt(distanceMin2 * d2);
              const force = (quadNode.charge * alpha) / d2;
              const dist = Math.sqrt(d2);
              if (dist > 0) {
                node.vx += (dx / dist) * force;
                node.vy += (dy / dist) * force;
              }
            }
          }
          return true; // Prune sub-branches
        }

        return false; // Recurse
      });
    }
  }

  function initialize(n: SimulationNode[], rand?: () => number): void {
    nodes = n;
    if (rand) randomFn = rand;
  }

  const forceObj: ManyBodyForce = {
    name: "many-body",
    initialize,
    apply,
    theta(t?: number): ManyBodyForce | number {
      if (t === undefined) return thetaVal;
      thetaVal = t;
      theta2 = t * t;
      return forceObj;
    },
    charge(
      c?: number | ((node: SimulationNode) => number),
    ): ManyBodyForce | ((node: SimulationNode) => number) {
      if (c === undefined) return chargeFn;
      chargeFn = typeof c === "function" ? c : () => c;
      return forceObj;
    },
    distanceMin(d?: number): ManyBodyForce | number {
      if (d === undefined) return distanceMin;
      distanceMin = d;
      distanceMin2 = d * d;
      return forceObj;
    },
    distanceMax(d?: number): ManyBodyForce | number {
      if (d === undefined) return distanceMax;
      distanceMax = d;
      distanceMax2 = d * d;
      return forceObj;
    },
  };

  return forceObj;
}
