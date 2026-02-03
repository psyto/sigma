use anchor_lang::prelude::*;
use crate::{CheckBarrier, ExoticVaultError, state::OptionStatus};

pub fn handler(ctx: Context<CheckBarrier>, current_price: u64) -> Result<()> {
    let option = &mut ctx.accounts.option;
    let clock = Clock::get()?;

    // Only check active barrier options
    require!(option.status == OptionStatus::Active, ExoticVaultError::AlreadySettled);
    require!(option.is_barrier(), ExoticVaultError::InvalidOptionType);
    require!(!option.barrier_breached, ExoticVaultError::BarrierAlreadyBreached);

    // Check if barrier is triggered
    if option.should_trigger_barrier(current_price) {
        option.barrier_breached = true;
        option.barrier_breach_time = Some(clock.unix_timestamp);
        option.barrier_breach_price = Some(current_price);

        if option.is_knockout() {
            // Knock-out: option becomes worthless
            option.status = OptionStatus::KnockedOut;
            option.payout_amount = 0;
            msg!("Barrier breached! Option knocked out at price {}", current_price);
        } else {
            // Knock-in: option becomes active
            option.status = OptionStatus::KnockedIn;
            msg!("Barrier breached! Option knocked in at price {}", current_price);
        }
    }

    Ok(())
}
