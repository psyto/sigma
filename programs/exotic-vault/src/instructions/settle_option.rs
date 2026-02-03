use anchor_lang::prelude::*;
use crate::{SettleOption, ExoticVaultError, state::OptionStatus};

pub fn handler(ctx: Context<SettleOption>) -> Result<()> {
    let option = &mut ctx.accounts.option;
    let clock = Clock::get()?;

    // Check expiry
    require!(clock.unix_timestamp >= option.expiry_time, ExoticVaultError::NotExpired);

    // Handle based on option type and status
    match option.status {
        OptionStatus::Active => {
            // For Asian options, use TWAP
            // For barrier options that never triggered, use spot price
            let settlement_price = if option.is_asian() {
                if let Some(sample_buffer) = &ctx.accounts.sample_buffer {
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
                    msg!("Knock-in option expired worthless (barrier never triggered)");
                    return Ok(());
                }

                // TODO: Get current spot price from oracle
                // Placeholder for now
                0
            };

            option.settlement_price = Some(settlement_price);

            // Calculate payout
            let payout = option.calculate_intrinsic_value(settlement_price);
            option.payout_amount = payout;
            option.status = OptionStatus::Settled;
            option.settled_at = Some(clock.unix_timestamp);

            msg!("Option settled at price {}, payout: {}", settlement_price, payout);
        }

        OptionStatus::KnockedOut => {
            // Already knocked out, no payout
            option.payout_amount = 0;
            option.status = OptionStatus::Settled;
            option.settled_at = Some(clock.unix_timestamp);
            msg!("Knocked-out option settled with zero payout");
        }

        OptionStatus::KnockedIn => {
            // Knocked in, behaves like vanilla option at expiry
            // TODO: Get current spot price from oracle
            let settlement_price = 0; // Placeholder
            option.settlement_price = Some(settlement_price);

            let payout = option.calculate_intrinsic_value(settlement_price);
            option.payout_amount = payout;
            option.status = OptionStatus::Settled;
            option.settled_at = Some(clock.unix_timestamp);

            msg!("Knocked-in option settled at price {}, payout: {}", settlement_price, payout);
        }

        _ => {
            return Err(ExoticVaultError::AlreadySettled.into());
        }
    }

    Ok(())
}
