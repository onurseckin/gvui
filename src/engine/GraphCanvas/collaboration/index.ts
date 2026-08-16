export * from "./types";
export * from "./conflictManager";
export * from "./CursorItem";
export * from "./PresenceBadge";
export * from "./CollaboratorHUD";
export * from "./CollaborationOverlay";
export {
  usePresenceStore,
  getRoleColor,
  getRolePriority,
  inferPresenceRole,
  ROLE_COLORS,
  ROLE_PRIORITIES,
  INITIAL_PRESENCE_STATE,
} from "../../../store/usePresenceStore";
export type {
  PresenceState,
  PresenceActions,
  PresenceStore,
} from "../../../store/usePresenceStore";
