use anchor_lang::prelude::*;

declare_id!("HkmNK58gA3ho7iorsAbHXfTHHLYJ6jenKcZDPDjNknAQ");

pub mod state;
pub mod errors;
pub mod instructions;

use state::*;
use errors::VolswapError;

/// VolSwap - Variance Swaps & Volatility Index Protocol
/// Trade realized volatility through variance swaps
///
/// Key concepts:
/// - Variance swap: derivative where payoff depends on realized variance vs strike variance
/// - Long position: profits when realized variance > strike variance
/// - Short position: profits when realized variance < strike variance
/// - Epoch: fixed period during which variance is measured
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

    /// Settle the current epoch using variance from oracle
    pub fn settle_epoch(ctx: Context<SettleEpoch>) -> Result<()> {
        instructions::settle_epoch::handler(ctx)
    }

    /// Settle an individual position after epoch is settled
    pub fn settle_position(ctx: Context<SettlePosition>) -> Result<()> {
        instructions::settle_position::handler(ctx)
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

    /// Close position early (with penalty)
    pub fn close_position_early(ctx: Context<ClosePositionEarly>) -> Result<()> {
        instructions::close_position_early::handler(ctx)
    }

    /// Update pool parameters (admin only)
    pub fn update_pool(
        ctx: Context<UpdatePool>,
        new_fee_rate_bps: Option<u16>,
        new_min_notional: Option<u64>,
        new_max_notional: Option<u64>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::update_pool::handler(ctx, new_fee_rate_bps, new_min_notional, new_max_notional, is_active)
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
    /// Epoch duration in seconds (e.g., 604800 = 7 days, 2592000 = 30 days)
    pub epoch_duration_seconds: u64,
    /// Minimum notional per position
    pub min_notional: u64,
    /// Maximum notional per position
    pub max_notional: u64,
    /// Fee rate in basis points (e.g., 50 = 0.5%)
    pub fee_rate_bps: u16,
    /// Initial strike variance in basis points (e.g., 5000 = 50% annualized vol squared)
    pub initial_strike_variance_bps: u64,
    /// Variance cap for risk management (max variance before capping)
    pub variance_cap_bps: u64,
    /// Early exit penalty in basis points
    pub early_exit_penalty_bps: u16,
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Collateral mint (e.g., USDC)
    /// CHECK: Validated as SPL Token mint
    pub collateral_mint: AccountInfo<'info>,

    /// Underlying asset mint (e.g., SOL)
    /// CHECK: Validated as SPL Token mint
    pub underlying_mint: AccountInfo<'info>,

    /// Price feed from shared oracle
    /// CHECK: Validated via seeds in shared-oracle
    pub price_feed: AccountInfo<'info>,

    /// Variance tracker from shared oracle
    /// CHECK: Validated via seeds in shared-oracle
    pub variance_tracker: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + VariancePool::INIT_SPACE,
        seeds = [b"variance_pool", underlying_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, VariancePool>,

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
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"variance_pool", pool.underlying_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.is_active @ VolswapError::PoolInactive
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
pub struct SettleEpoch<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = authority.key() == pool.authority @ VolswapError::Unauthorized,
        constraint = !pool.is_epoch_settled @ VolswapError::EpochAlreadySettled
    )]
    pub pool: Account<'info, VariancePool>,

    /// Variance tracker from shared oracle
    /// CHECK: Validated via seeds
    #[account(
        constraint = variance_tracker.key() == pool.variance_tracker @ VolswapError::InvalidOracle
    )]
    pub variance_tracker: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SettlePosition<'info> {
    pub user: Signer<'info>,

    #[account(
        seeds = [b"variance_pool", pool.underlying_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.is_epoch_settled @ VolswapError::EpochNotSettled
    )]
    pub pool: Account<'info, VariancePool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), position.owner.as_ref(), &position.epoch.to_le_bytes()],
        bump = position.bump,
        constraint = position.pool == pool.key() @ VolswapError::InvalidPool,
        constraint = position.epoch == pool.current_epoch @ VolswapError::WrongEpoch,
        constraint = position.status == PositionStatus::Active @ VolswapError::AlreadySettled
    )]
    pub position: Account<'info, VariancePosition>,
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
        constraint = position.status == PositionStatus::Settled @ VolswapError::NotSettled,
        close = user
    )]
    pub position: Account<'info, VariancePosition>,

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
pub struct StartNewEpoch<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = authority.key() == pool.authority @ VolswapError::Unauthorized,
        constraint = pool.is_epoch_settled @ VolswapError::EpochNotSettled
    )]
    pub pool: Account<'info, VariancePool>,
}

#[derive(Accounts)]
pub struct ClosePositionEarly<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"variance_pool", pool.underlying_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.is_active @ VolswapError::PoolInactive
    )]
    pub pool: Account<'info, VariancePool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), user.key().as_ref(), &position.epoch.to_le_bytes()],
        bump = position.bump,
        constraint = position.owner == user.key() @ VolswapError::Unauthorized,
        constraint = position.status == PositionStatus::Active @ VolswapError::AlreadySettled,
        close = user
    )]
    pub position: Account<'info, VariancePosition>,

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
        constraint = authority.key() == pool.authority @ VolswapError::Unauthorized
    )]
    pub pool: Account<'info, VariancePool>,
}

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"variance_pool", pool.underlying_mint.as_ref()],
        bump = pool.bump,
        constraint = pool.is_active @ VolswapError::PoolInactive
    )]
    pub pool: Account<'info, VariancePool>,

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
        seeds = [b"variance_pool", pool.underlying_mint.as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, VariancePool>,

    #[account(
        mut,
        seeds = [b"lp", pool.key().as_ref(), user.key().as_ref()],
        bump = lp_account.bump,
        constraint = lp_account.owner == user.key() @ VolswapError::Unauthorized
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
