import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";

import { PredictionMarket } from "../target/types/prediction_market";
import { PublicKey, SystemProgram, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createMint, getAccount, getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
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
  let marketPda: PublicKey;
  let vaultPda: PublicKey;
  let outcomeAMint: PublicKey;
  let outcomeBMint: PublicKey;
  let authority: Keypair;
  let user: Keypair;
  let collateralMint: PublicKey;

  it("Is initialized!", async () => {
    const provider = anchor.getProvider();
    authority = Keypair.generate();
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
    vaultPda = PublicKey.findProgramAddressSync([Buffer.from("vault"), marketIdLe], program.programId)[0];
    outcomeAMint = PublicKey.findProgramAddressSync([Buffer.from("outcome_a"), marketIdLe], program.programId)[0];
    outcomeBMint = PublicKey.findProgramAddressSync([Buffer.from("outcome_b"), marketIdLe], program.programId)[0];
    marketPda = PublicKey.findProgramAddressSync([Buffer.from("market"), marketIdLe], program.programId)[0];

    collateralMint = await createMint(provider.connection, authority, authority.publicKey, null, 6);
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

  it("Can split tokens", async () => {
    user = Keypair.generate();
    const airdropTx = await provider.connection.requestAirdrop(user.publicKey, 10 * LAMPORTS_PER_SOL);
    while(1) {
      const balance = await provider.connection.getBalance(user.publicKey);
      if (balance > 0) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    // MINT 1 USDC TO USER
    const userCollateralAccount = await getOrCreateAssociatedTokenAccount(provider.connection, user, collateralMint, user.publicKey);
    const userOutcomeAAccount = await getOrCreateAssociatedTokenAccount(provider.connection, user, outcomeAMint, user.publicKey);
    const userOutcomeBAccount = await getOrCreateAssociatedTokenAccount(provider.connection, user, outcomeBMint, user.publicKey);
    const mintTokenTx = await mintTo(
      provider.connection,
      authority,
      collateralMint,
      userCollateralAccount.address,
      authority,
      1000000
    );
    await new Promise((resolve) => setTimeout(resolve, 20000));

    const tx = await program.methods.splitTokens(1, new anchor.BN(1000000))
    .accounts({
      user: user.publicKey,
      userCollateral: userCollateralAccount.address,
      collateralVault: vaultPda,
      outcomeAMint: outcomeAMint,
      outcomeBMint: outcomeBMint,
      userOutcomeA: userOutcomeAAccount.address,
      userOutcomeB: userOutcomeBAccount.address,
      market: marketPda,
    })
    .signers([user])
    .rpc();
    
    const vaultUsdcBalance = await provider.connection.getTokenAccountBalance(vaultPda);
    expect(vaultUsdcBalance.value.amount.toString()).to.equal("1000000");
    const outcomeABalance = await provider.connection.getTokenAccountBalance(userOutcomeAAccount.address);
    expect(outcomeABalance.value.amount.toString()).to.equal("1000000");
    const outcomeBBalance = await provider.connection.getTokenAccountBalance(userOutcomeBAccount.address);
    expect(outcomeBBalance.value.amount.toString()).to.equal("1000000");
  });
});
