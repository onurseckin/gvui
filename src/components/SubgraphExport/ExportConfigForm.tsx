import React, { useState } from "react";
import type {
  BoundaryEdgePolicy,
  ClosureDirection,
  SelectionMode,
} from "../../engine/subgraphExport/types";
import { isValidSemVer } from "../../engine/subgraphExport/bundlePack";
import type { ExportConfigFormProps } from "./types";

export const ExportConfigForm: React.FC<ExportConfigFormProps> = ({
  config,
  onChange,
  mode,
  onModeChange,
  closureDirection,
  onClosureDirectionChange,
  closureDepth,
  onClosureDepthChange,
  selectedCount,
  totalNodeCount,
  className = "",
}) => {
  const [tagInput, setTagInput] = useState("");
  const meta = config.packMetadata;
  const currentTags = meta.tags || [];

  const handleTextChange = (
    field: "title" | "description" | "version" | "license",
    value: string,
  ) => {
    onChange({
      ...config,
      packMetadata: {
        ...meta,
        [field]: value,
      },
    });
  };

  const handleAuthorChange = (field: "name" | "role" | "email", value: string) => {
    onChange({
      ...config,
      packMetadata: {
        ...meta,
        author: {
          name: meta.author?.name || "GVUI Architect",
          role: meta.author?.role || "human",
          ...meta.author,
          [field]: value,
        },
      },
    });
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim().replace(/^#/, "");
    if (trimmed && !currentTags.includes(trimmed)) {
      onChange({
        ...config,
        packMetadata: {
          ...meta,
          tags: [...currentTags, trimmed],
        },
      });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onChange({
      ...config,
      packMetadata: {
        ...meta,
        tags: currentTags.filter((t) => t !== tagToRemove),
      },
    });
  };

  const isVersionValid = !meta.version || isValidSemVer(meta.version);

  return (
    <div
      className={`subgraph-config-form ${className}`}
      style={{ display: "flex", flexDirection: "column", gap: "16px" }}
    >
      {/* Subgraph Selection & Boundary Scope */}
      <div
        style={{
          backgroundColor: "#18181b",
          padding: "14px",
          borderRadius: "8px",
          border: "1px solid #27272a",
        }}
      >
        <div
          style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "12px", color: "#60a5fa" }}
        >
          Target Extraction & Scope Configuration
        </div>

        <div className="subgraph-form-grid">
          <div className="subgraph-form-group">
            <label className="subgraph-form-label">Selection Scope Mode</label>
            <select
              value={mode}
              onChange={(e) => onModeChange(e.target.value as SelectionMode)}
              className="subgraph-form-select"
            >
              <option value="selection">Explicit Selection ({selectedCount} nodes)</option>
              <option value="closure">Transitive Closure (Reachable Hops)</option>
              <option value="polygon">Lasso Polygon Containment</option>
              <option value="section">Graph Sections / Clusters</option>
              <option value="all">Entire Dataset ({totalNodeCount} nodes)</option>
            </select>
          </div>

          <div className="subgraph-form-group">
            <label className="subgraph-form-label">Boundary Edge Policy</label>
            <select
              value={config.boundaryEdgePolicy}
              onChange={(e) =>
                onChange({
                  ...config,
                  boundaryEdgePolicy: e.target.value as BoundaryEdgePolicy,
                })
              }
              className="subgraph-form-select"
            >
              <option value="none">Internal Edges Only (Strict Subgraph)</option>
              <option value="outgoing">Include Outgoing Boundary Crossings</option>
              <option value="incoming">Include Incoming Boundary Crossings</option>
              <option value="all">Include All Boundary Crossings (In & Out)</option>
            </select>
          </div>

          {mode === "closure" && (
            <>
              <div className="subgraph-form-group">
                <label className="subgraph-form-label">Closure Direction</label>
                <select
                  value={closureDirection}
                  onChange={(e) => onClosureDirectionChange(e.target.value as ClosureDirection)}
                  className="subgraph-form-select"
                >
                  <option value="downstream">Downstream (Forward Reachability)</option>
                  <option value="upstream">Upstream (Backward Dependencies)</option>
                  <option value="bidirectional">Bidirectional (Full Neighborhood)</option>
                </select>
              </div>

              <div className="subgraph-form-group">
                <label className="subgraph-form-label">Max Traversal Hops</label>
                <select
                  value={closureDepth}
                  onChange={(e) => onClosureDepthChange(Number(e.target.value))}
                  className="subgraph-form-select"
                >
                  <option value="1">1 Hop (Immediate Neighbors)</option>
                  <option value="2">2 Hops</option>
                  <option value="3">3 Hops</option>
                  <option value="5">5 Hops</option>
                  <option value="999">Unlimited Transitive Closure</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bookmark Pack Metadata */}
      <div
        style={{
          backgroundColor: "#18181b",
          padding: "14px",
          borderRadius: "8px",
          border: "1px solid #27272a",
        }}
      >
        <div
          style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "12px", color: "#34d399" }}
        >
          Bookmark Pack Metadata & Provenance
        </div>

        <div className="subgraph-form-grid">
          <div className="subgraph-form-group">
            <label className="subgraph-form-label">Pack Title</label>
            <input
              type="text"
              placeholder="e.g. Critical Failure Analysis Subgraph"
              value={meta.title || ""}
              onChange={(e) => handleTextChange("title", e.target.value)}
              className="subgraph-form-input"
            />
          </div>

          <div className="subgraph-form-group">
            <label className="subgraph-form-label">
              Version (SemVer)
              {!isVersionValid && (
                <span style={{ color: "#ef4444", marginLeft: "6px", fontSize: "0.75rem" }}>
                  Invalid (use X.Y.Z)
                </span>
              )}
            </label>
            <input
              type="text"
              placeholder="1.0.0"
              value={meta.version || "1.0.0"}
              onChange={(e) => handleTextChange("version", e.target.value)}
              className="subgraph-form-input"
            />
          </div>

          <div className="subgraph-form-group">
            <label className="subgraph-form-label">Author Name</label>
            <input
              type="text"
              placeholder="e.g. GVUI Architect"
              value={meta.author?.name || ""}
              onChange={(e) => handleAuthorChange("name", e.target.value)}
              className="subgraph-form-input"
            />
          </div>

          <div className="subgraph-form-group">
            <label className="subgraph-form-label">Author Role</label>
            <select
              value={meta.author?.role || "human"}
              onChange={(e) => handleAuthorChange("role", e.target.value)}
              className="subgraph-form-select"
            >
              <option value="human">Human Developer</option>
              <option value="validator">Validator Agent</option>
              <option value="critic">Critic Agent</option>
              <option value="agent">Autonomous Worker Agent</option>
              <option value="system">System Orchestrator</option>
            </select>
          </div>

          <div className="subgraph-form-group">
            <label className="subgraph-form-label">License</label>
            <select
              value={meta.license || "MIT"}
              onChange={(e) => handleTextChange("license", e.target.value)}
              className="subgraph-form-select"
            >
              <option value="MIT">MIT</option>
              <option value="Apache-2.0">Apache-2.0</option>
              <option value="BSD-3-Clause">BSD-3-Clause</option>
              <option value="CC-BY-4.0">CC-BY-4.0</option>
              <option value="Proprietary">Proprietary / Confidential</option>
            </select>
          </div>

          <div className="subgraph-form-group">
            <label className="subgraph-form-label">Tags</label>
            <div className="subgraph-tags-editor">
              {currentTags.map((tag) => (
                <span key={tag} className="subgraph-tag-chip">
                  #{tag}
                  <span className="subgraph-tag-remove" onClick={() => handleRemoveTag(tag)}>
                    ×
                  </span>
                </span>
              ))}
              <input
                type="text"
                placeholder="Add tag and press Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="subgraph-tag-input"
              />
            </div>
          </div>

          <div className="subgraph-form-group full-width">
            <label className="subgraph-form-label">Description & Context</label>
            <textarea
              placeholder="Provide a detailed context summary of this extracted subgraph..."
              value={meta.description || ""}
              onChange={(e) => handleTextChange("description", e.target.value)}
              className="subgraph-form-textarea"
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* Format-Specific Preferences */}
      <div
        style={{
          backgroundColor: "#18181b",
          padding: "14px",
          borderRadius: "8px",
          border: "1px solid #27272a",
        }}
      >
        <div
          style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "12px", color: "#fbbf24" }}
        >
          Export Format Specific Options
        </div>

        <div className="subgraph-form-grid">
          <div className="subgraph-form-group">
            <label className="subgraph-form-label">Mermaid Flowchart Orientation</label>
            <select
              value={config.mermaidDirection || "TD"}
              onChange={(e) =>
                onChange({
                  ...config,
                  mermaidDirection: e.target.value as "TD" | "TB" | "LR" | "BT" | "RL",
                })
              }
              className="subgraph-form-select"
            >
              <option value="TD">Top to Bottom (TD)</option>
              <option value="LR">Left to Right (LR)</option>
              <option value="BT">Bottom to Top (BT)</option>
              <option value="RL">Right to Left (RL)</option>
            </select>
          </div>

          <div className="subgraph-form-group">
            <label className="subgraph-form-label">Graphviz DOT Rank Direction</label>
            <select
              value={config.dotRankdir || "TB"}
              onChange={(e) =>
                onChange({
                  ...config,
                  dotRankdir: e.target.value as "TB" | "LR" | "BT" | "RL",
                })
              }
              className="subgraph-form-select"
            >
              <option value="TB">Top to Bottom (TB)</option>
              <option value="LR">Left to Right (LR)</option>
              <option value="BT">Bottom to Top (BT)</option>
              <option value="RL">Right to Left (RL)</option>
            </select>
          </div>

          <div className="subgraph-form-group">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.8125rem",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={config.prettyJson !== false}
                onChange={(e) =>
                  onChange({
                    ...config,
                    prettyJson: e.target.checked,
                  })
                }
              />
              Pretty-Print JSON (2 spaces indentation)
            </label>
          </div>

          <div className="subgraph-form-group">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "0.8125rem",
                color: "#ffffff",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={config.includeAnnotations !== false}
                onChange={(e) =>
                  onChange({
                    ...config,
                    includeAnnotations: e.target.checked,
                  })
                }
              />
              Include Bookmark Annotations in Export
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
