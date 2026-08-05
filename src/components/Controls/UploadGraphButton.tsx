import type { FC } from "react";
import { useCallback, useRef } from "react";
import { uploadGraphFile } from "../../api/graphFilesApi";
import { useGraphFilesStore } from "../../state/useGraphFilesStore";
import { Button } from "../../ui";

export interface UploadGraphButtonProps {
  onUploaded: (fileId: string) => void;
  onError: (message: string) => void;
}

/**
 * Navbar "add graph file" control. Reads the picked JSON client-side (so a malformed file never
 * reaches the server), then hands the raw text to the caller's upload handler, which persists it
 * into `public/data/graphs` via the dev-only `/api/graphs` route.
 */
export const UploadGraphButton: FC<UploadGraphButtonProps> = ({ onUploaded, onError }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      try {
        const text = await file.text();
        JSON.parse(text); // fail fast on malformed JSON before it ever reaches the server
        const { id, files } = await uploadGraphFile(file.name, text);
        useGraphFilesStore.setState({
          files: [...files].sort((a, b) => a.localeCompare(b)),
          error: null,
        });
        onUploaded(id);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to add graph file.");
      }
    },
    [onUploaded, onError],
  );

  return (
    <>
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => void handleFileChange(e)}
        accept=".json"
        style={{ display: "none" }}
        aria-hidden="true"
        tabIndex={-1}
      />
      <Button
        variant="icon"
        size="sm"
        onClick={handleClick}
        className="add-graph-file-btn"
        title="Add a graph JSON file to public/data/graphs"
        aria-label="Add a graph JSON file"
      >
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
      </Button>
    </>
  );
};

export default UploadGraphButton;
