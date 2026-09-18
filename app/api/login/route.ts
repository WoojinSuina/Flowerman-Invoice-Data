import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "fm_auth";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const password = formData.get("password");
  const redirectTo = (formData.get("redirectTo") as string) || "/review";

  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    return NextResponse.json({ error: "AUTH_SECRET is not configured" }, { status: 500 });
  }

  if (typeof password !== "string" || password !== authSecret) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("error", "1");
    loginUrl.searchParams.set("redirectTo", redirectTo);
    return NextResponse.redirect(loginUrl, { status: 303 });
  }

  const response = NextResponse.redirect(new URL(redirectTo, req.url), { status: 303 });
  response.cookies.set(AUTH_COOKIE, authSecret, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
  });
  return response;
}
