"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { pickLocaleText } from "@/lib/ui-locale";
import { PLUGIN_CATALOG, PLUGIN_PACKS, type PluginPermission, type PluginSpec } from "@/lib/plugin-runtime";
import type { UiLocale } from "@/store/types";

export function PluginsCenter() {
  const locale = useStore(s => s.locale);
  const enabledPluginIds = useStore(s => s.enabledPluginIds);
  const togglePlugin = useStore(s => s.togglePlugin);
  const applyPluginPack = useStore(s => s.applyPluginPack);
  const [category, setCategory] = useState<string>("all");
  const [permissionFilter, setPermissionFilter] = useState<"all" | PluginPermission>("all");
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [detailPosition, setDetailPosition] = useState<{ top: number; left: number } | null>(null);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(PLUGIN_CATALOG.map(plugin => plugin.category)))],
    [],
  );

  const filteredPlugins = useMemo(
    () =>
      PLUGIN_CATALOG.filter(plugin => {
        if (category !== "all" && plugin.category !== category) return false;
        if (permissionFilter !== "all" && plugin.permission !== permissionFilter) return false;
        return true;
      }),
    [category, permissionFilter],
  );

  const enabledPlugins = useMemo(
    () => PLUGIN_CATALOG.filter(plugin => enabledPluginIds.includes(plugin.id)),
    [enabledPluginIds],
  );

  const fullAccessCount = useMemo(
    () => enabledPlugins.filter(plugin => plugin.permission === "full-access").length,
    [enabledPlugins],
  );
  const selectedPlugin = useMemo(
    () => PLUGIN_CATALOG.find(plugin => plugin.id === selectedPluginId) ?? null,
    [selectedPluginId],
  );

  const extensionGoal = pickLocaleText(locale, {
    "zh-CN": "先把插件能力边界、权限等级与扩展方向讲清楚，再逐步接入更深的后端插件协议。",
    "zh-TW": "先把外掛能力邊界、權限等級與擴展方向說清楚，再逐步接入更深的後端外掛協議。",
    en: "Clarify plugin boundaries, permission levels, and extension direction before wiring deeper backend plugin contracts.",
    ja: "より深いバックエンドのプラグイン契約をつなぐ前に、能力境界、権限レベル、拡張方針を明確にします。",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <PluginMetric
          label={pickLocaleText(locale, { "zh-CN": "插件总数", "zh-TW": "外掛總數", en: "Catalog Size", ja: "プラグイン総数" })}
          value={PLUGIN_CATALOG.length}
          accent="var(--accent)"
        />
        <PluginMetric
          label={pickLocaleText(locale, { "zh-CN": "已启用", "zh-TW": "已啟用", en: "Enabled", ja: "有効" })}
          value={enabledPlugins.length}
          accent="#f472b6"
        />
        <PluginMetric
          label={getPermissionLabel(locale, "full-access")}
          value={fullAccessCount}
          accent="var(--warning)"
        />
        <PluginMetric
          label={getPermissionLabel(locale, "restricted")}
          value={enabledPlugins.length - fullAccessCount}
          accent="var(--success)"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(250px, 0.82fr)", gap: 10 }}>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {pickLocaleText(locale, { "zh-CN": "插件组合", "zh-TW": "外掛組合", en: "Plugin Packs", ja: "プラグインパック" })}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>
            {pickLocaleText(locale, {
              "zh-CN": "预设好的扩展组合，方便快速启用一类常用能力。",
              "zh-TW": "預設好的擴展組合，方便快速啟用一類常用能力。",
              en: "Prebuilt extension bundles for quickly enabling a practical capability set.",
              ja: "よく使う能力セットをすばやく有効にするための事前構成パックです。",
            })}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, marginTop: 10 }}>
            {PLUGIN_PACKS.map(pack => {
              const packCopy = getPluginPackCopy(locale, pack.id);
              const packEnabled = pack.pluginIds.every(pluginId => enabledPluginIds.includes(pluginId));
              const enabledCount = pack.pluginIds.filter(pluginId => enabledPluginIds.includes(pluginId)).length;
              return (
                <article
                  key={pack.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    padding: 14,
                    minHeight: 224,
                    borderRadius: 18,
                    border: `1px solid ${pack.accent}33`,
                    background: `linear-gradient(180deg, ${pack.accent}18, rgba(255,255,255,0.92) 42%, rgba(255,255,255,0.98) 100%)`,
                    boxShadow: "0 14px 30px rgba(15, 23, 42, 0.05)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 12,
                          display: "grid",
                          placeItems: "center",
                          border: `1px solid ${pack.accent}44`,
                          background: `${pack.accent}18`,
                          color: "var(--text)",
                          flexShrink: 0,
                        }}
                      >
                        {renderPluginPackIcon(pack.iconLabel)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>{packCopy.title}</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                          {pickLocaleText(locale, {
                            "zh-CN": `已覆盖 ${pack.pluginIds.length} 个插件`,
                            "zh-TW": `已覆蓋 ${pack.pluginIds.length} 個外掛`,
                            en: `${pack.pluginIds.length} plugins included`,
                            ja: `${pack.pluginIds.length} 個のプラグインを収録`,
                          })}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        flexShrink: 0,
                        minHeight: 24,
                        padding: "0 8px",
                        borderRadius: 999,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: packEnabled ? `${pack.accent}18` : "rgba(148, 163, 184, 0.12)",
                        border: `1px solid ${packEnabled ? `${pack.accent}36` : "rgba(148, 163, 184, 0.18)"}`,
                        color: packEnabled ? pack.accent : "var(--text-muted)",
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {packEnabled
                        ? pickLocaleText(locale, { "zh-CN": "已启用", "zh-TW": "已啟用", en: "Enabled", ja: "有効" })
                        : pickLocaleText(locale, {
                            "zh-CN": `${enabledCount}/${pack.pluginIds.length}`,
                            "zh-TW": `${enabledCount}/${pack.pluginIds.length}`,
                            en: `${enabledCount}/${pack.pluginIds.length}`,
                            ja: `${enabledCount}/${pack.pluginIds.length}`,
                          })}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.6, minHeight: 36 }}>{packCopy.description}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignContent: "flex-start", minHeight: 52 }}>
                    {pack.pluginIds.map(pluginId => {
                      const plugin = PLUGIN_CATALOG.find(item => item.id === pluginId);
                      const pluginEnabled = enabledPluginIds.includes(pluginId);
                      return (
                        <span
                          key={`${pack.id}-${pluginId}`}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            border: `1px solid ${pluginEnabled ? `${pack.accent}26` : "rgba(148, 163, 184, 0.18)"}`,
                            background: pluginEnabled ? `${pack.accent}12` : "rgba(255,255,255,0.72)",
                            fontSize: 10,
                            color: pluginEnabled ? "var(--text)" : "var(--text-muted)",
                            fontWeight: pluginEnabled ? 700 : 600,
                          }}
                        >
                          {plugin ? getPluginCopy(locale, plugin).name : pluginId}
                        </span>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => applyPluginPack(pack.id)}
                    style={{
                      marginTop: "auto",
                      minHeight: 36,
                      width: "100%",
                      borderRadius: 14,
                      borderColor: packEnabled ? `${pack.accent}30` : "var(--border)",
                      background: packEnabled ? `${pack.accent}10` : "rgba(255,255,255,0.82)",
                      color: packEnabled ? "var(--text)" : "var(--text)",
                      fontWeight: 700,
                      fontSize: 11,
                    }}
                  >
                    {packEnabled
                      ? pickLocaleText(locale, {
                          "zh-CN": "关闭工具包",
                          "zh-TW": "關閉工具包",
                          en: "Disable Pack",
                          ja: "パックを無効化",
                        })
                      : pickLocaleText(locale, {
                          "zh-CN": "启用工具包",
                          "zh-TW": "啟用工具包",
                          en: "Enable Pack",
                          ja: "パックを有効化",
                        })}
                  </button>
                </article>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>
            {pickLocaleText(locale, { "zh-CN": "扩展说明", "zh-TW": "擴展說明", en: "Extension Notes", ja: "拡張メモ" })}
          </div>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <PluginNote
              label={pickLocaleText(locale, {
                "zh-CN": "最常见能力贡献",
                "zh-TW": "最常見能力貢獻",
                en: "Most Common Contribution",
                ja: "最も多い能力貢献",
              })}
              value={mostCommonContribution(enabledPlugins, locale)}
            />
            <PluginNote
              label={pickLocaleText(locale, {
                "zh-CN": "高级风险",
                "zh-TW": "高級風險",
                en: "Advanced Risk",
                ja: "高度なリスク",
              })}
              value={
                fullAccessCount > 0
                  ? pickLocaleText(locale, {
                      "zh-CN": `${fullAccessCount} 个已启用插件需要完整权限`,
                      "zh-TW": `${fullAccessCount} 個已啟用外掛需要完整權限`,
                      en: `${fullAccessCount} enabled plugin(s) require full access`,
                      ja: `${fullAccessCount} 個の有効なプラグインにフルアクセス権限が必要です`,
                    })
                  : pickLocaleText(locale, {
                      "zh-CN": "当前没有需要完整权限的已启用插件",
                      "zh-TW": "目前沒有需要完整權限的已啟用外掛",
                      en: "No full-access plugins enabled",
                      ja: "フルアクセス権限が必要な有効プラグインはありません",
                    })
              }
            />
            <PluginNote
              label={pickLocaleText(locale, {
                "zh-CN": "当前目标",
                "zh-TW": "目前目標",
                en: "Current Goal",
                ja: "現在の目標",
              })}
              value={extensionGoal}
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 12, position: "relative", overflow: "visible" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>
              {pickLocaleText(locale, { "zh-CN": "插件目录", "zh-TW": "外掛目錄", en: "Plugin Catalog", ja: "プラグイン一覧" })}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>
              {pickLocaleText(locale, {
                "zh-CN": "可按类别和权限筛选，并在本地直接启用或关闭。",
                "zh-TW": "可依類別與權限篩選，並在本地直接啟用或關閉。",
                en: "Filter by category and permission, then enable or disable plugins locally.",
                ja: "カテゴリと権限で絞り込み、ローカルで有効化または無効化できます。",
              })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
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
                  padding: "5px 10px",
                  fontSize: 11,
                }}
              >
                {item === "all"
                  ? pickLocaleText(locale, { "zh-CN": "全部类别", "zh-TW": "全部類別", en: "All Categories", ja: "すべてのカテゴリ" })
                  : getCategoryLabel(locale, item)}
              </button>
            ))}
            {(["all", "restricted", "full-access"] as const).map(item => (
              <button
                key={item}
                type="button"
                className="btn-ghost"
                onClick={() => setPermissionFilter(item)}
                style={{
                  borderColor: permissionFilter === item ? "rgba(var(--accent-rgb), 0.36)" : "var(--border)",
                  background: permissionFilter === item ? "rgba(var(--accent-rgb), 0.12)" : "transparent",
                  color: permissionFilter === item ? "var(--accent)" : "var(--text-muted)",
                  padding: "5px 10px",
                  fontSize: 11,
                }}
              >
                {item === "all"
                  ? pickLocaleText(locale, { "zh-CN": "全部权限", "zh-TW": "全部權限", en: "All Permissions", ja: "すべての権限" })
                  : getPermissionLabel(locale, item)}
              </button>
            ))}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(176px, 176px))",
            justifyContent: "start",
            gap: 8,
            marginTop: 10,
          }}
        >
            {filteredPlugins.map(plugin => {
              const copy = getPluginCopy(locale, plugin);
              const briefDescription =
                copy.description.length > 24
                  ? `${copy.description.slice(0, 24).trim()}...`
                : copy.description;
              const active = selectedPluginId === plugin.id;

              return (
                <article
                  key={plugin.id}
                  onClick={event => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const popupWidth = 360;
                    const horizontalGap = 12;
                    const verticalGap = 6;
                    let left = rect.right + horizontalGap;
                    if (left + popupWidth > window.innerWidth - 16) {
                      left = rect.left - popupWidth - horizontalGap;
                    }
                    if (left < 16) {
                      left = Math.max(16, window.innerWidth - popupWidth - 16);
                    }
                    const top = Math.min(rect.top - verticalGap, window.innerHeight - 500);
                    setSelectedPluginId(plugin.id);
                    setDetailPosition({ top: Math.max(16, top), left });
                  }}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: 8,
                    width: 176,
                    minHeight: 76,
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: `1px solid ${active ? `${plugin.accent}66` : `${plugin.accent}33`}`,
                    background: active
                      ? `linear-gradient(180deg, ${plugin.accent}1a, rgba(255,255,255,0.92) 72%)`
                      : `linear-gradient(180deg, ${plugin.accent}12, rgba(255,255,255,0.02) 60%)`,
                    cursor: "pointer",
                  }}
                >
                    <div style={{ display: "flex", width: "100%", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 12,
                          display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                        background: "#ffffff",
                        border: `1px solid ${plugin.accent}24`,
                        boxShadow: "0 6px 18px rgba(15, 23, 42, 0.08)",
                      }}
                    >
                      {renderPluginIcon(plugin.id)}
                    </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 700, paddingTop: 1 }}>
                        {getCategoryLabel(locale, plugin.category)}
                      </div>
                    </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>
                    {copy.name}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      lineHeight: 1.4,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {briefDescription}
                  </div>
                </article>
              );
            })}
        </div>

        {selectedPlugin && detailPosition ? (
          <>
            <div
              onClick={() => {
                setSelectedPluginId(null);
                setDetailPosition(null);
              }}
              style={{
                position: "fixed",
                inset: 0,
                background: "transparent",
                zIndex: 1090,
              }}
            />
            <div
              className="card"
              onClick={event => event.stopPropagation()}
              style={{
                position: "fixed",
                top: detailPosition.top,
                left: detailPosition.left,
                width: 360,
                maxHeight: "min(500px, calc(100vh - 32px))",
                overflowY: "auto",
                padding: 14,
                borderRadius: 18,
                border: `1px solid ${selectedPlugin.accent}3d`,
                background: "#ffffff",
                boxShadow: "0 16px 38px rgba(15, 23, 42, 0.12)",
                zIndex: 1100,
              }}
            >
              <PluginDetailDialog
                locale={locale}
                plugin={selectedPlugin}
                enabled={enabledPluginIds.includes(selectedPlugin.id)}
                onToggle={() => togglePlugin(selectedPlugin.id)}
              />
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PluginMetric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6, color: accent }}>{value}</div>
    </div>
  );
}

function PluginNote({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 5,
        padding: 10,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.025)",
      }}
    >
      <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      <strong style={{ fontSize: 12, lineHeight: 1.55 }}>{value}</strong>
    </div>
  );
}

function PluginDetailDialog({
  locale,
  plugin,
  enabled,
  onToggle,
}: {
  locale: UiLocale;
  plugin: PluginSpec;
  enabled: boolean;
  onToggle: () => void;
}) {
  const copy = getPluginCopy(locale, plugin);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              display: "grid",
              placeItems: "center",
              background: "#ffffff",
              border: `1px solid ${plugin.accent}2a`,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.08)",
              flexShrink: 0,
            }}
          >
            {renderPluginIcon(plugin.id, 34)}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={badgeStyle(plugin.permission === "full-access" ? "var(--warning)" : "var(--success)")}>
              {getPermissionLabel(locale, plugin.permission)}
            </span>
            <span style={badgeStyle(plugin.accent, "var(--text)")}>{getCategoryLabel(locale, plugin.category)}</span>
            <span style={badgeStyle(enabled ? "var(--accent)" : "#64748b", enabled ? "var(--accent)" : "#334155")}>
              {enabled
                ? pickLocaleText(locale, { "zh-CN": "本地已启用", "zh-TW": "本地已啟用", en: "Enabled locally", ja: "ローカルで有効" })
                : pickLocaleText(locale, { "zh-CN": "本地已关闭", "zh-TW": "本地已關閉", en: "Disabled locally", ja: "ローカルで無効" })}
            </span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", lineHeight: 1.2 }}>{copy.name}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            v{plugin.version} · {getSourceLabel(locale, plugin.source)}
          </div>
        </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 12,
          color: "var(--text-muted)",
          lineHeight: 1.7,
          padding: "12px 14px",
          borderRadius: 16,
          border: "1px solid rgba(148, 163, 184, 0.18)",
          background: "#ffffff",
        }}
      >
        {copy.description}
      </div>

      <div
        style={{
          display: "grid",
          gap: 8,
          padding: "12px 14px",
          borderRadius: 16,
          border: "1px solid rgba(148, 163, 184, 0.18)",
          background: "#ffffff",
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
          {pickLocaleText(locale, { "zh-CN": "能力标签", "zh-TW": "能力標籤", en: "Capabilities", ja: "能力タグ" })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {plugin.contributions.map(item => (
            <span
              key={`${plugin.id}-${item}`}
              style={{
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid rgba(148, 163, 184, 0.18)",
                background: "rgba(248, 250, 252, 0.96)",
                fontSize: 11,
              }}
            >
              {getContributionLabel(locale, item)}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn-ghost" onClick={onToggle}>
          {enabled
            ? pickLocaleText(locale, { "zh-CN": "关闭插件", "zh-TW": "關閉外掛", en: "Disable Plugin", ja: "プラグインを無効化" })
            : pickLocaleText(locale, { "zh-CN": "启用插件", "zh-TW": "啟用外掛", en: "Enable Plugin", ja: "プラグインを有効化" })}
        </button>
      </div>
    </div>
  );
}

function getPluginPackCopy(locale: UiLocale, packId: string) {
  switch (packId) {
    case "creative-growth-pack":
      return {
        title: pickLocaleText(locale, { "zh-CN": "设计与增长", "zh-TW": "設計與增長", en: "Creative Growth", ja: "デザインと成長" }),
        description: pickLocaleText(locale, {
          "zh-CN": "覆盖设计稿协同、营销素材、社媒发布和云端素材流转。",
          "zh-TW": "覆蓋設計稿協同、行銷素材、社媒發布與雲端素材流轉。",
          en: "Covers design handoff, campaign assets, social publishing, and shared cloud media.",
          ja: "デザイン受け渡し、販促素材、SNS 公開、クラウド素材連携をまとめます。",
        }),
      };
    case "operations-revenue-pack":
      return {
        title: pickLocaleText(locale, { "zh-CN": "业务与客户运营", "zh-TW": "業務與客戶營運", en: "Business Operations", ja: "業務と顧客運用" }),
        description: pickLocaleText(locale, {
          "zh-CN": "覆盖项目跟进、销售线索、店铺协同和团队沟通这一整层业务链路。",
          "zh-TW": "覆蓋專案跟進、銷售線索、店鋪協同與團隊溝通這一整層業務鏈路。",
          en: "Covers project tracking, customer revenue, storefront coordination, and team communication.",
          ja: "案件進行、営業、店舗運用、チーム連携までをまとめた運用レイヤーです。",
        }),
      };
    case "delivery-automation-pack":
      return {
        title: pickLocaleText(locale, { "zh-CN": "研发与自动化", "zh-TW": "研發與自動化", en: "Delivery Automation", ja: "開発と自動化" }),
        description: pickLocaleText(locale, {
          "zh-CN": "覆盖研发交付、任务流转与跨工具自动化编排。",
          "zh-TW": "覆蓋研發交付、任務流轉與跨工具自動化編排。",
          en: "Covers engineering delivery, issue routing, and cross-tool automation orchestration.",
          ja: "開発デリバリー、課題ルーティング、ツール横断自動化をまとめます。",
        }),
      };
    default:
      return { title: packId, description: packId };
  }
}

function getPluginCopy(locale: UiLocale, plugin: PluginSpec) {
  switch (plugin.id) {
    case "figma":
      return {
        name: pickLocaleText(locale, { "zh-CN": "Figma", "zh-TW": "Figma", en: "Figma", ja: "Figma" }),
        description: pickLocaleText(locale, {
          "zh-CN": "同步设计稿、读取组件上下文，并把视觉规格带进工作台。",
          "zh-TW": "同步設計稿、讀取元件上下文，並把視覺規格帶進工作台。",
          en: "Sync design files, component context, and visual specs into the workbench.",
          ja: "デザインファイル、コンポーネント文脈、視覚仕様をワークベンチへ同期します。",
        }),
      };
    case "canva":
      return {
        name: pickLocaleText(locale, { "zh-CN": "Canva", "zh-TW": "Canva", en: "Canva", ja: "Canva" }),
        description: pickLocaleText(locale, {
          "zh-CN": "连接营销模板、素材导出和轻量创意制作流程。",
          "zh-TW": "連接行銷模板、素材匯出與輕量創意製作流程。",
          en: "Connect campaign templates, asset export, and lightweight creative production.",
          ja: "キャンペーンテンプレート、素材出力、軽量なクリエイティブ制作を接続します。",
        }),
      };
    case "linear":
      return {
        name: pickLocaleText(locale, { "zh-CN": "Linear", "zh-TW": "Linear", en: "Linear", ja: "Linear" }),
        description: pickLocaleText(locale, {
          "zh-CN": "把任务、问题和交付进度同步到 Linear 工作流里。",
          "zh-TW": "把任務、問題與交付進度同步到 Linear 工作流程裡。",
          en: "Sync tasks, issues, and delivery progress into Linear workflows.",
          ja: "タスク、課題、進捗を Linear ワークフローへ同期します。",
        }),
      };
    case "notion":
      return {
        name: pickLocaleText(locale, { "zh-CN": "Notion", "zh-TW": "Notion", en: "Notion", ja: "Notion" }),
        description: pickLocaleText(locale, {
          "zh-CN": "读取文档、写入纪要，并把知识页面接到执行链路中。",
          "zh-TW": "讀取文件、寫入紀要，並把知識頁面接到執行鏈路中。",
          en: "Read docs, write notes, and connect knowledge pages to execution flows.",
          ja: "ドキュメント読取、議事録記録、知識ページ接続を実行チェーンへ組み込みます。",
        }),
      };
    case "slack":
      return {
        name: pickLocaleText(locale, { "zh-CN": "Slack", "zh-TW": "Slack", en: "Slack", ja: "Slack" }),
        description: pickLocaleText(locale, {
          "zh-CN": "同步提醒、审批消息和团队交接通知到 Slack 通道。",
          "zh-TW": "同步提醒、審批訊息與團隊交接通知到 Slack 通道。",
          en: "Sync alerts, approvals, and team handoff messages into Slack channels.",
          ja: "通知、承認、チーム引き継ぎメッセージを Slack に同期します。",
        }),
      };
    case "github":
      return {
        name: pickLocaleText(locale, { "zh-CN": "GitHub", "zh-TW": "GitHub", en: "GitHub", ja: "GitHub" }),
        description: pickLocaleText(locale, {
          "zh-CN": "连接仓库、拉取请求和研发上下文，回写交付状态。",
          "zh-TW": "連接儲存庫、拉取請求與研發上下文，回寫交付狀態。",
          en: "Connect repositories, pull requests, and engineering context back into delivery flow.",
          ja: "リポジトリ、PR、開発文脈を接続し、デリバリー状況を戻します。",
        }),
      };
    case "jira":
      return {
        name: "Jira",
        description: pickLocaleText(locale, {
          "zh-CN": "同步迭代、缺陷和工单推进状态，适合项目交付值守。",
          "zh-TW": "同步迭代、缺陷與工單推進狀態，適合專案交付值守。",
          en: "Sync sprint, bug, and ticket progress for delivery-focused operations.",
          ja: "スプリント、バグ、チケット進捗を同期し、デリバリー運用を支えます。",
        }),
      };
    case "trello":
      return {
        name: "Trello",
        description: pickLocaleText(locale, {
          "zh-CN": "连接轻量看板、阶段清单和团队协同流程。",
          "zh-TW": "連接輕量看板、階段清單與團隊協同流程。",
          en: "Connect lightweight boards, stage checklists, and team collaboration flows.",
          ja: "軽量ボード、段階チェックリスト、チーム協業フローを接続します。",
        }),
      };
    case "hubspot":
      return {
        name: "HubSpot",
        description: pickLocaleText(locale, {
          "zh-CN": "打通客户、商机和跟进动作，让销售协作更连续。",
          "zh-TW": "打通客戶、商機與跟進動作，讓銷售協作更連續。",
          en: "Connect contacts, deals, and follow-up actions into one sales rhythm.",
          ja: "顧客、案件、フォローアップをつなぎ、営業連携を滑らかにします。",
        }),
      };
    case "salesforce":
      return {
        name: "Salesforce",
        description: pickLocaleText(locale, {
          "zh-CN": "接入企业级线索、机会状态和服务交接节点。",
          "zh-TW": "接入企業級線索、機會狀態與服務交接節點。",
          en: "Connect enterprise leads, opportunity state, and service handoff checkpoints.",
          ja: "企業向けリード、商談状況、サービス引き継ぎを接続します。",
        }),
      };
    case "shopify":
      return {
        name: "Shopify",
        description: pickLocaleText(locale, {
          "zh-CN": "同步店铺订单、商品内容和电商运营动作。",
          "zh-TW": "同步店鋪訂單、商品內容與電商營運動作。",
          en: "Sync store orders, product content, and commerce operations.",
          ja: "ストア注文、商品コンテンツ、EC 運用を同期します。",
        }),
      };
    case "google-drive":
      return {
        name: pickLocaleText(locale, { "zh-CN": "Google Drive", "zh-TW": "Google Drive", en: "Google Drive", ja: "Google Drive" }),
        description: pickLocaleText(locale, {
          "zh-CN": "接入共享文档、素材文件和项目引用资料。",
          "zh-TW": "接入共享文件、素材檔案與專案引用資料。",
          en: "Connect shared docs, assets, and project reference files.",
          ja: "共有ドキュメント、素材、参照ファイルを接続します。",
        }),
      };
    case "airtable":
      return {
        name: "Airtable",
        description: pickLocaleText(locale, {
          "zh-CN": "把轻量数据库、运营表格和任务队列接进平台。",
          "zh-TW": "把輕量資料庫、營運表格與任務隊列接進平台。",
          en: "Bring lightweight bases, operating tables, and task queues into the platform.",
          ja: "軽量データベース、運用表、タスクキューを接続します。",
        }),
      };
    case "discord":
      return {
        name: "Discord",
        description: pickLocaleText(locale, {
          "zh-CN": "连接社群通知、频道提醒和社区运营交接。",
          "zh-TW": "連接社群通知、頻道提醒與社群營運交接。",
          en: "Connect community notifications, channel alerts, and moderation handoff.",
          ja: "コミュニティ通知、チャネル警告、運用引き継ぎを接続します。",
        }),
      };
    case "x":
      return {
        name: "X",
        description: pickLocaleText(locale, {
          "zh-CN": "连接推文草稿、发布节奏和轻量内容运营动作。",
          "zh-TW": "連接推文草稿、發布節奏與輕量內容營運動作。",
          en: "Connect tweet drafts, posting cadence, and lightweight content ops.",
          ja: "投稿下書き、公開リズム、軽量コンテンツ運用を接続します。",
        }),
      };
    case "youtube":
      return {
        name: "YouTube",
        description: pickLocaleText(locale, {
          "zh-CN": "管理频道发布准备、视频元数据和内容排期。",
          "zh-TW": "管理頻道發布準備、影片中繼資料與內容排期。",
          en: "Manage channel publish prep, metadata, and content scheduling.",
          ja: "チャンネル公開準備、メタデータ、公開計画を管理します。",
        }),
      };
    case "zapier":
      return {
        name: "Zapier",
        description: pickLocaleText(locale, {
          "zh-CN": "连接 webhook、自动化触发器和跨工具轻量流程。",
          "zh-TW": "連接 webhook、自動化觸發器與跨工具輕量流程。",
          en: "Connect webhooks, automations, and lightweight cross-tool flows.",
          ja: "Webhook、自動化トリガー、軽量なツール連携を接続します。",
        }),
      };
    case "dropbox":
      return {
        name: "Dropbox",
        description: pickLocaleText(locale, {
          "zh-CN": "同步共享素材、外部文件和评审链接。",
          "zh-TW": "同步共享素材、外部檔案與評審連結。",
          en: "Sync shared assets, outside files, and review links.",
          ja: "共有素材、外部ファイル、レビュリンクを同期します。",
        }),
      };
    default:
      return {
        name: plugin.name,
        description: plugin.description,
      };
  }
}

function getCategoryLabel(locale: UiLocale, category: string) {
  switch (category) {
    case "Design":
      return pickLocaleText(locale, { "zh-CN": "设计", "zh-TW": "設計", en: "Design", ja: "デザイン" });
    case "Project":
      return pickLocaleText(locale, { "zh-CN": "项目", "zh-TW": "專案", en: "Project", ja: "プロジェクト" });
    case "Knowledge":
      return pickLocaleText(locale, { "zh-CN": "知识", "zh-TW": "知識", en: "Knowledge", ja: "ナレッジ" });
    case "Communication":
      return pickLocaleText(locale, { "zh-CN": "沟通", "zh-TW": "溝通", en: "Communication", ja: "コミュニケーション" });
    case "Development":
      return pickLocaleText(locale, { "zh-CN": "研发", "zh-TW": "研發", en: "Development", ja: "開発" });
    case "Sales":
      return pickLocaleText(locale, { "zh-CN": "销售", "zh-TW": "銷售", en: "Sales", ja: "セールス" });
    case "Commerce":
      return pickLocaleText(locale, { "zh-CN": "电商", "zh-TW": "電商", en: "Commerce", ja: "コマース" });
    case "Storage":
      return pickLocaleText(locale, { "zh-CN": "文件", "zh-TW": "檔案", en: "Storage", ja: "ストレージ" });
    case "Social":
      return pickLocaleText(locale, { "zh-CN": "内容", "zh-TW": "內容", en: "Social", ja: "ソーシャル" });
    case "Automation":
      return pickLocaleText(locale, { "zh-CN": "自动化", "zh-TW": "自動化", en: "Automation", ja: "自動化" });
    default:
      return category;
  }
}

function getPermissionLabel(locale: UiLocale, permission: PluginPermission) {
  if (permission === "full-access") {
    return pickLocaleText(locale, { "zh-CN": "完整权限", "zh-TW": "完整權限", en: "Full Access", ja: "フルアクセス" });
  }
  return pickLocaleText(locale, { "zh-CN": "受限权限", "zh-TW": "受限權限", en: "Restricted", ja: "制限付き" });
}

function getSourceLabel(locale: UiLocale, source: string) {
  switch (source) {
    case "Official":
      return pickLocaleText(locale, { "zh-CN": "官方", "zh-TW": "官方", en: "Official", ja: "公式" });
    case "Built-in":
      return pickLocaleText(locale, { "zh-CN": "内置", "zh-TW": "內建", en: "Built-in", ja: "内蔵" });
    case "Community-ready":
      return pickLocaleText(locale, { "zh-CN": "社区就绪", "zh-TW": "社群就緒", en: "Community-ready", ja: "コミュニティ対応" });
    case "Advanced":
      return pickLocaleText(locale, { "zh-CN": "高级", "zh-TW": "高級", en: "Advanced", ja: "上級" });
    case "Experimental":
      return pickLocaleText(locale, { "zh-CN": "实验性", "zh-TW": "實驗性", en: "Experimental", ja: "実験的" });
    default:
      return source;
  }
}

function getContributionLabel(locale: UiLocale, contribution: string) {
  switch (contribution) {
    case "design sync":
      return pickLocaleText(locale, { "zh-CN": "设计同步", "zh-TW": "設計同步", en: "design sync", ja: "デザイン同期" });
    case "component inspect":
      return pickLocaleText(locale, { "zh-CN": "组件检查", "zh-TW": "元件檢查", en: "component inspect", ja: "コンポーネント確認" });
    case "handoff links":
      return pickLocaleText(locale, { "zh-CN": "交付链接", "zh-TW": "交付連結", en: "handoff links", ja: "引き継ぎリンク" });
    case "asset export":
      return pickLocaleText(locale, { "zh-CN": "素材导出", "zh-TW": "素材匯出", en: "asset export", ja: "アセット書き出し" });
    case "template actions":
      return pickLocaleText(locale, { "zh-CN": "模板操作", "zh-TW": "模板操作", en: "template actions", ja: "テンプレート操作" });
    case "social drafts":
      return pickLocaleText(locale, { "zh-CN": "社媒草稿", "zh-TW": "社媒草稿", en: "social drafts", ja: "SNS 下書き" });
    case "issue sync":
      return pickLocaleText(locale, { "zh-CN": "问题同步", "zh-TW": "問題同步", en: "issue sync", ja: "課題同期" });
    case "project updates":
      return pickLocaleText(locale, { "zh-CN": "项目更新", "zh-TW": "專案更新", en: "project updates", ja: "プロジェクト更新" });
    case "delivery handoff":
      return pickLocaleText(locale, { "zh-CN": "交付回写", "zh-TW": "交付回寫", en: "delivery handoff", ja: "デリバリー引き継ぎ" });
    case "doc sync":
      return pickLocaleText(locale, { "zh-CN": "文档同步", "zh-TW": "文件同步", en: "doc sync", ja: "ドキュメント同期" });
    case "knowledge pages":
      return pickLocaleText(locale, { "zh-CN": "知识页面", "zh-TW": "知識頁面", en: "knowledge pages", ja: "ナレッジページ" });
    case "meeting notes":
      return pickLocaleText(locale, { "zh-CN": "会议纪要", "zh-TW": "會議紀要", en: "meeting notes", ja: "会議メモ" });
    case "channel alerts":
      return pickLocaleText(locale, { "zh-CN": "通道提醒", "zh-TW": "通道提醒", en: "channel alerts", ja: "チャネル通知" });
    case "approval routing":
      return pickLocaleText(locale, { "zh-CN": "审批流转", "zh-TW": "審批流轉", en: "approval routing", ja: "承認ルーティング" });
    case "team handoff":
      return pickLocaleText(locale, { "zh-CN": "团队交接", "zh-TW": "團隊交接", en: "team handoff", ja: "チーム引き継ぎ" });
    case "repo links":
      return pickLocaleText(locale, { "zh-CN": "仓库链接", "zh-TW": "儲存庫連結", en: "repo links", ja: "リポジトリ連携" });
    case "pull request sync":
      return pickLocaleText(locale, { "zh-CN": "PR 同步", "zh-TW": "PR 同步", en: "pull request sync", ja: "PR 同期" });
    case "engineering context":
      return pickLocaleText(locale, { "zh-CN": "研发上下文", "zh-TW": "研發上下文", en: "engineering context", ja: "開発文脈" });
    case "desk actions":
      return pickLocaleText(locale, { "zh-CN": "工作台动作", "zh-TW": "工作台動作", en: "desk actions", ja: "Desk 操作" });
    case "context presets":
      return pickLocaleText(locale, { "zh-CN": "上下文预设", "zh-TW": "上下文預設", en: "context presets", ja: "コンテキストプリセット" });
    case "async workflows":
      return pickLocaleText(locale, { "zh-CN": "异步流程", "zh-TW": "非同步流程", en: "async workflows", ja: "非同期ワークフロー" });
    case "preview cards":
      return pickLocaleText(locale, { "zh-CN": "预览卡片", "zh-TW": "預覽卡片", en: "preview cards", ja: "プレビューカード" });
    case "artifact surfaces":
      return pickLocaleText(locale, { "zh-CN": "结果视图", "zh-TW": "結果視圖", en: "artifact surfaces", ja: "成果物ビュー" });
    case "pop-out views":
      return pickLocaleText(locale, { "zh-CN": "弹出视图", "zh-TW": "彈出視圖", en: "pop-out views", ja: "ポップアウト表示" });
    case "skill packs":
      return pickLocaleText(locale, { "zh-CN": "技能包", "zh-TW": "技能包", en: "skill packs", ja: "スキルパック" });
    case "catalog metadata":
      return pickLocaleText(locale, { "zh-CN": "目录元数据", "zh-TW": "目錄中繼資料", en: "catalog metadata", ja: "カタログメタデータ" });
    case "role recommendations":
      return pickLocaleText(locale, { "zh-CN": "角色推荐", "zh-TW": "角色推薦", en: "role recommendations", ja: "役割レコメンド" });
    case "channel adapters":
      return pickLocaleText(locale, { "zh-CN": "通道适配器", "zh-TW": "通道適配器", en: "channel adapters", ja: "チャネルアダプター" });
    case "routing hooks":
      return pickLocaleText(locale, { "zh-CN": "路由钩子", "zh-TW": "路由鉤子", en: "routing hooks", ja: "ルーティングフック" });
    case "event bridges":
      return pickLocaleText(locale, { "zh-CN": "事件桥接", "zh-TW": "事件橋接", en: "event bridges", ja: "イベントブリッジ" });
    case "status metrics":
      return pickLocaleText(locale, { "zh-CN": "状态指标", "zh-TW": "狀態指標", en: "status metrics", ja: "状態メトリクス" });
    case "heartbeat cards":
      return pickLocaleText(locale, { "zh-CN": "心跳卡片", "zh-TW": "心跳卡片", en: "heartbeat cards", ja: "ハートビートカード" });
    case "ops summary":
      return pickLocaleText(locale, { "zh-CN": "运维摘要", "zh-TW": "運維摘要", en: "ops summary", ja: "運用サマリー" });
    case "provider templates":
      return pickLocaleText(locale, { "zh-CN": "供应商模板", "zh-TW": "供應商模板", en: "provider templates", ja: "プロバイダーテンプレート" });
    case "routing tests":
      return pickLocaleText(locale, { "zh-CN": "路由测试", "zh-TW": "路由測試", en: "routing tests", ja: "ルーティングテスト" });
    case "lab settings":
      return pickLocaleText(locale, { "zh-CN": "实验设置", "zh-TW": "實驗設定", en: "lab settings", ja: "ラボ設定" });
    case "sprint planning":
      return pickLocaleText(locale, { "zh-CN": "迭代规划", "zh-TW": "迭代規劃", en: "sprint planning", ja: "スプリント計画" });
    case "board sync":
      return pickLocaleText(locale, { "zh-CN": "看板同步", "zh-TW": "看板同步", en: "board sync", ja: "ボード同期" });
    case "crm sync":
      return pickLocaleText(locale, { "zh-CN": "客户同步", "zh-TW": "客戶同步", en: "crm sync", ja: "CRM 同期" });
    case "deal updates":
      return pickLocaleText(locale, { "zh-CN": "商机更新", "zh-TW": "商機更新", en: "deal updates", ja: "商談更新" });
    case "commerce sync":
      return pickLocaleText(locale, { "zh-CN": "店铺同步", "zh-TW": "店鋪同步", en: "commerce sync", ja: "コマース同期" });
    case "base sync":
      return pickLocaleText(locale, { "zh-CN": "数据表同步", "zh-TW": "資料表同步", en: "base sync", ja: "ベース同期" });
    case "community sync":
      return pickLocaleText(locale, { "zh-CN": "社群同步", "zh-TW": "社群同步", en: "community sync", ja: "コミュニティ同期" });
    case "publish queue":
      return pickLocaleText(locale, { "zh-CN": "发布队列", "zh-TW": "發布隊列", en: "publish queue", ja: "公開キュー" });
    case "workflow bridge":
      return pickLocaleText(locale, { "zh-CN": "流程桥接", "zh-TW": "流程橋接", en: "workflow bridge", ja: "ワークフローブリッジ" });
    default:
      return contribution;
  }
}

function mostCommonContribution(enabledPlugins: PluginSpec[], locale: UiLocale) {
  if (enabledPlugins.length === 0) {
    return pickLocaleText(locale, {
      "zh-CN": "当前没有启用任何插件",
      "zh-TW": "目前沒有啟用任何外掛",
      en: "No plugins enabled",
      ja: "有効なプラグインはありません",
    });
  }

  const counts = new Map<string, number>();
  for (const plugin of enabledPlugins) {
    for (const contribution of plugin.contributions) {
      counts.set(contribution, (counts.get(contribution) ?? 0) + 1);
    }
  }

  const topEntry = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  if (!topEntry) {
    return pickLocaleText(locale, {
      "zh-CN": "还没有记录到能力贡献",
      "zh-TW": "還沒有記錄到能力貢獻",
      en: "No contributions recorded",
      ja: "能力貢献はまだ記録されていません",
    });
  }

  return pickLocaleText(locale, {
    "zh-CN": `${getContributionLabel(locale, topEntry[0])} · ${topEntry[1]} 个插件`,
    "zh-TW": `${getContributionLabel(locale, topEntry[0])} · ${topEntry[1]} 個外掛`,
    en: `${getContributionLabel(locale, topEntry[0])} · ${topEntry[1]} plugin(s)`,
    ja: `${getContributionLabel(locale, topEntry[0])} · ${topEntry[1]} 個のプラグイン`,
  });
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

function renderPluginPackIcon(iconLabel: string) {
  const commonProps = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (iconLabel) {
    case "palette":
      return (
        <svg {...commonProps}>
          <path d="M12 3.5c-4.97 0-9 3.58-9 8 0 2.5 1.54 4.68 3.9 6.15.64.4 1.44-.06 1.44-.81v-.65c0-.88.72-1.6 1.6-1.6h2.23c.68 0 1.23.55 1.23 1.23 0 1.48 1.2 2.68 2.68 2.68h.44c2.47 0 4.48-2.01 4.48-4.48C21 8.2 16.97 3.5 12 3.5Z" />
          <circle cx="7.5" cy="10" r="1" />
          <circle cx="11" cy="7.5" r="1" />
          <circle cx="15.5" cy="8.5" r="1" />
        </svg>
      );
    case "network":
      return (
        <svg {...commonProps}>
          <circle cx="6" cy="7" r="2.5" />
          <circle cx="18" cy="7" r="2.5" />
          <circle cx="12" cy="17" r="2.5" />
          <path d="M8.2 8.5 10.3 14" />
          <path d="M15.8 8.5 13.7 14" />
          <path d="M8.5 7h7" />
        </svg>
      );
    case "delivery":
      return (
        <svg {...commonProps}>
          <path d="M6 16.5h12" />
          <path d="M8 16.5v-6.8c0-.4.17-.79.47-1.06l2.6-2.34c.54-.49 1.32-.49 1.86 0l2.6 2.34c.3.27.47.66.47 1.06v6.8" />
          <path d="M12 6.1v5.9" />
          <path d="M9.7 9.3 12 12l2.3-2.7" />
        </svg>
      );
    case "megaphone":
      return (
        <svg {...commonProps}>
          <path d="M4.5 14.5v-5l10-3.5v12l-10-3.5Z" />
          <path d="M14.5 10.5h2.8c1.77 0 3.2 1.43 3.2 3.2v.6" />
          <path d="M7.8 17.1 9 21.2" />
        </svg>
      );
    case "people":
      return (
        <svg {...commonProps}>
          <circle cx="9" cy="9" r="2.6" />
          <circle cx="16.5" cy="8.5" r="2.2" />
          <path d="M4.8 18.5c.9-2.2 2.4-3.3 4.3-3.3 1.9 0 3.4 1.1 4.3 3.3" />
          <path d="M14 18.4c.55-1.55 1.63-2.32 3.2-2.32 1.31 0 2.34.6 3.1 1.82" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...commonProps}>
          <path d="M13 2.8 6.7 13.2h4.7l-1.1 8 7-11.2h-4.6l.3-7.2Z" />
        </svg>
      );
    case "bag":
      return (
        <svg {...commonProps}>
          <path d="M6.5 8.5h11l1 10.5H5.5L6.5 8.5Z" />
          <path d="M9 9V7.7c0-1.66 1.34-3 3-3s3 1.34 3 3V9" />
        </svg>
      );
    default:
      return <span style={{ fontSize: 11, fontWeight: 800 }}>{iconLabel.slice(0, 2).toUpperCase()}</span>;
  }
}

function renderPluginIcon(pluginId: string, size = 30) {
  switch (pluginId) {
    case "figma":
      return <FigmaIcon size={size} />;
    case "canva":
      return <CanvaIcon size={size} />;
    case "linear":
      return <LinearIcon size={size} />;
    case "notion":
      return <NotionIcon size={size} />;
    case "slack":
      return <SlackIcon size={size} />;
    case "github":
      return <GitHubIcon size={size} />;
    case "jira":
      return <JiraIcon size={size} />;
    case "trello":
      return <TrelloIcon size={size} />;
    case "hubspot":
      return <HubSpotIcon size={size} />;
    case "salesforce":
      return <SalesforceIcon size={size} />;
    case "shopify":
      return <ShopifyIcon size={size} />;
    case "google-drive":
      return <GoogleDriveIcon size={size} />;
    case "airtable":
      return <AirtableIcon size={size} />;
    case "discord":
      return <DiscordIcon size={size} />;
    case "x":
      return <XIcon size={size} />;
    case "youtube":
      return <YouTubeIcon size={size} />;
    case "zapier":
      return <ZapierIcon size={size} />;
    case "dropbox":
      return <DropboxIcon size={size} />;
    default:
      return (
        <div
          style={{
            width: size,
            height: size,
            borderRadius: size * 0.28,
            display: "grid",
            placeItems: "center",
            background: "#0f172a",
            color: "#ffffff",
            fontSize: Math.max(12, Math.round(size * 0.34)),
            fontWeight: 800,
          }}
        >
          {pluginId.slice(0, 2).toUpperCase()}
        </div>
      );
  }
}

function FigmaIcon({ size }: { size: number }) {
  const circle = (cx: number, cy: number, fill: string) => <circle cx={cx} cy={cy} r="6" fill={fill} />;
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      {circle(12, 8, "#f24e1e")}
      {circle(24, 8, "#ff7262")}
      {circle(12, 18, "#a259ff")}
      {circle(24, 18, "#1abcfe")}
      {circle(12, 28, "#0acf83")}
      <rect x="6" y="2" width="12" height="12" rx="6" fill="none" />
    </svg>
  );
}

function CanvaIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <defs>
        <linearGradient id="canvaGradient" x1="4" y1="4" x2="32" y2="32">
          <stop offset="0%" stopColor="#00c4cc" />
          <stop offset="100%" stopColor="#7b61ff" />
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="15" fill="url(#canvaGradient)" />
      <path
        d="M22.8 10.6c-1.15-.9-2.5-1.35-4.03-1.35-4.2 0-7.27 3.3-7.27 8.63 0 4.95 2.75 8.12 7.03 8.12 1.76 0 3.17-.5 4.33-1.56l-1.5-2.14c-.78.62-1.56.9-2.47.9-2.33 0-3.94-1.96-3.94-5.42 0-3.6 1.7-5.74 4.18-5.74.82 0 1.55.23 2.29.77l1.38-2.21Z"
        fill="#ffffff"
      />
    </svg>
  );
}

function LinearIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="15" fill="#111827" />
      <path d="M12 11h3v14h-3z" fill="#ffffff" />
      <path d="M17 11h7v3h-7z" fill="#ffffff" />
      <path d="M17 22h7v3h-7z" fill="#ffffff" />
      <path d="M15.5 20.5 24 12" stroke="#ffffff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function NotionIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="6.5" y="6.5" width="23" height="23" rx="3.5" fill="#ffffff" stroke="#111111" strokeWidth="2.2" />
      <path d="M13 24V12.6l1.95-.52 7.05 8.8v-8.26H24V24h-1.8l-7.2-9.03V24H13Z" fill="#111111" />
    </svg>
  );
}

function SlackIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="14.2" y="4.8" width="5.2" height="12.6" rx="2.6" fill="#36c5f0" />
      <rect x="18.7" y="14.2" width="12.6" height="5.2" rx="2.6" fill="#2eb67d" />
      <rect x="16.6" y="18.6" width="5.2" height="12.6" rx="2.6" fill="#ecb22e" />
      <rect x="4.8" y="16.6" width="12.6" height="5.2" rx="2.6" fill="#e01e5a" />
      <rect x="20.2" y="4.8" width="5.2" height="9.4" rx="2.6" fill="#2eb67d" />
      <rect x="21.8" y="20.2" width="9.4" height="5.2" rx="2.6" fill="#36c5f0" />
      <rect x="10.6" y="21.8" width="5.2" height="9.4" rx="2.6" fill="#e01e5a" />
      <rect x="4.8" y="10.6" width="9.4" height="5.2" rx="2.6" fill="#ecb22e" />
    </svg>
  );
}

function GitHubIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="3" y="3" width="30" height="30" rx="8" fill="#111111" />
      <path
        d="M18 9.2c-4.7 0-8.5 3.8-8.5 8.5 0 3.75 2.43 6.93 5.8 8.05.43.08.59-.18.59-.41 0-.2-.01-.87-.01-1.58-2.36.51-2.86-1-2.86-1-.38-.98-.94-1.24-.94-1.24-.77-.52.06-.51.06-.51.85.06 1.3.88 1.3.88.76 1.29 1.98.92 2.47.7.08-.55.3-.92.55-1.13-1.88-.21-3.86-.94-3.86-4.18 0-.92.33-1.68.87-2.27-.09-.21-.38-1.08.08-2.24 0 0 .71-.23 2.33.87.67-.19 1.39-.28 2.1-.28s1.43.09 2.1.28c1.62-1.1 2.33-.87 2.33-.87.46 1.16.17 2.03.08 2.24.54.59.87 1.35.87 2.27 0 3.25-1.99 3.96-3.89 4.17.31.27.58.79.58 1.59 0 1.15-.01 2.07-.01 2.36 0 .23.15.5.6.41 3.36-1.13 5.78-4.3 5.78-8.05 0-4.7-3.8-8.5-8.5-8.5Z"
        fill="#ffffff"
      />
    </svg>
  );
}

function JiraIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M10 6h10l4 4-8 8-6-6Z" fill="#2684ff" />
      <path d="M16 18h10l4 4-8 8-6-6Z" fill="#0052cc" />
      <path d="m16 18 4-4 6 6-4 4Z" fill="#4c9aff" />
    </svg>
  );
}

function TrelloIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="4" y="4" width="28" height="28" rx="8" fill="#0ea5e9" />
      <rect x="10" y="10" width="6.5" height="14" rx="2.5" fill="#ffffff" />
      <rect x="19.5" y="10" width="6.5" height="10" rx="2.5" fill="#dbeafe" />
    </svg>
  );
}

function HubSpotIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="17.5" cy="18" r="5.2" fill="#f97316" />
      <circle cx="27.5" cy="10" r="2.6" fill="#fdba74" />
      <circle cx="27.5" cy="26" r="2.6" fill="#fdba74" />
      <path d="M22.5 15.5 25.5 12.9" stroke="#f97316" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M22.5 20.5 25.5 23.1" stroke="#f97316" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10.5 18H6.5" stroke="#f97316" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function SalesforceIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M24.8 14.2c-.68-2.5-2.94-4.33-5.64-4.33-2.27 0-4.21 1.27-5.2 3.15-.3-.07-.62-.11-.95-.11-2.4 0-4.35 1.95-4.35 4.35s1.95 4.35 4.35 4.35h11.65c2.05 0 3.72-1.66 3.72-3.72s-1.56-3.64-3.58-3.69Z" fill="#60a5fa" />
      <path d="M12.5 24.5h12c2.05 0 3.72-1.66 3.72-3.72 0-.35-.05-.69-.14-1.01-.58 1.44-1.99 2.46-3.64 2.46H12.8c-1.57 0-3-.65-4.02-1.7.52 2.22 2.51 3.97 4.72 3.97Z" fill="#2563eb" />
    </svg>
  );
}

function ShopifyIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M9 11.5 27 9.8l-1.6 16.6H10.2L9 11.5Z" fill="#22c55e" />
      <path d="M12.8 12.4c.28-2.76 1.97-5.64 4.54-5.64 1 0 1.7.39 2.13.92 1.02.12 1.69.96 2.1 2.02l-1.33.41c-.22-.56-.55-.99-1.04-1.2l-.77 8.13-1.68.52.75-7.91c-.15-.02-.3-.03-.47-.03-1.44 0-2.52 1.8-2.72 3.15l-1.51-.41Z" fill="#dcfce7" />
      <path d="M14.2 20.8c1.05.56 2.45.7 3.6.47 1.48-.31 2.18-1.18 2.18-2.05 0-.73-.47-1.22-1.56-1.78-1.32-.69-2.16-1.53-2.16-2.72 0-2.04 1.72-3.55 4.37-3.55 1.14 0 1.96.23 2.54.48l-.56 1.73c-.4-.19-1.1-.44-2.08-.44-1.33 0-1.98.72-1.98 1.42 0 .69.58 1.09 1.7 1.69 1.42.77 2.07 1.63 2.07 2.82 0 2.31-1.83 3.82-4.71 3.82-1.3 0-2.52-.3-3.12-.73l.51-1.76Z" fill="#ffffff" />
    </svg>
  );
}

function GoogleDriveIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M13 6h10l6.8 11.6h-9.5L13 6Z" fill="#fbbf24" />
      <path d="M10.2 17.6 17 6 5.8 6l-6.7 11.6h11.1Z" fill="#22c55e" />
      <path d="M16.5 29.4h13.1l-5.8-9.9H10.7l5.8 9.9Z" fill="#3b82f6" />
    </svg>
  );
}

function AirtableIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M9 8.5 18 4l9 4.5L18 13 9 8.5Z" fill="#f59e0b" />
      <path d="M8.8 13.4 17 17.4v8.8l-8.2-4.4v-8.4Z" fill="#fcd34d" />
      <path d="M27.2 13.4 19 17.4v8.8l8.2-4.4v-8.4Z" fill="#fb7185" />
    </svg>
  );
}

function DiscordIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="4.5" y="6.5" width="27" height="23" rx="11.5" fill="#6366f1" />
      <path d="M12.5 24c1.9 1.4 4 1.8 5.5 1.8S21.6 25.4 23.5 24l-1.1-1.8c-1.28.93-2.7 1.39-4.4 1.39-1.7 0-3.12-.46-4.4-1.39L12.5 24Zm3.2-7.4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm4.6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-8 .4c.85-.63 1.75-1 2.68-1.16l.38.77c.82-.12 1.64-.12 2.46 0l.38-.77c.93.16 1.83.53 2.68 1.16.72 1.1 1.15 2.29 1.27 3.59-.93.67-1.82 1.08-2.68 1.33-.21-.27-.39-.56-.55-.87.3-.11.58-.24.86-.39l-.18-.14c-1.65.76-3.56.76-5.21 0l-.18.14c.28.15.56.28.86.39-.16.31-.34.6-.55.87-.86-.25-1.75-.66-2.68-1.33.12-1.3.55-2.49 1.27-3.59Z" fill="#ffffff" />
    </svg>
  );
}

function XIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="4" y="4" width="28" height="28" rx="8" fill="#111111" />
      <path d="M12 10h3.9l3.1 4.5 3.7-4.5h2.2l-4.9 5.95L25 26h-3.9l-3.4-4.94L13.6 26h-2.2l5.28-6.42L12 10Zm2.9 1.8L22 24.2h1.25l-7.1-12.4H14.9Z" fill="#ffffff" />
    </svg>
  );
}

function YouTubeIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <rect x="5" y="9" width="26" height="18" rx="8" fill="#ef4444" />
      <path d="M15 13.8 23.5 18 15 22.2v-8.4Z" fill="#ffffff" />
    </svg>
  );
}

function ZapierIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <circle cx="18" cy="18" r="15" fill="#f97316" />
      <path d="M18 8v20M8 18h20M10.7 10.7l14.6 14.6M25.3 10.7 10.7 25.3" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

function DropboxIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="m9 10 6 4-6 4-6-4 6-4Zm18 0 6 4-6 4-6-4 6-4ZM9 18.5l6 4-6 4-6-4 6-4Zm18 0 6 4-6 4-6-4 6-4ZM18 23.8l6 4-6 3.2-6-3.2 6-4Z" fill="#2563eb" />
    </svg>
  );
}
