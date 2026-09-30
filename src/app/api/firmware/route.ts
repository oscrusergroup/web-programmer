import { cloudflareService } from "@/lib/server/backend";
import { FirmwareError } from "@/lib/errors";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("source") ?? "latest";
  if (id !== "latest" && !/^release:[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id))
    return Response.json({ error: "Invalid firmware source." }, { status: 400 });
  try {
    const service = cloudflareService();
    if (service) return service.fetch(request);
    const { getProject } = await import("@/lib/server/project");
    return Response.json(await getProject(id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FirmwareError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error("Firmware loading failed", error);
    return Response.json({ error: "Could not load this firmware. Please try again." }, { status: 502 });
  }
}
