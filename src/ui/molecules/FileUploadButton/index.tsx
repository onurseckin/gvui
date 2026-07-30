import * as React from "react";
import { Button } from "../../atoms/Button";
import type { FileUploadButtonProps } from "./FileUploadButton.types";
import type { GraphDataset } from "../../../types/graphData";

export const FileUploadButton = React.forwardRef<HTMLButtonElement, FileUploadButtonProps>(
  (
    {
      onFileUpload,
      onError,
      accept = ".json",
      children,
      variant = "outline",
      size = "md",
      disabled = false,
      className = "",
      ...props
    },
    ref,
  ) => {
    const fileInputRef = React.useRef<HTMLInputElement | null>(null);

    const handleClick = () => {
      fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const dataset = JSON.parse(text) as GraphDataset;
        onFileUpload(dataset);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to parse JSON file");
        if (onError) {
          onError(error);
        } else {
          console.error("FileUploadButton error:", error);
        }
      } finally {
        event.target.value = "";
      }
    };

    return (
      <>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept={accept}
          style={{ display: "none" }}
          aria-hidden="true"
          tabIndex={-1}
        />
        <Button
          ref={ref}
          variant={variant}
          size={size}
          disabled={disabled}
          onClick={handleClick}
          className={className}
          {...props}
        >
          {children ?? (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Upload JSON</span>
            </>
          )}
        </Button>
      </>
    );
  },
);

FileUploadButton.displayName = "FileUploadButton";

export type { FileUploadButtonProps } from "./FileUploadButton.types";
