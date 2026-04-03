"use client";

import { useMemo } from "react";
import { useStore } from "@/store";
import { PLUGIN_CATALOG } from "@/lib/plugin-runtime";

export function PluginContributionPanel() {
  const enabledPluginIds = useStore(s => s.enabledPluginIds);
  const setTab = useStore(s => s.setTab);
  const setActiveControlCenterSection = useStore(s => s.setActiveControlCenterSection);

  const enabledPlugins = useMemo(
    () => PLUGIN_CATALOG.filter(plugin => enabledPluginIds.includes(plugin.id)),
    [enabledPluginIds],
  );

  if (enabledPlugins.length === 0) {
    return (
      <section className="workspace-card">
        <div className="workspace-card__head">
          <div>
            <div className="workspace-card__eyebrow">Plugin Runtime</div>
            <div className="workspace-card__title">No plugin contributions active yet</div>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
          Enable plugins in the Plugins Center to let the workbench surface extension cards here.
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-card">
      <div className="workspace-card__head">
        <div>
          <div className="workspace-card__eyebrow">Plugin Runtime</div>
          <div className="workspace-card__title">Enabled plugin contribution cards</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {enabledPlugins.map(plugin => (
          <article
            key={plugin.id}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 180,
              padding: 14,
              borderRadius: 18,
              border: `1px solid ${plugin.accent}44`,
              background: `linear-gradient(180deg, ${plugin.accent}1f, rgba(255,255,255,0.03) 58%)`,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{plugin.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                  {plugin.category} · v{plugin.version}
                </div>
              </div>
              <span
                style={{
                  padding: "3px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.08)",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                active
              </span>
            </div>

            <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
              {plugin.headline}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {plugin.contributions.map(item => (
                <span
                  key={`${plugin.id}-${item}`}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.04)",
                    fontSize: 11,
                  }}
                >
                  {item}
                </span>
              ))}
            </div>

            <button
              type="button"
              className="btn-ghost"
              style={{ marginTop: "auto" }}
              onClick={() => {
                if (plugin.actionTarget === "settings" && plugin.controlCenterSectionId) {
                  setActiveControlCenterSection(plugin.controlCenterSectionId);
                }
                setTab(plugin.actionTarget);
              }}
            >
              {plugin.actionLabel}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
