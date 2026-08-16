import type { FC } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePresenceStore } from "../../../store/usePresenceStore";
import { CollaboratorHUD } from "./CollaboratorHUD";
import { CursorItem } from "./CursorItem";
import type { AgentPresence, CollaborationOverlayProps, NodeBoundingBox } from "./types";
import "./CollaborationOverlay.css";

export const CollaborationOverlay: FC<CollaborationOverlayProps> = ({
  nodes = [],
  zoomLevel = 1.0,
  className = "",
  onNodeFocus,
  onFollowChange,
}) => {
  const presences = usePresenceStore((state) => state.presences);
  const selfAgentId = usePresenceStore((state) => state.selfAgentId);
  const followedAgentId = usePresenceStore((state) => state.followedAgentId);
  const selectionLocks = usePresenceStore((state) => state.selectionLocks);
  const cursorTrails = usePresenceStore((state) => state.cursorTrails);

  const showCursors = usePresenceStore((state) => state.showCursors);
  const showFrustums = usePresenceStore((state) => state.showFrustums);
  const showSelectionRings = usePresenceStore((state) => state.showSelectionRings);
  const showLockBadges = usePresenceStore((state) => state.showLockBadges);
  const showActivityTrails = usePresenceStore((state) => state.showActivityTrails);

  const pruneInactivePresences = usePresenceStore((state) => state.pruneInactivePresences);
  const clearExpiredLocks = usePresenceStore((state) => state.clearExpiredLocks);
  const pruneCursorTrails = usePresenceStore((state) => state.pruneCursorTrails);

  const effectiveZoom = Number.isFinite(zoomLevel) && zoomLevel > 0 ? zoomLevel : 1.0;
  // UI inverse scale clamped for extreme zoom levels
  const uiInverseScale = 1 / Math.max(0.2, Math.min(3.0, effectiveZoom));

  // Periodic pruning interval
  useEffect(() => {
    const timer = setInterval(() => {
      pruneInactivePresences();
      clearExpiredLocks();
      pruneCursorTrails();
    }, 1000);

    return () => clearInterval(timer);
  }, [pruneInactivePresences, clearExpiredLocks, pruneCursorTrails]);

  // Notify follow change
  const prevFollowedRef = useRef<string | null>(followedAgentId);
  useEffect(() => {
    if (prevFollowedRef.current !== followedAgentId) {
      prevFollowedRef.current = followedAgentId;
      onFollowChange?.(followedAgentId);
    }
  }, [followedAgentId, onFollowChange]);

  const visiblePresences = useMemo(() => {
    return Object.values(presences).filter((p) => p.id !== selfAgentId);
  }, [presences, selfAgentId]);

  const nodeMap = useMemo(() => {
    const map = new Map<string, NodeBoundingBox>();
    for (const node of nodes) {
      map.set(node.id, node);
    }
    return map;
  }, [nodes]);

  const handleCursorClick = useCallback(
    (agentId: string) => {
      const p = presences[agentId];
      if (p?.cursor?.targetNodeId) {
        onNodeFocus?.(p.cursor.targetNodeId);
      }
    },
    [presences, onNodeFocus],
  );

  const handleHUDCollaboratorClick = useCallback(
    (agent: AgentPresence) => {
      if (agent.cursor?.targetNodeId) {
        onNodeFocus?.(agent.cursor.targetNodeId);
      } else if (agent.selection.length > 0) {
        onNodeFocus?.(agent.selection[0]);
      }
    },
    [onNodeFocus],
  );

  // Active selection rings from remote collaborators
  const activeSelectionRings = useMemo(() => {
    if (!showSelectionRings) return [];

    const rings: Array<{
      key: string;
      node: NodeBoundingBox;
      presence: AgentPresence;
    }> = [];

    for (const presence of visiblePresences) {
      if (presence.activityState === "disconnected") continue;
      for (const nodeId of presence.selection) {
        const node = nodeMap.get(nodeId);
        if (node) {
          rings.push({
            key: `ring-${presence.id}-${nodeId}`,
            node,
            presence,
          });
        }
      }
    }

    return rings;
  }, [showSelectionRings, visiblePresences, nodeMap]);

  // Active locks with node positions
  const activeLockBadges = useMemo(() => {
    if (!showLockBadges) return [];
    const now = Date.now();

    return Object.values(selectionLocks)
      .filter((lock) => lock.expiresAt > now)
      .map((lock) => {
        const node = nodeMap.get(lock.targetId);
        return { lock, node };
      })
      .filter(
        (item): item is { lock: typeof item.lock; node: NodeBoundingBox } =>
          item.node !== undefined,
      );
  }, [showLockBadges, selectionLocks, nodeMap]);

  return (
    <div
      className={`gvui-collaboration-overlay ${className}`.trim()}
      data-testid="collaboration-overlay"
      data-zoom-level={effectiveZoom}
    >
      {/* 1. Viewport Frustums Layer (Graph Space) */}
      {showFrustums && (
        <div className="gvui-collab-frustums-layer" data-testid="frustums-layer">
          {visiblePresences.map((presence) => {
            if (!presence.viewport || presence.activityState === "disconnected") {
              return null;
            }
            const { x, y, width, height } = presence.viewport;
            if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
              return null;
            }

            const safeWidth = Math.max(1, width);
            const safeHeight = Math.max(1, height);
            const safeX = Number.isFinite(x) ? x : 0;
            const safeY = Number.isFinite(y) ? y : 0;

            return (
              <div
                key={`frustum-${presence.id}`}
                className="gvui-collab-viewport-frustum"
                style={{
                  transform: `translate3d(${safeX}px, ${safeY}px, 0)`,
                  width: `${safeWidth}px`,
                  height: `${safeHeight}px`,
                  borderColor: presence.color,
                }}
                data-testid={`frustum-${presence.id}`}
              >
                <div
                  className="gvui-collab-frustum-tag"
                  style={{
                    backgroundColor: presence.color,
                    transform: `scale(${uiInverseScale})`,
                    transformOrigin: "bottom left",
                  }}
                >
                  <span className="gvui-frustum-tag-text">{presence.name}&apos;s Viewport</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 2. Selection Focus Rings Layer (Graph Space) */}
      {showSelectionRings && (
        <div className="gvui-collab-selection-rings-layer" data-testid="selection-rings-layer">
          {activeSelectionRings.map(({ key, node, presence }) => (
            <div
              key={key}
              className="gvui-collab-selection-ring"
              style={{
                transform: `translate3d(${node.x - 4}px, ${node.y - 4}px, 0)`,
                width: `${node.width + 8}px`,
                height: `${node.height + 8}px`,
                borderColor: presence.color,
                boxShadow: `0 0 12px ${presence.color}44`,
              }}
              data-testid={`selection-ring-${presence.id}-${node.id}`}
            >
              <div
                className="gvui-collab-selection-ring-badge"
                style={{
                  backgroundColor: presence.color,
                  transform: `scale(${uiInverseScale})`,
                  transformOrigin: "bottom left",
                }}
              >
                {presence.name}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3. Node Selection Lock Badges (Graph Space) */}
      {showLockBadges && (
        <div className="gvui-collab-lock-badges-layer" data-testid="lock-badges-layer">
          {activeLockBadges.map(({ lock, node }) => {
            const timeLeft = Math.max(0, Math.round((lock.expiresAt - Date.now()) / 1000));

            return (
              <div
                key={`lock-badge-${lock.targetId}`}
                className="gvui-collab-node-lock-badge"
                style={{
                  transform: `translate3d(${node.x + node.width - 24}px, ${node.y - 12}px, 0) scale(${uiInverseScale})`,
                  transformOrigin: "top left",
                  borderColor: lock.color,
                }}
                title={`Locked by ${lock.agentName} (${lock.role}) - ${timeLeft}s remaining`}
                data-testid={`node-lock-badge-${lock.targetId}`}
              >
                <span className="gvui-lock-badge-icon">🔒</span>
                <span className="gvui-lock-badge-label">{lock.agentName}</span>
                <span className="gvui-lock-badge-time">{timeLeft}s</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Live Cursors Layer (Graph Space) */}
      {showCursors && (
        <div className="gvui-collab-cursors-layer" data-testid="cursors-layer">
          {visiblePresences.map((presence) => (
            <CursorItem
              key={`cursor-${presence.id}`}
              presence={presence}
              trailPoints={cursorTrails[presence.id]}
              showTrail={showActivityTrails}
              onClick={handleCursorClick}
            />
          ))}
        </div>
      )}

      {/* 5. Fixed Screen-space Collaborator HUD */}
      <CollaboratorHUD onAgentClick={handleHUDCollaboratorClick} />
    </div>
  );
};
