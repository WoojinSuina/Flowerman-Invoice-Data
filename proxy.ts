import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE = "fm_auth";
// Called server-to-server (the background page-processing chain triggering
// its own next link, and eventually a Vercel Cron sweep) — neither sends
// the browser's session cookie, so it authenticates with this header
// instead. Still gated, just not via the cookie a real browser session uses.
const INTERNAL_SECRET_HEADER = "x-internal-secret";
const INTERNALLY_TRIGGERED_PATHS = new Set(["/api/jobs/process-next"]);

// Unattended external clients (the scanner watcher script on another
// computer, with no browser session to carry a cookie) authenticate
// uploads with a dedicated token instead — separate from AUTH_SECRET so
// it can be rotated independently without changing the login password.
const UPLOAD_TOKEN_HEADER = "x-upload-token";
const UPLOAD_PATHS = new Set(["/api/invoices/upload/init", "/api/invoices/upload/complete"]);

export function proxy(request: NextRequest) {
  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  const authSecret = process.env.AUTH_SECRET;

  if (authSecret && cookie === authSecret) {
    return NextResponse.next();
  }

  if (
    authSecret &&
    INTERNALLY_TRIGGERED_PATHS.has(request.nextUrl.pathname) &&
    request.headers.get(INTERNAL_SECRET_HEADER) === authSecret
  ) {
    return NextResponse.next();
  }

  const uploadToken = process.env.UPLOAD_API_TOKEN;
  if (
    uploadToken &&
    UPLOAD_PATHS.has(request.nextUrl.pathname) &&
    request.headers.get(UPLOAD_TOKEN_HEADER) === uploadToken
  ) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/login).*)"],
};
