use anchor_lang::prelude::*;
use crate::{SettleOption, ExoticVaultError, OptionSettled, state::OptionStatus};
use shared_oracle::state::PriceFeed;

pub fn handler(ctx: Context<SettleOption>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let option = &mut ctx.accounts.option;
    let clock = Clock::get()?;

    // Check expiry
    require!(clock.unix_timestamp >= option.expiry_time, ExoticVaultError::NotExpired);

    // Read price from oracle for spot-settled options
    let price_feed_data = ctx.accounts.price_feed.try_borrow_data()?;
    let price_feed = PriceFeed::try_deserialize(&mut &price_feed_data[..])?;
    let spot_price = price_feed.last_price;

    // Handle based on option type and status
    match option.status {
        OptionStatus::Active => {
            // For Asian options, use TWAP
            // For barrier options that never triggered, use spot price
            let settlement_price = if option.is_asian() {
                if let Some(sample_buffer) = &ctx.accounts.sample_buffer {
                    require!(sample_buffer.samples.len() >= 2, ExoticVaultError::InsufficientSamples);
                    sample_buffer.twap
                } else {
                    return Err(ExoticVaultError::InvalidOptionType.into());
                }
            } else {
                // For knock-in that never triggered, expires worthless
                if option.is_knockin() && !option.barrier_breached {
                    option.status = OptionStatus::Expired;
                    option.payout_amount = 0;
                    option.settled_at = Some(clock.unix_timestamp);

                    // Update vault stats
                    vault.active_options = vault.active_options.saturating_sub(1);
                    vault.total_exposure = vault.total_exposure.saturating_sub(option.notional as u128);

                    msg!("Knock-in option expired worthless (barrier never triggered)");
                    return Ok(());
                }

                spot_price
            };

            option.settlement_price = Some(settlement_price);

            // Calculate payout
            let payout = option.calculate_intrinsic_value(settlement_price);
            option.payout_amount = payout;
            option.status = OptionStatus::Settled;
            option.settled_at = Some(clock.unix_timestamp);

            // Update vault stats
            vault.active_options = vault.active_options.saturating_sub(1);
            vault.total_exposure = vault.total_exposure.saturating_sub(option.notional as u128);
            vault.total_payouts = vault.total_payouts.checked_add(payout).ok_or(ExoticVaultError::Overflow)?;

            msg!("Option settled at price {}, payout: {}", settlement_price, payout);
        }

        OptionStatus::KnockedOut => {
            // Already knocked out, no payout
            option.payout_amount = 0;
            option.status = OptionStatus::Settled;
            option.settled_at = Some(clock.unix_timestamp);

            // Update vault stats
            vault.active_options = vault.active_options.saturating_sub(1);
            vault.total_exposure = vault.total_exposure.saturating_sub(option.notional as u128);

            msg!("Knocked-out option settled with zero payout");
        }

        OptionStatus::KnockedIn => {
            // Knocked in, behaves like vanilla option at expiry
            option.settlement_price = Some(spot_price);

            let payout = option.calculate_intrinsic_value(spot_price);
            option.payout_amount = payout;
            option.status = OptionStatus::Settled;
            option.settled_at = Some(clock.unix_timestamp);

            // Update vault stats
            vault.active_options = vault.active_options.saturating_sub(1);
            vault.total_exposure = vault.total_exposure.saturating_sub(option.notional as u128);
            vault.total_payouts = vault.total_payouts.checked_add(payout).ok_or(ExoticVaultError::Overflow)?;

            msg!("Knocked-in option settled at price {}, payout: {}", spot_price, payout);
        }

        _ => {
            return Err(ExoticVaultError::AlreadySettled.into());
        }
    }

    emit!(OptionSettled {
        vault: vault.key(),
        option: option.key(),
        owner: option.owner,
        settlement_price: option.settlement_price.unwrap_or(0),
        payout: option.payout_amount,
    });

    Ok(())
}
