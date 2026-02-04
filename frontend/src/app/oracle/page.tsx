"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, LineSeries, AreaSeries } from "lightweight-charts";
import { Activity, TrendingUp, TrendingDown, Clock } from "lucide-react";

// Mock price data generator
function generateMockPriceData() {
  const data = [];
  let price = 100;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 100; i >= 0; i--) {
    price = price + (Math.random() - 0.5) * 2;
    data.push({
      time: now - i * 60,
      value: price,
    });
  }
  return data;
}

// Mock variance data
function generateMockVarianceData() {
  const data = [];
  let variance = 25;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 100; i >= 0; i--) {
    variance = Math.max(10, variance + (Math.random() - 0.5) * 3);
    data.push({
      time: now - i * 60,
      value: variance,
    });
  }
  return data;
}

const priceFeeds = [
  { symbol: "SOL/USD", price: 98.45, change: 2.34, changePercent: 2.43 },
  { symbol: "BTC/USD", price: 43250.00, change: -520.00, changePercent: -1.19 },
  { symbol: "ETH/USD", price: 2280.50, change: 45.20, changePercent: 2.02 },
];

export default function OraclePage() {
  const priceChartRef = useRef<HTMLDivElement>(null);
  const varianceChartRef = useRef<HTMLDivElement>(null);
  const [priceChart, setPriceChart] = useState<IChartApi | null>(null);
  const [varianceChart, setVarianceChart] = useState<IChartApi | null>(null);
  const [currentPrice, setCurrentPrice] = useState(98.45);
  const [currentVariance, setCurrentVariance] = useState(32.5);
  const [currentFunding, setCurrentFunding] = useState(0.0105);

  useEffect(() => {
    if (!priceChartRef.current) return;

    const chart = createChart(priceChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#1e2329" },
        textColor: "#848e9c",
      },
      grid: {
        vertLines: { color: "#2b3139" },
        horzLines: { color: "#2b3139" },
      },
      width: priceChartRef.current.clientWidth,
      height: 300,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#f0b90b",
      lineWidth: 2,
    });

    lineSeries.setData(generateMockPriceData() as any);
    setPriceChart(chart);

    const handleResize = () => {
      if (priceChartRef.current) {
        chart.applyOptions({ width: priceChartRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!varianceChartRef.current) return;

    const chart = createChart(varianceChartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#1e2329" },
        textColor: "#848e9c",
      },
      grid: {
        vertLines: { color: "#2b3139" },
        horzLines: { color: "#2b3139" },
      },
      width: varianceChartRef.current.clientWidth,
      height: 200,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const areaSeries = chart.addSeries(AreaSeries, {
      topColor: "rgba(14, 203, 129, 0.4)",
      bottomColor: "rgba(14, 203, 129, 0.0)",
      lineColor: "#0ecb81",
      lineWidth: 2,
    });

    areaSeries.setData(generateMockVarianceData() as any);
    setVarianceChart(chart);

    const handleResize = () => {
      if (varianceChartRef.current) {
        chart.applyOptions({ width: varianceChartRef.current.clientWidth });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // Simulate live updates
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPrice((p) => p + (Math.random() - 0.5) * 0.5);
      setCurrentVariance((v) => Math.max(15, v + (Math.random() - 0.5) * 1));
      setCurrentFunding((f) => f + (Math.random() - 0.5) * 0.001);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
          Oracle Dashboard
        </h1>
        <p className="text-[var(--muted)]">
          Real-time price feeds, variance tracking, and funding rate data
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-sm text-[var(--muted)]">SOL Price</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            ${currentPrice.toFixed(2)}
          </p>
          <p className="text-sm text-[var(--success)]">+2.43%</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-[var(--success)]" />
            <span className="text-sm text-[var(--muted)]">Realized Variance</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {currentVariance.toFixed(1)}%
          </p>
          <p className="text-sm text-[var(--muted)]">Annualized</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-[#3b82f6]" />
            <span className="text-sm text-[var(--muted)]">Funding Rate</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {(currentFunding * 100).toFixed(4)}%
          </p>
          <p className="text-sm text-[var(--muted)]">8h rate</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-[var(--muted)]" />
            <span className="text-sm text-[var(--muted)]">Last Update</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">2s ago</p>
          <p className="text-sm text-[var(--success)]">Live</p>
        </div>
      </div>

      {/* Price Chart */}
      <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)] mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            SOL/USD Price
          </h2>
          <div className="flex gap-2">
            {["1H", "4H", "1D", "1W"].map((tf) => (
              <button
                key={tf}
                className="px-3 py-1 text-sm rounded bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
        <div ref={priceChartRef} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Variance Chart */}
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Realized Variance
          </h2>
          <div ref={varianceChartRef} />
        </div>

        {/* Price Feeds Table */}
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Price Feeds
          </h2>
          <div className="space-y-3">
            {priceFeeds.map((feed) => (
              <div
                key={feed.symbol}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--background)]"
              >
                <div>
                  <p className="font-medium text-[var(--foreground)]">
                    {feed.symbol}
                  </p>
                  <p className="text-sm text-[var(--muted)]">Sigma Oracle</p>
                </div>
                <div className="text-right">
                  <p className="font-medium text-[var(--foreground)]">
                    ${feed.price.toLocaleString()}
                  </p>
                  <p
                    className={`text-sm ${
                      feed.change >= 0
                        ? "text-[var(--success)]"
                        : "text-[var(--danger)]"
                    }`}
                  >
                    {feed.change >= 0 ? "+" : ""}
                    {feed.changePercent.toFixed(2)}%
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* TWAP & EMA Info */}
      <div className="mt-6 bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
          Moving Averages
        </h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-[var(--background)]">
            <p className="text-sm text-[var(--muted)] mb-1">TWAP (1H)</p>
            <p className="text-lg font-medium text-[var(--foreground)]">$97.82</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--background)]">
            <p className="text-sm text-[var(--muted)] mb-1">TWAP (24H)</p>
            <p className="text-lg font-medium text-[var(--foreground)]">$96.45</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--background)]">
            <p className="text-sm text-[var(--muted)] mb-1">EMA (12)</p>
            <p className="text-lg font-medium text-[var(--foreground)]">$98.12</p>
          </div>
          <div className="p-3 rounded-lg bg-[var(--background)]">
            <p className="text-sm text-[var(--muted)] mb-1">EMA (26)</p>
            <p className="text-lg font-medium text-[var(--foreground)]">$95.67</p>
          </div>
        </div>
      </div>
    </div>
  );
}
