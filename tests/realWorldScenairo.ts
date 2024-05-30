import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { W3SubsTracker } from "../target/types/w_3_subs_tracker";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { use } from "chai";

const shouldDebug = false;
if(!shouldDebug) console.log = function() {};

describe("real_world_scenairo", async () => {
    // INITIALIZATIONS
    async function wait(ms: number) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }
    const provider = anchor.AnchorProvider.env()
    
    anchor.setProvider(provider);
    
    const idl = require("../target/idl/w_3_subs_tracker.json") as any;
    const program = new anchor.Program(idl, provider) as Program<W3SubsTracker>;
    const usersKeyPairs = [anchor.web3.Keypair.generate(),  anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate()];
    const [mainStatePDA, _] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('mainState')], program.programId);
    const subsPdas = [];
    // INIT OF USERS, MAIN STATE, AIRDROPS
    it("Should init", async () => {
        for(let i = 0; i < usersKeyPairs.length; i++) {
            const userKeyPair = usersKeyPairs[i];
            const [pda, _] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('subscription'), userKeyPair.publicKey.toBuffer(), mainStatePDA.toBuffer()], program.programId);
            subsPdas.push(pda);
        }
       const tx = await program.methods
        .intializeMainState(10)
        .accounts({
            mainState: mainStatePDA,
        })
       .rpc();
       const mainState = await program.account.mainState.fetch(mainStatePDA);
       if( mainState.authority.toBase58() !== provider.wallet.publicKey.toBase58() ) {
       throw new Error("Authority is not the same as the provider's pubkey");
       }
    
    
       for(let i = 0; i < usersKeyPairs.length; i++) {
           const userKeyPair = usersKeyPairs[i];
           const tx = await provider.connection.requestAirdrop(userKeyPair.publicKey, 3 * LAMPORTS_PER_SOL);
           await provider.connection.confirmTransaction(tx);
       }
    });

    // USER0
    it("Should let user: create subs acc -> fund more into account -> get vrified verified by BE -> close account -> reopen account", async () => {
        const userKeyPair = usersKeyPairs[0];
        const pda = subsPdas[0];
        const userBalanceAtStart = await provider.connection.getBalance(userKeyPair.publicKey);
        const d = {basic: {}};
        const tx = await program.methods
            .createSubscription(new BN(LAMPORTS_PER_SOL * 0.25), d)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
            .signers([userKeyPair])
            .rpc();
        let balance = await provider.connection.getBalance(pda);
        console.log(`User has created a subscription account with ${balance / LAMPORTS_PER_SOL} SOL`)
        if (balance < LAMPORTS_PER_SOL * 0.25)  throw new Error("Balance is not correct");
        let subsInfo = await program.account.subscription.fetch(pda);
        console.log('__AFTER INIT SUBCRIPTION');
        console.log(`User has initialized a subscription with ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL with desired subs type ${JSON.stringify(subsInfo.subscriptionStatusWritable.desiredSubscriptionType)}, this all happened at UTC: ${new Date(subsInfo.subscriptionStatusWritable.afterVerifyUtcTimestamp ? subsInfo.subscriptionStatusWritable.afterVerifyUtcTimestamp.toNumber() : 0).toUTCString()}`);
        console.log(`BE will check the status of the subscription account, but it requires atleast 0.3 SOL`)
        console.log(`His subs account now have ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User is about to deposit 0.1 additional SOL to the subscription account \n`);
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() < LAMPORTS_PER_SOL * 0.25 || subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() > LAMPORTS_PER_SOL * 0.251) throw new Error("Balance of credits is not correct");

        const tx2 = await program.methods
            .fundSubscription(new BN(LAMPORTS_PER_SOL * 0.1))
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
            .signers([userKeyPair])
            .rpc();
        balance = await provider.connection.getBalance(pda);
        subsInfo = await program.account.subscription.fetch(pda);
        console.log("__AFTER DEPOSIT")
        console.log(`User has deposited 0.1 SOL to the subscription account, the account now PDA has ${balance / LAMPORTS_PER_SOL} SOL`);
        console.log(`User has deposited 0.1 SOL to the subscription account, the account now has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL`);
        console.log(`His subs account now have ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        const validTill = Date.now() + 1000;
        console.log('It will be valid till', new Date(validTill).toUTCString());   
        console.log(`BE will check the status of the subscription account, everything is fine now it will set date and subs type \n`);
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() < LAMPORTS_PER_SOL * 0.35 || subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() > LAMPORTS_PER_SOL * 0.351) throw new Error("Balance of credits is not correct");
        
        const tx3 = await program.methods
            .setSubscriptionInfo(new BN(validTill), new BN(LAMPORTS_PER_SOL * 0.3), d)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey})
            .rpc();
        subsInfo = await program.account.subscription.fetch(pda);   
        console.log('__AFTER SET SUBSCRIPTION INFO')
        console.log(`User has been set up with subscription type to ${JSON.stringify(subsInfo.authorityWritable.currentAccountType)} and valid from ${new Date(subsInfo.subscriptionStatusWritable.afterVerifyUtcTimestamp.toNumber())} the valid till ${new Date(subsInfo.authorityWritable.validTill?.toNumber())}`);
        console.log(`His subs account now have ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User want to change his subscription type to premium, he need to unsubcribe first \n`);
        let userBalance = await provider.connection.getBalance(userKeyPair.publicKey); 
        console.log(`User balance is ${userBalance / LAMPORTS_PER_SOL} SOL`);
        console.log('After unsubcribe time: ' + new Date().toUTCString() + '\n') ;
        if (subsInfo.authorityWritable.validTill.toNumber() < Date.now()) throw new Error("Valid till date should be valid at this point");
        await wait(2000);
        if (subsInfo.authorityWritable.usedLamports.toNumber() < LAMPORTS_PER_SOL * 0.3 || subsInfo.authorityWritable.usedLamports.toNumber() > LAMPORTS_PER_SOL * 0.31) throw new Error("Balance of debits is not correct");   
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() < LAMPORTS_PER_SOL * 0.05 || subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() > LAMPORTS_PER_SOL * 0.051) throw new Error("Balance of credits is not correct");
        if (subsInfo.authorityWritable.validTill.toNumber() > Date.now()) throw new Error("Valid till date shoul NOT be valid at this point");
        const tx4 = await program.methods
            .unsubscribe(true)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, mainStateOwner: provider.wallet.publicKey, toAccount: userKeyPair.publicKey})
            .signers([userKeyPair])
            .rpc({skipPreflight: true});
        console.log('__AFTER UNSUBSCRIBE')
        console.log(`Users balance after unsubscribing is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`)
        let err = null;
        try {
            await program.account.subscription.fetch(pda);
            err = 1;
            
        } catch (e) {}
        if (err) throw new Error("Should not be able to fetch account after full unsubcribe");
        
        // user has closed his account but now wants to reopen it
        const tx5 = await program.methods
            .createSubscription(new BN(LAMPORTS_PER_SOL * 0.25), d)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
            .signers([userKeyPair])
            .rpc();
        
        subsInfo = await program.account.subscription.fetch(pda);
        userBalance = await provider.connection.getBalance(userKeyPair.publicKey);
        console.log('__AFTER RECREATE SUBSCRIPTION')
        console.log(`User has re-created a subscription account`);
        console.log(`His subs account now have ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${userBalance / LAMPORTS_PER_SOL} SOL`);
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() < LAMPORTS_PER_SOL * 0.25 || subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() > LAMPORTS_PER_SOL * 0.251) throw new Error("Balance of credits is not correct");
        if (userBalanceAtStart - userBalance < 0.44 * LAMPORTS_PER_SOL || userBalanceAtStart - userBalance > 2.46 * LAMPORTS_PER_SOL) throw new Error("User balance at start is not correct");
    });

    // USER1
    it("Should let user: create subs acc -> gets verified by BE -> fund more to keep account active -> get reverified by BE -> BE withdrawal during valid period -> BE withdrawal after valid period", async () => {
        let userKeyPair = usersKeyPairs[1];
        const pda = subsPdas[1];
        const d = {basic: {}};

        const tx = await program.methods
            .createSubscription(new BN(LAMPORTS_PER_SOL * 0.1), d)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
            .signers([userKeyPair])
            .rpc();

        let balance = await provider.connection.getBalance(pda);
        let subsInfo = await program.account.subscription.fetch(pda);
        console.log(`__AFTER INIT SUBCRIPTION`)
        console.log(`User has created a subscription account with ${balance / LAMPORTS_PER_SOL} SOL`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL \n`);
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() !== LAMPORTS_PER_SOL * 0.1 ) throw new Error("Balance of credits is not correct");
        if (balance < LAMPORTS_PER_SOL * 0.1)  throw new Error("Balance is not correct");

        const tx1 = await program.methods
            .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.08), d)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey})
            .rpc();

        console.log(`__AFTER SET SUBSCRIPTION INFO`)
        subsInfo = await program.account.subscription.fetch(pda);
        if (subsInfo.authorityWritable.validTill.toNumber() < Date.now()) throw new Error("Valid till date should be valid at this point");
        await wait(2000);
        console.log(`User has been set up with subscription type to ${JSON.stringify(subsInfo.authorityWritable.currentAccountType)} and valid from ${new Date(subsInfo.subscriptionStatusWritable.afterVerifyUtcTimestamp.toNumber())} the valid till ${new Date(subsInfo.authorityWritable.validTill?.toNumber())}`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`In next step user will be using his subcription account till valid till date \n`)
        if (subsInfo.authorityWritable.usedLamports.toNumber() !== LAMPORTS_PER_SOL * 0.08 ) throw new Error("Balance of debits is not correct");
        if (subsInfo.authorityWritable.validTill.toNumber() > Date.now()) throw new Error("Valid till date should NOT be valid at this point");



        // at this point BE will check the status of subcription and can see that valid till date is passed, returning such HTTP status to the FE
        // client needs to either call some BE api to take from the credits and extend the valid till date or fund more.
        // at this point calling API to extend the valid till date would result in error, as the user has not enough credits, so user will fund more credits and after that require BE to reverify the account

        const tx2 = await program.methods
            .fundSubscription(new BN(LAMPORTS_PER_SOL * 0.1))
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
            .signers([userKeyPair])
            .rpc();
        balance = await provider.connection.getBalance(pda);
        subsInfo = await program.account.subscription.fetch(pda);
        console.log(`__AFTER DEPOSIT`)
        console.log(`User has deposited 0.1 SOL to the subscription account, the account now PDA has ${balance / LAMPORTS_PER_SOL} SOL`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`User has funded his account, now he wants to get reverified by BE by calling some API \n`);
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() !== LAMPORTS_PER_SOL * 0.12 ) throw new Error("Balance of credits is not correct");
        if (subsInfo.authorityWritable.usedLamports.toNumber() !== LAMPORTS_PER_SOL * 0.08 ) throw new Error("Balance of credits is not correct");

        const tx3 = await program.methods
            .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.1), null)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey})
            .rpc();
        subsInfo = await program.account.subscription.fetch(pda);
        console.log(`__AFTER REVERIFY`)
        console.log(`User has been set up with subscription type to ${JSON.stringify(subsInfo.authorityWritable.currentAccountType)} and valid from ${new Date(subsInfo.subscriptionStatusWritable.afterVerifyUtcTimestamp.toNumber())} the valid till ${new Date(subsInfo.authorityWritable.validTill?.toNumber())}`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL \n`);
        if (subsInfo.authorityWritable.validTill.toNumber() < Date.now()) throw new Error("Valid till date should be valid at this point");
        if (subsInfo.authorityWritable.usedLamports.toNumber() !== LAMPORTS_PER_SOL * 0.1 ) throw new Error("Balance of debits is not correct");
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() !== LAMPORTS_PER_SOL * 0.02 ) throw new Error("Balance of credits is not correct");

        // authority will now withdraw the funds from the account
        console.log(`Authority is about to withdraw all SOL from the subscription account, his current balance is ${await provider.connection.getBalance(provider.wallet.publicKey) / LAMPORTS_PER_SOL} SOL \n`)
        const beforeWithdrawalProviderBalance = await provider.connection.getBalance(provider.wallet.publicKey);
        const tx4 = await program.methods
            .withdraw(null)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey, toAccount: provider.wallet.publicKey})
            .rpc();
        subsInfo = await program.account.subscription.fetch(pda);
        const afterWithdrawalProviderBalance = await provider.connection.getBalance(provider.wallet.publicKey);
        console.log(`__AFTER WITHDRAW`)
        console.log(`Authority has withdrawn all SOL from the subscription account, the account now PDA has ${await provider.connection.getBalance(pda) / LAMPORTS_PER_SOL} SOL`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`Authority balance is ${await provider.connection.getBalance(provider.wallet.publicKey) / LAMPORTS_PER_SOL} SOL \n`);
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() !== 0.02 * LAMPORTS_PER_SOL ) throw new Error("Balance of credits is not correct");
        if (subsInfo.authorityWritable.usedLamports.toNumber() !== 0.1 * LAMPORTS_PER_SOL ) throw new Error("Balance of debits is not correct");
        if (await provider.connection.getBalance(pda) > LAMPORTS_PER_SOL * 0.13 || await provider.connection.getBalance(pda) < LAMPORTS_PER_SOL * 0.11 ) throw new Error("PDA inner balance is not correct, should hold only rentable amount");
        // console.log((beforeWithdrawalProviderBalance - afterWithdrawalProviderBalance) / LAMPORTS_PER_SOL)
        await wait(2000);
        
        const tx5 = await program.methods
            .withdraw(null)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey, toAccount: provider.wallet.publicKey})
            .rpc();
        subsInfo = await program.account.subscription.fetch(pda);
        console.log(`__AFTER SECOND WITHDRAW`)
        console.log(`Authority has withdrawn all SOL from the subscription account, the account now PDA has ${await provider.connection.getBalance(pda) / LAMPORTS_PER_SOL} SOL`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`Authority balance is ${await provider.connection.getBalance(provider.wallet.publicKey) / LAMPORTS_PER_SOL} SOL \n`);
        if (subsInfo.authorityWritable.validTill.toNumber() > Date.now()) throw new Error("Valid till date should NOT be valid at this point");
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() !== 0.02 * LAMPORTS_PER_SOL ) throw new Error("Balance of credits is not correct");
        if (subsInfo.authorityWritable.usedLamports.toNumber() !== 0.1 * LAMPORTS_PER_SOL ) throw new Error("Balance of debits is not correct");
        if (await provider.connection.getBalance(pda) > LAMPORTS_PER_SOL * 0.03 || await provider.connection.getBalance(pda) < LAMPORTS_PER_SOL * 0.01 ) throw new Error("PDA inner balance is not correct, should hold only rentable amount");

    });


    // USER2
    it("Should let user: create sub acc -> verified as basic -> unsubcribe to change type to premium -> fund more to make it to premium -> get reverified by BE -> BE withdraw -> unsubscribe from client ", async () => {
        const userKeyPair = usersKeyPairs[2];
        const pda = subsPdas[2];
        const d = {basic: {}};
        const p = {premium: {}};

        const tx = await program.methods
            .createSubscription(new BN(LAMPORTS_PER_SOL * 0.4), d)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
            .signers([userKeyPair])
            .rpc();
        let balance = await provider.connection.getBalance(pda);
        let subsInfo = await program.account.subscription.fetch(pda);
        console.log(`__AFTER INIT SUBCRIPTION`)
        console.log(`User has created a subscription account with ${balance / LAMPORTS_PER_SOL} SOL`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL \n`);
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() !== LAMPORTS_PER_SOL * 0.4 ) throw new Error("Balance of credits is not correct");
        if (balance < LAMPORTS_PER_SOL * 0.4 || balance > 0.41 * LAMPORTS_PER_SOL)  throw new Error("Balance is not correct");

        const tx1 = await program.methods
            .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.3), d)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey})
            .rpc();
        subsInfo = await program.account.subscription.fetch(pda);
        console.log(`__AFTER SET SUBSCRIPTION INFO`)
        console.log(`User has been set up with subscription type to ${JSON.stringify(subsInfo.authorityWritable.currentAccountType)} and valid from ${new Date(subsInfo.subscriptionStatusWritable.afterVerifyUtcTimestamp.toNumber())} the valid till ${new Date(subsInfo.authorityWritable.validTill?.toNumber())}`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`In next step user will be using his subcription till 50% of valid till but decides to go to premium instead \n`)
        await wait(500);

        const tx2 = await program.methods
            .unsubscribe(false)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, mainStateOwner: provider.wallet.publicKey, toAccount: null})
            .signers([userKeyPair])
            .rpc({skipPreflight: true});

        subsInfo = await program.account.subscription.fetch(pda);
        console.log(`__AFTER UNSUBSCRIBE`)
        console.log(`User has unsubscribed from the subscription account, the account now PDA has ${await provider.connection.getBalance(pda) / LAMPORTS_PER_SOL} SOL`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`User has unsubscribed from the account, now he wants to create a new account with premium type \n`);
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() <= 0.1 * LAMPORTS_PER_SOL ||  subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() >= 0.27 * LAMPORTS_PER_SOL) throw new Error("Balance of credits is not correct");

        const tx3 = await program.methods
            .changeDesiredSubscriptionType(p)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
            .signers([userKeyPair])
            .rpc();

        subsInfo = await program.account.subscription.fetch(pda);
        console.log(`__AFTER CHANGE DESIRED SUBSCRIPTION TYPE`)
        console.log(`User has changed his subscription type to ${JSON.stringify(subsInfo.subscriptionStatusWritable.desiredSubscriptionType)}`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`User has changed his subscription type to premium, now he wants to fund the account \n`);
        const pdaCreditsAfterUnsubscribe = subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber();
        if (pdaCreditsAfterUnsubscribe <= 0.1 * LAMPORTS_PER_SOL ||  subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() >= 0.27 * LAMPORTS_PER_SOL) throw new Error("Balance of credits is not correct");
        
        const tx4 = await program.methods
            .fundSubscription(new BN(LAMPORTS_PER_SOL * 0.2))
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
            .signers([userKeyPair])
            .rpc();
        subsInfo = await program.account.subscription.fetch(pda);
        console.log(`__AFTER FUND SUBSCRIPTION`)
        console.log(`User has funded his account, the account now PDA has ${await provider.connection.getBalance(pda) / LAMPORTS_PER_SOL} SOL`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`User has funded his account, now he wants to get reverified by BE by calling some API \n`);
        if (subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() !== pdaCreditsAfterUnsubscribe + LAMPORTS_PER_SOL * 0.2 ) throw new Error("Balance of credits is not correct");
        if (subsInfo.authorityWritable.usedLamports.toNumber() !== LAMPORTS_PER_SOL * 0 ) throw new Error("Balance of debits is not correct");
        

        const tx5 = await program.methods
            .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.4), p)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey})
            .rpc();
        subsInfo = await program.account.subscription.fetch(pda);
        console.log(`__AFTER REVERIFY`)
        console.log(`User has been set up with subscription type to ${JSON.stringify(subsInfo.authorityWritable.currentAccountType)} and valid from ${new Date(subsInfo.subscriptionStatusWritable.afterVerifyUtcTimestamp.toNumber())} the valid till ${new Date(subsInfo.authorityWritable.validTill?.toNumber())}`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`User has been reverified by BE, now be will withdraw all funds it can \n`);
        if (subsInfo.authorityWritable.validTill.toNumber() < Date.now()) throw new Error("Valid till date should be valid at this point");
        const beforeWithdrawalProviderBalance = await provider.connection.getBalance(provider.wallet.publicKey);
        
        await wait(250);
        const tx6 = await program.methods
            .withdraw(null)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey, toAccount: provider.wallet.publicKey})
            .rpc();
        subsInfo = await program.account.subscription.fetch(pda);
        console.log(`__AFTER WITHDRAW`)
        console.log(`Authority has withdrawn all SOL from the subscription account, the account now PDA has ${await provider.connection.getBalance(pda) / LAMPORTS_PER_SOL} SOL`);
        console.log(`In account info, user has ${subsInfo.subscriptionStatusWritable.afterVerifyCreditLamports.toNumber() / LAMPORTS_PER_SOL} SOL as credits and ${subsInfo.authorityWritable.usedLamports.toNumber() / LAMPORTS_PER_SOL} SOL as debits`);
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`Authority balance is ${await provider.connection.getBalance(provider.wallet.publicKey) / LAMPORTS_PER_SOL} SOL \n`);
        if (subsInfo.authorityWritable.usedLamports.toNumber() !== 0.4 * LAMPORTS_PER_SOL ) throw new Error("Balance of debits is not correct");

        // user usnubcsribes from given account causing given pda to be deleted
        const providedBalanceBefore = await provider.connection.getBalance(provider.publicKey);
        const tx7 = await program.methods
            .unsubscribe(true)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, mainStateOwner: provider.wallet.publicKey, toAccount: userKeyPair.publicKey})
            .signers([userKeyPair])
            .rpc({skipPreflight: true});
        let err = null;
            try{
                subsInfo = await program.account.subscription.fetch(pda);
                err = "Pda account should not exist anymore"
            } catch {}
        if (err) throw new Error(err);
        console.log(`__AFTER UNSUBSCRIBE`)
        console.log(`User balance is ${await provider.connection.getBalance(userKeyPair.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`Authority balance was: ${providedBalanceBefore / LAMPORTS_PER_SOL} SOL and now is: ${await provider.connection.getBalance(provider.wallet.publicKey) / LAMPORTS_PER_SOL} SOL`);
        console.log(`User has unsubscribed from the account, now he wants to create a new account with premium type \n`);
    });

    

    
})

