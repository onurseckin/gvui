import type { FC } from "react";
import { memo, useMemo } from "react";
import {
  IconAlertTriangle,
  IconCpu,
  IconServer,
  IconShieldCheck,
  IconUser,
} from "@tabler/icons-react";
import type { AnnotationAuthor, AnnotationAuthorRole } from "./types";

export interface AuthorBadgeProps {
  author: AnnotationAuthor;
  createdAt?: string;
  updatedAt?: string;
  showTime?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function describeAuthorRole(role: AnnotationAuthorRole) {
  switch (role) {
    case "human":
      return {
        label: "Human",
        accent: "#6366f1",
        bg: "rgba(99, 102, 241, 0.15)",
        border: "rgba(99, 102, 241, 0.35)",
        Icon: IconUser,
      };
    case "validator":
      return {
        label: "Validator",
        accent: "#10b981",
        bg: "rgba(16, 185, 129, 0.15)",
        border: "rgba(16, 185, 129, 0.35)",
        Icon: IconShieldCheck,
      };
    case "agent":
      return {
        label: "Agent",
        accent: "#a855f7",
        bg: "rgba(168, 85, 247, 0.15)",
        border: "rgba(168, 85, 247, 0.35)",
        Icon: IconCpu,
      };
    case "critic":
      return {
        label: "Critic",
        accent: "#f59e0b",
        bg: "rgba(245, 158, 11, 0.15)",
        border: "rgba(245, 158, 11, 0.35)",
        Icon: IconAlertTriangle,
      };
    case "system":
    default:
      return {
        label: "System",
        accent: "#64748b",
        bg: "rgba(100, 116, 139, 0.15)",
        border: "rgba(100, 116, 139, 0.35)",
        Icon: IconServer,
      };
  }
}

export function formatAnnotationTime(isoString?: string): string {
  if (!isoString) return "";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const now = Date.now();
    const diffSeconds = Math.floor((now - date.getTime()) / 1000);

    if (diffSeconds < 60) return "just now";
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
    if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
    if (diffSeconds < 604800) return `${Math.floor(diffSeconds / 86400)}d ago`;

    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

export const AuthorBadge: FC<AuthorBadgeProps> = memo(function AuthorBadge({
  author,
  createdAt,
  updatedAt,
  showTime = true,
  size = "md",
  className = "",
}) {
  const roleInfo = useMemo(() => describeAuthorRole(author.role), [author.role]);
  const formattedTime = useMemo(
    () => formatAnnotationTime(updatedAt || createdAt),
    [updatedAt, createdAt],
  );
  const RoleIcon = roleInfo.Icon;

  return (
    <div className={`annotation-author-badge size-${size} role-${author.role} ${className}`}>
      <span
        className="author-role-pill"
        style={{
          color: roleInfo.accent,
          backgroundColor: roleInfo.bg,
          borderColor: roleInfo.border,
        }}
      >
        <RoleIcon size={size === "sm" ? 11 : 13} />
        <span className="author-role-name">{author.name || roleInfo.label}</span>
        <span className="author-role-tag">{roleInfo.label}</span>
      </span>
      {showTime && formattedTime && (
        <span className="author-timestamp" title={createdAt || updatedAt}>
          {formattedTime}
        </span>
      )}
    </div>
  );
});

AuthorBadge.displayName = "AuthorBadge";
