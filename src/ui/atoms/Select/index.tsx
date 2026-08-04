import * as React from "react";
import { Select as BaseSelect } from "@base-ui-components/react/select";
import type { SelectProps, SelectOption } from "./Select.types";
import "./Select.css";

export function Select<V extends string = string>({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Select an option...",
  size = "md",
  disabled = false,
  className = "",
  popupClassName = "",
  id,
  name,
  "aria-label": ariaLabel,
}: SelectProps<V>): React.JSX.Element {
  const handleValueChange = React.useCallback(
    (newValue: V | null) => {
      if (newValue !== null && onValueChange) {
        onValueChange(newValue);
      }
    },
    [onValueChange],
  );

  return (
    <BaseSelect.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={handleValueChange}
      disabled={disabled}
      name={name}
      id={id}
    >
      <BaseSelect.Trigger
        className={`gvui-select-trigger gvui-select-trigger--${size} ${className}`.trim()}
        aria-label={ariaLabel}
      >
        <BaseSelect.Value>
          {(selected: unknown) => {
            if (typeof selected === "string" && selected) {
              const matched = options.find((opt) => opt.value === selected);
              return matched ? matched.label : selected;
            }
            return placeholder;
          }}
        </BaseSelect.Value>
        <BaseSelect.Icon className="gvui-select-icon">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </BaseSelect.Icon>
      </BaseSelect.Trigger>

      {/* The popup mounts outside the trigger's DOM subtree, so any panel that dismisses itself on
          outside clicks would tear down before Base UI commits an option click. This marker is the
          stable hook those dismiss guards match on instead of a Base UI internal. It sits on the
          portal container as well as the positioner because Base UI's modal backdrop is a sibling
          of the positioner — without it, clicking the owning panel while the popup is open would
          register as an outside click on the backdrop. */}
      <BaseSelect.Portal data-gvui-portal="select">
        <BaseSelect.Positioner
          sideOffset={4}
          className="gvui-select-positioner"
          data-gvui-portal="select"
        >
          <BaseSelect.Popup className={`gvui-select-popup ${popupClassName}`.trim()}>
            {options.map((option: SelectOption<V>) => (
              <BaseSelect.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className="gvui-select-item"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {option.icon && <span className="gvui-select-item-icon">{option.icon}</span>}
                  <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                </div>
                <BaseSelect.ItemIndicator className="gvui-select-item-indicator">
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
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </BaseSelect.ItemIndicator>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}

export type { SelectProps, SelectOption, SelectSize } from "./Select.types";
