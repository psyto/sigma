//! shared-oracle mirrors ExoticOption's layout to read it; check they agree.
use anchor_lang::prelude::*;
use exotic_vault::state::{ExoticOption, OptionStatus, OptionType};
use shared_oracle::position_view::read_position;
use shared_oracle::{PositionDirection, SigmaProtocol};

fn read(opt: &ExoticOption, owner_program: &Pubkey) -> Result<shared_oracle::position_view::PositionView> {
    let mut data = Vec::new();
    opt.try_serialize(&mut data).unwrap();
    let key = Pubkey::new_unique();
    let mut lamports = 1u64;
    let info = AccountInfo::new(&key, false, false, &mut lamports, &mut data, owner_program, false, 0);
    read_position(SigmaProtocol::ExoticVault, &info)
}

fn option(status: OptionStatus, barrier: Option<u64>) -> ExoticOption {
    ExoticOption {
        owner: Pubkey::new_unique(),
        vault: Pubkey::new_unique(),
        option_index: 2,
        option_type: OptionType::UpAndInCall,
        strike_price: 150_000_000,
        barrier_price: barrier,
        notional: 9_000_000,
        premium_paid: 1,
        duration_days: 7,
        start_time: 100,
        expiry_time: 1_700_000_000,
        barrier_breached: false,
        barrier_breach_time: None,
        barrier_breach_price: None,
        settlement_price: None,
        payout_amount: 0,
        status,
        settled_at: None,
        bump: 253,
    }
}

#[test]
fn reads_exotic_option() {
    for barrier in [None, Some(200_000_000)] {
        let opt = option(OptionStatus::Active, barrier);
        let view = read(&opt, &exotic_vault::ID).unwrap();
        assert_eq!(view.owner, opt.owner);
        assert_eq!(view.notional, 9_000_000);
        assert_eq!(view.strike, 150_000_000);
        assert_eq!(view.expiry, Some(1_700_000_000));
        assert_eq!(view.direction, PositionDirection::Long);
    }
    assert!(read(&option(OptionStatus::KnockedIn, Some(1)), &exotic_vault::ID).is_ok());
}

#[test]
fn rejects_settled_or_foreign_owner() {
    assert!(read(&option(OptionStatus::Settled, None), &exotic_vault::ID).is_err());
    assert!(read(&option(OptionStatus::Active, None), &Pubkey::new_unique()).is_err());
}
