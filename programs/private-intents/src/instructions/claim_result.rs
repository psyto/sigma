use anchor_lang::prelude::*;

/// Claim the result of a successfully executed intent
/// The result position has already been created during execution
/// This instruction just closes the intent account and returns rent
pub fn handler(ctx: Context<crate::ClaimResult>) -> Result<()> {
    let intent = &ctx.accounts.intent;

    msg!(
        "Intent {} claimed, result position: {:?}",
        intent.intent_id,
        intent.result_position
    );

    emit!(crate::IntentClaimed {
        owner: ctx.accounts.owner.key(),
        intent_id: intent.intent_id,
        result_position: intent.result_position.unwrap_or_default(),
    });

    // Intent account will be closed via the `close = owner` constraint
    // Rent will be returned to owner
    Ok(())
}
