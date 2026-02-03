use anchor_lang::prelude::*;
use crate::{UpdateVault, ExoticVaultError};

pub fn handler(
    ctx: Context<UpdateVault>,
    new_fee_rate_bps: Option<u16>,
    is_active: Option<bool>,
) -> Result<()> {
    let vault = &mut ctx.accounts.vault;

    if let Some(fee_rate) = new_fee_rate_bps {
        require!(fee_rate <= 500, ExoticVaultError::InvalidFeeRate);
        vault.fee_rate_bps = fee_rate;
        msg!("Fee rate updated to {} bps", fee_rate);
    }

    if let Some(active) = is_active {
        vault.is_active = active;
        msg!("Vault active status: {}", active);
    }

    Ok(())
}
