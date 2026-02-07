use anchor_lang::prelude::*;

/// Solver configuration account
/// Stores the solver's public key and configuration parameters
#[account]
#[derive(InitSpace)]
pub struct SolverConfig {
    /// Authority who can update the solver config
    pub authority: Pubkey,

    /// Solver's signing pubkey (for execute_intent)
    pub solver_pubkey: Pubkey,

    /// Fee rate in basis points (e.g., 10 = 0.1%)
    pub fee_bps: u16,

    /// Total intents processed
    pub total_intents: u64,

    /// Total volume processed (in collateral units)
    pub total_volume: u128,

    /// Whether the solver is accepting new intents
    pub is_active: bool,

    /// Minimum collateral amount required
    pub min_collateral: u64,

    /// Maximum encrypted payload size
    pub max_payload_size: u16,

    /// PDA bump
    pub bump: u8,
}

impl SolverConfig {
    pub const SEED: &'static [u8] = b"solver_config";
}
