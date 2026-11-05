"use client";

import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSigma } from "@/contexts/SigmaProvider";
import { useWallet } from "@solana/wallet-adapter-react";
import type { FundingPool, FundingSwapPosition } from "@sigma-protocol/sdk";
import BN from "bn.js";

export interface FundingPoolData extends FundingPool {
  address: PublicKey;
  fixedRatePercent: number;
  utilizationPercent: number;
  tvlUsd: number;
}

export interface SwapPositionData extends FundingSwapPosition {
  address: PublicKey;
  /** Receives the fixed rate (the program's payer side) */
  isReceiveFixed: boolean;
  /** Swap index (the swap account's seed) */
  swapId: BN;
  pnlUsd: number;
  daysRemaining: number;
}

export function useFundingSwap() {
  const { client, isReady, sendTransaction, txState } = useSigma();
  const { publicKey } = useWallet();

  const [pools, setPools] = useState<FundingPoolData[]>([]);
  const [positions, setPositions] = useState<SwapPositionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all funding pools
  const fetchPools = useCallback(async () => {
    if (!client) return;

    try {
      const allPools = await client.fundingSwap.getAllPools();
      const poolsWithData: FundingPoolData[] = allPools.map((pool: any) => {
        const totalReceiver = pool.account.totalReceiverNotional?.toNumber?.() ?? pool.account.totalReceiverNotional ?? 0;
        const totalPayer = pool.account.totalPayerNotional?.toNumber?.() ?? pool.account.totalPayerNotional ?? 0;
        const totalNotional = totalReceiver + totalPayer;
        const liquidity = (pool.account.totalLiquidity?.toNumber?.() ?? pool.account.totalLiquidity ?? 0) / 1e6;
        const utilization = liquidity > 0
          ? (totalNotional / 1e6) / liquidity * 100
          : 0;
        const fixedRate = pool.account.currentFixedRateBps ?? 0;

        return {
          ...pool.account,
          address: pool.publicKey,
          fixedRatePercent: fixedRate / 100, // bps to percent
          utilizationPercent: Math.min(utilization, 100),
          tvlUsd: liquidity,
        };
      });

      setPools(poolsWithData);
    } catch (err: any) {
      console.error("Failed to fetch funding pools:", err);
      setError(err.message);
    }
  }, [client]);

  // Fetch user positions
  const fetchPositions = useCallback(async () => {
    if (!client || !publicKey) return;

    try {
      const userPositions = await client.fundingSwap.getAllUserPositions(publicKey);
      const now = Math.floor(Date.now() / 1000);

      const positionsWithData: SwapPositionData[] = userPositions.map((pos: any) => {
        // Exact expiry stored on-chain at open
        const expiresAt = pos.account.expiresAt.toNumber();
        const daysRemaining = Math.max(0, Math.ceil((expiresAt - now) / 86400));

        // P&L recorded at settlement
        const pnl = pos.account.accumulatedPnl.toNumber() / 1e6;

        return {
          ...pos.account,
          address: pos.publicKey,
          isReceiveFixed: !pos.account.isReceiver,
          swapId: pos.account.swapIndex,
          pnlUsd: pnl,
          daysRemaining,
        };
      });

      setPositions(positionsWithData);
    } catch (err: any) {
      console.error("Failed to fetch swap positions:", err);
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
      await Promise.all([fetchPools(), fetchPositions()]);
      setLoading(false);
    };

    fetchAll();
  }, [isReady, fetchPools, fetchPositions]);

  // Open receive fixed position
  const openReceiveFixed = useCallback(
    async (
      marketSymbol: string,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      notional: number,
      durationPeriods: number,
      fixedRateLimitBps: number
    ) => {
      if (!client) throw new Error("Client not ready");

      const notionalBN = new BN(notional * 1e6);

      const sig = await sendTransaction(async (c) => {
        // receive fixed, pay floating: the program's payer side; the pool's fixed rate must be at least the limit
        return c.fundingSwap.openPayer(
          marketSymbol,
          collateralMint,
          userCollateral,
          notionalBN,
          durationPeriods,
          fixedRateLimitBps
        );
      });

      if (sig) {
        await fetchPositions();
      }

      return sig;
    },
    [client, sendTransaction, fetchPositions]
  );

  // Open pay fixed position
  const openPayFixed = useCallback(
    async (
      marketSymbol: string,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      notional: number,
      durationPeriods: number,
      fixedRateLimitBps: number
    ) => {
      if (!client) throw new Error("Client not ready");

      const notionalBN = new BN(notional * 1e6);

      const sig = await sendTransaction(async (c) => {
        // pay fixed, receive floating: the program's receiver side; the pool's fixed rate must be at most the limit
        return c.fundingSwap.openReceiver(
          marketSymbol,
          collateralMint,
          userCollateral,
          notionalBN,
          durationPeriods,
          fixedRateLimitBps
        );
      });

      if (sig) {
        await fetchPositions();
      }

      return sig;
    },
    [client, sendTransaction, fetchPositions]
  );

  // Settle swap at expiry
  const settleSwap = useCallback(
    async (
      marketSymbol: string,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      swapId: BN
    ) => {
      if (!client) throw new Error("Client not ready");

      const sig = await sendTransaction(async (c) => {
        // settle_swap moves no tokens; collateral accounts are not needed
        return c.fundingSwap.settleSwap(marketSymbol, swapId);
      });

      if (sig) {
        await fetchPositions();
      }

      return sig;
    },
    [client, sendTransaction, fetchPositions]
  );

  // Close swap early
  const closeSwapEarly = useCallback(
    async (
      marketSymbol: string,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      swapId: BN,
      swap?: PublicKey
    ) => {
      if (!client) throw new Error("Client not ready");

      const sig = await sendTransaction(async (c) => {
        return c.fundingSwap.closeSwapEarly(
          marketSymbol,
          collateralMint,
          userCollateral,
          swapId,
          swap
        );
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
      marketSymbol: string,
      userCollateral: PublicKey,
      amount: number
    ) => {
      if (!client) throw new Error("Client not ready");

      const amountBN = new BN(amount * 1e6);

      const sig = await sendTransaction(async (c) => {
        return c.fundingSwap.depositLiquidity(marketSymbol, userCollateral, amountBN);
      });

      if (sig) {
        await fetchPools();
      }

      return sig;
    },
    [client, sendTransaction, fetchPools]
  );

  // Withdraw liquidity
  const withdrawLiquidity = useCallback(
    async (
      marketSymbol: string,
      collateralMint: PublicKey,
      userCollateral: PublicKey,
      shares: number
    ) => {
      if (!client) throw new Error("Client not ready");

      const sharesBN = new BN(shares);

      const sig = await sendTransaction(async (c) => {
        return c.fundingSwap.withdrawLiquidity(
          marketSymbol,
          collateralMint,
          userCollateral,
          sharesBN
        );
      });

      if (sig) {
        await fetchPools();
      }

      return sig;
    },
    [client, sendTransaction, fetchPools]
  );

  return {
    pools,
    positions,
    loading,
    error,
    txState,
    openReceiveFixed,
    openPayFixed,
    settleSwap,
    closeSwapEarly,
    depositLiquidity,
    withdrawLiquidity,
    refresh: useCallback(async () => {
      await Promise.all([fetchPools(), fetchPositions()]);
    }, [fetchPools, fetchPositions]),
  };
}
