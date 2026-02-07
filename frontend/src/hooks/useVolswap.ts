"use client";

import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSigma } from "@/contexts/SigmaProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import type { VariancePool, VariancePosition, LiquidityProvider } from "@sigma-protocol/sdk";
import BN from "bn.js";

export interface PoolData extends VariancePool {
  address: PublicKey;
  strikeVariancePercent: number;
  utilizationPercent: number;
  tvlUsd: number;
}

export interface PositionData extends VariancePosition {
  address: PublicKey;
  pnlUsd: number;
  pnlPercent: number;
}

export interface LPData extends LiquidityProvider {
  address: PublicKey;
  shareValueUsd: number;
}

export function useVolswap() {
  const { client, isReady, sendTransaction, txState } = useSigma();
  const { publicKey } = useWallet();

  const [pools, setPools] = useState<PoolData[]>([]);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [lpPositions, setLpPositions] = useState<LPData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all variance pools
  const fetchPools = useCallback(async () => {
    if (!client) return;

    try {
      const allPools = await client.volswap.getAllPools();
      const poolsWithData: PoolData[] = allPools.map((pool: any) => {
        const totalLong = pool.account.totalLongNotional?.toNumber?.() ?? pool.account.totalLongNotional ?? 0;
        const totalShort = pool.account.totalShortNotional?.toNumber?.() ?? pool.account.totalShortNotional ?? 0;
        const totalNotional = totalLong + totalShort;
        const liquidity = (pool.account.totalLiquidity?.toNumber?.() ?? pool.account.totalLiquidity ?? 0) / 1e6; // USDC decimals
        const utilization = liquidity > 0
          ? (totalNotional / 1e6) / liquidity * 100
          : 0;
        const strikeVariance = pool.account.strikeVarianceBps?.toNumber?.() ?? pool.account.strikeVarianceBps ?? 0;

        return {
          ...pool.account,
          address: pool.publicKey,
          strikeVariancePercent: strikeVariance / 100,
          utilizationPercent: Math.min(utilization, 100),
          tvlUsd: liquidity,
        };
      });

      setPools(poolsWithData);
    } catch (err: any) {
      console.error("Failed to fetch pools:", err);
      setError(err.message);
    }
  }, [client]);

  // Fetch user positions
  const fetchPositions = useCallback(async () => {
    if (!client || !publicKey) return;

    try {
      const userPositions = await client.volswap.getUserPositions(publicKey);
      const positionsWithData: PositionData[] = userPositions.map((pos: any) => {
        // Calculate P&L (simplified - would need current variance for accurate calc)
        const premium = pos.account.premiumPaid.toNumber() / 1e6;
        const payout = pos.account.payout.toNumber() / 1e6;
        const pnl = payout - premium;
        const pnlPercent = premium > 0 ? (pnl / premium) * 100 : 0;

        return {
          ...pos.account,
          address: pos.publicKey,
          pnlUsd: pnl,
          pnlPercent,
        };
      });

      setPositions(positionsWithData);
    } catch (err: any) {
      console.error("Failed to fetch positions:", err);
    }
  }, [client, publicKey]);

  // Fetch LP positions
  const fetchLPPositions = useCallback(async () => {
    if (!client || !publicKey) return;

    try {
      const lps = await client.volswap.getUserLPPositions(publicKey);
      const lpsWithData: LPData[] = lps.map((lp: any) => {
        const shares = lp.account.shares.toNumber();
        // Would need pool total shares and liquidity for accurate value
        const shareValue = lp.account.depositedAmount.toNumber() / 1e6;

        return {
          ...lp.account,
          address: lp.publicKey,
          shareValueUsd: shareValue,
        };
      });

      setLpPositions(lpsWithData);
    } catch (err: any) {
      console.error("Failed to fetch LP positions:", err);
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
      await Promise.all([fetchPools(), fetchPositions(), fetchLPPositions()]);
      setLoading(false);
    };

    fetchAll();
  }, [isReady, fetchPools, fetchPositions, fetchLPPositions]);

  // Open long variance position
  const openLong = useCallback(
    async (
      underlyingMint: PublicKey,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      notional: number,
      maxPremium: number
    ) => {
      if (!client) throw new Error("Client not ready");

      const notionalBN = new BN(notional * 1e6); // USDC decimals
      const maxPremiumBN = new BN(maxPremium * 1e6);

      const sig = await sendTransaction(async (c) => {
        return c.volswap.openLong(
          underlyingMint,
          collateralMint,
          userCollateral,
          notionalBN,
          maxPremiumBN
        );
      });

      if (sig) {
        await fetchPositions();
      }

      return sig;
    },
    [client, sendTransaction, fetchPositions]
  );

  // Open short variance position
  const openShort = useCallback(
    async (
      underlyingMint: PublicKey,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      notional: number,
      minPremium: number
    ) => {
      if (!client) throw new Error("Client not ready");

      const notionalBN = new BN(notional * 1e6);
      const minPremiumBN = new BN(minPremium * 1e6);

      const sig = await sendTransaction(async (c) => {
        return c.volswap.openShort(
          underlyingMint,
          collateralMint,
          userCollateral,
          notionalBN,
          minPremiumBN
        );
      });

      if (sig) {
        await fetchPositions();
      }

      return sig;
    },
    [client, sendTransaction, fetchPositions]
  );

  // Close position early (with penalty)
  const closePositionEarly = useCallback(
    async (
      underlyingMint: PublicKey,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      epoch: BN
    ) => {
      if (!client) throw new Error("Client not ready");

      const sig = await sendTransaction(async (c) => {
        return c.volswap.closePositionEarly(
          underlyingMint,
          collateralMint,
          userCollateral,
          epoch
        );
      });

      if (sig) {
        await fetchPositions();
      }

      return sig;
    },
    [client, sendTransaction, fetchPositions]
  );

  // Claim payout
  const claimPayout = useCallback(
    async (
      underlyingMint: PublicKey,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      epoch: BN
    ) => {
      if (!client) throw new Error("Client not ready");

      const sig = await sendTransaction(async (c) => {
        return c.volswap.claimPayout(underlyingMint, collateralMint, userCollateral, epoch);
      });

      if (sig) {
        await fetchPositions();
      }

      return sig;
    },
    [client, sendTransaction, fetchPositions]
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
        return c.volswap.depositLiquidity(underlyingMint, userCollateral, amountBN);
      });

      if (sig) {
        await Promise.all([fetchPools(), fetchLPPositions()]);
      }

      return sig;
    },
    [client, sendTransaction, fetchPools, fetchLPPositions]
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
        return c.volswap.withdrawLiquidity(
          underlyingMint,
          collateralMint,
          userCollateral,
          sharesBN
        );
      });

      if (sig) {
        await Promise.all([fetchPools(), fetchLPPositions()]);
      }

      return sig;
    },
    [client, sendTransaction, fetchPools, fetchLPPositions]
  );

  return {
    pools,
    positions,
    lpPositions,
    loading,
    error,
    txState,
    openLong,
    openShort,
    closePositionEarly,
    claimPayout,
    depositLiquidity,
    withdrawLiquidity,
    refresh: useCallback(async () => {
      await Promise.all([fetchPools(), fetchPositions(), fetchLPPositions()]);
    }, [fetchPools, fetchPositions, fetchLPPositions]),
  };
}
