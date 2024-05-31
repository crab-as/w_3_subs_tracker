use anchor_lang::prelude::*;
use crate::state::subscription::*;
use crate::state::main_state::*;



#[derive(Accounts)]
pub struct CreateSubscription<'info> {
    #[account(init, payer = user, space = 10 + 32 + 16 + 16 + 8 + 32,  seeds = [b"subscription", user.key().as_ref(), main_state.key().as_ref()], bump)]
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
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub to_account: Option<SystemAccount<'info>>,
    /// CHECK: This is not dangerous, we are using main_state_owner as creditor for refund after user refund
    pub main_state_owner: AccountInfo<'info>,
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
    pub clock: Sysvar<'info, Clock>,
    /// CHECK: This is not dangerous because we use given account for seeds purposes
    pub user: AccountInfo<'info>,
    /// CHECK: This is not dangerous because we only deposit to the given account
    #[account(mut)]
    pub to_account: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ChangeSubscriptionType<'info> {
    #[account(mut, seeds = [b"subscription", user.key().as_ref(), main_state.key().as_ref()], bump)]
    pub subscription: Account<'info, Subscription>,
    #[account(mut)]
    pub main_state: Account<'info, MainState>,
    #[account(signer)]
    pub user: SystemAccount<'info>,
    pub system_program: Program<'info, System>,
}


pub mod processor {
    

    use anchor_lang::system_program::{self, Transfer};
    use solana_program::native_token::LAMPORTS_PER_SOL;


    use crate::{errors::error::SubscriptionError};

    use super::*;

    /**
     * Create a new subcrtiption, meaning initial deposit is made by the user without setting up a subcription date. 
     * This will be done in a separate instruction by the BE
     */
    pub fn create_subscription(ctx: Context<CreateSubscription>, initial_deposit: u64, account_type: SubscriptionType) -> Result<()> {
        msg!("Params: {:?}, {:?}", initial_deposit, account_type);
        let subscription = &mut ctx.accounts.subscription;
        if initial_deposit == 0 {
            return Err(SubscriptionError::InvalidInitialDeposit.into());
        }
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
            used_lamports: 0,
        };

        subscription.imutable_initialized = MutableInitialized {
            main_state_pda: *main_state,
            user: *user,
        };

        subscription.subscription_status_writable = CurrentSubscriptionStatistics {
            after_verify_credit_lamports: initial_deposit,
            after_verify_utc_timestamp: ctx.accounts.clock.unix_timestamp * 1000,
            desired_subscription_type: account_type,
        };
        Ok(())
    }

    /**
     * Setting desired subscription type for the user he wants to have.
     * Mainly applicable for the user who wants to change the subscription type for already existing subscription.
     */
    pub fn change_desired_subscription_type(ctx: Context<ChangeSubscriptionType>, new_subscription_type: SubscriptionType) -> Result<()> {
        msg!("Params: {:?}", new_subscription_type);
        let subscription = &mut ctx.accounts.subscription;
        if subscription.imutable_initialized.main_state_pda.key() != ctx.accounts.main_state.key() {
            return Err(SubscriptionError::IncorrectMainState.into());
        }
        if &subscription.imutable_initialized.user.key() != ctx.accounts.user.key {
            return Err(SubscriptionError::InvalidAuthority.into());
        }

        subscription.subscription_status_writable.desired_subscription_type = new_subscription_type;
        Ok(())
    }

    /**
     * Setting the subscription date for the user, this can be done only by the BE pubkey (main_state.authority)
     */
    pub fn set_subscription_info(ctx: Context<SetSubscriptionDate>, subscription_date: Option<i64>, used_lamports: Option<u64>, subscription_type: Option<SubscriptionType>) -> Result<()> {
        msg!("Params: {:?}, {:?}, {:?}", subscription_date, used_lamports, subscription_type);
        match (&subscription_date, &used_lamports, &subscription_type) {
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
        subscription.subscription_status_writable.after_verify_utc_timestamp = ctx.accounts.clock.unix_timestamp * 1000;
        // subscription.subscription_status_writable.after_verify_credit_lamports = 
        match used_lamports {
            Some(lamports) => {
                if subscription.subscription_status_writable.after_verify_credit_lamports < lamports {
                    return Err(SubscriptionError::NotEnoughCredits.into());
                }
                subscription.subscription_status_writable.after_verify_credit_lamports -= lamports;
                subscription.authority_writable.used_lamports = lamports;
            },
            None => (),
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
    pub fn fund_subscription(ctx: Context<FundSubcription>, new_deposit_lamports: u64) -> Result<()> {
        msg!("Params: {:?}", new_deposit_lamports);
        let subscription = &mut ctx.accounts.subscription;
        subscription.subscription_status_writable.after_verify_credit_lamports += new_deposit_lamports;
        let cpi_accounts = Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.subscription.to_account_info(),
        };
        let cpi_program = ctx.accounts.system_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        system_program::transfer(cpi_ctx, new_deposit_lamports)?;
        Ok(())
    }
    /**
     * Let the user owner unsubscribe from the subscription account.
     * Applicable if user wants to end whole subscription and gets its lamports or if he wants to change the subscription type.
     */
    pub fn unsubscribe(ctx: Context<Unsubscribe>, withdraw_content: bool) -> Result<()> {
        msg!("Params: {:?}", withdraw_content);
        // checks for valid main_state account inserted in the context
        if ctx.accounts.subscription.imutable_initialized.main_state_pda.key() != ctx.accounts.main_state.key() {
            return Err(SubscriptionError::IncorrectMainState.into());
        }
        // check if the given owner of main state is the same as the one passed in the context
        if ctx.accounts.main_state_owner.key() != ctx.accounts.main_state.owner.key() {
            return Err(SubscriptionError::InvalidOwner.into());
        }
        // check for authority who wants to unsubscribe given user
        if ctx.accounts.subscription.imutable_initialized.user != *ctx.accounts.user.key && ctx.accounts.main_state.authority != *ctx.accounts.user.key {
            return Err(SubscriptionError::InvalidAuthority.into());
        }


        
        let subscription = &mut ctx.accounts.subscription;
        let lamports_in_subs_acc = (subscription.to_account_info().lamports() as f32) as u64;
        msg!("SOL in PDA: {:?}", lamports_in_subs_acc as f32 / LAMPORTS_PER_SOL as f32);
        
        let unix_time = ctx.accounts.clock.unix_timestamp * 1000;
        let nominator = (subscription.authority_writable.valid_till - unix_time) as f32;
        let denominator = (subscription.authority_writable.valid_till - subscription.subscription_status_writable.after_verify_utc_timestamp) as f32;
        let partial  =  if nominator / denominator < 0.0 { 0.0 } else { nominator / denominator };  
        
        let current_used_lamports = subscription.authority_writable.used_lamports;
        let lamports_as_credits = subscription.subscription_status_writable.after_verify_credit_lamports;
        let fees = (100.0 - ctx.accounts.main_state.unsubcribe_fee as f32) / 100.0;
        
        if withdraw_content {
            if ctx.accounts.to_account.is_none() {
                return Err(SubscriptionError::MissingObligatoryAccount.into());
            }
            let to_pubkey = ctx.accounts.to_account.as_ref().unwrap().to_account_info();
            let refund_to_user = ( partial *  fees  * current_used_lamports as f32 + lamports_as_credits as f32) as u64;
            **subscription.to_account_info().try_borrow_mut_lamports()? -= refund_to_user as u64;
            **to_pubkey.try_borrow_mut_lamports()? += refund_to_user;
            // then all remaining lamports trnsfer from account to main_state PDA
            let lamports_in_subs_acc = (subscription.to_account_info().lamports() - Rent::get()?.minimum_balance(subscription.to_account_info().data_len())) as u64;
            msg!("This is problematic line with given lamports for with: {:?}", lamports_in_subs_acc);
            **subscription.to_account_info().try_borrow_mut_lamports()? -= lamports_in_subs_acc;
            **ctx.accounts.main_state_owner.to_account_info().try_borrow_mut_lamports()? += lamports_in_subs_acc;
        }
        msg!("partial: {:?}, fees: {:?}, current_used: {:?}, credits: {:?}", partial, fees, current_used_lamports as f32 / LAMPORTS_PER_SOL as f32, lamports_as_credits as f32/ LAMPORTS_PER_SOL as f32);
        msg!("{:?}", (current_used_lamports as f32 * partial * fees / 2.0) as u64 + lamports_as_credits);
        subscription.authority_writable = AuthorityWritable {
            current_account_type: SubscriptionType::FREE,
            valid_till: 0,
            used_lamports: 0,
        };
        subscription.subscription_status_writable = CurrentSubscriptionStatistics {
            after_verify_credit_lamports: if withdraw_content { 0 } else { (current_used_lamports as f32 * partial * (fees + (1.0 - fees) / 2.0  ) ) as u64 + lamports_as_credits },
            after_verify_utc_timestamp: unix_time,
            desired_subscription_type: SubscriptionType::FREE,
        };
        Ok(())
    }
    /**
     * Authority from main_state PDA is allowed to withdraw funds from the subscription account.
     * He can either enter the amount he wants to withdraw or withdraw all the funds from the account.
     * In both cases he can withdraw only the funds that have been used for subscription.
     * Meaning: TOTAL_PDA_LAMPORTS - RENT_EXEMPT_BALANCE - CREDITS_LAMPORTS - IF(VALID_TILL > NOW) {USED_LAMPORTS} ELSE {0}
     */
    pub fn withdraw(ctx: Context<WithdrawFromSubcription>, withdrawal_amount: Option<u64>) -> Result<()> {
        msg!("Params: {:?}", withdrawal_amount);
        if ctx.accounts.main_state.key() != ctx.accounts.subscription.imutable_initialized.main_state_pda.key() {
            return Err(SubscriptionError::IncorrectMainState.into());
        }
        let authority = &mut ctx.accounts.main_state.authority;
        if authority != ctx.accounts.authority.key {
            return Err(SubscriptionError::InvalidAuthority.into());
        }
        let subscription = &mut ctx.accounts.subscription;
        let from_pubkey =   subscription.to_account_info();
        let rent_exempt_balance = Rent::get()?.minimum_balance(from_pubkey.data_len());
        let to_pubkey = ctx.accounts.to_account.to_account_info();
        let account_balance = from_pubkey.lamports();
        let max_allowed_to_withdraw = account_balance 
            - rent_exempt_balance 
            - subscription.subscription_status_writable.after_verify_credit_lamports 
            -  if subscription.authority_writable.valid_till > ctx.accounts.clock.unix_timestamp * 1000 { subscription.authority_writable.used_lamports } else { 0 };
        msg!("Max allowed to withdraw: {:?}", max_allowed_to_withdraw as f32 / LAMPORTS_PER_SOL as f32);
        
        if withdrawal_amount.is_none() {
            // we are about to withdraw all the funds from the subscription account we can
            **from_pubkey.try_borrow_mut_lamports()? -= max_allowed_to_withdraw;
            **to_pubkey.try_borrow_mut_lamports()? += max_allowed_to_withdraw;
            return Ok(());
        }

        if withdrawal_amount.unwrap() > max_allowed_to_withdraw {
            return Err(SubscriptionError::WithdrawFromSubscription.into());
        }        
        **from_pubkey.try_borrow_mut_lamports()? -= withdrawal_amount.unwrap_or(0);
        **to_pubkey.try_borrow_mut_lamports()? += withdrawal_amount.unwrap_or(0);
        Ok(())
    }
}