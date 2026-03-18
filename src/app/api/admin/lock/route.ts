import { NextRequest, NextResponse } from "next/server";
import { swapSolForET, lockETForWinner } from "@/lib/et-wallet";

export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { walletAddress, solAmount } = await req.json();
  if (!walletAddress || !solAmount) {
    return NextResponse.json({ error: "Missing walletAddress or solAmount" }, { status: 400 });
  }
  if (solAmount <= 0 || solAmount > 1) {
    return NextResponse.json({ error: "solAmount must be between 0 and 1" }, { status: 400 });
  }

  try {
    const { txSignature: swapTxSig, tokenAmount } = await swapSolForET(solAmount);
    const { streamId, txSignature: lockTxSig } = await lockETForWinner(walletAddress, tokenAmount);

    const streamLink = `https://app.streamflow.finance/contract/solana/mainnet/${streamId}`;
    console.log(`[Lock] Swapped ${solAmount} SOL → ${tokenAmount} $ET, locked 69d for ${walletAddress} — stream: ${streamId}`);

    return NextResponse.json({ success: true, swapTxSig, lockTxSig, streamId, streamLink, tokenAmount: tokenAmount.toString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Lock] Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
