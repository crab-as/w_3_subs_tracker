
use std::{borrow::BorrowMut, ops::Sub};

use anchor_lang::{prelude::*, system_program::{self, Transfer}};
use solana_program::native_token::LAMPORTS_PER_SOL;

use crate::{CreateSubscription, Unsubscribe};

#[account]
pub struct Subscription {
    pub imutable_initialized: MutableInitialized,
    pub subscription_status_writable: CurrentSubscriptionStatistics,
    pub authority_writable: AuthorityWritable,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum SubscriptionType {
    FREE,
    BASIC,
    PREMIUM,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct CurrentSubscriptionStatistics {
    pub after_verify_credit_lamports: u64,
    pub after_verify_utc_timestamp: i64,
    pub desired_subscription_type: SubscriptionType,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct AuthorityWritable {
    pub current_account_type: SubscriptionType,
    pub valid_till: i64,
    pub used_lamports: u64
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct MutableInitialized {
    pub main_state_pda: Pubkey,
    pub user: Pubkey,
}