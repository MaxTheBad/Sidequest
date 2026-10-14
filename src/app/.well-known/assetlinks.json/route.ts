export const runtime = "edge";

export function GET() {
  // Verified against QuestHat's Play Console-generated Digital Asset Links
  // JSON on 2026-10-14. This public app-signing certificate is NOT the upload
  // certificate or a private key. Rotation requires an explicit reviewed edit.
  const fingerprints = ["4D:2A:2E:36:72:4F:0C:92:D3:EE:46:11:2C:1F:F4:58:83:29:59:6C:60:8C:C4:49:8D:C8:22:DE:E8:33:82:B5"];
  return Response.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: "com.questhat.app", sha256_cert_fingerprints: fingerprints },
  }], { headers: { "Cache-Control": "public, max-age=300" } });
}
