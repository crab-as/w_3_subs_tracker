use anchor_lang::prelude::*;

#[error_code]
pub enum MainStateError {
    #[msg("MainState is already initialized")]
    MainStateAlreadyInitialized,
}

#[error_code]
pub enum SubscriptionError {
    #[msg("Initial deposit must be greater than 0")]
    InvalidInitialDeposit,
    #[msg("Authority is invalid")]
    InvalidAuthority,
    #[msg("Owner is invalid")]
    InvalidOwner,
    #[msg("Subscription date must be greater than 0")]
    InvalidSubscriptionDate,
    #[msg("Not enough credits for subscription")]
    NotEnoughCredits,
    #[msg("Not possible to withdraw given amount from subscription ... insufficient balance")]
    WithdrawFromSubscription,
    #[msg("Incorrect main state")]
    IncorrectMainState,
    #[msg("Airthemtic error")]
    AirthemticError,
    #[msg("Obligatory account is not found in the context")]
    MissingObligatoryAccount,
}