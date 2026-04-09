import type { CSSProperties } from "react";
import { AGENT_META, type AgentId } from "@/store/types";

const AGENT_ICON_COLORS: Record<AgentId, string> = {
  orchestrator: "#d4a73a",
  explorer: "#3b82f6",
  writer: "#22c55e",
  designer: "#ec4899",
  performer: "#f97316",
  greeter: "#14b8a6",
};

type AgentIconProps = {
  agentId: AgentId;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
};

export function getAgentIconColor(agentId: AgentId) {
  return AGENT_ICON_COLORS[agentId];
}

export function AgentIcon({
  agentId,
  size = 18,
  color,
  className,
  style,
}: AgentIconProps) {
  const avatarSrc = AGENT_META[agentId]?.avatarSrc ?? AGENT_META.orchestrator.avatarSrc;
  const resolvedAvatarSrc =
    avatarSrc.startsWith("/") &&
    typeof window !== "undefined" &&
    window.location.protocol === "file:"
      ? `.${avatarSrc}`
      : avatarSrc;

  return (
    <span
      className={["agent-icon", className].filter(Boolean).join(" ")}
      style={{
        width: size,
        height: size,
        color: color ?? getAgentIconColor(agentId),
        ...style,
      }}
      aria-hidden="true"
    >
      <img src={resolvedAvatarSrc} alt="" draggable={false} loading="lazy" decoding="async" />
    </span>
  );
}
