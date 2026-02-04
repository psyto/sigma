"use client";

import Link from "next/link";
import { BarChart3, TrendingUp, RefreshCw, Gem, ArrowRight } from "lucide-react";

const protocols = [
  {
    name: "Oracle",
    description: "Real-time price feeds, TWAP, variance tracking, and funding rate data",
    href: "/oracle",
    icon: BarChart3,
    stats: [
      { label: "Price Feeds", value: "3" },
      { label: "Update Interval", value: "1min" },
    ],
    color: "var(--primary)",
  },
  {
    name: "VolSwap",
    description: "Trade realized variance. Go long or short volatility with variance swaps",
    href: "/volswap",
    icon: TrendingUp,
    stats: [
      { label: "Current Variance", value: "45.2%" },
      { label: "Epoch", value: "#12" },
    ],
    color: "var(--success)",
  },
  {
    name: "FundingSwap",
    description: "Swap floating funding rates for fixed. Hedge or speculate on perp funding",
    href: "/funding-swap",
    icon: RefreshCw,
    stats: [
      { label: "Funding Rate", value: "+0.01%" },
      { label: "Fixed Rate", value: "0.008%" },
    ],
    color: "#3b82f6",
  },
  {
    name: "ExoticVault",
    description: "Trade Asian options (TWAP-settled) and barrier options (knock-in/out)",
    href: "/exotic-vault",
    icon: Gem,
    stats: [
      { label: "Active Options", value: "24" },
      { label: "TVL", value: "$1.2M" },
    ],
    color: "#a855f7",
  },
];

export default function Home() {
  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">
          Welcome to Sigma
        </h1>
        <p className="text-[var(--muted)] text-lg">
          Advanced DeFi derivatives protocol suite on Solana. Trade variance, funding rates, and exotic options.
        </p>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Value Locked", value: "$4.2M" },
          { label: "24h Volume", value: "$890K" },
          { label: "Active Positions", value: "156" },
          { label: "Total Users", value: "1,234" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]"
          >
            <p className="text-[var(--muted)] text-sm mb-1">{stat.label}</p>
            <p className="text-2xl font-bold text-[var(--foreground)]">
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Protocol Cards */}
      <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
        Protocols
      </h2>
      <div className="grid grid-cols-2 gap-6">
        {protocols.map((protocol) => {
          const Icon = protocol.icon;
          return (
            <Link
              key={protocol.name}
              href={protocol.href}
              className="group bg-[var(--card)] rounded-xl p-6 border border-[var(--border)] hover:border-[var(--primary)] transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${protocol.color}20` }}
                >
                  <Icon
                    className="w-6 h-6"
                    style={{ color: protocol.color }}
                  />
                </div>
                <ArrowRight className="w-5 h-5 text-[var(--muted)] group-hover:text-[var(--primary)] group-hover:translate-x-1 transition-all" />
              </div>

              <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                {protocol.name}
              </h3>
              <p className="text-[var(--muted)] text-sm mb-4">
                {protocol.description}
              </p>

              <div className="flex gap-6">
                {protocol.stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="text-xs text-[var(--muted)]">{stat.label}</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="mt-8 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
          Quick Actions
        </h2>
        <div className="flex gap-4">
          <Link
            href="/liquidity"
            className="flex-1 py-3 px-4 rounded-lg bg-[var(--primary)] text-[var(--background)] font-medium text-center hover:bg-[var(--primary-hover)] transition-colors"
          >
            Provide Liquidity
          </Link>
          <Link
            href="/volswap"
            className="flex-1 py-3 px-4 rounded-lg bg-[var(--background)] text-[var(--foreground)] font-medium text-center border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
          >
            Trade Volatility
          </Link>
          <Link
            href="/exotic-vault"
            className="flex-1 py-3 px-4 rounded-lg bg-[var(--background)] text-[var(--foreground)] font-medium text-center border border-[var(--border)] hover:border-[var(--primary)] transition-colors"
          >
            Buy Options
          </Link>
        </div>
      </div>
    </div>
  );
}
