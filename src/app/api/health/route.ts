import { cloudflareService } from "@/lib/server/backend";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const service = cloudflareService();
  if (service) return service.fetch(request);
  const { compilerReady } = await import("@/lib/server/compiler");
  return Response.json(
    { ready: await compilerReady() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
