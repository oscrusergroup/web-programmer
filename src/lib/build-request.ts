import { FirmwareError } from "./errors";

export function validateBuildOrigin(request: Request, appOrigin?: string) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  let allowed = false;
  try {
    const publicOrigin = new URL(origin);
    allowed = appOrigin
      ? publicOrigin.origin === new URL(appOrigin).origin
      : ["http:", "https:"].includes(publicOrigin.protocol) &&
        publicOrigin.host === (request.headers.get("host") || new URL(request.url).host);
  } catch { /* Reject opaque and malformed origins. */ }
  if (!allowed) throw new FirmwareError("Cross-origin builds are not allowed.", 403);
}

export async function readBuildRequest(request: Request): Promise<{ revision: string; values: unknown }> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new FirmwareError("Use JSON configuration.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new FirmwareError("Configuration is required.");
  const parts: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 16_384) {
      await reader.cancel();
      throw new FirmwareError("Configuration is too large.", 413);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  let payload: unknown;
  try { payload = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new FirmwareError("Invalid JSON configuration."); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      !("revision" in payload) || typeof payload.revision !== "string" || !("values" in payload))
    throw new FirmwareError("Select a firmware version and provide its configuration.");
  if (!/^[a-f0-9]{40}$/.test(payload.revision)) throw new FirmwareError("Invalid firmware revision.");
  return { revision: payload.revision, values: payload.values };
}
