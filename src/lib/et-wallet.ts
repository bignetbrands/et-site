import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";

function getConnection(): Connection {
  const rpc = process.env.SOLANA_RPC_URL;
  if (!rpc) throw new Error("SOLANA_RPC_URL not set");
  return new Connection(rpc, "confirmed");
}

function getKeypair(): Keypair {
  const key = process.env.ET_WALLET_PRIVATE_KEY;
  if (!key) throw new Error("ET_WALLET_PRIVATE_KEY not set");
  try {
    const decoded = bs58.decode(key);
    return Keypair.fromSecretKey(decoded);
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

/**
 * Send SOL from ET's wallet to a recipient.
 * Returns the transaction signature.
 */
export async function sendSol(
  toAddress: string,
  solAmount: number
): Promise<string> {
  const connection = getConnection();
  const keypair = getKeypair();

  // Validate recipient
  let toPubkey: PublicKey;
  try {
    toPubkey = new PublicKey(toAddress);
  } catch {
    throw new Error(`Invalid recipient address: ${toAddress}`);
  }

  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);

  // Check balance
  const balance = await connection.getBalance(keypair.publicKey);
  const fee = 5000; // ~0.000005 SOL for tx fee
  if (balance < lamports + fee) {
    throw new Error(
      `ET wallet has insufficient balance. Has ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL, needs ${solAmount} SOL + fees`
    );
  }

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey,
      lamports,
    })
  );

  const signature = await sendAndConfirmTransaction(connection, transaction, [keypair], {
    commitment: "confirmed",
  });

  console.log(`[ET Wallet] Sent ${solAmount} SOL to ${toAddress} — tx: ${signature}`);
  return signature;
}

/**
 * Pick a random reward amount between 0.05 and 0.1 SOL.
 * Rounds to 3 decimal places.
 */
export function pickRewardAmount(): number {
  const min = 0.05;
  const max = 0.1;
  const raw = min + Math.random() * (max - min);
  return Math.round(raw * 1000) / 1000;
}
