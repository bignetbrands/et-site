import { NextResponse } from "next/server";
import { getVipUsers, addVipUser, removeVipUser } from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/vip — list VIP users
 * POST /api/admin/vip — add VIP user { action: "add", username: "..." }
 * POST /api/admin/vip — remove VIP user { action: "remove", username: "..." }
 */

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const users = await getVipUsers();
  return NextResponse.json({ vipUsers: users });
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action, username } = await request.json();

  if (!username || typeof username !== "string") {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  const clean = username.replace(/^@/, "").toLowerCase().trim();
  if (!clean) {
    return NextResponse.json({ error: "invalid username" }, { status: 400 });
  }

  if (action === "add") {
    await addVipUser(clean);
    const users = await getVipUsers();
    return NextResponse.json({ success: true, added: clean, vipUsers: users });
  } else if (action === "remove") {
    await removeVipUser(clean);
    const users = await getVipUsers();
    return NextResponse.json({ success: true, removed: clean, vipUsers: users });
  } else {
    return NextResponse.json({ error: "action must be 'add' or 'remove'" }, { status: 400 });
  }
}
