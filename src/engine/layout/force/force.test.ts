import { describe, expect, it } from "bun:test";
import {
  ForceSimulation,
  createSeededRandom,
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRank,
  forceX,
  forceY,
  Quadtree,
  type SimulationLink,
  type SimulationNode,
} from "./index";

describe("Barnes-Hut Quadtree", () => {
  it("builds empty tree safely", () => {
    const tree = new Quadtree([]);
    expect(tree.root).toBeNull();
  });

  it("inserts single node and computes correct center of mass", () => {
    const nodes: SimulationNode[] = [{ id: "n1", x: 10, y: 20, vx: 0, vy: 0, charge: -100 }];
    const tree = new Quadtree(nodes);
    expect(tree.root).not.toBeNull();
    expect(tree.root?.cx).toBe(10);
    expect(tree.root?.cy).toBe(20);
    expect(tree.root?.charge).toBe(-100);
  });

  it("handles multiple nodes in different quadrants", () => {
    const nodes: SimulationNode[] = [
      { id: "nw", x: -50, y: -50, vx: 0, vy: 0, charge: -100 },
      { id: "ne", x: 50, y: -50, vx: 0, vy: 0, charge: -100 },
      { id: "sw", x: -50, y: 50, vx: 0, vy: 0, charge: -100 },
      { id: "se", x: 50, y: 50, vx: 0, vy: 0, charge: -100 },
    ];
    const tree = new Quadtree(nodes);
    expect(tree.root?.type).toBe("internal");
    expect(tree.root?.charge).toBe(-400);
    expect(Math.abs(tree.root?.cx ?? 1)).toBeLessThan(1e-6);
    expect(Math.abs(tree.root?.cy ?? 1)).toBeLessThan(1e-6);
  });

  it("handles coincident nodes without stack overflow", () => {
    const nodes: SimulationNode[] = [
      { id: "n1", x: 10, y: 10, vx: 0, vy: 0, charge: -50 },
      { id: "n2", x: 10, y: 10, vx: 0, vy: 0, charge: -50 },
    ];
    const tree = new Quadtree(nodes);
    expect(tree.root).not.toBeNull();
    expect(tree.root?.charge).toBe(-100);
  });

  it("finds nearest node accurately", () => {
    const nodes: SimulationNode[] = [
      { id: "n1", x: 0, y: 0, vx: 0, vy: 0 },
      { id: "n2", x: 100, y: 100, vx: 0, vy: 0 },
      { id: "n3", x: 20, y: 20, vx: 0, vy: 0 },
    ];
    const tree = new Quadtree(nodes);
    const nearest = tree.find(18, 18);
    expect(nearest?.id).toBe("n3");
  });
});

describe("Barnes-Hut Many-Body Force", () => {
  it("pushes two close nodes apart", () => {
    const nodes: SimulationNode[] = [
      { id: "a", x: 0, y: 0, vx: 0, vy: 0, charge: -300 },
      { id: "b", x: 10, y: 0, vx: 0, vy: 0, charge: -300 },
    ];
    const mb = forceManyBody({ theta: 0.8, distanceMin: 1 });
    mb.initialize(nodes);
    mb.apply(1.0);

    expect(nodes[0]!.vx).toBeLessThan(0);
    expect(nodes[1]!.vx).toBeGreaterThan(0);
  });

  it("respects theta, charge, distanceMin, and distanceMax getters/setters", () => {
    const mb = forceManyBody();
    expect(mb.theta(0.5)).toBe(mb);
    expect(mb.theta()).toBe(0.5);

    expect(mb.charge(-500)).toBe(mb);
    expect(typeof mb.charge()).toBe("function");

    expect(mb.distanceMin(5)).toBe(mb);
    expect(mb.distanceMin()).toBe(5);

    expect(mb.distanceMax(1000)).toBe(mb);
    expect(mb.distanceMax()).toBe(1000);
  });
});

describe("Link Spring Force", () => {
  it("pulls distant connected nodes together", () => {
    const nodes: SimulationNode[] = [
      { id: "a", x: 0, y: 0, vx: 0, vy: 0 },
      { id: "b", x: 200, y: 0, vx: 0, vy: 0 },
    ];
    const links: SimulationLink[] = [{ source: "a", target: "b", distance: 50, strength: 1.0 }];

    const lf = forceLink(links);
    lf.initialize(nodes);
    lf.apply(1.0);

    expect(nodes[0]!.vx).toBeGreaterThan(0);
    expect(nodes[1]!.vx).toBeLessThan(0);
  });

  it("supports getters and setters", () => {
    const lf = forceLink([]);
    expect(lf.distance(80)).toBe(lf);
    expect(lf.strength(0.5)).toBe(lf);
    expect(lf.iterations(3)).toBe(lf);
    expect(lf.iterations()).toBe(3);
  });
});

describe("Collision Avoidance Force", () => {
  it("resolves bounding box overlaps between rectangular nodes", () => {
    const nodes: SimulationNode[] = [
      { id: "a", x: 0, y: 0, vx: 0, vy: 0, width: 100, height: 50 },
      { id: "b", x: 20, y: 0, vx: 0, vy: 0, width: 100, height: 50 },
    ];
    const col = forceCollide({ padding: 10, strength: 1.0, useBoundingBox: true });
    col.initialize(nodes);
    col.apply(1.0);

    expect(nodes[0]!.vx).toBeLessThan(0);
    expect(nodes[1]!.vx).toBeGreaterThan(0);
  });

  it("resolves circular collisions", () => {
    const nodes: SimulationNode[] = [
      { id: "a", x: 0, y: 0, vx: 0, vy: 0, radius: 30 },
      { id: "b", x: 10, y: 0, vx: 0, vy: 0, radius: 30 },
    ];
    const col = forceCollide({ padding: 5, strength: 1.0, useBoundingBox: false });
    col.initialize(nodes);
    col.apply(1.0);

    expect(nodes[0]!.vx).toBeLessThan(0);
    expect(nodes[1]!.vx).toBeGreaterThan(0);
  });

  it("supports collision configuration setters", () => {
    const col = forceCollide();
    expect(col.padding(20)).toBe(col);
    expect(col.padding()).toBe(20);
    expect(col.strength(0.5)).toBe(col);
    expect(col.strength()).toBe(0.5);
    expect(col.iterations(2)).toBe(col);
    expect(col.iterations()).toBe(2);
    expect(col.useBoundingBox(false)).toBe(col);
    expect(col.useBoundingBox()).toBe(false);
  });
});

describe("Center, Position, and Rank Forces", () => {
  it("centers nodes at target coordinates", () => {
    const nodes: SimulationNode[] = [
      { id: "a", x: 100, y: 100, vx: 0, vy: 0 },
      { id: "b", x: 200, y: 200, vx: 0, vy: 0 },
    ];
    const cf = forceCenter(0, 0, { strength: 1.0 });
    cf.initialize(nodes);
    cf.apply(1.0);

    const avgX = (nodes[0]!.x + nodes[1]!.x) * 0.5;
    const avgY = (nodes[0]!.y + nodes[1]!.y) * 0.5;
    expect(Math.abs(avgX)).toBeLessThan(1e-6);
    expect(Math.abs(avgY)).toBeLessThan(1e-6);
  });

  it("applies forceX and forceY", () => {
    const nodes: SimulationNode[] = [{ id: "a", x: 0, y: 0, vx: 0, vy: 0 }];
    const fx = forceX(100, 0.5);
    const fy = forceY(200, 0.5);

    fx.initialize(nodes);
    fy.initialize(nodes);

    fx.apply(1.0);
    fy.apply(1.0);

    expect(nodes[0]!.vx).toBeGreaterThan(0);
    expect(nodes[0]!.vy).toBeGreaterThan(0);
  });

  it("enforces rank separation along Y axis", () => {
    const nodes: SimulationNode[] = [
      { id: "a", x: 0, y: 0, vx: 0, vy: 0, rank: 0 },
      { id: "b", x: 0, y: 0, vx: 0, vy: 0, rank: 2 },
    ];
    const rf = forceRank({ rankSeparation: 100, strength: 0.5, axis: "y" });
    rf.initialize(nodes);
    rf.apply(1.0);

    expect(nodes[0]!.vy).toBe(0);
    expect(nodes[1]!.vy).toBeGreaterThan(0);
  });
});

describe("ForceSimulation Cooling and Convergence", () => {
  it("cools down alpha and reaches deterministic convergence", () => {
    const nodes: SimulationNode[] = [
      { id: "1", x: 0, y: 0, vx: 0, vy: 0 },
      { id: "2", x: 10, y: 10, vx: 0, vy: 0 },
      { id: "3", x: 20, y: 5, vx: 0, vy: 0 },
    ];
    const links: SimulationLink[] = [
      { source: "1", target: "2" },
      { source: "2", target: "3" },
    ];

    const sim = new ForceSimulation(nodes, {
      alphaDecay: 0.05,
      randomSeed: 999,
    });
    sim.force("many-body", forceManyBody());
    sim.force("link", forceLink(links));

    sim.run(200);

    expect(sim.isConverged()).toBe(true);
    expect(sim.iteration()).toBeGreaterThan(5);
    expect(sim.energy()).toBeLessThan(0.01);
  });

  it("produces identical positions across deterministic runs with same seed", () => {
    const createRun = (seed: number) => {
      const nodes: SimulationNode[] = [
        { id: "a", x: 0, y: 0, vx: 0, vy: 0 },
        { id: "b", x: 0, y: 0, vx: 0, vy: 0 },
        { id: "c", x: 0, y: 0, vx: 0, vy: 0 },
      ];
      const links: SimulationLink[] = [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ];
      const sim = new ForceSimulation(nodes, { randomSeed: seed });
      sim.force("many-body", forceManyBody());
      sim.force("link", forceLink(links));
      sim.run(50);
      return nodes.map((n) => ({ x: n.x, y: n.y }));
    };

    const run1 = createRun(12345);
    const run2 = createRun(12345);

    expect(run1).toEqual(run2);
  });

  it("handles pinned fixed coordinates fx and fy", () => {
    const nodes: SimulationNode[] = [
      { id: "pinned", x: 50, y: 50, vx: 0, vy: 0, fx: 50, fy: 50 },
      { id: "free", x: 60, y: 60, vx: 0, vy: 0 },
    ];
    const sim = new ForceSimulation(nodes);
    sim.force("many-body", forceManyBody());
    sim.step(10);

    expect(nodes[0]!.x).toBe(50);
    expect(nodes[0]!.y).toBe(50);
  });

  it("handles tick and end listeners properly", () => {
    let tickCount = 0;
    let endCount = 0;

    const nodes: SimulationNode[] = [{ id: "n1", x: 0, y: 0, vx: 0, vy: 0 }];
    const sim = new ForceSimulation(nodes);
    const onTick = () => {
      tickCount++;
    };
    const onEnd = () => {
      endCount++;
    };

    sim.on("tick", onTick);
    sim.on("end", onEnd);
    sim.step(5);
    expect(tickCount).toBe(5);

    sim.stop();
    expect(sim.isConverged()).toBe(true);

    sim.off("tick", onTick);
    sim.off("end", onEnd);
  });

  it("createSeededRandom produces consistent deterministic output sequences", () => {
    const rng1 = createSeededRandom(12345);
    const rng2 = createSeededRandom(12345);
    const s1 = [rng1(), rng1(), rng1()];
    const s2 = [rng2(), rng2(), rng2()];
    expect(s1).toEqual(s2);
    expect(s1[0]).toBeGreaterThanOrEqual(0);
    expect(s1[0]).toBeLessThan(1);
  });
});
