"use client";

import { useMemo, useState } from "react";
import { resolveBackendUrl } from "@/lib/backend-url";
import { sendWs } from "@/hooks/useWebSocket";
import { syncRuntimeSettings } from "@/lib/runtime-settings-sync";
import { pickLocaleText } from "@/lib/ui-locale";
import { useStore } from "@/store";
import { AGENT_META, AGENT_SKILLS } from "@/store/types";
import type { AgentConfig, AgentId, AgentSkillId, UiLocale } from "@/store/types";

const SKILL_RECOMMENDATIONS: Record<AgentSkillId, AgentId[]> = {
  frontend: ["designer", "orchestrator"],
  doc_word: ["writer", "greeter"],
  doc_ppt: ["writer", "performer"],
  doc_excel: ["explorer", "orchestrator"],
  screenshot: ["explorer", "designer"],
  image_edit: ["designer", "performer"],
};

const SKILL_PLAYBOOKS: Array<{
  id: string;
  accent: string;
  assignments: Array<{ agentId: AgentId; skillIds: AgentSkillId[] }>;
}> = [
  {
    id: "commerce-launch",
    accent: "#7dd3fc",
    assignments: [
      { agentId: "designer", skillIds: ["frontend", "image_edit", "screenshot"] },
      { agentId: "orchestrator", skillIds: ["frontend"] },
    ],
  },
  {
    id: "content-factory",
    accent: "#fda4af",
    assignments: [
      { agentId: "writer", skillIds: ["doc_word", "doc_ppt"] },
      { agentId: "greeter", skillIds: ["doc_word"] },
      { agentId: "performer", skillIds: ["doc_ppt"] },
    ],
  },
  {
    id: "research-ops",
    accent: "#86efac",
    assignments: [
      { agentId: "explorer", skillIds: ["doc_excel", "screenshot"] },
      { agentId: "orchestrator", skillIds: ["doc_excel"] },
    ],
  },
];

function getPlaybookCopy(playbookId: string, locale: UiLocale) {
  switch (playbookId) {
    case "commerce-launch":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "上新组合",
          "zh-TW": "上新組合",
          en: "Launch Pack",
          ja: "ローンチパック",
        }),
        copy: pickLocaleText(locale, {
          "zh-CN": "给商品页上线准备前端、图片修改和截图留档能力。",
          "zh-TW": "為商品頁上線準備前端、圖片修改與截圖留檔能力。",
          en: "Frontend, image editing, and screenshots for product-page shipping.",
          ja: "商品ページ公開向けのフロント、画像編集、スクリーンショット構成です。",
        }),
      };
    case "content-factory":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "内容组合",
          "zh-TW": "內容組合",
          en: "Content Pack",
          ja: "コンテンツパック",
        }),
        copy: pickLocaleText(locale, {
          "zh-CN": "给文案、报告和面向客户材料准备文档与演示能力。",
          "zh-TW": "為文案、報告與面向客戶材料準備文件與簡報能力。",
          en: "Docs and deck skills for copy, reports, and buyer-facing materials.",
          ja: "コピー、レポート、対外資料向けのドキュメントとスライド構成です。",
        }),
      };
    case "research-ops":
      return {
        title: pickLocaleText(locale, {
          "zh-CN": "研究组合",
          "zh-TW": "研究組合",
          en: "Research Pack",
          ja: "リサーチパック",
        }),
        copy: pickLocaleText(locale, {
          "zh-CN": "把表格分析与截图采集组合起来，适合研究与运营执行。",
          "zh-TW": "把試算表分析與截圖採集組合起來，適合研究與營運執行。",
          en: "Spreadsheet analysis plus capture workflow for research and ops.",
          ja: "調査と運用向けに表計算分析とキャプチャ作業をまとめた構成です。",
        }),
      };
    default:
      return { title: playbookId, copy: playbookId };
  }
}

function getSkillName(skillId: AgentSkillId, locale: UiLocale) {
  switch (skillId) {
    case "frontend":
      return pickLocaleText(locale, { "zh-CN": "前端开发", "zh-TW": "前端開發", en: "Frontend", ja: "フロントエンド" });
    case "doc_word":
      return pickLocaleText(locale, { "zh-CN": "Word 文档", "zh-TW": "Word 文件", en: "Word Docs", ja: "Word 文書" });
    case "doc_ppt":
      return pickLocaleText(locale, { "zh-CN": "PPT 演示", "zh-TW": "PPT 簡報", en: "Slide Decks", ja: "スライド作成" });
    case "doc_excel":
      return pickLocaleText(locale, { "zh-CN": "Excel 表格", "zh-TW": "Excel 表格", en: "Spreadsheets", ja: "表計算" });
    case "screenshot":
      return pickLocaleText(locale, { "zh-CN": "截图处理", "zh-TW": "截圖處理", en: "Screenshots", ja: "スクリーンショット" });
    case "image_edit":
      return pickLocaleText(locale, { "zh-CN": "图片修改", "zh-TW": "圖片修改", en: "Image Editing", ja: "画像編集" });
    default:
      return skillId;
  }
}

function getSkillDescription(skillId: AgentSkillId, locale: UiLocale) {
  switch (skillId) {
    case "frontend":
      return pickLocaleText(locale, {
        "zh-CN": "构建页面、组件、交互和样式改造。",
        "zh-TW": "建置頁面、元件、互動與樣式調整。",
        en: "Build pages, components, interactions, and styling refinements.",
        ja: "画面、コンポーネント、操作体験、スタイル調整を担当します。",
      });
    case "doc_word":
      return pickLocaleText(locale, {
        "zh-CN": "编写和整理 Word 文档、方案、报告。",
        "zh-TW": "編寫與整理 Word 文件、方案與報告。",
        en: "Draft and organize Word documents, plans, and reports.",
        ja: "Word 文書、提案書、レポートの作成と整理に対応します。",
      });
    case "doc_ppt":
      return pickLocaleText(locale, {
        "zh-CN": "编写和生成汇报、方案、路演幻灯片。",
        "zh-TW": "編寫與產出匯報、方案與簡報投影片。",
        en: "Create presentations, proposals, and pitch decks.",
        ja: "報告資料、提案資料、ピッチ用スライドを作成します。",
      });
    case "doc_excel":
      return pickLocaleText(locale, {
        "zh-CN": "整理表格、数据台账、公式与统计内容。",
        "zh-TW": "整理表格、資料台帳、公式與統計內容。",
        en: "Organize spreadsheets, ledgers, formulas, and analysis.",
        ja: "表計算、台帳、数式、集計作業を整理します。",
      });
    case "screenshot":
      return pickLocaleText(locale, {
        "zh-CN": "截取界面、保存关键画面并辅助问题说明。",
        "zh-TW": "截取畫面、保存關鍵畫面並輔助問題說明。",
        en: "Capture interfaces and preserve key visuals for explanation.",
        ja: "画面キャプチャを保存し、状況説明を支援します。",
      });
    case "image_edit":
      return pickLocaleText(locale, {
        "zh-CN": "裁剪、标注、替换和优化现有图片素材。",
        "zh-TW": "裁切、標註、替換與優化現有圖片素材。",
        en: "Crop, annotate, replace, and refine existing image assets.",
        ja: "既存画像の切り抜き、注釈、差し替え、最適化を行います。",
      });
    default:
      return skillId;
  }
}

function getSkillCategoryLabel(category: string, locale: UiLocale) {
  switch (category) {
    case "基础技能":
      return pickLocaleText(locale, { "zh-CN": "基础技能", "zh-TW": "基礎技能", en: "Core Skills", ja: "基本スキル" });
    case "文档编写":
      return pickLocaleText(locale, { "zh-CN": "文档编写", "zh-TW": "文件撰寫", en: "Documents", ja: "ドキュメント" });
    case "图像处理":
      return pickLocaleText(locale, { "zh-CN": "图像处理", "zh-TW": "圖像處理", en: "Image Tools", ja: "画像処理" });
    case "all":
      return pickLocaleText(locale, { "zh-CN": "全部", "zh-TW": "全部", en: "All", ja: "すべて" });
    default:
      return category;
  }
}

export function SkillsCenter() {
  const { agentConfigs, updateAgentConfig } = useStore();
  const locale = useStore(s => s.locale);
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(AGENT_SKILLS.map(skill => skill.category)))],
    [],
  );

  const filteredSkills = useMemo(
    () => AGENT_SKILLS.filter(skill => activeCategory === "all" || skill.category === activeCategory),
    [activeCategory],
  );

  const skillCoverage = useMemo(
    () =>
      Object.fromEntries(
        AGENT_SKILLS.map(skill => [
          skill.id,
          (Object.keys(AGENT_META) as AgentId[]).filter(agentId => agentConfigs[agentId].skills.includes(skill.id)).length,
        ]),
      ) as Record<AgentSkillId, number>,
    [agentConfigs],
  );

  const enabledAssignments = useMemo(
    () =>
      (Object.keys(AGENT_META) as AgentId[]).reduce(
        (total, agentId) => total + agentConfigs[agentId].skills.length,
        0,
      ),
    [agentConfigs],
  );

  const agentsWithoutSkills = useMemo(
    () => (Object.keys(AGENT_META) as AgentId[]).filter(agentId => agentConfigs[agentId].skills.length === 0),
    [agentConfigs],
  );

  const mostUsedSkill = useMemo(
    () =>
      [...AGENT_SKILLS].sort(
        (left, right) => (skillCoverage[right.id] ?? 0) - (skillCoverage[left.id] ?? 0),
      )[0] ?? null,
    [skillCoverage],
  );

  const playbooks = useMemo(
    () => SKILL_PLAYBOOKS.map(playbook => ({ ...playbook, ...getPlaybookCopy(playbook.id, locale) })),
    [locale],
  );

  const toggleSkill = async (agentId: AgentId, skillId: AgentSkillId) => {
    const config = agentConfigs[agentId];
    const nextSkills = config.skills.includes(skillId)
      ? config.skills.filter(id => id !== skillId)
      : [...config.skills, skillId];
    updateAgentConfig(agentId, { skills: nextSkills });
    await syncSettings();
  };

  const applyRecommended = async (skillId: AgentSkillId) => {
    for (const agentId of SKILL_RECOMMENDATIONS[skillId]) {
      const config = useStore.getState().agentConfigs[agentId];
      if (config.skills.includes(skillId)) continue;
      useStore.getState().updateAgentConfig(agentId, { skills: [...config.skills, skillId] });
    }
    await syncSettings();
  };

  const applyPlaybook = async (playbookId: string) => {
    const playbook = SKILL_PLAYBOOKS.find(item => item.id === playbookId);
    if (!playbook) return;

    for (const assignment of playbook.assignments) {
      const config = useStore.getState().agentConfigs[assignment.agentId];
      const mergedSkills = Array.from(new Set([...config.skills, ...assignment.skillIds]));
      useStore.getState().updateAgentConfig(assignment.agentId, { skills: mergedSkills });
    }

    await syncSettings();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 18,
          background: "linear-gradient(135deg, rgba(125, 211, 252, 0.16), rgba(255,255,255,0.02))",
          borderColor: "rgba(125, 211, 252, 0.24)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          {pickLocaleText(locale, { "zh-CN": "技能中心", "zh-TW": "技能中心", en: "Skills Center", ja: "スキルセンター" })}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>
          {pickLocaleText(locale, {
            "zh-CN": "跨 Agent 能力看板",
            "zh-TW": "跨 Agent 能力看板",
            en: "Cross-agent capability board",
            ja: "複数 Agent の能力ボード",
          })}
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, marginTop: 8 }}>
          {pickLocaleText(locale, {
            "zh-CN": "在这里查看技能覆盖、应用推荐组合，并在不逐个打开 Agent 卡片的情况下重新平衡能力分配。",
            "zh-TW": "在這裡查看技能覆蓋、套用推薦組合，並在不逐一打開 Agent 卡片的情況下重新平衡能力分配。",
            en: "Use this page to see coverage, apply suggested layouts, and rebalance agent capability without opening every agent card.",
            ja: "このページでスキルのカバー状況を確認し、推奨構成を適用しながら各 Agent の能力配分をまとめて調整できます。",
          })}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <MetricCard label={pickLocaleText(locale, { "zh-CN": "技能类型", "zh-TW": "技能類型", en: "Skill Types", ja: "スキル種類" })} value={AGENT_SKILLS.length} accent="var(--accent)" />
        <MetricCard label={pickLocaleText(locale, { "zh-CN": "已分配", "zh-TW": "已分配", en: "Assignments", ja: "割当数" })} value={enabledAssignments} accent="#7dd3fc" />
        <MetricCard label={pickLocaleText(locale, { "zh-CN": "已就绪 Agent", "zh-TW": "已就緒 Agent", en: "Agents Ready", ja: "準備完了 Agent" })} value={Object.keys(AGENT_META).length - agentsWithoutSkills.length} accent="var(--success)" />
        <MetricCard label={pickLocaleText(locale, { "zh-CN": "待配置", "zh-TW": "待配置", en: "Needs Setup", ja: "要設定" })} value={agentsWithoutSkills.length} accent="var(--warning)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(280px, 0.9fr)", gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {pickLocaleText(locale, { "zh-CN": "组合模板", "zh-TW": "組合模板", en: "Playbooks", ja: "構成テンプレート" })}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {pickLocaleText(locale, {
                  "zh-CN": "常见协作模式的一键组合。",
                  "zh-TW": "常見協作模式的一鍵組合。",
                  en: "One-click layouts for common collaboration modes.",
                  ja: "よく使う協業モード向けのワンクリック構成です。",
                })}
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {playbooks.map(playbook => (
              <article
                key={playbook.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  minHeight: 180,
                  padding: 14,
                  borderRadius: 18,
                  border: `1px solid ${playbook.accent}33`,
                  background: `linear-gradient(180deg, ${playbook.accent}1f, rgba(255,255,255,0.02) 55%)`,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>{playbook.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>{playbook.copy}</div>
                <div style={{ display: "grid", gap: 6, marginTop: "auto" }}>
                  {playbook.assignments.map(assignment => (
                    <div key={`${playbook.id}-${assignment.agentId}`} style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      <strong style={{ color: "var(--text)" }}>{AGENT_META[assignment.agentId].name}</strong>
                      {` · ${assignment.skillIds.length} ${pickLocaleText(locale, { "zh-CN": "项技能", "zh-TW": "項技能", en: "skills", ja: "スキル" })}`}
                    </div>
                  ))}
                </div>
                <button type="button" className="btn-ghost" onClick={() => void applyPlaybook(playbook.id)}>
                  {pickLocaleText(locale, { "zh-CN": "应用组合", "zh-TW": "套用組合", en: "Apply Pack", ja: "構成を適用" })}
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{pickLocaleText(locale, { "zh-CN": "覆盖备注", "zh-TW": "覆蓋備註", en: "Coverage Notes", ja: "カバー状況メモ" })}</div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <div style={noteBlockStyle}>
              <span style={noteLabelStyle}>{pickLocaleText(locale, { "zh-CN": "最常用技能", "zh-TW": "最常用技能", en: "Most Used Skill", ja: "最多使用スキル" })}</span>
              <strong>{mostUsedSkill ? `${getSkillName(mostUsedSkill.id, locale)} · ${skillCoverage[mostUsedSkill.id]} ${pickLocaleText(locale, { "zh-CN": "个 Agent", "zh-TW": "個 Agent", en: "agents", ja: "Agent" })}` : pickLocaleText(locale, { "zh-CN": "无", "zh-TW": "無", en: "None", ja: "なし" })}</strong>
            </div>
            <div style={noteBlockStyle}>
              <span style={noteLabelStyle}>{pickLocaleText(locale, { "zh-CN": "缺少技能的 Agent", "zh-TW": "缺少技能的 Agent", en: "Agents Missing Skills", ja: "未設定 Agent" })}</span>
              <strong>{agentsWithoutSkills.length > 0 ? agentsWithoutSkills.map(agentId => AGENT_META[agentId].name).join(", ") : pickLocaleText(locale, { "zh-CN": "所有 Agent 都至少配置了一项技能", "zh-TW": "所有 Agent 都至少配置了一項技能", en: "All agents have at least one skill", ja: "すべての Agent に最低 1 つのスキルがあります" })}</strong>
            </div>
            <div style={noteBlockStyle}>
              <span style={noteLabelStyle}>{pickLocaleText(locale, { "zh-CN": "分类结构", "zh-TW": "分類結構", en: "Category Mix", ja: "カテゴリ構成" })}</span>
              <strong>{Array.from(new Set(AGENT_SKILLS.map(skill => skill.category))).map(category => getSkillCategoryLabel(category, locale)).join(" · ")}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{pickLocaleText(locale, { "zh-CN": "技能库", "zh-TW": "技能庫", en: "Skill Library", ja: "スキルライブラリ" })}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              {pickLocaleText(locale, {
                "zh-CN": "在团队范围内切换技能，并应用推荐分配。",
                "zh-TW": "在團隊範圍內切換技能，並套用推薦分配。",
                en: "Toggle skills across the team and apply recommended placements.",
                ja: "チーム全体でスキルを切り替え、推奨配置をまとめて適用できます。",
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {categories.map(category => (
              <button
                key={category}
                type="button"
                className="btn-ghost"
                onClick={() => setActiveCategory(category)}
                style={{
                  borderColor: activeCategory === category ? "rgba(var(--accent-rgb), 0.36)" : "var(--border)",
                  background: activeCategory === category ? "rgba(var(--accent-rgb), 0.12)" : "transparent",
                  color: activeCategory === category ? "var(--accent)" : "var(--text-muted)",
                }}
              >
                {getSkillCategoryLabel(category, locale)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
          {filteredSkills.map(skill => (
            <article
              key={skill.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                padding: 14,
                borderRadius: 18,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.025)",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{getSkillName(skill.id, locale)}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7, marginTop: 4 }}>
                    {getSkillDescription(skill.id, locale)}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                  <span
                    style={{
                      padding: "3px 8px",
                      borderRadius: 999,
                      background: "rgba(var(--accent-rgb), 0.12)",
                      color: "var(--accent)",
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {getSkillCategoryLabel(skill.category, locale)}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{skillCoverage[skill.id]} {pickLocaleText(locale, { "zh-CN": "个 Agent", "zh-TW": "個 Agent", en: "agents", ja: "Agent" })}</span>
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {(Object.keys(AGENT_META) as AgentId[]).map(agentId => {
                  const enabled = agentConfigs[agentId].skills.includes(skill.id);
                  return (
                    <button
                      key={`${skill.id}-${agentId}`}
                      type="button"
                      onClick={() => void toggleSkill(agentId, skill.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: `1px solid ${enabled ? "rgba(var(--accent-rgb), 0.34)" : "var(--border)"}`,
                        background: enabled ? "rgba(var(--accent-rgb), 0.1)" : "rgba(255,255,255,0.02)",
                        color: "var(--text)",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{agentConfigs[agentId].emoji || AGENT_META[agentId].emoji}</span>
                        <span>
                          <strong style={{ display: "block", fontSize: 12 }}>{agentConfigs[agentId].name || AGENT_META[agentId].name}</strong>
                          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{agentId}</span>
                        </span>
                      </span>
                      <span style={{ fontSize: 11, color: enabled ? "var(--accent)" : "var(--text-muted)", fontWeight: 700 }}>
                        {enabled
                          ? pickLocaleText(locale, { "zh-CN": "已启用", "zh-TW": "已啟用", en: "Enabled", ja: "有効" })
                          : pickLocaleText(locale, { "zh-CN": "关闭", "zh-TW": "關閉", en: "Off", ja: "オフ" })}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: "auto" }}>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {pickLocaleText(locale, { "zh-CN": "推荐：", "zh-TW": "推薦：", en: "Suggested:", ja: "推奨：" })} {SKILL_RECOMMENDATIONS[skill.id].map(agentId => AGENT_META[agentId].name).join(", ")}
                </span>
                <button type="button" className="btn-ghost" onClick={() => void applyRecommended(skill.id)}>
                  {pickLocaleText(locale, { "zh-CN": "应用推荐", "zh-TW": "套用推薦", en: "Apply Suggested", ja: "推奨を適用" })}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{pickLocaleText(locale, { "zh-CN": "Agent 矩阵", "zh-TW": "Agent 矩陣", en: "Agent Matrix", ja: "Agent マトリクス" })}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
          {(Object.keys(AGENT_META) as AgentId[]).map(agentId => (
            <AgentSkillsCard key={agentId} agentId={agentId} config={agentConfigs[agentId]} locale={locale} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentSkillsCard({ agentId, config, locale }: { agentId: AgentId; config: AgentConfig; locale: UiLocale }) {
  const enabledSkills = AGENT_SKILLS.filter(skill => config.skills.includes(skill.id));

  return (
    <article
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        padding: 14,
        borderRadius: 18,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.025)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 22 }}>{config.emoji || AGENT_META[agentId].emoji}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{config.name || AGENT_META[agentId].name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{agentId}</div>
        </div>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {enabledSkills.length > 0
          ? `${enabledSkills.length} ${pickLocaleText(locale, { "zh-CN": "项已启用技能", "zh-TW": "項已啟用技能", en: "enabled skills", ja: "件の有効スキル" })}`
          : pickLocaleText(locale, { "zh-CN": "还没有分配技能", "zh-TW": "還沒有分配技能", en: "No skills assigned yet", ja: "まだスキルが割り当てられていません" })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {enabledSkills.length > 0 ? enabledSkills.map(skill => (
          <span
            key={`${agentId}-${skill.id}`}
            style={{
              padding: "4px 8px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              fontSize: 11,
              color: "var(--text)",
            }}
          >
            {getSkillName(skill.id, locale)}
          </span>
        )) : (
          <span style={{ fontSize: 11, color: "var(--warning)" }}>
            {pickLocaleText(locale, {
              "zh-CN": "建议在重任务前先完成配置",
              "zh-TW": "建議在重任務前先完成配置",
              en: "Recommended to configure before heavy tasks",
              ja: "重いタスクの前に設定しておくことを推奨します",
            })}
          </span>
        )}
      </div>
    </article>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: accent }}>{value}</div>
    </div>
  );
}

async function syncSettings() {
  const {
    providers,
    agentConfigs,
    platformConfigs,
    userNickname,
    desktopProgramSettings,
    hermesDispatchSettings,
  } = useStore.getState();

  try {
    if (sendWs({
      type: "settings_sync",
      providers,
      agentConfigs,
      platformConfigs,
      userNickname,
      desktopProgramSettings,
      hermesDispatchSettings,
    })) {
      void syncRuntimeSettings();
      return;
    }

    const url = await resolveBackendUrl("/api/settings");
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        providers,
        agentConfigs,
        platformConfigs,
        userNickname,
        desktopProgramSettings,
        hermesDispatchSettings,
      }),
    });
  } catch (error) {
    console.error("Failed to sync settings:", error);
  }
}

const noteBlockStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
  padding: 12,
  borderRadius: 14,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.025)",
};

const noteLabelStyle = {
  fontSize: 10,
  color: "var(--text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};
