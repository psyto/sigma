"use client";

import { useState, useEffect, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { TrendingUp, TrendingDown, AlertCircle, Info, Loader2, RefreshCw } from "lucide-react";
import { useVolswap } from "@/hooks/useVolswap";
import { useOracle } from "@/hooks/useOracle";
import { useSigma } from "@/contexts/SigmaProvider";
import { useToast } from "@/components/Toast";
import { validateAmount, validatePositiveAmount, combineValidations } from "@/lib/validation";

// Mock token mints for development - replace with actual mints
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export default function VolSwapPage() {
  const { connected, publicKey } = useWallet();
  const { isReady, txState } = useSigma();
  const { showSuccess, showError, showLoading, removeToast } = useToast();

  const {
    pools,
    positions,
    loading,
    error,
    openLong,
    openShort,
    claimPayout,
    refresh,
  } = useVolswap();

  const { varianceTrackers } = useOracle();

  const [positionType, setPositionType] = useState<"long" | "short">("long");
  const [notional, setNotional] = useState("");
  const [maxPremium, setMaxPremium] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // Get the first pool for display (in production, user would select)
  const pool = pools[0];
  const varianceTracker = varianceTrackers[0];

  // Get pool limits for validation
  const minNotional = pool?.minNotional?.toNumber() / 1e6 || 100;
  const maxNotional = pool?.maxNotional?.toNumber() / 1e6 || 100000;

  // Validation
  const validation = useMemo(() => {
    const notionalValidation = notional
      ? validateAmount(notional, { min: minNotional, max: maxNotional, fieldName: "Notional" })
      : { isValid: true };

    const premiumValidation = maxPremium
      ? validatePositiveAmount(maxPremium, { fieldName: "Max premium" })
      : { isValid: true };

    return {
      notional: notionalValidation,
      maxPremium: premiumValidation,
      isValid: notionalValidation.isValid && premiumValidation.isValid && !!notional,
    };
  }, [notional, maxPremium, minNotional, maxNotional]);

  // Calculate display values
  const currentVariance = varianceTracker?.variancePercent ?? 32.5;
  const strikeVariance = pool?.strikeVariancePercent ?? 35.0;

  // Calculate epoch progress
  const epochProgress = pool ? 65 : 0; // Would calculate from pool.epochStartTime
  const timeToEpochEnd = "2d 14h 32m"; // Would calculate from pool.epochDuration

  // Filter active positions
  const activePositions = positions.filter(
    (p) => p.status && "active" in p.status
  );

  const handleOpenPosition = async () => {
    if (!connected || !publicKey) {
      showError("Wallet Error", "Please connect your wallet first");
      return;
    }

    // Mark all fields as touched to show validation errors
    setTouched({ notional: true, maxPremium: true });

    if (!validation.isValid) {
      const errorMsg = validation.notional.error || validation.maxPremium.error || "Please fix form errors";
      showError("Validation Error", errorMsg);
      return;
    }

    const premium = maxPremium ? parseFloat(maxPremium) : parseFloat(notional) * 0.05;
    const notionalValue = parseFloat(notional);

    setIsSubmitting(true);
    const loadingToastId = showLoading(
      "Opening Position",
      `${positionType === "long" ? "Long" : "Short"} variance position for $${notionalValue.toLocaleString()}`
    );

    try {
      // For now, using mock token accounts - in production, would fetch user's token accounts
      const userCollateral = publicKey; // Would be user's USDC token account

      const sig = positionType === "long"
        ? await openLong(SOL_MINT, USDC_MINT, userCollateral, notionalValue, premium)
        : await openShort(SOL_MINT, USDC_MINT, userCollateral, notionalValue, premium);

      removeToast(loadingToastId);

      if (sig) {
        showSuccess(
          "Position Opened",
          `Successfully opened ${positionType} variance position`,
          sig
        );
        setNotional("");
        setMaxPremium("");
      } else {
        showError("Transaction Failed", txState.error || "Failed to open position");
      }
    } catch (err: any) {
      removeToast(loadingToastId);
      showError("Transaction Failed", err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClaimPayout = async (position: typeof positions[0]) => {
    if (!publicKey) return;

    const loadingToastId = showLoading("Claiming Payout", "Processing your claim...");

    try {
      const sig = await claimPayout(
        SOL_MINT,
        USDC_MINT,
        publicKey, // Would be user's USDC token account
        position.epoch
      );

      removeToast(loadingToastId);

      if (sig) {
        showSuccess("Payout Claimed", `Received $${position.pnlUsd.toFixed(2)}`, sig);
      } else {
        showError("Claim Failed", txState.error || "Failed to claim payout");
      }
    } catch (err: any) {
      removeToast(loadingToastId);
      showError("Claim Failed", err.message);
    }
  };

  // Estimated premium calculation
  const estimatedPremium = notional ? parseFloat(notional) * 0.02 : 0;
  const estimatedFee = notional ? parseFloat(notional) * 0.001 : 0;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">
            VolSwap - Variance Swaps
          </h1>
          <p className="text-[var(--muted)]">
            Trade realized variance. Go long if you expect high volatility, short if you expect calm markets.
          </p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="p-2 rounded-lg bg-[var(--card)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-[var(--danger)]20 border border-[var(--danger)] flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--danger)]" />
          <p className="text-[var(--danger)]">{error}</p>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Realized Variance</p>
          {loading ? (
            <div className="h-8 w-20 skeleton rounded" />
          ) : (
            <p className="text-2xl font-bold text-[var(--success)]">
              {currentVariance.toFixed(1)}%
            </p>
          )}
          <p className="text-xs text-[var(--muted)]">Current epoch</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Strike Variance</p>
          {loading ? (
            <div className="h-8 w-20 skeleton rounded" />
          ) : (
            <p className="text-2xl font-bold text-[var(--foreground)]">
              {strikeVariance.toFixed(1)}%
            </p>
          )}
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
              className="h-full bg-[var(--primary)] rounded-full transition-all"
              style={{ width: `${epochProgress}%` }}
            />
          </div>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Time to Settlement</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            {timeToEpochEnd}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {pool ? `Epoch #${pool.currentEpoch?.toString() || "1"}` : "Epoch #1"}
          </p>
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
              onBlur={() => setTouched((t) => ({ ...t, notional: true }))}
              placeholder="10,000"
              min="0"
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
                Min: ${minNotional.toLocaleString()} | Max: ${maxNotional.toLocaleString()}
              </p>
            )}
          </div>

          {/* Max Premium Input */}
          <div className="mb-4">
            <label className="text-sm text-[var(--muted)] mb-2 block">
              Max Premium (USDC) - Optional
            </label>
            <input
              type="number"
              value={maxPremium}
              onChange={(e) => setMaxPremium(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, maxPremium: true }))}
              placeholder={estimatedPremium.toFixed(2)}
              min="0"
              className={`w-full px-4 py-3 rounded-lg bg-[var(--background)] border text-[var(--foreground)] placeholder-[var(--muted)] focus:outline-none ${
                touched.maxPremium && !validation.maxPremium.isValid
                  ? "border-[var(--danger)] focus:border-[var(--danger)]"
                  : "border-[var(--border)] focus:border-[var(--primary)]"
              }`}
            />
            {touched.maxPremium && !validation.maxPremium.isValid && (
              <p className="text-xs text-[var(--danger)] mt-1">
                {validation.maxPremium.error}
              </p>
            )}
          </div>

          {/* Position Summary */}
          <div className="p-4 rounded-lg bg-[var(--background)] mb-4">
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">Strike Variance</span>
              <span className="text-sm text-[var(--foreground)]">{strikeVariance.toFixed(1)}%</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-[var(--muted)]">Est. Premium</span>
              <span className="text-sm text-[var(--foreground)]">
                {notional ? `$${estimatedPremium.toFixed(2)}` : "-"}
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
                {notional ? `$${estimatedFee.toFixed(2)}` : "-"}
              </span>
            </div>
          </div>

          {/* Info Box */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--primary)]20 mb-4">
            <Info className="w-4 h-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
            <p className="text-xs text-[var(--muted)]">
              {positionType === "long"
                ? "You profit if realized variance exceeds strike variance at settlement."
                : "You profit if realized variance is below strike variance at settlement."}
            </p>
          </div>

          <button
            onClick={handleOpenPosition}
            disabled={!isReady || !validation.isValid || isSubmitting}
            className="w-full py-3 rounded-lg bg-[var(--primary)] text-[var(--background)] font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Opening Position...
              </>
            ) : !connected ? (
              "Connect Wallet"
            ) : (
              "Open Position"
            )}
          </button>
        </div>

        {/* Positions Table */}
        <div className="col-span-2 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Your Positions
          </h2>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 skeleton rounded-lg" />
              ))}
            </div>
          ) : !connected ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-[var(--muted)] mx-auto mb-4" />
              <p className="text-[var(--muted)]">Connect wallet to view positions</p>
            </div>
          ) : activePositions.length === 0 ? (
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
                      Epoch
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
                  {activePositions.map((position, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-[var(--border)] last:border-0"
                    >
                      <td className="py-4 px-4">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            position.isLong
                              ? "bg-[var(--success)]20 text-[var(--success)]"
                              : "bg-[var(--danger)]20 text-[var(--danger)]"
                          }`}
                        >
                          {position.isLong ? "Long" : "Short"}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-[var(--foreground)]">
                        {(position.strikeVarianceBps?.toNumber() / 100 || 0).toFixed(1)}%
                      </td>
                      <td className="py-4 px-4 text-[var(--foreground)]">
                        ${((position.notional?.toNumber() || 0) / 1e6).toLocaleString()}
                      </td>
                      <td className="py-4 px-4 text-[var(--muted)] text-sm">
                        #{position.epoch?.toString() || "1"}
                      </td>
                      <td
                        className={`py-4 px-4 font-medium ${
                          position.pnlUsd >= 0
                            ? "text-[var(--success)]"
                            : "text-[var(--danger)]"
                        }`}
                      >
                        {position.pnlUsd >= 0 ? "+" : ""}$
                        {position.pnlUsd.toFixed(2)}
                      </td>
                      <td className="py-4 px-4">
                        {"settled" in (position.status || {}) ? (
                          <button
                            onClick={() => handleClaimPayout(position)}
                            className="px-3 py-1 text-sm rounded bg-[var(--success)] text-white hover:opacity-80 transition-opacity"
                          >
                            Claim
                          </button>
                        ) : (
                          <button className="px-3 py-1 text-sm rounded bg-[var(--background)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors">
                            Close Early
                          </button>
                        )}
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
