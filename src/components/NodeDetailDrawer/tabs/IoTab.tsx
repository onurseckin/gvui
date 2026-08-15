import type { FC } from "react";
import { formatTokens } from "../../../primitives/nodes/NodeCard/nodeCardModel";
import type { GraphNodeData, IoPort } from "../../../types/graphData";
import { DrawerSection } from "../DrawerSection";

interface IoTabProps {
  node: GraphNodeData;
  inputs: IoPort[];
  outputs: IoPort[];
  nodeNamesById: Map<string, string>;
}

export const IoTab: FC<IoTabProps> = ({ inputs, outputs, nodeNamesById }) => {
  return (
    <div className="drawer-tab-content">
      {inputs.length > 0 ? (
        <DrawerSection title="Input Streams" count={inputs.length}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {inputs.map((port, index) => {
              const peerName = port.node ? (nodeNamesById.get(port.node) ?? port.node) : undefined;
              return (
                <div key={`in-${index}`} className="drawer-io-card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <span className={`drawer-payload-tag payload-${port.kind}`}>{port.kind}</span>
                    {typeof port.tokens === "number" ? (
                      <span
                        style={{
                          fontSize: "10px",
                          color: "#71717a",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {formatTokens(port.tokens)} tokens
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#fafafa",
                      marginBottom: "4px",
                    }}
                  >
                    {port.label}
                  </div>
                  {peerName ? (
                    <div style={{ fontSize: "11px", color: "#a1a1aa", marginBottom: "6px" }}>
                      Source: <code>{peerName}</code>
                    </div>
                  ) : null}
                  {port.preview ? (
                    <pre className="drawer-pre" style={{ maxHeight: "160px", fontSize: "11px" }}>
                      {port.preview}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        </DrawerSection>
      ) : null}

      {outputs.length > 0 ? (
        <DrawerSection title="Output Streams" count={outputs.length}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {outputs.map((port, index) => {
              const peerName = port.node ? (nodeNamesById.get(port.node) ?? port.node) : undefined;
              return (
                <div key={`out-${index}`} className="drawer-io-card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "4px",
                    }}
                  >
                    <span className={`drawer-payload-tag payload-${port.kind}`}>{port.kind}</span>
                    {typeof port.tokens === "number" ? (
                      <span
                        style={{
                          fontSize: "10px",
                          color: "#71717a",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {formatTokens(port.tokens)} tokens
                      </span>
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#fafafa",
                      marginBottom: "4px",
                    }}
                  >
                    {port.label}
                  </div>
                  {peerName ? (
                    <div style={{ fontSize: "11px", color: "#a1a1aa", marginBottom: "6px" }}>
                      Target: <code>{peerName}</code>
                    </div>
                  ) : null}
                  {port.preview ? (
                    <pre className="drawer-pre" style={{ maxHeight: "160px", fontSize: "11px" }}>
                      {port.preview}
                    </pre>
                  ) : null}
                </div>
              );
            })}
          </div>
        </DrawerSection>
      ) : null}
    </div>
  );
};
