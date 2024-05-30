import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { W3SubsTracker } from "../target/types/w_3_subs_tracker";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { BN } from "bn.js";
import { use } from "chai";

describe("subscribe", async () => {
    async function wait(ms: number) {
        return new Promise(resolve => {
            setTimeout(resolve, ms);
        });
    }
    // Configure the client to use the local cluster.
    const provider = anchor.AnchorProvider.env()

    anchor.setProvider(provider);
    const fakeProvider = anchor.web3.Keypair.generate();
    
    const idl = require("../target/idl/w_3_subs_tracker.json") as any;
    const program = new anchor.Program(idl, provider) as Program<W3SubsTracker>;
    const usersKeyPairs = [anchor.web3.Keypair.generate(),  anchor.web3.Keypair.generate()];
        // , anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate(), anchor.web3.Keypair.generate()];

    const [mainStatePDA, _] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('mainState')], program.programId);
    const subsPdas = [];

    for(let i = 0; i < usersKeyPairs.length; i++) {
        const userKeyPair = usersKeyPairs[i];
        const [pda, _] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('subscription'), userKeyPair.publicKey.toBuffer(), mainStatePDA.toBuffer()], program.programId);
        subsPdas.push(pda);
    }


    it("The PDA should be initialized for subcribetion tests", async () => {
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
      });


    it('Should airdrop SOL to all users', async () => {
        for(let i = 0; i < usersKeyPairs.length; i++) {
            const userKeyPair = usersKeyPairs[i];
            const tx = await provider.connection.requestAirdrop(userKeyPair.publicKey, LAMPORTS_PER_SOL);
            await provider.connection.confirmTransaction(tx);
        }
    });
    
    it("Should create subcriptions", async () => {
        
        for(let i = 0; i < usersKeyPairs.length; i++) {
            const userKeyPair = usersKeyPairs[i];
            const d = {basic: {}};
            
            const tx = await program.methods

            .createSubscription(new BN(LAMPORTS_PER_SOL * 0.25), d)
            .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
            .signers([userKeyPair])
            .rpc();
            const pda = subsPdas[i];
            const subsInfo = await program.account.subscription.fetch(pda);
            const balance = await provider.connection.getBalance(pda);
            if (balance < LAMPORTS_PER_SOL * 0.25)  throw new Error("Balance is not correct");
        }   
    });

    it("Should make first user as active subcriber", async () => {
        const user1 = usersKeyPairs[0];
        const pda = subsPdas[0];
        const futureDate = new BN(Date.now() + 1000 * 60 * 60 * 24 * 30);
        await program.methods
            .setSubscriptionInfo(new BN(futureDate), null, null)
            .accounts({
                mainState: mainStatePDA, 
                authority: provider.wallet.publicKey,
                user: user1.publicKey
            })
            .rpc();
        const subsInfo = await program.account.subscription.fetch(pda);
    });

    it("Shouldn't let make second user as active subcriber, due to fakeProvider, but after changing authority it will change it's valid_till", async () => {
        const user2 = usersKeyPairs[1];
        const pda = subsPdas[1];
        const futureDate = new BN(Date.now() + 1000 * 60 * 60 * 24 * 30);
        let err = null;
        try {
            await program.methods
                .setSubscriptionInfo(new BN(futureDate), null , null)
                .accounts({
                    mainState: mainStatePDA, 
                    authority: fakeProvider.publicKey,
                    user: user2.publicKey
                })
                .signers([fakeProvider])
                .rpc();
            err = "Shouldn't let make second user as active subcriber, due to fakeProvider";
        } catch (error) {
            const tx = await program.methods
                .updateAuthority(fakeProvider.publicKey)
                .accounts({
                    mainState: mainStatePDA
                })
                .rpc();
            await program.methods
                .setSubscriptionInfo(new BN(futureDate), null, null)
                .accounts({
                    mainState: mainStatePDA, 
                    authority: fakeProvider.publicKey,
                    user: user2.publicKey
                })
                .signers([fakeProvider])
                .rpc();
            const tx1 = await program.methods
                .updateAuthority(provider.wallet.publicKey)
                .accounts({
                    mainState: mainStatePDA
                })
                .rpc();
        }
        if (err) throw new Error(err);
    })  

    it("Should let user funds his subs PDA account", async () => {
        const user1 = usersKeyPairs[0];
        const pda = subsPdas[0];
        const tx = await program.methods
            .fundSubscription(new BN(LAMPORTS_PER_SOL * 0.25))
            .accounts({mainState: mainStatePDA, user: user1.publicKey})
            .signers([user1])
            .rpc();
        

        const subsInfo = await program.account.subscription.fetch(pda);
        const balance = await provider.connection.getBalance(pda);
        if (balance < LAMPORTS_PER_SOL * 0.5)  throw new Error("Balance is not correct");
    })

    it("Should not withdraw any funds from PDA account as authority because they are used as credits", async () => {
        const user1 = usersKeyPairs[0];
        const pda = subsPdas[0];
        const pdaInfo = await program.account.subscription.fetch(pda);
        const balancePdaBefore = await provider.connection.getBalance(pda);
        const beforeBalance = await provider.connection.getBalance(provider.publicKey);
        let error = null;
        try {
            const tx = await program.methods
                .withdraw(new BN(LAMPORTS_PER_SOL * 0.1))
                .accounts({mainState: mainStatePDA, user: user1.publicKey,
                        authority: provider.publicKey, toAccount: provider.publicKey})
                .rpc();
            error = "Should not withdraw any funds from PDA account as authority because they are used as credits";

        } catch (error) {}
        if (error) throw new Error(error);
        const balanceOfPdaBefore = await provider.connection.getBalance(pda);
        const tx1 = await program.methods
            .withdraw(null)
            .accounts({mainState: mainStatePDA, user: user1.publicKey,
                    authority: provider.publicKey, toAccount: provider.publicKey})
            .rpc();
        const balanceOfPdaAfter = await provider.connection.getBalance(pda);

        if (balanceOfPdaAfter !== balanceOfPdaBefore) throw new Error("Balance is not correct");
    })
    it("Shouldn't let withdraw funds from PDA account as user or as fakeProvider", async () => {
        const user2 = usersKeyPairs[1];
        const pda = subsPdas[1];
        const pdaInfo = await program.account.subscription.fetch(pda);
        const beforeBalance = await provider.connection.getBalance(provider.publicKey);
        let err = null;

        await program.methods
            .setSubscriptionInfo(new BN(Date.now() + 1000), new BN(LAMPORTS_PER_SOL * 0.1), null)
            .accounts({mainState: mainStatePDA, user: user2.publicKey, authority: provider.wallet.publicKey})
            .rpc();
        await wait(2000);
        try {
            const tx = await program.methods
                .withdraw(new BN(LAMPORTS_PER_SOL * 0.1))
                .accounts({mainState: mainStatePDA, user: user2.publicKey,
                        authority: provider.publicKey, toAccount: user2.publicKey})
                .signers([user2])
                .rpc();
            err = "Shouldn't let withdraw funds from PDA account as user";
        } catch (error) {
            if (err) throw new Error(err);
            try {
                const tx = await program.methods
                    .withdraw(new BN(LAMPORTS_PER_SOL * 0.1))
                    .accounts({mainState: mainStatePDA, user: user2.publicKey,
                            authority: provider.publicKey, toAccount: fakeProvider.publicKey})
                    .signers([fakeProvider])
                    .rpc();
                err = "Shouldn't let withdraw funds from PDA account as fakeProvider";
            } catch (error) {
            }
        }
        try {
            const tx = await program.methods
                .withdraw(new BN(LAMPORTS_PER_SOL * 0.1))
                .accounts({mainState: mainStatePDA, user: user2.publicKey,
                        authority: user2.publicKey, toAccount: user2.publicKey})
                .signers([user2])
                .rpc();
            err = "Shouldn't let withdraw funds from PDA account as user";
        } catch (error) {
            if (err) throw new Error(err);
            try {
                const tx = await program.methods
                    .withdraw(new BN(LAMPORTS_PER_SOL * 0.1))
                    .accounts({mainState: mainStatePDA, user: user2.publicKey,
                            authority: fakeProvider.publicKey, toAccount: fakeProvider.publicKey})
                    .signers([fakeProvider])
                    .rpc();
                err = "Shouldn't let withdraw funds from PDA account as fakeProvider";
            } catch (error) {
            }
        }
        if (err) throw new Error(err);
    });

    

    
})

