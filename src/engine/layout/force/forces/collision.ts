import { Quadtree, type QuadtreeNode } from "../quadtree";
import type { CollisionForceOptions, Force, SimulationNode } from "../types";

export interface CollisionForce extends Force {
  radius: (
    r?: number | ((node: SimulationNode) => number),
  ) => CollisionForce | ((node: SimulationNode) => number);
  padding: (p?: number) => CollisionForce | number;
  strength: (s?: number) => CollisionForce | number;
  iterations: (i?: number) => CollisionForce | number;
  useBoundingBox: (b?: boolean) => CollisionForce | boolean;
}

export function forceCollide(options: CollisionForceOptions = {}): CollisionForce {
  let nodes: SimulationNode[] = [];
  let radii: number[] = [];
  let widths: number[] = [];
  let heights: number[] = [];
  let paddingVal = options.padding ?? 16;
  let strengthVal = options.strength ?? 0.8;
  let iterationsVal = options.iterations ?? 1;
  let useBoundingBoxVal = options.useBoundingBox ?? true;

  let radiusFn: (node: SimulationNode) => number =
    typeof options.radius === "function"
      ? options.radius
      : typeof options.radius === "number"
        ? () => options.radius as number
        : (node) => {
            if (node.radius !== undefined) return node.radius;
            const w = node.width ?? 120;
            const h = node.height ?? 60;
            return Math.sqrt(w * w + h * h) * 0.5;
          };

  let randomFn: () => number = Math.random;

  function initialize(n: SimulationNode[], rand?: () => number): void {
    nodes = n;
    if (rand) randomFn = rand;
    radii = new Array(nodes.length);
    widths = new Array(nodes.length);
    heights = new Array(nodes.length);

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node) continue;
      radii[i] = radiusFn(node);
      widths[i] = node.width ?? 120;
      heights[i] = node.height ?? 60;
    }
  }

  function apply(alpha: number): void {
    const n = nodes.length;
    if (n === 0) return;

    for (let iter = 0; iter < iterationsVal; iter++) {
      const tree = new Quadtree(nodes, () => 1);

      for (let i = 0; i < n; i++) {
        const node = nodes[i];
        if (!node) continue;

        const rI = (radii[i] ?? 30) + paddingVal;
        const wI = (widths[i] ?? 120) + paddingVal * 2;
        const hI = (heights[i] ?? 60) + paddingVal * 2;
        const xI = node.x + node.vx;
        const yI = node.y + node.vy;

        // Query Quadtree
        tree.visit((quadNode: QuadtreeNode) => {
          // Bounding box of quadtree cell
          const qx0 = quadNode.x0;
          const qy0 = quadNode.y0;
          const qx1 = quadNode.x1;
          const qy1 = quadNode.y1;

          const maxExtent = useBoundingBoxVal ? Math.max(wI, hI) : rI;
          // Check if search bounds overlap with quadtree cell
          if (
            xI + maxExtent < qx0 ||
            xI - maxExtent > qx1 ||
            yI + maxExtent < qy0 ||
            yI - maxExtent > qy1
          ) {
            return true; // Prune
          }

          if (quadNode.type === "leaf") {
            for (const other of quadNode.nodes) {
              if (other === node) continue;
              const j = other.index ?? nodes.indexOf(other);
              const xJ = other.x + other.vx;
              const yJ = other.y + other.vy;

              if (useBoundingBoxVal) {
                const wJ = (widths[j] ?? 120) + paddingVal * 2;
                const hJ = (heights[j] ?? 60) + paddingVal * 2;

                const dx = xI - xJ;
                const dy = yI - yJ;
                const minDx = (wI + wJ) * 0.5;
                const minDy = (hI + hJ) * 0.5;

                const overlapX = minDx - Math.abs(dx);
                const overlapY = minDy - Math.abs(dy);

                if (overlapX > 0 && overlapY > 0) {
                  // Collision detected! Use normalized penetration ratio
                  const ratioX = overlapX / minDx;
                  const ratioY = overlapY / minDy;

                  if (ratioX <= ratioY) {
                    const signX = dx === 0 ? (randomFn() > 0.5 ? 1 : -1) : Math.sign(dx);
                    const push = overlapX * 0.5 * strengthVal * alpha;
                    node.vx += signX * push;
                    other.vx -= signX * push;
                  } else {
                    const signY = dy === 0 ? (randomFn() > 0.5 ? 1 : -1) : Math.sign(dy);
                    const push = overlapY * 0.5 * strengthVal * alpha;
                    node.vy += signY * push;
                    other.vy -= signY * push;
                  }
                }
              } else {
                const rJ = (radii[j] ?? 30) + paddingVal;
                let dx = xI - xJ;
                let dy = yI - yJ;
                let l = Math.sqrt(dx * dx + dy * dy);
                const minDistance = rI + rJ;

                if (l < minDistance) {
                  if (l < 1e-6) {
                    dx = (randomFn() - 0.5) * 1e-3;
                    dy = (randomFn() - 0.5) * 1e-3;
                    l = Math.sqrt(dx * dx + dy * dy);
                  }
                  const delta = ((minDistance - l) / l) * 0.5 * strengthVal * alpha;
                  node.vx += dx * delta;
                  node.vy += dy * delta;
                  other.vx -= dx * delta;
                  other.vy -= dy * delta;
                }
              }
            }
            return true;
          }

          return false;
        });
      }
    }
  }

  const forceObj: CollisionForce = {
    name: "collision",
    initialize,
    apply,
    radius(
      r?: number | ((node: SimulationNode) => number),
    ): CollisionForce | ((node: SimulationNode) => number) {
      if (r === undefined) return radiusFn;
      radiusFn = typeof r === "function" ? r : () => r;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n) radii[i] = radiusFn(n);
      }
      return forceObj;
    },
    padding(p?: number): CollisionForce | number {
      if (p === undefined) return paddingVal;
      paddingVal = p;
      return forceObj;
    },
    strength(s?: number): CollisionForce | number {
      if (s === undefined) return strengthVal;
      strengthVal = s;
      return forceObj;
    },
    iterations(i?: number): CollisionForce | number {
      if (i === undefined) return iterationsVal;
      iterationsVal = i;
      return forceObj;
    },
    useBoundingBox(b?: boolean): CollisionForce | boolean {
      if (b === undefined) return useBoundingBoxVal;
      useBoundingBoxVal = b;
      return forceObj;
    },
  };

  return forceObj;
}
