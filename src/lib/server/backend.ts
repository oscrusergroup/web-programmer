import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { FirmwareProject } from "../firmware";

export function cloudflareService() {
  if (process.env.FIRMWARE_BACKEND !== "cloudflare") return null;
  const env = getCloudflareContext().env as unknown as { FIRMWARE_SERVICE?: { fetch(url: string, init?: RequestInit): Promise<Response> } };
  if (!env.FIRMWARE_SERVICE) throw new Error("Missing FIRMWARE_SERVICE binding. Check wrangler.jsonc.");
  const binding = env.FIRMWARE_SERVICE;
  return {
    fetch(request: Request) {
      // Next.js request wrappers are not native Workers Requests. An explicit
      // URL and init preserve the method, origin, headers and streamed body.
      return binding.fetch(request.url, {
        method: request.method, headers: request.headers,
        body: request.body, redirect: request.redirect,
      });
    },
  };
}
export async function backendProject() {
  const service = cloudflareService();
  if (!service) return (await import("./project")).getProject();
  const response = await service.fetch(new Request("https://firmware.internal/api/firmware?source=latest"));
  if (!response.ok) throw new Error("Could not load firmware from the Cloudflare service.");
  return response.json() as Promise<FirmwareProject>;
}
