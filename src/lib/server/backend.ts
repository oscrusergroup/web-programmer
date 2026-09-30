import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { FirmwareProject } from "../firmware";

export function cloudflareService() {
  if (process.env.FIRMWARE_BACKEND !== "cloudflare") return null;
  const env = getCloudflareContext().env as unknown as { FIRMWARE_SERVICE?: { fetch(request: Request): Promise<Response> } };
  if (!env.FIRMWARE_SERVICE) throw new Error("Missing FIRMWARE_SERVICE binding. Check wrangler.jsonc.");
  return env.FIRMWARE_SERVICE;
}
export async function backendProject() {
  const service = cloudflareService();
  if (!service) return (await import("./project")).getProject();
  const response = await service.fetch(new Request("https://firmware.internal/api/firmware?source=latest"));
  if (!response.ok) throw new Error("Could not load firmware from the Cloudflare service.");
  return response.json() as Promise<FirmwareProject>;
}
