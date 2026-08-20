import type { ComponentType } from "react";
import { IconHelpCircle } from "@tabler/icons-react";
import {
  describeEdgeKind,
  isKnownEdgeKind,
  resolveEdgeKind,
} from "../../primitives/edges/GraphEdge/edgeKinds";
import {
  describeNodeArchetype,
  NODE_KIND_DESCRIPTORS,
  NODE_ROLE_DESCRIPTORS,
  NODE_STATUS_DESCRIPTORS,
} from "../../primitives/nodes/NodeCard/nodeKinds";
import {
  hasPreset,
  NEUTRAL_ACCENT,
  readVocabularyMember,
  stableAccent,
  vocabularyLabel,
} from "../../primitives/vocabulary";
import { UNKNOWN_LABEL } from "../../state/graphSchema";
import type { GraphEdgeData, GraphNodeData } from "../../types/graphData";
import { humanizeKey } from "./valueShapes";

/**
 * The panel-side reading of the open vocabularies. The canvas already draws an unfamiliar kind with
 * its own name and accent; the sidebar and the drawer need the same treatment plus one more fact —
 * whether the member came from the preset table or from this dataset's own words — so a reader can
 * tell a shipped vocabulary from the graph's own.
 */

export { NEUTRAL_ACCENT, stableAccent };

export type VocabularyIcon = ComponentType<{
  size?: number | string;
  color?: string;
  className?: string;
  stroke?: number | string;
}>;

export interface OpenIdentity {
  label: string;
  accent: string;
  IconComponent: VocabularyIcon;
  /** False when the member has no preset treatment and its look was generated from its own name. */
  recognized: boolean;
  /** Which field the identity came from; "none" when the node declared neither. */
  source: "role" | "kind" | "none";
  raw?: string;
}

export interface OpenStatus {
  label: string;
  color: string;
  /** False when the dataset carried no status at all — which is not a lifecycle claim. */
  recorded: boolean;
  recognized: boolean;
  raw?: string;
}

export interface OpenKind {
  label: string;
  accent: string;
  recognized: boolean;
  raw?: string;
}

export interface OpenEdgeKind {
  label: string;
  accent: string;
  recognized: boolean;
  raw?: string;
}

/** The role exactly as the dataset spelled it, preset or not. */
export function readRawRole(
  node: Pick<GraphNodeData, "telemetry" | "metadata">,
): string | undefined {
  return readVocabularyMember(node.telemetry?.role) ?? readVocabularyMember(node.metadata?.role);
}

export function readRawKind(node: Pick<GraphNodeData, "kind">): string | undefined {
  return readVocabularyMember(node.kind);
}

/**
 * What the node draws itself as, taken from the same descriptor the canvas uses so a node is the
 * same colour in the graph and in the panels. A node that declared neither a kind nor a role is
 * unknown rather than the default silhouette.
 */
export function describeOpenIdentity(
  node: Pick<GraphNodeData, "kind" | "telemetry" | "metadata">,
): OpenIdentity {
  const role = readRawRole(node);
  const kind = readRawKind(node);
  const raw = role ?? kind;

  if (raw === undefined) {
    return {
      label: UNKNOWN_LABEL.toUpperCase(),
      accent: NEUTRAL_ACCENT,
      IconComponent: IconHelpCircle,
      recognized: false,
      source: "none",
    };
  }

  const descriptor = describeNodeArchetype(node);
  const recognized =
    role !== undefined
      ? hasPreset(NODE_ROLE_DESCRIPTORS, role)
      : hasPreset(NODE_KIND_DESCRIPTORS, raw);

  return {
    label: descriptor.label,
    accent: descriptor.accent,
    IconComponent: descriptor.IconComponent,
    recognized,
    source: role !== undefined ? "role" : "kind",
    raw,
  };
}

/**
 * The node's own status, never a substitute for one. A node whose dataset recorded no status is
 * unknown: inferring "completed" from silence would show the reader a fact nobody reported.
 */
export function describeOpenStatus(node: Pick<GraphNodeData, "status">): OpenStatus {
  const raw = readVocabularyMember(node.status);
  if (raw === undefined) {
    return { label: UNKNOWN_LABEL, color: NEUTRAL_ACCENT, recorded: false, recognized: false };
  }
  if (hasPreset(NODE_STATUS_DESCRIPTORS, raw)) {
    const descriptor = NODE_STATUS_DESCRIPTORS[raw];
    return {
      label: descriptor.label,
      color: descriptor.color,
      recorded: true,
      recognized: true,
      raw,
    };
  }
  return {
    label: humanizeKey(raw),
    color: stableAccent(raw),
    recorded: true,
    recognized: false,
    raw,
  };
}

/**
 * The node's kind alone, with no role standing in for it. The identity a node draws itself as may
 * come from its role, but a breakdown of what kinds a graph uses has to count the kinds.
 */
export function describeOpenKind(node: Pick<GraphNodeData, "kind">): OpenKind {
  const raw = readRawKind(node);
  if (raw === undefined) {
    return { label: UNKNOWN_LABEL.toUpperCase(), accent: NEUTRAL_ACCENT, recognized: false };
  }
  if (hasPreset(NODE_KIND_DESCRIPTORS, raw)) {
    const descriptor = NODE_KIND_DESCRIPTORS[raw];
    return { label: descriptor.label, accent: descriptor.accent, recognized: true, raw };
  }
  return { label: vocabularyLabel(raw), accent: stableAccent(raw), recognized: false, raw };
}

/** The relationship an edge claims, including one this renderer ships no treatment for. */
export function describeOpenEdgeKind(edge: Pick<GraphEdgeData, "kind">): OpenEdgeKind {
  const raw = readVocabularyMember(edge.kind);
  if (raw === undefined) {
    return { label: UNKNOWN_LABEL, accent: NEUTRAL_ACCENT, recognized: false };
  }
  const resolved = resolveEdgeKind(raw);
  const descriptor = describeEdgeKind(resolved);
  return {
    label: descriptor.label,
    accent: descriptor.accent,
    recognized: isKnownEdgeKind(resolved),
    raw,
  };
}
