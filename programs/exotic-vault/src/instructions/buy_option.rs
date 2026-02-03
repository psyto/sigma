use anchor_lang::prelude::*;
use anchor_spl::token_interface::{transfer_checked, TransferChecked};
use crate::{BuyOption, ExoticVaultError, state::{OptionType, OptionStatus}};

pub fn handler(
    ctx: Context<BuyOption>,
    strike_price: u64,
    notional: u64,
    duration_days: u16,
    option_type: OptionType,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let option = &mut ctx.accounts.option;
    let sample_buffer = &mut ctx.accounts.sample_buffer;
    let clock = Clock::get()?;

    // Validations
    require!(vault.is_active, ExoticVaultError::VaultInactive);
    require!(notional >= vault.min_notional, ExoticVaultError::NotionalTooLow);
    require!(notional <= vault.max_notional, ExoticVaultError::NotionalTooHigh);
    require!(duration_days >= vault.min_duration_days, ExoticVaultError::DurationTooShort);
    require!(duration_days <= vault.max_duration_days, ExoticVaultError::DurationTooLong);
    require!(strike_price > 0, ExoticVaultError::InvalidStrikePrice);

    // Calculate premium (simplified Black-Scholes approximation)
    // Asian options have lower premium due to averaging effect
    // Premium ≈ Notional × 0.05 × sqrt(duration/365) × volatility_factor
    let duration_factor = ((duration_days as u64) * 1000 / 365).max(100); // sqrt approximation
    let base_premium_bps: u64 = 300; // 3% base
    let asian_discount_bps: u64 = 70; // 30% discount for Asian options

    let premium = (notional * base_premium_bps * duration_factor * asian_discount_bps) / (10000 * 1000 * 100);
    let fee = (notional * vault.fee_rate_bps as u64) / 10000;
    let total_cost = premium + fee;

    // Transfer premium + fee
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_collateral.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
                to: ctx.accounts.vault_collateral.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        total_cost,
        ctx.accounts.collateral_mint.decimals,
    )?;

    // Update vault stats
    vault.total_premiums_collected = vault.total_premiums_collected.checked_add(premium).ok_or(ExoticVaultError::Overflow)?;
    vault.total_fees_collected = vault.total_fees_collected.checked_add(fee).ok_or(ExoticVaultError::Overflow)?;
    vault.total_volume = vault.total_volume.checked_add(notional as u128).ok_or(ExoticVaultError::Overflow)?;

    let option_index = vault.total_options;
    vault.total_options = vault.total_options.checked_add(1).ok_or(ExoticVaultError::Overflow)?;

    // Initialize option
    let expiry_time = clock.unix_timestamp + (duration_days as i64 * 86400);

    option.owner = ctx.accounts.user.key();
    option.vault = vault.key();
    option.option_index = option_index;
    option.option_type = option_type;
    option.strike_price = strike_price;
    option.barrier_price = None;
    option.notional = notional;
    option.premium_paid = premium;
    option.duration_days = duration_days;
    option.start_time = clock.unix_timestamp;
    option.expiry_time = expiry_time;
    option.barrier_breached = false;
    option.barrier_breach_time = None;
    option.barrier_breach_price = None;
    option.settlement_price = None;
    option.payout_amount = 0;
    option.status = OptionStatus::Active;
    option.settled_at = None;
    option.bump = ctx.bumps.option;

    // Initialize sample buffer
    sample_buffer.option = option.key();
    sample_buffer.samples = Vec::new();
    sample_buffer.twap = 0;
    sample_buffer.bump = ctx.bumps.sample_buffer;

    msg!("Asian option bought: {:?}, strike {}, notional {}, {} days",
        option_type, strike_price, notional, duration_days);

    Ok(())
}
