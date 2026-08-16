export type AnnotationType = "pin" | "sticky" | "bookmark";

export type AnnotationAuthorRole = "human" | "validator" | "agent" | "system" | "critic";

export interface AnnotationAuthor {
  name: string;
  role: AnnotationAuthorRole;
  avatar?: string;
}

export type AnnotationColor =
  | "yellow"
  | "blue"
  | "green"
  | "rose"
  | "purple"
  | "amber"
  | "cyan"
  | "gray";

export type AnnotationPriority = "critical" | "high" | "medium" | "low" | "info";

export type AnnotationCategory =
  | "review"
  | "bug"
  | "question"
  | "todo"
  | "info"
  | "performance"
  | "security"
  | "bookmark"
  | "note";

export type AnnotationStatus = "open" | "in-progress" | "resolved";

export interface CanvasCoordinate {
  x: number;
  y: number;
}

export interface CanvasAnnotation {
  id: string;
  type: AnnotationType;
  nodeId?: string;
  coordinates?: CanvasCoordinate;
  offset?: { x: number; y: number };
  title?: string;
  content: string;
  author: AnnotationAuthor;
  color: AnnotationColor;
  category?: AnnotationCategory;
  priority?: AnnotationPriority;
  status?: AnnotationStatus;
  tags?: string[];
  isResolved?: boolean;
  isCollapsed?: boolean;
  isPinned?: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface AnnotationFilterState {
  searchQuery: string;
  authorRole: "all" | AnnotationAuthorRole;
  type: "all" | AnnotationType;
  category: "all" | AnnotationCategory;
  status: "all" | "open" | "resolved";
  nodeId?: string | null;
  priority: "all" | AnnotationPriority;
  tags: string[];
}

export interface AnnotationStoreState {
  annotations: CanvasAnnotation[];
  selectedAnnotationId: string | null;
  activeEditingId: string | null;
  isLayerVisible: boolean;
  showPins: boolean;
  showStickies: boolean;
  showBookmarks: boolean;
  showResolved: boolean;
  filterState: AnnotationFilterState;
}

export interface CreateAnnotationInput {
  id?: string;
  type?: AnnotationType;
  nodeId?: string;
  coordinates?: CanvasCoordinate;
  offset?: { x: number; y: number };
  title?: string;
  content: string;
  author?: Partial<AnnotationAuthor>;
  color?: AnnotationColor;
  category?: AnnotationCategory;
  priority?: AnnotationPriority;
  status?: AnnotationStatus;
  tags?: string[];
  isResolved?: boolean;
  isCollapsed?: boolean;
  isPinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateAnnotationInput {
  type?: AnnotationType;
  nodeId?: string;
  coordinates?: CanvasCoordinate;
  offset?: { x: number; y: number };
  title?: string;
  content?: string;
  author?: AnnotationAuthor;
  color?: AnnotationColor;
  category?: AnnotationCategory;
  priority?: AnnotationPriority;
  status?: AnnotationStatus;
  tags?: string[];
  isResolved?: boolean;
  isCollapsed?: boolean;
  isPinned?: boolean;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AnnotationStoreActions {
  addAnnotation: (input: CreateAnnotationInput) => CanvasAnnotation;
  updateAnnotation: (id: string, updates: UpdateAnnotationInput) => void;
  deleteAnnotation: (id: string) => void;
  toggleResolveAnnotation: (id: string) => void;
  toggleCollapseAnnotation: (id: string) => void;
  togglePinAnnotation: (id: string) => void;
  setSelectedAnnotationId: (id: string | null) => void;
  setActiveEditingId: (id: string | null) => void;
  setFilterState: (filters: Partial<AnnotationFilterState>) => void;
  resetFilterState: () => void;
  setLayerVisible: (visible: boolean) => void;
  setShowPins: (show: boolean) => void;
  setShowStickies: (show: boolean) => void;
  setShowBookmarks: (show: boolean) => void;
  setShowResolved: (show: boolean) => void;
  importAnnotations: (annotations: CanvasAnnotation[], replace?: boolean) => void;
  clearAllAnnotations: () => void;
  exportAsMarkdown: () => string;
  exportAsJson: () => string;
}

export type AnnotationStore = AnnotationStoreState & AnnotationStoreActions;
