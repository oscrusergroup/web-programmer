import { cloudflareService } from "@/lib/server/backend";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const service = cloudflareService();
    if (service) return service.fetch(request);
    const { getReleases } = await import("@/lib/server/releases");
    return Response.json({ releases: await getReleases() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Release listing failed", error);
    return Response.json({ error: "Could not load GitHub releases. You can retry or use the latest repository code." }, { status: 502 });
  }
}
