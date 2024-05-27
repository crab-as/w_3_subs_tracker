use anchor_lang::prelude::*;

#[error_code]
pub enum SubscriptionError {
    #[msg("Initial deposit must be greater than 0")]
    InvalidInitialDeposit,
    #[msg("Authority is invalid")]
    InvalidAuthority,
    #[msg("Subscription date must be greater than 0")]
    InvalidSubscriptionDate,
    #[msg("Not possible to withdraw given amount from subscription ... insufficient balance")]
    WithdrawFromSubscription,
    #[msg("Incorrect main state")]
    IncorrectMainState,
}