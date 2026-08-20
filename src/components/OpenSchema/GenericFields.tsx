import type { FC } from "react";
import type { GenericField } from "./nodeFields";
import {
  classifyValue,
  formatNumberValue,
  humanizeKey,
  isScalarValue,
  summarizeValue,
} from "./valueShapes";
import "./OpenSchema.css";

/**
 * The fallback renderer for data this UI was never written against. It reads a value's shape and
 * shows it as what it is — a link stays clickable, a list stays a list, a nested object stays
 * explorable — so a graph nobody anticipated still arrives complete instead of trimmed to fit.
 */

/** Past this depth a container is summarised rather than expanded, so one huge blob cannot bury the view. */
const MAX_EXPANDED_DEPTH = 3;

export interface GenericValueViewProps {
  value: unknown;
  depth?: number;
}

export const GenericValueView: FC<GenericValueViewProps> = ({ value, depth = 0 }) => {
  const shape = classifyValue(value);

  if (shape === "empty") {
    return (
      <span
        className="open-value open-value--empty"
        title="the dataset recorded this key with no value"
      >
        empty
      </span>
    );
  }

  if (shape === "boolean") {
    return <span className="open-value open-value--boolean">{String(value)}</span>;
  }

  if (shape === "number") {
    return (
      <span className="open-value open-value--number">{formatNumberValue(value as number)}</span>
    );
  }

  if (shape === "url") {
    const href = String(value).trim();
    return (
      <a
        className="open-value open-value--url"
        href={href}
        target="_blank"
        rel="noreferrer noopener"
      >
        {href}
      </a>
    );
  }

  if (shape === "text") {
    const text = String(value);
    if (text.includes("\n") || text.length > 180) {
      return <pre className="open-value open-value--block">{text}</pre>;
    }
    return <span className="open-value open-value--text">{text}</span>;
  }

  if (shape === "list") {
    const items = value as unknown[];
    if (items.length === 0) {
      return (
        <span className="open-value open-value--empty" title="the dataset recorded an empty list">
          empty list
        </span>
      );
    }
    if (depth >= MAX_EXPANDED_DEPTH) {
      return <span className="open-value open-value--collapsed">{summarizeValue(items)}</span>;
    }
    if (items.every(isScalarValue)) {
      return (
        <div className="open-chip-wrap">
          {items.map((item, index) => (
            <span key={index} className="open-chip">
              <GenericValueView value={item} depth={depth + 1} />
            </span>
          ))}
        </div>
      );
    }
    return (
      <ol className="open-value-list">
        {items.map((item, index) => (
          <li key={index} className="open-value-list-item">
            <span className="open-value-index">{index + 1}</span>
            <GenericValueView value={item} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return (
      <span
        className="open-value open-value--empty"
        title="the dataset recorded an object with no fields"
      >
        empty object
      </span>
    );
  }
  if (depth >= MAX_EXPANDED_DEPTH) {
    return <span className="open-value open-value--collapsed">{summarizeValue(value)}</span>;
  }
  return (
    <GenericFieldList
      fields={entries.map(([key, entry]) => ({ key, value: entry }))}
      depth={depth + 1}
    />
  );
};

export interface GenericFieldListProps {
  fields: readonly GenericField[];
  depth?: number;
  testId?: string;
}

export const GenericFieldList: FC<GenericFieldListProps> = ({ fields, depth = 0, testId }) => (
  <ul className="open-field-list" data-testid={testId} data-depth={depth}>
    {fields.map((field) => {
      const shape = classifyValue(field.value);
      const isContainer = shape === "list" || shape === "record";
      return (
        <li key={field.key} className="open-field-row" data-testid={`open-field-${field.key}`}>
          <div className="open-field-head">
            <span className="open-field-key" title={field.key}>
              {humanizeKey(field.key)}
            </span>
            {isContainer ? (
              <span className="open-field-shape">{summarizeValue(field.value)}</span>
            ) : null}
          </div>
          <div className="open-field-value">
            <GenericValueView value={field.value} depth={depth} />
          </div>
        </li>
      );
    })}
  </ul>
);
