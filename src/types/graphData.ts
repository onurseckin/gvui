export interface NodeBadge {
  label: string;
  variant?: 'success' | 'info' | 'amber' | 'error' | 'gray';
}

export interface NodeTool {
  name: string;
  type?: 'generic' | 'custom';
}

export interface NodeContext {
  repoPath?: string;
  previousOutputs?: Array<{ fromNode: string; summary: string }>;
  [key: string]: unknown;
}

export interface GraphNodeData {
  id: string;
  name: string;
  description?: string;
  type?: string;
  model?: string;
  harnessModel?: string;
  badges?: NodeBadge[];
  tools?: NodeTool[];
  context?: NodeContext;
  metadata?: Record<string, unknown>;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  label?: string;
  directed?: boolean;
  isCycle?: boolean;
}

export interface GraphDataset {
  id: string;
  title: string;
  directed?: boolean;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

export interface PositionedNode extends GraphNodeData {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PositionedEdge extends GraphEdgeData {
  path: string;
  labelX?: number;
  labelY?: number;
}
