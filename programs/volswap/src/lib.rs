use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};

declare_id!("SIGvo1swap111111111111111111111111111111111");

pub mod state;
pub mod errors;
pub mod instructions;

use state::*;
use errors::VolswapError;

/// VolSwap - Variance Swaps & Volatility Index Protocol
/// Trade realized volatility through variance swaps
#[program]
pub mod volswap {
    use super::*;

    /// Initialize a variance swap pool for an underlying asset
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        params: PoolParams,
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, params)
    }

    /// Open a long variance position (profit when vol > strike)
    pub fn open_long(
        ctx: Context<OpenPosition>,
        notional: u64,
        max_premium: u64,
    ) -> Result<()> {
        instructions::open_position::handler(ctx, notional, max_premium, true)
    }

    /// Open a short variance position (profit when vol < strike)
    pub fn open_short(
        ctx: Context<OpenPosition>,
        notional: u64,
        min_premium: u64,
    ) -> Result<()> {
        instructions::open_position::handler(ctx, notional, min_premium, false)
    }

    /// Settle positions at epoch end
    pub fn settle_epoch(ctx: Context<SettleEpoch>) -> Result<()> {
        instructions::settle_epoch::handler(ctx)
    }

    /// Claim settlement payout
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        instructions::claim_payout::handler(ctx)
    }

    /// Start a new epoch with new strike variance
    pub fn start_new_epoch(
        ctx: Context<StartNewEpoch>,
        strike_variance_bps: u64,
    ) -> Result<()> {
        instructions::start_new_epoch::handler(ctx, strike_variance_bps)
    }

    /// Update pool parameters (admin only)
    pub fn update_pool(
        ctx: Context<UpdatePool>,
        new_fee_rate_bps: Option<u16>,
        new_min_notional: Option<u64>,
        new_max_notional: Option<u64>,
    ) -> Result<()> {
        instructions::update_pool::handler(ctx, new_fee_rate_bps, new_min_notional, new_max_notional)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PoolParams {
    /// Epoch duration in seconds (e.g., 2592000 = 30 days)
    pub epoch_duration_seconds: u64,
    /// Minimum notional per position
    pub min_notional: u64,
    /// Maximum notional per position
    pub max_notional: u64,
    /// Fee rate in basis points (e.g., 50 = 0.5%)
    pub fee_rate_bps: u16,
    /// Initial strike variance in basis points (e.g., 5000 = 50% annualized vol)
    pub initial_strike_variance_bps: u64,
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Collateral mint (USDC)
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    /// Underlying asset mint (e.g., SOL)
    pub underlying_mint: InterfaceAccount<'info, Mint>,

    /// Price feed from shared oracle
    /// CHECK: Validated via seeds in shared-oracle
    pub price_feed: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + VariancePool::INIT_SPACE,
        seeds = [b"variance_pool", underlying_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, VariancePool>,

    #[account(
        init,
        payer = authority,
        token::mint = collateral_mint,
        token::authority = pool,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump
    )]
    pub pool_vault: InterfaceAccount<'info, TokenAccount>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"variance_pool", pool.underlying_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, VariancePool>,

    #[account(
        init,
        payer = user,
        space = 8 + VariancePosition::INIT_SPACE,
        seeds = [b"position", pool.key().as_ref(), user.key().as_ref(), &pool.current_epoch.to_le_bytes()],
        bump
    )]
    pub position: Account<'info, VariancePosition>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = user
    )]
    pub user_collateral: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: InterfaceAccount<'info, TokenAccount>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,

    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct SettleEpoch<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = authority.key() == pool.authority @ VolswapError::Unauthorized
    )]
    pub pool: Account<'info, VariancePool>,

    /// Sample buffer from shared oracle
    /// CHECK: Validated via CPI
    pub sample_buffer: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"variance_pool", pool.underlying_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, VariancePool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), user.key().as_ref(), &position.epoch.to_le_bytes()],
        bump = position.bump,
        constraint = position.owner == user.key() @ VolswapError::Unauthorized,
        constraint = position.status == PositionStatus::Settled @ VolswapError::NotSettled
    )]
    pub position: Account<'info, VariancePosition>,

    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint = collateral_mint,
        associated_token::authority = user
    )]
    pub user_collateral: InterfaceAccount<'info, TokenAccount>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct StartNewEpoch<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = authority.key() == pool.authority @ VolswapError::Unauthorized
    )]
    pub pool: Account<'info, VariancePool>,
}

#[derive(Accounts)]
pub struct UpdatePool<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = authority.key() == pool.authority @ VolswapError::Unauthorized
    )]
    pub pool: Account<'info, VariancePool>,
}
