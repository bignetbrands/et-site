import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";
import { generateFortune } from "@/lib/oracle";

export async function POST(req: NextRequest) {
  try {
    const { wallet, memo, startTime, endTime, amount } = await req.json();
    if (!wallet || !memo || !startTime || !endTime || !amount)
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });

    const agentMint = new PublicKey(process.env.AGENT_TOKEN_MINT_ADDRESS!);
    const agent = new PumpAgent(agentMint, "mainnet");

    let verified = false;
    for (let i = 0; i < 10; i++) {
      verified = await agent.validateInvoicePayment({
        user: new PublicKey(wallet),
        currencyMint: new PublicKey(process.env.CURRENCY_MINT!),
        amount: Number(amount),
        memo: Number(memo),
        startTime: Number(startTime),
        endTime: Number(endTime),
      });
      if (verified) break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!verified)
      return NextResponse.json({ error: "Payment not confirmed. Try again in a moment." }, { status: 402 });

    const fortune = await generateFortune();
    return NextResponse.json({ fortune });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
