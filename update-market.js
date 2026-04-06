const fs = require('fs');

const content = `import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { TrendingUp, TrendingDown, Minus, RefreshCw, AlertCircle, Wifi, WifiOff, ExternalLink, Star } from "lucide-react";
import { useMarketStore } from "@/store/marketStore";
import { api } from "@/api";
import { formatPrice, formatPct, formatVolume, COIN_COLORS, COIN_ICONS, cn } from "@/lib/utils";
import type { Ticker, Signal, NewsArticle } from "@/types";
import { SparklineChart } from "@/components/market/SparklineChart";
import { useT } from "@/hooks/useT";

export default function MarketPage() {
  const prices = useMarketStore((s) => s.prices);
  const latestSignals = useMarketStore((s) => s.latestSignals);
  const wsConnected = useMarketStore((s) => s.wsConnected);
  const setPrices = useMarketStore((s) => s.setPrices);
  const lang = useMarketStore((s) => s.lang);
  const [baseTickers, setBaseTickers] = useState<Ticker[]>([]);
  const [signals, setSignals] = useState<Record<string, Signal>>({});
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [fearGreed, setFearGreed] = useState<{ value: number; classification: string } | null>(null);
  const [marketDepth, setMarketDepth] = useState<Record<string, { orderbook: { imbalance: number; signal_score: number; spread_pct: number }; iv: { dvol: number; regime: string } }>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const t = useT();
  const [activeTab, setActiveTab] = useState('All');

  const loadData = useCallback(async () => {
    setError("");
    try {
      const [priceRes, signalRes, newsRes, fngRes, depthRes] = await Promise.all([
        api.getPrices(),
        api.getLatestSignals(),
        api.getNews(15),
        api.getFearGreed().catch(() => null),
        api.getMarketDepth().catch(() => null),
      ]);
      setBaseTickers(priceRes.data);
      setPrices(priceRes.data);
      const map: Record<string, Signal> = {};
      signalRes.data.forEach((s) => (map[s.symbol] = s));
      setSignals(map);
      setNews(newsRes.data);
      if (fngRes?.data) setFearGreed(fngRes.data);
      if (depthRes?.data) setMarketDepth(depthRes.data);
    } catch {
      setError(t.market.error);
    } finally {
      setLoading(false);
    }
  }, [setPrices, t]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const id = setInterval(loadData, 30_000);
    return () => clearInterval(id);
  }, [loadData]);

  const symbolOrder = baseTickers.length > 0
    ? baseTickers.map((t) => t.symbol)
    : Object.keys(prices);

  const displayTickers = symbolOrder
    .map((sym) => ({ ...(baseTickers.find((b) => b.symbol === sym) || {}), ...(prices[sym] || {}) } as Ticker))
    .filter((t) => t.symbol && t.symbol.toLowerCase().includes(search.toLowerCase()));

  const wsOnly = Object.values(prices).filter(
    (p) => !symbolOrder.includes(p.symbol) && p.symbol.toLowerCase().includes(search.toLowerCase())
  );
  const allTickers = [...displayTickers, ...wsOnly];

  const mergedSignals = { ...signals, ...latestSignals };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between mb-6">
          <div>
            <div className="h-6 w-40 bg-bg-card rounded animate-pulse mb-2" />
            <div className="h-4 w-24 bg-bg-card rounded animate-pulse" />
          </div>
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-bg-card rounded animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto pb-10">
      {/* Header Area */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 mt-4 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">Markets Overview</h1>
          <div className="flex items-center gap-3">
            {wsConnected
              ? <span className="flex items-center gap-1 text-xs text-accent-green bg-accent-green/10 px-2 py-1 rounded"><Wifi size={12} />Live</span>
              : <span className="flex items-center gap-1 text-xs text-text-muted bg-bg-card px-2 py-1 rounded"><WifiOff size={12} />Polling</span>}
            <span className="text-text-secondary text-sm">Real-time market insights</span>
          </div>
        </div>
        
        {fearGreed && (
          <div className="flex items-center gap-4 bg-bg-card p-4 rounded-xl border border-bg-border min-w-[300px]">
             <div>
               <div className="text-xs text-text-muted mb-1">Fear & Greed Index</div>
               <div className={cn("text-xl font-bold flex items-center gap-2", 
                  fearGreed.value <= 45 ? "text-accent-red" : fearGreed.value >= 55 ? "text-accent-green" : "text-accent-yellow"
               )}>
                  {fearGreed.value} <span className="text-sm font-medium">{fearGreed.classification}</span>
               </div>
             </div>
             <div className="relative flex-1 h-2 bg-bg-hover rounded-full overflow-hidden ml-4">
                <div
                  className={cn(
                    "absolute left-0 top-0 h-full rounded-full transition-all",
                    fearGreed.value <= 45 ? "bg-accent-red" : fearGreed.value >= 55 ? "bg-accent-green" : "bg-accent-yellow"
                  )}
                  style={{ width: \`\${Math.max(5, fearGreed.value)}%\` }}
                />
             </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-accent-red/10 border border-accent-red/20 text-accent-red rounded px-4 py-3 mb-6 text-sm">
          <AlertCircle size={16} />
          {error}
          <button onClick={loadData} className="ml-auto underline text-xs">Retry</button>
        </div>
      )}

      {/* Tabs and Search */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
        <div className="flex space-x-6 border-b border-bg-border w-full sm:w-auto">
          {['Favorites', 'All', 'Spot', 'Futures', 'New Listing'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "pb-3 text-sm font-medium transition-colors relative",
                activeTab === tab ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {tab}
              {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-accent-yellow rounded-t" />}
            </button>
          ))}
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative">
             <input
              type="text"
              placeholder="Search Coin Name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-bg-secondary border border-bg-border rounded px-3 py-1.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-yellow w-full sm:w-64 pl-8"
            />
            <svg className="w-4 h-4 text-text-muted absolute left-2.5 top-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm">
          <thead>
            <tr className="border-b border-bg-border/50 hover:bg-transparent">
              <th className="text-left text-text-secondary font-medium px-2 py-3 w-10"></th>
              <th className="text-left text-text-secondary font-medium px-4 py-3 cursor-pointer hover:text-text-primary">Name</th>
              <th className="text-right text-text-secondary font-medium px-4 py-3 cursor-pointer hover:text-text-primary">Price</th>
              <th className="text-right text-text-secondary font-medium px-4 py-3 cursor-pointer hover:text-text-primary">24h Change</th>
              <th className="text-right text-text-secondary font-medium px-4 py-3 cursor-pointer hover:text-text-primary hidden md:table-cell">24h Volume</th>
              <th className="text-center text-text-secondary font-medium px-4 py-3">Market Regime</th>
              <th className="text-center text-text-secondary font-medium px-4 py-3">AI Signal</th>
              <th className="text-right text-text-secondary font-medium px-4 py-3">Trend (7d)</th>
            </tr>
          </thead>
          <tbody>
            {allTickers.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-text-muted py-12">
                  {error ? t.market.loadFailed : t.market.noResults}
                </td>
              </tr>
            ) : (
              allTickers.map((ticker) => {
                const signal = mergedSignals[ticker.symbol];
                const isUp = ticker.change_24h_pct >= 0;
                return (
                  <tr
                    key={ticker.symbol}
                    onClick={() => navigate(\`/coin/\${ticker.symbol}\`)}
                    className="border-b border-bg-border/30 hover:bg-bg-hover cursor-pointer group"
                  >
                    <td className="px-2 py-4">
                       <Star size={16} className="text-text-muted hover:text-accent-yellow transition-colors cursor-pointer" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shadow-sm"
                          style={{
                            backgroundColor: (COIN_COLORS[ticker.symbol] ?? "#888888") + "15",
                            color: COIN_COLORS[ticker.symbol] ?? "#888888",
                          }}
                        >
                          {COIN_ICONS[ticker.symbol] || ticker.symbol[0]}
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="font-bold text-text-primary text-base">{ticker.symbol}</span>
                          <span className="text-text-muted text-xs bg-bg-card px-1.5 py-0.5 rounded border border-bg-border">USDT</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className="font-medium text-text-primary tracking-wide text-base">
                        \${formatPrice(ticker.price)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <span className={cn("font-medium text-base", isUp ? "text-accent-green" : "text-accent-red")}>
                        {isUp ? "+" : ""}{formatPct(ticker.change_24h_pct)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right text-text-primary hidden md:table-cell font-medium">
                      \${formatVolume(ticker.volume_24h_usdt)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <MarketEnvBadge env={ticker.market_env} />
                    </td>
                    <td className="px-4 py-4 text-center">
                      {signal ? <SignalBadge signal={signal} /> : <span className="text-text-muted">--</span>}
                    </td>
                    <td className="px-4 py-4">
                      <div className="w-[120px] ml-auto opacity-70 group-hover:opacity-100 transition-opacity">
                        <SparklineChart data={ticker.sparkline_7d} positive={isUp} />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      {/* News Grid (Binance Style) */}
      {news.length > 0 && (
         <div className="mt-12">
            <h2 className="text-xl font-bold text-text-primary mb-6">Latest Crypto News</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {news.slice(0, 6).map((article, i) => (
                  <a key={i} href={article.url} target="_blank" rel="noopener noreferrer" className="block bg-bg-secondary hover:bg-bg-hover transition-colors border border-bg-border rounded-lg p-5 group">
                     <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-medium text-accent-yellow bg-accent-yellow/10 px-2 py-0.5 rounded">
                           {article.source}
                        </span>
                        <span className="text-text-muted text-xs">
                           {article.published ? new Date(article.published).toLocaleDateString() : 'Just now'}
                        </span>
                     </div>
                     <h3 className="text-text-primary font-medium line-clamp-2 mb-2 group-hover:text-accent-yellow transition-colors">
                        {lang === "zh" && article.title_zh ? article.title_zh : article.title}
                     </h3>
                     <p className="text-text-secondary text-sm line-clamp-2">
                        {lang === "zh" && article.summary_zh ? article.summary_zh : cleanSummary(article.summary, article.title) || 'Click to read more details about this news...'}
                     </p>
                  </a>
               ))}
            </div>
         </div>
      )}
    </div>
  );
}

function cleanSummary(raw: string, title: string): string {
  const text = raw.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\\s+/g, " ").trim();
  if (!text || text.length < 20 || title.toLowerCase().startsWith(text.slice(0, 30).toLowerCase())) return "";
  return text.slice(0, 200);
}

function MarketEnvBadge({ env }: { env: string }) {
  const t = useT();
  const map: Record<string, { label: string; color: string }> = {
    ABOVE_MA60: { label: t.market.regimes.strong, color: "text-accent-green bg-accent-green/10" },
    BETWEEN: { label: t.market.regimes.neutral, color: "text-accent-yellow bg-accent-yellow/10" },
    BELOW_MA120: { label: t.market.regimes.weak, color: "text-accent-red bg-accent-red/10" },
    UNKNOWN: { label: "Neutral", color: "text-text-secondary bg-bg-card border border-bg-border" },
  };
  const { label, color } = map[env] || map.UNKNOWN;
  return <span className={cn("text-xs px-2.5 py-1 rounded inline-block font-medium", color)}>{label}</span>;
}

function SignalBadge({ signal }: { signal: Signal }) {
  const t = useT();
  const map: Record<string, { label: string; color: string }> = {
    BUY: { label: t.market.signals.buy, color: "text-accent-green bg-accent-green/10 border border-accent-green/20" },
    SELL: { label: t.market.signals.sell, color: "text-accent-red bg-accent-red/10 border border-accent-red/20" },
    HOLD: { label: t.market.signals.hold, color: "text-text-secondary bg-bg-card border border-bg-border" },
  };
  const { label, color } = map[signal.action] || map.HOLD;
  return (
    <span className={cn("inline-block text-xs px-3 py-1 rounded font-medium", color)}>
      {label}
      {signal.confidence > 0 && <span className="ml-1 opacity-70 border-l border-current pl-1 ml-1">{Math.round(signal.confidence * 100)}%</span>}
    </span>
  );
}
`;

fs.writeFileSync('D:\\GitHub\\Quantitative Finance\\frontend\\src\\pages\\MarketPage.tsx', content);
