import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";
import { generateVerdict } from "@/lib/oracle";

async function fetchTokenData(ca: string): Promise<string> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`, {
      next: { revalidate: 0 },
    });
    if (!res.ok) return "token data unavailable";

    const data = await res.json();
    const pairs = data.pairs;
    if (!pairs || pairs.length === 0) return "no trading pairs found for this token";

    // Use the highest liquidity pair
    const pair = pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];

    return [
      `Name: ${pair.baseToken?.name || "Unknown"} (${pair.baseToken?.symbol || "?"})`,
      `Price: $${pair.priceUsd || "unknown"}`,
      `Price change 24h: ${pair.priceChange?.h24 ?? "unknown"}%`,
      `Liquidity: $${pair.liquidity?.usd?.toLocaleString() || "unknown"}`,
      `Volume 24h: $${pair.volume?.h24?.toLocaleString() || "unknown"}`,
      `Market cap: $${pair.marketCap?.toLocaleString() || "unknown"}`,
      `FDV: $${pair.fdv?.toLocaleString() || "unknown"}`,
      `Transactions 24h: ${pair.txns?.h24?.buys || 0} buys / ${pair.txns?.h24?.sells || 0} sells`,
      `DEX: ${pair.dexId || "unknown"}`,
      `Created: ${pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toLocaleDateString() : "unknown"}`,
    ].join("\n");
  } catch {
    return "token data unavailable";
  }
}

export async function POST(req: NextRequest) {
  try {
    const { wallet, tokenCA, memo, startTime, endTime, amount } = await req.json();
    if (!wallet || !tokenCA || !memo || !startTime || !endTime || !amount)
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

    const tokenData = await fetchTokenData(tokenCA);
    const verdict = await generateVerdict(tokenCA, tokenData);
    return NextResponse.json({ verdict });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
