// Protect routes + RBAC middleware
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("sessionId");

  // Log for debugging
  console.log(`[Middleware] Path: ${pathname}, Has token: ${!!token}`);

  // Public routes that don't require authentication
  const publicRoutes = ["/", "/about", "/contact", "/login", "/signup", "/forgot-password"];
  const authRoutes = ["/login", "/signup", "/forgot-password"];
  const isPublicRoute = publicRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));
  const isAuthRoute = authRoutes.some((route) => pathname === route || pathname.startsWith(route + "/"));
  const isDashboardRoute = pathname.startsWith("/dashboard");

  // If user is authenticated and tries to access auth pages, redirect to dashboard
  if (token && isAuthRoute) {
    try {
      verifyToken(token.value);
      return NextResponse.redirect(new URL("/dashboard", request.url));
    } catch (error) {
      // Token is invalid, allow access to auth pages
    }
  }

  // Protect dashboard routes - require authentication
  if (isDashboardRoute) {
    if (!token) {
      // Redirect to login if not authenticated
      console.log(`[Middleware] No token found, redirecting to login`);
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    try {
      // Verify token is valid
      const payload = verifyToken(token.value);
      console.log(`[Middleware] Token verified for user: ${payload.email}, role: ${payload.role}`);
      
      // Optional: Check role-based access for specific routes
      if (pathname.startsWith("/dashboard/users")) {
        if (payload.role !== "admin") {
          return NextResponse.redirect(new URL("/dashboard", request.url));
        }
      }

      // Sessions route - only admin and supervisor can access
      if (pathname.startsWith("/dashboard/sessions")) {
        if (payload.role !== "admin" && payload.role !== "supervisor") {
          return NextResponse.redirect(new URL("/dashboard", request.url));
        }
      }

      // Token is valid, allow access
      return NextResponse.next();
    } catch (error) {
      // Token is invalid, redirect to login
      // const loginUrl = new URL("/login", request.url);
      // loginUrl.searchParams.set("redirect", pathname);
      // const response = NextResponse.redirect(loginUrl);
      // Clear invalid cookies
      // response.cookies.delete("token");
      // response.cookies.delete("refreshToken");
      // return response;
    }
  }

  // Allow access to public routes
  return NextResponse.next();
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
