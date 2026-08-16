import type {
  Force,
  LinkForceOptions,
  ResolvedSimulationLink,
  SimulationLink,
  SimulationNode,
} from "../types";

export interface LinkForce extends Force {
  links: (links?: SimulationLink[]) => LinkForce | ResolvedSimulationLink[];
  distance: (
    dist?: number | ((link: SimulationLink) => number),
  ) => LinkForce | ((link: SimulationLink) => number);
  strength: (
    str?: number | ((link: SimulationLink) => number),
  ) => LinkForce | ((link: SimulationLink) => number);
  iterations: (iter?: number) => LinkForce | number;
}

export function forceLink(
  rawLinks: SimulationLink[] = [],
  options: LinkForceOptions = {},
): LinkForce {
  let nodes: SimulationNode[] = [];
  let nodeById = new Map<string, SimulationNode>();
  let links: ResolvedSimulationLink[] = [];
  let countByNode = new Map<string, number>();
  let bias: number[] = [];
  let distances: number[] = [];
  let strengths: number[] = [];
  let iterationsVal = options.iterations ?? 1;

  let distanceFn: (link: SimulationLink) => number =
    typeof options.distance === "function"
      ? options.distance
      : typeof options.distance === "number"
        ? () => options.distance as number
        : (l) => l.distance ?? 100;

  let strengthFn: (link: SimulationLink) => number =
    typeof options.strength === "function"
      ? options.strength
      : typeof options.strength === "number"
        ? () => options.strength as number
        : (link) => {
            const srcId = typeof link.source === "string" ? link.source : link.source.id;
            const tgtId = typeof link.target === "string" ? link.target : link.target.id;
            const cSrc = countByNode.get(srcId) ?? 1;
            const cTgt = countByNode.get(tgtId) ?? 1;
            const baseStrength = 1 / Math.min(cSrc, cTgt);
            const weight = link.weight ?? 1;
            return Math.min(1, baseStrength * weight);
          };

  let randomFn: () => number = Math.random;

  function resolveLinks(): void {
    links = [];
    countByNode.clear();

    for (const raw of rawLinks) {
      const srcId = typeof raw.source === "string" ? raw.source : raw.source.id;
      const tgtId = typeof raw.target === "string" ? raw.target : raw.target.id;
      const source = nodeById.get(srcId);
      const target = nodeById.get(tgtId);

      if (source && target) {
        links.push({
          id: raw.id,
          source,
          target,
          distance: raw.distance ?? 100,
          strength: raw.strength ?? 0.7,
          weight: raw.weight ?? 1,
          data: raw.data,
        });
        countByNode.set(srcId, (countByNode.get(srcId) ?? 0) + 1);
        countByNode.set(tgtId, (countByNode.get(tgtId) ?? 0) + 1);
      }
    }

    bias = new Array(links.length);
    distances = new Array(links.length);
    strengths = new Array(links.length);

    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (!link) continue;
      const cSrc = countByNode.get(link.source.id) ?? 1;
      const cTgt = countByNode.get(link.target.id) ?? 1;
      bias[i] = cSrc / (cSrc + cTgt);
      distances[i] = distanceFn(rawLinks[i] ?? link);
      strengths[i] = strengthFn(rawLinks[i] ?? link);
    }
  }

  function initialize(n: SimulationNode[], rand?: () => number): void {
    nodes = n;
    if (rand) randomFn = rand;
    nodeById.clear();
    for (const node of nodes) {
      nodeById.set(node.id, node);
    }
    resolveLinks();
  }

  function apply(alpha: number): void {
    for (let k = 0; k < iterationsVal; k++) {
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (!link) continue;

        const source = link.source;
        const target = link.target;

        let dx = target.x + target.vx - (source.x + source.vx);
        let dy = target.y + target.vy - (source.y + source.vy);
        let l = Math.sqrt(dx * dx + dy * dy);

        if (l < 1e-6) {
          dx = (randomFn() - 0.5) * 1e-3;
          dy = (randomFn() - 0.5) * 1e-3;
          l = Math.sqrt(dx * dx + dy * dy);
        }

        const targetDist = distances[i] ?? 100;
        const str = strengths[i] ?? 0.7;
        const delta = ((l - targetDist) / l) * alpha * str;
        const b = bias[i] ?? 0.5;

        const vxDelta = dx * delta;
        const vyDelta = dy * delta;

        target.vx -= vxDelta * b;
        target.vy -= vyDelta * b;
        source.vx += vxDelta * (1 - b);
        source.vy += vyDelta * (1 - b);
      }
    }
  }

  const forceObj: LinkForce = {
    name: "link",
    initialize,
    apply,
    links(newLinks?: SimulationLink[]): LinkForce | ResolvedSimulationLink[] {
      if (newLinks === undefined) return links;
      rawLinks = newLinks;
      resolveLinks();
      return forceObj;
    },
    distance(
      d?: number | ((link: SimulationLink) => number),
    ): LinkForce | ((link: SimulationLink) => number) {
      if (d === undefined) return distanceFn;
      distanceFn = typeof d === "function" ? d : () => d;
      for (let i = 0; i < links.length; i++) {
        const raw = rawLinks[i] ?? links[i];
        if (raw) distances[i] = distanceFn(raw);
      }
      return forceObj;
    },
    strength(
      s?: number | ((link: SimulationLink) => number),
    ): LinkForce | ((link: SimulationLink) => number) {
      if (s === undefined) return strengthFn;
      strengthFn = typeof s === "function" ? s : () => s;
      for (let i = 0; i < links.length; i++) {
        const raw = rawLinks[i] ?? links[i];
        if (raw) strengths[i] = strengthFn(raw);
      }
      return forceObj;
    },
    iterations(iter?: number): LinkForce | number {
      if (iter === undefined) return iterationsVal;
      iterationsVal = iter;
      return forceObj;
    },
  };

  return forceObj;
}
