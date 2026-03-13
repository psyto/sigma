use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use shared_oracle;

declare_id!("FGjwkx9XxzJZvgybXTtDjsWJgCuhXwNJTthFwhfj8nPS");

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

    pub collateral_mint: Account<'info, Mint>,

    /// Underlying asset mint (e.g., SOL)
    pub underlying_mint: Account<'info, Mint>,

    /// Price feed from shared oracle
    /// CHECK: Validated via seeds in shared-oracle
    #[account(
        constraint = price_feed.owner == &shared_oracle::ID @ VolswapError::InvalidOracle
    )]
    pub price_feed: AccountInfo<'info>,

    /// Variance tracker from shared oracle
    /// CHECK: Validated via seeds in shared-oracle
    #[account(
        constraint = variance_tracker.owner == &shared_oracle::ID @ VolswapError::InvalidOracle
    )]
    pub variance_tracker: AccountInfo<'info>,

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
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = pool_vault
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

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

    #[account(
        mut,
        constraint = user_collateral.mint == pool.collateral_mint @ VolswapError::InvalidMint,
        constraint = user_collateral.owner == user.key() @ VolswapError::Unauthorized
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub collateral_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,

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
        constraint = variance_tracker.key() == pool.variance_tracker @ VolswapError::InvalidOracle,
        constraint = variance_tracker.owner == &shared_oracle::ID @ VolswapError::InvalidOracle
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

    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_collateral.mint == pool.collateral_mint @ VolswapError::InvalidMint,
        constraint = user_collateral.owner == user.key() @ VolswapError::Unauthorized
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    pub collateral_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
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

    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_collateral.mint == pool.collateral_mint @ VolswapError::InvalidMint,
        constraint = user_collateral.owner == user.key() @ VolswapError::Unauthorized
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    pub collateral_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
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

    #[account(
        mut,
        constraint = user_collateral.mint == pool.collateral_mint @ VolswapError::InvalidMint,
        constraint = user_collateral.owner == user.key() @ VolswapError::Unauthorized
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

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

    #[account(
        mut,
        constraint = user_collateral.mint == pool.collateral_mint @ VolswapError::InvalidMint,
        constraint = user_collateral.owner == user.key() @ VolswapError::Unauthorized
    )]
    pub user_collateral: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"pool_vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub pool_vault: Account<'info, TokenAccount>,

    pub collateral_mint: Account<'info, Mint>,

    pub token_program: Program<'info, Token>,
}

// ============================================================================
// Events
// ============================================================================

#[event]
pub struct PoolInitialized {
    pub pool: Pubkey,
    pub authority: Pubkey,
    pub underlying_mint: Pubkey,
    pub strike_variance_bps: u64,
    pub epoch_duration_seconds: u64,
}

#[event]
pub struct PositionOpened {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub position: Pubkey,
    pub is_long: bool,
    pub notional: u64,
    pub premium: u64,
    pub strike_variance_bps: u64,
    pub epoch: u64,
}

#[event]
pub struct EpochSettled {
    pub pool: Pubkey,
    pub epoch: u64,
    pub strike_variance_bps: u64,
    pub realized_variance_bps: u64,
}

#[event]
pub struct PositionSettled {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub position: Pubkey,
    pub pnl: i64,
    pub payout: u64,
}

#[event]
pub struct PayoutClaimed {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub position: Pubkey,
    pub amount: u64,
}

#[event]
pub struct NewEpochStarted {
    pub pool: Pubkey,
    pub epoch: u64,
    pub strike_variance_bps: u64,
}

#[event]
pub struct PositionClosedEarly {
    pub pool: Pubkey,
    pub owner: Pubkey,
    pub position: Pubkey,
    pub refund: u64,
    pub penalty: u64,
}

#[event]
pub struct LiquidityDeposited {
    pub pool: Pubkey,
    pub provider: Pubkey,
    pub amount: u64,
    pub shares: u64,
}

#[event]
pub struct LiquidityWithdrawn {
    pub pool: Pubkey,
    pub provider: Pubkey,
    pub shares: u64,
    pub amount: u64,
}
