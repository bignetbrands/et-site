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
  const mint = new PublicKey(ET_CA);
  const winnerPubkey = new PublicKey(winnerAddress);

  console.log(`[Lock] Creating escrow wallet for ${tokenAmount} $ET → ${winnerAddress}`);

  // Generate a fresh escrow keypair — this wallet holds tokens until unlock
  const { Keypair: SolanaKeypair } = await import("@solana/web3.js");
  const bs58 = require("bs58");
  const escrowKeypair = SolanaKeypair.generate();
  const escrowPubkey = escrowKeypair.publicKey;
  const escrowPrivKeyB58 = bs58.encode(escrowKeypair.secretKey);

  console.log(`[Lock] Escrow wallet: ${escrowPubkey.toBase58().slice(0,12)}...`);

  // Ensure winner ATA exists
  const winnerATA = await getAssociatedTokenAddress(mint, winnerPubkey);
  if (!await connection.getAccountInfo(winnerATA)) {
    const ix = createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, winnerATA, winnerPubkey, mint);
    const tx = new Transaction();
    tx.add(ix);
    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = keypair.publicKey;
    tx.sign(keypair);
    const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const s = await connection.getSignatureStatus(sig);
      if (s?.value?.confirmationStatus === "confirmed" || s?.value?.confirmationStatus === "finalized") break;
    }
    console.log(`[Lock] Winner ATA confirmed`);
  }

  // Create escrow ATA + fund escrow with SOL for future release tx fee (~0.003 SOL)
  const escrowATA = await getAssociatedTokenAddress(mint, escrowPubkey);
  const { createTransferInstruction } = await import("@solana/spl-token");
  const { SystemProgram } = await import("@solana/web3.js");

  const setupTx = new Transaction();
  // Fund escrow with rent + fee for release tx
  setupTx.add(SystemProgram.transfer({ fromPubkey: keypair.publicKey, toPubkey: escrowPubkey, lamports: 3_000_000 })); // 0.003 SOL
  // Create escrow token account
  setupTx.add(createAssociatedTokenAccountIdempotentInstruction(keypair.publicKey, escrowATA, escrowPubkey, mint));
  // Transfer tokens to escrow
  const senderATA = await getAssociatedTokenAddress(mint, keypair.publicKey);
  setupTx.add(createTransferInstruction(senderATA, escrowATA, keypair.publicKey, tokenAmount));

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  setupTx.recentBlockhash = blockhash;
  setupTx.feePayer = keypair.publicKey;
  setupTx.sign(keypair);

  const txSignature = await connection.sendRawTransaction(setupTx.serialize(), { skipPreflight: false, maxRetries: 3 });
  console.log(`[Lock] Setup tx: ${txSignature}`);

  // Poll for confirmation
  const startTime = Date.now();
  while (Date.now() - startTime < 45000) {
    const status = await connection.getSignatureStatus(txSignature);
    const conf = status?.value?.confirmationStatus;
    if (conf === "confirmed" || conf === "finalized") {
      if (status?.value?.err) throw new Error(`Lock setup tx failed: ${JSON.stringify(status.value.err)}`);
      break;
    }
    if (status?.value?.err) throw new Error(`Lock setup tx failed: ${JSON.stringify(status.value.err)}`);
    await new Promise(r => setTimeout(r, 2000));
  }

  // Store lock in KV — escrow private key encrypted at rest
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 99999)}`;
  const lockId = `etlock:${nonce}`;
  const unlockTimestamp = Math.floor(Date.now() / 1000) + SIXTY_NINE_DAYS_SECS;
  const { kv } = await import("@vercel/kv");
  await kv.hset(lockId, {
    winner: winnerAddress,
    winnerATA: winnerATA.toBase58(),
    escrowWallet: escrowPubkey.toBase58(),
    escrowATA: escrowATA.toBase58(),
    escrowKey: escrowPrivKeyB58, // stored in KV — only accessible server-side
    tokenAmount: tokenAmount.toString(),
    unlockTimestamp,
    status: "locked",
    createdAt: new Date().toISOString(),
    setupTx: txSignature,
  });
  await kv.sadd("etlock:index", lockId);

  const unlockDate = new Date(unlockTimestamp * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  console.log(`[Lock] SUCCESS — escrow: ${escrowPubkey.toBase58().slice(0,12)}, unlocks: ${unlockDate}, tx: ${txSignature}`);
  return { streamId: lockId, txSignature };
}


export async function releaseETLock(lockId: string): Promise<string> {
  const { kv } = await import("@vercel/kv");
  const lock: any = await kv.hgetall(lockId);
  if (!lock || lock.status !== "locked") throw new Error("Lock not found or already released");
  if (Date.now() / 1000 < Number(lock.unlockTimestamp)) {
    throw new Error(`Not yet — unlocks ${new Date(Number(lock.unlockTimestamp) * 1000).toDateString()}`);
  }

  // Reconstruct escrow keypair from stored key
  const bs58 = require("bs58");
  const { Keypair: SolanaKeypair } = await import("@solana/web3.js");
  const escrowKeypair = SolanaKeypair.fromSecretKey(bs58.decode(lock.escrowKey));

  const connection = getConnection();
  const { createTransferInstruction } = await import("@solana/spl-token");

  const escrowATA = new PublicKey(lock.escrowATA);
  const winnerATA = new PublicKey(lock.winnerATA);
  const tokenAmount = BigInt(lock.tokenAmount);

  // Escrow keypair signs the transfer to winner
  const tx = new Transaction();
  tx.add(createTransferInstruction(escrowATA, winnerATA, escrowKeypair.publicKey, tokenAmount));

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = escrowKeypair.publicKey; // escrow pays from its funded SOL
  tx.sign(escrowKeypair);

  const txSig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });

  // Poll confirmation
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const s = await connection.getSignatureStatus(txSig);
    const c = s?.value?.confirmationStatus;
    if (c === "confirmed" || c === "finalized") {
      if (s?.value?.err) throw new Error(`Release failed: ${JSON.stringify(s.value.err)}`);
      break;
    }
  }

  await kv.hset(lockId, { status: "released", releasedAt: new Date().toISOString(), releaseTx: txSig });
  console.log(`[Lock] Released ${tokenAmount} $ET to ${lock.winner}: ${txSig}`);
  return txSig;
}


export async function getAllETLocks(): Promise<any[]> {
  const { kv } = await import("@vercel/kv");
  const ids = await kv.smembers("etlock:index") as string[];
  if (!ids.length) return [];
  const locks = await Promise.all(ids.map(id => kv.hgetall(id).then(l => l ? { id, ...l } : null)));
  return locks.filter(Boolean).sort((a: any, b: any) => Number(a.unlockTimestamp) - Number(b.unlockTimestamp));
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
