use anchor_lang::prelude::*;
use crate::state::main_state::MainState;


#[derive(Accounts)]
pub struct UpdateOwner<'info> {
    #[account(mut)]
    pub main_state: Account<'info, MainState>,
    #[account(signer)]
    pub signer: Signer<'info>,
}

#[derive(Accounts)]
pub struct InitializeMainState<'info> {
    #[account(init, payer = user, space = 8 + 64 + 1, seeds=["mainState".as_bytes()], bump)]
    pub main_state: Account<'info, MainState>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(mut)]
    pub main_state: Account<'info, MainState>,
    #[account(signer)]
    pub signer: Signer<'info>,

}

#[derive(Accounts)]
pub struct UpdateFees<'info> {
    #[account(mut)]
    pub main_state: Account<'info, MainState>,
    #[account(signer)]
    pub signer: Signer<'info>,
}

pub mod processor {
    use crate::errors::error::MainStateError;

    use super::*;
    pub fn intialize_main_state(ctx: Context<InitializeMainState>, fees: u8) -> Result<()> {
        let main_state = &mut ctx.accounts.main_state;
        main_state.owner = *ctx.accounts.user.key;
        main_state.authority = *ctx.accounts.user.key;
        main_state.unsubcribe_fee = fees;
        Ok(())
    }

    pub fn update_authority(ctx: Context<UpdateAuthority>, new_authority: Pubkey) -> Result<()> {
        let main_state = &mut ctx.accounts.main_state;
        if main_state.owner != *ctx.accounts.signer.key {
            return Err(ErrorCode::ConstraintAddress.into());
        }
        main_state.authority = new_authority;
        Ok(())
    }

    pub fn update_owner(ctx: Context<UpdateOwner>, new_owner: Pubkey) -> Result<()> {
        let main_state = &mut ctx.accounts.main_state;
        if main_state.owner != *ctx.accounts.signer.key {
            return Err(ErrorCode::ConstraintAddress.into());
        }
        main_state.owner = new_owner;
        Ok(())
    }

    pub fn update_fees(ctx: Context<UpdateFees>, new_fees: u8) -> Result<()> {
        let main_state = &mut ctx.accounts.main_state;
        if main_state.owner != *ctx.accounts.signer.key {
            return Err(ErrorCode::ConstraintAddress.into());
        }
        main_state.unsubcribe_fee = new_fees;
        Ok(())
    }
}