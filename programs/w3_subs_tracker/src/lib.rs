use anchor_lang::prelude::*;
mod instructions;
mod state;
use instructions::main_state::*;
use state::main_state::*;





declare_id!("CxJuewnmqF95YuzTHCDfwDbms4RebiYqFCpUTQ64avgn");



#[program]
mod w_3_subs_tracker {
    use self::instructions::main_state;

    use super::*;

    pub fn intialize_main_state(ctx: Context<InitializeMainState>) -> Result<()> {
        main_state::processor::intialize_main_state(ctx)
    }

    pub fn update_authority(ctx: Context<UpdateAuthority>, new_authority: Pubkey) -> Result<()> {
        main_state::processor::update_authority(ctx, new_authority)
    }

    pub fn update_owner(ctx: Context<UpdateOwner>, new_owner: Pubkey) -> Result<()> {
        main_state::processor::update_owner(ctx, new_owner)
    }

    

   
}










