//! Read-only views of the Sigma protocols' position accounts, and the
//! hand-built `transfer_position_owner` CPI used to hold them in custody.
//!
//! shared-oracle cannot depend on the protocol crates (they depend on it), so
//! the leading fields of each position (and pool) account are mirrored here.
//! Keep these in sync with `VariancePosition` / `VariancePool` (volswap),
//! `FundingSwapPosition` / `FundingPool` (funding-swap) and `ExoticOption`
//! (exotic-vault). The protocol crates' `tests/position_view.rs` check this.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use solana_sha256_hasher::hash;

use crate::errors::OracleError;
use crate::state::{PositionDirection, SigmaProtocol};

pub const VOLSWAP_PROGRAM_ID: Pubkey = pubkey!("FGjwkx9XxzJZvgybXTtDjsWJgCuhXwNJTthFwhfj8nPS");
pub const FUNDING_SWAP_PROGRAM_ID: Pubkey = pubkey!("GTERstKRN2YBVNwx6UePFhbn7BAfYeJkZmdX7gXqRjjx");
pub const EXOTIC_VAULT_PROGRAM_ID: Pubkey = pubkey!("6zryMfmTZPcneCvU5Bgs6amu5vg5jK2uQRCSkkNfKf3P");

#[derive(AnchorDeserialize)]
struct VariancePositionHead {
    owner: Pubkey,
    pool: Pubkey,
    epoch: u64,
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
    pool: Pubkey,
    _swap_index: u64,
    notional: u64,
    fixed_rate_bps: i16,
    is_receiver: bool,
    _duration_periods: u16,
    _start_period: u64,
    end_period: u64,
    expires_at: i64,
    _collateral_deposited: u64,
    _accumulated_pnl: i64,
    _periods_settled: u16,
    _payout_amount: u64,
    status: u8, // SwapStatus; 0 = Active
}

#[derive(AnchorDeserialize)]
struct ExoticOptionHead {
    owner: Pubkey,
    vault: Pubkey,
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

#[derive(AnchorDeserialize)]
struct VariancePoolHead {
    _authority: Pubkey,
    _collateral_mint: Pubkey,
    _underlying_mint: Pubkey,
    _price_feed: Pubkey,
    _variance_tracker: Pubkey,
    _epoch_duration_seconds: u64,
    _min_notional: u64,
    _max_notional: u64,
    _fee_rate_bps: u16,
    _variance_cap_bps: u64,
    _early_exit_penalty_bps: u16,
    current_epoch: u64,
    epoch_start_time: i64,
    epoch_end_time: i64,
}

/// Terms of a position, read from its account.
pub struct PositionView {
    pub owner: Pubkey,
    /// Pool (VolSwap, FundingSwap) or vault (ExoticVault) the position belongs to
    pub parent: Pubkey,
    /// Whether the position is still open (not settled / claimed / liquidated)
    pub is_live: bool,
    pub notional: u64,
    pub direction: PositionDirection,
    /// VolSwap: strike variance (bps). FundingSwap: fixed rate (bps, i16 as
    /// i64 bit pattern). ExoticVault: strike price.
    pub strike: u64,
    /// Expiry timestamp when the position stores one (FundingSwap, ExoticVault).
    pub expiry: Option<i64>,
    /// VolSwap: the position's epoch. FundingSwap: its end period. Else 0.
    pub period: u64,
    /// sha256 of the position account data at tokenization
    pub data_hash: [u8; 32],
}

fn account_discriminator(name: &str) -> [u8; 8] {
    let mut d = [0u8; 8];
    d.copy_from_slice(&hash(format!("account:{}", name).as_bytes()).to_bytes()[..8]);
    d
}

pub fn protocol_program_id(protocol: SigmaProtocol) -> Pubkey {
    match protocol {
        SigmaProtocol::VolSwap => VOLSWAP_PROGRAM_ID,
        SigmaProtocol::FundingSwap => FUNDING_SWAP_PROGRAM_ID,
        SigmaProtocol::ExoticVault => EXOTIC_VAULT_PROGRAM_ID,
    }
}

/// Borrow `info`'s data after checking it is a `name` account of `program_id`.
fn checked_data<'a>(
    info: &'a AccountInfo,
    program_id: &Pubkey,
    name: &str,
) -> Result<std::cell::Ref<'a, &'a mut [u8]>> {
    require_keys_eq!(*info.owner, *program_id, OracleError::InvalidPositionAccount);
    let data = info.try_borrow_data()?;
    require!(
        data.len() > 8 && data[..8] == account_discriminator(name),
        OracleError::InvalidPositionAccount
    );
    Ok(data)
}

/// Check that `info` is a position account of `protocol`'s program and return
/// its terms. Callers check `is_live` where an open position is required.
pub fn read_position(protocol: SigmaProtocol, info: &AccountInfo) -> Result<PositionView> {
    let name = match protocol {
        SigmaProtocol::VolSwap => "VariancePosition",
        SigmaProtocol::FundingSwap => "FundingSwapPosition",
        SigmaProtocol::ExoticVault => "ExoticOption",
    };
    let data = checked_data(info, &protocol_program_id(protocol), name)?;
    let data_hash = hash(&data).to_bytes();
    let mut rest: &[u8] = &data[8..];

    let view = match protocol {
        SigmaProtocol::VolSwap => {
            let p = VariancePositionHead::deserialize(&mut rest)
                .map_err(|_| error!(OracleError::InvalidPositionAccount))?;
            PositionView {
                owner: p.owner,
                parent: p.pool,
                is_live: p.status == 0,
                period: p.epoch,
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
            PositionView {
                owner: p.owner,
                parent: p.pool,
                is_live: p.status == 0,
                period: p.end_period,
                notional: p.notional,
                // Receiver profits when funding rises: treat as long
                direction: if p.is_receiver { PositionDirection::Long } else { PositionDirection::Short },
                strike: p.fixed_rate_bps as i64 as u64,
                expiry: Some(p.expires_at),
                data_hash,
            }
        }
        SigmaProtocol::ExoticVault => {
            let p = ExoticOptionHead::deserialize(&mut rest)
                .map_err(|_| error!(OracleError::InvalidPositionAccount))?;
            PositionView {
                owner: p.owner,
                parent: p.vault,
                is_live: p.status == 0 || p.status == 2,
                period: 0,
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

/// Expiry timestamp of a position. ExoticVault options and FundingSwap swaps
/// store it; for VolSwap it is the end of the position's epoch, read from
/// `parent_info` (the position's pool).
pub fn position_expiry(
    protocol: SigmaProtocol,
    view: &PositionView,
    parent_info: &AccountInfo,
) -> Result<i64> {
    require_keys_eq!(parent_info.key(), view.parent, OracleError::InvalidPositionAccount);
    match protocol {
        SigmaProtocol::ExoticVault => Ok(view.expiry.unwrap_or(0)),
        SigmaProtocol::VolSwap => {
            let data = checked_data(parent_info, &VOLSWAP_PROGRAM_ID, "VariancePool")?;
            let pool = VariancePoolHead::deserialize(&mut &data[8..])
                .map_err(|_| error!(OracleError::InvalidPositionAccount))?;
            // A position from an earlier epoch has already reached its end
            Ok(if view.period == pool.current_epoch {
                pool.epoch_end_time
            } else {
                pool.epoch_start_time
            })
        }
        SigmaProtocol::FundingSwap => {
            // The swap stores its exact expiry; still require the parent to be its pool
            checked_data(parent_info, &FUNDING_SWAP_PROGRAM_ID, "FundingPool")?;
            view.expiry.ok_or_else(|| error!(OracleError::InvalidPositionAccount))
        }
    }
}

/// Anchor instruction discriminator of the protocols' `transfer_position_owner`
pub fn transfer_owner_discriminator() -> [u8; 8] {
    let mut d = [0u8; 8];
    d.copy_from_slice(&hash(b"global:transfer_position_owner").to_bytes()[..8]);
    d
}

fn transfer_owner_ix(
    protocol: SigmaProtocol,
    owner: Pubkey,
    position: Pubkey,
    new_owner: Pubkey,
) -> Instruction {
    let mut data = transfer_owner_discriminator().to_vec();
    data.extend_from_slice(new_owner.as_ref());
    Instruction {
        program_id: protocol_program_id(protocol),
        accounts: vec![AccountMeta::new_readonly(owner, true), AccountMeta::new(position, false)],
        data,
    }
}

/// CPI the protocol's `transfer_position_owner`, signed by `owner` (a signer
/// of this transaction) or, with `signer_seeds`, by a shared-oracle PDA.
pub fn transfer_position_owner<'info>(
    protocol: SigmaProtocol,
    protocol_program: &AccountInfo<'info>,
    owner: &AccountInfo<'info>,
    position: &AccountInfo<'info>,
    new_owner: Pubkey,
    signer_seeds: Option<&[&[u8]]>,
) -> Result<()> {
    require_keys_eq!(
        protocol_program.key(),
        protocol_program_id(protocol),
        OracleError::InvalidPositionAccount
    );
    let ix = transfer_owner_ix(protocol, owner.key(), position.key(), new_owner);
    let infos = [owner.clone(), position.clone(), protocol_program.clone()];
    match signer_seeds {
        Some(seeds) => invoke_signed(&ix, &infos, &[seeds])?,
        None => invoke(&ix, &infos)?,
    }
    Ok(())
}
