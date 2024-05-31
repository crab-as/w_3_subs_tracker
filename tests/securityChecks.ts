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
                    .rpc();
                    err = new Error("Should not have initialized the fakeState with a fake provider");
        } catch {}
        if (err)  throw err;
        
        try {
                await program.methods
                        .intializeMainState(10)
                        .accounts({user: fakeProviders[0].publicKey})
                        .signers([fakeProviders[0]])
                        .rpc();
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
        console.log(`Fetched mainState: ${JSON.stringify(mainState)}`);
        if( mainState.authority.toBase58() !== provider.publicKey.toBase58() ) {
            throw new Error("Authority is not the same as the provider's pubkey");
        }
    });

    it("MainState authority should not be changed by anyone other than the owner", async () => {
        // at first change authority to some other legit provider
        const tx = await program.methods
                .updateAuthority(someOtherLegitProvider.publicKey)
                .accounts({mainState: mainStatePDA})
                .rpc();

        // revert it back
        const tx2 = await program.methods
                .updateAuthority(provider.publicKey)
                .accounts({mainState: mainStatePDA})
                .rpc();
        // now try to change authority with wrong owner
        let err = null;
        try {
            await program.methods
                    .updateAuthority(someOtherLegitProvider.publicKey)
                    .accounts({mainState: mainStatePDA})
                    .signers([fakeProviders[0]])
                    .rpc();
                    err = new Error("Should not have changed the authority with a fake provider");
        } catch {}
        if (err)  throw err;
        // now try to change authority with wrong owner 2
        try {
            await program.methods
                    .updateAuthority(someOtherLegitProvider.publicKey)
                    .accounts({mainState: mainStatePDA})
                    .signers([usersKeyPairs[0]])
                    .rpc();
                    err = new Error("Should not have changed the authority with a fake provider");
        } catch {}
        if (err)  throw err;

        const mainState = await program.account.mainState.fetch(mainStatePDA);
        console.log(`Fetched mainState: ${JSON.stringify(mainState)}`);
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
                .rpc();
        let err = null;
        // recreate the subs by same user
        try {
            await program.methods
                    .createSubscription(new BN(0.1 * LAMPORTS_PER_SOL), {premium: {}})
                    .accounts({mainState: mainStatePDA, user: userKeyPair.publicKey})
                    .signers([userKeyPair])
                    .rpc();
                    err = new Error("Should not have created the subscription twice, even by same user");
        } catch {}
        if (err)  throw err;

    });


});




