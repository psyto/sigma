"use client";

import {
  createContext,
  useContext,
  useMemo,
  ReactNode,
  useState,
  useCallback,
} from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { SigmaClient } from "@sigma-protocol/sdk";

// Transaction state
export interface TransactionState {
  pending: boolean;
  signature: string | null;
  error: string | null;
  confirmed: boolean;
}

interface SigmaContextValue {
  client: SigmaClient | null;
  isReady: boolean;
  // Transaction handling
  txState: TransactionState;
  resetTxState: () => void;
  // SDK methods return signature directly after sending via .rpc()
  sendTransaction: (
    executeRpc: (client: SigmaClient) => Promise<string>
  ) => Promise<string | null>;
}

const SigmaContext = createContext<SigmaContextValue>({
  client: null,
  isReady: false,
  txState: { pending: false, signature: null, error: null, confirmed: false },
  resetTxState: () => {},
  sendTransaction: async () => null,
});

export function useSigma() {
  return useContext(SigmaContext);
}

interface SigmaProviderProps {
  children: ReactNode;
}

export function SigmaProvider({ children }: SigmaProviderProps) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [txState, setTxState] = useState<TransactionState>({
    pending: false,
    signature: null,
    error: null,
    confirmed: false,
  });

  // Create Anchor provider and Sigma client
  const client = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) {
      return null;
    }

    try {
      const provider = new AnchorProvider(
        connection,
        wallet as any,
        { commitment: "confirmed" }
      );

      return new SigmaClient(provider, { cluster: "localnet" });
    } catch (err) {
      console.error("Failed to create SigmaClient:", err);
      return null;
    }
  }, [connection, wallet.publicKey, wallet.signTransaction]);

  const isReady = !!client && wallet.connected;

  const resetTxState = useCallback(() => {
    setTxState({
      pending: false,
      signature: null,
      error: null,
      confirmed: false,
    });
  }, []);

  const sendTransaction = useCallback(
    async (
      executeRpc: (client: SigmaClient) => Promise<string>
    ): Promise<string | null> => {
      if (!client || !wallet.signTransaction || !wallet.publicKey) {
        setTxState({
          pending: false,
          signature: null,
          error: "Wallet not connected",
          confirmed: false,
        });
        return null;
      }

      setTxState({
        pending: true,
        signature: null,
        error: null,
        confirmed: false,
      });

      try {
        // Execute the SDK method - it handles signing via Anchor Provider
        // and returns the transaction signature after sending via .rpc()
        const signature = await executeRpc(client);

        // The SDK's .rpc() method already confirms the transaction,
        // but we can do an additional check
        await connection.confirmTransaction(signature, "confirmed");

        setTxState({
          pending: false,
          signature,
          error: null,
          confirmed: true,
        });

        return signature;
      } catch (err: any) {
        console.error("Transaction failed:", err);
        setTxState({
          pending: false,
          signature: null,
          error: err.message || "Transaction failed",
          confirmed: false,
        });
        return null;
      }
    },
    [client, wallet, connection]
  );

  return (
    <SigmaContext.Provider
      value={{
        client,
        isReady,
        txState,
        resetTxState,
        sendTransaction,
      }}
    >
      {children}
    </SigmaContext.Provider>
  );
}
