import { NextRequest, NextResponse } from "next/server";
import { getSession } from "./utils/auth/session";
import { securityConfig } from "./config/security";
import {
  getClientIp,
  isIpWhitelisted,
  getCountryFromIp,
  isCountryWhitelisted,
} from "./utils/security/ipUtils";
import { logRequest } from "./utils/logging/requestLogger";

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};

const publicRoutes = [
  /^\/article\/[^\/]+?\/?$/, // /article/sample-slug
  /^\/login\/?$/,
  /^\/profile\/[^\/]+?\/?$/, // /profile/sample-username
  /^\/profile\/[^\/]+?\/favorites\/?$/, // /profile/sample-username/favorites
  /^\/register\/?$/,
  /^\/$/,
] as const;

const isPublicRoutes = (pathname: string) => {
  return publicRoutes.some((route) => route.test(pathname));
};

const isPrivateRoutes = (pathname: string) => {
  return !isPublicRoutes(pathname);
};

const middleware = async (req: NextRequest) => {
  const clientIp = getClientIp(req);

  // IP Whitelisting check
  if (securityConfig.enableIpWhitelist) {
    if (!isIpWhitelisted(clientIp, securityConfig.ipWhitelist)) {
      console.warn(`Access denied for IP: ${clientIp}`);
      return new NextResponse("Access Denied", { status: 403 });
    }
  }

  // Geofencing check (optional, only if enabled)
  if (securityConfig.enableGeofencing) {
    const countryCode = await getCountryFromIp(
      clientIp,
      securityConfig.geofencingApiUrl
    );
    if (!isCountryWhitelisted(countryCode, securityConfig.countryWhitelist)) {
      console.warn(
        `Access denied for IP: ${clientIp} from country: ${countryCode || "unknown"}`
      );
      return new NextResponse("Access Denied - Geographic Restriction", {
        status: 403,
      });
    }
  }

  // Authentication check
  const session = await getSession();
  if (isPrivateRoutes(req.nextUrl.pathname) && session == null) {
    // Log before redirect
    if (securityConfig.enableRequestLogging) {
      logRequest({
        ip: clientIp,
        method: req.method,
        url: req.nextUrl.pathname + req.nextUrl.search,
        protocol: "HTTP/1.1",
        status: 302,
        userAgent: req.headers.get("user-agent") || "-",
        referer: req.headers.get("referer") || "-",
        timestamp: new Date(),
        user: "-",
      });
    }

    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  const response = NextResponse.next();

  // Log successful request
  if (securityConfig.enableRequestLogging) {
    // Note: In middleware, we can't know the final response status
    // This logs the request processing, actual status will be 200 for Next()
    logRequest({
      ip: clientIp,
      method: req.method,
      url: req.nextUrl.pathname + req.nextUrl.search,
      protocol: "HTTP/1.1",
      status: 200,
      userAgent: req.headers.get("user-agent") || "-",
      referer: req.headers.get("referer") || "-",
      timestamp: new Date(),
      user: session?.user?.username || "-",
    });
  }

  return response;
};

export default middleware;
