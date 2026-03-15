import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";
import { generateHoroscope } from "@/lib/oracle";

async function fetchWalletActivity(walletAddress: string): Promise<string> {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || "";
    const keyMatch = rpcUrl.match(/api-key=([^&]+)/);
    const apiKey = keyMatch ? keyMatch[1] : "";
    if (!apiKey) return "no on-chain data available";

    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${apiKey}&limit=20`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return "on-chain data unavailable";

    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) return "wallet appears dormant — no recent transactions";

    const summary = txs.slice(0, 15).map((tx: any) => {
      const time = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleDateString() : "unknown date";
      const desc = tx.description || tx.type || "transaction";
      return `- ${time}: ${desc}`;
    }).join("\n");

    return `${txs.length} recent transactions:\n${summary}`;
  } catch {
    return "cosmic interference — on-chain data unavailable";
  }
}

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

    const txData = await fetchWalletActivity(wallet);
    const horoscope = await generateHoroscope(wallet, txData);
    return NextResponse.json({ horoscope });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
