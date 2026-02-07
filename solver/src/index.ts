import 'dotenv/config';
import { PrivateIntentSolver, createSolverConfig } from './solver';
import { createSolverApiServer } from './api';

/**
 * Sigma Private Intent Solver
 *
 * This service monitors encrypted derivative intents on-chain,
 * decrypts them using the solver's encryption key, and executes
 * them via CPI to Sigma programs (VolSwap, FundingSwap, ExoticVault).
 *
 * Environment variables:
 * - SOLVER_KEYPAIR_PATH: Path to solver keypair JSON file
 * - RPC_URL: Solana RPC endpoint
 * - POLL_INTERVAL_MS: Polling interval in milliseconds (default: 5000)
 * - MAX_SLIPPAGE_BPS: Maximum slippage to accept (default: 100)
 * - API_PORT: API server port (default: 3001)
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Sigma Private Intent Solver');
  console.log('='.repeat(60));

  try {
    // Create solver config from environment
    const config = createSolverConfig();

    // Create solver instance
    const solver = new PrivateIntentSolver(config);

    // Start API server
    const apiPort = parseInt(process.env.API_PORT || '3001');
    createSolverApiServer(solver, apiPort);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nReceived SIGINT, shutting down...');
      solver.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\nReceived SIGTERM, shutting down...');
      solver.stop();
      process.exit(0);
    });

    // Start solver
    await solver.start();
  } catch (error) {
    console.error('Failed to start solver:', error);
    process.exit(1);
  }
}

// Export for programmatic use
export { PrivateIntentSolver, createSolverConfig } from './solver';
export { createSolverApiServer, createSolverApiRouter } from './api';
export { VolswapExecutor } from './executors/volswap';
export { FundingExecutor } from './executors/funding';
export { ExoticExecutor } from './executors/exotic';

// Run main if this is the entry point
main();
