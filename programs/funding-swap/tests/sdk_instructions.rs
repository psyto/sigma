//! The SDK (sdk/src/__tests__/funding-swap-ix.test.ts) pins these instruction
//! discriminators; check the program generates the same bytes.
use anchor_lang::Discriminator;
use funding_swap::instruction::{InitializePool, OpenPayer, OpenReceiver, ProcessFundingPeriod};

#[test]
fn discriminators_match_the_sdk() {
    assert_eq!(InitializePool::DISCRIMINATOR, &[0x5f, 0xb4, 0x0a, 0xac, 0x54, 0xae, 0xe8, 0x28]);
    assert_eq!(OpenReceiver::DISCRIMINATOR, &[0xca, 0x85, 0x3f, 0x48, 0xd2, 0x9c, 0xcf, 0xb7]);
    assert_eq!(OpenPayer::DISCRIMINATOR, &[0x77, 0xf5, 0xd0, 0x59, 0x8c, 0xe5, 0xd1, 0xd1]);
    assert_eq!(ProcessFundingPeriod::DISCRIMINATOR, &[0x92, 0xcc, 0x49, 0x9d, 0x42, 0xc0, 0x40, 0x5a]);
}
