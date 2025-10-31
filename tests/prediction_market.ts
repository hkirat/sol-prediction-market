import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";

import { PredictionMarket } from "../target/types/prediction_market";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { expect } from "chai";

describe("prediction_market", () => {
  // Configure the client to use the local cluster with confirmed commitment.
  const envProvider = anchor.AnchorProvider.env();
  const provider = new anchor.AnchorProvider(envProvider.connection, envProvider.wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.predictionMarket as Program<PredictionMarket>;

  it("Is initialized!", async () => {
    const provider = anchor.getProvider();
    const authority = Keypair.generate();
    const airdropTx = await provider.connection.requestAirdrop(authority.publicKey, 10 * LAMPORTS_PER_SOL);

    while(1) {
      const balance = await provider.connection.getBalance(authority.publicKey);
      if (balance > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const marketId = 1;
    const marketIdLe = Buffer.from([1, 0, 0, 0])
    const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault"), marketIdLe], program.programId);
    const [outcomeAMint] = PublicKey.findProgramAddressSync([Buffer.from("outcome_a"), marketIdLe], program.programId);
    const [outcomeBMint] = PublicKey.findProgramAddressSync([Buffer.from("outcome_b"), marketIdLe], program.programId);
    const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from("market"), marketIdLe], program.programId);

    const collateralMint = await createMint(provider.connection, authority, authority.publicKey, null, 6);
    const mintAccount = await provider.connection.getAccountInfo(collateralMint);
    if (!mintAccount) {
      throw new Error("Mint account not found");
    }

    await new Promise((resolve) => setTimeout(resolve, 20000));
    // Add your test here.
    const tx = await program.methods.initializeMarket(1, new anchor.BN(new Date().getTime() + 1000 * 60 * 60 * 24 * 30))
    .accounts({
      authority: provider.wallet.publicKey,
      collateralMint: collateralMint,
    })
    .rpc();
    console.log(tx);
    const txInfo = await provider.connection.getTransaction(tx, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    console.log(txInfo);

    const market = await anchor.workspace.predictionMarket.account.market.fetchNullable(marketPda);
    expect(market).to.not.be.null;
    expect(market?.marketId).to.equal(marketId);
    expect(market?.authority.toString()).to.equal(provider.wallet.publicKey.toString());
    expect(market?.collateralMint.toString()).to.equal(collateralMint.toString());
    expect(market?.collateralVault.toString()).to.equal(vaultPda.toString());
    expect(market?.outcomeAMint.toString()).to.equal(outcomeAMint.toString());
    expect(market?.outcomeBMint.toString()).to.equal(outcomeBMint.toString());
    expect(market?.isSettled).to.be.false;
  });
});
