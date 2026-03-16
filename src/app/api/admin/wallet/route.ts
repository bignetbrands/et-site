import { NextRequest, NextResponse } from "next/server";
import { getETWalletAddress, getETWalletBalance } from "@/lib/et-wallet";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.ET_WALLET_PRIVATE_KEY) {
    return NextResponse.json({
      configured: false,
      message: "ET_WALLET_PRIVATE_KEY not set",
    });
  }

  try {
    const [address, balance] = await Promise.all([
      Promise.resolve(getETWalletAddress()),
      getETWalletBalance(),
    ]);
    return NextResponse.json({ configured: true, address, balance });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ configured: false, message }, { status: 500 });
  }
}
