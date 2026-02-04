"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function Header() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) {
      setBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const bal = await connection.getBalance(publicKey);
        setBalance(bal / LAMPORTS_PER_SOL);
      } catch (error) {
        console.error("Error fetching balance:", error);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [publicKey, connection]);

  return (
    <header className="h-16 bg-[var(--card)] border-b border-[var(--border)] flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-[var(--foreground)]">
          Derivatives Trading
        </h2>
      </div>

      <div className="flex items-center gap-4">
        {publicKey && balance !== null && (
          <div className="px-4 py-2 rounded-lg bg-[var(--background)] border border-[var(--border)]">
            <span className="text-sm text-[var(--muted)]">Balance: </span>
            <span className="text-sm font-medium text-[var(--foreground)]">
              {balance.toFixed(4)} SOL
            </span>
          </div>
        )}
        <WalletMultiButton />
      </div>
    </header>
  );
}
