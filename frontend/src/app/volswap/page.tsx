"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { TrendingUp, TrendingDown, Clock, AlertCircle, Info } from "lucide-react";

const mockPositions = [
  {
    id: 1,
    type: "Long",
    strikeVariance: 30,
    notional: 10000,
    entryTime: "2024-01-15 14:30",
    expiryTime: "2024-01-22 14:30",
    currentPnL: 245.50,
    status: "Active",
  },
  {
    id: 2,
    type: "Short",
    strikeVariance: 45,
    notional: 5000,
    entryTime: "2024-01-14 10:00",
    expiryTime: "2024-01-21 10:00",
    currentPnL: -120.00,
    status: "Active",
  },
];

export default function VolSwapPage() {
  const { connected } = useWallet();
  const [positionType, setPositionType] = useState<"long" | "short">("long");
  const [notional, setNotional] = useState("");
  const [duration, setDuration] = useState("7");

  const currentVariance = 32.5;
  const impliedVariance = 35.2;
  const epochProgress = 65;
  const timeToEpochEnd = "2d 14h 32m";

  const handleOpenPosition = () => {
    if (!connected) {
      alert("Please connect your wallet first");
      return;
    }
    console.log("Opening position:", { positionType, notional, duration });
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
          VolSwap - Variance Swaps
        </h1>
        <p className="text-[var(--muted)]">
          Trade realized variance. Go long if you expect high volatility, short if you expect calm markets.
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Realized Variance</p>
          <p className="text-2xl font-bold text-[var(--success)]">
            {currentVariance}%
          </p>
          <p className="text-xs text-[var(--muted)]">Current epoch</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Strike Variance</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {impliedVariance}%
          </p>
          <p className="text-xs text-[var(--muted)]">Fair value</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Epoch Progress</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-[var(--foreground)]">
              {epochProgress}%
            </p>
          </div>
          <div className="mt-2 h-2 bg-[var(--background)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--primary)] rounded-full"
              style={{ width: `${epochProgress}%` }}
            />
          </div>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Time to Settlement</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {timeToEpochEnd}
          </p>
          <p className="text-xs text-[var(--muted)]">Epoch #12</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Trade Panel */}
        <div className="col-span-1 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Open Position
          </h2>

          {/* Position Type Toggle */}
          <div className="mb-4">
            <label className="text-sm text-[var(--muted)] mb-2 block">
              Position Type
            </label>
            <div className="flex rounded-lg overflow-hidden border border-[var(--border)]">
              <button
                onClick={() => setPositionType("long")}
                className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
                  positionType === "long"
                    ? "bg-[var(--success)] text-white"
                    : "bg-[var(--background)] text-[var(--muted)]"
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                Long Vol
              </button>
              <button
                onClick={() => setPositionType("short")}
                className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
                  positionType === "short"
                    ? "bg-[var(--danger)] text-white"
                    : "bg-[var(--background)] text-[var(--muted)]"
                }`}
              >
                <TrendingDown className="w-4 h-4" />
                Short Vol
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
              placeholder="10,000"
              className="w-full px-4 py-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          {/* Duration Select */}
          <div className="mb-4">
            <label className="text-sm text-[var(--muted)] mb-2 block">
              Duration (Days)
            </label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
            >
              <option value="7">7 days (1 epoch)</option>
              <option value="14">14 days (2 epochs)</option>
              <option value="28">28 days (4 epochs)</option>
            </select>
          </div>

          {/* Position Summary */}
          <div className="p-4 rounded-lg bg-[var(--background)] mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">Strike Variance</span>
              <span className="text-sm text-[var(--foreground)]">{impliedVariance}%</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">Premium</span>
              <span className="text-sm text-[var(--foreground)]">
                {notional ? `$${(parseFloat(notional) * 0.02).toFixed(2)}` : "-"}
              </span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">Max Payout</span>
              <span className="text-sm text-[var(--foreground)]">
                {notional ? `$${(parseFloat(notional) * 0.5).toFixed(2)}` : "-"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[var(--muted)]">Fee</span>
              <span className="text-sm text-[var(--foreground)]">
                {notional ? `$${(parseFloat(notional) * 0.001).toFixed(2)}` : "-"}
              </span>
            </div>
          </div>

          {/* Info Box */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--primary)]20 mb-4">
            <Info className="w-4 h-4 text-[var(--primary)] mt-0.5" />
            <p className="text-xs text-[var(--muted)]">
              {positionType === "long"
                ? "You profit if realized variance exceeds strike variance at settlement."
                : "You profit if realized variance is below strike variance at settlement."}
            </p>
          </div>

          <button
            onClick={handleOpenPosition}
            disabled={!connected || !notional}
            className="w-full py-3 rounded-lg bg-[var(--primary)] text-[var(--background)] font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connected ? "Open Position" : "Connect Wallet"}
          </button>
        </div>

        {/* Positions Table */}
        <div className="col-span-2 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Your Positions
          </h2>

          {mockPositions.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-[var(--muted)] mx-auto mb-4" />
              <p className="text-[var(--muted)]">No open positions</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border)]">
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">
                      Type
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">
                      Strike
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">
                      Notional
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">
                      Expiry
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">
                      P&L
                    </th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {mockPositions.map((position) => (
                    <tr
                      key={position.id}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="py-4 px-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            position.type === "Long"
                              ? "bg-[var(--success)]20 text-[var(--success)]"
                              : "bg-[var(--danger)]20 text-[var(--danger)]"
                          }`}
                        >
                          {position.type}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-[var(--foreground)]">
                        {position.strikeVariance}%
                      </td>
                      <td className="py-4 px-4 text-[var(--foreground)]">
                        ${position.notional.toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-[var(--muted)] text-sm">
                        {position.expiryTime}
                      </td>
                      <td
                        className={`py-4 px-4 font-medium ${
                          position.currentPnL >= 0
                            ? "text-[var(--success)]"
                            : "text-[var(--danger)]"
                        }`}
                      >
                        {position.currentPnL >= 0 ? "+" : ""}$
                        {position.currentPnL.toFixed(2)}
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

      {/* How It Works */}
      <div className="mt-6 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
          How Variance Swaps Work
        </h2>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]20 flex items-center justify-center mb-3">
              <span className="text-[var(--primary)] font-bold">1</span>
            </div>
            <h3 className="font-medium text-[var(--foreground)] mb-2">
              Choose Direction
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Go long if you expect volatility to increase, short if you expect it to decrease.
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]20 flex items-center justify-center mb-3">
              <span className="text-[var(--primary)] font-bold">2</span>
            </div>
            <h3 className="font-medium text-[var(--foreground)] mb-2">
              Set Position Size
            </h3>
            <p className="text-sm text-[var(--muted)]">
              Enter notional amount and duration. Premium is based on current variance and time.
            </p>
          </div>
          <div>
            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]20 flex items-center justify-center mb-3">
              <span className="text-[var(--primary)] font-bold">3</span>
            </div>
            <h3 className="font-medium text-[var(--foreground)] mb-2">
              Settlement
            </h3>
            <p className="text-sm text-[var(--muted)]">
              At expiry, payout = Notional × (Realized Variance - Strike Variance) / Strike Variance
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
