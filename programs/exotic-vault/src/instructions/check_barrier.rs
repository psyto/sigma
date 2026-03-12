use anchor_lang::prelude::*;
use crate::{CheckBarrier, ExoticVaultError, BarrierBreached, state::OptionStatus};
use shared_oracle::state::PriceFeed;

pub fn handler(ctx: Context<CheckBarrier>) -> Result<()> {
    let option = &mut ctx.accounts.option;
    let clock = Clock::get()?;

    // Only check active barrier options
    require!(option.status == OptionStatus::Active, ExoticVaultError::AlreadySettled);
    require!(option.is_barrier(), ExoticVaultError::InvalidOptionType);
    require!(!option.barrier_breached, ExoticVaultError::BarrierAlreadyBreached);

    // Read price from oracle
    let price_feed_data = ctx.accounts.price_feed.try_borrow_data()?;
    let price_feed = PriceFeed::try_deserialize(&mut &price_feed_data[..])?;

    // Check price staleness
    require!(
        !price_feed.is_stale(clock.unix_timestamp),
        ExoticVaultError::StalePriceData
    );

    let current_price = price_feed.last_price;

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

        emit!(BarrierBreached {
            vault: ctx.accounts.vault.key(),
            option: option.key(),
            owner: option.owner,
            barrier_price: option.barrier_price.unwrap_or(0),
            breach_price: current_price,
            is_knockout: option.is_knockout(),
        });
    }

    Ok(())
}
