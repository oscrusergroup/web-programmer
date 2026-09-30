import { compilerReady } from "@/lib/server/compiler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(
    { ready: await compilerReady() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
