import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "fm_auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  response.cookies.delete(AUTH_COOKIE);
  return response;
}
