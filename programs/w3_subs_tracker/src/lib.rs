use anchor_lang::prelude::*;
mod instructions;
mod state;
mod errors;
use instructions::main_state::*;
use instructions::subscription::*;
use state::subscription::*;




declare_id!("CxJuewnmqF95YuzTHCDfwDbms4RebiYqFCpUTQ64avgn");



#[program]
mod w_3_subs_tracker {
    use self::instructions::{main_state, subscription};

    use super::*;
    /**
     * Initialize main state, which defines who is the owner and the authority. After this step owner can update the authority and the owner.
     * Authority can interact with subscription instructions.
     * Authorised: MainState.owner
     */
    pub fn intialize_main_state(ctx: Context<InitializeMainState>, fees: u8) -> Result<()> {
        main_state::processor::intialize_main_state(ctx, fees)
    }
    /**
     * Instruction which will be used to update the authority of the main state account
     * Authorised: MainState.owner
     */
    pub fn update_authority(ctx: Context<UpdateAuthority>, new_authority: Pubkey) -> Result<()> {
        main_state::processor::update_authority(ctx, new_authority)
    }
    /**
     * Instruction which will be used to update the owner of the main state account
     * Authorised: MainState.owner
     */
    pub fn update_owner(ctx: Context<UpdateOwner>, new_owner: Pubkey) -> Result<()> {
        main_state::processor::update_owner(ctx, new_owner)
    }
    /**
     * Instruction which will be used to update the fees for the unsubcription related actions.
     * Authorised: MainState.authority
     */
    pub fn update_fees(ctx: Context<UpdateFees>, new_fees: u8) -> Result<()> {
        main_state::processor::update_fees(ctx, new_fees)
    }



    
    /**
     * Instruction which creates new subscription for the user.
     * Authorised: Subscription.user
     */
    pub fn create_subscription(ctx: Context<CreateSubscription>, initial_deposit: u64, account_type: SubscriptionType) -> Result<()> {
        subscription::processor::create_subscription(ctx, initial_deposit, account_type)
    }
    /**
     * Instruction which will be used to change the desired subscription type for the user.
     * Authorised: Subscription.user
     */
    pub fn change_desired_subscription_type(ctx: Context<ChangeSubscriptionType>, account_type: SubscriptionType) -> Result<()> {
        subscription::processor::change_desired_subscription_type(ctx, account_type)
    }
    /**
     * Instruction which will be used to set the subscription date for the user.
     * Authorised: MainState.authority
     */
    pub fn set_subscription_info(ctx: Context<SetSubscriptionDate>, new_date: Option<i64>, acumulated_sol: Option<u64>, subscription_type: Option<SubscriptionType>) -> Result<()> {
        subscription::processor::set_subscription_info(ctx, new_date, acumulated_sol, subscription_type)
    }
    /**
     * Instruction which will be used to unsubscribe the user from the subscription, meaning sending back the last deposited funds to the user, sending remaining lamports to the main_state PDA and closing the account.
     * Authorised: MainState.authority || Subscription.user
     */
    pub fn unsubscribe(ctx: Context<Unsubscribe>, withdraw_content: bool, new_desired_subs_type: Option<SubscriptionType>) -> Result<()> {
        subscription::processor::unsubscribe(ctx, withdraw_content, new_desired_subs_type)
    }
    /**
     * Instruction which will be used to fund the subscription account with new deposit.
     * Authorised: *
     */
    pub fn fund_subscription(ctx: Context<FundSubcription>, new_deposit: u64) -> Result<()> {
        subscription::processor::fund_subscription(ctx, new_deposit)
    }
    /**
     * Instruction which will be used to withdraw the funds from the subscription account, to predefined account.
     * Authorised: MainState.authority
     */
    pub fn withdraw(ctx: Context<WithdrawFromSubcription>, amount: Option<u64>) -> Result<()> {
        subscription::processor::withdraw(ctx, amount)
    }

    
   
}










