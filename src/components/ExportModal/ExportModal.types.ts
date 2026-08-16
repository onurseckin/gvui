import type { GraphDataset, PositionedEdge, PositionedNode } from "../../types/graphData";

export type ExportFormat = "svg" | "png" | "mermaid" | "slq" | "html";

export interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dataset?: GraphDataset | null;
  positionedNodes?: PositionedNode[];
  positionedEdges?: PositionedEdge[];
  defaultFormat?: ExportFormat;
  onExportSuccess?: (format: ExportFormat, filename: string) => void;
}

export interface ExportFormatOption {
  id: ExportFormat;
  label: string;
  badge: string;
  description: string;
  extension: string;
}

export const EXPORT_FORMATS: readonly ExportFormatOption[] = [
  {
    id: "svg",
    label: "SVG Vector",
    badge: "Vector",
    description:
      "High-resolution standalone vector SVG with embedded inline styles & badge geometry",
    extension: ".svg",
  },
  {
    id: "png",
    label: "PNG Raster",
    badge: "Image",
    description:
      "Crisp raster image with selectable resolution scaling (1x, 2x, 4x) and backgrounds",
    extension: ".png",
  },
  {
    id: "mermaid",
    label: "Mermaid",
    badge: "Markdown",
    description: "Faithful flowchart syntax with node kinds, shapes, styles, and section subgraphs",
    extension: ".mmd",
  },
  {
    id: "slq",
    label: "SLQ / SQL Data",
    badge: "Schema",
    description: "Normalized relational DDL & DML statements or structured table JSON",
    extension: ".sql",
  },
  {
    id: "html",
    label: "Offline HTML",
    badge: "Interactive",
    description: "Self-contained single-file offline interactive viewer with pan, zoom & inspector",
    extension: ".html",
  },
];
