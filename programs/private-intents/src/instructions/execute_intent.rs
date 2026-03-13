use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};
use crate::state::{IntentStatus, IntentType};
use crate::error::PrivateIntentError;

/// Execute a private intent
///
/// The solver decrypts the payload off-chain and provides the decrypted parameters
/// for on-chain validation and execution. This instruction:
/// 1. Validates the intent is executable and deadline hasn't passed
/// 2. Transfers collateral from the intent vault to the solver
/// 3. Dispatches CPI to the target derivative program (VolSwap/FundingSwap/ExoticVault)
/// 4. Records the resulting position and updates solver stats
///
/// The solver must pass target program accounts via remaining_accounts in the correct order:
///
/// For VarianceSwap (remaining_accounts):
///   [0] target_program (volswap program)
///   [1] pool (mut)
///   [2] position (mut, to be initialized)
///   [3] pool_vault (mut)
///   [4] token_program
///   [5] system_program
///
/// For FundingSwap (remaining_accounts):
///   [0] target_program (funding-swap program)
///   [1] pool (mut)
///   [2] swap (mut, to be initialized)
///   [3] pool_vault (mut)
///   [4] token_program
///   [5] system_program
///
/// For ExoticOption (remaining_accounts):
///   [0] target_program (exotic-vault program)
///   [1] vault (mut)
///   [2] option (mut, to be initialized)
///   [3] vault_collateral (mut)
///   [4] token_program
///   [5] system_program
///   [6] sample_buffer (mut, for Asian options only)
pub fn handler<'info>(
    ctx: Context<'_, '_, 'info, 'info, crate::ExecuteIntent<'info>>,
    // Decrypted parameters for validation
    deadline: i64,
    slippage_bps: u16,
    // Execution results
    result_position: Pubkey,
    // Pre-built CPI instruction data (Anchor discriminator + serialized args)
    // constructed by the solver off-chain for the target program
    cpi_data: Vec<u8>,
) -> Result<()> {
    let clock = Clock::get()?;

    // Verify deadline hasn't passed
    require!(clock.unix_timestamp <= deadline, PrivateIntentError::IntentExpired);

    // Validate CPI data contains at least the 8-byte Anchor discriminator
    require!(
        cpi_data.len() >= 8,
        PrivateIntentError::InvalidRemainingAccounts
    );

    // Cap slippage to 50% (5000 bps) to prevent abuse
    require!(slippage_bps <= 5000, PrivateIntentError::SlippageExceeded);

    // Mark intent as executing BEFORE any CPI calls (reentrancy protection)
    let intent = &mut ctx.accounts.intent;
    intent.status = IntentStatus::Executing;

    // Store values needed for PDA signer seeds before further operations
    let owner_key = intent.owner;
    let intent_id_bytes = intent.intent_id.to_le_bytes();
    let bump = intent.bump;
    let collateral_amount = intent.collateral_amount;
    let intent_type = intent.intent_type;

    // Transfer collateral from intent vault to solver
    let signer_seeds: &[&[&[u8]]] = &[&[
        crate::state::EncryptedIntent::SEED,
        owner_key.as_ref(),
        &intent_id_bytes,
        &[bump],
    ]];

    let transfer_ctx = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        Transfer {
            from: ctx.accounts.intent_vault.to_account_info(),
            to: ctx.accounts.solver_collateral.to_account_info(),
            authority: ctx.accounts.intent.to_account_info(),
        },
        signer_seeds,
    );

    token::transfer(transfer_ctx, collateral_amount)?;

    msg!(
        "Collateral transferred: {} tokens from intent vault to solver",
        collateral_amount
    );

    // Snapshot solver's token balance before CPI to measure actual cost
    ctx.accounts.solver_collateral.reload()?;
    let balance_before = ctx.accounts.solver_collateral.amount;

    // Dispatch CPI to the target derivative program based on intent type
    let remaining = &ctx.remaining_accounts;
    if !remaining.is_empty() {
        match intent_type {
            IntentType::VarianceSwap => {
                require!(remaining.len() >= 6, PrivateIntentError::InvalidRemainingAccounts);
                dispatch_variance_swap_cpi(
                    remaining,
                    &ctx.accounts.solver,
                    &ctx.accounts.solver_collateral,
                    &ctx.accounts.collateral_mint,
                    collateral_amount,
                    &cpi_data,
                )?;
            }
            IntentType::FundingSwap => {
                require!(remaining.len() >= 6, PrivateIntentError::InvalidRemainingAccounts);
                dispatch_funding_swap_cpi(
                    remaining,
                    &ctx.accounts.solver,
                    &ctx.accounts.solver_collateral,
                    &ctx.accounts.collateral_mint,
                    collateral_amount,
                    &cpi_data,
                )?;
            }
            IntentType::ExoticOption => {
                require!(remaining.len() >= 6, PrivateIntentError::InvalidRemainingAccounts);
                dispatch_exotic_option_cpi(
                    remaining,
                    &ctx.accounts.solver,
                    &ctx.accounts.solver_collateral,
                    &ctx.accounts.collateral_mint,
                    collateral_amount,
                    &cpi_data,
                )?;
            }
        }

        // Reload balance after CPI to check actual tokens consumed
        ctx.accounts.solver_collateral.reload()?;
        let balance_after = ctx.accounts.solver_collateral.amount;
        let tokens_spent = balance_before.saturating_sub(balance_after);

        // Enforce slippage: tokens spent must not exceed collateral * (1 + slippage%)
        // This protects users from the solver executing at unfavorable prices
        let max_allowed = (collateral_amount as u128)
            .checked_mul(10000u128 + slippage_bps as u128)
            .ok_or(PrivateIntentError::ArithmeticOverflow)?
            / 10000u128;

        require!(
            (tokens_spent as u128) <= max_allowed,
            PrivateIntentError::SlippageExceeded
        );

        msg!(
            "Slippage check passed: spent {} / max {} ({}bps tolerance)",
            tokens_spent,
            max_allowed,
            slippage_bps
        );
    }

    // Update intent state
    let intent = &mut ctx.accounts.intent;
    intent.status = IntentStatus::Completed;
    intent.executed_at = clock.unix_timestamp;
    intent.executed_by = Some(ctx.accounts.solver.key());
    intent.result_position = Some(result_position);

    // Update solver stats
    let solver_config = &mut ctx.accounts.solver_config;
    solver_config.total_intents = solver_config.total_intents.checked_add(1)
        .ok_or(PrivateIntentError::ArithmeticOverflow)?;
    solver_config.total_volume = solver_config.total_volume
        .checked_add(collateral_amount as u128)
        .ok_or(PrivateIntentError::ArithmeticOverflow)?;

    msg!(
        "Intent {} executed by solver, result position: {}",
        intent.intent_id,
        result_position
    );

    emit!(crate::IntentExecuted {
        intent_id: intent.intent_id,
        solver: ctx.accounts.solver.key(),
        result_position,
        collateral_amount,
    });

    Ok(())
}

/// Dispatch CPI to VolSwap program to open a variance position.
/// The solver opens the position using its own collateral (received from intent vault).
fn dispatch_variance_swap_cpi<'info>(
    remaining: &[AccountInfo<'info>],
    solver: &Signer<'info>,
    solver_collateral: &Account<'info, anchor_spl::token::TokenAccount>,
    collateral_mint: &Account<'info, anchor_spl::token::Mint>,
    notional: u64,
    cpi_data: &[u8],
) -> Result<()> {
    let volswap_program = &remaining[0];
    let pool = &remaining[1];
    let position = &remaining[2];
    let pool_vault = &remaining[3];
    let token_program = &remaining[4];
    let system_program = &remaining[5];

    // Validate the target program ID matches VolSwap
    let expected_volswap = volswap::ID;
    require!(
        volswap_program.key() == expected_volswap,
        PrivateIntentError::InvalidTargetPool
    );

    // Build CPI: solver opens position as the user
    // The solver acts as both signer and position owner
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: expected_volswap,
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(solver.key(), true),
            anchor_lang::solana_program::instruction::AccountMeta::new(pool.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new(position.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new(solver_collateral.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new(pool_vault.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(collateral_mint.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(token_program.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(system_program.key(), false),
        ],
        // Solver-provided instruction data containing Anchor discriminator + serialized args
        data: cpi_data.to_vec(),
    };

    msg!(
        "VolSwap CPI dispatched: pool={}, notional={}, solver={}",
        pool.key(),
        notional,
        solver.key()
    );

    // Invoke the VolSwap program
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            solver.to_account_info(),
            pool.clone(),
            position.clone(),
            solver_collateral.to_account_info(),
            pool_vault.clone(),
            collateral_mint.to_account_info(),
            token_program.clone(),
            system_program.clone(),
        ],
    ).map_err(|_| error!(PrivateIntentError::CpiExecutionFailed))?;

    Ok(())
}

/// Dispatch CPI to FundingSwap program to open a funding swap position.
fn dispatch_funding_swap_cpi<'info>(
    remaining: &[AccountInfo<'info>],
    solver: &Signer<'info>,
    solver_collateral: &Account<'info, anchor_spl::token::TokenAccount>,
    collateral_mint: &Account<'info, anchor_spl::token::Mint>,
    notional: u64,
    cpi_data: &[u8],
) -> Result<()> {
    let funding_program = &remaining[0];
    let pool = &remaining[1];
    let swap = &remaining[2];
    let pool_vault = &remaining[3];
    let token_program = &remaining[4];
    let system_program = &remaining[5];

    let expected_funding = funding_swap::ID;
    require!(
        funding_program.key() == expected_funding,
        PrivateIntentError::InvalidTargetPool
    );

    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: expected_funding,
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new(solver.key(), true),
            anchor_lang::solana_program::instruction::AccountMeta::new(pool.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new(swap.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new(solver_collateral.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new(pool_vault.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(collateral_mint.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(token_program.key(), false),
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(system_program.key(), false),
        ],
        // Solver-provided instruction data containing Anchor discriminator + serialized args
        data: cpi_data.to_vec(),
    };

    msg!(
        "FundingSwap CPI dispatched: pool={}, notional={}, solver={}",
        pool.key(),
        notional,
        solver.key()
    );

    anchor_lang::solana_program::program::invoke(
        &ix,
        &[
            solver.to_account_info(),
            pool.clone(),
            swap.clone(),
            solver_collateral.to_account_info(),
            pool_vault.clone(),
            collateral_mint.to_account_info(),
            token_program.clone(),
            system_program.clone(),
        ],
    ).map_err(|_| error!(PrivateIntentError::CpiExecutionFailed))?;

    Ok(())
}

/// Dispatch CPI to ExoticVault program to buy an exotic option.
fn dispatch_exotic_option_cpi<'info>(
    remaining: &[AccountInfo<'info>],
    solver: &Signer<'info>,
    solver_collateral: &Account<'info, anchor_spl::token::TokenAccount>,
    collateral_mint: &Account<'info, anchor_spl::token::Mint>,
    notional: u64,
    cpi_data: &[u8],
) -> Result<()> {
    let exotic_program = &remaining[0];
    let vault = &remaining[1];
    let option = &remaining[2];
    let vault_collateral = &remaining[3];
    let token_program = &remaining[4];
    let system_program = &remaining[5];

    let expected_exotic = exotic_vault::ID;
    require!(
        exotic_program.key() == expected_exotic,
        PrivateIntentError::InvalidTargetPool
    );

    let mut account_metas = vec![
        anchor_lang::solana_program::instruction::AccountMeta::new(solver.key(), true),
        anchor_lang::solana_program::instruction::AccountMeta::new(vault.key(), false),
        anchor_lang::solana_program::instruction::AccountMeta::new(option.key(), false),
        anchor_lang::solana_program::instruction::AccountMeta::new(solver_collateral.key(), false),
        anchor_lang::solana_program::instruction::AccountMeta::new(vault_collateral.key(), false),
        anchor_lang::solana_program::instruction::AccountMeta::new_readonly(collateral_mint.key(), false),
        anchor_lang::solana_program::instruction::AccountMeta::new_readonly(token_program.key(), false),
        anchor_lang::solana_program::instruction::AccountMeta::new_readonly(system_program.key(), false),
    ];

    let mut invoke_accounts = vec![
        solver.to_account_info(),
        vault.clone(),
        option.clone(),
        solver_collateral.to_account_info(),
        vault_collateral.clone(),
        collateral_mint.to_account_info(),
        token_program.clone(),
        system_program.clone(),
    ];

    // For Asian options, a sample_buffer account is also required
    if remaining.len() > 6 {
        let sample_buffer = &remaining[6];
        account_metas.push(
            anchor_lang::solana_program::instruction::AccountMeta::new(sample_buffer.key(), false),
        );
        invoke_accounts.push(sample_buffer.clone());
    }

    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: expected_exotic,
        accounts: account_metas,
        // Solver-provided instruction data containing Anchor discriminator + serialized args
        data: cpi_data.to_vec(),
    };

    msg!(
        "ExoticVault CPI dispatched: vault={}, notional={}, solver={}",
        vault.key(),
        notional,
        solver.key()
    );

    anchor_lang::solana_program::program::invoke(
        &ix,
        &invoke_accounts,
    ).map_err(|_| error!(PrivateIntentError::CpiExecutionFailed))?;

    Ok(())
}
