"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Droplets, TrendingUp, RefreshCw, Gem, ArrowUpRight, ArrowDownRight, Info } from "lucide-react";

const pools = [
  {
    id: "volswap",
    name: "VolSwap Pool",
    icon: TrendingUp,
    color: "var(--success)",
    tvl: 1500000,
    apy: 12.5,
    yourShares: 5000,
    yourValue: 5250,
    totalShares: 1500000,
    utilization: 65,
  },
  {
    id: "funding-swap",
    name: "FundingSwap Pool",
    icon: RefreshCw,
    color: "#3b82f6",
    tvl: 2000000,
    apy: 8.2,
    yourShares: 10000,
    yourValue: 10820,
    totalShares: 2000000,
    utilization: 45,
  },
  {
    id: "exotic-vault",
    name: "ExoticVault Pool",
    icon: Gem,
    color: "#a855f7",
    tvl: 1200000,
    apy: 15.8,
    yourShares: 3000,
    yourValue: 3474,
    totalShares: 1200000,
    utilization: 72,
  },
];

export default function LiquidityPage() {
  const { connected } = useWallet();
  const [selectedPool, setSelectedPool] = useState(pools[0]);
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");

  const totalValue = pools.reduce((sum, pool) => sum + pool.yourValue, 0);
  const totalTVL = pools.reduce((sum, pool) => sum + pool.tvl, 0);
  const avgAPY = pools.reduce((sum, pool) => sum + pool.apy, 0) / pools.length;

  const handleSubmit = () => {
    if (!connected) {
      alert("Please connect your wallet first");
      return;
    }
    console.log(`${action} ${amount} to ${selectedPool.id}`);
  };

  // Calculate shares for deposit or amount for withdrawal
  const calculateOutput = () => {
    if (!amount) return 0;
    const inputAmount = parseFloat(amount);
    if (action === "deposit") {
      // shares = amount * totalShares / tvl
      return (inputAmount * selectedPool.totalShares) / selectedPool.tvl;
    } else {
      // amount = shares * tvl / totalShares
      return (inputAmount * selectedPool.tvl) / selectedPool.totalShares;
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
          Liquidity Provision
        </h1>
        <p className="text-[var(--muted)]">
          Provide liquidity to earn fees from trading activity across all Sigma protocols.
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Your Total Value</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            ${totalValue.toLocaleString()}
          </p>
          <p className="text-xs text-[var(--success)]">+$1,544 earned</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Total TVL</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            ${(totalTVL / 1000000).toFixed(2)}M
          </p>
          <p className="text-xs text-[var(--muted)]">Across all pools</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Avg APY</p>
          <p className="text-2xl font-bold text-[var(--success)]">
            {avgAPY.toFixed(1)}%
          </p>
          <p className="text-xs text-[var(--muted)]">Variable rate</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Pools Active</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">3</p>
          <p className="text-xs text-[var(--muted)]">Providing liquidity</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Pool Selection & Action */}
        <div className="col-span-1 space-y-4">
          {/* Pool Cards */}
          {pools.map((pool) => {
            const Icon = pool.icon;
            const isSelected = selectedPool.id === pool.id;
            return (
              <button
                key={pool.id}
                onClick={() => setSelectedPool(pool)}
                className={`w-full p-4 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-[var(--primary)] bg-[var(--card)]"
                    : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted)]"
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: `${pool.color}20` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: pool.color }} />
                  </div>
                  <div>
                    <p className="font-medium text-[var(--foreground)]">{pool.name}</p>
                    <p className="text-xs text-[var(--muted)]">
                      TVL: ${(pool.tvl / 1000000).toFixed(2)}M
                    </p>
                  </div>
                </div>
                <div className="flex justify-between">
                  <div>
                    <p className="text-xs text-[var(--muted)]">APY</p>
                    <p className="text-sm font-medium text-[var(--success)]">{pool.apy}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--muted)]">Your Value</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      ${pool.yourValue.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--muted)]">Utilization</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">{pool.utilization}%</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Deposit/Withdraw Panel */}
        <div className="col-span-1 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${selectedPool.color}20` }}
            >
              <selectedPool.icon className="w-5 h-5" style={{ color: selectedPool.color }} />
            </div>
            <div>
              <p className="font-medium text-[var(--foreground)]">{selectedPool.name}</p>
              <p className="text-sm text-[var(--muted)]">APY: {selectedPool.apy}%</p>
            </div>
          </div>

          {/* Action Toggle */}
          <div className="flex rounded-lg overflow-hidden border border-[var(--border)] mb-4">
            <button
              onClick={() => setAction("deposit")}
              className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
                action === "deposit"
                  ? "bg-[var(--success)] text-white"
                  : "bg-[var(--background)] text-[var(--muted)]"
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              Deposit
            </button>
            <button
              onClick={() => setAction("withdraw")}
              className={`flex-1 py-3 px-4 flex items-center justify-center gap-2 transition-colors ${
                action === "withdraw"
                  ? "bg-[var(--danger)] text-white"
                  : "bg-[var(--background)] text-[var(--muted)]"
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              Withdraw
            </button>
          </div>

          {/* Amount Input */}
          <div className="mb-4">
            <div className="flex justify-between mb-2">
              <label className="text-sm text-[var(--muted)]">
                {action === "deposit" ? "Amount (USDC)" : "Shares"}
              </label>
              <button
                onClick={() => setAmount(action === "deposit" ? "10000" : selectedPool.yourShares.toString())}
                className="text-xs text-[var(--primary)] hover:underline"
              >
                Max: {action === "deposit" ? "$10,000" : selectedPool.yourShares.toLocaleString()}
              </button>
            </div>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full px-4 py-3 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--primary)] text-lg"
            />
          </div>

          {/* Output Preview */}
          <div className="p-4 rounded-lg bg-[var(--background)] mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">
                {action === "deposit" ? "You receive" : "You receive"}
              </span>
              <span className="text-sm font-medium text-[var(--foreground)]">
                {action === "deposit"
                  ? `${calculateOutput().toFixed(2)} shares`
                  : `$${calculateOutput().toFixed(2)} USDC`}
              </span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">Share price</span>
              <span className="text-sm text-[var(--foreground)]">
                ${(selectedPool.tvl / selectedPool.totalShares).toFixed(4)}
              </span>
            </div>
            {action === "withdraw" && (
              <div className="flex justify-between">
                <span className="text-sm text-[var(--muted)]">Withdrawal fee</span>
                <span className="text-sm text-[var(--foreground)]">0.1%</span>
              </div>
            )}
          </div>

          {/* Pool Stats */}
          <div className="p-4 rounded-lg bg-[var(--background)] mb-4">
            <p className="text-sm text-[var(--muted)] mb-2">Pool Utilization</p>
            <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden mb-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${selectedPool.utilization}%`,
                  backgroundColor: selectedPool.color,
                }}
              />
            </div>
            <p className="text-xs text-[var(--muted)]">
              {selectedPool.utilization}% of liquidity is currently being used
            </p>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--primary)]20 mb-4">
            <Info className="w-4 h-4 text-[var(--primary)] mt-0.5" />
            <p className="text-xs text-[var(--muted)]">
              {action === "deposit"
                ? "Your deposit earns fees from trading activity. Share value increases over time."
                : "Withdrawals may be limited during high utilization to ensure protocol solvency."}
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!connected || !amount}
            className="w-full py-3 rounded-lg bg-[var(--primary)] text-[var(--background)] font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connected ? (action === "deposit" ? "Deposit" : "Withdraw") : "Connect Wallet"}
          </button>
        </div>

        {/* Your Positions */}
        <div className="col-span-1 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Your LP Positions
          </h2>

          <div className="space-y-4">
            {pools.map((pool) => {
              const Icon = pool.icon;
              const earnings = pool.yourValue - pool.yourShares;
              return (
                <div
                  key={pool.id}
                  className="p-4 rounded-lg bg-[var(--background)] border border-[var(--border)]"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${pool.color}20` }}
                    >
                      <Icon className="w-4 h-4" style={{ color: pool.color }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[var(--foreground)]">{pool.name}</p>
                      <p className="text-xs text-[var(--muted)]">
                        {pool.yourShares.toLocaleString()} shares
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        ${pool.yourValue.toLocaleString()}
                      </p>
                      <p className={`text-xs ${earnings >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
                        {earnings >= 0 ? "+" : ""}${earnings.toFixed(0)} earned
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 text-center py-2 rounded bg-[var(--card)]">
                      <p className="text-xs text-[var(--muted)]">APY</p>
                      <p className="text-sm font-medium text-[var(--success)]">{pool.apy}%</p>
                    </div>
                    <div className="flex-1 text-center py-2 rounded bg-[var(--card)]">
                      <p className="text-xs text-[var(--muted)]">Share Price</p>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        ${(pool.tvl / pool.totalShares).toFixed(4)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Total Summary */}
          <div className="mt-4 p-4 rounded-lg bg-[var(--primary)]10 border border-[var(--primary)]30">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">Total Deposited</span>
              <span className="text-sm font-medium text-[var(--foreground)]">$18,000</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">Current Value</span>
              <span className="text-sm font-medium text-[var(--foreground)]">${totalValue.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-[var(--muted)]">Total Earnings</span>
              <span className="text-sm font-medium text-[var(--success)]">+$1,544</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
