use anchor_lang::prelude::*;
use crate::state::subscription::*;
use crate::state::main_state::*;



#[derive(Accounts)]
pub struct CreateSubscription<'info> {
    #[account(init_if_needed, payer = user, space = 10 + 32 + 16 + 16 + 8 + 32,  seeds = [b"subscription", user.key().as_ref(), main_state.key().as_ref()], bump)]
    pub subscription: Account<'info, Subscription>,
    #[account(mut)]
    pub main_state: Account<'info, MainState>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub clock: Sysvar<'info, Clock>,
    
}

#[derive(Accounts)]
pub struct SetSubscriptionDate<'info> {
    #[account(mut, seeds = [b"subscription", user.key().as_ref(), main_state.key().as_ref()], bump)]
    pub subscription: Account<'info, Subscription>,
    #[account(signer)]
    pub authority: Signer<'info>,
    /// CHECK: This is not dangerous because we only use given account to access correct PDA
    pub user: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
    pub main_state: Account<'info, MainState>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct Unsubscribe<'info> {
    #[account(mut, seeds = [b"subscription", user.key().as_ref(), main_state.key().as_ref()], bump)]
    pub subscription: Account<'info, Subscription>,
    #[account(signer)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub main_state: Account<'info, MainState>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct FundSubcription<'info> {
    #[account(mut, seeds = [b"subscription", user.key().as_ref(), main_state.key().as_ref()], bump)]
    pub subscription: Account<'info, Subscription>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
    pub main_state: Account<'info, MainState>,
    pub clock: Sysvar<'info, Clock>,
}

#[derive(Accounts)]
pub struct WithdrawFromSubcription<'info> {
    #[account(mut, seeds = [b"subscription", user.key().as_ref(), main_state.key().as_ref()], bump)]
    pub subscription: Account<'info, Subscription>,
    #[account(signer)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub main_state: Account<'info, MainState>,
    /// CHECK: This is not dangerous because we use given account for seeds purposes
    pub user: AccountInfo<'info>,
    /// CHECK: This is not dangerous because we only deposit to the given account
    pub to_account: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ChangeSubscriptionType<'info> {
    #[account(mut, seeds = [b"subscription", user.key().as_ref(), main_state.key().as_ref()], bump)]
    pub subscription: Account<'info, Subscription>,
    #[account(mut)]
    pub main_state: Account<'info, MainState>,
    pub user: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}


pub mod processor {
    use std::{borrow::{Borrow, BorrowMut}, mem, time::{Instant, SystemTime, UNIX_EPOCH}};

    use anchor_lang::system_program::{self, Transfer};
    use solana_program::native_token::LAMPORTS_PER_SOL;


    use crate::{errors::error::SubscriptionError, instructions::main_state, state::subscription};

    use super::*;

    /**
     * Create a new subcrtiption, meaning initial deposit is made by the user without setting up a subcription date. 
     * This will be done in a separate instruction by the BE
     */
    pub fn create_subscription(ctx: Context<CreateSubscription>, initial_deposit: u64, account_type: SubscriptionType) -> Result<()> {
        let mut subscription = &mut ctx.accounts.subscription;
        let cpi_accounts = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: subscription.to_account_info(),
        };
        let cpi_program = ctx.accounts.system_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        system_program::transfer(cpi_ctx, initial_deposit)?; 
        let main_state = ctx.accounts.main_state.to_account_info().key;
        let user = ctx.accounts.user.key;

        subscription.authority_writable = AuthorityWritable {
            current_account_type: SubscriptionType::FREE,
            valid_till: 0,
        };

        subscription.imutable_initialized = MutableInitialized {
            main_state_pda: *main_state,
            user: *user,
        };

        subscription.subscription_status_writable = CurrentSubscriptionStatistics {
            after_verify_acumulated_sol: initial_deposit,
            after_verify_utc_timestamp: ctx.accounts.clock.unix_timestamp,
            desired_subscription_type: account_type,
        };
        Ok(())
    }

    pub fn change_subscription_type(ctx: Context<ChangeSubscriptionType>, subscription_type: SubscriptionType) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        subscription.authority_writable.current_account_type = subscription_type;
        Ok(())
    }

    /**
     * Setting the subscription date for the user, this can be done only by the BE pubkey (main_state.authority)
     */
    pub fn set_subscription_info(ctx: Context<SetSubscriptionDate>, subscription_date: Option<i64>, acumulated_sol: Option<u64>, subscription_type: Option<SubscriptionType>) -> Result<()> {
        match (&subscription_date, &acumulated_sol, &subscription_type) {
            (None, None, None) => return Ok(()),
            _ => (),
        }
        let subscription = &mut ctx.accounts.subscription;
        // checks if initialized main_state PDA's pubkey is the same as the one passed as account
        if subscription.imutable_initialized.main_state_pda.key() != ctx.accounts.main_state.key() {
            return Err(SubscriptionError::IncorrectMainState.into());
        }
        let authority = &mut ctx.accounts.main_state.authority;
        if authority != ctx.accounts.authority.key {
            return Err(SubscriptionError::InvalidAuthority.into());
        }
        subscription.subscription_status_writable.after_verify_utc_timestamp = ctx.accounts.clock.unix_timestamp;
        subscription.subscription_status_writable.after_verify_acumulated_sol = match acumulated_sol {
            Some(sol) => sol,
            None => 0,
        };
        subscription.authority_writable.valid_till = match subscription_date {
            Some(date) => date,
            None => 0,
        };
        if subscription_type.is_some() {
            subscription.authority_writable.current_account_type = subscription_type.unwrap();
        }
        Ok(())
    }
    /**
     * Resend new SOL to the subscription account
     */
    pub fn fund_subscription(ctx: Context<FundSubcription>, new_deposit: u64) -> Result<()> {
        let subscription = &mut ctx.accounts.subscription;
        subscription.subscription_status_writable.after_verify_acumulated_sol += new_deposit;
        let cpi_accounts = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.subscription.to_account_info(),
        };
        let cpi_program = ctx.accounts.system_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        system_program::transfer(cpi_ctx, new_deposit)?;
        Ok(())
    }
    /**
     * Let the user owner unsubscribe from the subscription and send back the last_payment_size * (Instant::now().elapsed().as_millis() - last_payment_date)/(valid_till - last_payment_date) 
     */
    pub fn unsubscribe(ctx: Context<Unsubscribe>, withdraw_content: bool) -> Result<()> {
        // checks for valid main_state account inserted in the context
        if ctx.accounts.subscription.imutable_initialized.main_state_pda.key() != ctx.accounts.main_state.key() {
            return Err(SubscriptionError::IncorrectMainState.into());
        }
        // check for authority who wants to unsubscribe given user
        if ctx.accounts.subscription.imutable_initialized.user != *ctx.accounts.user.key && ctx.accounts.main_state.authority != *ctx.accounts.user.key {
            return Err(SubscriptionError::InvalidAuthority.into());
        }
        
        let subscription = &mut ctx.accounts.subscription;
        let unix_time = ctx.accounts.clock.unix_timestamp;
        if withdraw_content {
            let current_acumulated_sol = subscription.subscription_status_writable.after_verify_acumulated_sol;
            let partial  =  (LAMPORTS_PER_SOL as u64) * (subscription.authority_writable.valid_till - ctx.accounts.clock.unix_timestamp) as u64 / (subscription.authority_writable.valid_till - subscription.subscription_status_writable.after_verify_utc_timestamp ) as u64;
            let refund_to_user = partial * current_acumulated_sol;
            **subscription.to_account_info().try_borrow_mut_lamports()? -= refund_to_user as u64;
            **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += (refund_to_user as u64 ) * ( (100 - ctx.accounts.main_state.unsubcribe_fee as u64) / 100);
            // then all remaining lamports trnsfer from account to main_state PDA
            let lamports_in_subs_acc = subscription.to_account_info().lamports();
            **subscription.to_account_info().try_borrow_mut_lamports()? -= lamports_in_subs_acc;
            **ctx.accounts.main_state.to_account_info().try_borrow_mut_lamports()? += lamports_in_subs_acc;
        }
        subscription.authority_writable = AuthorityWritable {
            current_account_type: SubscriptionType::FREE,
            valid_till: 0,
        };
        let current_acumulated_sol = subscription.subscription_status_writable.after_verify_acumulated_sol;

        subscription.subscription_status_writable = CurrentSubscriptionStatistics {
            after_verify_acumulated_sol: if withdraw_content { 0 } else { current_acumulated_sol },
            after_verify_utc_timestamp: unix_time,
            desired_subscription_type: SubscriptionType::FREE,
        };
        Ok(())
    }
    /**
     * Authority from main_state can withdraw from the subscription account and send it to any pubkey account
     */
    pub fn withdraw(ctx: Context<WithdrawFromSubcription>, withdrawal_amount: Option<u64>) -> Result<()> {
        if ctx.accounts.main_state.key() != ctx.accounts.subscription.imutable_initialized.main_state_pda.key() {
            return Err(SubscriptionError::IncorrectMainState.into());
        }
        
        let from_pubkey =   ctx.accounts.subscription.to_account_info();
        let to_pubkey = ctx.accounts.to_account.to_account_info();
        
        if withdrawal_amount.is_none() {
            // we are about to withdraw all the funds from the subscription account
            let withdrawal_amount = ctx.accounts.subscription.get_lamports();
            **from_pubkey.try_borrow_mut_lamports()? -= withdrawal_amount;
            **to_pubkey.try_borrow_mut_lamports()? += withdrawal_amount;
            return Ok(());
        }
        

        if **from_pubkey.try_borrow_mut_lamports()? < withdrawal_amount.unwrap_or(0) {
            return Err(SubscriptionError::WithdrawFromSubscription.into());
        }
        **from_pubkey.try_borrow_mut_lamports()? -= withdrawal_amount.unwrap_or(0);
        **to_pubkey.try_borrow_mut_lamports()? += withdrawal_amount.unwrap_or(0);
        Ok(())
    }
}