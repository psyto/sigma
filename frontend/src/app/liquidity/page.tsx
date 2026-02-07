"use client";

import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Droplets, TrendingUp, RefreshCw, Gem, ArrowUpRight, ArrowDownRight, Info, AlertCircle, Loader2 } from "lucide-react";
import { useVolswap, useFundingSwap, useExoticVault } from "@/hooks";
import { useSigma } from "@/contexts/SigmaProvider";
import { useToast } from "@/components/Toast";

// Constants
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

type PoolType = "volswap" | "funding-swap" | "exotic-vault";

interface PoolInfo {
  id: PoolType;
  name: string;
  icon: typeof TrendingUp;
  color: string;
  tvl: number;
  utilization: number;
  yourShares: number;
  yourValue: number;
}

export default function LiquidityPage() {
  const { connected, publicKey } = useWallet();
  const { txState } = useSigma();
  const { showSuccess, showError } = useToast();

  // Load data from all protocols
  const { pools: volswapPools, lpPositions: volswapLPs, loading: volswapLoading, depositLiquidity: depositVolswap, withdrawLiquidity: withdrawVolswap } = useVolswap();
  const { pools: fundingPools, loading: fundingLoading, depositLiquidity: depositFunding, withdrawLiquidity: withdrawFunding } = useFundingSwap();
  const { vaults: exoticVaults, loading: exoticLoading, depositLiquidity: depositExotic, withdrawLiquidity: withdrawExotic } = useExoticVault();

  const loading = volswapLoading || fundingLoading || exoticLoading;

  // Build unified pool list
  const pools: PoolInfo[] = useMemo(() => {
    const poolList: PoolInfo[] = [];

    // VolSwap pools
    if (volswapPools.length > 0) {
      const pool = volswapPools[0];
      const lp = volswapLPs[0];
      poolList.push({
        id: "volswap",
        name: "VolSwap Pool",
        icon: TrendingUp,
        color: "var(--success)",
        tvl: pool.tvlUsd,
        utilization: pool.utilizationPercent,
        yourShares: lp?.shares?.toNumber() || 0,
        yourValue: lp?.shareValueUsd || 0,
      });
    } else {
      poolList.push({
        id: "volswap",
        name: "VolSwap Pool",
        icon: TrendingUp,
        color: "var(--success)",
        tvl: 0,
        utilization: 0,
        yourShares: 0,
        yourValue: 0,
      });
    }

    // FundingSwap pools
    if (fundingPools.length > 0) {
      const pool = fundingPools[0];
      poolList.push({
        id: "funding-swap",
        name: "FundingSwap Pool",
        icon: RefreshCw,
        color: "#3b82f6",
        tvl: pool.tvlUsd,
        utilization: pool.utilizationPercent,
        yourShares: 0, // Would come from LP positions
        yourValue: 0,
      });
    } else {
      poolList.push({
        id: "funding-swap",
        name: "FundingSwap Pool",
        icon: RefreshCw,
        color: "#3b82f6",
        tvl: 0,
        utilization: 0,
        yourShares: 0,
        yourValue: 0,
      });
    }

    // ExoticVault
    if (exoticVaults.length > 0) {
      const vault = exoticVaults[0];
      poolList.push({
        id: "exotic-vault",
        name: "ExoticVault Pool",
        icon: Gem,
        color: "#a855f7",
        tvl: vault.tvlUsd,
        utilization: vault.utilizationPercent,
        yourShares: 0, // Would come from LP positions
        yourValue: 0,
      });
    } else {
      poolList.push({
        id: "exotic-vault",
        name: "ExoticVault Pool",
        icon: Gem,
        color: "#a855f7",
        tvl: 0,
        utilization: 0,
        yourShares: 0,
        yourValue: 0,
      });
    }

    return poolList;
  }, [volswapPools, volswapLPs, fundingPools, exoticVaults]);

  const [selectedPool, setSelectedPool] = useState<PoolInfo | null>(null);
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set default selected pool once loaded
  useMemo(() => {
    if (pools.length > 0 && !selectedPool) {
      setSelectedPool(pools[0]);
    }
  }, [pools, selectedPool]);

  const currentPool = selectedPool || pools[0];
  const totalValue = pools.reduce((sum, pool) => sum + pool.yourValue, 0);
  const totalTVL = pools.reduce((sum, pool) => sum + pool.tvl, 0);

  const handleSubmit = async () => {
    if (!connected || !publicKey) {
      showError("Please connect your wallet first");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      showError("Please enter a valid amount");
      return;
    }

    setIsSubmitting(true);

    try {
      const userCollateral = PublicKey.findProgramAddressSync(
        [publicKey.toBuffer(), new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(), USDC_MINT.toBuffer()],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
      )[0];

      const amountValue = parseFloat(amount);
      let sig: string | null = null;

      if (action === "deposit") {
        switch (currentPool.id) {
          case "volswap":
            sig = await depositVolswap(SOL_MINT, userCollateral, amountValue);
            break;
          case "funding-swap":
            sig = await depositFunding("SOL-PERP", userCollateral, amountValue);
            break;
          case "exotic-vault":
            sig = await depositExotic(SOL_MINT, userCollateral, amountValue);
            break;
        }
      } else {
        const shares = parseInt(amount);
        switch (currentPool.id) {
          case "volswap":
            sig = await withdrawVolswap(SOL_MINT, USDC_MINT, userCollateral, shares);
            break;
          case "funding-swap":
            sig = await withdrawFunding("SOL-PERP", USDC_MINT, userCollateral, shares);
            break;
          case "exotic-vault":
            sig = await withdrawExotic(SOL_MINT, USDC_MINT, userCollateral, shares);
            break;
        }
      }

      if (sig) {
        showSuccess(`${action === "deposit" ? "Deposited" : "Withdrawn"} successfully! Signature: ${sig.slice(0, 8)}...`);
        setAmount("");
      }
    } catch (err: any) {
      showError(err.message || `Failed to ${action}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate shares for deposit or amount for withdrawal
  const calculateOutput = () => {
    if (!amount || !currentPool) return 0;
    const inputAmount = parseFloat(amount);
    if (currentPool.tvl === 0) return inputAmount; // 1:1 for empty pool

    if (action === "deposit") {
      return inputAmount; // Simplified - actual calculation depends on share price
    } else {
      return (inputAmount * currentPool.tvl) / (currentPool.yourShares || 1);
    }
  };

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
      </div>
    );
  }

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
          <p className="text-xs text-[var(--success)]">Across all pools</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Total Protocol TVL</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            ${totalTVL > 1000000 ? `${(totalTVL / 1000000).toFixed(2)}M` : totalTVL.toLocaleString()}
          </p>
          <p className="text-xs text-[var(--muted)]">All pools combined</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Active Pools</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {pools.filter(p => p.tvl > 0).length}
          </p>
          <p className="text-xs text-[var(--muted)]">With liquidity</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Your Positions</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {pools.filter(p => p.yourShares > 0).length}
          </p>
          <p className="text-xs text-[var(--muted)]">Pools with LP</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Pool Selection */}
        <div className="col-span-1 space-y-4">
          {pools.map((pool) => {
            const Icon = pool.icon;
            const isSelected = currentPool?.id === pool.id;
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
                      TVL: ${pool.tvl > 1000000 ? `${(pool.tvl / 1000000).toFixed(2)}M` : pool.tvl.toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex justify-between">
                  <div>
                    <p className="text-xs text-[var(--muted)]">Utilization</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">{pool.utilization.toFixed(1)}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--muted)]">Your Shares</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {pool.yourShares.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--muted)]">Your Value</p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      ${pool.yourValue.toLocaleString()}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Deposit/Withdraw Panel */}
        <div className="col-span-1 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          {currentPool && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${currentPool.color}20` }}
                >
                  <currentPool.icon className="w-5 h-5" style={{ color: currentPool.color }} />
                </div>
                <div>
                  <p className="font-medium text-[var(--foreground)]">{currentPool.name}</p>
                  <p className="text-sm text-[var(--muted)]">
                    {currentPool.utilization.toFixed(1)}% utilized
                  </p>
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
                  {action === "withdraw" && currentPool.yourShares > 0 && (
                    <button
                      onClick={() => setAmount(currentPool.yourShares.toString())}
                      className="text-xs text-[var(--primary)] hover:underline"
                    >
                      Max: {currentPool.yourShares.toLocaleString()}
                    </button>
                  )}
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
                  <span className="text-sm text-[var(--muted)]">You receive</span>
                  <span className="text-sm font-medium text-[var(--foreground)]">
                    {action === "deposit"
                      ? `~${calculateOutput().toFixed(2)} shares`
                      : `~$${calculateOutput().toFixed(2)} USDC`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-[var(--muted)]">Pool TVL</span>
                  <span className="text-sm text-[var(--foreground)]">
                    ${currentPool.tvl.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Pool Utilization */}
              <div className="p-4 rounded-lg bg-[var(--background)] mb-4">
                <p className="text-sm text-[var(--muted)] mb-2">Pool Utilization</p>
                <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(currentPool.utilization, 100)}%`,
                      backgroundColor: currentPool.color,
                    }}
                  />
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {currentPool.utilization.toFixed(1)}% of liquidity is being used
                </p>
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--primary)]/10 mb-4">
                <Info className="w-4 h-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
                <p className="text-xs text-[var(--muted)]">
                  {action === "deposit"
                    ? "Your deposit earns fees from trading activity. Share value increases over time."
                    : "Withdrawals may be limited during high utilization to ensure protocol solvency."}
                </p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={!connected || !amount || isSubmitting || txState.pending}
                className="w-full py-3 rounded-lg bg-[var(--primary)] text-[var(--background)] font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting || txState.pending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : connected ? (
                  action === "deposit" ? "Deposit" : "Withdraw"
                ) : (
                  "Connect Wallet"
                )}
              </button>
            </>
          )}
        </div>

        {/* Your Positions */}
        <div className="col-span-1 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Your LP Positions
          </h2>

          {pools.filter(p => p.yourShares > 0).length === 0 ? (
            <div className="text-center py-12">
              <Droplets className="w-12 h-12 text-[var(--muted)] mx-auto mb-4" />
              <p className="text-[var(--muted)]">No LP positions</p>
              <p className="text-sm text-[var(--muted)] mt-2">
                Deposit to a pool to start earning fees
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {pools.filter(p => p.yourShares > 0).map((pool) => {
                const Icon = pool.icon;
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
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 text-center py-2 rounded bg-[var(--card)]">
                        <p className="text-xs text-[var(--muted)]">Pool TVL</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">
                          ${pool.tvl.toLocaleString()}
                        </p>
                      </div>
                      <div className="flex-1 text-center py-2 rounded bg-[var(--card)]">
                        <p className="text-xs text-[var(--muted)]">Utilization</p>
                        <p className="text-sm font-medium text-[var(--foreground)]">
                          {pool.utilization.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Total Summary */}
          {totalValue > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-[var(--primary)]/10 border border-[var(--primary)]/30">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-[var(--muted)]">Total Value</span>
                <span className="text-sm font-medium text-[var(--foreground)]">${totalValue.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-[var(--muted)]">Active Positions</span>
                <span className="text-sm font-medium text-[var(--foreground)]">
                  {pools.filter(p => p.yourShares > 0).length}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
