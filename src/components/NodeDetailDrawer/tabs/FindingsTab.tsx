import type { FC } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { ErrorInspector } from "./ErrorInspector";

export interface FindingsTabProps {
  node: GraphNodeData;
}

/**
 * Findings & Pushback tab powered by ErrorInspector.
 * Presents quality findings, repair rounds, adversarial audit quotes,
 * structured error stack traces, and before/after remediation patches.
 */
export const FindingsTab: FC<FindingsTabProps> = ({ node }) => {
  return <ErrorInspector node={node} />;
};
