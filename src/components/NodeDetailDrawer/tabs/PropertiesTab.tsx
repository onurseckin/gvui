import type { FC } from "react";
import { memo, useMemo } from "react";
import type { GraphNodeData } from "../../../types/graphData";
import { collectGenericNodeFields, GenericFieldList } from "../../OpenSchema";
import { DrawerSection } from "../DrawerSection";

export interface PropertiesTabProps {
  node: GraphNodeData;
}

/**
 * Everything this node carries that no purpose-built view claims. A graph written against a schema
 * this renderer has never seen arrives here whole, rendered by the shape of each value, instead of
 * being trimmed down to the fields the drawer happens to recognise.
 */
export const PropertiesTab: FC<PropertiesTabProps> = memo(function PropertiesTab({ node }) {
  const fields = useMemo(() => collectGenericNodeFields(node), [node]);

  if (fields.total === 0) {
    return (
      <div className="drawer-tab-content" data-testid="properties-tab">
        <div className="drawer-empty-state">
          Every field this node carries already has a dedicated view.
        </div>
      </div>
    );
  }

  return (
    <div className="drawer-tab-content" data-testid="properties-tab">
      {fields.own.length > 0 ? (
        <DrawerSection title="Node Fields" count={fields.own.length}>
          <GenericFieldList fields={fields.own} testId="node-generic-fields" />
        </DrawerSection>
      ) : null}

      {fields.metadata.length > 0 ? (
        <DrawerSection title="Metadata Fields" count={fields.metadata.length}>
          <GenericFieldList fields={fields.metadata} testId="metadata-generic-fields" />
        </DrawerSection>
      ) : null}
    </div>
  );
});
