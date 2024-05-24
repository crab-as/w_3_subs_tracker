import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { W3SubsTracker } from "../target/types/w_3_subs_tracker";
import { Keypair, PublicKey } from "@solana/web3.js";


describe("main_state", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()

  anchor.setProvider(provider);

  // const programId = anchor.workspace.w3_subs_tracker as Program<W3SubsTracker>;
  
  const idl = require("../target/idl/w_3_subs_tracker.json") as any;
  const program = new anchor.Program(idl, provider) as Program<W3SubsTracker>;
  const keypair = anchor.web3.Keypair.generate();

  const [pda, _] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from('mainState')], program.programId);
  
  it("The PDA should be initialized!", async () => {
    // Add your test here.
    const tx = await program.methods
    .intializeMainState()
    .accounts({
      mainState: pda,
    })
    .rpc();
    // show the main state
    const mainState = await program.account.mainState.fetch(pda);
  });

  it('Should load the main state with correct authority value', async () => {
    const mainState = await program.account.mainState.fetch(pda);
    if( mainState.authority.toBase58() !== provider.wallet.publicKey.toBase58() ) {
      throw new Error("Authority is not the same as the provider's pubkey");
    }
  });

  it('Should change the authority (correct signer)', async () => {
    const tx = await program.methods
      .updateAuthority(keypair.publicKey)
      .accounts({
        mainState: pda
      })
      .rpc();
    const mainState = await program.account.mainState.fetch(pda);
    if (mainState.authority.toBase58() !== keypair.publicKey.toString()) {
      throw new Error("Authority is not the same as the provider's pubkey");
    }
  });

  it('Should change the owner (correct signer) and then back to original owner (unauthorised signer)', async () => {
    const tx = await program.methods
      .updateOwner(keypair.publicKey)
      .accounts({mainState: pda})
      .rpc();
    const mainState = await program.account.mainState.fetch(pda);
    if (mainState.owner.toBase58() !== keypair.publicKey.toBase58()) {
      throw new Error("Owner is not the same as the provider's pubkey");
    }

    const tx2 = await program.methods
      .updateOwner(provider.wallet.publicKey)
      .accounts({mainState: pda, signer: keypair.publicKey})
      .signers([keypair])
      .rpc();
    const mainState2 = await program.account.mainState.fetch(pda);
    if (mainState2.owner.toBase58() !== provider.wallet.publicKey.toBase58()) {
      throw new Error("Owner is not the same as the provider's pubkey");
    }
  });

  it('Should change the owner (correct signer), but will not go back to the original owner (unauthorised signer)', async () => {
    const tx = await program.methods
      .updateOwner(keypair.publicKey)
      .accounts({ mainState: pda })
      .rpc();
    const mainState = await program.account.mainState.fetch(pda);
    if (mainState.owner.toBase58() !== keypair.publicKey.toBase58()) {
      throw new Error("Owner is not the same as the provider's pubkey");
    }

    const userAttemptor = await anchor.web3.Keypair.generate();
    try {
      const tx2 = await program.methods
        .updateOwner(userAttemptor.publicKey)
        .accounts({ mainState: pda, signer: userAttemptor.publicKey })
        .signers([userAttemptor])
        .rpc();
      throw new Error("User with no permission was able to change the owner");
    } catch (e) {
      // all good
      const mainState = await program.account.mainState.fetch(pda);
    }


  });

  it('Should\'t change the authority ( unauthorised signer)', async () => {
    try {
      const tx = await program.methods
      .updateOwner(keypair.publicKey)
      .accounts({ mainState: pda })
      .signers([keypair])
      .rpc();
      if(tx) {
        throw new Error("User with no permission was able to change the owner");
      }
    } catch (e) {
      // all good
    }

  })


});


