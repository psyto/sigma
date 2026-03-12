use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, CloseAccount, Mint};

declare_id!("AaZSJxm7jkqb9Tjo38wU66w6owuyrDtqw3ksnyHMN9ow");

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
#[program]
pub mod private_intents {
    use super::*;

    /// Initialize the solver configuration
    pub fn initialize_solver(
        ctx: Context<InitializeSolver>,
        solver_pubkey: Pubkey,
        fee_bps: u16,
        min_collateral: u64,
        max_payload_size: u16,
    ) -> Result<()> {
        instructions::initialize_solver::handler(ctx, solver_pubkey, fee_bps, min_collateral, max_payload_size)
    }

    /// Submit a private intent with native collateral
    pub fn submit_intent(
        ctx: Context<SubmitIntent>,
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
    pub fn execute_intent<'info>(
        ctx: Context<'_, '_, 'info, 'info, ExecuteIntent<'info>>,
        deadline: i64,
        slippage_bps: u16,
        result_position: Pubkey,
    ) -> Result<()> {
        instructions::execute_intent::handler(ctx, deadline, slippage_bps, result_position)
    }

    /// Cancel a pending intent and reclaim collateral (owner only)
    pub fn cancel_intent(ctx: Context<CancelIntent>) -> Result<()> {
        instructions::cancel_intent::handler(ctx)
    }

    /// Claim the result of a completed intent (owner only)
    pub fn claim_result(ctx: Context<ClaimResult>) -> Result<()> {
        instructions::claim_result::handler(ctx)
    }

    /// Submit an intent with cross-chain collateral (Wormhole bridge)
    pub fn submit_cross_chain_intent(
        ctx: Context<BridgeCollateral>,
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

// ============================================================================
// Account Contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitializeSolver<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + SolverConfig::INIT_SPACE,
        seeds = [SolverConfig::SEED],
        bump
    )]
    pub solver_config: Account<'info, SolverConfig>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(intent_id: u64)]
pub struct SubmitIntent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [SolverConfig::SEED],
        bump = solver_config.bump,
        constraint = solver_config.is_active @ PrivateIntentError::SolverNotActive
    )]
    pub solver_config: Account<'info, SolverConfig>,

    #[account(
        init,
        payer = owner,
        space = 8 + EncryptedIntent::INIT_SPACE,
        seeds = [EncryptedIntent::SEED, owner.key().as_ref(), &intent_id.to_le_bytes()],
        bump
    )]
    pub intent: Account<'info, EncryptedIntent>,

    /// CHECK: Target pool for this intent (validated during execution)
    pub target_pool: AccountInfo<'info>,

    pub collateral_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = user_collateral.mint == collateral_mint.key() @ PrivateIntentError::InvalidTokenMint,
        constraint = user_collateral.owner == owner.key() @ PrivateIntentError::UnauthorizedOwner
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = owner,
        seeds = [b"intent_vault", intent.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = intent
    )]
    pub intent_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteIntent<'info> {
    #[account(mut)]
    pub solver: Signer<'info>,

    #[account(
        mut,
        seeds = [SolverConfig::SEED],
        bump = solver_config.bump,
        constraint = solver_config.is_active @ PrivateIntentError::SolverNotActive,
        constraint = solver_config.solver_pubkey == solver.key() @ PrivateIntentError::UnauthorizedSolver
    )]
    pub solver_config: Account<'info, SolverConfig>,

    #[account(
        mut,
        seeds = [EncryptedIntent::SEED, intent.owner.as_ref(), &intent.intent_id.to_le_bytes()],
        bump = intent.bump,
        constraint = intent.is_executable() @ PrivateIntentError::IntentNotExecutable
    )]
    pub intent: Account<'info, EncryptedIntent>,

    /// CHECK: Target pool for execution
    #[account(
        constraint = target_pool.key() == intent.target_pool @ PrivateIntentError::InvalidTargetPool
    )]
    pub target_pool: AccountInfo<'info>,

    pub collateral_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"intent_vault", intent.key().as_ref()],
        bump,
        constraint = intent_vault.mint == collateral_mint.key() @ PrivateIntentError::InvalidTokenMint
    )]
    pub intent_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = solver_collateral.mint == collateral_mint.key() @ PrivateIntentError::InvalidTokenMint,
        constraint = solver_collateral.owner == solver.key() @ PrivateIntentError::UnauthorizedSolver
    )]
    pub solver_collateral: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelIntent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [EncryptedIntent::SEED, owner.key().as_ref(), &intent.intent_id.to_le_bytes()],
        bump = intent.bump,
        constraint = intent.owner == owner.key() @ PrivateIntentError::UnauthorizedOwner,
        constraint = intent.is_cancellable() @ PrivateIntentError::IntentNotCancellable
    )]
    pub intent: Account<'info, EncryptedIntent>,

    pub collateral_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [b"intent_vault", intent.key().as_ref()],
        bump,
        constraint = intent_vault.mint == collateral_mint.key() @ PrivateIntentError::InvalidTokenMint
    )]
    pub intent_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_collateral.mint == collateral_mint.key() @ PrivateIntentError::InvalidTokenMint,
        constraint = user_collateral.owner == owner.key() @ PrivateIntentError::UnauthorizedOwner
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClaimResult<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [EncryptedIntent::SEED, owner.key().as_ref(), &intent.intent_id.to_le_bytes()],
        bump = intent.bump,
        constraint = intent.owner == owner.key() @ PrivateIntentError::UnauthorizedOwner,
        constraint = intent.is_claimable() @ PrivateIntentError::IntentNotExecutable,
        close = owner
    )]
    pub intent: Account<'info, EncryptedIntent>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(intent_id: u64)]
pub struct BridgeCollateral<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [SolverConfig::SEED],
        bump = solver_config.bump,
        constraint = solver_config.is_active @ PrivateIntentError::SolverNotActive
    )]
    pub solver_config: Account<'info, SolverConfig>,

    #[account(
        init,
        payer = owner,
        space = 8 + EncryptedIntent::INIT_SPACE,
        seeds = [EncryptedIntent::SEED, owner.key().as_ref(), &intent_id.to_le_bytes()],
        bump
    )]
    pub intent: Account<'info, EncryptedIntent>,

    /// CHECK: Target pool for this intent
    pub target_pool: AccountInfo<'info>,

    pub collateral_mint: Account<'info, Mint>,

    #[account(
        mut,
        constraint = bridged_collateral.mint == collateral_mint.key() @ PrivateIntentError::InvalidTokenMint,
        constraint = bridged_collateral.owner == owner.key() @ PrivateIntentError::UnauthorizedOwner
    )]
    pub bridged_collateral: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = owner,
        seeds = [b"intent_vault", intent.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = intent
    )]
    pub intent_vault: Account<'info, TokenAccount>,

    /// CHECK: Wormhole Core Bridge program
    pub wormhole_program: AccountInfo<'info>,

    /// CHECK: Wormhole posted VAA account
    pub posted_vaa: AccountInfo<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
