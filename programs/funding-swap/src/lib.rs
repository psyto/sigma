use anchor_lang::prelude::*;

declare_id!("GTERstKRN2YBVNwx6UePFhbn7BAfYeJkZmdX7gXqRjjx");

pub mod state;
pub mod errors;
pub mod instructions;

use state::*;
use errors::FundingSwapError;

/// FundingSwap - Funding Rate Derivatives Protocol
/// Trade perpetual funding rates as a standalone derivative
///
/// Key concepts:
/// - Funding swap: derivative where payoff depends on difference between fixed and floating rates
/// - Receiver: pays fixed rate, receives floating (profits when funding rate > fixed rate)
/// - Payer: receives fixed rate, pays floating (profits when funding rate < fixed rate)
/// - Funding period: interval at which funding payments are exchanged (typically 8 hours)
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

    /// Process funding period settlement - reads rate from oracle
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

    /// Close swap early (with penalty)
    pub fn close_swap_early(ctx: Context<CloseSwapEarly>) -> Result<()> {
        instructions::close_swap_early::handler(ctx)
    }

    /// Update pool parameters (admin only)
    pub fn update_pool(
        ctx: Context<UpdatePool>,
        new_fee_rate_bps: Option<u16>,
        new_fixed_rate_bps: Option<i16>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::update_pool::handler(ctx, new_fee_rate_bps, new_fixed_rate_bps, is_active)
    }

    /// Deposit liquidity to pool (LP)
    pub fn deposit_liquidity(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
        instructions::liquidity::deposit(ctx, amount)
    }

    /// Withdraw liquidity from pool (LP)
    pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>, shares: u64) -> Result<()> {
        instructions::liquidity::withdraw(ctx, shares)
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
    /// Initial fixed rate for market making (bps, can be negative)
    pub initial_fixed_rate_bps: i16,
    /// Early exit penalty in basis points
    pub early_exit_penalty_bps: u16,
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
#[instruction(params: PoolParams)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Collateral mint (e.g., USDC)
    pub collateral_mint: AccountInfo<'info>,

    /// Funding rate feed from shared oracle
    /// CHECK: Validated via seeds in shared-oracle
    pub funding_feed: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + FundingPool::INIT_SPACE,
        seeds = [b"funding_pool", params.market_symbol.as_bytes()],
        bump
    )]
    pub pool: Account<'info, FundingPool>,

    /// CHECK: Pool vault for collateral (will be initialized as token account)
    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump
    )]
    pub pool_vault: AccountInfo<'info>,

    /// CHECK: SPL Token program
    pub token_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct OpenSwap<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"funding_pool", pool.market_symbol.as_bytes()],
        bump = pool.bump,
        constraint = pool.is_active @ FundingSwapError::PoolInactive
    )]
    pub pool: Account<'info, FundingPool>,

    #[account(
        init,
        payer = user,
        space = 8 + FundingSwapPosition::INIT_SPACE,
        seeds = [b"swap", pool.key().as_ref(), user.key().as_ref(), &pool.total_swaps.to_le_bytes()],
        bump
    )]
    pub swap: Account<'info, FundingSwapPosition>,

    /// CHECK: User's collateral token account
    #[account(mut)]
    pub user_collateral: AccountInfo<'info>,

    /// CHECK: Pool vault for collateral
    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: AccountInfo<'info>,

    /// CHECK: Collateral mint
    pub collateral_mint: AccountInfo<'info>,

    /// CHECK: SPL Token program
    pub token_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ProcessFundingPeriod<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = authority.key() == pool.authority @ FundingSwapError::Unauthorized
    )]
    pub pool: Account<'info, FundingPool>,

    /// Funding feed from shared oracle
    /// CHECK: Validated via pool.funding_feed
    #[account(
        constraint = funding_feed.key() == pool.funding_feed @ FundingSwapError::InvalidOracle
    )]
    pub funding_feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SettleSwap<'info> {
    pub user: Signer<'info>,

    #[account(
        seeds = [b"funding_pool", pool.market_symbol.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, FundingPool>,

    #[account(
        mut,
        seeds = [b"swap", pool.key().as_ref(), swap.owner.as_ref(), &swap.swap_index.to_le_bytes()],
        bump = swap.bump,
        constraint = swap.owner == user.key() @ FundingSwapError::Unauthorized,
        constraint = swap.status == SwapStatus::Active @ FundingSwapError::SwapAlreadySettled
    )]
    pub swap: Account<'info, FundingSwapPosition>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"funding_pool", pool.market_symbol.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, FundingPool>,

    #[account(
        mut,
        seeds = [b"swap", pool.key().as_ref(), user.key().as_ref(), &swap.swap_index.to_le_bytes()],
        bump = swap.bump,
        constraint = swap.owner == user.key() @ FundingSwapError::Unauthorized,
        constraint = swap.status == SwapStatus::Settled @ FundingSwapError::NotSettled,
        close = user
    )]
    pub swap: Account<'info, FundingSwapPosition>,

    /// CHECK: Pool vault for collateral
    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: AccountInfo<'info>,

    /// CHECK: User's collateral token account
    #[account(mut)]
    pub user_collateral: AccountInfo<'info>,

    /// CHECK: Collateral mint
    pub collateral_mint: AccountInfo<'info>,

    /// CHECK: SPL Token program
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CloseSwapEarly<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"funding_pool", pool.market_symbol.as_bytes()],
        bump = pool.bump,
        constraint = pool.is_active @ FundingSwapError::PoolInactive
    )]
    pub pool: Account<'info, FundingPool>,

    #[account(
        mut,
        seeds = [b"swap", pool.key().as_ref(), user.key().as_ref(), &swap.swap_index.to_le_bytes()],
        bump = swap.bump,
        constraint = swap.owner == user.key() @ FundingSwapError::Unauthorized,
        constraint = swap.status == SwapStatus::Active @ FundingSwapError::SwapAlreadySettled,
        close = user
    )]
    pub swap: Account<'info, FundingSwapPosition>,

    /// CHECK: Pool vault for collateral
    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: AccountInfo<'info>,

    /// CHECK: User's collateral token account
    #[account(mut)]
    pub user_collateral: AccountInfo<'info>,

    /// CHECK: Collateral mint
    pub collateral_mint: AccountInfo<'info>,

    /// CHECK: SPL Token program
    pub token_program: AccountInfo<'info>,
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

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"funding_pool", pool.market_symbol.as_bytes()],
        bump = pool.bump,
        constraint = pool.is_active @ FundingSwapError::PoolInactive
    )]
    pub pool: Account<'info, FundingPool>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + LiquidityProvider::INIT_SPACE,
        seeds = [b"lp", pool.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub lp_account: Account<'info, LiquidityProvider>,

    /// CHECK: User's collateral token account
    #[account(mut)]
    pub user_collateral: AccountInfo<'info>,

    /// CHECK: Pool vault for collateral
    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: AccountInfo<'info>,

    /// CHECK: SPL Token program
    pub token_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"funding_pool", pool.market_symbol.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, FundingPool>,

    #[account(
        mut,
        seeds = [b"lp", pool.key().as_ref(), user.key().as_ref()],
        bump = lp_account.bump,
        constraint = lp_account.owner == user.key() @ FundingSwapError::Unauthorized
    )]
    pub lp_account: Account<'info, LiquidityProvider>,

    /// CHECK: User's collateral token account
    #[account(mut)]
    pub user_collateral: AccountInfo<'info>,

    /// CHECK: Pool vault for collateral
    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: AccountInfo<'info>,

    /// CHECK: Collateral mint
    pub collateral_mint: AccountInfo<'info>,

    /// CHECK: SPL Token program
    pub token_program: AccountInfo<'info>,
}
