//! shared-oracle mirrors FundingSwapPosition's layout to read it; check they agree.
use anchor_lang::prelude::*;
use funding_swap::state::{FundingSwapPosition, SwapStatus};
use shared_oracle::position_view::read_position;
use shared_oracle::{PositionDirection, SigmaProtocol};

fn read(pos: &FundingSwapPosition, owner_program: &Pubkey) -> Result<shared_oracle::position_view::PositionView> {
    let mut data = Vec::new();
    pos.try_serialize(&mut data).unwrap();
    let key = Pubkey::new_unique();
    let mut lamports = 1u64;
    let info = AccountInfo::new(&key, false, false, &mut lamports, &mut data, owner_program, false, 0);
    read_position(SigmaProtocol::FundingSwap, &info)
}

fn position(status: SwapStatus) -> FundingSwapPosition {
    FundingSwapPosition {
        owner: Pubkey::new_unique(),
        pool: Pubkey::new_unique(),
        swap_index: 9,
        notional: 50_000_000,
        fixed_rate_bps: -25,
        is_receiver: true,
        duration_periods: 10,
        start_period: 1,
        end_period: 11,
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

#[test]
fn reads_funding_swap_position() {
    let pos = position(SwapStatus::Active);
    let view = read(&pos, &funding_swap::ID).unwrap();
    assert_eq!(view.owner, pos.owner);
    assert_eq!(view.notional, 50_000_000);
    assert_eq!(view.strike as i64, -25);
    assert_eq!(view.direction, PositionDirection::Long);
}

#[test]
fn rejects_settled_or_foreign_owner() {
    assert!(read(&position(SwapStatus::Settled), &funding_swap::ID).is_err());
    assert!(read(&position(SwapStatus::Active), &Pubkey::new_unique()).is_err());
}
