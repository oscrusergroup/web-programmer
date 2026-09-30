import { cloudflareService } from "@/lib/server/backend";
import { FirmwareError } from "@/lib/errors";
import { validateBuildOrigin, readBuildRequest } from "@/lib/build-request";
import { validateSelection, type Selection } from "@/lib/config";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  try {
    validateBuildOrigin(request, process.env.APP_ORIGIN);
    const service = cloudflareService();
    if (service) return service.fetch(request);
    const { getPreparedProject } = await import("@/lib/server/project");
    const { compile } = await import("@/lib/server/compiler");
    const { revision, values } = await readBuildRequest(request);
    const { schema } = await getPreparedProject(revision);
    const errors = validateSelection(schema, values);
    if (errors.length) throw new FirmwareError(errors.join("\n"));
    return Response.json(await compile(values as Selection, revision), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof FirmwareError || (error instanceof Error && "status" in error))
      return Response.json({ error: error.message, log: "log" in error ? error.log : "" }, { status: Number(error.status) });
    console.error("Build request failed", error);
    return Response.json({ error: "The compiler could not complete this request. Check the server logs." }, { status: 500 });
  }
}
