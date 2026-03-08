import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  try {
    const kvUrl = process.env.KV_REST_API_URL;
    const kvToken = process.env.KV_REST_API_TOKEN;
    if (!kvUrl || !kvToken) return NextResponse.next();

    const res = await fetch(`${kvUrl}/get/et:homepage_mode`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = await res.json();
    const mode = data.result;

    if (mode === "research") {
      if (pathname === "/") {
        return NextResponse.rewrite(new URL("/research.html", request.url));
      }
      if (pathname === "/research") {
        return NextResponse.rewrite(new URL("/home-new", request.url));
      }
    }
  } catch {
    // Default routing on error
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/research"],
};
