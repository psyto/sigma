use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use crate::{DepositLiquidity, WithdrawLiquidity, FundingSwapError};

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

/// Deposit liquidity to the pool as an LP
pub fn deposit(ctx: Context<DepositLiquidity>, amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let lp_account = &mut ctx.accounts.lp_account;
    let clock = Clock::get()?;

    // Validate
    require!(amount > 0, FundingSwapError::DepositTooLow);
    require!(pool.is_active, FundingSwapError::PoolInactive);
    require!(!pool.is_paused, FundingSwapError::PoolPaused);

    // Calculate shares to mint
    // If first deposit, shares = amount (1:1)
    // Otherwise, shares = amount * total_shares / total_liquidity
    let shares_to_mint = if pool.total_lp_shares == 0 || pool.total_liquidity == 0 {
        amount
    } else {
        // shares = amount * total_shares / total_liquidity
        (amount as u128)
            .checked_mul(pool.total_lp_shares as u128)
            .ok_or(FundingSwapError::Overflow)?
            .checked_div(pool.total_liquidity as u128)
            .ok_or(FundingSwapError::DivisionByZero)? as u64
    };

    require!(shares_to_mint > 0, FundingSwapError::DepositTooLow);

    // Transfer collateral from user to vault
    spl_token_transfer(
        &ctx.accounts.token_program,
        &ctx.accounts.user_collateral,
        &ctx.accounts.pool_vault,
        &ctx.accounts.user.to_account_info(),
        amount,
    )?;

    // Initialize LP account if first deposit (account created via init_if_needed)
    if lp_account.owner == Pubkey::default() {
        lp_account.owner = ctx.accounts.user.key();
        lp_account.pool = pool.key();
        lp_account.deposited_at = clock.unix_timestamp;
        lp_account.fees_claimed = 0;
        lp_account.total_deposited = 0;
        lp_account.total_withdrawn = 0;
        lp_account.bump = ctx.bumps.lp_account;
    }

    // Update LP account
    lp_account.shares = lp_account.shares.checked_add(shares_to_mint).ok_or(FundingSwapError::Overflow)?;
    lp_account.total_deposited = lp_account.total_deposited.checked_add(amount).ok_or(FundingSwapError::Overflow)?;
    lp_account.last_interaction = clock.unix_timestamp;

    // Update pool state
    pool.total_lp_shares = pool.total_lp_shares.checked_add(shares_to_mint).ok_or(FundingSwapError::Overflow)?;
    pool.total_liquidity = pool.total_liquidity.checked_add(amount).ok_or(FundingSwapError::Overflow)?;

    msg!("LP deposit: {} collateral for {} shares", amount, shares_to_mint);
    msg!("Total pool liquidity: {}", pool.total_liquidity);
    msg!("Total LP shares: {}", pool.total_lp_shares);

    Ok(())
}

/// Withdraw liquidity from the pool
pub fn withdraw(ctx: Context<WithdrawLiquidity>, shares: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let lp_account = &mut ctx.accounts.lp_account;
    let clock = Clock::get()?;

    // Validate
    require!(shares > 0, FundingSwapError::InsufficientShares);
    require!(lp_account.shares >= shares, FundingSwapError::InsufficientShares);

    // Check if pool has active swaps - if so, limit withdrawals
    // to protect against under-collateralization
    if pool.active_swaps > 0 {
        // Calculate maximum net exposure
        let net_exposure = pool.get_net_exposure().unsigned_abs();
        let required_liquidity = net_exposure / 2; // Simplified: 50% of max exposure

        let available_liquidity = pool.total_liquidity.saturating_sub(required_liquidity as u64);

        // Calculate withdrawal amount
        let withdrawal_amount = (shares as u128)
            .checked_mul(pool.total_liquidity as u128)
            .ok_or(FundingSwapError::Overflow)?
            .checked_div(pool.total_lp_shares as u128)
            .ok_or(FundingSwapError::DivisionByZero)? as u64;

        require!(withdrawal_amount <= available_liquidity, FundingSwapError::WithdrawalExceedsAvailable);
    }

    // Calculate withdrawal amount: amount = shares * total_liquidity / total_shares
    let withdrawal_amount = (shares as u128)
        .checked_mul(pool.total_liquidity as u128)
        .ok_or(FundingSwapError::Overflow)?
        .checked_div(pool.total_lp_shares as u128)
        .ok_or(FundingSwapError::DivisionByZero)? as u64;

    require!(withdrawal_amount > 0, FundingSwapError::InsufficientShares);

    // Transfer collateral from vault to user
    let pool_key = pool.key();
    let seeds = &[
        b"pool_vault".as_ref(),
        pool_key.as_ref(),
        &[pool.vault_bump],
    ];
    let signer_seeds = &[&seeds[..]];

    spl_token_transfer_signed(
        &ctx.accounts.token_program,
        &ctx.accounts.pool_vault,
        &ctx.accounts.user_collateral,
        &ctx.accounts.pool_vault,
        withdrawal_amount,
        signer_seeds,
    )?;

    // Update LP account
    lp_account.shares = lp_account.shares.checked_sub(shares).ok_or(FundingSwapError::Overflow)?;
    lp_account.total_withdrawn = lp_account.total_withdrawn.checked_add(withdrawal_amount).ok_or(FundingSwapError::Overflow)?;
    lp_account.last_interaction = clock.unix_timestamp;

    // Update pool state
    pool.total_lp_shares = pool.total_lp_shares.checked_sub(shares).ok_or(FundingSwapError::Overflow)?;
    pool.total_liquidity = pool.total_liquidity.checked_sub(withdrawal_amount).ok_or(FundingSwapError::Overflow)?;

    msg!("LP withdrawal: {} shares for {} collateral", shares, withdrawal_amount);
    msg!("Total pool liquidity: {}", pool.total_liquidity);
    msg!("Total LP shares: {}", pool.total_lp_shares);

    Ok(())
}
