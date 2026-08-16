import type { FC } from "react";
import { useCallback, useState } from "react";
import { usePresenceStore } from "../../../store/usePresenceStore";
import { PresenceBadge } from "./PresenceBadge";
import type { AgentPresence, CollaboratorHUDProps, RoleFilter } from "./types";

const ROLE_FILTERS: Array<{ id: RoleFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "orchestrator", label: "Orchestrator" },
  { id: "implementer", label: "Implementer" },
  { id: "validator", label: "Validator" },
  { id: "critic", label: "Critic" },
  { id: "system", label: "System" },
];

export const CollaboratorHUD: FC<CollaboratorHUDProps> = ({
  className = "",
  position = "top-right",
  collapsible = true,
  onAgentClick,
}) => {
  const presences = usePresenceStore((state) => state.presences);
  const selfAgentId = usePresenceStore((state) => state.selfAgentId);
  const followedAgentId = usePresenceStore((state) => state.followedAgentId);
  const selectionLocks = usePresenceStore((state) => state.selectionLocks);
  const conflicts = usePresenceStore((state) => state.conflicts);

  const showCursors = usePresenceStore((state) => state.showCursors);
  const showFrustums = usePresenceStore((state) => state.showFrustums);
  const showSelectionRings = usePresenceStore((state) => state.showSelectionRings);
  const showLockBadges = usePresenceStore((state) => state.showLockBadges);
  const showActivityTrails = usePresenceStore((state) => state.showActivityTrails);

  const filterRole = usePresenceStore((state) => state.filterRole);
  const searchQuery = usePresenceStore((state) => state.searchQuery);

  const setFilterRole = usePresenceStore((state) => state.setFilterRole);
  const setSearchQuery = usePresenceStore((state) => state.setSearchQuery);
  const setFollowedAgentId = usePresenceStore((state) => state.setFollowedAgentId);
  const releaseLock = usePresenceStore((state) => state.releaseLock);

  const toggleShowCursors = usePresenceStore((state) => state.toggleShowCursors);
  const toggleShowFrustums = usePresenceStore((state) => state.toggleShowFrustums);
  const toggleShowSelectionRings = usePresenceStore((state) => state.toggleShowSelectionRings);
  const toggleShowLockBadges = usePresenceStore((state) => state.toggleShowLockBadges);
  const toggleShowActivityTrails = usePresenceStore((state) => state.toggleShowActivityTrails);

  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"agents" | "locks" | "settings">("agents");

  const presenceList = Object.values(presences);
  const activeCount = presenceList.filter(
    (p) => p.activityState === "active" || p.activityState === "busy",
  ).length;
  const activeLocks = Object.values(selectionLocks).filter((l) => l.expiresAt > Date.now());
  const activeConflicts = conflicts.filter((c) => !c.resolved);

  const filteredPresences = presenceList.filter((presence) => {
    if (filterRole !== "all" && presence.role.toLowerCase() !== filterRole.toLowerCase()) {
      return false;
    }
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase();
      const matchName = presence.name.toLowerCase().includes(q);
      const matchId = presence.id.toLowerCase().includes(q);
      const matchRole = presence.role.toLowerCase().includes(q);
      const matchTask = presence.activeTaskId?.toLowerCase().includes(q) ?? false;
      if (!matchName && !matchId && !matchRole && !matchTask) return false;
    }
    return true;
  });

  const handleFollowToggle = useCallback(
    (agentId: string) => {
      if (followedAgentId === agentId) {
        setFollowedAgentId(null);
      } else {
        setFollowedAgentId(agentId);
      }
    },
    [followedAgentId, setFollowedAgentId],
  );

  const handleAgentSelect = useCallback(
    (agent: AgentPresence) => {
      onAgentClick?.(agent);
    },
    [onAgentClick],
  );

  const followedAgent = followedAgentId ? presences[followedAgentId] : null;

  return (
    <div
      className={`gvui-collab-hud gvui-collab-hud--${position} ${
        isCollapsed ? "is-collapsed" : ""
      } ${className}`.trim()}
      data-testid="collaborator-hud"
      role="region"
      aria-label="Collaboration HUD"
    >
      {/* Header Bar */}
      <div className="gvui-collab-hud-header">
        <div className="gvui-collab-hud-title-wrap">
          <span className="gvui-collab-hud-live-dot" />
          <span className="gvui-collab-hud-title">Collaborators</span>
          <span className="gvui-collab-hud-badge" data-testid="collaborator-count">
            {presenceList.length}
          </span>
          {activeConflicts.length > 0 && (
            <span
              className="gvui-collab-hud-conflict-pill"
              title={`${activeConflicts.length} spatial conflicts`}
              data-testid="conflict-pill"
            >
              ⚠️ {activeConflicts.length}
            </span>
          )}
        </div>

        {collapsible && (
          <button
            type="button"
            className="gvui-collab-hud-collapse-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? "Expand HUD" : "Collapse HUD"}
            data-testid="hud-collapse-btn"
          >
            {isCollapsed ? "◀" : "▼"}
          </button>
        )}
      </div>

      {/* Main Content Area */}
      {!isCollapsed && (
        <div className="gvui-collab-hud-body">
          {/* Following Active Banner */}
          {followedAgent && (
            <div className="gvui-collab-hud-following-banner" data-testid="following-banner">
              <span className="gvui-following-label">
                Following <strong>{followedAgent.name}</strong>
              </span>
              <button
                type="button"
                className="gvui-unfollow-btn"
                onClick={() => setFollowedAgentId(null)}
                data-testid="unfollow-btn"
              >
                ✕ Detach
              </button>
            </div>
          )}

          {/* Navigation Tabs */}
          <div className="gvui-collab-hud-tabs" role="tablist">
            <button
              type="button"
              className={`gvui-collab-tab ${activeTab === "agents" ? "is-active" : ""}`}
              onClick={() => setActiveTab("agents")}
              role="tab"
              aria-selected={activeTab === "agents"}
              data-testid="tab-agents"
            >
              Agents ({presenceList.length})
            </button>
            <button
              type="button"
              className={`gvui-collab-tab ${activeTab === "locks" ? "is-active" : ""}`}
              onClick={() => setActiveTab("locks")}
              role="tab"
              aria-selected={activeTab === "locks"}
              data-testid="tab-locks"
            >
              Locks ({activeLocks.length})
            </button>
            <button
              type="button"
              className={`gvui-collab-tab ${activeTab === "settings" ? "is-active" : ""}`}
              onClick={() => setActiveTab("settings")}
              role="tab"
              aria-selected={activeTab === "settings"}
              data-testid="tab-settings"
            >
              Layers
            </button>
          </div>

          {/* Tab 1: Agents */}
          {activeTab === "agents" && (
            <div className="gvui-collab-hud-agents-tab">
              {/* Search Box */}
              <div className="gvui-collab-search-wrap">
                <input
                  type="text"
                  className="gvui-collab-search-input"
                  placeholder="Filter agents by name, role, task..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Filter agents"
                  data-testid="collab-search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="gvui-collab-search-clear"
                    onClick={() => setSearchQuery("")}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Role Chips */}
              <div className="gvui-collab-role-chips" role="radiogroup" aria-label="Filter by role">
                {ROLE_FILTERS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`gvui-collab-role-chip ${filterRole === r.id ? "is-active" : ""}`}
                    onClick={() => setFilterRole(r.id)}
                    data-testid={`role-filter-${r.id}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              {/* Agent List */}
              <div className="gvui-collab-agent-list" data-testid="agent-list">
                {filteredPresences.length === 0 ? (
                  <div className="gvui-collab-empty" data-testid="no-agents-found">
                    No collaborators found
                  </div>
                ) : (
                  filteredPresences.map((presence) => (
                    <PresenceBadge
                      key={presence.id}
                      presence={presence}
                      isFollowing={followedAgentId === presence.id}
                      onFollowToggle={handleFollowToggle}
                      onClick={handleAgentSelect}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Selection Locks */}
          {activeTab === "locks" && (
            <div className="gvui-collab-hud-locks-tab" data-testid="locks-tab">
              {activeLocks.length === 0 ? (
                <div className="gvui-collab-empty" data-testid="no-locks">
                  No active selection locks
                </div>
              ) : (
                <div className="gvui-collab-lock-list">
                  {activeLocks.map((lock) => {
                    const isOwnLock = lock.agentId === selfAgentId;
                    const timeLeftSec = Math.max(
                      0,
                      Math.round((lock.expiresAt - Date.now()) / 1000),
                    );

                    return (
                      <div
                        key={lock.targetId}
                        className="gvui-collab-lock-card"
                        data-testid={`lock-card-${lock.targetId}`}
                      >
                        <div className="gvui-lock-card-header">
                          <span className="gvui-lock-icon">🔒</span>
                          <span className="gvui-lock-target">{lock.targetId}</span>
                          <span
                            className="gvui-lock-owner-pill"
                            style={{ borderColor: lock.color, color: lock.color }}
                          >
                            {lock.agentName}
                          </span>
                        </div>
                        <div className="gvui-lock-card-footer">
                          <span className="gvui-lock-timer">TTL: {timeLeftSec}s</span>
                          {isOwnLock && (
                            <button
                              type="button"
                              className="gvui-release-lock-btn"
                              onClick={() => releaseLock(lock.targetId, selfAgentId ?? undefined)}
                              data-testid={`release-lock-${lock.targetId}`}
                            >
                              Release
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Overlay Layers / Settings */}
          {activeTab === "settings" && (
            <div className="gvui-collab-hud-settings-tab" data-testid="settings-tab">
              <div className="gvui-collab-toggle-row">
                <label className="gvui-collab-toggle-label">
                  <input
                    type="checkbox"
                    checked={showCursors}
                    onChange={toggleShowCursors}
                    data-testid="toggle-cursors"
                  />
                  <span>Live Cursors</span>
                </label>
              </div>

              <div className="gvui-collab-toggle-row">
                <label className="gvui-collab-toggle-label">
                  <input
                    type="checkbox"
                    checked={showFrustums}
                    onChange={toggleShowFrustums}
                    data-testid="toggle-frustums"
                  />
                  <span>Viewport Frustums</span>
                </label>
              </div>

              <div className="gvui-collab-toggle-row">
                <label className="gvui-collab-toggle-label">
                  <input
                    type="checkbox"
                    checked={showSelectionRings}
                    onChange={toggleShowSelectionRings}
                    data-testid="toggle-selection-rings"
                  />
                  <span>Selection Rings</span>
                </label>
              </div>

              <div className="gvui-collab-toggle-row">
                <label className="gvui-collab-toggle-label">
                  <input
                    type="checkbox"
                    checked={showLockBadges}
                    onChange={toggleShowLockBadges}
                    data-testid="toggle-lock-badges"
                  />
                  <span>Lock Badges</span>
                </label>
              </div>

              <div className="gvui-collab-toggle-row">
                <label className="gvui-collab-toggle-label">
                  <input
                    type="checkbox"
                    checked={showActivityTrails}
                    onChange={toggleShowActivityTrails}
                    data-testid="toggle-activity-trails"
                  />
                  <span>Motion Trails</span>
                </label>
              </div>
            </div>
          )}

          {/* Footer stats */}
          <div className="gvui-collab-hud-footer">
            <span>
              Active: <strong>{activeCount}</strong>
            </span>
            <span>
              Locks: <strong>{activeLocks.length}</strong>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
