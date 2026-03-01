import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import {
  proxyAuthActionToConvex,
  shouldProxyAuthAction,
} from "@convex-dev/auth/nextjs/server/proxy";

const isPublicRoute = createRouteMatcher(["/", "/signin", "/signup", "/api/auth(.*)"]);

const API_ROUTE = "/api/auth";

export default convexAuthNextjsMiddleware(async (request, { convexAuth }) => {
  if (shouldProxyAuthAction(request, API_ROUTE)) {
    return proxyAuthActionToConvex(request, {});
  }
  if (!isPublicRoute(request) && !(await convexAuth.isAuthenticated())) {
    return nextjsMiddlewareRedirect(request, "/signin");
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
