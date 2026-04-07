import type { AppTab, ControlCenterSectionId } from "@/store/types";

export type DesktopLaunchNavigationTarget =
  | { tab: "tasks"; label: string }
  | { tab: "settings"; section: ControlCenterSectionId; label: string };

function normalizeProgramIdentity(target: string) {
  const normalized = target.trim().toLowerCase().replace(/^"+|"+$/g, "");
  if (!normalized) return [];
  const slashNormalized = normalized.replace(/\//g, "\\");
  const parts = slashNormalized.split("\\").filter(Boolean);
  const base = parts[parts.length - 1] ?? slashNormalized;
  const stem = base.endsWith(".exe") ? base.slice(0, -4) : base;
  return Array.from(new Set([slashNormalized, base, stem]));
}

export function inferDesktopLaunchNavigationTarget(target: string): DesktopLaunchNavigationTarget | null {
  const identities = normalizeProgramIdentity(target);
  if (identities.length === 0) return null;

  const hasIdentity = (...keywords: string[]) =>
    keywords.some(keyword => identities.some(identity => identity.includes(keyword)));

  if (hasIdentity("wechat", "weixin", "微信", "feishu", "lark", "飞书", "dingtalk", "钉钉", "wecom", "wxwork", "企业微信", "slack", "telegram", "line")) {
    return {
      tab: "settings",
      section: "channels",
      label: "渠道会话",
    };
  }

  if (hasIdentity("code", "vscode", "visual studio code", "cursor", "windsurf", "trae")) {
    return {
      tab: "tasks",
      label: "聊天",
    };
  }

  if (hasIdentity("chrome", "edge", "msedge", "firefox", "browser")) {
    return {
      tab: "tasks",
      label: "聊天",
    };
  }

  if (hasIdentity("explorer", "资源管理器", "finder", "files")) {
    return {
      tab: "tasks",
      label: "聊天",
    };
  }

  return null;
}

export function applyDesktopLaunchNavigation(
  target: string,
  actions: {
    setTab: (tab: AppTab) => void;
    setActiveControlCenterSection: (section: ControlCenterSectionId) => void;
  },
) {
  const destination = inferDesktopLaunchNavigationTarget(target);
  if (!destination) return null;

  if (destination.tab === "settings") {
    actions.setActiveControlCenterSection(destination.section);
    actions.setTab("settings");
    return destination;
  }

  actions.setTab(destination.tab);
  return destination;
}
