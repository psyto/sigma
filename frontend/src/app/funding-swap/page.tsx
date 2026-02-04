"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowLeftRight, Clock, Info, AlertCircle } from "lucide-react";

const mockSwaps = [
  {
    id: 1,
    side: "Receiver",
    fixedRate: 0.008,
    notional: 50000,
    startTime: "2024-01-15",
    endTime: "2024-02-15",
    accruedPnL: 125.50,
    periodsRemaining: 12,
  },
  {
    id: 2,
    side: "Payer",
    fixedRate: 0.012,
    notional: 25000,
    startTime: "2024-01-10",
    endTime: "2024-02-10",
    accruedPnL: -45.20,
    periodsRemaining: 8,
  },
];

const fundingHistory = [
  { time: "08:00", rate: 0.0105 },
  { time: "16:00", rate: 0.0098 },
  { time: "00:00", rate: 0.0112 },
  { time: "08:00", rate: 0.0095 },
  { time: "16:00", rate: 0.0088 },
];

export default function FundingSwapPage() {
  const { connected } = useWallet();
  const [swapSide, setSwapSide] = useState<"receiver" | "payer">("receiver");
  const [notional, setNotional] = useState("");
  const [duration, setDuration] = useState("30");

  const currentFundingRate = 0.0105;
  const fixedRate = swapSide === "receiver" ? 0.008 : 0.012;
  const avgFundingRate = 0.0098;

  const handleOpenSwap = () => {
    if (!connected) {
      alert("Please connect your wallet first");
      return;
    }
    console.log("Opening swap:", { swapSide, notional, duration });
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
          FundingSwap - Interest Rate Swaps
        </h1>
        <p className="text-[var(--muted)]">
          Swap floating funding rates for fixed. Hedge perp funding exposure or speculate on rate direction.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Current Funding</p>
          <p className={`text-2xl font-bold ${currentFundingRate >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
            {currentFundingRate >= 0 ? "+" : ""}{(currentFundingRate * 100).toFixed(4)}%
          </p>
          <p className="text-xs text-[var(--muted)]">8h rate</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">7D Average</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {(avgFundingRate * 100).toFixed(4)}%
          </p>
          <p className="text-xs text-[var(--muted)]">Rolling avg</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Annualized</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {(currentFundingRate * 3 * 365 * 100).toFixed(2)}%
          </p>
          <p className="text-xs text-[var(--muted)]">APR</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Next Funding</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">2h 45m</p>
          <p className="text-xs text-[var(--muted)]">Until settlement</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Trade Panel */}
        <div className="col-span-1 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Open Funding Swap
          </h2>

          {/* Swap Side Toggle */}
          <div className="mb-4">
            <label className="text-sm text-[var(--muted)] mb-2 block">
              Swap Side
            </label>
            <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
              <button
                onClick={() => setSwapSide("receiver")}
                className={`flex-1 py-3 px-4 flex flex-col items-center gap-1 transition-colors ${
                  swapSide === "receiver"
                    ? "bg-[#3b82f6] text-white"
                    : "bg-[var(--background)] text-[var(--muted)]"
                }`}
              >
                <span className="text-sm font-medium">Receive Fixed</span>
                <span className="text-xs opacity-75">Pay Floating</span>
              </button>
              <button
                onClick={() => setSwapSide("payer")}
                className={`flex-1 py-3 px-4 flex flex-col items-center gap-1 transition-colors ${
                  swapSide === "payer"
                    ? "bg-[#a855f7] text-white"
                    : "bg-[var(--background)] text-[var(--muted)]"
                }`}
              >
                <span className="text-sm font-medium">Pay Fixed</span>
                <span className="text-xs opacity-75">Receive Floating</span>
              </button>
            </div>
          </div>

          {/* Notional Input */}
          <div className="mb-4">
            <label className="text-sm text-[var(--muted)] mb-2 block">
              Notional (USDC)
            </label>
            <input
              type="number"
              value={notional}
              onChange={(e) => setNotional(e.target.value)}
              placeholder="50,000"
              className="w-full px-4 py-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          {/* Duration Select */}
          <div className="mb-4">
            <label className="text-sm text-[var(--muted)] mb-2 block">
              Duration
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
            >
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </div>

          {/* Swap Details */}
          <div className="p-4 rounded-lg bg-[var(--background)] mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-[var(--muted)]">Fixed Rate</span>
              <span className="text-sm font-medium text-[var(--foreground)]">
                {(fixedRate * 100).toFixed(3)}%
              </span>
            </div>
            <div className="flex items-center gap-2 justify-center py-2">
              <div className="text-center">
                <p className="text-xs text-[var(--muted)]">You {swapSide === "receiver" ? "Receive" : "Pay"}</p>
                <p className="text-sm font-medium text-[var(--foreground)]">Fixed {(fixedRate * 100).toFixed(3)}%</p>
              </div>
              <ArrowLeftRight className="w-5 h-5 text-[var(--muted)]" />
              <div className="text-center">
                <p className="text-xs text-[var(--muted)]">You {swapSide === "receiver" ? "Pay" : "Receive"}</p>
                <p className="text-sm font-medium text-[var(--foreground)]">Floating</p>
              </div>
            </div>
            <div className="border-t border-[var(--border)] mt-3 pt-3">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-[var(--muted)]">Funding Periods</span>
                <span className="text-sm text-[var(--foreground)]">
                  {parseInt(duration) * 3}
                </span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-[var(--muted)]">Collateral Required</span>
                <span className="text-sm text-[var(--foreground)]">
                  {notional ? `$${(parseFloat(notional) * 0.1).toFixed(2)}` : "-"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-[var(--muted)]">Fee</span>
                <span className="text-sm text-[var(--foreground)]">
                  {notional ? `$${(parseFloat(notional) * 0.001).toFixed(2)}` : "-"}
                </span>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--primary)]20 mb-4">
            <Info className="w-4 h-4 text-[var(--primary)] mt-0.5" />
            <p className="text-xs text-[var(--muted)]">
              {swapSide === "receiver"
                ? "You receive fixed rate and pay floating. Profit if funding stays below fixed rate."
                : "You pay fixed rate and receive floating. Profit if funding exceeds fixed rate."}
            </p>
          </div>

          <button
            onClick={handleOpenSwap}
            disabled={!connected || !notional}
            className="w-full py-3 rounded-lg bg-[var(--primary)] text-[var(--background)] font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connected ? "Open Swap" : "Connect Wallet"}
          </button>
        </div>

        {/* Right Column */}
        <div className="col-span-2 space-y-6">
          {/* Funding History */}
          <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              Recent Funding Rates
            </h2>
            <div className="flex gap-2">
              {fundingHistory.map((item, i) => (
                <div key={i} className="flex-1 p-3 rounded-lg bg-[var(--background)]">
                  <p className="text-xs text-[var(--muted)] mb-1">{item.time}</p>
                  <p className={`text-sm font-medium ${item.rate >= avgFundingRate ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                    {(item.rate * 100).toFixed(4)}%
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Open Swaps */}
          <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              Your Swaps
            </h2>

            {mockSwaps.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-[var(--muted)] mx-auto mb-4" />
                <p className="text-[var(--muted)]">No open swaps</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Side</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Fixed Rate</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Notional</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">End Date</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Accrued P&L</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockSwaps.map((swap) => (
                      <tr key={swap.id} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-4 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            swap.side === "Receiver"
                              ? "bg-[#3b82f6]20 text-[#3b82f6]"
                              : "bg-[#a855f7]20 text-[#a855f7]"
                          }`}>
                            {swap.side}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-[var(--foreground)]">
                          {(swap.fixedRate * 100).toFixed(3)}%
                        </td>
                        <td className="py-4 px-4 text-[var(--foreground)]">
                          ${swap.notional.toLocaleString()}
                        </td>
                        <td className="py-4 px-4 text-[var(--muted)] text-sm">
                          {swap.endTime}
                        </td>
                        <td className={`py-4 px-4 font-medium ${
                          swap.accruedPnL >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                        }`}>
                          {swap.accruedPnL >= 0 ? "+" : ""}${swap.accruedPnL.toFixed(2)}
                        </td>
                        <td className="py-4 px-4">
                          <button className="px-3 py-1 text-sm rounded bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                            Close Early
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
