import {
  aggregateTokens,
  readNodeTelemetry,
  readSections,
  resolveNodeRole,
  summarizeReviewActivity,
} from "../../state/graphSchema";
import type { GraphDataset } from "../../types/graphData";
import { indexGenericFields, readRawRole } from "../OpenSchema";

/**
 * Which facets of the graph this dataset actually uses. The sidebar consults it before rendering a
 * purpose-built breakdown, so a graph that speaks none of the orchestration vocabulary is never
 * handed a column of panels built for a schema it does not have.
 */
export interface DatasetFacets {
  hasNodes: boolean;
  hasRoles: boolean;
  hasRegions: boolean;
  hasReviewActivity: boolean;
  hasTokens: boolean;
  hasModels: boolean;
  hasGenericFields: boolean;
}

export function describeDatasetFacets(dataset: GraphDataset | null): DatasetFacets {
  const nodes = dataset?.nodes ?? [];

  const hasRoles = nodes.some(
    (node) => readRawRole(node) !== undefined || resolveNodeRole(node) !== undefined,
  );
  const hasModels = nodes.some((node) => readNodeTelemetry(node).model !== undefined);

  return {
    hasNodes: nodes.length > 0,
    hasRoles,
    hasRegions: readSections(dataset).length > 0,
    hasReviewActivity: summarizeReviewActivity(dataset).hasRecord,
    hasTokens: aggregateTokens(dataset).reportingNodes > 0,
    hasModels,
    hasGenericFields: indexGenericFields(nodes).length > 0,
  };
}
