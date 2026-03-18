import { NextRequest, NextResponse } from "next/server";
import { swapSolForET, lockETForWinner, getAllETLocks, releaseETLock } from "@/lib/et-wallet";

export const maxDuration = 60;

function auth(req: NextRequest) {
  return req.headers.get("authorization") === `Bearer ${process.env.ADMIN_SECRET}`;
}

export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locks = await getAllETLocks();
  return NextResponse.json({ locks });
}

export async function POST(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { walletAddress, solAmount, tokenAmount: rawTokenAmount, action } = await req.json();

  // Manual release
  if (action === "release") {
    const { lockId } = await req.json().catch(() => ({}));
    return NextResponse.json({ error: "Use lockId in body" }, { status: 400 });
  }

  if (!walletAddress) return NextResponse.json({ error: "Missing walletAddress" }, { status: 400 });

  try {
    let tokenAmount: bigint;
    let swapTxSig = "";

    if (rawTokenAmount) {
      tokenAmount = BigInt(rawTokenAmount);
    } else {
      if (!solAmount || solAmount <= 0) return NextResponse.json({ error: "Provide solAmount or tokenAmount" }, { status: 400 });
      const result = await swapSolForET(solAmount);
      swapTxSig = result.txSignature;
      tokenAmount = result.tokenAmount;
    }

    const { streamId, txSignature } = await lockETForWinner(walletAddress, tokenAmount);
    const unlockDate = new Date((Math.floor(Date.now() / 1000) + 69 * 24 * 3600) * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    return NextResponse.json({ success: true, swapTxSig, lockId: streamId, tokenAmount: tokenAmount.toString(), unlockDate });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
