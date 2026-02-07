"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Gem, TrendingUp, TrendingDown, Shield, Zap, Info, AlertCircle, RefreshCw, Loader2 } from "lucide-react";
import { useExoticVault } from "@/hooks";
import { useSigma } from "@/contexts/SigmaProvider";
import { useToast } from "@/components/Toast";
import BN from "bn.js";

type OptionType = "asian-call" | "asian-put" | "knockout-call" | "knockout-put" | "knockin-call" | "knockin-put";

// Constants
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

export default function ExoticVaultPage() {
  const { connected, publicKey } = useWallet();
  const { txState } = useSigma();
  const { vaults, options, loading, error, buyAsianCall, buyAsianPut, buyKnockout, buyKnockin, settleOption, claimPayout, refresh } = useExoticVault();
  const { showSuccess, showError } = useToast();

  const [optionType, setOptionType] = useState<OptionType>("asian-call");
  const [strike, setStrike] = useState("");
  const [barrier, setBarrier] = useState("");
  const [notional, setNotional] = useState("");
  const [duration, setDuration] = useState("7");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Get primary vault
  const primaryVault = vaults[0];
  const currentPrice = 98.45; // Would come from oracle in production
  const currentTWAP = 97.82;

  const isAsian = optionType.startsWith("asian");
  const isCall = optionType.includes("call");
  const isKnockout = optionType.startsWith("knockout");
  const isKnockin = optionType.startsWith("knockin");

  // Calculate estimated premium
  const calculatePremium = () => {
    if (!notional || !strike) return 0;
    const n = parseFloat(notional);
    const basePremium = n * 0.03;
    const discount = isAsian ? 0.7 : (isKnockout ? 0.5 : 0.4);
    return basePremium * discount * (parseInt(duration) / 7);
  };

  const handleBuyOption = async () => {
    if (!connected || !publicKey) {
      showError("Please connect your wallet first");
      return;
    }

    if (!notional || !strike) {
      showError("Please enter notional and strike price");
      return;
    }

    if (!isAsian && !barrier) {
      showError("Please enter barrier price for barrier options");
      return;
    }

    setIsSubmitting(true);

    try {
      const userCollateral = PublicKey.findProgramAddressSync(
        [publicKey.toBuffer(), new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(), USDC_MINT.toBuffer()],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
      )[0];

      const strikePrice = parseFloat(strike);
      const notionalValue = parseFloat(notional);
      const durationDays = parseInt(duration);

      let sig: string | null = null;

      if (optionType === "asian-call") {
        sig = await buyAsianCall(SOL_MINT, USDC_MINT, userCollateral, strikePrice, notionalValue, durationDays);
      } else if (optionType === "asian-put") {
        sig = await buyAsianPut(SOL_MINT, USDC_MINT, userCollateral, strikePrice, notionalValue, durationDays);
      } else if (isKnockout || isKnockin) {
        const barrierPrice = parseFloat(barrier);
        const isUpBarrier = isCall; // Calls typically have up barriers, puts have down barriers

        if (isKnockout) {
          sig = await buyKnockout(SOL_MINT, USDC_MINT, userCollateral, strikePrice, barrierPrice, notionalValue, durationDays, isCall, isUpBarrier);
        } else {
          sig = await buyKnockin(SOL_MINT, USDC_MINT, userCollateral, strikePrice, barrierPrice, notionalValue, durationDays, isCall, isUpBarrier);
        }
      }

      if (sig) {
        showSuccess(`Option purchased! Signature: ${sig.slice(0, 8)}...`);
        setNotional("");
        setStrike("");
        setBarrier("");
      }
    } catch (err: any) {
      showError(err.message || "Failed to buy option");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSettleOption = async (option: any) => {
    if (!connected) return;

    try {
      const sig = await settleOption(SOL_MINT, option.optionIndex);
      if (sig) {
        showSuccess(`Option settled! Signature: ${sig.slice(0, 8)}...`);
      }
    } catch (err: any) {
      showError(err.message || "Failed to settle option");
    }
  };

  const handleClaimPayout = async (option: any) => {
    if (!connected || !publicKey) return;

    try {
      const userCollateral = PublicKey.findProgramAddressSync(
        [publicKey.toBuffer(), new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA").toBuffer(), USDC_MINT.toBuffer()],
        new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
      )[0];

      const sig = await claimPayout(SOL_MINT, USDC_MINT, userCollateral, option.optionIndex);
      if (sig) {
        showSuccess(`Payout claimed! Signature: ${sig.slice(0, 8)}...`);
      }
    } catch (err: any) {
      showError(err.message || "Failed to claim payout");
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
            ExoticVault - Exotic Options
          </h1>
          <p className="text-[var(--muted)]">
            Trade Asian options (TWAP-settled) and barrier options (knock-in/knock-out) on SOL.
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
          <p className="text-sm text-[var(--muted)] mb-1">SOL Spot Price</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">${currentPrice}</p>
          <p className="text-xs text-[var(--success)]">Live</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">24H TWAP</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">${currentTWAP}</p>
          <p className="text-xs text-[var(--muted)]">For Asian options</p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Vault TVL</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">
            ${primaryVault ? primaryVault.tvlUsd.toLocaleString() : "0"}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {primaryVault ? `${primaryVault.utilizationPercent.toFixed(1)}% utilized` : "Available liquidity"}
          </p>
        </div>
        <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
          <p className="text-sm text-[var(--muted)] mb-1">Your Options</p>
          <p className="text-2xl font-bold text-[var(--foreground)]">{options.length}</p>
          <p className="text-xs text-[var(--muted)]">Active positions</p>
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
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
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
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
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
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
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
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
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
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
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
                    ? "border-[var(--primary)] bg-[var(--primary)]/10"
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
              <span className="text-sm text-[var(--muted)]">Est. Premium</span>
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
          <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--primary)]/10 mb-4">
            <Info className="w-4 h-4 text-[var(--primary)] mt-0.5 flex-shrink-0" />
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
            disabled={!connected || !notional || !strike || isSubmitting || txState.pending}
            className="w-full py-3 rounded-lg bg-[var(--primary)] text-[var(--background)] font-medium hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting || txState.pending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : connected ? (
              "Buy Option"
            ) : (
              "Connect Wallet"
            )}
          </button>
        </div>

        {/* Your Options */}
        <div className="col-span-2 bg-[var(--card)] rounded-xl p-6 border border-[var(--border)]">
          <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Your Options ({options.length})
          </h2>

          {options.length === 0 ? (
            <div className="text-center py-12">
              <Gem className="w-12 h-12 text-[var(--muted)] mx-auto mb-4" />
              <p className="text-[var(--muted)]">No open options</p>
              <p className="text-sm text-[var(--muted)] mt-2">
                Buy an option above to get started
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {options.map((option, idx) => (
                <div
                  key={idx}
                  className="p-4 rounded-lg bg-[var(--background)] border border-[var(--border)]"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Gem className="w-5 h-5 text-[var(--primary)]" />
                      <div>
                        <p className="font-medium text-[var(--foreground)]">{option.optionTypeLabel}</p>
                        <p className="text-sm text-[var(--muted)]">
                          Strike: ${option.strikePriceUsd.toFixed(2)}
                          {option.barrierPriceUsd && ` | Barrier: $${option.barrierPriceUsd.toFixed(2)}`}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      option.statusLabel === "Active"
                        ? "bg-[var(--success)]/20 text-[var(--success)]"
                        : option.statusLabel === "Settled"
                        ? "bg-[#3b82f6]/20 text-[#3b82f6]"
                        : "bg-[var(--muted)]/20 text-[var(--muted)]"
                    }`}>
                      {option.statusLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-4 mb-3">
                    <div>
                      <p className="text-xs text-[var(--muted)]">Notional</p>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        ${(option.notional.toNumber() / 1e6).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--muted)]">Premium Paid</p>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        ${(option.premiumPaid.toNumber() / 1e6).toFixed(2)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--muted)]">Days Left</p>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {option.daysRemaining}d
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[var(--muted)]">Payout</p>
                      <p className={`text-sm font-medium ${
                        option.payoutUsd > 0 ? "text-[var(--success)]" : "text-[var(--foreground)]"
                      }`}>
                        ${option.payoutUsd.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {option.statusLabel === "Active" && option.daysRemaining === 0 && (
                      <button
                        onClick={() => handleSettleOption(option)}
                        className="flex-1 py-2 text-sm rounded bg-[var(--primary)] text-[var(--background)] hover:bg-[var(--primary-hover)] transition-colors"
                      >
                        Settle
                      </button>
                    )}
                    {option.statusLabel === "Settled" && option.payoutUsd > 0 && (
                      <button
                        onClick={() => handleClaimPayout(option)}
                        className="flex-1 py-2 text-sm rounded bg-[var(--success)] text-white hover:bg-[var(--success)]/90 transition-colors"
                      >
                        Claim ${option.payoutUsd.toFixed(2)}
                      </button>
                    )}
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
