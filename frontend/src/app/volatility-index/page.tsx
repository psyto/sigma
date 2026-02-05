"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, AreaSeries } from "lightweight-charts";
import { Activity, TrendingUp, TrendingDown, BarChart3, AlertCircle } from "lucide-react";

// Mock volatility data
function generateMockVolData() {
  const data = [];
  let vol = 35;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 100; i >= 0; i--) {
    vol = Math.max(15, Math.min(85, vol + (Math.random() - 0.5) * 5));
    data.push({
      time: now - i * 3600,
      value: vol,
    });
  }
  return data;
}

const volatilityRegimes = [
  { name: "Very Low", range: "< 15%", color: "#22c55e", description: "Extremely calm markets" },
  { name: "Low", range: "15-25%", color: "#84cc16", description: "Below normal conditions" },
  { name: "Normal", range: "25-45%", color: "#eab308", description: "Typical market conditions" },
  { name: "High", range: "45-70%", color: "#f97316", description: "Elevated volatility" },
  { name: "Extreme", range: "> 70%", color: "#ef4444", description: "Crisis levels" },
];

export default function VolatilityIndexPage() {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<IChartApi | null>(null);
  const [currentSVI, setCurrentSVI] = useState(42.5);
  const [change24h, setChange24h] = useState(3.2);
  const [avg7d, setAvg7d] = useState(38.2);
  const [avg30d, setAvg30d] = useState(36.8);
  const [realizedVol, setRealizedVol] = useState(40.1);
  const [impliedVol, setImpliedVol] = useState(45.3);
  const [currentRegime, setCurrentRegime] = useState("Normal");

  useEffect(() => {
    if (!chartRef.current) return;

    const newChart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#1e2329" },
        textColor: "#848e9c",
      },
      grid: {
        vertLines: { color: "#2b3139" },
        horzLines: { color: "#2b3139" },
      },
      width: chartRef.current.clientWidth,
      height: 350,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const areaSeries = newChart.addSeries(AreaSeries, {
      topColor: "rgba(99, 102, 241, 0.4)",
      bottomColor: "rgba(99, 102, 241, 0.0)",
      lineColor: "#6366f1",
      lineWidth: 2,
    });

    areaSeries.setData(generateMockVolData() as any);
    setChart(newChart);

    const handleResize = () => {
      if (chartRef.current) {
        newChart.applyOptions({ width: chartRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      newChart.remove();
    };
  }, []);

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSVI((v) => Math.max(15, Math.min(85, v + (Math.random() - 0.5) * 2)));
      setRealizedVol((v) => Math.max(15, Math.min(85, v + (Math.random() - 0.5) * 1)));
      setImpliedVol((v) => Math.max(15, Math.min(85, v + (Math.random() - 0.5) * 1)));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const getRegimeColor = (vol: number) => {
    if (vol < 15) return "#22c55e";
    if (vol < 25) return "#84cc16";
    if (vol < 45) return "#eab308";
    if (vol < 70) return "#f97316";
    return "#ef4444";
  };

  const getMeanReversionSignal = () => {
    const diff = currentSVI - avg30d;
    if (diff > 10) return { signal: "Elevated", color: "#ef4444", desc: "Volatility likely to decrease" };
    if (diff < -10) return { signal: "Depressed", color: "#22c55e", desc: "Volatility likely to increase" };
    return { signal: "Neutral", color: "#eab308", desc: "No strong mean reversion signal" };
  };

  const meanReversion = getMeanReversionSignal();

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
          Sigma Volatility Index (SVI)
        </h1>
        <p className="text-[var(--muted)]">
          Real-time volatility tracking for Solana assets. Comparable to Volmex SVIV.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-sm text-[var(--muted)]">SVI-SOL</span>
          </div>
          <p className="text-3xl font-bold" style={{ color: getRegimeColor(currentSVI) }}>
            {currentSVI.toFixed(1)}%
          </p>
          <p className={`text-sm ${change24h >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
            {change24h >= 0 ? "+" : ""}{change24h.toFixed(1)}% 24h
          </p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-[var(--success)]" />
            <span className="text-sm text-[var(--muted)]">Realized Vol</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {realizedVol.toFixed(1)}%
          </p>
          <p className="text-sm text-[var(--muted)]">Historical</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-[#3b82f6]" />
            <span className="text-sm text-[var(--muted)]">Implied Vol</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {impliedVol.toFixed(1)}%
          </p>
          <p className="text-sm text-[var(--muted)]">Options market</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-[var(--muted)]" />
            <span className="text-sm text-[var(--muted)]">7D Avg</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {avg7d.toFixed(1)}%
          </p>
          <p className="text-sm text-[var(--muted)]">Weekly average</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-[var(--muted)]" />
            <span className="text-sm text-[var(--muted)]">30D Avg</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {avg30d.toFixed(1)}%
          </p>
          <p className="text-sm text-[var(--muted)]">Monthly average</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Chart */}
        <div className="col-span-2 bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              SVI-SOL Historical
            </h2>
            <div className="flex gap-2">
              {["1D", "1W", "1M", "3M"].map((tf) => (
                <button
                  key={tf}
                  className="px-3 py-1 text-sm rounded bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div ref={chartRef} />
        </div>

        {/* Mean Reversion Signal */}
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Mean Reversion Signal
          </h2>

          <div className="text-center py-6">
            <div
              className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ backgroundColor: `${meanReversion.color}20`, border: `2px solid ${meanReversion.color}` }}
            >
              <span className="text-2xl font-bold" style={{ color: meanReversion.color }}>
                {meanReversion.signal === "Elevated" ? "E" : meanReversion.signal === "Depressed" ? "D" : "N"}
              </span>
            </div>
            <p className="text-xl font-bold text-[var(--foreground)]" style={{ color: meanReversion.color }}>
              {meanReversion.signal}
            </p>
            <p className="text-sm text-[var(--muted)] mt-2">{meanReversion.desc}</p>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-[var(--background)]">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">Current vs 30D Avg</span>
              <span className={`text-sm font-medium ${currentSVI > avg30d ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>
                {currentSVI > avg30d ? "+" : ""}{(currentSVI - avg30d).toFixed(1)}%
              </span>
            </div>
            <div className="w-full h-2 bg-[var(--border)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0, 50 + ((currentSVI - avg30d) / avg30d) * 100))}%`,
                  backgroundColor: meanReversion.color
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Volatility Regimes */}
      <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)] mb-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
          Volatility Regimes
        </h2>
        <div className="grid grid-cols-5 gap-4">
          {volatilityRegimes.map((regime) => (
            <div
              key={regime.name}
              className={`p-4 rounded-lg border ${currentSVI >= (regime.name === "Very Low" ? 0 : regime.name === "Low" ? 15 : regime.name === "Normal" ? 25 : regime.name === "High" ? 45 : 70) && currentSVI < (regime.name === "Very Low" ? 15 : regime.name === "Low" ? 25 : regime.name === "Normal" ? 45 : regime.name === "High" ? 70 : 100) ? "border-[var(--primary)]" : "border-[var(--border)]"}`}
              style={{ backgroundColor: `${regime.color}10` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: regime.color }}
                />
                <span className="font-medium text-[var(--foreground)]">{regime.name}</span>
              </div>
              <p className="text-sm text-[var(--muted)] mb-1">{regime.range}</p>
              <p className="text-xs text-[var(--muted)]">{regime.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Asset Indices */}
      <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
          All Volatility Indices
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Asset</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Current</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">24h Change</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">7D Avg</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">30D Avg</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Regime</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--border)]">
                <td className="py-4 px-4 font-medium text-[var(--foreground)]">SOL</td>
                <td className="py-4 px-4" style={{ color: getRegimeColor(currentSVI) }}>{currentSVI.toFixed(1)}%</td>
                <td className={`py-4 px-4 ${change24h >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                  {change24h >= 0 ? "+" : ""}{change24h.toFixed(1)}%
                </td>
                <td className="py-4 px-4 text-[var(--foreground)]">{avg7d.toFixed(1)}%</td>
                <td className="py-4 px-4 text-[var(--foreground)]">{avg30d.toFixed(1)}%</td>
                <td className="py-4 px-4">
                  <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: `${getRegimeColor(currentSVI)}20`, color: getRegimeColor(currentSVI) }}>
                    {currentRegime}
                  </span>
                </td>
              </tr>
              <tr className="border-b border-[var(--border)]">
                <td className="py-4 px-4 font-medium text-[var(--foreground)]">BTC</td>
                <td className="py-4 px-4" style={{ color: getRegimeColor(38.2) }}>38.2%</td>
                <td className="py-4 px-4 text-[var(--danger)]">-1.5%</td>
                <td className="py-4 px-4 text-[var(--foreground)]">36.8%</td>
                <td className="py-4 px-4 text-[var(--foreground)]">35.2%</td>
                <td className="py-4 px-4">
                  <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: `${getRegimeColor(38.2)}20`, color: getRegimeColor(38.2) }}>
                    Normal
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-4 px-4 font-medium text-[var(--foreground)]">ETH</td>
                <td className="py-4 px-4" style={{ color: getRegimeColor(45.8) }}>45.8%</td>
                <td className="py-4 px-4 text-[var(--success)]">+2.3%</td>
                <td className="py-4 px-4 text-[var(--foreground)]">42.1%</td>
                <td className="py-4 px-4 text-[var(--foreground)]">40.5%</td>
                <td className="py-4 px-4">
                  <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: `${getRegimeColor(45.8)}20`, color: getRegimeColor(45.8) }}>
                    High
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
