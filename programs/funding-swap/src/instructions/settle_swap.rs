use anchor_lang::prelude::*;
use crate::{SettleSwap, FundingSwapError, state::SwapStatus};

pub fn handler(ctx: Context<SettleSwap>) -> Result<()> {
    let pool = &ctx.accounts.pool;
    let swap = &mut ctx.accounts.swap;
    let clock = Clock::get()?;

    // Validations
    require!(swap.status == SwapStatus::Active, FundingSwapError::SwapAlreadySettled);
    require!(pool.current_period >= swap.end_period, FundingSwapError::SwapNotEnded);

    // Calculate final payout
    // In production, this would aggregate P&L from all funding periods
    // For now, using simplified calculation

    // Simulate accumulated P&L based on average rate difference
    // Placeholder: assume average rate was 5 bps above fixed for receivers
    let avg_rate_diff: i64 = 5; // bps
    let total_pnl = (swap.notional as i64 * avg_rate_diff * swap.duration_periods as i64) / 10000;

    let final_pnl = if swap.is_receiver {
        total_pnl
    } else {
        -total_pnl
    };

    swap.accumulated_pnl = final_pnl;
    swap.periods_settled = swap.duration_periods;

    // Calculate payout
    let payout = if final_pnl >= 0 {
        swap.collateral_deposited.checked_add(final_pnl as u64).ok_or(FundingSwapError::Overflow)?
    } else {
        swap.collateral_deposited.saturating_sub((-final_pnl) as u64)
    };

    swap.payout_amount = payout;
    swap.status = SwapStatus::Settled;
    swap.settled_at = Some(clock.unix_timestamp);

    msg!("Swap settled: P&L = {} bps, Payout = {}", final_pnl, payout);

    Ok(())
}
