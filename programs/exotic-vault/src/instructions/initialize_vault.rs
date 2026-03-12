use anchor_lang::prelude::*;
use crate::{InitializeVault, VaultParams, ExoticVaultError, VaultInitialized};

pub fn handler(ctx: Context<InitializeVault>, params: VaultParams) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    // Validate parameters
    require!(params.min_notional > 0, ExoticVaultError::NotionalTooLow);
    require!(params.max_notional > params.min_notional, ExoticVaultError::NotionalTooHigh);
    require!(params.min_duration_days >= 1, ExoticVaultError::DurationTooShort);
    require!(params.max_duration_days > params.min_duration_days, ExoticVaultError::DurationTooLong);
    require!(params.fee_rate_bps <= 500, ExoticVaultError::InvalidFeeRate);
    require!(params.sample_interval_seconds >= 60, ExoticVaultError::SampleTooSoon);

    vault.authority = ctx.accounts.authority.key();
    vault.collateral_mint = ctx.accounts.collateral_mint.key();
    vault.underlying_mint = ctx.accounts.underlying_mint.key();
    vault.price_feed = ctx.accounts.price_feed.key();

    vault.min_notional = params.min_notional;
    vault.max_notional = params.max_notional;
    vault.min_duration_days = params.min_duration_days;
    vault.max_duration_days = params.max_duration_days;
    vault.fee_rate_bps = params.fee_rate_bps;
    vault.sample_interval_seconds = params.sample_interval_seconds;

    vault.total_options = 0;
    vault.total_volume = 0;
    vault.total_premiums_collected = 0;
    vault.total_fees_collected = 0;
    vault.total_payouts = 0;

    // Initialize LP state
    vault.total_lp_shares = 0;
    vault.total_liquidity = 0;
    vault.accumulated_lp_fees = 0;
    vault.active_options = 0;
    vault.total_exposure = 0;

    vault.is_active = true;
    vault.bump = ctx.bumps.vault;
    vault.collateral_vault_bump = ctx.bumps.vault_collateral;

    msg!("ExoticVault initialized for {:?}", vault.underlying_mint);

    emit!(VaultInitialized {
        vault: vault.key(),
        authority: vault.authority,
        underlying_mint: vault.underlying_mint,
    });

    Ok(())
}
