use anchor_lang::prelude::*;

#[account]
pub struct MainState {
    pub owner: Pubkey,
    pub authority: Pubkey,
    pub unsubcribe_fee: u8,
}