import type { GraphDataset } from "../../types/graphData";
import type {
  AnomalyCategory,
  AnomalyFinding,
  AnomalyReport,
  AnomalySeverity,
} from "../../engine/anomaly/types";

export interface AnomalyInspectorProps {
  dataset?: GraphDataset | null;
  onSelectNode?: (nodeId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
  onApplyQuickFix?: (patchedDataset: GraphDataset) => void;
  className?: string;
}

export interface AnomalyFilterState {
  searchQuery: string;
  selectedSeverities: AnomalySeverity[];
  selectedCategories: AnomalyCategory[];
  selectedNodeId: string | null;
  autoFixableOnly: boolean;
}

export interface AnomalyCardProps {
  anomaly: AnomalyFinding;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSelectNode?: (nodeId: string) => void;
  onSelectEdge?: (edgeId: string) => void;
  onApplyQuickFix?: (findingId: string) => void;
}

export interface AnomalyHealthGaugeProps {
  score: number;
  report: AnomalyReport;
  className?: string;
}

export interface AnomalyFilterBarProps {
  filters: AnomalyFilterState;
  report: AnomalyReport;
  onSearchChange: (query: string) => void;
  onToggleSeverity: (severity: AnomalySeverity) => void;
  onToggleCategory: (category: AnomalyCategory) => void;
  onToggleAutoFixable: () => void;
  onResetFilters: () => void;
}

export interface AnomalyCategoryDistributionProps {
  categoryCounts: Record<AnomalyCategory, number>;
  selectedCategories: AnomalyCategory[];
  onToggleCategory: (category: AnomalyCategory) => void;
}

export interface AnomalyRemediationPanelProps {
  report: AnomalyReport;
  onApplyQuickFix?: (findingId: string) => void;
  onSelectNode?: (nodeId: string) => void;
}
