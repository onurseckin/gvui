import type { CanvasAnnotation } from "../CanvasAnnotations/types";
import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";
import type {
  ClosureDirection,
  ExportConfig,
  ExportFormatType,
  ExportResult,
  ExtractedSubgraph,
  Point,
  SelectionMode,
} from "../../engine/subgraphExport/types";

export interface SubgraphExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset?: GraphDataset | null;
  positionedNodes?: PositionedNode[];
  positionedEdges?: PositionedEdge[];
  selectedNodeIds?: string[] | Set<string>;
  annotations?: CanvasAnnotation[];
  lassoPolygon?: Point[];
  defaultFormat?: ExportFormatType;
  defaultMode?: SelectionMode;
  onExportSuccess?: (result: ExportResult) => void;
}

export type SubgraphModalTab = "preview" | "metadata" | "bookmarks" | "code";

export interface SubgraphPreviewCanvasProps {
  extracted: ExtractedSubgraph;
  width?: number | string;
  height?: number | string;
  showBoundaryEdges?: boolean;
  showBookmarks?: boolean;
  className?: string;
}

export interface BookmarkPackListProps {
  bookmarks: CanvasAnnotation[];
  nodes: { id: string; name: string }[];
  onBookmarksChange: (bookmarks: CanvasAnnotation[]) => void;
  className?: string;
}

export interface ExportConfigFormProps {
  config: ExportConfig;
  onChange: (config: ExportConfig) => void;
  mode: SelectionMode;
  onModeChange: (mode: SelectionMode) => void;
  closureDirection: ClosureDirection;
  onClosureDirectionChange: (dir: ClosureDirection) => void;
  closureDepth: number;
  onClosureDepthChange: (depth: number) => void;
  selectedCount: number;
  totalNodeCount: number;
  className?: string;
}
