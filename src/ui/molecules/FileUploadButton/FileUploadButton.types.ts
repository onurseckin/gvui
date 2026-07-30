import type * as React from "react";
import type { ButtonProps } from "../../atoms/Button";
import type { GraphDataset } from "../../../types/graphData";

export interface FileUploadButtonProps extends Omit<ButtonProps, "onClick" | "onError"> {
  onFileUpload: (dataset: GraphDataset) => void;
  accept?: string;
  onError?: (error: Error) => void;
  children?: React.ReactNode;
}
