import type { GraphSection, SectionType } from "../../types/graphData";
import {
  hasPreset,
  readVocabularyMember,
  stableAccent,
  vocabularyLabel,
} from "../../primitives/vocabulary";

export interface SectionTypeDescriptor {
  type: SectionType;
  label: string;
  accent: string;
}

/**
 * The preset region treatments. Like every other vocabulary here this is a table a dataset may
 * extend or ignore; a region type outside it keeps its own name and gets a generated accent.
 */
export const SECTION_TYPE_DESCRIPTORS: Readonly<Record<SectionType, SectionTypeDescriptor>> =
  Object.freeze({
    branch: { type: "branch", label: "BRANCH", accent: "#d946ef" },
    wave: { type: "wave", label: "WAVE", accent: "#38bdf8" },
    phase: { type: "phase", label: "PHASE", accent: "#a3e635" },
  });

/**
 * The treatment for a region's declared type, or undefined when it declared none — a region without
 * a type is still a legitimate grouping and simply takes its colour from its status instead.
 */
export function describeSectionType(type?: SectionType): SectionTypeDescriptor | undefined {
  const member = readVocabularyMember(type);
  if (member === undefined) return undefined;
  if (hasPreset(SECTION_TYPE_DESCRIPTORS, member)) return SECTION_TYPE_DESCRIPTORS[member];
  return { type: member, label: vocabularyLabel(member), accent: stableAccent(member) };
}

/**
 * How deeply a region is nested. A region hanging off a node that no other region contains is at
 * depth 1; one hanging off a node inside a depth-1 region is at depth 2, and so on. This is the
 * only depth the graph carries — sections nest through their parent node, not through each other.
 *
 * Regions that reference each other in a cycle stop contributing depth rather than looping.
 */
export function computeSectionDepths(
  sections: readonly GraphSection[],
): ReadonlyMap<string, number> {
  const owningSection = new Map<string, string>();
  for (const section of sections) {
    for (const nodeId of section.nodeIds) {
      if (!owningSection.has(nodeId)) owningSection.set(nodeId, section.id);
    }
  }

  const byId = new Map(sections.map((section) => [section.id, section]));
  const depths = new Map<string, number>();

  const depthOf = (section: GraphSection, seen: Set<string>): number => {
    const cached = depths.get(section.id);
    if (cached !== undefined) return cached;
    if (seen.has(section.id)) return 1;
    seen.add(section.id);

    const parentSectionId =
      section.parentNodeId === undefined ? undefined : owningSection.get(section.parentNodeId);
    const parent = parentSectionId === undefined ? undefined : byId.get(parentSectionId);
    const depth = parent === undefined || parent.id === section.id ? 1 : depthOf(parent, seen) + 1;

    depths.set(section.id, depth);
    return depth;
  };

  for (const section of sections) depthOf(section, new Set<string>());
  return depths;
}

/**
 * How deep a region may sit before the canvas folds it up on arrival. Two levels of excursion read
 * fine at a glance; past that the region is detail the reader asks for rather than detail we impose.
 */
export const SECTION_AUTO_COLLAPSE_DEPTH = 2;

/** A region arrives collapsed when the dataset says so, or when it is nested past the threshold. */
export function sectionStartsCollapsed(section: GraphSection, depth: number): boolean {
  return section.collapsed ?? depth > SECTION_AUTO_COLLAPSE_DEPTH;
}
