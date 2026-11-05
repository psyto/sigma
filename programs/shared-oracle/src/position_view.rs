//! Read-only views of the Sigma protocols' position accounts.
//!
//! shared-oracle cannot depend on the protocol crates (they depend on it), so
//! the leading fields of each position account are mirrored here. Keep these
//! in sync with `VariancePosition` (volswap), `FundingSwapPosition`
//! (funding-swap) and `ExoticOption` (exotic-vault).

use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

use crate::errors::OracleError;
use crate::state::{PositionDirection, SigmaProtocol};

pub const VOLSWAP_PROGRAM_ID: Pubkey = pubkey!("FGjwkx9XxzJZvgybXTtDjsWJgCuhXwNJTthFwhfj8nPS");
pub const FUNDING_SWAP_PROGRAM_ID: Pubkey = pubkey!("GTERstKRN2YBVNwx6UePFhbn7BAfYeJkZmdX7gXqRjjx");
pub const EXOTIC_VAULT_PROGRAM_ID: Pubkey = pubkey!("6zryMfmTZPcneCvU5Bgs6amu5vg5jK2uQRCSkkNfKf3P");

#[derive(AnchorDeserialize)]
struct VariancePositionHead {
    owner: Pubkey,
    _pool: Pubkey,
    _epoch: u64,
    notional: u64,
    strike_variance_bps: u64,
    is_long: bool,
    _collateral_deposited: u64,
    _premium: u64,
    _settlement_pnl: i64,
    _payout_amount: u64,
    status: u8, // PositionStatus; 0 = Active
}

#[derive(AnchorDeserialize)]
struct FundingSwapPositionHead {
    owner: Pubkey,
    _pool: Pubkey,
    _swap_index: u64,
    notional: u64,
    fixed_rate_bps: i16,
    is_receiver: bool,
    _duration_periods: u16,
    _start_period: u64,
    _end_period: u64,
    _collateral_deposited: u64,
    _accumulated_pnl: i64,
    _periods_settled: u16,
    _payout_amount: u64,
    status: u8, // SwapStatus; 0 = Active
}

#[derive(AnchorDeserialize)]
struct ExoticOptionHead {
    owner: Pubkey,
    _vault: Pubkey,
    _option_index: u64,
    _option_type: u8,
    strike_price: u64,
    _barrier_price: Option<u64>,
    notional: u64,
    _premium_paid: u64,
    _duration_days: u16,
    _start_time: i64,
    expiry_time: i64,
    _barrier_breached: bool,
    _barrier_breach_time: Option<i64>,
    _barrier_breach_price: Option<u64>,
    _settlement_price: Option<u64>,
    _payout_amount: u64,
    status: u8, // OptionStatus; 0 = Active, 2 = KnockedIn
}

/// Terms of a live position, read from its account.
pub struct PositionView {
    pub owner: Pubkey,
    pub notional: u64,
    pub direction: PositionDirection,
    /// VolSwap: strike variance (bps). FundingSwap: fixed rate (bps, i16 as
    /// i64 bit pattern). ExoticVault: strike price.
    pub strike: u64,
    /// Expiry timestamp when the position stores one (ExoticVault).
    pub expiry: Option<i64>,
    /// sha256 of the position account data at tokenization
    pub data_hash: [u8; 32],
}

fn account_discriminator(name: &str) -> [u8; 8] {
    let mut d = [0u8; 8];
    d.copy_from_slice(&hash(format!("account:{}", name).as_bytes()).to_bytes()[..8]);
    d
}

/// Check that `info` is a live position account of `protocol`'s program and
/// return its terms.
pub fn read_position(protocol: SigmaProtocol, info: &AccountInfo) -> Result<PositionView> {
    let (program_id, name) = match protocol {
        SigmaProtocol::VolSwap => (VOLSWAP_PROGRAM_ID, "VariancePosition"),
        SigmaProtocol::FundingSwap => (FUNDING_SWAP_PROGRAM_ID, "FundingSwapPosition"),
        SigmaProtocol::ExoticVault => (EXOTIC_VAULT_PROGRAM_ID, "ExoticOption"),
    };
    require_keys_eq!(*info.owner, program_id, OracleError::InvalidPositionAccount);

    let data = info.try_borrow_data()?;
    require!(
        data.len() > 8 && data[..8] == account_discriminator(name),
        OracleError::InvalidPositionAccount
    );
    let data_hash = hash(&data).to_bytes();
    let mut rest: &[u8] = &data[8..];

    let view = match protocol {
        SigmaProtocol::VolSwap => {
            let p = VariancePositionHead::deserialize(&mut rest)
                .map_err(|_| error!(OracleError::InvalidPositionAccount))?;
            require!(p.status == 0, OracleError::PositionNotOpen);
            PositionView {
                owner: p.owner,
                notional: p.notional,
                direction: if p.is_long { PositionDirection::Long } else { PositionDirection::Short },
                strike: p.strike_variance_bps,
                expiry: None,
                data_hash,
            }
        }
        SigmaProtocol::FundingSwap => {
            let p = FundingSwapPositionHead::deserialize(&mut rest)
                .map_err(|_| error!(OracleError::InvalidPositionAccount))?;
            require!(p.status == 0, OracleError::PositionNotOpen);
            PositionView {
                owner: p.owner,
                notional: p.notional,
                // Receiver profits when funding rises: treat as long
                direction: if p.is_receiver { PositionDirection::Long } else { PositionDirection::Short },
                strike: p.fixed_rate_bps as i64 as u64,
                expiry: None,
                data_hash,
            }
        }
        SigmaProtocol::ExoticVault => {
            let p = ExoticOptionHead::deserialize(&mut rest)
                .map_err(|_| error!(OracleError::InvalidPositionAccount))?;
            require!(p.status == 0 || p.status == 2, OracleError::PositionNotOpen);
            PositionView {
                owner: p.owner,
                notional: p.notional,
                // The option holder is long the option
                direction: PositionDirection::Long,
                strike: p.strike_price,
                expiry: Some(p.expiry_time),
                data_hash,
            }
        }
    };
    Ok(view)
}
