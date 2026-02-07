"use client";

import { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { ArrowLeftRight, Clock, Info, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { useFundingSwap } from "@/hooks";
import { useSigma } from "@/contexts/SigmaProvider";
import { useToast } from "@/components/Toast";
import { validateAmount } from "@/lib/validation";
import BN from "bn.js";

// Constants
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const DEFAULT_MARKET = "SOL-PERP";

export default function FundingSwapPage() {
  const { connected, publicKey } = useWallet();
  const { isReady, txState } = useSigma();
  const { pools, positions, loading, error, openReceiveFixed, openPayFixed, closeSwapEarly, refresh } = useFundingSwap();
  const { showSuccess, showError } = useToast();

  const [swapSide, setSwapSide] = useState<"receiver" | "payer">("receiver");
  const [notional, setNotional] = useState("");
  const [duration, setDuration] = useState("30");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Validation
  const validation = useMemo(() => {
    const notionalValidation = notional
      ? validateAmount(notional, { min: 100, max: 1000000, fieldName: "Notional" })
      : { isValid: true };

    return {
      notional: notionalValidation,
      isValid: notionalValidation.isValid && !!notional,
    };
  }, [notional]);

  // Get primary pool for SOL
  const primaryPool = pools[0];
  const currentFundingRate = primaryPool ? primaryPool.fixedRatePercent / 100 : 0.0105;
  const avgFundingRate = currentFundingRate * 0.93; // Simplified
  const fixedRate = swapSide === "receiver" ? currentFundingRate * 0.8 : currentFundingRate * 1.2;

  const handleOpenSwap = async () => {
    if (!connected || !publicKey) {
      showError("Please connect your wallet first");
      return;
    }

    setTouched({ notional: true });

    if (!validation.isValid) {
      showError(validation.notional.error || "Please fix form errors");
      return;
    }

    setIsSubmitting(true);

    try {
      // Get user's USDC token account (would need proper ATA derivation in production)
      const userCollateral = PublicKey.findProgramAddressSync(
        [publicKey.toBuffer(), new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(), USDC_MINT.toBuffer()],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
      )[0];

      const swapId = new BN(Date.now());
      const notionalValue = parseFloat(notional);
      const fixedRateBps = Math.round(fixedRate * 10000);

      let sig: string | null;
      if (swapSide === "receiver") {
        sig = await openReceiveFixed(
          DEFAULT_MARKET,
          USDC_MINT,
          userCollateral,
          notionalValue,
          fixedRateBps,
          swapId
        );
      } else {
        sig = await openPayFixed(
          DEFAULT_MARKET,
          USDC_MINT,
          userCollateral,
          notionalValue,
          fixedRateBps,
          swapId
        );
      }

      if (sig) {
        showSuccess(`Swap opened! Signature: ${sig.slice(0, 8)}...`);
        setNotional("");
      }
    } catch (err: any) {
      showError(err.message || "Failed to open swap");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseSwap = async (position: any) => {
    if (!connected || !publicKey) return;

    try {
      const userCollateral = PublicKey.findProgramAddressSync(
        [publicKey.toBuffer(), new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(), USDC_MINT.toBuffer()],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
      )[0];

      const sig = await closeSwapEarly(
        DEFAULT_MARKET,
        USDC_MINT,
        userCollateral,
        position.swapId
      );

      if (sig) {
        showSuccess(`Swap closed! Signature: ${sig.slice(0, 8)}...`);
      }
    } catch (err: any) {
      showError(err.message || "Failed to close swap");
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <div className="h-8 w-64 bg-[var(--card)] rounded animate-pulse mb-2" />
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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
            FundingSwap - Interest Rate Swaps
          </h1>
          <p className="text-[var(--muted)]">
            Swap floating funding rates for fixed. Hedge perp funding exposure or speculate on rate direction.
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
          <p className="text-sm text-[var(--muted)] mb-1">Pool TVL</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            ${primaryPool ? primaryPool.tvlUsd.toLocaleString() : "0"}
          </p>
          <p className="text-xs text-[var(--muted)]">{pools.length} pool(s)</p>
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
              onBlur={() => setTouched((t) => ({ ...t, notional: true }))}
              placeholder="50,000"
              className={`w-full px-4 py-3 rounded-lg bg-[var(--background)] border text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none ${
                touched.notional && !validation.notional.isValid
                  ? "border-[var(--danger)] focus:border-[var(--danger)]"
                  : "border-[var(--border)] focus:border-[var(--primary)]"
              }`}
            />
            {touched.notional && !validation.notional.isValid ? (
              <p className="text-xs text-[var(--danger)] mt-1">
                {validation.notional.error}
              </p>
            ) : (
              <p className="text-xs text-[var(--muted)] mt-1">
                Min: $100 | Max: $1,000,000
              </p>
            )}
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
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--primary)]/10 mb-4">
            <Info className="w-4 h-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
            <p className="text-xs text-[var(--muted)]">
              {swapSide === "receiver"
                ? "You receive fixed rate and pay floating. Profit if funding stays below fixed rate."
                : "You pay fixed rate and receive floating. Profit if funding exceeds fixed rate."}
            </p>
          </div>

          <button
            onClick={handleOpenSwap}
            disabled={!connected || !validation.isValid || isSubmitting || txState.pending}
            className="w-full py-3 rounded-lg bg-[var(--primary)] text-[var(--background)] font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting || txState.pending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : connected ? (
              "Open Swap"
            ) : (
              "Connect Wallet"
            )}
          </button>
        </div>

        {/* Right Column */}
        <div className="col-span-2 space-y-6">
          {/* Pools */}
          <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              Available Pools ({pools.length})
            </h2>
            {pools.length > 0 ? (
              <div className="grid grid-cols-3 gap-4">
                {pools.map((pool, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-[var(--background)]">
                    <p className="text-sm text-[var(--muted)] mb-1">{pool.marketSymbol || "Unknown"}</p>
                    <p className="text-lg font-bold text-[var(--foreground)]">${pool.tvlUsd.toLocaleString()}</p>
                    <p className="text-xs text-[var(--muted)]">{pool.utilizationPercent.toFixed(1)}% utilized</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-[var(--muted)]">
                No pools available. Initialize pools to start trading.
              </div>
            )}
          </div>

          {/* Open Swaps */}
          <div className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
              Your Swaps ({positions.length})
            </h2>

            {positions.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-[var(--muted)] mx-auto mb-4" />
                <p className="text-[var(--muted)]">No open swaps</p>
                <p className="text-sm text-[var(--muted)] mt-2">
                  Open a swap above to get started
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Side</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Fixed Rate</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Notional</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Days Left</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">P&L</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-[var(--muted)]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((pos, idx) => (
                      <tr key={idx} className="border-b border-[var(--border)] last:border-0">
                        <td className="py-4 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            pos.isReceiveFixed
                              ? "bg-[#3b82f6]/20 text-[#3b82f6]"
                              : "bg-[#a855f7]/20 text-[#a855f7]"
                          }`}>
                            {pos.isReceiveFixed ? "Receiver" : "Payer"}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-[var(--foreground)]">
                          {(pos.fixedRateBps.toNumber() / 100).toFixed(3)}%
                        </td>
                        <td className="py-4 px-4 text-[var(--foreground)]">
                          ${(pos.notional.toNumber() / 1e6).toLocaleString()}
                        </td>
                        <td className="py-4 px-4 text-[var(--muted)] text-sm">
                          {pos.daysRemaining}d
                        </td>
                        <td className={`py-4 px-4 font-medium ${
                          pos.pnlUsd >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"
                        }`}>
                          {pos.pnlUsd >= 0 ? "+" : ""}${pos.pnlUsd.toFixed(2)}
                        </td>
                        <td className="py-4 px-4">
                          <button
                            onClick={() => handleCloseSwap(pos)}
                            className="px-3 py-1 text-sm rounded bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                          >
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
