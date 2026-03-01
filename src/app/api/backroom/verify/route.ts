import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ET_MINT = "A1NZ4kjhJxdmMMHQTGF8HaU7k6JCh5gSyHEeAKE3xRMF";

// Multiple RPC endpoints for reliability
const RPC_URLS = [
  process.env.SOLANA_RPC_URL, // custom RPC if configured
  "https://api.mainnet-beta.solana.com",
  "https://solana-mainnet.g.alchemy.com/v2/demo",
].filter(Boolean) as string[];

async function checkBalance(wallet: string): Promise<number> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "getTokenAccountsByOwner",
    params: [
      wallet,
      { mint: ET_MINT },
      { encoding: "jsonParsed" },
    ],
  };

  for (const rpc of RPC_URLS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      // Check for RPC error
      if (data.error) {
        console.warn(`[Verify] RPC error from ${rpc}:`, data.error.message);
        continue;
      }

      if (!data.result?.value?.length) return 0;

      let total = 0;
      for (const account of data.result.value) {
        const amount = account.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
        if (amount) total += amount;
      }
      return total;
    } catch (err) {
      console.warn(`[Verify] RPC failed ${rpc}:`, err);
      continue;
    }
  }

  throw new Error("All RPC endpoints failed");
}

export async function POST(request: Request) {
  try {
    const { wallet } = await request.json();

    if (!wallet || typeof wallet !== "string" || wallet.length < 32 || wallet.length > 44) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const balance = await checkBalance(wallet);

    return NextResponse.json({
      holder: balance > 0,
      balance,
      wallet: wallet.slice(0, 6) + "..." + wallet.slice(-4),
    });
  } catch (err) {
    console.error("[Verify] Error:", err);
    return NextResponse.json(
      { error: "Failed to verify token balance. Please try again." },
      { status: 500 }
    );
  }
}
