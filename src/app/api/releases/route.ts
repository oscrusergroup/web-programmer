import { getReleases } from "@/lib/server/releases";
export const runtime = "nodejs";
export async function GET() {
  try {
    return Response.json({ releases: await getReleases() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Release listing failed", error);
    return Response.json({ error: "Could not load GitHub releases. You can retry or use the latest repository code." }, { status: 502 });
  }
}
