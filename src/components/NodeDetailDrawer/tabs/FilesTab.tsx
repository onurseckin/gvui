import type { FC } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { DiffsTab } from "./DiffsTab";

export interface FilesTabProps {
  node: GraphNodeData;
}

/**
 * Filesystem touchpoints and code diff tab presenting assigned write scopes,
 * touched file modes, addition/deletion churn statistics, and line-level diff highlighting.
 */
export const FilesTab: FC<FilesTabProps> = ({ node }) => {
  return <DiffsTab node={node} />;
};

export default FilesTab;
