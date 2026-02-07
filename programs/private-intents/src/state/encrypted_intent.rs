use anchor_lang::prelude::*;

/// Type of derivative intent
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum IntentType {
    VarianceSwap,
    FundingSwap,
    ExoticOption,
}

/// Status of the encrypted intent
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum IntentStatus {
    /// Waiting for solver to execute
    Pending,
    /// Solver is currently executing
    Executing,
    /// Successfully executed
    Completed,
    /// Cancelled by owner
    Cancelled,
    /// Execution failed
    Failed,
    /// Waiting for cross-chain bridge
    BridgePending,
}

/// Source of collateral
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum CollateralSource {
    /// Native Solana collateral
    Native,
    /// Bridged from Ethereum via Wormhole
    Ethereum,
    /// Bridged from Arbitrum via Wormhole
    Arbitrum,
    /// Bridged via Circle CCTP (native USDC)
    Cctp,
}

/// Encrypted intent account
/// Stores the encrypted payload and metadata for a private derivative order
#[account]
#[derive(InitSpace)]
pub struct EncryptedIntent {
    /// Owner of the intent
    pub owner: Pubkey,

    /// Unique intent ID (per owner)
    pub intent_id: u64,

    /// Type of derivative
    pub intent_type: IntentType,

    /// Target pool/vault for execution
    pub target_pool: Pubkey,

    /// Collateral token mint
    pub collateral_mint: Pubkey,

    /// Collateral amount deposited
    pub collateral_amount: u64,

    /// Source of collateral (native or bridged)
    pub collateral_source: CollateralSource,

    /// Wormhole VAA hash (for bridged collateral, empty otherwise)
    #[max_len(32)]
    pub vaa_hash: Vec<u8>,

    /// Encrypted payload containing order parameters
    /// NaCl box encrypted (nonce + ciphertext)
    #[max_len(256)]
    pub encrypted_payload: Vec<u8>,

    /// User's X25519 encryption public key
    #[max_len(32)]
    pub user_encryption_pubkey: Vec<u8>,

    /// Current status
    pub status: IntentStatus,

    /// Unix timestamp when created
    pub created_at: i64,

    /// Unix timestamp when executed (0 if not executed)
    pub executed_at: i64,

    /// Solver who executed (None if not executed)
    pub executed_by: Option<Pubkey>,

    /// Resulting position account (if execution succeeded)
    pub result_position: Option<Pubkey>,

    /// PDA bump
    pub bump: u8,
}

impl EncryptedIntent {
    pub const SEED: &'static [u8] = b"encrypted_intent";

    /// Check if intent can be executed by solver
    pub fn is_executable(&self) -> bool {
        self.status == IntentStatus::Pending
    }

    /// Check if intent can be cancelled by owner
    pub fn is_cancellable(&self) -> bool {
        matches!(self.status, IntentStatus::Pending | IntentStatus::Failed)
    }

    /// Check if result can be claimed by owner
    pub fn is_claimable(&self) -> bool {
        self.status == IntentStatus::Completed
    }
}
