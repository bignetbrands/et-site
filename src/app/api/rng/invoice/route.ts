import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";

// 0.001 SOL in lamports (9 decimals)
const PRICE_LAMPORTS = "1000000";

export async function POST(req: NextRequest) {
  try {
    const { wallet } = await req.json();

    if (!wallet) {
      return NextResponse.json({ error: "Missing wallet address" }, { status: 400 });
    }

    const rpcUrl = process.env.SOLANA_RPC_URL;
    const agentMintAddress = process.env.AGENT_TOKEN_MINT_ADDRESS;
    const currencyMintAddress = process.env.CURRENCY_MINT;

    if (!rpcUrl) return NextResponse.json({ error: "missing env: SOLANA_RPC_URL" }, { status: 500 });
    if (!agentMintAddress) return NextResponse.json({ error: "missing env: AGENT_TOKEN_MINT_ADDRESS" }, { status: 500 });
    if (!currencyMintAddress) return NextResponse.json({ error: "missing env: CURRENCY_MINT" }, { status: 500 });

    // Validate public keys before hitting the SDK
    try { new PublicKey(agentMintAddress); } catch { return NextResponse.json({ error: `invalid AGENT_TOKEN_MINT_ADDRESS: ${agentMintAddress}` }, { status: 500 }); }
    try { new PublicKey(currencyMintAddress); } catch { return NextResponse.json({ error: `invalid CURRENCY_MINT: ${currencyMintAddress}` }, { status: 500 }); }
    try { new PublicKey(wallet); } catch { return NextResponse.json({ error: `invalid wallet address: ${wallet}` }, { status: 400 }); }

    const connection = new Connection(rpcUrl, "confirmed");
    const agentMint = new PublicKey(agentMintAddress);
    const currencyMint = new PublicKey(currencyMintAddress);
    const userPublicKey = new PublicKey(wallet);

    // Generate unique invoice params
    const memo = String(Math.floor(Math.random() * 900000000000) + 100000);
    const now = Math.floor(Date.now() / 1000);
    const startTime = String(now);
    const endTime = String(now + 86400); // 24hr window

    const agent = new PumpAgent(agentMint, "mainnet", connection);

    const instructions = await agent.buildAcceptPaymentInstructions({
      user: userPublicKey,
      currencyMint,
      amount: PRICE_LAMPORTS,
      memo,
      startTime,
      endTime,
    });

    const { blockhash } = await connection.getLatestBlockhash("confirmed");

    const tx = new Transaction();
    tx.recentBlockhash = blockhash;
    tx.feePayer = userPublicKey;
    tx.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
      ...instructions
    );

    const txBase64 = tx.serialize({ requireAllSignatures: false }).toString("base64");

    return NextResponse.json({
      txBase64,
      memo,
      startTime,
      endTime,
      amount: PRICE_LAMPORTS,
    });
  } catch (err: unknown) {
    console.error("[RNG invoice error]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
