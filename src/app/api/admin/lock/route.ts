import { NextRequest, NextResponse } from "next/server";
import { swapSolForET, lockETForWinner } from "@/lib/et-wallet";

export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { walletAddress, solAmount, tokenAmount: rawTokenAmount } = await req.json();
  if (!walletAddress) {
    return NextResponse.json({ error: "Missing walletAddress" }, { status: 400 });
  }

  try {
    let swapTxSig = "";
    let tokenAmount: bigint;

    if (rawTokenAmount) {
      // Skip swap — use provided token amount directly
      tokenAmount = BigInt(rawTokenAmount);
      console.log(`[Lock] Using provided token amount: ${tokenAmount}`);
    } else {
      if (!solAmount || solAmount <= 0 || solAmount > 1) {
        return NextResponse.json({ error: "Provide solAmount (0-1) or tokenAmount" }, { status: 400 });
      }
      const result = await swapSolForET(solAmount);
      swapTxSig = result.txSignature;
      tokenAmount = result.tokenAmount;
    }

    const { streamId, txSignature: lockTxSig } = await lockETForWinner(walletAddress, tokenAmount);

    const streamLink = `https://app.streamflow.finance/contract/solana/mainnet/${streamId}`;
    console.log(`[Lock] Stream created: ${streamId}`);
    console.log(`[Lock] Swapped ${solAmount} SOL → ${tokenAmount} $ET, locked 69d for ${walletAddress} — stream: ${streamId}`);

    return NextResponse.json({ success: true, swapTxSig, lockTxSig, streamId, streamLink, tokenAmount: tokenAmount.toString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Lock] Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
