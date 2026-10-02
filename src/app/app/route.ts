import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const APP_STORE_URL = "https://apps.apple.com/us/app/questhat/id6787166004";
const GOOGLE_PLAY_URL = "https://play.google.com/store/apps/details?id=com.questhat.app";

const CRAWLER_PATTERN = /(?:\bbot\b|crawler|spider|slurp|facebookexternalhit|facebot|twitterbot|x[- ]?crawler|linkedinbot|slackbot|discordbot|whatsapp|telegrambot|pinterest|embedly|quora link preview|skypeuripreview|google-inspectiontool)/i;
const APPLE_PATTERN = /iPhone|iPad|iPod|Macintosh.*Mobile/i;
const ANDROID_PATTERN = /Android/i;

function fallbackUrl(request: NextRequest) {
  const url = new URL("/download", request.url);
  url.search = request.nextUrl.search;
  return url;
}

function redirect(destination: URL | string) {
  const response = NextResponse.redirect(destination, 307);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "User-Agent");
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}

export function GET(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "";

  // Preview/search crawlers must receive the normal downloadable page, not a store redirect.
  if (CRAWLER_PATTERN.test(userAgent)) return redirect(fallbackUrl(request));
  if (APPLE_PATTERN.test(userAgent)) return redirect(APP_STORE_URL);
  if (ANDROID_PATTERN.test(userAgent)) return redirect(GOOGLE_PLAY_URL);

  // Unknown and desktop devices always get the visible two-store choice page.
  return redirect(fallbackUrl(request));
}

export function HEAD(request: NextRequest) {
  return GET(request);
}
