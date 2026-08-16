import type { GraphDataset, GraphEdgeData, PositionedNode } from "../../types/graphData";
import type { CanvasAnnotation } from "../../components/CanvasAnnotations/types";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Polygon = Point[];

export type SelectionMode = "selection" | "polygon" | "closure" | "section" | "all";

export type BoundaryEdgePolicy = "none" | "outgoing" | "incoming" | "all";

export type ClosureDirection = "downstream" | "upstream" | "bidirectional";

export type PolygonContainmentMode = "center" | "any_vertex" | "all_vertices" | "intersects";

export interface ClosureOptions {
  direction: ClosureDirection;
  maxDepth?: number;
  includeRootNodes?: boolean;
}

export interface ExtractSubgraphOptions {
  dataset: GraphDataset;
  positionedNodes?: PositionedNode[];
  mode?: SelectionMode;
  selectedNodeIds?: string[] | Set<string> | readonly string[];
  lassoPolygon?: Point[];
  polygonContainmentMode?: PolygonContainmentMode;
  closureOptions?: ClosureOptions;
  sectionIds?: string[] | readonly string[];
  boundaryEdgePolicy?: BoundaryEdgePolicy;
  includeAnnotations?: boolean;
  annotations?: CanvasAnnotation[];
}

export interface BoundaryEdge {
  edge: GraphEdgeData;
  boundaryType: "incoming" | "outgoing";
  internalNodeId: string;
  externalNodeId: string;
}

export interface SubgraphStats {
  nodeCount: number;
  internalEdgeCount: number;
  boundaryIncomingCount: number;
  boundaryOutgoingCount: number;
  boundaryTotalCount: number;
  annotationCount: number;
  sectionCount: number;
  totalTokens: number;
  totalDurationMs: number;
  totalCostUsd: number;
}

export interface ExtractedSubgraph {
  dataset: GraphDataset;
  boundaryEdges: BoundaryEdge[];
  annotations: CanvasAnnotation[];
  positionedNodes: PositionedNode[];
  nodeIds: Set<string>;
  stats: SubgraphStats;
}

export interface BookmarkPackAuthor {
  name: string;
  role?: string;
  avatar?: string;
  email?: string;
}

export interface BookmarkPackMetadata {
  id: string;
  title: string;
  description?: string;
  version: string;
  author: BookmarkPackAuthor;
  tags?: string[];
  license?: string;
  createdAt: string;
  updatedAt: string;
  sourceGraphId?: string;
  sourceGraphTitle?: string;
  sourceUrl?: string;
  stats?: SubgraphStats;
  customFields?: Record<string, unknown>;
}

export interface BookmarkPackBundle {
  schemaVersion: "gvui-bookmark-pack/v1";
  metadata: BookmarkPackMetadata;
  subgraph: GraphDataset;
  boundaryEdges?: BoundaryEdge[];
  bookmarks: CanvasAnnotation[];
  checksum: string;
}

export type BundleParseResult =
  | {
      success: true;
      bundle: BookmarkPackBundle;
    }
  | {
      success: false;
      error: string;
      details?: string[];
    };

export type ExportFormatType = "json-bundle" | "graph-dataset" | "markdown" | "dot" | "mermaid";

export interface ExportConfig {
  format: ExportFormatType;
  packMetadata: Partial<BookmarkPackMetadata>;
  boundaryEdgePolicy: BoundaryEdgePolicy;
  includeAnnotations: boolean;
  includeMetrics: boolean;
  mermaidDirection?: "TD" | "TB" | "LR" | "BT" | "RL";
  dotRankdir?: "TB" | "LR" | "BT" | "RL";
  markdownIncludeTables?: boolean;
  markdownIncludeMermaid?: boolean;
  prettyJson?: boolean;
}

export interface ExportResult {
  format: ExportFormatType;
  filename: string;
  mimeType: string;
  content: string;
  byteSize: number;
}
