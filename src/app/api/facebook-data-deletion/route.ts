import { NextResponse } from "next/server";
import crypto from "node:crypto";

function buildStatusUrl(confirmationCode: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://questhat.com";
  return `${baseUrl}/delete-account/${confirmationCode}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const signedRequest = url.searchParams.get("signed_request") || "";

  // Facebook sends a signed_request payload. We do not need to trust it for the
  // public acknowledgment response, but we keep the value available for future
  // server-side deletion automation.
  void signedRequest;

  const confirmationCode = crypto.randomUUID();

  return NextResponse.json({
    url: buildStatusUrl(confirmationCode),
    confirmation_code: confirmationCode,
  });
}

export async function POST(request: Request) {
  return GET(request);
}
