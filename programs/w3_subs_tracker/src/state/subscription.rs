
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

impl Subscription {
   
    /**
     * Unsubcribes user from the subscription account. Meaning all properties are set to default values so the authority can check for potential validation
     */
    pub fn unsubscribe(&mut self,unix_time: i64, withdraw_content: bool) -> Result<()> {
        self.authority_writable = AuthorityWritable {
            current_account_type: SubscriptionType::FREE,
            valid_till: 0,
        };
        let current_acumulated_sol = self.subscription_status_writable.after_verify_acumulated_sol;

        self.subscription_status_writable = CurrentSubscriptionStatistics {
            after_verify_acumulated_sol: if withdraw_content { 0 } else { current_acumulated_sol },
            after_verify_utc_timestamp: unix_time,
            desired_subscription_type: SubscriptionType::FREE,
        };
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum SubscriptionType {
    FREE,
    BASIC,
    ADMIN,
}
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct CurrentSubscriptionStatistics {
    pub after_verify_acumulated_sol: u64,
    pub after_verify_utc_timestamp: i64,
    pub desired_subscription_type: SubscriptionType,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct AuthorityWritable {
    pub current_account_type: SubscriptionType,
    pub valid_till: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub struct MutableInitialized {
    pub main_state_pda: Pubkey,
    pub user: Pubkey,
}