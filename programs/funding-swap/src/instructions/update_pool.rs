use anchor_lang::prelude::*;
use crate::{UpdatePool, FundingSwapError};

pub fn handler(
    ctx: Context<UpdatePool>,
    new_fee_rate_bps: Option<u16>,
    new_fixed_rate_bps: Option<i16>,
    is_active: Option<bool>,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    if let Some(fee_rate) = new_fee_rate_bps {
        require!(fee_rate <= 500, FundingSwapError::InvalidFeeRate); // Max 5%
        pool.fee_rate_bps = fee_rate;
        msg!("Fee rate updated to {} bps", fee_rate);
    }

    if let Some(fixed_rate) = new_fixed_rate_bps {
        // Fixed rate can be negative (shorts pay longs)
        require!(fixed_rate >= -1000 && fixed_rate <= 1000, FundingSwapError::InvalidRate);
        pool.current_fixed_rate_bps = fixed_rate;
        msg!("Fixed rate updated to {} bps", fixed_rate);
    }

    if let Some(active) = is_active {
        pool.is_active = active;
        msg!("Pool active status: {}", active);
    }

    Ok(())
}
