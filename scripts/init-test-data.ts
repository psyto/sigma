/**
 * Initialize test data on localnet
 *
 * Run with: npx ts-node scripts/init-test-data.ts
 */

import { Connection, Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet, BN, Idl } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

// Program IDs from Anchor.toml
const PROGRAM_IDS = {
  SHARED_ORACLE: new PublicKey("81SjyEmtwJUeqU9ZEfc7sm9evVpDuGwRSLrFQeCF4j5o"),
  VOLSWAP: new PublicKey("FGjwkx9XxzJZvgybXTtDjsWJgCuhXwNJTthFwhfj8nPS"),
  FUNDING_SWAP: new PublicKey("GTERstKRN2YBVNwx6UePFhbn7BAfYeJkZmdX7gXqRjjx"),
  EXOTIC_VAULT: new PublicKey("6zryMfmTZPcneCvU5Bgs6amu5vg5jK2uQRCSkkNfKf3P"),
};

// Token mints
const SOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// Load IDLs
function loadIdl(name: string): Idl {
  const idlPath = path.join(__dirname, "..", "target", "idl", `${name}.json`);
  return JSON.parse(fs.readFileSync(idlPath, "utf8"));
}

// PDA helpers for shared_oracle
function findPriceFeedPDA(assetMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("price_feed"), assetMint.toBuffer()],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

function findSampleBufferPDA(priceFeed: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("sample_buffer"), priceFeed.toBuffer()],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

function findVarianceTrackerPDA(priceFeed: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("variance_tracker"), priceFeed.toBuffer()],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

function findFundingFeedPDA(marketSymbol: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("funding_feed"), Buffer.from(marketSymbol)],
    PROGRAM_IDS.SHARED_ORACLE
  );
}

// PDA helpers for volswap
function findVariancePoolPDA(underlyingMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("variance_pool"), underlyingMint.toBuffer()],
    PROGRAM_IDS.VOLSWAP
  );
}

function findPoolVaultPDA(pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), pool.toBuffer()],
    PROGRAM_IDS.VOLSWAP
  );
}

// PDA helpers for funding_swap
function findFundingPoolPDA(marketSymbol: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("funding_pool"), Buffer.from(marketSymbol)],
    PROGRAM_IDS.FUNDING_SWAP
  );
}

function findFundingPoolVaultPDA(pool: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool_vault"), pool.toBuffer()],
    PROGRAM_IDS.FUNDING_SWAP
  );
}

// PDA helpers for exotic_vault
function findExoticVaultPDA(underlyingMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("exotic_vault"), underlyingMint.toBuffer()],
    PROGRAM_IDS.EXOTIC_VAULT
  );
}

function findVaultCollateralPDA(vault: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault_collateral"), vault.toBuffer()],
    PROGRAM_IDS.EXOTIC_VAULT
  );
}

async function main() {
  console.log("Initializing test data on localnet...\n");

  // Setup connection and provider
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");

  // Load wallet from default location
  const walletPath = process.env.HOME + "/.config/solana/id.json";
  const walletKeypair = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8")))
  );

  console.log(`Wallet: ${walletKeypair.publicKey.toString()}`);

  const wallet = new Wallet(walletKeypair);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

  // Load programs
  const oracleIdl = loadIdl("shared_oracle");
  const volswapIdl = loadIdl("volswap");
  const fundingSwapIdl = loadIdl("funding_swap");
  const exoticVaultIdl = loadIdl("exotic_vault");

  const oracleProgram = new Program(oracleIdl, provider);
  const volswapProgram = new Program(volswapIdl, provider);
  const fundingSwapProgram = new Program(fundingSwapIdl, provider);
  const exoticVaultProgram = new Program(exoticVaultIdl, provider);

  // ============================================================================
  // 1. Initialize Oracle Price Feeds
  // ============================================================================
  console.log("Initializing Oracle Price Feeds...");

  const assets = [
    { symbol: "SOL", mint: SOL_MINT },
    { symbol: "BTC", mint: new PublicKey("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh") },
    { symbol: "ETH", mint: new PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs") },
  ];

  for (const asset of assets) {
    try {
      const [priceFeed] = findPriceFeedPDA(asset.mint);
      const [sampleBuffer] = findSampleBufferPDA(priceFeed);

      // Check if already exists
      const existing = await connection.getAccountInfo(priceFeed);
      if (existing) {
        console.log(`  [OK] ${asset.symbol} price feed already exists`);
        continue;
      }

      await oracleProgram.methods
        .initializePriceFeed(
          asset.symbol,           // asset_symbol
          new BN(60),             // sample_interval_seconds (1 minute)
          100                     // max_samples
        )
        .accounts({
          authority: wallet.publicKey,
          assetMint: asset.mint,
          priceFeed,
          sampleBuffer,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`  [OK] ${asset.symbol} price feed initialized`);
    } catch (error: any) {
      console.log(`  [ERR] ${asset.symbol}: ${error.message?.slice(0, 80) || error}`);
    }
  }

  // ============================================================================
  // 2. Record initial prices
  // ============================================================================
  console.log("\nRecording initial prices...");

  const prices = [
    { symbol: "SOL", mint: SOL_MINT, price: 150_000000 }, // $150 (scaled by 1e6)
    { symbol: "BTC", mint: new PublicKey("3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh"), price: 95000_000000 }, // $95,000
    { symbol: "ETH", mint: new PublicKey("7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs"), price: 3200_000000 }, // $3,200
  ];

  for (const asset of prices) {
    try {
      const [priceFeed] = findPriceFeedPDA(asset.mint);
      const [sampleBuffer] = findSampleBufferPDA(priceFeed);

      await oracleProgram.methods
        .recordPrice(new BN(asset.price))  // Only price, no timestamp
        .accounts({
          authority: wallet.publicKey,
          priceFeed,
          sampleBuffer,
        })
        .rpc();

      console.log(`  [OK] ${asset.symbol} price set to $${asset.price / 1e6}`);
    } catch (error: any) {
      console.log(`  [ERR] ${asset.symbol}: ${error.message?.slice(0, 80) || error}`);
    }
  }

  // ============================================================================
  // 3. Initialize Funding Feeds
  // ============================================================================
  console.log("\nInitializing Funding Feeds...");

  const markets = ["SOL-PERP", "BTC-PERP", "ETH-PERP"];

  for (const market of markets) {
    try {
      const [fundingFeed] = findFundingFeedPDA(market);

      const existing = await connection.getAccountInfo(fundingFeed);
      if (existing) {
        console.log(`  [OK] ${market} funding feed already exists`);
        continue;
      }

      await oracleProgram.methods
        .initializeFundingFeed(
          market,             // market_symbol
          new BN(28800)       // funding_interval_seconds (8 hours)
        )
        .accounts({
          authority: wallet.publicKey,
          fundingFeed,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log(`  [OK] ${market} funding feed initialized`);
    } catch (error: any) {
      console.log(`  [ERR] ${market}: ${error.message?.slice(0, 80) || error}`);
    }
  }

  // ============================================================================
  // 4. Record initial funding rates
  // ============================================================================
  console.log("\nRecording initial funding rates...");

  const fundingRates = [
    { market: "SOL-PERP", rate: 105 },  // 0.0105% (105 bps / 10000)
    { market: "BTC-PERP", rate: 85 },   // 0.0085%
    { market: "ETH-PERP", rate: 95 },   // 0.0095%
  ];

  for (const { market, rate } of fundingRates) {
    try {
      const [fundingFeed] = findFundingFeedPDA(market);

      await oracleProgram.methods
        .recordFundingRate(new BN(rate))  // Only rate_bps, no timestamp
        .accounts({
          authority: wallet.publicKey,
          fundingFeed,
        })
        .rpc();

      console.log(`  [OK] ${market} funding rate set to ${rate / 10000}%`);
    } catch (error: any) {
      console.log(`  [ERR] ${market}: ${error.message?.slice(0, 80) || error}`);
    }
  }

  // ============================================================================
  // 5. Initialize Variance Tracker
  // ============================================================================
  console.log("\nInitializing Variance Tracker...");

  try {
    const [priceFeed] = findPriceFeedPDA(SOL_MINT);
    const [varianceTracker] = findVarianceTrackerPDA(priceFeed);

    const existing = await connection.getAccountInfo(varianceTracker);
    if (existing) {
      console.log("  [OK] SOL variance tracker already exists");
    } else {
      await oracleProgram.methods
        .initializeVarianceTracker(
          new BN(7 * 86400)   // epoch_duration_seconds (7 days)
        )
        .accounts({
          authority: wallet.publicKey,
          priceFeed,
          varianceTracker,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("  [OK] SOL variance tracker initialized");
    }
  } catch (error: any) {
    console.log(`  [ERR] Variance Tracker: ${error.message?.slice(0, 80) || error}`);
  }

  // ============================================================================
  // 6. Initialize VolSwap Pool
  // ============================================================================
  console.log("\nInitializing VolSwap Pool...");

  try {
    const [priceFeed] = findPriceFeedPDA(SOL_MINT);
    const [varianceTracker] = findVarianceTrackerPDA(priceFeed);
    const [pool] = findVariancePoolPDA(SOL_MINT);
    const [poolVault] = findPoolVaultPDA(pool);

    const existing = await connection.getAccountInfo(pool);
    if (existing) {
      console.log("  [OK] SOL VolSwap pool already exists");
    } else {
      // PoolParams struct
      const params = {
        epochDurationSeconds: new BN(7 * 86400),   // 7 days
        minNotional: new BN(100 * 1e6),            // $100
        maxNotional: new BN(100000 * 1e6),         // $100k
        feeRateBps: 50,                            // 0.5%
        initialStrikeVarianceBps: new BN(3500),    // 35%
        varianceCapBps: new BN(20000),             // 200% cap
        earlyExitPenaltyBps: 500,                  // 5%
      };

      await volswapProgram.methods
        .initializePool(params)
        .accounts({
          authority: wallet.publicKey,
          collateralMint: USDC_MINT,
          underlyingMint: SOL_MINT,
          priceFeed,
          varianceTracker,
          pool,
          poolVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("  [OK] SOL VolSwap pool initialized");
    }
  } catch (error: any) {
    console.log(`  [ERR] VolSwap: ${error.message?.slice(0, 100) || error}`);
  }

  // ============================================================================
  // 7. Initialize FundingSwap Pool
  // ============================================================================
  console.log("\nInitializing FundingSwap Pool...");

  try {
    const [fundingFeed] = findFundingFeedPDA("SOL-PERP");
    const [pool] = findFundingPoolPDA("SOL-PERP");
    const [poolVault] = findFundingPoolVaultPDA(pool);

    const existing = await connection.getAccountInfo(pool);
    if (existing) {
      console.log("  [OK] SOL-PERP FundingSwap pool already exists");
    } else {
      // PoolParams struct for funding_swap
      const params = {
        marketSymbol: "SOL-PERP",
        fundingPeriodSeconds: new BN(28800),       // 8 hours
        minNotional: new BN(100 * 1e6),            // $100
        maxNotional: new BN(500000 * 1e6),         // $500k
        maxDurationPeriods: 270,                   // 90 days * 3 periods/day
        feeRateBps: 30,                            // 0.3%
        initialFixedRateBps: 10,                   // 0.001%
        earlyExitPenaltyBps: 500,                  // 5%
      };

      await fundingSwapProgram.methods
        .initializePool(params)
        .accounts({
          authority: wallet.publicKey,
          collateralMint: USDC_MINT,
          fundingFeed,
          pool,
          poolVault,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("  [OK] SOL-PERP FundingSwap pool initialized");
    }
  } catch (error: any) {
    console.log(`  [ERR] FundingSwap: ${error.message?.slice(0, 100) || error}`);
  }

  // ============================================================================
  // 8. Initialize ExoticVault
  // ============================================================================
  console.log("\nInitializing ExoticVault...");

  try {
    const [priceFeed] = findPriceFeedPDA(SOL_MINT);
    const [vault] = findExoticVaultPDA(SOL_MINT);
    const [vaultCollateral] = findVaultCollateralPDA(vault);

    const existing = await connection.getAccountInfo(vault);
    if (existing) {
      console.log("  [OK] SOL ExoticVault already exists");
    } else {
      // VaultParams struct
      const params = {
        minNotional: new BN(50 * 1e6),             // $50
        maxNotional: new BN(50000 * 1e6),          // $50k
        minDurationDays: 1,
        maxDurationDays: 30,
        feeRateBps: 100,                           // 1%
        sampleIntervalSeconds: new BN(3600),       // 1 hour
      };

      await exoticVaultProgram.methods
        .initializeVault(params)
        .accounts({
          authority: wallet.publicKey,
          collateralMint: USDC_MINT,
          underlyingMint: SOL_MINT,
          priceFeed,
          vault,
          vaultCollateral,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      console.log("  [OK] SOL ExoticVault initialized");
    }
  } catch (error: any) {
    console.log(`  [ERR] ExoticVault: ${error.message?.slice(0, 100) || error}`);
  }

  console.log("\nTest data initialization complete!");
  console.log("You can now test the frontend at http://localhost:3000");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
