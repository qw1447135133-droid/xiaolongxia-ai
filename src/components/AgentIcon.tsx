import type { CSSProperties, ReactNode } from "react";
import type { AgentId } from "@/store/types";

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
  const icon = AGENT_ICON_PATHS[agentId] ?? AGENT_ICON_PATHS.orchestrator;

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
      <svg viewBox="0 0 24 24" fill="none">
        {icon}
      </svg>
    </span>
  );
}

const strokeProps = {
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const AGENT_ICON_PATHS: Record<AgentId, ReactNode> = {
  orchestrator: (
    <>
      <path {...strokeProps} d="M12.2 4.2c3.8 0 6.6 2.7 6.6 6.2 0 3.4-2.8 6.2-6.6 6.2-3 0-5.3-2-5.3-4.8 0-2.4 1.8-4.4 4.2-4.4 2 0 3.4 1.2 3.4 3 0 1.5-1.1 2.6-2.5 2.6-1.1 0-1.9-.8-1.9-1.8" />
      <path {...strokeProps} d="M14.8 5.2c.9.4 1.7 1 2.3 1.8M9 16.1l-2.4 2.1" />
    </>
  ),
  explorer: (
    <>
      <path {...strokeProps} d="M4.2 12.5c1.6-3.9 4.4-5.8 8.3-5.8 3.6 0 6.2 1.8 7.3 5.8-1.1 3.3-3.6 4.9-7.3 4.9-3.9 0-6.7-1.6-8.3-4.9Z" />
      <circle {...strokeProps} cx="12.3" cy="12" r="2.3" />
      <path {...strokeProps} d="M18.4 15.8 20 17.4" />
    </>
  ),
  writer: (
    <>
      <path {...strokeProps} d="M12 5.2c-2.8 0-5 2-5 4.9 0 1.1.4 2 .9 2.8l-.8 4.1 3.8-1.3c.4.1.8.1 1.1.1 2.7 0 5-2 5-4.8 0-3.1-2.2-5.8-5-5.8Z" />
      <path {...strokeProps} d="M10 10.6c.7 1.1 1.5 2 2.5 2.7M13.8 8.9c.2 1.1.1 2.1-.4 3.1" />
    </>
  ),
  designer: (
    <>
      <path {...strokeProps} d="M7.2 10.1c0-3.2 2.3-5.9 5.2-5.9s5.2 2.7 5.2 5.9c0 2.3-1.1 4.1-2.8 5.2v3.5" />
      <path {...strokeProps} d="M9.8 19.2c.5-1.8.2-3.6-.8-5.1M12.7 19.2c.4-1.7.7-3.6 0-5.4M15.6 19.2c-.2-1.9.3-3.7 1.3-5.3" />
    </>
  ),
  performer: (
    <>
      <path {...strokeProps} d="M5.2 14.3c1.4-3.8 4.4-6.1 8.3-6.2 1.6 0 3 .4 4.3 1.2-1.1 4.4-4.2 6.9-8.2 6.9-1.8 0-3.2-.6-4.4-1.9Z" />
      <path {...strokeProps} d="M9.4 14.6c1.2.1 2.3-.1 3.4-.7M15.6 9.2l2.1-2" />
    </>
  ),
  greeter: (
    <>
      <path {...strokeProps} d="M7.2 9.8c0-2.6 2.2-4.8 4.9-4.8s4.9 2.2 4.9 4.8c0 2.3-1.8 4.2-4.1 4.7l-3.1 2 .7-2.7c-1.9-.7-3.3-2.2-3.3-4Z" />
      <path {...strokeProps} d="M8.8 10.2h6.3M8.8 12.7h3.9" />
    </>
  ),
};
