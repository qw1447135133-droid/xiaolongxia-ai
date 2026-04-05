import type { UiLocale } from "@/store/types";

export function randomId() {
  return Math.random().toString(36).slice(2, 10);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

export function timeAgo(ts: number, locale: UiLocale = "zh-CN"): string {
  const diff = Date.now() - ts;
  if (locale === "en") {
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;
    return `${Math.floor(diff / 86400000)} day ago`;
  }
  if (locale === "ja") {
    if (diff < 60000) return "たった今";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`;
    return `${Math.floor(diff / 86400000)}日前`;
  }
  if (locale === "zh-TW") {
    if (diff < 60000) return "剛剛";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分鐘前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小時前`;
    return `${Math.floor(diff / 86400000)}天前`;
  }
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${Math.floor(diff / 86400000)}天前`;
}

/** 微信式时间分割线：当日 HH:mm，否则 M月D日 HH:mm */
export function formatChatDividerTime(ts: number, locale: UiLocale = "zh-CN"): string {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(
    locale,
    isToday
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false },
  ).format(d);
}
