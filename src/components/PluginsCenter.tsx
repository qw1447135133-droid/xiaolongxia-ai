"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { PLUGIN_CATALOG, PLUGIN_PACKS, type PluginPermission, type PluginSpec } from "@/lib/plugin-runtime";

export function PluginsCenter() {
  const enabledPluginIds = useStore(s => s.enabledPluginIds);
  const togglePlugin = useStore(s => s.togglePlugin);
  const applyPluginPack = useStore(s => s.applyPluginPack);
  const [category, setCategory] = useState<string>("all");
  const [permissionFilter, setPermissionFilter] = useState<"all" | PluginPermission>("all");

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        className="card"
        style={{
          padding: 18,
          background: "linear-gradient(135deg, rgba(244, 114, 182, 0.14), rgba(255,255,255,0.02))",
          borderColor: "rgba(244, 114, 182, 0.22)",
        }}
      >
        <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Plugins Center
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, lineHeight: 1.2 }}>
          Lightweight extension board modeled after the openhanako plugin entry
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.8, marginTop: 8 }}>
          This first pass focuses on visibility and control: plugin catalog, contribution hints, permission labels, and quick packs. It keeps the current app stable while preparing for deeper extension flows later.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <PluginMetric label="Catalog Size" value={PLUGIN_CATALOG.length} accent="var(--accent)" />
        <PluginMetric label="Enabled" value={enabledPlugins.length} accent="#f472b6" />
        <PluginMetric label="Full Access" value={fullAccessCount} accent="var(--warning)" />
        <PluginMetric label="Restricted" value={enabledPlugins.length - fullAccessCount} accent="var(--success)" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(280px, 0.9fr)", gap: 12 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Plugin Packs</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
            Opinionated bundles for extension patterns we are most likely to bring over next.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
            {PLUGIN_PACKS.map(pack => (
              <article
                key={pack.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: 14,
                  borderRadius: 18,
                  border: `1px solid ${pack.accent}33`,
                  background: `linear-gradient(180deg, ${pack.accent}1f, rgba(255,255,255,0.02) 55%)`,
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 700 }}>{pack.title}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.7 }}>{pack.description}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {pack.pluginIds.map(pluginId => {
                    const plugin = PLUGIN_CATALOG.find(item => item.id === pluginId);
                    return (
                      <span
                        key={`${pack.id}-${pluginId}`}
                        style={{
                          padding: "4px 8px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.04)",
                          fontSize: 11,
                        }}
                      >
                        {plugin?.name ?? pluginId}
                      </span>
                    );
                  })}
                </div>
                <button type="button" className="btn-ghost" onClick={() => applyPluginPack(pack.id)}>
                  Enable Pack
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Extension Notes</div>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <PluginNote
              label="Most Common Contribution"
              value={mostCommonContribution(enabledPlugins)}
            />
            <PluginNote
              label="Advanced Risk"
              value={fullAccessCount > 0 ? `${fullAccessCount} enabled plugin(s) require full access` : "No full-access plugins enabled"}
            />
            <PluginNote
              label="Current Goal"
              value="Surface plugin thinking and extension boundaries before wiring deeper backend plugin contracts."
            />
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Plugin Catalog</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
              Filter by category and permission, then toggle plugins on or off locally.
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
                {item === "all" ? "All Categories" : item}
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
                }}
              >
                {item === "all" ? "All Permissions" : item}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
          {filteredPlugins.map(plugin => {
            const enabled = enabledPluginIds.includes(plugin.id);

            return (
              <article
                key={plugin.id}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  padding: 14,
                  borderRadius: 18,
                  border: `1px solid ${enabled ? `${plugin.accent}66` : "var(--border)"}`,
                  background: enabled
                    ? `linear-gradient(180deg, ${plugin.accent}1f, rgba(255,255,255,0.03) 60%)`
                    : "rgba(255,255,255,0.025)",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{plugin.name}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                      v{plugin.version} · {plugin.source}
                    </div>
                  </div>
                  <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                    <span style={badgeStyle(plugin.permission === "full-access" ? "var(--warning)" : "var(--success)")}>
                      {plugin.permission}
                    </span>
                    <span style={badgeStyle(plugin.accent)}>{plugin.category}</span>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.75 }}>
                  {plugin.description}
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

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: "auto" }}>
                  <span style={{ fontSize: 11, color: enabled ? "var(--accent)" : "var(--text-muted)", fontWeight: 700 }}>
                    {enabled ? "Enabled locally" : "Disabled locally"}
                  </span>
                  <button type="button" className="btn-ghost" onClick={() => togglePlugin(plugin.id)}>
                    {enabled ? "Disable" : "Enable"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PluginMetric({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 8, color: accent }}>{value}</div>
    </div>
  );
}

function PluginNote({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: 12,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.025)",
      }}
    >
      <span style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function mostCommonContribution(enabledPlugins: PluginSpec[]) {
  if (enabledPlugins.length === 0) return "No plugins enabled";

  const counts = new Map<string, number>();
  for (const plugin of enabledPlugins) {
    for (const contribution of plugin.contributions) {
      counts.set(contribution, (counts.get(contribution) ?? 0) + 1);
    }
  }

  const topEntry = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return topEntry ? `${topEntry[0]} · ${topEntry[1]} plugin(s)` : "No contributions recorded";
}

function badgeStyle(color: string) {
  return {
    padding: "3px 8px",
    borderRadius: 999,
    border: `1px solid ${color}33`,
    background: `${color}1f`,
    color,
    fontSize: 10,
    fontWeight: 700,
  };
}
