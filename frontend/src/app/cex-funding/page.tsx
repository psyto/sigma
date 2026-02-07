"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, LineSeries } from "lightweight-charts";
import { Activity, Building2, TrendingUp, TrendingDown, DollarSign, RefreshCw, AlertCircle, Info } from "lucide-react";
import { useOracle } from "@/hooks/useOracle";

// CEX data is external - would come from an API in production
const cexExchanges = [
  { name: "Binance", rate: 0.0105, oi: 2450000000, weight: 35 },
  { name: "Bybit", rate: 0.0098, oi: 1850000000, weight: 25 },
  { name: "OKX", rate: 0.0112, oi: 1200000000, weight: 18 },
  { name: "Deribit", rate: 0.0095, oi: 850000000, weight: 12 },
  { name: "Bitget", rate: 0.0108, oi: 450000000, weight: 6 },
  { name: "Kraken", rate: 0.0102, oi: 200000000, weight: 4 },
];

const markets = [
  { symbol: "BTC-PERP", avgRate: 0.0105, oiWeightedRate: 0.0103, totalOI: 7000000000 },
  { symbol: "ETH-PERP", avgRate: 0.0098, oiWeightedRate: 0.0096, totalOI: 3500000000 },
  { symbol: "SOL-PERP", avgRate: 0.0125, oiWeightedRate: 0.0122, totalOI: 850000000 },
];

export default function CexFundingPage() {
  const chartRef = useRef<HTMLDivElement>(null);
  const [chart, setChart] = useState<IChartApi | null>(null);
  const [selectedMarket, setSelectedMarket] = useState("SOL-PERP");
  const { fundingFeeds, loading, error, refresh } = useOracle();
  const [refreshing, setRefreshing] = useState(false);

  // Get on-chain funding rate from oracle
  const onChainFundingFeed = fundingFeeds[0];
  const onChainRate = onChainFundingFeed?.ratePercent ?? 0.0125;
  const onChainAnnualized = onChainFundingFeed?.annualizedPercent ?? onChainRate * 3 * 365;

  // Calculate aggregated CEX metrics
  const selectedMarketData = markets.find((m) => m.symbol === selectedMarket) || markets[0];
  const aggregatedRate = selectedMarketData.avgRate;
  const oiWeightedRate = selectedMarketData.oiWeightedRate;
  const totalOI = selectedMarketData.totalOI;

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
      height: 300,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    const lineSeries = newChart.addSeries(LineSeries, {
      color: "#06b6d4",
      lineWidth: 2,
    });

    // Generate chart data based on current rate
    const data = [];
    let rate = aggregatedRate;
    const now = Math.floor(Date.now() / 1000);

    for (let i = 100; i >= 0; i--) {
      rate = Math.max(-0.1, Math.min(0.15, rate + (Math.random() - 0.5) * 0.02));
      data.push({
        time: now - i * 3600 * 8,
        value: rate,
      });
    }
    // Set current value at end
    data[data.length - 1].value = aggregatedRate;

    lineSeries.setData(data as any);
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
  }, [aggregatedRate]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const formatRate = (rate: number) => {
    return `${(rate * 100).toFixed(4)}%`;
  };

  const formatOI = (oi: number) => {
    if (oi >= 1000000000) return `$${(oi / 1000000000).toFixed(2)}B`;
    if (oi >= 1000000) return `$${(oi / 1000000).toFixed(0)}M`;
    return `$${oi.toLocaleString()}`;
  };

  const annualizedRate = (rate: number) => {
    return `${(rate * 3 * 365 * 100).toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
            CEX Funding Rates
          </h1>
          <p className="text-[var(--muted)]">Loading funding data...</p>
        </div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)] animate-pulse">
              <div className="h-4 bg-[var(--border)] rounded w-20 mb-2" />
              <div className="h-8 bg-[var(--border)] rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
            CEX Funding Rates
          </h1>
          <p className="text-[var(--muted)]">
            Aggregated funding rates from Binance, Bybit, OKX, Deribit, Bitget, and Kraken.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* On-Chain vs CEX Comparison Banner */}
      {fundingFeeds.length > 0 && (
        <div className="mb-6 bg-[var(--primary)]10 border border-[var(--primary)]30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-4 h-4 text-[var(--primary)]" />
            <span className="text-sm font-medium text-[var(--primary)]">On-Chain Oracle Data</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-[var(--muted)]">Sigma Oracle Rate</p>
              <p className={`text-lg font-bold ${onChainRate >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                {onChainRate.toFixed(4)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--muted)]">Annualized</p>
              <p className={`text-lg font-bold ${onChainRate >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                {onChainAnnualized.toFixed(1)}%
              </p>
            </div>
            <div>
              <p className="text-sm text-[var(--muted)]">Last Update</p>
              <p className="text-lg font-bold text-[var(--foreground)]">
                {onChainFundingFeed ? "Live" : "N/A"}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Market Selector */}
      <div className="flex gap-2 mb-6">
        {markets.map((market) => (
          <button
            key={market.symbol}
            onClick={() => setSelectedMarket(market.symbol)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedMarket === market.symbol
                ? "bg-[var(--primary)] text-white"
                : "bg-[var(--card)] text-[var(--muted)] border border-[var(--border)] hover:text-[var(--foreground)]"
            }`}
          >
            {market.symbol}
          </button>
        ))}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[#06b6d4]" />
            <span className="text-sm text-[var(--muted)]">Average Rate</span>
          </div>
          <p className={`text-2xl font-bold ${aggregatedRate >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
            {formatRate(aggregatedRate)}
          </p>
          <p className="text-sm text-[var(--muted)]">8h funding</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-[var(--success)]" />
            <span className="text-sm text-[var(--muted)]">OI-Weighted</span>
          </div>
          <p className={`text-2xl font-bold ${oiWeightedRate >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
            {formatRate(oiWeightedRate)}
          </p>
          <p className="text-sm text-[var(--muted)]">Market-weighted</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-[#f59e0b]" />
            <span className="text-sm text-[var(--muted)]">Total OI</span>
          </div>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {formatOI(totalOI)}
          </p>
          <p className="text-sm text-[var(--muted)]">Across exchanges</p>
        </div>

        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="w-4 h-4 text-[#3b82f6]" />
            <span className="text-sm text-[var(--muted)]">Annualized</span>
          </div>
          <p className={`text-2xl font-bold ${aggregatedRate >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
            {annualizedRate(aggregatedRate)}
          </p>
          <p className="text-sm text-[var(--muted)]">APR equivalent</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Funding Chart */}
        <div className="col-span-2 bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              {selectedMarket} Funding Rate History
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

        {/* Aggregation Methods */}
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Aggregation Methods
          </h2>

          <div className="space-y-4">
            <div className="p-3 rounded-lg bg-[var(--background)] border border-[var(--primary)]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-[var(--primary)]" />
                <span className="font-medium text-[var(--foreground)]">OI-Weighted</span>
                <span className="ml-auto text-xs text-[var(--primary)]">Recommended</span>
              </div>
              <p className="text-sm text-[var(--muted)]">
                Weighted by open interest. Best represents true market funding.
              </p>
              <p className="text-lg font-bold text-[var(--foreground)] mt-2">
                {formatRate(oiWeightedRate)}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[var(--background)]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-[var(--muted)]" />
                <span className="font-medium text-[var(--foreground)]">Simple Average</span>
              </div>
              <p className="text-sm text-[var(--muted)]">
                Equal weight across all exchanges.
              </p>
              <p className="text-lg font-bold text-[var(--foreground)] mt-2">
                {formatRate(aggregatedRate)}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[var(--background)]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-[var(--muted)]" />
                <span className="font-medium text-[var(--foreground)]">Median</span>
              </div>
              <p className="text-sm text-[var(--muted)]">
                Middle value. Resistant to outliers.
              </p>
              <p className="text-lg font-bold text-[var(--foreground)] mt-2">
                {formatRate(0.0103)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Exchange Breakdown */}
      <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)] mb-6">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
          Exchange Breakdown - {selectedMarket}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Exchange</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Funding Rate</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Open Interest</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">OI Share</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Weight</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Annualized</th>
              </tr>
            </thead>
            <tbody>
              {cexExchanges.map((exchange) => (
                <tr key={exchange.name} className="border-b border-[var(--border)] last:border-0">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[var(--muted)]" />
                      <span className="font-medium text-[var(--foreground)]">{exchange.name}</span>
                    </div>
                  </td>
                  <td className={`py-4 px-4 font-medium ${exchange.rate >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                    {formatRate(exchange.rate)}
                  </td>
                  <td className="py-4 px-4 text-[var(--foreground)]">
                    {formatOI(exchange.oi)}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-2 bg-[var(--background)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#06b6d4] rounded-full"
                          style={{ width: `${(exchange.oi / totalOI) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm text-[var(--muted)]">
                        {((exchange.oi / totalOI) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-[var(--foreground)]">{exchange.weight}%</td>
                  <td className={`py-4 px-4 ${exchange.rate >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                    {annualizedRate(exchange.rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Use Case Info */}
      <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
          How to Use CEX Funding Data
        </h2>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="w-10 h-10 rounded-lg bg-[#06b6d4]/20 flex items-center justify-center mb-3">
              <span className="text-[#06b6d4] font-bold">1</span>
            </div>
            <h3 className="font-medium text-[var(--foreground)] mb-2">
              Hedge CEX Positions
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Holding a perp on Binance? Use FundingSwap to lock in a fixed rate and eliminate funding uncertainty.
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-[#06b6d4]/20 flex items-center justify-center mb-3">
              <span className="text-[#06b6d4] font-bold">2</span>
            </div>
            <h3 className="font-medium text-[var(--foreground)] mb-2">
              Cross-Exchange Arbitrage
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Identify funding rate discrepancies across exchanges for arbitrage opportunities.
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-[#06b6d4]/20 flex items-center justify-center mb-3">
              <span className="text-[#06b6d4] font-bold">3</span>
            </div>
            <h3 className="font-medium text-[var(--foreground)] mb-2">
              Market Sentiment
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Track aggregate funding to gauge market-wide long/short sentiment across all major exchanges.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
