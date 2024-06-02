use anchor_lang::prelude::*;

#[account]
pub struct MainState {
    pub owner: Pubkey,
    pub authority: Pubkey,
    pub unsubscribe_fee: u8,
}