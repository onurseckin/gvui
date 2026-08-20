import type { FC, ReactNode } from "react";
import React, { useCallback, useState } from "react";

export interface SidebarAccordionProps {
  title: string;
  testId: string;
  badge?: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
}

/** The shared collapsible shell every sidebar breakdown sits in. */
export const SidebarAccordion: FC<SidebarAccordionProps> = React.memo(function SidebarAccordion({
  title,
  testId,
  badge,
  defaultExpanded = true,
  children,
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const toggle = useCallback(() => setIsExpanded((prev) => !prev), []);

  return (
    <div className="sidebar-section" data-testid={testId}>
      <div
        className="sidebar-section-header sidebar-accordion-header"
        onClick={toggle}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        data-testid={`${testId}-header`}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
      >
        <div className="sidebar-section-header-left">
          <svg
            viewBox="0 0 24 24"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`sidebar-chevron ${isExpanded ? "open" : ""}`}
            aria-hidden="true"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
          <h4 className="sidebar-section-title">{title}</h4>
        </div>
        {badge === undefined ? null : <span className="sidebar-section-badge">{badge}</span>}
      </div>
      {isExpanded ? children : null}
    </div>
  );
});

SidebarAccordion.displayName = "SidebarAccordion";
