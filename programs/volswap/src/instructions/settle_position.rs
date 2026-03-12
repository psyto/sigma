use anchor_lang::prelude::*;
use crate::{SettlePosition, VolswapError, state::PositionStatus};

pub fn handler(ctx: Context<SettlePosition>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    // Calculate P&L using pool method
    let pnl = pool.calculate_pnl(position);
    position.settlement_pnl = pnl;

    // Calculate payout: collateral + P&L (clamped to 0)
    let payout = if pnl >= 0 {
        position.collateral_deposited.checked_add(pnl as u64).ok_or(VolswapError::Overflow)?
    } else {
        position.collateral_deposited.saturating_sub((-pnl) as u64)
    };

    position.payout_amount = payout;
    position.status = PositionStatus::Settled;
    position.settled_at = Some(clock.unix_timestamp);

    msg!("Position settled");
    msg!("Strike: {} bps, Realized: {} bps", position.strike_variance_bps, pool.realized_variance_bps);
    msg!("P&L: {} ({})", pnl, if position.is_long { "LONG" } else { "SHORT" });
    msg!("Payout: {}", payout);

    emit!(crate::PositionSettled {
        pool: ctx.accounts.pool.key(),
        owner: position.owner,
        position: ctx.accounts.position.key(),
        pnl,
        payout,
    });

    Ok(())
}
