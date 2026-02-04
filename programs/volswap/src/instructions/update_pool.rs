use anchor_lang::prelude::*;
use crate::{UpdatePool, VolswapError};

pub fn handler(
    ctx: Context<UpdatePool>,
    new_fee_rate_bps: Option<u16>,
    new_min_notional: Option<u64>,
    new_max_notional: Option<u64>,
    is_active: Option<bool>,
) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    if let Some(fee_rate) = new_fee_rate_bps {
        require!(fee_rate <= 1000, VolswapError::InvalidFeeRate); // Max 10%
        pool.fee_rate_bps = fee_rate;
        msg!("Fee rate updated to {} bps", fee_rate);
    }

    if let Some(min_notional) = new_min_notional {
        require!(min_notional > 0, VolswapError::NotionalTooLow);
        pool.min_notional = min_notional;
        msg!("Min notional updated to {}", min_notional);
    }

    if let Some(max_notional) = new_max_notional {
        require!(max_notional > pool.min_notional, VolswapError::NotionalTooHigh);
        pool.max_notional = max_notional;
        msg!("Max notional updated to {}", max_notional);
    }

    if let Some(active) = is_active {
        pool.is_active = active;
        msg!("Pool active status updated to {}", active);
    }

    Ok(())
}
