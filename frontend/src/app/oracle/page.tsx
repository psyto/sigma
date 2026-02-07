"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, LineSeries, AreaSeries } from "lightweight-charts";
import { Activity, TrendingUp, TrendingDown, Clock, RefreshCw, AlertCircle } from "lucide-react";
import { useOracle } from "@/hooks";

// Mock price data generator for chart (historical data not available from oracle)
function generateMockPriceData(basePrice: number) {
  const data = [];
  let price = basePrice * 0.95;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 100; i >= 0; i--) {
    price = price + (Math.random() - 0.5) * (basePrice * 0.02);
    data.push({
      time: now - i * 60,
      value: Math.max(0, price),
    });
  }
  // End at current price
  data[data.length - 1].value = basePrice;
  return data;
}

// Mock variance data generator
function generateMockVarianceData(baseVariance: number) {
  const data = [];
  let variance = baseVariance * 0.8;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 100; i >= 0; i--) {
    variance = Math.max(10, variance + (Math.random() - 0.5) * 3);
    data.push({
      time: now - i * 60,
      value: variance,
    });
  }
  // End at current variance
  data[data.length - 1].value = baseVariance;
  return data;
}

export default function OraclePage() {
  const { priceFeeds, varianceTrackers, fundingFeeds, loading, error, refresh } = useOracle();

  const priceChartRef = useRef<HTMLDivElement>(null);
  const varianceChartRef = useRef<HTMLDivElement>(null);
  const [priceChart, setPriceChart] = useState<IChartApi | null>(null);
  const [varianceChart, setVarianceChart] = useState<IChartApi | null>(null);

  // Get primary metrics (SOL if available, or first feed)
  const solFeed = priceFeeds.find(f => f.symbol?.toLowerCase().includes("sol"));
  const primaryFeed = solFeed || priceFeeds[0];
  const primaryVariance = varianceTrackers[0];
  const primaryFunding = fundingFeeds[0];

  const currentPrice = primaryFeed?.priceUsd || 0;
  const currentVariance = primaryVariance?.volatilityPercent || 0;
  const currentFunding = primaryFunding?.ratePercent || 0;
  const lastUpdate = primaryFeed?.lastUpdateAgo || "N/A";

  // Price chart
  useEffect(() => {
    if (!priceChartRef.current || !currentPrice) return;

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

    lineSeries.setData(generateMockPriceData(currentPrice) as any);
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
  }, [currentPrice]);

  // Variance chart
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

    areaSeries.setData(generateMockVarianceData(currentVariance || 25) as any);
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
  }, [currentVariance]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="h-8 w-48 bg-[var(--card)] rounded animate-pulse mb-2" />
          <div className="h-4 w-96 bg-[var(--card)] rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)] h-28 animate-pulse" />
          ))}
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)] h-80 animate-pulse mb-6" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
            Oracle Dashboard
          </h1>
          <p className="text-[var(--muted)]">
            Real-time price feeds, variance tracking, and funding rate data
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-[var(--card)] rounded-lg border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-[var(--danger)]/10 border border-[var(--danger)] rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--danger)]" />
          <span className="text-[var(--danger)]">{error}</span>
        </div>
      )}

      {/* No Data State */}
      {priceFeeds.length === 0 && !loading && !error && (
        <div className="mb-6 p-8 bg-[var(--card)] border border-[var(--border)] rounded-xl text-center">
          <Activity className="w-12 h-12 text-[var(--muted)] mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">No Oracle Data</h3>
          <p className="text-[var(--muted)]">
            Connect your wallet and ensure the oracle program is initialized with price feeds.
          </p>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-sm text-[var(--muted)]">
              {primaryFeed?.symbol || "SOL"} Price
            </span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            ${currentPrice.toFixed(2)}
          </p>
          <p className="text-sm text-[var(--success)]">Live</p>
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
            {currentFunding.toFixed(4)}%
          </p>
          <p className="text-sm text-[var(--muted)]">8h rate</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-[var(--muted)]" />
            <span className="text-sm text-[var(--muted)]">Last Update</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">{lastUpdate}</p>
          <p className="text-sm text-[var(--success)]">
            {priceFeeds.length > 0 ? "Live" : "Offline"}
          </p>
        </div>
      </div>

      {/* Price Chart */}
      <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)] mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            {primaryFeed?.symbol || "SOL/USD"} Price
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
            Price Feeds ({priceFeeds.length})
          </h2>
          <div className="space-y-3">
            {priceFeeds.length > 0 ? (
              priceFeeds.map((feed, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-[var(--background)]"
                >
                  <div>
                    <p className="font-medium text-[var(--foreground)]">
                      {feed.symbol || "Unknown"}
                    </p>
                    <p className="text-sm text-[var(--muted)]">Sigma Oracle</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-[var(--foreground)]">
                      ${feed.priceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-sm text-[var(--muted)]">{feed.lastUpdateAgo}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-[var(--muted)]">
                No price feeds available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Variance Trackers & Funding Feeds */}
      <div className="mt-6 grid grid-cols-2 gap-6">
        {/* Variance Trackers */}
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Variance Trackers ({varianceTrackers.length})
          </h2>
          <div className="space-y-3">
            {varianceTrackers.length > 0 ? (
              varianceTrackers.map((tracker, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-[var(--background)]"
                >
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-[var(--muted)]">Realized Variance</span>
                    <span className="font-medium text-[var(--foreground)]">
                      {tracker.variancePercent.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-[var(--muted)]">Annualized Vol</span>
                    <span className="font-medium text-[var(--success)]">
                      {tracker.volatilityPercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-[var(--muted)]">
                No variance trackers available
              </div>
            )}
          </div>
        </div>

        {/* Funding Feeds */}
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Funding Feeds ({fundingFeeds.length})
          </h2>
          <div className="space-y-3">
            {fundingFeeds.length > 0 ? (
              fundingFeeds.map((feed, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg bg-[var(--background)]"
                >
                  <div className="flex justify-between mb-2">
                    <span className="text-sm text-[var(--muted)]">
                      {feed.marketSymbol || "Unknown"}
                    </span>
                    <span className={`font-medium ${feed.ratePercent >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                      {feed.ratePercent >= 0 ? "+" : ""}{feed.ratePercent.toFixed(4)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-[var(--muted)]">Annualized</span>
                    <span className="text-[var(--foreground)]">
                      {feed.annualizedPercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-[var(--muted)]">
                No funding feeds available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
