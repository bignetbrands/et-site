import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { PumpAgent } from "@pump-fun/agent-payments-sdk";
import { interpretSignal } from "@/lib/oracle";

async function fetchWalletActivity(walletAddress: string): Promise<string> {
  try {
    // Extract API key from RPC URL
    const rpcUrl = process.env.SOLANA_RPC_URL || "";
    const keyMatch = rpcUrl.match(/api-key=([^&]+)/);
    const apiKey = keyMatch ? keyMatch[1] : "";

    if (!apiKey) return "no transaction history available";

    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${apiKey}&limit=20`,
      { next: { revalidate: 0 } }
    );

    if (!res.ok) return "transaction data unavailable";

    const txs = await res.json();
    if (!Array.isArray(txs) || txs.length === 0) return "no recent transactions found";

    // Summarize transactions into readable text for Claude
    const summary = txs.slice(0, 15).map((tx: any) => {
      const type = tx.type || tx.transactionError ? "FAILED" : "UNKNOWN";
      const time = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleDateString() : "unknown date";
      const desc = tx.description || type;
      return `- ${time}: ${desc}`;
    }).join("\n");

    return `${txs.length} recent transactions:\n${summary}`;
  } catch {
    return "transaction data unavailable";
  }
}

export async function POST(req: NextRequest) {
  try {
    const { wallet, targetWallet, memo, startTime, endTime, amount } = await req.json();
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

    const addressToRead = targetWallet || wallet;
    const txData = await fetchWalletActivity(addressToRead);
    const interpretation = await interpretSignal(addressToRead, txData);
    return NextResponse.json({ interpretation });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
