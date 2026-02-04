"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Gem, TrendingUp, TrendingDown, Shield, Zap, Info, AlertCircle } from "lucide-react";

type OptionType = "asian-call" | "asian-put" | "knockout-call" | "knockout-put" | "knockin-call" | "knockin-put";

const mockOptions = [
  {
    id: 1,
    type: "Asian Call",
    strike: 95,
    notional: 5000,
    expiry: "2024-01-22",
    premium: 150,
    currentTWAP: 98.5,
    status: "Active",
    pnl: 175,
  },
  {
    id: 2,
    type: "Up-and-Out Call",
    strike: 100,
    barrier: 115,
    notional: 3000,
    expiry: "2024-01-25",
    premium: 90,
    status: "Active",
    pnl: 45,
  },
  {
    id: 3,
    type: "Down-and-In Put",
    strike: 95,
    barrier: 85,
    notional: 2000,
    expiry: "2024-01-20",
    premium: 60,
    status: "Not Triggered",
    pnl: 0,
  },
];

export default function ExoticVaultPage() {
  const { connected } = useWallet();
  const [optionType, setOptionType] = useState<OptionType>("asian-call");
  const [strike, setStrike] = useState("");
  const [barrier, setBarrier] = useState("");
  const [notional, setNotional] = useState("");
  const [duration, setDuration] = useState("7");

  const currentPrice = 98.45;
  const currentTWAP = 97.82;

  const isAsian = optionType.startsWith("asian");
  const isCall = optionType.includes("call");
  const isKnockout = optionType.startsWith("knockout");

  const handleBuyOption = () => {
    if (!connected) {
      alert("Please connect your wallet first");
      return;
    }
    console.log("Buying option:", { optionType, strike, barrier, notional, duration });
  };

  // Calculate estimated premium
  const calculatePremium = () => {
    if (!notional || !strike) return 0;
    const n = parseFloat(notional);
    const basePremium = n * 0.03; // 3% base
    const discount = isAsian ? 0.7 : (isKnockout ? 0.5 : 0.4);
    return basePremium * discount * (parseInt(duration) / 7);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
          ExoticVault - Exotic Options
        </h1>
        <p className="text-[var(--muted)]">
          Trade Asian options (TWAP-settled) and barrier options (knock-in/knock-out) on SOL.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">SOL Spot Price</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">${currentPrice}</p>
          <p className="text-xs text-[var(--success)]">+2.43%</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">24H TWAP</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">${currentTWAP}</p>
          <p className="text-xs text-[var(--muted)]">For Asian options</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Vault TVL</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">$1.2M</p>
          <p className="text-xs text-[var(--muted)]">Available liquidity</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Active Options</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">24</p>
          <p className="text-xs text-[var(--muted)]">Total open</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Trade Panel */}
        <div className="col-span-1 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Buy Option
          </h2>

          {/* Option Type Selection */}
          <div className="mb-4">
            <label className="text-sm text-[var(--muted)] mb-2 block">Option Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setOptionType("asian-call")}
                className={`p-3 rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                  optionType === "asian-call"
                    ? "border-[var(--primary)] bg-[var(--primary)]10"
                    : "border-[var(--border)] hover:border-[var(--muted)]"
                }`}
              >
                <TrendingUp className="w-4 h-4 text-[var(--success)]" />
                <span className="text-xs text-[var(--foreground)]">Asian Call</span>
              </button>
              <button
                onClick={() => setOptionType("asian-put")}
                className={`p-3 rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                  optionType === "asian-put"
                    ? "border-[var(--primary)] bg-[var(--primary)]10"
                    : "border-[var(--border)] hover:border-[var(--muted)]"
                }`}
              >
                <TrendingDown className="w-4 h-4 text-[var(--danger)]" />
                <span className="text-xs text-[var(--foreground)]">Asian Put</span>
              </button>
              <button
                onClick={() => setOptionType("knockout-call")}
                className={`p-3 rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                  optionType === "knockout-call"
                    ? "border-[var(--primary)] bg-[var(--primary)]10"
                    : "border-[var(--border)] hover:border-[var(--muted)]"
                }`}
              >
                <Shield className="w-4 h-4 text-[#3b82f6]" />
                <span className="text-xs text-[var(--foreground)]">KO Call</span>
              </button>
              <button
                onClick={() => setOptionType("knockout-put")}
                className={`p-3 rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                  optionType === "knockout-put"
                    ? "border-[var(--primary)] bg-[var(--primary)]10"
                    : "border-[var(--border)] hover:border-[var(--muted)]"
                }`}
              >
                <Shield className="w-4 h-4 text-[#a855f7]" />
                <span className="text-xs text-[var(--foreground)]">KO Put</span>
              </button>
              <button
                onClick={() => setOptionType("knockin-call")}
                className={`p-3 rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                  optionType === "knockin-call"
                    ? "border-[var(--primary)] bg-[var(--primary)]10"
                    : "border-[var(--border)] hover:border-[var(--muted)]"
                }`}
              >
                <Zap className="w-4 h-4 text-[var(--warning)]" />
                <span className="text-xs text-[var(--foreground)]">KI Call</span>
              </button>
              <button
                onClick={() => setOptionType("knockin-put")}
                className={`p-3 rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                  optionType === "knockin-put"
                    ? "border-[var(--primary)] bg-[var(--primary)]10"
                    : "border-[var(--border)] hover:border-[var(--muted)]"
                }`}
              >
                <Zap className="w-4 h-4 text-[#f97316]" />
                <span className="text-xs text-[var(--foreground)]">KI Put</span>
              </button>
            </div>
          </div>

          {/* Strike Price */}
          <div className="mb-4">
            <label className="text-sm text-[var(--muted)] mb-2 block">Strike Price ($)</label>
            <input
              type="number"
              value={strike}
              onChange={(e) => setStrike(e.target.value)}
              placeholder={currentPrice.toString()}
              className="w-full px-4 py-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          {/* Barrier Price (for barrier options) */}
          {!isAsian && (
            <div className="mb-4">
              <label className="text-sm text-[var(--muted)] mb-2 block">
                Barrier Price ($)
              </label>
              <input
                type="number"
                value={barrier}
                onChange={(e) => setBarrier(e.target.value)}
                placeholder={isCall ? "115" : "85"}
                className="w-full px-4 py-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--primary)]"
              />
            </div>
          )}

          {/* Notional */}
          <div className="mb-4">
            <label className="text-sm text-[var(--muted)] mb-2 block">Notional (USDC)</label>
            <input
              type="number"
              value={notional}
              onChange={(e) => setNotional(e.target.value)}
              placeholder="5,000"
              className="w-full px-4 py-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          {/* Duration */}
          <div className="mb-4">
            <label className="text-sm text-[var(--muted)] mb-2 block">Duration</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
            >
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
            </select>
          </div>

          {/* Premium Summary */}
          <div className="p-4 rounded-lg bg-[var(--background)] mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">Premium</span>
              <span className="text-sm font-medium text-[var(--foreground)]">
                ${calculatePremium().toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">Max Payout</span>
              <span className="text-sm text-[var(--foreground)]">
                {notional ? `$${parseFloat(notional).toFixed(2)}` : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[var(--muted)]">Settlement</span>
              <span className="text-sm text-[var(--foreground)]">
                {isAsian ? "TWAP" : "Spot"}
              </span>
            </div>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--primary)]20 mb-4">
            <Info className="w-4 h-4 text-[var(--primary)] mt-0.5" />
            <p className="text-xs text-[var(--muted)]">
              {isAsian
                ? "Asian options are settled against TWAP, reducing manipulation risk."
                : isKnockout
                ? "Knock-out options become worthless if barrier is breached."
                : "Knock-in options only activate when barrier is breached."}
            </p>
          </div>

          <button
            onClick={handleBuyOption}
            disabled={!connected || !notional || !strike}
            className="w-full py-3 rounded-lg bg-[var(--primary)] text-[var(--background)] font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connected ? "Buy Option" : "Connect Wallet"}
          </button>
        </div>

        {/* Your Options */}
        <div className="col-span-2 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Your Options
          </h2>

          {mockOptions.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-[var(--muted)] mx-auto mb-4" />
              <p className="text-[var(--muted)]">No open options</p>
            </div>
          ) : (
            <div className="space-y-4">
              {mockOptions.map((option) => (
                <div
                  key={option.id}
                  className="p-4 rounded-lg bg-[var(--background)] border border-[var(--border)]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Gem className="w-5 h-5 text-[var(--primary)]" />
                      <div>
                        <p className="font-medium text-[var(--foreground)]">{option.type}</p>
                        <p className="text-sm text-[var(--muted)]">
                          Strike: ${option.strike}
                          {option.barrier && ` | Barrier: $${option.barrier}`}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      option.status === "Active"
                        ? "bg-[var(--success)]20 text-[var(--success)]"
                        : "bg-[var(--muted)]20 text-[var(--muted)]"
                    }`}>
                      {option.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-[var(--muted)]">Notional</p>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        ${option.notional.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--muted)]">Premium</p>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        ${option.premium}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--muted)]">Expiry</p>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {option.expiry}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--muted)]">Unrealized P&L</p>
                      <p className={`text-sm font-medium ${
                        option.pnl >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                      }`}>
                        {option.pnl >= 0 ? "+" : ""}${option.pnl}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button className="flex-1 py-2 text-sm rounded bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--card-hover)] transition-colors">
                      View Details
                    </button>
                    <button className="flex-1 py-2 text-sm rounded bg-[var(--primary)] text-[var(--background)] hover:bg-[var(--primary-hover)] transition-colors">
                      Settle
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Option Types Explanation */}
      <div className="mt-6 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
          Option Types Explained
        </h2>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-[var(--success)]" />
              <h3 className="font-medium text-[var(--foreground)]">Asian Options</h3>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Settled against Time-Weighted Average Price (TWAP). Lower premium due to averaging effect, reduced manipulation risk.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-[#3b82f6]" />
              <h3 className="font-medium text-[var(--foreground)]">Knock-Out Options</h3>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Becomes worthless if price touches barrier. Cheaper than vanilla options but with knockout risk.
            </p>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5 text-[var(--warning)]" />
              <h3 className="font-medium text-[var(--foreground)]">Knock-In Options</h3>
            </div>
            <p className="text-sm text-[var(--muted)]">
              Only activates when price touches barrier. Cheapest premium, but requires barrier breach to have value.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
