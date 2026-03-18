import { NextRequest, NextResponse } from "next/server";
import { swapSolForET, ensureWinnerATA, lockETForWinner } from "@/lib/et-wallet";

export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { walletAddress, solAmount, tokenAmount: rawTokenAmount } = await req.json();
  if (!walletAddress) return NextResponse.json({ error: "Missing walletAddress" }, { status: 400 });

  try {
    let swapTxSig = "";
    let tokenAmount: bigint;

    // Step 1 — Swap (if no token amount provided directly)
    if (rawTokenAmount) {
      tokenAmount = BigInt(rawTokenAmount);
      console.log(`[Lock] Using provided token amount: ${tokenAmount}`);
    } else {
      if (!solAmount || solAmount <= 0 || solAmount > 1) {
        return NextResponse.json({ error: "Provide solAmount (0-1) or tokenAmount" }, { status: 400 });
      }
      const result = await swapSolForET(solAmount);
      swapTxSig = result.txSignature;
      tokenAmount = result.tokenAmount;
      console.log(`[Lock] Swap complete: ${tokenAmount} tokens, tx: ${swapTxSig}`);
    }

    // Step 2 — Ensure winner has a $ET token account
    await ensureWinnerATA(walletAddress);
    console.log(`[Lock] ATA ensured for ${walletAddress}`);

    // Step 3 — Create Streamflow lock
    console.log(`[Lock] Creating Streamflow lock for ${tokenAmount} tokens...`);
    const { streamId, txSignature: lockTxSig } = await lockETForWinner(walletAddress, tokenAmount);

    const streamLink = `https://app.streamflow.finance/contract/solana/mainnet/${streamId}`;
    console.log(`[Lock] Done — stream: ${streamId}`);

    return NextResponse.json({
      success: true,
      swapTxSig,
      lockTxSig,
      streamId,
      streamLink,
      tokenAmount: tokenAmount.toString(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[Lock] Failed:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
