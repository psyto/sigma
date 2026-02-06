import { PublicKey } from "@solana/web3.js";

// Program IDs from environment or defaults
export const PROGRAM_IDS = {
  SHARED_ORACLE: new PublicKey(
    process.env.NEXT_PUBLIC_SHARED_ORACLE_PROGRAM_ID ||
      "81SjyEmtwJUeqU9ZEfc7sm9evVpDuGwRSLrFQeCF4j5o"
  ),
  VOLSWAP: new PublicKey(
    process.env.NEXT_PUBLIC_VOLSWAP_PROGRAM_ID ||
      "FGjwkx9XxzJZvgybXTtDjsWJgCuhXwNJTthFwhfj8nPS"
  ),
  FUNDING_SWAP: new PublicKey(
    process.env.NEXT_PUBLIC_FUNDING_SWAP_PROGRAM_ID ||
      "GTERstKRN2YBVNwx6UePFhbn7BAfYeJkZmdX7gXqRjjx"
  ),
  EXOTIC_VAULT: new PublicKey(
    process.env.NEXT_PUBLIC_EXOTIC_VAULT_PROGRAM_ID ||
      "6zryMfmTZPcneCvU5Bgs6amu5vg5jK2uQRCSkkNfKf3P"
  ),
} as const;

// Network configuration
export const NETWORK = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "localnet";

export const ENDPOINTS: Record<string, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

export const CURRENT_ENDPOINT = ENDPOINTS[NETWORK] || ENDPOINTS.localnet;

// Token decimals
export const USDC_DECIMALS = 6;
export const SOL_DECIMALS = 9;

// Common constants
export const BPS_DENOMINATOR = 10000;
