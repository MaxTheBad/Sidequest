export const runtime = "edge";

export function GET() {
  return new Response(
    "tiktok-developers-site-verification=ZjYuKHy81qNvpGKfqEaeLfeu9348sB7m\n",
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
