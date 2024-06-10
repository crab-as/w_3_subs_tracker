import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { W3SubsTracker } from "../target/types/w_3_subs_tracker";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { use } from "chai";
import { BN } from "bn.js";


describe("securityChecks", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()

  anchor.setProvider(provider);
  const someOtherLegitProvider = anchor.web3.Keypair.generate();
  
  const fakeProviders = [anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate()];
  const usersKeyPairs = [anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate()];
  const subsPdas: anchor.web3.PublicKey[] = [];  
  const subFakePdas: anchor.web3.PublicKey[] = [];

  const idl = require("../target/idl/w_3_subs_tracker.json") as any;
  const program = new anchor.Program(idl, provider) as Program<W3SubsTracker>;
  const [mainStatePDA, _] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('mainState')], program.programId);
  const [fakeStatePDA, __] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('mainStatee')], program.programId);

  
    // INIT OF USERS, MAIN STATE, AIRDROPS
    it("Should init airdrops to all users and fakeProviders, create fake main_states", async () => {
        for(let i = 0; i < usersKeyPairs.length; i++) {
            const userKeyPair = usersKeyPairs[i];
            const [pda, _] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('subscription'), userKeyPair.publicKey.toBuffer(), mainStatePDA.toBuffer()], program.programId);
            const [fakepda, __] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('subscription'), userKeyPair.publicKey.toBuffer(), fakeStatePDA.toBuffer()], program.programId);
            subsPdas.push(pda);
            subFakePdas.push(fakepda);
        }
        for(let i = 0; i < usersKeyPairs.length; i++) {
            const userKeyPair = usersKeyPairs[i];
            const tx = await provider.connection.requestAirdrop(userKeyPair.publicKey, 5 * LAMPORTS_PER_SOL);
            await provider.connection.confirmTransaction(tx);
        }
        for(let i = 0; i < fakeProviders.length; i++) {
            const fakeProvider = fakeProviders[i];
            const tx = await provider.connection.requestAirdrop(fakeProvider.publicKey, 5 * LAMPORTS_PER_SOL);
            await provider.connection.confirmTransaction(tx);
        }
        const tx_air = await provider.connection.requestAirdrop(someOtherLegitProvider.publicKey, 5 * LAMPORTS_PER_SOL);
        await provider.connection.confirmTransaction(tx_air);
      
    });

    it("Should init mainState but not let any other main state be initialized", async () => {
        try {
            // check if mainState exists
            const mainState = await program.account.mainState.fetch(mainStatePDA);
        } catch {
            // if mainState does not exist, create it
            const tx = await program.methods
                .intializeMainState(10)
                .rpc({skipPreflight: true});
        }
        let err = null;
        try {
            await program.methods
                    .intializeMainState(10)
                    .accounts({mainState: fakeStatePDA, user: fakeProviders[0].publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
                    err = new Error("Should not have initialized the fakeState with a fake provider");
        } catch {}
        if (err)  throw err;
        
        try {
                await program.methods
                        .intializeMainState(10)
                        .accounts({user: fakeProviders[0].publicKey})
                        .signers([fakeProviders[0]])
                        .rpc({skipPreflight: true});
                        err = new Error("Should not have initialized the mainState when there is already one");
        } catch {}
            if (err)  throw err;
            
        try {
            const tx = await program.methods
                .intializeMainState(10)
                .rpc({skipPreflight: true});
            err = new Error("Should not have initialized the mainState when there is already one, even with correct owner/authority");
        }  catch {}
        if (err)  throw err;
        const mainState = await program.account.mainState.fetch(mainStatePDA);
        console.log(`Fetched mainState: ${JSON.stringify(mainState, null, 2)}`);
        if( mainState.authority.toBase58() !== provider.publicKey.toBase58() ) {
            throw new Error("Authority is not the same as the provider's pubkey");
        }
    });

    it("MainState authority should not be changed by anyone other than the owner", async () => {
        // at first change authority to some other legit provider
        const tx = await program.methods
                .updateAuthority(someOtherLegitProvider.publicKey)
                .accounts({mainState: mainStatePDA})
                .rpc({skipPreflight: true});

        // revert it back
        const tx2 = await program.methods
                .updateAuthority(provider.publicKey)
                .accounts({mainState: mainStatePDA})
                .rpc({skipPreflight: true});
        // now try to change authority with wrong owner
        let err = null;
        try {
            await program.methods
                    .updateAuthority(someOtherLegitProvider.publicKey)
                    .accounts({mainState: mainStatePDA})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
                    err = new Error("Should not have changed the authority with a fake provider");
        } catch {}
        if (err)  throw err;
        // now try to change authority with wrong owner 2
        try {
            await program.methods
                    .updateAuthority(someOtherLegitProvider.publicKey)
                    .accounts({mainState: mainStatePDA})
                    .signers([usersKeyPairs[0]])
                    .rpc({skipPreflight: true});
                    err = new Error("Should not have changed the authority with a fake provider");
        } catch {}
        if (err)  throw err;

        const mainState = await program.account.mainState.fetch(mainStatePDA);
        console.log(`Fetched mainState: ${JSON.stringify(mainState, null, 2)}`);
        if( mainState.authority.toBase58() !== provider.publicKey.toBase58() ) {
            throw new Error("Authority is not the same as the provider's pubkey");
        }
    });

    it("It should create a subcription by the user but then not let other users to recreate it or interact with given subscription", async () => {
        const userKeyPair = usersKeyPairs[0];
        const pda = subsPdas[0];

        const attackedKeyPair = usersKeyPairs[1];

        const tx = await program.methods
                .createSubscription(new BN(3 * LAMPORTS_PER_SOL), {premium: {}})
                .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                .signers([userKeyPair])
                .rpc({skipPreflight: true});
        let err = null;
        // recreate the subs by same user
        try {
            await program.methods
                    .createSubscription(new BN(0.1 * LAMPORTS_PER_SOL), {premium: {}})
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
                    err = new Error("Should not have created the subscription twice, even by same user");
        } catch { }
        if (err)  throw err;

    });


    it("It shouldn't let unauthorized signers to withdraw SOL, only authority can", async () => {
        const userKeyPair = usersKeyPairs[0];
        const pda = subsPdas[0];
        let subInfo = await program.account.subscription.fetch(pda);
        console.log(`Current state of the subscription: ${JSON.stringify(subInfo, null, 2)}`);
        let err = null;
        // as user with correct mainState PDA
        try {
            await program.methods
                    .withdraw(null)
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey, toAccount: userKeyPair.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use withdraw functionality with correct mainState PDA");
        } catch(ex) { }
        if (err)  throw err;

        // as user with incorrect mainState PDA
        try {
            await program.methods
                    .withdraw(null)
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey, toAccount: userKeyPair.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use withdraw functionality with wrong mainState PDA");
        } catch(ex) { }
        if (err)  throw err;

        // as fakeProvider (signer) with incorrect mainState PDA acting as correct authority
        try {
            await program.methods
                    .withdraw(null)
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey, toAccount: provider.publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use withdraw functionality ");
        } catch(ex) { }
        if (err)  throw err;

        // as fakeProvider (signer) with incorrect mainState PDA 
        try {
            await program.methods
                    .withdraw(null)
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey, authority: fakeProviders[0].publicKey, toAccount: provider.publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use withdraw functionality ");
        } catch(ex) { }
        if (err)  throw err;

        // as fakeProvider (signer) with correct mainState PDA acting as correct authority
        try {
            await program.methods
                    .withdraw(null)
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey, toAccount: userKeyPair.publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use withdraw functionality ");
        } catch(ex) { }
        if (err)  throw err;

         // as fakeProvider (signer) with correct mainState PDA 
         try {
            await program.methods
                    .withdraw(null)
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: fakeProviders[0].publicKey, toAccount: userKeyPair.publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use withdraw functionality ");
        } catch(ex) { }
        if (err)  throw err;

        // in the end it should let the correct withdraw as authority is correct
        try {
            const tx = await program.methods
                    .withdraw(null)
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey, toAccount: userKeyPair.publicKey})
                    .rpc({skipPreflight: true});
            console.log(`Withdrawal was successful, previous state of subscription: ${JSON.stringify(subInfo, null, 2)} \n new state of the subscription: ${JSON.stringify(await program.account.subscription.fetch(pda), null ,2)}`);
        } catch(ex) {
            console.log(ex);
            throw new Error("Should have let correct authority use withdraw functionality");
        }
    });

    it("Shouldn't let unauthorized signers to setSubscriptionInfo, only authority can", async () => {
        const userKeyPair = usersKeyPairs[0];
        const pda = subsPdas[0];
        let subInfo = await program.account.subscription.fetch(pda);
        console.log(`Current state of the subscription: ${JSON.stringify(subInfo, null, 2)}`);
        let err = null;
        const premiumEnum = {premium: {}};
        // as user with correct mainState PDA
        try {
            await program.methods
                    .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.3), premiumEnum)
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use setSubscriptionInfo functionality with correct mainState PDA");
        } catch(ex) { }
        if (err)  throw err;

        // as user with correct mainState PDA changing the authority to fakeProvider
        try {
            await program.methods
                    .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.3), premiumEnum)
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: fakeProviders[0].publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use setSubscriptionInfo functionality with correct mainState PDA");
        } catch(ex) { }

        // as user with incorrect mainState PDA
        try {
            await program.methods
                    .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.3), premiumEnum)
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use setSubscriptionInfo functionality with wrong mainState PDA");
        } catch(ex) { }
        if (err)  throw err;

        // as user with fakeMainState PDA changing the authority to fakeProvider 
        try {
            await program.methods
                    .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.3), premiumEnum)
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey, authority: fakeProviders[0].publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use setSubscriptionInfo functionality with wrong mainState PDA");
        } catch(ex) { }

        // as fakeProvider (signer) with incorrect mainState PDA acting as correct authority
        try {
            await program.methods
                    .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.3), premiumEnum)
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use setSubscriptionInfo functionality ");
        } catch(ex) { }
        if (err)  throw err;

        // as fakeProvider (signer) with incorrect mainState PDA 
        try {
            await program.methods
                    .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.3), premiumEnum)
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey, authority: fakeProviders[0].publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use setSubscriptionInfo functionality ");
        } catch(ex) { };
        if (err)  throw err;

        // as correct authority
        try {
            await program.methods
                    .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.3), premiumEnum)
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, authority: provider.wallet.publicKey})
                    .rpc({skipPreflight: true});
            console.log(`setSubscriptionInfo was successful, previous state of subscription: ${JSON.stringify(subInfo, null, 2)} \n new state of the subscription: ${JSON.stringify(await program.account.subscription.fetch(pda), null, 2)}`);
        } catch(ex) {
            console.log(ex);
            throw new Error("Should have let correct authority use setSubscriptionInfo functionality");
        }
    });

    it("Shouldn't let anyone except PDA's user to change desired subscription account type", async () => {
        const userKeyPair = usersKeyPairs[0];
        const wrongUserKeyPair = usersKeyPairs[1];
        const pda = subsPdas[0];
        let subInfo = await program.account.subscription.fetch(pda);
        console.log(`Current state of the subscription: ${JSON.stringify(subInfo, null, 2)}`);
        let err = null;
        const premiumEnum = {premium: {}};
        // as wrong signer, acting as correct user with correct mainState PDA
        try {
            await program.methods
                    .changeDesiredSubscriptionType(premiumEnum)
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                    .signers([wrongUserKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use changeDesiredSubscriptionType functionality with correct mainState PDA");
        } catch(ex) { }

        // as wrong signer, acting as correct user with wrong mainState PDA
        try {
            await program.methods
                    .changeDesiredSubscriptionType(premiumEnum)
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey})
                    .signers([wrongUserKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use changeDesiredSubscriptionType functionality with correct mainState PDA");
        } catch(ex) { }

        // as fakeProvider (signer) with correct mainState PDA
        try {
            await program.methods
                    .changeDesiredSubscriptionType(premiumEnum)
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use changeDesiredSubscriptionType functionality ");
        } catch(ex) { }
        if (err)  throw err;

        // as fakeProvider (signer) with wrong mainState PDA
        try {
            await program.methods
                    .changeDesiredSubscriptionType(premiumEnum)
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use changeDesiredSubscriptionType functionality ");
        } catch(ex) { }

        // as correct authority
        try {
            await program.methods
                    .changeDesiredSubscriptionType(premiumEnum)
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let real provider use changeDesiredSubscriptionType functionality ");
        } catch(ex) { }
        if (err)  throw err;

        // as correct user
        try {
            await program.methods
                    .changeDesiredSubscriptionType(premiumEnum)
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            console.log(`changeDesiredSubscriptionType was successful, previous state of subscription: ${JSON.stringify(subInfo, null, 2)} \n new state of the subscription: ${JSON.stringify(await program.account.subscription.fetch(pda), null, 2)}`);
        } catch(ex) {
            console.log(ex);
            throw new Error("Should have let correct user use changeDesiredSubscriptionType functionality");
        }
    });

    it("Shouldn't let anyone reinitialize subscription for the existing subscription", async () => {
        const userKeyPair = usersKeyPairs[0];
        const anotherUserKeyPair = usersKeyPairs[1];
        const pda = subsPdas[0];
        let subInfo = await program.account.subscription.fetch(pda);
        console.log(`Current state of the subscription: ${JSON.stringify(subInfo, null, 2)}`);
        let err = null;

        // as user with correct mainState PDA
        try {
            await program.methods
                    .createSubscription(new BN(0.1 * LAMPORTS_PER_SOL), {premium: {}})
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("PDA shouldn't be reinitialised, even by the creator");
        } catch(ex) { console.log(`Questioning error1: ${ex}`) }
        if (err)  throw err;

        // as user with wrong mainState PDA
        try {
            await program.methods
                    .createSubscription(new BN(0.1 * LAMPORTS_PER_SOL), {premium: {}})
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use createSubscription functionality with wrong mainState PDA");
        } catch(ex) { console.log(`Questioning error2: ${ex}`) }
        if (err)  throw err;

        // as fakeProvider (signer) with correct mainState PDA
        try {
            await program.methods
                    .createSubscription(new BN(0.1 * LAMPORTS_PER_SOL), {premium: {}})
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use createSubscription functionality for existing PDA ");
        } catch(ex) { console.log(`Questioning error3: ${ex}`) }
        if (err)  throw err;

        // as fakeProvider (signer) with wrong mainState PDA
        try {
            await program.methods
                    .createSubscription(new BN(0.1 * LAMPORTS_PER_SOL), {premium: {}})
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use createSubscription functionality for existing PDA with fakeStatePDA ");
        } catch(ex) { console.log(`Questioning error4: ${ex}`) }
        if (err)  throw err;

        // as correct authority
        try {
            await program.methods
                    .createSubscription(new BN(0.1 * LAMPORTS_PER_SOL), {premium: {}})
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let real provider use createSubscription functionality for existing PDA");
        } catch(ex) { console.log(`Questioning error5: ${ex}`) }

        // as another user, for himself
        try {
            await program.methods
                    .createSubscription(new BN(0.1 * LAMPORTS_PER_SOL), {premium: {}})
                    .accounts({mainState: mainStatePDA, user: anotherUserKeyPair.publicKey})
                    .signers([anotherUserKeyPair])
                    .rpc({skipPreflight: true});
        const pda1 = subsPdas[1];
        subInfo = await program.account.subscription.fetch(pda1);
            console.log(`createSubscription was successful, new state of the subscription: ${JSON.stringify(subInfo, null, 2)}`);
        } catch(ex) {
            console.log(ex);
            throw new Error("Should have let correct user use createSubscription functionality");
        }
    })

    it("Should let only PDA's user to fund his existing PDA account", async () => {
        const userKeyPair = usersKeyPairs[0];
        const anotherUserKeyPair = usersKeyPairs[1];
        const anotherUserKeyPair2 = usersKeyPairs[2];
        const pda = subsPdas[0];
        const beforeBalance = await provider.connection.getBalance(pda);
        const anotherBeforeBalance = await provider.connection.getBalance(subsPdas[1]);
        let subInfo = await program.account.subscription.fetch(pda);
        console.log(`Current state of the subscription: ${JSON.stringify(subInfo, null, 2)}`);
        let err = null;
        // as user with incorrect mainState PDA
        try {
            await program.methods
                    .fundSubscription(new BN(0.1 * LAMPORTS_PER_SOL))
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use fundSubscription functionality with wrong mainState PDA");
        } catch(ex) { console.log(`Questioning error0: ${ex}`) }

        // as anotherUser2 trying to fund his not existing PDA (he has no subscription existance)
        try {
            await program.methods
                    .fundSubscription(new BN(0.1 * LAMPORTS_PER_SOL))
                    .accounts({mainState: mainStatePDA, user: anotherUserKeyPair2.publicKey})
                    .signers([anotherUserKeyPair2])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use fundSubscription functionality with wrong mainState PDA");
        } catch(ex) { console.log(`Questioning error1: ${ex}`) }

        // as anotherUser funding wrong PDA, PDA of user.  (note that anotherUser has own existing PDA)
        try {
            await program.methods
                    .fundSubscription(new BN(0.1 * LAMPORTS_PER_SOL))
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                    .signers([anotherUserKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use fundSubscription functionality to a wrong PDA");
        } catch(ex) { console.log(`Questioning error2: ${ex}`) }
        
        // as anotherUser2 to fund anotherUser1's PDA (note anotherUser2 has no subscription existance)
        try {
            await program.methods
                    .fundSubscription(new BN(0.1 * LAMPORTS_PER_SOL))
                    .accounts({mainState: mainStatePDA, user: anotherUserKeyPair.publicKey})
                    .signers([anotherUserKeyPair2])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use fundSubscription functionality to a wrong PDA");
        } catch(ex) { console.log(`Questioning error3: ${ex}`) }

        // as user with correct mainState PDA and existing PDA
        try {
            await program.methods
                    .fundSubscription(new BN(0.1 * LAMPORTS_PER_SOL))
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            const afterBalance = await provider.connection.getBalance(pda);
            console.log(`fundSubscription was successful, PDA previous balance: ${beforeBalance / LAMPORTS_PER_SOL} SOL, PDA new balance: ${afterBalance /LAMPORTS_PER_SOL} SOL`);
        } catch(ex) {
            console.log(ex);
            throw new Error("Should have let correct user use fundSubscription functionality");
        }
        // as anotherUser funding his own PDA
        try {
            await program.methods
                    .fundSubscription(new BN(0.1 * LAMPORTS_PER_SOL))
                    .accounts({mainState: mainStatePDA, user: anotherUserKeyPair.publicKey})
                    .signers([anotherUserKeyPair])
                    .rpc({skipPreflight: true});
            const afterAnotherBalance = await provider.connection.getBalance(subsPdas[1]);
            console.log(`fundSubscription was successful, PDA previous balance: ${anotherBeforeBalance / LAMPORTS_PER_SOL} SOL, PDA new balance: ${afterAnotherBalance /LAMPORTS_PER_SOL} SOL`);
        } catch(ex) {
            console.log(ex);
            throw new Error("Should have let correct user use fundSubscription functionality");
        }
       
    });

    it("Shouldn't let anyone except PDA's user to unsubscribe", async () => {
        const userKeyPair = usersKeyPairs[0];
        const anotherUserKeyPair = usersKeyPairs[1];
        const pda = subsPdas[0];
        let subInfo = await program.account.subscription.fetch(pda);
        let anotherSubInfo = await program.account.subscription.fetch(subsPdas[1]);
        console.log(`Current state of the subscription: ${JSON.stringify(subInfo, null, 2)}`);
        let err = null;
        const shouldWithdrawLamports = false;
        
        // as correct user with wrong mainState PDA
        try {
            await program.methods
                    .unsubscribe(shouldWithdrawLamports, {basic: {}})
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey, toAccount: null, mainStateOwner: provider.wallet.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let user use unsubscribe functionality with wrong mainState PDA");
        } catch(ex) { }

        // as fakeProvider (signer) with correct mainState PDA
        try {
            await program.methods
                    .unsubscribe(shouldWithdrawLamports, {basic: {}})
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, toAccount: null, mainStateOwner: provider.wallet.publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use unsubscribe functionality ");
        } catch(ex) { }
        if (err)  throw err;


        // as fakeProvider (signer) with wrong mainState PDA
        try {
            await program.methods
                    .unsubscribe(shouldWithdrawLamports, {basic: {}})
                    .accounts({mainState: fakeStatePDA, user: userKeyPair.publicKey, toAccount: null, mainStateOwner: provider.wallet.publicKey})
                    .signers([fakeProviders[0]])
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let fake provider use unsubscribe functionality ");
        } catch(ex) { }

        // as correct authority with correct mainState PDA
        try {
            await program.methods
                    .unsubscribe(shouldWithdrawLamports, {basic: {}})
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, toAccount: null, mainStateOwner: provider.wallet.publicKey})
                    .rpc({skipPreflight: true});
            err = new Error("Should not have let real provider use unsubscribe functionality ");
        } catch(ex) { }

        // as correct user with correct mainState PDA
        try {
            await program.methods
                    .unsubscribe(shouldWithdrawLamports, {basic: {}})
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey, toAccount: null, mainStateOwner: provider.wallet.publicKey})
                    .signers([userKeyPair])
                    .rpc({skipPreflight: true});
            console.log(`unsubscribe was successful, previous state of subscription: ${JSON.stringify(subInfo, null, 2)} \n new state of the subscription: ${JSON.stringify(await program.account.subscription.fetch(pda), null, 2)}`);
        } catch(ex) {
            console.log(ex);
            throw new Error("Should have let correct user use unsubscribe functionality");
        }
        // as correct other user with correct mainState PDA
        try {
            await program.methods
                    .unsubscribe(shouldWithdrawLamports, {basic: {}})
                    .accounts({mainState: mainStatePDA, user: anotherUserKeyPair.publicKey, toAccount: null, mainStateOwner: provider.wallet.publicKey})
                    .signers([anotherUserKeyPair])
                    .rpc({skipPreflight: true});
            console.log(`unsubscribe was successful, previous state of subscription: ${JSON.stringify(anotherSubInfo, null, 2)} \n new state of the subscription: ${JSON.stringify(await program.account.subscription.fetch(subsPdas[1]), null, 2)}`);
        } catch(ex) {
            console.log(ex);
            throw new Error("Should have let correct user use unsubscribe functionality");
        }
    });
});