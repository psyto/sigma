//! shared-oracle mirrors VariancePosition / VariancePool to read them; check they agree.
use anchor_lang::prelude::*;
use anchor_lang::Discriminator;
use shared_oracle::position_view::{position_expiry, read_position, PositionView};
use shared_oracle::{PositionDirection, SigmaProtocol};
use volswap::state::{PositionStatus, VariancePool, VariancePosition};

fn with_info<T: AccountSerialize, R>(acc: &T, owner_program: &Pubkey, f: impl FnOnce(&AccountInfo) -> R) -> R {
    let mut data = Vec::new();
    acc.try_serialize(&mut data).unwrap();
    let key = Pubkey::new_unique();
    let mut lamports = 1u64;
    let info = AccountInfo::new(&key, false, false, &mut lamports, &mut data, owner_program, false, 0);
    f(&info)
}

fn read(pos: &VariancePosition, owner_program: &Pubkey) -> Result<PositionView> {
    with_info(pos, owner_program, |i| read_position(SigmaProtocol::VolSwap, i))
}

fn position(status: PositionStatus, pool: Pubkey, epoch: u64) -> VariancePosition {
    VariancePosition {
        owner: Pubkey::new_unique(),
        pool,
        epoch,
        notional: 7_000_000,
        strike_variance_bps: 4_200,
        is_long: false,
        collateral_deposited: 1,
        premium: 2,
        settlement_pnl: -3,
        payout_amount: 4,
        status,
        opened_at: 5,
        settled_at: None,
        bump: 255,
    }
}

fn pool(current_epoch: u64) -> VariancePool {
    VariancePool {
        authority: Pubkey::new_unique(),
        collateral_mint: Pubkey::new_unique(),
        underlying_mint: Pubkey::new_unique(),
        price_feed: Pubkey::new_unique(),
        variance_tracker: Pubkey::new_unique(),
        epoch_duration_seconds: 604_800,
        min_notional: 1,
        max_notional: 2,
        fee_rate_bps: 3,
        variance_cap_bps: 4,
        early_exit_penalty_bps: 5,
        current_epoch,
        epoch_start_time: 1_000,
        epoch_end_time: 605_800,
        strike_variance_bps: 0,
        realized_variance_bps: 0,
        is_epoch_settled: false,
        total_long_notional: 0,
        total_short_notional: 0,
        active_positions: 0,
        total_fees_collected: 0,
        total_volume: 0,
        total_epochs: 0,
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
fn reads_variance_position() {
    let pos = position(PositionStatus::Active, Pubkey::new_unique(), 3);
    let view = read(&pos, &volswap::ID).unwrap();
    assert_eq!(view.owner, pos.owner);
    assert_eq!(view.parent, pos.pool);
    assert!(view.is_live);
    assert_eq!(view.notional, 7_000_000);
    assert_eq!(view.strike, 4_200);
    assert_eq!(view.direction, PositionDirection::Short);
    assert!(!read(&position(PositionStatus::Settled, pos.pool, 3), &volswap::ID).unwrap().is_live);
}

#[test]
fn rejects_foreign_owner() {
    assert!(read(&position(PositionStatus::Active, Pubkey::new_unique(), 0), &Pubkey::new_unique()).is_err());
}

#[test]
fn expiry_from_pool_epoch() {
    let pool_acc = pool(3);
    let mut data = Vec::new();
    pool_acc.try_serialize(&mut data).unwrap();
    let pool_key = Pubkey::new_unique();
    let mut lamports = 1u64;
    let pool_info = AccountInfo::new(&pool_key, false, false, &mut lamports, &mut data, &volswap::ID, false, 0);

    let current = read(&position(PositionStatus::Active, pool_key, 3), &volswap::ID).unwrap();
    assert_eq!(position_expiry(SigmaProtocol::VolSwap, &current, &pool_info).unwrap(), 605_800);
    let old = read(&position(PositionStatus::Active, pool_key, 2), &volswap::ID).unwrap();
    assert_eq!(position_expiry(SigmaProtocol::VolSwap, &old, &pool_info).unwrap(), 1_000);
    let other = read(&position(PositionStatus::Active, Pubkey::new_unique(), 3), &volswap::ID).unwrap();
    assert!(position_expiry(SigmaProtocol::VolSwap, &other, &pool_info).is_err());
}

#[test]
fn transfer_instruction_discriminator_matches() {
    // shared-oracle builds the CPI by hand
    assert_eq!(
        volswap::instruction::TransferPositionOwner::DISCRIMINATOR,
        &shared_oracle::position_view::transfer_owner_discriminator()[..]
    );
}
