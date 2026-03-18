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
  createAssociatedTokenAccountIdempotent,
} from "@solana/spl-token";
import bs58 from "bs58";
// BN imported from Streamflow to avoid version conflicts

const ET_CA = "A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF";
const SIXTY_NINE_DAYS_SECS = 69 * 24 * 60 * 60;

function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("SOLANA_RPC_URL not set");
  return new Connection(rpc, "confirmed");
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
    await createAssociatedTokenAccountIdempotent(connection, keypair, tokenMint, winnerPubkey);
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
  console.log(`[ET Wallet] Locking ${tokenAmount} $ET tokens for ${winnerAddress} — 69 days via Streamflow...`);

  // Ensure winner's token account exists
  try {
    await createAssociatedTokenAccountIdempotent(connection, keypair, new PublicKey(ET_CA), new PublicKey(winnerAddress));
    console.log(`[ET Wallet] Winner ATA ensured`);
  } catch (e: any) { console.warn(`[ET Wallet] ATA note: ${e?.message}`); }

  const { SolanaStreamClient, ICluster, getBN } = await import("@streamflow/stream");
  const client = new SolanaStreamClient({ clusterUrl: process.env.SOLANA_RPC_URL!, cluster: ICluster.Mainnet });

  const now = Math.floor(Date.now() / 1000);
  const totalBN = getBN(Number(tokenAmount), 0);
  const nonce = Math.floor(Math.random() * 1000000);
  console.log(`[ET Wallet] Building Streamflow tx — amount: ${totalBN.toString()}, nonce: ${nonce}`);

  // Build instructions WITHOUT sending — avoids Streamflow's hanging retry loop
  const { ixs, metadataId, metadata } = await client.buildCreateTransactionInstructions(
    {
      recipient: winnerAddress,
      tokenId: ET_CA,
      start: now + 60,
      amount: totalBN,
      period: 1,
      cliff: now + 60 + SIXTY_NINE_DAYS_SECS,
      cliffAmount: totalBN,
      amountPerPeriod: getBN(0, 0),
      name: `ET Reward ${nonce}`,
      cancelableBySender: false,
      cancelableByRecipient: false,
      transferableBySender: false,
      transferableByRecipient: false,
      automaticWithdrawal: false,
      canTopup: false,
    },
    { sender: keypair as any, isNative: false }
  );

  console.log(`[ET Wallet] Streamflow metadataId: ${metadataId} — sending manually...`);

  // Use our own transaction send (same path as SOL transfers — proven to work on Vercel)
  const { Transaction } = await import("@solana/web3.js");
  const tx = new Transaction();
  for (const ix of ixs) {
    if (ix && "keys" in ix) tx.add(ix as any);
  }
  const txSignature = await sendAndConfirmTransaction(connection, tx, [keypair, metadata as any], { commitment: "confirmed" });

  console.log(`[ET Wallet] Streamflow lock created — stream: ${metadataId}, tx: ${txSignature}`);
  return { streamId: metadataId, txSignature };
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
