import * as React from "react";
import { Input } from "../../atoms/Input";
import type { SearchInputProps } from "./SearchInput.types";
import "./SearchInput.css";

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      onClear,
      placeholder = "Search nodes...",
      size = "md",
      fullWidth = false,
      showHotkey = true,
      hotkeyText = "⌘F",
      className = "",
      disabled = false,
      ...props
    },
    ref,
  ) => {
    const inputRef = React.useRef<HTMLInputElement | null>(null);

    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const [internalValue, setInternalValue] = React.useState<string>(
      (value ?? defaultValue ?? "") as string,
    );

    const isControlled = value !== undefined;
    const currentValue = isControlled ? String(value ?? "") : internalValue;

    type InputChangeEvent = Parameters<NonNullable<SearchInputProps["onChange"]>>[0];

    const handleChange = (e: InputChangeEvent) => {
      if (!isControlled) {
        setInternalValue(e.target.value);
      }
      onChange?.(e);
    };

    const handleClear = () => {
      if (!isControlled) {
        setInternalValue("");
      }
      if (onClear) {
        onClear();
      }
      if (inputRef.current) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(inputRef.current, "");
          const event = new Event("input", { bubbles: true });
          inputRef.current.dispatchEvent(event);
        }
      }
      inputRef.current?.focus();
    };

    React.useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
          e.preventDefault();
          inputRef.current?.focus();
          inputRef.current?.select();
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, []);

    const wrapperClassName = [
      "gvui-search-input-wrapper",
      fullWidth ? "gvui-search-input-wrapper--full-width" : "",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <div className={wrapperClassName}>
        <span className="gvui-search-input-icon" aria-hidden="true">
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
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </span>
        <Input
          ref={inputRef}
          value={value}
          defaultValue={defaultValue}
          onChange={handleChange}
          placeholder={placeholder}
          size={size}
          fullWidth={fullWidth}
          disabled={disabled}
          className="gvui-search-input"
          {...props}
        />
        <div className="gvui-search-input-actions">
          {currentValue.length > 0 && !disabled ? (
            <button
              type="button"
              className="gvui-search-input-clear"
              onClick={handleClear}
              aria-label="Clear search"
              tabIndex={-1}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : null}
          {showHotkey && currentValue.length === 0 ? (
            <kbd className="gvui-search-input-hotkey">{hotkeyText}</kbd>
          ) : null}
        </div>
      </div>
    );
  },
);

SearchInput.displayName = "SearchInput";

export type { SearchInputProps } from "./SearchInput.types";
