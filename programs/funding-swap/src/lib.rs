use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, TransferChecked, transfer_checked};

declare_id!("SIGfund1swap11111111111111111111111111111");

pub mod state;
pub mod errors;
pub mod instructions;

use state::*;
use errors::FundingSwapError;

/// FundingSwap - Funding Rate Derivatives Protocol
/// Trade perpetual funding rates as a standalone derivative
#[program]
pub mod funding_swap {
    use super::*;

    /// Initialize a funding swap pool for a perpetual market
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        params: PoolParams,
    ) -> Result<()> {
        instructions::initialize_pool::handler(ctx, params)
    }

    /// Open a receiver position (pay fixed, receive floating)
    pub fn open_receiver(
        ctx: Context<OpenSwap>,
        notional: u64,
        duration_periods: u16,
        max_fixed_rate_bps: i16,
    ) -> Result<()> {
        instructions::open_swap::handler(ctx, notional, duration_periods, max_fixed_rate_bps, true)
    }

    /// Open a payer position (receive fixed, pay floating)
    pub fn open_payer(
        ctx: Context<OpenSwap>,
        notional: u64,
        duration_periods: u16,
        min_fixed_rate_bps: i16,
    ) -> Result<()> {
        instructions::open_swap::handler(ctx, notional, duration_periods, min_fixed_rate_bps, false)
    }

    /// Process funding period settlement
    pub fn process_funding_period(ctx: Context<ProcessFundingPeriod>) -> Result<()> {
        instructions::process_funding_period::handler(ctx)
    }

    /// Settle completed swap
    pub fn settle_swap(ctx: Context<SettleSwap>) -> Result<()> {
        instructions::settle_swap::handler(ctx)
    }

    /// Claim swap payout
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        instructions::claim_payout::handler(ctx)
    }

    /// Update pool parameters (admin only)
    pub fn update_pool(
        ctx: Context<UpdatePool>,
        new_fee_rate_bps: Option<u16>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::update_pool::handler(ctx, new_fee_rate_bps, is_active)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PoolParams {
    /// Market symbol (e.g., "SOL-PERP")
    pub market_symbol: String,
    /// Funding period in seconds (e.g., 28800 = 8 hours)
    pub funding_period_seconds: u64,
    /// Minimum swap notional
    pub min_notional: u64,
    /// Maximum swap notional
    pub max_notional: u64,
    /// Maximum swap duration in funding periods
    pub max_duration_periods: u16,
    /// Fee rate in basis points
    pub fee_rate_bps: u16,
    /// Initial fixed rate for market making (bps)
    pub initial_fixed_rate_bps: i16,
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
#[instruction(params: PoolParams)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Collateral mint (USDC)
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    /// Funding rate feed from shared oracle
    /// CHECK: Validated via seeds
    pub funding_feed: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + FundingPool::INIT_SPACE,
        seeds = [b"funding_pool", params.market_symbol.as_bytes()],
        bump
    )]
    pub pool: Account<'info, FundingPool>,

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
pub struct OpenSwap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, FundingPool>,

    #[account(
        init,
        payer = user,
        space = 8 + FundingSwapPosition::INIT_SPACE,
        seeds = [b"swap", pool.key().as_ref(), user.key().as_ref(), &pool.total_swaps.to_le_bytes()],
        bump
    )]
    pub swap: Account<'info, FundingSwapPosition>,

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
pub struct ProcessFundingPeriod<'info> {
    pub authority: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, FundingPool>,

    /// Funding feed from shared oracle
    /// CHECK: Validated via CPI
    pub funding_feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SettleSwap<'info> {
    pub user: Signer<'info>,

    #[account(mut)]
    pub pool: Account<'info, FundingPool>,

    #[account(
        mut,
        constraint = swap.owner == user.key() @ FundingSwapError::Unauthorized
    )]
    pub swap: Account<'info, FundingSwapPosition>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    pub pool: Account<'info, FundingPool>,

    #[account(
        mut,
        constraint = swap.owner == user.key() @ FundingSwapError::Unauthorized,
        constraint = swap.status == SwapStatus::Settled @ FundingSwapError::NotSettled
    )]
    pub swap: Account<'info, FundingSwapPosition>,

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
pub struct UpdatePool<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = authority.key() == pool.authority @ FundingSwapError::Unauthorized
    )]
    pub pool: Account<'info, FundingPool>,
}
