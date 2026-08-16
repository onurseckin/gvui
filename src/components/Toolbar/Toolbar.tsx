import type { FC, ReactNode } from "react";
import { memo } from "react";
import { CanvasToolbar } from "../Controls/CanvasToolbar";
import { LayoutMenu } from "./LayoutMenu";

export interface ToolbarProps {
  className?: string;
  showLayoutMenu?: boolean;
  children?: ReactNode;
}

export const Toolbar: FC<ToolbarProps> = memo(function Toolbar({
  className = "",
  showLayoutMenu = true,
  children,
}) {
  return (
    <div className={`gvui-toolbar-wrapper${className ? ` ${className}` : ""}`}>
      <CanvasToolbar />
      {showLayoutMenu && <LayoutMenu />}
      {children}
    </div>
  );
});

Toolbar.displayName = "Toolbar";

export default Toolbar;
