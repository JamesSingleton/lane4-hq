import { type NextRequest, NextResponse } from "next/server";

const publicRoutes = ["/sign-in"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const sessionCookie =
    request.cookies.get("lane4-staff.session_token") ??
    request.cookies.get("__Secure-lane4-staff.session_token");
  const isPublic = publicRoutes.some((route) => pathname.startsWith(route));
  if (!sessionCookie?.value?.trim() && !isPublic) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
