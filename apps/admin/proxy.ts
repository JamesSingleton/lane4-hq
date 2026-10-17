import { type NextRequest, NextResponse } from "next/server";

const publicRoutes = [
  "/sign-in",
  "/sign-up",
  "/check-email",
  "/accept-invite",
  "/2fa",
  "/forgot-password",
  "/reset-password",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.startsWith("/api/calendar") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const sessionCookie =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token");

  const sessionToken = sessionCookie?.value?.trim();
  const isPublic = publicRoutes.some((route) => pathname.startsWith(route));
  const isAuthenticated = Boolean(sessionToken);

  if (!isAuthenticated && !isPublic) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set(
      "callbackUrl",
      `${pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(signInUrl);
  }

  // Do not redirect away from auth pages based on cookie presence alone.
  // A stale session_token causes a loop with server pages that call getSession().
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
