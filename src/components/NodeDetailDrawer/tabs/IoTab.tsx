import type { FC } from "react";
import type { GraphNodeData, IoPort } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";
import { IoStreamItem } from "../IoStreamItem";

export interface IoTabProps {
  node?: GraphNodeData;
  inputs: IoPort[];
  outputs: IoPort[];
  nodeNamesById: Map<string, string>;
  onSelectNode?: (nodeId: string) => void;
}

/**
 * Dedicated I/O Stream view utilizing expandable accordion cards.
 */
export const IoTab: FC<IoTabProps> = ({ inputs, outputs, nodeNamesById, onSelectNode }) => {
  const hasStreams = inputs.length > 0 || outputs.length > 0;

  if (!hasStreams) {
    return (
      <div className="drawer-tab-content">
        <div className="drawer-empty-state">No input or output streams recorded for this node.</div>
      </div>
    );
  }

  return (
    <div className="drawer-tab-content">
      {inputs.length > 0 ? (
        <DrawerSection title="Input Streams" count={inputs.length}>
          <div className="drawer-stream-list">
            {inputs.map((port, index) => (
              <IoStreamItem
                key={`in-${port.node ?? "run"}-${index}`}
                port={port}
                peerName={port.node ? nodeNamesById.get(port.node) : undefined}
                direction="in"
                onSelectNode={onSelectNode}
              />
            ))}
          </div>
        </DrawerSection>
      ) : null}

      {outputs.length > 0 ? (
        <DrawerSection title="Output Streams" count={outputs.length}>
          <div className="drawer-stream-list">
            {outputs.map((port, index) => (
              <IoStreamItem
                key={`out-${port.node ?? "run"}-${index}`}
                port={port}
                peerName={port.node ? nodeNamesById.get(port.node) : undefined}
                direction="out"
                onSelectNode={onSelectNode}
              />
            ))}
          </div>
        </DrawerSection>
      ) : null}
    </div>
  );
};
