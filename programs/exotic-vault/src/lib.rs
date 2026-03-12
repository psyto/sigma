use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};

declare_id!("6zryMfmTZPcneCvU5Bgs6amu5vg5jK2uQRCSkkNfKf3P");

pub mod state;
pub mod errors;
pub mod instructions;

use state::{
    ExoticVault, ExoticOption, PriceSampleBuffer, LiquidityProvider,
    OptionType, OptionStatus,
};
use errors::ExoticVaultError;

/// ExoticVault - Asian & Barrier Options Protocol
/// Trade exotic options with path-dependent payoffs
///
/// Key concepts:
/// - Asian options: Payoff based on TWAP (time-weighted average price)
/// - Barrier options: Options that activate (knock-in) or deactivate (knock-out) at price levels
/// - TWAP settlement reduces manipulation risk for Asian options
#[program]
pub mod exotic_vault {
    use super::*;

    /// Initialize an exotic options vault
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        params: VaultParams,
    ) -> Result<()> {
        instructions::initialize_vault::handler(ctx, params)
    }

    /// Buy an Asian call option (TWAP-settled)
    pub fn buy_asian_call(
        ctx: Context<BuyOption>,
        strike_price: u64,
        notional: u64,
        duration_days: u16,
    ) -> Result<()> {
        instructions::buy_option::handler(ctx, strike_price, notional, duration_days, OptionType::AsianCall)
    }

    /// Buy an Asian put option (TWAP-settled)
    pub fn buy_asian_put(
        ctx: Context<BuyOption>,
        strike_price: u64,
        notional: u64,
        duration_days: u16,
    ) -> Result<()> {
        instructions::buy_option::handler(ctx, strike_price, notional, duration_days, OptionType::AsianPut)
    }

    /// Buy a knock-out barrier option
    pub fn buy_knockout(
        ctx: Context<BuyBarrierOption>,
        strike_price: u64,
        barrier_price: u64,
        notional: u64,
        duration_days: u16,
        is_call: bool,
        is_up_barrier: bool,
    ) -> Result<()> {
        let option_type = match (is_call, is_up_barrier) {
            (true, true) => OptionType::UpAndOutCall,
            (true, false) => OptionType::DownAndOutCall,
            (false, true) => OptionType::UpAndOutPut,
            (false, false) => OptionType::DownAndOutPut,
        };
        instructions::buy_barrier_option::handler(ctx, strike_price, barrier_price, notional, duration_days, option_type)
    }

    /// Buy a knock-in barrier option
    pub fn buy_knockin(
        ctx: Context<BuyBarrierOption>,
        strike_price: u64,
        barrier_price: u64,
        notional: u64,
        duration_days: u16,
        is_call: bool,
        is_up_barrier: bool,
    ) -> Result<()> {
        let option_type = match (is_call, is_up_barrier) {
            (true, true) => OptionType::UpAndInCall,
            (true, false) => OptionType::DownAndInCall,
            (false, true) => OptionType::UpAndInPut,
            (false, false) => OptionType::DownAndInPut,
        };
        instructions::buy_barrier_option::handler(ctx, strike_price, barrier_price, notional, duration_days, option_type)
    }

    /// Check barrier (called by oracle or keeper)
    pub fn check_barrier(ctx: Context<CheckBarrier>) -> Result<()> {
        instructions::check_barrier::handler(ctx)
    }

    /// Record price sample for Asian options
    pub fn record_price_sample(ctx: Context<RecordPriceSample>) -> Result<()> {
        instructions::record_price_sample::handler(ctx)
    }

    /// Settle option at expiry
    pub fn settle_option(ctx: Context<SettleOption>) -> Result<()> {
        instructions::settle_option::handler(ctx)
    }

    /// Claim option payout
    pub fn claim_payout(ctx: Context<ClaimPayout>) -> Result<()> {
        instructions::claim_payout::handler(ctx)
    }

    /// Update vault parameters (admin only)
    pub fn update_vault(
        ctx: Context<UpdateVault>,
        new_fee_rate_bps: Option<u16>,
        is_active: Option<bool>,
    ) -> Result<()> {
        instructions::update_vault::handler(ctx, new_fee_rate_bps, is_active)
    }

    /// Deposit liquidity to vault (LP)
    pub fn deposit_liquidity(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
        instructions::liquidity::deposit(ctx, amount)
    }

    /// Withdraw liquidity from vault (LP)
    pub fn withdraw_liquidity(ctx: Context<WithdrawLiquidity>, shares: u64) -> Result<()> {
        instructions::liquidity::withdraw(ctx, shares)
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct VaultParams {
    /// Minimum option notional
    pub min_notional: u64,
    /// Maximum option notional
    pub max_notional: u64,
    /// Minimum duration in days
    pub min_duration_days: u16,
    /// Maximum duration in days
    pub max_duration_days: u16,
    /// Fee rate in basis points
    pub fee_rate_bps: u16,
    /// Price sample interval in seconds
    pub sample_interval_seconds: u64,
}

// ============================================================================
// Contexts
// ============================================================================

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    pub collateral_mint: Account<'info, Mint>,

    /// CHECK: Underlying asset mint (e.g., SOL)
    pub underlying_mint: AccountInfo<'info>,

    /// Price feed from shared oracle
    /// CHECK: Validated via seeds in shared-oracle
    pub price_feed: AccountInfo<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + ExoticVault::INIT_SPACE,
        seeds = [b"exotic_vault", underlying_mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, ExoticVault>,

    #[account(
        init,
        payer = authority,
        seeds = [b"vault_collateral", vault.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = vault_collateral
    )]
    pub vault_collateral: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyOption<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"exotic_vault", vault.underlying_mint.as_ref()],
        bump = vault.bump,
        constraint = vault.is_active @ ExoticVaultError::VaultInactive
    )]
    pub vault: Account<'info, ExoticVault>,

    #[account(
        init,
        payer = user,
        space = 8 + ExoticOption::INIT_SPACE,
        seeds = [b"option", vault.key().as_ref(), user.key().as_ref(), &vault.total_options.to_le_bytes()],
        bump
    )]
    pub option: Account<'info, ExoticOption>,

    #[account(
        init,
        payer = user,
        space = 8 + PriceSampleBuffer::INIT_SPACE,
        seeds = [b"samples", option.key().as_ref()],
        bump
    )]
    pub sample_buffer: Account<'info, PriceSampleBuffer>,

    /// CHECK: User's collateral token account
    #[account(mut)]
    pub user_collateral: AccountInfo<'info>,

    /// CHECK: Vault collateral
    #[account(
        mut,
        seeds = [b"vault_collateral", vault.key().as_ref()],
        bump = vault.collateral_vault_bump
    )]
    pub vault_collateral: AccountInfo<'info>,

    /// CHECK: Collateral mint
    pub collateral_mint: AccountInfo<'info>,

    /// CHECK: SPL Token program
    pub token_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct BuyBarrierOption<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"exotic_vault", vault.underlying_mint.as_ref()],
        bump = vault.bump,
        constraint = vault.is_active @ ExoticVaultError::VaultInactive
    )]
    pub vault: Account<'info, ExoticVault>,

    #[account(
        init,
        payer = user,
        space = 8 + ExoticOption::INIT_SPACE,
        seeds = [b"option", vault.key().as_ref(), user.key().as_ref(), &vault.total_options.to_le_bytes()],
        bump
    )]
    pub option: Account<'info, ExoticOption>,

    /// CHECK: User's collateral token account
    #[account(mut)]
    pub user_collateral: AccountInfo<'info>,

    /// CHECK: Vault collateral
    #[account(
        mut,
        seeds = [b"vault_collateral", vault.key().as_ref()],
        bump = vault.collateral_vault_bump
    )]
    pub vault_collateral: AccountInfo<'info>,

    /// CHECK: Collateral mint
    pub collateral_mint: AccountInfo<'info>,

    /// CHECK: SPL Token program
    pub token_program: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckBarrier<'info> {
    pub keeper: Signer<'info>,

    #[account(
        seeds = [b"exotic_vault", vault.underlying_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, ExoticVault>,

    #[account(
        mut,
        seeds = [b"option", vault.key().as_ref(), option.owner.as_ref(), &option.option_index.to_le_bytes()],
        bump = option.bump,
        constraint = option.status == OptionStatus::Active @ ExoticVaultError::AlreadySettled
    )]
    pub option: Account<'info, ExoticOption>,

    /// Price feed from shared oracle
    /// CHECK: Validated via vault.price_feed
    #[account(
        constraint = price_feed.key() == vault.price_feed @ ExoticVaultError::InvalidOracle
    )]
    pub price_feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct RecordPriceSample<'info> {
    pub oracle: Signer<'info>,

    #[account(
        seeds = [b"exotic_vault", vault.underlying_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, ExoticVault>,

    #[account(
        mut,
        seeds = [b"option", vault.key().as_ref(), option.owner.as_ref(), &option.option_index.to_le_bytes()],
        bump = option.bump,
        constraint = option.status == OptionStatus::Active @ ExoticVaultError::AlreadySettled,
        constraint = option.is_asian() @ ExoticVaultError::InvalidOptionType
    )]
    pub option: Account<'info, ExoticOption>,

    #[account(
        mut,
        seeds = [b"samples", option.key().as_ref()],
        bump = sample_buffer.bump
    )]
    pub sample_buffer: Account<'info, PriceSampleBuffer>,

    /// Price feed from shared oracle
    /// CHECK: Validated via vault.price_feed
    #[account(
        constraint = price_feed.key() == vault.price_feed @ ExoticVaultError::InvalidOracle
    )]
    pub price_feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SettleOption<'info> {
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"exotic_vault", vault.underlying_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, ExoticVault>,

    #[account(
        mut,
        seeds = [b"option", vault.key().as_ref(), option.owner.as_ref(), &option.option_index.to_le_bytes()],
        bump = option.bump,
        constraint = option.owner == user.key() @ ExoticVaultError::Unauthorized
    )]
    pub option: Account<'info, ExoticOption>,

    #[account(
        seeds = [b"samples", option.key().as_ref()],
        bump = sample_buffer.bump
    )]
    pub sample_buffer: Option<Account<'info, PriceSampleBuffer>>,

    /// Price feed from shared oracle
    /// CHECK: Validated via vault.price_feed
    #[account(
        constraint = price_feed.key() == vault.price_feed @ ExoticVaultError::InvalidOracle
    )]
    pub price_feed: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ClaimPayout<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        seeds = [b"exotic_vault", vault.underlying_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, ExoticVault>,

    #[account(
        mut,
        seeds = [b"option", vault.key().as_ref(), user.key().as_ref(), &option.option_index.to_le_bytes()],
        bump = option.bump,
        constraint = option.owner == user.key() @ ExoticVaultError::Unauthorized,
        constraint = option.status == OptionStatus::Settled @ ExoticVaultError::NotSettled,
        close = user
    )]
    pub option: Account<'info, ExoticOption>,

    /// CHECK: Vault collateral
    #[account(
        mut,
        seeds = [b"vault_collateral", vault.key().as_ref()],
        bump = vault.collateral_vault_bump
    )]
    pub vault_collateral: AccountInfo<'info>,

    /// CHECK: User's collateral token account
    #[account(mut)]
    pub user_collateral: AccountInfo<'info>,

    /// CHECK: Collateral mint
    pub collateral_mint: AccountInfo<'info>,

    /// CHECK: SPL Token program
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct UpdateVault<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        constraint = authority.key() == vault.authority @ ExoticVaultError::Unauthorized
    )]
    pub vault: Account<'info, ExoticVault>,
}

#[derive(Accounts)]
pub struct DepositLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"exotic_vault", vault.underlying_mint.as_ref()],
        bump = vault.bump,
        constraint = vault.is_active @ ExoticVaultError::VaultInactive
    )]
    pub vault: Account<'info, ExoticVault>,

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + LiquidityProvider::INIT_SPACE,
        seeds = [b"lp", vault.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub lp_account: Account<'info, LiquidityProvider>,

    /// CHECK: User's collateral token account
    #[account(mut)]
    pub user_collateral: AccountInfo<'info>,

    /// CHECK: Vault collateral
    #[account(
        mut,
        seeds = [b"vault_collateral", vault.key().as_ref()],
        bump = vault.collateral_vault_bump
    )]
    pub vault_collateral: AccountInfo<'info>,

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
        seeds = [b"exotic_vault", vault.underlying_mint.as_ref()],
        bump = vault.bump
    )]
    pub vault: Account<'info, ExoticVault>,

    #[account(
        mut,
        seeds = [b"lp", vault.key().as_ref(), user.key().as_ref()],
        bump = lp_account.bump,
        constraint = lp_account.owner == user.key() @ ExoticVaultError::Unauthorized
    )]
    pub lp_account: Account<'info, LiquidityProvider>,

    /// CHECK: User's collateral token account
    #[account(mut)]
    pub user_collateral: AccountInfo<'info>,

    /// CHECK: Vault collateral
    #[account(
        mut,
        seeds = [b"vault_collateral", vault.key().as_ref()],
        bump = vault.collateral_vault_bump
    )]
    pub vault_collateral: AccountInfo<'info>,

    /// CHECK: Collateral mint
    pub collateral_mint: AccountInfo<'info>,

    /// CHECK: SPL Token program
    pub token_program: AccountInfo<'info>,
}
