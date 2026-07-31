import type { CustomLayoutConfig } from "./config";
import { expandRect, pointInRectInterior, segmentIntersectsRectInterior } from "./geometry";
import type { GridEdge, NormalizedNode, Point, PortRef, Rect, Segment } from "./types";

export interface RoutingGrid {
  vertices: Map<string, Point>;
  edges: GridEdge[];
  adj: Map<string, { targetId: string; edge: GridEdge }[]>;
  obstacles: Rect[];
}

export function vertexKey(p: Point): string {
  return `${Math.round(p.x * 1000) / 1000},${Math.round(p.y * 1000) / 1000}`;
}

export function buildRoutingGrid(
  nodes: (NormalizedNode & Point)[],
  ports: PortRef[],
  boundingBox: Rect,
  config: CustomLayoutConfig,
  laneRings = 2
): RoutingGrid {
  const obstacles = nodes.map((n) => expandRect({ x: n.x, y: n.y, width: n.width, height: n.height }, config.obstacleClearance));

  const xSet = new Set<number>();
  const ySet = new Set<number>();

  function addX(x: number) {
    xSet.add(Math.round(x * 1000) / 1000);
  }
  function addY(y: number) {
    ySet.add(Math.round(y * 1000) / 1000);
  }

  // 1. Add port and stub coordinates
  for (const p of ports) {
    addX(p.point.x);
    addY(p.point.y);
    addX(p.stub.x);
    addY(p.stub.y);
  }

  // 2. Add obstacle bounds & lane rings
  for (const obs of obstacles) {
    addX(obs.x);
    addX(obs.x + obs.width);
    addY(obs.y);
    addY(obs.y + obs.height);

    for (let r = 1; r <= laneRings; r++) {
      const offset = config.laneSpacing * r;
      addX(obs.x - offset);
      addX(obs.x + obs.width + offset);
      addY(obs.y - offset);
      addY(obs.y + obs.height + offset);
    }
  }

  // 3. Add graph bounding box corridors
  const graphObs = expandRect(boundingBox, config.graphPadding);
  addX(graphObs.x);
  addX(graphObs.x + graphObs.width);
  addY(graphObs.y);
  addY(graphObs.y + graphObs.height);

  const xCoords = Array.from(xSet).sort((a, b) => a - b);
  const yCoords = Array.from(ySet).sort((a, b) => a - b);

  const vertices = new Map<string, Point>();
  const portStubPoints = new Set<string>();
  for (const p of ports) {
    portStubPoints.add(vertexKey(p.point));
    portStubPoints.add(vertexKey(p.stub));
  }

  // 4. Filter vertices not inside obstacle interiors
  for (const x of xCoords) {
    for (const y of yCoords) {
      const pt = { x, y };
      const key = vertexKey(pt);

      const isPortOrStub = portStubPoints.has(key);
      const isInsideObstacle = obstacles.some((obs) => pointInRectInterior(pt, obs, config.epsilon));

      if (!isInsideObstacle || isPortOrStub) {
        vertices.set(key, pt);
      }
    }
  }

  const edges: GridEdge[] = [];
  const adj = new Map<string, { targetId: string; edge: GridEdge }[]>();

  for (const vId of vertices.keys()) {
    adj.set(vId, []);
  }

  function addGridEdge(uId: string, vId: string, segment: Segment) {
    const weight = Math.abs(segment.b.x - segment.a.x) + Math.abs(segment.b.y - segment.a.y);
    const edgeId = `ge__${uId}__${vId}`;
    const gridEdge: GridEdge = { id: edgeId, u: uId, v: vId, segment, weight };

    edges.push(gridEdge);
    adj.get(uId)?.push({ targetId: vId, edge: gridEdge });
    adj.get(vId)?.push({ targetId: uId, edge: gridEdge });
  }

  // 5. Connect horizontal neighbors
  for (const y of yCoords) {
    const rowVertices = xCoords
      .map((x) => ({ x, y }))
      .filter((pt) => vertices.has(vertexKey(pt)));

    for (let i = 0; i < rowVertices.length - 1; i++) {
      const p1 = rowVertices[i];
      const p2 = rowVertices[i + 1];
      const segment: Segment = { a: p1, b: p2 };

      const intersectsObstacle = obstacles.some((obs) => segmentIntersectsRectInterior(segment, obs, config.epsilon));

      if (!intersectsObstacle) {
        addGridEdge(vertexKey(p1), vertexKey(p2), segment);
      }
    }
  }

  // 6. Connect vertical neighbors
  for (const x of xCoords) {
    const colVertices = yCoords
      .map((y) => ({ x, y }))
      .filter((pt) => vertices.has(vertexKey(pt)));

    for (let i = 0; i < colVertices.length - 1; i++) {
      const p1 = colVertices[i];
      const p2 = colVertices[i + 1];
      const segment: Segment = { a: p1, b: p2 };

      const intersectsObstacle = obstacles.some((obs) => segmentIntersectsRectInterior(segment, obs, config.epsilon));

      if (!intersectsObstacle) {
        addGridEdge(vertexKey(p1), vertexKey(p2), segment);
      }
    }
  }

  return {
    vertices,
    edges,
    adj,
    obstacles,
  };
}
