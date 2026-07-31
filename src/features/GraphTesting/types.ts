import type { EdgeLayoutHint } from "../../engine/layout/custom/types";

export type PortSide = "Top" | "Right" | "Bottom" | "Left";

export interface TestNode {
  id: string;
  name: string;
  desc: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TestEdge {
  source: string;
  target: string;
  label?: string;
  isCycle?: boolean;
  layoutRole?: EdgeLayoutHint;
}

export interface TestScenario {
  id: number;
  title: string;
  nodes: TestNode[];
  edges: TestEdge[];
}

export interface Point2D {
  x: number;
  y: number;
}

export interface EdgeSideAssignment {
  edge: TestEdge;
  srcNode: TestNode;
  tgtNode: TestNode;
  srcSide: PortSide;
  tgtSide: PortSide;
}

export interface CalculatedBadge {
  idx: number;
  label: string;
  isCycle?: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CalculatedEdgeResult {
  dPath: string;
  lineDist: number;
  badge: CalculatedBadge;
  srcSide: PortSide;
  tgtSide: PortSide;
}

export interface ScenarioLayoutResult {
  edges: CalculatedEdgeResult[];
  badges: CalculatedBadge[];
  totalDistance: number;
  nodes?: TestNode[];
}
