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
} from "@solana/spl-token";
import bs58 from "bs58";
import BN from "bn.js";

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

  // Try new Jupiter API first, fall back to legacy v6
  const quoteEndpoints = [
    `https://api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${ET_CA}&amount=${lamports}&slippageBps=300&restrictIntermediateTokens=true`,
    `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${ET_CA}&amount=${lamports}&slippageBps=300`,
  ];

  let quote: any = null;
  let usedNewApi = false;
  let lastErr = "";
  for (let i = 0; i < quoteEndpoints.length; i++) {
    try {
      const r = await fetch(quoteEndpoints[i], { headers: JUP_HEADERS });
      if (r.ok) { quote = await r.json(); usedNewApi = i === 0; break; }
      lastErr = `HTTP ${r.status}: ${await r.text()}`;
    } catch (e: any) { lastErr = e?.message || String(e); }
  }
  if (!quote) throw new Error(`Jupiter quote failed on all endpoints: ${lastErr}`);
  console.log(`[ET Wallet] Jupiter quote: ${quote.outAmount} raw $ET`);

  const swapUrl = usedNewApi ? "https://api.jup.ag/swap/v1/swap" : "https://quote-api.jup.ag/v6/swap";
  let swapRes: Response;
  try {
    swapRes = await fetch(swapUrl, {
      method: "POST",
      headers: JUP_HEADERS,
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 1000,
      }),
    });
  } catch (e: any) {
    throw new Error(`Jupiter swap fetch failed: ${e?.message || e}`);
  }
  if (!swapRes.ok) throw new Error(`Jupiter swap error ${swapRes.status}: ${await swapRes.text()}`);
  const { swapTransaction } = await swapRes.json();

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
  tx.sign([keypair]);

  const txSignature = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await connection.confirmTransaction(txSignature, "confirmed");
  console.log(`[ET Wallet] Jupiter swap done — tx: ${txSignature}`);

  // Read actual received amount from ATA
  let tokenAmount = BigInt(quote.outAmount);
  try {
    const ata = await getAssociatedTokenAddress(new PublicKey(ET_CA), keypair.publicKey);
    const acct = await getAccount(connection, ata);
    tokenAmount = acct.amount;
  } catch { /* use quote amount as fallback */ }

  return { txSignature, tokenAmount };
}

export async function lockETForWinner(
  winnerAddress: string,
  tokenAmount: bigint
): Promise<{ streamId: string; txSignature: string }> {
  const keypair = getKeypair();
  console.log(`[ET Wallet] Locking ${tokenAmount} $ET tokens for ${winnerAddress} — 69 days via Streamflow...`);

  const { SolanaStreamClient } = await import("@streamflow/stream");
  const client = new SolanaStreamClient(process.env.SOLANA_RPC_URL!, "mainnet-beta" as any);

  const now = Math.floor(Date.now() / 1000);
  const totalBN = new BN(tokenAmount.toString());

  const result = await client.create(
    {
      recipient: winnerAddress,
      tokenId: ET_CA,
      start: now + 60,
      amount: totalBN,
      period: 1,
      cliff: now + 60 + SIXTY_NINE_DAYS_SECS,
      cliffAmount: totalBN,
      amountPerPeriod: new BN(0),
      name: "ET Mission Reward — 69d lock",
      cancelableBySender: false,
      cancelableByRecipient: false,
      transferableBySender: false,
      transferableByRecipient: false,
      automaticWithdrawal: false,
      canTopup: false,
    },
    { sender: keypair as any, isNative: false }
  );

  console.log(`[ET Wallet] Streamflow lock created — stream: ${result.metadataId}, tx: ${result.txId}`);
  return { streamId: result.metadataId, txSignature: result.txId };
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
