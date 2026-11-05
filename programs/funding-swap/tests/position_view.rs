//! shared-oracle mirrors FundingSwapPosition / FundingPool to read them; check they agree.
use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use funding_swap::state::{FundingPool, FundingSwapPosition, SwapStatus};
use shared_oracle::position_view::{position_expiry, read_position, PositionView};
use shared_oracle::{PositionDirection, SigmaProtocol};

fn read(pos: &FundingSwapPosition, owner_program: &Pubkey) -> Result<PositionView> {
    let mut data = Vec::new();
    pos.try_serialize(&mut data).unwrap();
    let key = Pubkey::new_unique();
    let mut lamports = 1u64;
    let info = AccountInfo::new(&key, false, false, &mut lamports, &mut data, owner_program, false, 0);
    read_position(SigmaProtocol::FundingSwap, &info)
}

fn position(status: SwapStatus, pool: Pubkey, end_period: u64) -> FundingSwapPosition {
    FundingSwapPosition {
        owner: Pubkey::new_unique(),
        pool,
        swap_index: 9,
        notional: 50_000_000,
        fixed_rate_bps: -25,
        is_receiver: true,
        duration_periods: 10,
        start_period: 1,
        end_period,
        expires_at: 40_000 + end_period as i64,
        collateral_deposited: 1,
        accumulated_pnl: -2,
        periods_settled: 0,
        payout_amount: 0,
        status,
        opened_at: 5,
        settled_at: None,
        bump: 254,
    }
}

fn pool(current_period: u64) -> FundingPool {
    FundingPool {
        authority: Pubkey::new_unique(),
        market_symbol: "SOL-PERP".to_string(),
        collateral_mint: Pubkey::new_unique(),
        funding_feed: Pubkey::new_unique(),
        funding_period_seconds: 3_600,
        min_notional: 1,
        max_notional: 2,
        max_duration_periods: 90,
        fee_rate_bps: 3,
        early_exit_penalty_bps: 4,
        current_fixed_rate_bps: 5,
        last_funding_time: 10_000,
        current_period,
        last_actual_rate_bps: 0,
        total_receiver_notional: 0,
        total_payer_notional: 0,
        active_swaps: 0,
        total_swaps: 0,
        total_volume: 0,
        total_fees_collected: 0,
        total_periods_processed: 0,
        total_lp_shares: 0,
        total_liquidity: 0,
        accumulated_lp_fees: 0,
        is_active: true,
        is_paused: false,
        bump: 1,
        vault_bump: 2,
    }
}

#[test]
fn reads_funding_swap_position() {
    let pos = position(SwapStatus::Active, Pubkey::new_unique(), 11);
    let view = read(&pos, &funding_swap::ID).unwrap();
    assert_eq!(view.owner, pos.owner);
    assert_eq!(view.parent, pos.pool);
    assert!(view.is_live);
    assert_eq!(view.notional, 50_000_000);
    assert_eq!(view.strike as i64, -25);
    assert_eq!(view.direction, PositionDirection::Long);
    assert!(!read(&position(SwapStatus::Settled, pos.pool, 11), &funding_swap::ID).unwrap().is_live);
}

#[test]
fn rejects_foreign_owner() {
    assert!(read(&position(SwapStatus::Active, Pubkey::new_unique(), 1), &Pubkey::new_unique()).is_err());
}

#[test]
fn expiry_is_the_stored_timestamp() {
    let pool_acc = pool(4);
    let mut data = Vec::new();
    pool_acc.try_serialize(&mut data).unwrap();
    let pool_key = Pubkey::new_unique();
    let mut lamports = 1u64;
    let pool_info = AccountInfo::new(&pool_key, false, false, &mut lamports, &mut data, &funding_swap::ID, false, 0);

    // The stored expires_at, independent of how far the pool's periods have run
    let live = read(&position(SwapStatus::Active, pool_key, 11), &funding_swap::ID).unwrap();
    assert_eq!(live.expiry, Some(40_011));
    assert_eq!(position_expiry(SigmaProtocol::FundingSwap, &live, &pool_info).unwrap(), 40_011);
    let ended = read(&position(SwapStatus::Active, pool_key, 2), &funding_swap::ID).unwrap();
    assert_eq!(position_expiry(SigmaProtocol::FundingSwap, &ended, &pool_info).unwrap(), 40_002);
    // The parent must be the position's pool
    let other = read(&position(SwapStatus::Active, Pubkey::new_unique(), 11), &funding_swap::ID).unwrap();
    assert!(position_expiry(SigmaProtocol::FundingSwap, &other, &pool_info).is_err());
}

#[test]
fn transfer_instruction_discriminator_matches() {
    assert_eq!(
        funding_swap::instruction::TransferPositionOwner::DISCRIMINATOR,
        &shared_oracle::position_view::transfer_owner_discriminator()[..]
    );
}

#[test]
fn end_and_early_refund_follow_the_stored_expiry() {
    let mut pos = position(SwapStatus::Active, Pubkey::new_unique(), 11);
    pos.opened_at = 1_000;
    pos.expires_at = 1_000 + 10 * 3_600;
    pos.collateral_deposited = 1_000_000;
    // Lagging or advanced pool periods do not move the end
    assert!(!pos.has_ended(pos.expires_at - 1));
    assert!(pos.has_ended(pos.expires_at));

    let p = pool(0); // early_exit_penalty_bps = 4
    // Half the term left: half the collateral, less the penalty
    let half = p.calculate_early_exit_refund(&pos, 1_000 + 5 * 3_600);
    assert_eq!(half, 500_000 * (10_000 - 4) / 10_000);
    // At open: all of it, less the penalty
    assert_eq!(p.calculate_early_exit_refund(&pos, 1_000), 1_000_000 * (10_000 - 4) / 10_000);
    // At or after expiry: the full collateral
    assert_eq!(p.calculate_early_exit_refund(&pos, pos.expires_at), 1_000_000);
}
