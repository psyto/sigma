"use client";

import { useState, useEffect, useCallback } from "react";
import { PublicKey } from "@solana/web3.js";
import { useSigma } from "@/contexts/SigmaProvider";
import type { PriceFeed, VarianceTracker, FundingFeed, VolatilityIndex } from "@sigma-protocol/sdk";

// Price feed with computed fields
export interface PriceFeedData extends PriceFeed {
  address: PublicKey;
  priceUsd: number;
  lastUpdateAgo: string;
}

// Variance tracker with computed fields
export interface VarianceData extends VarianceTracker {
  address: PublicKey;
  variancePercent: number;
  volatilityPercent: number;
}

// Funding feed with computed fields
export interface FundingData extends FundingFeed {
  address: PublicKey;
  ratePercent: number;
  annualizedPercent: number;
}

export function useOracle() {
  const { client, isReady } = useSigma();

  const [priceFeeds, setPriceFeeds] = useState<PriceFeedData[]>([]);
  const [varianceTrackers, setVarianceTrackers] = useState<VarianceData[]>([]);
  const [fundingFeeds, setFundingFeeds] = useState<FundingData[]>([]);
  const [volatilityIndex, setVolatilityIndex] = useState<VolatilityIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all price feeds
  const fetchPriceFeeds = useCallback(async () => {
    if (!client) return;

    try {
      const feeds = await client.oracle.getAllPriceFeeds();
      const feedsWithData: PriceFeedData[] = feeds.map((feed: any) => {
        const price = feed.account.latestPrice.toNumber() / 1e8; // Assuming 8 decimals
        const timestamp = feed.account.latestTimestamp.toNumber();
        const now = Math.floor(Date.now() / 1000);
        const ago = now - timestamp;

        let lastUpdateAgo = "Just now";
        if (ago > 3600) {
          lastUpdateAgo = `${Math.floor(ago / 3600)}h ago`;
        } else if (ago > 60) {
          lastUpdateAgo = `${Math.floor(ago / 60)}m ago`;
        } else if (ago > 0) {
          lastUpdateAgo = `${ago}s ago`;
        }

        return {
          ...feed.account,
          address: feed.publicKey,
          priceUsd: price,
          lastUpdateAgo,
        };
      });

      setPriceFeeds(feedsWithData);
    } catch (err: any) {
      console.error("Failed to fetch price feeds:", err);
      setError(err.message);
    }
  }, [client]);

  // Fetch all variance trackers
  const fetchVarianceTrackers = useCallback(async () => {
    if (!client) return;

    try {
      const trackers = await client.oracle.getAllVarianceTrackers();
      const trackersWithData: VarianceData[] = trackers.map((tracker: any) => {
        const variance = tracker.account.realizedVariance.toNumber() / 100; // bps to percent
        const volatility = tracker.account.annualizedVolatility.toNumber() / 100;

        return {
          ...tracker.account,
          address: tracker.publicKey,
          variancePercent: variance,
          volatilityPercent: volatility,
        };
      });

      setVarianceTrackers(trackersWithData);
    } catch (err: any) {
      console.error("Failed to fetch variance trackers:", err);
    }
  }, [client]);

  // Fetch all funding feeds
  const fetchFundingFeeds = useCallback(async () => {
    if (!client) return;

    try {
      const feeds = await client.oracle.getAllFundingFeeds();
      const feedsWithData: FundingData[] = feeds.map((feed: any) => {
        const rate = (feed.account.currentRateBps?.toNumber?.() ?? feed.account.currentRateBps ?? 0) / 10000; // bps to decimal
        const annualized = rate * 3 * 365; // 8h rate to annual

        return {
          ...feed.account,
          address: feed.publicKey,
          ratePercent: rate * 100,
          annualizedPercent: annualized * 100,
        };
      });

      setFundingFeeds(feedsWithData);
    } catch (err: any) {
      console.error("Failed to fetch funding feeds:", err);
    }
  }, [client]);

  // Fetch volatility index
  const fetchVolatilityIndex = useCallback(async () => {
    if (!client) return;

    try {
      const indices = await client.oracle.getAllVolatilityIndices();
      if (indices.length > 0) {
        setVolatilityIndex(indices[0].account);
      }
    } catch (err: any) {
      console.error("Failed to fetch volatility index:", err);
    }
  }, [client]);

  // Initial fetch
  useEffect(() => {
    if (!isReady) {
      setLoading(false);
      return;
    }

    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      await Promise.all([
        fetchPriceFeeds(),
        fetchVarianceTrackers(),
        fetchFundingFeeds(),
        fetchVolatilityIndex(),
      ]);

      setLoading(false);
    };

    fetchAll();
  }, [isReady, fetchPriceFeeds, fetchVarianceTrackers, fetchFundingFeeds, fetchVolatilityIndex]);

  // Polling for updates
  useEffect(() => {
    if (!isReady) return;

    const interval = setInterval(() => {
      fetchPriceFeeds();
      fetchVarianceTrackers();
      fetchFundingFeeds();
    }, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, [isReady, fetchPriceFeeds, fetchVarianceTrackers, fetchFundingFeeds]);

  return {
    priceFeeds,
    varianceTrackers,
    fundingFeeds,
    volatilityIndex,
    loading,
    error,
    refresh: useCallback(async () => {
      await Promise.all([
        fetchPriceFeeds(),
        fetchVarianceTrackers(),
        fetchFundingFeeds(),
        fetchVolatilityIndex(),
      ]);
    }, [fetchPriceFeeds, fetchVarianceTrackers, fetchFundingFeeds, fetchVolatilityIndex]),
  };
}

// Hook for a single price feed
export function usePriceFeed(assetMint: PublicKey | null) {
  const { client, isReady } = useSigma();
  const [priceFeed, setPriceFeed] = useState<PriceFeedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isReady || !client || !assetMint) {
      setLoading(false);
      return;
    }

    const fetch = async () => {
      try {
        const feed = await client.oracle.getPriceFeed(assetMint);
        if (feed) {
          const price = feed.latestPrice.toNumber() / 1e8;
          const timestamp = feed.latestTimestamp.toNumber();
          const now = Math.floor(Date.now() / 1000);
          const ago = now - timestamp;

          let lastUpdateAgo = "Just now";
          if (ago > 3600) {
            lastUpdateAgo = `${Math.floor(ago / 3600)}h ago`;
          } else if (ago > 60) {
            lastUpdateAgo = `${Math.floor(ago / 60)}m ago`;
          } else if (ago > 0) {
            lastUpdateAgo = `${ago}s ago`;
          }

          setPriceFeed({
            ...feed,
            address: assetMint,
            priceUsd: price,
            lastUpdateAgo,
          });
        }
      } catch (err) {
        console.error("Failed to fetch price feed:", err);
      } finally {
        setLoading(false);
      }
    };

    fetch();

    const interval = setInterval(fetch, 5000);
    return () => clearInterval(interval);
  }, [isReady, client, assetMint]);

  return { priceFeed, loading };
}
