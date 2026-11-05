//! shared-oracle mirrors VariancePosition's layout to read it; check they agree.
use anchor_lang::prelude::*;
use shared_oracle::position_view::read_position;
use shared_oracle::{PositionDirection, SigmaProtocol};
use volswap::state::{PositionStatus, VariancePosition};

fn read(pos: &VariancePosition, owner_program: &Pubkey) -> Result<shared_oracle::position_view::PositionView> {
    let mut data = Vec::new();
    pos.try_serialize(&mut data).unwrap();
    let key = Pubkey::new_unique();
    let mut lamports = 1u64;
    let info = AccountInfo::new(&key, false, false, &mut lamports, &mut data, owner_program, false, 0);
    read_position(SigmaProtocol::VolSwap, &info)
}

fn position(status: PositionStatus) -> VariancePosition {
    VariancePosition {
        owner: Pubkey::new_unique(),
        pool: Pubkey::new_unique(),
        epoch: 3,
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

#[test]
fn reads_variance_position() {
    let pos = position(PositionStatus::Active);
    let view = read(&pos, &volswap::ID).unwrap();
    assert_eq!(view.owner, pos.owner);
    assert_eq!(view.notional, 7_000_000);
    assert_eq!(view.strike, 4_200);
    assert_eq!(view.direction, PositionDirection::Short);
    assert_eq!(view.expiry, None);
}

#[test]
fn rejects_settled_or_foreign_owner() {
    assert!(read(&position(PositionStatus::Settled), &volswap::ID).is_err());
    assert!(read(&position(PositionStatus::Active), &Pubkey::new_unique()).is_err());
}
