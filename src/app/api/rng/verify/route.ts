import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";

export async function POST(req: NextRequest) {
  try {
    const { wallet, memo, startTime, endTime, amount } = await req.json();

    if (!wallet || !memo || !startTime || !endTime || !amount) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const agentMintAddress = process.env.AGENT_TOKEN_MINT_ADDRESS;
    const currencyMintAddress = process.env.CURRENCY_MINT;

    if (!agentMintAddress) return NextResponse.json({ error: "missing env: AGENT_TOKEN_MINT_ADDRESS" }, { status: 500 });
    if (!currencyMintAddress) return NextResponse.json({ error: "missing env: CURRENCY_MINT" }, { status: 500 });

    const agentMint = new PublicKey(agentMintAddress);
    const agent = new PumpAgent(agentMint, "mainnet");

    // Retry loop — tx may take a few seconds to confirm on-chain
    const invoiceParams = {
      user: new PublicKey(wallet),
      currencyMint: new PublicKey(currencyMintAddress),
      amount: Number(amount),
      memo: Number(memo),
      startTime: Number(startTime),
      endTime: Number(endTime),
    };

    let verified = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      verified = await agent.validateInvoicePayment(invoiceParams);
      if (verified) break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!verified) {
      return NextResponse.json({ error: "Payment not confirmed. Try again in a moment." }, { status: 402 });
    }

    // Payment confirmed — generate random number server-side
    const result = Math.floor(Math.random() * 1001); // 0–1000 inclusive

    return NextResponse.json({ result });
  } catch (err: unknown) {
    console.error("[RNG verify error]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
