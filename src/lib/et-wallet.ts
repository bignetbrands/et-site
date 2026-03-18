import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
// BN imported from Streamflow to avoid version conflicts

const ET_CA = "A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF";
const SIXTY_NINE_DAYS_SECS = 69 * 24 * 60 * 60;

function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("SOLANA_RPC_URL not set");
  // wsEndpoint: "" disables WebSocket — Vercel can't use WS (b.mask error)
  // All confirmation uses HTTP polling via getSignatureStatus
  return new Connection(rpc, { commitment: "confirmed", wsEndpoint: "" });
}

function getKeypair(): Keypair {
  const key = process.env.ET_WALLET_PRIVATE_KEY;
  if (!key) throw new Error("ET_WALLET_PRIVATE_KEY not set");
  try {
    return Keypair.fromSecretKey(bs58.decode(key));
  } catch {
    throw new Error("ET_WALLET_PRIVATE_KEY is invalid — must be base58 encoded secret key");
  }
}

export function getETWalletAddress(): string {
  return getKeypair().publicKey.toBase58();
}

export async function getETWalletBalance(): Promise<number> {
  const connection = getConnection();
  const keypair = getKeypair();
  const balance = await connection.getBalance(keypair.publicKey);
  return balance / LAMPORTS_PER_SOL;
}

export async function sendSol(toAddress: string, solAmount: number): Promise<string> {
  const connection = getConnection();
  const keypair = getKeypair();
  const toPubkey = new PublicKey(toAddress);
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  const balance = await connection.getBalance(keypair.publicKey);
  if (balance < lamports + 5000) {
    throw new Error(`Insufficient balance. Has ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL, needs ${solAmount} SOL`);
  }

  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey, lamports })
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [keypair], { commitment: "confirmed" });
  console.log(`[ET Wallet] Sent ${solAmount} SOL to ${toAddress} — tx: ${sig}`);
  return sig;
}

export async function swapSolForET(solAmount: number): Promise<{ txSignature: string; tokenAmount: bigint }> {
  const connection = getConnection();
  const keypair = getKeypair();
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  console.log(`[ET Wallet] Swapping ${solAmount} SOL for $ET via Jupiter...`);

  const JUP_HEADERS = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "etsearch.fun/1.0",
  };

  // Step 1 — Get order from Jupiter Ultra lite API
  const orderUrl = `https://lite-api.jup.ag/ultra/v1/order?inputMint=So11111111111111111111111111111111111111112&outputMint=${ET_CA}&amount=${lamports}&taker=${keypair.publicKey.toBase58()}`;
  let orderData: any;
  try {
    const orderRes = await fetch(orderUrl, { headers: JUP_HEADERS });
    if (!orderRes.ok) throw new Error(`HTTP ${orderRes.status}: ${await orderRes.text()}`);
    orderData = await orderRes.json();
  } catch (e: any) {
    throw new Error(`Jupiter Ultra order failed: ${e?.message || e}`);
  }
  if (!orderData.transaction || !orderData.requestId) {
    throw new Error(`Jupiter Ultra order missing transaction/requestId: ${JSON.stringify(orderData)}`);
  }
  console.log(`[ET Wallet] Jupiter Ultra order: ~${orderData.outAmount} raw $ET, requestId: ${orderData.requestId}`);

  // Step 2 — Sign the transaction
  const tx = VersionedTransaction.deserialize(Buffer.from(orderData.transaction, "base64"));
  tx.sign([keypair]);
  const signedTxBase64 = Buffer.from(tx.serialize()).toString("base64");

  // Step 3 — Execute via Ultra
  let executeData: any;
  try {
    const execRes = await fetch("https://lite-api.jup.ag/ultra/v1/execute", {
      method: "POST",
      headers: JUP_HEADERS,
      body: JSON.stringify({ signedTransaction: signedTxBase64, requestId: orderData.requestId }),
    });
    if (!execRes.ok) throw new Error(`HTTP ${execRes.status}: ${await execRes.text()}`);
    executeData = await execRes.json();
  } catch (e: any) {
    throw new Error(`Jupiter Ultra execute failed: ${e?.message || e}`);
  }

  if (executeData.status !== "Success") {
    throw new Error(`Jupiter Ultra swap failed (${executeData.code}): ${executeData.error || JSON.stringify(executeData)}`);
  }
  const txSignature = executeData.signature;
  // outputAmountResult is the actual tokens received from the execute response
  const receivedAmount = executeData.outputAmountResult || orderData.outAmount;
  console.log(`[ET Wallet] Jupiter Ultra swap done — tx: ${txSignature}, received: ${receivedAmount} raw $ET`);

  // Use outputAmountResult from execute response as the authoritative amount
  let tokenAmount = BigInt(receivedAmount || 0);

  // Also try reading from ATA to confirm (non-blocking, best effort)
  if (!tokenAmount || tokenAmount === BigInt(0)) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await new Promise(r => setTimeout(r, 2000));
        const ata = await getAssociatedTokenAddress(new PublicKey(ET_CA), keypair.publicKey);
        const acct = await getAccount(connection, ata);
        if (acct.amount > BigInt(0)) { tokenAmount = acct.amount; break; }
      } catch { /* keep retrying */ }
    }
  }

  if (!tokenAmount || tokenAmount === BigInt(0)) {
    throw new Error(`Token amount is zero after swap — check Solscan and use manual lock with raw token amount.`);
  }

  console.log(`[ET Wallet] Token amount to lock: ${tokenAmount}`);
  return { txSignature, tokenAmount };
}

export async function ensureWinnerATA(winnerAddress: string): Promise<string> {
  const keypair = getKeypair();
  const connection = getConnection();
  const tokenMint = new PublicKey(ET_CA);
  const winnerPubkey = new PublicKey(winnerAddress);
  const ata = await getAssociatedTokenAddress(tokenMint, winnerPubkey);
  try {
    const ataIx = createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, ata, winnerPubkey, tokenMint);
    const tx = new Transaction();
    tx.add(ataIx);
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = keypair.publicKey;
    tx.sign(keypair);
    await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    console.log(`[ET Wallet] Winner ATA ensured: ${ata.toBase58()}`);
  } catch (e: any) {
    console.warn(`[ET Wallet] ATA note (may already exist): ${e?.message}`);
  }
  return ata.toBase58();
}

export async function lockETForWinner(
  winnerAddress: string,
  tokenAmount: bigint
): Promise<{ streamId: string; txSignature: string }> {
  const keypair = getKeypair();
  const connection = getConnection();
  console.log(`[Lock] start — ${tokenAmount} tokens for ${winnerAddress}`);

  const mint = new PublicKey(ET_CA);
  const winnerPubkey = new PublicKey(winnerAddress);

  // Ensure all required ATAs exist
  const requiredOwners = [
    { key: "5SEpbdjFK5FxwTvfsGMXVQTD2v4M2c5tyRTxhdsPkgDw", label: "Treasury" },
    { key: "wdrwhnCv4pzW8beKsbPa4S2UDZrXenjg16KJdKSpb5u", label: "Withdrawor" },
    { key: winnerAddress, label: "Winner" },
    { key: keypair.publicKey.toBase58(), label: "ET wallet" },
  ];
  for (const { key, label } of requiredOwners) {
    try {
      const owner = new PublicKey(key);
      const ataAddr = await getAssociatedTokenAddress(mint, owner);
      const info = await connection.getAccountInfo(ataAddr);
      if (!info) {
        const ix = createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, ataAddr, owner, mint);
        const tx = new Transaction();
        tx.add(ix);
        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = keypair.publicKey;
        tx.sign(keypair);
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const s = await connection.getSignatureStatus(sig);
          const c = s?.value?.confirmationStatus;
          if (c === "confirmed" || c === "finalized") { console.log(`[Lock] ${label} ATA confirmed`); break; }
        }
      } else { console.log(`[Lock] ${label} ATA exists`); }
    } catch (e: any) { console.warn(`[Lock] ATA ${label}: ${e?.message}`); }
  }

  // Build Streamflow create instruction MANUALLY using old layout (without pausable/canUpdateRate Option bytes)
  // SDK 11.2.1 adds _pausable_discriminator bytes that the on-chain program doesn't know about
  const { Keypair: SolanaKeypair, SystemProgram, SYSVAR_RENT_PUBKEY, TransactionInstruction: TxIx, PublicKey: PK } = await import("@solana/web3.js");
  const bufferLayout = require("buffer-layout");
  const { createHash } = require("crypto");

  const STREAMFLOW_PROGRAM = new PublicKey("strmRqUCoQUgGUan5YhzUZa6KqdzwX5L6FpUxfmKg5m");
  const STREAMFLOW_TREASURY = new PublicKey("5SEpbdjFK5FxwTvfsGMXVQTD2v4M2c5tyRTxhdsPkgDw");
  const WITHDRAWOR = new PublicKey("wdrwhnCv4pzW8beKsbPa4S2UDZrXenjg16KJdKSpb5u");
  const FEE_ORACLE = new PublicKey("B743wFVk2pCYhV91cn287e1xY7f1vt4gdY48hhNiuQmT");
  const { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID: ASSOC_TOKEN_PROG } = await import("@solana/spl-token");

  // Fresh metadata keypair
  const metadata = SolanaKeypair.generate();
  const metadataPubkey = metadata.publicKey;

  // Derive escrow tokens PDA
  const [escrowTokens] = PublicKey.findProgramAddressSync(
    [Buffer.from("strm"), metadataPubkey.toBuffer()],
    STREAMFLOW_PROGRAM
  );

  const senderTokens = await getAssociatedTokenAddress(mint, keypair.publicKey);
  const recipientTokens = await getAssociatedTokenAddress(mint, winnerPubkey);
  const treasuryTokens = await getAssociatedTokenAddress(mint, STREAMFLOW_TREASURY);
  const partnerTokens = senderTokens; // ET wallet is both sender and partner

  const now = Math.floor(Date.now() / 1000);
  const streamName = `ET Reward ${Math.floor(Math.random() * 1000000)}`;
  // OLD layout without Option discriminator bytes for pausable/canUpdateRate
  const layout = bufferLayout.struct([
    bufferLayout.blob(8, "start_time"),
    bufferLayout.blob(8, "net_amount_deposited"),
    bufferLayout.blob(8, "period"),
    bufferLayout.blob(8, "amount_per_period"),
    bufferLayout.blob(8, "cliff"),
    bufferLayout.blob(8, "cliff_amount"),
    bufferLayout.u8("cancelable_by_sender"),
    bufferLayout.u8("cancelable_by_recipient"),
    bufferLayout.u8("automatic_withdrawal"),
    bufferLayout.u8("transferable_by_sender"),
    bufferLayout.u8("transferable_by_recipient"),
    bufferLayout.u8("can_topup"),
    bufferLayout.blob(64, "stream_name"),
    bufferLayout.blob(8, "withdraw_frequency"),
  ]);

  const nameBytes = Buffer.alloc(64);
  Buffer.from(streamName).copy(nameBytes);

  const toLE8 = (n: number | bigint) => {
    // Write as 64-bit little-endian using Buffer arithmetic
    const buf = Buffer.alloc(8);
    let val = typeof n === "bigint" ? n : BigInt(Math.floor(Number(n)));
    const mask = BigInt(0xff);
    const eight = BigInt(8);
    for (let i = 0; i < 8; i++) { buf[i] = Number(val & mask); val = val >> eight; }
    return buf;
  };

  let dataBuffer = Buffer.alloc(layout.span);
  layout.encode({
    start_time: toLE8(now + 60),
    net_amount_deposited: toLE8(tokenAmount),
    period: toLE8(1),
    amount_per_period: toLE8(0),
    cliff: toLE8(now + 60 + SIXTY_NINE_DAYS_SECS),
    cliff_amount: toLE8(tokenAmount),
    cancelable_by_sender: 0,
    cancelable_by_recipient: 0,
    automatic_withdrawal: 0,
    transferable_by_sender: 0,
    transferable_by_recipient: 0,
    can_topup: 0,
    stream_name: nameBytes,
    withdraw_frequency: toLE8(1),
  }, dataBuffer);

  const discriminator = createHash("sha256").update("global:create").digest().slice(0, 8);
  const ixData = Buffer.concat([discriminator, dataBuffer, Buffer.alloc(10)]);

  const ix = new TxIx({
    programId: STREAMFLOW_PROGRAM,
    keys: [
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: senderTokens, isSigner: false, isWritable: true },
      { pubkey: winnerPubkey, isSigner: false, isWritable: true },
      { pubkey: metadataPubkey, isSigner: true, isWritable: true },
      { pubkey: escrowTokens, isSigner: false, isWritable: true },
      { pubkey: recipientTokens, isSigner: false, isWritable: true },
      { pubkey: STREAMFLOW_TREASURY, isSigner: false, isWritable: true },
      { pubkey: treasuryTokens, isSigner: false, isWritable: true },
      { pubkey: WITHDRAWOR, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: partnerTokens, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: FEE_ORACLE, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      { pubkey: STREAMFLOW_PROGRAM, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOC_TOKEN_PROG, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: ixData,
  });

  const tx = new Transaction();
  tx.add(ix);
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = keypair.publicKey;
  tx.sign(keypair, metadata);

  console.log(`[Lock] Sending manual create tx — metadata: ${metadataPubkey.toBase58().slice(0,8)}, stream: ${streamName}`);
  const txSignature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 5 });
  console.log(`[Lock] tx sent: ${txSignature} — polling...`);

  const startTime = Date.now();
  while (Date.now() - startTime < 45000) {
    const status = await connection.getSignatureStatus(txSignature);
    const conf = status?.value?.confirmationStatus;
    if (conf === "confirmed" || conf === "finalized") {
      if (status?.value?.err) throw new Error(`Lock tx failed: ${JSON.stringify(status.value.err)}`);
      console.log(`[Lock] SUCCESS — stream: ${metadataPubkey.toBase58()}, tx: ${txSignature}`);
      return { streamId: metadataPubkey.toBase58(), txSignature };
    }
    if (status?.value?.err) throw new Error(`Lock tx failed: ${JSON.stringify(status.value.err)}`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Lock tx not confirmed in 45s — sig: ${txSignature}`);
}

export async function sendSplitReward(
  winnerAddress: string,
  totalSolAmount: number
): Promise<{
  solTxSignature: string;
  swapTxSignature: string;
  streamId: string;
  lockTxSignature: string;
  solSent: number;
  solSwapped: number;
}> {
  const half = Math.round((totalSolAmount / 2) * 1000) / 1000;
  console.log(`[ET Wallet] Split reward: ${half} SOL direct + ${half} SOL swapped to $ET locked 69d`);

  const solTxSignature = await sendSol(winnerAddress, half);
  const { txSignature: swapTxSignature, tokenAmount } = await swapSolForET(half);
  const { streamId, txSignature: lockTxSignature } = await lockETForWinner(winnerAddress, tokenAmount);

  return { solTxSignature, swapTxSignature, streamId, lockTxSignature, solSent: half, solSwapped: half };
}

export function pickRewardAmount(): number {
  const raw = 0.05 + Math.random() * 0.05;
  return Math.round(raw * 1000) / 1000;
}
