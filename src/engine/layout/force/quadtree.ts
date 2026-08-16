import type { SimulationNode } from "./types";

export interface QuadtreeInternalNode {
  type: "internal";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  charge: number;
  mass: number;
  nodes?: SimulationNode[]; // in case of leaf before split
  children: Array<QuadtreeNode | null>; // [NW, NE, SW, SE]
}

export interface QuadtreeLeafNode {
  type: "leaf";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  charge: number;
  mass: number;
  nodes: SimulationNode[]; // list of coincident or single node
}

export type QuadtreeNode = QuadtreeInternalNode | QuadtreeLeafNode;

export class Quadtree {
  public root: QuadtreeNode | null = null;
  public x0: number = 0;
  public y0: number = 0;
  public x1: number = 0;
  public y1: number = 0;

  private readonly getCharge: (node: SimulationNode) => number;

  constructor(
    nodes: SimulationNode[] = [],
    getCharge: (node: SimulationNode) => number = (n) => n.charge ?? -300,
  ) {
    this.getCharge = getCharge;
    if (nodes.length > 0) {
      this.build(nodes);
    }
  }

  public build(nodes: SimulationNode[]): void {
    if (nodes.length === 0) {
      this.root = null;
      return;
    }

    // Determine bounds
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of nodes) {
      if (node.x < minX) minX = node.x;
      if (node.x > maxX) maxX = node.x;
      if (node.y < minY) minY = node.y;
      if (node.y > maxY) maxY = node.y;
    }

    // Ensure non-zero width/height and square aspect ratio for balanced quadtree
    let dx = maxX - minX;
    let dy = maxY - minY;
    if (dx < 1e-6) dx = 1;
    if (dy < 1e-6) dy = 1;
    const maxDim = Math.max(dx, dy);

    this.x0 = minX;
    this.y0 = minY;
    this.x1 = minX + maxDim;
    this.y1 = minY + maxDim;

    this.root = null;
    for (const node of nodes) {
      this.insert(node);
    }

    // Compute center of mass & total charge bottom-up
    if (this.root) {
      this.accumulate(this.root);
    }
  }

  public insert(node: SimulationNode): void {
    const charge = this.getCharge(node);
    const mass = Math.abs(charge) > 1e-6 ? Math.abs(charge) : 1;

    if (!this.root) {
      this.root = {
        type: "leaf",
        x0: this.x0,
        y0: this.y0,
        x1: this.x1,
        y1: this.y1,
        cx: node.x,
        cy: node.y,
        charge,
        mass,
        nodes: [node],
      };
      return;
    }

    this.root = this.insertRecursive(this.root, node, this.x0, this.y0, this.x1, this.y1, 0);
  }

  private insertRecursive(
    current: QuadtreeNode,
    node: SimulationNode,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    depth: number,
  ): QuadtreeNode {
    const maxDepth = 40;

    if (current.type === "leaf") {
      // Check if same position or max depth reached
      const first = current.nodes[0];
      const isSamePos =
        first && Math.abs(first.x - node.x) < 1e-9 && Math.abs(first.y - node.y) < 1e-9;

      if (isSamePos || depth >= maxDepth) {
        current.nodes.push(node);
        return current;
      }

      // Convert leaf into internal node and re-insert existing nodes + new node
      const internal: QuadtreeInternalNode = {
        type: "internal",
        x0,
        y0,
        x1,
        y1,
        cx: 0,
        cy: 0,
        charge: 0,
        mass: 0,
        children: [null, null, null, null],
      };

      for (const existing of current.nodes) {
        this.insertIntoChild(internal, existing, x0, y0, x1, y1, depth);
      }
      this.insertIntoChild(internal, node, x0, y0, x1, y1, depth);
      return internal;
    }

    // Current is internal node
    this.insertIntoChild(current, node, x0, y0, x1, y1, depth);
    return current;
  }

  private insertIntoChild(
    parent: QuadtreeInternalNode,
    node: SimulationNode,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    depth: number,
  ): void {
    const xm = (x0 + x1) * 0.5;
    const ym = (y0 + y1) * 0.5;
    const isRight = node.x >= xm;
    const isBottom = node.y >= ym;

    // Child index: 0=NW (x<xm, y<ym), 1=NE (x>=xm, y<ym), 2=SW (x<xm, y>=ym), 3=SE (x>=xm, y>=ym)
    const childIndex = (isRight ? 1 : 0) | (isBottom ? 2 : 0);

    const childX0 = isRight ? xm : x0;
    const childX1 = isRight ? x1 : xm;
    const childY0 = isBottom ? ym : y0;
    const childY1 = isBottom ? y1 : ym;

    const child = parent.children[childIndex];
    if (!child) {
      const charge = this.getCharge(node);
      const mass = Math.abs(charge) > 1e-6 ? Math.abs(charge) : 1;
      parent.children[childIndex] = {
        type: "leaf",
        x0: childX0,
        y0: childY0,
        x1: childX1,
        y1: childY1,
        cx: node.x,
        cy: node.y,
        charge,
        mass,
        nodes: [node],
      };
    } else {
      parent.children[childIndex] = this.insertRecursive(
        child,
        node,
        childX0,
        childY0,
        childX1,
        childY1,
        depth + 1,
      );
    }
  }

  private accumulate(node: QuadtreeNode): void {
    if (node.type === "leaf") {
      let totalCharge = 0;
      let totalMass = 0;
      let sumX = 0;
      let sumY = 0;

      for (const n of node.nodes) {
        const q = this.getCharge(n);
        const m = Math.abs(q) > 1e-6 ? Math.abs(q) : 1;
        totalCharge += q;
        totalMass += m;
        sumX += n.x * m;
        sumY += n.y * m;
      }

      node.charge = totalCharge;
      node.mass = totalMass;
      node.cx = totalMass > 0 ? sumX / totalMass : (node.nodes[0]?.x ?? 0);
      node.cy = totalMass > 0 ? sumY / totalMass : (node.nodes[0]?.y ?? 0);
      return;
    }

    let totalCharge = 0;
    let totalMass = 0;
    let sumX = 0;
    let sumY = 0;

    for (const child of node.children) {
      if (child) {
        this.accumulate(child);
        totalCharge += child.charge;
        totalMass += child.mass;
        sumX += child.cx * child.mass;
        sumY += child.cy * child.mass;
      }
    }

    node.charge = totalCharge;
    node.mass = totalMass;
    node.cx = totalMass > 0 ? sumX / totalMass : (node.x0 + node.x1) * 0.5;
    node.cy = totalMass > 0 ? sumY / totalMass : (node.y0 + node.y1) * 0.5;
  }

  /**
   * Traverse the quadtree. Returning true from the callback prunes that subtree.
   */
  public visit(callback: (node: QuadtreeNode) => boolean | void): void {
    if (!this.root) return;
    const stack: QuadtreeNode[] = [this.root];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      const prune = callback(current);
      if (prune) continue;

      if (current.type === "internal") {
        for (let i = current.children.length - 1; i >= 0; i--) {
          const child = current.children[i];
          if (child) {
            stack.push(child);
          }
        }
      }
    }
  }

  /**
   * Find nearest node to given coordinates within an optional radius.
   */
  public find(x: number, y: number, maxRadius: number = Infinity): SimulationNode | null {
    let closestNode: SimulationNode | null = null;
    let closestDistSq = maxRadius * maxRadius;

    this.visit((node) => {
      // Check if quadrant can possibly contain a closer point
      const qx = Math.max(node.x0, Math.min(x, node.x1));
      const qy = Math.max(node.y0, Math.min(y, node.y1));
      const dx = x - qx;
      const dy = y - qy;
      if (dx * dx + dy * dy >= closestDistSq) {
        return true; // prune
      }

      if (node.type === "leaf") {
        for (const n of node.nodes) {
          const ndx = x - n.x;
          const ndy = y - n.y;
          const d2 = ndx * ndx + ndy * ndy;
          if (d2 < closestDistSq) {
            closestDistSq = d2;
            closestNode = n;
          }
        }
      }
      return false;
    });

    return closestNode;
  }
}
