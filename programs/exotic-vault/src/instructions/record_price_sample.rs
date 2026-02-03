use anchor_lang::prelude::*;
use crate::{RecordPriceSample, ExoticVaultError, state::{OptionStatus, PriceSample}};

pub fn handler(ctx: Context<RecordPriceSample>, price: u64) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let option = &ctx.accounts.option;
    let sample_buffer = &mut ctx.accounts.sample_buffer;
    let clock = Clock::get()?;

    // Only record for active Asian options
    require!(option.status == OptionStatus::Active, ExoticVaultError::AlreadySettled);
    require!(option.is_asian(), ExoticVaultError::InvalidOptionType);

    // Check minimum interval
    if let Some(last_sample) = sample_buffer.samples.last() {
        let time_since_last = clock.unix_timestamp - last_sample.timestamp;
        require!(
            time_since_last >= vault.sample_interval_seconds as i64,
            ExoticVaultError::SampleTooSoon
        );
    }

    // Add sample
    sample_buffer.samples.push(PriceSample {
        price,
        timestamp: clock.unix_timestamp,
    });

    // Trim to max 1000 samples
    if sample_buffer.samples.len() > 1000 {
        sample_buffer.samples.remove(0);
    }

    // Update TWAP
    sample_buffer.twap = sample_buffer.calculate_twap();

    msg!("Price sample recorded: {} (TWAP: {})", price, sample_buffer.twap);

    Ok(())
}
