"use client";

import { useMemo, useState } from "react";
import { pickLocaleText } from "@/lib/ui-locale";
import { useStore } from "@/store";
import { AGENT_SKILLS } from "@/store/types";
import type { AgentSkill, UiLocale } from "@/store/types";

type SkillCopy = AgentSkill["locales"][UiLocale];

export function SkillsCenter() {
  const locale = useStore(s => s.locale);
  const [category, setCategory] = useState<string>("all");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState<{ top: number; left: number } | null>(null);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(AGENT_SKILLS.map(skill => skill.category)))],
    [],
  );

  const filteredSkills = useMemo(
    () => AGENT_SKILLS.filter(skill => category === "all" || skill.category === category),
    [category],
  );

  const selectedSkill = useMemo(
    () => AGENT_SKILLS.find(skill => skill.id === selectedSkillId) ?? null,
    [selectedSkillId],
  );

  const clawhubCount = useMemo(() => AGENT_SKILLS.filter(skill => skill.sourceType === "clawhub").length, []);
  const localCount = useMemo(() => AGENT_SKILLS.filter(skill => skill.sourceType === "local").length, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <SkillMetric
          label={pickLocaleText(locale, { "zh-CN": "技能总数", "zh-TW": "技能總數", en: "Skill Count", ja: "スキル総数" })}
          value={AGENT_SKILLS.length}
          accent="var(--accent)"
        />
        <SkillMetric
          label={pickLocaleText(locale, { "zh-CN": "ClawHub 来源", "zh-TW": "ClawHub 來源", en: "From ClawHub", ja: "ClawHub 由来" })}
          value={clawhubCount}
          accent="#22c55e"
        />
        <SkillMetric
          label={pickLocaleText(locale, { "zh-CN": "本地创建", "zh-TW": "本地建立", en: "Locally Created", ja: "ローカル作成" })}
          value={localCount}
          accent="#8b5cf6"
        />
      </div>

      <div className="card" style={{ padding: 16, position: "relative", overflow: "visible" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {pickLocaleText(locale, { "zh-CN": "技能目录", "zh-TW": "技能目錄", en: "Skill Catalog", ja: "スキル一覧" })}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              {pickLocaleText(locale, {
                "zh-CN": "技能中心现在直接读取本地 skills 目录。AI 可以先搜索现成技能，也可以创建新技能并同步进目录。",
                "zh-TW": "技能中心現在直接讀取本地 skills 目錄。AI 可以先搜尋現成技能，也可以建立新技能並同步進目錄。",
                en: "The catalog now reads from the local skills directory. AI can search the market first, or create a new local skill and sync it back here.",
                ja: "この一覧はローカル skills ディレクトリから直接読み込みます。AI は既存 skill を探すことも、新しい local skill を作ってここへ同期することもできます。",
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {categories.map(item => (
              <button
                key={item}
                type="button"
                className="btn-ghost"
                onClick={() => setCategory(item)}
                style={{
                  borderColor: category === item ? "rgba(var(--accent-rgb), 0.36)" : "var(--border)",
                  background: category === item ? "rgba(var(--accent-rgb), 0.12)" : "transparent",
                  color: category === item ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {item === "all"
                  ? pickLocaleText(locale, { "zh-CN": "全部类别", "zh-TW": "全部類別", en: "All Categories", ja: "すべてのカテゴリ" })
                  : getSkillCategoryLabel(locale, item)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 190px))", justifyContent: "start", gap: 10, marginTop: 14 }}>
          {filteredSkills.map(skill => {
            const copy = getSkillCopy(locale, skill);
            const active = selectedSkillId === skill.id;
            return (
              <article
                key={skill.id}
                onClick={event => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const popupWidth = 400;
                  const gap = 12;
                  let left = rect.right + gap;
                  if (left + popupWidth > window.innerWidth - 16) left = rect.left - popupWidth - gap;
                  if (left < 16) left = Math.max(16, window.innerWidth - popupWidth - 16);
                  const top = Math.min(rect.top - 6, window.innerHeight - 540);
                  setSelectedSkillId(skill.id);
                  setDetailPosition({ top: Math.max(16, top), left });
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8,
                  width: 190,
                  minHeight: 126,
                  padding: "12px 14px",
                  borderRadius: 16,
                  border: `1px solid ${active ? `${skill.accent}66` : `${skill.accent}33`}`,
                  background: active
                    ? `linear-gradient(180deg, ${skill.accent}1a, rgba(255,255,255,0.96) 72%)`
                    : `linear-gradient(180deg, ${skill.accent}12, rgba(255,255,255,0.02) 60%)`,
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", width: "100%", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ width: 46, height: 46, borderRadius: 14, display: "grid", placeItems: "center", flexShrink: 0, background: "#ffffff", border: `1px solid ${skill.accent}24`, boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)" }}>
                    {renderSkillIcon(skill.icon)}
                  </div>
                  <div style={{ display: "grid", gap: 4, justifyItems: "end" }}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 700 }}>{getSkillCategoryLabel(locale, skill.category)}</div>
                    <div style={{ ...badgeStyle(skill.accent, "var(--text)"), padding: "2px 7px", fontSize: 9 }}>
                      {getSourceLabel(locale, skill)}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>{copy.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{copy.short}</div>
              </article>
            );
          })}
        </div>

        {selectedSkill && detailPosition ? (
          <>
            <div
              onClick={() => {
                setSelectedSkillId(null);
                setDetailPosition(null);
              }}
              style={{ position: "fixed", inset: 0, background: "transparent", zIndex: 1090 }}
            />
            <div
              className="card"
              onClick={event => event.stopPropagation()}
              style={{
                position: "fixed",
                top: detailPosition.top,
                left: detailPosition.left,
                width: 400,
                maxHeight: "min(540px, calc(100vh - 32px))",
                overflowY: "auto",
                padding: 18,
                borderRadius: 22,
                border: `1px solid ${selectedSkill.accent}3d`,
                background: "#ffffff",
                boxShadow: "0 16px 38px rgba(15, 23, 42, 0.12)",
                zIndex: 1100,
              }}
            >
              <SkillDetailDialog locale={locale} skill={selectedSkill} />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function SkillMetric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: accent }}>{value}</div>
    </div>
  );
}

function SkillDetailDialog({ locale, skill }: { locale: UiLocale; skill: AgentSkill }) {
  const copy = getSkillCopy(locale, skill);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, display: "grid", placeItems: "center", background: "#ffffff", border: `1px solid ${skill.accent}2a`, boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)", flexShrink: 0 }}>
            {renderSkillIcon(skill.icon, 34)}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={badgeStyle(skill.accent, "var(--text)")}>{getSkillCategoryLabel(locale, skill.category)}</span>
              <span style={badgeStyle("var(--accent)", "var(--accent)")}>{getSourceLabel(locale, skill)}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", lineHeight: 1.25 }}>{copy.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{copy.short}</div>
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, padding: "14px 16px", borderRadius: 18, border: "1px solid rgba(148, 163, 184, 0.18)", background: "#ffffff" }}>
        {copy.description}
      </div>

      {skill.tags.length > 0 ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {skill.tags.map(tag => (
            <span key={tag} style={badgeStyle(skill.accent, "var(--text-muted)")}>
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      <DetailBlock title={pickLocaleText(locale, { "zh-CN": "调度方式", "zh-TW": "調度方式", en: "Routing Logic", ja: "ルーティング方式" })} value={copy.dispatch} />
      <DetailBlock title={pickLocaleText(locale, { "zh-CN": "常见任务", "zh-TW": "常見任務", en: "Typical Tasks", ja: "代表タスク" })} value={copy.typicalTasks} />
      <DetailBlock title={pickLocaleText(locale, { "zh-CN": "主要产出", "zh-TW": "主要產出", en: "Outputs", ja: "主な出力" })} value={copy.outputs} />
    </div>
  );
}

function DetailBlock({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 8, padding: "14px 16px", borderRadius: 18, border: "1px solid rgba(148, 163, 184, 0.18)", background: "#ffffff" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>{value}</div>
    </div>
  );
}

function getSkillCopy(locale: UiLocale, skill: AgentSkill): SkillCopy {
  return skill.locales[locale] ?? skill.locales["zh-CN"];
}

function getSkillCategoryLabel(locale: UiLocale, category: string) {
  switch (category) {
    case "automation":
      return pickLocaleText(locale, { "zh-CN": "自动化", "zh-TW": "自動化", en: "Automation", ja: "自動化" });
    case "content":
      return pickLocaleText(locale, { "zh-CN": "内容运营", "zh-TW": "內容營運", en: "Content Ops", ja: "コンテンツ運用" });
    case "documents":
      return pickLocaleText(locale, { "zh-CN": "文档", "zh-TW": "文件", en: "Documents", ja: "ドキュメント" });
    case "visual":
      return pickLocaleText(locale, { "zh-CN": "图像", "zh-TW": "圖像", en: "Visual", ja: "ビジュアル" });
    case "ops":
      return pickLocaleText(locale, { "zh-CN": "技能运维", "zh-TW": "技能維運", en: "Skill Ops", ja: "スキル運用" });
    case "governance":
      return pickLocaleText(locale, { "zh-CN": "治理", "zh-TW": "治理", en: "Governance", ja: "ガバナンス" });
    case "integration":
      return pickLocaleText(locale, { "zh-CN": "集成", "zh-TW": "整合", en: "Integrations", ja: "連携" });
    case "research":
      return pickLocaleText(locale, { "zh-CN": "调研", "zh-TW": "調研", en: "Research", ja: "調査" });
    case "channels":
      return pickLocaleText(locale, { "zh-CN": "渠道客服", "zh-TW": "渠道客服", en: "Channel Support", ja: "チャネル客服" });
    case "service":
      return pickLocaleText(locale, { "zh-CN": "服务处置", "zh-TW": "服務處置", en: "Service Ops", ja: "サービス対応" });
    case "sales":
      return pickLocaleText(locale, { "zh-CN": "销售", "zh-TW": "銷售", en: "Sales", ja: "営業" });
    default:
      return category;
  }
}

function getSourceLabel(locale: UiLocale, skill: AgentSkill) {
  if (skill.sourceType === "clawhub") {
    return pickLocaleText(locale, { "zh-CN": "ClawHub", "zh-TW": "ClawHub", en: "ClawHub", ja: "ClawHub" });
  }
  if (skill.sourceType === "local") {
    return pickLocaleText(locale, { "zh-CN": "本地", "zh-TW": "本地", en: "Local", ja: "ローカル" });
  }
  return pickLocaleText(locale, { "zh-CN": "内建", "zh-TW": "內建", en: "Built-in", ja: "内蔵" });
}

function badgeStyle(color: string, textColor = "var(--text)") {
  return {
    padding: "3px 8px",
    borderRadius: 999,
    border: `1px solid ${color}33`,
    background: `${color}1f`,
    color: textColor,
    fontSize: 10,
    fontWeight: 700,
  };
}

function renderSkillIcon(icon: string, size = 30) {
  switch (icon) {
    case "layout":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><rect x="5" y="7" width="26" height="22" rx="6" fill="#e0f2fe" stroke="#38bdf8" strokeWidth="1.8" /><path d="M12 14h12M12 19h8M12 24h10" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "doc":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><rect x="7" y="5" width="20" height="26" rx="5" fill="#ffe4e6" stroke="#fb7185" strokeWidth="1.8" /><path d="M11 12h12M11 17h12M11 22h8" stroke="#be123c" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "slides":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><rect x="6" y="8" width="24" height="16" rx="4" fill="#ffedd5" stroke="#f97316" strokeWidth="1.8" /><path d="M18 24v5M13 29h10M11 13h14M11 17h8" stroke="#c2410c" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "sheet":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><rect x="6" y="6" width="24" height="24" rx="5" fill="#dcfce7" stroke="#22c55e" strokeWidth="1.8" /><path d="M12 12h12M12 18h12M12 24h12M18 12v12M24 12v12" stroke="#15803d" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "camera":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><rect x="5" y="8" width="26" height="20" rx="6" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="1.8" /><circle cx="18" cy="18" r="5.2" fill="none" stroke="#6d28d9" strokeWidth="2" /><path d="M12 8.5 14 6h8l2 2.5" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "image":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><rect x="6" y="7" width="24" height="22" rx="5" fill="#ccfbf1" stroke="#14b8a6" strokeWidth="1.8" /><path d="m12 23 4.2-4.2 3.3 3.3 4.8-6.1 3.2 4.1" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="m25.5 10.2 1.9 1.9" stroke="#14b8a6" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "search":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><circle cx="16" cy="16" r="8" fill="#dbeafe" stroke="#3b82f6" strokeWidth="2" /><path d="m22 22 6 6" stroke="#1d4ed8" strokeWidth="2.5" strokeLinecap="round" /></svg>;
    case "wand":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><path d="M12 24 24 12" stroke="#7c3aed" strokeWidth="3" strokeLinecap="round" /><path d="M23 8v4M21 10h4M11 25l-2 2M25 11l2-2" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "graph":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><circle cx="10" cy="10" r="3" fill="#0ea5e9" /><circle cx="26" cy="10" r="3" fill="#38bdf8" /><circle cx="18" cy="25" r="3" fill="#0284c7" /><path d="M13 10h10M11.8 12.5l4.3 9M24.2 12.5l-4.3 9" stroke="#0369a1" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "plug":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><path d="M14 8v7M22 8v7M13 15h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5z" fill="#dcfce7" stroke="#16a34a" strokeWidth="2" strokeLinejoin="round" /><path d="M18 24v5" stroke="#15803d" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "browser":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><rect x="5" y="7" width="26" height="22" rx="5" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.8" /><path d="M5 13h26" stroke="#d97706" strokeWidth="2" /><circle cx="10" cy="10" r="1.2" fill="#d97706" /><circle cx="14" cy="10" r="1.2" fill="#d97706" /></svg>;
    case "compass":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="11" fill="#cffafe" stroke="#06b6d4" strokeWidth="1.8" /><path d="m14 22 3.2-8.2L25 11l-3.2 8.2z" fill="#0891b2" stroke="#0e7490" strokeWidth="1.2" /></svg>;
    case "spark":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><path d="M18 6 20.6 14 29 16.6 20.6 19.2 18 27.6 15.4 19.2 7 16.6 15.4 14z" fill="#fbcfe8" stroke="#ec4899" strokeWidth="1.8" /></svg>;
    case "trend":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><path d="M8 24h20" stroke="#10b981" strokeWidth="2" strokeLinecap="round" /><path d="m10 21 5-6 4 3 7-8" fill="none" stroke="#047857" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /><path d="M26 10h3v3" stroke="#047857" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "chat":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><path d="M9 10h18a4 4 0 0 1 4 4v7a4 4 0 0 1-4 4H17l-6 4v-4H9a4 4 0 0 1-4-4v-7a4 4 0 0 1 4-4Z" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.8" strokeLinejoin="round" /><path d="M12 16h12M12 20h8" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "handshake":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><path d="M10 12h7l2 2 2-2h5l4 5-4 4-3-2-3 3-4-4-3 2-4-4z" fill="#ffedd5" stroke="#ea580c" strokeWidth="1.8" strokeLinejoin="round" /><path d="m14 19 3 3M19 18l2 2" stroke="#c2410c" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "calendar":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><rect x="6" y="8" width="24" height="22" rx="5" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="1.8" /><path d="M11 5v6M25 5v6M6 14h24" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" /><path d="M12 19h4M20 19h4M12 24h4" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "megaphone":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><path d="M8 19v-4l12-5v14L8 19Z" fill="#fce7f3" stroke="#ec4899" strokeWidth="1.8" strokeLinejoin="round" /><path d="M20 13h4.2a3.8 3.8 0 0 1 0 7.6H20" stroke="#db2777" strokeWidth="2" strokeLinecap="round" /><path d="m11 20 2 5" stroke="#db2777" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "shield":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><path d="M18 5.5 28 9v7.8c0 6.2-4.2 10.2-10 13.7-5.8-3.5-10-7.5-10-13.7V9l10-3.5Z" fill="#fee2e2" stroke="#ef4444" strokeWidth="1.8" /><path d="m13.5 18 3 3 6-6" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "desktop":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><rect x="5.5" y="7" width="25" height="17" rx="4" fill="#e0f2fe" stroke="#0ea5e9" strokeWidth="1.8" /><path d="M14 29h8M18 24v5" stroke="#0284c7" strokeWidth="2" strokeLinecap="round" /><path d="m12 18 3-3 2.4 2.4 4.6-5.4" stroke="#0369a1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "app-window":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><rect x="5" y="7" width="26" height="22" rx="5" fill="#ccfbf1" stroke="#14b8a6" strokeWidth="1.8" /><path d="M5 13h26" stroke="#0f766e" strokeWidth="2" /><circle cx="10" cy="10" r="1.2" fill="#0f766e" /><circle cx="14" cy="10" r="1.2" fill="#0f766e" /><path d="M11 18h14M11 22h9" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "book":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><path d="M10 7h13a4 4 0 0 1 4 4v16H13a3 3 0 0 0-3 3V7Z" fill="#dcfce7" stroke="#22c55e" strokeWidth="1.8" strokeLinejoin="round" /><path d="M10 7h13a4 4 0 0 1 4 4v2H13a3 3 0 0 0-3 3V7Z" fill="#bbf7d0" stroke="#16a34a" strokeWidth="1.2" strokeLinejoin="round" /><path d="M14 16h8M14 20h8" stroke="#15803d" strokeWidth="2" strokeLinecap="round" /></svg>;
    case "refresh":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><path d="M27 13a10 10 0 1 0 1.4 9.6" fill="none" stroke="#6366f1" strokeWidth="2.2" strokeLinecap="round" /><path d="M27 8v7h-7" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "radar":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="11" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.8" /><circle cx="18" cy="18" r="7" fill="none" stroke="#fbbf24" strokeWidth="1.4" /><path d="M18 18 25.5 10.5" stroke="#d97706" strokeWidth="2.4" strokeLinecap="round" /><circle cx="25.5" cy="10.5" r="2" fill="#f59e0b" /></svg>;
    case "headset":
      return <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true"><path d="M10 19a8 8 0 1 1 16 0" fill="none" stroke="#2563eb" strokeWidth="2.2" /><rect x="7" y="18" width="5" height="9" rx="2.5" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.8" /><rect x="24" y="18" width="5" height="9" rx="2.5" fill="#dbeafe" stroke="#2563eb" strokeWidth="1.8" /><path d="M24 27c0 2-1.8 3.5-4 3.5h-3" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round" /></svg>;
    default:
      return (
        <div style={{ width: size, height: size, borderRadius: size * 0.28, display: "grid", placeItems: "center", background: "#0f172a", color: "#ffffff", fontSize: Math.max(12, Math.round(size * 0.34)), fontWeight: 800 }}>
          {String(icon).slice(0, 2).toUpperCase()}
        </div>
      );
  }
}
