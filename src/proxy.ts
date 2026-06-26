import type { NextRequest } from "next/server";

const robots = `User-Agent: *
Allow: /
Disallow: /api/
Disallow: /auth/callback
Disallow: /reset-password

Sitemap: https://questhat.com/sitemap.xml
`;

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/robots.txt") {
    return new Response(robots, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=0, must-revalidate",
      },
    });
  }
}

export const config = {
  matcher: ["/robots.txt"],
};
