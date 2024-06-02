# W_3_SUBS_TRACKER
- Solana program for managing subscription logic for users.

## Overview
- You have a backend (BE) that performs certain logic and other users benefit from it.
- The backend uses some form of authentication but you want to include subscription management.
- If you are interested in a decentralized solution, this program might be suitable.
- Your backend will provide authentication tokens only to users subscribed to an on-chain program.

## Deployment Model
- The current version requires deploying a new program for each subscription tracker, meaning you can't use a program already deployed by other users.

## Functionality
- Users can create subscription accounts (PDA) with an initial deposit, known as `credits`.
- Users can choose their desired subscription type (e.g., FREE, BASIC, PREMIUM).
- Users can fund their PDA accounts at any time.
- After calling a predefined backend API, the backend will check the status of the given subscription PDA account, its credits, and the desired type. If eligible, the subscription type will be set to the desired type, and credits will be converted to debits with a valid till date, indicating the subscription period.
- Users can unsubscribe to withdraw their credits and a portion of their debits (fees apply). Part of the debits will be deducted as fees set during initialization (`main_state.fees`), and some for the time already subscribed. Fees or time deductions will be transferred to the owner of the `main_state` account. The PDA account cannot be closed.
- The authority of the main state can withdraw funds from any existing PDA account, but only debits part, not credits (more explained bellow).

## Backend Steps
- The backend will establish an API endpoint for updating subscription accounts. After hitting this API, the backend will find given user's subscription account on-chain and perform against it the following steps:
  1. If `subscription.authority_writable.valid_till > now`: The account is in an active subscription. The user must unsubscribe first to set a new desired type. If true, do not proceed.
  2. Check the desired subscription from `subscription.subscription_status_writable.desired_subscription_type` and calculate the required amount. If the desired subscription type is invalid, do not proceed.
  3. If `subscription.subscription_status_writable.after_verify_credit_lamports < required_amount`: The user has insufficient credits for the subscription. They must fund their account with more SOL. If true, do not proceed.
  4. If all above conditions are false, the backend can set the user's subscription account.

### Detailed Functionality
- Two account types are handled:
  - `main_state (73 bytes)`:
    - A single instance created after program deployment by the chosen wallet as the signer, by calling `fn initialize_main_state(fees: u8)` or in TS, `function initializeMainState(fees: number)`. The initialization sets the fee parameter for later changes in subscription types or withdrawals. The public key used will become the owner and authority. The owner can change the authority, owner, and fees. The authority can perform actions on existing subscription accounts. Only one `main_state` will exist during the program's lifetime.
  - `subscription (106 bytes)`:
    - #### User Actions:
      - A single PDA account per user with seeds = (b"subscription", user.key().as_ref(), main_state.key().as_ref()) and auto bump.
      - Users can create (not reinitializable) PDA using `fn create_subscription(initial_deposit: u64, account_type: SubscriptionType)` providing `main_state` and their signature.
      - Users can fund their PDA accounts using `fn fund_subscription(new_deposit: u64)`, providing `main_state` and their signature. The transferred SOL will appear in `subscription_pda_account.subscription_status_writable.after_verify_credit_lamports` (credits).
      - Users can set their desired account type by calling `fn unsubscribe(withdraw_content: boolean, new_desired_subs_type: Option<SubscriptionType>)`. To change the subscription type, the user must ensure no active subscription, i.e., `subscription_pda_account.authority_writable.valid_till < now`. When unsubscribing without withdrawing funds, unused debits (with fees and time passed applied) will be moved to credits, and `subscription_pda_account.authority_writable.valid_till` will be set to 0. This makes the user eligible to change the account type.
      - Users can withdraw all funds from the subscription account by calling `fn unsubscribe(withdraw_content: boolean, new_desired_subs_type: Option<SubscriptionType>)` with `withdraw_content` set to true. All credits (100%) and debits (after fees and time usage deduction) will be transferred to the user's account. Remaining funds will be transferred to the owner of the `main_state` account. The PDA remains open for future deposits.
    - #### Authority Actions:
      - The authority can withdraw all eligible funds by calling `fn withdraw(amount: Option<u64>)`. The authority cannot withdraw credits but can withdraw used debits and partially used debits. If an amount is specified, it will attempt to withdraw that amount; otherwise, it will withdraw all available debits.
      - The authority can set subscription info for any user's PDA, including the subscription type, valid until date, and the amount of SOL transferred from credits to debits, by calling `fn set_subscription_info(new_date: Option<i64>, accumulated_sol: Option<u64>, subscription_type: Option<SubscriptionType>)`. Unspecified arguments retain their previous values.

#### Notes
- This is my first smart contract, so it may not follow best practices. Any feedback or suggestions for improvement are welcome.
