use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use crate::{DepositLiquidity, WithdrawLiquidity, ExoticVaultError, LiquidityDeposited, LiquidityWithdrawn};

/// SPL Token transfer instruction
fn spl_token_transfer<'info>(
    token_program: &AccountInfo<'info>,
    source: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    let ix = spl_token::instruction::transfer(
        token_program.key,
        source.key,
        destination.key,
        authority.key,
        &[],
        amount,
    )?;

    invoke(
        &ix,
        &[
            source.clone(),
            destination.clone(),
            authority.clone(),
            token_program.clone(),
        ],
    )?;

    Ok(())
}

/// SPL Token transfer with PDA signer
fn spl_token_transfer_signed<'info>(
    token_program: &AccountInfo<'info>,
    source: &AccountInfo<'info>,
    destination: &AccountInfo<'info>,
    authority: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let ix = spl_token::instruction::transfer(
        token_program.key,
        source.key,
        destination.key,
        authority.key,
        &[],
        amount,
    )?;

    invoke_signed(
        &ix,
        &[
            source.clone(),
            destination.clone(),
            authority.clone(),
            token_program.clone(),
        ],
        signer_seeds,
    )?;

    Ok(())
}

/// Deposit liquidity to the vault as an LP
pub fn deposit(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let lp_account = &mut ctx.accounts.lp_account;
    let clock = Clock::get()?;

    // Validate
    require!(amount > 0, ExoticVaultError::DepositTooLow);
    require!(vault.is_active, ExoticVaultError::VaultInactive);

    // Calculate shares to mint
    // If first deposit, shares = amount (1:1)
    // Otherwise, shares = amount * total_shares / total_liquidity
    let shares_to_mint = if vault.total_lp_shares == 0 || vault.total_liquidity == 0 {
        amount
    } else {
        // shares = amount * total_shares / total_liquidity
        (amount as u128)
            .checked_mul(vault.total_lp_shares as u128)
            .ok_or(ExoticVaultError::Overflow)?
            .checked_div(vault.total_liquidity as u128)
            .ok_or(ExoticVaultError::DivisionByZero)? as u64
    };

    require!(shares_to_mint > 0, ExoticVaultError::DepositTooLow);

    // Transfer collateral from user to vault
    spl_token_transfer(
        &ctx.accounts.token_program,
        &ctx.accounts.user_collateral,
        &ctx.accounts.vault_collateral,
        &ctx.accounts.user.to_account_info(),
        amount,
    )?;

    // Initialize LP account if first deposit (account created via init_if_needed)
    if lp_account.owner == Pubkey::default() {
        lp_account.owner = ctx.accounts.user.key();
        lp_account.vault = vault.key();
        lp_account.deposited_at = clock.unix_timestamp;
        lp_account.fees_claimed = 0;
        lp_account.total_deposited = 0;
        lp_account.total_withdrawn = 0;
        lp_account.bump = ctx.bumps.lp_account;
    }

    // Update LP account
    lp_account.shares = lp_account.shares.checked_add(shares_to_mint).ok_or(ExoticVaultError::Overflow)?;
    lp_account.total_deposited = lp_account.total_deposited.checked_add(amount).ok_or(ExoticVaultError::Overflow)?;
    lp_account.last_interaction = clock.unix_timestamp;

    // Update vault state
    vault.total_lp_shares = vault.total_lp_shares.checked_add(shares_to_mint).ok_or(ExoticVaultError::Overflow)?;
    vault.total_liquidity = vault.total_liquidity.checked_add(amount).ok_or(ExoticVaultError::Overflow)?;

    msg!("LP deposit: {} collateral for {} shares", amount, shares_to_mint);
    msg!("Total vault liquidity: {}", vault.total_liquidity);
    msg!("Total LP shares: {}", vault.total_lp_shares);

    emit!(LiquidityDeposited {
        vault: vault.key(),
        provider: ctx.accounts.user.key(),
        amount,
        shares: shares_to_mint,
    });

    Ok(())
}

/// Withdraw liquidity from the vault
pub fn withdraw(ctx: Context<WithdrawLiquidity>, shares: u64) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    let lp_account = &mut ctx.accounts.lp_account;
    let clock = Clock::get()?;

    // Validate
    require!(shares > 0, ExoticVaultError::InsufficientShares);
    require!(lp_account.shares >= shares, ExoticVaultError::InsufficientShares);

    // Check if vault has active options - if so, limit withdrawals
    // to protect against under-collateralization
    if vault.active_options > 0 {
        // Calculate maximum exposure risk
        let required_liquidity = (vault.total_exposure / 2) as u64; // Simplified: 50% of max exposure

        let available_liquidity = vault.total_liquidity.saturating_sub(required_liquidity);

        // Calculate withdrawal amount
        let withdrawal_amount = (shares as u128)
            .checked_mul(vault.total_liquidity as u128)
            .ok_or(ExoticVaultError::Overflow)?
            .checked_div(vault.total_lp_shares as u128)
            .ok_or(ExoticVaultError::DivisionByZero)? as u64;

        require!(withdrawal_amount <= available_liquidity, ExoticVaultError::WithdrawalExceedsAvailable);
    }

    // Calculate withdrawal amount: amount = shares * total_liquidity / total_shares
    let withdrawal_amount = (shares as u128)
        .checked_mul(vault.total_liquidity as u128)
        .ok_or(ExoticVaultError::Overflow)?
        .checked_div(vault.total_lp_shares as u128)
        .ok_or(ExoticVaultError::DivisionByZero)? as u64;

    require!(withdrawal_amount > 0, ExoticVaultError::InsufficientShares);

    // Transfer collateral from vault to user
    let vault_key = vault.key();
    let seeds = &[
        b"vault_collateral".as_ref(),
        vault_key.as_ref(),
        &[vault.collateral_vault_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    spl_token_transfer_signed(
        &ctx.accounts.token_program,
        &ctx.accounts.vault_collateral,
        &ctx.accounts.user_collateral,
        &ctx.accounts.vault_collateral,
        withdrawal_amount,
        signer_seeds,
    )?;

    // Update LP account
    lp_account.shares = lp_account.shares.checked_sub(shares).ok_or(ExoticVaultError::Overflow)?;
    lp_account.total_withdrawn = lp_account.total_withdrawn.checked_add(withdrawal_amount).ok_or(ExoticVaultError::Overflow)?;
    lp_account.last_interaction = clock.unix_timestamp;

    // Update vault state
    vault.total_lp_shares = vault.total_lp_shares.checked_sub(shares).ok_or(ExoticVaultError::Overflow)?;
    vault.total_liquidity = vault.total_liquidity.checked_sub(withdrawal_amount).ok_or(ExoticVaultError::Overflow)?;

    msg!("LP withdrawal: {} shares for {} collateral", shares, withdrawal_amount);
    msg!("Total vault liquidity: {}", vault.total_liquidity);
    msg!("Total LP shares: {}", vault.total_lp_shares);

    emit!(LiquidityWithdrawn {
        vault: vault.key(),
        provider: ctx.accounts.user.key(),
        shares,
        amount: withdrawal_amount,
    });

    Ok(())
}
