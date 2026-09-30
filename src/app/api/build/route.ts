import { compile, BuildError } from "@/lib/server/compiler";
import { getProject } from "@/lib/server/project";
import { validateSelection, type Selection } from "@/lib/config";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    let allowed = false;
    try {
      const publicOrigin = new URL(origin);
      allowed = process.env.APP_ORIGIN
        ? publicOrigin.origin === new URL(process.env.APP_ORIGIN).origin
        : ["http:", "https:"].includes(publicOrigin.protocol) &&
          publicOrigin.host ===
            (request.headers.get("host") || new URL(request.url).host);
    } catch {
      /* Malformed or opaque origins are rejected. */
    }
    if (!allowed)
      return Response.json(
        { error: "Cross-origin builds are not allowed." },
        { status: 403 },
      );
  }
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return Response.json({ error: "Use JSON configuration." }, { status: 415 });
  try {
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json(
        { error: "Configuration is required." },
        { status: 400 },
      );
    const parts: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 16_384) {
        await reader.cancel();
        return Response.json(
          { error: "Configuration is too large." },
          { status: 413 },
        );
      }
      parts.push(value);
    }
    const values: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    const { schema } = await getProject();
    const errors = validateSelection(schema, values);
    if (errors.length)
      return Response.json({ error: errors.join("\n") }, { status: 400 });
    return Response.json(await compile(values as Selection), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof SyntaxError)
      return Response.json(
        { error: "Invalid JSON configuration." },
        { status: 400 },
      );
    if (error instanceof BuildError)
      return Response.json(
        { error: error.message, log: error.log },
        { status: error.status },
      );
    console.error("Build request failed", error);
    return Response.json(
      {
        error:
          "The compiler could not complete this request. Check the server logs.",
      },
      { status: 500 },
    );
  }
}
