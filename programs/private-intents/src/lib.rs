use anchor_lang::prelude::*;

declare_id!("PvtInt11111111111111111111111111111111111");

pub mod error;
pub mod state;
pub mod instructions;

use state::*;
use error::PrivateIntentError;

/// Private Intents - Encrypted order submission for Sigma derivatives
///
/// This program enables users to submit encrypted derivative orders that are
/// executed by a trusted solver. Orders can be funded with native Solana
/// collateral or cross-chain collateral bridged via Wormhole.
///
/// Key features:
/// - Encrypted payload: Order parameters are encrypted with NaCl box
/// - Solver execution: A trusted solver decrypts and executes orders
/// - Cross-chain: Supports collateral from Ethereum and Arbitrum via Wormhole
/// - Intent types: Variance swaps, funding swaps, and exotic options
#[program]
pub mod private_intents {
    use super::*;

    /// Initialize the solver configuration
    /// Only needs to be called once per deployment
    pub fn initialize_solver(
        ctx: Context<instructions::InitializeSolver>,
        solver_pubkey: Pubkey,
        fee_bps: u16,
        min_collateral: u64,
        max_payload_size: u16,
    ) -> Result<()> {
        instructions::initialize_solver::handler(ctx, solver_pubkey, fee_bps, min_collateral, max_payload_size)
    }

    /// Submit a private intent with native collateral
    /// The encrypted payload contains the order parameters
    pub fn submit_intent(
        ctx: Context<instructions::SubmitIntent>,
        intent_id: u64,
        intent_type: IntentType,
        collateral_amount: u64,
        encrypted_payload: Vec<u8>,
        user_encryption_pubkey: Vec<u8>,
    ) -> Result<()> {
        instructions::submit_intent::handler(
            ctx,
            intent_id,
            intent_type,
            collateral_amount,
            encrypted_payload,
            user_encryption_pubkey,
        )
    }

    /// Execute a pending intent (solver only)
    /// The solver decrypts the payload off-chain and provides the parameters
    pub fn execute_intent(
        ctx: Context<instructions::ExecuteIntent>,
        deadline: i64,
        slippage_bps: u16,
        result_position: Pubkey,
    ) -> Result<()> {
        instructions::execute_intent::handler(ctx, deadline, slippage_bps, result_position)
    }

    /// Cancel a pending intent and reclaim collateral (owner only)
    pub fn cancel_intent(ctx: Context<instructions::CancelIntent>) -> Result<()> {
        instructions::cancel_intent::handler(ctx)
    }

    /// Claim the result of a completed intent (owner only)
    /// Closes the intent account and returns rent
    pub fn claim_result(ctx: Context<instructions::ClaimResult>) -> Result<()> {
        instructions::claim_result::handler(ctx)
    }

    /// Submit an intent with cross-chain collateral (Wormhole bridge)
    pub fn submit_cross_chain_intent(
        ctx: Context<instructions::BridgeCollateral>,
        intent_id: u64,
        intent_type: IntentType,
        collateral_amount: u64,
        encrypted_payload: Vec<u8>,
        user_encryption_pubkey: Vec<u8>,
        source_chain: CollateralSource,
        vaa_hash: Vec<u8>,
    ) -> Result<()> {
        instructions::bridge_collateral::handler(
            ctx,
            intent_id,
            intent_type,
            collateral_amount,
            encrypted_payload,
            user_encryption_pubkey,
            source_chain,
            vaa_hash,
        )
    }
}
