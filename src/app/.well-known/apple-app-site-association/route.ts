// Team/bundle identity verified from exported iOS 130 signing entitlements.
// Local repair only: website deployment and a new entitled iOS build required.
export const runtime = "edge";

export function GET() {
  return Response.json({
    applinks: {
      details: [{ appIDs: ["3258CL32QP.com.questhat.app"], components: [{ "/": "/listing/*" }] }],
    },
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
