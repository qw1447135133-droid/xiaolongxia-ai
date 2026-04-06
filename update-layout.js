const fs = require('fs');
const path = require('path');

const topNavContent = `import { NavLink, useNavigate } from "react-router-dom";
import { BarChart2, Clock, Briefcase, Settings, LogOut, Wifi, WifiOff, FlaskConical, Menu, X, TrendingUp, Bell } from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useMarketStore } from "@/store/marketStore";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/useT";

export function TopNav() {
  const logout = useAuthStore((s) => s.logout);
  const wsConnected = useMarketStore((s) => s.wsConnected);
  const lang = useMarketStore((s) => s.lang);
  const setLang = useMarketStore((s) => s.setLang);
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useT();

  const NAV = [
    { to: "/", label: t.nav.market },
    { to: "/history", label: t.nav.signals },
    { to: "/trades", label: t.nav.trades },
    { to: "/portfolio", label: t.nav.portfolio },
    { to: "/backtest", label: t.nav.backtest },
    { to: "/control", label: t.nav.control },
    { to: "/settings", label: t.nav.settings },
  ];

  return (
    <header className="h-[60px] bg-bg-secondary border-b border-bg-border flex items-center justify-between px-4 sticky top-0 z-50">
      <div className="flex items-center h-full">
        <div className="flex items-center gap-2 mr-6 text-accent-yellow font-bold text-xl cursor-pointer" onClick={() => navigate('/')}>
          <BarChart2 className="text-accent-yellow" size={24} />
          <span>Binance Quant</span>
        </div>
        
        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center h-full gap-1">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "h-full px-3 flex items-center text-sm font-medium transition-colors hover:text-accent-yellow",
                  isActive
                    ? "text-text-primary border-b-2 border-accent-yellow"
                    : "text-text-secondary"
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-4 text-text-secondary">
          <div title={wsConnected ? t.common.liveConn : t.common.disconnected}>
            {wsConnected
              ? <Wifi size={18} className="text-accent-green" /> 
              : <WifiOff size={18} className="text-text-muted" />}
          </div>
          <button
            onClick={() => setLang(lang === "zh" ? "en" : "zh")} 
            className="hover:text-accent-yellow transition-colors text-xs font-medium px-2 py-1 rounded bg-bg-card border border-bg-border"
          >
            {lang === "zh" ? "EN" : "中"}
          </button>
          <button
            onClick={() => { logout(); navigate("/login"); }}    
            className="hover:text-accent-red transition-colors flex items-center gap-1"
            title={t.common.logout}
          >
            <LogOut size={18} />
          </button>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden text-text-secondary hover:text-text-primary"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="absolute top-[60px] left-0 w-full bg-bg-secondary border-b border-bg-border p-4 md:hidden flex flex-col gap-4 shadow-xl">
          <nav className="flex flex-col gap-2">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "p-3 rounded text-sm font-medium",
                    isActive
                      ? "bg-bg-hover text-accent-yellow"
                      : "text-text-secondary hover:bg-bg-hover"
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center justify-between pt-4 border-t border-bg-border text-text-secondary">
            <div className="flex items-center gap-2">
               {wsConnected ? <Wifi size={18} className="text-accent-green" /> : <WifiOff size={18} className="text-text-muted" />}
               <span className="text-sm">{wsConnected ? "Connected" : "Disconnected"}</span>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={() => { setLang(lang === "zh" ? "en" : "zh"); setMobileOpen(false); }} className="text-sm font-medium">
                {lang === "zh" ? "English" : "中文"}
              </button>
              <button onClick={() => { logout(); navigate("/login"); }} className="text-sm text-accent-red flex items-center gap-1">
                <LogOut size={16} /> Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
`;

const dashboardLayoutContent = `import { Outlet } from "react-router-dom";
import { TopNav } from "./TopNav";
import { useWebSocket } from "@/hooks/useWebSocket";

export function DashboardLayout() {
  useWebSocket(); // Start WS connection for the whole app

  return (
    <div className="flex flex-col min-h-screen bg-bg-primary">
      <TopNav />
      <main className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 overflow-x-hidden">
        <Outlet />
      </main>
    </div>
  );
}
`;

fs.writeFileSync('D:\\GitHub\\Quantitative Finance\\frontend\\src\\components\\layout\\TopNav.tsx', topNavContent);
fs.writeFileSync('D:\\GitHub\\Quantitative Finance\\frontend\\src\\components\\layout\\DashboardLayout.tsx', dashboardLayoutContent);
