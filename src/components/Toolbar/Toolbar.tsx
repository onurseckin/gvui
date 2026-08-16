import type { FC, ReactNode } from "react";
import { memo } from "react";
import { CanvasToolbar } from "../Controls/CanvasToolbar";
import { GraphSearchOverlay } from "./GraphSearchOverlay";
import { LayoutMenu } from "./LayoutMenu";

export interface ToolbarProps {
  className?: string;
  showSearchOverlay?: boolean;
  showLayoutMenu?: boolean;
  children?: ReactNode;
}

export const Toolbar: FC<ToolbarProps> = memo(function Toolbar({
  className = "",
  showSearchOverlay = true,
  showLayoutMenu = true,
  children,
}) {
  return (
    <div className={`gvui-toolbar-wrapper${className ? ` ${className}` : ""}`}>
      <CanvasToolbar />
      {showLayoutMenu && <LayoutMenu />}
      {showSearchOverlay && <GraphSearchOverlay />}
      {children}
    </div>
  );
});

Toolbar.displayName = "Toolbar";

export default Toolbar;
