use anchor_lang::prelude::*;
use crate::{SettleSwap, FundingSwapError, state::SwapStatus};

pub fn handler(ctx: Context<SettleSwap>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let swap = &mut ctx.accounts.swap;
    let clock = Clock::get()?;

    // Validations
    require!(swap.status == SwapStatus::Active, FundingSwapError::SwapAlreadySettled);
    require!(swap.has_ended(pool.current_period), FundingSwapError::SwapNotEnded);

    // Calculate final P&L based on accumulated funding over the swap duration
    // In a production system, this would aggregate P&L from each funding period
    // For simplicity, we use the average rate difference times duration

    // Use last actual rate as a proxy for average rate during swap
    let avg_rate_diff = pool.last_actual_rate_bps as i64 - swap.fixed_rate_bps as i64;
    let total_pnl = (swap.notional as i64 * avg_rate_diff * swap.duration_periods as i64) / 10000;

    let final_pnl = if swap.is_receiver {
        total_pnl  // Receivers profit when actual > fixed
    } else {
        -total_pnl // Payers profit when actual < fixed
    };

    swap.accumulated_pnl = final_pnl;
    swap.periods_settled = swap.duration_periods;

    // Calculate payout: collateral + P&L (clamped to >= 0)
    let payout = if final_pnl >= 0 {
        swap.collateral_deposited.checked_add(final_pnl as u64).ok_or(FundingSwapError::Overflow)?
    } else {
        swap.collateral_deposited.saturating_sub((-final_pnl) as u64)
    };

    swap.payout_amount = payout;
    swap.status = SwapStatus::Settled;
    swap.settled_at = Some(clock.unix_timestamp);

    msg!("Swap settled");
    msg!("Fixed rate: {} bps, Avg actual rate: {} bps", swap.fixed_rate_bps, pool.last_actual_rate_bps);
    msg!("P&L: {} ({})", final_pnl, if swap.is_receiver { "RECEIVER" } else { "PAYER" });
    msg!("Payout: {}", payout);

    emit!(crate::SwapSettled {
        pool: pool.key(),
        owner: swap.owner,
        swap: swap.key(),
        pnl: final_pnl,
        payout,
    });

    Ok(())
}
