"use client";

import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSigma } from "@/contexts/SigmaProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import type { ExoticVault, ExoticOption } from "@sigma-protocol/sdk";
import BN from "bn.js";

export interface VaultData extends ExoticVault {
  address: PublicKey;
  utilizationPercent: number;
  tvlUsd: number;
}

export interface OptionData extends ExoticOption {
  address: PublicKey;
  strikePriceUsd: number;
  barrierPriceUsd: number | null;
  payoutUsd: number;
  daysRemaining: number;
  optionTypeLabel: string;
  statusLabel: string;
}

function getOptionTypeLabel(optionType: any): string {
  if (optionType.asianCall) return "Asian Call";
  if (optionType.asianPut) return "Asian Put";
  if (optionType.upAndOutCall) return "Up & Out Call";
  if (optionType.downAndOutCall) return "Down & Out Call";
  if (optionType.upAndOutPut) return "Up & Out Put";
  if (optionType.downAndOutPut) return "Down & Out Put";
  if (optionType.upAndInCall) return "Up & In Call";
  if (optionType.downAndInCall) return "Down & In Call";
  if (optionType.upAndInPut) return "Up & In Put";
  if (optionType.downAndInPut) return "Down & In Put";
  return "Unknown";
}

function getStatusLabel(status: any): string {
  if (status.active) return "Active";
  if (status.knockedOut) return "Knocked Out";
  if (status.knockedIn) return "Knocked In";
  if (status.settled) return "Settled";
  if (status.claimed) return "Claimed";
  if (status.expired) return "Expired";
  return "Unknown";
}

export function useExoticVault() {
  const { client, isReady, sendTransaction, txState } = useSigma();
  const { publicKey } = useWallet();

  const [vaults, setVaults] = useState<VaultData[]>([]);
  const [options, setOptions] = useState<OptionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all vaults
  const fetchVaults = useCallback(async () => {
    if (!client) return;

    try {
      // For now, try to fetch SOL vault - in production would iterate known mints
      const solMint = new PublicKey("So11111111111111111111111111111111111111112");
      const vault = await client.exoticVault.getVault(solMint);

      if (vault) {
        const liquidity = vault.totalLiquidity.toNumber() / 1e6;
        const exposure = vault.totalExposure.toNumber() / 1e6;
        const utilization = liquidity > 0 ? (exposure / liquidity) * 100 : 0;

        setVaults([{
          ...vault,
          address: client.exoticVault.getVaultAddress(solMint),
          utilizationPercent: Math.min(utilization, 100),
          tvlUsd: liquidity,
        }]);
      } else {
        setVaults([]);
      }
    } catch (err: any) {
      console.error("Failed to fetch vaults:", err);
      setError(err.message);
    }
  }, [client]);

  // Fetch user options
  const fetchOptions = useCallback(async () => {
    if (!client || !publicKey) return;

    try {
      // Fetch options for SOL vault - in production would iterate known vaults
      const solMint = new PublicKey("So11111111111111111111111111111111111111112");
      const userOptions = await client.exoticVault.getUserOptions(solMint, publicKey);
      const now = Math.floor(Date.now() / 1000);
      const vaultAddress = client.exoticVault.getVaultAddress(solMint);

      const optionsWithData: OptionData[] = userOptions.map((opt: any) => {
        const expiryTime = opt.expiryTime.toNumber();
        const daysRemaining = Math.max(0, Math.ceil((expiryTime - now) / 86400));

        return {
          ...opt,
          address: vaultAddress, // Simplified - would derive actual option PDA
          strikePriceUsd: opt.strikePrice.toNumber() / 1e8,
          barrierPriceUsd: opt.barrierPrice
            ? opt.barrierPrice.toNumber() / 1e8
            : null,
          payoutUsd: opt.payoutAmount.toNumber() / 1e6,
          daysRemaining,
          optionTypeLabel: getOptionTypeLabel(opt.optionType),
          statusLabel: getStatusLabel(opt.status),
        };
      });

      setOptions(optionsWithData);
    } catch (err: any) {
      console.error("Failed to fetch options:", err);
    }
  }, [client, publicKey]);

  // Initial fetch
  useEffect(() => {
    if (!isReady) {
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      await Promise.all([fetchVaults(), fetchOptions()]);
      setLoading(false);
    };

    fetchAll();
  }, [isReady, fetchVaults, fetchOptions]);

  // Buy Asian call
  const buyAsianCall = useCallback(
    async (
      underlyingMint: PublicKey,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      strikePrice: number,
      notional: number,
      durationDays: number
    ) => {
      if (!client) throw new Error("Client not ready");

      const strikeBN = new BN(strikePrice * 1e8);
      const notionalBN = new BN(notional * 1e6);

      const sig = await sendTransaction(async (c) => {
        return c.exoticVault.buyAsianCall(
          underlyingMint,
          collateralMint,
          userCollateral,
          strikeBN,
          notionalBN,
          durationDays
        );
      });

      if (sig) {
        await fetchOptions();
      }

      return sig;
    },
    [client, sendTransaction, fetchOptions]
  );

  // Buy Asian put
  const buyAsianPut = useCallback(
    async (
      underlyingMint: PublicKey,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      strikePrice: number,
      notional: number,
      durationDays: number
    ) => {
      if (!client) throw new Error("Client not ready");

      const strikeBN = new BN(strikePrice * 1e8);
      const notionalBN = new BN(notional * 1e6);

      const sig = await sendTransaction(async (c) => {
        return c.exoticVault.buyAsianPut(
          underlyingMint,
          collateralMint,
          userCollateral,
          strikeBN,
          notionalBN,
          durationDays
        );
      });

      if (sig) {
        await fetchOptions();
      }

      return sig;
    },
    [client, sendTransaction, fetchOptions]
  );

  // Buy knockout option
  const buyKnockout = useCallback(
    async (
      underlyingMint: PublicKey,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      strikePrice: number,
      barrierPrice: number,
      notional: number,
      durationDays: number,
      isCall: boolean,
      isUpBarrier: boolean
    ) => {
      if (!client) throw new Error("Client not ready");

      const strikeBN = new BN(strikePrice * 1e8);
      const barrierBN = new BN(barrierPrice * 1e8);
      const notionalBN = new BN(notional * 1e6);

      const sig = await sendTransaction(async (c) => {
        return c.exoticVault.buyKnockout(
          underlyingMint,
          collateralMint,
          userCollateral,
          strikeBN,
          barrierBN,
          notionalBN,
          durationDays,
          isCall,
          isUpBarrier
        );
      });

      if (sig) {
        await fetchOptions();
      }

      return sig;
    },
    [client, sendTransaction, fetchOptions]
  );

  // Buy knockin option
  const buyKnockin = useCallback(
    async (
      underlyingMint: PublicKey,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      strikePrice: number,
      barrierPrice: number,
      notional: number,
      durationDays: number,
      isCall: boolean,
      isUpBarrier: boolean
    ) => {
      if (!client) throw new Error("Client not ready");

      const strikeBN = new BN(strikePrice * 1e8);
      const barrierBN = new BN(barrierPrice * 1e8);
      const notionalBN = new BN(notional * 1e6);

      const sig = await sendTransaction(async (c) => {
        return c.exoticVault.buyKnockin(
          underlyingMint,
          collateralMint,
          userCollateral,
          strikeBN,
          barrierBN,
          notionalBN,
          durationDays,
          isCall,
          isUpBarrier
        );
      });

      if (sig) {
        await fetchOptions();
      }

      return sig;
    },
    [client, sendTransaction, fetchOptions]
  );

  // Settle option
  const settleOption = useCallback(
    async (underlyingMint: PublicKey, optionIndex: BN) => {
      if (!client) throw new Error("Client not ready");

      const sig = await sendTransaction(async (c) => {
        return c.exoticVault.settleOption(underlyingMint, optionIndex);
      });

      if (sig) {
        await fetchOptions();
      }

      return sig;
    },
    [client, sendTransaction, fetchOptions]
  );

  // Claim payout
  const claimPayout = useCallback(
    async (
      underlyingMint: PublicKey,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      optionIndex: BN
    ) => {
      if (!client) throw new Error("Client not ready");

      const sig = await sendTransaction(async (c) => {
        return c.exoticVault.claimPayout(
          underlyingMint,
          collateralMint,
          userCollateral,
          optionIndex
        );
      });

      if (sig) {
        await fetchOptions();
      }

      return sig;
    },
    [client, sendTransaction, fetchOptions]
  );

  // Deposit liquidity
  const depositLiquidity = useCallback(
    async (
      underlyingMint: PublicKey,
      userCollateral: PublicKey,
      amount: number
    ) => {
      if (!client) throw new Error("Client not ready");

      const amountBN = new BN(amount * 1e6);

      const sig = await sendTransaction(async (c) => {
        return c.exoticVault.depositLiquidity(underlyingMint, userCollateral, amountBN);
      });

      if (sig) {
        await fetchVaults();
      }

      return sig;
    },
    [client, sendTransaction, fetchVaults]
  );

  // Withdraw liquidity
  const withdrawLiquidity = useCallback(
    async (
      underlyingMint: PublicKey,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      shares: number
    ) => {
      if (!client) throw new Error("Client not ready");

      const sharesBN = new BN(shares);

      const sig = await sendTransaction(async (c) => {
        return c.exoticVault.withdrawLiquidity(
          underlyingMint,
          collateralMint,
          userCollateral,
          sharesBN
        );
      });

      if (sig) {
        await fetchVaults();
      }

      return sig;
    },
    [client, sendTransaction, fetchVaults]
  );

  return {
    vaults,
    options,
    loading,
    error,
    txState,
    buyAsianCall,
    buyAsianPut,
    buyKnockout,
    buyKnockin,
    settleOption,
    claimPayout,
    depositLiquidity,
    withdrawLiquidity,
    refresh: useCallback(async () => {
      await Promise.all([fetchVaults(), fetchOptions()]);
    }, [fetchVaults, fetchOptions]),
  };
}
